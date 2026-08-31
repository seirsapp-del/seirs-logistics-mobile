/**
 * What each side of a booking may know about its own money.
 *
 * Found 2026-08-31 by reading the business delivery route. The stored
 * `priceBreakdown` is the whole PriceBreakdown object straight from the
 * pricing engine, and both delivery detail routes spread the delivery
 * row untouched, so a business sender's phone received:
 *
 *   seirsNet    what SEIRS keeps on the job
 *   trueCosts   contribution, belowFloor, marginFloorNgn, the failure
 *               provision and the card-processing cost, which together
 *               are the real margin after every cost of serving it
 *   driver      base, labour, fuel, stop bonuses and surcharge share,
 *               which is the complete driver cost basis for that run
 *
 * That is the same disclosure the public rate-card leak carried, on a
 * per-job basis and with the actual numbers rather than the rates.
 * redact-rate-card.ts closed the rates on 2026-08-27 and its own comment
 * says the driver app reads its pay "from priceBreakdown.driver on the
 * delivery, which is authenticated and scoped to that rider's own job".
 * Scoped to the rider was the intent; the sender was getting it too.
 *
 * Whitelist, never blacklist, for the same reason as the other two
 * redactors here: a blacklist leaks whatever the next person adds to the
 * engine's return value, which is exactly how this happened.
 */

type AnyRec = Record<string, any>;

const num = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * The sender's own bill, itemised, and nothing about what it cost us.
 *
 * Everything here is a line the payer was charged and can already add up
 * from their receipt. What is deliberately absent is every figure that
 * only makes sense from SEIRS's side of the transaction.
 */
export function breakdownForCustomer(b: AnyRec | null | undefined): AnyRec | null {
  if (!b || typeof b !== 'object') return null;
  const c = b.customer ?? {};
  return {
    vehicleType:  b.vehicleType ?? null,
    categoryCode: b.categoryCode ?? null,
    km:           num(b.km),
    stops:        num(b.stops),
    customer: {
      base:              num(c.base),
      distanceLabour:    num(c.distanceLabour),
      distanceFuel:      num(c.distanceFuel),
      stopBonuses:       num(c.stopBonuses),
      dwellOver:         num(c.dwellOver),
      categorySurcharge: num(c.categorySurcharge),
      timeSurcharges:    c.timeSurcharges ?? null,
      zoneSurcharges:    c.zoneSurcharges ?? null,
      discounts:         c.discounts ?? null,
      serviceFee:        num(c.serviceFee),
      partnerHandling:   num(c.partnerHandling),
      highValuePremium:  num(c.highValuePremium),
      vatBase:           num(c.vatBase),
      vat:               num(c.vat),
      total:             num(c.total),
      // Named zones and their stated reason. Already surfaced at quote
      // time and the whole point of it is to be readable afterwards.
      zoneNotices:       c.zoneNotices ?? null,
    },
    // Which states, which tier, what the tier cost. The sender paid it,
    // so the sender may see why.
    route: b.route ?? null,
  };
}

/**
 * The rider's own pay, itemised, and nothing about the sender's bill or
 * our margin.
 *
 * A rider needs to know how their own number was built: that is the
 * whole reason this object is stored. They do not need the customer's
 * discount structure, and they must not receive seirsNet or trueCosts.
 */
export function breakdownForDriver(b: AnyRec | null | undefined): AnyRec | null {
  if (!b || typeof b !== 'object') return null;
  const d = b.driver ?? {};
  return {
    vehicleType: b.vehicleType ?? null,
    km:          num(b.km),
    stops:       num(b.stops),
    driver: {
      base:           num(d.base),
      distanceLabour: num(d.distanceLabour),
      distanceFuel:   num(d.distanceFuel),
      stopBonuses:    num(d.stopBonuses),
      dwellOver:      num(d.dwellOver),
      surchargeShare: num(d.surchargeShare),
      highValueShare: num(d.highValueShare),
      total:          num(d.total),
    },
    // Context for the surcharge share line, so the rider can see which
    // kind of distance paid them rather than a bare number.
    route: b.route
      ? {
          zoneTier:     b.route.zoneTier ?? null,
          isInterState: b.route.isInterState ?? null,
        }
      : null,
  };
}
