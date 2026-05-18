import {
  Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  // Platform retention
  seirsNet: number;

  // The rate card snapshot id so future audits can reproduce this
  // calculation exactly.
  rateCardSnapshotId: string;
}

export interface PricingInput {
  vehicleType:   string;          // bicycle | motorcycle | ... | truck_large
  categoryCode:  string;          // documents | fragile | ...
  km:            number;          // total route km (after optimization)
  stopCount:     number;          // 1 for single-leg, N for multi-stop
  weightKg:      number;
  /** Estimated minutes the driver will spend not driving across all stops. */
  estimatedDwellMinutes: number;
  scheduledAt?:  Date;             // if undefined, treated as "now"

  /**
   * Preferred — provide coords and the service detects pickup/dropoff
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
 * Merged regional overrides — baseline ↘ geopolitical zone ↘ state.
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
  ) {}

  /**
   * On first boot, seed default rate card + service categories if the
   * tables are empty. Subsequent boots are no-ops.
   */
  async onModuleInit() {
    await this.seedIfEmpty();
  }

  private async seedIfEmpty() {
    const rateCount = await this.rateCardRepo.count();
    if (rateCount === 0) {
      this.logger.log('Seeding default rate card (v1) — matches pricing-spec.html');
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
    if (!card) throw new NotFoundException('No active rate card — seed the database.');
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
   * State-aware zone-surcharge tier. New in v2 — falls back to v1 flags
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
    // At booking time it's zero — we'll add it post-delivery.
    const dwellOver      = 0;

    const subtotalPreSurcharge = base + distanceLabour + distanceFuel + stopBonuses + dwellOver;

    const categorySurcharge = subtotalPreSurcharge * (Number(category.surchargePercent) / 100);

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

    // State-aware zone surcharge — replaces the flat interState/longDistance
    // flags with a real tier (intra-state long-haul / inter-state adjacent /
    // inter-state distant / cross-zone) detected from pickup+dropoff states.
    const zr = this.zoneSurchargeForBooking(card, input, pickupState, dropoffState);
    const tierSur       = subtotalPreZone * zr.pct;
    const restrictedSur = subtotalPreZone * (zr.restrictedPct / 100);
    const overnightSur  = zr.flat;
    // Keep the breakdown shape stable for the booking UI — bucket the
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
    const total = subtotalVatBase + vat;

    // ── Driver side ── (same regional multiplier, full fuel pass-through)
    const dBase           = (vehicleOv.base  ?? v.baseFareDriver)    * mult;
    const dDistanceLabour = (vehicleOv.perKm ?? v.labourPerKmDriver) * mult * input.km;
    const dDistanceFuel   = fuelKm * input.km;          // full pass-through
    const dStopBonuses    = card.stopAndDwell.perStopBonusDriver * extraStops;
    const dDwellOver      = 0;

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
        vatBase: subtotalVatBase, vat, total,
      },
      driver: {
        base: dBase, distanceLabour: dDistanceLabour, distanceFuel: dDistanceFuel,
        stopBonuses: dStopBonuses, dwellOver: dDwellOver, surchargeShare,
        total: driverTotal,
      },
      seirsNet,
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
