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
    labourPerKmCustomer: number;   // ₦/km - the stable part
    labourPerKmDriver:   number;
    kmPerLitre:          number;   // efficiency - used to compute fuel ₦/km
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

  /** Weight tiers - extra dwell minutes added on top of category setup. */
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

  /**
   * Zone (geographic) surcharges. New shape uses state-aware tiers since
   * v2 of the rate card (May 2026). Legacy fields (intraStatePercent,
   * interStatePercent, longDistancePercent, longDistanceThresholdKm,
   * restrictedZones) are retained as `?` so historical rate cards keep
   * pricing correctly and the upgrade path is non-breaking.
   */
  @Column({ type: 'jsonb' })
  zoneSurcharges: {
    // ── New (v2+) state-aware tier ─────────────────────────────────────
    intraStateLongHaulKm?:    number;   // km threshold within one state
    intraStateLongHaulPct?:   number;   // % above threshold
    interStateAdjacentPct?:   number;   // crossing into a neighbour state
    interStateDistantPct?:    number;   // non-adjacent in same geopolitical zone
    crossZonePct?:            number;   // crossing geopolitical zones (NW↔SS etc.)
    restrictedZoneDefaultPct?: number;  // fallback % for sub-zones without an explicit %
    overnightFeeKm?:          number;   // new name; alias of overnightThresholdKm

    // ── Always present ────────────────────────────────────────────────
    overnightFeeNgn:          number;

    // ── Legacy (v1) - read only when new fields are missing ───────────
    intraStatePercent?:       number;
    interStatePercent?:       number;
    longDistancePercent?:     number;
    longDistanceThresholdKm?: number;
    overnightThresholdKm?:    number;

    /** @deprecated Use `regions.restrictedSubZones` (richer schema). */
    restrictedZones?:         Array<{ state: string; surchargePercent: number; reason: string }>;
  };

  /**
   * Regional pricing - per-zone and per-state overrides, plus admin-
   * addable restricted sub-zones. New in v2 (May 2026). Nullable so
   * v1 rate cards keep working; resolveRegionalOverrides() returns {}
   * when missing.
   */
  @Column({ type: 'jsonb', nullable: true })
  regions: {
    /** 6 geopolitical zones (NW/NE/NC/SW/SE/SS). Multiplier × baseline rates. */
    zoneOverrides?: Partial<Record<string, {
      rateMultiplier?:        number;
      vehicleOverrides?:      Record<string, { base?: number; perKm?: number }>;
      fuelPrices?:            { petrolNgn?: number; dieselNgn?: number };
      serviceFeeRideOverride?:    number;
      serviceFeePackageOverride?: number;
      dwellBufferMin?:        number;
      reason?:                string;
    }>>;
    /** State-level overrides win over zone-level. Key = ISO 3166-2 NG code. */
    stateOverrides?: Partial<Record<string, {
      rateMultiplier?:           number;
      vehicleOverrides?:         Record<string, { base?: number; perKm?: number }>;
      fuelPrices?:               { petrolNgn?: number; dieselNgn?: number };
      serviceFeeRideOverride?:    number;
      serviceFeePackageOverride?: number;
      dwellBufferMin?:           number;
      restrictedSubZones?:       Array<{ name: string; surchargePct: number; reason: string }>;
      reason?:                   string;
    }>>;
    /**
     * Hotspot circles (founder 2026-08-22): centre + radius km +
     * multiplier for busy places anywhere in Nigeria (Lagos Island,
     * Wuse, PH GRA...). A pickup inside a circle takes its multiplier
     * over state/zone; smallest containing circle wins.
     */
    hotspots?: Array<{
      name:           string;
      lat:            number;
      lng:            number;
      radiusKm:       number;
      rateMultiplier: number;
    }>;
    /** Manually-added restricted areas (curfew, flood, conflict, etc.) - admin-editable. */
    restrictedSubZones?: Array<{
      id:           string;
      name:         string;
      stateCode:    string;   // ISO 3166-2 NG code
      surchargePct: number;
      reason:       string;
      active:       boolean;
    }>;
  } | null;

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

  /**
   * Goods-in-transit cover.
   *
   * Off until SEIRS has an underwriter (founder 2026-08-18: "the
   * insurance we will add it when we have a partner but for now it
   * should be editable in the admin dashboard and we will set it to
   * zero"). Every value ships at zero and disabled, so nothing is
   * charged and nothing is promised.
   *
   * To switch it on once a partner is signed:
   *   1. enabled -> true
   *   2. premiumPct -> the underwriter's rate on declared value
   *      (a referral commission on this is a separate Fee Catalogue row,
   *      insurance_referral_commission)
   *   3. minPremiumNgn -> the floor the underwriter charges per parcel
   *   4. declaredValueThresholdNgn -> the value above which cover is
   *      offered at all; below it the premium is not worth collecting
   *   5. maxCoverageNgn -> the ceiling the policy actually pays out.
   *      Never leave this at zero while enabled is true, or the app
   *      offers cover with no stated limit.
   *
   * Publish the rate card afterwards. Do NOT enable this before a policy
   * exists: charging a premium against no underwriter is selling a
   * promise the company cannot keep.
   */
  @Column({ type: 'jsonb', nullable: true })
  /**
   * Ride pricing per ride-capable vehicle (founder 2026-08-22, the
   * Book-a-Ride rebuild). Same shape philosophy as vehicleRates:
   * customer and driver sides separate, fuel passes through at pump
   * price / kmPerLitre. Seeded from the numbers the customer app has
   * always displayed so publishing does not jump prices.
   */
  @Column({ type: 'jsonb', nullable: true })
  rideRates: Record<string, {
    baseFareCustomer:    number;
    labourPerKmCustomer: number;
    baseFareDriver:      number;
    labourPerKmDriver:   number;
    fuelType:            'petrol' | 'diesel' | 'none';
    kmPerLitre:          number;
  }> | null;

  /**
   * Ride luggage (founder 2026-08-23): a small bag rides free on any
   * vehicle; a LARGE bag pays a flat per-class fee. A vehicle class
   * absent from this map cannot take large luggage at all (okada).
   */
  @Column({ type: 'jsonb', nullable: true })
  luggageFees: Record<string, number> | null;

  /**
   * Travel Buddy seat pricing: N per seat-km by vehicle class.
   * SEIRS prices, never the driver: quality competes, not a race to
   * the bottom (founder 2026-08-23).
   */
  @Column({ type: 'jsonb', nullable: true })
  seatRates: Record<string, number> | null;

  /**
   * The rider's share of the seat subtotal, as a percentage.
   *
   * Was a literal 0.75 inside computeSeatPrice while every other seat
   * number lived here on the card. It is also the number most likely to
   * move as SEIRS learns what riders accept on interstate work, and
   * moving it should not need a deploy. Null keeps the 75% fallback, so
   * nothing changes until an admin publishes a value.
   */
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  seatDriverSharePct: number | null;

  /**
   * Flat platform service fee per booking (founder 2026-08-22). Charged
   * AFTER discounts (promotions never erode it) and BEFORE VAT. Region
   * serviceFee*Override fields beat these baselines. rideNgn is
   * reserved for the ride engine.
   */
  @Column({ type: 'jsonb', nullable: true })
  serviceFees: {
    packageNgn?: number;
    rideNgn?:    number;
  } | null;

  /**
   * NO @Column here meant TypeORM never mapped this field, so the
   * self-heal created the database column and every publish silently
   * dropped whatever the admin typed (found 2026-08-23 while fixing
   * highValue, which had the identical bug).
   */
  @Column({ type: 'jsonb', nullable: true })
  insurance: {
    enabled:                   boolean;
    premiumPct:                number;
    minPremiumNgn:             number;
    declaredValueThresholdNgn: number;
    maxCoverageNgn:            number;
  } | null;

  /**
   * High-value cover: the premium charged on a declared value above the
   * threshold, and the slice of it paid to the driver who carries the
   * risk.
   *
   * The engine has read card.highValue since it was written, but there
   * was no column, so it always fell through to the hardcoded 50,000 /
   * 0.5% / 0%. The admin pricing page has offered all three fields the
   * whole time and publishing them changed nothing: a real money line
   * that was not admin-tunable, against the standing rule.
   */
  @Column({ type: 'jsonb', nullable: true })
  highValue: {
    /** Declared value above which the premium starts. */
    thresholdNgn:   number;
    /** Percent of the EXCESS over the threshold. */
    premiumPct:     number;
    /** Percent of the collected premium paid to the driver. 0 = all SEIRS. */
    driverSharePct: number;
  } | null;

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
