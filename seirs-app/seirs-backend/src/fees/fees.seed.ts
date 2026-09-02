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
  /**
   * Read in two places and seeded in none, so both fell back and the two
   * fallbacks disagreed: 1 in the pricing floor, 1.3 in Travel Buddy
   * (audit, 2026-08-28). The Travel Buddy comment says it uses "the same
   * approximation the delivery pricing floor already uses, so the two
   * engines cannot disagree about how far apart two points are". They
   * disagreed by 30 percent.
   *
   * Seeded at 1.3, which keeps Travel Buddy exactly where it was and
   * lifts the pricing floor from the bare straight line. The floor only
   * binds when a reported distance is BELOW straight-line times this, and
   * real Lagos road distance runs about 1.45 times the straight line, so
   * a legitimate distance still clears it. It now catches the
   * impossible ones, which is what a floor is for.
   *
   * Not the same thing as circuity_default_pct. That is the calibrated,
   * self-correcting road estimate used to price a journey. This is a
   * sanity bound, deliberately stable, so a quoted seat cannot reprice
   * because a routing API answered differently tomorrow.
   */
  { key: 'pricing_road_factor',         name: 'Road-distance sanity factor',
    description: 'Multiplier on straight-line distance used as a floor, so no journey can be priced shorter than is physically plausible. Deliberately stable and separate from the calibrated circuity estimate. Never below 1.',
    category: FeeCategory.CONFIG,       unit: FeeUnit.COUNT,      value: 1.3 },

  { key: 'corridor_match_radius_m', name: 'Corridor match radius (m)',
    description: 'A job scores the corridor bonus when its pickup AND drop are both within this many metres of the courier declared line.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.COUNT, value: 600 },
  { key: 'corridor_score_bonus', name: 'Corridor score bonus',
    description: 'Matching score added when a job lies along a courier declared corridor (scores are 0-1; 0.2 outranks most distance gaps).',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.COUNT, value: 0.2 },
  { key: 'travel_buddy_offer_timeout_min', name: 'Travel Buddy offer timeout (min)',
    description: 'How long a declared driver has to accept a paid seat booking before it auto-refunds in full.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.MINUTES, value: 30 },

  // ── Travel Buddy: seats sold by the SEGMENT (founder 2026-08-28) ──────
  // A seat used to be priced on the driver's WHOLE route, so a passenger
  // riding Ibadan to Osogbo paid for Ibadan to Abuja, and their empty
  // seat could not be resold once they got out. Seats are now sold per
  // segment, requested before they are paid for, and every threshold in
  // that flow is a row here rather than a literal in a service.
  { key: 'travel_buddy_min_segment_fare_ngn', name: 'Travel Buddy minimum segment fare',
    description: 'Floor under a single seat on one segment, per seat. Stops somebody booking a four-kilometre hop on a cross-country run and occupying a seat that could have carried a passenger the length of the country.',
    category: FeeCategory.CUSTOMER_FEE, unit: FeeUnit.FLAT_NGN, value: 1500 },
  { key: 'travel_buddy_unpaid_hold_min', name: 'Travel Buddy unpaid hold (min)',
    description: 'Minutes an accepted seat request stays honoured before payment. The segment stays SELLABLE throughout, so this is how long the quoted fare lasts, not a reservation.',
    category: FeeCategory.CUSTOMER_FEE, unit: FeeUnit.MINUTES, value: 30 },
  { key: 'travel_buddy_no_show_wait_min', name: 'Travel Buddy no-show wait (min)',
    description: 'Minutes a rider must wait at the boarding stop, visible to both sides, before the fare may be forfeited and the vehicle may leave. The wait, the rider position and every contact attempt are recorded for the dispute.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.MINUTES, value: 15 },
  { key: 'travel_buddy_free_cancel_hours', name: 'Travel Buddy free-cancel cut-off (hours before departure)',
    description: 'Hours before departure inside which a passenger cancellation stops being refunded in full. Outside it the fare returns less the sunk card processing (cancel_processing_pct).',
    category: FeeCategory.CUSTOMER_FEE, unit: FeeUnit.HOURS, value: 24 },
  // 100, not 0. Founder 2026-08-28: "they get a refund minus the
  // processing fee." A passenger who cancels in advance leaves a seat
  // that can still be sold, which is nothing like a no-show where the
  // vehicle waited and then carried the space empty. The card
  // processing is still withheld through cancel_processing_pct, because
  // that is a real sunk cost rather than a penalty.
  { key: 'travel_buddy_late_cancel_refund_pct', name: 'Travel Buddy late-cancel refund (%)',
    description: 'Share of a paid seat fare returned when a passenger cancels INSIDE the cut-off, before card processing is deducted. 100 returns the fare less the payment processing charge, which is the standing policy. 0 returns nothing at all. While this sits at 100 the cut-off changes nothing, because both sides of it refund the same: lower this to make late cancellations cost the passenger something.',
    category: FeeCategory.CUSTOMER_FEE, unit: FeeUnit.PERCENT, value: 100 },
  { key: 'travel_buddy_drop_geofence_m', name: 'Travel Buddy drop geofence (m)',
    description: 'Metres from the declared alight stop beyond which a drop is FLAGGED, never refused: roads close and plans change, so the distance is recorded for review rather than used to strand a rider mid-journey.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.COUNT, value: 1000 },
  /**
   * The Last-Order Compliance board reads this key and there was no row
   * for it, so the board silently used its code fallback of 80 and the
   * threshold could not be moved from the dashboard (audit, 2026-08-28).
   * The page's own comment said the live number comes from the Fee
   * Catalogue, which was the intent and not the behaviour.
   *
   * A review threshold, not an enforcement: nothing in the backend acts
   * on it. It decides which riders the board asks you to look at.
   */
  { key: 'last_order_min_acceptance_pct', name: 'Last-order minimum acceptance',
    description: 'Acceptance rate below which a rider is flagged on the Last-Order Compliance board for review. A review threshold only: nothing is charged, paused or suspended automatically.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.PERCENT, value: 80 },

  { key: 'driver_cancel_free_per_day', name: 'Driver cancels: free per day',
    description: 'Accepted-job cancels a rider may make per 24 hours before a ranking penalty applies. Safety (\"felt unsafe\") never counts. The penalty lowers their place in dispatch, it does not stop offers: in a thin market they will still be matched whenever no unpenalised rider is closer.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.COUNT, value: 2 },
  { key: 'driver_cancel_pause_hours', name: 'Driver cancels: ranking penalty hours',
    description: 'How long a rider is ranked lower in dispatch after exceeding the daily cancel allowance. Named a pause historically; matching applies a score penalty rather than an exclusion, so the rider keeps receiving offers when nobody better is nearby.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.HOURS, value: 2 },
  { key: 'agreement_no_pickup_hours', name: 'Agreed but never collected (hours)',
    description: 'How long after a rider agrees to carry a load, and could have collected it, before the job is taken off them and re-dispatched. The parcel is still with the sender at this point, so recovery is safe to automate. Clock starts at the scheduled slot when there is one.',
    category: FeeCategory.CONFIG, unit: FeeUnit.COUNT, value: 6 },
  { key: 'agreement_silent_hours', name: 'Has the parcel and gone quiet (hours)',
    description: 'How long a rider who has COLLECTED a parcel can go without movement before the case is flagged for a human. Deliberately never automated: a rider with no signal on the Kano road looks identical to one who has stolen the goods, and cancelling would strand a parcel that is physically in somebody hands.',
    category: FeeCategory.CONFIG, unit: FeeUnit.COUNT, value: 12 },
  { key: 'agreement_breach_window_days', name: 'Agreement breach look-back (days)',
    description: 'How far back strikes are counted when a rider breaks an agreement they accepted. Affects the number ops SEES, never an automatic action: no threshold bans anybody, because a seized bike and a shrug look identical in the data and only a person can tell them apart.',
    category: FeeCategory.CONFIG, unit: FeeUnit.COUNT, value: 90 },
  { key: 'parcel_request_expiry_hours', name: 'Parcel request expiry (hours)',
    description: 'How long an unanswered request to carry a parcel on a declared trip waits before releasing the sender to ask somebody else. Nothing is charged while it waits.',
    category: FeeCategory.CONFIG, unit: FeeUnit.COUNT, value: 12 },
  { key: 'parcel_request_max_open', name: 'Open parcel requests per sender',
    description: 'How many live trip requests one sender may hold at once. A request costs the sender nothing, which is exactly why this cap exists: the driver attention it consumes is the scarce thing.',
    category: FeeCategory.CONFIG, unit: FeeUnit.COUNT, value: 3 },
  { key: 'interstate_requires_verified_id', name: 'Interstate needs a verified ID',
    description: 'Set above 0 to refuse bookings that cross a state line from accounts with no approved ID. The identity policy has claimed this since 2026-08-07 and nothing enforced it. OFF by default: approval takes up to 3 business days and gating this blocks real senders.',
    category: FeeCategory.CONFIG, unit: FeeUnit.COUNT, value: 0 },
  { key: 'interstate_corridor_match_km', name: 'Interstate corridor match radius',
    description: 'How near a parcel pickup and drop must be to a declared trip origin and destination for the corridor bonus to apply. Was city-name text matching until 2026-08-31.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.COUNT, value: 25 },
  { key: 'interstate_match_bonus', name: 'Interstate trip match bonus',
    description: 'Matching score added when a booking route matches a driver declared intercity trip departing within 24h (scores are 0-1).',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.COUNT, value: 0.25 },
  // 72, not 2. Lagos to Ibadan is a three hour drive, so a 2 hour corridor
  // expired before the rider arrived, and a trip declared the night before
  // was dead by departure. Founder 2026-08-27: "people declare trips days
  // before, especially for long trips like that, so i will say 3 day."
  { key: 'corridor_max_hours', name: 'Corridor max hours',
    description: 'Longest a declared corridor can stay active. Three days, because interstate trips are declared days ahead.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.HOURS, value: 72 },
  { key: 'driver_level_id_gate', name: 'Level ID-verification gate',
    description: 'Levels at or above this require verified identity (per the identity policy). Auto-raise stops below it for unverified drivers.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.COUNT, value: 6 },

  // ── Commission ─────────────────────────────────────────────────────────

  // ── Customer-side fees ─────────────────────────────────────────────────

  // ── Driver-side fees ───────────────────────────────────────────────────

  // ── Storage (partner stores) ───────────────────────────────────────────
  // Named for a 24-to-72-hour band that the code does not have and never
  // had (audit, 2026-08-28). partner-store.service.ts charges this for
  // every started day past storage_free_hours, with no upper band and no
  // second tier, until storage_max_days declares the parcel abandoned.
  // The key is referenced by string and stays; the label an operator
  // reads is what was wrong, and it read as though charging stopped
  // after three days.
  { key: 'storage_24_72hr',             name: 'Storage Fee (per day)',
    description: 'Charged to the sender for each started day a parcel sits at a counter past the free window. There is no upper band: it accrues every day until the abandonment threshold. Free window is storage_free_hours, the cut-off is storage_max_days.',
    category: FeeCategory.STORAGE,      unit: FeeUnit.PER_DAY,    value: 200 },

  /**
   * RESTORED 2026-08-28, having been wrongly deleted the same day.
   *
   * It was removed as "seed only, no consumer", which was true and was
   * the wrong test. The founder-approved exception-path spec ("When
   * Delivery Fails", 21 Aug) names this row explicitly and separately
   * from return_to_sender_fee: this is the one-time charge for returning
   * a package after it has overstayed, and return_to_sender_fee prices
   * the return TRIP. Two different charges in the same story.
   *
   * So it is not a duplicate that nothing reads. It is a spec'd knob
   * nobody has wired yet, which is a build item, not a deletion. The
   * difference matters: deleting an unimplemented requirement makes the
   * gap invisible instead of closing it.
   */
  
  // Founder decision 2026-08-16: whenever a partner counter touches a
  // parcel, the counter gets paid. Charged PER PARCEL PER COUNTER, so a
  // parcel dropped at counter A and delivered to counter B carries two
  // (both shops did the work). Set to 0 to switch counters off as a
  // paid service without a code change.
  { key: 'partner_store_handling_ngn',  name: 'Partner Counter Handling Fee',
    description: 'Paid to a partner store each time it hands over or receives a parcel. Charged per parcel per counter, added to the sender\'s total and shown as its own receipt line.',
    category: FeeCategory.STORAGE,      unit: FeeUnit.FLAT_NGN,   value: 500 },

  // ── Surge ──────────────────────────────────────────────────────────────

  // ── The real cost of serving a job ─────────────────────────────────────
  // None of these were modelled, so every quote reported a margin the
  // company never actually saw (review 2026-08-18).
  { key: 'card_processing_pct',         name: 'Payment Processing Cost (%)',
    description: 'The proportional part of what the processor takes on a collected payment. Modelled as a cost so quoted margin is the margin we keep. Pair with the flat row below: a rail that charges a fixed amount per transaction cannot be described by a percentage.',
    category: FeeCategory.CONFIG, unit: FeeUnit.PERCENT, value: 1.4 },

  /**
   * The flat half of processing (2026-09-01).
   *
   * A single percentage assumes every rail prices proportionally. Card
   * does. Transfer and USSD commonly do not: they charge a fixed amount
   * per transaction, and a flat NGN 50 is 6.25% of an NGN 800 okada
   * booking and 0.1% of an NGN 50,000 one. No percentage is right for
   * both, so tuning the row above cannot fix it, only choose which end
   * to be wrong at.
   *
   * Seeded at 0, so today's behaviour is byte-identical to before this
   * row existed. It is here so the number is expressible the day we
   * have a real transfer and a real USSD payment to read it off. We
   * have neither, and this is deliberately NOT a guess at one.
   */
  { key: 'card_processing_flat_ngn',    name: 'Payment Processing Cost (flat)',
    description: 'The fixed part of what the processor takes per transaction, on top of the percentage above. Transfer and USSD often price this way while card does not. Left at 0 until real transfer and USSD payments show what it actually is.',
    category: FeeCategory.CONFIG, unit: FeeUnit.FLAT_NGN, value: 0 },

  /**
   * How long a statement download link works for (2026-09-01).
   *
   * Separate from verification, which never expires: somebody may check
   * a statement months later and that is the whole point of the code.
   * This governs the emailed link, which gets forwarded, and a permanent
   * public URL to a company's line-by-line spend is a much larger
   * exposure than the totals the verification page shows.
   */
  { key: 'statement_download_expiry_days', name: 'Statement Download Link Life (days)',
    description: 'How many days a statement download link keeps working. Verification by reference never expires; this only governs the emailed link, which can be forwarded. Re-issuing a statement is a tap, so short is the safer end to be wrong at.',
    category: FeeCategory.CONFIG, unit: FeeUnit.COUNT, value: 7 },

  { key: 'nipost_postal_fund_pct',      name: 'NIPOST Postal Fund Levy',
    description: 'Statutory contribution required of courier operators. Confirm with counsel whether the base is gross bookings or net revenue before scaling.',
    category: FeeCategory.CONFIG, unit: FeeUnit.PERCENT, value: 2 },

  { key: 'door_delivery_failure_pct',   name: 'Door Delivery Failure Rate',
    description: 'Share of door deliveries that find nobody home and need a second trip at no extra revenue. Counter deliveries are exempt because a shop does not go out. Replace with measured data as soon as it exists.',
    category: FeeCategory.CONFIG, unit: FeeUnit.PERCENT, value: 8 },

  { key: 'min_job_margin_ngn',          name: 'Minimum Job Margin',
    description: 'A warning line, not a limit. A job that keeps less than this still runs and is flagged on its delivery receipt so you can see which work came in thin. Set to 0 to stop flagging.',
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
    category: FeeCategory.PARTNER, unit: FeeUnit.COUNT, value: 0 },

  { key: 'trunk_assumed_parcels',       name: 'Assumed Parcels per Trunk Run',
    description: 'Divisor behind consolidated counter-to-counter pricing. Start pessimistic and raise it only on measured load data.',
    category: FeeCategory.PARTNER, unit: FeeUnit.COUNT, value: 6 },

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
  /**
   * These two said "Drivers are reimbursed at this rate, so it must
   * track the real pump price or riders subsidise every trip" (audit,
   * 2026-08-28). They are not, and it does not.
   *
   * fuelPerKm reads card.fuelPrices, or a region override of it, and
   * never these rows: pricing.service.ts:409. The rows exist so
   * livePumpPrices can compare reality against the published card and
   * raise the drift warning at :449.
   *
   * The old wording pointed the wrong way on the one thing that matters:
   * a founder raising the petrol price here to stop riders subsidising
   * fuel would have changed no payout at all, and believed he had.
   */
  { key: 'current_petrol_price_ngn',    name: 'Petrol Pump Price (per litre, reference)',
    description: 'REFERENCE ONLY. Today’s real pump price, recorded here so the dashboard can warn you when the rate card has fallen behind it. It does NOT price anything: what a rider is reimbursed and what a customer is quoted both come from the rate card’s own fuel prices. Changing this number alone changes no fare and no payout. Update it, read the drift warning, then update the card and publish.',
    category: FeeCategory.CONFIG, unit: FeeUnit.FLAT_NGN, value: 1380 },

  { key: 'current_diesel_price_ngn',    name: 'Diesel Pump Price (per litre, reference)',
    description: 'REFERENCE ONLY, same as the petrol row. Today’s real diesel price for the drift warning on vans and trucks. Reimbursement and quotes come from the rate card, not from here. Changing this alone changes nothing until the card is republished.',
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

  // Days, carrying the naira unit, so the catalogue rendered a 30-day
  // window as a price of 30.00 (audit, 2026-08-28). This is the exact
  // bug the unit resync was written for and this row was missed by it,
  // because the seed itself was wrong rather than the stored row.
  { key: 'driver_new_period_days',      name: 'New Driver Period (days)',
    description: 'How long a rider counts as new, which is how long the holdback and the tighter daily withdrawal ceiling apply. Counted from the day the rider account was created.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.DAYS, value: 30 },

  { key: 'driver_new_holdback_pct',     name: 'New Driver Holdback',
    description: 'Share of a new driver payout held back against chargebacks and disputes.',
    category: FeeCategory.DRIVER_FEE, unit: FeeUnit.PERCENT, value: 10 },


  // ── Loyalty, which is a liability ──────────────────────────────────────
  // Every point issued is a discount owed later, so the earn rate and the
  // abuse ceilings belong on the dashboard rather than in a deploy.
  /**
   * The ceiling on the free-delivery reward, added 2026-08-28.
   *
   * redeem_free_delivery set a delivery's price to 0 with no bound, and
   * 1,000 points is worth 1,000 naira at the rate card's redemption
   * rate. It was buying interstate runs outright. Every loyalty perk
   * carries a cap by standing rule.
   */
  { key: 'loyalty_free_delivery_max_ngn', name: 'Free Delivery, largest covered',
    description: 'The most a delivery may cost and still be covered by the free-delivery reward. A larger delivery is refused with the points untouched, rather than part-discounted, so the reward keeps meaning what it says. Set to 0 to remove the ceiling entirely, which leaves the reward unbounded.',
    category: FeeCategory.LOYALTY,      unit: FeeUnit.FLAT_NGN,   value: 3000 },

  { key: 'loyalty_points_per_1000_ngn', name: 'Points per NGN 1,000 Spent',
    description: 'Base earn rate before any tier multiplier.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.POINTS, value: 10 },

  { key: 'loyalty_referral_bonus',      name: 'Referral Bonus (points)',
    description: 'Points awarded when a referred user completes their first qualifying delivery.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.POINTS, value: 200 },

  { key: 'loyalty_max_referrals_month', name: 'Referral Cap per Month',
    description: 'Most referral bonuses one account can earn in a calendar month.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.COUNT, value: 10 },

  { key: 'loyalty_referral_min_ngn',    name: 'Referral Qualifying Delivery',
    description: 'Minimum delivery value before a referral counts, so a token order cannot farm bonuses.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.FLAT_NGN, value: 1000 },

  { key: 'loyalty_referral_flag_count', name: 'Referral Fraud Flag Threshold',
    description: 'Referrals inside seven days that trigger an admin review.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.COUNT, value: 5 },

  { key: 'loyalty_streak_bonus',        name: 'Monthly Streak Bonus (points)',
    description: 'Points for hitting the monthly delivery streak target.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.POINTS, value: 50 },

  { key: 'loyalty_streak_target',       name: 'Monthly Streak Target',
    description: 'Deliveries in a calendar month that earn the streak bonus.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.COUNT, value: 5 },

  { key: 'loyalty_bank_transfer_bonus', name: 'Bank Transfer Bonus (points)',
    description: 'Small nudge toward the payment method that costs least to process.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.POINTS, value: 5 },

  { key: 'loyalty_rate_driver_bonus',   name: 'Rate a Driver Bonus (points)',
    description: 'Points for leaving a driver rating.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.POINTS, value: 5 },

  { key: 'loyalty_point_lifetime_months', name: 'Point Lifetime (months)',
    description: 'How long an unspent point survives before expiring.',
    category: FeeCategory.LOYALTY, unit: FeeUnit.MONTHS, value: 12 },

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
  // Founder 2026-08-31, after a new ops manager missed the window by two
  // minutes: short is right for a key to the dashboard, but one hour is
  // tight when two people have to coordinate across a working day. Editable
  // by a super admin only, which PATCH /admin/fees/:key already enforces.
  // Both invite emails read their wording from this number, so raising it
  // never leaves the copy claiming something else.
  { key: 'admin_invite_expiry_minutes', name: 'Staff Invite Link Expiry (minutes)',
    description: 'Minutes a staff invitation or admin password-reset link stays valid. Short on purpose: this link opens the dashboard. 60 is the default.',
    category: FeeCategory.CONFIG, unit: FeeUnit.MINUTES, value: 60 },

  { key: 'pending_booking_expiry_minutes', name: 'Pending Booking Expiry (minutes)',
    description: 'Minutes a paid booking may wait for a driver before it auto-cancels with a full refund.',
    category: FeeCategory.CONFIG, unit: FeeUnit.MINUTES, value: 60 },

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
    description: 'Withheld from a refund when a paid booking is cancelled. Set to 0 on 2 September 2026, after the processing fee was actually measured rather than assumed: the CUSTOMER pays the processor at checkout, not SEIRS, so withholding a percentage on cancellation was taking back money SEIRS never spent. At 1.4 it removed about 1.25% from every cancelling customer as profit. The only part SEIRS genuinely absorbs is the VAT on that fee, roughly 0.15%, and the founder chose to absorb it rather than bill it, because "cancelling is free" is a cleaner promise than "free, less 0.15%". Raise this only if the processor starts charging SEIRS on a refund, and measure it first.',
    category: FeeCategory.CUSTOMER_FEE, unit: FeeUnit.PERCENT,    value: 1.4 },

  // ── Subscriptions ──────────────────────────────────────────────────────
  { key: 'seirs_plus_subscription',     name: 'SEIRS Plus (customer)',
    description: 'Not built. A customer monthly subscription concept: no booking fee, priority dispatch, 5 percent off deliveries. Nothing reads this row. Note that the booking fee it would waive is now the rate card service fee, since the old customer_booking_fee row was retired as a dead duplicate on 2026-08-28.',
    category: FeeCategory.SUBSCRIPTION, unit: FeeUnit.PER_MONTH,  value: 2000 },
  // Was NGN 5,000 per WEEK, which is NGN 21,667 a month against a Lagos
  // rider income of NGN 150k-300k: between 7% and 14% of everything they
  // earn, priced like Western SaaS rather than like a rider's wallet
  // (review 2026-08-18). Monthly, and small enough to be an easy yes.
  { key: 'driver_premium_subscription', name: 'Driver Premium (per week, paused)',
    description: 'PAUSED PLATFORM-WIDE since 2026-08-10: activation is blocked, billing is stopped and the matching boost is off, so this charges nobody today. Note the period: the code bills this WEEKLY, and the catalogue used to label it monthly, so a driver would have been charged this every week against a screen promising a month. Settle the number before ever un-pausing it.',
    category: FeeCategory.SUBSCRIPTION, unit: FeeUnit.PER_WEEK,  value: 4000 },

  // ── Partner ────────────────────────────────────────────────────────────
  { key: 'partner_sponsored_placement', name: 'Partner Sponsored Placement',
    description: 'Monthly fee for partner stores to be pinned at top of customer map.',
    category: FeeCategory.PARTNER,      unit: FeeUnit.PER_MONTH,  value: 25000 },
  { key: 'insurance_referral_commission', name: 'Insurance Referral Commission',
    description: 'SEIRS cut on premiums for partner-issued driver insurance policies.',
    category: FeeCategory.PARTNER,      unit: FeeUnit.PERCENT,    value: 12 },

  // ── Pool & multi-stop ──────────────────────────────────────────────────
  { key: 'pool_ride_discount',          name: 'Pool Ride Discount',
    description: 'Discount applied when customer accepts corridor-pool matching (Spec V8 §1).',
    category: FeeCategory.POOL,         unit: FeeUnit.PERCENT,    value: -20 },

  // ── Zone ───────────────────────────────────────────────────────────────

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
    description: 'Fallback only. The rate card’s high-value threshold is the one in charge: it sets both the premium a customer pays and the handoff rules that follow, so the two can never disagree. This value is used when the card has no threshold published.',
    category: FeeCategory.CONFIG,       unit: FeeUnit.FLAT_NGN,   value: 100000 },
  { key: 'return_to_sender_fee',        name: 'Return-to-Sender Transport Fee',
    description: 'Flat transport fee owed by the sender when a partner-store package passes 5 working days uncollected and is returned. Storage itself is free (2026-08-09 policy: 3 working days free, warning at 3, return at 5, no fee build-up).',
    category: FeeCategory.CONFIG,       unit: FeeUnit.FLAT_NGN,   value: 1500 },
  { key: 'platform_commission_pct',     name: 'Platform Commission',
    description: 'FALLBACK ONLY. A driver is normally paid the figure quoted from the rate card, whose per-vehicle driver base and per-km set the real split; this percentage applies only to old jobs recorded before that figure was stored. Editing it will not change what riders earn on new work: the rate card does that.',
    category: FeeCategory.COMMISSION,   unit: FeeUnit.PERCENT,    value: 30 },

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
