import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { TicketTopic } from '../support/support-ticket.entity';
import { SupportService } from '../support/support.service';
import { RoutingService } from '../routing/routing.service';
import { WhatsAppService } from '../notifications/whatsapp.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository, MoreThan } from 'typeorm';
import { secureCode } from '../common/utils/auth-codes';
import { Delivery, DeliveryStatus, PackageSize, UrgencyLevel } from './delivery.entity';
import { DeliveryStop, DeliveryStopStatus } from './delivery-stop.entity';
import { DeliveryEvent, DeliveryEventType, EventActorRole } from './delivery-event.entity';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { PricingService } from './pricing.service';
import { RouteDistanceService } from './route-distance.service';
import { PricingService as RateCardPricing } from '../pricing/pricing.service';
import { detectStateFromCoords } from '../pricing/regions';
import { User } from '../users/user.entity';
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
          estimatedDwellMinutes: 0,
          scheduledAt: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
          pickupCoords:  { lat: dto.pickupLat,  lng: dto.pickupLng },
          dropoffCoords: { lat: dto.dropoffLat, lng: dto.dropoffLng },
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
    // Same resolver as getQuote, and the 15-minute cache means the booking
    // reuses the exact distance the customer was shown on the quote screen:
    // the two cannot disagree inside one booking session.
    const road = await this.routeDistance.getRoadDistance(
      dto.pickupLat, dto.pickupLng,
      dto.dropoffLat, dto.dropoffLng,
    );
    const distanceKm = road.km;

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
    const breakdown = await this.rateCardPricing.computePrice({
      vehicleType,
      categoryCode: toCategoryCode(dto.packageCategory),
      km: distanceKm,
      stopCount: 1,
      weightKg: weight,
      estimatedDwellMinutes: 0,
      scheduledAt: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
      pickupCoords:  { lat: dto.pickupLat,  lng: dto.pickupLng },
      dropoffCoords: { lat: dto.dropoffLat, lng: dto.dropoffLng },
    } as any);
    const pricing = {
      price:          Number(breakdown.customer.total),
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
    if (Number(dto.declaredValueNgn ?? 0) > 0 && this.feesServiceRef) {
      const hvThreshold = await this.feesServiceRef.getValueOr('high_value_threshold_ngn', 100000);
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
    let nightFee = 0;
    const RATE_CARD_OWNS_NIGHT = true;
    if (this.feesServiceRef) {
      try {
        const pct   = await this.feesServiceRef.getValueOr('night_fee_pct', 15);
        const start = await this.feesServiceRef.getValueOr('night_window_start_hour', 21);
        const end   = await this.feesServiceRef.getValueOr('night_window_end_hour', 5);
        const effective = scheduledFor ?? new Date();
        // Africa/Lagos = UTC+1, no DST.
        const hour = (effective.getUTCHours() + 1) % 24;
        const inWindow = start > end ? (hour >= start || hour < end) : (hour >= start && hour < end);
        if (!RATE_CARD_OWNS_NIGHT && pct > 0 && inWindow) nightFee = +(pricing.price * (pct / 100)).toFixed(2);
      } catch { /* night fee is best-effort; base pricing always stands */ }
    }

    const delivery = this.repo.create({
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
      scheduledFor,
      trackingCode,
      customer,
      distanceKm,
      quotedDistanceSource: road.source,
      quotedDurationMin:    road.durationMin,
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
        address:               st.address,
        lat:                   st.lat,
        lng:                   st.lng,
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
      (saved as any).isMultiStop = true;
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
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  findByDriver(driverId: string) {
    return this.repo.find({
      where: { driver: { id: driverId } },
      order: { createdAt: 'DESC' },
    });
  }

  findActiveByDriverUserId(userId: string) {
    return this.repo
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
  async findAvailable(lat?: number, lng?: number, radiusKm: number = 25, limit: number = 30) {
    const q = this.repo
      .createQueryBuilder('d')
      .where('d.status = :status', { status: DeliveryStatus.PENDING })
      .andWhere('d.driver IS NULL')
      // Only funded bookings reach drivers (paid-dispatch gate 2026-08-16).
      .andWhere('d."paymentHeldAt" IS NOT NULL')
      // Scheduled pickups surface 15 minutes before their slot, not
      // hours early (night-ops build 2026-08-11).
      .andWhere(`(d.scheduledFor IS NULL OR d.scheduledFor <= NOW() + interval '15 minutes')`);

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
        packageSize:    d.packageSize ?? null,
        vehicleType:    d.vehicleType ?? null,
        urgency:        (d as any).urgency ?? null,
        status:         d.status,
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

    // Where the package physically is right now.
    const fromLat = atCounter
      ? Number(delivery.dropoffLat)
      : (delivery.driver?.lastLat != null ? Number(delivery.driver.lastLat) : Number(delivery.dropoffLat));
    const fromLng = atCounter
      ? Number(delivery.dropoffLng)
      : (delivery.driver?.lastLng != null ? Number(delivery.driver.lastLng) : Number(delivery.dropoffLng));

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

    const transport = Math.round(Number((breakdown as any)?.total ?? 0));

    // Anything the counter is still holding against the package. Unpaid
    // redirect fee first: the package cannot leave without it either way.
    const counterOwed = atCounter && !delivery.redirectFeePaidAt
      ? Math.round(Number(delivery.redirectFeeNgn ?? 0))
      : 0;

    const total = transport + counterOwed;

    return {
      atCounter,
      // Named, not editable. The app shows it so the sender can see where
      // it is going, and there is no field to change it.
      returnTo:      delivery.pickupAddress,
      km:            Number(road.km.toFixed(2)),
      transportNgn:  transport,
      counterOwedNgn: counterOwed,
      totalNgn:      total,
      needsSupport:  !atCounter,
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
  async requestReturn(deliveryId: string, customerId: string) {
    const { BadRequestException } = await import('@nestjs/common');
    const quote = await this.getReturnQuote(deliveryId, customerId);
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
      pickupLat:  fromLat,
      pickupLng:  fromLng,
      dropoffLat: lat,
      dropoffLng: lng,
    } as any);

    const quoteNgn = Math.round(Number((breakdown as any)?.total ?? 0));
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

  // Catalogue-driven threshold for the high-value handoff gate.
  // Falls back to the founder's target default when the fees row is
  // missing so the gate never silently disables.
  private async getHighValueThreshold(): Promise<number> {
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
    if (status === DeliveryStatus.DELIVERED && !proofPhotoUrl && !delivery.proofPhotoUrl) {
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

  // Customer-scoped fetch with driver + stops eagerly loaded so the
  // receipt screen has everything it needs in one round-trip.
  async findByIdForUser(id: string, userId: string) {
    const delivery = await this.repo.findOne({
      where:    { id, customer: { id: userId } },
      relations: ['driver', 'driver.user', 'customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    return delivery;
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

    const { BadRequestException, ConflictException } = await import('@nestjs/common');
    if (delivery.status !== DeliveryStatus.PENDING) {
      throw new BadRequestException(`This job is no longer available (status: ${delivery.status}).`);
    }
    if (delivery.driver) {
      throw new ConflictException('This job was already claimed by another driver.');
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

    return this.repo.findOne({
      where:     { id: deliveryId },
      relations: ['customer', 'driver', 'driver.user'],
    });
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
