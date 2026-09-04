import {
  Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, IsNull, Repository } from 'typeorm';
import { SeatBooking, SeatBookingStatus, SEAT_HOLDING_STATUSES } from './seat-booking.entity';
import { SeatBookingEvent, SeatBookingEventType } from './seat-booking-event.entity';
import { DriverTrip, DriverTripStatus } from '../drivers/driver-trip.entity';
import { TripStop } from '../drivers/trip-stop.entity';
import { RouteAlert } from './route-alert.entity';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { FeesService } from '../fees/fees.service';
import { PricingService as RateCardPricing } from '../pricing/pricing.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';
import { vehicleIdentityForPassenger } from '../common/redact-driver';
import { secureCode } from '../common/utils/auth-codes';

/**
 * Fee Catalogue keys this flow reads, with the fallback used when the
 * row is missing or disabled.
 *
 * Every threshold here is a row an admin can move, per the house rule
 * that policy knobs are data and not literals. The fallbacks exist so a
 * database that has not seeded yet still behaves, never so that anybody
 * has to ship code to change a number.
 */
const FEE = {
  /** Floor under a segment fare, per seat. Kills the trivially short hop. */
  MIN_SEGMENT_FARE: 'travel_buddy_min_segment_fare_ngn',
  /** Minutes the rider waits at the stop before a no-show may be called. */
  NO_SHOW_WAIT_MIN: 'travel_buddy_no_show_wait_min',
  /** Minutes an accepted-but-unpaid request stays honoured. */
  UNPAID_HOLD_MIN:  'travel_buddy_unpaid_hold_min',
  /** Hours before departure inside which a cancel stops being free. */
  FREE_CANCEL_HOURS: 'travel_buddy_free_cancel_hours',
  /** Share of a paid fare returned on a cancel inside that window. */
  LATE_CANCEL_REFUND_PCT: 'travel_buddy_late_cancel_refund_pct',
  /** Metres from the alight stop beyond which a drop is flagged. */
  DROP_GEOFENCE_M: 'travel_buddy_drop_geofence_m',
  /** Processing already sunk on a card charge, withheld from a refund. */
  CANCEL_PROCESSING_PCT: 'cancel_processing_pct',
} as const;

const FEE_FALLBACK = {
  [FEE.MIN_SEGMENT_FARE]:       1500,
  [FEE.NO_SHOW_WAIT_MIN]:       15,
  [FEE.UNPAID_HOLD_MIN]:        30,
  [FEE.FREE_CANCEL_HOURS]:      24,
  /**
   * 100, not 0 (audit, 2026-08-28).
   *
   * The founder's rule for a passenger cancellation is "they get a
   * refund minus the Flutterwave fee". This fallback said zero, so if
   * the fees table were ever unavailable the platform would keep a
   * passenger's entire fare. A fallback should fail toward the stated
   * policy, and on money it should fail toward the customer.
   */
  [FEE.LATE_CANCEL_REFUND_PCT]: 100,
  [FEE.DROP_GEOFENCE_M]:        1000,
  [FEE.CANCEL_PROCESSING_PCT]:  1.4,
};

/** Great-circle metres, for the drop geofence. */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Money, to the kobo. Never whole naira: the maths has to reconcile. */
function kobo(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * What a rider may know about the passenger they are picking up.
 *
 * Whitelist, never blacklist, for the same reason redact-driver.ts is
 * one: the User row also carries the wallet balance, the referral chain,
 * the push token, the lockout state and every verification document, and
 * a blacklist ships whichever of those somebody adds next.
 *
 * The phone is here on purpose. The rider has to reach a person standing
 * at a roadside stop, and the alternative to a number is a rider driving
 * off with someone's paid seat because nobody could find anybody.
 */
function passengerIdentityForDriver(u: any) {
  return {
    id:           u?.id ?? null,
    name:         u?.name ?? null,
    firstName:    u?.firstName ?? null,
    profilePhoto: u?.profilePhoto ?? null,
    phone:        u?.phone ?? null,
  };
}

@Injectable()
export class TravelBuddyService {
  private readonly logger = new Logger(TravelBuddyService.name);

  constructor(
    @InjectRepository(SeatBooking)      private bookingsRepo:   Repository<SeatBooking>,
    @InjectRepository(SeatBookingEvent) private eventsRepo:     Repository<SeatBookingEvent>,
    @InjectRepository(DriverTrip)       private tripsRepo:      Repository<DriverTrip>,
    @InjectRepository(TripStop)         private stopsRepo:      Repository<TripStop>,
    @InjectRepository(Delivery)         private deliveriesRepo: Repository<Delivery>,
    @InjectRepository(RouteAlert)       private routeAlertsRepo: Repository<RouteAlert>,
    @InjectDataSource()                 private readonly ds:    DataSource,
    private readonly fees:          FeesService,
    private readonly rateCard:      RateCardPricing,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Set by TravelBuddyModule on boot so a refund can be issued without
   * this module importing PaymentsModule, which would close a cycle
   * through DeliveriesModule. Same lazy-reference pattern the deliveries
   * and drivers services already use.
   */
  paymentsServiceRef?: any;

  /**
   * Also set on boot, for the same reason.
   *
   * Delivery status changes go THROUGH DeliveriesService.updateStatus and
   * never straight into the table. That method is where escrow is
   * released to the rider on DELIVERED, where the customer and the
   * partner webhooks are told, and where the timeline the two parties
   * read is written. An UPDATE issued behind its back would move the row
   * and leave the rider's money sitting in escrow with nobody left to
   * release it.
   */
  deliveriesServiceRef?: any;

  /** Move a seat's delivery through the path that owns escrow and events. */
  private async setDeliveryStatus(deliveryId: string | null, status: DeliveryStatus) {
    if (!deliveryId) return;
    if (!this.deliveriesServiceRef?.updateStatus) {
      this.logger.error(`deliveries service not wired: ${deliveryId} left at its old status`);
      return;
    }
    try {
      // No actor id: the authorization already happened above, against
      // the trip and the booking. updateStatus treats internal callers as
      // trusted precisely so a service that has done its own check does
      // not have to impersonate a user to pass a second one.
      await this.deliveriesServiceRef.updateStatus(deliveryId, status);
    } catch (e: any) {
      this.logger.error(`could not move delivery ${deliveryId} to ${status}: ${e?.message ?? e}`);
    }
  }

  // ── Fee Catalogue reads ──────────────────────────────────────────────

  private async fee(key: string): Promise<number> {
    const v = await this.fees.getValueOr(key, (FEE_FALLBACK as any)[key] ?? 0);
    return Number.isFinite(Number(v)) ? Number(v) : (FEE_FALLBACK as any)[key] ?? 0;
  }

  // ── Evidence ─────────────────────────────────────────────────────────

  /**
   * Write one line of the trail.
   *
   * Never throws into the caller. A booking must not fail because the
   * audit insert did, but a missing line matters, so the failure is
   * logged loudly rather than swallowed in silence.
   */
  private async record(
    bookingId: string,
    type: SeatBookingEventType,
    actorRole: 'driver' | 'passenger' | 'system',
    actorUserId: string | null,
    opts: { lat?: number | null; lng?: number | null; note?: string | null; meta?: Record<string, any> | null } = {},
  ) {
    try {
      await this.eventsRepo.save(this.eventsRepo.create({
        bookingId,
        type,
        actorRole,
        actorUserId: actorUserId ?? null,
        lat:  Number.isFinite(Number(opts.lat)) ? Number(opts.lat) : null,
        lng:  Number.isFinite(Number(opts.lng)) ? Number(opts.lng) : null,
        note: opts.note ?? null,
        meta: opts.meta ?? null,
      } as any));
    } catch (e: any) {
      this.logger.error(`seat booking evidence NOT written (${type} on ${bookingId}): ${e?.message ?? e}`);
    }
  }

  private push(userId: string | null | undefined, title: string, body: string, type: NotificationType, deliveryId?: string) {
    if (!userId) return;
    // Push and in-trip chat only. SMS is a standing deferred decision at
    // SEIRS and there is deliberately no fallback channel here.
    //
    // A push is never load-bearing: the booking, the seat and the money
    // are all already settled by the time this runs, so a failure to
    // notify must never roll any of that back.
    try {
      const sent: any = this.notifications?.create?.(userId, title, body, type, deliveryId);
      if (sent?.catch) sent.catch(() => {});
    } catch (e: any) {
      this.logger.warn(`seat booking push failed: ${e?.message ?? e}`);
    }
  }

  // ── Per-segment capacity: the whole point of this rebuild ────────────

  /**
   * The busiest single segment inside a stretch of the route.
   *
   * A trip is a line of stops. The gap between stop N and stop N+1 is a
   * SEGMENT, and a seat is a thing that exists once per segment, not
   * once per trip. A passenger riding from stop 2 to stop 5 occupies
   * segments 2, 3 and 4, and occupies nothing before or after.
   *
   * So the question a new booking asks is not "how many seats are sold
   * on this trip" but "across every segment I would cross, is one still
   * free everywhere". That is a peak, not a sum: three bookings can each
   * overlap my stretch without overlapping each other, in which case the
   * busiest segment holds one passenger and summing would refuse me for
   * no reason.
   *
   * The overlap test is the plain range one. A booking [b, a) crosses
   * segment s exactly when b <= s and a > s.
   *
   * Only SEAT_HOLDING_STATUSES count. A dropped passenger has physically
   * left, which is what frees an Osogbo seat for somebody waiting in
   * Lokoja, and an unpaid request holds nothing at all.
   *
   * Legacy whole-route bookings are added on top. Those predate segments
   * and live as driver_trips.seatsBooked, and a whole-route booking is
   * by definition one that crosses EVERY segment, so counting it against
   * all of them is exactly right rather than a fudge. It is the only use
   * of that counter here: it is not the capacity model, it is a second
   * population being migrated away from.
   */
  private async peakSeatsTaken(
    tripId: string,
    fromSequence: number,
    toSequence: number,
    excludeBookingId?: string | null,
    manager?: any,
  ): Promise<number> {
    const runner = manager ?? this.ds;
    const rows = await runner.query(
      `SELECT COALESCE(MAX(t.taken), 0)::int AS peak
         FROM (
           SELECT s."sequence" AS seg,
                  COALESCE(SUM(sb."seats"), 0)::int AS taken
             FROM "trip_stops" s
             LEFT JOIN "seat_bookings" sb
                    ON sb."trip_id" = s."trip_id"
                   AND sb."status" = ANY($4::text[])
                   AND sb."board_sequence"  <= s."sequence"
                   AND sb."alight_sequence" >  s."sequence"
                   AND ($5::uuid IS NULL OR sb."id" <> $5::uuid)
            WHERE s."trip_id" = $1
              AND s."sequence" >= $2
              AND s."sequence" <  $3
            GROUP BY s."sequence"
         ) t`,
      [tripId, fromSequence, toSequence, SEAT_HOLDING_STATUSES as string[], excludeBookingId ?? null],
    );
    return Number(rows?.[0]?.peak ?? 0);
  }

  /** Seats free across every segment of a stretch, legacy holds included. */
  private async seatsFreeAcross(
    trip: any,
    fromSequence: number,
    toSequence: number,
    excludeBookingId?: string | null,
    manager?: any,
  ): Promise<number> {
    const peak   = await this.peakSeatsTaken(trip.id, fromSequence, toSequence, excludeBookingId, manager);
    const legacy = Math.max(0, Number(trip.seatsBooked ?? 0));
    return Math.max(0, Number(trip.seatsTotal ?? 0) - legacy - peak);
  }

  /**
   * Seats free on EVERY segment of a trip, for the browse and detail
   * screens.
   *
   * The old browse card showed one number for the whole route, which was
   * a lie the moment anybody got out halfway: it said full while a seat
   * sat empty from Osogbo onwards.
   */

  /**
   * Register a corridor nobody runs yet (founder 2026-09-04).
   *
   * Called from the empty state of the Travel Buddy search, which is the
   * one moment we know exactly what somebody wanted and could not have.
   * Asking twice is the same request, so this is an upsert rather than a
   * second row, and the count returned is what makes the signal useful:
   * fifteen people waiting on Ife to Ibadan is a recruiting brief.
   */
  async watchRoute(userId: string, fromCity: string, toCity: string) {
    const from = (fromCity ?? '').trim().toLowerCase();
    const to   = (toCity ?? '').trim().toLowerCase();
    if (!from || !to) {
      throw new BadRequestException('Both cities are needed to set an alert.');
    }
    if (from === to) {
      throw new BadRequestException('Pick two different places.');
    }

    const existing = await this.routeAlertsRepo.findOne({
      where: { userId, fromCity: from, toCity: to },
    });
    if (!existing) {
      await this.routeAlertsRepo.save(
        this.routeAlertsRepo.create({ userId, fromCity: from, toCity: to, notifiedAt: null }),
      );
    } else if (existing.notifiedAt) {
      // They asked again after being told once, so arm it again rather
      // than leaving a spent alert in place.
      existing.notifiedAt = null;
      await this.routeAlertsRepo.save(existing);
    }

    const watchers = await this.routeAlertsRepo.count({
      where: { fromCity: from, toCity: to },
    });
    return { ok: true as const, watchers };
  }

  /**
   * Tell everyone waiting on a corridor that it now exists.
   *
   * Called when a driver declares a trip. Matching is deliberately loose
   * on both ends: the alert holds what the passenger typed and the trip
   * holds what a geocoder decided, and those disagree often enough that
   * an exact match would silently never fire.
   */
  async notifyRouteWatchers(fromCity: string, toCity: string, tripId: string) {
    const from = (fromCity ?? '').trim().toLowerCase();
    const to   = (toCity ?? '').trim().toLowerCase();
    if (!from || !to) return 0;

    const rows: RouteAlert[] = await this.routeAlertsRepo
      .createQueryBuilder('a')
      .where('a."notifiedAt" IS NULL')
      .andWhere(
        `(:from ILIKE '%' || a."fromCity" || '%' OR a."fromCity" ILIKE :fromLike)`,
        { from, fromLike: `%${from}%` },
      )
      .andWhere(
        `(:to ILIKE '%' || a."toCity" || '%' OR a."toCity" ILIKE :toLike)`,
        { to, toLike: `%${to}%` },
      )
      .take(500)
      .getMany();

    for (const a of rows) {
      try {
        await this.notifications.create(
          a.userId,
          'A driver is running your route',
          `Someone has declared ${fromCity} to ${toCity}. Seats are open now.`,
          NotificationType.GENERAL,
        );
        a.notifiedAt = new Date();
        await this.routeAlertsRepo.save(a);
      } catch { /* one failed notice must not stop the rest */ }
    }
    return rows.length;
  }

  async tripAvailability(tripId: string) {
    const trip = await this.loadTrip(tripId);
    const stops = await this.stopsRepo.find({ where: { tripId } as any, order: { sequence: 'ASC' } });
    if (stops.length < 2) {
      throw new BadRequestException('That trip has no declared stops yet, so seats cannot be priced by segment.');
    }
    const rows = await this.ds.query(
      `SELECT s."sequence" AS seg,
              COALESCE(SUM(sb."seats"), 0)::int AS taken
         FROM "trip_stops" s
         LEFT JOIN "seat_bookings" sb
                ON sb."trip_id" = s."trip_id"
               AND sb."status" = ANY($2::text[])
               AND sb."board_sequence"  <= s."sequence"
               AND sb."alight_sequence" >  s."sequence"
        WHERE s."trip_id" = $1
          AND s."sequence" < (SELECT MAX(x."sequence") FROM "trip_stops" x WHERE x."trip_id" = $1)
        GROUP BY s."sequence"
        ORDER BY s."sequence" ASC`,
      [tripId, SEAT_HOLDING_STATUSES as string[]],
    );
    const legacy = Math.max(0, Number((trip as any).seatsBooked ?? 0));
    const total  = Number((trip as any).seatsTotal ?? 0);
    const takenBySeq = new Map<number, number>(
      (rows ?? []).map((r: any) => [Number(r.seg), Number(r.taken)]),
    );

    return {
      tripId,
      seatsTotal: total,
      departAt: (trip as any).departAt,
      // No arrival time is quoted anywhere in this payload, deliberately:
      // Lagos traffic, fuel queues and checkpoints make any promise of
      // one a refund magnet.
      stops: stops.map((s) => ({
        id: s.id, sequence: s.sequence, city: s.city, address: s.address,
        latitude: Number(s.latitude), longitude: Number(s.longitude),
        description: s.description, kmFromOrigin: Number(s.kmFromOrigin),
        arrivedAt: s.arrivedAt,
      })),
      segments: stops.slice(0, -1).map((s, i) => ({
        fromStopId: s.id,
        toStopId:   stops[i + 1].id,
        fromSequence: s.sequence,
        toSequence:   stops[i + 1].sequence,
        fromCity: s.city,
        toCity:   stops[i + 1].city,
        km: kobo(Number(stops[i + 1].kmFromOrigin) - Number(s.kmFromOrigin)),
        seatsLeft: Math.max(0, total - legacy - (takenBySeq.get(Number(s.sequence)) ?? 0)),
      })),
      driver: {
        name:   (trip as any).driver?.user?.name ?? 'Driver',
        rating: (trip as any).driver?.rating ?? null,
        ...vehicleIdentityForPassenger((trip as any).driver),
      },
    };
  }

  // ── Pricing a segment ────────────────────────────────────────────────

  /**
   * What one segment costs, priced off the segment and NOT off the
   * driver's whole route.
   *
   * The old engine charged trip.routeKm, so an Ibadan to Abuja run
   * billed a passenger going to Osogbo for all 605km. This charges the
   * 90 they actually ride.
   *
   * A floor then applies per seat, because a route sold by the segment
   * invites somebody to book two stops that are four kilometres apart on
   * a cross-country run and occupy a seat that could have been sold to
   * someone riding the length of the country. The floor is a Fee
   * Catalogue row, so ops set what "too short to be worth a stop" means.
   */
  private async priceSegment(trip: any, segmentKm: number, seats: number, luggage?: string | null) {
    const priced = await this.rateCard.computeSeatPrice({
      vehicleType: trip.driver?.vehicleType,
      routeKm: segmentKm,
      seats,
      luggage: luggage ?? undefined,
    });

    let total  = kobo(Number(priced.customer.total));
    let driver = kobo(Number(priced.driver.total));

    const minPerSeat = await this.fee(FEE.MIN_SEGMENT_FARE);
    const floor = kobo(minPerSeat * seats);
    let flooredTo: number | null = null;
    if (floor > 0 && total < floor) {
      /**
       * Lift the rider's share by the same ratio, not just the fare.
       *
       * Leaving driverEarnings where it was would hand the entire
       * minimum-fare uplift to the platform, which turns a rule meant to
       * protect the rider's seat into a tax on the rider.
       */
      const ratio = total > 0 ? floor / total : 1;
      driver = kobo(driver * ratio);
      flooredTo = floor;
      total = floor;
    }

    return {
      totalNgn: total,
      driverNgn: driver,
      breakdown: priced.customer,
      ratePerSeatKm: priced.ratePerSeatKm,
      minimumApplied: flooredTo,
    };
  }

  // ── Loaders and authorization ────────────────────────────────────────

  private async loadTrip(tripId: string) {
    const trip = await this.tripsRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.driver', 'd')
      .leftJoinAndSelect('d.user', 'u')
      .where('t.id = :tripId', { tripId })
      .getOne();
    if (!trip) throw new NotFoundException('That trip is no longer listed.');
    return trip;
  }

  private async loadBooking(bookingId: string) {
    const booking = await this.bookingsRepo.findOne({ where: { id: bookingId } as any });
    if (!booking) throw new NotFoundException('Booking not found.');
    return booking;
  }

  /**
   * The actor must be the driver of THIS trip.
   *
   * A guard proves who someone is, not what they own. JwtAuthGuard says
   * a valid driver is calling; it says nothing about whether the trip in
   * the URL is theirs, and without this check any driver on the platform
   * could accept, decline or mark a no-show on a stranger's passenger.
   */
  private async assertTripDriver(tripId: string, userId: string) {
    const trip = await this.loadTrip(tripId);
    if ((trip as any).driver?.user?.id !== userId) {
      throw new ForbiddenException('That trip belongs to another driver.');
    }
    return trip;
  }

  /** The actor must be the passenger who made THIS booking. */
  private assertPassenger(booking: SeatBooking, userId: string) {
    if (booking.passengerId !== userId) {
      throw new ForbiddenException('That booking belongs to another passenger.');
    }
  }

  // ── 1. Request: nothing is charged ───────────────────────────────────

  /**
   * A passenger asks for a segment.
   *
   * NOTHING is charged here, which is the point of the whole rebuild. A
   * passenger used to pay the instant they tapped Book, so a driver who
   * simply said no turned their money into a refund they had to chase
   * through support. A decline now costs the passenger nothing and
   * produces no refund to chase, because there was never a charge.
   */
  async requestSegment(passengerUserId: string, tripId: string, body: {
    boardStopId?: string; alightStopId?: string; seats?: number;
    luggage?: string; note?: string;
  }) {
    const trip: any = await this.loadTrip(tripId);

    if (trip.driver?.user?.id === passengerUserId) {
      throw new BadRequestException('You cannot book a seat on your own trip.');
    }
    if (trip.status !== DriverTripStatus.ACTIVE || new Date(trip.departAt) < new Date()) {
      throw new BadRequestException('That trip has departed or was cancelled.');
    }
    if (!trip.acceptsPassengers || Number(trip.seatsTotal) < 1) {
      throw new BadRequestException('That trip does not take passengers.');
    }

    const board  = await this.stopsRepo.findOne({ where: { id: body.boardStopId, tripId } as any });
    const alight = await this.stopsRepo.findOne({ where: { id: body.alightStopId, tripId } as any });
    if (!board || !alight) {
      throw new BadRequestException('Pick your boarding and drop-off points from the stops this driver declared.');
    }
    if (alight.sequence <= board.sequence) {
      throw new BadRequestException('Your drop-off has to be further along the route than where you board.');
    }

    const seats = Math.max(1, Math.min(Math.round(Number(body.seats ?? 1)), Number(trip.seatsTotal)));
    const segmentKm = kobo(Number(alight.kmFromOrigin) - Number(board.kmFromOrigin));
    if (!(segmentKm > 0)) {
      throw new BadRequestException('That stretch has no measured distance yet. Ask the driver to re-declare the trip stops.');
    }

    const free = await this.seatsFreeAcross(trip, board.sequence, alight.sequence);
    if (seats > free) {
      throw new BadRequestException(free === 0
        ? `Every seat is taken on at least one stretch between ${board.city} and ${alight.city}.`
        : `Only ${free} seat${free === 1 ? '' : 's'} run the whole way from ${board.city} to ${alight.city}.`);
    }

    const quote = await this.priceSegment(trip, segmentKm, seats, body.luggage);

    const booking = (await this.bookingsRepo.save(this.bookingsRepo.create({
      tripId,
      passengerId:    passengerUserId,
      boardStopId:    board.id,
      alightStopId:   alight.id,
      boardSequence:  board.sequence,
      alightSequence: alight.sequence,
      seats,
      segmentKm,
      priceNgn:          quote.totalNgn,
      driverEarningsNgn: quote.driverNgn,
      luggage: body.luggage === 'large' ? 'large' : body.luggage === 'small' ? 'small' : null,
      status:  SeatBookingStatus.REQUESTED,
      passengerNote: (body.note ?? '').trim().slice(0, 300) || null,
      requestedAt:   new Date(),
    } as any))) as unknown as SeatBooking;

    await this.record(booking.id, 'requested', 'passenger', passengerUserId, {
      meta: { seats, segmentKm, quotedNgn: quote.totalNgn, boardStopId: board.id, alightStopId: alight.id },
    });

    this.push(
      trip.driver?.user?.id,
      'Seat request on your trip',
      `${seats} seat${seats === 1 ? '' : 's'} from ${board.city} to ${alight.city}, ${segmentKm.toFixed(2)}km. Accept it and the passenger pays; decline and nobody is charged.`,
      NotificationType.JOB_REQUEST,
    );

    return this.viewForPassenger(booking, trip, board, alight);
  }

  // ── 2. Accept or decline ─────────────────────────────────────────────

  /**
   * The driver agrees to carry this segment.
   *
   * The fare is re-priced here rather than trusted from the request row.
   * A rate card can change between the ask and the answer, and the
   * number the passenger is about to be charged has to be the number the
   * catalogue says today.
   */
  async acceptRequest(driverUserId: string, bookingId: string, body: { note?: string } = {}) {
    const booking = await this.loadBooking(bookingId);
    const trip: any = await this.assertTripDriver(booking.tripId, driverUserId);

    if (booking.status !== SeatBookingStatus.REQUESTED) {
      throw new BadRequestException('That request is no longer waiting on you.');
    }
    if (trip.status !== DriverTripStatus.ACTIVE) {
      throw new BadRequestException('That trip is no longer active.');
    }

    /**
     * Capacity is checked again at acceptance even though acceptance
     * holds no seat. Accepting into a stretch that filled up while the
     * request sat there would produce a fare the passenger can never
     * successfully pay, and a "your payment failed" screen is a worse
     * answer than an honest "that stretch filled up".
     */
    const free = await this.seatsFreeAcross(trip, booking.boardSequence, booking.alightSequence);
    if (booking.seats > free) {
      throw new BadRequestException('That stretch filled up while this request was waiting. Decline it so the passenger can look elsewhere.');
    }

    const quote = await this.priceSegment(trip, Number(booking.segmentKm), booking.seats, booking.luggage);
    const holdMin = await this.fee(FEE.UNPAID_HOLD_MIN);
    const dueAt = new Date(Date.now() + Math.max(1, holdMin) * 60_000);

    await this.bookingsRepo.update(booking.id, {
      status:            SeatBookingStatus.PENDING_PAYMENT,
      acceptedAt:        new Date(),
      paymentDueAt:      dueAt,
      priceNgn:          quote.totalNgn,
      driverEarningsNgn: quote.driverNgn,
      driverNote:        (body.note ?? '').trim().slice(0, 300) || null,
    } as any);

    await this.record(booking.id, 'accepted', 'driver', driverUserId, {
      meta: { fareNgn: quote.totalNgn, paymentDueAt: dueAt.toISOString(), holdMinutes: holdMin },
    });

    const board  = await this.stopsRepo.findOne({ where: { id: booking.boardStopId } as any });
    const alight = await this.stopsRepo.findOne({ where: { id: booking.alightStopId } as any });

    this.push(
      booking.passengerId,
      'Your seat was accepted',
      `${board?.city ?? 'Your stop'} to ${alight?.city ?? 'your drop-off'} is NGN ${quote.totalNgn.toFixed(2)} for ${booking.seats} seat${booking.seats === 1 ? '' : 's'}. Pay within ${Math.round(holdMin)} minutes to hold it: until then the seat stays open to others.`,
      NotificationType.STATUS_UPDATE,
    );

    return this.detail(booking.id, driverUserId);
  }

  /** The driver says no. Costs the passenger nothing, refunds nothing. */
  async declineRequest(driverUserId: string, bookingId: string, body: { reason?: string } = {}) {
    const booking = await this.loadBooking(bookingId);
    await this.assertTripDriver(booking.tripId, driverUserId);

    if (![SeatBookingStatus.REQUESTED, SeatBookingStatus.PENDING_PAYMENT].includes(booking.status)) {
      throw new BadRequestException('That request is no longer waiting on you.');
    }
    if (booking.paidAt) {
      throw new BadRequestException('That seat is already paid for. Cancelling it is a refund decision, so raise it with support.');
    }

    const reason = (body.reason ?? '').trim().slice(0, 200) || 'The driver declined this seat request.';
    await this.bookingsRepo.update(booking.id, {
      status:             SeatBookingStatus.CANCELLED,
      declinedAt:         new Date(),
      cancelledAt:        new Date(),
      cancellationReason: reason,
      refundNgn:          0,
    } as any);
    await this.record(booking.id, 'declined', 'driver', driverUserId, { note: reason });

    this.push(
      booking.passengerId,
      'Seat request declined',
      `${reason} You were never charged, so there is nothing to refund. Other trips are listed on the same route.`,
      NotificationType.STATUS_UPDATE,
    );
    return { ok: true };
  }

  // ── 3. Pay: the seat is held only when the money lands ───────────────

  /**
   * Mint the delivery row this fare will be charged against.
   *
   * Escrow, the rider's job list, tracking and the in-trip chat all hang
   * off a Delivery, so the passenger pays through the same Flutterwave
   * rail as everything else on the platform. It is created HERE and not
   * at request time because there is no reason to mint a payable row for
   * a request the driver may decline.
   *
   * The seat is still NOT held. The booking stays pending_payment until
   * the webhook confirms the money, which is what keeps the segment
   * sellable in the meantime: an unpaid request must never quietly block
   * capacity while somebody thinks about their card.
   */
  async startPayment(passengerUserId: string, bookingId: string) {
    const booking = await this.loadBooking(bookingId);
    this.assertPassenger(booking, passengerUserId);

    if (booking.status !== SeatBookingStatus.PENDING_PAYMENT) {
      throw new BadRequestException(booking.status === SeatBookingStatus.REQUESTED
        ? 'The driver has not accepted this request yet.'
        : 'This booking is not waiting on payment.');
    }
    if (booking.paymentDueAt && new Date(booking.paymentDueAt).getTime() < Date.now()) {
      throw new BadRequestException('This accepted request expired. Ask again and the driver can re-accept it.');
    }
    if (booking.deliveryId) {
      return { bookingId: booking.id, deliveryId: booking.deliveryId, amountNgn: kobo(Number(booking.priceNgn)) };
    }

    const trip: any = await this.loadTrip(booking.tripId);
    const board  = await this.stopsRepo.findOne({ where: { id: booking.boardStopId } as any });
    const alight = await this.stopsRepo.findOne({ where: { id: booking.alightStopId } as any });
    if (!board || !alight) throw new BadRequestException('The stops on this trip changed. Ask for the segment again.');

    const free = await this.seatsFreeAcross(trip, booking.boardSequence, booking.alightSequence, booking.id);
    if (booking.seats > free) {
      throw new BadRequestException('That stretch filled up before this was paid for. Nothing was charged.');
    }

    let trackingCode = 'SRS-' + secureCode(8);
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await this.deliveriesRepo.exist({ where: { trackingCode } });
      if (!exists) break;
      trackingCode = 'SRS-' + secureCode(8);
    }

    const luggageLabel = booking.luggage === 'large'
      ? ' · large luggage'
      : booking.luggage === 'small' ? ' · small bag' : '';

    const delivery: any = await this.deliveriesRepo.save(this.deliveriesRepo.create({
      trackingCode,
      customer: { id: passengerUserId } as any,
      kind: 'ride',
      tripId: booking.tripId,
      // Board and alight, not the trip's endpoints: the passenger is
      // buying this stretch and the map has to show the stretch.
      pickupAddress:  board.address,
      pickupLat:      Number(board.latitude),
      pickupLng:      Number(board.longitude),
      dropoffAddress: alight.address,
      dropoffLat:     Number(alight.latitude),
      dropoffLng:     Number(alight.longitude),
      packageDescription: `Seat x${booking.seats} · ${board.city} → ${alight.city}${luggageLabel}`,
      categoryCode: null,
      weightKg:     null,
      distanceKm:   Number(booking.segmentKm),
      price:          kobo(Number(booking.priceNgn)),
      driverEarnings: kobo(Number(booking.driverEarningsNgn)),
      paymentMethod:  'card',
      status: DeliveryStatus.PENDING,
      termsAcceptedAt: new Date(),
    } as any));

    await this.bookingsRepo.update(booking.id, { deliveryId: delivery.id } as any);

    return {
      bookingId:  booking.id,
      deliveryId: delivery.id,
      trackingCode: delivery.trackingCode,
      amountNgn:  kobo(Number(booking.priceNgn)),
      payWith:    'POST /api/v1/payments/initiate with this deliveryId',
      // Shown on the payment screen, before the money moves. See paymentTerms.
      terms:      await this.paymentTerms(),
    };
  }

  /**
   * The terms a passenger agrees to by paying, in their own words.
   *
   * A forfeited fare settles to the rider as a full fare: they made the
   * journey, they waited the agreed wait, and they then carried the seat
   * empty to the passenger's stop. That is defensible, and it is only
   * defensible if the passenger was told BEFORE they paid rather than
   * discovering it by losing money (founder, 2026-08-28: "that is why we
   * need to give warning or something they consent to before paying").
   *
   * Built from the live catalogue rows rather than written as prose, so
   * the sentence a passenger agreed to can never drift away from the
   * rule the code enforces. Never promises an arrival time.
   */
  private async paymentTerms(): Promise<{
    waitMinutes: number; freeCancelHours: number;
    lines: string[]; summary: string;
  }> {
    const [waitMinutes, freeCancelHours, latePct, processingPct] = await Promise.all([
      this.fee(FEE.NO_SHOW_WAIT_MIN),
      this.fee(FEE.FREE_CANCEL_HOURS),
      this.fee(FEE.LATE_CANCEL_REFUND_PCT),
      this.fee(FEE.CANCEL_PROCESSING_PCT),
    ]);
    const lateShare = Number.isFinite(latePct) && latePct > 0 ? Math.min(100, latePct) : 100;
    const keepsFee = processingPct > 0;

    /**
     * These said "less the 1.4% card charge we already paid", which was
     * false in three ways at once, all of them favouring SEIRS, in a
     * sentence shown to a passenger about their own money.
     *
     * Checked against the one real payment on the account
     * (SRS-PAY-BDC811FE, 2026-08-24): the provider added its fee ON TOP
     * of the fare, so the PASSENGER paid it, not us. We paid only the
     * tax on that fee, which is a fraction of what this sentence
     * claimed. And the figure quoted was the catalogue row, which is
     * not what was actually deducted.
     *
     * It also said "card" when checkout takes transfer and USSD as
     * well, so a passenger who paid by transfer was told about a card.
     *
     * No percentage is named now. The number is under review and a
     * sentence a passenger consents to must not go stale the moment an
     * admin edits a row. What is stated is the part that is true
     * whatever the row lands on: a processing charge was taken when the
     * payment went through, and refunding the fare does not bring it
     * back.
     */
    const lines = [
      `The driver waits ${waitMinutes} minutes at your boarding point. Be there before that.`,
      `If you are not there when the wait ends, the driver may leave and your fare is not refunded. They still made the journey and held your seat, so it is paid to them in full.`,
      `Cancel more than ${freeCancelHours} hours before departure and you are refunded${keepsFee ? ', less the processing charge taken when you paid, which a refund does not bring back' : ' in full'}.`,
      lateShare >= 100
        ? `Cancel closer to departure and you are still refunded${keepsFee ? ', less that same processing charge' : ' in full'}.`
        : `Cancel closer to departure and ${lateShare}% of the fare is returned${keepsFee ? ', less the processing charge' : ''}.`,
      `Your seat is only held once payment lands. Until then somebody else can take it.`,
    ];

    return {
      waitMinutes,
      freeCancelHours,
      lines,
      summary: `By paying you agree the driver waits ${waitMinutes} minutes, and that a missed pickup is not refunded because the journey was still made.`,
    };
  }

  /**
   * The money landed. Only NOW is the seat held.
   *
   * Called from DeliveriesService.kickDispatch, which the payments
   * webhook fires once escrow is confirmed.
   *
   * The capacity check runs again inside a transaction that locks the
   * trip row, because "the segment stays sellable until payment lands"
   * has a consequence somebody has to own: two passengers CAN both be
   * paying for the last seat at the same time. The lock serialises them,
   * the first one to land keeps the seat, and the second is refunded in
   * full rather than discovering on the road that they have no seat.
   */
  async confirmPaidByDelivery(deliveryId: string): Promise<boolean> {
    const booking = await this.bookingsRepo.findOne({ where: { deliveryId } as any });
    if (!booking) return false;

    /**
     * Money that landed on a booking already closed.
     *
     * The unpaid window can expire, or the passenger can cancel, in the
     * seconds while a card is authorising. Without this the payment is
     * swallowed: escrow holds a fare against a booking that will never
     * hold a seat, and nobody is watching that row. Full refund, no fee,
     * because the passenger did nothing wrong.
     */
    if (booking.status === SeatBookingStatus.CANCELLED && !booking.paidAt) {
      this.logger.warn(`Seat booking ${booking.id} was already closed when its payment landed; refunding in full`);
      await this.record(booking.id, 'capacity_lost', 'system', null, {
        note: 'Payment landed after this booking had already closed.',
        meta: { refundNgn: kobo(Number(booking.priceNgn)), deliveryId },
      });
      await this.bookingsRepo.update(booking.id, { refundNgn: kobo(Number(booking.priceNgn)) } as any);
      try {
        await this.paymentsServiceRef?.refundEscrow?.(deliveryId, booking.passengerId, 0);
      } catch (e: any) {
        this.logger.error(`CRITICAL: late payment on closed seat booking ${booking.id} not refunded: ${e?.message ?? e}`);
      }
      this.push(booking.passengerId, 'Refunded in full',
        'Your payment arrived after this seat request had already closed, so every naira is on its way back to your card with no fee.',
        NotificationType.STATUS_UPDATE, deliveryId);
      return true;
    }

    if (booking.status !== SeatBookingStatus.PENDING_PAYMENT) return true;

    const trip: any = await this.loadTrip(booking.tripId);
    let won = false;
    // A concurrent call got there first. Not a loss, but not ours to
    // announce either: notifying again would push the passenger twice
    // and write a second 'paid' line into an evidence trail whose whole
    // value is that it reads as what actually happened, once.
    let settledElsewhere = false;

    await this.ds.transaction(async (manager) => {
      // Serialise every concurrent payment on this trip. Without it two
      // webhooks can both read "one seat free" and both take it.
      await manager.query(`SELECT "id" FROM "driver_trips" WHERE "id" = $1 FOR UPDATE`, [booking.tripId]);

      const fresh = await manager.query(
        `SELECT "status" FROM "seat_bookings" WHERE "id" = $1`, [booking.id],
      );
      if (String(fresh?.[0]?.status) !== SeatBookingStatus.PENDING_PAYMENT) {
        settledElsewhere = true;
        return;
      }

      const peak   = await this.peakSeatsTaken(booking.tripId, booking.boardSequence, booking.alightSequence, booking.id, manager);
      const legacy = Math.max(0, Number(trip.seatsBooked ?? 0));
      const free   = Math.max(0, Number(trip.seatsTotal ?? 0) - legacy - peak);

      if (booking.seats > free) return;

      await manager.query(
        `UPDATE "seat_bookings"
            SET "status" = $2, "paid_at" = NOW(), "updated_at" = NOW()
          WHERE "id" = $1`,
        [booking.id, SeatBookingStatus.BOOKED],
      );
      won = true;
    });

    if (settledElsewhere) return true;
    if (!won) {
      await this.loseCapacityRace(booking, trip);
      return true;
    }

    await this.record(booking.id, 'paid', 'system', null, {
      meta: { deliveryId, amountNgn: kobo(Number(booking.priceNgn)) },
    });

    /**
     * Assign the rider straight away rather than re-offering the job.
     *
     * The offer already happened, in the open, before any money moved:
     * this driver accepted this exact segment at this exact fare. Asking
     * them again through the generic dispatch path would let them walk
     * away from an agreement the passenger has now paid against.
     */
    const driverId = trip.driver?.id;
    if (driverId) {
      // Guarded on driver IS NULL so a retried webhook cannot reassign a
      // delivery somebody else has already picked up.
      await this.deliveriesRepo.update(
        { id: deliveryId, driver: IsNull() } as any,
        { driver: { id: driverId }, status: DeliveryStatus.ASSIGNED, assignedAt: new Date() } as any,
      ).catch((e: any) => this.logger.error(`seat booking ${booking.id} paid but not assigned: ${e?.message ?? e}`));
    }

    const board  = await this.stopsRepo.findOne({ where: { id: booking.boardStopId } as any });
    const alight = await this.stopsRepo.findOne({ where: { id: booking.alightStopId } as any });

    this.push(booking.passengerId, 'Your seat is held',
      `${board?.city ?? 'Your stop'} to ${alight?.city ?? 'your drop-off'} is paid and the seat is yours. Watch for the driver marking they have arrived at your stop.`,
      NotificationType.PAYMENT_RECEIVED, deliveryId);
    this.push(trip.driver?.user?.id, 'Seat paid for',
      `${booking.seats} seat${booking.seats === 1 ? '' : 's'} from ${board?.city ?? 'the pickup'} to ${alight?.city ?? 'the drop-off'} is paid. It is on your job list.`,
      NotificationType.DELIVERY_ASSIGNED, deliveryId);

    return true;
  }

  /**
   * Two people paid for the last seat and this one lost the race.
   *
   * A full refund, no fee, because the passenger did nothing wrong: they
   * were told the seat was open and it was, right up until somebody
   * else's webhook landed first.
   */
  private async loseCapacityRace(booking: SeatBooking, trip: any) {
    const reason = 'That stretch sold out while your payment was going through.';
    await this.bookingsRepo.update(booking.id, {
      status:             SeatBookingStatus.CANCELLED,
      cancelledAt:        new Date(),
      cancellationReason: reason,
      refundNgn:          kobo(Number(booking.priceNgn)),
    } as any);
    await this.record(booking.id, 'capacity_lost', 'system', null, {
      note: reason,
      meta: { refundNgn: kobo(Number(booking.priceNgn)) },
    });

    if (booking.deliveryId) {
      await this.deliveriesRepo.update(booking.deliveryId, {
        cancelledAt:        new Date(),
        cancellationFeeNgn: 0,
        cancellationReason: reason,
      } as any).catch(() => {});
      await this.setDeliveryStatus(booking.deliveryId, DeliveryStatus.CANCELLED);
      try {
        await this.paymentsServiceRef?.refundEscrow?.(booking.deliveryId, booking.passengerId, 0);
      } catch (e: any) {
        this.logger.error(`CRITICAL: seat booking ${booking.id} lost its seat and the refund failed: ${e?.message ?? e}`);
      }
    }

    this.push(booking.passengerId, 'Seat sold out, refunded in full',
      `${reason} Every naira is on its way back to your card, with no fee. Other trips run the same route.`,
      NotificationType.STATUS_UPDATE, booking.deliveryId ?? undefined);
    this.logger.warn(`Seat booking ${booking.id} lost the capacity race on trip ${trip?.id}; refunded in full`);
  }

  /**
   * Accepted, never paid, window gone.
   *
   * Both sides are told. The passenger, so they know the seat is open
   * again and can pay for another; the driver, so a seat they mentally
   * counted as sold goes back on the market rather than travelling empty
   * because nobody said anything.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireUnpaidSeatHolds() {
    try {
      const stale = await this.bookingsRepo
        .createQueryBuilder('b')
        .where('b.status = :status', { status: SeatBookingStatus.PENDING_PAYMENT })
        .andWhere('b.paymentDueAt IS NOT NULL')
        .andWhere('b.paymentDueAt < NOW()')
        .andWhere('b.paidAt IS NULL')
        .take(100)
        .getMany();

      for (const booking of stale) {
        const reason = 'This accepted seat request expired before it was paid for.';
        await this.bookingsRepo.update(booking.id, {
          status:             SeatBookingStatus.CANCELLED,
          cancelledAt:        new Date(),
          cancellationReason: reason,
          refundNgn:          0,
        } as any);
        await this.record(booking.id, 'payment_expired', 'system', null, { note: reason });

        if (booking.deliveryId) {
          await this.deliveriesRepo.update(booking.deliveryId, {
            cancelledAt:        new Date(),
            cancellationFeeNgn: 0,
            cancellationReason: reason,
          } as any).catch(() => {});
          await this.setDeliveryStatus(booking.deliveryId, DeliveryStatus.CANCELLED);
        }

        const trip: any = await this.loadTrip(booking.tripId).catch(() => null);
        this.push(booking.passengerId, 'Seat request expired',
          'The payment window on your accepted seat ran out, so the seat went back on the market. You were not charged. Ask again and the driver can accept it afresh.',
          NotificationType.STATUS_UPDATE);
        this.push(trip?.driver?.user?.id, 'Unpaid seat released',
          `${booking.seats} seat${booking.seats === 1 ? '' : 's'} you accepted was never paid for, so it is back on sale for that stretch.`,
          NotificationType.STATUS_UPDATE);
      }
      if (stale.length) this.logger.log(`Released ${stale.length} unpaid seat hold(s)`);
    } catch (e: any) {
      this.logger.warn(`expireUnpaidSeatHolds sweep failed: ${e?.message ?? e}`);
    }
  }

  // ── 5. The no-show clock, with evidence ──────────────────────────────

  /**
   * The rider is at the stop and the clock starts.
   *
   * The GPS fix is recorded because a forfeited fare will be disputed,
   * and "I was at the stop" is a claim while a coordinate at a timestamp
   * is something support can compare against the declared stop. Without
   * it this is one person's word against another.
   */
  async markArrivedAtStop(driverUserId: string, bookingId: string, body: { lat?: number; lng?: number } = {}) {
    const booking = await this.loadBooking(bookingId);
    const trip: any = await this.assertTripDriver(booking.tripId, driverUserId);

    if (booking.status !== SeatBookingStatus.BOOKED) {
      throw new BadRequestException('That seat is not waiting to be picked up.');
    }
    if (booking.arrivedAt) {
      return { arrivedAt: booking.arrivedAt, noShowDeadlineAt: booking.noShowDeadlineAt };
    }

    const waitMin  = await this.fee(FEE.NO_SHOW_WAIT_MIN);
    const now      = new Date();
    const deadline = new Date(now.getTime() + Math.max(1, waitMin) * 60_000);

    await this.bookingsRepo.update(booking.id, {
      arrivedAt:        now,
      arrivedLat:       Number.isFinite(Number(body.lat)) ? Number(body.lat) : null,
      arrivedLng:       Number.isFinite(Number(body.lng)) ? Number(body.lng) : null,
      noShowDeadlineAt: deadline,
    } as any);
    await this.record(booking.id, 'arrived', 'driver', driverUserId, {
      lat: body.lat, lng: body.lng,
      meta: { waitMinutes: waitMin, deadlineAt: deadline.toISOString() },
    });

    const board = await this.stopsRepo.findOne({ where: { id: booking.boardStopId } as any });
    // Push and in-trip chat are the only channels. No SMS.
    this.push(booking.passengerId, 'Your ride is at the stop',
      `The driver is waiting at ${board?.city ?? 'your stop'} and can leave in ${Math.round(waitMin)} minutes. Message them in the trip chat if you are close.`,
      NotificationType.STATUS_UPDATE, booking.deliveryId ?? undefined);

    return {
      arrivedAt: now,
      noShowDeadlineAt: deadline,
      waitMinutes: waitMin,
      // Told to BOTH sides: a countdown only one party can see is not a
      // fair warning, it is an ambush.
      passenger: passengerIdentityForDriver(await this.loadPassengerRow(booking.passengerId)),
      trip: { id: trip.id },
    };
  }

  /**
   * The rider reached out. Recorded, one row per attempt.
   *
   * This is evidence, not decoration. When the fare is forfeited the
   * passenger will say nobody tried to contact them, and a list of
   * timestamped attempts is the only thing that answers that.
   */
  async recordContactAttempt(driverUserId: string, bookingId: string, body: { channel?: string; note?: string } = {}) {
    const booking = await this.loadBooking(bookingId);
    await this.assertTripDriver(booking.tripId, driverUserId);

    if (![SeatBookingStatus.BOOKED, SeatBookingStatus.BOARDED].includes(booking.status)) {
      throw new BadRequestException('That seat is not live.');
    }

    // Push and in-trip chat ONLY. SMS is a standing deferred decision at
    // SEIRS, so there is no third channel to record and none is accepted.
    const channel = body.channel === 'chat' ? 'chat' : 'push';
    const note = (body.note ?? '').trim().slice(0, 300) || null;

    await this.ds.query(
      `UPDATE "seat_bookings" SET "contact_attempts" = "contact_attempts" + 1, "updated_at" = NOW() WHERE "id" = $1`,
      [booking.id],
    );
    await this.record(booking.id, 'contact_attempt', 'driver', driverUserId, { note, meta: { channel } });

    if (channel === 'push') {
      this.push(booking.passengerId, 'Your driver is trying to reach you',
        note ?? 'The driver is waiting at your boarding point. Open the trip chat to reply.',
        NotificationType.STATUS_UPDATE, booking.deliveryId ?? undefined);
    }

    const fresh = await this.loadBooking(booking.id);
    return { contactAttempts: fresh.contactAttempts, channel };
  }

  /**
   * The clock ran out and the rider leaves. The fare is forfeit.
   *
   * The seat is NOT released. It stays held to the passenger's alight
   * stop because the vehicle already committed to carrying that space
   * empty, and selling it now would charge two people for one seat on
   * the same stretch of road.
   *
   * The departure GPS and stamp are written for the dispute that is
   * coming, alongside the arrival fix and every contact attempt.
   */
  async markNoShow(driverUserId: string, bookingId: string, body: { lat?: number; lng?: number; note?: string } = {}) {
    const booking = await this.loadBooking(bookingId);
    await this.assertTripDriver(booking.tripId, driverUserId);

    if (booking.status !== SeatBookingStatus.BOOKED) {
      throw new BadRequestException('That seat is not waiting to be picked up.');
    }
    if (!booking.arrivedAt || !booking.noShowDeadlineAt) {
      throw new BadRequestException('Mark that you have arrived at the stop first. The wait has to be on the record before a fare can be forfeited.');
    }
    const deadline = new Date(booking.noShowDeadlineAt).getTime();
    if (Date.now() < deadline) {
      const leftMs = deadline - Date.now();
      throw new BadRequestException(`The passenger still has ${Math.ceil(leftMs / 60_000)} minute(s) of the agreed wait.`);
    }

    const now = new Date();
    await this.bookingsRepo.update(booking.id, {
      status:      SeatBookingStatus.NO_SHOW,
      noShowAt:    now,
      departedLat: Number.isFinite(Number(body.lat)) ? Number(body.lat) : null,
      departedLng: Number.isFinite(Number(body.lng)) ? Number(body.lng) : null,
      refundNgn:   0,
    } as any);
    await this.record(booking.id, 'departed_no_show', 'driver', driverUserId, {
      lat: body.lat, lng: body.lng,
      note: (body.note ?? '').trim().slice(0, 300) || null,
      meta: {
        arrivedAt:        booking.arrivedAt,
        deadlineAt:       booking.noShowDeadlineAt,
        contactAttempts:  booking.contactAttempts,
        forfeitedNgn:     kobo(Number(booking.priceNgn)),
        seatHeldToStopId: booking.alightStopId,
      },
    });

    /**
     * The fare settles exactly as though the journey had run.
     *
     * The rider took their vehicle to the agreed place at the agreed
     * time, waited the agreed wait, and then carried that seat empty to
     * the passenger's stop because it stays held. They did the work, so
     * they are paid the work: the same share of the same fare they would
     * have earned had the passenger boarded, and SEIRS keeps the same
     * commission (founder, 2026-08-28: "driver gets his share as it was
     * a full fare, and SEIRS gets theirs").
     *
     * DELIVERED is therefore correct here, and it has to go through
     * setDeliveryStatus rather than an UPDATE, because that is what
     * releases the escrow. Writing the status behind that method's back
     * would mark the seat settled while the money stayed locked with
     * nothing left to release it.
     *
     * Forfeit means the passenger is not refunded. It never meant the
     * money sits nowhere. This is exactly why the consent line exists on
     * the payment screen: nobody should discover this rule by losing a
     * fare to it.
     */
    if (booking.deliveryId) {
      await this.deliveriesRepo.update(booking.deliveryId, {
        cancellationReason: 'Passenger no-show: fare forfeited and settled to the rider under the no-show policy.',
      } as any).catch(() => {});
      await this.setDeliveryStatus(booking.deliveryId, DeliveryStatus.DELIVERED);
    }

    this.push(booking.passengerId, 'The vehicle left without you',
      `The driver waited the full agreed time at your boarding point and has gone on. Under the no-show policy you agreed to at payment, the fare is not refunded: the driver made the journey and held your seat. If you believe this is wrong, raise it with support. The wait, the driver's position and every attempt to reach you are on the record.`,
      NotificationType.STATUS_UPDATE, booking.deliveryId ?? undefined);

    this.logger.warn(
      `Seat booking ${booking.id} marked no-show after ${booking.contactAttempts} contact attempt(s); ` +
      `seat stays held to stop ${booking.alightStopId}; fare settled to the rider as a full fare`,
    );
    return { ok: true, seatReleased: false, fareSettledToDriver: true };
  }

  // ── 4. Board and drop ────────────────────────────────────────────────

  /** Aboard. Stamped with time and a GPS fix, like every other step. */
  async markBoarded(driverUserId: string, bookingId: string, body: { lat?: number; lng?: number } = {}) {
    const booking = await this.loadBooking(bookingId);
    await this.assertTripDriver(booking.tripId, driverUserId);

    if (booking.status !== SeatBookingStatus.BOOKED) {
      throw new BadRequestException('Only a paid, held seat can be boarded.');
    }

    await this.bookingsRepo.update(booking.id, {
      status:    SeatBookingStatus.BOARDED,
      boardedAt: new Date(),
      boardLat:  Number.isFinite(Number(body.lat)) ? Number(body.lat) : null,
      boardLng:  Number.isFinite(Number(body.lng)) ? Number(body.lng) : null,
    } as any);
    await this.record(booking.id, 'boarded', 'driver', driverUserId, { lat: body.lat, lng: body.lng });

    await this.setDeliveryStatus(booking.deliveryId, DeliveryStatus.IN_TRANSIT);

    this.push(booking.passengerId, 'You are marked aboard',
      'Have a safe trip. Your seat is held to your drop-off point.',
      NotificationType.STATUS_UPDATE, booking.deliveryId ?? undefined);
    return { ok: true };
  }

  /**
   * Dropped off. THIS is what frees the seat.
   *
   * The moment this lands, every segment after the passenger's alight
   * stop stops counting them, which is the whole reason a passenger
   * getting out at Osogbo can free a seat for somebody waiting in
   * Lokoja. Nothing else has to happen and no counter has to be
   * decremented: the capacity query simply stops seeing a dropped
   * booking.
   *
   * A rider could abuse this by marking somebody dropped who is still
   * aboard and then selling the seat twice. Three controls answer that,
   * and NONE of them relies on trusting the rider:
   *
   *   1. The drop is geofenced. Marking it far from the alight stop is
   *      allowed, because roads close and plans change, but the distance
   *      is measured, stored and flagged.
   *   2. Capacity is enforced per segment at booking time, so a
   *      double-sold segment is refused when the second passenger books
   *      rather than discovered by two people sharing a seat on the road.
   *   3. The passenger confirms. An unconfirmed drop goes to a review
   *      queue instead of blocking the rider mid-journey, because
   *      freezing a moving vehicle over an unanswered phone punishes the
   *      wrong person.
   */
  async markDropped(driverUserId: string, bookingId: string, body: { lat?: number; lng?: number } = {}) {
    const booking = await this.loadBooking(bookingId);
    await this.assertTripDriver(booking.tripId, driverUserId);

    if (booking.status !== SeatBookingStatus.BOARDED) {
      throw new BadRequestException('Only a passenger marked aboard can be dropped.');
    }

    const alight = await this.stopsRepo.findOne({ where: { id: booking.alightStopId } as any });
    const geofenceM = await this.fee(FEE.DROP_GEOFENCE_M);

    let distanceM: number | null = null;
    let offGeofence = false;
    if (alight && Number.isFinite(Number(body.lat)) && Number.isFinite(Number(body.lng))) {
      distanceM = kobo(haversineM(
        Number(body.lat), Number(body.lng),
        Number(alight.latitude), Number(alight.longitude),
      ));
      offGeofence = distanceM > geofenceM;
    }

    const now = new Date();
    await this.bookingsRepo.update(booking.id, {
      status:          SeatBookingStatus.DROPPED,
      droppedAt:       now,
      dropLat:         Number.isFinite(Number(body.lat)) ? Number(body.lat) : null,
      dropLng:         Number.isFinite(Number(body.lng)) ? Number(body.lng) : null,
      dropDistanceM:   distanceM,
      dropOffGeofence: offGeofence,
      dropReviewReason: offGeofence
        ? `Drop marked ${Math.round(distanceM ?? 0)}m from the declared stop.`
        : distanceM === null
          ? 'Drop marked with no position fix.'
          : null,
    } as any);
    await this.record(booking.id, 'dropped', 'driver', driverUserId, {
      lat: body.lat, lng: body.lng,
      meta: { distanceM, geofenceM, offGeofence, alightStopId: booking.alightStopId },
    });

    /**
     * DELIVERED is what pays the rider.
     *
     * updateStatus releases escrow to them, so this must not be an
     * UPDATE against the table: a drop written behind that method's back
     * would end the passenger's journey and leave the rider's fare
     * locked in escrow with nothing left to release it. Rides are exempt
     * from the proof-photo gate, so a seat closes cleanly here.
     */
    await this.setDeliveryStatus(booking.deliveryId, DeliveryStatus.DELIVERED);

    this.push(booking.passengerId, 'Confirm you were dropped off',
      `The driver marked you dropped at ${alight?.city ?? 'your stop'}. Confirm it in the app, or say it did not happen: an unconfirmed drop goes to our review queue.`,
      NotificationType.STATUS_UPDATE, booking.deliveryId ?? undefined);

    if (offGeofence) {
      this.logger.warn(`Seat booking ${booking.id} dropped ${Math.round(distanceM ?? 0)}m from stop ${booking.alightStopId} (geofence ${geofenceM}m)`);
    }
    return { ok: true, seatReleasedFromSequence: booking.alightSequence, distanceM, flagged: offGeofence };
  }

  /** The passenger agrees they got out. Closes the review question. */
  async confirmDrop(passengerUserId: string, bookingId: string) {
    const booking = await this.loadBooking(bookingId);
    this.assertPassenger(booking, passengerUserId);
    if (booking.status !== SeatBookingStatus.DROPPED) {
      throw new BadRequestException('That seat has not been marked dropped.');
    }
    await this.bookingsRepo.update(booking.id, {
      dropConfirmedAt: new Date(),
      dropDisputedAt:  null,
      dropReviewReason: booking.dropOffGeofence ? booking.dropReviewReason : null,
    } as any);
    await this.record(booking.id, 'drop_confirmed', 'passenger', passengerUserId, {});
    return { ok: true };
  }

  /**
   * The passenger says the drop never happened.
   *
   * This does NOT reverse the seat release or stop the vehicle. It flags
   * the booking for the review queue, which is the honest thing to do
   * while a trip is still in motion: the rider may already have sold the
   * freed segment to somebody now sitting in it.
   */
  async disputeDrop(passengerUserId: string, bookingId: string, body: { reason?: string } = {}) {
    const booking = await this.loadBooking(bookingId);
    this.assertPassenger(booking, passengerUserId);
    if (booking.status !== SeatBookingStatus.DROPPED) {
      throw new BadRequestException('That seat has not been marked dropped.');
    }
    const reason = (body.reason ?? '').trim().slice(0, 200) || 'The passenger says this drop did not happen.';
    await this.bookingsRepo.update(booking.id, {
      dropDisputedAt:   new Date(),
      dropReviewReason: reason,
    } as any);
    await this.record(booking.id, 'drop_disputed', 'passenger', passengerUserId, { note: reason });
    this.logger.warn(`Seat booking ${booking.id} drop disputed by passenger: ${reason}`);
    return { ok: true, underReview: true };
  }

  /**
   * Drops nobody vouched for.
   *
   * Unconfirmed after a grace window, marked outside the geofence, or
   * actively disputed. Ops works this list; the rider is never blocked
   * mid-journey by it.
   */
  /**
   * The four ops views the spec asked for, beside the drop review queue.
   *
   * Travel Buddy is the one product where SEIRS is not holding a parcel
   * but a person, and where a fare can be forfeited on one party's word.
   * That makes it the product most likely to produce an argument, and an
   * argument support cannot see into is an argument SEIRS loses.
   *
   * Every one of these carries the ids support needs to click through to
   * a profile, because the standing rule is that a person named on a
   * screen is a link to that person, never a dead string.
   */

  /** Declared trips with their route and how full each segment is. */
  /**
   * The seat board, which had no WHERE CLAUSE AT ALL.
   *
   * Every trip ever declared, newest departure first, capped only by the
   * limit. So a finished trip from three weeks ago sat in the same list as
   * tonight's departure with nothing to tell them apart, no status filter,
   * and no way to reach a particular week for audit. The live trips an
   * operator actually watches were crowded out by history as soon as there
   * was any history.
   *
   * Founder 2026-09-04, on both trip boards. Trips are NOT deleted: a
   * declared trip is what a dispute over a seat is argued from and it ties to
   * bookings and payments. The retention is in the view. A default window
   * keeps it about now, a date range reaches back, and the rows live forever.
   */
  async adminTrips(limit = 50, opts: {
    status?: string;
    from?: Date;
    to?: Date;
    defaultWindowDays?: number;
  } = {}) {
    const where: string[] = [];
    const args: any[] = [];
    const add = (sql: string, v: any) => { args.push(v); where.push(sql.replace('?', `$${args.length}`)); };

    if (opts.status) add('t.status = ?', opts.status);
    if (opts.from)   add('t."departAt" >= ?', opts.from);
    if (opts.to)     add('t."departAt" <= ?', opts.to);
    if (!opts.from && !opts.to) {
      /**
       * No range asked for. Show what is coming, plus recent history, rather
       * than the beginning of time. An ACTIVE trip is never hidden by this
       * however far ahead it departs: a live trip is the whole point of the
       * board and must not fall off the end of a window.
       */
      const days = Number(opts.defaultWindowDays ?? 30);
      add(`(t."departAt" >= ? OR t.status = 'active')`,
        new Date(Date.now() - days * 24 * 60 * 60 * 1000));
    }
    args.push(limit);
    const limitArg = `$${args.length}`;

    const trips: Array<any> = await this.bookingsRepo.manager.query(
      `SELECT t.id, t."fromCity", t."toCity", t."departAt", t."routeKm",
              t."seatsTotal", t."seatsBooked", t.status,
              u.id AS "driverUserId", u.name AS "driverName", u."accountId" AS "driverAccountId",
              (SELECT COUNT(*) FROM "trip_stops" s WHERE s."trip_id" = t.id) AS "stopCount",
              (SELECT COUNT(*) FROM "seat_bookings" sb
                WHERE sb."trip_id" = t.id
                  AND sb.status = ANY(ARRAY['booked','boarded','dropped','no_show'])) AS "seatBookings"
         FROM "driver_trips" t
         LEFT JOIN "drivers" d ON d.id = t."driverId"
         LEFT JOIN "users" u ON u.id = d."userId"
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY t."departAt" DESC
        LIMIT ${limitArg}`,
      args,
    ).catch((e: any) => {
      // Not a silent []. A mistyped column here looks exactly like an empty
      // board, and an empty board looks like a quiet day.
      this.logger.error(`adminTrips query failed: ${e?.message ?? e}`);
      return [] as any[];
    });
    /**
     * NAME THE STOPS AND THE PEOPLE (founder, 2026-08-28).
     *
     * This returned stopCount: 3 and seatBookings: 2, which tells an
     * operator that something happened and nothing about what. His
     * words: "i see 3 stops and we can't know which one they were, from
     * where to where was actually book, who booked". A count is the one
     * fact about a route that cannot be acted on.
     *
     * Two follow-up queries rather than N+1: every stop and every seat
     * for the whole page is fetched once by trip id and grouped in
     * memory. A trips page of fifty therefore costs three queries, not
     * a hundred and one.
     *
     * Passenger identity is deliberately included. This is the product
     * where SEIRS is carrying a person rather than a parcel, and where
     * a fare can be forfeited on one party's word, so "who was on that
     * bus and which leg did they pay for" is the question every dispute
     * on this board turns into.
     */
    const tripIds = trips.map((t) => t.id);

    const stopRows: Array<any> = tripIds.length
      ? await this.bookingsRepo.manager.query(
          `SELECT s."trip_id" AS "tripId", s.sequence, s.city, s.address,
                  s.description, s."km_from_origin" AS "kmFromOrigin",
                  s."arrived_at" AS "arrivedAt"
             FROM "trip_stops" s
            WHERE s."trip_id" = ANY($1::uuid[])
            ORDER BY s."trip_id", s.sequence ASC`,
          [tripIds],
        ).catch(() => [])
      : [];

    const seatRows: Array<any> = tripIds.length
      ? await this.bookingsRepo.manager.query(
          `SELECT sb."trip_id" AS "tripId", sb.id, sb.status,
                  sb."price_ngn"      AS "priceNgn",
                  sb."segment_km"     AS "segmentKm",
                  sb."board_sequence" AS "boardSequence",
                  sb."alight_sequence" AS "alightSequence",
                  bs.city AS "boardCity", als.city AS "alightCity",
                  pu.id AS "passengerUserId", pu.name AS "passengerName",
                  pu."accountId" AS "passengerAccountId", pu.phone AS "passengerPhone"
             FROM "seat_bookings" sb
             LEFT JOIN "trip_stops" bs  ON bs.id  = sb."board_stop_id"
             LEFT JOIN "trip_stops" als ON als.id = sb."alight_stop_id"
             LEFT JOIN "users" pu ON pu.id = sb."passenger_id"
            WHERE sb."trip_id" = ANY($1::uuid[])
            ORDER BY sb."trip_id", sb."board_sequence" ASC`,
          [tripIds],
        ).catch(() => [])
      : [];

    const stopsByTrip = new Map<string, any[]>();
    for (const r of stopRows) {
      const list = stopsByTrip.get(r.tripId) ?? [];
      list.push({
        sequence:     Number(r.sequence ?? 0),
        city:         r.city,
        address:      r.address,
        description:  r.description ?? null,
        kmFromOrigin: r.kmFromOrigin == null ? null : Number(r.kmFromOrigin),
        arrivedAt:    r.arrivedAt ?? null,
      });
      stopsByTrip.set(r.tripId, list);
    }

    const seatsByTrip = new Map<string, any[]>();
    for (const r of seatRows) {
      const list = seatsByTrip.get(r.tripId) ?? [];
      list.push({
        id:                 r.id,
        status:             r.status,
        priceNgn:           r.priceNgn == null ? null : Number(r.priceNgn),
        segmentKm:          r.segmentKm == null ? null : Number(r.segmentKm),
        boardSequence:      r.boardSequence == null ? null : Number(r.boardSequence),
        alightSequence:     r.alightSequence == null ? null : Number(r.alightSequence),
        boardCity:          r.boardCity ?? null,
        alightCity:         r.alightCity ?? null,
        passengerUserId:    r.passengerUserId ?? null,
        passengerName:      r.passengerName ?? null,
        passengerAccountId: r.passengerAccountId ?? null,
        passengerPhone:     r.passengerPhone ?? null,
      });
      seatsByTrip.set(r.tripId, list);
    }

    return trips.map((t) => ({
      ...t,
      routeKm:      t.routeKm == null ? null : Number(t.routeKm),
      stopCount:    Number(t.stopCount ?? 0),
      seatBookings: Number(t.seatBookings ?? 0),
      /** The actual route, in order, instead of how many of them there are. */
      stops:        stopsByTrip.get(t.id) ?? [],
      /** Who is on this trip and which leg each of them paid for. */
      seats:        seatsByTrip.get(t.id) ?? [],
      // A two-city trip that never got stops is an old declaration, and
      // its seats are still priced on the whole route.
      legacyTwoCity: Number(t.stopCount ?? 0) < 2,
    }));
  }

  /** Every seat booking, newest first, filterable by status. */
  async adminBookings(status?: string, limit = 100) {
    const rows: Array<any> = await this.bookingsRepo.manager.query(
      `SELECT b.id, b.status, b.seats, b."segment_km" AS "segmentKm",
              b."price_ngn" AS "priceNgn", b."refund_ngn" AS "refundNgn",
              b."requested_at" AS "requestedAt", b."paid_at" AS "paidAt",
              b."trip_id" AS "tripId",
              t."fromCity", t."toCity", t."departAt",
              p.id AS "passengerUserId", p.name AS "passengerName",
              du.id AS "driverUserId", du.name AS "driverName",
              bs.city AS "boardCity", als.city AS "alightCity"
         FROM "seat_bookings" b
         LEFT JOIN "driver_trips" t ON t.id = b."trip_id"
         LEFT JOIN "drivers" d ON d.id = t."driverId"
         LEFT JOIN "users" du ON du.id = d."userId"
         LEFT JOIN "users" p ON p.id = b."passenger_id"
         LEFT JOIN "trip_stops" bs ON bs.id = b."board_stop_id"
         LEFT JOIN "trip_stops" als ON als.id = b."alight_stop_id"
        WHERE ($1::text IS NULL OR b.status = $1::text)
        ORDER BY b."requested_at" DESC
        LIMIT $2`,
      [status ?? null, limit],
    ).catch(() => []);
    return rows.map((r) => ({
      ...r,
      segmentKm: r.segmentKm == null ? null : Number(r.segmentKm),
      priceNgn:  r.priceNgn  == null ? null : Number(r.priceNgn),
      refundNgn: r.refundNgn == null ? null : Number(r.refundNgn),
    }));
  }

  /**
   * Forfeited fares, each with its evidence trail attached.
   *
   * A forfeited fare will be disputed, and a passenger who genuinely was
   * there and got left will say so. Support opening this needs the wait,
   * the rider's position and every attempt to reach them in one place,
   * or it is one person's word against another.
   */
  async adminNoShows(limit = 50) {
    const rows: Array<any> = await this.bookingsRepo.manager.query(
      `SELECT b.id, b."price_ngn" AS "priceNgn", b."contact_attempts" AS "contactAttempts",
              b."arrived_at" AS "arrivedAt", b."no_show_deadline_at" AS "noShowDeadlineAt",
              b."no_show_at" AS "noShowAt",
              b."arrived_lat" AS "arrivedLat", b."arrived_lng" AS "arrivedLng",
              b."departed_lat" AS "departedLat", b."departed_lng" AS "departedLng",
              t."fromCity", t."toCity", t."departAt",
              p.id AS "passengerUserId", p.name AS "passengerName",
              du.id AS "driverUserId", du.name AS "driverName",
              bs.city AS "boardCity", bs.address AS "boardAddress"
         FROM "seat_bookings" b
         LEFT JOIN "driver_trips" t ON t.id = b."trip_id"
         LEFT JOIN "drivers" d ON d.id = t."driverId"
         LEFT JOIN "users" du ON du.id = d."userId"
         LEFT JOIN "users" p ON p.id = b."passenger_id"
         LEFT JOIN "trip_stops" bs ON bs.id = b."board_stop_id"
        WHERE b.status = 'no_show'
        ORDER BY b."no_show_at" DESC
        LIMIT $1`,
      [limit],
    ).catch(() => []);

    const withTrail = [];
    for (const r of rows) {
      const events: Array<any> = await this.bookingsRepo.manager.query(
        `SELECT type, "actor_role" AS "actorRole", lat, lng, note, "created_at" AS "createdAt"
           FROM "seat_booking_events" WHERE "booking_id" = $1 ORDER BY "created_at" ASC`,
        [r.id],
      ).catch(() => []);
      withTrail.push({
        ...r,
        priceNgn: r.priceNgn == null ? null : Number(r.priceNgn),
        waitedMinutes: r.arrivedAt && r.noShowAt
          ? Math.round((new Date(r.noShowAt).getTime() - new Date(r.arrivedAt).getTime()) / 60_000)
          : null,
        evidence: events,
      });
    }
    return withTrail;
  }

  /**
   * Accepted but unpaid, with how long is left on the hold.
   *
   * These are the seats a rider has agreed to carry and nobody has paid
   * for. They do not block capacity by design, so this is the only place
   * an operator can see a rider being messed about.
   */
  async adminPendingPayments(limit = 50) {
    const rows: Array<any> = await this.bookingsRepo.manager.query(
      `SELECT b.id, b.status, b."price_ngn" AS "priceNgn",
              b."accepted_at" AS "acceptedAt", b."payment_due_at" AS "paymentDueAt",
              t."fromCity", t."toCity", t."departAt",
              p.id AS "passengerUserId", p.name AS "passengerName",
              du.id AS "driverUserId", du.name AS "driverName"
         FROM "seat_bookings" b
         LEFT JOIN "driver_trips" t ON t.id = b."trip_id"
         LEFT JOIN "drivers" d ON d.id = t."driverId"
         LEFT JOIN "users" du ON du.id = d."userId"
         LEFT JOIN "users" p ON p.id = b."passenger_id"
        WHERE b.status = ANY(ARRAY['requested','accepted','pending_payment'])
        ORDER BY b."accepted_at" DESC NULLS LAST
        LIMIT $1`,
      [limit],
    ).catch(() => []);
    const now = Date.now();
    return rows.map((r) => ({
      ...r,
      priceNgn: r.priceNgn == null ? null : Number(r.priceNgn),
      minutesLeft: r.paymentDueAt
        ? Math.round((new Date(r.paymentDueAt).getTime() - now) / 60_000)
        : null,
    }));
  }

  /**
   * Every parcel negotiation, with what BOTH sides actually said.
   *
   * WHY THIS EXISTS. Until 2026-09-04 the five admin routes above were all
   * passenger-side, so the entire parcel marketplace was invisible to
   * support. parcel_requests already stored the sender's instructions, the
   * rider's counter-note, the decline reason, both prices and both distances,
   * and the alternative drop-off a rider offered. Every field was written and
   * none of it was ever rendered, so when a trader and a rider disagreed
   * about what had been offered, there was no record anyone could open. The
   * founder asked for exactly this: the input detail and the comments of all
   * parties, in one place.
   *
   * Contact details are deliberately NOT selected. Both users come back as id
   * and name only, and an operator who needs to ring someone opens the user.
   * Widening a support query into a personal-data query is how the seven
   * admin endpoints ended up shipping bank details nothing rendered.
   */
  async adminParcelRequests(status?: string, limit = 100) {
    const rows: Array<any> = await this.ds.query(
      `SELECT pr.id, pr.status, pr."weightKg", pr."categoryCode",
              pr."packageDescription", pr."declaredValueNgn",
              pr."pickupAddress", pr."dropoffAddress",
              pr."senderInstructions",
              pr."quotedNgn", pr."quotedKm",
              pr."counterQuotedNgn", pr."counterQuotedKm",
              pr."counterDropAddress", pr."counterNote",
              pr."declineReason",
              pr."counteredAt", pr."answeredAt", pr."expiresAt", pr."createdAt",
              pr."deliveryId",
              s.id AS "senderUserId", s.name AS "senderName",
              t.id AS "tripId", t."fromCity", t."toCity", t."departAt",
              du.id AS "driverUserId", du.name AS "driverName",
              d."vehicleType", d."vehiclePlate"
         FROM "parcel_requests" pr
         LEFT JOIN "users" s ON s.id = pr."senderUserId"
         LEFT JOIN "driver_trips" t ON t.id = pr."tripId"
         LEFT JOIN "drivers" d ON d.id = t."driverId"
         LEFT JOIN "users" du ON du.id = d."userId"
        WHERE ($1::text IS NULL OR pr.status = $1::text)
        ORDER BY pr."createdAt" DESC
        LIMIT $2`,
      [status ?? null, limit],
    ).catch((e: any) => {
      // NOT a silent []. A swallowed catch here is what hid the driver
      // statement being broken for weeks: a mistyped column looks exactly
      // like an empty queue, and an empty queue looks like good news.
      this.logger.error(`adminParcelRequests query failed: ${e?.message ?? e}`);
      return [] as any[];
    });

    const num = (v: any) => (v == null ? null : Number(v));
    return rows.map((r) => ({
      ...r,
      weightKg:         num(r.weightKg),
      declaredValueNgn: num(r.declaredValueNgn),
      quotedNgn:        num(r.quotedNgn),
      quotedKm:         num(r.quotedKm),
      counterQuotedNgn: num(r.counterQuotedNgn),
      counterQuotedKm:  num(r.counterQuotedKm),
      /** Did the rider move the price, the drop, or both? Saves the operator
       *  comparing two columns on every row to spot the ones in dispute. */
      wasCountered: Boolean(r.counteredAt),
      priceMovedNgn:
        r.counterQuotedNgn == null || r.quotedNgn == null
          ? null
          : Number(r.counterQuotedNgn) - Number(r.quotedNgn),
      dropMoved: Boolean(r.counterDropAddress),
    }));
  }

  async dropReviewQueue(limit = 50) {
    const graceMin = await this.fee(FEE.NO_SHOW_WAIT_MIN);
    const rows = await this.bookingsRepo
      .createQueryBuilder('b')
      .where('b.status = :dropped', { dropped: SeatBookingStatus.DROPPED })
      .andWhere('b.dropConfirmedAt IS NULL')
      .andWhere(
        '(b.dropDisputedAt IS NOT NULL OR b.dropOffGeofence = true OR b.droppedAt < :cutoff)',
        { cutoff: new Date(Date.now() - Math.max(1, graceMin) * 60_000) },
      )
      .orderBy('b.droppedAt', 'DESC')
      .take(Math.min(200, Math.max(1, limit)))
      .getMany();

    return rows.map((b) => ({
      id: b.id,
      tripId: b.tripId,
      passengerId: b.passengerId,
      seats: b.seats,
      droppedAt: b.droppedAt,
      dropDistanceM: b.dropDistanceM === null ? null : Number(b.dropDistanceM),
      dropOffGeofence: b.dropOffGeofence,
      dropDisputedAt: b.dropDisputedAt,
      reason: b.dropReviewReason,
      priceNgn: kobo(Number(b.priceNgn)),
    }));
  }

  // ── Passenger cancellation ───────────────────────────────────────────

  /**
   * The passenger pulls out.
   *
   * Before payment there is nothing to settle. After payment the
   * published policy applies: outside the free window the fare comes
   * back less the card processing already sunk, which is the same rule
   * every other cancelled booking on the platform follows, and inside it
   * only the admin-set share returns. Both numbers are Fee Catalogue
   * rows so the published policy can move without a deploy.
   */
  async cancelByPassenger(passengerUserId: string, bookingId: string, body: { reason?: string } = {}) {
    const booking = await this.loadBooking(bookingId);
    this.assertPassenger(booking, passengerUserId);

    if ([SeatBookingStatus.CANCELLED, SeatBookingStatus.DROPPED, SeatBookingStatus.NO_SHOW].includes(booking.status)) {
      throw new BadRequestException('That booking is already closed.');
    }
    if (booking.status === SeatBookingStatus.BOARDED) {
      throw new BadRequestException('You are marked aboard. Speak to the driver, or raise it with support.');
    }

    const trip: any = await this.loadTrip(booking.tripId);
    const reason = (body.reason ?? '').trim().slice(0, 200) || 'The passenger cancelled.';
    const now = new Date();

    let refund = 0;
    if (booking.paidAt) {
      const freeHours = await this.fee(FEE.FREE_CANCEL_HOURS);
      const hoursToDeparture = (new Date(trip.departAt).getTime() - now.getTime()) / 3_600_000;
      const paid = kobo(Number(booking.priceNgn));
      /**
       * A cancelled seat is refunded less what the card cost us.
       *
       * The late window used to return a flat percentage that defaulted
       * to zero, mirroring the no-show rule. The founder rejected that
       * (2026-08-28): "they get a refund minus the Flutterwave fee."
       *
       * That is the fairer rule and the cheaper one to run. A passenger
       * who tells us in advance leaves a seat we can still sell, which
       * is nothing like a no-show, where the vehicle waited and then
       * carried the space empty. Keeping their whole fare for the
       * courtesy of warning us is how a platform teaches people to go
       * quiet instead.
       *
       * SEIRS does not profit from the cancellation either way. What is
       * withheld is the processing already spent and not recoverable
       * from the provider, which is a real cost, not a penalty. Both
       * windows now use the same catalogue row, so there is one number
       * an admin can see and set rather than two that can drift apart.
       * Inside the free window it can still be tightened separately.
       */
      const processingPct = Math.max(0, Math.min(100, await this.fee(FEE.CANCEL_PROCESSING_PCT)));
      if (hoursToDeparture > freeHours) {
        refund = kobo(paid * (1 - processingPct / 100));
      } else {
        /**
         * A configured 0 means ZERO, not "unset" (audit, 2026-08-28).
         *
         * The guard was `latePct > 0 ? latePct/100 : 1`, so setting this
         * row to 0 fell through to a share of 1 and returned the
         * passenger their WHOLE fare. An admin lowering the number to
         * zero to stop refunding late cancellations would have started
         * refunding all of them, and the catalogue's own description
         * tells them to lower it here rather than in code.
         *
         * Only a missing or unreadable value falls back now, and it
         * falls back to a full refund, matching the policy.
         */
        const latePct = await this.fee(FEE.LATE_CANCEL_REFUND_PCT);
        const lateShare = Number.isFinite(latePct)
          ? Math.max(0, Math.min(100, latePct)) / 100
          : 1;
        refund = kobo(paid * lateShare * (1 - processingPct / 100));
      }
    }

    await this.bookingsRepo.update(booking.id, {
      status:             SeatBookingStatus.CANCELLED,
      cancelledAt:        now,
      cancellationReason: reason,
      refundNgn:          refund,
    } as any);
    await this.record(booking.id, 'cancelled', 'passenger', passengerUserId, {
      note: reason,
      meta: { refundNgn: refund, paidNgn: kobo(Number(booking.priceNgn)), departAt: trip.departAt },
    });

    if (booking.deliveryId) {
      const paid = kobo(Number(booking.priceNgn));
      await this.deliveriesRepo.update(booking.deliveryId, {
        cancelledAt:        now,
        cancellationFeeNgn: kobo(paid - refund),
        cancellationReason: reason,
      } as any).catch(() => {});
      await this.setDeliveryStatus(booking.deliveryId, DeliveryStatus.CANCELLED);
      if (booking.paidAt && refund > 0) {
        try {
          await this.paymentsServiceRef?.refundEscrow?.(booking.deliveryId, booking.passengerId, kobo(paid - refund));
        } catch (e: any) {
          this.logger.error(`seat booking ${booking.id} cancelled but refund failed: ${e?.message ?? e}`);
        }
      }
    }

    this.push(trip.driver?.user?.id, 'A passenger cancelled',
      `${booking.seats} seat${booking.seats === 1 ? '' : 's'} came free on your trip. That stretch is back on sale.`,
      NotificationType.STATUS_UPDATE);

    return { ok: true, refundNgn: refund };
  }

  // ── Reads ────────────────────────────────────────────────────────────

  private async loadPassengerRow(userId: string) {
    const rows = await this.ds.query(
      `SELECT "id", "name", "firstName", "profilePhoto", "phone" FROM "users" WHERE "id" = $1`,
      [userId],
    );
    return rows?.[0] ?? null;
  }

  private viewForPassenger(booking: SeatBooking, trip: any, board: TripStop, alight: TripStop) {
    return {
      id: booking.id,
      tripId: booking.tripId,
      status: booking.status,
      seats: booking.seats,
      segmentKm: Number(booking.segmentKm),
      priceNgn: kobo(Number(booking.priceNgn)),
      luggage: booking.luggage,
      passengerNote: booking.passengerNote,
      driverNote: booking.driverNote,
      board:  { id: booking.boardStopId,  city: board?.city  ?? null, address: board?.address  ?? null, sequence: booking.boardSequence },
      alight: { id: booking.alightStopId, city: alight?.city ?? null, address: alight?.address ?? null, sequence: booking.alightSequence },
      requestedAt: booking.requestedAt,
      acceptedAt: booking.acceptedAt,
      paymentDueAt: booking.paymentDueAt,
      paidAt: booking.paidAt,
      arrivedAt: booking.arrivedAt,
      noShowDeadlineAt: booking.noShowDeadlineAt,
      deliveryId: booking.deliveryId,
      // Whitelisted, never the raw driver row: that row carries bank
      // details, home address and every KYC document URL.
      driver: {
        name:   trip?.driver?.user?.name ?? 'Driver',
        rating: trip?.driver?.rating ?? null,
        ...vehicleIdentityForPassenger(trip?.driver),
      },
    };
  }

  /** One booking, as either side of it may see it. */
  async detail(bookingId: string, actorUserId?: string) {
    const booking = await this.loadBooking(bookingId);
    const trip: any = await this.loadTrip(booking.tripId);
    const isPassenger = actorUserId ? booking.passengerId === actorUserId : true;
    const isDriver    = actorUserId ? trip?.driver?.user?.id === actorUserId : false;
    if (actorUserId && !isPassenger && !isDriver) {
      throw new ForbiddenException('That booking is not yours.');
    }

    const board  = await this.stopsRepo.findOne({ where: { id: booking.boardStopId } as any });
    const alight = await this.stopsRepo.findOne({ where: { id: booking.alightStopId } as any });
    const view: any = this.viewForPassenger(booking, trip, board as TripStop, alight as TripStop);

    if (isDriver) {
      view.passenger = passengerIdentityForDriver(await this.loadPassengerRow(booking.passengerId));
      view.driverEarningsNgn = kobo(Number(booking.driverEarningsNgn));
      view.contactAttempts = booking.contactAttempts;
    }
    return view;
  }

  /** Every request and booking on a trip, for the driver who owns it. */
  async listForDriver(driverUserId: string, tripId: string) {
    await this.assertTripDriver(tripId, driverUserId);
    const rows = await this.bookingsRepo.find({
      where: { tripId } as any,
      order: { createdAt: 'DESC' },
      take: 200,
    });
    const stops = await this.stopsRepo.find({ where: { tripId } as any, order: { sequence: 'ASC' } });
    const byId = new Map(stops.map((s) => [s.id, s]));
    const out: any[] = [];
    for (const b of rows) {
      out.push({
        id: b.id,
        status: b.status,
        seats: b.seats,
        segmentKm: Number(b.segmentKm),
        priceNgn: kobo(Number(b.priceNgn)),
        driverEarningsNgn: kobo(Number(b.driverEarningsNgn)),
        luggage: b.luggage,
        passengerNote: b.passengerNote,
        board:  { id: b.boardStopId,  city: byId.get(b.boardStopId)?.city ?? null,  sequence: b.boardSequence },
        alight: { id: b.alightStopId, city: byId.get(b.alightStopId)?.city ?? null, sequence: b.alightSequence },
        requestedAt: b.requestedAt,
        acceptedAt: b.acceptedAt,
        paidAt: b.paidAt,
        arrivedAt: b.arrivedAt,
        noShowDeadlineAt: b.noShowDeadlineAt,
        contactAttempts: b.contactAttempts,
        deliveryId: b.deliveryId,
        passenger: passengerIdentityForDriver(await this.loadPassengerRow(b.passengerId)),
      });
    }
    return out;
  }

  /** A passenger's own bookings. */
  async listForPassenger(passengerUserId: string) {
    const rows = await this.bookingsRepo.find({
      where: { passengerId: passengerUserId } as any,
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const out: any[] = [];
    for (const b of rows) {
      const trip: any = await this.loadTrip(b.tripId).catch(() => null);
      const board  = await this.stopsRepo.findOne({ where: { id: b.boardStopId } as any });
      const alight = await this.stopsRepo.findOne({ where: { id: b.alightStopId } as any });
      out.push(this.viewForPassenger(b, trip, board as TripStop, alight as TripStop));
    }
    return out;
  }

  /** The evidence trail, for the two parties and for support. */
  async evidence(bookingId: string, actorUserId: string) {
    const booking = await this.loadBooking(bookingId);
    const trip: any = await this.loadTrip(booking.tripId);
    if (booking.passengerId !== actorUserId && trip?.driver?.user?.id !== actorUserId) {
      throw new ForbiddenException('That booking is not yours.');
    }
    const rows = await this.eventsRepo.find({
      where: { bookingId } as any,
      order: { createdAt: 'ASC' },
      take: 200,
    });
    return rows.map((e) => ({
      type: e.type, actorRole: e.actorRole, at: e.createdAt,
      lat: e.lat === null ? null : Number(e.lat),
      lng: e.lng === null ? null : Number(e.lng),
      note: e.note, meta: e.meta,
    }));
  }

  /**
   * What a segment would cost, before anyone commits to anything.
   *
   * Priced off the stretch between the two stops, so the Osogbo
   * passenger sees the Osogbo fare rather than the Abuja one.
   */
  async quoteSegment(tripId: string, boardStopId: string, alightStopId: string, seats: number, luggage?: string) {
    const trip: any = await this.loadTrip(tripId);
    const board  = await this.stopsRepo.findOne({ where: { id: boardStopId, tripId } as any });
    const alight = await this.stopsRepo.findOne({ where: { id: alightStopId, tripId } as any });
    if (!board || !alight) throw new BadRequestException('Those stops are not on this trip.');
    if (alight.sequence <= board.sequence) {
      throw new BadRequestException('Your drop-off has to be further along the route than where you board.');
    }
    const n = Math.max(1, Math.round(Number(seats) || 1));
    const segmentKm = kobo(Number(alight.kmFromOrigin) - Number(board.kmFromOrigin));
    const quote = await this.priceSegment(trip, segmentKm, n, luggage);
    const free = await this.seatsFreeAcross(trip, board.sequence, alight.sequence);
    return {
      tripId, seats: n, segmentKm,
      fromCity: board.city, toCity: alight.city,
      totalNgn: quote.totalNgn,
      ratePerSeatKm: quote.ratePerSeatKm,
      minimumAppliedNgn: quote.minimumApplied,
      seatsLeftOnSegment: free,
      // Whole-route km, purely so a passenger can see what they are NOT
      // being charged for any more.
      tripRouteKm: trip.routeKm != null ? Number(trip.routeKm) : null,
    };
  }
}
