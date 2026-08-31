import {
  BadRequestException, ForbiddenException, Inject, Injectable, Logger,
  NotFoundException, Optional, forwardRef,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository, In } from 'typeorm';
import { ParcelRequest, ParcelRequestStatus } from './parcel-request.entity';
import { User } from '../users/user.entity';
import { FeesService } from '../fees/fees.service';
import { DriversService } from '../drivers/drivers.service';
import { DeliveriesService } from '../deliveries/deliveries.service';
// Two classes share the name. The deliveries one carries the static
// haversineKm; the pricing-module one is the fare engine. Same split
// travel-buddy.service.ts already uses.
import { PricingService } from '../deliveries/pricing.service';
import { PricingService as RateCardPricing } from '../pricing/pricing.service';

/**
 * Agree first, pay second.
 *
 * The founder, 2026-08-31: "thats why this is important to be done
 * before they pay, because once they pay then its irreversible with
 * deductions, like charges from bank etc". A Flutterwave refund is a
 * second transaction with its own cost and delay, not a reversal, so
 * charging for a job a rider has not agreed to means paying to undo
 * something that should never have happened.
 *
 * Seat bookings have worked this way since Travel Buddy shipped. The
 * parcel posting built earlier the same day did not, and this is the
 * correction.
 */
@Injectable()
export class ParcelRequestsService {
  private readonly logger = new Logger(ParcelRequestsService.name);

  constructor(
    @InjectRepository(ParcelRequest) private readonly repo: Repository<ParcelRequest>,
    @InjectRepository(User)          private readonly usersRepo: Repository<User>,
    private readonly fees: FeesService,
    private readonly rateCard: RateCardPricing,
    @Optional() @Inject(forwardRef(() => DriversService))
    private readonly drivers?: DriversService,
    @Optional() @Inject(forwardRef(() => DeliveriesService))
    private readonly deliveries?: DeliveriesService,
  ) {}

  /** Hours an unanswered request waits before releasing the sender. */
  private expiryHours() {
    return this.fees.getValueOr('parcel_request_expiry_hours', 12).catch(() => 12);
  }

  /**
   * How many live requests one sender may hold at once.
   *
   * A request costs the sender nothing, which is the point, and is
   * exactly why this cap exists: without it one person can fire a
   * request at every rider on a corridor and the driver's attention,
   * which is the scarce thing in this design, fills with noise. Riders
   * who stop reading their inbox are the failure this prevents.
   */
  private maxOpen() {
    return this.fees.getValueOr('parcel_request_max_open', 3).catch(() => 3);
  }

  private openStatuses(): ParcelRequestStatus[] {
    return [ParcelRequestStatus.REQUESTED, ParcelRequestStatus.COUNTERED];
  }

  /** The rider whose trip this is, or null when it cannot be resolved. */
  private async tripDriverUserId(tripId: string): Promise<string | null> {
    const rows = await this.repo.manager.query(
      `SELECT u."id" AS "userId"
         FROM "driver_trips" t
         JOIN "drivers" d ON d."id" = t."driverId"
         JOIN "users"   u ON u."id" = d."userId"
        WHERE t."id" = $1`,
      [tripId],
    );
    return rows?.[0]?.userId ?? null;
  }

  private async priceFor(input: {
    vehicleType: string; km: number; weightKg: number; categoryCode?: string | null;
    pickup: { latitude: number; longitude: number };
    dropoff: { latitude: number; longitude: number };
  }) {
    const b: any = await this.rateCard.computePrice({
      vehicleType:  input.vehicleType,
      categoryCode: input.categoryCode || 'standard_parcel',
      km:           input.km,
      stopCount:    1,
      weightKg:     input.weightKg,
      estimatedDwellMinutes: 0,
      pickupCoords:  input.pickup,
      dropoffCoords: input.dropoff,
    } as any);
    return {
      ngn: Number(b?.customer?.total ?? 0),
      km:  Number(input.km),
    };
  }

  // ── Sender asks ──────────────────────────────────────────────────────

  async createRequest(senderUserId: string, tripId: string, body: {
    pickupAddress: string; pickupLat: number; pickupLng: number;
    dropoffAddress: string; dropoffLat: number; dropoffLng: number;
    weightKg?: number; categoryCode?: string; packageDescription?: string;
    declaredValueNgn?: number; preferredStoreId?: string; senderInstructions?: string;
  }) {
    if (!this.drivers?.getTripForParcel) {
      throw new BadRequestException('Trip requests are unavailable right now.');
    }
    const weight = Number(body.weightKg ?? 0);
    const trip: any = await this.drivers.getTripForParcel(tripId, weight);

    const driverUserId = trip.driver?.user?.id ?? null;
    if (driverUserId && driverUserId === senderUserId) {
      throw new BadRequestException('You cannot send a parcel to yourself on your own trip.');
    }

    /**
     * One live request per sender per trip. Asking the same rider twice
     * for the same load is not a second question, it is the same one
     * shouted louder, and they still only owe one answer.
     */
    const already = await this.repo.findOne({
      where: { tripId, senderUserId, status: In(this.openStatuses()) },
    });
    if (already) {
      throw new BadRequestException('You already have a request waiting with this driver.');
    }

    const [cap, hours] = await Promise.all([this.maxOpen(), this.expiryHours()]);
    const openCount = await this.repo.count({
      where: { senderUserId, status: In(this.openStatuses()) },
    });
    if (openCount >= Number(cap)) {
      throw new BadRequestException(
        `You have ${openCount} requests still waiting for an answer. ` +
        `Withdraw one before asking another driver.`,
      );
    }

    const km = PricingService.haversineKm(
      Number(body.pickupLat), Number(body.pickupLng),
      Number(body.dropoffLat), Number(body.dropoffLng),
    );
    const quote = await this.priceFor({
      vehicleType:  trip.driver?.vehicleType ?? 'motorcycle',
      km,
      weightKg:     weight,
      categoryCode: body.categoryCode,
      pickup:  { latitude: Number(body.pickupLat),  longitude: Number(body.pickupLng) },
      dropoff: { latitude: Number(body.dropoffLat), longitude: Number(body.dropoffLng) },
    }).catch(() => ({ ngn: 0, km }));

    const saved = await this.repo.save(this.repo.create({
      tripId,
      senderUserId,
      status: ParcelRequestStatus.REQUESTED,
      pickupAddress:  String(body.pickupAddress),
      pickupLat:      Number(body.pickupLat),
      pickupLng:      Number(body.pickupLng),
      dropoffAddress: String(body.dropoffAddress),
      dropoffLat:     Number(body.dropoffLat),
      dropoffLng:     Number(body.dropoffLng),
      weightKg:       weight,
      categoryCode:   body.categoryCode ?? null,
      packageDescription: body.packageDescription ?? null,
      declaredValueNgn:   body.declaredValueNgn ?? null,
      preferredStoreId:   body.preferredStoreId ?? null,
      senderInstructions: (body.senderInstructions ?? '').slice(0, 500) || null,
      quotedNgn: quote.ngn || null,
      quotedKm:  Math.round(quote.km * 10) / 10,
      expiresAt: new Date(Date.now() + Number(hours) * 60 * 60 * 1000),
    }));

    this.logger.log(
      `PARCEL_REQUEST created ${saved.id} trip=${tripId} sender=${senderUserId} ` +
      `km=${saved.quotedKm} quoted=${saved.quotedNgn ?? 'none'}`,
    );
    return saved;
  }

  /** The sender changes their mind before anybody is bound to anything. */
  async withdraw(senderUserId: string, requestId: string) {
    const r = await this.mine(senderUserId, requestId);
    if (!this.openStatuses().includes(r.status)) {
      throw new BadRequestException('That request has already been answered.');
    }
    r.status = ParcelRequestStatus.WITHDRAWN;
    r.answeredAt = new Date();
    await this.repo.save(r);
    return { ok: true as const };
  }

  // ── Driver answers ───────────────────────────────────────────────────

  async decline(driverUserId: string, requestId: string, reason?: string) {
    const r = await this.forDriver(driverUserId, requestId);
    if (r.status !== ParcelRequestStatus.REQUESTED) {
      throw new BadRequestException('That request is not waiting on you.');
    }
    r.status = ParcelRequestStatus.DECLINED;
    r.declineReason = (reason ?? '').slice(0, 200) || null;
    r.answeredAt = new Date();
    await this.repo.save(r);
    // Nothing to refund: this is exactly why the money had not moved.
    this.logger.log(`PARCEL_REQUEST declined ${r.id} by ${driverUserId}`);
    return { ok: true as const };
  }

  /**
   * "I cannot reach that spot, but I pass this one."
   *
   * The piece seats never had, and the thing that makes this a
   * marketplace rather than a targeted offer. Moving the drop changes
   * the distance, so it re-quotes: a counter holding the original price
   * would be quoting a journey nobody is making, and the sender has to
   * agree to the number they will actually be charged.
   */
  async counter(driverUserId: string, requestId: string, body: {
    dropAddress: string; dropLat: number; dropLng: number; note?: string;
  }) {
    const r = await this.forDriver(driverUserId, requestId);
    if (r.status !== ParcelRequestStatus.REQUESTED) {
      throw new BadRequestException('That request is not waiting on you.');
    }
    if (!body?.dropAddress || body.dropLat == null || body.dropLng == null) {
      throw new BadRequestException('A counter needs a real drop-off point with coordinates.');
    }

    const trip: any = await this.drivers?.getTripForParcel(r.tripId, Number(r.weightKg ?? 0));
    const km = PricingService.haversineKm(
      Number(r.pickupLat), Number(r.pickupLng),
      Number(body.dropLat), Number(body.dropLng),
    );
    const quote = await this.priceFor({
      vehicleType:  trip?.driver?.vehicleType ?? 'motorcycle',
      km,
      weightKg:     Number(r.weightKg ?? 0),
      categoryCode: r.categoryCode,
      pickup:  { latitude: Number(r.pickupLat), longitude: Number(r.pickupLng) },
      dropoff: { latitude: Number(body.dropLat), longitude: Number(body.dropLng) },
    }).catch(() => ({ ngn: 0, km }));

    r.status             = ParcelRequestStatus.COUNTERED;
    r.counterDropAddress = String(body.dropAddress);
    r.counterDropLat     = Number(body.dropLat);
    r.counterDropLng     = Number(body.dropLng);
    r.counterNote        = (body.note ?? '').slice(0, 300) || null;
    r.counterQuotedNgn   = quote.ngn || null;
    r.counterQuotedKm    = Math.round(quote.km * 10) / 10;
    r.counteredAt        = new Date();
    await this.repo.save(r);

    this.logger.log(
      `PARCEL_REQUEST countered ${r.id} by ${driverUserId} ` +
      `newKm=${r.counterQuotedKm} newQuote=${r.counterQuotedNgn ?? 'none'}`,
    );
    return r;
  }

  /** Driver takes it on the sender's own terms. */
  async accept(driverUserId: string, requestId: string) {
    const r = await this.forDriver(driverUserId, requestId);
    if (r.status !== ParcelRequestStatus.REQUESTED) {
      throw new BadRequestException('That request is not waiting on you.');
    }
    return this.seal(r, {
      address: r.dropoffAddress, lat: Number(r.dropoffLat), lng: Number(r.dropoffLng),
    }, 'driver');
  }

  /** Sender takes the driver's alternative. */
  async acceptCounter(senderUserId: string, requestId: string) {
    const r = await this.mine(senderUserId, requestId);
    if (r.status !== ParcelRequestStatus.COUNTERED) {
      throw new BadRequestException('There is no counter-offer to accept on that request.');
    }
    return this.seal(r, {
      address: String(r.counterDropAddress),
      lat: Number(r.counterDropLat),
      lng: Number(r.counterDropLng),
    }, 'sender');
  }

  /**
   * Both sides have agreed. Create the booking and hand the sender to
   * payment.
   *
   * The Delivery is built through the ordinary create path with the trip
   * attached, so it is priced, validated and dispatched by exactly the
   * same code as every other booking. Nothing about having been
   * negotiated makes it a different kind of job.
   */
  private async seal(
    r: ParcelRequest,
    drop: { address: string; lat: number; lng: number },
    sealedBy: 'driver' | 'sender',
  ) {
    if (!this.deliveries?.create) {
      throw new BadRequestException('Booking is unavailable right now.');
    }
    const sender = await this.usersRepo.findOne({ where: { id: r.senderUserId } });
    if (!sender) throw new NotFoundException('Sender account not found.');

    const delivery = await this.deliveries.create({
      pickupAddress:  r.pickupAddress,
      pickupLat:      Number(r.pickupLat),
      pickupLng:      Number(r.pickupLng),
      dropoffAddress: drop.address,
      dropoffLat:     drop.lat,
      dropoffLng:     drop.lng,
      weightKg:       Number(r.weightKg ?? 0),
      packageCategory: r.categoryCode ?? undefined,
      packageDescription: r.packageDescription ?? undefined,
      declaredValueNgn:   r.declaredValueNgn ?? undefined,
      deliveryInstructions: r.senderInstructions ?? undefined,
      // The trip this was negotiated on. Keeps it private to that rider
      // and out of the open pool.
      tripId: r.tripId,
    } as any, sender);

    r.status     = ParcelRequestStatus.ACCEPTED;
    r.answeredAt = new Date();
    r.deliveryId = (delivery as any).id;
    await this.repo.save(r);

    this.logger.log(
      `PARCEL_REQUEST accepted ${r.id} by ${sealedBy}; delivery=${(delivery as any).id}. ` +
      `Payment now due; nothing was charged before this point.`,
    );
    return { ok: true as const, request: r, delivery };
  }

  // ── Reading ──────────────────────────────────────────────────────────

  /** Everything this sender is waiting on. */
  listMine(senderUserId: string) {
    return this.repo.find({
      where: { senderUserId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  /** The rider's inbox for one of their trips. */
  async listForTrip(driverUserId: string, tripId: string) {
    const owner = await this.tripDriverUserId(tripId);
    if (!owner || owner !== driverUserId) {
      throw new ForbiddenException('That is not your trip.');
    }
    return this.repo.find({
      where: { tripId, status: In(this.openStatuses()) },
      order: { createdAt: 'ASC' },
    });
  }

  private async mine(senderUserId: string, id: string) {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Request not found.');
    if (r.senderUserId !== senderUserId) {
      throw new ForbiddenException('That request belongs to someone else.');
    }
    return r;
  }

  private async forDriver(driverUserId: string, id: string) {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Request not found.');
    const owner = await this.tripDriverUserId(r.tripId);
    if (!owner || owner !== driverUserId) {
      throw new ForbiddenException('That request is on another driver\'s trip.');
    }
    return r;
  }

  /**
   * Release requests nobody answered.
   *
   * A sender holding an unanswered request is a sender not asking
   * somebody else, and the cap above means a stale one is actively
   * costing them a slot.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireStale() {
    try {
      const stale = await this.repo.find({
        where: { status: In(this.openStatuses()), expiresAt: LessThan(new Date()) },
        take: 200,
      });
      if (!stale.length) return;
      for (const r of stale) {
        r.status = ParcelRequestStatus.EXPIRED;
        r.answeredAt = new Date();
      }
      await this.repo.save(stale);
      this.logger.log(`PARCEL_REQUEST expired ${stale.length} unanswered request(s).`);
    } catch (e: any) {
      this.logger.error(`parcel request expiry failed: ${e?.message ?? e}`);
    }
  }
}
