import {
  Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThanOrEqual, Repository, In, Not } from 'typeorm';
import { StoreDropoff, DropoffMode, DropoffStatus } from './store-dropoff.entity';
import { PartnerStore, PartnerStoreStatus } from '../business/partner-store.entity';
import { PartnerSponsorship, SponsorshipStatus } from './partner-sponsorship.entity';
import { User } from '../users/user.entity';
import { FeesService } from '../fees/fees.service';
import { IdentityService } from '../identity/identity.service';
import { HandoffMethod, HandoffStage } from '../identity/handoff-record.entity';
import { MailService } from '../mail/mail.service';
import { secureCode } from '../common/utils/auth-codes';

// "In store" means physically present at the pickup or dropoff location —
// these statuses count against capacity, accrue storage fees, etc.
const IN_STORE_STATUSES: DropoffStatus[] = [
  DropoffStatus.RECEIVED_AT_STORE,
  DropoffStatus.AWAITING_DRIVER,
  DropoffStatus.AT_DROPOFF_STORE,
  DropoffStatus.AWAITING_COLLECTION,
];

// Every status where the code pair is still "live" and must therefore
// be unambiguous. Terminal rows (collected/cancelled) may share backup
// codes with newer bookings; lookups exclude them.
const ACTIVE_STATUSES: DropoffStatus[] = [
  DropoffStatus.SCHEDULED,
  DropoffStatus.RECEIVED_AT_STORE,
  DropoffStatus.AWAITING_DRIVER,
  DropoffStatus.DRIVER_EN_ROUTE,
  DropoffStatus.IN_TRANSIT,
  DropoffStatus.AT_DROPOFF_STORE,
  DropoffStatus.AWAITING_COLLECTION,
  DropoffStatus.RETURN_TRIGGERED,
];

// Crockford-style alphabet (no I L O 0 1) — same as auth-codes.ts.
// Crypto-secure code generation via the shared primitive (2026-08-09):
// Math.random state-recovery would have let an attacker predict drop +
// backup codes. Alphabet stays no-lookalike for counter reads.
function generateBackupCode(): string {
  return secureCode(6);
}

function generateDropCode(): string {
  // 12-char prefixed code printed on labels, e.g. SDR-A7K2P9X3
  return 'SDR-' + secureCode(8);
}

@Injectable()
export class PartnerStoreService {
  private readonly logger = new Logger(PartnerStoreService.name);

  constructor(
    @InjectRepository(StoreDropoff)         private dropoffRepo:     Repository<StoreDropoff>,
    @InjectRepository(PartnerStore)         private storeRepo:       Repository<PartnerStore>,
    @InjectRepository(User)                 private usersRepo:       Repository<User>,
    @InjectRepository(PartnerSponsorship)   private sponsorshipRepo: Repository<PartnerSponsorship>,
    private readonly feesService:    FeesService,
    private readonly identityService: IdentityService,
    private readonly mailService:    MailService,
  ) {}

  // ── Spec V8 §4.11 — Sponsored Placement subscriptions ─────────────────────

  async getMySponsorship(userId: string) {
    const store = await this.getStoreForUser(userId);
    const row = await this.sponsorshipRepo.findOne({
      where: { partnerStoreId: store.id },
    });
    const monthlyPriceNgn = await this.feesService.getValueOr('partner_sponsored_placement', 25000);
    return {
      store:    { id: store.id, businessName: store.storeName },
      monthlyPriceNgn,
      sponsorship: row ?? null,
    };
  }

  async activateSponsorship(userId: string) {
    const store = await this.getStoreForUser(userId);
    const monthlyFeeNgn = await this.feesService.getValueOr('partner_sponsored_placement', 25000);
    const monthlyFeeKobo = Math.round(monthlyFeeNgn * 100);

    let row = await this.sponsorshipRepo.findOne({
      where: { partnerStoreId: store.id },
    });
    const now = new Date();
    const nextInvoiceAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (!row) {
      row = this.sponsorshipRepo.create({
        partnerStore:   store,
        partnerStoreId: store.id,
        status:         SponsorshipStatus.ACTIVE,
        startedAt:      now,
        endedAt:        null,
        lastInvoicedFeeKobo: monthlyFeeKobo,
        lastInvoicedAt: now,
        nextInvoiceAt,
        invoiceCount:   1,
      });
    } else {
      row.status         = SponsorshipStatus.ACTIVE;
      row.startedAt      = row.startedAt ?? now;
      row.endedAt        = null;
      row.consecutiveFailures = 0;
      row.lastFailureReason   = null;
      // If they're reactivating mid-cycle, don't double-charge — only
      // reset the invoice clock if they have no prior bill.
      if (!row.lastInvoicedAt) {
        row.lastInvoicedFeeKobo = monthlyFeeKobo;
        row.lastInvoicedAt      = now;
        row.invoiceCount        = (row.invoiceCount ?? 0) + 1;
        row.nextInvoiceAt       = nextInvoiceAt;
      }
    }
    return this.sponsorshipRepo.save(row);
  }

  async pauseSponsorship(userId: string) {
    const store = await this.getStoreForUser(userId);
    const row = await this.sponsorshipRepo.findOne({
      where: { partnerStoreId: store.id },
    });
    if (!row) throw new NotFoundException('No active sponsorship to pause.');
    row.status  = SponsorshipStatus.PAUSED;
    row.endedAt = new Date();
    return this.sponsorshipRepo.save(row);
  }

  // Helper — find the partner store backing this user. Reuses the same
  // user.partnerStoreId pattern as scanPackage / getInventory etc.
  private async getStoreForUser(userId: string): Promise<PartnerStore> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user?.partnerStoreId) throw new ForbiddenException('Partner store not found.');
    const store = await this.storeRepo.findOne({ where: { id: user.partnerStoreId } });
    if (!store) throw new NotFoundException('Partner store not found.');
    return store;
  }

  // Monthly invoice cron — runs hourly so a sponsorship that comes due
  // mid-day still gets billed promptly. Flutterwave subscription pull
  // isn't wired yet (that's a Phase 2 payments task); for now we just
  // record the snapshot + advance nextInvoiceAt so the audit trail
  // is correct and the UI displays accurate "last invoiced" dates.
  // After 3 consecutive failures (when Flutterwave is wired), the row
  // auto-pauses and the partner is emailed.
  @Cron(CronExpression.EVERY_HOUR)
  async runSponsorshipInvoices() {
    const due = await this.sponsorshipRepo.find({
      where: { status: SponsorshipStatus.ACTIVE, nextInvoiceAt: LessThanOrEqual(new Date()) },
    });
    if (!due.length) return;

    const monthlyFeeNgn  = await this.feesService.getValueOr('partner_sponsored_placement', 25000);
    const monthlyFeeKobo = Math.round(monthlyFeeNgn * 100);

    for (const row of due) {
      try {
        // PLACEHOLDER: Flutterwave subscription pull goes here.
        //   await this.flutterwave.chargeRecurring(row.partnerStoreId, monthlyFeeKobo);
        row.lastInvoicedFeeKobo = monthlyFeeKobo;
        row.lastInvoicedAt      = new Date();
        row.invoiceCount       += 1;
        row.consecutiveFailures = 0;
        row.lastFailureReason   = null;
        row.nextInvoiceAt       = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      } catch (e: any) {
        row.consecutiveFailures += 1;
        row.lastFailureReason    = (e?.message ?? 'unknown').slice(0, 300);
        if (row.consecutiveFailures >= 3) {
          row.status  = SponsorshipStatus.PAUSED;
          row.endedAt = new Date();
          this.logger.warn(`Sponsorship ${row.id} auto-paused after ${row.consecutiveFailures} failures`);
        } else {
          // Retry in an hour
          row.nextInvoiceAt = new Date(Date.now() + 60 * 60 * 1000);
        }
      }
      await this.sponsorshipRepo.save(row);
    }
    this.logger.log(`Sponsorship invoices processed: ${due.length}`);
  }

  // ── Sender flow ────────────────────────────────────────────────────────

  // Customer schedules a drop-off in the app. Returns the codes they
  // print/write on the package and walk into the store with.
  async scheduleDropoff(senderUserId: string, body: {
    pickupStoreId:    string;
    mode:             DropoffMode;
    dropoffStoreId?:  string;
    recipientAddress?: string;
    recipientUserId?: string;
    recipientName:    string;
    recipientPhone:   string;
    // Optional: lets no-account recipients receive the collection OTP
    // by email (email + in-app only, no SMS per launch policy).
    recipientEmail?:  string;
    weightKg:         number;
    packageDescription?: string;
    declaredValueNgn?: number;
  }) {
    if (body.mode === DropoffMode.STORE_TO_STORE && !body.dropoffStoreId) {
      throw new BadRequestException('STORE_TO_STORE requires dropoffStoreId');
    }
    if (body.mode === DropoffMode.STORE_TO_DOOR && !body.recipientAddress) {
      throw new BadRequestException('STORE_TO_DOOR requires recipientAddress');
    }

    // Capacity preflight — refuse the booking up-front rather than letting
    // the customer walk in and get rejected at the counter.
    const cap = await this.getCapacity(body.pickupStoreId);
    if (cap.full) {
      throw new ForbiddenException(
        `Pickup store is at capacity (${cap.currentLoad}/${cap.maxCapacity}). Pick a different store.`,
      );
    }
    if (body.mode === DropoffMode.STORE_TO_STORE) {
      const dropCap = await this.getCapacity(body.dropoffStoreId!);
      if (dropCap.full) {
        throw new ForbiddenException(
          `Destination store is at capacity. Pick a different drop-off store or door delivery.`,
        );
      }
    }

    // Collision-safe codes (2026-08-09). dropCode carries a DB unique
    // constraint, so pre-check + regenerate rather than failing the
    // booking on a random clash. backupCode has NO unique constraint
    // (6 chars, expect duplicates at scale by birthday math), so we
    // scope it: regenerate until no ACTIVE dropoff shares it. Terminal
    // rows (collected/cancelled) may reuse old backup codes safely
    // because findByCode only matches active statuses.
    let dropCode = generateDropCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await this.dropoffRepo.exist({ where: { dropCode } });
      if (!exists) break;
      dropCode = generateDropCode();
    }
    let backupCode = generateBackupCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await this.dropoffRepo.exist({
        where: { backupCode, status: In(ACTIVE_STATUSES) },
      });
      if (!clash) break;
      backupCode = generateBackupCode();
    }

    const dropoff = this.dropoffRepo.create({
      dropCode,
      backupCode,
      senderUserId,
      pickupStoreId:      body.pickupStoreId,
      mode:               body.mode,
      dropoffStoreId:     body.dropoffStoreId ?? null,
      recipientAddress:   body.recipientAddress ?? null,
      recipientUserId:    body.recipientUserId ?? null,
      recipientName:      body.recipientName,
      recipientPhone:     body.recipientPhone,
      recipientEmail:     body.recipientEmail?.trim().toLowerCase() ?? null,
      weightKg:           body.weightKg,
      packageDescription: body.packageDescription ?? null,
      declaredValueNgn:   body.declaredValueNgn ?? 0,
      status:             DropoffStatus.SCHEDULED,
    });
    return this.dropoffRepo.save(dropoff);
  }

  // Partner staff scans the QR (or types the backup code) and confirms
  // the package details + photo + sender identity. After this, the
  // package is officially in their custody.
  async receiveAtStore(staffUserId: string, body: {
    code:             string;       // either dropCode or backupCode
    weightKg:         number;       // partner's actual weight measurement
    receivedPhotoUrl: string;       // proof photo of package on partner counter
    senderOtp:        string;       // sender shows OTP from email
  }) {
    const dropoff = await this.findByCode(body.code);
    if (dropoff.status !== DropoffStatus.SCHEDULED) {
      throw new BadRequestException(`Cannot receive — current status is ${dropoff.status}`);
    }

    // Validate the staff actually works at this store
    const staff = await this.usersRepo.findOne({ where: { id: staffUserId } });
    if (!staff || staff.partnerStoreId !== dropoff.pickupStoreId) {
      throw new ForbiddenException('You are not registered as staff for the pickup store');
    }

    // Verify sender via identity module — uses the same OTP path drivers
    // use to verify recipients. Stage = CUSTOMER_TO_STORE (sender → store).
    await this.identityService.verifyHandoff({
      deliveryId: dropoff.id, // we use dropoff id as the delivery id for handoff records pre-driver
      stage:      HandoffStage.CUSTOMER_TO_STORE,
      method:     HandoffMethod.PHYSICAL_ID,
      fromUserId: dropoff.senderUserId,
      idType:     'sender_otp',
      idNumber:   dropoff.senderUserId, // last-4 will store last-4 of user UUID — adequate for audit
      otp:        body.senderOtp,
      proofPhotoUrl: body.receivedPhotoUrl,
    } as any);

    await this.dropoffRepo.update(dropoff.id, {
      status:           DropoffStatus.RECEIVED_AT_STORE,
      weightKg:         body.weightKg,
      receivedAtStoreAt: new Date(),
      receivedPhotoUrl:  body.receivedPhotoUrl,
    });

    // Move forward into the dispatch queue
    await this.dropoffRepo.update(dropoff.id, { status: DropoffStatus.AWAITING_DRIVER });
    return this.findById(dropoff.id);
  }

  // ── Recipient flow ─────────────────────────────────────────────────────

  // Partner staff at the dropoff store releases package to recipient
  // after identity verification. Two paths supported (physical ID + OTP,
  // or SEIRS ID + typed name) — same as Spec V8 §1.17.
  async releaseToRecipient(staffUserId: string, body: {
    code:               string;
    method:             HandoffMethod;
    collectedPhotoUrl:  string;
    // Physical ID args
    idType?:            string;
    idNumber?:          string;
    otp?:               string;
    idPhotoUrl?:        string;
    // SEIRS ID args
    seirsCode?:         string;
    typedName?:         string;
  }) {
    const dropoff = await this.findByCode(body.code);
    if (![DropoffStatus.AT_DROPOFF_STORE, DropoffStatus.AWAITING_COLLECTION].includes(dropoff.status)) {
      throw new BadRequestException(`Cannot release — current status is ${dropoff.status}`);
    }

    const releaseStoreId = dropoff.dropoffStoreId ?? dropoff.pickupStoreId;
    const staff = await this.usersRepo.findOne({ where: { id: staffUserId } });
    if (!staff || staff.partnerStoreId !== releaseStoreId) {
      throw new ForbiddenException('You are not registered as staff for the release store');
    }

    if (!dropoff.recipientUserId) {
      throw new BadRequestException(
        'Recipient is unknown — only registered SEIRS users can collect via this flow',
      );
    }

    await this.identityService.verifyHandoff({
      deliveryId:  dropoff.deliveryId ?? dropoff.id,
      stage:       HandoffStage.STORE_TO_RECIPIENT,
      method:      body.method,
      fromUserId:  staffUserId,
      idType:      body.idType,
      idNumber:    body.idNumber,
      otp:         body.otp,
      idPhotoUrl:  body.idPhotoUrl,
      seirsCode:   body.seirsCode,
      typedName:   body.typedName,
      proofPhotoUrl: body.collectedPhotoUrl,
    } as any);

    await this.dropoffRepo.update(dropoff.id, {
      status:           DropoffStatus.COLLECTED,
      collectedAt:      new Date(),
      collectedPhotoUrl: body.collectedPhotoUrl,
    });
    return this.findById(dropoff.id);
  }

  // ── Reads ──────────────────────────────────────────────────────────────

  async findById(id: string) {
    const row = await this.dropoffRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Drop-off not found');
    return row;
  }

  // Accepts either the printed dropCode (SDR-XXXXXXXX) or the 6-char
  // backup code typed by hand. Server treats them identically.
  async findByCode(code: string) {
    const c = code.trim().toUpperCase();
    let row: StoreDropoff | null = null;
    if (c.startsWith('SDR-')) {
      // dropCode is DB-unique: safe to match across all statuses.
      row = await this.dropoffRepo.findOne({ where: { dropCode: c } });
    } else {
      // backupCode is 6 chars and NOT unique. Scope the match to ACTIVE
      // rows only so a terminal booking's recycled code can never
      // resolve to the wrong package. Generation regenerates on active
      // clashes, so at most one active row carries a given code.
      row = await this.dropoffRepo.findOne({
        where: { backupCode: c, status: In(ACTIVE_STATUSES) },
      });
    }
    if (!row) throw new NotFoundException('Drop-off not found');
    return row;
  }

  async listForSender(senderUserId: string) {
    return this.dropoffRepo.find({
      where: { senderUserId },
      order: { createdAt: 'DESC' },
      take:  100,
    });
  }

  async listForStore(partnerStoreId: string, opts?: { onlyActive?: boolean }) {
    const where: any = [
      { pickupStoreId: partnerStoreId },
      { dropoffStoreId: partnerStoreId },
    ];
    if (opts?.onlyActive) {
      // both sides need the active filter applied
      where[0] = { ...where[0], status: In(IN_STORE_STATUSES) };
      where[1] = { ...where[1], status: In(IN_STORE_STATUSES) };
    }
    return this.dropoffRepo.find({ where, order: { createdAt: 'DESC' }, take: 200 });
  }

  // ── Capacity ───────────────────────────────────────────────────────────

  // Real-time capacity computation. Anything physically in the store
  // counts against maxCapacity. Returned as a bucketed string for the
  // customer-facing UI per Spec V8 (Plenty / Limited / Full) and as
  // exact numbers for the partner's own dashboard.
  async getCapacity(partnerStoreId: string) {
    const store = await this.storeRepo.findOne({ where: { id: partnerStoreId } });
    if (!store) throw new NotFoundException('Partner store not found');

    const inStore = await this.dropoffRepo.count({
      where: [
        { pickupStoreId:  partnerStoreId, status: In(IN_STORE_STATUSES) },
        { dropoffStoreId: partnerStoreId, status: In(IN_STORE_STATUSES) },
      ],
    });

    const max  = store.maxCapacity;
    const pct  = max > 0 ? inStore / max : 0;
    const bucket = pct >= 1 ? 'full' : pct >= 0.85 ? 'limited' : 'plenty';
    return {
      partnerStoreId,
      currentLoad: inStore,
      maxCapacity: max,
      percent:     Math.round(pct * 100),
      bucket,                                  // for customer-facing UI
      full:        bucket === 'full',
    };
  }

  async listCapacityNearby(_lat?: number, _lng?: number, _radiusKm = 10) {
    // Stub for the customer "pick a store" screen. returns all active
    // stores with their capacity. Geofiltering by haversine moves to
    // a follow-up commit when we wire the customer UI.
    const stores = await this.storeRepo.find({ where: { status: 'active' } });
    return Promise.all(
      stores.map(async s => ({
        id:           s.id,
        storeName:    s.storeName,
        storeAddress: s.storeAddress,
        ...(await this.getCapacity(s.id)),
      })),
    );
  }

  /**
   * Public partner-store directory. Powers the marketing website's
   * /find-a-partner discovery page. Zero-auth on purpose so anyone
   * researching SEIRS can browse without an account.
   *
   * Filters:
   *   - status in ('approved', 'active')   admin has KYC-approved
   *   - acceptingNew = true                partner is currently open to drop-offs
   *   - optional `q` text search on storeName + storeAddress (ILIKE)
   *
   * Response contains only fields safe for a public page. Owner phone,
   * KYC document URLs, and capacity numbers are NOT returned. If a
   * future release adds coordinates, they get returned too so the
   * client can render a map view without a schema change on the wire.
   */
  async publicDirectory(opts: {
    q?:      string;
    limit:   number;
    offset:  number;
    lat?:    number;
    lng?:    number;
  }) {
    const qb = this.storeRepo
      .createQueryBuilder('s')
      .where('s."acceptingNew" = true')
      .andWhere('s.status IN (:...allowed)', { allowed: ['approved', 'active'] });

    if (opts.q && opts.q.trim()) {
      const term = `%${opts.q.trim()}%`;
      qb.andWhere('(s."storeName" ILIKE :t OR s."storeAddress" ILIKE :t)', { t: term });
    }

    const clamped = Math.min(Math.max(opts.limit ?? 30, 1), 100);
    qb.take(clamped).skip(opts.offset ?? 0);

    // Distance-aware ordering: when the visitor granted geolocation on
    // the /find-a-partner page and passed lat/lng in the query, prefer
    // stores with coordinates first, then sort by Haversine ascending.
    // Falls back to alphabetical when no location is provided so the
    // ordering stays stable and cheap.
    const hasUserLoc = Number.isFinite(opts.lat) && Number.isFinite(opts.lng);
    if (hasUserLoc) {
      // 6371 * 2 * asin(sqrt(sin^2(dLat/2) + cos(lat1)*cos(lat2)*sin^2(dLng/2))) km
      qb.addSelect(`
        CASE
          WHEN s."storeLat" IS NULL OR s."storeLng" IS NULL THEN NULL
          ELSE (
            6371 * 2 * asin(sqrt(
              power(sin(radians(s."storeLat"::float - :ulat) / 2), 2) +
              cos(radians(:ulat)) * cos(radians(s."storeLat"::float)) *
              power(sin(radians(s."storeLng"::float - :ulng) / 2), 2)
            ))
          )
        END
      `, 'distance_km')
      .setParameter('ulat', opts.lat)
      .setParameter('ulng', opts.lng)
      // Stores without coordinates sort last, then real distance ascending.
      .orderBy('CASE WHEN s."storeLat" IS NULL THEN 1 ELSE 0 END', 'ASC')
      .addOrderBy('distance_km', 'ASC')
      .addOrderBy('s."storeName"', 'ASC');
    } else {
      qb.orderBy('s."storeName"', 'ASC');
    }

    const { entities, raw } = await qb.getRawAndEntities();
    const total = await qb.getCount();

    return {
      total,
      limit:  clamped,
      offset: opts.offset ?? 0,
      items:  entities.map((s, i) => {
        const distanceRaw = hasUserLoc ? raw[i]?.distance_km : null;
        return {
          id:            s.id,
          storeName:     s.storeName,
          storeAddress:  s.storeAddress,
          phone:         s.phone,           // published storefront line, safe for a marketing page
          operatingDays: s.operatingDays,
          openTime:      s.openTime,
          closeTime:     s.closeTime,
          lat:           s.storeLat != null ? Number(s.storeLat) : null,
          lng:           s.storeLng != null ? Number(s.storeLng) : null,
          distanceKm:    distanceRaw != null ? Number(distanceRaw) : null,
        };
      }),
    };
  }

  // ── Partner store status (accept-incoming toggle) ──────────────────────

  // Lets a partner pause incoming bookings without going fully offline.
  // The customer-facing capacity browser filters out paused stores.
  async setStoreStatus(storeId: string, status: 'active' | 'paused', staffUserId: string) {
    const staff = await this.usersRepo.findOne({ where: { id: staffUserId } });
    if (!staff || staff.partnerStoreId !== storeId) {
      throw new ForbiddenException('You are not registered as staff for this store');
    }
    if (!['active', 'paused'].includes(status)) {
      throw new BadRequestException('status must be "active" or "paused"');
    }
    // Operational toggle now lives on `acceptingNew` (not approval `status`).
    await this.storeRepo.update(storeId, { acceptingNew: status === 'active' });
    return { storeId, status };
  }

  // ── Partner store deletion readiness ───────────────────────────────────
  // Spec V8 — partner can't shut down their store while there are
  // packages in custody. Returns a structured blocker list so the UI
  // can guide them: "Return these N overstays first" / "Release these
  // M packages awaiting collection".
  async getDeletionReadiness(partnerStoreId: string) {
    const blockers: Array<{ type: string; count: number; action: string }> = [];

    const inStore = await this.dropoffRepo.count({
      where: [
        { pickupStoreId:  partnerStoreId, status: In(IN_STORE_STATUSES) },
        { dropoffStoreId: partnerStoreId, status: In(IN_STORE_STATUSES) },
      ],
    });
    if (inStore > 0) {
      blockers.push({
        type:   'in_store_packages',
        count:  inStore,
        action: `Release the ${inStore} package${inStore === 1 ? '' : 's'} currently in your store before closing — either to recipients (use Release flow) or back to senders (mark return).`,
      });
    }

    const pendingDispatch = await this.dropoffRepo.count({
      where: { pickupStoreId: partnerStoreId, status: DropoffStatus.SCHEDULED },
    });
    if (pendingDispatch > 0) {
      blockers.push({
        type:   'scheduled_dropoffs',
        count:  pendingDispatch,
        action: `${pendingDispatch} sender${pendingDispatch === 1 ? ' has' : 's have'} a drop-off booked but not yet walked in. Cancel via ops or wait for them to arrive.`,
      });
    }

    return {
      ready:    blockers.length === 0,
      blockers,
      partnerStoreId,
    };
  }

  // ── Storage overstay listing ───────────────────────────────────────────

  // Lists packages currently in this store that have crossed the 24hr free
  // window, with hours-overdue and accrued fees computed live. Powers
  // biz.partStorage. Sorted oldest-arrival first so the most urgent
  // are at the top.
  async listOverstays(partnerStoreId: string) {
    const all = await this.dropoffRepo.find({
      where: [
        { pickupStoreId:  partnerStoreId, status: In(IN_STORE_STATUSES) },
        { dropoffStoreId: partnerStoreId, status: In(IN_STORE_STATUSES) },
      ],
    });
    const now = new Date();
    return all
      .map(d => {
        const arrivedAt = d.arrivedAtDropoffStoreAt ?? d.receivedAtStoreAt;
        const hoursInStore = arrivedAt
          ? (now.getTime() - new Date(arrivedAt).getTime()) / 3600_000
          : 0;
        const workingDays = arrivedAt ? this.workingDaysBetween(new Date(arrivedAt), now) : 0;
        return {
          id:                    d.id,
          dropCode:              d.dropCode,
          recipientName:         d.recipientName,
          recipientPhone:        d.recipientPhone,
          weightKg:              Number(d.weightKg),
          status:                d.status,
          arrivedAt:             arrivedAt?.toISOString() ?? null,
          hoursInStore:          Math.round(hoursInStore * 10) / 10,
          workingDaysInStore:    workingDays,
          storageFeesAccruedNgn: Number(d.storageFeesAccruedNgn),
          returnFeeOwedNgn:      Number((d as any).returnFeeOwedNgn ?? 0),
          // Working-day policy (2026-08-09): free until 3 working days,
          // warned at 3-4, return-eligible at 5+.
          tier:
            workingDays < 3 ? 'free' :
            workingDays < 5 ? 'warned' :
                              'return_eligible',
        };
      })
      // Show anything past the free window; partners plan collections
      // around this list.
      .filter(d => d.workingDaysInStore >= 3 || d.status === DropoffStatus.RETURN_TRIGGERED)
      .sort((a, b) => b.workingDaysInStore - a.workingDaysInStore);
  }

  // ── Storage policy (2026-08-09 model) ──────────────────────────────────
  //
  // Founder decision replacing the old daily-accrual model:
  //   - 3 WORKING days free (Sat + Sun excluded, so a partner closed for
  //     the weekend never costs the sender anything)
  //   - At 3 working days: notify the sender once ("collect within 2
  //     working days or the package returns to you")
  //   - Hard max 5 working days: status flips to RETURN_TRIGGERED and a
  //     flat return-transport fee is owed by the sender
  //   - NO storage fee build-up at any point
  //
  // Auto-charge: if PaymentsService ever exposes chargeTokenizedCard,
  // the return fee is attempted against the sender's saved card and
  // returnFeePaidAt stamps on success. Until then the fee is owed and
  // the sender pays in-app before the return delivery is arranged.

  /** Email the sender (fire-and-forget, resolves user record first). */
  private notifySender(senderUserId: string, subject: string, body: string): void {
    this.usersRepo.findOne({ where: { id: senderUserId } })
      .then(u => {
        if (!u?.email) return;
        return this.mailService.sendGeneric(u.email, u.name ?? 'there', subject, body);
      })
      .catch(() => { /* mail is best-effort */ });
  }

  /** Count working days (Mon-Fri) fully elapsed between two instants. */
  private workingDaysBetween(from: Date, to: Date): number {
    let days = 0;
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);
    while (cursor < end) {
      cursor.setDate(cursor.getDate() + 1);
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) days++;
    }
    return days;
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async enforceStoragePolicy() {
    const returnFee = await this.feesService.getValueOr('return_to_sender_fee', 1500);

    const inStore = await this.dropoffRepo.find({
      where: [
        { status: DropoffStatus.AWAITING_DRIVER },
        { status: DropoffStatus.AT_DROPOFF_STORE },
        { status: DropoffStatus.AWAITING_COLLECTION },
      ],
    });

    let notified = 0;
    let returned = 0;
    const now = new Date();

    for (const d of inStore) {
      const arrivedAt = d.arrivedAtDropoffStoreAt ?? d.receivedAtStoreAt;
      if (!arrivedAt) continue;
      const workingDays = this.workingDaysBetween(new Date(arrivedAt), now);

      if (workingDays >= 5) {
        // Hard max reached: flag for return + flat transport fee owed.
        await this.dropoffRepo.update(d.id, {
          status:           DropoffStatus.RETURN_TRIGGERED,
          returnFeeOwedNgn: returnFee,
        } as any);
        returned++;

        // Hook: attempt the sender's saved card when a tokenized-charge
        // method lands in PaymentsService. Loose-coupled + optional so
        // this cron never breaks on the missing integration.
        const pay: any = (this as any).paymentsService;
        if (pay?.chargeTokenizedCard) {
          pay.chargeTokenizedCard(d.senderUserId, returnFee, `return_to_sender:${d.dropCode}`)
            .then(() => this.dropoffRepo.update(d.id, { returnFeePaidAt: new Date() } as any))
            .catch(() => { /* fee stays owed; sender pays in-app */ });
        }

        this.notifySender(
          d.senderUserId,
          'Your package is being returned',
          `Package ${d.dropCode} was not collected within 5 working days and is being returned to you. ` +
          `A return-transport fee of NGN ${returnFee.toLocaleString()} applies. Open the SEIRS app to arrange the return.`,
        );
      } else if (workingDays >= 3 && !d.senderOverstayNotifiedAt) {
        // First warning at 3 working days. Sent exactly once.
        await this.dropoffRepo.update(d.id, {
          senderOverstayNotifiedAt: now,
        } as any);
        notified++;

        this.notifySender(
          d.senderUserId,
          'Your package is waiting for collection',
          `Package ${d.dropCode} has been waiting at the partner store for 3 working days. ` +
          `Please have it collected within 2 more working days or it will be returned to you (transport fee applies). ` +
          `No storage fees have been charged.`,
        );
      }
    }

    if (notified || returned) {
      this.logger.log(`Storage policy: warned=${notified} return-triggered=${returned}`);
    }
  }

  // ── Hybrid-account: partner store application + admin approval ────────────

  /**
   * User upgrades from "just a Business Sender" to also operate as a Partner
   * Store. Creates the PartnerStore in PENDING_REVIEW so it doesn't accept
   * drop-offs yet. Admin approves → status flips to APPROVED → user.capabilities
   * .canPartner flips true → in-app context switcher appears.
   *
   * Idempotent: if user already has an in-flight or rejected application,
   * resubmitting updates the docs and resets status to PENDING_REVIEW.
   */
  async submitPartnerApplication(
    userId: string,
    body: {
      storeName:          string;
      storeAddress:       string;
      phone:              string;
      maxCapacity?:       number;
      storefrontPhotoUrl: string;
      cacRegUrl?:         string;
      ownerIdUrl:         string;
      // Optional coordinates from a client-side Places autocomplete.
      // Nullable + validated: values outside plausible Nigeria bounds
      // are dropped rather than throwing so a picker glitch does not
      // block the whole KYC submission.
      storeLat?:          number;
      storeLng?:          number;
    },
  ) {
    // Validate coordinates (Nigeria lat 4-14, lng 2.5-15). Drop if invalid.
    const validLat = typeof body.storeLat === 'number' && body.storeLat >=  4 && body.storeLat <= 14;
    const validLng = typeof body.storeLng === 'number' && body.storeLng >= 2.5 && body.storeLng <= 15;
    const lat = validLat ? body.storeLat : null;
    const lng = validLng ? body.storeLng : null;
    if (!body.storeName?.trim() || !body.storeAddress?.trim()) {
      throw new BadRequestException('Store name and address are required.');
    }
    if (!body.storefrontPhotoUrl || !body.ownerIdUrl) {
      throw new BadRequestException('Storefront photo and owner ID are required for KYC.');
    }

    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    // If already approved + canPartner=true, nothing to do.
    if (user.capabilities?.canPartner) {
      throw new BadRequestException('You are already an approved Partner Store.');
    }

    // Re-application path: update existing record + reset status.
    let store = user.partnerStoreId
      ? await this.storeRepo.findOne({ where: { id: user.partnerStoreId } })
      : null;

    if (store) {
      await this.storeRepo.update(store.id, {
        storeName:          body.storeName.trim(),
        storeAddress:       body.storeAddress.trim(),
        storeLat:           lat != null ? String(lat) : null,
        storeLng:           lng != null ? String(lng) : null,
        phone:              body.phone?.trim() ?? '',
        maxCapacity:        body.maxCapacity ?? 50,
        storefrontPhotoUrl: body.storefrontPhotoUrl,
        cacRegUrl:          body.cacRegUrl ?? null,
        ownerIdUrl:         body.ownerIdUrl,
        status:             PartnerStoreStatus.PENDING_REVIEW,
        reviewNote:         null,
        reviewedAt:         null,
        reviewedBy:         null,
      } as any);
      store = await this.storeRepo.findOne({ where: { id: store.id } });
    } else {
      store = this.storeRepo.create({
        userId:             userId,
        storeName:          body.storeName.trim(),
        storeAddress:       body.storeAddress.trim(),
        storeLat:           lat != null ? String(lat) : null,
        storeLng:           lng != null ? String(lng) : null,
        phone:              body.phone?.trim() ?? '',
        maxCapacity:        body.maxCapacity ?? 50,
        storefrontPhotoUrl: body.storefrontPhotoUrl,
        cacRegUrl:          body.cacRegUrl,
        ownerIdUrl:         body.ownerIdUrl,
        status:             PartnerStoreStatus.PENDING_REVIEW,
      });
      await this.storeRepo.save(store);
      await this.usersRepo.update(userId, { partnerStoreId: store.id });
    }

    this.logger.log(`Partner store application submitted: userId=${userId} storeId=${store!.id}`);

    return {
      storeId:    store!.id,
      status:     store!.status,
      submittedAt: new Date().toISOString(),
      message:    'Application submitted. SEIRS will review your KYC docs within 24-48 hours.',
    };
  }

  /** User polls the status of their pending application. */
  async getMyApplication(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user?.partnerStoreId) return null;
    const store = await this.storeRepo.findOne({ where: { id: user.partnerStoreId } });
    if (!store) return null;
    return {
      storeId:     store.id,
      storeName:   store.storeName,
      status:      store.status,
      reviewNote:  store.reviewNote,
      reviewedAt:  store.reviewedAt,
      canPartner:  !!user.capabilities?.canPartner,
    };
  }

  /**
   * Admin approves a pending partner store application. Flips:
   *   1. PartnerStore.status   → APPROVED
   *   2. User.capabilities.canPartner → true
   *
   * Idempotent — calling on an already-approved store is a no-op.
   */
  async adminApproveStore(storeId: string, adminUserId: string, note?: string) {
    const store = await this.storeRepo.findOne({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Partner store not found.');

    await this.storeRepo.update(storeId, {
      status:     PartnerStoreStatus.APPROVED,
      reviewNote: note ?? null,
      reviewedAt: new Date(),
      reviewedBy: adminUserId,
    } as any);

    const owner = await this.usersRepo.findOne({ where: { id: store.userId } });
    if (owner) {
      await this.usersRepo.update(owner.id, {
        capabilities: { canSend: owner.capabilities?.canSend ?? true, canPartner: true },
      });
    }

    this.logger.log(`Partner store APPROVED: storeId=${storeId} owner=${store.userId} admin=${adminUserId}`);
    return { storeId, status: PartnerStoreStatus.APPROVED };
  }

  /**
   * Admin suspends an APPROVED partner store (founder 2026-08-10: the
   * partner capability must be reversible, e.g. for stores inactive for
   * a long stretch or misconduct). Flips:
   *   1. PartnerStore.status → SUSPENDED (+ acceptingNew off)
   *   2. User.capabilities.canPartner → false (partner UI disappears)
   * Re-approval via adminApproveStore restores everything.
   */
  async adminSuspendStore(storeId: string, adminUserId: string, note: string) {
    if (!note?.trim()) {
      throw new BadRequestException('A suspension reason is required for the audit trail.');
    }
    const store = await this.storeRepo.findOne({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Partner store not found.');

    await this.storeRepo.update(storeId, {
      status:       PartnerStoreStatus.SUSPENDED,
      acceptingNew: false,
      reviewNote:   note.trim(),
      reviewedAt:   new Date(),
      reviewedBy:   adminUserId,
    } as any);

    const owner = await this.usersRepo.findOne({ where: { id: store.userId } });
    if (owner) {
      await this.usersRepo.update(owner.id, {
        capabilities: { canSend: owner.capabilities?.canSend ?? true, canPartner: false },
      });
    }

    this.logger.log(`Partner store SUSPENDED: storeId=${storeId} owner=${store.userId} admin=${adminUserId} reason=${note}`);
    return { storeId, status: PartnerStoreStatus.SUSPENDED };
  }

  /**
   * Inactivity sweep (founder 2026-08-10): approved stores with no
   * package received in 60 days stop accepting NEW drop-offs and get
   * flagged in the review note for admin attention. Full suspension
   * stays a human decision (adminSuspendStore); this only pauses
   * intake so dormant shelves stop appearing in store pickers.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async pauseDormantStores() {
    try {
      const rows: Array<{ id: string }> = await this.storeRepo.query(
        `SELECT s.id FROM partner_stores s
         WHERE s.status = 'approved' AND s."acceptingNew" = true
           AND s."createdAt" < NOW() - INTERVAL '60 days'
           AND NOT EXISTS (
             SELECT 1 FROM store_dropoffs d
             WHERE (d."pickupStoreId" = s.id OR d."dropoffStoreId" = s.id)
               AND d."createdAt" > NOW() - INTERVAL '60 days'
           )`,
      );
      for (const r of rows) {
        await this.storeRepo.update(r.id, {
          acceptingNew: false,
          reviewNote:   'Auto-paused: no packages received in 60 days. Admin review recommended (reactivate or suspend).',
        } as any);
      }
      if (rows.length) this.logger.log(`Dormancy sweep: paused intake for ${rows.length} store(s)`);
    } catch (e: any) {
      this.logger.warn(`dormancy sweep failed: ${e?.message ?? e}`);
    }
  }

  /**
   * Admin rejects a pending partner store application. Status flips to
   * REJECTED; canPartner stays false. User can re-apply with updated docs.
   */
  async adminRejectStore(storeId: string, adminUserId: string, note: string) {
    if (!note?.trim()) {
      throw new BadRequestException('Rejection reason is required so the user knows what to fix.');
    }
    const store = await this.storeRepo.findOne({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Partner store not found.');

    await this.storeRepo.update(storeId, {
      status:     PartnerStoreStatus.REJECTED,
      reviewNote: note.trim(),
      reviewedAt: new Date(),
      reviewedBy: adminUserId,
    } as any);

    this.logger.log(`Partner store REJECTED: storeId=${storeId} reason=${note}`);
    return { storeId, status: PartnerStoreStatus.REJECTED };
  }

  /** Admin lists all pending partner store applications for review. */
  async adminListPendingApplications() {
    return this.storeRepo.find({
      where: { status: PartnerStoreStatus.PENDING_REVIEW },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Admin lists ALL partner stores across every status. Powers the /partners
   * page in the admin dashboard. Optional status filter narrows to a single
   * state (approved, suspended, etc). Ordered by most-recently-updated so
   * active stores float to the top.
   */
  async adminListAllStores(status?: string) {
    const qb = this.storeRepo
      .createQueryBuilder('s')
      .orderBy('s.updatedAt', 'DESC');
    if (status) qb.where('s.status = :status', { status });
    return qb.getMany();
  }
}
