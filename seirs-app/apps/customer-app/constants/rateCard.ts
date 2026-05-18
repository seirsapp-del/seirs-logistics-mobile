/**
 * Single source of truth for every fee, vehicle rate, and discount the
 * customer-app calculates. Currently bundled as DEFAULT_RATE_CARD; once
 * the backend admin rate-card API lands, getRateCard() will fetch + cache
 * the live card and fall back to this default when offline.
 *
 * Admin-controlled. NEVER hardcode a fee in screen code — always read
 * from the card so a price change is a single admin save, not a deploy.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RideVehicleRate {
  id:            string;
  label:         string;
  icon:          string;
  subKey:        string;        // i18n key under request2.*
  description:   string;
  eta:           string;
  base:          number;        // flat fare in NGN
  perKm:         number;        // NGN per km of route distance
  capacityKey:   string;        // i18n key under request2.*
  capacityCount: number;
  features:      readonly string[];
  shareable:     boolean;       // can be matched with a co-rider for a discount
}

export interface PackageVehicleRate {
  id:        string;
  labelKey:  string;            // i18n key under send.*
  noteKey:   string;            // i18n key under send.*
  maxKg:     number;
  base:      number;            // flat fare in NGN
  perKm:     number;            // NGN per km of route distance
}

/**
 * Cumulative weight pricing. Each tier is applied as a series of "blocks"
 * above its lower bound. Once weight exceeds upToKg, the tier is "maxed"
 * and the next tier's blocks start counting from upToKg.
 *
 * surchargePerBlockNgn = fuel/wear cost per block (scales with weight)
 * handlingFlatNgn      = labor cost for loading/unloading at this tier
 *                        (applied as a flat fee, not per block)
 */
export interface WeightTier {
  upToKg:               number;
  surchargePerBlockKg:  number;  // size of each block in this tier
  surchargePerBlockNgn: number;  // cost per block
  handlingFlatNgn:      number;  // flat handling fee if this is the active tier
}

export interface RateCard {
  version:       string;
  effectiveFrom: string;
  ride: {
    vehicles:         readonly RideVehicleRate[];
    serviceFeePct:    number;
    shareDiscountPct: number;
  };
  package: {
    vehicles:         readonly PackageVehicleRate[];
    weightTiers:      readonly WeightTier[];
    serviceFeePct:    number;
  };
}

// ─── Default card (matches admin defaults; admin can override per env) ─────

export const DEFAULT_RATE_CARD: RateCard = {
  version:       '2026-05-18.001',
  effectiveFrom: '2026-05-18',

  ride: {
    vehicles: [
      {
        id: 'okada', label: 'Okada', icon: 'bicycle-outline', subKey: 'okadaSub',
        description: 'Fastest in traffic', eta: '2 min',
        base: 600, perKm: 60,
        capacityKey: 'capacityRider', capacityCount: 1,
        features: ['Fast', 'Cheap'], shareable: false,
      },
      {
        id: 'keke', label: 'Keke', icon: 'car-outline', subKey: 'kekeSub',
        description: 'Affordable shaded ride', eta: '3 min',
        base: 900, perKm: 90,
        capacityKey: 'capacityRiders', capacityCount: 3,
        features: ['Shaded', 'Affordable'], shareable: false,
      },
      {
        id: 'car', label: 'Car', icon: 'car-sport-outline', subKey: 'carSub',
        description: 'Comfortable AC ride', eta: '4 min',
        base: 1500, perKm: 180,
        capacityKey: 'capacityRiders', capacityCount: 4,
        features: ['AC', 'Comfort'], shareable: true,
      },
      {
        id: 'danfo', label: 'Danfo', icon: 'bus-outline', subKey: 'danfoSub',
        description: 'Group / shared bus', eta: '8 min',
        base: 3500, perKm: 300,
        capacityKey: 'capacityRiders', capacityCount: 14,
        features: ['Large', 'Group'], shareable: true,
      },
    ],
    serviceFeePct:    0.15,
    shareDiscountPct: 0.20,
  },

  package: {
    vehicles: [
      { id: 'bicycle',    labelKey: 'vehBicycle',    noteKey: 'vehBicycleNote',    maxKg: 5,    base: 500,   perKm: 50   },
      { id: 'motorcycle', labelKey: 'vehMotorcycle', noteKey: 'vehMotorcycleNote', maxKg: 20,   base: 800,   perKm: 150  },
      { id: 'keke',       labelKey: 'vehKeke',       noteKey: 'vehKekeNote',       maxKg: 100,  base: 1200,  perKm: 200  },
      { id: 'car',        labelKey: 'vehCar',        noteKey: 'vehCarNote',        maxKg: 200,  base: 2000,  perKm: 300  },
      { id: 'van',        labelKey: 'vehVan',        noteKey: 'vehVanNote',        maxKg: 800,  base: 5000,  perKm: 500  },
      { id: 'truck_sm',   labelKey: 'vehTruckSm',    noteKey: 'vehTruckSmNote',    maxKg: 3000, base: 15000, perKm: 1000 },
      { id: 'truck_lg',   labelKey: 'vehTruckLg',    noteKey: 'vehTruckLgNote',    maxKg: 9999, base: 40000, perKm: 2000 },
    ],
    weightTiers: [
      // 0–5 kg: free baseline (no surcharge, no handling)
      { upToKg:    5, surchargePerBlockKg:  5, surchargePerBlockNgn:    0, handlingFlatNgn:     0 },
      // 6–20 kg: ₦50 per 5kg block, ₦200 handling
      { upToKg:   20, surchargePerBlockKg:  5, surchargePerBlockNgn:   50, handlingFlatNgn:   200 },
      // 21–100 kg: ₦100 per 10kg block, ₦800 handling
      { upToKg:  100, surchargePerBlockKg: 10, surchargePerBlockNgn:  100, handlingFlatNgn:   800 },
      // 101–500 kg: ₦150 per 25kg block, ₦2,500 handling
      { upToKg:  500, surchargePerBlockKg: 25, surchargePerBlockNgn:  150, handlingFlatNgn:  2500 },
      // 501–3,000 kg: ₦200 per 50kg block, ₦8,000 handling
      { upToKg: 3000, surchargePerBlockKg: 50, surchargePerBlockNgn:  200, handlingFlatNgn:  8000 },
      // 3,000+ kg: ₦300 per 100kg block, ₦20,000 handling
      { upToKg: Infinity, surchargePerBlockKg: 100, surchargePerBlockNgn: 300, handlingFlatNgn: 20000 },
    ],
    serviceFeePct: 0.18,
  },
};

// ─── Pure pricing functions ────────────────────────────────────────────────

/**
 * Ride fare = base + (km × per-km) + service%, minus share-ride discount
 * when the vehicle supports sharing and the rider opted in.
 */
export function calcRideFare(
  card: RateCard,
  vehicleId: string,
  distKm: number,
  shared: boolean,
) {
  const v        = card.ride.vehicles.find(x => x.id === vehicleId) ?? card.ride.vehicles[0];
  const safeKm   = Math.max(0, distKm || 0);
  const base     = v.base;
  const dist     = Math.round(safeKm * v.perKm);
  const subtotal = base + dist;
  const service  = Math.round(subtotal * card.ride.serviceFeePct);
  const gross    = subtotal + service;
  const discount = shared && v.shareable ? Math.round(gross * card.ride.shareDiscountPct) : 0;
  return { base, dist, service, discount, total: gross - discount, vehicle: v };
}

/**
 * Cumulative weight surcharge — adds the full max of every tier the
 * weight passes through, plus the partial blocks in the active tier.
 * 12 kg = full 5–20 partial (2 blocks × ₦50 = ₦100).
 * 1000 kg = full 5–20 (₦150) + full 20–100 (₦800) + full 100–500 (₦2,400) + partial 500–3000 (10 × ₦200 = ₦2,000) = ₦5,350.
 */
function weightSurchargeNgn(card: RateCard, kg: number): { surcharge: number; handling: number } {
  if (kg <= 0) return { surcharge: 0, handling: 0 };
  let surcharge = 0;
  let handling  = 0;
  let prevUpper = 0;
  for (const tier of card.package.weightTiers) {
    if (kg <= prevUpper) break;
    const cappedKg = Math.min(kg, tier.upToKg);
    const extraKg  = Math.max(0, cappedKg - prevUpper);
    if (extraKg > 0) {
      const blocks = Math.ceil(extraKg / tier.surchargePerBlockKg);
      surcharge   += blocks * tier.surchargePerBlockNgn;
      handling     = tier.handlingFlatNgn;   // handling = the active tier's flat fee
    }
    prevUpper = tier.upToKg;
  }
  return { surcharge, handling };
}

/**
 * Package fare = base + (km × per-km) + weight-surcharge + handling-fee + service%.
 * Handling fee = labor cost for loading/unloading at the active weight tier.
 */
export function calcPackageFare(
  card: RateCard,
  vehicleId: string,
  distKm: number,
  kg: number,
) {
  const v        = card.package.vehicles.find(x => x.id === vehicleId) ?? card.package.vehicles[0];
  const safeKm   = Math.max(0, distKm || 0);
  const safeKg   = Math.max(0, kg || 0);
  const base     = v.base;
  const dist     = Math.round(safeKm * v.perKm);
  const { surcharge: weight, handling } = weightSurchargeNgn(card, safeKg);
  const subtotal = base + dist + weight + handling;
  const service  = Math.round(subtotal * card.package.serviceFeePct);
  const total    = subtotal + service;
  return { base, dist, weight, handling, service, total, vehicle: v };
}

// Convenient view of just the ride/package vehicle lists for screens that
// don't need the whole card.
export const RIDE_VEHICLES    = DEFAULT_RATE_CARD.ride.vehicles;
export const PACKAGE_VEHICLES = DEFAULT_RATE_CARD.package.vehicles;
