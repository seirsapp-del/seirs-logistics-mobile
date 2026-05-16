import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { Repository, MoreThanOrEqual, LessThanOrEqual, DataSource, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../users/user.entity';
import { BusinessAccount, BusinessTeamMember } from './business-account.entity';
import { PartnerStore } from './partner-store.entity';
import { BusinessPackage, PackageStatus } from './business-package.entity';
import { BusinessWalletTx } from './business-wallet-tx.entity';
import { PartnerPayout } from './partner-payout.entity';
import { RecurringTemplate, RecurringCadence } from './recurring-template.entity';
import { MailService } from '../mail/mail.service';
import { PricingService } from '../pricing/pricing.service';
import { RoutingService } from '../routing/routing.service';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { DeliveryStop, DeliveryStopStatus } from '../deliveries/delivery-stop.entity';

const PER_PACKAGE_RATE = 500; // ₦500 per package stored

const clamp = (n: number, min: number, max: number) =>
  Math.min(Math.max(n, min), max);

/**
 * Multi-stop booking payload from the business app. Shape:
 *   - pickup with required coords (geocoded client-side)
 *   - stops[] with required coords + recipient + per-stop notes
 *   - vehicle + category + total weight in kg
 *   - optimizedWaypointOrder + routeWasAutoOptimized if Directions
 *     reordered the stops at booking time
 *   - estimatedDriveMinutes from Google Directions
 */
export interface CreateMultiStopDeliveryDto {
  pickupAddress:    string;
  pickupLat:        number;
  pickupLng:        number;
  stops: Array<{
    address:        string;
    lat:            number;
    lng:            number;
    recipientName:  string;
    recipientPhone: string;
    notes?:         string;
    sequenceOrder?: number;
  }>;
  vehicleType:      string;
  categoryCode:     string;
  weightKg:         number;
  packageDescription?: string;
  km:               number;
  estimatedDriveMinutes: number;
  scheduledAt?:     string;   // ISO datetime
  optimizedWaypointOrder?: number[];
  routeWasAutoOptimized?: boolean;
  isInterState?:    boolean;
  isLongDistance?:  boolean;
  isRecurring?:     boolean;
}

@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name);

  constructor(
    @InjectRepository(User)                private usersRepo:       Repository<User>,
    @InjectRepository(BusinessAccount)     private bizRepo:         Repository<BusinessAccount>,
    @InjectRepository(BusinessTeamMember)  private teamRepo:        Repository<BusinessTeamMember>,
    @InjectRepository(PartnerStore)        private storeRepo:       Repository<PartnerStore>,
    @InjectRepository(BusinessPackage)     private packagesRepo:    Repository<BusinessPackage>,
    @InjectRepository(BusinessWalletTx)    private walletTxRepo:    Repository<BusinessWalletTx>,
    @InjectRepository(PartnerPayout)       private payoutsRepo:     Repository<PartnerPayout>,
    @InjectRepository(Delivery)            private deliveriesRepo:  Repository<Delivery>,
    @InjectRepository(DeliveryStop)        private stopsRepo:       Repository<DeliveryStop>,
    @InjectRepository(RecurringTemplate)   private recurringRepo:   Repository<RecurringTemplate>,
    private mailService: MailService,
    private pricing: PricingService,
    private routing: RoutingService,
    private dataSource: DataSource,
  ) {}

  // ── Spec V8 §4.2 — Recurring Delivery Templates ───────────────────────────

  async createRecurringTemplate(userId: string, body: {
    name: string;
    cadence: RecurringCadence;
    dayOfWeek?: number;
    dayOfMonth?: number;
    hour?: number;
    minute?: number;
    payload: any;
  }) {
    if (!body.name?.trim()) throw new BadRequestException('Template name required.');
    if (!Object.values(RecurringCadence).includes(body.cadence)) {
      throw new BadRequestException('Invalid cadence.');
    }
    if (!body.payload?.pickupAddress || !Array.isArray(body.payload?.stops) || !body.payload.stops.length) {
      throw new BadRequestException('Payload must include a pickup and at least one stop.');
    }
    if (body.cadence === RecurringCadence.WEEKLY && (body.dayOfWeek == null || body.dayOfWeek < 0 || body.dayOfWeek > 6)) {
      throw new BadRequestException('Weekly cadence needs dayOfWeek (0=Sun .. 6=Sat).');
    }
    if (body.cadence === RecurringCadence.MONTHLY) {
      const dom = body.dayOfMonth ?? 1;
      if (dom < 1 || dom > 28) {
        throw new BadRequestException('Monthly cadence needs dayOfMonth 1-28 (avoids 30/31 ambiguity).');
      }
    }

    const hour   = clamp(body.hour   ?? 9, 0, 23);
    const minute = clamp(body.minute ?? 0, 0, 59);

    const template = this.recurringRepo.create({
      owner:      { id: userId } as User,
      name:       body.name.trim(),
      cadence:    body.cadence,
      dayOfWeek:  body.cadence === RecurringCadence.WEEKLY  ? body.dayOfWeek!   : null,
      dayOfMonth: body.cadence === RecurringCadence.MONTHLY ? (body.dayOfMonth ?? 1) : null,
      hour,
      minute,
      payload:    body.payload,
      isActive:   true,
      nextRunAt:  this.computeNextRunAt({
        cadence: body.cadence, dayOfWeek: body.dayOfWeek, dayOfMonth: body.dayOfMonth, hour, minute,
      }, new Date()),
    });
    return this.recurringRepo.save(template);
  }

  listRecurringTemplates(userId: string) {
    return this.recurringRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.owner', 'u')
      .where('u.id = :userId', { userId })
      .orderBy('t.createdAt', 'DESC')
      .getMany();
  }

  async toggleRecurringTemplate(userId: string, id: string, isActive: boolean) {
    const t = await this.getOwnedTemplate(userId, id);
    t.isActive = isActive;
    if (isActive) {
      t.nextRunAt = this.computeNextRunAt(t, new Date());
    }
    return this.recurringRepo.save(t);
  }

  async deleteRecurringTemplate(userId: string, id: string) {
    const t = await this.getOwnedTemplate(userId, id);
    await this.recurringRepo.remove(t);
    return { ok: true };
  }

  private async getOwnedTemplate(userId: string, id: string) {
    const t = await this.recurringRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.owner', 'u')
      .where('t.id = :id', { id })
      .getOne();
    if (!t) throw new NotFoundException('Template not found.');
    if (t.owner?.id !== userId) throw new ForbiddenException('Not your template.');
    return t;
  }

  // Compute the next firing instant from a cadence definition. Daily =
  // tomorrow at hour:minute if hour:minute has already passed today,
  // else today. Weekly = next occurrence of dayOfWeek. Monthly = next
  // occurrence of dayOfMonth. Server local TZ; can adjust to Africa/
  // Lagos later if Railway TZ drifts.
  private computeNextRunAt(t: {
    cadence: RecurringCadence; dayOfWeek?: number | null; dayOfMonth?: number | null;
    hour: number; minute: number;
  }, from: Date): Date {
    const next = new Date(from);
    next.setSeconds(0, 0);
    next.setHours(t.hour, t.minute, 0, 0);

    if (t.cadence === RecurringCadence.DAILY) {
      if (next <= from) next.setDate(next.getDate() + 1);
      return next;
    }
    if (t.cadence === RecurringCadence.WEEKLY) {
      const target = t.dayOfWeek ?? 1;
      let diff = (target - next.getDay() + 7) % 7;
      if (diff === 0 && next <= from) diff = 7;
      next.setDate(next.getDate() + diff);
      return next;
    }
    // MONTHLY
    const target = t.dayOfMonth ?? 1;
    next.setDate(target);
    if (next <= from) next.setMonth(next.getMonth() + 1);
    return next;
  }

  // Cron — every 5 minutes scan for due templates, fire each, schedule
  // the next run. Failures bump errorCount + lastError so the owner
  // can see them in the UI; we don't disable on a single failure.
  @Cron('*/5 * * * *')
  async runDueRecurringTemplates() {
    const due = await this.recurringRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.owner', 'u')
      .where('t.isActive = true')
      .andWhere('t.nextRunAt <= :now', { now: new Date() })
      .getMany();
    if (!due.length) return;

    for (const t of due) {
      try {
        await this.createDelivery(t.owner.id, t.payload as CreateMultiStopDeliveryDto);
        t.fireCount  += 1;
        t.lastRunAt  = new Date();
        t.lastError  = null;
      } catch (e: any) {
        t.errorCount += 1;
        t.lastError  = (e?.message ?? 'unknown').slice(0, 300);
        this.logger.warn(`Recurring template ${t.id} failed: ${t.lastError}`);
      }
      t.nextRunAt = this.computeNextRunAt(t, new Date());
      await this.recurringRepo.save(t);
    }
    this.logger.log(`Recurring templates fired: ${due.length}`);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async getBizAccount(userId: string): Promise<BusinessAccount> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user?.businessAccountId) throw new ForbiddenException('Business account not found.');
    const biz = await this.bizRepo.findOne({ where: { id: user.businessAccountId } });
    if (!biz) throw new NotFoundException('Business account not found.');
    return biz;
  }

  private async getPartnerStore(userId: string): Promise<PartnerStore> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user?.partnerStoreId) throw new ForbiddenException('Partner store not found.');
    const store = await this.storeRepo.findOne({ where: { id: user.partnerStoreId } });
    if (!store) throw new NotFoundException('Partner store not found.');
    return store;
  }

  private generateTrackingNumber(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    let id = 'SEIRS-';
    for (let i = 0; i < 9; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  }

  // ─── Business Sender: Dashboard ─────────────────────────────────────────────

  async businessDashboard(userId: string) {
    const biz = await this.getBizAccount(userId);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const [totalPkgs, weekPkgs] = await Promise.all([
      this.packagesRepo.count({ where: { businessAccountId: biz.id } }),
      this.packagesRepo.count({
        where: { businessAccountId: biz.id, arrivedAt: MoreThanOrEqual(weekStart) },
      }),
    ]);

    const recentPackages = await this.packagesRepo.find({
      where: { businessAccountId: biz.id },
      order: { createdAt: 'DESC' },
      take: 5,
    });

    const weekTxs = await this.walletTxRepo.find({
      where: { businessAccountId: biz.id, type: 'debit', createdAt: MoreThanOrEqual(weekStart) },
    });
    const weeklySpend = weekTxs.reduce((s, t) => s + Number(t.amount), 0);

    return {
      totalDeliveries:  totalPkgs,
      activeDeliveries: weekPkgs,
      walletBalance:    Number(biz.walletBalance),
      loyaltyPoints:    biz.loyaltyPoints,
      weeklySpend,
      companyName:      biz.companyName,
      recentDeliveries: recentPackages,
    };
  }

  // ─── Business Sender: Deliveries ────────────────────────────────────────────

  async getDeliveries(userId: string, page = 1, status?: string) {
    const take = 20;
    const skip = (page - 1) * take;

    const where: any = { customer: { id: userId } };
    if (status) where.status = status;

    const [items, total] = await this.deliveriesRepo.findAndCount({
      where,
      relations: ['stops'],
      order: { createdAt: 'DESC' },
      take,
      skip,
    });

    // Ensure stops are sorted by sequenceOrder for the UI.
    items.forEach(d => {
      if (Array.isArray(d.stops)) {
        d.stops.sort((a, b) => a.sequenceOrder - b.sequenceOrder);
      }
    });

    return { items, total, page, hasMore: skip + items.length < total };
  }

  /**
   * Fetch a single delivery with stops eager-loaded. Used by both the
   * business app's detail view and the driver app's active-trip screen.
   * Stops are returned sorted by sequenceOrder.
   */
  async getDeliveryById(deliveryId: string, userId: string) {
    // Either the customer (business owner) or an assigned driver should
    // be allowed to read this row. Driver-side auth is enforced
    // separately in the matching/dispatch layer; here we just check
    // customer ownership and allow if assigned driver matches userId.
    const delivery = await this.deliveriesRepo.findOne({
      where: { id: deliveryId },
      relations: ['stops', 'customer', 'driver'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');

    const isCustomer = delivery.customer?.id === userId;
    const isDriver   = delivery.driver?.id   === userId;
    if (!isCustomer && !isDriver) {
      throw new ForbiddenException('Not authorised to view this delivery.');
    }

    if (Array.isArray(delivery.stops)) {
      delivery.stops.sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    }
    return delivery;
  }

  /**
   * Create a multi-stop business delivery. Replaces the legacy orphan-
   * package flow that threw away addresses.
   *
   *  1. Validates the request (auth'd business, stops have coords,
   *     vehicle category compatibility).
   *  2. Calls PricingService.computePrice to get the full breakdown.
   *  3. Refuses the booking if wallet balance < customer.total.
   *  4. In a single transaction: creates one Delivery row + N
   *     DeliveryStop rows + debits the wallet + writes a ledger entry.
   *  5. Snapshots the active rateCardSnapshotId + priceBreakdown onto
   *     the Delivery so historical correctness is preserved.
   *
   * Returns the saved Delivery with stops eager-loaded so the business
   * app can show the confirmation screen with the optimized order.
   */
  async createDelivery(userId: string, dto: CreateMultiStopDeliveryDto) {
    const biz = await this.getBizAccount(userId);

    // ── Validation ─────────────────────────────────────────────────────
    if (!dto.pickupAddress || dto.pickupLat == null || dto.pickupLng == null) {
      throw new BadRequestException('Pickup address with coordinates is required.');
    }
    if (!Array.isArray(dto.stops) || dto.stops.length === 0) {
      throw new BadRequestException('At least one stop is required.');
    }
    if (dto.stops.some(s => s.lat == null || s.lng == null || !s.recipientName || !s.recipientPhone)) {
      throw new BadRequestException('Every stop needs coordinates, recipient name, and phone.');
    }
    if (!dto.vehicleType || !dto.categoryCode) {
      throw new BadRequestException('vehicleType and categoryCode are required.');
    }
    if (typeof dto.weightKg !== 'number' || dto.weightKg < 0) {
      throw new BadRequestException('weightKg must be a positive number.');
    }

    // ── Compute per-stop dwell + total dwell from category + weight ────
    const category = await this.pricing.getCategoryByCode(dto.categoryCode);
    const card     = await this.pricing.getActiveRateCard();
    const perStopDwellMin = this.pricing.computeStopDwellMinutes(card, category, dto.weightKg);
    const totalDwellMin   = perStopDwellMin * dto.stops.length;
    const totalEtaMin     = (dto.estimatedDriveMinutes ?? 0) + totalDwellMin;

    // ── Pricing ────────────────────────────────────────────────────────
    const breakdown = await this.pricing.computePrice({
      vehicleType:    dto.vehicleType,
      categoryCode:   dto.categoryCode,
      km:             dto.km,
      stopCount:      dto.stops.length,
      weightKg:       dto.weightKg,
      estimatedDwellMinutes: totalDwellMin,
      scheduledAt:    dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      isInterState:   dto.isInterState,
      isLongDistance: dto.isLongDistance,
      isRecurring:    dto.isRecurring,
    });

    // ── Wallet pre-flight (cheap check before opening transaction) ────
    // The real authoritative check happens inside the transaction with a
    // row lock; this is just to fail fast for the common case so we don't
    // spin up a transaction for an obvious overdraft.
    const total = breakdown.customer.total;
    if (Number(biz.walletBalance) < total) {
      throw new BadRequestException(
        `Insufficient wallet balance. Booking costs ₦${total.toFixed(2)}, you have ₦${biz.walletBalance}.`,
      );
    }

    // ── Transaction: Delivery + Stops + Wallet ─────────────────────────
    return this.dataSource.transaction(async (mgr) => {
      // CRITICAL: re-read the business account row WITH a pessimistic
      // write lock so two concurrent bookings can't both pass the
      // pre-flight check with the same stale balance and end up
      // over-spending. Postgres SERIALIZABLE-equivalent for this row.
      const lockedBiz = await mgr.createQueryBuilder(BusinessAccount, 'b')
        .setLock('pessimistic_write')
        .where('b.id = :id', { id: biz.id })
        .getOne();
      if (!lockedBiz) {
        throw new NotFoundException('Business account vanished mid-transaction.');
      }
      const liveBalance = Number(lockedBiz.walletBalance);
      if (liveBalance < total) {
        // Another booking debited the wallet between the pre-flight
        // check and this point. Fail clearly so the client can retry
        // after topping up.
        throw new BadRequestException(
          `Wallet was debited by another booking while you were submitting. ` +
          `Current balance: ₦${liveBalance.toFixed(2)} — needed ₦${total.toFixed(2)}.`,
        );
      }

      const trackingCode = this.generateTrackingNumber();

      const delivery = mgr.create(Delivery, {
        trackingCode,
        customer:       { id: userId } as any,
        pickupAddress:  dto.pickupAddress,
        pickupLat:      dto.pickupLat,
        pickupLng:      dto.pickupLng,
        // For single-stop bookings, populate dropoff* too so the legacy
        // single-leg dispatcher / driver app keeps working until phase 5
        // wires stops everywhere.
        dropoffAddress: dto.stops.length === 1 ? dto.stops[0].address : null,
        dropoffLat:     dto.stops.length === 1 ? dto.stops[0].lat     : null,
        dropoffLng:     dto.stops.length === 1 ? dto.stops[0].lng     : null,
        isMultiStop:    dto.stops.length > 1,
        packageDescription: dto.packageDescription ?? category.name,
        categoryCode:   dto.categoryCode,
        weightKg:       dto.weightKg,
        vehicleType:    dto.vehicleType,
        price:          breakdown.customer.total,
        driverEarnings: breakdown.driver.total,
        distanceKm:     dto.km,
        rateCardSnapshotId:    breakdown.rateCardSnapshotId,
        priceBreakdown:        breakdown,
        estimatedDriveMinutes: dto.estimatedDriveMinutes ?? 0,
        estimatedDwellMinutes: totalDwellMin,
        estimatedTotalMinutes: totalEtaMin,
        optimizedWaypointOrder: dto.optimizedWaypointOrder ?? null,
        routeWasAutoOptimized:  !!dto.routeWasAutoOptimized,
        status: DeliveryStatus.PENDING,
      } as any);
      const savedDelivery = await mgr.save(delivery);

      const stopRows = dto.stops.map((s, idx) => mgr.create(DeliveryStop, {
        deliveryId:    savedDelivery.id,
        sequenceOrder: s.sequenceOrder ?? idx + 1,
        address:       s.address,
        lat:           s.lat,
        lng:           s.lng,
        recipientName: s.recipientName,
        recipientPhone: s.recipientPhone,
        notes:         s.notes ?? null,
        estimatedDwellMinutes: perStopDwellMin,
        status:        DeliveryStopStatus.PENDING,
      }));
      await mgr.save(stopRows);

      // ── Wallet debit + ledger (uses live row-locked balance) ────────
      const balBefore = liveBalance;
      const balAfter  = balBefore - total;
      await mgr.update(BusinessAccount, biz.id, { walletBalance: balAfter });
      const tx = mgr.create(BusinessWalletTx, {
        businessAccountId: biz.id,
        type:           'debit',
        amount:         total,
        description:    `Delivery — ${dto.stops.length} stop(s), ${dto.vehicleType}, ${category.name}`,
        reference:      trackingCode,
        balanceBefore:  balBefore,
        balanceAfter:   balAfter,
      });
      await mgr.save(tx);

      return {
        delivery: savedDelivery,
        stops:    stopRows,
        breakdown,
        wallet:   { balanceBefore: balBefore, balanceAfter: balAfter },
      };
    });
  }

  // ── Stop-level transitions (called by driver app) ────────────────────

  /**
   * Driver tapped "Arrived at stop". Stamps arrivedAt + flips status.
   * If the stop is the first one, also marks the parent Delivery as
   * actualStartedAt (first arrival = trip started).
   */
  async markStopArrived(deliveryId: string, stopId: string) {
    const stop = await this.stopsRepo.findOne({ where: { id: stopId, deliveryId } });
    if (!stop) throw new NotFoundException('Stop not found.');
    // Idempotency: re-marking an already-arrived stop is a no-op so
    // network retries don't error out. Only fail on terminal states.
    if (stop.status === DeliveryStopStatus.ARRIVED) {
      return stop;
    }
    if (stop.status !== DeliveryStopStatus.PENDING && stop.status !== DeliveryStopStatus.EN_ROUTE) {
      throw new BadRequestException(`Cannot mark arrived from status: ${stop.status}`);
    }
    await this.stopsRepo.update(stop.id, {
      status: DeliveryStopStatus.ARRIVED,
      arrivedAt: new Date(),
    });

    // First arrival flips the parent delivery to picked_up / in_transit.
    const parent = await this.deliveriesRepo.findOne({ where: { id: deliveryId } });
    if (parent && !parent.actualStartedAt) {
      await this.deliveriesRepo.update(parent.id, {
        actualStartedAt: new Date(),
        status: DeliveryStatus.IN_TRANSIT,
      });
    }
    return this.stopsRepo.findOne({ where: { id: stop.id } });
  }

  /**
   * Driver tapped "Delivered" — recipient has the package. Stamps
   * deliveredAt. If this was the last stop, flips the parent Delivery
   * to delivered + stamps actualCompletedAt.
   */
  async markStopDelivered(
    deliveryId: string,
    stopId: string,
    proofPhotoUrls?: string[],
    recipientSignatureUrl?: string,
  ) {
    const stop = await this.stopsRepo.findOne({ where: { id: stopId, deliveryId } });
    if (!stop) throw new NotFoundException('Stop not found.');
    // Idempotency: re-marking an already-delivered stop is a no-op so
    // network retries from the driver app don't trigger spurious
    // double-close events on the parent delivery.
    if (stop.status === DeliveryStopStatus.DELIVERED) {
      return stop;
    }
    if (stop.status !== DeliveryStopStatus.ARRIVED) {
      throw new BadRequestException('Mark Arrived first before Delivered.');
    }
    await this.stopsRepo.update(stop.id, {
      status: DeliveryStopStatus.DELIVERED,
      deliveredAt: new Date(),
      signedAt: recipientSignatureUrl ? new Date() : null,
      proofPhotoUrls: proofPhotoUrls ?? null,
      recipientSignatureUrl: recipientSignatureUrl ?? null,
    });

    // If all stops are delivered/failed, close the parent. Single
    // count query over the "not-yet-terminal" status set instead of
    // three separate roundtrips.
    const remaining = await this.stopsRepo.count({
      where: {
        deliveryId,
        status: In([
          DeliveryStopStatus.PENDING,
          DeliveryStopStatus.EN_ROUTE,
          DeliveryStopStatus.ARRIVED,
        ]),
      },
    });
    if (remaining === 0) {
      await this.deliveriesRepo.update(deliveryId, {
        status: DeliveryStatus.DELIVERED,
        actualCompletedAt: new Date(),
        deliveredAt: new Date(),
      });
    }
    return this.stopsRepo.findOne({ where: { id: stop.id } });
  }

  /**
   * Bulk CSV upload — PREVIEW step.
   *
   * Parses incoming rows against the spec §⑬ schema (booking_ref,
   * pickup_address, recipient_*, dropoff_address, category, weight_kg,
   * etc.), geocodes each address server-side, groups rows sharing a
   * booking_ref into multi-stop bookings, and returns a preview the
   * business can review BEFORE committing.
   *
   * The preview includes per-row validation results, geocoded coordinates,
   * a per-booking price quote, and a grand total. Business confirms via
   * confirmCsvDeliveries() to actually create the deliveries.
   */
  async uploadCsvDeliveries(userId: string, rows: any[]) {
    const biz = await this.getBizAccount(userId);

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('CSV is empty or could not be parsed.');
    }

    // Active rate card + category list for pricing + validation
    const card     = await this.pricing.getActiveRateCard();
    const catalog  = await this.pricing.getServiceCategories();
    const catCodes = new Set(catalog.map((c) => c.code));

    // ── Step 1: Per-row validation + geocoding ──────────────────────
    interface ParsedRow {
      lineNumber:     number;
      bookingRef:     string | null;
      pickup:         { address: string; lat?: number; lng?: number };
      drop:           { address: string; lat?: number; lng?: number };
      recipientName:  string;
      recipientPhone: string;
      category:       string;
      weightKg:       number;
      quantity:       number;
      vehicleOverride?: string;
      stopOrder?:     number;
      notes?:         string;
      scheduledAt?:   string;
      errors:         string[];
    }

    const parsed: ParsedRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] ?? {};
      const errors: string[] = [];

      const bookingRef = (r.booking_ref ?? r.bookingRef ?? '').trim() || null;
      const pickupAddress = (r.pickup_address ?? r.pickupAddress ?? '').trim();
      const dropAddress   = (r.dropoff_address ?? r.dropoffAddress ?? '').trim();
      const recipientName = (r.recipient_name ?? r.recipientName ?? '').trim();
      const recipientPhone = (r.recipient_phone ?? r.recipientPhone ?? '').trim();
      const category = (r.category ?? '').trim().toLowerCase();
      const weightKg = Number(r.weight_kg ?? r.weightKg);
      const quantity = Number(r.quantity ?? 1) || 1;
      const vehicleOverride = (r.vehicle_override ?? r.vehicleOverride ?? '').trim() || undefined;
      const stopOrder = r.stop_order != null && r.stop_order !== '' ? Number(r.stop_order) : undefined;
      const notes = (r.notes ?? '').trim() || undefined;
      const scheduledAt = (r.scheduled_at ?? r.scheduledAt ?? '').trim() || undefined;

      // Required fields
      if (!pickupAddress) errors.push('pickup_address is required');
      if (!dropAddress)   errors.push('dropoff_address is required');
      if (!recipientName) errors.push('recipient_name is required');
      if (!recipientPhone) errors.push('recipient_phone is required');
      if (!category)       errors.push('category is required');
      if (!Number.isFinite(weightKg) || weightKg < 0) errors.push('weight_kg must be a positive number');

      // Category enum check
      if (category && !catCodes.has(category)) {
        errors.push(`category "${category}" is not in the catalog. Valid codes: ${[...catCodes].join(', ')}`);
      }

      // Nigerian phone format (11 digits starting 070/071/080/081/090/091)
      const normalisedPhone = recipientPhone.replace(/[\s-]/g, '').replace(/^\+234/, '0');
      if (recipientPhone && !/^0(70|71|80|81|90|91)\d{8}$/.test(normalisedPhone)) {
        errors.push('recipient_phone must be 11-digit Nigerian number (e.g. 08012345678)');
      }

      // Vehicle override check
      if (vehicleOverride && !card.vehicleRates[vehicleOverride]) {
        errors.push(`vehicle_override "${vehicleOverride}" is not a known vehicle type`);
      }

      // Geocoding — only if address fields validated
      let pickup: ParsedRow['pickup'] = { address: pickupAddress };
      let drop:   ParsedRow['drop']   = { address: dropAddress };
      if (pickupAddress) {
        const geo = await this.routing.geocodeAddress(pickupAddress);
        if (!geo) errors.push(`pickup_address "${pickupAddress}" could not be geocoded`);
        else pickup = { address: geo.formattedAddress, lat: geo.lat, lng: geo.lng };
      }
      if (dropAddress) {
        const geo = await this.routing.geocodeAddress(dropAddress);
        if (!geo) errors.push(`dropoff_address "${dropAddress}" could not be geocoded`);
        else drop = { address: geo.formattedAddress, lat: geo.lat, lng: geo.lng };
      }

      parsed.push({
        lineNumber: i + 2,    // +1 for 1-indexed, +1 for header row
        bookingRef, pickup, drop,
        recipientName, recipientPhone: normalisedPhone,
        category, weightKg, quantity, vehicleOverride, stopOrder, notes, scheduledAt,
        errors,
      });
    }

    // ── Step 2: Group by booking_ref (standalone rows = own booking) ──
    const groups = new Map<string, ParsedRow[]>();
    for (const row of parsed) {
      const key = row.bookingRef ?? `__standalone_${row.lineNumber}`;
      const arr = groups.get(key) ?? [];
      arr.push(row);
      groups.set(key, arr);
    }

    // ── Step 3: Compute price preview per group ──────────────────────
    const bookings = [];
    let grandTotal = 0;
    for (const [refKey, groupRows] of groups) {
      const blockingErrors = groupRows.flatMap((r) => r.errors);
      const allValid = blockingErrors.length === 0;

      // All rows in a group must share the same pickup
      if (groupRows.length > 1) {
        const distinctPickups = new Set(groupRows.map(r => r.pickup.address));
        if (distinctPickups.size > 1) {
          blockingErrors.push(`Rows sharing booking_ref="${refKey}" have different pickup_address values`);
        }
      }

      let pricePreview: any = null;
      if (allValid && groupRows.every(r => r.pickup.lat && r.drop.lat)) {
        // Sort by stop_order if provided, else use input order
        const sorted = [...groupRows].sort((a, b) => (a.stopOrder ?? 0) - (b.stopOrder ?? 0));
        // For a real km we'd call Directions, but the preview can use
        // haversine sum which is good enough for cost estimate.
        const km = sumHaversineKm(sorted[0].pickup, sorted);
        const totalWeight = sorted.reduce((acc, r) => acc + (r.weightKg * (r.quantity ?? 1)), 0);
        const vehicle = sorted[0].vehicleOverride
                     ?? this.autoPickVehicle(card, sorted[0].category, totalWeight);
        try {
          pricePreview = await this.pricing.computePrice({
            vehicleType:   vehicle,
            categoryCode:  sorted[0].category,
            km,
            stopCount:     sorted.length,
            weightKg:      totalWeight,
            estimatedDwellMinutes: 0,
            isBulk:        rows.length >= card.discounts.bulkUploadMinPackages,
          });
          grandTotal += pricePreview.customer.total;
        } catch (e: any) {
          blockingErrors.push(`Pricing failed: ${e?.message ?? 'unknown'}`);
        }
      }

      bookings.push({
        bookingRef: refKey.startsWith('__standalone_') ? null : refKey,
        rows: groupRows,
        valid: blockingErrors.length === 0,
        errors: blockingErrors,
        pricePreview,
      });
    }

    return {
      totalRows: rows.length,
      bookings,
      grandTotal,
      walletBalance: Number(biz.walletBalance),
      canAfford:     Number(biz.walletBalance) >= grandTotal,
      bulkDiscountApplied: rows.length >= card.discounts.bulkUploadMinPackages,
      bulkDiscountPercent: rows.length >= card.discounts.bulkUploadMinPackages
                            ? card.discounts.bulkUploadOffPercent : 0,
    };
  }

  /**
   * Pick the lightest suggested vehicle for the given category that can
   * carry the weight. Falls back to the category's first suggested
   * vehicle if no exact match.
   */
  private autoPickVehicle(card: any, categoryCode: string, weightKg: number): string {
    // Read from the seeded ServiceCategory.suggestedVehicles via the
    // rateCard isn't directly possible; we use a static fallback order
    // here. Real picker lives in the business app UI; this is just for
    // CSV preview pricing.
    const order = ['motorcycle', 'tricycle', 'car', 'van', 'truck_small', 'truck_large'];
    for (const v of order) {
      const r = card.vehicleRates[v];
      if (r && weightKg <= r.maxPayloadKg) return v;
    }
    return 'truck_large';
  }

  // ─── Business Sender: Wallet ─────────────────────────────────────────────────

  async getWallet(userId: string) {
    const biz = await this.getBizAccount(userId);
    return {
      balance:       Number(biz.walletBalance),
      loyaltyPoints: biz.loyaltyPoints,
      currency:      'NGN',
    };
  }

  async fundWallet(userId: string, amount: number) {
    if (!amount || amount < 100) throw new BadRequestException('Minimum funding amount is ₦100.');
    const biz = await this.getBizAccount(userId);

    const balBefore = Number(biz.walletBalance);
    const balAfter  = balBefore + amount;
    await this.bizRepo.update(biz.id, { walletBalance: balAfter });

    // Award loyalty points: 1 point per ₦100 funded
    const points = Math.floor(amount / 100);
    await this.bizRepo.update(biz.id, { loyaltyPoints: biz.loyaltyPoints + points });

    const tx = this.walletTxRepo.create({
      businessAccountId: biz.id,
      type:          'credit',
      amount,
      description:   'Wallet top-up',
      reference:     uuidv4(),
      balanceBefore: balBefore,
      balanceAfter:  balAfter,
    });
    await this.walletTxRepo.save(tx);

    return { balance: balAfter, pointsEarned: points, message: 'Wallet funded successfully.' };
  }

  async getTransactions(userId: string, page = 1) {
    const biz  = await this.getBizAccount(userId);
    const take = 20;
    const skip = (page - 1) * take;

    const [items, total] = await this.walletTxRepo.findAndCount({
      where:  { businessAccountId: biz.id },
      order:  { createdAt: 'DESC' },
      take,
      skip,
    });

    return { items, total, page, hasMore: skip + items.length < total };
  }

  // ─── Business Sender: Team ───────────────────────────────────────────────────

  async getTeam(userId: string) {
    const biz = await this.getBizAccount(userId);
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    const members = await this.teamRepo.find({ where: { businessAccountId: biz.id } });

    // Always include the owner at the top
    const owner = {
      id:       userId,
      name:     user!.name,
      email:    user!.email,
      teamRole: 'owner',
      status:   'active',
    };

    return { members: [owner, ...members] };
  }

  async inviteTeamMember(userId: string, data: { name: string; email: string; teamRole: string }) {
    const biz = await this.getBizAccount(userId);

    const existing = await this.teamRepo.findOne({
      where: { businessAccountId: biz.id, email: data.email.toLowerCase() },
    });
    if (existing) throw new BadRequestException('This email is already in your team.');

    const member = this.teamRepo.create({
      businessAccountId: biz.id,
      name:     data.name,
      email:    data.email.toLowerCase(),
      teamRole: data.teamRole as any,
      status:   'pending',
    });
    await this.teamRepo.save(member);

    await this.mailService.sendEmailVerification(
      data.email,
      data.name,
      'You have been invited to join a Seirs business account.',
    ).catch(() => {});

    return { message: 'Invitation sent.', member };
  }

  async removeTeamMember(userId: string, memberId: string) {
    const biz = await this.getBizAccount(userId);
    const member = await this.teamRepo.findOne({
      where: { id: memberId, businessAccountId: biz.id },
    });
    if (!member) throw new NotFoundException('Team member not found.');
    await this.teamRepo.delete(memberId);
    return { message: 'Team member removed.' };
  }

  // ─── Business Sender: Loyalty ────────────────────────────────────────────────

  async getLoyalty(userId: string) {
    const biz = await this.getBizAccount(userId);
    return {
      points:       biz.loyaltyPoints,
      pointsValue:  biz.loyaltyPoints * 10, // ₦10 per point
      tier:         biz.loyaltyPoints >= 5000 ? 'Gold' : biz.loyaltyPoints >= 1000 ? 'Silver' : 'Bronze',
      nextTierAt:   biz.loyaltyPoints >= 5000 ? null : biz.loyaltyPoints >= 1000 ? 5000 : 1000,
    };
  }

  // ─── Partner Store: Dashboard ────────────────────────────────────────────────

  async partnerDashboard(userId: string) {
    const store = await this.getPartnerStore(userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const [inStore, awaitingPickup, collectedToday, recentPackages] = await Promise.all([
      this.packagesRepo.count({ where: { partnerStoreId: store.id, status: PackageStatus.IN_STORE } }),
      this.packagesRepo.count({ where: { partnerStoreId: store.id, status: PackageStatus.AWAITING_PICKUP } }),
      this.packagesRepo.count({ where: { partnerStoreId: store.id, status: PackageStatus.COLLECTED, collectedAt: MoreThanOrEqual(today) } }),
      this.packagesRepo.find({
        where: { partnerStoreId: store.id },
        order: { createdAt: 'DESC' },
        take: 5,
      }),
    ]);

    const weekPayouts = await this.payoutsRepo.find({
      where: { partnerStoreId: store.id, createdAt: MoreThanOrEqual(weekStart) },
    });
    const weekEarnings = weekPayouts.reduce((s, p) => s + Number(p.amount), 0);

    return {
      packagesInStore: inStore,
      awaitingPickup,
      collectedToday,
      weekEarnings,
      maxCapacity:     store.maxCapacity,
      recentPackages,
    };
  }

  // ─── Partner Store: Inventory ─────────────────────────────────────────────────

  async getInventory(userId: string, status?: string, page = 1) {
    const store = await this.getPartnerStore(userId);
    const take  = 20;
    const skip  = (page - 1) * take;

    const where: any = { partnerStoreId: store.id };
    if (status) where.status = status;

    const [items, total] = await this.packagesRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take,
      skip,
    });

    return { items, total, page, hasMore: skip + items.length < total };
  }

  // ─── Partner Store: Scan ──────────────────────────────────────────────────────

  async scanPackage(userId: string, qrCode: string) {
    const store = await this.getPartnerStore(userId);

    const pkg = await this.packagesRepo.findOne({
      where: [
        { qrCode, partnerStoreId: store.id },
        { trackingNumber: qrCode, partnerStoreId: store.id },
      ],
    });

    if (!pkg) throw new NotFoundException('Package not found at this store.');

    return {
      id:             pkg.id,
      trackingNumber: pkg.trackingNumber,
      recipientName:  pkg.recipientName,
      recipientPhone: pkg.recipientPhone,
      status:         pkg.status,
      arrivedAt:      pkg.arrivedAt,
    };
  }

  // ─── Partner Store: Mark Collected ───────────────────────────────────────────

  async markCollected(userId: string, packageId: string) {
    const store = await this.getPartnerStore(userId);

    const pkg = await this.packagesRepo.findOne({
      where: [
        { id: packageId, partnerStoreId: store.id },
        { trackingNumber: packageId, partnerStoreId: store.id },
      ],
    });

    if (!pkg) throw new NotFoundException('Package not found.');
    if (pkg.status === PackageStatus.COLLECTED) {
      throw new BadRequestException('Package already marked as collected.');
    }

    await this.packagesRepo.update(pkg.id, {
      status:      PackageStatus.COLLECTED,
      collectedAt: new Date(),
    });

    // Credit partner earnings
    const earning = this.payoutsRepo.create({
      partnerStoreId: store.id,
      amount:         PER_PACKAGE_RATE,
      status:         'pending',
      period:         this.currentWeekLabel(),
    });
    await this.payoutsRepo.save(earning);

    return { message: 'Package marked as collected.', trackingNumber: pkg.trackingNumber };
  }

  // ─── Partner Store: Earnings ──────────────────────────────────────────────────

  async getEarnings(userId: string, period: 'week' | 'month') {
    const store = await this.getPartnerStore(userId);

    const since = new Date();
    if (period === 'week') since.setDate(since.getDate() - 7);
    else since.setDate(since.getDate() - 30);
    since.setHours(0, 0, 0, 0);

    const collectedPkgs = await this.packagesRepo.find({
      where: {
        partnerStoreId: store.id,
        status: PackageStatus.COLLECTED,
        collectedAt: MoreThanOrEqual(since),
      },
      order: { collectedAt: 'ASC' },
    });

    // Build daily buckets
    const dayMap = new Map<string, { amount: number; packages: number }>();
    for (const pkg of collectedPkgs) {
      const d   = new Date(pkg.collectedAt!);
      const key = d.toISOString().slice(0, 10);
      const cur = dayMap.get(key) ?? { amount: 0, packages: 0 };
      cur.amount   += PER_PACKAGE_RATE;
      cur.packages += 1;
      dayMap.set(key, cur);
    }

    const days = Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }));
    const totalEarnings = days.reduce((s, d) => s + d.amount, 0);

    const pendingPayouts = await this.payoutsRepo.find({
      where: { partnerStoreId: store.id, status: 'pending' },
    });
    const pendingPayout = pendingPayouts.reduce((s, p) => s + Number(p.amount), 0);

    const payouts = await this.payoutsRepo.find({
      where: { partnerStoreId: store.id },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));

    return {
      totalEarnings,
      totalPackages:  collectedPkgs.length,
      pendingPayout,
      perPackageRate: PER_PACKAGE_RATE,
      nextPayoutDate: nextMonday.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'short' }),
      days,
      payouts,
    };
  }

  // ─── Partner Store: Settings ──────────────────────────────────────────────────

  async getSettings(userId: string) {
    const store = await this.getPartnerStore(userId);
    return store;
  }

  async updateSettings(userId: string, data: any) {
    const store = await this.getPartnerStore(userId);

    const allowed = [
      'storeName', 'storeAddress', 'phone', 'maxCapacity',
      'operatingDays', 'openTime', 'closeTime',
      'notifyNewPackage', 'notifyPickup', 'notifyPayout',
    ];
    const update: any = {};
    for (const key of allowed) {
      if (data[key] !== undefined) update[key] = data[key];
    }

    await this.storeRepo.update(store.id, update);
    return { message: 'Settings updated.' };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Sum the great-circle distances pickup → stop1 → stop2 → ... → stopN.
   * Used for CSV preview pricing where calling Google Directions for
   * every group would be expensive. Real bookings use the Directions
   * total persisted on the Delivery row.
   */

  private currentWeekLabel(): string {
    const now   = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
  }
}

// ─── Module-level helpers ─────────────────────────────────────────────────────

function sumHaversineKm(
  pickup: { lat?: number; lng?: number },
  stops: Array<{ drop: { lat?: number; lng?: number } }>,
): number {
  if (pickup.lat == null || pickup.lng == null) return 0;
  let total = 0;
  let prev: { lat: number; lng: number } = { lat: pickup.lat, lng: pickup.lng };
  for (const s of stops) {
    if (s.drop.lat == null || s.drop.lng == null) continue;
    total += haversineKm(prev.lat, prev.lng, s.drop.lat, s.drop.lng);
    prev = { lat: s.drop.lat, lng: s.drop.lng };
  }
  return total;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
