import {
  Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateCard } from './rate-card.entity';
import { ServiceCategory } from './service-category.entity';
import { DEFAULT_RATE_CARD, DEFAULT_SERVICE_CATEGORIES } from './pricing.seed';

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
  isInterState?: boolean;
  isLongDistance?: boolean;        // > rateCard.longDistanceThresholdKm
  isRestrictedZone?: { state: string }; // optional restricted-zone flag
  isBulk?:       boolean;          // CSV upload bulk discount
  isRecurring?:  boolean;          // recurring schedule discount
  loyaltyPointsToRedeem?: number;
  isWelcome?:    boolean;          // first-booking discount
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
   */
  fuelPerKm(card: RateCard, vehicleType: string): number {
    const v = card.vehicleRates[vehicleType];
    if (!v || v.fuelType === 'none' || v.kmPerLitre <= 0) return 0;
    const price = v.fuelType === 'petrol'
      ? card.fuelPrices.petrolPerLitreNgn
      : card.fuelPrices.dieselPerLitreNgn;
    return price / v.kmPerLitre;
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

    const fuelKm = this.fuelPerKm(card, input.vehicleType);

    // ── Customer side ──
    const base           = v.baseFareCustomer;
    const distanceLabour = v.labourPerKmCustomer * input.km;
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
    const z = card.zoneSurcharges;
    const interStateSur   = input.isInterState   ? subtotalPreZone * (z.interStatePercent   / 100) : 0;
    const longDistanceSur = input.isLongDistance ? subtotalPreZone * (z.longDistancePercent / 100) : 0;
    const overnightSur    = (input.isLongDistance && input.km >= z.overnightThresholdKm) ? z.overnightFeeNgn : 0;
    const restrictedSur   = input.isRestrictedZone
      ? subtotalPreZone * ((z.restrictedZones.find(r => r.state === input.isRestrictedZone!.state)?.surchargePercent ?? 0) / 100)
      : 0;

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

    // ── Driver side ──
    const dBase           = v.baseFareDriver;
    const dDistanceLabour = v.labourPerKmDriver * input.km;
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
