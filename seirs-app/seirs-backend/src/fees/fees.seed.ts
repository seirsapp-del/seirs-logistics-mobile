import { Fee, FeeCategory, FeeUnit } from './fee.entity';

// Spec V8 Fee Catalogue initial values. Inserted on first boot if the
// fees table is empty. Values are admin-editable from there on - never
// re-applied. Add new fees here for greenfield envs; production updates
// happen through the admin UI.
export const FEE_SEEDS: Array<Partial<Fee>> = [
  // ── Driver value levels (founder 2026-08-21) ──────────────────────────
  // Max declared value a driver at each level may carry. Matching
  // filters on these; move a driver up via the two-person override.
  { key: 'driver_level_1_max_value_ngn', name: 'Driver Level 1 max value',
    description: 'Highest declared package value (NGN) a level-1 driver may be matched to.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.FLAT_NGN, value: 5000 },
  { key: 'driver_level_2_max_value_ngn', name: 'Driver Level 2 max value',
    description: 'Highest declared package value (NGN) a level-2 driver may be matched to.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.FLAT_NGN, value: 10000 },
  { key: 'driver_level_3_max_value_ngn', name: 'Driver Level 3 max value',
    description: 'Highest declared package value (NGN) a level-3 driver may be matched to.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.FLAT_NGN, value: 25000 },
  { key: 'driver_level_4_max_value_ngn', name: 'Driver Level 4 max value',
    description: 'Highest declared package value (NGN) a level-4 driver may be matched to.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.FLAT_NGN, value: 50000 },
  { key: 'driver_level_5_max_value_ngn', name: 'Driver Level 5 max value',
    description: 'Highest declared package value (NGN) a level-5 driver may be matched to.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.FLAT_NGN, value: 100000 },
  { key: 'driver_level_6_max_value_ngn', name: 'Driver Level 6 max value',
    description: 'Highest declared package value (NGN) a level-6 driver may be matched to.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.FLAT_NGN, value: 200000 },
  { key: 'driver_level_7_max_value_ngn', name: 'Driver Level 7 max value',
    description: 'Highest declared package value (NGN) a level-7 driver may be matched to.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.FLAT_NGN, value: 500000 },
  { key: 'driver_level_8_max_value_ngn', name: 'Driver Level 8 max value',
    description: 'Highest declared package value (NGN) a level-8 driver may be matched to.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.FLAT_NGN, value: 1000000 },
  { key: 'driver_level_9_max_value_ngn', name: 'Driver Level 9 max value',
    description: 'Highest declared package value (NGN) a level-9 driver may be matched to.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.FLAT_NGN, value: 5000000 },
  { key: 'driver_level_10_max_value_ngn', name: 'Driver Level 10 max value',
    description: 'Highest declared package value (NGN) a level-10 driver may be matched to.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.FLAT_NGN, value: 10000000 },
  { key: 'driver_level_auto_deliveries_per_level', name: 'Level auto-raise: deliveries per level',
    description: 'Completed deliveries needed per level for the nightly auto-raise (level = 1 + floor(delivered / this)). Manual overrides are separate.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.COUNT, value: 25 },
  { key: 'driver_level_auto_min_rating', name: 'Level auto-raise: minimum rating',
    description: 'A driver below this rating is never auto-raised, whatever their delivery count.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.COUNT, value: 4.5 },
  { key: 'corridor_match_radius_m', name: 'Corridor match radius (m)',
    description: 'A job scores the corridor bonus when its pickup AND drop are both within this many metres of the courier declared line.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.COUNT, value: 600 },
  { key: 'corridor_score_bonus', name: 'Corridor score bonus',
    description: 'Matching score added when a job lies along a courier declared corridor (scores are 0-1; 0.2 outranks most distance gaps).',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.COUNT, value: 0.2 },
  { key: 'travel_buddy_offer_timeout_min', name: 'Travel Buddy offer timeout (min)',
    description: 'How long a declared driver has to accept a paid seat booking before it auto-refunds in full.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.MINUTES, value: 30 },
  { key: 'driver_cancel_free_per_day', name: 'Driver cancels: free per day',
    description: 'Accepted-job cancels a driver may make per 24h before offers pause. Safety ("felt unsafe") never counts.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.COUNT, value: 2 },
  { key: 'driver_cancel_pause_hours', name: 'Driver cancels: pause hours',
    description: 'How long dispatch offers pause after a driver exceeds the daily cancel allowance.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.HOURS, value: 2 },
  { key: 'interstate_match_bonus', name: 'Interstate trip match bonus',
    description: 'Matching score added when a booking route matches a driver declared intercity trip departing within 24h (scores are 0-1).',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.COUNT, value: 0.25 },
  { key: 'corridor_max_hours', name: 'Corridor max hours',
    description: 'Longest a declared corridor can stay active. A corridor is one trip, not a shift.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.HOURS, value: 2 },
  { key: 'driver_level_id_gate', name: 'Level ID-verification gate',
    description: 'Levels at or above this require verified identity (per the identity policy). Auto-raise stops below it for unverified drivers.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.COUNT, value: 6 },

  // ── Commission ─────────────────────────────────────────────────────────
  { key: 'driver_commission_rides',     name: 'Driver Commission (rides)',
    description: 'Platform cut on every ride fare after Flutterwave deduction.',
    category: FeeCategory.COMMISSION,   unit: FeeUnit.PERCENT,    value: 25 },
  { key: 'driver_commission_packages',  name: 'Driver Commission (packages)',
    description: 'Platform cut on every package delivery - slightly lower than rides to attract package supply.',
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

  // Founder decision 2026-08-16: whenever a partner counter touches a
  // parcel, the counter gets paid. Charged PER PARCEL PER COUNTER, so a
  // parcel dropped at counter A and delivered to counter B carries two
  // (both shops did the work). Set to 0 to switch counters off as a
  // paid service without a code change.
  { key: 'partner_store_handling_ngn',  name: 'Partner Counter Handling Fee',
    description: 'Paid to a partner store each time it hands over or receives a parcel. Charged per parcel per counter, added to the sender\'s total and shown as its own receipt line.',
    category: FeeCategory.STORAGE,      unit: FeeUnit.FLAT_NGN,   value: 500 },

  // ── Surge ──────────────────────────────────────────────────────────────
  { key: 'surge_multiplier_peak',       name: 'Surge Multiplier (peak)',
    description: 'Auto-applied multiplier on base fare during demand spikes. Platform keeps 50% of the surge slice.',
    category: FeeCategory.SURGE,        unit: FeeUnit.PERCENT,    value: 150 },

  // ── The real cost of serving a job ─────────────────────────────────────
  // None of these were modelled, so every quote reported a margin the
  // company never actually saw (review 2026-08-18).
  { key: 'card_processing_pct',         name: 'Card Processing Cost',
    description: 'What Flutterwave takes on a collected payment. Modelled as a cost so quoted margin is the margin we keep.',
    category: FeeCategory.CONFIG, unit: FeeUnit.PERCENT, value: 1.4 },

  { key: 'nipost_postal_fund_pct',      name: 'NIPOST Postal Fund Levy',
    description: 'Statutory contribution required of courier operators. Confirm with counsel whether the base is gross bookings or net revenue before scaling.',
    category: FeeCategory.CONFIG, unit: FeeUnit.PERCENT, value: 2 },

  { key: 'door_delivery_failure_pct',   name: 'Door Delivery Failure Rate',
    description: 'Share of door deliveries that find nobody home and need a second trip at no extra revenue. Counter deliveries are exempt because a shop does not go out. Replace with measured data as soon as it exists.',
    category: FeeCategory.CONFIG, unit: FeeUnit.PERCENT, value: 8 },

  { key: 'min_job_margin_ngn',          name: 'Minimum Job Margin',
    description: 'The least SEIRS may keep on a job after every real cost. Quotes below this are flagged. Set to 0 to disable the floor.',
    category: FeeCategory.CONFIG, unit: FeeUnit.FLAT_NGN, value: 150 },

  // ── Counter economics ──────────────────────────────────────────────────
  // A flat handling fee overcharged an envelope and undercharged a 40kg
  // sack, and SEIRS kept none of it however many counters were involved.
  { key: 'counter_fee_small_ngn',       name: 'Counter Handling, up to 5kg',
    description: 'Handling fee for a parcel up to 5kg at one counter.',
    category: FeeCategory.PARTNER, unit: FeeUnit.FLAT_NGN, value: 300 },

  { key: 'counter_fee_medium_ngn',      name: 'Counter Handling, 5 to 20kg',
    description: 'Handling fee for a parcel between 5kg and 20kg at one counter.',
    category: FeeCategory.PARTNER, unit: FeeUnit.FLAT_NGN, value: 500 },

  { key: 'counter_fee_large_ngn',       name: 'Counter Handling, 20 to 50kg',
    description: 'Handling fee for a parcel between 20kg and 50kg at one counter.',
    category: FeeCategory.PARTNER, unit: FeeUnit.FLAT_NGN, value: 900 },

  { key: 'counter_fee_bulk_ngn',        name: 'Counter Handling, over 50kg',
    description: 'Handling fee for a parcel over 50kg at one counter.',
    category: FeeCategory.PARTNER, unit: FeeUnit.FLAT_NGN, value: 1500 },

  { key: 'counter_partner_share_pct',   name: 'Counter Fee, Partner Share',
    description: 'Share of the handling fee the shop keeps. The remainder is SEIRS network revenue. The fee used to pass through whole, so the counter network earned the platform nothing.',
    category: FeeCategory.PARTNER, unit: FeeUnit.PERCENT, value: 70 },

  // OFF until trunk runs are actually batched. The consolidated price
  // divides one run across many parcels, but each drop-off still creates
  // its own driver leg, so switching this on before batching exists means
  // charging for a sixth of a run while paying for six whole ones.
  { key: 'consolidated_dispatch_enabled', name: 'Consolidated Dispatch Live',
    description: 'Set to 1 only once counter-to-counter parcels are genuinely batched onto shared trunk runs. Until then counter journeys are priced per parcel, like any other trip.',
    category: FeeCategory.PARTNER, unit: FeeUnit.FLAT_NGN, value: 0 },

  { key: 'trunk_assumed_parcels',       name: 'Assumed Parcels per Trunk Run',
    description: 'Divisor behind consolidated counter-to-counter pricing. Start pessimistic and raise it only on measured load data.',
    category: FeeCategory.PARTNER, unit: FeeUnit.FLAT_NGN, value: 6 },

  { key: 'consolidated_floor_ngn',      name: 'Consolidated Journey Floor Price',
    description: 'The price below which a counter-to-counter parcel never sells, however empty the run turns out to be.',
    category: FeeCategory.PARTNER, unit: FeeUnit.FLAT_NGN, value: 800 },

  { key: 'counter_volume_bonus_cap_ngn', name: 'Counter Volume Bonus Cap',
    description: 'Maximum monthly bonus a single counter can earn for driving density. Every incentive carries a ceiling.',
    category: FeeCategory.PARTNER, unit: FeeUnit.FLAT_NGN, value: 25000 },

  // ── Fuel, corrected from the dashboard rather than the rate card ───────
  // A rate card freezes fuel at publication and is republished rarely.
  // Nigerian pump prices are not rare. The card said petrol was NGN 950
  // while the pump was near NGN 1,380, and since fuel is a full
  // pass-through the entire gap came out of the driver's pocket: a truck
  // driver on a 400km run was NGN 53,333 short on fuel alone. These rows
  // are corrected the day the pump moves, with no deploy.
  { key: 'current_petrol_price_ngn',    name: 'Petrol Pump Price (per litre)',
    description: 'Current petrol price. Drivers are reimbursed at this rate, so it must track the real pump price or riders subsidise every trip.',
    category: FeeCategory.CONFIG, unit: FeeUnit.FLAT_NGN, value: 1380 },

  { key: 'current_diesel_price_ngn',    name: 'Diesel Pump Price (per litre)',
    description: 'Current diesel price, used for van and truck fuel reimbursement.',
    category: FeeCategory.CONFIG, unit: FeeUnit.FLAT_NGN, value: 1650 },

  { key: 'fuel_reprice_trigger_pct',    name: 'Fuel Drift Warning Threshold',
    description: 'How far the pump price may drift from the active rate card before the dashboard warns that the card needs republishing.',
    category: FeeCategory.CONFIG, unit: FeeUnit.PERCENT, value: 10 },

  // ── Driver payout policy ───────────────────────────────────────────────
  // These were constants in the earnings service. They are risk controls,
  // and risk controls need tuning the week a pattern shows up rather than
  // at the next deploy (audit 2026-08-18).
  { key: 'driver_min_payout_ngn',       name: 'Minimum Driver Withdrawal',
    description: 'Smallest amount a driver may withdraw. Stops transfer fees eating tiny payouts.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.FLAT_NGN, value: 1000 },

  { key: 'driver_daily_cap_ngn',        name: 'Daily Withdrawal Cap',
    description: 'Most an established driver may withdraw in one day.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.FLAT_NGN, value: 200000 },

  { key: 'driver_daily_cap_new_ngn',    name: 'Daily Withdrawal Cap (new driver)',
    description: 'Tighter daily ceiling while a driver is still inside the new-driver period.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.FLAT_NGN, value: 50000 },

  { key: 'driver_new_period_days',      name: 'New Driver Period (days)',
    description: 'How long a driver counts as new for withdrawal caps and holdback.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.FLAT_NGN, value: 30 },

  { key: 'driver_new_holdback_pct',     name: 'New Driver Holdback',
    description: 'Share of a new driver payout held back against chargebacks and disputes.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.PERCENT, value: 10 },

  { key: 'instant_payout_min_age_hours', name: 'Instant Payout Minimum Age (hours)',
    description: 'How old an uncleared earning must be before it can be pulled forward for the instant fee.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.FLAT_NGN, value: 24 },

  // ── Loyalty, which is a liability ──────────────────────────────────────
  // Every point issued is a discount owed later, so the earn rate and the
  // abuse ceilings belong on the dashboard rather than in a deploy.
  { key: 'loyalty_points_per_1000_ngn', name: 'Points per NGN 1,000 Spent',
    description: 'Base earn rate before any tier multiplier.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.FLAT_NGN, value: 10 },

  { key: 'loyalty_referral_bonus',      name: 'Referral Bonus (points)',
    description: 'Points awarded when a referred user completes their first qualifying delivery.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.FLAT_NGN, value: 200 },

  { key: 'loyalty_max_referrals_month', name: 'Referral Cap per Month',
    description: 'Most referral bonuses one account can earn in a calendar month.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.FLAT_NGN, value: 10 },

  { key: 'loyalty_referral_min_ngn',    name: 'Referral Qualifying Delivery',
    description: 'Minimum delivery value before a referral counts, so a token order cannot farm bonuses.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.FLAT_NGN, value: 1000 },

  { key: 'loyalty_referral_flag_count', name: 'Referral Fraud Flag Threshold',
    description: 'Referrals inside seven days that trigger an admin review.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.COUNT, value: 5 },

  { key: 'loyalty_streak_bonus',        name: 'Monthly Streak Bonus (points)',
    description: 'Points for hitting the monthly delivery streak target.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.FLAT_NGN, value: 50 },

  { key: 'loyalty_streak_target',       name: 'Monthly Streak Target',
    description: 'Deliveries in a calendar month that earn the streak bonus.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.FLAT_NGN, value: 5 },

  { key: 'loyalty_bank_transfer_bonus', name: 'Bank Transfer Bonus (points)',
    description: 'Small nudge toward the payment method that costs least to process.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.FLAT_NGN, value: 5 },

  { key: 'loyalty_rate_driver_bonus',   name: 'Rate a Driver Bonus (points)',
    description: 'Points for leaving a driver rating.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.FLAT_NGN, value: 5 },

  { key: 'loyalty_point_lifetime_months', name: 'Point Lifetime (months)',
    description: 'How long an unspent point survives before expiring.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.FLAT_NGN, value: 12 },

  // ── Payout timing ──────────────────────────────────────────────────────
  // Both were constants in code. They are here so the launch policy and
  // a test run can differ without a deploy: during the live money test
  // the founder needs to watch a real payout, a failed payout and a
  // pay-in inside one sitting rather than waiting out a weekend.
  { key: 'driver_clearance_business_days', name: 'Driver Earnings Clearance (business days)',
    description: 'Business days a completed trip waits before the driver can withdraw it. 0 makes earnings withdrawable immediately.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.DAYS, value: 2 },

  { key: 'partner_payout_hold_hours',   name: 'Partner Payout Hold (hours)',
    description: 'Hours a counter handling fee waits before the partner can withdraw it. 168 is the weekly Monday payout; 0 makes it immediate.',
    category: FeeCategory.PARTNER, unit: FeeUnit.HOURS, value: 168 },

  // ── Night operations (founder 2026-08-11: 24/7 scheduling) ─────────────
  // Founder decision 2026-08-15: a PENDING booking that no driver takes
  // within this window is auto-cancelled and refunded IN FULL (the fare
  // was escrowed at booking; without this it sat locked forever).
  { key: 'pending_booking_expiry_minutes', name: 'Pending Booking Expiry (minutes)',
    description: 'Minutes a paid booking may wait for a driver before it auto-cancels with a full refund.',
    category: FeeCategory.CONFIG, unit: FeeUnit.MINUTES, value: 60 },

  { key: 'night_fee_pct',               name: 'Night Delivery Fee',
    description: 'Surcharge on pickups requested inside the night window. Passed to the driver in FULL to encourage night coverage (Lagos and Kano never sleep; interstate runs overnight). Set 0 to disable.',
    category: FeeCategory.SURGE,        unit: FeeUnit.PERCENT,    value: 15 },
  { key: 'night_window_start_hour',     name: 'Night Window Start (hour 0-23)',
    description: 'Hour of day (Africa/Lagos) when the night window opens. Value is an HOUR, not naira.',
    category: FeeCategory.SURGE,        unit: FeeUnit.HOUR_OF_DAY,   value: 21 },
  { key: 'night_window_end_hour',       name: 'Night Window End (hour 0-23)',
    description: 'Hour of day (Africa/Lagos) when the night window closes. Value is an HOUR, not naira.',
    category: FeeCategory.SURGE,        unit: FeeUnit.HOUR_OF_DAY,   value: 5 },
  { key: 'failed_delivery_redirect_fee', name: 'Failed-Delivery Redirect Fee',
    description: 'Transport fee owed when a failed door delivery is rerouted to a partner store (nobody home, no sender response). Store identity + collection code stay hidden until settled.',
    category: FeeCategory.CUSTOMER_FEE, unit: FeeUnit.FLAT_NGN,   value: 1000 },

  // ── Failed delivery: every deadline is a row, not a constant ───────────
  // These decide when a parcel escalates, when it starts costing storage
  // and when it is treated as abandoned. Policy moves, so they live here.
  { key: 'sender_response_window_minutes', name: 'Sender Response Window (minutes)',
    description: 'How long a rider waits on the sender after a failed attempt before it escalates to support. Value is MINUTES, not naira.',
    category: FeeCategory.CONFIG,       unit: FeeUnit.MINUTES,   value: 15 },
  { key: 'admin_redirect_timeout_minutes', name: 'Admin Redirect Timeout (minutes)',
    description: 'If support does not answer an escalated failed delivery within this many minutes, the parcel auto-reroutes to the nearest partner counter. Value is MINUTES.',
    category: FeeCategory.CONFIG,       unit: FeeUnit.MINUTES,   value: 30 },
  { key: 'storage_free_hours',          name: 'Free Storage Window (hours)',
    description: 'Hours a parcel may sit at a counter before storage starts accruing. Value is HOURS, not naira.',
    category: FeeCategory.STORAGE,      unit: FeeUnit.HOURS,   value: 24 },
  { key: 'storage_max_days',            name: 'Abandonment Threshold (days)',
    description: 'Days after which an uncollected parcel is treated as abandoned and may be disposed of. Value is DAYS, not naira.',
    category: FeeCategory.STORAGE,      unit: FeeUnit.DAYS,   value: 7 },
  { key: 'perishable_max_hours',        name: 'Perishable Ceiling (hours)',
    description: 'Food and other perishables cannot be stored. Hours from a failed attempt to disposal for hot/cold food categories. Value is HOURS.',
    category: FeeCategory.STORAGE,      unit: FeeUnit.HOURS,   value: 3 },
  { key: 'driver_failed_trip_base_ngn', name: 'Failed-Trip Driver Compensation',
    description: 'Flat amount a rider is paid for a trip that could not complete, on top of fuel for the distance actually ridden. The rider made the trip whoever was at fault.',
    category: FeeCategory.DRIVER_FEE,   unit: FeeUnit.FLAT_NGN,   value: 200 },
  { key: 'cancel_processing_pct',       name: 'Cancellation Processing Cost (%)',
    description: 'Card processing already sunk on a cancelled booking, withheld so a cancellation costs SEIRS nothing. Set to 0 if the processor refunds their fee. A row, not a constant, because processor policy changes.',
    category: FeeCategory.CUSTOMER_FEE, unit: FeeUnit.PERCENT,    value: 1.4 },

  // ── Subscriptions ──────────────────────────────────────────────────────
  { key: 'seirs_plus_subscription',     name: 'SEIRS Plus (customer)',
    description: 'Customer monthly subscription - free booking fee, priority dispatch, 5% delivery discount.',
    category: FeeCategory.SUBSCRIPTION, unit: FeeUnit.PER_MONTH,  value: 2000 },
  // Was NGN 5,000 per WEEK, which is NGN 21,667 a month against a Lagos
  // rider income of NGN 150k-300k: between 7% and 14% of everything they
  // earn, priced like Western SaaS rather than like a rider's wallet
  // (review 2026-08-18). Monthly, and small enough to be an easy yes.
  { key: 'driver_premium_subscription', name: 'Driver Premium',
    description: 'Monthly flat fee a driver can pay instead of the commission cut, for high-volume drivers who prefer predictability. Must stay comfortably under 3% of a typical rider month.',
    category: FeeCategory.SUBSCRIPTION, unit: FeeUnit.PER_MONTH,  value: 4000 },

  // ── Partner ────────────────────────────────────────────────────────────
  { key: 'partner_sponsored_placement', name: 'Partner Sponsored Placement',
    description: 'Monthly fee for partner stores to be pinned at top of customer map.',
    category: FeeCategory.PARTNER,      unit: FeeUnit.PER_MONTH,  value: 25000 },
  { key: 'insurance_referral_commission', name: 'Insurance Referral Commission',
    description: 'SEIRS cut on premiums for partner-issued driver insurance policies.',
    category: FeeCategory.PARTNER,      unit: FeeUnit.PERCENT,    value: 12 },

  // ── Pool & multi-stop ──────────────────────────────────────────────────
  { key: 'multi_stop_discount',         name: 'Multi-stop Discount (per extra stop)',
    description: 'Customer discount for each additional stop beyond the first - encourages bundling.',
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
    description: 'Annual yield SEIRS earns on customer pre-funded wallet balances. Internal - never customer-facing.',
    category: FeeCategory.FINANCIAL,    unit: FeeUnit.PERCENT,    value: 8 },

  // ── Pricing config ─────────────────────────────────────────────────────
  // RETIRED. Superseded by current_petrol_price_ngn and
  // current_diesel_price_ngn, which the fuel drift check and the rate
  // card sync actually read. This row was never wired to anything and
  // sat at 770 while the pump was near 1,380, so anyone reading the
  // catalogue for "what does fuel cost" got a wrong answer from a value
  // that changed nothing (audit 2026-08-18). Kept out of new
  // environments; existing rows are harmless but should be deleted.
  { key: 'high_value_threshold_ngn',    name: 'High-Value Package Threshold',
    description: 'Order value at which extra recipient verification kicks in (Spec V8 §1.17: physical ID photo required at handoff). Raised 50k -> 100k 2026-08-09 per founder decision.',
    category: FeeCategory.CONFIG,       unit: FeeUnit.FLAT_NGN,   value: 100000 },
  { key: 'return_to_sender_fee',        name: 'Return-to-Sender Transport Fee',
    description: 'Flat transport fee owed by the sender when a partner-store package passes 5 working days uncollected and is returned. Storage itself is free (2026-08-09 policy: 3 working days free, warning at 3, return at 5, no fee build-up).',
    category: FeeCategory.CONFIG,       unit: FeeUnit.FLAT_NGN,   value: 1500 },
  { key: 'platform_commission_pct',     name: 'Platform Commission',
    description: 'SEIRS cut of each delivery fare, applied at escrow release when the driver is paid. The remainder is the driver share. Changing this affects NEW settlements only, never already-recorded earnings.',
    category: FeeCategory.COMMISSION,   unit: FeeUnit.PERCENT,    value: 30 },
  { key: 'instant_payout_fee_pct',      name: 'Instant Withdrawal Fee',
    description: 'Percent charged on the not-yet-cleared portion of a driver instant withdrawal. Standard clearance is 2 business days after delivery (free); instant unlocks earnings 24h+ old for this fee (2026-08-09 policy, founder set 5%).',
    category: FeeCategory.DRIVER_FEE,   unit: FeeUnit.PERCENT,    value: 5 },

  // ── Developer Platform tiers ───────────────────────────────────────────
  { key: 'dev_growth_tier_monthly',     name: 'Dev Platform - Growth Tier',
    description: 'Monthly subscription. Includes 1,000 deliveries; ₦100/delivery overage.',
    category: FeeCategory.DEV_PLATFORM, unit: FeeUnit.PER_MONTH,  value: 25000 },
  { key: 'dev_scale_tier_monthly',      name: 'Dev Platform - Scale Tier',
    description: 'Monthly subscription. Includes 10,000 deliveries; ₦80/delivery overage. 99.9% SLA + dedicated rep.',
    category: FeeCategory.DEV_PLATFORM, unit: FeeUnit.PER_MONTH,  value: 150000 },
  { key: 'dev_growth_overage',          name: 'Dev Platform - Growth Overage',
    description: 'Per-delivery charge once Growth tier monthly inclusion is exhausted.',
    category: FeeCategory.DEV_PLATFORM, unit: FeeUnit.FLAT_NGN,   value: 100 },
  { key: 'dev_scale_overage',           name: 'Dev Platform - Scale Overage',
    description: 'Per-delivery charge once Scale tier monthly inclusion is exhausted.',
    category: FeeCategory.DEV_PLATFORM, unit: FeeUnit.FLAT_NGN,   value: 80 },

  // Road-distance quoting knobs (2026-08-15). Directions calls are capped
  // under Google's 10,000/month free tier; past the cap, quotes fall back
  // to straight-line distance times a circuity factor that the system
  // calibrates from real routed trips per pickup zone, bounded both ways.
  { key: 'routes_api_monthly_cap',      name: 'Routes API monthly call cap',
    description: 'Directions lookups allowed per calendar month before quotes fall back to calibrated straight-line distance. Keep under the 10,000 free tier unless billing is intended.',
    category: FeeCategory.COMMISSION,   unit: FeeUnit.FLAT_NGN,   value: 9000 },
  { key: 'circuity_default_pct',        name: 'Circuity factor default (%)',
    description: 'Fallback road-vs-straight-line ratio when a pickup zone has no learned value. 145 means roads assumed 45% longer than the crow flies.',
    category: FeeCategory.COMMISSION,   unit: FeeUnit.PERCENT,    value: 145 },
  { key: 'circuity_min_pct',            name: 'Circuity factor floor (%)',
    description: 'Lower bound on any circuity factor, learned or default.',
    category: FeeCategory.COMMISSION,   unit: FeeUnit.PERCENT,    value: 110 },
  { key: 'circuity_max_pct',            name: 'Circuity factor ceiling (%)',
    description: 'Upper bound on any circuity factor, learned or default.',
    category: FeeCategory.COMMISSION,   unit: FeeUnit.PERCENT,    value: 220 },
];
