import {
  Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeesService } from '../fees/fees.service';
import { RateCard } from './rate-card.entity';
import { ServiceCategory } from './service-category.entity';
import { DEFAULT_RATE_CARD, DEFAULT_SERVICE_CATEGORIES } from './pricing.seed';
import {
  detectStateFromCoords, areStatesAdjacent, getStateZone,
  type StateCode, type GeopoliticalZone,
} from './regions';

/**
 * Shape of the price breakdown stored on each Delivery + returned to
 * the booking flow so business + driver apps can show transparent
 * line items.
 */
export interface PriceBreakdown {
  vehicleType:   string;
  categoryCode:  string;
  km:            number;
  stops:         number;
  estimatedDwellMinutes: number;

  // Customer-facing line items
  customer: {
    base:           number;
    distanceLabour: number;
    distanceFuel:   number;
    stopBonuses:    number;
    dwellOver:      number;     // wait fees if any
    categorySurcharge: number;
    timeSurcharges: { night: number; peak: number; weekend: number };
    zoneSurcharges: { interState: number; longDistance: number; overnight: number; restricted: number };
    discounts:      { bulk: number; recurring: number; loyalty: number; welcome: number };
    vatBase:        number;     // pre-VAT subtotal
    vat:            number;
    /** Paid straight through to partner counters, not SEIRS revenue. */
    partnerHandling: number;
    total:          number;     // final customer pays
  };

  // Driver-facing line items
  driver: {
    base:             number;
    distanceLabour:   number;
    distanceFuel:     number;   // full pass-through reimbursement
    stopBonuses:      number;
    dwellOver:        number;
    surchargeShare:   number;
    total:            number;
  };

  // Platform retention, before the cost of collecting it
  seirsNet: number;

  /**
   * What serving the job really costs, and what is left afterwards.
   * seirsNet flatters the business; contribution is the honest number.
   */
  trueCosts: {
    cardProcessing:   number;
    postalFundLevy:   number;
    failureProvision: number;
    contribution:     number;
    belowFloor:       boolean;
    marginFloorNgn:   number;
  };

  // The rate card snapshot id so future audits can reproduce this
  // calculation exactly.
  rateCardSnapshotId: string;
}

/**
 * Package-count caps per vehicle when the active rate card predates the
 * maxPackages field (founder 2026-08-15: never unlimited, an okada cannot
 * carry 40 parcels and a failed pickup is a refund). Admin overrides live
 * in the rate card's vehicleRates.<type>.maxPackages.
 */
export const DEFAULT_MAX_PACKAGES: Record<string, number> = {
  bicycle: 3, motorcycle: 5, tricycle: 15, car: 20,
  van: 40, truck_small: 80, truck_large: 150,
};

/** Pump prices in naira per litre, as they are TODAY rather than as the rate card froze them. */
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface FuelPrices { petrol: number; diesel: number; }

export interface PricingInput {
  vehicleType:   string;          // bicycle | motorcycle | ... | truck_large
  categoryCode:  string;          // documents | fragile | ...
  km:            number;          // total route km (after optimization)
  stopCount:     number;          // 1 for single-leg, N for multi-stop
  weightKg:      number;
  /** Estimated minutes the driver will spend not driving across all stops. */
  estimatedDwellMinutes: number;
  /**
   * Multi-package rebuild (2026-08-16): when a run carries packages with
   * MIXED categories/weights, list them here. weightKg above stays the
   * TOTAL. Each package's category surcharge applies to its equal share
   * of the run subtotal (a blended surcharge), every category's safety
   * rules are enforced, and the vehicle's maxPackages cap applies.
   */
  packages?: Array<{ categoryCode: string; weightKg: number }>;
  /**
   * Number of parcel-to-counter handovers on this run (founder
   * 2026-08-16). One for each parcel dropped at a pickup counter, plus
   * one for each parcel delivered into a counter. Each is paid to the
   * partner at the catalogue rate. Quoting and booking both pass this,
   * so the review screen and the charge can never disagree.
   */
  partnerStoreTouches?: number;
  scheduledAt?:  Date;             // if undefined, treated as "now"

  /**
   * Preferred - provide coords and the service detects pickup/dropoff
   * states + applies the correct zone-surcharge tier + regional rate
   * multiplier. Fall back to the legacy flags below when coords aren't
   * available (e.g. CSV bulk upload with address-only rows).
   */
  pickupCoords?:  { latitude: number; longitude: number };
  dropoffCoords?: { latitude: number; longitude: number };

  /**
   * Override the auto-detected state codes. Mostly for tests + cases
   * where the bbox returns null (offshore, edge cases) but the address
   * geocoder has already resolved the state name.
   */
  pickupStateCode?:  StateCode;
  dropoffStateCode?: StateCode;

  // ── Legacy flags (still honoured when neither coords nor stateCodes provided) ──
  isInterState?:     boolean;
  isLongDistance?:   boolean;
  isRestrictedZone?: { state: string };

  // ── Discounts (unchanged) ──
  isBulk?:               boolean;
  isRecurring?:          boolean;
  loyaltyPointsToRedeem?: number;
  isWelcome?:            boolean;
}

/**
 * Merged regional overrides - baseline ↘ geopolitical zone ↘ state.
 * State-level wins over zone-level.
 */
interface ResolvedRegion {
  rateMultiplier:   number;
  fuelPrices?:      { petrolNgn?: number; dieselNgn?: number };
  serviceFeeRideOverride?:    number;
  serviceFeePackageOverride?: number;
  dwellBufferMin?:  number;
  vehicleOverrides?: Record<string, { base?: number; perKm?: number }>;
}

@Injectable()
export class PricingService implements OnModuleInit {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    @InjectRepository(RateCard)
    private readonly rateCardRepo: Repository<RateCard>,
    @InjectRepository(ServiceCategory)
    private readonly categoryRepo: Repository<ServiceCategory>,
    private readonly fees: FeesService,
  ) {}

  /**
   * On first boot, seed default rate card + service categories if the
   * tables are empty. Subsequent boots are no-ops.
   */
  async onModuleInit() {
    await this.selfHealSchema();
    await this.seedIfEmpty();
  }

  /**
   * Add columns production cannot add for itself.
   *
   * Production runs with synchronize off, so a new entity column exists
   * in code and not in the database, and every SELECT against the table
   * fails. Adding `insurance` took /config/rate-card down with a 500,
   * which is the endpoint all three apps call on boot to price anything
   * (2026-08-18). The whole platform could not quote.
   *
   * Same self-heal pattern the partner-store module uses: idempotent,
   * per-statement, and a failure is logged rather than crashing boot.
   */
  private async selfHealSchema() {
    const statements = [
      ['rate_cards.insurance', `ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "insurance" jsonb NULL`],
      // Cards published before the column existed carry NULL, which
      // would leave the admin editor with nothing to write into.
      // Disabled and zeroed: no premium, no promise.
      ['rate_cards.insurance backfill', `
        UPDATE "rate_cards"
           SET "insurance" = '{"enabled":false,"premiumPct":0,"minPremiumNgn":0,"declaredValueThresholdNgn":0,"maxCoverageNgn":0}'::jsonb
         WHERE "insurance" IS NULL
      `],
    ];
    for (const [label, sql] of statements) {
      try {
        await this.rateCardRepo.query(sql);
      } catch (e: any) {
        this.logger.error(`pricing self-heal FAILED [${label}]: ${e?.message ?? e}`);
      }
    }
  }

  private async seedIfEmpty() {
    const rateCount = await this.rateCardRepo.count();
    if (rateCount === 0) {
      this.logger.log('Seeding default rate card (v1) - matches pricing-spec.html');
      const card = this.rateCardRepo.create({
        ...DEFAULT_RATE_CARD,
        activatedAt: new Date(),
        activatedBy: 'system-seed',
      } as any);
      await this.rateCardRepo.save(card);
    }

    const catCount = await this.categoryRepo.count();
    if (catCount === 0) {
      this.logger.log(`Seeding ${DEFAULT_SERVICE_CATEGORIES.length} default service categories`);
      const rows = DEFAULT_SERVICE_CATEGORIES.map((c) => this.categoryRepo.create(c as any));
      await this.categoryRepo.save(rows as any);
    }
  }

  /** Currently-active rate card. There should always be exactly one. */
  async getActiveRateCard(): Promise<RateCard> {
    const card = await this.rateCardRepo.findOne({ where: { isActive: true } });
    if (!card) throw new NotFoundException('No active rate card - seed the database.');
    return card;
  }

  /** All active service categories, sorted for UI display. */
  async getServiceCategories(): Promise<ServiceCategory[]> {
    return this.categoryRepo.find({ where: { active: true }, order: { sortOrder: 'ASC' } });
  }

  async getCategoryByCode(code: string): Promise<ServiceCategory> {
    const cat = await this.categoryRepo.findOne({ where: { code, active: true } });
    if (!cat) throw new NotFoundException(`Unknown or inactive category: ${code}`);
    return cat;
  }

  // ── Pricing math ─────────────────────────────────────────────────────

  /**
   * The dwell-time tier for a given weight in kg. Returns extra minutes
   * to add on top of the category setup time.
   */
  weightTierMinutes(card: RateCard, weightKg: number): number {
    for (const tier of card.weightTiers) {
      if (weightKg >= tier.minKg && (tier.maxKg === null || weightKg < tier.maxKg)) {
        return tier.extraMinutes;
      }
    }
    return 0;
  }

  /**
   * Compute estimated dwell minutes per stop given category + weight.
   * Buffer (Nigerian cultural) is added once per stop on top.
   */
  computeStopDwellMinutes(card: RateCard, category: ServiceCategory, weightKg: number): number {
    return category.setupDwellMinutes
         + this.weightTierMinutes(card, weightKg)
         + card.dwellBuffers.baselineMinutes;
  }

  /**
   * Compute fuel cost per km for the given vehicle at today's pump price.
   * Uses regional fuel-price override when the pickup state's region has
   * one (e.g. SS zone's higher pump prices), else baseline.
   */
  fuelPerKm(card: RateCard, vehicleType: string, region?: ResolvedRegion): number {
    const v = card.vehicleRates[vehicleType];
    if (!v || v.fuelType === 'none' || v.kmPerLitre <= 0) return 0;
    const override = region?.fuelPrices;
    const price = v.fuelType === 'petrol'
      ? (override?.petrolNgn ?? card.fuelPrices.petrolPerLitreNgn)
      : (override?.dieselNgn ?? card.fuelPrices.dieselPerLitreNgn);
    return price / v.kmPerLitre;
  }

  /**
   * What fuel actually costs at the pump today, as a REFERENCE.
   *
   * The rate card remains the single source of truth for money: it is
   * what drivers are reimbursed from and what customers are quoted, and
   * publishing a new version leaves a proper audit trail of why a price
   * changed. Briefly this was overridden from the catalogue, which split
   * the truth in two: the admin pricing page showed one fuel price while
   * reimbursement used another, so editing the visible one did nothing.
   *
   * These values exist only to answer "has the card fallen behind", and
   * to be copied into a new card version in one action when it has.
   */
  async livePumpPrices(card: RateCard): Promise<FuelPrices> {
    const [petrol, diesel] = await Promise.all([
      this.fees.getValueOr('current_petrol_price_ngn', Number(card.fuelPrices.petrolPerLitreNgn)),
      this.fees.getValueOr('current_diesel_price_ngn', Number(card.fuelPrices.dieselPerLitreNgn)),
    ]);
    return { petrol, diesel };
  }

  /**
   * How far the live pump price has drifted from what the active rate
   * card assumes. Drives the admin warning: past the threshold, the
   * card's customer-facing rates are stale even though the driver's
   * fuel is being corrected, and it should be republished.
   */
  async fuelDrift() {
    const card = await this.getActiveRateCard();
    const live = await this.livePumpPrices(card);
    const cardPetrol = Number(card.fuelPrices.petrolPerLitreNgn);
    const cardDiesel = Number(card.fuelPrices.dieselPerLitreNgn);
    const pct = (live_: number, card_: number) =>
      card_ > 0 ? Math.round(((live_ - card_) / card_) * 1000) / 10 : 0;
    const threshold = await this.fees.getValueOr('fuel_reprice_trigger_pct', 10);
    const petrolDrift = pct(live.petrol, cardPetrol);
    const dieselDrift = pct(live.diesel, cardDiesel);
    return {
      petrol: { card: cardPetrol, live: live.petrol, driftPct: petrolDrift },
      diesel: { card: cardDiesel, live: live.diesel, driftPct: dieselDrift },
      thresholdPct: threshold,
      stale: Math.abs(petrolDrift) >= threshold || Math.abs(dieselDrift) >= threshold,
    };
  }

  /**
   * Merge baseline ↘ zone override ↘ state override (state wins on conflict).
   * Returns a flat, fully-resolved view ready to apply to a quote.
   */
  resolveRegion(card: RateCard, stateCode: StateCode | null): ResolvedRegion {
    if (!stateCode || !card.regions) return { rateMultiplier: 1 };
    const zone = getStateZone(stateCode);
    const fromZ = (zone && card.regions.zoneOverrides?.[zone]) ?? {};
    const fromS = card.regions.stateOverrides?.[stateCode] ?? {};
    return {
      rateMultiplier:           fromS.rateMultiplier ?? fromZ.rateMultiplier ?? 1,
      fuelPrices:               { ...(fromZ.fuelPrices ?? {}), ...(fromS.fuelPrices ?? {}) },
      serviceFeeRideOverride:   fromS.serviceFeeRideOverride    ?? fromZ.serviceFeeRideOverride,
      serviceFeePackageOverride: fromS.serviceFeePackageOverride ?? fromZ.serviceFeePackageOverride,
      dwellBufferMin:           fromS.dwellBufferMin ?? fromZ.dwellBufferMin,
      vehicleOverrides:         { ...(fromZ.vehicleOverrides ?? {}), ...(fromS.vehicleOverrides ?? {}) },
    };
  }

  /**
   * State-aware zone-surcharge tier. New in v2 - falls back to v1 flags
   * (input.isInterState / input.isLongDistance / input.isRestrictedZone)
   * when neither coords nor explicit state codes are provided.
   */
  zoneSurchargeForBooking(
    card: RateCard,
    input: PricingInput,
    pickupState: StateCode | null,
    dropoffState: StateCode | null,
  ): { pct: number; flat: number; restrictedPct: number; labels: string[] } {
    const z = card.zoneSurcharges;
    const labels: string[] = [];
    let pct = 0;

    const hasV2 = z.interStateAdjacentPct != null || z.crossZonePct != null;

    if (pickupState && dropoffState && hasV2) {
      // ── New v2 tier ───────────────────────────────────────────────
      if (pickupState === dropoffState) {
        if (input.km > (z.intraStateLongHaulKm ?? 100)) {
          pct += pctValue(z.intraStateLongHaulPct, 15);
          labels.push('intraStateLongHaul');
        }
      } else {
        const sameZone = getStateZone(pickupState) === getStateZone(dropoffState);
        if (!sameZone) {
          pct += pctValue(z.crossZonePct, 40);
          labels.push('crossZone');
        } else if (areStatesAdjacent(pickupState, dropoffState)) {
          pct += pctValue(z.interStateAdjacentPct, 20);
          labels.push('interStateAdjacent');
        } else {
          pct += pctValue(z.interStateDistantPct, 30);
          labels.push('interStateDistant');
        }
      }
    } else {
      // ── v1 legacy fallback ────────────────────────────────────────
      if (input.isInterState) {
        pct += pctValue(z.interStatePercent, 20);
        labels.push('interState');
      }
      if (input.isLongDistance) {
        pct += pctValue(z.longDistancePercent, 30);
        labels.push('longDistance');
      }
    }

    const overnightKm = z.overnightFeeKm ?? z.overnightThresholdKm ?? 500;
    const flat = input.km >= overnightKm ? (z.overnightFeeNgn ?? 0) : 0;
    if (flat > 0) labels.push('overnight');

    // Restricted: prefer richer v2 sub-zones (admin-addable), fall back to v1 array.
    let restrictedPct = 0;
    const subZone = card.regions?.restrictedSubZones?.find(
      sz => sz.active && (sz.stateCode === pickupState || sz.stateCode === dropoffState),
    );
    if (subZone) {
      restrictedPct = subZone.surchargePct;
      labels.push(`restricted:${subZone.name}`);
    } else if (input.isRestrictedZone) {
      const legacy = z.restrictedZones?.find(r => r.state === input.isRestrictedZone!.state);
      if (legacy) {
        restrictedPct = legacy.surchargePercent;
        labels.push('restricted');
      }
    }

    return { pct, flat, restrictedPct, labels };
  }

  /**
   * Main pricing function. Computes the full breakdown for a booking
   * and returns it ready to snapshot onto the Delivery row.
   *
   * NOTE: surcharge stacking is multiplicative on the running subtotal.
   * VAT is applied after all surcharges and discounts. Driver share is
   * computed per-line so the breakdown stays auditable.
   */
  async computePrice(input: PricingInput): Promise<PriceBreakdown> {
    const card = await this.getActiveRateCard();
    const category = await this.getCategoryByCode(input.categoryCode);

    const v = card.vehicleRates[input.vehicleType];
    if (!v) throw new BadRequestException(`Unknown vehicle type: ${input.vehicleType}`);
    if (input.weightKg > v.maxPayloadKg) {
      throw new BadRequestException(
        `Weight ${input.weightKg}kg exceeds ${input.vehicleType} payload cap of ${v.maxPayloadKg}kg. Choose a larger vehicle.`,
      );
    }

    // Vehicle safety hard-stops by category
    const blocked = category.safetyRules?.blockedVehicles ?? [];
    if (blocked.includes(input.vehicleType)) {
      throw new BadRequestException(
        category.safetyRules?.warningCopy
          ?? `${category.name} can\'t be transported by ${input.vehicleType}.`,
      );
    }

    // ── Multi-package runs: cap + per-package safety + blended surcharge ──
    // Every package's category must tolerate the vehicle, and the count
    // must fit the vehicle's capacity (card override, code default).
    let packageCategories: Array<{ pct: number }> | null = null;
    if (input.packages && input.packages.length > 0) {
      const maxPackages =
        Number((v as any).maxPackages) || DEFAULT_MAX_PACKAGES[input.vehicleType] || 20;
      if (input.packages.length > maxPackages) {
        throw new BadRequestException(
          `${input.packages.length} packages exceed the ${input.vehicleType} limit of ${maxPackages}. Split the run or choose a larger vehicle.`,
        );
      }
      packageCategories = [];
      for (const pkg of input.packages) {
        const cat = await this.getCategoryByCode(pkg.categoryCode);
        const catBlocked = cat.safetyRules?.blockedVehicles ?? [];
        if (catBlocked.includes(input.vehicleType)) {
          throw new BadRequestException(
            cat.safetyRules?.warningCopy
              ?? `${cat.name} cannot be moved by ${input.vehicleType}.`,
          );
        }
        packageCategories.push({ pct: Number(cat.surchargePercent) || 0 });
      }
    }

    // ── Regional context ─────────────────────────────────────────
    // Detect pickup/dropoff state from coords if supplied; honour explicit
    // overrides for tests / address-only flows; otherwise null (legacy path).
    const pickupState: StateCode | null =
      input.pickupStateCode ??
      (input.pickupCoords ? detectStateFromCoords(input.pickupCoords.latitude, input.pickupCoords.longitude) : null);
    const dropoffState: StateCode | null =
      input.dropoffStateCode ??
      (input.dropoffCoords ? detectStateFromCoords(input.dropoffCoords.latitude, input.dropoffCoords.longitude) : null);

    const region = this.resolveRegion(card, pickupState);
    const mult   = region.rateMultiplier;
    const fuelKm = this.fuelPerKm(card, input.vehicleType, region);

    // Per-vehicle override (e.g. SS region might override van base only).
    const vehicleOv = region.vehicleOverrides?.[input.vehicleType] ?? {};

    // ── Customer side ──
    const base           = (vehicleOv.base  ?? v.baseFareCustomer)    * mult;
    const distanceLabour = (vehicleOv.perKm ?? v.labourPerKmCustomer) * mult * input.km;
    const distanceFuel   = fuelKm * input.km;
    // For single-stop bookings, the "stop bonus" is zero (the first stop
    // is the only drop). Bonuses kick in from stop #2 onward.
    const extraStops     = Math.max(0, input.stopCount - 1);
    const stopBonuses    = card.stopAndDwell.perStopBonusCustomer * extraStops;
    // Dwell fee only applies to OVERAGE past the free threshold. The
    // estimated dwell is already covered by base + stop bonuses; this
    // line is for actual measured overage on completed deliveries.
    // At booking time it's zero - we'll add it post-delivery.
    /**
     * Waiting time, which the card has always priced and the engine has
     * always thrown away.
     *
     * perDwellMinuteCustomer, perDwellMinuteDriver, the free threshold
     * and the cap were all configured and none of them were read: dwell
     * was pinned at zero and estimatedDwellMinutes was discarded (audit
     * 2026-08-18). A rider held up twenty-five minutes at a market stall
     * earned nothing for it, which in Lagos is a large part of a day.
     *
     * The free threshold protects a customer who is simply a bit slow to
     * come down; the cap stops an open-ended charge on a booking nobody
     * is watching.
     */
    const sd = card.stopAndDwell;
    const billableDwell = Math.min(
      Math.max(0, (input.estimatedDwellMinutes ?? 0) - sd.freeDwellThresholdMinutes),
      sd.dwellCapMinutes,
    );
    const dwellOver      = round2(billableDwell * sd.perDwellMinuteCustomer);

    const subtotalPreSurcharge = base + distanceLabour + distanceFuel + stopBonuses + dwellOver;

    // Mixed-category runs surcharge each package's EQUAL SHARE of the
    // subtotal at its own category rate; the sum is a blended surcharge
    // that itemizes cleanly on the receipt. Single-category runs keep
    // the original one-line formula (identical result when all match).
    const categorySurcharge = packageCategories
      ? packageCategories.reduce(
          (sum, pc) => sum + (subtotalPreSurcharge / packageCategories!.length) * (pc.pct / 100),
          0,
        )
      : subtotalPreSurcharge * (Number(category.surchargePercent) / 100);

    const tNow = input.scheduledAt ?? new Date();
    const t = card.timeSurcharges;
    const isNight   = inWindow(tNow, t.night.windowStart,   t.night.windowEnd);
    const isPeak    = !isNight && isWeekday(tNow) && inWindow(tNow, t.peak.windowStart, t.peak.windowEnd);
    const isWeekend = !isNight && !isWeekday(tNow);

    const subtotalPreTime = subtotalPreSurcharge + categorySurcharge;
    const nightSur   = isNight   ? subtotalPreTime * (t.night.customerPercent   / 100) : 0;
    const peakSur    = isPeak    ? subtotalPreTime * (t.peak.customerPercent    / 100) : 0;
    const weekendSur = isWeekend ? subtotalPreTime * (t.weekend.customerPercent / 100) : 0;

    const subtotalPreZone = subtotalPreTime + nightSur + peakSur + weekendSur;

    // State-aware zone surcharge - replaces the flat interState/longDistance
    // flags with a real tier (intra-state long-haul / inter-state adjacent /
    // inter-state distant / cross-zone) detected from pickup+dropoff states.
    const zr = this.zoneSurchargeForBooking(card, input, pickupState, dropoffState);
    const tierSur       = subtotalPreZone * zr.pct;
    const restrictedSur = subtotalPreZone * (zr.restrictedPct / 100);
    const overnightSur  = zr.flat;
    // Keep the breakdown shape stable for the booking UI - bucket the
    // tier surcharge into the most appropriate legacy field.
    const labelOfTier = zr.labels.find(l =>
      ['interState','interStateAdjacent','interStateDistant','crossZone','intraStateLongHaul'].includes(l)
    );
    const interStateSur   = labelOfTier && labelOfTier.startsWith('interState') ? tierSur : 0;
    const longDistanceSur = labelOfTier === 'crossZone' || labelOfTier === 'intraStateLongHaul' ? tierSur : 0;

    const subtotalPreDiscount =
      subtotalPreZone + interStateSur + longDistanceSur + overnightSur + restrictedSur;

    const d = card.discounts;
    const bulkDisc      = input.isBulk      ? subtotalPreDiscount * (d.bulkUploadOffPercent / 100) : 0;
    const recurringDisc = input.isRecurring ? subtotalPreDiscount * (d.recurringOffPercent  / 100) : 0;
    const welcomeDiscRaw = input.isWelcome ? subtotalPreDiscount * (d.welcomeOffPercent / 100) : 0;
    const welcomeDisc   = Math.min(welcomeDiscRaw, d.welcomeMaxNgn);
    const loyaltyDisc   = (input.loyaltyPointsToRedeem ?? 0) * d.loyaltyPointValueNgn;

    const subtotalVatBase = Math.max(
      0,
      subtotalPreDiscount - bulkDisc - recurringDisc - welcomeDisc - loyaltyDisc,
    );

    const vat   = subtotalVatBase * Number(card.vatRate);
    const total0 = subtotalVatBase + vat;

    /**
     * Partner counter handling. A disbursement to the shop, added AFTER
     * VAT because SEIRS is passing it through rather than selling it, and
     * excluded from seirsNet below for the same reason.
     */
    const partnerHandling = (input.partnerStoreTouches ?? 0) > 0
      ? Math.round((await this.fees.getValueOr('partner_store_handling_ngn', 500))
          * (input.partnerStoreTouches ?? 0) * 100) / 100
      : 0;
    const total = Math.round((total0 + partnerHandling) * 100) / 100;

    // ── Driver side ── (same regional multiplier, full fuel pass-through)
    const dBase           = (vehicleOv.base  ?? v.baseFareDriver)    * mult;
    const dDistanceLabour = (vehicleOv.perKm ?? v.labourPerKmDriver) * mult * input.km;
    const dDistanceFuel   = fuelKm * input.km;          // full pass-through
    const dStopBonuses    = card.stopAndDwell.perStopBonusDriver * extraStops;
    const dDwellOver      = round2(billableDwell * sd.perDwellMinuteDriver);

    // Driver share of time + zone surcharges (configurable %)
    const dNightShare   = nightSur   * (t.night.driverSharePercent   / 100);
    const dPeakShare    = peakSur    * (t.peak.driverSharePercent    / 100);
    const dWeekendShare = weekendSur * (t.weekend.driverSharePercent / 100);
    const surchargeShare = dNightShare + dPeakShare + dWeekendShare;

    const driverTotal = dBase + dDistanceLabour + dDistanceFuel
                      + dStopBonuses + dDwellOver + surchargeShare;

    // SEIRS net = customer subtotal (excl. VAT) minus driver pay minus VAT remitted
    // (partner store cuts handled separately in partner-store flows)
    const seirsNet = subtotalVatBase - driverTotal;

    /**
     * What the gross margin above actually costs us to collect.
     *
     * None of these were modelled anywhere, so every quote reported a
     * margin the company never saw (review 2026-08-18):
     *
     *   - the card processor takes its cut of every naira collected;
     *   - NIPOST requires a share of revenue for the Postal Fund, which
     *     is statutory and unavoidable;
     *   - a door delivery that finds nobody home becomes a second trip
     *     at no extra revenue, which is the largest hidden cost in
     *     Nigerian last-mile and appeared in no dashboard we had.
     *
     * Counter deliveries carry no failed-delivery provision: a shop is
     * open when it is open and never goes out.
     */
    const [processorPct, levyPct, failureRate, marginFloor] = await Promise.all([
      this.fees.getValueOr('card_processing_pct', 1.4),
      this.fees.getValueOr('nipost_postal_fund_pct', 2),
      this.fees.getValueOr('door_delivery_failure_pct', 8),
      this.fees.getValueOr('min_job_margin_ngn', 0),
    ]);

    /**
     * The failure provision models a LAST-MILE parcel arriving at a door
     * with nobody behind it. It must not be charged against scheduled
     * freight: a van or truck delivering to a business has an agreed
     * slot and a person waiting, and applying a door-failure rate to a
     * NGN 377,000 truck run produced a NGN 30,000 phantom cost that
     * turned a profitable job negative on paper.
     *
     * A counter delivery carries no provision either, because a shop is
     * open when it is open and never goes out. That difference is a real
     * part of why counters are worth more than doors.
     */
    const scheduledFreight = input.vehicleType === 'van'
      || input.vehicleType === 'truck_small'
      || input.vehicleType === 'truck_large';
    const usesCounter    = (input.partnerStoreTouches ?? 0) > 0;
    const processorCost  = round2(total * (processorPct / 100));
    const postalLevy     = round2(total * (levyPct / 100));
    const failureProvision = (usesCounter || scheduledFreight)
      ? 0
      : round2(driverTotal * (failureRate / 100));
    const contribution   = round2(seirsNet - processorCost - postalLevy - failureProvision);

    return {
      vehicleType:  input.vehicleType,
      categoryCode: input.categoryCode,
      km:           input.km,
      stops:        input.stopCount,
      estimatedDwellMinutes: input.estimatedDwellMinutes,
      customer: {
        base, distanceLabour, distanceFuel, stopBonuses, dwellOver,
        categorySurcharge,
        timeSurcharges: { night: nightSur, peak: peakSur, weekend: weekendSur },
        zoneSurcharges: { interState: interStateSur, longDistance: longDistanceSur, overnight: overnightSur, restricted: restrictedSur },
        discounts:      { bulk: bulkDisc, recurring: recurringDisc, loyalty: loyaltyDisc, welcome: welcomeDisc },
        vatBase: subtotalVatBase, vat, partnerHandling, total,
      },
      driver: {
        base: dBase, distanceLabour: dDistanceLabour, distanceFuel: dDistanceFuel,
        stopBonuses: dStopBonuses, dwellOver: dDwellOver, surchargeShare,
        total: driverTotal,
      },
      seirsNet,
      /**
       * Gross margin less every real cost of serving the job. This, not
       * seirsNet, is what the company actually keeps.
       */
      trueCosts: {
        cardProcessing:    processorCost,
        postalFundLevy:    postalLevy,
        failureProvision,
        contribution,
        belowFloor:        marginFloor > 0 && contribution < marginFloor,
        marginFloorNgn:    marginFloor,
      },
      rateCardSnapshotId: card.id,
    };
  }
}

// ── helpers ─────────────────────────────────────────────────────────────

/** Returns true if `now`'s HH:MM is inside [start, end). Handles wrap-around (e.g. 22:00-05:00). */
function inWindow(now: Date, start: string, end: string): boolean {
  const mins = now.getHours() * 60 + now.getMinutes();
  const s = toMinutes(start);
  const e = toMinutes(end);
  return s <= e ? mins >= s && mins < e : mins >= s || mins < e;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function isWeekday(d: Date): boolean {
  const day = d.getDay();   // 0=Sun..6=Sat
  return day >= 1 && day <= 5;
}

/**
 * Resolve a zoneSurcharges percentage that might be stored as either:
 *  - the new v2 decimal form (0.20 = 20%)
 *  - the seed's integer % form (20 = 20%)
 *  - missing → use fallback
 */
function pctValue(stored: number | undefined, fallbackPct: number): number {
  if (stored == null) return fallbackPct / 100;
  return stored > 1 ? stored / 100 : stored;
}
