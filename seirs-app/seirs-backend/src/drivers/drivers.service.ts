import { Injectable, BadRequestException, ConflictException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { In, LessThan, Repository } from 'typeorm';
import { Driver, DriverStatus, VehicleType } from './driver.entity';
import { TripStop } from './trip-stop.entity';
import { DriverTrip, DriverTripStatus } from './driver-trip.entity';
import { DriverStatusBroadcast, DriverStatusBroadcastType } from './driver-status-broadcast.entity';
import { DriverSubscription, DriverSubscriptionStatus } from './driver-subscription.entity';
import { DriverLevelChange, LevelChangeStatus } from './driver-level-change.entity';
import { DriverVehicleChange, VehicleChangeStatus } from './driver-vehicle-change.entity';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { Wallet } from '../payments/wallet.entity';
import { FraudService } from '../fraud/fraud.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { FeesService } from '../fees/fees.service';
import { SupportTicket, TicketStatus, TicketTopic } from '../support/support-ticket.entity';
import { DriverEarning } from '../earnings/driver-earning.entity';
import { vehicleIdentityForPassenger } from '../common/redact-driver';
import { DriverDocument, DriverDocStatus } from './driver-document.entity';

// Spec V8 §2.1 - recognised KYC document IDs
const KYC_DOC_FIELD_MAP: Record<string, keyof Driver> = {
  national_id_front: 'nationalIdFrontUrl',
  national_id_back:  'nationalIdBackUrl',
  drivers_license:   'driversLicenseUrl',
  vehicle_photo:     'vehiclePhotoUrl',
  ownership_proof:   'ownershipProofUrl',
  insurance_cert:    'insuranceCertUrl',
  selfie:            'selfieUrl',
  guarantor:         'guarantorUrl',
};

/**
 * Great-circle distance in km.
 *
 * Multiplied by the road factor at the call site, which is the same
 * approximation the delivery pricing floor uses. Two engines measuring
 * the distance between the same two points must not disagree.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  // Lazy-set by SchedulerModule wiring so we can push silent notifications
  // from the auto-checkin cron without coupling DriversModule to
  // NotificationsModule (would risk a circular dep).
  notificationsService?: any;

  constructor(
    @InjectRepository(Driver)                 private repo:           Repository<Driver>,
    @InjectRepository(Delivery)               private deliveriesRepo: Repository<Delivery>,
    @InjectRepository(Wallet)                 private walletsRepo:    Repository<Wallet>,
    @InjectRepository(DriverTrip)             private tripsRepo:      Repository<DriverTrip>,
    @InjectRepository(TripStop)               private tripStopsRepo:  Repository<TripStop>,
    @InjectRepository(DriverStatusBroadcast)  private broadcastsRepo: Repository<DriverStatusBroadcast>,
    @InjectRepository(DriverSubscription)     private subsRepo:       Repository<DriverSubscription>,
    @InjectRepository(DriverLevelChange)      private levelChangesRepo: Repository<DriverLevelChange>,
    @InjectRepository(DriverVehicleChange)    private vehicleChangesRepo: Repository<DriverVehicleChange>,
    @InjectRepository(DriverEarning)          private earningsRepo:   Repository<DriverEarning>,
    @InjectRepository(DriverDocument)         private docsRepo:       Repository<DriverDocument>,
    private fraudService:    FraudService,
    private trackingGateway: TrackingGateway,
    private feesService:     FeesService,
  ) {}

  findByUserId(userId: string) {
    return this.repo.findOne({ where: { user: { id: userId } }, relations: ['user'] });
  }

  // ── Corridor: "I'm heading somewhere" (founder 2026-08-21) ───────────

  /**
   * Declare a corridor. Hours are clamped by the corridor_max_hours fee
   * row, now 72.
   *
   * The default was 2, on the reasoning that a corridor is one trip and
   * not a shift. True, but a Lagos to Ibadan trip IS three hours, so the
   * corridor died before the rider arrived, and a trip declared the night
   * before was expired by departure. Interstate trips are declared days
   * ahead, which is the whole point of declaring one.
   */
  async setCorridor(userId: string, params: { destLat: number; destLng: number; label?: string; hours?: number }) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found');
    const { destLat, destLng } = params;
    if (!Number.isFinite(destLat) || !Number.isFinite(destLng) || Math.abs(destLat) > 90 || Math.abs(destLng) > 180) {
      throw new BadRequestException('A real destination is required.');
    }
    const maxHours = await this.feesService.getValueOr('corridor_max_hours', 72);
    const hours = Math.min(Math.max(Number(params.hours ?? maxHours), 0.5), maxHours);
    await this.repo.update(driver.id, {
      corridorDestLat:   destLat,
      corridorDestLng:   destLng,
      corridorLabel:     (params.label ?? '').trim().slice(0, 120) || null,
      corridorExpiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
    });
    return this.repo.findOneBy({ id: driver.id });
  }

  async clearCorridor(userId: string) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found');
    await this.repo.update(driver.id, {
      corridorDestLat: null, corridorDestLng: null,
      corridorLabel: null, corridorExpiresAt: null,
    });
    return { ok: true };
  }

  // ── Driver value levels 1-10 (founder 2026-08-21) ────────────────────

  private static readonly LEVEL_CAP_DEFAULTS = [
    5_000, 10_000, 25_000, 50_000, 100_000,
    200_000, 500_000, 1_000_000, 5_000_000, 10_000_000,
  ];

  /** The ten caps, admin-editable fee rows with code fallbacks. Index 0 = level 1. */
  async getLevelCaps(): Promise<number[]> {
    return Promise.all(
      DriversService.LEVEL_CAP_DEFAULTS.map((dflt, i) =>
        this.feesService.getValueOr(`driver_level_${i + 1}_max_value_ngn`, dflt)),
    );
  }

  /** Max declared value this level may carry. Levels clamp to 1-10. */
  async levelCapNgn(level: number): Promise<number> {
    const caps = await this.getLevelCaps();
    const idx = Math.min(Math.max(Math.round(level || 1), 1), 10) - 1;
    return caps[idx];
  }

  /**
   * Any admin may request a move with a REQUIRED reason; it waits for a
   * super-admin who is NOT the requester. Two people or no move.
   */
  async requestLevelChange(driverId: string, toLevel: number, reason: string, adminId: string) {
    if (!Number.isInteger(toLevel) || toLevel < 1 || toLevel > 10) {
      throw new BadRequestException('toLevel must be an integer from 1 to 10.');
    }
    if (!reason?.trim() || reason.trim().length < 10) {
      throw new BadRequestException('A real reason is required (at least 10 characters).');
    }
    const driver = await this.repo.findOneBy({ id: driverId });
    if (!driver) throw new NotFoundException('Driver not found');
    if ((driver.valueLevel ?? 1) === toLevel) {
      throw new BadRequestException(`Driver is already level ${toLevel}.`);
    }
    const open = await this.levelChangesRepo.findOneBy({ driverId, status: LevelChangeStatus.PENDING });
    if (open) throw new BadRequestException('A level change is already pending for this driver.');
    return this.levelChangesRepo.save(this.levelChangesRepo.create({
      driverId,
      fromLevel: driver.valueLevel ?? 1,
      toLevel,
      reason: reason.trim(),
      requestedByAdminId: adminId,
    }));
  }

  async listLevelChanges(status?: string, driverId?: string) {
    const where: any = {};
    if (status) where.status = status;
    if (driverId) where.driverId = driverId;
    return this.levelChangesRepo.find({ where, order: { createdAt: 'DESC' }, take: 100 });
  }

  async decideLevelChange(changeId: string, approve: boolean, adminId: string, note?: string) {
    const change = await this.levelChangesRepo.findOneBy({ id: changeId });
    if (!change) throw new NotFoundException('Level change not found');
    if (change.status !== LevelChangeStatus.PENDING) {
      throw new BadRequestException('This change was already decided.');
    }
    // The two-person rule IS the feature: the requester never approves
    // their own move, super-admin or not.
    if (change.requestedByAdminId === adminId) {
      throw new ForbiddenException('You requested this change; a different manager must decide it.');
    }
    change.status = approve ? LevelChangeStatus.APPROVED : LevelChangeStatus.REJECTED;
    change.decidedByAdminId = adminId;
    change.decidedAt = new Date();
    change.decisionNote = note?.trim() || null;
    await this.levelChangesRepo.save(change);
    if (approve) {
      await this.repo.update(change.driverId, { valueLevel: change.toLevel });
      this.logger.log(`Driver ${change.driverId} level ${change.fromLevel} -> ${change.toLevel} (two-person: ${change.requestedByAdminId} + ${adminId})`);
    }
    return change;
  }

  /**
   * Nightly auto-raise: clean completed work climbs the ladder, one
   * level at a time; nothing here ever lowers a level (that is a human
   * decision under the two-person rule). ID verification gates the
   * upper levels per the identity policy.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async autoRaiseLevels() {
    try {
      const perLevel  = await this.feesService.getValueOr('driver_level_auto_deliveries_per_level', 25);
      const minRating = await this.feesService.getValueOr('driver_level_auto_min_rating', 4.5);
      const idGate    = await this.feesService.getValueOr('driver_level_id_gate', 6);
      const drivers = await this.repo.find({
        where: { status: DriverStatus.APPROVED },
        relations: ['user'],
      });
      let raised = 0;
      for (const d of drivers) {
        const current = d.valueLevel ?? 1;
        if (current >= 10) continue;
        if ((d.rating ?? 0) < minRating && (d.totalDeliveries ?? 0) > 0) continue;
        const delivered = await this.deliveriesRepo.count({
          where: { driver: { id: d.id }, status: DeliveryStatus.DELIVERED } as any,
        });
        let eligible = Math.min(1 + Math.floor(delivered / Math.max(perLevel, 1)), 10);
        if (!d.user?.identityVerifiedAt) eligible = Math.min(eligible, Math.max(Math.round(idGate) - 1, 1));
        if (eligible > current) {
          // One level per night: trust climbs, it does not teleport.
          await this.repo.update(d.id, { valueLevel: current + 1 });
          raised++;
        }
      }
      if (raised) this.logger.log(`Auto-raised ${raised} driver level(s)`);
    } catch (e: any) {
      this.logger.error(`autoRaiseLevels failed: ${e?.message ?? e}`);
    }
  }

  /**
   * Driver profile enriched with the three earnings fields the home
   * screen reads: today, this-week (Monday-rollover), and wallet
   * balance in Naira (kobo / 100). Returns the same shape as
   * findByUserId() plus those three numeric fields.
   */
  async findByUserIdWithEarnings(userId: string) {
    const driver = await this.findByUserId(userId);
    if (!driver) return null;

    // Date boundaries - start of today (local server tz) and start of week (Mon).
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(startOfToday);
    const dayIdx = startOfWeek.getDay(); // 0=Sun, 1=Mon ... 6=Sat
    const offsetToMon = dayIdx === 0 ? 6 : dayIdx - 1;
    startOfWeek.setDate(startOfWeek.getDate() - offsetToMon);

    // Sum driverEarnings of completed deliveries since each cutoff in parallel.
    // Active-jobs count: needed by the home dashboard AND the Last Order
    // gate (a driver in wind-down should see what they still owe).
    const [todayRow, weekRow, wallet, activeJobsCount] = await Promise.all([
      this.deliveriesRepo
        .createQueryBuilder('d')
        .select('COALESCE(SUM(d.driverEarnings), 0)', 'sum')
        .where('d.driverId = :driverId', { driverId: driver.id })
        .andWhere('d.status = :status', { status: DeliveryStatus.DELIVERED })
        .andWhere('d.deliveredAt >= :cutoff', { cutoff: startOfToday })
        .getRawOne<{ sum: string }>(),
      this.deliveriesRepo
        .createQueryBuilder('d')
        .select('COALESCE(SUM(d.driverEarnings), 0)', 'sum')
        .where('d.driverId = :driverId', { driverId: driver.id })
        .andWhere('d.status = :status', { status: DeliveryStatus.DELIVERED })
        .andWhere('d.deliveredAt >= :cutoff', { cutoff: startOfWeek })
        .getRawOne<{ sum: string }>(),
      this.walletsRepo.findOne({ where: { user: { id: userId } } }),
      this.deliveriesRepo.count({
        where: {
          driver: { id: driver.id },
          status: In([DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT]),
        },
      }),
    ]);

    return {
      ...driver,
      todayEarnings: Number(todayRow?.sum ?? 0),
      weekEarnings:  Number(weekRow?.sum  ?? 0),
      // balanceKobo is bigint in DB → string at runtime; coerce to number then naira.
      balance:       wallet ? Number(wallet.balanceKobo) / 100 : 0,
      // Spec V8 §2.11 Last Order surface - UI uses these directly.
      lastOrderMode:        driver.lastOrderMode,
      activeJobsCount,
      // Acceptance-rate calc is a follow-up: needs an offers table to
      // count offered vs accepted. Return null so the UI threshold check
      // is permissive (acceptanceRate == null ⇒ allow toggle).
      todayAcceptanceRate:  null as number | null,
    };
  }

  // ── Spec V8 §2.11 - Last Order (wind-down) mode ───────────────────────────
  // One-way switch: once on, the matching service skips this driver for
  // new assignments. They must complete active jobs and fully sign off
  // before the flag can be cleared. Enforced 80% acceptance gate is
  // currently informational only - flip to hard-block once the offers
  // table lands and todayAcceptanceRate is populated.
  async setLastOrderMode(userId: string, enabled: boolean) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');

    if (!enabled && driver.lastOrderMode) {
      // Per spec, can't re-enable without a full sign-off (offline + back online).
      throw new BadRequestException(
        'LAST_ORDER_LOCKED: sign off completely before re-enabling job acceptance.',
      );
    }

    const now = new Date();
    const updates: Partial<Driver> = {
      lastOrderMode:      enabled,
      lastOrderEnabledAt: enabled ? now : (null as any),
    };

    // Spec V8 §2.11 - Next-day priority penalty.
    // If the driver flips to wind-down within 30 minutes of going
    // online, deprioritise them in matching until end-of-tomorrow.
    // 30-minute threshold mirrors the spec language "within 30min of
    // going online". Cleared automatically when timestamp passes.
    if (enabled && driver.lastOnlineAt) {
      const minsOnline = (now.getTime() - new Date(driver.lastOnlineAt).getTime()) / 60_000;
      if (minsOnline >= 0 && minsOnline < 30) {
        const endOfTomorrow = new Date(now);
        endOfTomorrow.setDate(endOfTomorrow.getDate() + 2);
        endOfTomorrow.setHours(0, 0, 0, 0);
        updates.priorityPenaltyUntil = endOfTomorrow;
        this.logger.warn(
          `Early-wind-down penalty: driver=${driver.id} mins-online=${Math.round(minsOnline)} until=${endOfTomorrow.toISOString()}`,
        );
      }
    }

    await this.repo.update(driver.id, updates);
    return { lastOrderMode: enabled, priorityPenaltyUntil: updates.priorityPenaltyUntil ?? null };
  }

  // ── Spec V8 §2.18 - Interstate trip declarations ──────────────────────────
  async declareInterstateTrip(userId: string, body: {
    fromCity: string; toCity: string; departAt: string; spareCapacityKg: number;
    acceptsPassengers?: boolean; seatsTotal?: number; acceptsPackages?: boolean;
    pickupMode?: 'fixed' | 'along_route'; pickupAddress?: string;
    pickupLat?: number; pickupLng?: number; routeKm?: number;
    destLat?: number; destLng?: number; destAddress?: string;
    /**
     * The route as a line, origin first and destination last, with every
     * intermediate stop already on it. Optional so an older app build
     * keeps declaring two-city trips, but this is the shape that makes
     * segment pricing and honest distances possible.
     */
    stops?: Array<{
      city?: string; address?: string;
      latitude?: number; longitude?: number;
      description?: string;
    }>;
  }) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');

    const from = body.fromCity?.trim();
    const to   = body.toCity?.trim();
    if (!from || !to) throw new BadRequestException('Both cities required.');
    if (from.toLowerCase() === to.toLowerCase()) {
      throw new BadRequestException('From and To cities must differ.');
    }

    const depart = new Date(body.departAt);
    if (Number.isNaN(depart.getTime())) {
      throw new BadRequestException('Invalid departure time.');
    }
    if (depart.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('Departure time must be in the future.');
    }

    const capacity = Number(body.spareCapacityKg ?? 0);
    if (!Number.isFinite(capacity) || capacity < 0) {
      throw new BadRequestException('Spare capacity must be a non-negative number.');
    }

    // Travel Buddy (founder 2026-08-23). Seats are HARD-capped by the
    // vehicle class: the marketplace refuses the overloaded declaration
    // a park tout would happily make.
    const { PricingService: RateEngine } = await import('../pricing/pricing.service');
    const seatCap = RateEngine.SEAT_CAPS[driver.vehicleType] ?? 0;
    const wantsSeats = !!body.acceptsPassengers;
    let seatsTotal = Math.max(0, Math.round(Number(body.seatsTotal ?? 0)));
    if (wantsSeats) {
      if (seatCap <= 0) {
        throw new BadRequestException(`${driver.vehicleType} cannot carry marketplace passengers.`);
      }
      if (seatsTotal < 1) seatsTotal = 1;
      if (seatsTotal > seatCap) {
        throw new BadRequestException(
          `A ${driver.vehicleType} sells at most ${seatCap} seat${seatCap === 1 ? '' : 's'}. No squeezing: that is the rule.`,
        );
      }
    } else {
      seatsTotal = 0;
    }

    const trip = this.tripsRepo.create({
      driver,
      fromCity:        from,
      toCity:          to,
      departAt:        depart,
      spareCapacityKg: capacity,
      status:          DriverTripStatus.ACTIVE,
      acceptsPassengers: wantsSeats,
      seatsTotal,
      seatsBooked:     0,
      acceptsPackages: body.acceptsPackages !== false,
      pickupMode:      body.pickupMode === 'fixed' ? 'fixed' : 'along_route',
      pickupAddress:   body.pickupAddress?.trim() || null,
      pickupLat:       Number.isFinite(Number(body.pickupLat)) ? Number(body.pickupLat) : null,
      pickupLng:       Number.isFinite(Number(body.pickupLng)) ? Number(body.pickupLng) : null,
      routeKm:         Number.isFinite(Number(body.routeKm)) && Number(body.routeKm) > 0 ? Number(body.routeKm) : null,
      destLat:         Number.isFinite(Number(body.destLat)) ? Number(body.destLat) : null,
      destLng:         Number.isFinite(Number(body.destLng)) ? Number(body.destLng) : null,
      destAddress:     body.destAddress?.trim() || null,
    } as any);
    const saved = (await this.tripsRepo.save(trip)) as unknown as DriverTrip;

    /**
     * Write the route as a line of real places.
     *
     * A trip used to be two city names and one free-text pickup note, so
     * every distance was measured city centre to city centre and a
     * passenger boarding 20km outside Ibadan paid from the middle of
     * Ibadan. Stops carry coordinates, so the distance is the distance.
     *
     * Every stop arrives before departure, deliberately. The founder was
     * explicit: people declare these trips days ahead, and a rider who
     * only sets the next pickup after each drop cannot plan the trip
     * they are selling.
     */
    const stops = Array.isArray(body.stops) ? body.stops : [];
    if (stops.length >= 2) {
      const clean = stops
        .map((st) => ({
          city:        (st.city ?? '').trim().slice(0, 120),
          address:     (st.address ?? '').trim().slice(0, 400),
          latitude:    Number(st.latitude),
          longitude:   Number(st.longitude),
          description: (st.description ?? '').trim().slice(0, 300) || null,
        }))
        .filter((st) =>
          st.city && st.address &&
          Number.isFinite(st.latitude) && Number.isFinite(st.longitude) &&
          Math.abs(st.latitude) <= 90 && Math.abs(st.longitude) <= 180);

      if (clean.length >= 2) {
        /**
         * Distance from the origin, measured once and stored.
         *
         * Segment pricing subtracts one stop's value from another's,
         * which is only sound if both came from the same measurement. A
         * seat quoted today must not reprice because a routing API
         * answered differently tomorrow.
         *
         * Straight-line times the road factor, the same approximation
         * the delivery pricing floor already uses, so the two engines
         * cannot disagree about how far apart two points are.
         */
        const roadFactorRaw = Number(await this.feesService.getValueOr('pricing_road_factor', 1.3));
        const roadFactor = Number.isFinite(roadFactorRaw) && roadFactorRaw >= 1 ? roadFactorRaw : 1.3;

        let cumulative = 0;
        const rows = clean.map((st, i) => {
          if (i > 0) {
            const prev = clean[i - 1];
            cumulative += haversineKm(prev.latitude, prev.longitude, st.latitude, st.longitude) * roadFactor;
          }
          return {
            tripId:       saved.id,
            sequence:     i,
            city:         st.city,
            address:      st.address,
            latitude:     st.latitude,
            longitude:    st.longitude,
            description:  st.description,
            kmFromOrigin: Math.round(cumulative * 100) / 100,
          };
        });
        await this.tripStopsRepo.save(rows as any[]);

        // The trip's own route length is now a measured figure rather
        // than whatever the app estimated between two city names.
        const measuredKm = Math.round(cumulative * 100) / 100;
        if (measuredKm > 0) {
          await this.tripsRepo.update(saved.id, { routeKm: measuredKm } as any);
          (saved as any).routeKm = measuredKm;
        }
      }
    }

    return saved;
  }

  /** Stops on a declared trip, in travel order. */
  async tripStops(tripId: string) {
    return this.tripStopsRepo.find({
      where: { tripId } as any,
      order: { sequence: 'ASC' },
    });
  }

  /**
   * Active declared intercity trips for a candidate set, departure
   * within +/-24h of now: the matching window where "I'm driving to
   * Ibadan anyway" is actually true.
   */
  async activeInterstateTripsFor(driverIds: string[]) {
    if (!driverIds.length) return [];
    const now = Date.now();
    return this.tripsRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.driver', 'd')
      .where('d.id IN (:...driverIds)', { driverIds })
      .andWhere('t.status = :status', { status: DriverTripStatus.ACTIVE })
      .andWhere('t.departAt BETWEEN :from AND :to', {
        from: new Date(now - 24 * 60 * 60 * 1000),
        to:   new Date(now + 24 * 60 * 60 * 1000),
      })
      .getMany();
  }

  /**
   * Travel Buddy browse: active future trips on a route, seats left,
   * driver FULLY identified (drivers never get anonymity: that is the
   * deal of the job).
   */
  /**
   * Find trips somebody can ride, INCLUDING part of the way.
   *
   * This matched only t.fromCity and t.toCity, so a trip was findable
   * only by its two endpoints. Reproduced on the device against a real
   * declared trip, Jos to Ibadan to Lagos:
   *
   *   Jos to Lagos     found it
   *   Ibadan to Lagos  "No trips on this route yet"
   *   Jos to Ibadan    "No trips on this route yet"
   *
   * Which defeats the entire premise printed at the top of the screen:
   * "Drivers already making an intercity trip sell their real spare
   * seats." Almost nobody travelling Jos to Lagos wants the whole 944
   * km; the passengers are the ones going part of the way, and they were
   * the only ones who could not find the trip.
   *
   * The data was always there. trip_stops holds an ordered route with a
   * city per stop, and its own entity comment says "The city is what the
   * browse list shows and what matching" depends on. The seat pricing is
   * per segment too: travel_buddy_min_segment_fare_ngn is a floor under
   * ONE segment. Segments were designed throughout and the search was
   * the one place that ignored them.
   *
   * A trip now matches when any stop matching `from` comes BEFORE any
   * stop matching `to` in its own sequence, which is what riding part of
   * the way means. Direction is preserved: searching Lagos to Jos does
   * not match a trip driving Jos to Lagos.
   *
   * The endpoint test stays as an OR, so a trip declared without stop
   * rows still appears.
   */
  /**
   * Weight each rider is already committed to carry, by driver id.
   *
   * Used by the corridor bonus so a trip advertising 1 kg free is not
   * boosted for a 1 kg parcel five times over. Live work only: anything
   * assigned and not yet delivered or cancelled.
   */
  async committedLoadKgFor(driverIds: string[], excludeDeliveryId?: string): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!driverIds.length) return out;
    const rows: Array<any> = await this.tripsRepo.manager.query(
      `SELECT d."driverId" AS "driverId", COALESCE(SUM(d."weightKg"), 0) AS "kg"
         FROM "deliveries" d
        WHERE d."driverId" = ANY($1)
          AND d."status" IN ('assigned','accepted','picked_up','in_transit')
          AND ($2::uuid IS NULL OR d."id" <> $2::uuid)
        GROUP BY d."driverId"`,
      [driverIds, excludeDeliveryId ?? null],
    ).catch(() => []);
    for (const r of rows) out.set(String(r.driverId), Number(r.kg) || 0);
    return out;
  }

  async browseTrips(fromCity: string, toCity: string) {
    const from = `%${(fromCity ?? '').trim()}%`;
    const to   = `%${(toCity ?? '').trim()}%`;
    const trips = await this.tripsRepo
      .createQueryBuilder('t')
      .leftJoin('t.driver', 'd')
      // Exactly the columns vehicleIdentityForPassenger reads, and no
      // more: make, model and colour live inside vehicleDetails, they
      // are not columns of their own.
      .addSelect([
        'd.id', 'd.rating', 'd.vehicleType', 'd.vehiclePlate',
        'd.vehiclePhotoUrl', 'd.vehicleDetails',
      ])
      .leftJoin('d.user', 'u')
      .addSelect(['u.id', 'u.name'])
      .where('t.status = :status', { status: DriverTripStatus.ACTIVE })
      .andWhere('t.departAt > NOW()')
      .andWhere(
        `(
           (t."fromCity" ILIKE :from AND t."toCity" ILIKE :to)
           OR EXISTS (
             SELECT 1
               FROM "trip_stops" s1
               JOIN "trip_stops" s2
                 ON s2."trip_id" = s1."trip_id"
                AND s2."sequence" > s1."sequence"
              WHERE s1."trip_id" = t."id"
                AND s1."city" ILIKE :from
                AND s2."city" ILIKE :to
           )
         )`,
        { from, to },
      )
      .orderBy('t.departAt', 'ASC')
      .take(30)
      .getMany();

    /**
     * Which part of the route the search actually matched.
     *
     * Without this the card is headed "Jos to Lagos" with a Jos pickup
     * address even when the passenger searched Ibadan to Lagos, so they
     * would book believing they board in Jos. The matched segment is
     * returned so the screen can say where this passenger gets on and
     * off, and how far that is.
     */
    const segByTrip = new Map<string, {
      boardStopId: string; alightStopId: string;
      boardCity: string; alightCity: string; segmentKm: number | null;
    }>();
    if (trips.length > 0) {
      const rows: Array<any> = await this.tripStopsRepo.manager.query(
        `SELECT DISTINCT ON (s1."trip_id")
                s1."trip_id"        AS "tripId",
                s1."id"             AS "boardStopId",
                s2."id"             AS "alightStopId",
                s1."city"           AS "boardCity",
                s2."city"           AS "alightCity",
                s1."km_from_origin" AS "boardKm",
                s2."km_from_origin" AS "alightKm"
           FROM "trip_stops" s1
           JOIN "trip_stops" s2
             ON s2."trip_id" = s1."trip_id"
            AND s2."sequence" > s1."sequence"
          WHERE s1."trip_id" = ANY($1)
            AND s1."city" ILIKE $2
            AND s2."city" ILIKE $3
          ORDER BY s1."trip_id", s1."sequence" ASC, s2."sequence" DESC`,
        [trips.map(t => t.id), from, to],
      ).catch(() => []);
      for (const r of rows) {
        const a = Number(r.boardKm), b = Number(r.alightKm);
        segByTrip.set(r.tripId, {
          // The booking needs the stops themselves, not just their names:
          // two stops can share a city name on a long route, and the
          // price and the boarding point both come from the row.
          boardStopId:  r.boardStopId,
          alightStopId: r.alightStopId,
          boardCity:  r.boardCity,
          alightCity: r.alightCity,
          segmentKm:  Number.isFinite(a) && Number.isFinite(b) && b > a
            ? Math.round((b - a) * 10) / 10
            : null,
        });
      }
    }
    return trips.map((t: any) => ({
      id: t.id,
      fromCity: t.fromCity, toCity: t.toCity, departAt: t.departAt,
      /** Where THIS passenger boards and alights, when they matched a
       *  segment rather than the whole trip. Null for an endpoint match. */
      segment: segByTrip.get(t.id) ?? null,
      pickupMode: t.pickupMode, pickupAddress: t.pickupAddress,
      routeKm: t.routeKm != null ? Number(t.routeKm) : null,
      destLat: t.destLat != null ? Number(t.destLat) : null,
      destLng: t.destLng != null ? Number(t.destLng) : null,
      destAddress: t.destAddress ?? null,
      acceptsPassengers: !!t.acceptsPassengers,
      acceptsPackages: !!t.acceptsPackages,
      seatsLeft: Math.max(0, Number(t.seatsTotal) - Number(t.seatsBooked)),
      spareCapacityKg: Number(t.spareCapacityKg ?? 0),
      driver: {
        name: t.driver?.user?.name ?? 'Driver',
        rating: t.driver?.rating ?? null,
        // Plate, colour, make and model, not just the class of machine:
        // somebody standing in a motor park at 5am has to pick this
        // vehicle out of the row and be sure it is the one they paid
        // for. Whitelisted in one place so the driver row's bank
        // details and home address cannot follow it out here.
        ...vehicleIdentityForPassenger(t.driver),
      },
    }));
  }

  /** Load a bookable trip or explain why not. */
  async getBookableTrip(tripId: string, seats: number) {
    const t: any = await this.tripsRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.driver', 'd')
      .leftJoinAndSelect('d.user', 'u')
      .where('t.id = :tripId', { tripId })
      .getOne();
    if (!t) throw new NotFoundException('That trip is no longer listed.');
    if (t.status !== DriverTripStatus.ACTIVE || new Date(t.departAt) < new Date()) {
      throw new BadRequestException('That trip has departed or was cancelled.');
    }
    if (!t.acceptsPassengers) throw new BadRequestException('That trip does not take passengers.');
    const left = Math.max(0, Number(t.seatsTotal) - Number(t.seatsBooked));
    if (seats > left) {
      throw new BadRequestException(left === 0
        ? 'That trip is full.'
        : `Only ${left} seat${left === 1 ? '' : 's'} left on that trip.`);
    }
    return t;
  }

  async reserveSeats(tripId: string, seats: number) {
    // Guarded increment: the WHERE clause makes overselling impossible
    // even under two simultaneous bookings.
    const res = await this.tripsRepo.manager.query(
      `UPDATE "driver_trips"
          SET "seatsBooked" = "seatsBooked" + $1
        WHERE "id" = $2 AND "seatsBooked" + $1 <= "seatsTotal"
        RETURNING "id"`,
      [seats, tripId],
    );

    /**
     * Read the result by SHAPE, not by length.
     *
     * This was `if (!res?.length) throw`, and it never once fired. For an
     * UPDATE, TypeORM's postgres driver can hand back [rows, affected]
     * rather than rows, so a rejected increment arrives as [[], 0] whose
     * .length is 2: truthy. The database guard held perfectly and the
     * code simply did not notice it had been refused, so bookTripSeats
     * went on to create the delivery anyway.
     *
     * Measured on production 2026-08-24: five simultaneous one-seat
     * bookings on a four-seat car left seatsBooked at 4 with FIVE live
     * bookings against the trip. Passenger five held a valid, chargeable
     * booking and no seat. That is the founder's no-stuffing rule broken
     * by a truthiness bug.
     */
    const rows: any[] = Array.isArray(res)
      ? (Array.isArray(res[0]) ? res[0] : res)
      : [];
    const reserved = rows.some((r) => r && (r.id ?? r.ID));
    if (!reserved) throw new BadRequestException('Those seats were just taken.');
  }

  async releaseSeats(tripId: string, seats: number) {
    await this.tripsRepo.manager.query(
      `UPDATE "driver_trips" SET "seatsBooked" = GREATEST(0, "seatsBooked" - $1) WHERE "id" = $2`,
      [seats, tripId],
    ).catch(() => {});
  }

  /**
   * The rider's own declared trips, each carrying its stops.
   *
   * The stops are attached here rather than left to a second call: the
   * declared-trips card is where a rider checks what they committed to,
   * and a route that shows two city names when it actually has four
   * stops on it is the same two-city fiction this work exists to remove.
   *
   * TripStop has no inverse relation on DriverTrip, so the join is done
   * by hand rather than by leftJoinAndSelect.
   */
  async listMyInterstateTrips(userId: string) {
    const trips = await this.tripsRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.driver', 'd')
      .leftJoinAndSelect('d.user', 'u')
      .where('u.id = :userId', { userId })
      .orderBy('t.departAt', 'DESC')
      .limit(50)
      .getMany();
    if (!trips.length) return trips;

    const stops = await this.tripStopsRepo.find({
      where: { tripId: In(trips.map((t) => t.id)) } as any,
      order: { sequence: 'ASC' },
    }).catch(() => []);

    const byTrip = new Map<string, any[]>();
    for (const st of stops) {
      const list = byTrip.get(st.tripId) ?? [];
      list.push(st);
      byTrip.set(st.tripId, list);
    }
    return trips.map((t) => ({ ...t, stops: byTrip.get(t.id) ?? [] })) as any;
  }

  // Admin board - Spec V8 §3.12. Returns trips with driver + user joined
  // for the UI to display "<name> | Lagos → Ibadan | <kg> free".
  async listAllInterstateTrips(opts: { status?: DriverTripStatus } = {}) {
    /**
     * Narrow selects (2026-08-28). leftJoinAndSelect pulled the whole
     * Driver and the whole User behind it, so an interstate trips list
     * was serving every declared driver's KYC folder and bank details.
     * The page draws a name, a route, a departure time and a spare
     * capacity, and links to the driver by id.
     */
    const qb = this.tripsRepo
      .createQueryBuilder('t')
      .leftJoin('t.driver', 'd')
      .addSelect([
        'd.id', 'd.status', 'd.rating', 'd.vehicleType',
        'd.vehiclePlate', 'd.isOnline',
      ])
      .leftJoin('d.user', 'u')
      .addSelect(['u.id', 'u.name', 'u.phone', 'u.accountId'])
      .orderBy('t.departAt', 'ASC')
      .limit(100);
    if (opts.status) qb.where('t.status = :status', { status: opts.status });
    const trips = await qb.getMany();

    /**
     * THE STOPS, AND WHO IS ON THE TRIP (founder, 2026-08-28).
     *
     * This board showed a from-city and a to-city, so a driver who
     * declared Jos, then Ibadan, then Lagos appeared to be driving
     * straight through. His words on the screenshot: "i created from jos
     * to lagos and i am pretty sure i added a stop there would like to
     * see that also people who book and the pickup, drop off all detail
     * about that order".
     *
     * The board's own header says matching happens by contacting the
     * driver, and you cannot have that conversation without knowing
     * which towns the van passes through and which seats are already
     * taken. Same two grouped queries the Travel Buddy board uses, so a
     * page of a hundred trips costs three queries rather than 201.
     */
    const ids = trips.map(t => t.id);
    if (!ids.length) return trips;

    const stopRows: Array<any> = await this.tripsRepo.manager.query(
      `SELECT s."trip_id" AS "tripId", s.sequence, s.city, s.address,
              s.description, s."km_from_origin" AS "kmFromOrigin",
              s."arrived_at" AS "arrivedAt"
         FROM "trip_stops" s
        WHERE s."trip_id" = ANY($1::uuid[])
        ORDER BY s."trip_id", s.sequence ASC`,
      [ids],
    ).catch(() => []);

    const seatRows: Array<any> = await this.tripsRepo.manager.query(
      `SELECT sb."trip_id" AS "tripId", sb.id, sb.status,
              sb."price_ngn" AS "priceNgn", sb."segment_km" AS "segmentKm",
              bs.city AS "boardCity", als.city AS "alightCity",
              bs.address AS "boardAddress", als.address AS "alightAddress",
              pu.id AS "passengerUserId", pu.name AS "passengerName",
              pu.phone AS "passengerPhone"
         FROM "seat_bookings" sb
         LEFT JOIN "trip_stops" bs  ON bs.id  = sb."board_stop_id"
         LEFT JOIN "trip_stops" als ON als.id = sb."alight_stop_id"
         LEFT JOIN "users" pu ON pu.id = sb."passenger_id"
        WHERE sb."trip_id" = ANY($1::uuid[])
        ORDER BY sb."trip_id", sb."board_sequence" ASC`,
      [ids],
    ).catch(() => []);

    const byTrip = <T extends { tripId: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) {
        const list = m.get(r.tripId) ?? [];
        list.push(r);
        m.set(r.tripId, list);
      }
      return m;
    };
    const stopsFor = byTrip(stopRows);
    const seatsFor = byTrip(seatRows);

    return trips.map(t => Object.assign(t, {
      stops: (stopsFor.get(t.id) ?? []).map((r: any) => ({
        sequence:     Number(r.sequence ?? 0),
        city:         r.city,
        address:      r.address,
        description:  r.description ?? null,
        kmFromOrigin: r.kmFromOrigin == null ? null : Number(r.kmFromOrigin),
        arrivedAt:    r.arrivedAt ?? null,
      })),
      seats: (seatsFor.get(t.id) ?? []).map((r: any) => ({
        id:              r.id,
        status:          r.status,
        priceNgn:        r.priceNgn == null ? null : Number(r.priceNgn),
        segmentKm:       r.segmentKm == null ? null : Number(r.segmentKm),
        boardCity:       r.boardCity ?? null,
        alightCity:      r.alightCity ?? null,
        boardAddress:    r.boardAddress ?? null,
        alightAddress:   r.alightAddress ?? null,
        passengerUserId: r.passengerUserId ?? null,
        passengerName:   r.passengerName ?? null,
        passengerPhone:  r.passengerPhone ?? null,
      })),
    }));
  }

  /**
   * Cancel a declared trip.
   *
   * This used to flip the status and return, with no thought for anyone
   * who had booked a seat on it. A Travel Buddy seat is a real Delivery
   * row carrying this tripId, so the passengers were left holding live
   * bookings, some of them already paid for, against a trip that no
   * longer existed. Nobody was told. The first they would learn of it is
   * standing at the pickup point.
   *
   * Paid seats therefore BLOCK the cancellation rather than silently
   * stranding someone. Refunding is a money decision with a policy
   * attached (cancellation fee, who absorbs it) and the refund path
   * lives in DeliveriesService with the payments ref, not here, so this
   * routes the driver to support instead of inventing an answer.
   *
   * Unpaid holds do not block: nobody is out of pocket, so the trip
   * cancels and every holder is told immediately and by name, with the
   * reason, so they can go and book another trip.
   */
  /**
   * Change a declared trip that nobody has committed to yet.
   *
   * The rider could create a trip and cancel it, and nothing in
   * between. A wrong departure time or a seat count typed one too low
   * meant cancelling and re-declaring, which is the same complaint the
   * customer side had about unpaid bookings (founder 2026-08-29).
   *
   * What may change depends on whether anyone has booked:
   *
   *   nobody booked   departure time, seats, spare capacity, and
   *                   whether the trip takes passengers or packages.
   *   someone booked  only changes that cannot strand them: more seats,
   *                   more spare capacity. The departure time is frozen
   *                   because a passenger arranged their day around it,
   *                   and passengers cannot be switched off underneath
   *                   a booking that already exists.
   *
   * The route itself is never edited here. Cities and stops carry
   * measured distances that every segment fare is computed from, so a
   * different route is a different trip: cancel and declare it.
   */
  async editInterstateTrip(
    userId: string,
    tripId: string,
    body: {
      departAt?: string;
      seatsTotal?: number;
      spareCapacityKg?: number;
      acceptsPassengers?: boolean;
      acceptsPackages?: boolean;
    },
  ) {
    const trip = await this.tripsRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.driver', 'd')
      .leftJoinAndSelect('d.user', 'u')
      .where('t.id = :tripId', { tripId })
      .getOne();
    if (!trip) throw new NotFoundException('Trip not found.');
    if (trip.driver.user.id !== userId) {
      throw new ForbiddenException('Not your trip.');
    }
    if (trip.status !== DriverTripStatus.ACTIVE) {
      throw new BadRequestException('This trip is no longer active, so it cannot be changed.');
    }
    if (new Date(trip.departAt) < new Date()) {
      throw new BadRequestException('This trip has already departed.');
    }

    const booked = Number(trip.seatsBooked ?? 0);
    const hasPassengers = booked > 0;

    if (body.departAt !== undefined) {
      const when = new Date(body.departAt);
      if (Number.isNaN(when.getTime())) {
        throw new BadRequestException('That departure time is not a real date.');
      }
      if (when < new Date()) {
        throw new BadRequestException('A trip cannot depart in the past.');
      }
      if (hasPassengers) {
        throw new BadRequestException(
          `${booked} seat${booked === 1 ? ' is' : 's are'} already booked on this trip, so the departure time is fixed: ` +
          'your passengers arranged their day around it. Cancel the trip if you can no longer make it.',
        );
      }
      trip.departAt = when;
    }

    if (body.seatsTotal !== undefined) {
      const seats = Math.max(0, Math.round(Number(body.seatsTotal) || 0));
      if (seats < booked) {
        throw new BadRequestException(
          `You cannot drop below ${booked} seat${booked === 1 ? '' : 's'}: that many are already booked.`,
        );
      }
      trip.seatsTotal = seats;
    }

    if (body.spareCapacityKg !== undefined) {
      const kg = Number(body.spareCapacityKg);
      if (!(kg >= 0)) throw new BadRequestException('Spare capacity cannot be negative.');
      trip.spareCapacityKg = kg;
    }

    if (body.acceptsPassengers !== undefined) {
      if (!body.acceptsPassengers && hasPassengers) {
        throw new BadRequestException(
          'Someone has already booked a seat, so this trip cannot stop taking passengers. Cancel it instead.',
        );
      }
      trip.acceptsPassengers = !!body.acceptsPassengers;
    }

    if (body.acceptsPackages !== undefined) {
      trip.acceptsPackages = !!body.acceptsPackages;
    }

    const saved = await this.tripsRepo.save(trip);
    this.logger.log(
      `TRIP_EDIT tripId=${tripId} driverUser=${userId} seatsTotal=${saved.seatsTotal} ` +
      `seatsBooked=${booked} spareKg=${saved.spareCapacityKg} departAt=${new Date(saved.departAt).toISOString()}`,
    );
    return saved;
  }

  async cancelInterstateTrip(userId: string, tripId: string) {
    const trip = await this.tripsRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.driver', 'd')
      .leftJoinAndSelect('d.user', 'u')
      .where('t.id = :tripId', { tripId })
      .getOne();
    if (!trip) throw new NotFoundException('Trip not found.');
    if (trip.driver.user.id !== userId) {
      throw new ForbiddenException('Not your trip.');
    }
    if (trip.status === DriverTripStatus.CANCELLED) return trip;

    // Seat bookings that are still live. A delivered or already-cancelled
    // seat has nothing left to strand.
    const seatBookings = await this.deliveriesRepo.find({
      where: {
        tripId,
        status: In([
          DeliveryStatus.PENDING,
          DeliveryStatus.ASSIGNED,
          DeliveryStatus.PICKED_UP,
          DeliveryStatus.IN_TRANSIT,
        ]),
      },
      relations: ['customer'],
    });

    const paid = seatBookings.filter((b: any) => b.paymentHeldAt != null);
    if (paid.length > 0) {
      throw new ConflictException({
        code: 'TRIP_HAS_PAID_SEATS',
        message:
          `${paid.length} passenger${paid.length === 1 ? ' has' : 's have'} already paid for a seat on this trip. ` +
          'We cannot cancel it from here without settling their refunds. Contact support and we will sort it out with you.',
      });
    }

    trip.status = DriverTripStatus.CANCELLED;
    const saved = await this.tripsRepo.save(trip);

    // Tell the unpaid holders. No arrival promise and no refund promise:
    // there is nothing to refund, and the only honest thing to offer is
    // the rest of the Travel Buddy list.
    for (const booking of seatBookings) {
      const passengerId = (booking as any).customer?.id;
      if (!passengerId || !this.notificationsService) continue;
      this.notificationsService.create(
        passengerId,
        'Your trip was called off',
        `The driver cancelled the ${trip.fromCity} to ${trip.toCity} trip. You were not charged. ` +
        'Other trips on this route are on the Travel Buddy list.',
        'general',
        (booking as any).id,
        (booking as any).trackingCode,
      ).catch(() => {});
    }
    if (seatBookings.length) {
      this.logger.log(
        `Trip ${tripId} cancelled by driver; notified ${seatBookings.length} unpaid seat holder(s)`,
      );
    }

    return saved;
  }

  // ── Spec V8 §2.13 - Auto check-in cron ────────────────────────────────────
  // Drivers who are online but haven't pinged GPS in 5+ min get a silent
  // "are you OK?" push. Helps detect crashed phones, dead batteries,
  // signal black spots. Runs every 5 minutes; once a driver pings back
  // their locationUpdatedAt advances and they're cleared.
  /**
   * How often the same driver may be asked. The cron runs every 5 minutes
   * and re-selects anyone still stale, so without this a rider who goes
   * online and pockets the phone, or rides through a signal black spot,
   * was asked "Are you OK?" every 5 minutes indefinitely. Found on device
   * 2026-08-31: the demo driver had six identical pings, 5 minutes apart.
   *
   * That is how a driver ends up muting SEIRS notifications altogether,
   * and then misses job offers, which is a far worse outcome than a
   * missed check-in.
   *
   * In memory on purpose: it needs no migration, and losing the cooldown
   * on a deploy costs one extra ping, not a storm.
   */
  private static readonly CHECK_IN_COOLDOWN_MS = 30 * 60 * 1000;
  private readonly lastCheckInPing = new Map<string, number>();

  @Cron(CronExpression.EVERY_5_MINUTES)
  async pingStaleOnlineDrivers() {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    const stale = await this.repo.find({
      where: { isOnline: true, locationUpdatedAt: LessThan(cutoff) },
      relations: ['user'],
      take: 200,
    });
    if (!stale.length) return;
    let pinged = 0;
    const now = Date.now();
    for (const d of stale) {
      if (!d.user?.id || !this.notificationsService) continue;

      const last = this.lastCheckInPing.get(d.id) ?? 0;
      if (now - last < DriversService.CHECK_IN_COOLDOWN_MS) continue;
      this.lastCheckInPing.set(d.id, now);

      this.notificationsService.create(
        d.user.id,
        'Are you OK?',
        'We haven\'t seen your location in a few minutes. Open SEIRS so we know you\'re safe.',
        'general',
      ).catch(() => {});
      pinged++;
    }
    // Forget anyone no longer stale, so the map cannot grow without bound
    // and a driver who comes back is eligible again immediately.
    const stillStale = new Set(stale.map((d) => d.id));
    for (const id of this.lastCheckInPing.keys()) {
      if (!stillStale.has(id)) this.lastCheckInPing.delete(id);
    }

    if (pinged) this.logger.log(`Auto check-in: pinged ${pinged} stale online drivers`);
  }

  /**
   * Customer ratings on this driver's deliveries: average, per-star
   * breakdown, and the most recent rated trips with comments.
   */
  async getMyRatings(userId: string) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');

    const rows: Array<{ rating: number; count: string }> = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select('d.customerRating', 'rating')
      .addSelect('COUNT(*)', 'count')
      .where('d.driverId = :driverId', { driverId: driver.id })
      .andWhere('d.customerRating IS NOT NULL')
      .groupBy('d.customerRating')
      .getRawMany();

    const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    let sum   = 0;
    for (const r of rows) {
      const star = Number(r.rating);
      const cnt  = Number(r.count);
      if (star >= 1 && star <= 5) { breakdown[star] = cnt; total += cnt; sum += star * cnt; }
    }

    const recent = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select(['d.id', 'd.trackingCode', 'd.customerRating', 'd.customerComment', 'd.deliveredAt'])
      .where('d.driverId = :driverId', { driverId: driver.id })
      .andWhere('d.customerRating IS NOT NULL')
      .orderBy('d.deliveredAt', 'DESC')
      .take(30)
      .getMany();

    return {
      average: total > 0 ? +(sum / total).toFixed(2) : 0,
      total,
      breakdown,
      recent: recent.map(d => ({
        id:           d.id,
        trackingCode: d.trackingCode,
        rating:       Number(d.customerRating),
        comment:      d.customerComment ?? null,
        deliveredAt:  d.deliveredAt,
      })),
    };
  }

  // ── Spec V8 §2.9 - Driver tax summary ─────────────────────────────────────
  // Aggregates the driver's delivery earnings by year so the FIRS-filing
  // helper screen (drv.taxDocs) can render a real table. Returns flat
  // JSON; the client can PDF-render if needed.
  async getTaxSummary(userId: string, year?: number) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');

    const qb = this.deliveriesRepo
      .createQueryBuilder('d')
      .select(`EXTRACT(YEAR FROM d.deliveredAt)::int`, 'year')
      .addSelect('COUNT(d.id)::int',                    'tripCount')
      .addSelect('COALESCE(SUM(d.price), 0)::float',    'grossNgn')
      .addSelect('COALESCE(SUM(d.driverEarnings), 0)::float', 'netNgn')
      .where('d.driverId = :driverId', { driverId: driver.id })
      .andWhere('d.status = :status',  { status: DeliveryStatus.DELIVERED })
      .andWhere('d.deliveredAt IS NOT NULL');

    if (year) qb.andWhere('EXTRACT(YEAR FROM d.deliveredAt) = :year', { year });

    const rows = await qb
      .groupBy(`EXTRACT(YEAR FROM d.deliveredAt)`)
      .orderBy(`EXTRACT(YEAR FROM d.deliveredAt)`, 'DESC')
      .getRawMany();

    // Monthly rows, last 12 months: drivers reconcile month by month
    // even though FIRS filing is yearly (founder 2026-08-22).
    const monthRows = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select(`EXTRACT(YEAR FROM d.deliveredAt)::int`,  'year')
      .addSelect(`EXTRACT(MONTH FROM d.deliveredAt)::int`, 'month')
      .addSelect('COUNT(d.id)::int',                    'tripCount')
      .addSelect('COALESCE(SUM(d.price), 0)::float',    'grossNgn')
      .addSelect('COALESCE(SUM(d.driverEarnings), 0)::float', 'netNgn')
      .where('d.driverId = :driverId', { driverId: driver.id })
      .andWhere('d.status = :status',  { status: DeliveryStatus.DELIVERED })
      .andWhere('d.deliveredAt IS NOT NULL')
      .andWhere(`d.deliveredAt >= NOW() - INTERVAL '12 months'`)
      .groupBy(`EXTRACT(YEAR FROM d.deliveredAt), EXTRACT(MONTH FROM d.deliveredAt)`)
      .orderBy(`EXTRACT(YEAR FROM d.deliveredAt)`, 'DESC')
      .addOrderBy(`EXTRACT(MONTH FROM d.deliveredAt)`, 'DESC')
      .getRawMany();

    return {
      driverId:   driver.id,
      generatedAt: new Date().toISOString(),
      months:     monthRows.map((r: any) => ({
        year:          Number(r.year),
        month:         Number(r.month),
        tripCount:     Number(r.tripCount),
        grossNgn:      Math.round(Number(r.grossNgn)),
        commissionNgn: Math.round(Number(r.grossNgn) - Number(r.netNgn)),
        netNgn:        Math.round(Number(r.netNgn)),
      })),
      years:      rows.map((r: any) => ({
        year:        Number(r.year),
        tripCount:   Number(r.tripCount),
        grossNgn:    Math.round(Number(r.grossNgn)),
        commissionNgn: Math.round(Number(r.grossNgn) - Number(r.netNgn)),
        netNgn:      Math.round(Number(r.netNgn)),
      })),
      note: 'Self-employed driver earnings for Nigerian FIRS filing. Includes only completed deliveries; tips and instant-payout fees not included.',
    };
  }

  // ── Spec V8 §2.14 - Driver status broadcast (network/traffic/help) ─────────
  async recordStatusBroadcast(userId: string, body: {
    type: DriverStatusBroadcastType;
    deliveryId?: string;
    lat?: number;
    lng?: number;
  }) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');

    if (!Object.values(DriverStatusBroadcastType).includes(body.type)) {
      throw new BadRequestException('Unknown broadcast type.');
    }

    /**
     * Bind the broadcast to the trip it is about, and find that trip
     * ourselves when the app did not say (2026-08-25).
     *
     * Symptom, verified live: the founder tapped a status broadcast from
     * a rider on an active job and the customer's notification count did
     * not move. Two reasons, and this is the first. The driver app sends
     * no deliveryId, so `delivery` stayed null and the fan-out below was
     * scoped to the admin room: the only person the message is FOR never
     * had a room to receive it in.
     *
     * Resolving the rider's own active job server-side fixes it without
     * waiting on an app release. Only when there is exactly one: a rider
     * on a multi-drop round would otherwise have "stuck in traffic" sent
     * to whichever customer sorted first, which is worse than sending it
     * to nobody.
     */
    let delivery: Delivery | null = null;
    if (body.deliveryId) {
      delivery = await this.deliveriesRepo.findOne({
        where: { id: body.deliveryId, driver: { id: driver.id } },
        relations: ['customer'],
      });
    }
    if (!delivery) {
      const active = await this.deliveriesRepo.find({
        where: {
          driver: { id: driver.id },
          status: In([DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT]),
        },
        relations: ['customer'],
        order: { createdAt: 'DESC' },
        take: 2,
      }).catch(() => [] as Delivery[]);
      if (active.length === 1) delivery = active[0];
    }

    const lat = body.lat ?? (driver.lastLat != null ? Number(driver.lastLat) : null);
    const lng = body.lng ?? (driver.lastLng != null ? Number(driver.lastLng) : null);

    const broadcast = this.broadcastsRepo.create({
      driver,
      delivery,
      type: body.type,
      lat,
      lng,
    });
    const saved = await this.broadcastsRepo.save(broadcast);

    // Fan-out: admin room always; delivery room when bound to a trip.
    this.trackingGateway.broadcastDriverStatus({
      id:          saved.id,
      driverId:    driver.id,
      driverName:  driver.user?.name ?? 'Driver',
      deliveryId:  delivery?.id ?? null,
      type:        body.type,
      lat,
      lng,
      createdAt:   saved.createdAt,
    });

    /**
     * Persist a Notification, which is the second half of the same bug.
     *
     * The websocket fan-out above is the whole of what this method used
     * to do, so the message existed only for whoever happened to have the
     * tracking screen open at that instant. Nothing was written to the
     * notifications table, so there was nothing to raise the customer's
     * unread count, nothing in their inbox afterwards, and no push.
     *
     * Wording deliberately promises no arrival time. These three taps are
     * exactly the moments a rider is late, and "traffic, expect 20 more
     * minutes" is a refund magnet in Lagos.
     *
     * Fire-and-forget: the broadcast row is already saved, and failing the
     * rider's tap because an inbox write hiccuped would leave them tapping
     * it again from the roadside.
     */
    const customerId = delivery?.customer?.id ?? null;
    if (customerId && this.notificationsService) {
      const COPY: Record<string, { title: string; body: string }> = {
        [DriverStatusBroadcastType.NETWORK_BAD]: {
          title: 'Your rider has a weak signal',
          body:  'Live tracking may pause for a while. Your package is still with them and still moving.',
        },
        [DriverStatusBroadcastType.TRAFFIC]: {
          title: 'Your rider is held up in traffic',
          body:  'They are on the route and will keep moving as it clears.',
        },
        [DriverStatusBroadcastType.NEED_HELP]: {
          title: 'We are checking in with your rider',
          body:  'Your rider asked our team for help with this trip. Support has been alerted and will follow up.',
        },
      };
      const copy = COPY[body.type];
      if (copy) {
        this.notificationsService
          .create(customerId, copy.title, copy.body, 'status_update', delivery?.id)
          .catch((e: any) => this.logger.warn(`status broadcast notification failed: ${e?.message ?? e}`));
      }
    }

    return saved;
  }

  async toggleOnline(userId: string, isOnline: boolean) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');

    // Approval gate (founder 2026-08-10): unapproved drivers could go
    // online and sit forever without offers, since matching only
    // considers approved drivers. Fail loudly instead of silently.
    if (isOnline && driver.status !== DriverStatus.APPROVED) {
      throw new BadRequestException(
        'ACCOUNT_UNDER_REVIEW: your driver account is not approved yet. ' +
        'Complete your KYC documents; approval usually takes 24 hours to 3 business days.',
      );
    }

    // Spec V8 §2.12 - driver CANNOT go offline while holding active jobs.
    // Otherwise customers' packages get abandoned mid-route.
    if (!isOnline) {
      const activeCount = await this.deliveriesRepo.count({
        where: {
          driver: { id: driver.id },
          status: In([DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT]),
        },
      });
      if (activeCount > 0) {
        throw new BadRequestException(
          `ACTIVE_JOBS_PRESENT: complete or hand off your ${activeCount} active ` +
          `${activeCount === 1 ? 'job' : 'jobs'} before going offline.`,
        );
      }
    }

    const updates: Partial<Driver> = { isOnline };
    if (isOnline) {
      updates.lastOnlineAt = new Date();
    }
    await this.repo.update(driver.id, updates);
    return { isOnline };
  }

  async updateLocation(userId: string, lat: number, lng: number) {
    // Validate coordinate ranges
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new NotFoundException('Invalid coordinates.');
    }

    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');

    // GPS velocity fraud check - compare with last known position
    if (driver.lastLat != null && driver.lastLng != null && driver.locationUpdatedAt) {
      const elapsedSeconds = (Date.now() - new Date(driver.locationUpdatedAt).getTime()) / 1000;
      if (elapsedSeconds > 0 && elapsedSeconds < 3600) {
        this.fraudService
          .checkGpsAnomaly(userId, driver.lastLat, driver.lastLng, lat, lng, elapsedSeconds)
          // Swallowed so a fraud check can never break a location
          // update, but logged: a detector that has silently stopped
          // running looks exactly like a platform with no fraud on it.
          .catch((e: any) =>
            this.logger?.warn?.(`GPS anomaly check failed for ${userId}: ${e?.message ?? e}`));
      }
    }

    await this.repo.update(driver.id, {
      lastLat:           lat,
      lastLng:           lng,
      locationUpdatedAt: new Date(),
    });

    // Broadcast to any customers tracking this driver's active delivery.
    // Without this WS broadcast, the customer's tracking screen never sees
    // GPS updates because the driver app uses REST (not the WS
    // driver:update-location event). See ECOSYSTEM_AUDIT_2026-05-10.md
    // section B2/B3.
    const activeDelivery = await this.deliveriesRepo.findOne({
      where: {
        driver: { id: driver.id },
        status: In([DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT]),
      },
      select: ['id'],
    });
    if (activeDelivery) {
      this.trackingGateway.broadcastDriverLocation(activeDelivery.id, driver.id, lat, lng);
    }
  }

  // Find available online drivers near a point (Haversine radius query)
  findNearby(lat: number, lng: number, radiusKm: number = 10) {
    // Validate inputs before use in query
    const safeLat = Number(lat);
    const safeLng = Number(lng);
    const safeRadius = Number(radiusKm);

    if (
      isNaN(safeLat) || isNaN(safeLng) || isNaN(safeRadius) ||
      safeLat < -90 || safeLat > 90 || safeLng < -180 || safeLng > 180
    ) {
      return Promise.resolve([]);
    }

    // Haversine formula - WHERE clause uses parameterized values (:lat, :lng, :radius)
    // ORDER BY uses validated numeric literals (no user-controlled strings)
    return this.repo
      .createQueryBuilder('driver')
      .leftJoinAndSelect('driver.user', 'user')
      .where('driver.isOnline = true')
      .andWhere('driver.status = :status', { status: 'approved' })
      // Demo/marketing accounts must never receive a real customer's
      // delivery (2026-08-12 security review).
      .andWhere('user.isDemo = false')
      .andWhere(
        `(6371 * acos(LEAST(1, GREATEST(-1,
          cos(radians(:lat)) * cos(radians(driver.lastLat)) *
          cos(radians(driver.lastLng) - radians(:lng)) +
          sin(radians(:lat)) * sin(radians(driver.lastLat))
        )))) < :radius`,
        { lat: safeLat, lng: safeLng, radius: safeRadius },
      )
      .orderBy(
        // Safe: safeLat/safeLng are validated numbers, not user-supplied strings
        `(6371 * acos(LEAST(1, GREATEST(-1,
          cos(radians(${safeLat})) * cos(radians(driver.lastLat)) *
          cos(radians(driver.lastLng) - radians(${safeLng})) +
          sin(radians(${safeLat})) * sin(radians(driver.lastLat))
        ))))`,
        'ASC',
      )
      .getMany();
  }

  // Spec V8 - driver pre-deletion readiness check. Drivers with active
  // deliveries or non-zero wallet balance can't be deleted; the UI
  // surfaces the blockers so the driver knows what to do (complete or
  // hand-off the deliveries; withdraw the balance) before retrying.
  async getDeletionReadiness(userId: string) {
    const driver = await this.findByUserId(userId);
    if (!driver) {
      return { isDriver: false, ready: true, blockers: [] };
    }

    const blockers: Array<{ type: string; count: number; action: string }> = [];

    // Active deliveries - anything not yet delivered or cancelled
    const activeCount = await this.deliveriesRepo.count({
      where: [
        { driver: { id: driver.id }, status: DeliveryStatus.ASSIGNED },
        { driver: { id: driver.id }, status: DeliveryStatus.PICKED_UP },
        { driver: { id: driver.id }, status: DeliveryStatus.IN_TRANSIT },
      ],
    });
    if (activeCount > 0) {
      blockers.push({
        type:   'active_deliveries',
        count:  activeCount,
        action: 'Complete or contact ops to reassign these deliveries first.',
      });
    }

    /**
     * Money still owed to this rider.
     *
     * This used to read `driver.walletBalance`, which NOTHING in the
     * backend ever writes, so the guard always passed and a driver with
     * real earnings was told "wallet is empty" and cleared to delete
     * (found on device 2026-08-31 with NGN 146.97 sitting withdrawable).
     *
     * The real money is the driver_earnings ledger. `pending` counts too:
     * it is money owed that has merely not cleared its dispute window yet,
     * and deleting would strand it just the same. driverId on that table
     * is the USER id, which is what this method receives.
     */
    const owed = await this.earningsRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.driver_net), 0)', 'total')
      .where('e.driver_id = :userId', { userId })
      .andWhere('e.status IN (:...statuses)', { statuses: ['pending', 'available'] })
      .getRawOne<{ total: string }>();

    const balance = Number(owed?.total ?? 0);
    if (balance > 0) {
      blockers.push({
        type:   'wallet_balance',
        count:  balance,
        action: `Withdraw your ₦${balance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} before deleting.`,
      });
    }

    return {
      isDriver: true,
      ready:    blockers.length === 0,
      blockers,
      driverId: driver.id,
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Vehicle ownership + self-serve vehicle change (2026-08-25)
  //
  // Founder: "self-serve with admin approval, because admin can't tell if
  // someone bought a new car without them telling us, but they will need
  // to go through the whole process for approval, with all the proof they
  // need. They should be able to submit it in the app, just like change
  // bank account."
  //
  // Shape is lifted from PaymentsService.updateBankDetails /
  // resolveBankChange, which the founder named as the model: submit,
  // park as pending, open a review ticket, keep the live value working
  // until a human approves, then apply and close the ticket. That flow
  // was a good model in every respect except one, noted below on
  // `getVehicle`: it has a read endpoint that returns the pending state,
  // and the vehicle flow did not, so the app had to dig a jsonb blob out
  // of /drivers/me to know whether a request was in flight.
  //
  // The live vehicleType on the drivers row does NOT move here. Matching
  // and pricing both read it, so a rider quietly switching an okada
  // registration to a car would be charging car rates on a bike.
  // ────────────────────────────────────────────────────────────────────────

  private static readonly OWNER_RELATIONSHIPS: string[] = [
    'family', 'employer', 'hire_purchase', 'daily_return', 'friend', 'other',
  ];

  /** Classes with an inside worth photographing. An okada has no cabin. */
  private static readonly ENCLOSED_TYPES: string[] = [
    'car', 'van', 'truck_small', 'truck_large',
  ];

  private safeUrl(u?: string | null): string | null {
    return typeof u === 'string' && /^https?:\/\//.test(u) ? u.slice(0, 500) : null;
  }

  /** Loose structural check. Same rule the driver app's constants/phone.ts uses. */
  private normaliseNgPhone(raw?: string | null): string | null {
    const cleaned = String(raw ?? '').replace(/[\s()\-]/g, '').replace(/^\+?234/, '');
    const local = /^[789]\d{9}$/.test(cleaned) ? `0${cleaned}` : cleaned;
    return /^0[789]\d{9}$/.test(local) ? `+234${local.slice(1)}` : null;
  }

  /** "  Adeyemi   OLUWASEUN " and "adeyemi oluwaseun" are the same person. */
  private nameKey(n?: string | null): string {
    return String(n ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Validate and normalise a third-party ownership declaration.
   *
   * The owner is assumed NOT to have the app. Requiring them to register
   * would exclude most of the people this exists for: the uncle who owns
   * the keke, the man who fronts six bikes for a daily return. So the
   * recorded consent is what a person without a smartphone can actually
   * produce: their name, a phone number that reaches them, a photo of a
   * paper authorisation they signed, and their name typed on the rider's
   * phone as the section 84 signature.
   */
  private buildOwnershipBlock(body: {
    ownership?:          string;
    ownerName?:          string;
    ownerPhone?:         string;
    ownerRelationship?:  string;
    ownerConsentUrl?:    string;
    ownerIdUrl?:         string;
    ownerSignatureName?: string;
  }, riderName?: string | null) {
    const ownership = body.ownership === 'third_party' ? 'third_party' : 'self';

    if (ownership === 'self') {
      return {
        ownership:          'self' as const,
        ownerName:          null,
        ownerPhone:         null,
        ownerRelationship:  null,
        ownerConsentUrl:    null,
        ownerIdUrl:         null,
        ownerSignatureName: null,
        ownerConsentAt:     null,
      };
    }

    const ownerName = String(body.ownerName ?? '').trim().slice(0, 120);
    if (ownerName.split(/\s+/).filter(Boolean).length < 2) {
      throw new BadRequestException(
        "Enter the vehicle owner's full name, first and last.",
      );
    }

    const ownerPhone = this.normaliseNgPhone(body.ownerPhone);
    if (!ownerPhone) {
      throw new BadRequestException(
        "Enter a Nigerian mobile number that reaches the owner, so our team can call and confirm.",
      );
    }

    const rel = String(body.ownerRelationship ?? '').trim();
    if (!DriversService.OWNER_RELATIONSHIPS.includes(rel)) {
      throw new BadRequestException('Tell us how you came to be riding this vehicle.');
    }

    const consentUrl = this.safeUrl(body.ownerConsentUrl);
    if (!consentUrl) {
      throw new BadRequestException(
        'Upload a photo of the signed authorisation from the vehicle owner.',
      );
    }

    const signature = String(body.ownerSignatureName ?? '').trim().slice(0, 120);
    if (!signature) {
      throw new BadRequestException(
        "The owner must type their own full name to sign the authorisation.",
      );
    }
    // The typed name IS the signature (Evidence Act section 84, the same
    // standard the chain-of-custody handoff records use). A signature that
    // does not match the name it claims to be signs nothing.
    if (this.nameKey(signature) !== this.nameKey(ownerName)) {
      throw new BadRequestException(
        "The typed signature must match the owner's full name exactly.",
      );
    }
    // A rider signing as their own "third party" owner is the one shortcut
    // this whole declaration exists to close.
    if (riderName && this.nameKey(signature) === this.nameKey(riderName)) {
      throw new BadRequestException(
        'The owner has to sign this themselves. If the vehicle is yours, choose "I own it".',
      );
    }

    return {
      ownership:          'third_party' as const,
      ownerName,
      ownerPhone,
      ownerRelationship:  rel,
      ownerConsentUrl:    consentUrl,
      ownerIdUrl:         this.safeUrl(body.ownerIdUrl),
      ownerSignatureName: signature,
      ownerConsentAt:     new Date(),
    };
  }

  /**
   * Declare who owns the vehicle, during initial KYC only.
   *
   * While the rider is still `pending` the whole record is in front of an
   * admin anyway, so this writes straight to the live columns: making a
   * not-yet-approved applicant open a "change request" against a vehicle
   * nobody has approved yet is nonsense.
   *
   * Once APPROVED, ownership is frozen and only moves through the change
   * flow. Otherwise an approved rider could swap the declared owner of a
   * vehicle after the fact, which is precisely the claim compliance
   * relied on when they approved it.
   */
  async declareVehicleOwnership(userId: string, body: {
    ownership?:          string;
    ownerName?:          string;
    ownerPhone?:         string;
    ownerRelationship?:  string;
    ownerConsentUrl?:    string;
    ownerIdUrl?:         string;
    ownerSignatureName?: string;
  }) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');
    if (driver.status === DriverStatus.APPROVED) {
      throw new BadRequestException(
        'VEHICLE_OWNERSHIP_LOCKED: your vehicle is already approved. Submit a vehicle change to update who owns it.',
      );
    }

    const block = this.buildOwnershipBlock(body, driver.user?.name);
    await this.repo.update(driver.id, {
      vehicleOwnership:          block.ownership,
      vehicleOwnerName:          block.ownerName,
      vehicleOwnerPhone:         block.ownerPhone,
      vehicleOwnerRelationship:  block.ownerRelationship,
      vehicleOwnerConsentUrl:    block.ownerConsentUrl,
      vehicleOwnerIdUrl:         block.ownerIdUrl,
      vehicleOwnerSignatureName: block.ownerSignatureName,
      vehicleOwnerConsentAt:     block.ownerConsentAt ?? new Date(),
    } as Partial<Driver>);

    return { saved: true, ownership: block.ownership };
  }

  /**
   * Everything the driver app's vehicle screen needs in one call: the
   * live vehicle, the live ownership declaration, and the pending change
   * if there is one.
   *
   * The bank flow has exactly this (getBankDetails) and the vehicle flow
   * did not, which is why the old screen was reaching into
   * `/drivers/me` -> `vehicleDetails.pendingChange`. That jsonb blob is
   * also what leaked photo URLs to customers, so nothing pending lives
   * there any more.
   */
  async getVehicle(userId: string) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');

    const pending = await this.vehicleChangesRepo.findOne({
      where:  { driverId: driver.id, status: VehicleChangeStatus.PENDING },
      order:  { createdAt: 'DESC' },
    });

    const details = (driver.vehicleDetails ?? {}) as any;
    return {
      status:       driver.status,
      vehicleType:  driver.vehicleType,
      vehiclePlate: driver.vehiclePlate ?? null,
      make:  details.make  ?? null,
      model: details.model ?? null,
      year:  details.year  ?? null,
      color: details.color ?? null,
      vehiclePhotoUrl:   driver.vehiclePhotoUrl   ?? null,
      ownershipProofUrl: driver.ownershipProofUrl ?? null,
      insuranceCertUrl:  driver.insuranceCertUrl  ?? null,
      ownership: {
        // `declared: false` is "we never asked", not "they said no". Every
        // rider on the platform before 2026-08-25 is in that state.
        declared:           !!driver.vehicleOwnerConsentAt || driver.vehicleOwnership === 'third_party',
        ownership:          driver.vehicleOwnership ?? 'self',
        ownerName:          driver.vehicleOwnerName ?? null,
        ownerPhone:         driver.vehicleOwnerPhone ?? null,
        ownerRelationship:  driver.vehicleOwnerRelationship ?? null,
        ownerConsentUrl:    driver.vehicleOwnerConsentUrl ?? null,
        ownerIdUrl:         driver.vehicleOwnerIdUrl ?? null,
        ownerSignatureName: driver.vehicleOwnerSignatureName ?? null,
        ownerConsentAt:     driver.vehicleOwnerConsentAt ?? null,
      },
      pendingChange: pending ?? null,
    };
  }

  /**
   * Submit a vehicle change for review.
   *
   * The rider re-submits the VEHICLE proofs and nothing else. Their NIN,
   * licence and selfie are already verified and belong to the person, not
   * the machine: founder was explicit that an approved rider must not be
   * dragged through the whole thing again for buying a new bike.
   *
   * Which proofs are mandatory is class-aware, because a blanket list is
   * how you end up demanding the interior photo of an okada and an
   * insurance certificate for a bicycle.
   */
  async submitVehicleChange(userId: string, body: {
    vehicleType?:  string;
    vehiclePlate?: string;
    make?:  string;
    model?: string;
    year?:  string;
    color?: string;
    photoExteriorUrl?:  string;
    photoInteriorUrl?:  string;
    photoPlateUrl?:     string;
    ownershipProofUrl?: string;
    insuranceCertUrl?:  string;
    reason?: string;
    ownership?:          string;
    ownerName?:          string;
    ownerPhone?:         string;
    ownerRelationship?:  string;
    ownerConsentUrl?:    string;
    ownerIdUrl?:         string;
    ownerSignatureName?: string;
  }) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');

    // One in flight at a time. Same rule the bank change enforces: two
    // open requests against the same field means whichever an admin
    // happens to open second silently wins.
    const existing = await this.vehicleChangesRepo.findOne({
      where: { driverId: driver.id, status: VehicleChangeStatus.PENDING },
    });
    if (existing) {
      throw new BadRequestException(
        'VEHICLE_CHANGE_PENDING: you already have a vehicle change under review. Withdraw it first if you need to change the details.',
      );
    }

    const vehicleType = String(body.vehicleType ?? driver.vehicleType ?? '').trim().slice(0, 24);
    if (!Object.values(VehicleType).includes(vehicleType as VehicleType)) {
      throw new BadRequestException('Choose a valid vehicle type.');
    }

    const plate = String(body.vehiclePlate ?? '').trim().toUpperCase().slice(0, 16);
    const isBicycle = vehicleType === VehicleType.BICYCLE;
    if (!isBicycle && plate.length < 4) {
      throw new BadRequestException('Enter the plate number exactly as it appears on the vehicle.');
    }

    const photoExteriorUrl  = this.safeUrl(body.photoExteriorUrl);
    const photoInteriorUrl  = this.safeUrl(body.photoInteriorUrl);
    const photoPlateUrl     = this.safeUrl(body.photoPlateUrl);
    const ownershipProofUrl = this.safeUrl(body.ownershipProofUrl);
    const insuranceCertUrl  = this.safeUrl(body.insuranceCertUrl);

    const missing: string[] = [];
    if (!photoExteriorUrl) missing.push('a photo of the whole vehicle');
    if (!isBicycle && !photoPlateUrl) missing.push('a close-up of the plate number');
    // Interior only where there is one to photograph.
    if (DriversService.ENCLOSED_TYPES.includes(vehicleType) && !photoInteriorUrl) {
      missing.push('a photo of the inside');
    }
    // The proofs that made the FIRST vehicle approvable, asked for again.
    if (!ownershipProofUrl) missing.push('the ownership document for this vehicle');
    if (!isBicycle && !insuranceCertUrl) missing.push('a current insurance certificate');
    if (missing.length) {
      throw new BadRequestException(`Still needed: ${missing.join(', ')}.`);
    }

    const ownerBlock = this.buildOwnershipBlock(body, driver.user?.name);

    const saved = await this.vehicleChangesRepo.save(this.vehicleChangesRepo.create({
      driverId: driver.id,
      status:   VehicleChangeStatus.PENDING,
      vehicleType,
      vehiclePlate: plate || null,
      make:  body.make  !== undefined ? String(body.make).trim().slice(0, 64)  : null,
      model: body.model !== undefined ? String(body.model).trim().slice(0, 64) : null,
      year:  body.year  !== undefined ? String(body.year).trim().slice(0, 8)   : null,
      color: body.color !== undefined ? String(body.color).trim().slice(0, 32) : null,
      photoExteriorUrl,
      photoInteriorUrl,
      photoPlateUrl,
      ownershipProofUrl,
      insuranceCertUrl,
      ownership:          ownerBlock.ownership as any,
      ownerName:          ownerBlock.ownerName,
      ownerPhone:         ownerBlock.ownerPhone,
      ownerRelationship:  ownerBlock.ownerRelationship as any,
      ownerConsentUrl:    ownerBlock.ownerConsentUrl,
      ownerIdUrl:         ownerBlock.ownerIdUrl,
      ownerSignatureName: ownerBlock.ownerSignatureName,
      ownerConsentAt:     ownerBlock.ownerConsentAt,
      reason: body.reason ? String(body.reason).trim().slice(0, 500) : null,
    }));

    // Review ticket, best-effort: the request stands even if ticket
    // creation hiccups, since an admin can act from the record either way.
    try {
      if (driver.user) {
        const ticketsRepo = this.repo.manager.getRepository(SupportTicket);
        const ticket = await ticketsRepo.save(ticketsRepo.create({
          user:             driver.user,
          userAccountType:  'driver',
          topic:            TicketTopic.ACCOUNT,
          status:           TicketStatus.OPEN,
          subject:          'Vehicle change request',
          linkedDeliveryId: null,
          assignedAgentId:  null,
          lastMessageAt:    new Date(),
        }));
        const summary = [
          `type: ${vehicleType}`,
          plate ? `plate: ${plate}` : null,
          [saved.make, saved.model, saved.year].filter(Boolean).join(' ') || null,
          ownerBlock.ownership === 'third_party'
            ? `NOT the rider's vehicle: owner ${ownerBlock.ownerName} (${ownerBlock.ownerRelationship}), ${ownerBlock.ownerPhone}, signed authorisation attached`
            : 'rider declares they own it',
        ].filter(Boolean).join(' | ');
        await this.repo.manager.query(
          `INSERT INTO chat_messages (body, "imageUrl", "systemType", "ticketId")
           VALUES ($1, NULL, 'vehicle_change_request', $2)`,
          [
            `Driver requested a vehicle change (${summary}). Open the driver record to see the photos and documents, ` +
            `then approve or reject. The driver keeps working with the current vehicle until approved.` +
            (ownerBlock.ownership === 'third_party'
              ? ` Call the owner on ${ownerBlock.ownerPhone} and confirm they authorised this before approving.`
              : ''),
            ticket.id,
          ],
        );
        await this.vehicleChangesRepo.update(saved.id, { ticketId: ticket.id });
        saved.ticketId = ticket.id;
      }
    } catch (e: any) {
      this.logger.warn(`vehicle-change ticket creation failed: ${e?.message ?? e}`);
    }

    return {
      pending: true,
      message:
        'Vehicle change submitted for review. You keep working with your current vehicle until our team approves it.',
      change: saved,
    };
  }

  /** Rider pulls their own request back before a decision. */
  async withdrawVehicleChange(userId: string) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');
    const pending = await this.vehicleChangesRepo.findOne({
      where: { driverId: driver.id, status: VehicleChangeStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
    if (!pending) throw new NotFoundException('No vehicle change under review.');

    await this.vehicleChangesRepo.update(pending.id, {
      status:    VehicleChangeStatus.WITHDRAWN,
      decidedAt: new Date(),
    });
    if (pending.ticketId) {
      try {
        await this.repo.manager.getRepository(SupportTicket).update(pending.ticketId, {
          status:        TicketStatus.RESOLVED,
          resolvedAt:    new Date(),
          lastMessageAt: new Date(),
        });
      } catch { /* the withdrawal stands even if the ticket will not close */ }
    }
    return { withdrawn: true };
  }

  /**
   * Legacy shim. Older driver builds PATCH /drivers/me/vehicle with a
   * partial body and no ownership block. Routing them through the same
   * validator means an old build now gets a clear "still needed: ..."
   * message instead of silently registering an unverified vehicle.
   */
  async updateVehicle(userId: string, body: any) {
    return this.submitVehicleChange(userId, body ?? {});
  }

  /**
   * Admin resolution of a pending vehicle change (called from
   * AdminService, signature unchanged so no admin-side edit is needed).
   *
   * Approve copies the requested vehicle AND its proofs onto the live
   * driver row, which is the only moment vehicleType is allowed to move.
   * Reject leaves the live vehicle exactly as it was.
   */
  async resolveVehicleChange(
    targetUserId: string,
    approve: boolean,
    opts?: { adminId?: string; note?: string },
  ) {
    const driver = await this.findByUserId(targetUserId);
    if (!driver) throw new NotFoundException('Driver profile not found.');

    const pending = await this.vehicleChangesRepo.findOne({
      where: { driverId: driver.id, status: VehicleChangeStatus.PENDING },
      order: { createdAt: 'DESC' },
    });

    // In-flight requests from the pre-2026-08-25 build sat in
    // vehicleDetails.pendingChange. Drain those too rather than stranding
    // whoever submitted one the day before this shipped.
    const legacy = (driver.vehicleDetails as any)?.pendingChange ?? null;
    if (!pending && !legacy) {
      throw new NotFoundException('No pending vehicle change for this driver.');
    }

    if (pending) {
      const details = (driver.vehicleDetails ?? {}) as any;
      const patch: Partial<Driver> = {};

      if (approve) {
        patch.vehicleType  = pending.vehicleType as VehicleType;
        if (pending.vehiclePlate) patch.vehiclePlate = pending.vehiclePlate;
        patch.vehicleDetails = {
          ...details,
          make:  pending.make  ?? details.make,
          model: pending.model ?? details.model,
          year:  pending.year  ?? details.year,
          color: pending.color ?? details.color,
        } as any;
        // The exterior shot is what the sender and passenger see on the
        // trust card, so it has to follow the vehicle it belongs to.
        if (pending.photoExteriorUrl)  patch.vehiclePhotoUrl   = pending.photoExteriorUrl;
        if (pending.ownershipProofUrl) patch.ownershipProofUrl = pending.ownershipProofUrl;
        if (pending.insuranceCertUrl)  patch.insuranceCertUrl  = pending.insuranceCertUrl;

        patch.vehicleOwnership          = pending.ownership as any;
        patch.vehicleOwnerName          = pending.ownerName;
        patch.vehicleOwnerPhone         = pending.ownerPhone;
        patch.vehicleOwnerRelationship  = pending.ownerRelationship as any;
        patch.vehicleOwnerConsentUrl    = pending.ownerConsentUrl;
        patch.vehicleOwnerIdUrl         = pending.ownerIdUrl;
        patch.vehicleOwnerSignatureName = pending.ownerSignatureName;
        patch.vehicleOwnerConsentAt     = pending.ownerConsentAt ?? new Date();
      }

      // Whether approved or not, the old jsonb blob goes: it is the thing
      // that was leaking photo URLs into customer payloads.
      const vd = { ...(patch.vehicleDetails ?? details) } as any;
      delete vd.pendingChange;
      delete vd.photoExteriorUrl;
      delete vd.photoInteriorUrl;
      delete vd.photoPlateUrl;
      patch.vehicleDetails = vd;

      await this.repo.update(driver.id, patch);
      await this.vehicleChangesRepo.update(pending.id, {
        status:           approve ? VehicleChangeStatus.APPROVED : VehicleChangeStatus.REJECTED,
        decidedAt:        new Date(),
        decidedByAdminId: opts?.adminId ?? null,
        decisionNote:     opts?.note ? String(opts.note).slice(0, 500) : null,
      });

      await this.closeVehicleChangeTicket(pending.ticketId, approve);
      return { approved: approve };
    }

    // ── Legacy jsonb path ────────────────────────────────────────────────
    const details = (driver.vehicleDetails ?? {}) as any;
    const { requestedAt: _r, ticketId, ...changes } = legacy;
    const patch: Partial<Driver> = {};
    if (approve) {
      if (changes.vehicleType)  patch.vehicleType  = changes.vehicleType;
      if (changes.vehiclePlate) patch.vehiclePlate = changes.vehiclePlate;
      if (changes.photoExteriorUrl) patch.vehiclePhotoUrl = changes.photoExteriorUrl;
    }
    const vd = { ...details };
    if (approve) {
      if (changes.make  !== undefined) vd.make  = changes.make;
      if (changes.model !== undefined) vd.model = changes.model;
      if (changes.year  !== undefined) vd.year  = changes.year;
      if (changes.color !== undefined) vd.color = changes.color;
    }
    delete vd.pendingChange;
    delete vd.photoExteriorUrl;
    delete vd.photoInteriorUrl;
    delete vd.photoPlateUrl;
    patch.vehicleDetails = vd;

    await this.repo.update(driver.id, patch);
    await this.closeVehicleChangeTicket(ticketId ?? null, approve);
    return { approved: approve };
  }

  private async closeVehicleChangeTicket(ticketId: string | null, approve: boolean) {
    if (!ticketId) return;
    try {
      await this.repo.manager.query(
        `INSERT INTO chat_messages (body, "imageUrl", "systemType", "ticketId")
         VALUES ($1, NULL, 'vehicle_change_resolved', $2)`,
        [
          approve
            ? 'Your vehicle change was approved. Your profile now shows the new vehicle, and jobs will match it from now on.'
            : 'Your vehicle change was rejected. Your registered vehicle is unchanged. Reply here if you did not expect this.',
          ticketId,
        ],
      );
      await this.repo.manager.getRepository(SupportTicket).update(ticketId, {
        status:        TicketStatus.RESOLVED,
        resolvedAt:    new Date(),
        lastMessageAt: new Date(),
      });
    } catch (e: any) {
      this.logger.warn(`vehicle-change ticket close failed: ${e?.message ?? e}`);
    }
  }

  // Spec V8 §2.1 - record uploaded KYC document URL against the right column.
  async updateKycDoc(userId: string, docId: string, url: string) {
    const field = KYC_DOC_FIELD_MAP[docId];
    if (!field) throw new BadRequestException(`Unknown KYC document id: ${docId}`);
    if (!url || typeof url !== 'string') throw new BadRequestException('Document URL required.');

    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');

    await this.repo.update(driver.id, { [field]: url } as Partial<Driver>);

    /**
     * Queue it for review.
     *
     * The URL column above is still written because plenty of code reads
     * it, but approval has to attach to a specific FILE rather than to the
     * slot it occupies. Re-uploading always returns the document to
     * 'submitted' and bumps the version, so an approved driver swapping in
     * a new licence does not inherit the old approval.
     */
    const existing = await this.docsRepo.findOne({ where: { driverId: driver.id, docId } });
    if (existing) {
      await this.docsRepo.update(existing.id, {
        url,
        status:          'submitted',
        rejectionReason: null,
        reviewedById:    null,
        reviewedAt:      null,
        version:         existing.version + 1,
      });
    } else {
      await this.docsRepo.save(this.docsRepo.create({ driverId: driver.id, docId, url }));
    }

    return { docId, saved: true, status: 'submitted' };
  }

  /** Every document this driver has uploaded, with its real review state. */
  async myKycDocuments(userId: string) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');
    const docs = await this.docsRepo.find({
      where: { driverId: driver.id },
      order: { updatedAt: 'DESC' },
    });
    return {
      documents: docs.map(d => ({
        docId:           d.docId,
        url:             d.url,
        status:          d.status,
        rejectionReason: d.rejectionReason,
        reviewedAt:      d.reviewedAt,
        version:         d.version,
      })),
    };
  }

  // ── Admin review queue ──────────────────────────────────────────────────

  async listDriverDocuments(status?: DriverDocStatus, page = 1) {
    const take = 50;
    const [rows, total] = await this.docsRepo.findAndCount({
      where: status ? { status } : {},
      relations: ['driver', 'driver.user'],
      order: { createdAt: 'ASC' },   // oldest waiting first
      take,
      skip: (page - 1) * take,
    });
    return {
      items: rows.map(d => ({
        id:              d.id,
        docId:           d.docId,
        url:             d.url,
        status:          d.status,
        rejectionReason: d.rejectionReason,
        version:         d.version,
        createdAt:       d.createdAt,
        reviewedAt:      d.reviewedAt,
        driverId:        d.driverId,
        driverName:      d.driver?.user?.name ?? null,
        driverEmail:     d.driver?.user?.email ?? null,
        driverStatus:    d.driver?.status ?? null,
      })),
      total, page, take,
    };
  }

  async reviewDriverDocument(
    id: string,
    adminUserId: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ) {
    const doc = await this.docsRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found.');
    if (decision === 'rejected' && !reason?.trim()) {
      throw new BadRequestException('Tell the driver why, or they will upload the same photo again.');
    }
    await this.docsRepo.update(id, {
      status:          decision,
      rejectionReason: decision === 'rejected' ? reason!.trim() : null,
      reviewedById:    adminUserId,
      reviewedAt:      new Date(),
    });
    return { id, status: decision };
  }

  // Spec V8 §2.10 / §2.18 - derive demand zones from recent pickup density
  // around the driver's current position. Buckets ~1km grid cells over the
  // last 7 days of completed/active orders. Intensity = order count.
  async getDemandZones(userId: string) {
    const driver = await this.findByUserId(userId);
    if (!driver?.lastLat || !driver?.lastLng) {
      return { zones: [] };
    }

    const lat = Number(driver.lastLat);
    const lng = Number(driver.lastLng);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Round to ~1km grid (0.01 deg ≈ 1.1km in Nigeria latitudes)
    /**
     * Every identifier below is DOUBLE QUOTED on purpose.
     *
     * The columns are `@Column()` with no explicit name, so TypeORM created
     * them as "pickupLat" / "pickupLng", camelCase. TypeORM rewrites a
     * plain `d.pickupLat` property reference, but NOT one buried in a raw
     * expression like ROUND() or radians(). Postgres then lowercases the
     * unquoted identifier to pickuplat, finds no such column, and the whole
     * endpoint 500s.
     *
     * Which is what it had been doing: Demand Hotspots never worked, on the
     * home card or its own screen. Found 2026-08-31 when the founder asked
     * whether it did. Every other raw query in this codebase quotes these.
     */
    const rows = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select('ROUND(d."pickupLat"::numeric, 2)', 'lat')
      .addSelect('ROUND(d."pickupLng"::numeric, 2)', 'lng')
      .addSelect('COUNT(d.id)', 'count')
      .where('d.createdAt >= :since', { since })
      .andWhere('d.status IN (:...statuses)', {
        statuses: [DeliveryStatus.DELIVERED, DeliveryStatus.IN_TRANSIT, DeliveryStatus.PICKED_UP, DeliveryStatus.ASSIGNED],
      })
      .andWhere(
        '(6371 * acos(LEAST(1, GREATEST(-1, ' +
          'cos(radians(:lat)) * cos(radians(d."pickupLat")) * ' +
          'cos(radians(d."pickupLng") - radians(:lng)) + ' +
          'sin(radians(:lat)) * sin(radians(d."pickupLat"))' +
        ')))) < :radius',
        { lat, lng, radius: 25 },
      )
      .groupBy('ROUND(d."pickupLat"::numeric, 2)')
      .addGroupBy('ROUND(d."pickupLng"::numeric, 2)')
      .orderBy('COUNT(d.id)', 'DESC')
      .limit(20)
      .getRawMany();

    if (!rows.length) return { zones: [] };

    const maxCount = Math.max(...rows.map(r => Number(r.count)));
    return {
      zones: rows.map(r => {
        const count = Number(r.count);
        const intensity = count / maxCount; // 0.0 - 1.0
        return {
          latitude:  Number(r.lat),
          longitude: Number(r.lng),
          radiusM:   400 + intensity * 600,        // 400-1000m
          intensity,
          orderCount: count,
        };
      }),
    };
  }

  // ── Driver Premium subscription (Spec V8 §2.13 / D35) ─────────────────────
  //
  // PAUSED PLATFORM-WIDE (founder decision 2026-08-10): selling queue
  // priority felt unfair to drivers and the "Verified Pro" badge read
  // as paid verification. All entry points are hidden, activation is
  // blocked, billing is stopped, and the matching boost is off (via
  // isPremiumActive returning false). The code stays so a future
  // commission-swap version can revive it deliberately.
  private static readonly PREMIUM_PAUSED = true;

  async getSubscription(userId: string) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');
    const sub = await this.subsRepo.findOne({ where: { driverId: driver.id } });
    const feeNgn = await this.feesService.getValueOr('driver_premium_subscription', 5000);
    return {
      subscription:    sub,
      weeklyPriceKobo: Math.round(feeNgn * 100),
      weeklyPriceNgn:  feeNgn,
    };
  }

  async activateSubscription(userId: string) {
    if (DriversService.PREMIUM_PAUSED) {
      throw new BadRequestException('SEIRS Premium is not available right now.');
    }
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');

    let sub = await this.subsRepo.findOne({ where: { driverId: driver.id } });
    const now = new Date();
    const nextInvoice = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (sub) {
      sub.status              = DriverSubscriptionStatus.ACTIVE;
      sub.startedAt           = sub.startedAt ?? now;
      sub.endedAt             = null;
      sub.nextInvoiceAt       = sub.nextInvoiceAt > now ? sub.nextInvoiceAt : nextInvoice;
      sub.consecutiveFailures = 0;
      sub.lastFailureReason   = null;
    } else {
      sub = this.subsRepo.create({
        driverId:        driver.id,
        driver,
        status:          DriverSubscriptionStatus.ACTIVE,
        startedAt:       now,
        nextInvoiceAt:   nextInvoice,
      });
    }
    return this.subsRepo.save(sub);
  }

  async pauseSubscription(userId: string) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');
    const sub = await this.subsRepo.findOne({ where: { driverId: driver.id } });
    if (!sub) throw new NotFoundException('No subscription to pause.');
    sub.status  = DriverSubscriptionStatus.PAUSED;
    sub.endedAt = new Date();
    return this.subsRepo.save(sub);
  }

  async cancelSubscription(userId: string) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');
    const sub = await this.subsRepo.findOne({ where: { driverId: driver.id } });
    if (!sub) throw new NotFoundException('No subscription to cancel.');
    sub.status  = DriverSubscriptionStatus.CANCELLED;
    sub.endedAt = new Date();
    return this.subsRepo.save(sub);
  }

  // True when this driver currently has an ACTIVE subscription. Used by
  // matching to apply the priority boost. PAST_DUE drivers keep
  // benefits during the retry window so a transient wallet shortfall
  // doesn't drop them out of priority mid-day.
  async isPremiumActive(driverId: string): Promise<boolean> {
    if (DriversService.PREMIUM_PAUSED) return false;
    const sub = await this.subsRepo.findOne({ where: { driverId } });
    if (!sub) return false;
    return sub.status === DriverSubscriptionStatus.ACTIVE ||
           sub.status === DriverSubscriptionStatus.PAST_DUE;
  }

  // Hourly so a sub that comes due at 03:14 fires at 04:00 instead of
  // waiting for midnight. Idempotent - a row is only charged when its
  // nextInvoiceAt is in the past.
  @Cron(CronExpression.EVERY_HOUR)
  async invoiceDueSubscriptions() {
    if (DriversService.PREMIUM_PAUSED) return;
    const due = await this.subsRepo.find({
      where: {
        status:        In([DriverSubscriptionStatus.ACTIVE, DriverSubscriptionStatus.PAST_DUE]),
        nextInvoiceAt: LessThan(new Date()),
      },
      take: 100,
    });
    if (due.length === 0) return;

    const feeNgnInvoice = await this.feesService.getValueOr('driver_premium_subscription', 5000);
    const feeKobo       = Math.round(feeNgnInvoice * 100);
    this.logger.log(`[driver-premium] Invoicing ${due.length} subscriptions @ ${feeKobo} kobo`);

    for (const sub of due) {
      try {
        // sub.driverId is the DRIVER row id; wallets hang off the USER.
        // The old lookup used driverId directly, which never matched, so
        // every invoice failed "insufficient balance" and Premium never
        // collected a single charge (audit 2026-08-10).
        const subDriver = await this.repo.findOne({ where: { id: sub.driverId }, relations: ['user'] });
        const walletUserId = subDriver?.user?.id;
        const wallet = walletUserId
          ? await this.walletsRepo.findOne({ where: { user: { id: walletUserId } } })
          : null;
        if (!wallet || wallet.balanceKobo < feeKobo) {
          sub.consecutiveFailures += 1;
          sub.lastFailureReason   = 'Insufficient wallet balance';
          if (sub.consecutiveFailures >= 3) {
            sub.status  = DriverSubscriptionStatus.PAUSED;
            sub.endedAt = new Date();
          } else {
            sub.status = DriverSubscriptionStatus.PAST_DUE;
          }
          // Retry tomorrow rather than next week so we recover fast
          // when the driver tops up.
          sub.nextInvoiceAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await this.subsRepo.save(sub);
          continue;
        }
        await this.walletsRepo.update(wallet.id, { balanceKobo: wallet.balanceKobo - feeKobo });
        sub.lastInvoicedFeeKobo = feeKobo;
        sub.lastInvoicedAt      = new Date();
        sub.invoiceCount       += 1;
        sub.consecutiveFailures = 0;
        sub.lastFailureReason   = null;
        sub.status              = DriverSubscriptionStatus.ACTIVE;
        sub.nextInvoiceAt       = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await this.subsRepo.save(sub);
      } catch (e) {
        this.logger.error(`[driver-premium] Charge failed for ${sub.id}: ${(e as Error).message}`);
      }
    }
  }
}
