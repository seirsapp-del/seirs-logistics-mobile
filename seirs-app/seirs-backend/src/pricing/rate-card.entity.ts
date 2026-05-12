import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * Versioned rate card. Every pricing change creates a NEW row with
 * incremented `version`, then flips `isActive=true` (and the old active
 * row to `isActive=false`). Bookings snapshot the active rate card onto
 * `Delivery.rateCardSnapshotId` so historical prices don't change when
 * admin tunes for inflation later.
 *
 * Numbers are highly relational (per-vehicle, per-surcharge, etc.) so
 * stored as JSONB to keep this entity manageable. Admin dashboard
 * provides a form view per nested key with an inline "what is this for?"
 * description (defined in /admin/rate-card-descriptions.ts).
 *
 * Defaults below match seirs-pricing-spec.html v1 (12 May 2026). The
 * Nigerian reviewer's JSON will override these via the admin seeder.
 */
@Entity('rate_cards')
export class RateCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'int' })
  version: number;

  // Only one row should have isActive=true at a time. New bookings always
  // snapshot the currently-active row; historical bookings keep their
  // snapshot regardless of future activations.
  @Index()
  @Column({ default: false })
  isActive: boolean;

  // Who/when/why for the audit trail.
  @Column({ nullable: true })
  activatedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  activatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  deactivatedAt: Date;

  @Column({ type: 'text', nullable: true })
  changeReason: string;

  // ── PRICING DATA (all JSONB so the dashboard can edit nested keys) ──

  /** Today's pump prices. Admin updates → all displayed km rates recompute. */
  @Column({ type: 'jsonb' })
  fuelPrices: {
    petrolPerLitreNgn: number;
    dieselPerLitreNgn: number;
  };

  /** Per-vehicle rates. Labour is admin-tuned, fuel pass-through is computed. */
  @Column({ type: 'jsonb' })
  vehicleRates: Record<string, {
    baseFareCustomer:    number;   // ₦ connection fee
    baseFareDriver:      number;
    labourPerKmCustomer: number;   // ₦/km — the stable part
    labourPerKmDriver:   number;
    kmPerLitre:          number;   // efficiency — used to compute fuel ₦/km
    fuelType:            'petrol' | 'diesel' | 'none';
    maxPayloadKg:        number;
  }>;

  /** Multi-stop bonuses + dwell-time charging. */
  @Column({ type: 'jsonb' })
  stopAndDwell: {
    perStopBonusCustomer:     number;
    perStopBonusDriver:       number;
    perDwellMinuteCustomer:   number;
    perDwellMinuteDriver:     number;
    freeDwellThresholdMinutes:number;   // grace minutes at pickup
    dwellCapMinutes:          number;   // after this driver can abandon
  };

  /** Weight tiers — extra dwell minutes added on top of category setup. */
  @Column({ type: 'jsonb' })
  weightTiers: Array<{
    minKg:        number;
    maxKg:        number | null;   // null = open-ended top tier
    extraMinutes: number;
    why?:         string;
  }>;

  /** Cultural / location dwell buffers (always added at every stop). */
  @Column({ type: 'jsonb' })
  dwellBuffers: {
    baselineMinutes: number;   // every stop gets this
    estateMinutes:   number;   // compound/estate (security check)
    marketMinutes:   number;   // market stall (crowds, parking)
    govtMinutes:     number;   // gov building / bank (ID check)
  };

  /** Time-of-day / day-of-week surcharges. */
  @Column({ type: 'jsonb' })
  timeSurcharges: {
    night:   { windowStart: string; windowEnd: string; customerPercent: number; driverSharePercent: number };
    peak:    { windowStart: string; windowEnd: string; customerPercent: number; driverSharePercent: number };
    weekend: { customerPercent: number; driverSharePercent: number };
  };

  /** Zone (geographic) surcharges. */
  @Column({ type: 'jsonb' })
  zoneSurcharges: {
    intraStatePercent:    number;   // default 0
    interStatePercent:    number;
    longDistancePercent:  number;   // > longDistanceThresholdKm
    longDistanceThresholdKm: number;
    overnightFeeNgn:      number;   // for very long trips
    overnightThresholdKm: number;
    restrictedZones:      Array<{ state: string; surchargePercent: number; reason: string }>;
  };

  /** Discounts. */
  @Column({ type: 'jsonb' })
  discounts: {
    bulkUploadOffPercent:   number;
    bulkUploadMinPackages:  number;
    recurringOffPercent:    number;
    loyaltyPointValueNgn:   number;   // ₦ per loyalty point redeemed
    welcomeOffPercent:      number;
    welcomeMaxNgn:          number;
  };

  /** Cancellation / wait / return fees. */
  @Column({ type: 'jsonb' })
  feeRules: {
    cancelPreAssignCustomer:   number;   // free pre-assignment
    cancelPostAssignCustomer:  number;
    cancelPostAssignDriver:    number;
    senderNoShowFlat:          number;
    senderNoShowWaitMinutes:   number;
    returnTripBaseFee:         number;
    returnCallAttempts:        number;
  };

  /** Partner store economics. */
  @Column({ type: 'jsonb' })
  partnerStore: {
    perPackageFeeNgn:          number;
    overstayTier1StartDay:     number;   // day 3
    overstayTier1DailyFeeNgn:  number;
    overstayTier2DailyFeeNgn:  number;
    returnTriggerDay:          number;   // day 6
    partnerSharePercent:       number;   // 70
    defaultMaxCapacity:        number;   // 50
  };

  /** Nigerian VAT (currently 7.5%). Stored as decimal e.g. 0.075. */
  @Column({ type: 'decimal', precision: 6, scale: 5, default: 0.075 })
  vatRate: number;

  @CreateDateColumn()
  createdAt: Date;
}
