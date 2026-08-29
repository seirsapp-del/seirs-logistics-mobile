/**
 * What the public may know about our pricing.
 *
 * Found 2026-08-27 by an unauthenticated curl against production:
 * GET /config/rate-card is @Public(), because all three apps fetch it on
 * boot, and it returned the raw RateCard entity. That shipped, to anyone
 * who asked, with no token at all:
 *
 *   activatedBy   the founder's full legal name
 *   changeReason  free-text internal commentary on why a price moved
 *   vehicleRates  baseFareDriver and labourPerKmDriver for all 7 classes,
 *                 which is the complete driver cost basis, so subtracting
 *                 it from the customer column hands over the margin on
 *                 every vehicle we run
 *   rideRates     the same again for the four ride classes
 *   stopAndDwell  perStopBonusDriver, perDwellMinuteDriver
 *   timeSurcharges  driverSharePercent per window
 *   highValue     driverSharePct
 *
 * A competitor could price directly underneath us on whichever vehicle
 * we are thinnest on, which today is truck_small at 8.9% on distance.
 *
 * The apps need the CUSTOMER side to quote a trip before the server
 * prices it, and nothing more: a customer's phone has never needed to
 * know what we pay a rider. The driver app reads its own pay from
 * priceBreakdown.driver on the delivery, which is authenticated and
 * scoped to that rider's own job, so it loses nothing here either.
 *
 * Whitelist, never blacklist, for the same reason as redact-driver.ts:
 * a blacklist leaks the next column anyone adds to the entity, which is
 * exactly how this happened.
 */

type AnyRec = Record<string, any>;

/** Vehicle economics, customer side only. */
function publicVehicleRate(v: AnyRec): AnyRec {
  return {
    baseFareCustomer:    v.baseFareCustomer,
    labourPerKmCustomer: v.labourPerKmCustomer,
    // Capability, not cost: the picker has to know what a vehicle can
    // physically take or it will offer an okada for a house move.
    maxPayloadKg:        v.maxPayloadKg,
    maxPackages:         v.maxPackages,
    /**
     * The distance ceiling, for the same reason as payload (2026-08-29).
     *
     * The admin editor has offered a maxRouteKm box per vehicle the
     * whole time, and both the customer and business apps read
     * vehicleRates[type].maxRouteKm to refuse an over-long run. This
     * function stripped it, so the value reached the database and never
     * reached an app: a founder could set "okada, 30km", publish, and
     * watch an okada quote a 944 km trip anyway.
     *
     * It is a capability, not a cost. Telling a customer that an okada
     * does not do cross-country gives away nothing about margin.
     */
    maxRouteKm:          v.maxRouteKm,
    // kmPerLitre and fuelType stay: fuel is a pass-through the customer
    // is charged for and is entitled to see itemised on the quote.
    kmPerLitre:          v.kmPerLitre,
    fuelType:            v.fuelType,
  };
}

/** A time window's customer percentage, without our share of it. */
function publicSurchargeWindow(w: AnyRec): AnyRec {
  if (!w || typeof w !== 'object') return w;
  const { driverSharePercent, ...rest } = w;
  return rest;
}

export function redactRateCardForPublic(card: AnyRec | null): AnyRec | null {
  if (!card) return card;

  const mapRates = (src: AnyRec | null | undefined) => {
    if (!src || typeof src !== 'object') return src ?? null;
    const out: AnyRec = {};
    for (const [k, v] of Object.entries(src)) {
      out[k] = v && typeof v === 'object' ? publicVehicleRate(v as AnyRec) : v;
    }
    return out;
  };

  const t = card.timeSurcharges ?? {};
  const hv = card.highValue ?? {};
  const sd = card.stopAndDwell ?? {};

  return {
    // Identity of the card itself, so a client can tell when it changed
    // and bust its cache. A UUID and a version number say nothing about
    // what we pay anyone.
    id:       card.id,
    version:  card.version,
    isActive: card.isActive,

    fuelPrices:   card.fuelPrices ?? null,
    vehicleRates: mapRates(card.vehicleRates),
    rideRates:    mapRates(card.rideRates),

    // Seat and luggage pricing is a single customer-side number each.
    seatRates:    card.seatRates ?? null,
    luggageFees:  card.luggageFees ?? null,

    stopAndDwell: {
      perStopBonusCustomer:      sd.perStopBonusCustomer,
      perDwellMinuteCustomer:    sd.perDwellMinuteCustomer,
      // The customer is entitled to know when waiting starts costing and
      // where it stops: both are limits ON the charge, not our margin.
      freeDwellThresholdMinutes: sd.freeDwellThresholdMinutes,
      dwellCapMinutes:           sd.dwellCapMinutes,
    },

    weightTiers:  card.weightTiers  ?? null,
    dwellBuffers: card.dwellBuffers ?? null,

    timeSurcharges: {
      night:   publicSurchargeWindow(t.night),
      peak:    publicSurchargeWindow(t.peak),
      weekend: publicSurchargeWindow(t.weekend),
    },

    zoneSurcharges: card.zoneSurcharges ?? null,
    discounts:      card.discounts      ?? null,
    feeRules:       card.feeRules       ?? null,
    partnerStore:   card.partnerStore   ?? null,
    serviceFees:    card.serviceFees    ?? null,
    regions:        card.regions        ?? null,
    insurance:      card.insurance      ?? null,

    highValue: {
      // The threshold and the premium are quoted to the sender, so they
      // are public by necessity. What we hand the rider out of it is not.
      thresholdNgn: hv.thresholdNgn,
      premiumPct:   hv.premiumPct,
    },

    vatRate: card.vatRate,
  };
}
