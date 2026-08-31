import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { aVehicle } from '../common/vehicle-labels';
import { TicketTopic } from '../support/support-ticket.entity';
import { SupportService } from '../support/support.service';
import { RoutingService } from '../routing/routing.service';
import { WhatsAppService } from '../notifications/whatsapp.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository, MoreThan, IsNull } from 'typeorm';
import { secureCode } from '../common/utils/auth-codes';
import { Delivery, DeliveryStatus, PackageSize, UrgencyLevel } from './delivery.entity';
import { DeliveryStop, DeliveryStopStatus } from './delivery-stop.entity';
import { DeliveryEvent, DeliveryEventType, EventActorRole } from './delivery-event.entity';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { PricingService } from './pricing.service';
import { RouteDistanceService } from './route-distance.service';
import { PricingService as RateCardPricing } from '../pricing/pricing.service';
import { detectStateFromCoords, getState } from '../pricing/regions';
import { breakdownForCustomer, breakdownForDriver } from './redact-breakdown';
import { User } from '../users/user.entity';
import { redactDriverForCustomer } from '../common/redact-driver';
import { PLATFORM_COMMISSION } from '../common/constants/pricing';

// Vehicle-tuned average speeds for Lagos street conditions (km/h).
// Deliberately conservative: matches lived experience of standstill
// traffic + NEPA + checkpoints so ETA is more likely to under-promise
// and over-deliver than the opposite. Never surfaced as a SLA or a
// refund-if-late guarantee per the no-time-guarantee rule.
const VEHICLE_SPEED_KMH: Record<string, number> = {
  bicycle:     12,
  motorcycle:  25,   // okada, weaves traffic
  tricycle:    15,   // keke marwa
  car:         18,
  van:         15,
  truck_small: 12,
  truck_large:  8,
};

// Compute an "estimated minutes to arrival" for a delivery based on the
// current best-known driver location and the appropriate destination
// (pickup for pre-pickup states, dropoff for in-transit). Free: no
// Google Directions call, uses Haversine + vehicle-tuned speed. Adds
// a fixed traffic buffer at the end. Returns null when we cannot make
// a defensible estimate (no driver assigned, no location fix, terminal
// state).
function computeEtaMinutes(
  delivery: any,
  driverLat: number | null | undefined,
  driverLng: number | null | undefined,
): number | null {
  if (!delivery) return null;
  const terminal = ['delivered', 'cancelled', 'failed'];
  if (terminal.includes(String(delivery.status))) return null;
  if (driverLat == null || driverLng == null) return null;

  // Pick destination based on status. Before pickup, the driver is
  // heading TO the pickup point. After, to the dropoff.
  const isPrePickup = ['pending', 'assigned'].includes(String(delivery.status));
  const destLat = isPrePickup ? delivery.pickupLat  : delivery.dropoffLat;
  const destLng = isPrePickup ? delivery.pickupLng  : delivery.dropoffLng;
  if (destLat == null || destLng == null) return null;

  const distanceKm = PricingService.haversineKm(
    Number(driverLat), Number(driverLng),
    Number(destLat),   Number(destLng),
  );

  const speed = VEHICLE_SPEED_KMH[String(delivery.vehicleType)] ?? 15;
  // 3-minute buffer for stop-and-go + junctions + pedestrian crossings.
  const raw = (distanceKm / speed) * 60 + 3;
  return Math.max(1, Math.round(raw));
}

/**
 * Strip event metadata down to what an anonymous tracker may see
 * (security review 2026-08-12).
 *
 * /deliveries/track/:code takes no auth: the code travels through
 * WhatsApp, gets forwarded, screenshotted, and pasted into groups.
 * Handoff events carried the recipient's typed signature name, so
 * passing meta through verbatim published a named third party to
 * anyone holding the code, with nothing rendering it. The endpoint
 * already refused to return email and phone; meta was the hole in
 * that rule.
 *
 * Proof photos are out too (founder 2026-08-12): their purpose is
 * evidence for admin when a delivery is disputed, not public display.
 * They routinely show somebody's gate or front door, and a forwarded
 * tracking code carries them to whoever ends up holding the link.
 * Admin dispute tooling reads the record directly and is unaffected.
 *
 * Allow-list, not a block-list: a new field added to an event upstream
 * must be consciously opened up rather than silently exposed.
 */
const PUBLIC_EVENT_META_KEYS = new Set([
  'stage',        // which leg of the chain of custody
  'method',       // how identity was confirmed (otp, signature, id)
  'status',       // status transitions
  'vehicleType',
  'reason',       // failure/cancellation reason label
]);

function publicSafeEventMeta(meta: any): Record<string, any> | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const safe: Record<string, any> = {};
  for (const key of Object.keys(meta)) {
    if (PUBLIC_EVENT_META_KEYS.has(key)) safe[key] = meta[key];
  }
  return Object.keys(safe).length > 0 ? safe : null;
}

// Human-readable label for a handoff record surfaced on the tracking
// timeline. The stage values mirror HandoffStage from identity module
// but kept as strings here to avoid a cross-module type import.
function describeHandoffStage(stage: string): string {
  switch (stage) {
    case 'customer_to_store':   return 'Package handed to partner store';
    case 'customer_to_driver':  return 'Rider collected from sender';
    case 'store_to_driver':     return 'Driver picked up from partner';
    case 'driver_to_store':     return 'Driver dropped at partner';
    case 'store_to_recipient':  return 'Recipient collected from partner';
    case 'driver_to_recipient': return 'Handed to recipient';
    default:                    return 'Hand-off recorded';
  }
}


/**
 * The apps send human category strings; the rate card prices by category
 * code. Mapping lives here so both quote and create translate identically,
 * with standard_parcel as the safe default. Rides come through as
 * "ride"/"passenger" from the ride flow.
 */
function toCategoryCode(raw: string | undefined | null): string {
  const t = (raw ?? '').toLowerCase();
  if (/ride|passenger/.test(t))        return 'passenger_ride';
  if (/document|letter|envelope/.test(t)) return 'documents';
  if (/fragile|glass|electronic|laptop|phone/.test(t)) return 'fragile';
  if (/hot food|food/.test(t))         return 'food_hot';
  if (/frozen|cold/.test(t))           return 'food_cold';
  if (/medic|pharma|drug/.test(t))     return 'medical';
  if (/farm|produce|crop/.test(t))     return 'farm_produce';
  if (/bulk|wholesale/.test(t))        return 'bulk_goods';
  if (/small/.test(t))                 return 'small_parcel';
  return 'standard_parcel';
}

function generateTrackingCode(): string {
  // Crypto-secure (2026-08-09): Math.random is predictable via state
  // recovery; tracking codes gate the public timeline + QR handoff.
  return 'SRS-' + secureCode(8);
}

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  matchingService?:      any;
  trackingGateway?:      any;
  paymentsService?:      any;
  fallbackService?:      any;
  notificationsService?: any;
  mailService?:          any;
  driversService?:       any;
  // Spec V8 Tier 3: when set, status changes fan out to subscribed
  // partner webhooks (POST /api/v1/dev-platform/webhooks subscribers).
  // Wired lazily by DevPlatformModule on app boot to avoid a circular
  // dep with DeliveriesModule.
  devPlatformService?:   any;
  // Wired by DeliveriesModule.onModuleInit. Used only on the DELIVERED
  // transition to run awardReferralBonusIfEligible for the customer.
  loyaltyService?:       any;
  usersRepoRef?:         any;
  // Auto-inserts system messages into the delivery's chat on state changes
  // so customer + driver see status inline without switching screens.
  chatService?:          any;
  // Append-only event log per delivery. Wired by DeliveriesModule.
  // logEvent() writes here; findByTracking() reads here for the DHL-
  // style timeline. Optional so tests that only stub DeliveriesService
  // don't blow up when this is unset.
  deliveryEventsRepo?:   Repository<DeliveryEvent>;
  // Wired by DeliveriesModule.onModuleInit. Store-leg deliveries carry a
  // back-reference from store_dropoffs.deliveryId; driver progress on the
  // Delivery must advance the dropoff so the partner store + sender see
  // honest package state instead of a permanent "awaiting driver".
  storeDropoffsRepo?:    Repository<any>;
  // Wired by DeliveriesModule.onModuleInit. Night-fee knobs live in the
  // Fee Catalogue (admin-tunable per founder rule 2026-08-11).
  feesServiceRef?:       any;

  /**
   * Travel Buddy segment bookings, wired lazily by TravelBuddyModule.
   *
   * A seat sold by the segment agrees its fare with the driver BEFORE
   * any money moves, so when that money lands it must not be re-offered
   * through the generic trip path below: the driver would get a second
   * chance to walk away from an agreement the passenger has now paid
   * against. Lazy, so neither module has to import the other.
   */
  seatBookingsService?:  any;

  constructor(
    @InjectRepository(Delivery) private repo: Repository<Delivery>,
    private pricingService: PricingService,
    private routeDistance: RouteDistanceService,
    private rateCardPricing: RateCardPricing,
    private supportService: SupportService,
    private routingService: RoutingService,
    private whatsapp: WhatsAppService,
  ) {}

  /**
   * Road distance since 2026-08-15. Fares were priced on the straight line
   * between the pins, which in Lagos meant quoting across the lagoon while
   * the driver went around it: with the fare locked at booking and the
   * driver paid a share of the QUOTE, every underquote was the rider's
   * loss. RouteDistanceService resolves Google road distance under a
   * monthly free-tier cap, then a self-calibrating fallback.
   */
  /**
   * Quote and charge from ONE engine (founder 2026-08-15: shown and
   * charged can never drift). This used to answer from the legacy
   * economy/standard/instant formula while create() charged the rate
   * card: the fork the pricing unification existed to kill, still open
   * on the quote side. Now it prices every vehicle on the active card
   * for the same inputs create() will use, so the number on the screen
   * IS the number on the receipt. Vehicles the category blocks are
   * simply absent from the response.
   */
  async getQuote(dto: CreateDeliveryDto) {
    const road = await this.routeDistance.getRoadDistance(
      dto.pickupLat, dto.pickupLng,
      dto.dropoffLat, dto.dropoffLng,
    );
    const card = await this.rateCardPricing.getActiveRateCard();
    const weight = Number(dto.weightKg ?? 0);
    const categoryCode = toCategoryCode(dto.packageCategory);
    const quotes: Record<string, { total: number; driverEarnings: number; nightSurcharge: number }> = {};
    for (const vehicleType of Object.keys(card.vehicleRates)) {
      try {
        const b = await this.rateCardPricing.computePrice({
          vehicleType,
          categoryCode,
          km: road.km,
          stopCount: 1,
          weightKg: weight,
          declaredValueNgn: Number(dto.declaredValueNgn ?? 0) || undefined,
          estimatedDwellMinutes: 0,
          scheduledAt: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
          // Same latitude/longitude fix as create() below.
          pickupCoords:  { latitude: dto.pickupLat,  longitude: dto.pickupLng },
          dropoffCoords: { latitude: dto.dropoffLat, longitude: dto.dropoffLng },
        } as any);
        quotes[vehicleType] = {
          total:          Number(b.customer.total),
          driverEarnings: Number(b.driver.total),
          nightSurcharge: Number((b as any).customer?.nightSurcharge ?? 0),
        };
      } catch {
        // Category blocks this vehicle (or the card has no rate): omit.
      }
    }
    return {
      distanceKm: road.km,
      durationMin: road.durationMin,
      distanceSource: road.source,
      rateCardId: card.id,
      categoryCode,
      quotes,
    };
  }

  async create(dto: CreateDeliveryDto, customer: User): Promise<Delivery> {
    // Same resolver as getQuote, and the shared cache means the booking
    // reuses the exact distance the customer was shown on the quote screen:
    // the two cannot disagree inside one booking session.
    //
    // A run measures the whole chain pickup -> stop1 -> ... -> stopN;
    // pricing the straight pickup -> last-drop leg underpaid the driver
    // on every zigzag route (2026-08-22). Falls back to the single leg
    // when any stop arrives without usable coordinates.
    const coordOk = (v: any) => Number.isFinite(Number(v)) && Number(v) !== 0;
    const runStops = Array.isArray(dto.stops)
      ? dto.stops.filter(st => coordOk(st?.lat) && coordOk(st?.lng))
      : [];
    let distanceKm: number;
    let roadDurationMin: number | null;
    let legsKm: number[] | null = null;
    let roadSource: string;
    if (runStops.length > 1 && runStops.length === (dto.stops?.length ?? 0)) {
      const chain = await this.routeDistance.getRouteLegs([
        { lat: dto.pickupLat, lng: dto.pickupLng },
        ...runStops.map(st => ({ lat: Number(st.lat), lng: Number(st.lng) })),
      ]);
      distanceKm = chain.totalKm;
      roadDurationMin = chain.durationMin;
      legsKm = chain.legsKm;
      roadSource = chain.source;
    } else {
      const road = await this.routeDistance.getRoadDistance(
        dto.pickupLat, dto.pickupLng,
        dto.dropoffLat, dto.dropoffLng,
      );
      distanceKm = road.km;
      roadDurationMin = road.durationMin;
      roadSource = road.source;
    }

    /**
     * The customer app describes a package by weight, category and
     * chosen vehicle; the business app and developer API send the older
     * size/urgency/fragile triple. Fill in whichever half is missing so
     * both callers price identically (2026-08-13).
     *
     * Size comes from weight because that is what the sender actually
     * knows. Thresholds match the app's own vehicle recommendation, so a
     * customer is not quoted for a size the app never showed them.
     */
    const weight = Number(dto.weightKg ?? 0);
    const packageSize: PackageSize =
      dto.packageSize ??
      (weight > 20 ? PackageSize.LARGE
        : weight > 5 ? PackageSize.MEDIUM
        : PackageSize.SMALL);

    // Default STANDARD rather than inferring INSTANT from Send Now: the
    // app quotes the customer a fare before this runs, and silently
    // upgrading the urgency here would charge them more than the screen
    // they agreed to. Urgency-based pricing needs the app to ask first.
    const urgency: UrgencyLevel = dto.urgency ?? UrgencyLevel.STANDARD;

    const isFragile =
      dto.isFragile ?? /fragile|glass|electronic/i.test(dto.packageCategory ?? '');

    const packageDescription =
      (dto.packageDescription ?? dto.description ?? '').trim();

    /**
     * Unified on the rate card (founder 2026-08-15: no hardcoded pricing).
     * The old formula here (300 base + 80/km constants) ignored the admin
     * rate card entirely, so tuning rates in the dashboard changed business
     * and API fares while customer fares silently stood still. All bookings
     * now price through the same versioned card: vehicle labour + fuel
     * pass-through + category, time, and zone surcharges, with the driver's
     * share of each line defined by the card rather than a blanket split.
     */
    const card = await this.rateCardPricing.getActiveRateCard();
    const vehicleType =
      dto.vehicleType && card.vehicleRates[dto.vehicleType]
        ? dto.vehicleType
        : weight > 100 ? 'van' : weight > 20 ? 'tricycle' : 'motorcycle';

    /**
     * The vehicle's distance ceiling, on the path that creates the
     * booking (2026-08-31).
     *
     * vehicleRates[type].maxRouteKm has been editable in the admin rate
     * card the whole time, and until now the ONLY places that enforced
     * it on a package were the two Send screens. A comment further down
     * this same file claimed "the customer and business package flows
     * both refuse a run that exceeds it", which was true of the apps and
     * false of the API. Anything not going through your own UI, the API
     * keys the business app issues, the developer platform, a replayed
     * request, sailed past the one check that existed.
     *
     * The seat sale, the address-change re-price and the counter flow
     * all enforce it. This was the hole in the middle of them.
     *
     * Silent while the value is unset, which is how it stands today:
     * setting it is the founder's decision, and this is what makes that
     * decision take effect everywhere rather than only in the apps.
     */
    {
      const maxKm = Number(card?.vehicleRates?.[vehicleType]?.maxRouteKm ?? 0);
      if (maxKm > 0 && distanceKm > maxKm) {
        throw new BadRequestException(
          `${aVehicle(vehicleType)} does not run further than ${maxKm} km. `
            .replace(/^./, c => c.toUpperCase()) +
          `This route is ${Math.round(distanceKm)} km, so pick a bigger vehicle.`,
        );
      }
    }
    /**
     * Posting a parcel to a declared trip (2026-08-31).
     *
     * Validated here, attached below. Every other part of the offer
     * lifecycle already existed and never cared what KIND of booking it
     * was: findAvailable hides a trip-bound row from the general pool,
     * claimByDriver refuses it to anyone but that trip's driver,
     * declineTripOffer lets them turn it down, and expireTripOffers
     * releases and refunds an unanswered one. Only the seat path ever
     * set tripId, so a parcel had no way in.
     *
     * Deliberately NOT a new price. A parcel on a trip is priced by the
     * same engine as any other parcel, so this adds no money rules and
     * no new way for a booking to be worth a different amount depending
     * on how it was created. The only thing that changes is who is
     * offered the job.
     */
    let postedTrip: any = null;
    if ((dto as any).tripId) {
      // Raw check, not isRideBooking: that is declared further down with
      // the pricing, and this validation has to run before the money.
      if ((dto as any).mode === 'ride') {
        throw new BadRequestException('Book a seat on a trip, not a ride.');
      }
      if (!this.driversService?.getTripForParcel) {
        throw new BadRequestException('Trip posting is unavailable right now.');
      }
      postedTrip = await this.driversService.getTripForParcel(
        String((dto as any).tripId), weight,
      );
    }

    /**
     * Quote pin (founder 2026-08-21). A valid pin from the review quote
     * makes that number the price, exactly. An expired or tampered pin
     * is refused with QUOTE_EXPIRED so the app must re-show the price:
     * the customer is never charged a number they did not see. No pin
     * at all keeps legacy behaviour for older clients.
     */
    const quotePin = this.rateCardPricing.verifyQuotePin((dto as any).quoteToken);
    if ((dto as any).quoteToken && !quotePin) {
      const { ConflictException } = await import('@nestjs/common');
      throw new ConflictException({
        code:    'QUOTE_EXPIRED',
        message: 'Your quoted price expired. The review screen now shows the current price; check it and tap Pay again.',
      });
    }

    // The real stop count: runs used to price here with stopCount 1
    // while the review quoted stop fees + dwell, so multi-package
    // bookings charged less than the screen and shorted the driver's
    // stop share (found 2026-08-22).
    const stopCount = Array.isArray(dto.stops) && dto.stops.length > 0 ? dto.stops.length : 1;
    const declaredTotalNgn = Array.isArray(dto.stops) && dto.stops.length > 0
      ? dto.stops.reduce((sum, st) => sum + (Number(st?.declaredValueNgn ?? 0) || 0), 0)
      : Number(dto.declaredValueNgn ?? 0) || 0;

    /**
     * The drop that decides the zone, derived here rather than trusted
     * from the client.
     *
     * A stops[] booking carries no dropoffLat at all: the business app
     * has never sent one, so this call site was handing the engine
     * { latitude: undefined }, state detection returned null, and the
     * whole state-aware zone tier was skipped on every multi-stop
     * booking. An inter-state run was charged as a local one, at both
     * quote and charge (2026-08-27).
     *
     * Furthest from pickup, because that is the leg that determines the
     * zone; nearest would let a run start with a drop down the road and
     * price a cross-country second leg as local.
     */
    const finalDropCoords = (() => {
      const stops: any[] = Array.isArray(dto.stops) ? dto.stops : [];
      const pLat = Number(dto.pickupLat), pLng = Number(dto.pickupLng);
      if (stops.length && Number.isFinite(pLat) && Number.isFinite(pLng)) {
        let best: { latitude: number; longitude: number } | null = null;
        let bestD = -1;
        for (const st of stops) {
          const la = Number(st?.lat ?? st?.dropoffLat);
          const ln = Number(st?.lng ?? st?.dropoffLng);
          if (!Number.isFinite(la) || !Number.isFinite(ln)) continue;
          const d = PricingService.haversineKm(pLat, pLng, la, ln);
          if (d > bestD) { bestD = d; best = { latitude: la, longitude: ln }; }
        }
        if (best) return best;
      }
      return { latitude: dto.dropoffLat, longitude: dto.dropoffLng };
    })();

    /**
     * Waiting, from the same estimator the business API has always used.
     *
     * This path assumed a flat four minutes a stop while business.service
     * called computeStopDwellMinutes, which reads the category setup time,
     * the weight ladder and the per-stop buffer off the card. So the same
     * run, booked through two doors, dwelled differently and the weight
     * tiers the card configures were dead on this path (2026-08-27).
     *
     * Single drops stay at zero, exactly as before: this changes what a
     * multi-stop run bills, and nothing else.
     */
    const dwellCategory = await this.rateCardPricing.getCategoryByCode(
      toCategoryCode(dto.packageCategory),
    );
    const dwellCard = await this.rateCardPricing.getActiveRateCard();
    const perStopDwellMinutes = this.rateCardPricing.computeStopDwellMinutes(
      dwellCard, dwellCategory, stopCount > 0 ? weight / stopCount : weight,
    );

    // A ride prices through the ride engine: no categories, no weight,
    // no stops, the passenger is the payload (founder 2026-08-22).
    const isRideBooking = (dto as any).mode === 'ride';

    const breakdown = isRideBooking
      ? await this.rateCardPricing.computeRidePrice({
          vehicleType,
          km: distanceKm,
          scheduledAt: quotePin?.pricedAt ?? undefined,
          pickupCoords:  { latitude: dto.pickupLat,  longitude: dto.pickupLng },
          dropoffCoords: { latitude: dto.dropoffLat, longitude: dto.dropoffLng },
          luggage: (dto as any).luggage,
        }) as any
      : await this.rateCardPricing.computePrice({
      vehicleType,
      categoryCode: toCategoryCode(dto.packageCategory),
      km: distanceKm,
      stopCount,
      weightKg: weight,
      declaredValueNgn: declaredTotalNgn > 0 ? declaredTotalNgn : undefined,
      estimatedDwellMinutes: stopCount > 1 ? perStopDwellMinutes * stopCount : 0,
      // A pinned send-now booking re-evaluates time surcharges at the
      // instant the quote was priced, which is what makes it match.
      scheduledAt: dto.scheduledFor
        ? new Date(dto.scheduledFor)
        : (quotePin?.pricedAt ?? undefined),
      // latitude/longitude, NOT lat/lng: the engine reads
      // pickupCoords.latitude, and the `as any` hid the mismatch, so
      // coordinates never arrived, state detection got undefined, and
      // every single-package customer booking priced at NATIONAL rates
      // while the review screen showed Lagos rates. Caught live on the
      // first real booking: screen 2,134, charge 1,668 (2026-08-21).
      pickupCoords:  { latitude: dto.pickupLat,  longitude: dto.pickupLng },
      dropoffCoords: finalDropCoords,
    } as any);
    // Consent lands as a timestamp on the row, provable later.
    const termsAcceptedAt = (dto as any).termsAccepted ? new Date() : null;

    /**
     * Interstate behind ID verification, if the founder wants it
     * (2026-08-31).
     *
     * user.entity.ts has said since the identity policy shipped that
     * verified users "unlock higher wallet/reward limits, INTERSTATE
     * DELIVERY, insured deliveries, priority support". Nothing anywhere
     * enforced the interstate half, so the policy and the product
     * disagreed, and an unverified account could book Lagos to Kano
     * today.
     *
     * Either the code should enforce it or the policy should be
     * rewritten; the mismatch is the actual problem. Which of those is
     * right is a founder call with real revenue in it, because approval
     * takes 24 hours to 3 business days and gating interstate on launch
     * day would block real bookings from real people.
     *
     * So: the mechanism exists and the switch is OFF, seeded 0. Nothing
     * changes for anybody until somebody turns it on, and turning it on
     * is a catalogue edit rather than a deploy.
     */
    const routeIsInterState = (breakdown as any)?.route?.isInterState === true;
    if (routeIsInterState) {
      const gateOn = await this.feesServiceRef
        ?.getValueOr('interstate_requires_verified_id', 0)
        .catch(() => 0);
      if (Number(gateOn) > 0) {
        const verifiedAt = await this.repo.manager.getRepository(User)
          .findOne({ where: { id: (customer as any).id }, select: ['id', 'identityVerifiedAt'] })
          .then(u => (u as any)?.identityVerifiedAt ?? null)
          .catch(() => null);
        if (!verifiedAt) {
          throw new BadRequestException(
            'Sending between states needs a verified ID on your account. ' +
            'Add one from Profile, Verify identity. Deliveries inside your state are unaffected.',
          );
        }
      }
    }

    // The passenger IS the recipient on a ride, and the driver greets
    // them by name. The auth snapshot only carries id/email, so the
    // name and phone come from the user row (first live ride saved
    // recipientName null, 2026-08-23).
    let ridePassenger: Record<string, any> = {};
    if (isRideBooking) {
      const u = await this.repo.manager.getRepository(User).findOne({
        where: { id: (customer as any).id },
        select: ['id', 'name', 'firstName', 'lastName', 'phone', 'accountId', 'notificationPrefs'],
      });
      // recipientName is a STOP column, not a delivery column; the
      // delivery row carries receiverFirstName/LastName (first live
      // ride saved a passenger with no name, 2026-08-23).
      const [gFirst, ...gRest] = String(u?.name ?? '').trim().split(/\s+/);
      // A ride booked FOR someone else carries only that rider's first
      // name: nothing for a stranger to look up (founder 2026-08-23).
      // The booker's phone stays on the row for ADMIN emergencies; the
      // driver app talks through chat, never the number.
      // Anonymity (founder 2026-08-23): a profile switch replaces the
      // passenger's first name with their SEIRS ID on everything the
      // driver sees. Admin identity is untouched.
      const anonPref = !!(u as any)?.notificationPrefs?.anonymousToDrivers;
      const riderFirst = String((dto as any).riderFirstName ?? '').trim();
      const luggage = String((dto as any).luggage ?? 'none');
      ridePassenger = {
        receiverFirstName:  riderFirst || (anonPref ? (u?.accountId ?? 'SEIRS rider') : (u?.firstName ?? gFirst ?? null)),
        receiverLastName:   (riderFirst || anonPref) ? null : (u?.lastName ?? (gRest.length ? gRest.join(' ') : null)),
        receiverPhone:      u?.phone ?? null,
        packageDescription: luggage === 'large' ? 'Ride · large luggage'
                          : luggage === 'small' ? 'Ride · small bag' : 'Ride',
        categoryCode:       null,
        weightKg:           null,
      };
    }

    const pricing = {
      // The pinned total IS the price when a pin rode in with the
      // booking: the customer pays the number the review showed. The
      // driver's share still comes from the fresh breakdown.
      price:          quotePin ? quotePin.total : Number(breakdown.customer.total),
      driverEarnings: Number(breakdown.driver.total),
    };
    void packageSize; void urgency; void isFragile;

    // Collision-safe tracking code: at ~1M deliveries the birthday
    // bound gives a ~45% chance of at least one random collision in a
    // 32^8 space. The DB unique constraint would turn that into a
    // failed booking, so pre-check + regenerate up to 5 times. The
    // remaining race window (two bookings in the same ms picking the
    // same code) is still caught by the unique constraint.
    let trackingCode = generateTrackingCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await this.repo.exist({ where: { trackingCode } });
      if (!exists) break;
      trackingCode = generateTrackingCode();
    }

    // High-value packages can never be gate-drops or unnamed-neighbour
    // drops (founder policy 2026-08-11): hand to receiver or partner
    // store only, otherwise the mandatory signature has a hole in it.
    // Through the helper, so this gate uses the same threshold as the
    // premium the customer was charged. It read the Fee Catalogue row
    // directly and could disagree with the card that set the price.
    if (Number(dto.declaredValueNgn ?? 0) > 0) {
      const hvThreshold = await this.getHighValueThreshold();
      if (Number(dto.declaredValueNgn) >= hvThreshold &&
          (dto.fallbackPref === 'gate' || dto.fallbackPref === 'neighbour')) {
        const { BadRequestException } = await import('@nestjs/common');
        throw new BadRequestException(
          'High-value packages cannot be left at the gate or with a neighbour. Choose "hand to receiver" or "partner store" as the fallback.',
        );
      }
    }

    // Scheduled pickups (night-ops build 2026-08-11): 24/7 slots per
    // founder decision, server-validated so a modified client cannot
    // book the past or the far future. Before this build the slot never
    // reached the database and scheduled bookings dispatched instantly.
    let scheduledFor: Date | null = null;
    if (dto.scheduledFor) {
      const parsed = new Date(dto.scheduledFor);
      const { BadRequestException } = await import('@nestjs/common');
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('scheduledFor is not a valid date.');
      }
      const now = Date.now();
      if (parsed.getTime() < now - 5 * 60 * 1000) {
        throw new BadRequestException('Pickup time is in the past. Choose a future slot or use Send Now.');
      }
      if (parsed.getTime() > now + 7 * 24 * 60 * 60 * 1000) {
        throw new BadRequestException('Pickups can be scheduled at most 7 days ahead.');
      }
      scheduledFor = parsed;
    }

    // Night fee (founder 2026-08-11): surcharge on pickups whose
    // effective time falls in the night window, passed to the driver IN
    // FULL to encourage night coverage. All three knobs are admin rows.
    // Night pricing now lives in the rate card's timeSurcharges (priced and
    // driver-allocated per the card), so the old fees-catalogue night fee is
    // retired from this path: adding both would charge the customer twice
    // for the same dark sky. nightFeeNgn on the row stays for reporting,
    // fed from the card's own night line when present.
    /**
     * Night pricing lives in the rate card's timeSurcharges, priced and
     * driver-allocated there.
     *
     * This block used to read night_fee_pct and two window hours from the
     * Fee Catalogue, compute a fee, and then discard it behind a
     * hardcoded RATE_CARD_OWNS_NIGHT = true, which existed to stop the
     * customer being charged twice for the same dark sky. Three fee rows
     * an admin could edit therefore did nothing at all. The rows are
     * deleted and the dead computation with them (2026-08-28).
     */
    const nightFee = 0;

    const delivery = this.repo.create({
      termsAcceptedAt,
      ...dto,
      // Resolved values win over whatever the caller did or did not send.
      packageSize,
      urgency,
      isFragile,
      packageDescription,
      // The app calls it packageCategory; the column is categoryCode.
      categoryCode:   dto.packageCategory ?? null,
      weightKg:       dto.weightKg ?? null,
      packagePhotos:  Array.isArray(dto.packagePhotos) && dto.packagePhotos.length > 0
                        ? dto.packagePhotos
                        : null,
      paymentMethod:  dto.paymentMethod ?? null,
      codAmountNgn:   dto.codAmountNgn ?? null,
      // A run's declared value is the SUM on board: the matching gate
      // and the insurance path both reason about the total carried.
      declaredValueNgn: declaredTotalNgn > 0 ? declaredTotalNgn : (dto.declaredValueNgn ?? null),
      // A ride's "recipient" is the passenger: the driver greets a
      // person by name, and the tracking page shows who is riding.
      kind: isRideBooking ? 'ride' : 'package',
      /**
       * A trip-bound parcel is offered to ONE rider, the one whose trip
       * it is. tripOfferedAt starts the clock the expiry cron reads, so
       * a sender's money never waits on a silent phone.
       */
      tripId:        postedTrip ? postedTrip.id : null,
      tripOfferedAt: postedTrip ? new Date() : null,
      /**
       * The geography that justified the surcharge, stored beside the
       * charge (2026-08-31). Taken from the engine's own answer rather
       * than recomputed here, so the row can never disagree with the
       * price it was charged. Absent on a breakdown that predates this,
       * hence the optional chain and the nulls.
       */
      pickupStateCode:  (breakdown as any)?.route?.pickupStateCode  ?? null,
      dropoffStateCode: (breakdown as any)?.route?.dropoffStateCode ?? null,
      zoneTier:         (breakdown as any)?.route?.zoneTier         ?? null,
      zoneTierNgn:      (breakdown as any)?.route?.tierSurchargeNgn ?? null,
      /**
       * Snapshot the priced breakdown (2026-08-31).
       *
       * Only the BUSINESS path ever wrote this column, so on a customer
       * booking the driver's earnings card had nothing to render and a
       * rider could not see how their own pay was built at all. The
       * business path has snapshotted it since its rebuild for exactly
       * this reason; the customer path simply never did.
       *
       * It is redacted per audience on the way out, in findByIdForUser
       * and the business route, because the raw object carries seirsNet,
       * trueCosts and the driver cost basis.
       */
      priceBreakdown:   breakdown,
      ...ridePassenger,
      scheduledFor,
      trackingCode,
      customer,
      distanceKm,
      quotedDistanceSource: roadSource,
      quotedDurationMin:    roadDurationMin,
      price:          +pricing.price.toFixed(2),
      driverEarnings: +pricing.driverEarnings.toFixed(2),
      nightFeeNgn:    Number((breakdown as any).customer?.nightSurcharge ?? 0) > 0
                        ? +Number((breakdown as any).customer.nightSurcharge).toFixed(2)
                        : null,
      rateCardSnapshotId: card.id,
      status:         DeliveryStatus.PENDING,
      // create() resolves to its array overload when the literal is cast,
      // so the cast goes on the result instead.
    } as any) as unknown as Delivery;

    const saved = await this.repo.save(delivery);

    // Multi-package run. One driver, one pickup, one payment, and a
    // DeliveryStop row per package so each receiver gets a public
    // tracking code for THEIR parcel and cannot see the rest of the run.
    // Same rows and the same code family the business path writes, so
    // /track, the driver app and admin all read them without changes.
    if (Array.isArray(dto.stops) && dto.stops.length > 0) {
      const stopRepo = this.repo.manager.getRepository(DeliveryStop);

      const used = new Set<string>();
      const nextPackageCode = () => {
        let c = generateTrackingCode();
        while (used.has(c)) c = generateTrackingCode();
        used.add(c);
        return c;
      };
      // stopCode carries a partial unique index, so a collision fails the
      // whole booking insert, not just one row. It needs the same
      // treatment as the package code: dedup inside the batch here, and
      // a check against history below.
      const usedStops = new Set<string>();
      const nextStopCode = () => {
        let c = 'STP-' + secureCode(8);
        while (usedStops.has(c)) c = 'STP-' + secureCode(8);
        usedStops.add(c);
        return c;
      };

      const rows = dto.stops.map((st, idx) => this.repo.manager.create(DeliveryStop, {
        deliveryId:            saved.id,
        sequenceOrder:         idx + 1,
        stopCode:              nextStopCode(),
        packageTrackingCode:   nextPackageCode(),
        packagePhotoUrls:      st.packagePhotoUrls ?? null,
        packageDescription:    st.packageDescription ?? null,
        categoryCode:          st.categoryCode ?? dto.packageCategory ?? null,
        weightKg:              st.weightKg ?? null,
        receiverFirstName:     st.receiverFirstName ?? null,
        receiverLastName:      st.receiverLastName ?? null,
        declaredValueNgn:      st.declaredValueNgn ?? null,
        fallbackPref:          st.fallbackPref ?? null,
        fallbackNeighbourName: st.fallbackNeighbourName ?? null,
        // The counter the recipient collects from, when they chose one
        // instead of a door (2026-08-31). The business path has written
        // this column since the partner network shipped and this one
        // dropped it on the floor, so the same booking made from the two
        // apps produced two different rows.
        destinationStoreId:    (st as any).destinationStoreId ?? null,
        address:               st.address,
        lat:                   st.lat,
        lng:                   st.lng,
        legKm:                 legsKm?.[idx] ?? null,
        recipientName:         st.recipientName,
        recipientPhone:        st.recipientPhone,
        notes:                 st.notes ?? null,
        status:                DeliveryStopStatus.PENDING,
      } as any));

      // Codes are random, so at volume a clash with HISTORY (not just
      // within this batch) is a real event. One indexed query catches it
      // and the row regenerates before insert, so a partial unique index
      // never fails the whole booking.
      // Check BOTH tables. A customer single delivery's own trackingCode is
      // also SRS-, so the package namespace overlaps it, and /track looks up
      // delivery_stops FIRST: a package code that collided with an existing
      // delivery's code would shadow that delivery and make it untrackable.
      const codes = rows.map((r: any) => r.packageTrackingCode).filter(Boolean);
      if (codes.length > 0) {
        const [stopClashes, deliveryClashes]: [Array<{ c: string }>, Array<{ c: string }>] =
          await Promise.all([
            this.repo.manager.query(
              `SELECT "packageTrackingCode" AS c FROM delivery_stops WHERE "packageTrackingCode" = ANY($1)`,
              [codes],
            ),
            this.repo.manager.query(
              `SELECT "trackingCode" AS c FROM deliveries WHERE "trackingCode" = ANY($1)`,
              [codes],
            ),
          ]);
        const clashed = new Set([...stopClashes, ...deliveryClashes].map(x => x.c));
        if (clashed.size > 0) {
          for (const r of rows as any[]) {
            while (clashed.has(r.packageTrackingCode)) {
              r.packageTrackingCode = nextPackageCode();
            }
          }
        }
      }

      const stopCodes = rows.map((r: any) => r.stopCode).filter(Boolean);
      if (stopCodes.length > 0) {
        const stopClash: Array<{ c: string }> = await this.repo.manager.query(
          `SELECT "stopCode" AS c FROM delivery_stops WHERE "stopCode" = ANY($1)`,
          [stopCodes],
        );
        if (stopClash.length > 0) {
          const taken = new Set(stopClash.map(x => x.c));
          for (const r of rows as any[]) {
            while (taken.has(r.stopCode)) r.stopCode = nextStopCode();
          }
        }
      }

      await stopRepo.save(rows);
      /**
       * Multi-stop means MORE THAN ONE stop (2026-08-31).
       *
       * This was set true for any stop count, which was harmless only
       * because nothing sent a single-element stops array down this
       * path. A customer naming a collection counter now does, since
       * destinationStoreId lives on the stop row, and flagging that one
       * package as a multi-stop run would put it in front of the driver
       * as a route with legs to sequence. The business path has always
       * written `dto.stops.length > 1`; this now agrees with it.
       */
      (saved as any).isMultiStop = rows.length > 1;
      await this.repo.save(saved);
    }

    // Dispatch waits for MONEY, not just creation (2026-08-16): the fare
    // escrows via /payments/initiate (card webhook, wallet, COD), and
    // whichever path secures it calls kickDispatch. Before this gate a
    // driver could accept a booking whose payment was abandoned.
    this.logger.log(`Delivery ${saved.trackingCode} created; dispatch awaits payment hold`);

    return saved;
  }

  // Dispatch sweep for scheduled pickups: every 5 minutes, kick off
  // matching for PENDING driverless bookings whose slot is within 15
  // minutes. Idempotent: runAutoMatch on an already-matched delivery is
  // a no-op because matching skips non-PENDING rows.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async dispatchDueScheduled() {
    if (!this.matchingService) return;
    try {
      const due = await this.repo
        .createQueryBuilder('d')
        .where('d.status = :status', { status: DeliveryStatus.PENDING })
        .andWhere('d.driver IS NULL')
        .andWhere('d."paymentHeldAt" IS NOT NULL')
        .andWhere(`d.scheduledFor IS NOT NULL`)
        .andWhere(`d.scheduledFor <= NOW() + interval '15 minutes'`)
        .take(50)
        .getMany();
      for (const d of due) {
        this.runAutoMatch(d).catch((err) =>
          this.logger.error(`Scheduled dispatch failed for ${d.id}: ${err.message}`),
        );
      }
      if (due.length) this.logger.log(`Dispatched ${due.length} scheduled pickup(s)`);
    } catch (e: any) {
      this.logger.warn(`scheduled dispatch sweep failed: ${e?.message ?? e}`);
    }
  }

  /**
   * Fire dispatch for a delivery whose money just landed.
   *
   * PaymentsService has called deliveriesServiceRef.kickDispatch()
   * since the paid-dispatch gate (2026-08-16): THE METHOD NEVER
   * EXISTED. The TypeError died inside the webhook's try/catch and
   * every paid send-now booking sat undispatched until a human noticed
   * (found 2026-08-23 while wiring Travel Buddy).
   *
   * Travel Buddy bookings (tripId set) assign their declared driver
   * directly: the passenger chose that trip, not a radius.
   */
  async kickDispatch(deliveryId: string) {
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['customer', 'driver'],
    });
    if (!delivery) return;
    if (delivery.driver || delivery.status !== DeliveryStatus.PENDING) return;
    if (!delivery.paymentHeldAt) return;               // money first, always
    if (delivery.scheduledFor && new Date(delivery.scheduledFor).getTime() > Date.now() + 15 * 60_000) {
      return;                                          // the scheduled sweep owns it
    }

    const tripId = (delivery as any).tripId;

    /**
     * Segment seat bookings settle themselves.
     *
     * The driver already accepted THIS segment at THIS fare before the
     * passenger was charged, so the money landing is the last step, not
     * the first. confirmPaidByDelivery re-checks per-segment capacity
     * under a lock (two passengers can legitimately be paying for the
     * last seat at once, because an unpaid request never blocks
     * capacity), holds the seat, and assigns the rider directly.
     *
     * It returns true when it owned this delivery, which keeps the
     * legacy whole-route offer path below untouched for bookings made
     * the old way.
     */
    if (tripId && this.seatBookingsService) {
      try {
        const handled = await this.seatBookingsService.confirmPaidByDelivery(deliveryId);
        if (handled) return;
      } catch (e: any) {
        this.logger.error(`seat booking settle failed for ${deliveryId}: ${e?.message ?? e}`);
      }
    }

    if (tripId && this.driversService) {
      // The TRUE offer step (founder 2026-08-23): the declared driver
      // is asked, not conscripted. tripOfferedAt starts the expiry
      // clock; accept is the guarded claim, decline refunds in full.
      try {
        const trip: any = await (this.driversService as any).getBookableTrip(tripId, 0);
        if (trip?.driver) {
          await this.repo.update(delivery.id, { tripOfferedAt: new Date() } as any);
          this.trackingGateway?.notifyDriver(trip.driver.id, delivery);
          if (trip.driver.user?.id) {
            this.notificationsService?.create?.(
              trip.driver.user.id,
              'Seat booking on your trip',
              `${delivery.packageDescription ?? 'A seat booking'} is paid and waiting. Accept or decline it in Jobs: it expires if you do nothing.`,
              'job_request' as any,
              delivery.id,
              delivery.trackingCode,
            );
          }
          return;
        }
      } catch (e: any) {
        this.logger.warn(`trip offer failed for ${deliveryId}: ${e?.message ?? e}; falling back to matching`);
      }
    }

    await this.runAutoMatch(delivery);
  }

  /**
   * Book seats on a declared intercity trip (Travel Buddy). The seat
   * ledger reserves BEFORE the delivery row exists, with a guarded SQL
   * increment that makes overselling impossible; an unpaid or
   * cancelled booking releases the seats.
   */
  /** Centres of the common intercity cities: seat bookings need real
   *  coordinates (the columns are NOT NULL and the map draws them).
   *  A city outside the table books from the trip's own pickup point
   *  or, failing that, is refused with a clear message. */
  private static readonly CITY_COORDS: Record<string, { lat: number; lng: number }> = {
    lagos:          { lat: 6.5244, lng: 3.3792 },
    ibadan:         { lat: 7.3776, lng: 3.9470 },
    abuja:          { lat: 9.0765, lng: 7.3986 },
    kano:           { lat: 12.0022, lng: 8.5920 },
    'port harcourt': { lat: 4.8156, lng: 7.0498 },
    benin:          { lat: 6.3350, lng: 5.6037 },
    'benin city':   { lat: 6.3350, lng: 5.6037 },
    enugu:          { lat: 6.4584, lng: 7.5464 },
    kaduna:         { lat: 10.5105, lng: 7.4165 },
    ilorin:         { lat: 8.4966, lng: 4.5426 },
    abeokuta:       { lat: 7.1475, lng: 3.3619 },
    onitsha:        { lat: 6.1329, lng: 6.8036 },
  };

  private cityCoords(city: string) {
    return DeliveriesService.CITY_COORDS[String(city ?? '').trim().toLowerCase()] ?? null;
  }

  async bookTripSeats(
    tripId: string,
    customer: User,
    body: {
      seats?: number; luggage?: string;
      /** The stops this passenger boards and alights at, when riding
       *  part of the route. Validated against the trip below. */
      boardStopId?: string; alightStopId?: string;
    },
  ) {
    if (!this.driversService) {
      const { ServiceUnavailableException } = await import('@nestjs/common');
      throw new ServiceUnavailableException('Marketplace not wired.');
    }
    const seats = Math.max(1, Math.min(Math.round(Number(body.seats ?? 1)), 14));
    const trip: any = await (this.driversService as any).getBookableTrip(tripId, seats);

    /**
     * Price and board the SEGMENT the passenger actually booked.
     *
     * This priced trip.routeKm and set pickup from trip.fromCity, so a
     * passenger who searched Ibadan to Lagos on a Jos to Ibadan to Lagos
     * trip was quoted the whole 943.6 km at 30,431.10 and told to be at
     * Bukuru Expressway in Jos, 791 km from where they get on. Found by
     * booking it on the device (2026-08-29).
     *
     * Segments were designed everywhere else: trip_stops carries an
     * ordered route with km_from_origin, and
     * travel_buddy_min_segment_fare_ngn is a floor under ONE segment.
     * Booking was the last place that only understood whole trips.
     *
     * Both stops are re-read from the database and re-validated here
     * rather than trusted from the request: they must belong to THIS
     * trip and be in ascending sequence, so a crafted body cannot buy a
     * 943 km ride for the price of a 12 km hop, or board a trip it has
     * nothing to do with.
     */
    let segment: {
      boardCity: string; alightCity: string; segmentKm: number;
      boardAddress: string; boardLat: number; boardLng: number;
      alightAddress: string; alightLat: number; alightLng: number;
    } | null = null;

    if (body.boardStopId && body.alightStopId) {
      const rows: Array<any> = await this.repo.manager.query(
        `SELECT "id","trip_id","sequence","city","address","latitude","longitude","km_from_origin"
           FROM "trip_stops" WHERE "id" = ANY($1) AND "trip_id" = $2`,
        [[body.boardStopId, body.alightStopId], tripId],
      ).catch(() => []);
      const board  = rows.find(r => r.id === body.boardStopId);
      const alight = rows.find(r => r.id === body.alightStopId);
      if (!board || !alight) {
        throw new BadRequestException('Those stops are not on this trip. Search again and pick the trip from the list.');
      }
      if (Number(alight.sequence) <= Number(board.sequence)) {
        throw new BadRequestException('You cannot board after you get off. Pick the stops the other way round.');
      }
      const segKm = Math.round((Number(alight.km_from_origin) - Number(board.km_from_origin)) * 10) / 10;
      if (!(segKm > 0)) {
        throw new BadRequestException('That part of the route has no measured distance yet. Try again shortly.');
      }
      segment = {
        boardCity: board.city, alightCity: alight.city, segmentKm: segKm,
        boardAddress: board.address, boardLat: Number(board.latitude), boardLng: Number(board.longitude),
        alightAddress: alight.address, alightLat: Number(alight.latitude), alightLng: Number(alight.longitude),
      };
    }

    const routeKm = segment ? segment.segmentKm : Number(trip.routeKm ?? 0);
    if (!(routeKm > 0)) {
      throw new BadRequestException('That trip has no measured route yet. Try again shortly.');
    }

    /**
     * The vehicle's distance ceiling, enforced where the money moves.
     *
     * vehicleRates[type].maxRouteKm has been editable in the admin rate
     * card the whole time, and the customer and business package flows
     * both refuse a run that exceeds it. Travel Buddy never checked it,
     * so an okada could sell a passenger seat for Jos to Lagos: 943.6 km
     * on the back of a motorcycle, roughly fifteen hours (2026-08-29).
     *
     * The seat cap was doing its job, motorcycle: 1, agreed by client
     * and server. Nothing capped the DISTANCE that one seat could cover.
     *
     * Checked here rather than only in the driver app, because this is
     * the point where a passenger is charged and it is the only side the
     * founder controls. Silent while the value is unset, which is how it
     * stands today: setting it is the founder's decision, and this makes
     * that decision take effect.
     */
    try {
      const card: any = await this.rateCardPricing.getActiveRateCard();
      const maxKm = Number(card?.vehicleRates?.[trip.driver.vehicleType]?.maxRouteKm ?? 0);
      if (maxKm > 0 && routeKm > maxKm) {
        /* Nigerian vocabulary, matching the apps. Kept local rather than
           imported from @seirs/shared: nothing else in the backend
           resolves that package, and a message must not depend on a
           module that may not load. */
        throw new BadRequestException(
          `${aVehicle(trip.driver.vehicleType)} does not carry passengers further than ${maxKm} km. `
            .replace(/^./, c => c.toUpperCase()) +
          `This ride is ${Math.round(routeKm)} km, so it cannot be booked.`,
        );
      }
    } catch (e: any) {
      // A BadRequest here is the rule firing and must reach the caller.
      // Anything else means the card could not be read, and a booking
      // must not fail because of that.
      if (e?.status === 400 || e?.name === 'BadRequestException') throw e;
    }
    const price = await this.rateCardPricing.computeSeatPrice({
      vehicleType: trip.driver.vehicleType,
      routeKm,
      seats,
      luggage: body.luggage,
    });

    await (this.driversService as any).reserveSeats(tripId, seats);
    try {
      const fromC = this.cityCoords(trip.fromCity);
      /**
       * The destination the rider actually picked, falling back to the
       * old city lookup only for trips declared before destLat existed.
       *
       * CITY_COORDS used to be the ONLY way to resolve a destination,
       * which meant twelve cities defined the whole product: a trip to
       * Jos declared fine and then no passenger could ever book it. The
       * message they got, "this route needs a mapped pickup point", was
       * wrong on top of that, because the pickup was never the problem,
       * so a rider could re-declare forever and never fix it.
       */
      const toC = (Number.isFinite(Number(trip.destLat)) && Number.isFinite(Number(trip.destLng)))
        ? { lat: Number(trip.destLat), lng: Number(trip.destLng) }
        : this.cityCoords(trip.toCity);
      const pLat = Number(trip.pickupLat) || fromC?.lat;
      const pLng = Number(trip.pickupLng) || fromC?.lng;
      if (pLat == null || pLng == null || !toC) {
        // Say which END is unmapped, so the rider fixes the right thing.
        const missing = !toC ? `destination (${trip.toCity})` : `pickup (${trip.fromCity})`;
        throw new BadRequestException(
          `This trip has no mapped ${missing}. Ask the driver to re-declare it, choosing the location from the address suggestions.`,
        );
      }
      const dto: any = {
        mode: 'ride',
        // A segment booking boards and alights at ITS OWN stops. Using
        // the trip's endpoints sent the passenger to the wrong city.
        pickupAddress: segment
          ? `${segment.boardAddress} (agree the exact spot in chat)`
          : trip.pickupMode === 'fixed' && trip.pickupAddress
            ? trip.pickupAddress
            : `${trip.fromCity} (pickup along the route: agree in chat)`,
        dropoffAddress: segment ? segment.alightAddress : trip.toCity,
        pickupLat:  segment ? segment.boardLat  : pLat,
        pickupLng:  segment ? segment.boardLng  : pLng,
        dropoffLat: segment ? segment.alightLat : toC.lat,
        dropoffLng: segment ? segment.alightLng : toC.lng,
        vehicleType: trip.driver.vehicleType,
        paymentMethod: 'card',
        luggage: body.luggage,
        termsAccepted: true,
      };
      // Seat bookings price from the SEAT engine, not the ride engine:
      // build the row directly rather than through create()'s pricing.
      let trackingCode = generateTrackingCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const exists = await this.repo.exist({ where: { trackingCode } });
        if (!exists) break;
        trackingCode = generateTrackingCode();
      }
      const row = this.repo.create({
        ...dto,
        kind: 'ride',
        tripId,
        seatCount: seats,
        customer,
        trackingCode,
        packageDescription: `Seat x${seats} · ${segment ? `${segment.boardCity} → ${segment.alightCity}` : `${trip.fromCity} → ${trip.toCity}`}${body.luggage === 'large' ? ' · large luggage' : body.luggage === 'small' ? ' · small bag' : ''}`,
        categoryCode: null,
        weightKg: null,
        distanceKm: routeKm,
        price:          Number(price.customer.total),
        driverEarnings: Number(price.driver.total),
        status: DeliveryStatus.PENDING,
      } as any);
      const saved: any = await this.repo.save(row);
      this.logger.log(`Travel Buddy: ${seats} seat(s) on trip ${tripId} booked as ${saved.trackingCode}; dispatch awaits payment`);
      return saved;
    } catch (e) {
      await (this.driversService as any).releaseSeats(tripId, seats);
      throw e;
    }
  }

  /** Close a trip offer with a FULL refund: decline and expiry share it. */
  private async closeTripOffer(delivery: any, why: string) {
    await this.repo.update(delivery.id, {
      cancellationFeeNgn: 0,
      cancelledAt:        new Date(),
      cancellationReason: why,
    } as any);
    await this.updateStatus(delivery.id, DeliveryStatus.CANCELLED);
    await this.releaseTripSeatsFor(delivery);
    try {
      await (this as any).paymentsServiceRef?.refundEscrow?.(delivery.id, delivery.customer?.id, 0);
    } catch (e: any) {
      this.logger.error(`trip-offer refund failed for ${delivery.id}: ${e?.message ?? e}`);
    }
    this.notificationsService?.create?.(
      delivery.customer.id,
      'Seat booking refunded in full',
      `${why} Your ₦${Math.round(Number(delivery.price ?? 0)).toLocaleString()} is on its way back to your card. The Travel Buddy list has other trips.`,
      'general' as any,
      delivery.id,
      delivery.trackingCode,
    );
  }

  /** The declared driver turns a seat booking down. Customer pays nothing. */
  async declineTripOffer(deliveryId: string, driverUserId: string) {
    const delivery: any = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['customer', 'driver'],
    });
    if (!delivery) throw new NotFoundException('Booking not found.');
    if (!delivery.tripId) throw new BadRequestException('This is not a trip booking.');
    if (delivery.driver || delivery.status !== DeliveryStatus.PENDING) {
      throw new BadRequestException('This booking is no longer waiting on you.');
    }
    const owns = await this.repo.manager.query(
      `SELECT t."id" FROM "driver_trips" t
        JOIN "drivers" d ON d."id" = t."driverId"
        JOIN "users" u ON u."id" = d."userId"
       WHERE t."id" = $1 AND u."id" = $2`,
      [delivery.tripId, driverUserId],
    );
    if (!owns?.length) throw new ForbiddenException('This booking belongs to another driver\'s trip.');

    await this.closeTripOffer(delivery, 'The driver declined this seat booking.');
    return { ok: true };
  }

  /**
   * A rider agreed to carry a load and then went quiet (2026-08-31).
   *
   * The breach recorder on driverCancel only catches somebody who says
   * they are backing out. The worse case says nothing at all: they
   * accept, and then the parcel simply never moves. Nothing detected
   * that, so the sender waited and no record existed.
   *
   * TWO CASES, and only one of them is safe to act on automatically.
   *
   * NEVER PICKED UP. The parcel is still with the sender, so nothing is
   * at risk but time. The job is released back to the pool and
   * re-dispatched, which is what the sender actually needs, and the fare
   * stays in escrow so there is nothing to refund.
   *
   * HAS THE PARCEL AND GONE QUIET. Do NOT automate this. A rider holding
   * somebody's goods on the Lagos to Kano road with no signal looks
   * exactly like a rider who has stolen them, and cancelling the job
   * would strand a parcel that is physically in someone's hands. It is
   * recorded, flagged loudly, and left for a person. Automating the safe
   * recovery and escalating the dangerous one is the whole design.
   *
   * A scheduled pickup's clock starts at its slot, not at booking, or
   * every booking made the night before would breach by morning.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async sweepSilentAgreements() {
    try {
      const noPickupHours = this.feesServiceRef
        ? await this.feesServiceRef.getValueOr('agreement_no_pickup_hours', 6).catch(() => 6)
        : 6;
      const silentHours = this.feesServiceRef
        ? await this.feesServiceRef.getValueOr('agreement_silent_hours', 12).catch(() => 12)
        : 12;

      /* Only bookings that came from an agreement, still open, still
         assigned, and with no breach already recorded: the sweep runs
         every half hour and must not file the same case twice. */
      const rows: any[] = await this.repo.manager.query(
        `SELECT d."id", d."status", d."assignedAt", d."pickedUpAt", d."scheduledFor",
                d."trackingCode", d."price", d."customerId", d."driverId",
                pr."id" AS "requestId", pr."answeredAt",
                t."departAt" AS "tripDepartAt"
           FROM "deliveries" d
           JOIN "parcel_requests" pr
             ON pr."deliveryId" = d."id" AND pr."status" = 'accepted'
           LEFT JOIN "driver_trips" t ON t."id" = pr."tripId"
          WHERE d."driverId" IS NOT NULL
            AND d."status" IN ('assigned','picked_up','in_transit')
            AND NOT EXISTS (
              SELECT 1 FROM "agreement_breaches" ab WHERE ab."deliveryId" = d."id"
            )
          LIMIT 200`,
      );
      if (!rows?.length) return;

      const now = Date.now();
      const hoursSince = (t: any) => t ? (now - new Date(t).getTime()) / 3_600_000 : 0;

      for (const r of rows) {
        /**
         * The clock starts when the rider could actually have collected,
         * which is the LATEST of three things, not just assignment.
         *
         * Assignment alone was wrong and I caught it before this shipped:
         * a rider who agrees today to a trip departing on Thursday is not
         * failing anybody on Tuesday afternoon, and a six hour rule
         * measured from assignment would have filed a breach against
         * every single long-haul agreement. The trip's own departure is
         * the honest start for a trip-bound load.
         */
        const candidates = [r.assignedAt, r.scheduledFor, r.tripDepartAt]
          .filter(Boolean)
          .map((t: any) => new Date(t).getTime())
          .filter((n: number) => Number.isFinite(n));
        const clockFrom = candidates.length ? new Date(Math.max(...candidates)) : r.assignedAt;

        const neverCollected = String(r.status) === 'assigned';
        const waited = hoursSince(clockFrom);

        if (neverCollected && waited < Number(noPickupHours)) continue;
        if (!neverCollected && hoursSince(r.pickedUpAt) < Number(silentHours)) continue;

        const reason = neverCollected ? 'no_pickup' : 'went_silent';
        const windowDays = this.feesServiceRef
          ? await this.feesServiceRef.getValueOr('agreement_breach_window_days', 90).catch(() => 90)
          : 90;
        const prior = await this.repo.manager.query(
          `SELECT COUNT(*)::int AS c FROM "agreement_breaches"
            WHERE "driverId" = $1 AND "createdAt" > NOW() - ($2 || ' days')::interval`,
          [r.driverId, String(windowDays)],
        );
        const strike = Number(prior?.[0]?.c ?? 0) + 1;

        await this.repo.manager.query(
          `INSERT INTO "agreement_breaches"
             ("driverId","deliveryId","parcelRequestId","agreedAt","stage","reason","note","fareNgn","strikeCount")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            r.driverId, r.id, r.requestId, r.answeredAt ?? null,
            String(r.status), reason,
            neverCollected
              ? `Agreed, then never collected the parcel. ${Math.round(waited)}h after they could have.`
              : `Took the parcel, then no movement for ${Math.round(hoursSince(r.pickedUpAt))}h.`,
            Number(r.price ?? 0) || null, strike,
          ],
        );

        if (neverCollected) {
          /* Safe to recover: the parcel never left the sender. Release it
             and find somebody else, which is what they actually need. */
          await this.repo.update(r.id, { driver: null, assignedAt: null } as any);
          await this.updateStatus(r.id, DeliveryStatus.PENDING).catch(() => {});
          const fresh = await this.repo.findOne({ where: { id: r.id }, relations: ['customer'] });
          if (fresh) this.runAutoMatch(fresh).catch(() => {});
          this.notificationsService?.create?.(
            r.customerId,
            'Finding you another driver',
            'The driver who agreed to carry your parcel did not collect it. '
              + 'Your payment is safe and we are matching somebody else now.',
            'delivery_assigned' as any,
            r.id,
            r.trackingCode,
          );
          this.logger.warn(
            `AGREEMENT_BREACH no_pickup driver=${r.driverId} delivery=${r.id} ` +
            `waited=${Math.round(waited)}h strike=${strike}; released and re-dispatched`,
          );
        } else {
          /* NOT automated. The parcel is in somebody's hands and only a
             person should decide what that means. */
          this.logger.error(
            `AGREEMENT_BREACH went_silent driver=${r.driverId} delivery=${r.id} ` +
            `tracking=${r.trackingCode} strike=${strike}; PARCEL IS WITH THE RIDER, ` +
            `left assigned for human review, no automatic action taken`,
          );
          /* Push it at ops rather than waiting for somebody to open the
             page. Not the SOS channel: nobody is in danger, and blunting
             that alarm with operational noise would cost more than it
             saves. */
          try {
            this.trackingGateway?.broadcastAgreementBreach?.({
              id: r.id, driverId: r.driverId, deliveryId: r.id,
              trackingCode: r.trackingCode ?? null,
              reason, strikeCount: strike,
            });
          } catch { /* an alert must never break the sweep */ }
        }
      }
    } catch (e: any) {
      this.logger.error(`silent agreement sweep failed: ${e?.message ?? e}`);
    }
  }

  /** Unanswered offers expire: nobody's money waits on a silent phone. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireTripOffers() {
    try {
      const timeoutMin = this.feesServiceRef
        ? await this.feesServiceRef.getValueOr('travel_buddy_offer_timeout_min', 30)
        : 30;
      const stale = await this.repo
        .createQueryBuilder('d')
        .leftJoinAndSelect('d.customer', 'c')
        .where('d.status = :status', { status: DeliveryStatus.PENDING })
        .andWhere('d.driver IS NULL')
        .andWhere('d."tripId" IS NOT NULL')
        .andWhere('d."tripOfferedAt" IS NOT NULL')
        .andWhere(`d."tripOfferedAt" < NOW() - interval '5 minutes'`)
        .take(50)
        .getMany()
        .catch(() => [] as any[]);
      // TypeORM param binding with intervals is finicky: filter in JS too.
      const cutoff = Date.now() - Number(timeoutMin) * 60_000;
      for (const d of stale as any[]) {
        if (new Date(d.tripOfferedAt).getTime() > cutoff) continue;
        await this.closeTripOffer(d, 'The driver did not answer in time.');
        this.logger.warn(`Trip offer expired for ${d.trackingCode}`);
      }
    } catch (e: any) {
      this.logger.warn(`expireTripOffers sweep failed: ${e?.message ?? e}`);
    }
  }

  private async runAutoMatch(delivery: Delivery) {
    if (!this.matchingService) return;

    const match = await this.matchingService.findBestDriver(delivery);
    if (!match) {
      this.logger.warn(`No driver found for delivery ${delivery.id}, triggering fallback`);
      if (this.fallbackService) {
        await this.fallbackService.handle(delivery, 'no_driver_found');
      }
      return;
    }

    await this.repo.update(delivery.id, {
      driver:     match.driver,
      status:     DeliveryStatus.ASSIGNED,
      assignedAt: new Date(),
      // Where the rider was when we chose them, written before anyone has
      // a reason to argue about it. Compensation for a wasted trip scales
      // with distance ridden, so without this a claim of "I rode 15km"
      // could not be checked against anything.
      driverAcceptedLat:        (match.driver as any)?.lastLat ?? null,
      driverAcceptedLng:        (match.driver as any)?.lastLng ?? null,
      driverAcceptedDistanceKm: (match as any)?.distanceKm ?? null,
    });

    if (this.trackingGateway) {
      this.trackingGateway.broadcastDriverAssigned(delivery.id, match.driver);
      this.trackingGateway.notifyDriver(match.driver.id, delivery);
    }

    // In-app notifications
    if (this.notificationsService) {
      this.notificationsService.notifyDeliveryAssigned(
        delivery.customer.id,
        delivery.trackingCode,
        match.driver.user?.name ?? 'Your driver',
        delivery.id,
      ).catch(() => {});

      this.notificationsService.notifyNewJob(
        match.driver.user?.id,
        delivery.trackingCode,
        delivery.driverEarnings,
        delivery.id,
      ).catch(() => {});
    }

    this.logger.log(
      `Delivery ${delivery.id} assigned to driver ${match.driver.id} (score: ${match.score})`
    );
  }

  async findByCustomer(customerId: string, page = 1, limit = 20, search?: string) {
    const qb = this.repo
      .createQueryBuilder('d')
      .where('d."customerId" = :customerId', { customerId })
      .orderBy('d."createdAt"', 'DESC')
      .take(limit)
      .skip((page - 1) * limit);

    // Search the three things a customer actually remembers about a
    // booking: the tracking code they were given, and either address.
    // Without this the Bookings tab could only filter the page already
    // loaded, which is worse than no search at all.
    const q = (search ?? '').trim();
    if (q) {
      qb.andWhere(
        '(d."trackingCode" ILIKE :like OR d."pickupAddress" ILIKE :like OR d."dropoffAddress" ILIKE :like)',
        { like: `%${q}%` },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    /**
     * The list ships whole rows, so it needs the same split the detail
     * route got (2026-08-31).
     *
     * This was harmless only while the customer path never wrote
     * priceBreakdown. It writes one now, so without this the bookings
     * LIST would hand every sender the seirsNet, trueCosts and driver
     * cost basis for every booking they have ever made, which is a
     * wider leak than the detail route ever had.
     */
    for (const it of items as any[]) {
      it.priceBreakdown = breakdownForCustomer(it.priceBreakdown);
    }
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  findByDriver(driverId: string) {
    return this.repo.find({
      where: { driver: { id: driverId } },
      order: { createdAt: 'DESC' },
    }).then((rows) => {
      // A rider's own list, so their own pay lines, never our margin.
      for (const r of rows as any[]) {
        r.priceBreakdown = breakdownForDriver(r.priceBreakdown);
      }
      return rows;
    });
  }

  /**
   * Reduce the customer on a driver-facing row to what that driver is
   * allowed to know (founder rule, sweep 2026-08-23).
   *
   *   ride    -> first name only. No surname (Facebook lookup is the
   *              exact harassment vector this rule exists to close),
   *              no phone (the chat box is the channel), no email.
   *   package -> name + phone stay: a courier has to reach the sender
   *              at the door. Email still never travels.
   *
   * Admin payloads are untouched: ops need full identity for
   * emergencies, and they get it through the admin module.
   */
  private redactCustomerForDriver(d: any) {
    const c = d?.customer;
    if (!c) return d;
    const isRide = String(d.kind ?? 'package') === 'ride';
    if (isRide) {
      // The anonymity switch already wrote the SEIRS ID into
      // receiverFirstName at booking time; prefer it when present so an
      // anonymous passenger stays anonymous here too.
      const shown = String(d.receiverFirstName ?? c.firstName ?? c.name ?? 'Passenger')
        .trim().split(/\s+/)[0] || 'Passenger';
      d.customer = { id: c.id, firstName: shown, name: shown };
    } else {
      d.customer = {
        id: c.id, name: c.name, firstName: c.firstName, lastName: c.lastName,
        phone: c.phone, profilePhoto: c.profilePhoto,
      };
    }
    return d;
  }

  async findActiveByDriverUserId(userId: string) {
    const rows = await this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.customer', 'customer')
      .innerJoin('d.driver', 'driver')
      .innerJoin('driver.user', 'driverUser')
      .where('driverUser.id = :userId', { userId })
      .andWhere('d.status IN (:...statuses)', {
        statuses: [DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT],
      })
      .orderBy('d.assignedAt', 'DESC')
      .getMany();
    return rows.map((r) => {
      // Own pay lines only, same split as the detail route.
      (r as any).priceBreakdown = breakdownForDriver((r as any).priceBreakdown);
      return this.redactCustomerForDriver(r as any);
    });
  }

  /**
   * Pending deliveries the driver could still pick up. Used by the driver
   * home screen to render an "available jobs" feed. Auto-match runs first
   * so most pending jobs get assigned within seconds; this endpoint exists
   * for the manual-claim path (auto-match failed, no nearby driver, etc.).
   *
   * If `lat`/`lng` are provided, results are sorted by distance ascending
   * using the Haversine formula. Otherwise newest-first.
   */
  /**
   * Available jobs feed (production audit 2026-08-10, three fixes):
   *   1. NO customer PII: the old version leftJoinAndSelect'd the full
   *      customer user row (email, phone, everything) to every browsing
   *      driver. Now the payload is a sanitized job DTO with no
   *      customer object at all: identity is revealed on acceptance.
   *   2. distance_km actually reaches the client: getMany() silently
   *      dropped the raw select, so the app always rendered "? km".
   *   3. youEarnNgn: the driver's NET (delivery.driverEarnings, with a
   *      commission-based fallback), so the card never shows the gross
   *      fare as if it were the driver's pay.
   */
  async findAvailable(lat?: number, lng?: number, radiusKm: number = 25, limit: number = 30, userId?: string) {
    const q = this.repo
      .createQueryBuilder('d')
      .where('d.status = :status', { status: DeliveryStatus.PENDING })
      .andWhere('d.driver IS NULL')
      // Travel Buddy offers are private to their declared driver: the
      // general pool never sees them (founder 2026-08-23).
      .andWhere(
        `(d."tripId" IS NULL OR d."tripId" IN (
           SELECT t."id" FROM "driver_trips" t
             JOIN "drivers" dr ON dr."id" = t."driverId"
             JOIN "users" u ON u."id" = dr."userId"
            WHERE u."id" = :availUserId))`,
        { availUserId: userId ?? '00000000-0000-0000-0000-000000000000' },
      )
      // Only funded bookings reach drivers (paid-dispatch gate 2026-08-16).
      .andWhere('d."paymentHeldAt" IS NOT NULL')
      // Scheduled pickups surface 15 minutes before their slot, not
      // hours early (night-ops build 2026-08-11).
      .andWhere(`(d.scheduledFor IS NULL OR d.scheduledFor <= NOW() + interval '15 minutes')`);

    /**
     * A ride is only offered to the class the passenger booked
     * (2026-08-31, the same founder rule claimByDriver now enforces).
     *
     * Without this the list advertises work the server will refuse: an
     * okada rider sees "RIDE · passenger (Car)", taps in, accepts, and
     * gets an error. Showing a job nobody can take is worse than not
     * showing it.
     *
     * Fails OPEN. If the driver row cannot be resolved the list is
     * unchanged rather than empty, because a rider seeing no work at all
     * is a far worse failure than a rider seeing one they cannot claim.
     * Packages are untouched: vehicle fit is a matching score, not a
     * hard filter, and a rider may judge their own load.
     */
    let driverVehicle: string | null = null;
    let me: any = null;
    if (userId && this.driversService) {
      try {
        me = await this.driversService.findByUserId(userId);
        driverVehicle = me?.vehicleType ?? null;
      } catch { me = null; driverVehicle = null; }
    }
    if (driverVehicle) {
      q.andWhere(`(d."kind" <> 'ride' OR d."vehicleType" = :driverVehicle)`, { driverVehicle });
    }

    /**
     * The rider's own standing limits (2026-08-31).
     *
     * Same two preferences the matcher honours, applied to the browse
     * list so the two ways of getting work agree. A rider who has said
     * they do not leave their state should not have to scroll past runs
     * that do, and a rider with a personal 60 km ceiling should not be
     * shown an 800 km job at all.
     *
     * Both clauses pass a row through when the states are NULL: an
     * unmeasured booking has not been shown to cross a line, and hiding
     * work on a guess costs the rider money for a fact nobody
     * established.
     */
    if (me?.acceptsInterstate === false) {
      q.andWhere(`(
        d."pickupStateCode" IS NULL OR d."dropoffStateCode" IS NULL
        OR d."pickupStateCode" = d."dropoffStateCode"
      )`);
    }
    const personalCapKm = Number(me?.maxTripKm ?? 0);
    if (personalCapKm > 0) {
      q.andWhere(`(d."distanceKm" IS NULL OR d."distanceKm" <= :personalCapKm)`, { personalCapKm });
    }

    const safeLat = Number(lat);
    const safeLng = Number(lng);
    const safeRadius = Math.min(200, Math.max(1, Number(radiusKm)));
    const safeLimit  = Math.min(100, Math.max(1, Number(limit)));

    const hasOrigin =
      !isNaN(safeLat) && !isNaN(safeLng) &&
      safeLat >= -90 && safeLat <= 90 &&
      safeLng >= -180 && safeLng <= 180;

    if (hasOrigin) {
      // Haversine distance from driver to pickup, parameters bound to query.
      q.addSelect(
        `(6371 * acos(LEAST(1, GREATEST(-1,
          cos(radians(:lat)) * cos(radians(d.pickupLat)) *
          cos(radians(d.pickupLng) - radians(:lng)) +
          sin(radians(:lat)) * sin(radians(d.pickupLat))
        )))) AS distance_km`,
      )
        .setParameters({ lat: safeLat, lng: safeLng })
        .andWhere(
          `(6371 * acos(LEAST(1, GREATEST(-1,
            cos(radians(:lat)) * cos(radians(d.pickupLat)) *
            cos(radians(d.pickupLng) - radians(:lng)) +
            sin(radians(:lat)) * sin(radians(d.pickupLat))
          )))) <= ${safeRadius}`,
        )
        .orderBy('distance_km', 'ASC');
    } else {
      q.orderBy('d.createdAt', 'DESC');
    }

    const { entities, raw } = await q.limit(safeLimit).getRawAndEntities();

    return entities.map((d, i) => {
      const price = Number(d.price ?? 0);
      const net   = d.driverEarnings != null
        ? Number(d.driverEarnings)
        : +(price * (1 - PLATFORM_COMMISSION)).toFixed(2);
      const rawDist = raw[i]?.distance_km;
      return {
        id:             d.id,
        trackingCode:   d.trackingCode,
        pickupAddress:  d.pickupAddress,
        dropoffAddress: d.dropoffAddress,
        /**
         * Package or person (2026-08-31).
         *
         * The driver home card has branched on `kind` since Book-a-Ride
         * shipped, colouring the row and reading "RIDE · passenger", and
         * this payload never sent the field. The branch was therefore
         * always false and every waiting passenger was rendered in the
         * open-jobs list as a parcel: no label, no colour, just a vehicle
         * name. The job screen behind it always knew, so a rider found
         * out one tap in rather than while scanning the list, which is
         * the surface they actually triage on.
         */
        kind:           (d as any).kind ?? 'package',
        packageSize:    d.packageSize ?? null,
        vehicleType:    d.vehicleType ?? null,
        urgency:        (d as any).urgency ?? null,
        status:         d.status,
        /**
         * Where the run goes, not just where it starts (2026-08-31).
         *
         * The list showed one number, the straight line from the driver
         * to the PICKUP, and the card rendered it beside a clock. So a
         * Lagos to Kano parcel and a Lagos to Yaba parcel both read
         * "3.2 km" and looked like the same afternoon's work. A rider
         * had no way to tell an 800 km commitment from a local drop
         * without opening it.
         *
         * tripKm is the run's own measured road distance, kept separate
         * from distanceKm above rather than replacing it, because both
         * are things a rider needs: how far to start, and how far in
         * total.
         */
        tripKm:           d.distanceKm != null ? +Number(d.distanceKm).toFixed(1) : null,
        pickupStateCode:  (d as any).pickupStateCode  ?? null,
        dropoffStateCode: (d as any).dropoffStateCode ?? null,
        // Names, not just codes: "LA to KN" is a puzzle, "Lagos to Kano"
        // is the decision the rider is actually making.
        pickupStateName:  getState((d as any).pickupStateCode)?.name  ?? null,
        dropoffStateName: getState((d as any).dropoffStateCode)?.name ?? null,
        zoneTier:         (d as any).zoneTier ?? null,
        /**
         * Null, not false, when the states are unknown. A row booked
         * before the columns existed is not a domestic run, it is a run
         * nobody measured, and the app must be able to say nothing
         * rather than say "same state" on no evidence.
         */
        isInterState:     ((d as any).pickupStateCode && (d as any).dropoffStateCode)
                            ? (d as any).pickupStateCode !== (d as any).dropoffStateCode
                            : null,
        priceNgn:       price,
        youEarnNgn:     net,
        distanceKm:     rawDist != null ? +Number(rawDist).toFixed(1) : null,
        createdAt:      d.createdAt,
      };
    });
  }

  // Return the customer's most-used pickup + dropoff addresses in the last
  // 90 days, ranked by frequency then most-recently-used. Includes
  // coordinates so the client can drop straight into the map picker with
  // a pre-selected lat/lng. Powers the Saved Addresses suggestions strip.
  async frequentAddresses(customerId: string) {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [pickups, dropoffs] = await Promise.all([
      this.repo.createQueryBuilder('d')
        .select('d.pickupAddress', 'address')
        .addSelect('d.pickupLat',  'lat')
        .addSelect('d.pickupLng',  'lng')
        .addSelect('COUNT(*)',     'count')
        .addSelect('MAX(d.createdAt)', 'lastUsed')
        .where('d.customerId = :uid', { uid: customerId })
        .andWhere('d.createdAt >= :since', { since: cutoff })
        .andWhere('d.pickupAddress IS NOT NULL')
        .groupBy('d.pickupAddress')
        .addGroupBy('d.pickupLat')
        .addGroupBy('d.pickupLng')
        .orderBy('count', 'DESC')
        .addOrderBy('"lastUsed"', 'DESC')
        .limit(5)
        .getRawMany()
        .catch(() => []),
      this.repo.createQueryBuilder('d')
        .select('d.dropoffAddress', 'address')
        .addSelect('d.dropoffLat',  'lat')
        .addSelect('d.dropoffLng',  'lng')
        .addSelect('COUNT(*)',      'count')
        .addSelect('MAX(d.createdAt)', 'lastUsed')
        .where('d.customerId = :uid', { uid: customerId })
        .andWhere('d.createdAt >= :since', { since: cutoff })
        .andWhere('d.dropoffAddress IS NOT NULL')
        .groupBy('d.dropoffAddress')
        .addGroupBy('d.dropoffLat')
        .addGroupBy('d.dropoffLng')
        .orderBy('count', 'DESC')
        .addOrderBy('"lastUsed"', 'DESC')
        .limit(5)
        .getRawMany()
        .catch(() => []),
    ]);

    const shape = (rows: any[]) => rows.map((r) => ({
      address:  r.address,
      lat:      r.lat  != null ? Number(r.lat)  : null,
      lng:      r.lng  != null ? Number(r.lng)  : null,
      count:    Number(r.count),
      lastUsed: r.lastUsed,
    }));

    return {
      pickups:  shape(pickups),
      dropoffs: shape(dropoffs),
    };
  }

  // Community pulse: aggregate counts across all users for the "everyone
  // is using SEIRS" social-proof card. Cheap group-by, no PII exposed.
  private pulseCache: { at: number; data: any } | null = null;
  async communityPulse() {
    const now = Date.now();
    // Serve from memory cache when fresh (5 min). This endpoint gets hit
    // on every Rewards tab load so we don't want to run the same query
    // 100 times a minute.
    if (this.pulseCache && (now - this.pulseCache.at) < 5 * 60 * 1000) {
      return this.pulseCache.data;
    }

    const weekAgo  = new Date(now - 7  * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [deliveriesThisWeek, deliveriesThisMonth, activeCustomersThisWeek] = await Promise.all([
      this.repo.count({ where: { createdAt: MoreThan(weekAgo) as any, status: DeliveryStatus.DELIVERED } }).catch(() => 0),
      this.repo.count({ where: { createdAt: MoreThan(monthAgo) as any, status: DeliveryStatus.DELIVERED } }).catch(() => 0),
      this.repo.createQueryBuilder('d')
        .select('COUNT(DISTINCT d.customerId)', 'c')
        .where('d.createdAt >= :since', { since: weekAgo })
        .getRawOne()
        .then((r: any) => Number(r?.c ?? 0))
        .catch(() => 0),
    ]);

    const data = {
      deliveriesThisWeek,
      deliveriesThisMonth,
      activeCustomersThisWeek,
      generatedAt: new Date(now).toISOString(),
    };
    this.pulseCache = { at: now, data };
    return data;
  }

  // Admin-set featured promotion for the Rewards tab. Stored in
  // platform_config with key 'featured_promotion' as a JSON string:
  //   {"type":"discount_500","label":"₦500 off","desc":"...","expiresAt":"..."}
  // Returns null when unset OR expired so client falls back to nothing.
  async getFeaturedPromotion(): Promise<null | {
    type: string; label: string; desc: string; expiresAt: string | null;
  }> {
    try {
      const rows = await this.repo.manager
        .createQueryBuilder()
        .select('value')
        .from('platform_config', 'c')
        .where("c.key = 'featured_promotion'")
        .getRawOne();
      if (!rows?.value) return null;
      const parsed = JSON.parse(rows.value);
      if (parsed?.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async findByTracking(trackingCode: string) {
    /**
     * Per-package codes (SRS-XXXXXXXX, multi-package rebuild 2026-08-16)
     * resolve to their stop first, then the parent run: the receiver of
     * package 3 tracks THEIR parcel without borrowing the sender's run
     * code or seeing the other receivers' details.
     */
    const raw = String(trackingCode ?? '').trim().toUpperCase();
    let packageStop: DeliveryStop | null = null;
    let delivery: Delivery | null;
    // SRS- is the package family. A run code is SEIRS-, which does not
    // start with SRS-, so there is no ambiguity; the older SRS-P- codes
    // already issued match this too.
    if (raw.startsWith('SRS-')) {
      packageStop = await this.repo.manager
        .getRepository(DeliveryStop)
        .findOne({ where: { packageTrackingCode: raw } });
      delivery = packageStop
        ? await this.repo.findOne({
            where: { id: packageStop.deliveryId },
            relations: ['driver', 'driver.user'],
          })
        /**
         * An SRS- code is not proof of a stop.
         *
         * Runs booked before the multi-package rebuild carry an SRS- code
         * of their own on the delivery, with no delivery_stops row behind
         * it. Treating the prefix as proof made this throw "Package not
         * found" for every one of them, so the Track Package screen could
         * not track a single delivery on such an account: the code shown
         * on the customer's own Trip Details came back "no delivery found
         * with that code" (device QA 2026-08-19). Fall back to the run's
         * own code before giving up. A miss on both is still a 404.
         */
        : await this.repo.findOne({
            where: { trackingCode: raw },
            relations: ['driver', 'driver.user'],
          });
    } else {
      delivery = await this.repo.findOne({
        where: { trackingCode },
        relations: ['driver', 'driver.user'],
      });
    }
    if (!delivery) throw new NotFoundException('Delivery not found.');

    // Attach the event log inline. Kept oldest-first so the client can
    // render a timeline without re-sorting. Cheap indexed scan on
    // (deliveryId, createdAt). We DO NOT reveal PII (email, phone) here:
    // the tracking endpoint is public, so we return only the driver's
    // display name + vehicle.
    let events: any[] = [];
    try {
      if (this.deliveryEventsRepo) {
        events = await this.deliveryEventsRepo
          .createQueryBuilder('e')
          .where('e."deliveryId" = :id', { id: delivery.id })
          .orderBy('e."createdAt"', 'ASC')
          .getMany();
      }
    } catch { /* self-heal race, no events yet */ }

    // Also fold in handoff records (chain-of-custody entries from the
    // identity module) as HANDOFF-typed events. Kept as a read-time
    // merge to avoid write coupling: the handoff module keeps writing
    // to handoff_records the way it always has, and the tracking view
    // synthesises the timeline. Cheap raw SQL, indexed on deliveryId.
    try {
      const handoffs: any[] = await this.repo.manager.query(
        `SELECT id, stage, method, "fromUserId", "toUserId",
                "signatureName", "proofPhotoUrl", "createdAt"
           FROM handoff_records
          WHERE "deliveryId" = $1
          ORDER BY "createdAt" ASC`,
        [delivery.id],
      );
      for (const h of handoffs) {
        events.push({
          id:          `handoff:${h.id}`,
          type:        'handoff',
          actorRole:   'partner',
          description: describeHandoffStage(h.stage),
          lat:         null,
          lng:         null,
          meta:        {
            stage:         h.stage,
            method:        h.method,
            signatureName: h.signatureName,
            photoUrl:      h.proofPhotoUrl,
          },
          createdAt:   h.createdAt,
        });
      }
      // Re-sort so the merged timeline is chronological.
      events.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } catch { /* handoff_records may not exist yet on very old databases */ }

    // Verified Pro badge: PAUSED with the whole Premium program
    // (founder decision 2026-08-10). Always false until Premium is
    // deliberately revived; the subscription lookup stays here,
    // commented, for that day.
    // const rows = await this.repo.manager.query(
    //   `SELECT status FROM driver_subscriptions WHERE "driverId" = $1 LIMIT 1`, [delivery.driver.id]);
    const driverIsPro = false;

    const publicDriver = delivery.driver
      ? {
          name:        delivery.driver.user?.name ?? 'Driver',
          vehicleType: delivery.driver.vehicleType ?? null,
          rating:      delivery.driver.rating ?? null,
          verifiedPro: driverIsPro,
          // Ride trust card (founder 2026-08-23): the passenger sees the
          // plate and the very vehicle photo the driver registered with.
          // Drivers are always fully identified: that is the deal.
          vehiclePlate:    delivery.driver.vehiclePlate ?? null,
          vehiclePhotoUrl: delivery.driver.vehiclePhotoUrl ?? null,
        }
      : null;

    // Uber-style live ETA: derived from the driver's last known GPS +
    // vehicle-tuned Lagos speeds. Free (no Google Directions), and
    // deliberately never surfaced as an SLA or refund trigger per the
    // no-time-guarantee rule. Null when the delivery is terminal or we
    // do not yet have a location fix from the driver.
    const driverLat = delivery.driver?.lastLat  ?? null;
    const driverLng = delivery.driver?.lastLng  ?? null;
    const etaMinutes = computeEtaMinutes(delivery, driverLat, driverLng);

    // Pay-to-release (founder 2026-08-11): a failed delivery rerouted to
    // a partner store keeps the store's identity + location hidden until
    // the redirect fee is settled. The public tracking payload is the
    // reveal surface, so the mask lives here.
    // Locked only when the RECEIVER owes it. A sender who chose to send
    // their own package to a counter is not hidden from their own
    // package; they are simply billed the handling fee.
    const feeLocked =
      Number(delivery.redirectFeeNgn ?? 0) > 0 &&
      !delivery.redirectFeePaidAt &&
      delivery.redirectFeePayer !== 'sender';

    return {
      id:             delivery.id,
      trackingCode:   delivery.trackingCode,
      status:         delivery.status,
      // Rides read a different status ladder on the tracking screen.
      kind:           (delivery as any).kind ?? 'package',
      // Unpaid bookings must not pretend anyone is looking for a rider:
      // dispatch only sees paid work. The tracking page uses this to say
      // "waiting for payment" instead of inventing progress.
      awaitingPayment: !delivery.paymentHeldAt && delivery.status === 'pending',
      // Scoped package view when tracked by a per-package code: first name
      // only (public endpoint), the package's own photo/description and
      // ITS stop timeline rather than the whole manifest's.
      package: packageStop
        ? {
            code:               packageStop.packageTrackingCode,
            sequenceOrder:      packageStop.sequenceOrder,
            description:        packageStop.packageDescription ?? null,
            photoUrl:           Array.isArray(packageStop.packagePhotoUrls) ? (packageStop.packagePhotoUrls[0] ?? null) : null,
            status:             packageStop.status,
            recipientFirstName: (packageStop.recipientName ?? '').split(' ')[0] || null,
            address:            packageStop.address,
            arrivedAt:          packageStop.arrivedAt ?? null,
            deliveredAt:        packageStop.deliveredAt ?? null,
          }
        : null,
      pickupAddress:  delivery.pickupAddress,
      // The pickup's coordinates, so the tracking map can draw where the
      // package started. The payload has always returned pickupAddress
      // in full and never its coordinates, which left the customer map
      // able to plot only the destination (device QA 2026-08-19).
      // Unconditional, matching pickupAddress: the fee lock below hides
      // where the package WENT, not where it came from, and the address
      // is already public on this endpoint so the coordinates reveal
      // nothing further.
      pickupLat:      delivery.pickupLat != null ? Number(delivery.pickupLat) : null,
      pickupLng:      delivery.pickupLng != null ? Number(delivery.pickupLng) : null,
      dropoffAddress: feeLocked
        ? 'SEIRS Partner Store (settle the redirect fee to reveal the pickup location)'
        : delivery.dropoffAddress,
      // Coords power the customer's redirect-to-store picker (stores
      // sorted nearest to the ACTUAL dropoff, not the customer's phone).
      dropoffLat:     feeLocked ? null : (delivery.dropoffLat != null ? Number(delivery.dropoffLat) : null),
      dropoffLng:     feeLocked ? null : (delivery.dropoffLng != null ? Number(delivery.dropoffLng) : null),
      // Failed-delivery window state for the customer app's response
      // sheet + the driver app's waiting view.
      arrivalIssueAt:     delivery.arrivalIssueAt ?? null,
      senderResponseBy:   delivery.senderResponseBy ?? null,
      arrivalResolution:  delivery.arrivalResolution ?? null,
      redirectFeeOwedNgn: feeLocked ? Number(delivery.redirectFeeNgn) : null,
      packageSize:    delivery.packageSize,
      vehicleType:    delivery.vehicleType,
      assignedAt:     delivery.assignedAt,
      pickedUpAt:     delivery.pickedUpAt,
      deliveredAt:    delivery.deliveredAt,
      createdAt:      delivery.createdAt,
      // Proof photo is deliberately absent from the public payload
      // (founder 2026-08-12). It is dispute evidence for admin, and it
      // usually shows the recipient's gate or door, so it does not
      // belong on a page anyone holding a forwarded code can open.
      // Delivered/undelivered is still visible via status.
      driver:         publicDriver,
      etaMinutes:     etaMinutes,
      etaAsOf:        etaMinutes != null ? new Date().toISOString() : null,
      // High-value flag only, never the amount: the public tracking
      // page must not advertise what a package is worth. Drives the
      // driver app's mandatory Verify Recipient step, and on the
      // tracking page it reads as a security feature.
      requiresRecipientVerification:
        Number(delivery.declaredValueNgn ?? 0) > 0 &&
        Number(delivery.declaredValueNgn) >= await this.getHighValueThreshold(),
      events:         events.map(e => ({
        id:          e.id,
        type:        e.type,
        actorRole:   e.actorRole,
        description: e.description,
        lat:         e.lat != null ? Number(e.lat) : null,
        lng:         e.lng != null ? Number(e.lng) : null,
        meta:        publicSafeEventMeta(e.meta),
        createdAt:   e.createdAt,
      })),
    };
  }

  /**
   * Mid-flight redirect (gap 2, 2026-08-09): the customer moves the
   * drop-off to a partner store while the package is already moving.
   * Classic rescue: "recipient is not home, leave it at the Yaba
   * store instead."
   *
   * Rules:
   *   - Customer of the delivery only.
   *   - Allowed while status is assigned / picked_up / in_transit.
   *   - The destination store must be approved + accepting + not full
   *     (checked via raw query against partner_stores; loose coupling,
   *     no module import cycle).
   *   - A flat redirect fee from the Fee Catalogue is recorded on the
   *     event (charged in-app; fee collection follows the same owed
   *     model as return-to-sender until tokenized charging lands).
   *   - Driver is notified through the chat system message + WS.
   */
  // ── Failed-delivery flow (founder matrix 2026-08-11) ─────────────────
  // Driver reports nobody-home. Sender gets the catalogue window to respond with a
  // choice; silence resolves to the booked fallback, with high-value
  // packages always redirecting to the nearest partner store.

  // Fallback only. The live value is sender_response_window_minutes in
  // the Fee Catalogue. This used to be a hardcoded 5 while the catalogue
  // row said 15, so the dashboard contradicted production instead of
  // driving it (founder, 2026-08-21).
  private static readonly ARRIVAL_WINDOW_MIN_FALLBACK = 15;

  private async getArrivalWindowMin(): Promise<number> {
    const raw = this.feesServiceRef
      ? await this.feesServiceRef.getValueOr(
          'sender_response_window_minutes',
          DeliveriesService.ARRIVAL_WINDOW_MIN_FALLBACK,
        )
      : DeliveriesService.ARRIVAL_WINDOW_MIN_FALLBACK;
    const n = Number(raw);
    // A zero or negative window would resolve every delivery instantly.
    return Number.isFinite(n) && n >= 1
      ? n
      : DeliveriesService.ARRIVAL_WINDOW_MIN_FALLBACK;
  }

  async reportArrivalIssue(deliveryId: string, driverUserId: string) {
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['driver', 'driver.user', 'customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.driver?.user?.id !== driverUserId) {
      throw new NotFoundException('Delivery not found.'); // no oracle
    }
    if (!['picked_up', 'in_transit'].includes(String(delivery.status))) {
      const { BadRequestException } = await import('@nestjs/common');
      throw new BadRequestException('Report nobody-home only while carrying the package.');
    }
    if (delivery.arrivalIssueAt && delivery.senderResponseBy && new Date(delivery.senderResponseBy) > new Date()) {
      return { senderResponseBy: delivery.senderResponseBy, alreadyOpen: true };
    }

    const windowMin = await this.getArrivalWindowMin();
    const senderResponseBy = new Date(Date.now() + windowMin * 60 * 1000);
    await this.repo.update(deliveryId, {
      arrivalIssueAt: new Date(),
      senderResponseBy,
      arrivalResolution: null,
    } as any);

    this.logEvent(deliveryId, DeliveryEventType.STATUS_CHANGE, EventActorRole.DRIVER, {
      actorUserId: driverUserId,
      description: `Driver arrived: receiver not available. Sender has ${windowMin} minutes to respond.`,
      meta: { kind: 'arrival_no_receiver' },
    }).catch(() => {});

    if (this.notificationsService && delivery.customer?.id) {
      this.notificationsService.create(
        delivery.customer.id,
        'Driver is at the door: nobody to receive',
        `Your driver arrived for ${delivery.trackingCode} but nobody is available. Open the app within ${windowMin} minutes to choose: wait, neighbour, gate, or partner store. Silence = your booked fallback.`,
        'status_update',
        delivery.id,
        delivery.trackingCode,
      ).catch(() => {});
    }
    if (this.chatService) {
      this.chatService
        .insertSystemMessage(deliveryId, 'status', `Driver reports nobody available to receive. Sender has ${windowMin} minutes to respond before the fallback applies.`)
        .catch(() => {});
    }
    if (this.trackingGateway) this.trackingGateway.broadcastStatusChange(deliveryId, delivery.status);

    return { senderResponseBy, windowMinutes: windowMin };
  }

  async respondToArrivalIssue(deliveryId: string, customerId: string, action: string) {
    const { BadRequestException } = await import('@nestjs/common');
    const delivery = await this.repo.findOne({ where: { id: deliveryId }, relations: ['customer'] });
    if (!delivery || delivery.customer?.id !== customerId) {
      throw new NotFoundException('Delivery not found.');
    }
    if (!delivery.arrivalIssueAt) {
      throw new BadRequestException('No open arrival issue on this delivery.');
    }
    if (delivery.arrivalResolution) {
      throw new BadRequestException('This arrival was already resolved.');
    }
    const allowed = ['wait', 'neighbour', 'gate', 'store'];
    if (!allowed.includes(action)) throw new BadRequestException('Unknown action.');

    // High-value: gate/neighbour are never acceptable (founder policy).
    if (Number(delivery.declaredValueNgn ?? 0) > 0) {
      const threshold = await this.getHighValueThreshold();
      if (Number(delivery.declaredValueNgn) >= threshold && (action === 'gate' || action === 'neighbour')) {
        throw new BadRequestException('High-value packages cannot go to the gate or a neighbour. Choose wait or partner store.');
      }
    }

    if (action === 'store') {
      await this.autoRedirectToNearestStore(delivery, 'store');
    } else {
      await this.repo.update(deliveryId, { arrivalResolution: action } as any);
    }

    this.logEvent(deliveryId, DeliveryEventType.STATUS_CHANGE, EventActorRole.CUSTOMER, {
      actorUserId: customerId,
      description: `Sender responded to arrival issue: ${action}`,
      meta: { kind: 'arrival_response', action },
    }).catch(() => {});

    if (this.chatService) {
      const msg = {
        wait:      'Sender says: receiver is coming, please wait a moment.',
        neighbour: `Sender says: leave it with the neighbour${delivery.fallbackNeighbourName ? ` (${delivery.fallbackNeighbourName})` : ''}. Take a photo.`,
        gate:      'Sender says: leave it at the gate with a photo. Sender accepts the risk.',
        store:     'Sender says: take it to the assigned partner store.',
      }[action];
      if (msg) this.chatService.insertSystemMessage(deliveryId, 'status', msg).catch(() => {});
    }
    if (this.trackingGateway) this.trackingGateway.broadcastStatusChange(deliveryId, delivery.status);

    return { resolved: action };
  }

  // Silence resolves the window: booked fallback for normal packages,
  // nearest partner store for high-value or hand-only bookings.
  @Cron(CronExpression.EVERY_MINUTE)
  async resolveExpiredArrivalWindows() {
    try {
      const due = await this.repo
        .createQueryBuilder('d')
        .leftJoinAndSelect('d.customer', 'customer')
        .where('d.arrivalIssueAt IS NOT NULL')
        .andWhere('d.arrivalResolution IS NULL')
        .andWhere('d.senderResponseBy < NOW()')
        .andWhere(`d.status IN ('picked_up', 'in_transit')`)
        .take(20)
        .getMany();

      for (const d of due) {
        let resolution = d.fallbackPref ?? 'hand_only';
        const declared = Number(d.declaredValueNgn ?? 0);
        if (declared > 0) {
          const threshold = await this.getHighValueThreshold();
          if (declared >= threshold) resolution = 'store';
        }
        // Food cannot be stored. A perishable parcel at a counter is
        // worthless within hours and a health liability after that, so it
        // never enters the storage machine at all.
        const category = String(d.categoryCode ?? '');
        if (category === 'food_hot' || category === 'food_cold') {
          const maxHours = this.feesServiceRef
            ? Number(await this.feesServiceRef.getValueOr('perishable_max_hours', 3))
            : 3;
          await this.repo.update(d.id, { arrivalResolution: 'perishable' } as any);
          this.logEvent(d.id, DeliveryEventType.ADMIN_NOTE, EventActorRole.SYSTEM, {
            description: `Perishable parcel could not be delivered. It cannot be stored, so it must be resolved within ${maxHours} hours.`,
            meta: { kind: 'perishable_unresolved', maxHours, categoryCode: category },
          }).catch(() => {});
          if (this.chatService) {
            this.chatService
              .insertSystemMessage(d.id, 'status', `No response from sender and this is a perishable order. It cannot be left at a counter: contact support now.`)
              .catch(() => {});
          }
          continue;
        }

        if (resolution === 'hand_only' || resolution === 'store') {
          await this.autoRedirectToNearestStore(d, 'auto_store').catch(async (e) => {
            this.logger.warn(`auto-redirect failed for ${d.id}: ${e?.message ?? e}; leaving window open`);
            // Push the window forward so the sweep retries rather than
            // hammering every minute forever.
            await this.repo.update(d.id, { senderResponseBy: new Date(Date.now() + 10 * 60 * 1000) } as any);
          });
        } else {
          await this.repo.update(d.id, { arrivalResolution: resolution } as any);
          if (this.chatService) {
            const msg = resolution === 'neighbour'
              ? `No response from sender: booked fallback applies. Leave with the neighbour${d.fallbackNeighbourName ? ` (${d.fallbackNeighbourName})` : ''} and take a photo.`
              : 'No response from sender: booked fallback applies. Leave at the gate and take a photo.';
            this.chatService.insertSystemMessage(d.id, 'status', msg).catch(() => {});
          }
        }
      }
    } catch (e: any) {
      this.logger.warn(`arrival-window sweep failed: ${e?.message ?? e}`);
    }
  }

  /**
   * What rerouting this package to a counter actually costs.
   *
   * A flat fee is wrong in both directions: it overcharges a 600 metre
   * detour and badly undercharges an 8 km one. This prices the detour
   * the rider really rides, on the same rate card the original fare came
   * from, plus what the counter is paid to take the package in.
   *
   * failed_delivery_redirect_fee survives as a FLOOR rather than the
   * price, which is the one thing a flat fee was good for: a very short
   * detour still has to be worth a rider stopping for.
   */
  /**
   * What a rider is owed for a trip that could not complete.
   *
   * Flat base plus fuel for the distance they actually rode, which
   * driverAcceptedDistanceKm now proves rather than leaving to a claim.
   * Without a floor like this, a rider who reports a misdescribed parcel
   * earns nothing for the trip, and the rational rider learns to accept
   * bad parcels quietly instead of reporting them.
   */
  private async computeFailedTripPay(delivery: Delivery): Promise<number> {
    const base = this.feesServiceRef
      ? Number(await this.feesServiceRef.getValueOr('driver_failed_trip_base_ngn', 200))
      : 200;
    const km = Number(delivery.driverAcceptedDistanceKm ?? 0);
    if (!Number.isFinite(km) || km <= 0) return Math.round(base);
    try {
      const card = await this.rateCardPricing.getActiveRateCard();
      const region = this.rateCardPricing.resolveRegion(card, null);
      const fuelKm = Number(
        this.rateCardPricing.fuelPerKm(card, String(delivery.vehicleType), region) ?? 0,
      );
      return Math.round(base + km * (Number.isFinite(fuelKm) ? fuelKm : 0));
    } catch {
      return Math.round(base);
    }
  }

  private async computeRedirectFee(delivery: Delivery, detourKm: number): Promise<number> {
    const floor = this.feesServiceRef
      ? Number(await this.feesServiceRef.getValueOr('failed_delivery_redirect_fee', 1000))
      : 1000;
    const intake = this.feesServiceRef
      ? Number(await this.feesServiceRef.getValueOr('partner_store_handling_ngn', 500))
      : 500;

    const km = Number(detourKm);
    if (!Number.isFinite(km) || km < 0) return Math.round(floor);

    try {
      const card = await this.rateCardPricing.getActiveRateCard();
      const vehicle = String(delivery.vehicleType);
      // Region matters: Lagos runs 110/km against a national 100, so
      // pricing a Lagos detour at the national rate underpays the rider.
      const state =
        delivery.dropoffLat != null && delivery.dropoffLng != null
          ? detectStateFromCoords(Number(delivery.dropoffLat), Number(delivery.dropoffLng))
          : null;
      const region = this.rateCardPricing.resolveRegion(card, state);

      // labourPerKmCustomer is the stable, admin-tuned part of the
      // per-km rate; fuel is computed separately and added below.
      const perKm = Number(
        (card as any)?.vehicleRates?.[vehicle]?.labourPerKmCustomer ?? 0,
      ) * Number((region as any)?.rateMultiplier ?? 1);
      const fuelPerKm = Number(this.rateCardPricing.fuelPerKm(card, vehicle, region) ?? 0);

      const labour = km * (Number.isFinite(perKm) ? perKm : 0);
      const fuel   = km * (Number.isFinite(fuelPerKm) ? fuelPerKm : 0);
      const cost   = labour + fuel + intake;

      return Math.round(Math.max(cost, floor));
    } catch (e: any) {
      this.logger.warn(`redirect fee: falling back to the flat floor: ${e?.message ?? e}`);
      return Math.round(floor);
    }
  }

  /**
   * A rider reported a problem and support never answered.
   *
   * reportIssue flags the delivery and opens a ticket, and until now
   * nothing ever timed out. A rider standing at a pickup with a parcel
   * that is not what was described could wait indefinitely on an agent,
   * which is exactly the situation admin_redirect_timeout_minutes exists
   * to bound. After the timeout the rider is released from the job and
   * the delivery is escalated rather than left open.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async escalateUnansweredDisputes() {
    try {
      const timeoutMin = this.feesServiceRef
        ? Number(await this.feesServiceRef.getValueOr('admin_redirect_timeout_minutes', 30))
        : 30;
      const cutoff = new Date(Date.now() - Math.max(5, timeoutMin) * 60 * 1000);

      const stale = await this.repo
        .createQueryBuilder('d')
        .leftJoinAndSelect('d.customer', 'customer')
        .where('d.disputedAt IS NOT NULL')
        .andWhere('d.disputedAt < :cutoff', { cutoff })
        .andWhere('d.disputeEscalatedAt IS NULL')
        .andWhere(`d.status NOT IN ('delivered', 'cancelled')`)
        .take(20)
        .getMany();

      for (const d of stale) {
        await this.repo.update(d.id, { disputeEscalatedAt: new Date() } as any);

        this.logEvent(d.id, DeliveryEventType.ADMIN_NOTE, EventActorRole.SYSTEM, {
          description: `Rider reported a problem ${timeoutMin} minutes ago with no support decision. Escalated.`,
          meta: { kind: 'dispute_escalated', timeoutMin, reason: d.disputeReason },
        }).catch(() => {});

        if (this.notificationsService && d.customer?.id) {
          this.notificationsService.create(
            d.customer.id,
            'We are still looking at your package',
            `The rider raised a problem with ${d.trackingCode} and it is taking us longer than usual. Support will contact you.`,
            'status_update',
            d.id,
            d.trackingCode,
          ).catch(() => {});
        }
      }

      if (stale.length) {
        this.logger.warn(`Escalated ${stale.length} unanswered rider dispute(s)`);
      }
    } catch (e: any) {
      this.logger.warn(`dispute escalation sweep failed: ${e?.message ?? e}`);
    }
  }

  // Nearest approved store to the delivery's dropoff becomes the new
  // destination; the redirect fee is recorded and the tracking payload
  // masks the store until it is settled (pay-to-release).
  private async autoRedirectToNearestStore(delivery: Delivery, resolution: 'store' | 'auto_store') {
    const { BadRequestException } = await import('@nestjs/common');
    if (delivery.dropoffLat == null || delivery.dropoffLng == null) {
      throw new BadRequestException('Delivery has no dropoff coordinates.');
    }
    const stores: any[] = await this.repo.manager.query(
      `SELECT id, "storeName", "storeAddress", "storeLat", "storeLng",
              (6371 * acos(LEAST(1, GREATEST(-1,
                cos(radians($1)) * cos(radians("storeLat")) *
                cos(radians("storeLng") - radians($2)) +
                sin(radians($1)) * sin(radians("storeLat"))
              )))) AS distance_km
         FROM partner_stores
        WHERE status IN ('approved', 'active') AND "acceptingNew" = true
          AND "storeLat" IS NOT NULL AND "storeLng" IS NOT NULL
        ORDER BY distance_km ASC
        LIMIT 3`,
      [Number(delivery.dropoffLat), Number(delivery.dropoffLng)],
    );
    if (!stores.length) throw new BadRequestException('No partner store available nearby.');

    // Straight line got us three candidates cheaply. Road distance
    // decides between them, because in Lagos the nearest store as the
    // crow flies can be across water with no crossing.
    let store = stores[0];
    let detourKm = Number(store.distance_km ?? 0);
    try {
      const measured = await Promise.all(
        stores.map(async (c: any) => ({
          store: c,
          km: (
            await this.routeDistance.getRoadDistance(
              Number(delivery.dropoffLat),
              Number(delivery.dropoffLng),
              Number(c.storeLat),
              Number(c.storeLng),
            )
          ).km,
        })),
      );
      measured.sort((a, b) => a.km - b.km);
      store = measured[0].store;
      detourKm = measured[0].km;
    } catch (e: any) {
      // Falling back to the haversine winner is worse but still correct
      // enough to put the package somewhere safe, which beats leaving a
      // rider holding it because a maps call failed.
      this.logger.warn(
        `redirect: road-distance check failed, using straight-line nearest: ${e?.message ?? e}`,
      );
    }

    const fee = await this.computeRedirectFee(delivery, detourKm);
    const prevAddress = delivery.dropoffAddress;

    await this.repo.update(delivery.id, {
      dropoffAddress:    `${store.storeName}, ${store.storeAddress}`,
      dropoffLat:        store.storeLat != null ? Number(store.storeLat) : delivery.dropoffLat,
      dropoffLng:        store.storeLng != null ? Number(store.storeLng) : delivery.dropoffLng,
      arrivalResolution: resolution,
      redirectFeeNgn:    fee,
      redirectFeePayer:  'receiver',
    } as any);

    this.logEvent(delivery.id, DeliveryEventType.ADMIN_NOTE, EventActorRole.SYSTEM, {
      description: `Failed delivery rerouted to partner store ${store.storeName} (${detourKm.toFixed(1)} km by road from drop-off). Redirect fee ₦${fee} owed.`,
      meta: { kind: 'auto_redirect_store', storeId: store.id, prevAddress, feeNgn: fee, resolution },
    }).catch(() => {});

    if (this.chatService) {
      this.chatService
        .insertSystemMessage(delivery.id, 'status', `Take the package to ${store.storeName}, ${store.storeAddress}. The receiver collects it there after settling the redirect fee.`)
        .catch(() => {});
    }
    if (this.notificationsService && delivery.customer?.id) {
      this.notificationsService.create(
        delivery.customer.id,
        'Package rerouted to a partner store',
        `Nobody was available for ${delivery.trackingCode}, so it is heading to a nearby SEIRS partner store for safe keeping. A redirect fee of ₦${fee.toLocaleString()} plus any storage days applies: settle it in the app to see the pickup location and collection details.`,
        'status_update',
        delivery.id,
        delivery.trackingCode,
      ).catch(() => {});
    }

    // The receiver has to go and collect this and owes the fee on it, and
    // they have no SEIRS account, so the push above never reaches them.
    // No SMS at launch, so WhatsApp is the channel. No-ops silently when
    // WhatsApp is not configured.
    const receiverPhone = (delivery as any).receiverPhone;
    if (receiverPhone) {
      const site = process.env.PUBLIC_SITE_URL ?? 'https://seirs.app';
      this.whatsapp
        .notifyPackageAtCounter(
          receiverPhone,
          delivery.trackingCode,
          fee,
          `${site}/collect/${delivery.trackingCode}`,
        )
        .catch(() => { /* messaging must never break a transition */ });
    }

    if (this.trackingGateway) this.trackingGateway.broadcastStatusChange(delivery.id, delivery.status);
  }

  /**
   * Start payment for an outstanding failed-delivery redirect fee
   * (founder matrix 2026-08-11: "they will have to pay before they see
   * the location"). Sender-only; the payment path itself validates the
   * amount and refuses double-payment.
   */
  /**
   * Settle a collection fee from the public tracking link.
   *
   * The receiver is the one person in this system with no account and no
   * app, and they are exactly who owes this money. Before this the only
   * way to pay was inside the customer app as the sender, so a receiver
   * could read "settle the fee to reveal the pickup location" on the
   * tracking page and have no way to do it.
   *
   * No auth on purpose: possession of the tracking code is the only
   * claim anyone needs to PAY a fee, and paying it reveals nothing to
   * the payer that the tracking page does not already show once settled.
   * Contact details are optional and only ever used for the receipt.
   */
  async startCollectionPayment(
    code: string,
    contact?: { email?: string; name?: string; phone?: string },
  ) {
    const { BadRequestException } = await import('@nestjs/common');
    const delivery = await this.repo.findOne({
      where: { trackingCode: code },
      relations: ['customer'],
    });
    if (!delivery) throw new NotFoundException('No package found for that code.');

    const owed = Number(delivery.redirectFeeNgn ?? 0);
    if (!(owed > 0)) {
      throw new BadRequestException('Nothing is owed on this package.');
    }
    if (delivery.redirectFeePaidAt) {
      throw new BadRequestException('This has already been paid. Show your code at the counter.');
    }
    if (!this.paymentsService) {
      throw new NotFoundException('Payments are unavailable right now.');
    }

    // Flutterwave needs a payer identity. Use whatever the receiver gave
    // us and fall back to the sender's, so a receipt always reaches a
    // real person.
    const payer = {
      email: (contact?.email ?? '').trim() || delivery.customer?.email,
      name:  (contact?.name  ?? '').trim() || delivery.customer?.name,
      phone: (contact?.phone ?? '').trim() || delivery.customer?.phone || '',
    };
    if (!payer.email) {
      throw new BadRequestException('Enter an email so we can send your receipt.');
    }

    return this.paymentsService.initiateRedirectFeePayment(
      delivery,
      { ...delivery.customer, ...payer } as any,
      { web: true },
    );
  }

  async startRedirectFeePayment(deliveryId: string, customerId: string) {
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.customer?.id !== customerId) {
      throw new NotFoundException('Delivery not found.'); // no oracle
    }
    if (!this.paymentsService) {
      throw new NotFoundException('Payments are unavailable right now.');
    }
    return this.paymentsService.initiateRedirectFeePayment(delivery, delivery.customer);
  }

  /**
   * Pay for an approved address change.
   *
   * Guarded on 'approved' rather than 'pending' so a sender cannot pay
   * their way past support's decision.
   */
  async startAddressChangePayment(deliveryId: string, customerId: string) {
    const { BadRequestException } = await import('@nestjs/common');
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.customer?.id !== customerId) {
      throw new NotFoundException('Delivery not found.'); // no oracle
    }
    if (delivery.addressChangeStatus !== 'approved') {
      throw new BadRequestException(
        delivery.addressChangeStatus === 'pending'
          ? 'Support has not approved this address change yet.'
          : 'There is no approved address change to pay for.',
      );
    }
    if (delivery.addressChangePaidAt) {
      throw new BadRequestException('This address change has already been paid.');
    }
    if (!this.paymentsService) {
      throw new NotFoundException('Payments are unavailable right now.');
    }
    return this.paymentsService.initiateAddressChangePayment(delivery, delivery.customer);
  }

  // ── Disposal of a perishable that could not be delivered ─────────────

  /**
   * The rider records that a perishable was disposed of.
   *
   * Only the assigned rider, only for a food category, and only once the
   * perishable window has actually run out. A photo is required: Terms
   * 8.4 promises photographic evidence is retained, and without one this
   * is just an assertion that food was destroyed.
   */
  async recordDisposal(
    deliveryId: string,
    driverUserId: string,
    body: { photoUrl?: string; note?: string },
  ) {
    const { BadRequestException } = await import('@nestjs/common');
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['driver', 'driver.user', 'customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');

    const assignedUserId = (delivery as any).driver?.user?.id ?? null;
    if (!assignedUserId || assignedUserId !== driverUserId) {
      throw new ForbiddenException('This delivery is not assigned to you.');
    }
    if (delivery.disposedAt) {
      throw new BadRequestException('This has already been recorded as disposed of.');
    }

    const category = String(delivery.categoryCode ?? '');
    if (category !== 'food_hot' && category !== 'food_cold') {
      throw new BadRequestException(
        'Only perishable orders can be disposed of. Contact support for anything else.',
      );
    }
    if (!body?.photoUrl) {
      throw new BadRequestException('A photo is required before disposal can be recorded.');
    }

    // The window has to have actually elapsed. Otherwise this becomes a
    // fast way for a rider to end an inconvenient job.
    const maxHours = this.feesServiceRef
      ? Number(await this.feesServiceRef.getValueOr('perishable_max_hours', 3))
      : 3;
    const startedAt = delivery.arrivalIssueAt ?? delivery.pickedUpAt;
    if (!startedAt) {
      throw new BadRequestException('This order has not reached a failed delivery.');
    }
    const hours = (Date.now() - new Date(startedAt).getTime()) / 3_600_000;
    if (hours < maxHours) {
      const left = Math.ceil(maxHours - hours);
      throw new BadRequestException(
        `Too early. There ${left === 1 ? 'is' : 'are'} still about ${left} hour${left === 1 ? '' : 's'} to deliver or return this order.`,
      );
    }

    await this.repo.update(deliveryId, {
      disposedAt:       new Date(),
      disposalPhotoUrl: body.photoUrl,
      disposalNote:     (body?.note ?? '').trim().slice(0, 500) || null,
    } as any);

    this.logEvent(deliveryId, DeliveryEventType.ADMIN_NOTE, EventActorRole.DRIVER, {
      actorUserId: driverUserId,
      description: `Perishable order disposed of after ${Math.floor(hours)} hours undelivered. Photo retained.`,
      meta: { kind: 'perishable_disposed', photoUrl: body.photoUrl, hours: Math.floor(hours) },
    }).catch(() => {});

    if (this.notificationsService && delivery.customer?.id) {
      this.notificationsService.create(
        delivery.customer.id,
        'Your order could not be delivered',
        `${delivery.trackingCode} is a perishable order and could not be delivered or returned in time, so it has been disposed of. ` +
        `We have kept a photo. Contact support if you believe this was our error.`,
        'status_update',
        delivery.id,
        delivery.trackingCode,
      ).catch(() => {});
    }

    return { ok: true, disposedAt: new Date() };
  }

  /**
   * Perishables past their ceiling that nobody has resolved.
   *
   * This deliberately does NOT dispose of anything. It raises them so a
   * human deals with them, because destroying property on a timer is a
   * different thing from a rider standing there confirming they did it.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async flagOverduePerishables() {
    try {
      const maxHours = this.feesServiceRef
        ? Number(await this.feesServiceRef.getValueOr('perishable_max_hours', 3))
        : 3;
      const cutoff = new Date(Date.now() - Math.max(1, maxHours) * 3_600_000);

      const overdue = await this.repo
        .createQueryBuilder('d')
        .where(`d.arrivalResolution = 'perishable'`)
        .andWhere('d.disposedAt IS NULL')
        .andWhere('d.arrivalIssueAt < :cutoff', { cutoff })
        .andWhere(`d.status NOT IN ('delivered', 'cancelled')`)
        .take(20)
        .getMany();

      for (const d of overdue) {
        this.logEvent(d.id, DeliveryEventType.ADMIN_NOTE, EventActorRole.SYSTEM, {
          description: `Perishable order is past its ${maxHours} hour ceiling and still unresolved. Needs a decision.`,
          meta: { kind: 'perishable_overdue', maxHours },
        }).catch(() => {});
      }

      if (overdue.length) {
        this.logger.warn(`${overdue.length} perishable order(s) past the ceiling and unresolved`);
      }
    } catch (e: any) {
      this.logger.warn(`perishable sweep failed: ${e?.message ?? e}`);
    }
  }

  // ── Refund calculator (founder 2026-08-21) ───────────────────────────

  /**
   * What a given refund percentage actually does to the money.
   *
   * A refund comes out of two pockets and the split is the whole point:
   * SEIRS margin absorbs it first, and only once that is exhausted does
   * it start eating the rider's payout.
   *
   * The rider floor is the part that matters most. A rider who rode to a
   * pickup, found a parcel that was not what was described and reported
   * it honestly did their job correctly. If refunds cut into their pay
   * without a floor, the rational rider learns to accept bad parcels
   * quietly instead of reporting them, and we lose the reporting the
   * whole dispute mechanism depends on.
   */
  async previewRefund(deliveryId: string, pct: number) {
    const { BadRequestException } = await import('@nestjs/common');
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['customer', 'driver'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');

    const percent = Number(pct);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new BadRequestException('Refund percentage must be between 0 and 100.');
    }

    const farePaid  = Math.round(Number(delivery.price ?? 0));
    const driverPay = Math.round(Number(delivery.driverEarnings ?? 0));
    const seirsMargin = Math.max(0, farePaid - driverPay);

    const refundNgn = Math.round((farePaid * percent) / 100);

    // Margin first, then the rider.
    const fromMargin = Math.min(refundNgn, seirsMargin);
    const fromDriverRaw = refundNgn - fromMargin;

    const floor = await this.computeFailedTripPay(delivery);
    const driverAfterRaw = driverPay - fromDriverRaw;
    const driverFinal = Math.max(driverAfterRaw, floor);

    // Whatever the floor rescues, SEIRS covers rather than the rider.
    const absorbedByFloor = Math.max(0, driverFinal - driverAfterRaw);
    const fromDriver = driverPay - driverFinal;

    return {
      farePaid,
      percent,
      refundNgn,
      driverPayBefore: driverPay,
      seirsMarginBefore: seirsMargin,
      fromMargin,
      fromDriver,
      driverFloorNgn: floor,
      driverPayAfter: driverFinal,
      absorbedByFloor,
      seirsNetAfter: farePaid - refundNgn - driverFinal,
      floorApplied: absorbedByFloor > 0,
    };
  }

  /**
   * Issue the refund support settled on.
   *
   * Routed through refundEscrow so the money genuinely leaves via
   * Flutterwave rather than a number changing on a screen, and the
   * rider's payout is written down at the same time so the two can never
   * disagree afterwards.
   */
  async issueRefund(
    deliveryId: string,
    adminUserId: string,
    body: { percent: number; note?: string },
  ) {
    const preview = await this.previewRefund(deliveryId, body?.percent);
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');

    const note = (body?.note ?? '').trim().slice(0, 500) || null;

    if (preview.refundNgn > 0 && this.paymentsService?.refundEscrow) {
      await this.paymentsService.refundEscrow(
        deliveryId,
        delivery.customer?.id,
        // refundEscrow takes what to WITHHOLD, not what to refund.
        Math.max(0, preview.farePaid - preview.refundNgn),
      );
    }

    await this.repo.update(deliveryId, {
      driverEarnings: preview.driverPayAfter,
    } as any);

    this.logEvent(deliveryId, DeliveryEventType.ADMIN_NOTE, EventActorRole.ADMIN, {
      actorUserId: adminUserId,
      description:
        `Support refunded ${preview.percent}% (₦${preview.refundNgn.toLocaleString()}): ` +
        `₦${preview.fromMargin.toLocaleString()} from SEIRS margin, ` +
        `₦${preview.fromDriver.toLocaleString()} from the rider` +
        (preview.floorApplied
          ? `, with ₦${preview.absorbedByFloor.toLocaleString()} absorbed by the rider floor`
          : '') +
        `.${note ? ' Note: ' + note : ''}`,
      meta: { kind: 'refund_issued', ...preview, note },
    }).catch(() => {});

    if (this.notificationsService && delivery.customer?.id && preview.refundNgn > 0) {
      this.notificationsService.create(
        delivery.customer.id,
        'Refund issued',
        `We have refunded ₦${preview.refundNgn.toLocaleString()} on ${delivery.trackingCode}. ` +
        `It can take a few working days to appear, depending on your bank.`,
        'status_update',
        delivery.id,
        delivery.trackingCode,
      ).catch(() => {});
    }

    return { ...preview, note, issued: true };
  }

  // ── Return to sender (founder 2026-08-21) ────────────────────────────
  //
  // "A return is priced as a real trip from wherever the parcel currently
  // is back to the original pickup address. The pickup address cannot be
  // changed. A return while a rider is still holding the parcel goes
  // through support."
  //
  // There is no return-address parameter anywhere in this flow, on
  // purpose. The destination is the delivery's own pickupAddress. If it
  // could be edited, "return it" becomes a cheap long delivery: book
  // Yaba to Yaba, wait for the rider to reach the drop, then return it to
  // Lekki. Fixing the destination removes the incentive completely, and
  // costs an honest sender nothing.

  /** Is this package sitting at a partner counter rather than on a bike? */
  private isAtCounter(delivery: Delivery): boolean {
    return ['store', 'auto_store'].includes(String(delivery.arrivalResolution ?? ''));
  }

  /**
   * What it costs to bring this package home, from wherever it is now.
   *
   * At a counter: the counter's release plus any storage that has piled
   * up, plus the trip from the counter back to the pickup.
   * On a bike: just the trip, from the rider's live position.
   */
  async getReturnQuote(deliveryId: string, customerId: string) {
    const { BadRequestException } = await import('@nestjs/common');
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['customer', 'driver', 'driver.user'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.customer?.id !== customerId) {
      throw new NotFoundException('Delivery not found.'); // no oracle
    }
    if (['delivered', 'cancelled'].includes(String(delivery.status))) {
      throw new BadRequestException('This delivery is already closed.');
    }
    if (delivery.pickupLat == null || delivery.pickupLng == null) {
      throw new BadRequestException('This delivery has no pickup coordinates to return to.');
    }

    const atCounter = this.isAtCounter(delivery);

    /**
     * Where the package physically is right now.
     *
     * This fell through to delivery.dropoffLat/Lng, which are NULL on
     * every multi-stop run, and Number(null) is 0. So the return leg was
     * measured from (0, 0) in the Gulf of Guinea and a Lagos parcel came
     * back as 1,173.6 km. Resolve through the real candidates in order
     * and refuse to guess if none of them has coordinates.
     */
    const firstNum = (...vals: any[]): number | null => {
      for (const v of vals) {
        if (v == null) continue;
        const n = Number(v);
        if (Number.isFinite(n) && n !== 0) return n;
      }
      return null;
    };
    // A stop that has been reached is a better "current position" than
    // the run's own dropoff, which multi-stop bookings do not have.
    const lastStop = (delivery as any).stops?.filter((st: any) => st?.arrivedAt || st?.deliveredAt)
      ?.sort((a: any, b: any) =>
        new Date(b.arrivedAt ?? b.deliveredAt).getTime() -
        new Date(a.arrivedAt ?? a.deliveredAt).getTime())?.[0] ?? null;

    const fromLat = atCounter
      ? firstNum(delivery.dropoffLat, lastStop?.lat, delivery.driver?.lastLat)
      : firstNum(delivery.driver?.lastLat, lastStop?.lat, delivery.dropoffLat, delivery.pickupLat);
    const fromLng = atCounter
      ? firstNum(delivery.dropoffLng, lastStop?.lng, delivery.driver?.lastLng)
      : firstNum(delivery.driver?.lastLng, lastStop?.lng, delivery.dropoffLng, delivery.pickupLng);

    if (fromLat == null || fromLng == null) {
      throw new BadRequestException(
        'We cannot tell where this package is right now, so we will not guess at a return price. Contact support and we will arrange it.',
      );
    }

    const road = await this.routeDistance.getRoadDistance(
      fromLat, fromLng,
      Number(delivery.pickupLat), Number(delivery.pickupLng),
    );

    const card = await this.rateCardPricing.getActiveRateCard();
    const categoryCode = delivery.categoryCode || toCategoryCode(delivery.packageSize as any);
    const breakdown = await this.rateCardPricing.computePrice({
      vehicleType:           String(delivery.vehicleType),
      categoryCode,
      km:                    road.km,
      stopCount:             1,
      weightKg:              Number(delivery.weightKg ?? 0),
      estimatedDwellMinutes: this.rateCardPricing.computeStopDwellMinutes(
        card,
        await this.rateCardPricing.getCategoryByCode(categoryCode),
        Number(delivery.weightKg ?? 0),
      ),
      pickupLat:  fromLat,
      pickupLng:  fromLng,
      dropoffLat: Number(delivery.pickupLat),
      dropoffLng: Number(delivery.pickupLng),
    } as any);

    /**
     * computePrice returns { customer, driver }. There is no top-level
     * `total`, so this read undefined and every return in the platform's
     * history was quoted at NGN 0. The sender is charged the customer
     * side, exactly as they would be for any other trip.
     */
    const transport = Math.round(Number(breakdown?.customer?.total ?? 0));

    /**
     * No floor. return_to_sender_fee and storage_return_fee are the
     * INVOLUNTARY overstay path ("passes 5 working days uncollected and
     * is returned"), not a sender choosing to recall their own parcel.
     * Flooring a voluntary recall at the overstay price would overcharge
     * a short return.
     */
    const transportCharged = transport;

    /**
     * Storage accrued, per the spec's counter row: "counter fee, plus
     * storage accrued, plus a delivery from that counter to the original
     * pickup address."
     *
     * Read directly rather than by importing PartnerStoreService.
     * deliveries.service has no partner-store dependency and adding one
     * risks the circular-import boot crash we already hit once between
     * MatchingService and FeesModule.
     */
    let storageOwed = 0;
    if (atCounter) {
      try {
        const rows = await this.repo.manager.query(
          `SELECT "storageFeesAccruedNgn" FROM "store_dropoffs" WHERE "deliveryId" = $1 LIMIT 1`,
          [delivery.id],
        );
        const raw = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0][0] : rows?.[0];
        storageOwed = Math.round(Number(raw?.storageFeesAccruedNgn ?? 0)) || 0;
      } catch (e: any) {
        this.logger.warn(`return-quote storage lookup failed for ${delivery.id}: ${e?.message ?? e}`);
      }
    }

    // Anything the counter is still holding against the package. Unpaid
    // redirect fee first: the package cannot leave without it either way.
    const counterOwed = atCounter && !delivery.redirectFeePaidAt
      ? Math.round(Number(delivery.redirectFeeNgn ?? 0))
      : 0;

    const total = transportCharged + counterOwed + storageOwed;

    return {
      atCounter,
      // Named, not editable. The app shows it so the sender can see where
      // it is going, and there is no field to change it.
      returnTo:      delivery.pickupAddress,
      km:            Number(road.km.toFixed(2)),
      transportNgn:  transportCharged,
      counterOwedNgn: counterOwed,
      // Named separately so the sender sees WHY the number is what it is,
      // rather than one opaque total.
      storageOwedNgn: storageOwed,
      totalNgn:      total,
      // Support is only needed when a rider actually HAS the package.
      // This said "a rider is still carrying this package" on pending,
      // unpaid, driverless bookings because it keyed off atCounter alone.
      needsSupport:  !atCounter && !!delivery.driver && !!delivery.pickedUpAt,
      note: atCounter
        ? 'Your package is at a partner counter. This brings it back to your pickup address.'
        : 'A rider is still carrying this package, so support has to arrange the return.',
    };
  }

  /**
   * Ask for the package back.
   *
   * A package on a bike needs a support decision, because redirecting a
   * rider mid-route is not something a sender should be able to do alone.
   * A package already sitting at a counter is nobody's emergency, so that
   * one is approved as it is requested.
   */
  /**
   * Spec 7356423a: "A return can cost more than the original delivery,
   * because it is priced from wherever the rider got to. That is
   * defensible, but only if the sender sees the amount before they
   * confirm."
   *
   * acceptedTotalNgn is what the app displayed. If it no longer matches
   * the live quote the sender is re-asked instead of being committed to
   * a number they never saw. Same shape as the booking quote pin.
   */
  async requestReturn(deliveryId: string, customerId: string, acceptedTotalNgn?: number) {
    const { BadRequestException, ConflictException } = await import('@nestjs/common');
    const quote = await this.getReturnQuote(deliveryId, customerId);
    if (acceptedTotalNgn != null && Math.round(Number(acceptedTotalNgn)) !== quote.totalNgn) {
      throw new ConflictException(
        `RETURN_QUOTE_CHANGED: this return is now ₦${quote.totalNgn.toLocaleString()}, not ₦${Math.round(Number(acceptedTotalNgn)).toLocaleString()}. Check the new price before confirming.`,
      );
    }
    const delivery = await this.repo.findOne({ where: { id: deliveryId }, relations: ['customer'] });
    if (!delivery) throw new NotFoundException('Delivery not found.');

    if (delivery.returnStatus === 'pending') {
      throw new BadRequestException('Support is already reviewing a return for this delivery.');
    }
    if (delivery.returnStatus === 'approved' && !delivery.returnPaidAt) {
      throw new BadRequestException('An approved return is waiting for payment.');
    }
    if (delivery.returnStatus === 'applied') {
      throw new BadRequestException('This package is already on its way back.');
    }

    // On a bike: support decides. At a counter: nothing to decide.
    const status = quote.needsSupport ? 'pending' : 'approved';

    await this.repo.update(deliveryId, {
      returnRequestedAt:  new Date(),
      returnStatus:       status,
      returnQuoteNgn:     quote.totalNgn,
      returnQuoteKm:      quote.km,
      returnDecidedAt:    quote.needsSupport ? null : new Date(),
      returnDecidedBy:    null,
      returnDecisionNote: null,
      returnPaidAt:       null,
    } as any);

    this.logEvent(deliveryId, DeliveryEventType.ADMIN_NOTE, EventActorRole.CUSTOMER, {
      actorUserId: customerId,
      description: `Sender asked for the package back. Quoted ₦${quote.totalNgn.toLocaleString()} for ${quote.km.toFixed(1)} km to ${delivery.pickupAddress}.`,
      meta: { kind: 'return_requested', ...quote },
    }).catch(() => {});

    let ticketId: string | null = null;
    if (quote.needsSupport) {
      try {
        const ticket: any = await this.supportService?.create(customerId, {
          topic:            TicketTopic.DELIVERY,
          subject:          `Return to sender - ${delivery.trackingCode}`,
          firstMessage: [
            'Sender wants this package brought back while a rider is carrying it.',
            `Tracking: ${delivery.trackingCode}`,
            `Return to (fixed, cannot be changed): ${delivery.pickupAddress}`,
            `Quote from the rider's current position: ₦${quote.totalNgn.toLocaleString()} for ${quote.km.toFixed(1)} km.`,
            'Approve or reject on the delivery in admin. Approval does not turn the rider around until the sender pays.',
          ].join('\n'),
          linkedDeliveryId: delivery.id,
        });
        ticketId = ticket?.id ?? null;
      } catch (e: any) {
        this.logger.error(`return request: ticket creation failed: ${e?.message ?? e}`);
      }
    }

    return { ...quote, status, ticketId };
  }

  /** Support approves or rejects a return that involves turning a rider around. */
  async decideReturn(
    deliveryId: string,
    adminUserId: string,
    body: { approve: boolean; note?: string; overrideQuoteNgn?: number },
  ) {
    const { BadRequestException } = await import('@nestjs/common');
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.returnStatus !== 'pending') {
      throw new BadRequestException('There is no return awaiting a decision.');
    }

    const approve = body?.approve === true;
    const note = (body?.note ?? '').trim().slice(0, 500) || null;

    let quoteNgn = delivery.returnQuoteNgn != null ? Number(delivery.returnQuoteNgn) : 0;
    const override = Number(body?.overrideQuoteNgn);
    if (approve && Number.isFinite(override) && override >= 0) {
      quoteNgn = Math.round(override);
    }

    await this.repo.update(deliveryId, {
      returnStatus:       approve ? 'approved' : 'rejected',
      returnQuoteNgn:     quoteNgn,
      returnDecidedAt:    new Date(),
      returnDecidedBy:    adminUserId,
      returnDecisionNote: note,
    } as any);

    this.logEvent(deliveryId, DeliveryEventType.ADMIN_NOTE, EventActorRole.ADMIN, {
      actorUserId: adminUserId,
      description: approve
        ? `Return approved at ₦${quoteNgn.toLocaleString()}. Awaiting payment before the rider turns around.`
        : `Return rejected.${note ? ' Reason: ' + note : ''}`,
      meta: { kind: 'return_decided', approve, quoteNgn, note },
    }).catch(() => {});

    if (this.notificationsService && delivery.customer?.id) {
      this.notificationsService.create(
        delivery.customer.id,
        approve ? 'Return approved' : 'Return rejected',
        approve
          ? `Support approved bringing ${delivery.trackingCode} back to ${delivery.pickupAddress}. Pay ₦${quoteNgn.toLocaleString()} in the app to start it.`
          : `Support could not arrange a return for ${delivery.trackingCode}.${note ? ' ' + note : ''}`,
        'status_update',
        delivery.id,
        delivery.trackingCode,
      ).catch(() => {});
    }

    return { status: approve ? 'approved' : 'rejected', quoteNgn, note };
  }

  /** Pay for an approved return. */
  async startReturnPayment(deliveryId: string, customerId: string) {
    const { BadRequestException } = await import('@nestjs/common');
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.customer?.id !== customerId) {
      throw new NotFoundException('Delivery not found.');
    }
    if (delivery.returnStatus !== 'approved') {
      throw new BadRequestException(
        delivery.returnStatus === 'pending'
          ? 'Support has not approved this return yet.'
          : 'There is no approved return to pay for.',
      );
    }
    if (delivery.returnPaidAt) {
      throw new BadRequestException('This return has already been paid.');
    }
    if (!this.paymentsService) {
      throw new NotFoundException('Payments are unavailable right now.');
    }
    return this.paymentsService.initiateReturnPayment(delivery, delivery.customer);
  }

  /**
   * Payment cleared: send it home.
   *
   * The destination is the delivery's own pickup address, read here
   * rather than taken from anything a client sent.
   */
  async applyReturn(deliveryId: string) {
    const delivery = await this.repo.findOne({ where: { id: deliveryId } });
    if (!delivery) return;
    if (delivery.returnStatus !== 'approved') return;

    const prevAddress = delivery.dropoffAddress;
    await this.repo.update(deliveryId, {
      dropoffAddress: delivery.pickupAddress,
      dropoffLat:     delivery.pickupLat,
      dropoffLng:     delivery.pickupLng,
      returnStatus:   'applied',
      returnPaidAt:   new Date(),
      // The package is moving again, so the counter no longer holds it
      // and the pay-to-reveal mask has nothing left to hide.
      arrivalResolution: null,
    } as any);

    this.logEvent(deliveryId, DeliveryEventType.ADMIN_NOTE, EventActorRole.SYSTEM, {
      description: `Return paid and applied. Package heading back from ${prevAddress} to ${delivery.pickupAddress}.`,
      meta: { kind: 'return_applied', prevAddress, returnTo: delivery.pickupAddress },
    }).catch(() => {});

    if (this.chatService) {
      this.chatService
        .insertSystemMessage(
          deliveryId,
          'redirected',
          `Return to sender: bring this package back to ${delivery.pickupAddress}.`,
        )
        .catch(() => {});
    }
    if (this.trackingGateway) {
      this.trackingGateway.broadcastStatusChange(deliveryId, delivery.status);
    }
  }

  // ── Mid-delivery address change (founder 2026-08-21) ─────────────────
  //
  // "If a customer is genuinely wrong and would like to change an address
  // mid delivery, they contact support immediately, get re-charged from
  // the current location of the driver to the new address, pay in app,
  // and it auto-updates. Only support should be able to do this, and
  // support can reject it."
  //
  // The rider is already carrying the package, so this is not a booking
  // change the sender can make alone. Three gates, in order: support
  // approves, the sender pays, then the drop-off moves. Approval on its
  // own moves nothing.

  private static readonly ADDRESS_CHANGE_STATES = ['assigned', 'picked_up', 'in_transit'];

  /**
   * The sender asks for a different drop-off, and gets a price for it.
   *
   * Priced from where the rider actually is, which is the only honest
   * basis: they have already ridden the original leg and the new one
   * starts from wherever that left them. Nothing is charged here, and
   * nothing moves until support approves and the sender pays.
   */
  async requestAddressChange(
    deliveryId: string,
    customerId: string,
    body: { address: string; lat?: number; lng?: number },
  ) {
    const { BadRequestException } = await import('@nestjs/common');
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['customer', 'driver', 'driver.user'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.customer?.id !== customerId) {
      throw new NotFoundException('Delivery not found.'); // no oracle
    }
    if (!DeliveriesService.ADDRESS_CHANGE_STATES.includes(String(delivery.status))) {
      throw new BadRequestException(
        'An address can only be changed while a rider is carrying the package.',
      );
    }
    const address = (body?.address ?? '').trim();
    if (address.length < 6) {
      throw new BadRequestException('Enter the full new delivery address.');
    }
    // One open request at a time. Otherwise a sender could stack requests
    // and support would not know which one they are deciding.
    if (delivery.addressChangeStatus === 'pending') {
      throw new BadRequestException(
        'Support is already reviewing an address change for this delivery.',
      );
    }
    if (delivery.addressChangeStatus === 'approved' && !delivery.addressChangePaidAt) {
      throw new BadRequestException(
        'An approved address change is waiting for payment on this delivery.',
      );
    }

    // Resolve the new address to coordinates when the app did not.
    let lat = Number(body?.lat);
    let lng = Number(body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const geo = await this.routingService.geocodeAddress(address).catch(() => null);
      if (!geo) {
        throw new BadRequestException(
          'We could not find that address. Pick it from the suggestions so the rider gets a real location.',
        );
      }
      lat = geo.lat;
      lng = geo.lng;
    }

    // Where the rider is now. Falls back to the pickup so a rider with a
    // stale GPS fix cannot make the change free.
    const fromLat = delivery.driver?.lastLat != null ? Number(delivery.driver.lastLat) : Number(delivery.pickupLat);
    const fromLng = delivery.driver?.lastLng != null ? Number(delivery.driver.lastLng) : Number(delivery.pickupLng);

    const road = await this.routeDistance.getRoadDistance(fromLat, fromLng, lat, lng);
    const card = await this.rateCardPricing.getActiveRateCard();
    const breakdown = await this.rateCardPricing.computePrice({
      vehicleType:           String(delivery.vehicleType),
      categoryCode:          delivery.categoryCode || toCategoryCode(delivery.packageSize as any),
      km:                    road.km,
      stopCount:             1,
      weightKg:              Number(delivery.weightKg ?? 0),
      // One stop, so the dwell is whatever this category and weight
      // normally take at a door.
      estimatedDwellMinutes: this.rateCardPricing.computeStopDwellMinutes(
        card,
        await this.rateCardPricing.getCategoryByCode(
          delivery.categoryCode || toCategoryCode(delivery.packageSize as any),
        ),
        Number(delivery.weightKg ?? 0),
      ),
      // latitude/longitude, NOT lat/lng. The engine reads
      // pickupCoords.latitude; flat lat/lng fields are simply ignored,
      // and the `as any` hid it here exactly as it did on the booking
      // path in August. Without these the region multiplier and the
      // whole zone tier were skipped on every redirect quote.
      pickupCoords:  { latitude: fromLat, longitude: fromLng },
      dropoffCoords: { latitude: lat,     longitude: lng },
    } as any);

    /**
     * customer.total, not total.
     *
     * computePrice returns { customer: {...}, driver: {...}, seirsNet }.
     * There is no flat `total` on it, so this read undefined, fell
     * through the `?? 0`, and every mid-route address change in the
     * platform's history quoted 0.00 (2026-08-27). The sender moved the
     * destination and was charged nothing for the detour. The `as any`
     * is what let it compile.
     */
    const quoteNgn = Math.round(Number((breakdown as any)?.customer?.total ?? 0));
    if (!(quoteNgn > 0)) {
      throw new BadRequestException(
        'Could not price that address change. Try again, or contact support.',
      );
    }
    if (!(quoteNgn > 0)) {
      throw new BadRequestException('We could not price that change. Contact support.');
    }

    await this.repo.update(deliveryId, {
      addressChangeRequestedAt:  new Date(),
      addressChangeStatus:       'pending',
      addressChangeNewAddress:   address,
      addressChangeNewLat:       lat,
      addressChangeNewLng:       lng,
      addressChangeQuoteNgn:     quoteNgn,
      addressChangeQuoteKm:      road.km,
      addressChangeDecidedAt:    null,
      addressChangeDecidedBy:    null,
      addressChangeDecisionNote: null,
      addressChangePaidAt:       null,
    } as any);

    this.logEvent(deliveryId, DeliveryEventType.ADMIN_NOTE, EventActorRole.CUSTOMER, {
      actorUserId: customerId,
      description: `Sender asked to change the drop-off to ${address}. Quoted ₦${quoteNgn.toLocaleString()} for ${road.km.toFixed(1)} km from the rider's position.`,
      meta: { kind: 'address_change_requested', address, lat, lng, quoteNgn, km: road.km },
    }).catch(() => {});

    // Support is the decision-maker, so they get a ticket rather than a
    // row they have to go looking for.
    let ticketId: string | null = null;
    try {
      const ticket: any = await this.supportService?.create(customerId, {
        topic:            TicketTopic.DELIVERY,
        subject:          `Address change request - ${delivery.trackingCode}`,
        firstMessage: [
          `Sender wants the drop-off changed while the package is in transit.`,
          `Tracking: ${delivery.trackingCode}`,
          `Current drop-off: ${delivery.dropoffAddress}`,
          `Requested drop-off: ${address}`,
          `Re-quote from the rider's current position: ₦${quoteNgn.toLocaleString()} for ${road.km.toFixed(1)} km.`,
          `Approve or reject on the delivery in admin. Approval does not move the package until the sender pays.`,
        ].join('\n'),
        linkedDeliveryId: delivery.id,
      });
      ticketId = ticket?.id ?? null;
    } catch (e: any) {
      this.logger.error(`address change: ticket creation failed: ${e?.message ?? e}`);
    }

    return {
      status:    'pending',
      address,
      quoteNgn,
      km:        Number(road.km.toFixed(2)),
      fromGoogle: (road as any)?.fromGoogle ?? null,
      ticketId,
      message:   'Support is reviewing your request. You will be asked to pay if it is approved.',
    };
  }

  /** What the sender and the admin screen both read. */
  async getAddressChange(deliveryId: string, userId: string) {
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.customer?.id !== userId) {
      throw new NotFoundException('Delivery not found.');
    }
    if (!delivery.addressChangeStatus) return { status: null };
    return {
      status:       delivery.addressChangeStatus,
      address:      delivery.addressChangeNewAddress,
      quoteNgn:     delivery.addressChangeQuoteNgn != null ? Number(delivery.addressChangeQuoteNgn) : null,
      km:           delivery.addressChangeQuoteKm != null ? Number(delivery.addressChangeQuoteKm) : null,
      requestedAt:  delivery.addressChangeRequestedAt,
      decidedAt:    delivery.addressChangeDecidedAt,
      decisionNote: delivery.addressChangeDecisionNote,
      paidAt:       delivery.addressChangePaidAt,
      payable:      delivery.addressChangeStatus === 'approved' && !delivery.addressChangePaidAt,
    };
  }

  /**
   * Support approves or rejects. Admin-only by route.
   *
   * Approving does not touch the delivery. It only unlocks payment,
   * because a sender who has not paid must not be able to move a rider.
   */
  async decideAddressChange(
    deliveryId: string,
    adminUserId: string,
    body: { approve: boolean; note?: string; overrideQuoteNgn?: number },
  ) {
    const { BadRequestException } = await import('@nestjs/common');
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.addressChangeStatus !== 'pending') {
      throw new BadRequestException('There is no address change awaiting a decision.');
    }

    const approve = body?.approve === true;
    const note = (body?.note ?? '').trim().slice(0, 500) || null;

    // Support may correct the quote, e.g. when the rider has moved a long
    // way since the request or the geocode landed badly.
    let quoteNgn = delivery.addressChangeQuoteNgn != null ? Number(delivery.addressChangeQuoteNgn) : 0;
    const override = Number(body?.overrideQuoteNgn);
    if (approve && Number.isFinite(override) && override >= 0) {
      quoteNgn = Math.round(override);
    }

    await this.repo.update(deliveryId, {
      addressChangeStatus:       approve ? 'approved' : 'rejected',
      addressChangeQuoteNgn:     quoteNgn,
      addressChangeDecidedAt:    new Date(),
      addressChangeDecidedBy:    adminUserId,
      addressChangeDecisionNote: note,
    } as any);

    this.logEvent(deliveryId, DeliveryEventType.ADMIN_NOTE, EventActorRole.ADMIN, {
      actorUserId: adminUserId,
      description: approve
        ? `Address change approved at ₦${quoteNgn.toLocaleString()}. Awaiting payment before it applies.`
        : `Address change rejected.${note ? ' Reason: ' + note : ''}`,
      meta: { kind: 'address_change_decided', approve, quoteNgn, note },
    }).catch(() => {});

    if (this.notificationsService && delivery.customer?.id) {
      this.notificationsService.create(
        delivery.customer.id,
        approve ? 'Address change approved' : 'Address change rejected',
        approve
          ? `Support approved the new address for ${delivery.trackingCode}. Pay ₦${quoteNgn.toLocaleString()} in the app and the rider will be redirected.`
          : `Support could not change the address for ${delivery.trackingCode}.${note ? ' ' + note : ''} The package is still going to the original address.`,
        'status_update',
        delivery.id,
        delivery.trackingCode,
      ).catch(() => {});
    }

    return { status: approve ? 'approved' : 'rejected', quoteNgn, note };
  }

  /**
   * Payment cleared: move the drop-off for real.
   *
   * Called from the payments webhook, never from a client, so the rider
   * is only ever redirected by money that actually arrived.
   */
  async applyAddressChange(deliveryId: string) {
    const delivery = await this.repo.findOne({ where: { id: deliveryId } });
    if (!delivery) return;
    if (delivery.addressChangeStatus !== 'approved') return;
    if (delivery.addressChangeNewLat == null || delivery.addressChangeNewLng == null) return;

    const prevAddress = delivery.dropoffAddress;
    await this.repo.update(deliveryId, {
      dropoffAddress:      delivery.addressChangeNewAddress,
      dropoffLat:          Number(delivery.addressChangeNewLat),
      dropoffLng:          Number(delivery.addressChangeNewLng),
      addressChangeStatus: 'applied',
      addressChangePaidAt: new Date(),
    } as any);

    this.logEvent(deliveryId, DeliveryEventType.ADMIN_NOTE, EventActorRole.SYSTEM, {
      description: `Address change paid and applied. Drop-off moved from ${prevAddress} to ${delivery.addressChangeNewAddress}.`,
      meta: { kind: 'address_change_applied', prevAddress, newAddress: delivery.addressChangeNewAddress },
    }).catch(() => {});

    // The rider is mid-route, so this has to be impossible to miss.
    if (this.chatService) {
      this.chatService
        .insertSystemMessage(
          deliveryId,
          'redirected',
          `Drop-off changed by support: deliver to ${delivery.addressChangeNewAddress}.`,
        )
        .catch(() => {});
    }
    if (this.trackingGateway) {
      this.trackingGateway.broadcastStatusChange(deliveryId, delivery.status);
    }
  }

  async redirectToStore(deliveryId: string, customerId: string, storeId: string) {
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.customer?.id !== customerId) {
      throw new NotFoundException('Delivery not found.'); // no oracle
    }
    const redirectable = ['assigned', 'picked_up', 'in_transit'];
    if (!redirectable.includes(String(delivery.status))) {
      throw new NotFoundException('This delivery can no longer be redirected.');
    }

    // Anti-abuse (founder 2026-08-10): ONE redirect per delivery. The
    // feature exists for "recipient not available", not for steering a
    // driver around town. A second change goes through support.
    try {
      const prior: any[] = await this.repo.manager.query(
        `SELECT 1 FROM delivery_events
          WHERE "deliveryId" = $1 AND meta->>'kind' = 'redirect_to_store' LIMIT 1`,
        [deliveryId],
      );
      if (prior.length > 0) {
        throw new NotFoundException(
          'This delivery was already redirected once. Contact support for further changes.',
        );
      }
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      /* events table missing on very old DBs: skip the guard */
    }

    // Destination store checks via raw SQL (avoids importing the
    // partner-store module here).
    const stores: any[] = await this.repo.manager.query(
      `SELECT id, "storeName", "storeAddress", "storeLat", "storeLng",
              status, "acceptingNew", "maxCapacity"
         FROM partner_stores WHERE id = $1`,
      [storeId],
    );
    const store = stores[0];
    if (!store || !['approved', 'active'].includes(store.status) || !store.acceptingNew) {
      throw new NotFoundException('That partner store is not available.');
    }

    // The counter takes the package in and releases it later, which is
    // work somebody has to be paid for. This path used to charge
    // nothing at all, so a sender could move a delivery to a partner
    // store for free and the partner was never compensated.
    const handlingFee = this.feesServiceRef
      ? Number(await this.feesServiceRef.getValueOr('partner_store_handling_ngn', 500))
      : 500;

    const prevAddress = delivery.dropoffAddress;
    await this.repo.update(deliveryId, {
      redirectFeeNgn:   handlingFee,
      redirectFeePayer: 'sender',
      dropoffAddress: `${store.storeName}, ${store.storeAddress}`,
      dropoffLat:     store.storeLat != null ? Number(store.storeLat) : delivery.dropoffLat,
      dropoffLng:     store.storeLng != null ? Number(store.storeLng) : delivery.dropoffLng,
    } as any);

    this.logEvent(deliveryId, DeliveryEventType.ADMIN_NOTE, EventActorRole.CUSTOMER, {
      actorUserId: customerId,
      description: `Drop-off redirected to partner store ${store.storeName}`,
      meta: { kind: 'redirect_to_store', storeId, prevAddress },
    }).catch(() => {});

    // Driver sees the change inline in the chat, impossible to miss.
    if (this.chatService) {
      this.chatService
        .insertSystemMessage(
          deliveryId,
          'redirected',
          `Drop-off changed: deliver to ${store.storeName}, ${store.storeAddress}.`,
        )
        .catch(() => {});
    }
    if (this.trackingGateway) {
      this.trackingGateway.broadcastStatusChange(deliveryId, delivery.status);
    }

    return {
      deliveryId,
      newDropoffAddress: `${store.storeName}, ${store.storeAddress}`,
      storeId,
    };
  }

  /**
   * Verify a driver's package-QR scan server-side and log it as a SCAN
   * event. The client already showed a local match/mismatch verdict;
   * this writes the audit copy that disputes lean on ("driver scanned
   * the right package at 14:32 before hand-off").
   *
   * Only the assigned driver may log a scan for a delivery. Both match
   * AND mismatch results are logged; a mismatch followed by a delivered
   * status is exactly the pattern a support agent wants to see.
   */
  async verifyPackageScan(deliveryId: string, userId: string, scannedCode: string) {
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['driver', 'driver.user'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.driver?.user?.id !== userId) {
      throw new NotFoundException('Delivery not found.'); // no oracle for non-participants
    }

    const scanned  = (scannedCode ?? '').trim().toUpperCase();
    const expected = (delivery.trackingCode ?? '').trim().toUpperCase();
    const match    = !!expected && scanned === expected;

    this.logEvent(deliveryId, DeliveryEventType.SCAN, EventActorRole.DRIVER, {
      actorUserId: userId,
      description: match
        ? 'Driver verified package QR at hand-off'
        : 'Driver scanned a NON-MATCHING code at hand-off',
      meta: { match, at: 'handoff' },
    }).catch(() => {});

    return { match };
  }

  /**
   * Append one row to the delivery event log. Silent-fails on any error
   * so business logic that calls this never breaks a status transition
   * because of a downstream write hiccup. The event log is telemetry-
   * grade, not transactional-truth.
   */
  async logEvent(
    deliveryId: string,
    type:       DeliveryEventType,
    actorRole:  EventActorRole,
    body: {
      actorUserId?: string | null;
      description?: string | null;
      lat?:         number | null;
      lng?:         number | null;
      meta?:        Record<string, any> | null;
    } = {},
  ): Promise<void> {
    if (!this.deliveryEventsRepo) return;
    try {
      await this.deliveryEventsRepo.insert({
        delivery:    { id: deliveryId } as any,
        type,
        actorRole,
        actorUserId: body.actorUserId ?? null,
        description: body.description ?? null,
        lat:         body.lat != null ? String(body.lat) : null,
        lng:         body.lng != null ? String(body.lng) : null,
        meta:        body.meta ?? null,
      });
    } catch (e: any) {
      this.logger.warn(`logEvent(${deliveryId}, ${type}) failed: ${e?.message ?? e}`);
    }
  }

  /**
   * What counts as high value. ONE number, from the rate card.
   *
   * There were two, and they disagreed (audit, 2026-08-28). The rate
   * card's highValue.thresholdNgn decides when a customer is CHARGED the
   * high-value premium; this method decided when the parcel is PROTECTED,
   * meaning a mandatory signature and no gate or neighbour drop. They are
   * the same idea and were separate settings with different defaults:
   * 50,000 on the card, 100,000 in the Fee Catalogue.
   *
   * A parcel declared at 75,000 therefore sat in the gap. It was over the
   * card's threshold, so the customer paid a premium for high-value
   * handling, and under the catalogue's, so the parcel could still be
   * left at a gate. Paying for a protection you do not receive is the
   * worst version of this bug, so the gate now follows the same number
   * that sets the charge.
   *
   * The Fee Catalogue row stays as the fallback, which is what makes the
   * gate survive a card that has never had the field published. Order is
   * card, then catalogue, then the founder's 100,000 target, and the
   * gate never silently disables.
   */
  private async getHighValueThreshold(): Promise<number> {
    try {
      const card: any = await this.rateCardPricing.getActiveRateCard();
      const fromCard = Number(card?.highValue?.thresholdNgn);
      if (Number.isFinite(fromCard) && fromCard > 0) return fromCard;
    } catch { /* card unavailable: fall through to the catalogue */ }

    try {
      const rows = await this.repo.manager.query(
        `SELECT "value" FROM "fees" WHERE "key" = 'high_value_threshold_ngn' LIMIT 1`,
      );
      const v = Number(rows?.[0]?.value);
      return Number.isFinite(v) && v > 0 ? v : 100000;
    } catch {
      return 100000;
    }
  }

  /**
   * Store-leg sync (audit 2026-08-10): when a Delivery was minted from a
   * partner-store dropoff, driver progress must flow back to the dropoff
   * row so the store dashboard + sender tracking stay honest.
   *
   * Mapping: ASSIGNED -> DRIVER_EN_ROUTE, PICKED_UP/IN_TRANSIT ->
   * IN_TRANSIT, DELIVERED -> COLLECTED (store_to_door, driver handed to
   * the recipient) or AT_DROPOFF_STORE (store_to_store, destination
   * store's collection flow takes over). FAILED/CANCELLED puts the
   * package back in the dispatch queue and clears deliveryId so the
   * re-dispatch sweep mints a fresh driver leg. Terminal dropoff states
   * are never regressed.
   */
  /**
   * Put the driver's legs of the journey on the chain of custody.
   *
   * Symptom (founder, on the admin Liability Disputes page): a delivery
   * that completed successfully showed "No handoff records yet for this
   * delivery". The pitch deck opens on "every person who touched the
   * parcel signed for it" and the product produced nothing at all on the
   * commonest route we run. Only the two partner-store stages ever wrote
   * a record, and the door-to-door journey wrote none of them.
   *
   * Raw SQL, and NOT a call into IdentityService, on purpose. This module
   * does not import IdentityModule and this is not the deploy to start:
   * the merge that renders these same rows onto the tracking timeline
   * already reads handoff_records with raw SQL for exactly that reason.
   * One coupling decision, applied consistently.
   *
   * Idempotent per stage. A retried status update, or a driver tapping
   * twice on a bad connection, must not make the package look like it
   * changed hands twice.
   */
  private async recordCustodyTransition(
    delivery: Delivery,
    status: DeliveryStatus,
    receivedBy?: { relation?: string; name?: string },
    // Passed in rather than read off `delivery`: that row was loaded
    // before the update, so its proofPhotoUrl is the previous one.
    proofPhotoUrl?: string,
  ): Promise<void> {
    if (status !== DeliveryStatus.PICKED_UP && status !== DeliveryStatus.DELIVERED) return;
    // A passenger is not a parcel. Rides run through this same pipeline,
    // but "who is holding this package right now" has no meaning for a
    // person, and a liability record naming a passenger as custody
    // transferred would be both wrong and unpleasant.
    if (String(delivery.kind ?? 'package') === 'ride') return;

    const driverUserId = delivery.driver?.user?.id ?? null;
    const driverName   = delivery.driver?.user?.name ?? null;
    const customerId   = delivery.customer?.id ?? null;
    const customerName = delivery.customer?.name ?? null;

    // Did this package come off a partner-store counter?
    let dropoff: any = null;
    if (this.storeDropoffsRepo) {
      dropoff = await this.storeDropoffsRepo
        .findOne({ where: { deliveryId: delivery.id } })
        .catch(() => null);
    }

    if (status === DeliveryStatus.PICKED_UP) {
      // "Partner store liable until the driver scans" is this row. Before
      // it existed the store carried a package it had already handed over.
      const fromStore = !!dropoff?.pickupStoreId;
      await this.writeHandoffRow({
        deliveryId:     delivery.id,
        stage:          fromStore ? 'store_to_driver' : 'customer_to_driver',
        method:         'typed_signature',
        fromUserId:     fromStore ? null : customerId,
        toUserId:       driverUserId,
        signatureName:  driverName,
        releasedByName: fromStore ? null : customerName,
        signedByRole:   'driver',
        partnerStoreId: fromStore ? dropoff.pickupStoreId : null,
        proofPhotoUrl:  null,
      });
      return;
    }

    // DELIVERED into a partner store is NOT the end of the driver's
    // custody. "Driver liable until the store scans": the store's own
    // scan writes driver_to_store, and writing it here instead would
    // discharge the rider on the rider's own word.
    if (dropoff?.mode === 'store_to_store') return;

    // A verified handoff (physical ID + OTP, or SEIRS ID + typed name)
    // already wrote this link on high-value packages. Do not follow a
    // strong record with a weak duplicate of the same handover.
    const relation = receivedBy?.relation ?? delivery.receivedByRelation ?? null;
    const typedName = receivedBy?.name?.trim()
      || delivery.receivedByName
      || (relation === 'recipient' ? customerName : null);

    await this.writeHandoffRow({
      deliveryId: delivery.id,
      stage:      'driver_to_recipient',
      // Nothing was verified on this path: the rider wrote down who took
      // it. Labelled honestly so a dispute is not misled, and deliberately
      // outside the method whitelist the high-value gate checks.
      method:         'receiver_name',
      fromUserId:     driverUserId,
      toUserId:       relation === 'recipient' ? customerId : null,
      signatureName:  typedName,
      releasedByName: driverName,
      signedByRole:   relation === 'recipient' ? 'recipient' : null,
      partnerStoreId: null,
      proofPhotoUrl:  proofPhotoUrl ?? delivery.proofPhotoUrl ?? null,
    });
  }

  /**
   * Insert one custody row, unless that stage is already on the chain.
   *
   * The guard is a read-then-write rather than a unique index because the
   * chain is legitimately allowed to repeat a stage on a relay leg
   * (driver_to_driver), so uniqueness is not a property of the table.
   */
  private async writeHandoffRow(row: {
    deliveryId:      string;
    stage:           string;
    method:          string;
    fromUserId:      string | null;
    toUserId:        string | null;
    signatureName:   string | null;
    releasedByName:  string | null;
    signedByRole:    string | null;
    partnerStoreId:  string | null;
    proofPhotoUrl:   string | null;
  }): Promise<void> {
    const existing = await this.repo.manager.query(
      `SELECT id FROM "handoff_records"
        WHERE "deliveryId" = $1 AND "stage" = $2 LIMIT 1`,
      [row.deliveryId, row.stage],
    );
    if (existing?.length) return;

    await this.repo.manager.query(
      `INSERT INTO "handoff_records"
         ("deliveryId", "stage", "method", "fromUserId", "toUserId",
          "signatureName", "releasedByName", "signedByRole",
          "partnerStoreId", "signatureSource", "proofPhotoUrl")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        row.deliveryId,
        row.stage,
        row.method,
        row.fromUserId,
        row.toUserId,
        row.signatureName,
        row.releasedByName,
        row.signedByRole,
        row.partnerStoreId,
        // The name came off the account, not out of anyone's fingers. The
        // apps do not prompt for a signature on these two transitions yet
        // and the record must not imply that they do.
        row.signatureName ? 'account' : null,
        row.proofPhotoUrl,
      ],
    );
  }

  private async syncStoreDropoff(deliveryId: string, status: DeliveryStatus) {
    if (!this.storeDropoffsRepo) return;
    const dropoff = await this.storeDropoffsRepo.findOne({ where: { deliveryId } });
    if (!dropoff) return;
    const terminal = ['collected', 'cancelled', 'return_triggered'];
    if (terminal.includes(dropoff.status)) return;

    const patch: any = {};
    switch (status) {
      case DeliveryStatus.ASSIGNED:
        patch.status = 'driver_en_route';
        break;
      case DeliveryStatus.PICKED_UP:
      case DeliveryStatus.IN_TRANSIT:
        patch.status = 'in_transit';
        if (!dropoff.pickedUpByDriverAt) patch.pickedUpByDriverAt = new Date();
        break;
      case DeliveryStatus.DELIVERED:
        if (dropoff.mode === 'store_to_store') {
          patch.status = 'at_dropoff_store';
          patch.arrivedAtDropoffStoreAt = new Date();
        } else {
          patch.status = 'collected';
          patch.collectedAt = new Date();
        }
        break;
      case DeliveryStatus.FAILED:
      case DeliveryStatus.CANCELLED:
        patch.status = 'awaiting_driver';
        patch.deliveryId = null;
        break;
      default:
        return;
    }
    await this.storeDropoffsRepo.update(dropoff.id, patch);
    this.logger.log(`store dropoff ${dropoff.dropCode} synced to ${patch.status} (delivery ${status})`);
  }

  async updateStatus(
    id: string,
    status: DeliveryStatus,
    proofPhotoUrl?: string,
    receivedBy?: { relation?: string; name?: string },
    actorUserId?: string,
  ) {
    const delivery = await this.repo.findOne({
      where: { id },
      // customer is loaded here because the webhook fan-out below needs
      // to know WHOSE order this is; without it events were broadcast.
      relations: ['driver', 'driver.user', 'customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');

    /**
     * Authorisation (audit 2026-08-14).
     *
     * This route carries a JWT guard, which proves the caller is *a* user
     * and nothing more. It was accepting a delivery id from the body of
     * any authenticated account and moving that delivery to any status,
     * so any signed-up customer could mark a stranger's package DELIVERED
     * (releasing escrow to the driver, card refund window closed) or
     * CANCELLED (refunding escrow and killing an in-flight job). The
     * delivery id is a UUID, but obscurity is not an access control.
     *
     * `actorUserId` is supplied by the HTTP layer only. Internal service
     * callers pass nothing and stay trusted, which is why this is opt-in
     * rather than a required argument.
     */
    if (actorUserId) {
      const driverUserId = delivery.driver?.user?.id;
      if (!driverUserId || driverUserId !== actorUserId) {
        throw new ForbiddenException(
          'Only the driver assigned to this delivery can update its status.',
        );
      }
      // The driver's app walks assigned -> picked_up -> in_transit ->
      // delivered, and reports failures. Cancellation is the customer's
      // call and goes through cancelByCustomer, which prices it.
      const driverMaySet: DeliveryStatus[] = [
        DeliveryStatus.PICKED_UP,
        DeliveryStatus.IN_TRANSIT,
        DeliveryStatus.DELIVERED,
        DeliveryStatus.FAILED,
      ];
      if (!driverMaySet.includes(status)) {
        throw new ForbiddenException(`A driver cannot move a delivery to ${status}.`);
      }
    }

    const fromStatus = delivery.status;

    /**
     * Proof photo is mandatory to close a delivery (founder 2026-08-12).
     *
     * The driver app already refused to submit without one, but the rule
     * lived only in the app: anything else reaching this method (the
     * developer API, a patched build, a direct call) could mark a package
     * DELIVERED with no evidence at all. A rule that decides disputes has
     * to be enforced where the data is written, not where it is typed.
     *
     * Accepts a photo already on the record so a retry after a dropped
     * connection does not force the driver to photograph a package they
     * have already handed over.
     */
    /**
     * Rides are exempt, and a ride was otherwise IMPOSSIBLE TO FINISH.
     *
     * This gate had no kind check, so it refused every run reaching
     * delivered without a photo. The driver app never offers the camera on
     * a ride (it guards on kind !== 'ride'), so a rider dropping a
     * passenger hit a server rejection with nothing they could do to
     * satisfy it. Found 2026-08-25.
     *
     * Exempting rides rather than making the app photograph passengers,
     * because the entity already says so: `kind` is documented on
     * Delivery as the thing that "gates the package-only surfaces
     * (photos, per-package codes, category rules)". Photos were declared
     * package-only when rides were built; this one call site missed it.
     *
     * It is also the right answer on its own merits. The photo exists to
     * evidence a package handed over in a dispute. A passenger who got
     * out of the car is not a handover, there is no custody to prove, and
     * photographing a person at their destination to close a trip is a
     * privacy problem rather than proof.
     */
    const isRide = String(delivery.kind ?? 'package') === 'ride';
    if (status === DeliveryStatus.DELIVERED && !isRide && !proofPhotoUrl && !delivery.proofPhotoUrl) {
      throw new BadRequestException(
        'A delivery cannot be completed without a proof photo. Take one at the drop-off point.',
      );
    }

    /**
     * Third-party acceptance. High-value packages may only be handed to
     * the recipient themselves, matching the existing failed-delivery
     * matrix where high value always redirects to a partner store rather
     * than a gate or a neighbour. Leaving a valuable package with a
     * gateman is exactly the loss we would be paying out on.
     */
    const relation = receivedBy?.relation;
    if (status === DeliveryStatus.DELIVERED && relation && relation !== 'recipient') {
      const threshold = await this.getHighValueThreshold();
      if (Number(delivery.declaredValueNgn ?? 0) >= threshold && Number(delivery.declaredValueNgn ?? 0) > 0) {
        throw new BadRequestException(
          'High-value package: it may only be handed to the recipient in person. ' +
          'If they are unavailable, report the arrival issue and it will be redirected to a partner store.',
        );
      }
      if (!receivedBy?.name?.trim()) {
        throw new BadRequestException(
          'Record the name of whoever accepted the package. It is what settles a dispute later.',
        );
      }
    }

    // High-value handoff gate (founder policy 2026-08-10: high-value
    // ONLY). At or above the catalogue threshold, DELIVERED requires a
    // verified driver_to_recipient handoff record (physical ID + email
    // OTP, or SEIRS ID + typed-name signature). A proof photo alone is
    // not enough when the package is worth real money. Handoff records
    // only exist for successful verifications, so existence = verified.
    if (status === DeliveryStatus.DELIVERED && Number(delivery.declaredValueNgn ?? 0) > 0) {
      const threshold = await this.getHighValueThreshold();
      if (Number(delivery.declaredValueNgn) >= threshold) {
        const rows = await this.repo.manager.query(
          `SELECT id FROM "handoff_records"
           WHERE "deliveryId" = $1 AND "stage" = 'driver_to_recipient'
             AND "method" IN ('physical_id', 'seirs_id')
           LIMIT 1`,
          [id],
        );
        if (!rows?.length) {
          const { BadRequestException } = await import('@nestjs/common');
          throw new BadRequestException(
            `High-value package (₦${Number(delivery.declaredValueNgn).toLocaleString()} declared): ` +
            'verify the recipient before completing. Tap "Verify Recipient" and finish ID + OTP or SEIRS ID + typed signature.',
          );
        }
      }
    }

    const timestamps: Partial<Delivery> = { status };
    if (status === DeliveryStatus.ASSIGNED)   timestamps.assignedAt  = new Date();
    if (status === DeliveryStatus.PICKED_UP)  timestamps.pickedUpAt  = new Date();
    if (status === DeliveryStatus.DELIVERED) {
      timestamps.deliveredAt = new Date();
      if (proofPhotoUrl) timestamps.proofPhotoUrl = proofPhotoUrl;
      if (relation) {
        timestamps.receivedByRelation = relation;
        timestamps.receivedByName = relation === 'recipient' ? null : (receivedBy?.name?.trim() ?? null);
      }
    }

    await this.repo.update(id, timestamps);

    // Append the status transition to the delivery event log. This is
    // what powers the DHL-style timeline on the public tracking page +
    // the admin per-delivery drill-in. Fire-and-forget: even if the
    // event log write fails, the status transition already committed.
    this.logEvent(id, DeliveryEventType.STATUS_CHANGE, EventActorRole.SYSTEM, {
      meta: { fromStatus, toStatus: status },
    }).catch(() => {});

    // Store-leg dropoffs mirror driver progress. Fire-and-forget: the
    // delivery transition already committed.
    this.syncStoreDropoff(id, status).catch((err) =>
      this.logger.warn(`store dropoff sync failed for ${id}: ${err?.message ?? err}`),
    );

    // Chain of custody. Same fire-and-forget discipline: a package that
    // physically changed hands has changed hands whether or not we managed
    // to write the paperwork, and failing the driver's status update over
    // it would strand them mid-round.
    this.recordCustodyTransition(delivery, status, receivedBy, proofPhotoUrl).catch((err) =>
      this.logger.warn(`custody record failed for ${id}: ${err?.message ?? err}`),
    );

    // If the DELIVERED transition included a proof photo, log a
    // separate PHOTO_ADDED event so the timeline can render the photo
    // as its own bullet.
    if (status === DeliveryStatus.DELIVERED && proofPhotoUrl) {
      this.logEvent(id, DeliveryEventType.PHOTO_ADDED, EventActorRole.DRIVER, {
        meta: { photoUrl: proofPhotoUrl, kind: 'proof_of_delivery' },
      }).catch(() => {});
    }

    if (this.trackingGateway) {
      this.trackingGateway.broadcastStatusChange(id, status);
    }

    // Auto-insert a system message into the chat so both parties see the
    // state change inline. Cuts down "where is my package?" questions by
    // making progress visible without switching to a tracking tab. Silent
    // fail if chatService isn't wired yet (module boot race, never happens
    // in prod but keeps tests happy).
    if (this.chatService) {
      const systemBody: Record<string, string> = {
        assigned:   'Driver assigned. They will pick up your package shortly.',
        picked_up:  'Driver has picked up your package.',
        in_transit: 'Package is on the way.',
        delivered:  'Package delivered.',
        cancelled:  'Delivery was cancelled.',
        failed:     'Delivery could not be completed.',
      };
      const label = systemBody[String(status)];
      if (label) {
        this.chatService.insertSystemMessage(id, String(status), label).catch(() => {});
      }

      // Right after "driver assigned": surface the customer's delivery
      // instructions as their own system message so the driver sees them
      // inline without opening a separate detail screen. `instructions`
      // systemType renders with a distinct icon client-side.
      if (String(status) === 'assigned' && delivery.deliveryInstructions?.trim()) {
        this.chatService
          .insertSystemMessage(id, 'instructions', `Customer instructions: ${delivery.deliveryInstructions.trim()}`)
          .catch(() => {});
      }

      // TTL policy: when delivered, post a countdown notice so both
      // parties know the thread will close for new messages in 1 hour.
      // (Admin can re-open via chatReopenedUntil for support cases.)
      if (String(status) === 'delivered') {
        this.chatService
          .insertSystemMessage(id, 'chat_closing', 'This chat will close in 1 hour. For anything after that, contact SEIRS support.')
          .catch(() => {});
      }
    }

    // Spec V8 Tier 3: fan out to partner webhook subscribers
    if (this.devPlatformService) {
      const eventMap: Record<string, string> = {
        assigned:   'order.driver_assigned',
        picked_up:  'order.picked_up',
        delivered:  'order.delivered',
        failed:     'order.failed',
        cancelled:  'order.cancelled',
      };
      const eventName = eventMap[String(status)];
      if (eventName) {
        // The owner is required: without it the fan-out used to go to
        // every merchant on the platform, not just the one whose order
        // this is.
        const ownerId = (delivery as any).customerId ?? delivery.customer?.id;
        this.devPlatformService.enqueue(eventName, {
          orderId:      id,
          trackingCode: delivery.trackingCode,
          status,
          occurredAt:   new Date().toISOString(),
        }, ownerId).catch(() => {});
      }
    }

    // Fetch customer for email (delivery.customer may not have email loaded)
    const withCustomer = await this.repo.findOne({ where: { id }, relations: ['customer'] });
    const customer = withCustomer?.customer;

    // In-app notifications on status change
    if (this.notificationsService && customer) {
      if (status === DeliveryStatus.DELIVERED) {
        this.notificationsService
          .notifyDeliveryComplete(customer.id, delivery.trackingCode, id)
          .catch(() => {});
      } else {
        this.notificationsService
          .notifyStatusUpdate(customer.id, delivery.trackingCode, status, delivery.id)
          .catch(() => {});
      }
    }

    // Email notifications on status change
    if (this.mailService && customer?.email) {
      if (status === DeliveryStatus.PICKED_UP) {
        this.mailService
          .sendDeliveryPickedUp(customer.email, customer.name, delivery.trackingCode)
          .catch(() => {});
      } else if (status === DeliveryStatus.DELIVERED) {
        this.mailService
          .sendDeliveryComplete(customer.email, customer.name, delivery.trackingCode)
          .catch(() => {});
      } else if (status === DeliveryStatus.FAILED) {
        this.mailService
          .sendDeliveryFailed(customer.email, customer.name, delivery.trackingCode)
          .catch(() => {});
      }
    }

    // Release escrow to driver when delivery is confirmed
    if (status === DeliveryStatus.DELIVERED && this.paymentsService) {
      const updated = await this.repo.findOne({ where: { id }, relations: ['driver', 'driver.user'] });
      if (updated?.driver?.user?.id) {
        this.paymentsService
          .releaseEscrow(id, updated.driver.user.id)
          .catch((err) => this.logger.error(`Escrow release failed: ${err.message}`));
      }
    }

    // Referral bonus: on the customer's qualifying DELIVERED, look up their
    // referredByCode (the referrer's accountId) and award the bonus. The
    // loyalty service holds all 7 gates (self-referral, dedupe, min-price,
    // monthly cap, velocity flag), so this call is safe to fire every time.
    const referredByCode = customer?.referredByCode;
    const referredUserId = customer?.id;
    if (
      status === DeliveryStatus.DELIVERED &&
      this.loyaltyService && this.usersRepoRef &&
      referredByCode && referredUserId
    ) {
      this.usersRepoRef
        .findOne({ where: { accountId: referredByCode } })
        .then((referrer: any) => {
          if (!referrer) return;
          return this.loyaltyService.awardReferralBonusIfEligible({
            referrerUserId:    referrer.id,
            referredUserId,
            triggerDeliveryId: id,
          });
        })
        .catch((err: any) => this.logger.error(`Referral bonus check failed: ${err?.message ?? err}`));
    }

    /**
     * A terminal run means its packages are terminal too. Without this a
     * cancelled run still listed every parcel as "pending", so the sender
     * saw a cancelled booking whose packages looked like they were still
     * coming (founder 2026-08-17). Only undelivered stops are touched: a
     * parcel already handed over stays delivered.
     */
    if (status === DeliveryStatus.CANCELLED || status === DeliveryStatus.FAILED) {
      try {
        await this.repo.manager.getRepository(DeliveryStop)
          .createQueryBuilder()
          .update(DeliveryStop)
          .set({ status: status === DeliveryStatus.CANCELLED
            ? DeliveryStopStatus.CANCELLED
            : DeliveryStopStatus.FAILED })
          .where('"deliveryId" = :id', { id })
          .andWhere('status NOT IN (:...done)', {
            done: [DeliveryStopStatus.DELIVERED, DeliveryStopStatus.FAILED, DeliveryStopStatus.CANCELLED],
          })
          .execute();
      } catch (e: any) {
        this.logger.warn(`stop status sync skipped for ${id}: ${e?.message ?? e}`);
      }
    }

    /**
     * Pay the rider their floor on a run that died.
     *
     * driverFailedTripNgn was written when the rider reported the
     * problem and read by nothing, so the money was calculated,
     * displayed nowhere, and never paid (2026-08-27).
     *
     * Only on a TERMINAL state. Founder rule of 27 Aug: if the run is
     * later redirected and completes, the rider gets the full delivery
     * pay and this floor is absorbed rather than stacked on top. Since
     * a delivery cannot be both failed and delivered, and the earnings
     * ledger is idempotent per delivery, the two can never both land.
     */
    if (
      (status === DeliveryStatus.FAILED || status === DeliveryStatus.CANCELLED) &&
      this.paymentsService
    ) {
      const forPay = await this.repo.findOne({
        where: { id },
        relations: ['driver', 'driver.user'],
        select: undefined,
      });
      const floorNgn = Number((forPay as any)?.driverFailedTripNgn ?? 0) || 0;
      const riderUserId = forPay?.driver?.user?.id;
      if (floorNgn > 0 && riderUserId) {
        await (this.paymentsService as any)
          .payFailedTripCompensation(id, riderUserId, floorNgn)
          .catch((e: any) => this.logger.error(`Failed-trip pay failed for ${id}: ${e.message}`));
      }
    }

    // Refund escrow if delivery failed or cancelled
    if (
      (status === DeliveryStatus.FAILED || status === DeliveryStatus.CANCELLED) &&
      this.paymentsService
    ) {
      const updated = await this.repo.findOne({ where: { id }, relations: ['customer'] });
      if (updated?.customer?.id) {
        // A cancellation fee agreed by the customer is withheld from the
        // refund. cancelByCustomer writes it before flipping the status,
        // so it is on the row by the time we read it here. Failures leave
        // it null and the customer is refunded in full, which is the side
        // to err on.
        const withholdNgn =
          status === DeliveryStatus.CANCELLED
            ? Number(updated.cancellationFeeNgn ?? 0) || 0
            : 0;
        this.paymentsService
          .refundEscrow(id, updated.customer.id, withholdNgn)
          .catch((err) => this.logger.error(`Escrow refund failed: ${err.message}`));

        /**
         * Money going back means the points earned on it go back too.
         * Without this, booking and cancelling minted loyalty: a
         * refunded business run left 101 points standing (2026-08-16).
         * Sits beside the refund so every app is covered by one hook,
         * and is idempotent, so repeated cancellations are harmless.
         */
        this.loyaltyService
          ?.clawbackForDelivery(id)
          .catch((err: any) => this.logger.error(`Loyalty clawback failed for ${id}: ${err?.message ?? err}`));
      }
    }

    return this.repo.findOne({ where: { id } });
  }

  /**
   * Auto-expiry sweep (founder decision 2026-08-15: one hour, max). A
   * PENDING booking still unclaimed after the window is cancelled and
   * refunded IN FULL: the fare was escrowed at booking, and three real
   * bookings from 13-14 Aug were found still pending with their money
   * locked. No cancellation fee is ever withheld here: the platform
   * failed to supply a driver, so the failure is ours, not theirs.
   * Window comes from the admin-tunable pending_booking_expiry_minutes
   * fee row. Called by the scheduler every five minutes.
   */
  async expireStalePending(): Promise<number> {
    let minutes = 60;
    if (this.feesServiceRef) {
      try { minutes = Number(await this.feesServiceRef.getValueOr('pending_booking_expiry_minutes', 60)) || 60; }
      catch { /* seeded default stands */ }
    }
    const cutoff = new Date(Date.now() - minutes * 60_000);
    const stale = await this.repo.find({
      where: { status: DeliveryStatus.PENDING, createdAt: LessThan(cutoff) },
      relations: ['customer'],
    });
    for (const d of stale) {
      // Each booking is isolated: a synchronous throw from any collaborator
      // (first prod run: one refund threw and stalled the rest of the list
      // until later cycles) must never block the remaining refunds.
      try {
        await this.repo.update(d.id, { status: DeliveryStatus.CANCELLED });

        /**
         * Give the seat back (2026-08-29).
         *
         * A Travel Buddy booking reserves against driver_trips.seatsBooked
         * the moment it is created, before any payment. Nothing ever
         * released it: the five-minute sweep that expires unpaid holds
         * reads seat_bookings rows, and this path creates none.
         *
         * So one abandoned unpaid booking took the last seat on a trip
         * and kept it. Reproduced on the device: the trip went to "Trip
         * is full" and stayed there, unbookable by anybody, for a
         * booking that was never paid for.
         *
         * The Fee Catalogue says the opposite in plain words, that an
         * unpaid hold is "how long the quoted fare lasts, not a
         * reservation" and "the segment stays SELLABLE throughout". This
         * makes the code agree with the policy it already published.
         */
        if (d.tripId && this.driversService) {
          const seats = Number((d as any).seatCount ?? 0) || 1;
          await (this.driversService as any).releaseSeats(d.tripId, seats)
            .catch((err: any) =>
              this.logger.error(`Seat release failed for ${d.trackingCode}: ${err?.message ?? err}`));
        }

        if (this.trackingGateway) {
          try { this.trackingGateway.broadcastStatusChange(d.id, DeliveryStatus.CANCELLED); } catch { /* ws only */ }
        }
        if (d.customer?.id && this.paymentsService) {
          try {
            await this.paymentsService.refundEscrow(d.id, d.customer.id, 0);
          } catch (err: any) {
            this.logger.error(`Auto-expiry refund failed for ${d.trackingCode}: ${err?.message ?? err}`);
          }
        }
        // This sweep sets the status directly rather than going through
        // updateStatus, so it needs its own clawback: otherwise a booking
        // that expires unclaimed keeps the points it earned on a fare
        // that was refunded in full.
        try {
          await this.loyaltyService?.clawbackForDelivery(d.id);
        } catch (err: any) {
          this.logger.error(`Auto-expiry loyalty clawback failed for ${d.trackingCode}: ${err?.message ?? err}`);
        }
        if (d.customer?.id && this.notificationsService) {
          this.notificationsService
            .notifyStatusUpdate(d.customer.id, d.trackingCode, DeliveryStatus.CANCELLED, d.id)
            .catch(() => {});
        }
      } catch (err: any) {
        this.logger.error(`Auto-expiry failed for ${d.trackingCode}: ${err?.message ?? err}`);
      }
    }
    if (stale.length) {
      this.logger.log(`Auto-expired ${stale.length} pending booking(s) past ${minutes} min; refunds issued in full`);
    }
    return stale.length;
  }

  /**
   * Cancellation pricing, read off the active rate card so admin retunes
   * it without a deploy. Falls back to the seeded defaults if the card is
   * missing or malformed, in the same shape as getHighValueThreshold.
   */
  /**
   * A rider reports a problem with the job in front of them.
   *
   * The case this exists for: the rider is at the pickup, the parcel is
   * not what the sender described, and until now they had no way to say
   * so. The only route was to back out of the active job, find Profile ->
   * Support, open a ticket with no photo, then attach one inside the
   * thread. Five screens at a roadside with a sender watching, so in
   * practice the rider either accepted a parcel they should not have or
   * rang someone personally, and no record existed either way.
   *
   * Flags the delivery and opens a support ticket carrying the rider's
   * photo in one call, so a half-failure cannot leave a dispute with no
   * ticket or a ticket with no dispute.
   */
  async reportIssue(
    deliveryId: string,
    driverUserId: string,
    body: { reason: string; note?: string; photoUrl?: string },
  ) {
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['driver', 'driver.user', 'customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');

    // Only the rider actually holding this job may dispute it. A valid
    // token proves who they are, not that this delivery is theirs.
    const assignedUserId = (delivery as any).driver?.user?.id ?? null;
    if (!assignedUserId || assignedUserId !== driverUserId) {
      throw new ForbiddenException('This delivery is not assigned to you.');
    }

    const REASONS: Record<string, string> = {
      mismatch:   'Package does not match the description',
      overweight: 'Heavier than declared',
      absent:     'Sender not present or wrong address',
      unsafe:     'Unsafe or refused item',
    };
    const label = REASONS[body?.reason];
    if (!label) throw new BadRequestException('Unknown reason.');

    // The rider made this trip whoever was at fault, and reporting a bad
    // parcel is the behaviour we want. Deciding the money here, at the
    // moment they report, is what stops it becoming an argument later.
    delivery.driverFailedTripNgn = await this.computeFailedTripPay(delivery);
    delivery.disputedAt      = new Date();
    delivery.disputeReason   = body.reason;
    delivery.disputePhotoUrl = body.photoUrl ?? null;
    await this.repo.save(delivery);

    let ticketId: string | null = null;
    const lines = [
      'Rider reported: ' + label + '.',
      'Tracking ' + delivery.trackingCode + '.',
      body.note && body.note.trim() ? 'Rider note: ' + body.note.trim() : null,
      // Same convention the ticket thread uses for images, so the photo
      // renders inline for the agent instead of arriving as bare text.
      body.photoUrl ? '📎 ' + body.photoUrl : null,
    ].filter(Boolean) as string[];

    try {
      const ticket: any = await this.supportService.create(driverUserId, {
        topic:            TicketTopic.DELIVERY,
        subject:          label + ' - ' + delivery.trackingCode,
        firstMessage:     lines.join('\n'),
        linkedDeliveryId: delivery.id,
      });
      ticketId = ticket?.id ?? null;
    } catch (e: any) {
      // The dispute flag is the part that must not be lost. A ticket that
      // failed to open is recoverable; a rider who reported a problem and
      // had it silently dropped is not.
      this.logger.error('reportIssue: ticket creation failed: ' + (e?.message ?? e));
    }

    return { ok: true, disputedAt: delivery.disputedAt, reason: body.reason, ticketId };
  }

  /**
   * The card processing already spent on this booking, which a refund
   * does not give back.
   *
   * Charged on top of the stage fee so a cancellation is neutral to
   * SEIRS rather than a small loss. cancel_processing_pct is a Fee
   * Catalogue row precisely so it can be set to 0 the day Flutterwave
   * starts refunding their cut.
   */
  private async getCancelProcessingNgn(pricePaidNgn: number): Promise<number> {
    const price = Number(pricePaidNgn ?? 0);
    if (!(price > 0)) return 0;
    const pct = this.feesServiceRef
      ? Number(await this.feesServiceRef.getValueOr('cancel_processing_pct', 1.4))
      : 1.4;
    if (!Number.isFinite(pct) || pct <= 0) return 0;
    // Never let a misconfigured row swallow the whole fare.
    const capped = Math.min(pct, 100);
    return Math.round((price * capped) / 100);
  }

  /**
   * Driver cancels an accepted job (founder 2026-08-23). Rule one: the
   * customer never pays for a service not received: escrow stays put
   * and the booking re-dispatches. Reason required; 'unsafe' is always
   * free (safety must never be rationed); the rest draw from a daily
   * allowance, after which offers pause via priorityPenaltyUntil.
   */
  static readonly DRIVER_CANCEL_REASONS = [
    'emergency', 'vehicle_problem', 'unsafe', 'wrong_booking_type',
    'customer_unreachable', 'other',
  ] as const;

  async driverCancel(deliveryId: string, driverUserId: string, reason: string, note?: string) {
    if (!DeliveriesService.DRIVER_CANCEL_REASONS.includes(reason as any)) {
      const { BadRequestException } = await import('@nestjs/common');
      throw new BadRequestException('A real reason is required.');
    }
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['driver', 'driver.user', 'customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.driver?.user?.id !== driverUserId) {
      throw new ForbiddenException('This job is not assigned to you.');
    }
    if (!['assigned', 'picked_up'].includes(String(delivery.status))) {
      const { BadRequestException } = await import('@nestjs/common');
      throw new BadRequestException(
        delivery.status === 'in_transit'
          ? 'The trip has started: end it instead of cancelling.'
          : 'This job can no longer be cancelled.',
      );
    }

    const driverId = delivery.driver!.id;
    const stage = String(delivery.status);
    const kind  = String((delivery as any).kind ?? 'package');

    // The audit row FIRST: nothing about this path is silent.
    await this.repo.manager.query(
      `INSERT INTO "driver_cancellations" ("deliveryId","driverId","reason","note","stage","kind")
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [deliveryId, driverId, reason, note?.trim() || null, stage, kind],
    );

    /**
     * Was this a job the rider was ASKED for by name and agreed to?
     * (2026-08-31, founder: "they default of a signed contract")
     *
     * Backing out of a job the pool offered is ordinary attrition and
     * the allowance below handles it. Backing out of one a sender chose
     * you for, waited on your answer for, and paid for on the strength
     * of that answer, is a different act and gets its own record with
     * its own evidence.
     *
     * NOTHING HERE BANS ANYBODY, per instruction. It records, freezes
     * the strike count so the evidence cannot drift, and leaves the
     * decision to a person: a rider whose bike was seized at a
     * checkpoint defaults in exactly the same row as one who could not
     * be bothered, and only a human can tell those apart.
     *
     * Wrapped so an enforcement failure can never block a rider from
     * cancelling. Trapping somebody in a job to protect an audit trail
     * would be the worse bug.
     */
    try {
      const agreed = await this.repo.manager.query(
        `SELECT "id", "answeredAt" FROM "parcel_requests"
          WHERE "deliveryId" = $1 AND "status" = 'accepted' LIMIT 1`,
        [deliveryId],
      );
      if (agreed?.length) {
        const windowDays = this.feesServiceRef
          ? await this.feesServiceRef.getValueOr('agreement_breach_window_days', 90).catch(() => 90)
          : 90;
        const prior = await this.repo.manager.query(
          `SELECT COUNT(*)::int AS c FROM "agreement_breaches"
            WHERE "driverId" = $1 AND "createdAt" > NOW() - ($2 || ' days')::interval`,
          [driverId, String(windowDays)],
        );
        const strike = Number(prior?.[0]?.c ?? 0) + 1;
        await this.repo.manager.query(
          `INSERT INTO "agreement_breaches"
             ("driverId","deliveryId","parcelRequestId","agreedAt","stage","reason","note","fareNgn","strikeCount")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            driverId, deliveryId, agreed[0].id, agreed[0].answeredAt ?? null,
            stage, reason, note?.trim() || null,
            Number(delivery.price ?? 0) || null, strike,
          ],
        );
        this.logger.warn(
          `AGREEMENT_BREACH driver=${driverId} delivery=${deliveryId} ` +
          `request=${agreed[0].id} stage=${stage} reason=${reason} strike=${strike} ` +
          `(recorded for admin review; no automatic action taken)`,
        );
      }
    } catch (e: any) {
      this.logger.error(`agreement breach record failed: ${e?.message ?? e}`);
    }

    // Allowance: safety is exempt, everything else counts.
    if (reason !== 'unsafe' && this.feesServiceRef) {
      try {
        const freePerDay = await this.feesServiceRef.getValueOr('driver_cancel_free_per_day', 2);
        const rows = await this.repo.manager.query(
          `SELECT COUNT(*)::int AS c FROM "driver_cancellations"
            WHERE "driverId" = $1 AND "reason" != 'unsafe' AND "createdAt" > NOW() - interval '24 hours'`,
          [driverId],
        );
        if (Number(rows?.[0]?.c ?? 0) > Number(freePerDay)) {
          const pauseHours = await this.feesServiceRef.getValueOr('driver_cancel_pause_hours', 2);
          /**
           * GREATEST, so a penalty can only ever be extended.
           *
           * priorityPenaltyUntil carries two unrelated penalties: this
           * one, and the wind-down penalty in drivers.service.ts, which
           * runs to end-of-tomorrow. This wrote NOW() + 2 hours
           * unconditionally, so a rider already penalised until tomorrow
           * evening who then blew through their cancel allowance had that
           * penalty CUT to two hours (audit, 2026-08-28).
           *
           * Cancelling jobs was a way to shorten a penalty for not
           * cancelling jobs. Whichever penalty ends later now wins.
           */
          await this.repo.manager.query(
            `UPDATE "drivers"
                SET "priorityPenaltyUntil" = GREATEST(
                      COALESCE("priorityPenaltyUntil", NOW()),
                      NOW() + ($1 || ' hours')::interval)
              WHERE "id" = $2`,
            [String(pauseHours), driverId],
          );
          this.logger.warn(`Driver ${driverId} exceeded the daily cancel allowance: offers paused ${pauseHours}h`);
        }
      } catch (e: any) {
        this.logger.warn(`cancel allowance check failed: ${e?.message ?? e}`);
      }
    }

    // Wrong booking type (founder 2026-08-23): a person where a parcel
    // should be, or the reverse. The booking is bogus, so it DIES
    // instead of re-dispatching, the customer pays the wasted-trip fee
    // (recorded like every cancellation fee), and repeat offenders are
    // flagged. The driver keeps a clean allowance for reporting it.
    if (reason === 'wrong_booking_type') {
      const rules = await this.getCancellationRules();
      await this.repo.update(deliveryId, {
        cancellationFeeNgn: rules.postAssignNgn,
        cancelledAt:        new Date(),
        cancellationReason: `Driver reported wrong booking type (${kind === 'ride' ? 'booked a ride, found a package' : 'booked a package, found a person'})`,
      } as any);
      await this.updateStatus(deliveryId, DeliveryStatus.CANCELLED);

      try {
        const repeats = await this.repo.manager.query(
          `SELECT COUNT(*)::int AS c FROM "driver_cancellations" dc
            JOIN "deliveries" d ON d."id" = dc."deliveryId"
           WHERE dc."reason" = 'wrong_booking_type'
             AND d."customerId" = $1
             AND dc."createdAt" > NOW() - interval '30 days'`,
          [delivery.customer.id],
        );
        const n = Number(repeats?.[0]?.c ?? 0);
        if (n >= 2) {
          this.logger.warn(`Customer ${delivery.customer.id} has ${n} wrong-type bookings in 30d: review candidate`);
        }
        this.notificationsService?.create?.(
          delivery.customer.id,
          'Booking cancelled: wrong booking type',
          kind === 'ride'
            ? 'The driver found a package where a passenger was booked. A cancellation fee applies. Book Send a Package for parcels: it takes the same 4 steps.'
            : 'The driver found a passenger where a package was booked. A cancellation fee applies. Book a Ride for people: it takes 3 steps.',
          'general' as any,
          deliveryId,
          delivery.trackingCode,
        );
      } catch { /* best effort */ }

      return { ok: true, redispatched: false, cancelled: true };
    }

    // Every other reason: the booking goes back to the pool: customer
    // keeps their escrow, matching finds the next driver.
    await this.repo.update(deliveryId, {
      driver:     null as any,
      status:     DeliveryStatus.PENDING,
      assignedAt: null as any,
    });

    if (this.notificationsService) {
      try {
        this.notificationsService.create?.(
          delivery.customer.id,
          kind === 'ride' ? 'Finding you a new rider' : 'Finding you a new driver',
          kind === 'ride'
            ? 'Your rider had to cancel. You have not been charged anything extra: we are matching the next rider now.'
            : 'Your driver had to cancel. Your payment is safe: we are matching the next driver now.',
          'delivery_assigned' as any,
          deliveryId,
          delivery.trackingCode,
        );
      } catch { /* best effort */ }
    }

    // Re-dispatch immediately when the fare is already held.
    if (delivery.paymentHeldAt) {
      const fresh = await this.repo.findOne({ where: { id: deliveryId }, relations: ['customer'] });
      if (fresh) this.runAutoMatch(fresh).catch(() => {});
    }

    return { ok: true, redispatched: !!delivery.paymentHeldAt };
  }

  private async getCancellationRules(): Promise<{
    preAssignNgn: number; postAssignNgn: number; driverShareNgn: number;
  }> {
    const fallback = { preAssignNgn: 50, postAssignNgn: 300, driverShareNgn: 200 };
    try {
      const rows = await this.repo.manager.query(
        `SELECT "feeRules" FROM "rate_cards" WHERE "isActive" = true LIMIT 1`,
      );
      const r = rows?.[0]?.feeRules ?? {};
      const num = (v: any, d: number) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : d;
      };
      return {
        preAssignNgn:   num(r.cancelPreAssignCustomer,  fallback.preAssignNgn),
        postAssignNgn:  num(r.cancelPostAssignCustomer, fallback.postAssignNgn),
        driverShareNgn: num(r.cancelPostAssignDriver,   fallback.driverShareNgn),
      };
    } catch {
      return fallback;
    }
  }

  /**
   * What cancelling this delivery costs, right now.
   *
   * Stages, and why they are drawn here:
   *   PENDING  - nothing has been dispatched. Token fee only, which
   *              exists to deter book-and-cancel price probing.
   *   ASSIGNED - a driver is already riding to the pickup on their own
   *              fuel. They are compensated out of the fee.
   *   PICKED_UP and beyond - not a cancellation. Somebody else is
   *              holding the customer's property; getting it back is a
   *              return-to-sender, priced separately and handled by
   *              support. The customer app used to quote an invented
   *              ₦500 "mid-route" fee here, which existed in no rate
   *              card and was never charged.
   */
  async getCancellationQuote(deliveryId: string, userId: string) {
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.customer?.id !== userId) {
      throw new ForbiddenException('This delivery belongs to another account.');
    }

    const rules = await this.getCancellationRules();
    const status = delivery.status;

    // Sunk card cost, withheld at every stage so a cancellation does not
    // lose SEIRS money. Zero when the row is set to zero.
    const processingNgn = await this.getCancelProcessingNgn(Number(delivery.price ?? 0));

    if (status === DeliveryStatus.PENDING) {
      // An unpaid booking has no card cost to recover and nothing to
      // withhold a fee from: the dialog was quoting "NGN 27 applies and
      // the rest is refunded" on a booking where nothing had been paid
      // (device QA 2026-08-22). Free, and the copy says why.
      if (!delivery.paymentHeldAt) {
        return {
          cancellable:  true,
          stage:        'pre_payment',
          feeNgn:       0,
          stageFeeNgn:  0,
          processingNgn: 0,
          reason:       'Nothing has been paid yet, so cancelling is free.',
        };
      }
      return {
        cancellable:  true,
        stage:        'pre_assign',
        feeNgn:       rules.preAssignNgn + processingNgn,
        stageFeeNgn:  rules.preAssignNgn,
        processingNgn,
        reason:       'No driver has been dispatched yet.',
      };
    }
    if (status === DeliveryStatus.ASSIGNED) {
      return {
        cancellable:  true,
        stage:        'post_assign',
        feeNgn:       rules.postAssignNgn + processingNgn,
        stageFeeNgn:  rules.postAssignNgn,
        processingNgn,
        driverShareNgn: rules.driverShareNgn,
        reason:       'A driver is already on the way to your pickup.',
      };
    }
    return {
      cancellable:   false,
      stage:         'too_late',
      feeNgn:        0,
      stageFeeNgn:   0,
      processingNgn: 0,
      reason:
        status === DeliveryStatus.PICKED_UP || status === DeliveryStatus.IN_TRANSIT
          ? 'The driver already has your package. Contact support to arrange a return.'
          : `This delivery is already ${status}.`,
    };
  }

  /**
   * The customer cancels their own booking.
   *
   * Before this existed the customer app showed a cancellation dialog
   * quoting a live rate-card fee, and on confirm it navigated to the home
   * tab. Nothing was sent anywhere: the delivery stayed active, the
   * driver kept riding to a pickup the customer believed was called off,
   * and the fee the customer had just agreed to was never charged.
   *
   * Routing through updateStatus rather than a direct repo write is
   * deliberate. That is where escrow refunds, the WS broadcast, the
   * chat system message, the event log and partner webhooks all hang off
   * the transition.
   */
  /**
   * Release Travel Buddy seats when a trip booking dies.
   *
   * Reads the seatCount column, falling back to parsing "Seat x2" out of
   * packageDescription only for rows booked before that column existed.
   * The regex was the sole source here while the expiry sweep already
   * used the column, so the two paths that give a seat back disagreed
   * about where the number lives (2026-08-29). A description that gets
   * reworded would have silently released one seat instead of three.
   */
  private async releaseTripSeatsFor(delivery: any) {
    const tripId = delivery?.tripId;
    if (!tripId || !this.driversService) return;
    let seats = Number(delivery.seatCount ?? 0);
    if (!(seats > 0)) {
      const m = /Seat x(\d+)/.exec(String(delivery.packageDescription ?? ''));
      seats = Math.max(1, Number(m?.[1] ?? 1));
    }
    await (this.driversService as any).releaseSeats(tripId, seats).catch(() => {});
  }

  /**
   * Edit a booking that has not been paid for.
   *
   * Founder, 2026-08-29: "why can't a user edit their previous booking
   * since they haven't paid". There was no answer. The only actions on
   * an unpaid booking were Pay now and Cancel, so fixing a wrong flat
   * number or a mistyped weight meant throwing the booking away and
   * building it again from the first screen, losing the tracking code
   * the sender may already have passed to the receiver.
   *
   * Three kinds book through three different engines, so the edit
   * branches the same way rather than pretending they are one thing:
   *
   *   package            -> computePrice     (category, weight, distance)
   *   ride, no trip      -> computeRidePrice (Book-a-Ride, in-city)
   *   ride, with a trip  -> computeSeatPrice (Travel Buddy seat)
   *
   * The price is ALWAYS recomputed here and never accepted from the
   * app. Editing is the one place where a client could otherwise
   * resubmit an old total against new, more expensive details, so the
   * row is re-priced through the same versioned card that create()
   * uses and the caller is told what it now costs.
   */
  private static readonly EDITABLE_STATES: DeliveryStatus[] = [DeliveryStatus.PENDING];

  async editUnpaidBooking(
    deliveryId: string,
    userId: string,
    body: {
      pickupAddress?: string; pickupLat?: number; pickupLng?: number;
      dropoffAddress?: string; dropoffLat?: number; dropoffLng?: number;
      weightKg?: number; categoryCode?: string; vehicleType?: string;
      declaredValueNgn?: number; packageDescription?: string; notes?: string;
      receiverFirstName?: string; receiverLastName?: string; receiverPhone?: string;
      scheduledFor?: string | null;
      seats?: number; luggage?: string;
      /** Travel Buddy: ride a different leg of the same trip. */
      boardStopId?: string; alightStopId?: string;
    },
  ) {
    const delivery = await this.repo.findOne({
      where: { id: deliveryId },
      relations: ['customer', 'driver', 'stops'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    // Ownership, not just identity: the token proves who is asking, it
    // does not prove this booking is theirs.
    if (delivery.customer?.id !== userId) {
      throw new NotFoundException('Delivery not found.'); // no oracle
    }

    if (!DeliveriesService.EDITABLE_STATES.includes(delivery.status)) {
      throw new BadRequestException(
        'This booking is already under way, so it can no longer be edited. Cancel it or message support.',
      );
    }
    if (delivery.paymentHeldAt) {
      throw new BadRequestException(
        'This booking is already paid for. Cancel it to make changes, and the refund rules on the cancellation screen apply.',
      );
    }
    if (delivery.driver) {
      throw new BadRequestException('A driver has already been assigned. Cancel the booking to make changes.');
    }
    // A multi-package run is a parent plus a DeliveryStop row per
    // parcel, each with its own receiver, tracking code and state. It is
    // edited stop by stop, not through this single-row path, and
    // silently repricing the parent would leave the stops behind.
    if (Array.isArray(delivery.stops) && delivery.stops.length > 1) {
      throw new BadRequestException(
        'A multi-package run is edited one package at a time. Open the package you want to change.',
      );
    }

    const isSeat = !!delivery.tripId;
    const isRide = delivery.kind === 'ride';
    const before = Number(delivery.price ?? 0);

    if (isSeat) {
      /* ---- Travel Buddy seat: seats, luggage, and which leg ----
         The board and alight points are NOT free text. A passenger
         cannot type an address, because the rider is not going there;
         they pick from the stops the rider actually declared. That is
         also why this reads them back out of the database rather than
         trusting the request: the pair must belong to THIS trip and be
         in travel order, or a crafted body buys a 943 km ride for the
         price of a 12 km hop (founder 2026-08-29, "can you edit the
         address too"). */
      let segment: {
        boardCity: string; alightCity: string; segmentKm: number;
        boardAddress: string; boardLat: number; boardLng: number;
        alightAddress: string; alightLat: number; alightLng: number;
      } | null = null;

      if (body.boardStopId && body.alightStopId) {
        const rows: Array<any> = await this.repo.manager.query(
          `SELECT "id","trip_id","sequence","city","address","latitude","longitude","km_from_origin"
             FROM "trip_stops" WHERE "id" = ANY($1) AND "trip_id" = $2`,
          [[body.boardStopId, body.alightStopId], delivery.tripId],
        ).catch(() => []);
        const board  = rows.find(r => r.id === body.boardStopId);
        const alight = rows.find(r => r.id === body.alightStopId);
        if (!board || !alight) {
          throw new BadRequestException('Those stops are not on this trip.');
        }
        if (Number(alight.sequence) <= Number(board.sequence)) {
          throw new BadRequestException('You cannot board after you get off. Pick the stops the other way round.');
        }
        const segKm = Math.round((Number(alight.km_from_origin) - Number(board.km_from_origin)) * 10) / 10;
        if (!(segKm > 0)) {
          throw new BadRequestException('That part of the route has no measured distance yet. Try again shortly.');
        }
        segment = {
          boardCity: board.city, alightCity: alight.city, segmentKm: segKm,
          boardAddress: board.address, boardLat: Number(board.latitude), boardLng: Number(board.longitude),
          alightAddress: alight.address, alightLat: Number(alight.latitude), alightLng: Number(alight.longitude),
        };
      }

      const currentSeats = Number(delivery.seatCount ?? 0) || 1;
      const wantSeats = body.seats == null
        ? currentSeats
        : Math.max(1, Math.round(Number(body.seats) || 1));

      // The luggage choice has never had a column: it lives inside
      // packageDescription as "large luggage". Read the current value
      // from there so an edit that only changes the seat count does not
      // silently drop luggage the passenger already chose.
      const desc = String(delivery.packageDescription ?? '');
      const currentLuggage = /large luggage/.test(desc) ? 'large'
                           : /small bag/.test(desc)     ? 'small'
                           : 'none';
      const wantLuggage = body.luggage ?? currentLuggage;

      const delta = wantSeats - currentSeats;
      if (delta > 0) {
        /**
         * Say what is actually true before claiming.
         *
         * reserveSeats refuses correctly but its message is written for
         * a race: "Those seats were just taken." On a one-seat okada
         * whose only seat is the passenger's own, that is simply untrue
         * and reads as though a stranger beat them to it (device QA
         * 2026-08-29, founder watching). The trip is read first so the
         * refusal can name the real number.
         */
        const [t] = await this.repo.manager.query(
          `SELECT "seatsTotal", "seatsBooked" FROM "driver_trips" WHERE "id" = $1`,
          [delivery.tripId],
        ).catch(() => []);
        if (t) {
          // This booking's own seats are already inside seatsBooked, so
          // they are added back to get what this passenger could hold.
          const ceiling = Number(t.seatsTotal ?? 0) - Number(t.seatsBooked ?? 0) + currentSeats;
          if (wantSeats > ceiling) {
            throw new BadRequestException(
              ceiling <= currentSeats
                ? `This trip has no more seats: you already hold ${currentSeats === 1 ? 'the last one' : `all ${currentSeats}`}.`
                : `Only ${ceiling} seat${ceiling === 1 ? '' : 's'} can be held on this trip.`,
            );
          }
        }
        // Claim through the same guarded increment that refuses to
        // oversell, so an edit cannot do what a booking cannot.
        await (this.driversService as any).reserveSeats(delivery.tripId, delta);
      }

      let priced: any;
      try {
        priced = await this.rateCardPricing.computeSeatPrice({
          vehicleType: delivery.vehicleType,
          // A changed leg is a changed distance, and the fare follows it.
          routeKm:     segment ? segment.segmentKm : Number(delivery.distanceKm ?? 0),
          seats:       wantSeats,
          luggage:     wantLuggage,
        });
      } catch (e) {
        // Give the extra seats straight back: nobody should hold seats
        // for a change that did not go through.
        if (delta > 0) {
          await (this.driversService as any).releaseSeats(delivery.tripId, delta).catch(() => {});
        }
        throw e;
      }
      if (delta < 0) {
        await (this.driversService as any).releaseSeats(delivery.tripId, -delta).catch(() => {});
      }

      if (segment) {
        delivery.distanceKm     = segment.segmentKm;
        delivery.pickupAddress  = `${segment.boardAddress} (agree the exact spot in chat)`;
        delivery.pickupLat      = segment.boardLat;
        delivery.pickupLng      = segment.boardLng;
        delivery.dropoffAddress = segment.alightAddress;
        delivery.dropoffLat     = segment.alightLat;
        delivery.dropoffLng     = segment.alightLng;
      }

      const leg = segment
        ? `${segment.boardCity} \u2192 ${segment.alightCity}`
        : desc.split('\u00b7')[1]?.trim();
      delivery.seatCount = wantSeats;
      delivery.packageDescription =
        `Seat x${wantSeats}` + (leg ? ` \u00b7 ${leg}` : '') +
        (wantLuggage === 'large' ? ' \u00b7 large luggage' : wantLuggage === 'small' ? ' \u00b7 small bag' : '');
      /**
       * computeSeatPrice returns { customer: { total }, driver: { total } },
       * the same shape computePrice uses. This read priced.price and
       * priced.total, neither of which exists, so both fell through to
       * the zero default and an edited leg saved as a FREE RIDE. Caught
       * on the device changing Jos->Lagos to Ibadan->Lagos and watching
       * 30,431.10 become 0.00 (2026-08-29).
       *
       * The guard below is the belt: a seat that prices at nothing is a
       * bug every time, never a discount, so it refuses rather than
       * writing it. bookTripSeats reads price.driver.total correctly and
       * was never affected.
       */
      const seatTotal  = Number(priced?.customer?.total ?? 0);
      const seatDriver = Number(priced?.driver?.total ?? 0);
      if (!(seatTotal > 0)) {
        throw new BadRequestException('We could not price that change. Nothing was altered: try again in a moment.');
      }
      delivery.price          = +seatTotal.toFixed(2);
      delivery.driverEarnings = +seatDriver.toFixed(2);
      if (priced?.rateCardSnapshotId) delivery.rateCardSnapshotId = priced.rateCardSnapshotId;
    } else {
      /* ---- Package or Book-a-Ride: re-measure, then re-price ---- */
      if (body.pickupAddress  !== undefined) delivery.pickupAddress  = String(body.pickupAddress).trim();
      if (body.dropoffAddress !== undefined) delivery.dropoffAddress = String(body.dropoffAddress).trim();
      const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
      if (num(body.pickupLat)  !== undefined) delivery.pickupLat  = num(body.pickupLat)!;
      if (num(body.pickupLng)  !== undefined) delivery.pickupLng  = num(body.pickupLng)!;
      if (num(body.dropoffLat) !== undefined) delivery.dropoffLat = num(body.dropoffLat)!;
      if (num(body.dropoffLng) !== undefined) delivery.dropoffLng = num(body.dropoffLng)!;
      if (body.vehicleType !== undefined)     delivery.vehicleType = String(body.vehicleType);
      if (body.scheduledFor !== undefined) {
        delivery.scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;
      }

      if (!isRide) {
        if (body.weightKg !== undefined) {
          const kg = Number(body.weightKg);
          if (!(kg > 0)) throw new BadRequestException('Enter the weight in kilograms.');
          delivery.weightKg = kg;
        }
        if (body.categoryCode       !== undefined) delivery.categoryCode       = String(body.categoryCode);
        if (body.declaredValueNgn   !== undefined) delivery.declaredValueNgn   = Number(body.declaredValueNgn) || null;
        if (body.packageDescription !== undefined) delivery.packageDescription = String(body.packageDescription).trim();
        if (body.receiverFirstName  !== undefined) delivery.receiverFirstName  = String(body.receiverFirstName).trim() || null;
        if (body.receiverLastName   !== undefined) delivery.receiverLastName   = String(body.receiverLastName).trim() || null;
        if (body.receiverPhone      !== undefined) delivery.receiverPhone      = String(body.receiverPhone).trim() || null;
      }

      // Re-measure. An edited address that kept the old distance is the
      // same class of bug as pricing a run on its straight leg.
      const road = await this.routeDistance.getRoadDistance(
        delivery.pickupLat, delivery.pickupLng,
        delivery.dropoffLat, delivery.dropoffLng,
      );
      delivery.distanceKm           = road.km;
      delivery.quotedDistanceSource = road.source;
      delivery.quotedDurationMin    = road.durationMin ?? null;

      const card: any = await this.rateCardPricing.getActiveRateCard();
      const maxKm = Number(card?.vehicleRates?.[delivery.vehicleType]?.maxRouteKm ?? 0);
      if (maxKm > 0 && road.km > maxKm) {
        throw new BadRequestException(
          `That vehicle does not run further than ${maxKm} km. This route is ${Math.round(road.km)} km, so pick a bigger vehicle.`,
        );
      }

      const breakdown: any = isRide
        ? await this.rateCardPricing.computeRidePrice({
            vehicleType: delivery.vehicleType,
            km: road.km,
            scheduledAt: delivery.scheduledFor ?? undefined,
            pickupCoords:  { latitude: delivery.pickupLat,  longitude: delivery.pickupLng },
            dropoffCoords: { latitude: delivery.dropoffLat, longitude: delivery.dropoffLng },
          } as any)
        : await this.rateCardPricing.computePrice({
            vehicleType: delivery.vehicleType,
            categoryCode: toCategoryCode(delivery.categoryCode),
            km: road.km,
            stopCount: 1,
            weightKg: Number(delivery.weightKg ?? 0),
            declaredValueNgn: Number(delivery.declaredValueNgn ?? 0) || undefined,
            estimatedDwellMinutes: 0,
            scheduledAt: delivery.scheduledFor ?? undefined,
            // latitude/longitude, not lat/lng: the same mismatch that
            // once priced every Lagos booking at national rates.
            pickupCoords:  { latitude: delivery.pickupLat,  longitude: delivery.pickupLng },
            dropoffCoords: { latitude: delivery.dropoffLat, longitude: delivery.dropoffLng },
          } as any);

      delivery.price          = +Number(breakdown.customer.total).toFixed(2);
      delivery.driverEarnings = +Number(breakdown.driver.total).toFixed(2);
      delivery.nightFeeNgn    = Number(breakdown.customer?.nightSurcharge ?? 0) > 0
        ? +Number(breakdown.customer.nightSurcharge).toFixed(2)
        : null;
      delivery.rateCardSnapshotId = card.id;
    }

    if (body.notes !== undefined) (delivery as any).notes = String(body.notes).trim() || null;

    const saved = await this.repo.save(delivery);
    const after = Number(saved.price ?? 0);
    this.logger.log(
      `EDIT_UNPAID deliveryId=${deliveryId} user=${userId} kind=${delivery.kind} ` +
      `seat=${isSeat} priceBefore=${before.toFixed(2)} priceAfter=${after.toFixed(2)}`,
    );

    return {
      ok: true as const,
      delivery: saved,
      priceBeforeNgn: +before.toFixed(2),
      priceAfterNgn:  +after.toFixed(2),
      priceChanged:   Math.abs(after - before) >= 0.01,
    };
  }

  async cancelByCustomer(deliveryId: string, userId: string, reason?: string) {
    const quote = await this.getCancellationQuote(deliveryId, userId);
    if (!quote.cancellable) {
      throw new BadRequestException(quote.reason);
    }

    const rules = await this.getCancellationRules();
    const driverShare = quote.stage === 'post_assign' ? rules.driverShareNgn : 0;

    await this.repo.update(deliveryId, {
      cancellationFeeNgn:    quote.feeNgn,
      cancelledAt:           new Date(),
      cancellationReason:    (reason ?? '').slice(0, 200) || null,
    } as any);

    this.logger.warn(
      `CUSTOMER_CANCEL deliveryId=${deliveryId} user=${userId} stage=${quote.stage} ` +
      `feeNgn=${quote.feeNgn} driverShareNgn=${driverShare} reason="${(reason ?? '').slice(0, 200)}"`,
    );

    await this.updateStatus(deliveryId, DeliveryStatus.CANCELLED);
    await this.releaseTripSeatsFor(await this.repo.findOne({ where: { id: deliveryId } }));

    return {
      ok:             true as const,
      status:         'cancelled',
      feeNgn:         quote.feeNgn,
      driverShareNgn: driverShare,
    };
  }

  async findById(id: string) {
    const delivery = await this.repo.findOne({ where: { id } });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    return delivery;
  }

  /**
   * Fetch one delivery for whoever is entitled to see it: the customer
   * who booked it, or the driver carrying it.
   *
   * This was customer-only, which meant a driver opening their OWN
   * assigned job got 404 "Delivery not found." Every Available Jobs tap
   * and the ACTIVE JOB card dead-ended on it, and the trip screen
   * inherited the same failure. Confirmed against production on
   * 2026-08-24: the driver holding SRS-327EL8RP could not open it.
   *
   * The driver branch goes through redactCustomerForDriver, so a RIDE
   * still yields a first name only and never a surname or phone. Admin
   * payloads are a different path and keep full identity.
   */
  async findByIdForUser(id: string, userId: string) {
    let delivery = await this.repo.findOne({
      where: [
        { id, customer: { id: userId } },
        { id, driver:   { user: { id: userId } } },
      ],
      relations: ['driver', 'driver.user', 'customer'],
    });

    /**
     * A driver deciding whether to ACCEPT a job is not yet on it, so
     * neither branch above matches and they 404 on the very screen
     * that exists to help them decide. Adding the assigned-driver
     * branch fixed opening your own job and left this one broken
     * (found on device 2026-08-24, one fix after the other).
     *
     * An unclaimed job is only viewable on the same terms it is
     * offered: pending, funded, driverless, and only by a real
     * driver. That is exactly the available-jobs feed's own gate, so
     * this exposes nothing the driver could not already list.
     */
    if (!delivery && this.driversService) {
      const asDriver = await this.driversService.findByUserId(userId).catch(() => null);
      if (asDriver) {
        delivery = await this.repo.findOne({
          where: { id, status: DeliveryStatus.PENDING, driver: IsNull() },
          relations: ['driver', 'driver.user', 'customer'],
        });
        if (delivery && !delivery.paymentHeldAt) delivery = null;  // unfunded jobs are not offered
      }
    }

    if (!delivery) throw new NotFoundException('Delivery not found.');

    // Only redact when the viewer is NOT the customer: the sender must
    // keep seeing their own receiver details in full.
    const isCustomer = (delivery as any).customer?.id === userId;
    /**
     * The sender gets a whitelisted rider, not the raw entity. Verified
     * against production 2026-08-24 with an ordinary customer token: the
     * eager driver and user relations were shipping bank account, home
     * address, date of birth, emergency contacts, FCM token and every KYC
     * document URL to the customer's phone.
     */
    /**
     * State names alongside the codes (2026-08-31).
     *
     * The row stores two-letter codes because that is what the pricing
     * engine speaks. "LA to KN" is a puzzle on a screen, so the readable
     * names are attached here rather than shipping a copy of the state
     * table to three apps. Left absent when the codes are null, so a
     * client can tell "not interstate" from "nobody measured it".
     */
    (delivery as any).pickupStateName  = getState((delivery as any).pickupStateCode)?.name  ?? null;
    (delivery as any).dropoffStateName = getState((delivery as any).dropoffStateCode)?.name ?? null;

    /**
     * The money object is split by audience (2026-08-31). Raw, it
     * carries seirsNet, trueCosts and the full driver cost basis, and
     * both delivery routes spread the row untouched. A sender gets their
     * own itemised bill; a rider gets their own itemised pay; neither
     * gets our margin. See redact-breakdown.ts.
     */
    (delivery as any).priceBreakdown = isCustomer
      ? breakdownForCustomer((delivery as any).priceBreakdown)
      : breakdownForDriver((delivery as any).priceBreakdown);

    return isCustomer
      ? redactDriverForCustomer(delivery as any)
      : this.redactCustomerForDriver(delivery as any);
  }

  // Driver-initiated claim of an unassigned pending job. Used by the
  // driver app's job-detail screen "Accept" button. Mirrors what the
  // matching service does on auto-match: flip status to ASSIGNED, set
  // assignedAt, broadcast to tracking + notify customer.
  async claimByDriver(deliveryId: string, userId: string) {
    if (!this.driversService) {
      const { ServiceUnavailableException } = await import('@nestjs/common');
      throw new ServiceUnavailableException('Driver service not wired.');
    }
    const driver = await this.driversService.findByUserId(userId);
    if (!driver) {
      const { ForbiddenException } = await import('@nestjs/common');
      throw new ForbiddenException('Only drivers can claim jobs.');
    }

    const delivery = await this.repo.findOne({
      where:    { id: deliveryId },
      relations: ['customer', 'driver'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');

    // Trip bookings are offers to ONE driver: nobody else may claim
    // them, even if they appear through some other path.
    if ((delivery as any).tripId) {
      const owns = await this.repo.manager.query(
        `SELECT t."id" FROM "driver_trips" t
          JOIN "drivers" dr ON dr."id" = t."driverId"
          JOIN "users" u ON u."id" = dr."userId"
         WHERE t."id" = $1 AND u."id" = $2`,
        [(delivery as any).tripId, userId],
      );
      if (!owns?.length) {
        const { ForbiddenException } = await import('@nestjs/common');
        throw new ForbiddenException('This seat booking is reserved for its trip driver.');
      }
    }

    const { BadRequestException, ConflictException } = await import('@nestjs/common');
    if (delivery.status !== DeliveryStatus.PENDING) {
      throw new BadRequestException(`This job is no longer available (status: ${delivery.status}).`);
    }
    if (delivery.driver) {
      throw new ConflictException('This job was already claimed by another driver.');
    }

    /**
     * A ride goes ONLY to the vehicle class the passenger booked
     * (founder 2026-08-22, restated here 2026-08-31).
     *
     * MatchingService.filterForRide has enforced this since Book-a-Ride:
     * "someone who booked a car must not get an okada, and a person never
     * rides a bicycle or a truck". Auto-dispatch obeyed it and the open
     * jobs list did not, so the rule only held on one of the two ways a
     * driver gets work. A passenger who chose and paid for a car could
     * have that ride claimed off the browse list by an okada, and the
     * first they would know is the machine that arrives.
     *
     * Packages are deliberately NOT gated the same way: vehicle fit is a
     * score in matching, not a hard filter, and a rider who judges they
     * can carry a load may take it. Only the ride rule is absolute,
     * because the passenger chose the class themselves.
     */
    if (String((delivery as any).kind ?? 'package') === 'ride'
        && driver.vehicleType !== delivery.vehicleType) {
      throw new BadRequestException(
        `This passenger booked ${aVehicle(delivery.vehicleType)}. ` +
        `Your vehicle is ${aVehicle(driver.vehicleType)}, so you cannot take this ride.`,
      );
    }

    await this.repo.update(deliveryId, {
      driver,
      status:     DeliveryStatus.ASSIGNED,
      assignedAt: new Date(),
    });

    if (this.trackingGateway) {
      try { this.trackingGateway.broadcastDriverAssigned(deliveryId, driver); } catch {}
      try { this.trackingGateway.broadcastStatusChange(deliveryId, DeliveryStatus.ASSIGNED); } catch {}
    }
    if (this.notificationsService) {
      this.notificationsService.notifyDeliveryAssigned(
        delivery.customer.id,
        delivery.trackingCode,
        driver.user?.name ?? 'Your driver',
        delivery.id,
      ).catch(() => {});
    }

    // The claimer is a driver by definition here, so the response goes
    // through the same redaction as the job feeds. It did not, and
    // returned the entire customer User row including bank details and
    // home coordinates (found 2026-08-24).
    const claimed = await this.repo.findOne({
      where:     { id: deliveryId },
      relations: ['customer', 'driver', 'driver.user'],
    });
    return claimed ? this.redactCustomerForDriver(claimed as any) : claimed;
  }

  async emailReceipt(id: string, userId: string) {
    const delivery = await this.repo.findOne({
      where:    { id, customer: { id: userId } },
      relations: ['customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.status !== DeliveryStatus.DELIVERED) {
      const { BadRequestException } = await import('@nestjs/common');
      throw new BadRequestException('Receipt is only available for completed deliveries.');
    }
    await this.mailService.sendDeliveryReceipt(
      delivery.customer.email,
      delivery.customer.name,
      delivery.trackingCode,
      Number(delivery.price ?? 0),
      'wallet',
      delivery.deliveredAt ?? delivery.updatedAt,
    );
    return { sent: true };
  }

  async rateDelivery(id: string, customerId: string, rating: number, comment?: string) {
    const delivery = await this.repo.findOne({
      where: { id, customer: { id: customerId } },
      relations: ['driver', 'driver.user'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');

    const { BadRequestException } = await import('@nestjs/common');
    if (delivery.status !== DeliveryStatus.DELIVERED)
      throw new BadRequestException('Can only rate a completed delivery.');
    if (delivery.customerRating)
      throw new BadRequestException('You have already rated this delivery.');

    await this.repo.update(id, { customerRating: rating, customerComment: comment });

    // Recalculate driver's average rating with a single AVG() query (no N+1)
    if (delivery.driver?.id) {
      const result = await this.repo
        .createQueryBuilder('d')
        .select('AVG(d.customerRating)', 'avg')
        .where('d.driver_id = :driverId', { driverId: delivery.driver.id })
        .andWhere('d.customerRating IS NOT NULL')
        .getRawOne();

      const avg = parseFloat(result?.avg ?? '0');

      await this.repo.manager
        .getRepository('Driver')
        .update(delivery.driver.id, {
          rating:          Math.round(avg * 100) / 100,
          totalDeliveries: () => '"totalDeliveries" + 1',
        });
    }

    return { success: true };
  }
}
