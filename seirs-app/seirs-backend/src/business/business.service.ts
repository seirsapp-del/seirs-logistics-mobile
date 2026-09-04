import { canonicalRcNumber, isValidRcNumber, RC_NUMBER_ERROR } from '../common/rc-number';
import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger,
  ConflictException,
  Inject, forwardRef, Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { Repository, MoreThanOrEqual, LessThanOrEqual, DataSource, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../users/user.entity';
import { BusinessAccount } from './business-account.entity';
import { PartnerStore } from './partner-store.entity';
import { BusinessPackage, PackageStatus } from './business-package.entity';
import { BusinessWalletTx } from './business-wallet-tx.entity';
import { PartnerPayout } from './partner-payout.entity';
import { RecurringTemplate, RecurringCadence } from './recurring-template.entity';
import { MailService } from '../mail/mail.service';
import { PricingService } from '../pricing/pricing.service';
import { PaymentsService } from '../payments/payments.service';
import { RoutingService } from '../routing/routing.service';
import { FeesService } from '../fees/fees.service';
import { Delivery, DeliveryStatus, DeliverySource } from '../deliveries/delivery.entity';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { DriversService } from '../drivers/drivers.service';
import { DeliveryStop, DeliveryStopStatus } from '../deliveries/delivery-stop.entity';
import { secureCode } from '../common/utils/auth-codes';
import { spendNarrative, methodLabel } from './spend-narrative';

import { redactDriverForCustomer } from '../common/redact-driver';
import { getState } from '../pricing/regions';
import { breakdownForCustomer, breakdownForDriver } from '../deliveries/redact-breakdown';

/**
 * Fallback only. The live rate is partner_store_handling_ngn in the Fee
 * Catalogue, which is the same fee the drop-off flow pays. This constant
 * silently disagreed with it: an admin could change the catalogue rate
 * and packages stored through THIS path kept paying 500 forever
 * (audit 2026-08-18).
 */
const PER_PACKAGE_RATE_FALLBACK = 500;

function generateStopCode(): string {
  return 'STP-' + secureCode(8);
}

/**
 * Public per-package tracking code: SRS-XXXXXXXX (founder's format,
 * 2026-08-16).
 *
 * It briefly carried a -P- segment so support could spot a package code,
 * but that was redundant: a run is SEIRS-, a package is SRS-, and the two
 * were never ambiguous. All the -P- did was make the code the receiver
 * reads longer. Codes already issued as SRS-P- stay valid, since both
 * shapes start with SRS-.
 */
function generatePackageCode(): string {
  return 'SRS-' + secureCode(8);
}

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
  /** Sender drops the run at this counter instead of a door pickup. */
  pickupStoreId?:   string;
  /**
   * Post this load to a rider's declared intercity trip (2026-08-31).
   * Set by the Cargo Space screen. The parcel is offered to that one
   * rider first; they accept or decline, and an unanswered offer expires
   * and refunds. Priced exactly like any other booking.
   */
  tripId?:          string;
  stops: Array<{
    address:        string;
    lat:            number;
    lng:            number;
    recipientName:  string;
    recipientPhone: string;
    notes?:         string;
    sequenceOrder?: number;
    /**
     * Multi-package rebuild (2026-08-16): each stop IS one package with
     * its own identity. Optional so the legacy one-category flow keeps
     * booking until the new UI ships; when present, per-package pricing
     * and public tracking codes activate.
     */
    packagePhotoUrls?:   string[];
    packageDescription?: string;
    categoryCode?:       string;
    weightKg?:           number;
    /** Customer-parity per package (2026-08-16). */
    receiverFirstName?:     string;
    receiverLastName?:      string;
    declaredValueNgn?:      number;
    fallbackPref?:          string;
    fallbackNeighbourName?: string;
    /** Deliver this package to a partner counter instead of a door. */
    destinationStoreId?:    string;
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
    @InjectRepository(PartnerStore)        private storeRepo:       Repository<PartnerStore>,
    @InjectRepository(BusinessPackage)     private packagesRepo:    Repository<BusinessPackage>,
    @InjectRepository(BusinessWalletTx)    private walletTxRepo:    Repository<BusinessWalletTx>,
    @InjectRepository(PartnerPayout)       private payoutsRepo:     Repository<PartnerPayout>,
    @InjectRepository(Delivery)            private deliveriesRepo:  Repository<Delivery>,
    @InjectRepository(DeliveryStop)        private stopsRepo:       Repository<DeliveryStop>,
    @InjectRepository(RecurringTemplate)   private recurringRepo:   Repository<RecurringTemplate>,
    private mailService: MailService,
    private paymentsService: PaymentsService,
    private pricing: PricingService,
    private routing: RoutingService,
    private fees: FeesService,
    private dataSource: DataSource,
    @Inject(forwardRef(() => DeliveriesService))
    private deliveriesService: DeliveriesService,
    /**
     * Only used to validate a trip a load is being posted to
     * (2026-08-31). Optional so a wiring problem refuses trip posting
     * with a clear message rather than breaking every business booking.
     */
    @Optional() @Inject(forwardRef(() => DriversService))
    private driversService?: DriversService,
  ) {}

  // ── Spec V8 §4.2 - Recurring Delivery Templates ───────────────────────────

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

  // Cron - every 5 minutes scan for due templates, fire each, schedule
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
    // crypto-secure (Math.random here was missed in the 2026-08-09
    // predictability sweep; every other generator already uses secureCode).
    return 'SEIRS-' + secureCode(9, 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789');
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

  /**
   * A spend statement a trader can hand to an accountant.
   *
   * This returned one row per YEAR: a single lifetime-shaped total with
   * nothing behind it, and the screen above it led with "PAID TO SEIRS"
   * and a figure that only grew. Founder, 2026-09-01: "from human
   * psycology showing them how much they have spend total would make
   * they think they are spending too much, so they should see the
   * payment and be able to filter it incase the want to print their
   * invoice and a total, like a bank statement will work".
   *
   * So it is a bank statement now, deliberately built to the same shape
   * as getPartnerPayoutStatement below rather than a new one: pick a
   * window, get every line in it in date order with a running total,
   * plus the totals for that window and nothing wider. Defaults to the
   * last 90 days, which is the common case of opening the screen.
   *
   * PENDING IS EXCLUDED ENTIRELY, founder 2026-09-01: "no pending in
   * statement at all". Not in the lines, not in the total, not in the
   * PDF. A statement shows what moved, and a pending charge has not
   * moved. Unsettled charges stay in the ordinary Payments list, which
   * is where somebody chasing a failed booking should be looking.
   *
   * Refunds are excluded for the same reason the old yearly version
   * excluded them: a reversed charge is not spend, and a statement that
   * overstates spend is worse than no statement, because it goes to an
   * accountant.
   */
  async getSpendStatement(userId: string, from?: string, to?: string) {
    const biz = await this.getBizAccount(userId);

    const toDate   = to   ? new Date(to)   : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 90 * 24 * 3600 * 1000);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('from and to must be valid dates (YYYY-MM-DD).');
    }
    if (fromDate > toDate) {
      throw new BadRequestException('The start date cannot be after the end date.');
    }
    // Include the whole closing day, not up to midnight of it.
    toDate.setHours(23, 59, 59, 999);

    /**
     * Columns are named one by one, and the customer relation is not
     * joined at all. A leftJoinAndSelect onto the user here would carry
     * bank details and KYC document paths into a response that renders
     * none of them.
     *
     * card_verify is excluded by name. It is the tokenisation charge,
     * refunded immediately, and it is not spend. It cannot be left to
     * the refund filter either: if that refund ever fails the row stays
     * SUCCESS, and it would appear on an accountant's statement as a
     * real charge.
     *
     * Every other purpose is included. A redirect fee or a return leg is
     * money the company genuinely paid SEIRS, and a statement that
     * silently omits it will not reconcile against their bank.
     */
    const rows: Array<any> = await this.dataSource.query(
      `SELECT p.id,
              p."createdAt",
              p."amountKobo",
              p.purpose,
              p.method,
              p."providerReference",
              d."trackingCode",
              d."pickupAddress",
              d."dropoffAddress",
              d.kind,
              (SELECT COUNT(*)::int FROM delivery_stops s WHERE s."deliveryId" = d.id) AS stops
         FROM payments p
         LEFT JOIN deliveries d ON d.id = p."deliveryId"
        WHERE p."customerId" = $1
          AND p.status = 'success'
          AND p.purpose <> 'card_verify'
          AND p."createdAt" BETWEEN $2 AND $3
        ORDER BY p."createdAt" ASC`,
      [biz.ownerId, fromDate.toISOString(), toDate.toISOString()],
    );

    let running = 0;
    const entries = rows.map((r) => {
      const amountNgn = Number(r.amountKobo ?? 0) / 100;
      running += amountNgn;
      return {
        id:        r.id,
        date:      r.createdAt,
        narrative: spendNarrative(r),
        amountNgn: Math.round(amountNgn * 100) / 100,
        // Only once it is known. A rail we were never told is left out
        // rather than guessed at, which is the whole reason the method
        // column became nullable.
        method:       methodLabel(r.method),
        reference:    r.providerReference ?? null,
        trackingCode: r.trackingCode ?? null,
        stops:        r.stops ? Number(r.stops) : null,
        runningTotalNgn: Math.round(running * 100) / 100,
      };
    });

    return {
      companyName: biz.companyName,
      from:        fromDate.toISOString(),
      to:          toDate.toISOString(),
      entries,
      totals: {
        // The hero figure. Scoped to this window and nothing wider, and
        // the period travels with it so the screen can never print the
        // number without the dates above it.
        paidNgn: Math.round(entries.reduce((a, e) => a + e.amountNgn, 0) * 100) / 100,
        entries: entries.length,
      },
    };
  }

  /**
   * Yearly payout statement for partner stores: PAID payouts only
   * (money actually received), grouped by the year it was paid.
   */
  /**
   * A partner statement you could hand to an accountant.
   *
   * This returned one row per YEAR: a single total and a count, with
   * nothing behind it. A shop asking "which packages made up my
   * NGN 46,000" could not be answered from the app, and neither could a
   * tax filing (founder 2026-08-19: "does it look like a receipt from a
   * store or like a bank statement, and can they choose from when to
   * when").
   *
   * It is a bank statement now: pick a window, get every line in it with
   * a running balance, plus the totals for the period. Defaults to the
   * last 90 days when no window is given, which is the common case of
   * opening the screen and just looking.
   */
  async getPartnerPayoutStatement(userId: string, from?: string, to?: string) {
    const store = await this.getPartnerStore(userId);

    const toDate   = to   ? new Date(to)   : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 90 * 24 * 3600 * 1000);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('from and to must be valid dates (YYYY-MM-DD).');
    }
    if (fromDate > toDate) {
      throw new BadRequestException('The start date cannot be after the end date.');
    }
    // Include the whole closing day, not up to midnight of it.
    toDate.setHours(23, 59, 59, 999);

    const lines: Array<any> = await this.payoutsRepo.query(
      `SELECT id, amount::float AS amount, status, period,
              "paidAt", "createdAt"
         FROM partner_payouts
        WHERE "partnerStoreId" = $1
          AND COALESCE("paidAt", "createdAt") BETWEEN $2 AND $3
        ORDER BY COALESCE("paidAt", "createdAt") ASC`,
      [store.id, fromDate.toISOString(), toDate.toISOString()],
    );

    let running = 0;
    const entries = lines.map((l) => {
      const settled = l.status === 'paid';
      if (settled) running += Number(l.amount);
      return {
        id:        l.id,
        date:      l.paidAt ?? l.createdAt,
        narrative: settled ? `Counter earnings paid (${l.period})` : `Counter earnings earned (${l.period})`,
        amountNgn: Number(l.amount),
        status:    l.status,
        settled,
        runningPaidNgn: Math.round(running * 100) / 100,
      };
    });

    const paid    = entries.filter(e => e.settled).reduce((a, e) => a + e.amountNgn, 0);
    const pending = entries.filter(e => !e.settled).reduce((a, e) => a + e.amountNgn, 0);

    return {
      storeName: store.storeName,
      storeCode: (store as any).storeCode ?? null,
      from:      fromDate.toISOString(),
      to:        toDate.toISOString(),
      /**
       * Says what they earned, and stops.
       *
       * This read "your share of the fee charged to the sender", which
       * names no rate and still gives the game away: it tells a shop a
       * larger fee exists and that they receive a portion of it, which
       * invites "what portion?" and the answer is never one they like.
       *
       * Founder ruling 2026-09-03: our commission is shown to nobody.
       * Not drivers, not customers, not partners. It is disclosed once in
       * the Code of Conduct at sign-up and nowhere else. The same rule
       * cost four driver screens, where earnings.tsx printed the fare and
       * the SEIRS cut on the same row and one screenshot gave up the take
       * rate.
       */
      openingNote: 'What you earned for handling each parcel.',
      entries,
      totals: {
        paidNgn:    Math.round(paid * 100) / 100,
        pendingNgn: Math.round(pending * 100) / 100,
        entries:    entries.length,
      },
    };
  }

  // ─── Business Sender: Deliveries ────────────────────────────────────────────

  /**
   * A sender's own runs, optionally filtered.
   *
   * The app has always sent a search term and this ignored it, so the
   * box reading "Search by tracking number" filtered nothing at all
   * (founder 2026-08-17, typing a run code and watching every run stay
   * on screen). Matching covers the run code, any package code inside
   * it, a receiver's name and the addresses, since those are what a
   * sender actually remembers.
   */
  async getDeliveries(userId: string, page = 1, status?: string, search?: string) {
    const take = 20;
    const skip = (page - 1) * take;

    const qb = this.deliveriesRepo.createQueryBuilder('d')
      .leftJoinAndSelect('d.stops', 'stops')
      .where('d."customerId" = :userId', { userId })
      .orderBy('d.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (status) qb.andWhere('d.status = :status', { status });

    const q = (search ?? '').trim();
    if (q) {
      qb.andWhere(`(
             d."trackingCode"            ILIKE :like
          OR stops."packageTrackingCode" ILIKE :like
          OR stops."receiverFirstName"   ILIKE :like
          OR stops."recipientName"       ILIKE :like
          OR stops.address               ILIKE :like
          OR d."pickupAddress"           ILIKE :like
        )`, { like: `%${q}%` });
    }

    const [items, total] = await qb.getManyAndCount();

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
      relations: ['stops', 'customer', 'driver', 'driver.user'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');

    const isCustomer = delivery.customer?.id === userId;
    // delivery.driver.id is the DRIVER ROW id and userId is a USER id, so
    // this comparison was never true and a driver was refused their own
    // run even after the guard was passed. The stop transitions further
    // down already compared driver.user.id correctly; this one did not.
    const isDriver   = delivery.driver?.user?.id === userId;
    if (!isCustomer && !isDriver) {
      throw new ForbiddenException('Not authorised to view this delivery.');
    }

    if (Array.isArray(delivery.stops)) {
      delivery.stops.sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    }

    // Same derived field the public tracking payload exposes. Without
    // it the business app cannot tell that a package is sitting behind
    // an unpaid collection fee: the entity carries the fee and the paid
    // timestamp separately, and every client would have to re-derive
    // the same rule and eventually disagree about it.
    const feeNgn = Number(delivery.redirectFeeNgn ?? 0);
    /**
     * Same leak the customer route had (found 2026-08-24): this loads
     * 'driver' and 'driver.user' and spread the whole thing, so a
     * business sender received their rider's bank account, home address
     * and KYC document URLs. Redacted for the sender; a driver reading
     * their own run still gets their own record untouched.
     */
    const shaped: any = isCustomer ? redactDriverForCustomer({ ...delivery } as any) : { ...delivery };
    /**
     * Split the money object by audience (2026-08-31).
     *
     * This route returned the stored priceBreakdown raw, so a business
     * sender's phone received seirsNet, trueCosts.contribution,
     * trueCosts.belowFloor and the rider's complete cost basis for the
     * run. That is the per-job version of the public rate-card leak
     * closed on 2026-08-27. A sender now gets their own itemised bill,
     * a rider their own itemised pay. See redact-breakdown.ts.
     */
    shaped.priceBreakdown = isCustomer
      ? breakdownForCustomer(shaped.priceBreakdown)
      : breakdownForDriver(shaped.priceBreakdown);

    return {
      ...shaped,
      redirectFeeOwedNgn:
        feeNgn > 0 && !delivery.redirectFeePaidAt ? feeNgn : null,
      /**
       * Readable state names beside the stored codes (2026-08-31), so a
       * screen can write "Lagos to Kano" without three apps each
       * shipping their own copy of the state table. Null when the
       * booking predates the columns, which lets a client tell "not
       * interstate" apart from "nobody measured it".
       */
      pickupStateName:  getState((delivery as any).pickupStateCode)?.name  ?? null,
      dropoffStateName: getState((delivery as any).dropoffStateCode)?.name ?? null,
    };
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

    /**
     * Posting this load to a declared trip (2026-08-31, Cargo Space).
     *
     * Same checks the customer path runs: the trip is active, has not
     * departed, is actually carrying freight, and has room for THIS load
     * measured against what the rider is already committed to. Validated
     * up here, before any money is calculated, so a refusal costs the
     * sender nothing.
     */
    let postedTrip: any = null;
    if (dto.tripId) {
      if (!this.driversService?.getTripForParcel) {
        throw new BadRequestException('Trip posting is unavailable right now.');
      }
      const totalKg = (dto.stops ?? []).reduce(
        (sum: number, st: any) => sum + (Number(st?.weightKg ?? 0) || 0), 0,
      ) || Number((dto as any).weightKg ?? 0);
      postedTrip = await this.driversService.getTripForParcel(String(dto.tripId), totalKg);
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

    /**
     * Multi-package runs (2026-08-16): when stops carry their own
     * category/weight, each package prices and dwells on ITS OWN inputs.
     * The run weight becomes the sum of package weights (payload cap
     * checks the real load, not a client-supplied total), and each
     * stop's dwell reflects what the driver actually handles there.
     */
    const hasPackages = dto.stops.some((st) => st.categoryCode || st.weightKg != null);
    let packages: Array<{ categoryCode: string; weightKg: number }> | undefined;
    let perStopDwell: number[] | null = null;
    let packagePcts: number[] = [];
    let runWeightKg = dto.weightKg;
    let totalDwellMin = perStopDwellMin * dto.stops.length;
    if (hasPackages) {
      packages = dto.stops.map((st) => ({
        categoryCode: st.categoryCode ?? dto.categoryCode,
        weightKg:     Number(st.weightKg ?? 0),
      }));
      runWeightKg = packages.reduce((sum, pkg) => sum + pkg.weightKg, 0);
      perStopDwell = [];
      for (const pkg of packages) {
        const cat = await this.pricing.getCategoryByCode(pkg.categoryCode);
        perStopDwell.push(this.pricing.computeStopDwellMinutes(card, cat, pkg.weightKg));
        packagePcts.push(Number(cat.surchargePercent) || 0);
      }
      totalDwellMin = perStopDwell.reduce((sum, m) => sum + m, 0);
    }
    const totalEtaMin = (dto.estimatedDriveMinutes ?? 0) + totalDwellMin;

    // ── Pricing ────────────────────────────────────────────────────────
    // Quote pin, same contract as the customer flow (founder
    // 2026-08-21): a valid pin books at the shown number, an expired
    // pin is refused so the review must re-show the price first.
    const quotePin = this.pricing.verifyQuotePin((dto as any).quoteToken);
    if ((dto as any).quoteToken && !quotePin) {
      throw new ConflictException({
        code:    'QUOTE_EXPIRED',
        message: 'Your quoted price expired. The review screen now shows the current price; check it and book again.',
      });
    }

    /**
     * Declared value for the whole run: the sum of the per-package
     * declarations, which is exactly what send-package.tsx sends to
     * /pricing/quote. Anything else and the review screen and the
     * booking would price two different runs.
     */
    const declaredTotalNgn = dto.stops.reduce(
      (sum, st) => sum + (Number(st.declaredValueNgn) || 0),
      0,
    );

    const breakdown = await this.pricing.computePrice({
      vehicleType:    dto.vehicleType,
      categoryCode:   dto.categoryCode,
      km:             dto.km,
      stopCount:      dto.stops.length,
      weightKg:       runWeightKg,
      /**
       * declaredValueNgn and pickupCoords were both missing here, and
       * the omission cost the RIDER rather than the sender (the pinned
       * quote wins for the sender, so nobody saw it on an invoice).
       *
       * Without pickupCoords the engine cannot detect the pickup state,
       * so resolveRegion falls back to the national rate multiplier and
       * every Lagos business run priced driverEarnings at up-country
       * rates. Without declaredValueNgn there is no high-value premium,
       * so the driver's card-set share of it was zero on exactly the
       * runs that carry the most risk. The stored priceBreakdown also
       * stopped summing to the stored price, and any booking that
       * arrived without a pin was charged the lower recomputed number.
       *
       * The customer path had the identical bug and was fixed on
       * 2026-08-21 (screen 2,134, charge 1,668). This is the same fix on
       * the business path, which was missed at the time.
       *
       * latitude/longitude, NOT lat/lng: the engine reads
       * pickupCoords.latitude, and the mismatch is silent because the
       * field is optional.
       */
      declaredValueNgn: declaredTotalNgn > 0 ? declaredTotalNgn : undefined,
      pickupCoords: { latitude: dto.pickupLat, longitude: dto.pickupLng },
      /**
       * dropoffCoords is deliberately NOT passed. A run has N stops and
       * no single dropoff, and send-package.tsx does not send one when
       * it quotes, so inventing one here would apply a zone-surcharge
       * tier the sender was never quoted and re-open the same
       * quote-versus-charge gap in the other direction. Zone tiering for
       * multi-stop runs needs a decision about which stop defines the
       * corridor before either side can send it.
       */
      estimatedDwellMinutes: totalDwellMin,
      scheduledAt:    dto.scheduledAt ? new Date(dto.scheduledAt) : (quotePin?.pricedAt ?? undefined),
      isInterState:   dto.isInterState,
      isLongDistance: dto.isLongDistance,
      isRecurring:    dto.isRecurring,
      packages,
      // One handover per parcel dropped at a pickup counter, plus one per
      // parcel delivered into a counter.
      partnerStoreTouches:
        (dto.pickupStoreId ? dto.stops.length : 0) +
        dto.stops.filter((st) => st.destinationStoreId).length,
    });

    /**
     * Per-package price attribution for the itemized receipt. Each
     * package weighs (1 + its surcharge pct); shares scale to the run
     * total so they always sum exactly, with the last package absorbing
     * rounding drift. Single-category legacy runs split equally.
     */
    const attributePackagePrices = (): number[] | null => {
      const n = dto.stops.length;
      // Carriage only: counter handling is a flat disbursement with its
      // own line, so it must not be spread across the packages as well.
      const total = Number(breakdown.customer.total) - Number(breakdown.customer.partnerHandling ?? 0);
      if (!n || !Number.isFinite(total)) return null;
      const weights = hasPackages && packagePcts.length === n
        ? packagePcts.map((pct) => 1 + pct / 100)
        : Array(n).fill(1);
      const wSum = weights.reduce((sum, w) => sum + w, 0);
      const shares = weights.map((w) => Math.round((total * w / wSum) * 100) / 100);
      const drift = Math.round((total - shares.reduce((sum, x) => sum + x, 0)) * 100) / 100;
      shares[n - 1] = Math.round((shares[n - 1] + drift) * 100) / 100;
      return shares;
    };
    const packageShares = attributePackagePrices();

    /**
     * Partner counter handling (founder 2026-08-16: "once the store is
     * involved we have to pay them"). A counter is paid for every parcel
     * it touches: once when the sender drops the run off there, and once
     * for each parcel delivered into a counter. The rate is a catalogue
     * row, so it moves without a deploy.
     *
     * It rides on the per-package share too, otherwise the receipt lines
     * would not add up to what the sender is charged.
     */
    // Added to customer.total by the pricing engine via
    // partnerStoreTouches. Stored on the delivery for reconciliation and
    // shown as its own receipt line; deliberately NOT folded into the
    // per-package prices, or the same money appears twice on the receipt.
    const partnerHandlingNgn = Number(breakdown.customer.partnerHandling ?? 0);

    /**
     * Pay-per-booking (founder 2026-08-15: "we are not a bank"). If the
     * account still holds legacy credit covering the whole fare, it
     * drains here exactly as before. Otherwise the booking is created
     * UNPAID and a Flutterwave checkout is initiated: the paid-dispatch
     * gate keeps it away from drivers until the webhook confirms escrow,
     * and the 1-hour expiry sweep cleans up abandoned checkouts.
     */
    // Counter handling is already inside customer.total (added by the
    // pricing engine from partnerStoreTouches), so this stays the single
    // charged/escrowed/refunded figure.
    // The pinned number is what gets charged, escrowed and refunded.
    const total = quotePin ? quotePin.total : Number(breakdown.customer.total);

    /**
     * Founder rule, restated 2026-08-16: SEIRS is not a bank and senders
     * never hold NGN with us. Business bookings are paid per booking
     * through Flutterwave, full stop.
     *
     * This was still reading BusinessAccount.walletBalance and silently
     * spending it: the demo account booked a 10,103 run against 51,896.92
     * of legacy credit and never saw a card screen. Withdrawable balances
     * belong to partner counters and drivers only, as EARNINGS.
     *
     * Typed as boolean rather than the literal so the legacy branches
     * below stay compiling; they are now unreachable and exist only until
     * the remaining balances are reconciled and the column is dropped.
     */
    const useCredit: boolean = false;

    // ── Transaction: Delivery + Stops + Wallet ─────────────────────────
    const txResult = await this.dataSource.transaction(async (mgr) => {
      // CRITICAL (credit path): re-read the account row WITH a pessimistic
      // write lock so two concurrent bookings can't both drain the same
      // legacy balance. The Flutterwave path never touches the balance.
      let liveBalance = 0;
      if (useCredit) {
        const lockedBiz = await mgr.createQueryBuilder(BusinessAccount, 'b')
          .setLock('pessimistic_write')
          .where('b.id = :id', { id: biz.id })
          .getOne();
        if (!lockedBiz) {
          throw new NotFoundException('Business account vanished mid-transaction.');
        }
        liveBalance = Number(lockedBiz.walletBalance);
        if (liveBalance < total) {
          throw new BadRequestException(
            `Another booking used your remaining credit while you were submitting. ` +
            `Current credit: ₦${liveBalance.toFixed(2)} - please retry (this booking will pay via Flutterwave).`,
          );
        }
      }

      const trackingCode = this.generateTrackingNumber();

      const delivery = mgr.create(Delivery, {
        trackingCode,
        // Consent as a timestamp, same contract as the customer path:
        // the business review's checkbox was collected but never sent
        // or stored until 2026-08-23.
        termsAcceptedAt: (dto as any).termsAccepted ? new Date() : null,
        customer:       { id: userId } as any,
        pickupAddress:  dto.pickupAddress,
        pickupLat:      dto.pickupLat,
        pickupLng:      dto.pickupLng,
        pickupStoreId:  dto.pickupStoreId ?? null,
        partnerHandlingNgn,
        // For single-stop bookings, populate dropoff* too so the legacy
        // single-leg dispatcher / driver app keeps working until phase 5
        // wires stops everywhere.
        dropoffAddress: dto.stops.length === 1 ? dto.stops[0].address : null,
        dropoffLat:     dto.stops.length === 1 ? dto.stops[0].lat     : null,
        dropoffLng:     dto.stops.length === 1 ? dto.stops[0].lng     : null,
        isMultiStop:    dto.stops.length > 1,
        /* Offered to ONE rider, the one whose trip it is. tripOfferedAt
           starts the clock the expiry cron reads, so a sender's money
           never waits on a silent phone. */
        tripId:         postedTrip ? postedTrip.id : null,
        tripOfferedAt:  postedTrip ? new Date() : null,
        packageDescription: dto.packageDescription ?? category.name,
        categoryCode:   dto.categoryCode,
        weightKg:       dto.weightKg,
        vehicleType:    dto.vehicleType,
        price:          quotePin ? quotePin.total : breakdown.customer.total,
        driverEarnings: breakdown.driver.total,
        distanceKm:     dto.km,
        rateCardSnapshotId:    breakdown.rateCardSnapshotId,
        priceBreakdown:        breakdown,
        estimatedDriveMinutes: dto.estimatedDriveMinutes ?? 0,
        estimatedDwellMinutes: totalDwellMin,
        estimatedTotalMinutes: totalEtaMin,
        optimizedWaypointOrder: dto.optimizedWaypointOrder ?? null,
        routeWasAutoOptimized:  !!dto.routeWasAutoOptimized,
        // Night-ops build 2026-08-11: the slot used to be priced (rate
        // cards see scheduledAt) but never STORED, so scheduled business
        // bookings surfaced to drivers immediately. Persisting it lets
        // the available-jobs feed hold them until 15 min before the slot.
        scheduledFor: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        status: DeliveryStatus.PENDING,
        source: DeliverySource.BUSINESS_APP,
        // Credit-paid bookings are funded the moment they book; card
        // bookings stay NULL until the webhook confirms escrow (the
        // paid-dispatch gate keys off this).
        paymentHeldAt: useCredit ? new Date() : null,
      } as any);
      const savedDelivery = await mgr.save(delivery);

      // Per-stop verification codes: dedupe within the batch (a 5-stop
      // run picking the same random code twice would violate the
      // partial unique index).
      const usedStopCodes = new Set<string>();
      const nextStopCode = () => {
        let c = generateStopCode();
        while (usedStopCodes.has(c)) c = generateStopCode();
        usedStopCodes.add(c);
        return c;
      };

      const usedPkgCodes = new Set<string>();
      const nextPackageCode = () => {
        let c = generatePackageCode();
        while (usedPkgCodes.has(c)) c = generatePackageCode();
        usedPkgCodes.add(c);
        return c;
      };

      const stopRows = dto.stops.map((s, idx) => mgr.create(DeliveryStop, {
        deliveryId:    savedDelivery.id,
        sequenceOrder: s.sequenceOrder ?? idx + 1,
        // Per-stop verification code (2026-08-09): each recipient can
        // only claim THEIR stop, not the whole run. Same alphabet as
        // tracking codes, STP- prefix so support can tell them apart.
        stopCode:      nextStopCode(),
        // Public per-package tracking code: every package is trackable
        // on /track by its own receiver, not just the run's sender.
        packageTrackingCode: nextPackageCode(),
        packagePhotoUrls:   s.packagePhotoUrls ?? null,
        packageDescription: s.packageDescription ?? null,
        categoryCode:       s.categoryCode ?? dto.categoryCode ?? null,
        weightKg:           s.weightKg ?? null,
        packagePriceNgn:    packageShares ? packageShares[idx] : null,
        receiverFirstName:     s.receiverFirstName ?? null,
        receiverLastName:      s.receiverLastName ?? null,
        declaredValueNgn:      s.declaredValueNgn ?? null,
        fallbackPref:          s.fallbackPref ?? null,
        fallbackNeighbourName: s.fallbackNeighbourName ?? null,
        destinationStoreId:    s.destinationStoreId ?? null,
        address:       s.address,
        lat:           s.lat,
        lng:           s.lng,
        recipientName: s.recipientName,
        recipientPhone: s.recipientPhone,
        notes:         s.notes ?? null,
        estimatedDwellMinutes: perStopDwell ? perStopDwell[idx] : perStopDwellMin,
        status:        DeliveryStopStatus.PENDING,
      }));

      // Scale guard: at ~1M orders/day the accumulated stop-code table
      // makes random clashes with HISTORY a real event (birthday math:
      // ~0.03% per code after a year). One indexed IN query catches
      // them; clashing rows regenerate before the insert so the partial
      // unique index never fails the whole booking transaction.
      const batchCodes = stopRows.map(r => r.stopCode!).filter(Boolean);
      if (batchCodes.length > 0) {
        const clashes: Array<{ stopCode: string }> = await mgr.query(
          `SELECT "stopCode" FROM delivery_stops WHERE "stopCode" = ANY($1)`,
          [batchCodes],
        );
        if (clashes.length > 0) {
          const clashSet = new Set(clashes.map(c => c.stopCode));
          for (const row of stopRows) {
            if (row.stopCode && clashSet.has(row.stopCode)) {
              row.stopCode = nextStopCode();
            }
          }
        }
      }

      const pkgCodes = stopRows.map(r => r.packageTrackingCode!).filter(Boolean);
      if (pkgCodes.length > 0) {
        const pkgClashes: Array<{ packageTrackingCode: string }> = await mgr.query(
          `SELECT "packageTrackingCode" FROM delivery_stops WHERE "packageTrackingCode" = ANY($1)`,
          [pkgCodes],
        );
        if (pkgClashes.length > 0) {
          const clashSet = new Set(pkgClashes.map(c => c.packageTrackingCode));
          for (const row of stopRows) {
            if (row.packageTrackingCode && clashSet.has(row.packageTrackingCode)) {
              row.packageTrackingCode = nextPackageCode();
            }
          }
        }
      }

      await mgr.save(stopRows);

      // ── Wallet debit + ledger (uses live row-locked balance) ────────
      if (!useCredit) {
        return { delivery: savedDelivery, stops: stopRows, breakdown, wallet: null as any };
      }

      const balBefore = liveBalance;
      const balAfter  = balBefore - total;
      /**
       * At the rate the Fee Catalogue sets, not a hardcoded one.
       *
       * This was `total / 100` with a comment saying it mirrored the
       * customer-side rate. It mirrors it only while
       * loyalty_points_per_1000_ngn is 10, which is the one value where
       * 1 point per 100 naira and 10 points per 1,000 are the same
       * number (audit, 2026-08-28). Unchanged today, correct if the row
       * ever moves.
       */
      const pointsPer1000 = Number(
        await this.fees.getValueOr('loyalty_points_per_1000_ngn', 10),
      );
      const earnedPoints = Math.floor((total / 1000) * pointsPer1000);
      await mgr.update(BusinessAccount, biz.id, {
        walletBalance: balAfter,
        loyaltyPoints: biz.loyaltyPoints + earnedPoints,
      });
      const tx = mgr.create(BusinessWalletTx, {
        businessAccountId: biz.id,
        type:           'debit',
        amount:         total,
        description:    `Delivery - ${dto.stops.length} stop(s), ${dto.vehicleType}, ${category.name}`,
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

    if (useCredit) {
      return { ...txResult, payment: { method: 'credit' as const } };
    }

    // Unpaid booking: hand the app a Flutterwave checkout. The paid-
    // dispatch gate holds the job until the webhook confirms escrow.
    const owner = await this.usersRepo.findOne({ where: { id: userId } });
    if (!owner) throw new NotFoundException('Account not found.');
    const init = await this.paymentsService.initiateCardPayment(
      txResult.delivery as any,
      owner,
      { redirectUrl: 'seirsbusiness://payment-callback' },
    );
    return {
      ...txResult,
      payment: {
        method:           'flutterwave' as const,
        authorizationUrl: init.authorizationUrl,
        reference:        init.reference,
      },
    };
  }

  // ── Stop-level transitions (called by driver app) ────────────────────

  /**
   * Driver tapped "Arrived at stop". Stamps arrivedAt + flips status.
   * If the stop is the first one, also marks the parent Delivery as
   * actualStartedAt (first arrival = trip started).
   */
  /**
   * The driver assigned to the parent delivery, or nobody (audit
   * 2026-08-14).
   *
   * The controller carried a comment saying driver identity was checked
   * "at the matching/dispatch layer" and that the service validated
   * ownership. Neither was true: these two methods looked up the stop,
   * checked its status, and wrote. Any authenticated account could walk
   * a stranger's multi-stop route stop by stop, and the first arrival
   * flips the parent delivery to IN_TRANSIT.
   *
   * Optional actor so internal callers (dispatch, CSV import, the
   * recurring-template cron) stay trusted; only the HTTP layer passes
   * one, because that is the only place an untrusted caller appears.
   */
  private async assertStopDriver(deliveryId: string, actorUserId?: string) {
    if (!actorUserId) return;
    const delivery = await this.deliveriesRepo.findOne({
      where: { id: deliveryId },
      relations: ['driver', 'driver.user'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.driver?.user?.id !== actorUserId) {
      throw new ForbiddenException('Only the driver assigned to this route can update its stops.');
    }
  }

  async markStopArrived(deliveryId: string, stopId: string, actorUserId?: string) {
    await this.assertStopDriver(deliveryId, actorUserId);
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
   * Driver tapped "Delivered" - recipient has the package. Stamps
   * deliveredAt. If this was the last stop, flips the parent Delivery
   * to delivered + stamps actualCompletedAt.
   */
  async markStopDelivered(
    deliveryId: string,
    stopId: string,
    proofPhotoUrls?: string[],
    recipientSignatureUrl?: string,
    actorUserId?: string,
  ) {
    await this.assertStopDriver(deliveryId, actorUserId);
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

  // Bulk CSV upload removed 2026-08-24 (founder decision): the
  // multi-package Send flow covers the same need and works. The CSV
  // path never did, because parseCsv read columns by position while
  // this method read them by name, so no CSV could ever validate.

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

  /**
   * fundWallet is GONE (founder 2026-08-16: "we are not a bank"). Nobody
   * deposits money with SEIRS; bookings pay per booking via Flutterwave
   * and legacy balances drain against fares in createDelivery.
   */
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

  // ─── Business Sender: Cancel scheduled delivery (Spec V8 - B13) ──────────
  /**
   * Change an order after booking it.
   *
   * There was no edit path at all: a sender who mistyped an address or
   * wanted to add a package had to cancel and rebook, losing the
   * tracking code and any payment already taken (founder 2026-08-19).
   *
   * What may change depends on how far the order has gone:
   *
   *   unpaid and pending  - everything, nothing is committed yet
   *   paid, any stage     - instructions only
   *   picked up or later  - nothing, the parcel is in someone's hands
   *
   * Once money has changed hands the destination is fixed, full stop
   * (founder 2026-08-19). The first cut let a paid order keep its
   * coordinates but change its address TEXT, which is a hole: pay for a
   * short hop, retype the address as somewhere across the state, and
   * either the driver works from contradictory information or the extra
   * distance is free. The fare priced a specific journey; changing the
   * journey means cancelling for a refund and booking the real one.
   *
   * Editing before payment is where this belongs, which is why the send
   * flow ends on a review step rather than charging straight away.
   */
  async editMyDelivery(
    userId: string,
    deliveryId: string,
    patch: {
      dropoffAddress?: string;
      dropoffLat?: number;
      dropoffLng?: number;
      recipientName?: string;
      recipientPhone?: string;
      deliveryInstructions?: string;
    },
  ) {
    const biz = await this.getBizAccount(userId);
    await this.requireOwner(userId, biz.id);

    const delivery = await this.deliveriesRepo.findOne({
      where: { id: deliveryId },
      relations: ['customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.customer?.id !== userId && biz.ownerId !== delivery.customer?.id) {
      throw new ForbiddenException('Delivery belongs to another account.');
    }

    const status = String(delivery.status);
    if (!['pending', 'assigned'].includes(status)) {
      throw new BadRequestException(
        'This delivery has already been collected, so it can no longer be changed. Contact support if something is wrong.',
      );
    }

    const paid = Boolean((delivery as any).paymentHeldAt);

    const wantsJourneyChange =
      patch.dropoffAddress !== undefined ||
      patch.dropoffLat !== undefined ||
      patch.dropoffLng !== undefined ||
      patch.recipientName !== undefined ||
      patch.recipientPhone !== undefined;

    if (paid && wantsJourneyChange) {
      throw new BadRequestException(
        'This order is already paid, so the destination and receiver are fixed: the fare was calculated for this exact journey. ' +
        'You can still add or change instructions for the driver. To send somewhere else, cancel for a refund and book again.',
      );
    }

    /**
     * Two bugs lived in this block until 2026-08-29, both found while
     * giving the customer app the same ability.
     *
     * 1. IT NEVER RE-PRICED. An unpaid order could have its dropoff
     *    moved anywhere and the raw column write left distanceKm and
     *    price exactly as booked. Book Ikeja to Yaba for twelve
     *    kilometres, edit the destination to Abuja, pay the twelve
     *    kilometre fare, and a rider is dispatched to drive seven
     *    hundred kilometres for it. The fare has to follow the journey.
     *
     * 2. IT WROTE COLUMNS THAT DO NOT EXIST. recipientName and
     *    recipientPhone belong to DeliveryStop, not Delivery, whose own
     *    fields are receiverFirstName, receiverLastName and
     *    receiverPhone. TypeORM rejects an unknown property, so every
     *    receiver edit threw. Nothing caught it because no screen has
     *    ever called this endpoint: businessApi.editDelivery has been
     *    wiring with nothing on the end of it.
     *
     * Anything that changes what was priced now goes through
     * DeliveriesService.editUnpaidBooking, the single path that
     * re-measures the route and re-prices through the active rate card.
     * Instructions stay here: they change nothing that was priced and
     * remain open until pickup, which is the whole point of the staged
     * policy above.
     */
    const updated: string[] = [];
    let priceBeforeNgn: number | null = null;
    let priceAfterNgn:  number | null = null;

    if (!paid && wantsJourneyChange) {
      const mapped: Record<string, any> = {};
      if (patch.dropoffAddress !== undefined) mapped.dropoffAddress = patch.dropoffAddress.trim();
      if (patch.dropoffLat     !== undefined) mapped.dropoffLat     = patch.dropoffLat;
      if (patch.dropoffLng     !== undefined) mapped.dropoffLng     = patch.dropoffLng;
      if (patch.recipientPhone !== undefined) mapped.receiverPhone  = patch.recipientPhone.trim();
      if (patch.recipientName  !== undefined) {
        // One field on the way in, two columns on the way out. Everything
        // after the first space is the surname; a single word leaves the
        // surname empty rather than duplicating the first name.
        const whole = patch.recipientName.trim().replace(/\s+/g, ' ');
        const cut   = whole.indexOf(' ');
        mapped.receiverFirstName = cut === -1 ? whole : whole.slice(0, cut);
        mapped.receiverLastName  = cut === -1 ? ''    : whole.slice(cut + 1);
      }

      const res = await this.deliveriesService.editUnpaidBooking(
        deliveryId,
        delivery.customer!.id,
        mapped,
      );
      priceBeforeNgn = res.priceBeforeNgn;
      priceAfterNgn  = res.priceAfterNgn;
      updated.push(...Object.keys(patch).filter(k => k !== 'deliveryInstructions'));
    }

    // Instructions are not priced, so they are written directly and stay
    // editable after payment, right up to pickup.
    if (patch.deliveryInstructions !== undefined) {
      await this.deliveriesRepo.update(deliveryId, {
        deliveryInstructions: patch.deliveryInstructions.trim(),
      } as any);
      updated.push('deliveryInstructions');
    }

    if (updated.length === 0) {
      throw new BadRequestException('Nothing to change.');
    }

    return {
      updated,
      editableNow: paid ? ['deliveryInstructions'] : ['everything'],
      priceBeforeNgn,
      priceAfterNgn,
      priceChanged:
        priceBeforeNgn != null && priceAfterNgn != null &&
        Math.abs(priceAfterNgn - priceBeforeNgn) >= 0.01,
    };
  }

  async cancelMyDelivery(userId: string, deliveryId: string, reason?: string) {
    const biz = await this.getBizAccount(userId);
    await this.requireOwner(userId, biz.id);

    const delivery = await this.deliveriesRepo.findOne({
      where: { id: deliveryId },
      relations: ['customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.customer?.id !== userId && biz.ownerId !== delivery.customer?.id) {
      throw new ForbiddenException('Delivery belongs to another account.');
    }
    if (![DeliveryStatus.PENDING, DeliveryStatus.ASSIGNED].includes(delivery.status as any)) {
      throw new BadRequestException(
        `Cannot cancel a ${delivery.status} delivery - only pending or assigned orders can be cancelled.`,
      );
    }

    this.logger.warn(`BUSINESS_CANCEL deliveryId=${deliveryId} byUser=${userId} reason="${(reason ?? '').slice(0, 200)}"`);

    // Route through DeliveriesService rather than writing the column
    // directly (audit 2026-08-14). The direct write skipped every side
    // effect that hangs off the transition: the escrow refund above all,
    // so a business that cancelled a paid booking got no money back, but
    // also the WS broadcast, the chat system message, the delivery event
    // log and the partner webhook fan-out.
    await this.deliveriesService.updateStatus(delivery.id, DeliveryStatus.CANCELLED);
    return { ok: true, status: 'cancelled' };
  }

  // ─── Business profile editor (Spec V8 - B21) ────────────────────────────
  async getBusinessProfile(userId: string) {
    const biz = await this.getBizAccount(userId);
    return {
      id:              biz.id,
      companyName:     biz.companyName,
      rcNumber:        biz.rcNumber,
      businessAddress: biz.businessAddress,
      state:           biz.state,
      city:            biz.city,
      streetAddress:   biz.streetAddress,
      status:          biz.status,
      walletBalance:   Number(biz.walletBalance ?? 0),
      createdAt:       biz.createdAt,
    };
  }

  async updateBusinessProfile(userId: string, body: {
    companyName?: string; rcNumber?: string;
    businessAddress?: string; state?: string; city?: string; streetAddress?: string;
  }) {
    const biz = await this.getBizAccount(userId);
    await this.requireOwner(userId, biz.id);

    const updates: Partial<BusinessAccount> = {};
    if (body.companyName     !== undefined) updates.companyName     = body.companyName.trim();
    if (body.rcNumber        !== undefined) {
      if (!isValidRcNumber(body.rcNumber)) throw new BadRequestException(RC_NUMBER_ERROR);
      updates.rcNumber = canonicalRcNumber(body.rcNumber);
    }
    if (body.businessAddress !== undefined) updates.businessAddress = body.businessAddress.trim();
    if (body.state           !== undefined) updates.state           = body.state.trim();
    if (body.city            !== undefined) updates.city            = body.city.trim();
    if (body.streetAddress   !== undefined) updates.streetAddress   = body.streetAddress.trim();

    if (updates.companyName != null && updates.companyName.length < 2) {
      throw new BadRequestException('Company name must be at least 2 characters.');
    }
    await this.bizRepo.update(biz.id, updates);
    return this.getBusinessProfile(userId);
  }

  /**
   * Only the owner acts on a business account.
   *
   * Team members were removed entirely (founder 2026-08-19): the roles
   * were advertised in the UI as access restrictions while being
   * enforced on three routes out of dozens, which is a false security
   * claim rather than an unfinished feature. Anyone reintroducing
   * multi-user access starts by enforcing it everywhere, not by adding
   * a screen.
   */
  private async requireOwner(userId: string, businessAccountId: string): Promise<void> {
    const biz = await this.bizRepo.findOne({ where: { id: businessAccountId } });
    if (!biz) throw new NotFoundException('Business account not found.');
    if (biz.ownerId !== userId) {
      throw new ForbiddenException('Only the account owner can do this.');
    }
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
      // Identity of the SHOP (2026-08-12), distinct from the owner's
      // BIZ- account ID. The dashboard used to print the account ID
      // under "Partner Store", which read as though it were a partner
      // identifier. hasLocation surfaces the dispatch-blocking gap.
      storeCode:   (store as any).storeCode ?? null,
      storeName:   store.storeName,
      hasLocation: (store as any).storeLat != null && (store as any).storeLng != null,
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
      amount:         await this.fees.getValueOr('partner_store_handling_ngn', PER_PACKAGE_RATE_FALLBACK),
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

    // Build daily buckets. The rate is read once so the statement and
    // the credit that produced it always agree.
    /**
     * What the shop keeps, estimated at the SMALLEST tier (2026-08-28).
     *
     * The handling fee is tiered by weight and split with the platform.
     * This screen used the medium tier for every parcel and carried a
     * comment saying "the statement and the credit that produced it
     * always agree". They do not agree, and cannot: BusinessPackage has
     * no weight column, so this statement has no way to know which tier
     * any given parcel was actually charged at.
     *
     * The medium tier therefore overstated systematically. Pricing's own
     * note says the small end is "where most parcels are", so a counter
     * handling ordinary parcels saw 350.00 each and was credited 210.00.
     * A partner earnings screen that overstates is how a counter network
     * learns not to believe its own numbers.
     *
     * Estimating at the smallest tier reverses the error: a partner is
     * shown the least they can have earned and is credited that or more.
     * Being paid more than the screen promised is not a complaint.
     *
     * The real fix is recording the weight on the package, which needs a
     * column and a migration. Until then this errs toward the partner.
     */
    const [tierFee, sharePct] = await Promise.all([
      this.fees.getValueOr('counter_fee_small_ngn', PER_PACKAGE_RATE_FALLBACK),
      this.fees.getValueOr('counter_partner_share_pct', 70),
    ]);
    const perPackageRate = Math.round(tierFee * (sharePct / 100));
    const dayMap = new Map<string, { amount: number; packages: number }>();
    for (const pkg of collectedPkgs) {
      const d   = new Date(pkg.collectedAt!);
      const key = d.toISOString().slice(0, 10);
      const cur = dayMap.get(key) ?? { amount: 0, packages: 0 };
      cur.amount   += perPackageRate;
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
      perPackageRate,
      nextPayoutDate: nextMonday.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'short' }),
      days,
      payouts,
    };
  }

  // ─── Partner Store: Settings ──────────────────────────────────────────────────

  async getSettings(userId: string) {
    const store = await this.getPartnerStore(userId);

    /**
     * The approved storefront photo, alongside the raw column.
     *
     * partner_stores.storefrontPhotoUrl is written the moment a partner
     * uploads, so it is the PENDING file as often as the accepted one.
     * The app shows this photo as the shop's own picture, and an
     * unreviewed image becoming a shop's face is exactly what the review
     * exists to prevent. The column stays in the payload because other
     * callers still read it; this is the one to render.
     */
    const [row] = await this.storeRepo.manager.query(
      `SELECT "url" FROM "kyc_documents"
        WHERE "ownerType" = 'partner_store' AND "ownerId" = $1
          AND "docId" = 'storefront_photo' AND "status" = 'approved'
        LIMIT 1`,
      [store.id],
    ).catch(() => [] as any[]);

    return { ...store, approvedStorefrontPhotoUrl: row?.url ?? null };
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
