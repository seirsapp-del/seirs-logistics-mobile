import {
  Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger,
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
import { HandoffMethod, HandoffStage } from '../identity/handoff-record.entity';
import { MailService } from '../mail/mail.service';
import { secureCode } from '../common/utils/auth-codes';

// "In store" means physically present at the pickup or dropoff location -
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
function isOpenNow(days: string[] | null, open: string, close: string): boolean {
  try {
    const now  = new Date();
    const lagos = new Date(now.getTime() + 60 * 60 * 1000);
    const dow  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][lagos.getUTCDay()];
    if (Array.isArray(days) && days.length && !days.includes(dow)) return false;
    const mins = lagos.getUTCHours() * 60 + lagos.getUTCMinutes();
    const [oh, om] = (open  ?? '08:00').split(':').map(Number);
    const [ch, cm] = (close ?? '18:00').split(':').map(Number);
    return mins >= oh * 60 + om && mins < ch * 60 + cm;
  } catch { return false; }
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
    private readonly feesService:    FeesService,
    private readonly pricing:        PricingService,
    private readonly payments:       PaymentsService,
    private readonly identityService: IdentityService,
    private readonly mailService:    MailService,
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

    // Straight-line distance, then the rate card's own circuity factor
    // turns it into road distance. Same treatment bulk upload gives an
    // address-only row.
    const km = (originLat != null && originLng != null && destLat != null && destLng != null)
      ? haversineKm(originLat, originLng, destLat, destLng)
      : 0;

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

  /** Counter handling fee for a parcel of this weight, from the catalogue. */
  private async counterFeeFor(weightKg: number): Promise<number> {
    if (weightKg > 50) return this.feesService.getValueOr('counter_fee_bulk_ngn', 1500);
    if (weightKg > 20) return this.feesService.getValueOr('counter_fee_large_ngn', 900);
    if (weightKg > 5)  return this.feesService.getValueOr('counter_fee_medium_ngn', 500);
    return this.feesService.getValueOr('counter_fee_small_ngn', 300);
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
  async receiveAtStore(staffUserId: string, body: {
    code:             string;       // either dropCode or backupCode
    weightKg:         number;       // partner's actual weight measurement
    receivedPhotoUrl: string;       // proof photo of package on partner counter
    senderOtp:        string;       // sender shows OTP from email
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
    // use to verify recipients. Stage = CUSTOMER_TO_STORE (sender → store).
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

    if (!dropoff.recipientUserId) {
      throw new BadRequestException(
        'Recipient is unknown - only registered SEIRS users can collect via this flow',
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
      subjectUserId:     dropoff.recipientUserId,
      subjectValueNgn:   Number(dropoff.declaredValueNgn ?? 0),
      receiverFirstName: dropoff.recipientName?.split(' ')[0] ?? null,
      receiverLastName:  dropoff.recipientName?.split(' ').slice(1).join(' ') || null,
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

    // Lagos time, because opening hours are local trading hours.
    const now = new Date(Date.now() + 60 * 60 * 1000);
    const dayName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getUTCDay()];
    const minutesNow = now.getUTCHours() * 60 + now.getUTCMinutes();
    const toMinutes = (hhmm?: string | null) => {
      const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };

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
      const days = (st.operatingDays ?? []).map((d) => String(d).slice(0, 3).toLowerCase());
      const openM = toMinutes(st.openTime), closeM = toMinutes(st.closeTime);
      const openToday = days.length === 0 || days.includes(dayName);
      const isOpenNow = openToday && openM != null && closeM != null
        ? minutesNow >= openM && minutesNow < closeM
        : openToday;
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
            openNow:      isOpenNow(s.operatingDays, s.openTime, s.closeTime),
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
          storefrontPhotoUrl: s.storefrontPhotoUrl ?? null, // helps a customer recognise the shop on arrival
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
  // Spec V8 - partner can't shut down their store while there are
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
