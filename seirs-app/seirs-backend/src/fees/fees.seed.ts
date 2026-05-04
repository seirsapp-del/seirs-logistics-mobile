import { Fee, FeeCategory, FeeUnit } from './fee.entity';

// Spec V8 Fee Catalogue initial values. Inserted on first boot if the
// fees table is empty. Values are admin-editable from there on — never
// re-applied. Add new fees here for greenfield envs; production updates
// happen through the admin UI.
export const FEE_SEEDS: Array<Partial<Fee>> = [
  // ── Commission ─────────────────────────────────────────────────────────
  { key: 'driver_commission_rides',     name: 'Driver Commission (rides)',
    description: 'Platform cut on every ride fare after Flutterwave deduction.',
    category: FeeCategory.COMMISSION,   unit: FeeUnit.PERCENT,    value: 25 },
  { key: 'driver_commission_packages',  name: 'Driver Commission (packages)',
    description: 'Platform cut on every package delivery — slightly lower than rides to attract package supply.',
    category: FeeCategory.COMMISSION,   unit: FeeUnit.PERCENT,    value: 20 },

  // ── Customer-side fees ─────────────────────────────────────────────────
  { key: 'customer_booking_fee',        name: 'Customer Booking Fee',
    description: 'Charged on every order placed by a customer regardless of vehicle class. Pure platform margin.',
    category: FeeCategory.CUSTOMER_FEE, unit: FeeUnit.FLAT_NGN,   value: 100 },

  // ── Driver-side fees ───────────────────────────────────────────────────
  { key: 'instant_cashout_fee',         name: 'Instant Cash-out Fee',
    description: 'Charged when a driver requests instant payout instead of the free weekly batch.',
    category: FeeCategory.DRIVER_FEE,   unit: FeeUnit.PERCENT,    value: 1 },

  // ── Storage (partner stores) ───────────────────────────────────────────
  { key: 'storage_24_72hr',             name: 'Storage Fee (24-72hr)',
    description: 'Daily fee charged to sender when their package overstays at a partner store between 24 and 72 hours.',
    category: FeeCategory.STORAGE,      unit: FeeUnit.PER_DAY,    value: 200 },
  { key: 'storage_return_fee',          name: 'Storage Return Fee',
    description: 'One-time fee for returning an unclaimed package to the sender after 72 hours of overstay.',
    category: FeeCategory.STORAGE,      unit: FeeUnit.FLAT_NGN,   value: 500 },

  // ── Surge ──────────────────────────────────────────────────────────────
  { key: 'surge_multiplier_peak',       name: 'Surge Multiplier (peak)',
    description: 'Auto-applied multiplier on base fare during demand spikes. Platform keeps 50% of the surge slice.',
    category: FeeCategory.SURGE,        unit: FeeUnit.PERCENT,    value: 150 },

  // ── Subscriptions ──────────────────────────────────────────────────────
  { key: 'seirs_plus_subscription',     name: 'SEIRS Plus (customer)',
    description: 'Customer monthly subscription — free booking fee, priority dispatch, 5% delivery discount.',
    category: FeeCategory.SUBSCRIPTION, unit: FeeUnit.PER_MONTH,  value: 2000 },
  { key: 'driver_premium_subscription', name: 'Driver Premium',
    description: 'Driver weekly flat fee as alternative to commission cut — for high-volume drivers who prefer predictability.',
    category: FeeCategory.SUBSCRIPTION, unit: FeeUnit.PER_WEEK,   value: 5000 },

  // ── Partner ────────────────────────────────────────────────────────────
  { key: 'partner_sponsored_placement', name: 'Partner Sponsored Placement',
    description: 'Monthly fee for partner stores to be pinned at top of customer map.',
    category: FeeCategory.PARTNER,      unit: FeeUnit.PER_MONTH,  value: 25000 },
  { key: 'insurance_referral_commission', name: 'Insurance Referral Commission',
    description: 'SEIRS cut on premiums for partner-issued driver insurance policies.',
    category: FeeCategory.PARTNER,      unit: FeeUnit.PERCENT,    value: 12 },

  // ── Pool & multi-stop ──────────────────────────────────────────────────
  { key: 'multi_stop_discount',         name: 'Multi-stop Discount (per extra stop)',
    description: 'Customer discount for each additional stop beyond the first — encourages bundling.',
    category: FeeCategory.POOL,         unit: FeeUnit.PERCENT,    value: -10 },
  { key: 'pool_ride_discount',          name: 'Pool Ride Discount',
    description: 'Discount applied when customer accepts corridor-pool matching (Spec V8 §1).',
    category: FeeCategory.POOL,         unit: FeeUnit.PERCENT,    value: -20 },

  // ── Zone ───────────────────────────────────────────────────────────────
  { key: 'lekki_zone_surcharge',        name: 'Lekki / VI Zone Surcharge',
    description: 'Premium pricing applied to base fare in affluent Lagos zones.',
    category: FeeCategory.ZONE,         unit: FeeUnit.PERCENT,    value: 30 },

  // ── Financial services ─────────────────────────────────────────────────
  { key: 'driver_microloan_interest',   name: 'Driver Micro-loan Interest',
    description: 'Annual interest rate on driver wallet advances (₦50-100k).',
    category: FeeCategory.FINANCIAL,    unit: FeeUnit.PERCENT,    value: 7 },
  { key: 'wallet_float_yield',          name: 'Wallet Float Yield (internal)',
    description: 'Annual yield SEIRS earns on customer pre-funded wallet balances. Internal — never customer-facing.',
    category: FeeCategory.FINANCIAL,    unit: FeeUnit.PERCENT,    value: 8 },

  // ── Pricing config ─────────────────────────────────────────────────────
  { key: 'current_fuel_price',          name: 'Current Fuel Price (₦/L)',
    description: 'Admin-overridable Nigerian petrol price used by the auto-adjust pricing engine. Update when NNPCL changes the pump rate.',
    category: FeeCategory.CONFIG,       unit: FeeUnit.FLAT_NGN,   value: 770 },

  // ── Developer Platform tiers ───────────────────────────────────────────
  { key: 'dev_growth_tier_monthly',     name: 'Dev Platform — Growth Tier',
    description: 'Monthly subscription. Includes 1,000 deliveries; ₦100/delivery overage.',
    category: FeeCategory.DEV_PLATFORM, unit: FeeUnit.PER_MONTH,  value: 25000 },
  { key: 'dev_scale_tier_monthly',      name: 'Dev Platform — Scale Tier',
    description: 'Monthly subscription. Includes 10,000 deliveries; ₦80/delivery overage. 99.9% SLA + dedicated rep.',
    category: FeeCategory.DEV_PLATFORM, unit: FeeUnit.PER_MONTH,  value: 150000 },
  { key: 'dev_growth_overage',          name: 'Dev Platform — Growth Overage',
    description: 'Per-delivery charge once Growth tier monthly inclusion is exhausted.',
    category: FeeCategory.DEV_PLATFORM, unit: FeeUnit.FLAT_NGN,   value: 100 },
  { key: 'dev_scale_overage',           name: 'Dev Platform — Scale Overage',
    description: 'Per-delivery charge once Scale tier monthly inclusion is exhausted.',
    category: FeeCategory.DEV_PLATFORM, unit: FeeUnit.FLAT_NGN,   value: 80 },
];
