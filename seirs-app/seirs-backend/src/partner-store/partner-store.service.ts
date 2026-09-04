import {
  Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger,
  Optional, Inject, forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThanOrEqual, Repository, In, Not, IsNull } from 'typeorm';
import { StoreDropoff, DropoffMode, DropoffStatus } from './store-dropoff.entity';
import { PartnerStore, PartnerStoreStatus } from '../business/partner-store.entity';
import { PartnerSponsorship, SponsorshipStatus } from './partner-sponsorship.entity';
import { User } from '../users/user.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { FeesService } from '../fees/fees.service';
import { PricingService } from '../pricing/pricing.service';
import { PaymentsService } from '../payments/payments.service';
import { PartnerPayout } from '../business/partner-payout.entity';
import { IdentityService } from '../identity/identity.service';
import {
  HandoffMethod, HandoffStage, HandoffRole,
} from '../identity/handoff-record.entity';
import { MailService } from '../mail/mail.service';
import { PartnerDocumentsService } from './partner-documents.service';
import { RouteDistanceService } from '../deliveries/route-distance.service';
import { secureCode } from '../common/utils/auth-codes';
import { withinWorkingHours } from '../common/utils/working-hours';
import { ParcelRecoveryService } from './parcel-recovery.service';
import { RecoveryTrigger } from './parcel-recovery-task.entity';

// "In store" means physically present at the pickup or dropoff location -
// these statuses count against capacity, accrue storage fees, etc.
//
// DRIVER_EN_ROUTE was missing until 2026-09-04 and is now included, by the
// founder's decision: "yes it should count since its still on the shelf,
// because of chain of custody".
//
// That reasoning is the right one and it is stronger than the space
// argument I raised it with. A rider being on the way to collect changes
// nothing about where the parcel is or who is answerable for it: the shop
// still has it, the shop signed for it, and the shop is who we would ask
// if it went missing in that window. A count that drops it would show a
// shelf holding fewer parcels than the shop is actually responsible for,
// which is exactly the number a custody question needs to be right.
//
// The cost is accepted and small: shops reach "full" slightly sooner, so a
// counter with a rider inbound stops taking new work a little earlier.
//
// Storage charging is NOT affected. enforceStoragePolicy keeps its own
// narrower list, deliberately, because what a shop is holding and what a
// sender is billed for are different questions.
const IN_STORE_STATUSES: DropoffStatus[] = [
  DropoffStatus.RECEIVED_AT_STORE,
  DropoffStatus.AWAITING_DRIVER,
  DropoffStatus.DRIVER_EN_ROUTE,
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

// Crockford-style alphabet (no I L O 0 1) - same as auth-codes.ts.
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

/**
 * Neighbourhood from a full street address, for the anonymous
 * directory: "12 Allen Avenue, Ikeja, Lagos" -> "Ikeja, Lagos".
 * Deliberately drops the street + number so a visitor can tell the
 * shop is nearby without being handed its door.
 */
function areaOf(address: string | null | undefined): string {
  if (!address) return 'Nigeria';
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  return parts.length <= 1 ? parts[0] ?? 'Nigeria' : parts.slice(-2).join(', ');
}

/** Open right now in Africa/Lagos (UTC+1, no DST). */
/**
 * isOpenNow lived here and is gone (2026-09-03).
 *
 * It was a second implementation of a question drivers already answered,
 * and it disagreed with the first in two ways that mattered. It could
 * not express a shop open past midnight, because it tested
 * `mins >= open && mins < close` and an 18:00 to 02:00 kiosk makes that
 * impossible: such a shop computed as closed forever. And it read
 * "no hours recorded" as CLOSED, where the driver check reads it as
 * open, on the reasoning that not answering a question is not a refusal.
 *
 * withinWorkingHours from common/utils is the single answer now. Stores
 * with no workingHours fall back to the legacy columns so nothing
 * changes for a shop that has not been migrated.
 */
function storeIsOpenNow(store: {
  workingHours?: Record<string, { enabled: boolean; start: string; end: string }> | null;
  operatingDays?: string[] | null;
  openTime?: string | null;
  closeTime?: string | null;
}): boolean {
  if (store.workingHours) return withinWorkingHours(store.workingHours as any);

  /**
   * Not migrated, so read the old columns THROUGH the new check rather
   * than keeping the old code path. Every store carries defaults nobody
   * chose, which is why these were not migrated, but a shop that opens
   * at 18:00 and closes at 02:00 should still read as open at midnight
   * whether or not anybody has touched its settings.
   */
  const days  = Array.isArray(store.operatingDays) ? store.operatingDays : null;
  const open  = store.openTime  ?? '08:00';
  const close = store.closeTime ?? '18:00';
  const LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  const shaped: Record<string, { enabled: boolean; start: string; end: string }> = {};
  for (const [key, label] of Object.entries(LABEL)) {
    shaped[key] = { enabled: days ? days.includes(label) : true, start: open, end: close };
  }
  return withinWorkingHours(shaped as any);
}

/**
 * Straight-line km between two points.
 *
 * The rate-card PricingService has no such helper. bulk.service.ts does
 * call PricingService.haversineKm, but that is a DIFFERENT class: the
 * legacy 90-line calculator in deliveries/pricing.service.ts, which
 * still carries a static haversine.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Smallest vehicle that can carry a consolidated trunk load. Caps match
 * the rate card's maxPayloadKg. An okada is never a trunk vehicle: the
 * whole point of the run is that it carries many parcels at once.
 */
function pickTrunkVehicle(loadKg: number): string {
  if (loadKg <= 100)   return 'tricycle';
  if (loadKg <= 200)   return 'car';
  if (loadKg <= 800)   return 'van';
  if (loadKg <= 3000)  return 'truck_small';
  return 'truck_large';
}

/** Smallest vehicle that can carry ONE parcel to a door. */
function pickDoorVehicle(kg: number): string {
  if (kg <= 20)   return 'motorcycle';
  if (kg <= 100)  return 'tricycle';
  if (kg <= 200)  return 'car';
  if (kg <= 800)  return 'van';
  if (kg <= 3000) return 'truck_small';
  return 'truck_large';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "amaka.eze@gmail.com" -> "am•••@gmail.com" */
function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) return '';
  return `${user.slice(0, 2)}${'•'.repeat(3)}@${domain}`;
}

@Injectable()
export class PartnerStoreService {
  private readonly logger = new Logger(PartnerStoreService.name);

  constructor(
    @InjectRepository(StoreDropoff)         private dropoffRepo:     Repository<StoreDropoff>,
    @InjectRepository(PartnerStore)         private storeRepo:       Repository<PartnerStore>,
    @InjectRepository(User)                 private usersRepo:       Repository<User>,
    @InjectRepository(PartnerSponsorship)   private sponsorshipRepo: Repository<PartnerSponsorship>,
    @InjectRepository(Delivery)             private deliveriesRepo:  Repository<Delivery>,
    @InjectRepository(PartnerPayout)        private payoutsRepo:     Repository<PartnerPayout>,
    private readonly feesService: FeesService,
    // Raises a job per parcel when a shop is suspended or wound down.
    private readonly recovery: ParcelRecoveryService,
    private readonly pricing:        PricingService,
    private readonly payments:       PaymentsService,
    private readonly identityService: IdentityService,
    private readonly mailService:    MailService,
    /**
     * So a new application enters the review queue with per-document rows
     * from the moment it is submitted, rather than waiting for the boot
     * backfill to notice it.
     */
    private readonly partnerDocs:    PartnerDocumentsService,
    /**
     * Real road distance for counter quotes (2026-08-31). Optional and
     * injected forward-ref, so a wiring problem degrades this file to
     * the straight line it used before rather than failing every quote.
     */
    @Optional() @Inject(forwardRef(() => RouteDistanceService))
    private readonly routeDistance?: RouteDistanceService,
  ) {}

  /**
   * Bridge to the driver world (audit 2026-08-10): a package flipping
   * to AWAITING_DRIVER used to sit in a queue NO driver could see,
   * because nothing created a Delivery for the driver leg. This
   * creates it: pickup = the store, dropoff = the recipient's door
   * (STORE_TO_DOOR) or the destination store (STORE_TO_STORE), price =
   * what the sender pre-paid, so the job flows into the available-jobs
   * feed and matching like any other delivery.
   *
   * Skipped (with a warning) when the store has no coordinates: those
   * stores are already flagged on the admin ops map for backfill.
   */
  private async ensureDriverLegDelivery(dropoffId: string) {
    try {
      const dropoff = await this.dropoffRepo.findOne({ where: { id: dropoffId } });
      if (!dropoff || (dropoff as any).deliveryId) return;

      const store = await this.storeRepo.findOne({ where: { id: dropoff.pickupStoreId } });
      if (!store) return;
      if ((store as any).storeLat == null || (store as any).storeLng == null) {
        this.logger.warn(`driver-leg skipped for dropoff ${dropoffId}: store ${store.id} has no coordinates`);
        return;
      }

      let destAddress = dropoff.recipientAddress;
      let destLat: number | null = null;
      let destLng: number | null = null;
      if (dropoff.dropoffStoreId) {
        const destStore = await this.storeRepo.findOne({ where: { id: dropoff.dropoffStoreId } });
        if (destStore) {
          destAddress = `${destStore.storeName}, ${destStore.storeAddress}`;
          destLat = (destStore as any).storeLat != null ? Number((destStore as any).storeLat) : null;
          destLng = (destStore as any).storeLng != null ? Number((destStore as any).storeLng) : null;
        }
      }
      if (!destAddress) return;

      // Unique tracking code with retry (same discipline as deliveries).
      let trackingCode = '';
      for (let i = 0; i < 5; i++) {
        const candidate = 'SRS-' + secureCode(8);
        const clash = await this.deliveriesRepo.findOne({ where: { trackingCode: candidate }, select: ['id'] });
        if (!clash) { trackingCode = candidate; break; }
      }
      if (!trackingCode) return;

      const price = Number(dropoff.prePaidAmountNgn ?? 0) > 0
        ? Number(dropoff.prePaidAmountNgn)
        : await this.feesService.getValueOr('store_leg_fallback_fee', 1500);
      // The driver's cut comes from the rate card at booking. It used to
      // be price * 0.7 hard-coded here, which both ignored the card and
      // paid out a share of money that was never collected.
      const driverCut = Number(dropoff.driverEarningsNgn ?? 0) > 0
        ? Number(dropoff.driverEarningsNgn)
        : +(price * 0.7).toFixed(2);

      const delivery = (await this.deliveriesRepo.save(this.deliveriesRepo.create({
        trackingCode,
        customer:           { id: dropoff.senderUserId } as any,
        pickupAddress:      `${store.storeName}, ${store.storeAddress}`,
        pickupLat:          Number((store as any).storeLat),
        pickupLng:          Number((store as any).storeLng),
        dropoffAddress:     destAddress,
        dropoffLat:         destLat as any,
        dropoffLng:         destLng as any,
        packageDescription: (dropoff as any).description ?? 'Partner-store package',
        weightKg:           dropoff.weightKg as any,
        price:              price as any,
        driverEarnings:     driverCut as any,
        vehicleType:        'motorcycle',
      } as any))) as unknown as Delivery;

      await this.dropoffRepo.update(dropoffId, { deliveryId: delivery.id } as any);
      this.logger.log(`driver-leg delivery ${delivery.trackingCode} created for dropoff ${dropoff.dropCode}`);
    } catch (e: any) {
      this.logger.warn(`driver-leg creation failed for dropoff ${dropoffId}: ${e?.message ?? e}`);
    }
  }

  // Safety net for the bridge above: catches dropoffs whose driver leg
  // fell through (driver cancelled -> deliveryId cleared by the status
  // sync), rows created before the bridge shipped, and stores whose
  // coordinates were backfilled after receive. Idempotent: the bridge
  // skips anything that already has a deliveryId.
  @Cron(CronExpression.EVERY_30_MINUTES)
  async redispatchStrandedDropoffs() {
    try {
      const stranded = await this.dropoffRepo.find({
        where: { status: DropoffStatus.AWAITING_DRIVER, deliveryId: IsNull() } as any,
        take: 25,
        order: { createdAt: 'ASC' },
      });
      if (stranded.length === 0) return;
      this.logger.log(`re-dispatch sweep: ${stranded.length} stranded dropoff(s)`);
      for (const d of stranded) {
        await this.ensureDriverLegDelivery(d.id);
      }
    } catch (e: any) {
      this.logger.warn(`re-dispatch sweep failed: ${e?.message ?? e}`);
    }
  }

  // ── Spec V8 §4.11 - Sponsored Placement subscriptions ─────────────────────

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
      // If they're reactivating mid-cycle, don't double-charge - only
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

  // Helper - find the partner store backing this user. Reuses the same
  // user.partnerStoreId pattern as scanPackage / getInventory etc.
  private async getStoreForUser(userId: string): Promise<PartnerStore> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user?.partnerStoreId) throw new ForbiddenException('Partner store not found.');
    const store = await this.storeRepo.findOne({ where: { id: user.partnerStoreId } });
    if (!store) throw new NotFoundException('Partner store not found.');
    return store;
  }

  // Monthly invoice cron - runs hourly so a sponsorship that comes due
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
    recipientLat?:    number | null;
    recipientLng?:    number | null;
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

    /**
     * Is this shop actually taking parcels? Asked HERE, where they arrive.
     *
     * scheduleDropoff is the only path in the codebase that creates a
     * store_dropoffs row, and until now it checked capacity and nothing
     * else. acceptingNew and status were enforced in three places that all
     * merely FIND a shop: the browse list, the public directory, and the
     * failed-delivery redirect. None of them is where a parcel arrives.
     *
     * So "paused" only ever meant "harder to stumble across". Anyone
     * holding the store id, from a deep link, a saved shop, a list loaded
     * before the pause, or a screen already open, could still book. The
     * flag looked like a gate and behaved like a filter.
     *
     * That is not a new bug: suspendStore has set acceptingNew = false
     * since it was written, under a comment promising "new drop-offs stop
     * immediately", and a SUSPENDED shop could still be booked. It was
     * inherited rather than introduced, and it is fixed here because a
     * move request now relies on the same flag actually holding.
     *
     * Status is checked alongside it. A shop that was never approved, or
     * whose approval was withdrawn, is not a place to leave a stranger's
     * property either.
     */
    const gate: any[] = await this.storeRepo.manager.query(
      `SELECT id, "storeName", status, "acceptingNew"
         FROM "partner_stores" WHERE id = ANY($1)`,
      [[body.pickupStoreId, body.dropoffStoreId].filter(Boolean)],
    );
    const byId = new Map(gate.map(g => [g.id, g]));

    const pickup = byId.get(body.pickupStoreId);
    if (!pickup || !['approved', 'active'].includes(String(pickup.status))) {
      throw new NotFoundException('That shop is not taking parcels at the moment. Please choose another.');
    }
    if (!pickup.acceptingNew) {
      throw new ForbiddenException(
        `${pickup.storeName} has paused new parcels. Please choose another shop.`,
      );
    }

    if (body.mode === DropoffMode.STORE_TO_STORE && body.dropoffStoreId) {
      const dest = byId.get(body.dropoffStoreId);
      if (!dest || !['approved', 'active'].includes(String(dest.status))) {
        throw new NotFoundException('That collection shop is not available. Please choose another.');
      }
      if (!dest.acceptingNew) {
        throw new ForbiddenException(
          `${dest.storeName} has paused new parcels, so it cannot be the collection point. Please choose another.`,
        );
      }
    }

    // Capacity preflight - refuse the booking up-front rather than letting
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
      recipientLat:       (body as any).recipientLat ?? null,
      recipientLng:       (body as any).recipientLng ?? null,
      recipientUserId:    body.recipientUserId ?? null,
      recipientName:      body.recipientName,
      recipientPhone:     body.recipientPhone,
      recipientEmail:     body.recipientEmail?.trim().toLowerCase() ?? null,
      weightKg:           body.weightKg,
      packageDescription: body.packageDescription ?? null,
      declaredValueNgn:   body.declaredValueNgn ?? 0,
      status:             DropoffStatus.SCHEDULED,
    });

    // Price it with the live rate card and record the three-way split.
    // prePaidAmountNgn is the fare owed; paidAt stays null until
    // Flutterwave confirms, and receiving refuses an unpaid package.
    const quote = await this.quoteDropoff({
      pickupStoreId:  body.pickupStoreId,
      mode:           body.mode,
      dropoffStoreId: body.dropoffStoreId,
      recipientLat:   (body as any).recipientLat ?? null,
      recipientLng:   (body as any).recipientLng ?? null,
      weightKg:       body.weightKg,
      declaredValueNgn: body.declaredValueNgn,
    });
    dropoff.prePaidAmountNgn   = quote.totalNgn as any;
    dropoff.partnerHandlingNgn = quote.partnerHandlingNgn as any;
    dropoff.driverEarningsNgn  = quote.driverEarningsNgn as any;

    return this.dropoffRepo.save(dropoff);
  }

  /**
   * What a store drop-off costs, and how it splits three ways.
   *
   * Booking one used to charge nothing: no quote, no Flutterwave call,
   * no escrow (founder 2026-08-18: "what about payment"). Receiving then
   * created a driver leg at a flat fallback fee and handed the driver a
   * hard-coded 70% of money nobody had collected.
   *
   * This runs the SAME rate card the app's Send a Package flow uses, so
   * the two cannot drift and every number stays admin-tunable: the
   * driver's cut, the counter handling fee and the SEIRS margin all come
   * out of the card rather than a constant in here.
   *
   * Counter touches, which is what the handling fee is charged per:
   * dropping at a counter is one, and a package the recipient collects
   * from a second counter is two.
   */
  async quoteDropoff(input: {
    pickupStoreId:   string;
    mode:            DropoffMode;
    dropoffStoreId?: string | null;
    recipientLat?:   number | null;
    recipientLng?:   number | null;
    weightKg:        number;
    categoryCode?:   string;
    declaredValueNgn?: number;
  }) {
    const store = await this.storeRepo.findOne({ where: { id: input.pickupStoreId } });
    if (!store) throw new NotFoundException('Pickup store not found');

    const originLat = (store as any).storeLat != null ? Number((store as any).storeLat) : null;
    const originLng = (store as any).storeLng != null ? Number((store as any).storeLng) : null;

    let destLat = input.recipientLat ?? null;
    let destLng = input.recipientLng ?? null;
    if (input.mode === DropoffMode.STORE_TO_STORE && input.dropoffStoreId) {
      const dest = await this.storeRepo.findOne({ where: { id: input.dropoffStoreId } });
      destLat = (dest as any)?.storeLat != null ? Number((dest as any).storeLat) : null;
      destLng = (dest as any)?.storeLng != null ? Number((dest as any).storeLng) : null;
    }

    /**
     * Road distance, measured (2026-08-31).
     *
     * This used the straight line and the comment above it claimed "the
     * rate card's own circuity factor turns it into road distance".
     * There is no circuity factor anywhere in this codebase, and there
     * never was: the number went into the engine raw. Over a city hop
     * that is a small error. Over Lagos to Kano the straight line is
     * roughly 825 km against about 1,050 km of road, so SEIRS quoted a
     * fifth under cost and ate the difference on every counter-to-counter
     * parcel that crossed the country.
     *
     * RouteDistanceService measures the real route and keeps a learned
     * road/straight ratio per zone for when the maps call fails, which
     * is the thing the old comment described but nothing implemented.
     * Falls back to the straight line if the service is unavailable,
     * because a quote that is 20% low still beats no quote at all.
     */
    const haveBothEnds = originLat != null && originLng != null && destLat != null && destLng != null;
    let km = haveBothEnds ? haversineKm(originLat!, originLng!, destLat!, destLng!) : 0;
    if (haveBothEnds && this.routeDistance) {
      try {
        const road = await this.routeDistance.getRoadDistance(
          originLat!, originLng!, destLat!, destLng!,
        );
        if (Number.isFinite(road?.km) && Number(road.km) > 0) km = Number(road.km);
      } catch {
        // Keep the straight line. Logged nowhere on purpose: this runs on
        // every quote and a maps outage must not fill the log.
      }
    }

    const touches = input.mode === DropoffMode.STORE_TO_STORE ? 2 : 1;
    const weightKg = Number(input.weightKg ?? 0);

    /**
     * A counter-to-counter parcel rides a SHARED trunk run and needs no
     * last-mile trip at either end, so it is far cheaper for SEIRS to
     * fulfil than a door delivery. The engine charged it the full
     * per-parcel door distance and then added a fee per counter on top,
     * which made the cheapest journey to serve the most expensive one to
     * buy: 2km cost NGN 729 to the door and NGN 1,729 counter to counter
     * (review 2026-08-18). No customer would ever choose the counter, so
     * the network could never reach the density that justifies it.
     *
     * The trunk leg is now divided across the parcels expected to share
     * it. The divisor is deliberately pessimistic and a floor sits under
     * the result, because a half-empty run must not be sold at a loss.
     */
    /**
     * Consolidated pricing is OFF until consolidated dispatch exists.
     *
     * The price divides a trunk run across the parcels expected to share
     * it, but every drop-off still creates its OWN driver leg, so six
     * parcels are six separate trips. Charging a sixth of a run while
     * paying for six whole runs loses money on every single parcel.
     *
     * The pricing is built, tested and switchable, and the switch stays
     * off until trunk runs are actually batched. Turning it on before
     * then is the most expensive mistake available in this file.
     */
    const batchingLive = (await this.feesService.getValueOr('consolidated_dispatch_enabled', 0)) > 0;
    const consolidated = input.mode === DropoffMode.STORE_TO_STORE && batchingLive;
    const assumedParcels = consolidated
      ? Math.max(1, await this.feesService.getValueOr('trunk_assumed_parcels', 6))
      : 1;

    /**
     * The trunk vehicle has to be able to carry the whole shelf. Fixing
     * it at a keke worked until six 30kg parcels were quoted together
     * and the 180kg load blew past the tricycle payload cap, failing the
     * quote outright. Pick the smallest vehicle that actually fits.
     */
    const trunkLoadKg = consolidated ? weightKg * assumedParcels : weightKg;
    // The door leg needs sizing too: a 30kg parcel quoted at okada blew
    // past the 20kg payload cap and failed the quote outright.
    const trunkVehicle = consolidated ? pickTrunkVehicle(trunkLoadKg) : pickDoorVehicle(weightKg);

    /**
     * The vehicle's distance ceiling, applied to counter work too
     * (2026-08-31).
     *
     * Every other way of booking a run checks vehicleRates[type].
     * maxRouteKm: the customer and business Send flows, the seat sale,
     * the address-change re-price. This path checked nothing, so a
     * counter-to-counter parcel was the one route in the product with no
     * distance ceiling of any kind. It would happily quote a Lagos
     * counter to a Kano counter on whatever vehicle the weight ladder
     * picked, including a keke.
     *
     * Silent while the value is unset, which is how it stands today.
     * Setting it is the founder's decision; this makes that decision
     * reach the counter network as well.
     */
    try {
      const card: any = await this.pricing.getActiveRateCard();
      const maxKm = Number(card?.vehicleRates?.[trunkVehicle]?.maxRouteKm ?? 0);
      if (maxKm > 0 && km > maxKm) {
        throw new BadRequestException(
          `This counter-to-counter route is ${Math.round(km)} km, past the ${maxKm} km limit for the vehicle that would carry it. ` +
          `Send it to an address instead, or split the journey.`,
        );
      }
    } catch (e: any) {
      // The rule firing must reach the caller. A card that will not read
      // must not fail the quote.
      if (e?.status === 400 || e?.name === 'BadRequestException') throw e;
    }

    const breakdown = await this.pricing.computePrice({
      vehicleType:  trunkVehicle,
      // 'general' is not a real category and made every quote 404. A
      // walk-in parcel with nothing declared is a standard parcel.
      categoryCode: input.categoryCode ?? 'standard_parcel',
      km,
      stopCount:    1,
      // The trunk vehicle carries the whole shelf, so it is priced on
      // the whole load rather than on this one parcel.
      weightKg:     trunkLoadKg,
      estimatedDwellMinutes: 0,
      partnerStoreTouches:   0, // counter fees are applied below, tiered
      pickupCoords:  (originLat != null && originLng != null) ? { latitude: originLat, longitude: originLng } : undefined,
      dropoffCoords: (destLat != null && destLng != null) ? { latitude: destLat, longitude: destLng } : undefined,
    } as any);

    const counterFee = await this.counterFeeFor(weightKg);
    const partnerSharePct = await this.feesService.getValueOr('counter_partner_share_pct', 70);
    const handlingTotal   = counterFee * touches;
    const partnerKeeps    = round2(handlingTotal * (partnerSharePct / 100));
    const seirsCounterCut = round2(handlingTotal - partnerKeeps);

    const transportShare = round2(Number(breakdown.customer.total) / assumedParcels);
    const driverShare    = round2(Number(breakdown.driver.total) / assumedParcels);
    const netShare       = round2(Number(breakdown.seirsNet) / assumedParcels);

    const floor = await this.feesService.getValueOr('consolidated_floor_ngn', 800);
    const rawTotal = round2(transportShare + handlingTotal);
    const total = consolidated ? Math.max(rawTotal, floor) : rawTotal;

    return {
      km:                 Math.round(km * 10) / 10,
      totalNgn:           total,
      partnerHandlingNgn: partnerKeeps,
      driverEarningsNgn:  driverShare,
      seirsNetNgn:        round2(netShare + seirsCounterCut + (total - rawTotal)),
      counterTouches:     touches,
      consolidated,
      assumedParcels,
      counterFeeEach:     counterFee,
      seirsCounterCut,
      hitFloor:           consolidated && rawTotal < floor,
      /**
       * Every line that makes the total.
       *
       * The summary above is what a sender needs; this is what an admin
       * needs to answer "why is it that much" and to audit a split
       * (founder 2026-08-18: the admin should see the full receipt
       * breakdown). It carries the rate card snapshot id, so any past
       * quote can be reproduced exactly.
       */
      breakdown,
    };
  }

  /**
   * Start a Flutterwave checkout for a drop-off fare, or for the
   * difference the counter's scale found.
   *
   * Flutterwave is the only processor SEIRS uses. Senders hold no
   * balance, so this is a per-booking charge, same as any other SEIRS
   * booking.
   */
  async payForDropoff(senderUserId: string, dropoffId: string, kind: 'fare' | 'topup') {
    const dropoff = await this.dropoffRepo.findOne({ where: { id: dropoffId } });
    if (!dropoff) throw new NotFoundException('Drop-off not found');
    if (dropoff.senderUserId !== senderUserId) {
      throw new ForbiddenException('This drop-off belongs to another account');
    }

    const amount = kind === 'topup'
      ? Number(dropoff.topUpOwedNgn ?? 0)
      : Number(dropoff.prePaidAmountNgn ?? 0);
    const already = kind === 'topup' ? dropoff.topUpPaidAt : dropoff.paidAt;
    if (already) throw new BadRequestException('This has already been paid.');

    const sender = await this.usersRepo.findOne({ where: { id: senderUserId } });
    if (!sender) throw new NotFoundException('Sender not found');

    return this.payments.initiateDropoffPayment(dropoff.id, sender, amount, kind);
  }

  /**
   * Put a counter's handling fee into their payout ledger.
   *
   * Written as its own step so both ends of the journey pay the same
   * way, and so the rate always comes from the Fee Catalogue rather
   * than a constant.
   */
  private async creditPartner(storeId: string, amountNgn: number, note: string): Promise<void> {
    if (!(amountNgn > 0)) return;
    try {
      await this.payoutsRepo.save(this.payoutsRepo.create({
        partnerStoreId: storeId,
        amount:         amountNgn as any,
        status:         'pending',
        period:         this.payoutPeriodLabel(),
      }));
      this.logger.log(`partner ${storeId} credited NGN ${amountNgn} (${note})`);
    } catch (e: any) {
      this.logger.error(`partner credit failed for ${storeId}: ${e?.message ?? e}`);
    }
  }

  /** ISO-week label, matching the existing business-package payouts. */
  private payoutPeriodLabel(): string {
    const d = new Date();
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  /**
   * Pay a partner what their counter has earned.
   *
   * Partners accrued payout rows and had no way whatsoever to get the
   * money: only drivers had a withdrawal path, so a store could work
   * every package on the shelf and watch a number grow forever (found
   * 2026-08-18, while wiring the live money test).
   *
   * Funds clear after an admin-tunable delay so the launch policy and
   * the test can differ without a deploy. Rows are marked processing
   * BEFORE the transfer and only paid on success, so a failed transfer
   * cannot be silently swallowed or double-spent.
   */
  async withdrawPartnerEarnings(ownerUserId: string) {
    const owner = await this.usersRepo.findOne({ where: { id: ownerUserId } });
    if (!owner?.partnerStoreId) throw new ForbiddenException('You do not run a partner store');
    if (!owner.bankCode || !owner.bankAccountNumber) {
      throw new BadRequestException('Add a payout bank account before withdrawing.');
    }

    const holdHours = await this.feesService.getValueOr('partner_payout_hold_hours', 24 * 7);
    const cutoff = new Date(Date.now() - holdHours * 3600 * 1000);

    const due = await this.payoutsRepo
      .createQueryBuilder('p')
      .where('p."partnerStoreId" = :s', { s: owner.partnerStoreId })
      .andWhere(`p.status = 'pending'`)
      .andWhere('p."createdAt" <= :cutoff', { cutoff })
      .getMany();

    const amount = due.reduce((sum, r) => sum + Number(r.amount), 0);
    if (!(amount > 0)) {
      throw new BadRequestException(
        `Nothing has cleared yet. Counter earnings become withdrawable ${holdHours} hours after they are earned.`,
      );
    }

    const ids = due.map(r => r.id);
    await this.payoutsRepo.update(ids, { status: 'processing' });

    const reference = `SRS-PPO-${Date.now().toString(36).toUpperCase()}`;
    const result = await this.payments.transferOut({
      amountNaira:   amount,
      bankCode:      owner.bankCode,
      accountNumber: owner.bankAccountNumber,
      accountName:   owner.bankAccountName ?? owner.name,
      reference,
      narration:     'Seirs partner counter earnings',
    });

    if (!result.success) {
      // Straight back to pending: the money was never sent, so it must
      // stay withdrawable rather than being stranded in processing.
      await this.payoutsRepo.update(ids, { status: 'pending' });
      throw new BadRequestException('The transfer did not go through. Nothing was deducted, try again shortly.');
    }

    await this.payoutsRepo.update(ids, { status: 'paid', paidAt: new Date() });
    return { paidNgn: amount, reference, entries: ids.length, transferId: result.transferId ?? null };
  }

  /**
   * Counter handling fee for this weight. Delegates to the pricing
   * engine so the drop-off flow and the main booking flow cannot charge
   * a different fee for the same parcel.
   */
  private async counterFeeFor(weightKg: number): Promise<number> {
    return this.pricing.counterFeeForWeight(weightKg);
  }

  /**
   * Send the handoff code to the person standing at the counter.
   *
   * The Verify Sender screen told staff to ask for "the code from the
   * verification email they received when they scheduled this drop-off",
   * but booking a drop-off never issued an OTP and never sent a mail, so
   * the code being asked for did not exist (found on device
   * 2026-08-18). Nothing could be received or released.
   *
   * Issuing at booking time would not have worked either: the code lives
   * ten minutes and a sender books, then travels. So the code is
   * requested AT the counter, which is also how a locker pickup works.
   *
   * Receiving verifies the SENDER; releasing verifies the RECIPIENT, and
   * when the recipient has no SEIRS account the code goes to the sender
   * to read out, per the existing forward-the-PIN pattern.
   */
  async issueDropoffOtp(staffUserId: string, code: string, purpose: 'receive' | 'release') {
    const dropoff = await this.findByCode(code);
    const storeId = purpose === 'receive'
      ? dropoff.pickupStoreId
      : (dropoff.dropoffStoreId ?? dropoff.pickupStoreId);

    const staff = await this.usersRepo.findOne({ where: { id: staffUserId } });
    if (!staff || staff.partnerStoreId !== storeId) {
      throw new ForbiddenException('You are not registered as staff for this store');
    }

    const targetUserId = purpose === 'receive'
      ? dropoff.senderUserId
      : (dropoff.recipientUserId ?? dropoff.senderUserId);

    await this.identityService.issueHandoffOtp(dropoff.id, targetUserId);

    // Enough for staff to say "check the email on your phone" without
    // reading a stranger's full address aloud across the counter.
    const target = await this.usersRepo.findOne({ where: { id: targetUserId } });
    return { sent: true, sentTo: maskEmail(target?.email ?? ''), expiresInMinutes: 10 };
  }

  // Partner staff scans the QR (or types the backup code) and confirms
  // the package details + photo + sender identity. After this, the
  // package is officially in their custody.
  /**
   * The counter takes a package in.
   *
   * `staffSignatureName` (2026-08-25): the founder's Nigerian case is a
   * partner store that receives a package and later says it never did.
   * The scan alone cannot settle that, so the staff member types their
   * own full name and it goes on the custody record as an Evidence Act
   * section 84 signature. Older partner builds that do not send one fall
   * back to the signed-in staff account's registered name, and the record
   * marks which it was.
   */
  async receiveAtStore(staffUserId: string, body: {
    code:             string;       // either dropCode or backupCode
    weightKg:         number;       // partner's actual weight measurement
    receivedPhotoUrl: string;       // proof photo of package on partner counter
    senderOtp:        string;       // sender shows OTP from email
    /** Full name of the staff member taking it in, typed by them. */
    staffSignatureName?: string;
  }) {
    const dropoff = await this.findByCode(body.code);
    if (dropoff.status !== DropoffStatus.SCHEDULED) {
      throw new BadRequestException(`Cannot receive - current status is ${dropoff.status}`);
    }

    /**
     * Nothing crosses the counter unpaid.
     *
     * The fare is charged when the sender books. Weight is only DECLARED
     * then, so the counter weighs it for real: if the measured weight
     * prices higher, the difference is owed before the store takes
     * custody, and staff are told the exact figure to ask for rather
     * than being left to argue about it.
     */
    if (!dropoff.paidAt) {
      throw new BadRequestException(
        `This drop-off has not been paid for. Ask the sender to complete payment in their SEIRS app, then scan again.`,
      );
    }

    const measured = Number(body.weightKg ?? 0);
    if (measured > Number(dropoff.weightKg ?? 0)) {
      const requote = await this.quoteDropoff({
        pickupStoreId:  dropoff.pickupStoreId,
        mode:           dropoff.mode as DropoffMode,
        dropoffStoreId: dropoff.dropoffStoreId,
        recipientLat:   (dropoff as any).recipientLat ?? null,
        recipientLng:   (dropoff as any).recipientLng ?? null,
        weightKg:       measured,
        declaredValueNgn: dropoff.declaredValueNgn,
      });
      const owed = Math.max(0, Math.round((requote.totalNgn - Number(dropoff.prePaidAmountNgn ?? 0)) * 100) / 100);
      if (owed > 0 && !dropoff.topUpPaidAt) {
        await this.dropoffRepo.update(dropoff.id, { topUpOwedNgn: owed as any });
        throw new BadRequestException(
          `Measured ${measured}kg against ${Number(dropoff.weightKg)}kg declared. ` +
          `The sender owes a further ₦${owed.toLocaleString()}. ` +
          'Ask them to pay it in their SEIRS app, then scan again.',
        );
      }
    }

    // Validate the staff actually works at this store
    const staff = await this.usersRepo.findOne({ where: { id: staffUserId } });
    if (!staff || staff.partnerStoreId !== dropoff.pickupStoreId) {
      throw new ForbiddenException('You are not registered as staff for the pickup store');
    }

    // Verify sender via identity module - uses the same OTP path drivers
    // use to verify recipients. Stage = CUSTOMER_TO_STORE (sender to store).
    await this.identityService.verifyHandoff({
      deliveryId: dropoff.id, // we use dropoff id as the delivery id for handoff records pre-driver
      stage:      HandoffStage.CUSTOMER_TO_STORE,
      method:     HandoffMethod.PHYSICAL_ID,
      fromUserId: dropoff.senderUserId,
      idType:     'sender_otp',
      idNumber:   dropoff.senderUserId, // last-4 will store last-4 of user UUID - adequate for audit
      otp:        body.senderOtp,
      proofPhotoUrl: body.receivedPhotoUrl,
      // No Delivery exists until a driver leg is created below, so name
      // the OTP owner outright instead of letting identity look for one.
      subjectUserId:   dropoff.senderUserId,
      subjectValueNgn: Number(dropoff.declaredValueNgn ?? 0),
      /**
       * The package ends up behind THIS counter, held by THIS person.
       *
       * The record used to name the sender as both the giver and the
       * taker, which said the sender handed their package to themselves
       * and left the store nowhere on the chain. A store denying receipt
       * was unanswerable from our own records, which is the exact
       * scenario the chain of custody exists for.
       */
      toUserId:       staffUserId,
      signatureName:  body.staffSignatureName,
      signedByRole:   HandoffRole.STORE_STAFF,
      partnerStoreId: dropoff.pickupStoreId,
    } as any);

    // The counter has earned its handling fee the moment it takes
    // custody. Nothing credited the partner on this path at all: only
    // the separate business-package flow paid them, and it paid a
    // hard-coded rate rather than the catalogue one, so a store working
    // real drop-offs earned nothing (found 2026-08-18).
    await this.creditPartner(
      dropoff.pickupStoreId,
      Number(dropoff.partnerHandlingNgn ?? 0)
        || await this.feesService.getValueOr('partner_store_handling_ngn', 500),
      `Received ${dropoff.dropCode}`,
    );

    await this.dropoffRepo.update(dropoff.id, {
      status:           DropoffStatus.RECEIVED_AT_STORE,
      weightKg:         body.weightKg,
      receivedAtStoreAt: new Date(),
      receivedPhotoUrl:  body.receivedPhotoUrl,
    });

    // Move forward into the dispatch queue AND create the driver-leg
    // delivery so drivers can actually see and claim it.
    await this.dropoffRepo.update(dropoff.id, { status: DropoffStatus.AWAITING_DRIVER });
    await this.ensureDriverLegDelivery(dropoff.id);
    return this.findById(dropoff.id);
  }

  /**
   * The destination store scans a package in off a rider (2026-08-25).
   *
   * WHY this route did not exist and had to: the liability matrix says
   * "Driver to Final Partner store: DRIVER liable until the store scans".
   * Nothing at the destination store scanned anything. The drop-off moved
   * to at_dropoff_store purely because the RIDER marked their leg
   * delivered, which discharges the rider on the rider's own word and
   * leaves the store holding a package it never signed for. Both ends of
   * that handover were unevidenced.
   *
   * So the rider marking DELIVERED no longer closes this link. It stays
   * open, and the chain keeps naming the rider as the holder, until a
   * named human at the counter signs for it here.
   *
   * Also the only place that has ever set AWAITING_COLLECTION: the status
   * existed and nothing wrote it, so recipients were never told their
   * package had landed and was waiting.
   */
  async receiveFromDriver(staffUserId: string, body: {
    code:                string;
    receivedPhotoUrl?:   string;
    /** Full name of the staff member taking it in, typed by them. */
    staffSignatureName?: string;
  }) {
    const dropoff = await this.findByCode(body.code);

    const releaseStoreId = dropoff.dropoffStoreId ?? dropoff.pickupStoreId;
    const staff = await this.usersRepo.findOne({ where: { id: staffUserId } });
    if (!staff || staff.partnerStoreId !== releaseStoreId) {
      throw new ForbiddenException('You are not registered as staff for this store');
    }

    // Accepts the package while it is still on the road as well as after
    // the rider closed their leg: a counter that scans before the rider
    // taps "delivered" is the normal order of events at a real shop, and
    // refusing it would push staff to skip the scan.
    const receivable: DropoffStatus[] = [
      DropoffStatus.IN_TRANSIT,
      DropoffStatus.DRIVER_EN_ROUTE,
      DropoffStatus.AT_DROPOFF_STORE,
    ];
    if (!receivable.includes(dropoff.status)) {
      throw new BadRequestException(`Cannot receive from a rider - current status is ${dropoff.status}`);
    }

    // Who is handing it over, for the record. Best-effort: an unmatched
    // leg still gets a signed receipt naming the store, which is the half
    // of this that settles a store denying receipt.
    let driverUserId: string | null = null;
    let driverName:   string | null = null;
    if (dropoff.deliveryId) {
      try {
        const rows = await this.deliveriesRepo.query(
          `SELECT u.id AS "userId", u.name AS "name"
             FROM deliveries d
             JOIN drivers dr ON dr.id = d."driverId"
             JOIN users   u  ON u.id  = dr."userId"
            WHERE d.id = $1 LIMIT 1`,
          [dropoff.deliveryId],
        );
        driverUserId = rows?.[0]?.userId ?? null;
        driverName   = rows?.[0]?.name   ?? null;
      } catch { /* the store's signature stands with or without the rider's name */ }
    }

    await this.identityService.recordHandoff({
      // Filed against the driver leg where there is one, so the road
      // journey and the counter receipt sit on the same id. getHandoffChain
      // unions the two ids either way.
      deliveryId:     dropoff.deliveryId ?? dropoff.id,
      stage:          HandoffStage.DRIVER_TO_STORE,
      method:         HandoffMethod.TYPED_SIGNATURE,
      fromUserId:     driverUserId,
      toUserId:       staffUserId,
      signatureName:  body.staffSignatureName,
      releasedByName: driverName,
      signedByRole:   HandoffRole.STORE_STAFF,
      partnerStoreId: releaseStoreId,
      proofPhotoUrl:  body.receivedPhotoUrl ?? null,
    });

    await this.dropoffRepo.update(dropoff.id, {
      status:                  DropoffStatus.AWAITING_COLLECTION,
      arrivedAtDropoffStoreAt: dropoff.arrivedAtDropoffStoreAt ?? new Date(),
    } as any);

    // The counter earns its handling fee for taking the package in, the
    // same as the pickup store did. Releasing it later is paid separately.
    await this.creditPartner(
      releaseStoreId,
      await this.feesService.getValueOr('partner_store_handling_ngn', 500),
      `Received from rider ${dropoff.dropCode}`,
    );

    // Nothing ever told the recipient their package had landed. No arrival
    // time is promised here, and none should be: it is already there.
    const notifyUserId = dropoff.recipientUserId ?? dropoff.senderUserId;
    if (notifyUserId) {
      this.notifySender(
        notifyUserId,
        `Your package ${dropoff.dropCode} is ready to collect`,
        `Package ${dropoff.dropCode} has arrived at the partner store and is waiting behind the counter. ` +
        `Bring the collection code and a means of identification.`,
      );
    }

    return this.findById(dropoff.id);
  }

  // ── Recipient flow ─────────────────────────────────────────────────────

  // Partner staff at the dropoff store releases package to recipient
  // after identity verification. Two paths supported (physical ID + OTP,
  // or SEIRS ID + typed name) - same as Spec V8 §1.17.
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
    /**
     * The staff member releasing it, typed by them (2026-08-25).
     *
     * Founder asked whether the sender's receipt can show WHO collected
     * the package, not just a proof photo. It shows both ends: the
     * collector is verified above, and this is the named human who
     * handed it over.
     */
    staffSignatureName?: string;
  }) {
    const dropoff = await this.findByCode(body.code);
    if (![DropoffStatus.AT_DROPOFF_STORE, DropoffStatus.AWAITING_COLLECTION].includes(dropoff.status)) {
      throw new BadRequestException(`Cannot release - current status is ${dropoff.status}`);
    }

    const releaseStoreId = dropoff.dropoffStoreId ?? dropoff.pickupStoreId;
    const staff = await this.usersRepo.findOne({ where: { id: staffUserId } });
    if (!staff || staff.partnerStoreId !== releaseStoreId) {
      throw new ForbiddenException('You are not registered as staff for the release store');
    }

    // Pay-to-release (founder matrix 2026-08-11): a package that landed
    // here through a failed-delivery redirect stays behind the counter
    // until the sender settles the transport fee. Store staff see why,
    // so they can tell the customer what to do rather than guessing.
    if (dropoff.deliveryId) {
      const rows = await this.deliveriesRepo.query(
        `SELECT "redirectFeeNgn", "redirectFeePaidAt" FROM deliveries WHERE id = $1 LIMIT 1`,
        [dropoff.deliveryId],
      );
      const owed = Number(rows?.[0]?.redirectFeeNgn ?? 0);
      if (owed > 0 && !rows?.[0]?.redirectFeePaidAt) {
        throw new BadRequestException(
          `This package was redirected here and the sender still owes the ₦${owed.toLocaleString()} transfer fee. ` +
          'Ask them to settle it in the SEIRS app, then scan again.',
        );
      }
    }

    /**
     * A receiver does not need a SEIRS account to collect.
     *
     * This used to refuse outright unless the recipient was a registered
     * user, which is most of Nigeria: parcels are collected by a
     * neighbour, a shop boy, a security man, a cousin. Requiring an
     * account at a corner shop counter would have killed counter
     * adoption on its own (founder 2026-08-18: "we should allow this as
     * long as they gave the otp code").
     *
     * The code is the proof of entitlement, exactly as a locker PIN is.
     * When the receiver has no account the OTP goes to the SENDER, who
     * forwards it to whoever is actually collecting, and the handoff is
     * recorded against the sender because they are the party who
     * authorised the release. The typed-name path still needs an account,
     * because it verifies a SEIRS ID.
     */
    const collectorUserId = dropoff.recipientUserId ?? dropoff.senderUserId;
    if (!dropoff.recipientUserId && body.method !== HandoffMethod.PHYSICAL_ID) {
      throw new BadRequestException(
        'This receiver has no SEIRS account, so they must collect with the code sent to the sender. ' +
        'Send them a code and use the code path.',
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
      // The person collecting is the RECIPIENT, not the sender who paid.
      // Resolving through the driver-leg delivery would have named the
      // sender as the OTP owner and released the package to the wrong
      // verification.
      subjectUserId:     collectorUserId,
      subjectValueNgn:   Number(dropoff.declaredValueNgn ?? 0),
      receiverFirstName: dropoff.recipientName?.split(' ')[0] ?? null,
      receiverLastName:  dropoff.recipientName?.split(' ').slice(1).join(' ') || null,
      // Both ends of the counter, by name. The store cannot later say it
      // never released the package, and the sender's receipt can answer
      // "who gave it to whom" without either party's word for it.
      releasedByName:    body.staffSignatureName?.trim() || staff.name || null,
      signedByRole:      HandoffRole.RECIPIENT,
      partnerStoreId:    releaseStoreId,
    } as any);

    // Second counter touch: handing the package to the recipient is
    // paid the same as taking it in.
    const releaseStore = dropoff.dropoffStoreId ?? dropoff.pickupStoreId;
    await this.creditPartner(
      releaseStore,
      await this.feesService.getValueOr('partner_store_handling_ngn', 500),
      `Released ${dropoff.dropCode}`,
    );

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

  /**
   * A drop-off plus where it is actually going.
   *
   * Counter staff were shown the recipient, the code and the
   * description, and nothing about the destination (founder, mid-QA:
   * "did the sender give an address their sending to"). They did: the
   * booking is rejected without one. Staff just could not see it, so
   * they could not sort the shelf, could not tell a walk-in customer
   * where their parcel was headed, and could not spot a package
   * addressed to their own counter.
   */
  async findByCodeDetailed(code: string) {
    const row = await this.findByCode(code);
    let destinationStoreName: string | null = null;
    if (row.dropoffStoreId) {
      const store = await this.storeRepo.findOne({
        where: { id: row.dropoffStoreId },
        select: ['id', 'storeName', 'storeAddress'],
      });
      destinationStoreName = store?.storeName ?? null;
      if (store?.storeAddress) destinationStoreName += ` (${store.storeAddress})`;
    }
    return { ...row, destinationStoreName };
  }

  async listForSender(senderUserId: string) {
    return this.dropoffRepo.find({
      where: { senderUserId },
      order: { createdAt: 'DESC' },
      take:  100,
    });
  }

  async listForStore(partnerStoreId: string, staffUserId: string, opts?: { onlyActive?: boolean }) {
    await this.requireStoreStaff(partnerStoreId, staffUserId);
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
  // Capacity is counts only, no PII, and the same numbers are already
  // public through /capacity/nearby. It is also called internally while
  // booking, where there is no staff actor, so it stays unguarded.
  /**
   * The counter, as a rider arriving at it needs to see it.
   *
   * Built 2026-09-04. The driver handover screen received a shop's name and
   * address as route params, and the screen that pushed it hardcoded the name
   * as "Partner counter", so a rider crossing Lagos was never told which shop
   * they were going to or whether it had shut an hour ago.
   *
   * Columns are named rather than returning the row. A PartnerStore carries
   * bank details, owner identity and document URLs, and none of that belongs
   * in a payload a rider reads on a doorstep. Everything returned here is
   * already published by the public directory.
   *
   * isOpenNow is computed here through the same shared helper the directory
   * and the customer card use, so all three agree, including on the overnight
   * case where a counter open 18:00 to 02:00 used to read as shut all night.
   */
  async counterDetails(partnerStoreId: string) {
    const store = await this.storeRepo.findOne({
      where:  { id: partnerStoreId },
      select: {
        id: true, storeName: true, storeAddress: true, phone: true,
        openTime: true, closeTime: true, operatingDays: true,
        workingHours: true as any, status: true, acceptingNew: true,
      } as any,
    });
    if (!store) throw new NotFoundException('That counter was not found.');
    return {
      id:            store.id,
      storeName:     store.storeName,
      storeAddress:  store.storeAddress,
      phone:         store.phone ?? null,
      openTime:      store.openTime ?? null,
      closeTime:     store.closeTime ?? null,
      operatingDays: store.operatingDays ?? [],
      workingHours:  store.workingHours ?? null,
      isOpenNow:     storeIsOpenNow(store as any),
      /** A rider should know before arriving that the shop has paused intake. */
      acceptingNew:  store.acceptingNew,
    };
  }

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

  /**
   * Partner stores near a POINT, with everything a sender needs to pick
   * one (founder 2026-08-16: "it should show the partner stores closest
   * to wherever they are sending to, with details about each store").
   *
   * Previously this ignored lat/lng entirely and returned every active
   * store, which is useless when the question is "which counter is near
   * my receiver". Now: approved-or-active, accepting new packages,
   * haversine-sorted by distance from the destination, with address,
   * distance, live capacity, opening hours, an open-now flag and the
   * storefront photo so the sender recognises the place.
   */
  async listCapacityNearby(lat?: number, lng?: number, radiusKm = 10) {
    const stores = await this.storeRepo.find({
      where: { status: In(['approved', 'active'] as any[]), acceptingNew: true as any },
      take: 200,
    });

    const hasOrigin = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
    const originLat = Number(lat), originLng = Number(lng);
    const distanceKm = (aLat: number, aLng: number) => {
      const R = 6371, dLat = ((aLat - originLat) * Math.PI) / 180, dLng = ((aLng - originLng) * Math.PI) / 180;
      const h = Math.sin(dLat / 2) ** 2 +
        Math.cos((originLat * Math.PI) / 180) * Math.cos((aLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    };

    // The Lagos clock, the day name and the minute maths that used to sit
    // here all belonged to the hand-rolled open-check that storeIsOpenNow
    // replaced. withinWorkingHours owns the timezone now, in one place,
    // so this cannot drift from the other two copies again.

    const withGeo = stores.map((st) => {
      const sLat = st.storeLat != null ? Number(st.storeLat) : null;
      const sLng = st.storeLng != null ? Number(st.storeLng) : null;
      const km = hasOrigin && sLat != null && sLng != null ? distanceKm(sLat, sLng) : null;
      return { st, sLat, sLng, km };
    });

    const inRange = hasOrigin
      // Stores without coordinates are kept: an admin has not geocoded
      // them yet, and hiding a real counter is worse than ranking it last.
      ? withGeo.filter((r) => r.km == null || r.km <= radiusKm)
      : withGeo;

    inRange.sort((a, b) => (a.km ?? Number.MAX_SAFE_INTEGER) - (b.km ?? Number.MAX_SAFE_INTEGER));
    const top = inRange.slice(0, 15);

    return Promise.all(top.map(async ({ st, sLat, sLng, km }) => {
      const cap = await this.getCapacity(st.id);
      /**
       * The same open-check as everywhere else.
       *
       * This was a THIRD hand-rolled version of the question, and it
       * carried the same midnight bug as the one it sat beside: a kiosk
       * open 18:00 to 02:00 can never satisfy
       * `now >= open && now < close`, so it showed as shut all night,
       * which is precisely when somebody looking for a late drop-off
       * needs it.
       */
      const isOpenNow = storeIsOpenNow(st);
      return {
        id:            st.id,
        storeName:     st.storeName,
        storeAddress:  st.storeAddress,
        lat:           sLat,
        lng:           sLng,
        distanceKm:    km != null ? Math.round(km * 10) / 10 : null,
        phone:         st.phone,
        photoUrl:      st.storefrontPhotoUrl ?? null,
        openTime:      st.openTime,
        closeTime:     st.closeTime,
        operatingDays: st.operatingDays ?? [],
        workingHours:  st.workingHours ?? null,
        isOpenNow,
        acceptingNew:  st.acceptingNew,
        ...cap,
      };
    }));
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
    /** Signed-in callers see exact address/coords/phone; anonymous do not. */
    precise?: boolean;
  }) {
    const qb = this.storeRepo
      .createQueryBuilder('s')
      .where('s."acceptingNew" = true')
      .andWhere('s.status IN (:...allowed)', { allowed: ['approved', 'active'] })
      // Demo/marketing stores must never appear to real customers
      // choosing a drop-off point (2026-08-12 security review).
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s."userId"::uuid AND u."isDemo" = true)`,
      );

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

    /**
     * Approved storefront photos for this page of stores, in one query.
     *
     * Looked up rather than joined so the distance ordering above stays
     * exactly as it was, and fetched only for the ids actually returned
     * rather than for every store in the country.
     */
    const approvedPhotos = new Map<string, string>();
    if (entities.length) {
      const rows = await this.storeRepo.manager.query(
        `SELECT "ownerId", "url" FROM "kyc_documents"
          WHERE "ownerType" = 'partner_store'
            AND "docId"     = 'storefront_photo'
            AND "status"    = 'approved'
            AND "ownerId"   = ANY($1)`,
        [entities.map(e => e.id)],
      ).catch((e: any) => {
        // A failure here must not blank a directory people are using to
        // find somewhere to drop a parcel. No photo is a degraded page;
        // no page is a broken one.
        this.logger.warn(`approved storefront lookup failed: ${e?.message ?? e}`);
        return [] as any[];
      });
      for (const r of rows as any[]) approvedPhotos.set(r.ownerId, r.url);
    }

    return {
      total,
      limit:  clamped,
      offset: opts.offset ?? 0,
      items:  entities.map((s, i) => {
        const distanceRaw = hasUserLoc ? raw[i]?.distance_km : null;

        // Anonymous callers get area-level detail only (founder
        // 2026-08-12): a shop holding other people's packages must not
        // be locatable, phone-able, and hours-readable by someone who
        // never signed in. Signed-in callers get the full record because
        // they need it to actually go there, and an account is
        // traceable in a way anonymous scraping is not.
        if (!opts.precise) {
          return {
            id:           s.id,
            storeCode:    s.storeCode,
            storeName:    s.storeName,
            area:         areaOf(s.storeAddress),
            openNow:      storeIsOpenNow(s),
            // Coarsened to ~1km so the map shows a neighbourhood, not a door.
            approxLat:    s.storeLat != null ? Math.round(Number(s.storeLat) * 100) / 100 : null,
            approxLng:    s.storeLng != null ? Math.round(Number(s.storeLng) * 100) / 100 : null,
            distanceKm:   distanceRaw != null ? Math.round(Number(distanceRaw)) : null,
            preciseRequiresSignIn: true,
          };
        }

        return {
          id:            s.id,
          storeCode:     s.storeCode,       // public shop reference, safe to print + quote
          storeName:     s.storeName,
          storeAddress:  s.storeAddress,
          phone:         s.phone,
          /**
           * The APPROVED photo, or none.
           *
           * This read s.storefrontPhotoUrl, the column on partner_stores,
           * which is written the moment a partner uploads a file and
           * before anybody has looked at it. So a shop could put any
           * image at all in front of customers choosing where to leave a
           * parcel, simply by uploading one.
           *
           * The reason this photo exists at all is the reason it has to
           * be reviewed: somebody standing in the street is using it to
           * decide they are at the right shop, the same way a customer
           * checks a rider's vehicle photo. An unreviewed picture is
           * worse than none, because none makes them ask.
           */
          storefrontPhotoUrl: approvedPhotos.get(s.id) ?? null,
          operatingDays: s.operatingDays,
          openTime:      s.openTime,
          closeTime:     s.closeTime,
          /**
           * The real per-day schedule, null when the shop never set one.
           *
           * The three fields above cannot express "closes early on
           * Saturday" or "open past midnight", because they are one
           * window applied to every open day. They stay because existing
           * callers read them; this is the one to render when present.
           */
          workingHours:  s.workingHours ?? null,
          openNow:       storeIsOpenNow(s),
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
  /**
   * Every per-store read must prove the caller works there.
   *
   * Four readers shipped with no actor argument at all, so ANY signed-in
   * account could pull a counter's full manifest including the dropCode
   * and backupCode that release a parcel. Confirmed on production with
   * an unrelated driver token (2026-08-24). Admins keep their own path.
   */
  private async requireStoreStaff(partnerStoreId: string, staffUserId: string) {
    const staff = await this.usersRepo.findOne({ where: { id: staffUserId } });
    if (!staff || staff.partnerStoreId !== partnerStoreId) {
      throw new ForbiddenException('You are not registered as staff for this store');
    }
    return staff;
  }

  async setStoreStatus(storeId: string, status: 'active' | 'paused', staffUserId: string) {
    const staff = await this.usersRepo.findOne({ where: { id: staffUserId } });
    if (!staff || staff.partnerStoreId !== storeId) {
      throw new ForbiddenException('You are not registered as staff for this store');
    }
    if (!['active', 'paused'].includes(status)) {
      throw new BadRequestException('status must be "active" or "paused"');
    }
    /**
     * A shop may pause itself freely. It may not un-pause a pause we set.
     *
     * This wrote acceptingNew with no checks at all, which quietly undid
     * every safety pause in the system. A partner with a move under review
     * could switch drop-offs back on and start taking strangers' parcels at
     * an address they are in the middle of leaving, which is precisely the
     * failure the move pause exists to prevent. A suspended shop could do
     * the same.
     *
     * Turning intake OFF is always allowed: a shopkeeper knows when they
     * cannot take parcels, and refusing that would only teach them to stop
     * telling us.
     */
    if (status === 'active') {
      const store = await this.storeRepo.findOne({ where: { id: storeId } });
      if (!store || !['approved', 'active'].includes(String(store.status))) {
        throw new ForbiddenException(
          'Your shop is not approved to take parcels at the moment. Message support and they will explain where it stands.',
        );
      }

      const [pendingMove] = await this.storeRepo.manager.query(
        `SELECT id FROM "partner_move_requests"
          WHERE "partnerStoreId" = $1 AND status = 'pending' LIMIT 1`,
        [storeId],
      ).catch(() => [null]);
      if (pendingMove) {
        throw new ForbiddenException(
          'You have a move under review, so new parcels stay paused until we confirm your new address. '
          + 'You can still hand back anything you are already holding.',
        );
      }
    }

    // Operational toggle now lives on `acceptingNew` (not approval `status`).
    await this.storeRepo.update(storeId, { acceptingNew: status === 'active' });
    return { storeId, status };
  }

  /**
   * Why this shop is not taking parcels, in words it can show a shopkeeper.
   *
   * Null when it IS taking parcels. The distinction that matters is who
   * paused it: a shop that paused itself needs a switch, and a shop we
   * paused needs an explanation and no switch at all, because offering a
   * control that will be refused is worse than offering none.
   */
  async pausedReason(storeId: string): Promise<{ paused: boolean; reason: string | null; byUs: boolean }> {
    const store = await this.storeRepo.findOne({ where: { id: storeId } });
    if (!store) return { paused: true, reason: 'This shop is no longer on the system.', byUs: true };

    if (String(store.status) === 'suspended') {
      return {
        paused: true,
        byUs:   true,
        reason: 'Your shop is suspended, so it is not taking parcels. Message support to sort it out. '
              + 'Anything already on your shelf still needs handing back.',
      };
    }
    if (!['approved', 'active'].includes(String(store.status))) {
      return { paused: true, byUs: true, reason: 'Your shop has not been approved to take parcels yet.' };
    }

    const [move] = await this.storeRepo.manager.query(
      `SELECT id FROM "partner_move_requests"
        WHERE "partnerStoreId" = $1 AND status = 'pending' LIMIT 1`,
      [storeId],
    ).catch(() => [null]);
    if (move) {
      return {
        paused: true,
        byUs:   true,
        reason: 'You asked to move shop, so new parcels are paused until we confirm the new address. '
              + 'Please keep handing back anything you are already holding.',
      };
    }

    if (!store.acceptingNew) {
      return {
        paused: true,
        byUs:   false,
        reason: 'You have paused new drop-offs. Turn them back on whenever you are ready.',
      };
    }
    return { paused: false, reason: null, byUs: false };
  }

  // ── Partner store deletion readiness ───────────────────────────────────
  // Spec V8 - partner can't shut down their store while there are
  // packages in custody. Returns a structured blocker list so the UI
  // can guide them: "Return these N overstays first" / "Release these
  // M packages awaiting collection".
  async getDeletionReadiness(partnerStoreId: string, staffUserId: string) {
    await this.requireStoreStaff(partnerStoreId, staffUserId);
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
        action: `Release the ${inStore} package${inStore === 1 ? '' : 's'} currently in your store before closing - either to recipients (use Release flow) or back to senders (mark return).`,
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
  async listOverstays(partnerStoreId: string, staffUserId: string) {
    await this.requireStoreStaff(partnerStoreId, staffUserId);
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

  /**
   * Accrued storage on a package sitting at a counter.
   *
   * Free for storage_free_hours, then storage_24_72hr for each started
   * day beyond it. Derived from the arrival timestamp on every pass
   * rather than incremented, so a cron that runs twice, or not at all
   * for two days, still arrives at the same number.
   */
  private storageOwed(
    arrivedAt: Date,
    now: Date,
    freeHours: number,
    perDay: number,
    /**
     * The shop's own hours. Null means never answered, which charges
     * exactly as before, so nothing changes for a store that has not set
     * any.
     */
    hours?: Record<string, { enabled: boolean; start: string; end: string }> | null,
  ): number {
    const elapsed = (now.getTime() - new Date(arrivedAt).getTime()) / 3_600_000;
    const chargeable = elapsed - freeHours;
    if (chargeable <= 0) return 0;

    const started = Math.ceil(chargeable / 24);
    if (!hours) return started * perDay;

    /**
     * Do not charge a sender for days the shop chose to be shut.
     *
     * The escalation clock has always counted WORKING days while the
     * money counted calendar hours, so the two disagreed. A shop closes
     * for three days over a festive period, the sender cannot collect,
     * and the sender pays SEIRS for every one of those days for a delay
     * that was not theirs. The partner loses nothing either way: they
     * are paid a flat handling fee per parcel and storage never reaches
     * a partner payout.
     *
     * Counted from the end of the free window, one calendar day at a
     * time, charging only days the shop was open at all. A day the shop
     * never opened is not storage the sender agreed to.
     */
    const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const from = new Date(new Date(arrivedAt).getTime() + freeHours * 3_600_000);
    let chargeableDays = 0;
    const cursor = new Date(from);
    for (let i = 0; i < started; i++) {
      // Lagos is UTC+1 all year, matching withinWorkingHours.
      const lagos = new Date(cursor.getTime() + 60 * 60 * 1000);
      const day = hours[DAY_KEYS[lagos.getUTCDay()]];
      // A day the shop did not describe counts, for the same reason
      // unset hours mean open: silence is not a claim to be closed.
      if (!day || day.enabled !== false) chargeableDays++;
      // Exactly 24 hours, not "the same clock time tomorrow".
      // setDate() walks the SERVER's local calendar while the day above
      // is read in UTC, so on a host with daylight saving the two would
      // disagree twice a year and a parcel would gain or lose a day of
      // storage. Railway runs UTC today; this does not depend on it.
      cursor.setTime(cursor.getTime() + 24 * 60 * 60 * 1000);
    }
    return chargeableDays * perDay;
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async enforceStoragePolicy() {
    const returnFee = await this.feesService.getValueOr('return_to_sender_fee', 1500);
    // Every threshold below is a Fee Catalogue row. These used to be the
    // literals 3 and 5, with storage explicitly not charged, while the
    // catalogue advertised a different policy entirely.
    const freeHours = Number(await this.feesService.getValueOr('storage_free_hours', 24));
    const perDay    = Number(await this.feesService.getValueOr('storage_24_72hr', 200));
    const maxDays   = Number(await this.feesService.getValueOr('storage_max_days', 7));
    // Warn with two days left rather than at a second hardcoded number.
    const warnDays  = Math.max(1, maxDays - 2);

    const inStore = await this.dropoffRepo.find({
      where: [
        { status: DropoffStatus.AWAITING_DRIVER },
        { status: DropoffStatus.AT_DROPOFF_STORE },
        { status: DropoffStatus.AWAITING_COLLECTION },
      ],
    });

    let notified = 0;
    let returned = 0;
    let accrued  = 0;
    const now = new Date();

    /**
     * The hours of every shop holding a parcel, in one query.
     *
     * store_dropoffs carries ids, not relations, so this cannot be a join
     * without changing the entity. One lookup keyed by id costs a single
     * round trip for the whole nightly sweep.
     */
    const hoursByStore = new Map<string, any>();
    const storeIds = Array.from(new Set(
      inStore.flatMap(d => [d.pickupStoreId, d.dropoffStoreId]).filter(Boolean),
    ));
    if (storeIds.length) {
      const rows: any[] = await this.storeRepo.manager
        .query(`SELECT id, "workingHours" FROM "partner_stores" WHERE id = ANY($1)`, [storeIds])
        .catch((e: any) => {
          // Charging as before is the safe failure here, and it is the
          // one this ran with for months. Skipping the sweep entirely
          // would freeze every parcel's storage and its escalation.
          this.logger.warn(`storage hours lookup failed: ${e?.message ?? e}`);
          return [];
        });
      for (const r of rows) if (r.workingHours) hoursByStore.set(r.id, r.workingHours);
    }

    for (const d of inStore) {
      const arrivedAt = d.arrivedAtDropoffStoreAt ?? d.receivedAtStoreAt;
      if (!arrivedAt) continue;
      const workingDays = this.workingDaysBetween(new Date(arrivedAt), now);

      /**
       * Storage no longer accrues on days the shop was shut.
       *
       * This comment used to read "storage accrues on calendar hours, not
       * working days: a package occupies a shelf on Sunday too", and that
       * is true about the shelf and wrong about the money. The escalation
       * clock immediately above counts WORKING days; the charge counted
       * every calendar day. So a shop closes for three days over a festive
       * period, the sender cannot collect no matter how much they want to,
       * and the sender is billed for all three.
       *
       * Nobody is on the other side of that charge: storage is read only
       * as an amount owed by the sender and never enters a partner payout,
       * so a closed day was pure charge with no cost to anyone but the
       * customer, for a delay that was not theirs.
       *
       * Which shop is holding it decides whose hours apply: once it has
       * arrived at the destination store that is the one the recipient
       * must reach, and before that it is still sitting at the origin.
       */
      const holdingStoreId = d.arrivedAtDropoffStoreAt ? d.dropoffStoreId : d.pickupStoreId;
      const owed = this.storageOwed(
        new Date(arrivedAt), now, freeHours, perDay,
        holdingStoreId ? hoursByStore.get(holdingStoreId) : null,
      );
      if (owed !== Number(d.storageFeesAccruedNgn ?? 0)) {
        await this.dropoffRepo.update(d.id, { storageFeesAccruedNgn: owed } as any);
        accrued++;
      }

      if (workingDays >= maxDays) {
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
          `A return-transport fee of NGN ${returnFee.toLocaleString()} applies` +
          (owed > 0 ? `, plus NGN ${owed.toLocaleString()} of accrued storage` : '') +
          `. Open the SEIRS app to arrange the return.`,
        );
      } else if (workingDays >= warnDays && !d.senderOverstayNotifiedAt) {
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
          (owed > 0
            ? `Storage of NGN ${owed.toLocaleString()} has accrued so far.`
            : `No storage fees have accrued yet.`),
        );
      }
    }

    if (notified || returned || accrued) {
      this.logger.log(
        `Storage policy: warned=${notified} return-triggered=${returned} storage-updated=${accrued}`,
      );
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
      /**
       * Where the applicant was STANDING when they photographed the shop.
       *
       * Different from storeLat/storeLng in the way that matters. Those
       * come from an address picker and can be chosen from a sofa in
       * another city, which meant a shop's founding pin had no on-site
       * evidence behind it at all, and every distance check we later ran
       * was measured against it.
       *
       * This is a reading taken by the phone at the moment the shopfront
       * was photographed. Optional, because the permission is refusable
       * and a fix can fail indoors, and its absence is shown to the
       * reviewer rather than used to refuse an application.
       */
      storefrontLat?:       number;
      storefrontLng?:       number;
      storefrontAccuracyM?: number;
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

    /**
     * Queue the three documents for review as themselves.
     *
     * The URL columns above are still written because the admin store page
     * and the application view both read them. These rows are what carries
     * a per-document decision, a reason and an expiry, none of which a
     * column can hold.
     */
    await this.partnerDocs.recordApplication(
      store!,
      {
        storefront_photo: body.storefrontPhotoUrl,
        cac_registration: body.cacRegUrl,
        owner_id:         body.ownerIdUrl,
      },
      {
        storefront_photo: {
          lat:       body.storefrontLat,
          lng:       body.storefrontLng,
          accuracyM: body.storefrontAccuracyM,
        },
      },
    );

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
   * Idempotent - calling on an already-approved store is a no-op.
   */
  async adminApproveStore(storeId: string, adminUserId: string, note?: string) {
    const store = await this.storeRepo.findOne({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Partner store not found.');

    // Hard requirements before a shop may hold other people's packages
    // (founder decision 2026-08-12). Coordinates: without them the store
    // is invisible on every map and its drop-offs silently never become
    // driver jobs. Storefront photo: customers and drivers must be able
    // to recognise the shop on arrival, and it is our evidence that a
    // real premises was reviewed.
    if (store.storeLat == null || store.storeLng == null) {
      throw new BadRequestException(
        'This store has no map location. Ask the partner to re-enter their address using the address suggestions (not free text) so coordinates are captured, then approve.',
      );
    }
    if (!store.storefrontPhotoUrl) {
      throw new BadRequestException(
        'This store has no storefront photo. It is required before approval so customers and drivers can recognise the shop.',
      );
    }

    /**
     * Somewhere to send their money (founder decision 2026-09-03).
     *
     * Approval is the moment a shop starts earning handling fees, so
     * approving one with no bank account on file creates a debt with no
     * way to settle it. The founder's reasoning is not technical: owe a
     * woman running a counter NGN 40,000.00 and fail to send it and she
     * is the person least able to absorb it, and she will tell every
     * other shop on her street. That is a supply problem in that area we
     * would not recover from.
     *
     * Applications may open and documents may be reviewed without this.
     * Approval is the line.
     */
    if (!store.bankAccountNumber || !store.bankCode) {
      throw new BadRequestException(
        'This store has no payout account, so there would be nowhere to send its counter earnings. '
        + 'Ask the partner to add their bank account in the app, then approve.',
      );
    }

    // Mint the public store code on first approval and never again: it
    // goes on shelf labels and into customers' hands, so re-approving
    // after a suspension must not change it.
    const storeCode = store.storeCode ?? await this.uniqueStoreCode();

    await this.storeRepo.update(storeId, {
      status:     PartnerStoreStatus.APPROVED,
      storeCode,
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

    this.logger.log(`Partner store APPROVED: storeId=${storeId} code=${storeCode} owner=${store.userId} admin=${adminUserId}`);
    return { storeId, storeCode, status: PartnerStoreStatus.APPROVED };
  }

  /**
   * Store closure (founder decision 2026-08-12). A shop cannot simply
   * vanish while holding other people's packages, so closing is a
   * WIND-DOWN, not a switch:
   *
   *   1. New drop-offs stop immediately (acceptingNew = false).
   *   2. Packages already on the shelf must be collected or moved.
   *   3. Only when the shelf is empty does the store go inactive.
   *
   * The store code is retired permanently and never reissued, so labels
   * and receipts printed years ago still resolve to the right shop.
   */
  async beginStoreClosure(storeId: string, requestedByUserId: string, reason?: string) {
    const store = await this.storeRepo.findOne({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Partner store not found.');

    const staff = await this.usersRepo.findOne({ where: { id: requestedByUserId } });
    const isOwner = store.userId === requestedByUserId;
    const isAdmin = staff?.role === 'admin';
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Only the store owner or an admin can close a store.');
    }

    // Stop the inflow first, whatever else happens below.
    await this.storeRepo.update(storeId, { acceptingNew: false } as any);

    const held = await this.dropoffRepo.count({
      where: [
        { pickupStoreId:  storeId, status: In(IN_STORE_STATUSES) },
        { dropoffStoreId: storeId, status: In(IN_STORE_STATUSES) },
      ],
    });

    // Same jobs, different trigger. A wind-down is the other way a shop
    // goes away and the parcels need the same accounting.
    if (held > 0) await this.recovery.openTasksFor(storeId, RecoveryTrigger.CLOSURE);

    /**
     * An empty shelf is not the same as every parcel being accounted for.
     *
     * This used to gate only on the live count, so a parcel that left the
     * shop for ANY reason let the shop close: collected, yes, but equally
     * cancelled, lost, or quietly marked something else. The count reaching
     * zero cannot tell those apart, and closing on it is how a missing
     * package becomes a closed ticket.
     *
     * Now a person has to have recorded an outcome for each one, and
     * "unaccounted for" is an outcome they can record, so an honest answer
     * is always available and never has to be faked.
     */
    const unaccounted = await this.recovery.openCount(storeId);
    if (unaccounted > 0 && held === 0) {
      return {
        storeId,
        closed: false,
        packagesRemaining: 0,
        unaccountedFor: unaccounted,
        message:
          `The shelf is empty, but ${unaccounted} ${unaccounted === 1 ? 'parcel has' : 'parcels have'} `
          + 'no record of what happened to them. Each one needs an outcome before this shop can close.',
      };
    }

    if (held > 0) {
      return {
        storeId,
        closed: false,
        packagesRemaining: held,
        message:
          `Store is now refusing new drop-offs. ${held} package${held === 1 ? '' : 's'} still on the shelf: ` +
          'each must be collected by its recipient or moved to another store before the shop can close.',
      };
    }

    await this.storeRepo.update(storeId, {
      status:     PartnerStoreStatus.SUSPENDED,
      reviewNote: reason?.trim() || 'Closed by owner',
      reviewedAt: new Date(),
      reviewedBy: requestedByUserId,
    } as any);

    const owner = await this.usersRepo.findOne({ where: { id: store.userId } });
    if (owner) {
      await this.usersRepo.update(owner.id, {
        capabilities: { canSend: owner.capabilities?.canSend ?? true, canPartner: false },
      });
    }

    this.logger.log(`Partner store CLOSED: storeId=${storeId} code=${store.storeCode} by=${requestedByUserId}`);
    return {
      storeId,
      closed: true,
      packagesRemaining: 0,
      message: 'Store closed. Its store code is retired and will not be reissued.',
    };
  }

  /**
   * PART-XXXX with the no-lookalike alphabet, unique platform-wide.
   * The DB unique index is the authority; this retries so a collision
   * is an invisible regenerate rather than a failed approval.
   */
  private async uniqueStoreCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const candidate = 'PART-' + secureCode(4);
      const clash = await this.storeRepo.findOne({ where: { storeCode: candidate }, select: ['id'] });
      if (!clash) return candidate;
    }
    return 'PART-' + secureCode(6);
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

    /**
     * The parcels do not suspend with the shop.
     *
     * Suspension used to flip two flags and say nothing about what was on
     * the shelf, so a counter could be stopped for misconduct while still
     * holding six people's property and nothing anywhere recorded that
     * those six needed getting back. Raised BEFORE the flags flip, so a
     * failure here cannot leave a suspended shop with no follow-up.
     */
    const raised = await this.recovery.openTasksFor(storeId, RecoveryTrigger.SUSPENSION);
    if (raised > 0) {
      this.logger.warn(
        `Store ${storeId} suspended holding ${raised} parcel(s): recovery tasks opened.`,
      );
    }

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
  // One store with its owner and activity numbers, for the admin detail
  // page. Owner comes back trimmed: the page links to /users/[id] for
  // the full account view.
  /**
   * Make a photograph's location the shop's pin.
   *
   * The pin a shop is created with comes from an address picker, so it is
   * a guess somebody made about where their shop is, and it can be made
   * from anywhere. Every distance check we run afterwards is measured
   * against that guess, which is the weakest link in the whole partner
   * system: the check looks rigorous and its reference point is not.
   *
   * A premises photograph carries a reading taken by a phone standing
   * outside the building. This lets a reviewer promote that reading to be
   * the pin, so the shop's position becomes something measured at the shop
   * rather than chosen from a list.
   *
   * Deliberately a human action rather than automatic. A single reading
   * can be wrong: a weak fix, a phone that cached a position from the last
   * cell tower, or a photograph genuinely taken somewhere else. A reviewer
   * looking at the picture and the distance can tell; a rule cannot.
   */
  async adoptDocumentLocationAsPin(storeId: string, docId: string, adminUserId: string) {
    const [doc] = await this.storeRepo.manager.query(
      `SELECT "capturedLat", "capturedLng", "capturedAccuracyM"
         FROM "kyc_documents"
        WHERE "ownerType" = 'partner_store' AND "ownerId" = $1 AND "docId" = $2
        LIMIT 1`,
      [storeId, docId],
    );
    if (!doc?.capturedLat || !doc?.capturedLng) {
      throw new BadRequestException(
        'That photo carries no location, so there is nothing to move the pin to.',
      );
    }

    await this.storeRepo.update(storeId, {
      storeLat: doc.capturedLat,
      storeLng: doc.capturedLng,
    } as any);

    this.logger.log(
      `Store ${storeId} pin set from ${docId} capture by admin ${adminUserId} `
      + `(accuracy ${doc.capturedAccuracyM ?? 'unknown'} m)`,
    );
    return {
      storeId,
      lat: Number(doc.capturedLat),
      lng: Number(doc.capturedLng),
      accuracyM: doc.capturedAccuracyM ?? null,
      message: 'The shop pin now sits where that photo was taken.',
    };
  }

  async adminGetStore(id: string) {
    const store = await this.storeRepo.findOne({ where: { id } });
    if (!store) throw new NotFoundException('Partner store not found');

    const owner = store.userId
      ? await this.usersRepo.findOne({
          where: { id: store.userId },
          select: ['id', 'name', 'email', 'phone', 'accountId', 'emailVerified', 'identityVerifiedAt', 'createdAt'],
        })
      : null;

    const [held, lifetimePickup, lifetimeDropoff, payouts] = await Promise.all([
      // Both roles. A shop is holding a parcel whether it is waiting for a
      // driver to collect it or for a recipient to walk in, and the old
      // count saw only the first.
      this.dropoffRepo.count({
        where: [
          { pickupStoreId:  id, status: In(IN_STORE_STATUSES) },
          { dropoffStoreId: id, status: In(IN_STORE_STATUSES) },
        ],
      }),
      this.dropoffRepo.count({ where: { pickupStoreId: id } }),
      this.dropoffRepo.count({ where: { dropoffStoreId: id } }),
      this.payoutsRepo
        .createQueryBuilder('p')
        .select('p.status', 'status')
        .addSelect('COALESCE(SUM(p.amount), 0)', 'total')
        .where('p.partnerStoreId = :id', { id })
        .groupBy('p.status')
        .getRawMany(),
    ]);

    const payoutTotals: Record<string, number> = {};
    for (const row of payouts) payoutTotals[row.status] = Number(row.total);

    return {
      store,
      owner,
      activity: {
        packagesHeldNow: held,
        lifetimeHandled: lifetimePickup + lifetimeDropoff,
        payoutsPendingNgn: (payoutTotals['pending'] ?? 0) + (payoutTotals['processing'] ?? 0),
        payoutsPaidNgn: payoutTotals['paid'] ?? 0,
      },
    };
  }

  async adminListAllStores(status?: string) {
    const qb = this.storeRepo
      .createQueryBuilder('s')
      .orderBy('s.updatedAt', 'DESC');
    if (status) qb.where('s.status = :status', { status });
    return qb.getMany();
  }
}
