import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { secureCode } from '../common/utils/auth-codes';
import { Delivery, DeliveryStatus } from './delivery.entity';
import { DeliveryEvent, DeliveryEventType, EventActorRole } from './delivery-event.entity';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { PricingService } from './pricing.service';
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

  constructor(
    @InjectRepository(Delivery) private repo: Repository<Delivery>,
    private pricingService: PricingService,
  ) {}

  getQuote(dto: CreateDeliveryDto) {
    const distanceKm = PricingService.haversineKm(
      dto.pickupLat, dto.pickupLng,
      dto.dropoffLat, dto.dropoffLng,
    );
    return {
      distanceKm: Math.round(distanceKm * 10) / 10,
      quotes: this.pricingService.getQuotes(distanceKm, dto.packageSize, dto.isFragile),
    };
  }

  async create(dto: CreateDeliveryDto, customer: User): Promise<Delivery> {
    const distanceKm = PricingService.haversineKm(
      dto.pickupLat, dto.pickupLng,
      dto.dropoffLat, dto.dropoffLng,
    );

    const pricing = this.pricingService.calculate({
      distanceKm,
      packageSize: dto.packageSize,
      urgency:     dto.urgency,
      isFragile:   dto.isFragile,
    });

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

    const delivery = this.repo.create({
      ...dto,
      trackingCode,
      customer,
      distanceKm,
      price:          pricing.price,
      driverEarnings: pricing.driverEarnings,
      status:         DeliveryStatus.PENDING,
    });

    const saved = await this.repo.save(delivery);

    // Trigger auto-matching asynchronously (don't block the response)
    this.runAutoMatch(saved).catch((err) =>
      this.logger.error(`Auto-match failed for ${saved.id}: ${err.message}`)
    );

    return saved;
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

  async findByCustomer(customerId: string, page = 1, limit = 20) {
    const [items, total] = await this.repo.findAndCount({
      where: { customer: { id: customerId } },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });
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
      .andWhere('d.driver IS NULL');

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
    const delivery = await this.repo.findOne({
      where: { trackingCode },
      relations: ['driver', 'driver.user'],
    });
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

    return {
      id:             delivery.id,
      trackingCode:   delivery.trackingCode,
      status:         delivery.status,
      pickupAddress:  delivery.pickupAddress,
      dropoffAddress: delivery.dropoffAddress,
      // Coords power the customer's redirect-to-store picker (stores
      // sorted nearest to the ACTUAL dropoff, not the customer's phone).
      dropoffLat:     delivery.dropoffLat != null ? Number(delivery.dropoffLat) : null,
      dropoffLng:     delivery.dropoffLng != null ? Number(delivery.dropoffLng) : null,
      packageSize:    delivery.packageSize,
      vehicleType:    delivery.vehicleType,
      assignedAt:     delivery.assignedAt,
      pickedUpAt:     delivery.pickedUpAt,
      deliveredAt:    delivery.deliveredAt,
      createdAt:      delivery.createdAt,
      proofPhotoUrl:  delivery.proofPhotoUrl,
      driver:         publicDriver,
      etaMinutes:     etaMinutes,
      etaAsOf:        etaMinutes != null ? new Date().toISOString() : null,
      events:         events.map(e => ({
        id:          e.id,
        type:        e.type,
        actorRole:   e.actorRole,
        description: e.description,
        lat:         e.lat != null ? Number(e.lat) : null,
        lng:         e.lng != null ? Number(e.lng) : null,
        meta:        e.meta,
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

    const prevAddress = delivery.dropoffAddress;
    await this.repo.update(deliveryId, {
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

  async updateStatus(id: string, status: DeliveryStatus, proofPhotoUrl?: string) {
    const delivery = await this.repo.findOne({ where: { id } });
    if (!delivery) throw new NotFoundException('Delivery not found.');

    const fromStatus = delivery.status;

    const timestamps: Partial<Delivery> = { status };
    if (status === DeliveryStatus.ASSIGNED)   timestamps.assignedAt  = new Date();
    if (status === DeliveryStatus.PICKED_UP)  timestamps.pickedUpAt  = new Date();
    if (status === DeliveryStatus.DELIVERED) {
      timestamps.deliveredAt = new Date();
      if (proofPhotoUrl) timestamps.proofPhotoUrl = proofPhotoUrl;
    }

    await this.repo.update(id, timestamps);

    // Append the status transition to the delivery event log. This is
    // what powers the DHL-style timeline on the public tracking page +
    // the admin per-delivery drill-in. Fire-and-forget: even if the
    // event log write fails, the status transition already committed.
    this.logEvent(id, DeliveryEventType.STATUS_CHANGE, EventActorRole.SYSTEM, {
      meta: { fromStatus, toStatus: status },
    }).catch(() => {});

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
        this.devPlatformService.enqueue(eventName, {
          orderId:      id,
          trackingCode: delivery.trackingCode,
          status,
          occurredAt:   new Date().toISOString(),
        }).catch(() => {});
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

    // Refund escrow if delivery failed or cancelled
    if (
      (status === DeliveryStatus.FAILED || status === DeliveryStatus.CANCELLED) &&
      this.paymentsService
    ) {
      const updated = await this.repo.findOne({ where: { id }, relations: ['customer'] });
      if (updated?.customer?.id) {
        this.paymentsService
          .refundEscrow(id, updated.customer.id)
          .catch((err) => this.logger.error(`Escrow refund failed: ${err.message}`));
      }
    }

    return this.repo.findOne({ where: { id } });
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
