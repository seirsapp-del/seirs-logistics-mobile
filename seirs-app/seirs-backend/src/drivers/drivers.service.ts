import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { In, LessThan, Repository } from 'typeorm';
import { Driver, DriverStatus } from './driver.entity';
import { DriverTrip, DriverTripStatus } from './driver-trip.entity';
import { DriverStatusBroadcast, DriverStatusBroadcastType } from './driver-status-broadcast.entity';
import { DriverSubscription, DriverSubscriptionStatus } from './driver-subscription.entity';
import { DriverLevelChange, LevelChangeStatus } from './driver-level-change.entity';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { Wallet } from '../payments/wallet.entity';
import { FraudService } from '../fraud/fraud.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { FeesService } from '../fees/fees.service';
import { SupportTicket, TicketStatus, TicketTopic } from '../support/support-ticket.entity';

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
    @InjectRepository(DriverStatusBroadcast)  private broadcastsRepo: Repository<DriverStatusBroadcast>,
    @InjectRepository(DriverSubscription)     private subsRepo:       Repository<DriverSubscription>,
    @InjectRepository(DriverLevelChange)      private levelChangesRepo: Repository<DriverLevelChange>,
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
   * row (default 2): a corridor is a trip, not a shift.
   */
  async setCorridor(userId: string, params: { destLat: number; destLng: number; label?: string; hours?: number }) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found');
    const { destLat, destLng } = params;
    if (!Number.isFinite(destLat) || !Number.isFinite(destLng) || Math.abs(destLat) > 90 || Math.abs(destLng) > 180) {
      throw new BadRequestException('A real destination is required.');
    }
    const maxHours = await this.feesService.getValueOr('corridor_max_hours', 2);
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

    const trip = this.tripsRepo.create({
      driver,
      fromCity:        from,
      toCity:          to,
      departAt:        depart,
      spareCapacityKg: capacity,
      status:          DriverTripStatus.ACTIVE,
    });
    return this.tripsRepo.save(trip);
  }

  listMyInterstateTrips(userId: string) {
    return this.tripsRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.driver', 'd')
      .leftJoinAndSelect('d.user', 'u')
      .where('u.id = :userId', { userId })
      .orderBy('t.departAt', 'DESC')
      .limit(50)
      .getMany();
  }

  // Admin board - Spec V8 §3.12. Returns trips with driver + user joined
  // for the UI to display "<name> | Lagos → Ibadan | <kg> free".
  listAllInterstateTrips(opts: { status?: DriverTripStatus } = {}) {
    const qb = this.tripsRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.driver', 'd')
      .leftJoinAndSelect('d.user', 'u')
      .orderBy('t.departAt', 'ASC')
      .limit(100);
    if (opts.status) qb.where('t.status = :status', { status: opts.status });
    return qb.getMany();
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
    trip.status = DriverTripStatus.CANCELLED;
    return this.tripsRepo.save(trip);
  }

  // ── Spec V8 §2.13 - Auto check-in cron ────────────────────────────────────
  // Drivers who are online but haven't pinged GPS in 5+ min get a silent
  // "are you OK?" push. Helps detect crashed phones, dead batteries,
  // signal black spots. Runs every 5 minutes; once a driver pings back
  // their locationUpdatedAt advances and they're cleared.
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
    for (const d of stale) {
      if (!d.user?.id || !this.notificationsService) continue;
      this.notificationsService.create(
        d.user.id,
        'Are you OK?',
        'We haven\'t seen your location in a few minutes. Open SEIRS so we know you\'re safe.',
        'general',
      ).catch(() => {});
      pinged++;
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

    // Bind to an active delivery if the driver is mid-trip and one was
    // supplied - otherwise the broadcast is scoped to the admin room only.
    let delivery: Delivery | null = null;
    if (body.deliveryId) {
      delivery = await this.deliveriesRepo.findOne({
        where: { id: body.deliveryId, driver: { id: driver.id } },
      });
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
          .catch(() => {});
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

    // Non-zero wallet balance
    const balance = Number(driver.walletBalance ?? 0);
    if (balance > 0) {
      blockers.push({
        type:   'wallet_balance',
        count:  Math.round(balance),
        action: `Withdraw your ₦${Math.round(balance).toLocaleString()} wallet balance before deleting.`,
      });
    }

    return {
      isDriver: true,
      ready:    blockers.length === 0,
      blockers,
      driverId: driver.id,
    };
  }

  /**
   * Vehicle change flow (founder policy 2026-08-10, mirrors the bank
   * change flow): a driver ALWAYS has a vehicle (set at registration)
   * and cannot swap it silently. Every change (including new photos)
   * is parked as pendingChange inside vehicleDetails and a support
   * ticket is opened for compliance review. The driver keeps working
   * with the CURRENT vehicle until an admin approves.
   */
  async updateVehicle(
    userId: string,
    body: {
      vehicleType?:  string;
      vehiclePlate?: string;
      make?:         string;
      model?:        string;
      year?:         string;
      color?:        string;
      photoExteriorUrl?: string;
      photoInteriorUrl?: string;
      photoPlateUrl?:    string;
    },
  ) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');

    const safeUrl = (u?: string) =>
      typeof u === 'string' && /^https?:\/\//.test(u) ? u.slice(0, 500) : undefined;

    const pending = {
      ...(body.vehicleType  ? { vehicleType:  String(body.vehicleType).slice(0, 24) }  : {}),
      ...(body.vehiclePlate ? { vehiclePlate: String(body.vehiclePlate).slice(0, 16) } : {}),
      ...(body.make  !== undefined ? { make:  String(body.make).slice(0,  64) } : {}),
      ...(body.model !== undefined ? { model: String(body.model).slice(0, 64) } : {}),
      ...(body.year  !== undefined ? { year:  String(body.year).slice(0,  8)  } : {}),
      ...(body.color !== undefined ? { color: String(body.color).slice(0, 32) } : {}),
      ...(safeUrl(body.photoExteriorUrl) ? { photoExteriorUrl: safeUrl(body.photoExteriorUrl) } : {}),
      ...(safeUrl(body.photoInteriorUrl) ? { photoInteriorUrl: safeUrl(body.photoInteriorUrl) } : {}),
      ...(safeUrl(body.photoPlateUrl)    ? { photoPlateUrl:    safeUrl(body.photoPlateUrl)    } : {}),
    };
    if (Object.keys(pending).length === 0) {
      throw new BadRequestException('Nothing to change.');
    }

    // Review ticket (best-effort; the pending change stands even if
    // ticket creation hiccups: admin can still act from the record).
    let ticketId: string | null =
      (driver.vehicleDetails as any)?.pendingChange?.ticketId ?? null;
    try {
      if (!ticketId && driver.user) {
        const ticketsRepo = this.repo.manager.getRepository(SupportTicket);
        const ticket = await ticketsRepo.save(ticketsRepo.create({
          user:            driver.user,
          userAccountType: 'driver',
          topic:           TicketTopic.ACCOUNT,
          status:          TicketStatus.OPEN,
          subject:         'Vehicle change request',
          linkedDeliveryId: null,
          assignedAgentId:  null,
          lastMessageAt:    new Date(),
        }));
        ticketId = ticket.id;
        const summary = [
          pending.vehicleType  ? `type: ${pending.vehicleType}`   : null,
          pending.vehiclePlate ? `plate: ${pending.vehiclePlate}` : null,
          pending.make || pending.model ? `vehicle: ${[pending.make, pending.model, pending.year].filter(Boolean).join(' ')}` : null,
          (pending as any).photoExteriorUrl || (pending as any).photoInteriorUrl || (pending as any).photoPlateUrl
            ? 'photos attached (exterior/interior/plate)' : null,
        ].filter(Boolean).join(' · ');
        await this.repo.manager.query(
          `INSERT INTO chat_messages (body, "imageUrl", "systemType", "ticketId")
           VALUES ($1, NULL, 'vehicle_change_request', $2)`,
          [
            `Driver requested a vehicle change (${summary}). Review the details and photos, then approve or reject. ` +
            `The driver keeps working with the current vehicle until approved.`,
            ticketId,
          ],
        );
      }
    } catch (e: any) {
      this.logger.warn(`vehicle-change ticket creation failed: ${e?.message ?? e}`);
    }

    await this.repo.update(driver.id, {
      vehicleDetails: {
        ...(driver.vehicleDetails ?? {}),
        pendingChange: { ...pending, requestedAt: new Date().toISOString(), ticketId },
      },
    } as any);

    return {
      pending: true,
      message: 'Vehicle change submitted for review. You keep driving with your current vehicle until it is approved.',
      driver:  await this.findByUserId(userId),
    };
  }

  /**
   * Admin resolution of a pending vehicle change (called from
   * AdminService). Approve applies the pending fields; reject discards
   * them. Both clear the pending state and close the review ticket.
   */
  async resolveVehicleChange(targetUserId: string, approve: boolean) {
    const driver = await this.findByUserId(targetUserId);
    if (!driver) throw new NotFoundException('Driver profile not found.');
    const details = (driver.vehicleDetails ?? {}) as any;
    const pending = details.pendingChange;
    if (!pending) throw new NotFoundException('No pending vehicle change for this driver.');

    const { requestedAt: _r, ticketId, ...changes } = pending;
    const patch: Partial<Driver> = {};

    if (approve) {
      if (changes.vehicleType)  patch.vehicleType  = changes.vehicleType;
      if (changes.vehiclePlate) patch.vehiclePlate = changes.vehiclePlate;
      const { vehicleType: _t, vehiclePlate: _p, ...detailFields } = changes;
      patch.vehicleDetails = { ...details, ...detailFields, pendingChange: undefined } as any;
    } else {
      patch.vehicleDetails = { ...details, pendingChange: undefined } as any;
    }
    // Strip the undefined key so jsonb stays clean.
    if (patch.vehicleDetails) {
      const vd = { ...(patch.vehicleDetails as any) };
      delete vd.pendingChange;
      patch.vehicleDetails = vd;
    }

    await this.repo.update(driver.id, patch);

    if (ticketId) {
      try {
        await this.repo.manager.query(
          `INSERT INTO chat_messages (body, "imageUrl", "systemType", "ticketId")
           VALUES ($1, NULL, 'vehicle_change_resolved', $2)`,
          [
            approve
              ? 'Your vehicle change was approved. Your profile now shows the new vehicle.'
              : 'Your vehicle change was rejected. Your registered vehicle is unchanged. Contact support if you did not expect this.',
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

    return { approved: approve };
  }

  // Spec V8 §2.1 - record uploaded KYC document URL against the right column.
  async updateKycDoc(userId: string, docId: string, url: string) {
    const field = KYC_DOC_FIELD_MAP[docId];
    if (!field) throw new BadRequestException(`Unknown KYC document id: ${docId}`);
    if (!url || typeof url !== 'string') throw new BadRequestException('Document URL required.');

    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');

    await this.repo.update(driver.id, { [field]: url } as Partial<Driver>);
    return { docId, saved: true };
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
    const rows = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select('ROUND(d.pickupLat::numeric, 2)', 'lat')
      .addSelect('ROUND(d.pickupLng::numeric, 2)', 'lng')
      .addSelect('COUNT(d.id)', 'count')
      .where('d.createdAt >= :since', { since })
      .andWhere('d.status IN (:...statuses)', {
        statuses: [DeliveryStatus.DELIVERED, DeliveryStatus.IN_TRANSIT, DeliveryStatus.PICKED_UP, DeliveryStatus.ASSIGNED],
      })
      .andWhere(
        '(6371 * acos(LEAST(1, GREATEST(-1, ' +
          'cos(radians(:lat)) * cos(radians(d.pickupLat)) * ' +
          'cos(radians(d.pickupLng) - radians(:lng)) + ' +
          'sin(radians(:lat)) * sin(radians(d.pickupLat))' +
        ')))) < :radius',
        { lat, lng, radius: 25 },
      )
      .groupBy('ROUND(d.pickupLat::numeric, 2)')
      .addGroupBy('ROUND(d.pickupLng::numeric, 2)')
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
