/**
 * Single source of truth for every fee, vehicle rate, and surcharge the
 * customer-app calculates. Currently bundled as DEFAULT_RATE_CARD; once
 * the backend admin rate-card API lands, getRateCard() will fetch + cache
 * the live card and fall back to this default when offline.
 *
 * Admin-controlled. NEVER hardcode a fee in screen code — always read
 * from the card so a price change is a single admin save, not a deploy.
 *
 * Spec mirrors seirs-pricing-spec.html. Service fee (15%/18%) is a
 * temporary SEIRS margin line; the long-term spec bakes margin into
 * base + perKm so the customer only sees km/surcharges/VAT.
 *
 * REGIONAL: rates resolve in three layers — state-level override → zone-
 * level override → baseline. SEIRS operates in all 37 federating units;
 * admin tunes per region without code changes.
 */

import {
  detectStateFromCoords,
  areStatesAdjacent,
  getStateZone,
  haversineKm,
  type StateCode,
  type GeopoliticalZone,
} from './regions';

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
  capacityKey:   string;
  capacityCount: number;
  features:      readonly string[];
  shareable:     boolean;
}

export interface PackageVehicleRate {
  id:        string;
  labelKey:  string;
  noteKey:   string;
  maxKg:     number;
  base:      number;
  perKm:     number;
}

export interface WeightTier {
  upToKg:               number;
  surchargePerBlockKg:  number;
  surchargePerBlockNgn: number;
  handlingFlatNgn:      number;
}

export interface CategorySurcharge {
  /** Percentage of (base + distance + weight + handling) added as a surcharge. */
  pct:               number;
  /** % of the surcharge the driver keeps (admin default 50%). */
  driverSharePct:    number;
  /** Vehicles this category is NOT allowed on — safety hard-stop. */
  forbiddenVehicles?: readonly string[];
}

/** A time window where a surcharge applies. */
export interface TimeSurchargeWindow {
  label:         string;
  pct:           number;
  driverPct:     number;
  /** Hour-of-day range [start, end). If start > end, wraps over midnight (e.g. 22→5 = night). */
  startHour?:    number;
  endHour?:      number;
  /** 0=Sun…6=Sat. If omitted, applies every day. */
  daysOfWeek?:   readonly number[];
}

/**
 * State-aware zone pricing. Replaces the old "long-distance %" with a
 * tier that knows whether you're staying in one state, crossing to a
 * neighbour, or going across the country.
 */
export interface ZoneRule {
  /** Intra-state, > this many km → small surcharge. */
  intraStateLongHaulKm:    number;
  intraStateLongHaulPct:   number;
  /** Adjacent-state crossing (Lagos↔Ogun). */
  interStateAdjacentPct:   number;
  /** Distant-state crossing (Lagos↔Kano). */
  interStateDistantPct:    number;
  /** Cross-zone (different geopolitical zone — usually long-distance). */
  crossZonePct:            number;
  /** > this many km → flat overnight fee on top of any %. */
  overnightFeeKm:          number;
  overnightFeeNgn:         number;
  /** Restricted sub-zones (curfew, flood, conflict) — admin lists with %. */
  restrictedZoneDefaultPct: number;
}

/**
 * Per-region overrides — applied on top of the baseline. Any field left
 * undefined means "inherit". Two levels: state-level wins over zone-level.
 */
export interface RegionalOverrides {
  /** Multiply every base + perKm by this. 1.0 = no change. */
  rateMultiplier?:    number;
  /** Specific vehicle overrides. */
  vehicleOverrides?:  Partial<Record<string, { base?: number; perKm?: number }>>;
  /** Per-region fuel prices (admin updates when pumps spike). */
  fuelPrices?:        { petrolNgn?: number; dieselNgn?: number };
  /** Override service fee %. */
  serviceFeeRideOverride?:    number;
  serviceFeePackageOverride?: number;
  /** Restricted sub-zones in this region (named, with surcharge %). */
  restrictedSubZones?: { name: string; surchargePct: number; reason: string }[];
  /** Cultural buffer minutes added to all dwell calcs in this region. */
  dwellBufferMin?: number;
  /** Reason this region differs — admin-visible explanation. */
  reason?:         string;
}

export interface DwellRule {
  freeMinutes:       number;   // wait minutes that are free at pickup
  perMinuteNgn:      number;   // charge per minute past free
  capMinutes:        number;   // hard cap minutes; after this driver may cancel
  driverPerMinuteNgn:number;
}

export interface CancellationRule {
  preAssignNgn:      number;   // before driver assigned
  postAssignNgn:     number;   // after assign, before pickup
  midRouteFlatNgn:   number;   // mid-route + distance to current loc
  noShowFlatNgn:     number;   // sender no-show after waitMin
  noShowWaitMin:     number;
}

export interface ReturnTripRule {
  callAttempts:      number;
  callIntervalMin:   number;
  returnFlatNgn:     number;   // sender pays return km + this flat
  storageFlatNgn:    number;   // OR drop at partner store + this flat
}

export interface CODRule {
  enabled:         boolean;
  handlingFlatNgn: number;
  handlingPct:     number;     // e.g. 0.01 = 1%
  handlingCapNgn:  number;
}

export interface RateCard {
  version:       string;
  effectiveFrom: string;
  vatPct:        number;       // 0.075 — applied on subtotal-after-everything

  ride: {
    vehicles:         readonly RideVehicleRate[];
    serviceFeePct:    number;       // TODO: deprecate; bake into base + perKm
    shareDiscountPct: number;
  };

  package: {
    vehicles:         readonly PackageVehicleRate[];
    weightTiers:      readonly WeightTier[];
    serviceFeePct:    number;       // TODO: deprecate
  };

  /** Per-category surcharge + safety rules. Keyed by category id used in send.tsx. */
  categories: Record<string, CategorySurcharge>;

  timeSurcharges: {
    night:   TimeSurchargeWindow;
    peak:    TimeSurchargeWindow;
    weekend: TimeSurchargeWindow;
  };

  zone:           ZoneRule;
  perStopBonus:   number;   // ₦ extra per additional stop in multi-stop bookings
  dwell:          DwellRule;
  cancellation:   CancellationRule;
  returnTrip:     ReturnTripRule;
  cod:            CODRule;

  /** Per-geopolitical-zone overrides (NW/NE/NC/SW/SE/SS). */
  zoneOverrides:  Partial<Record<GeopoliticalZone, RegionalOverrides>>;
  /** Per-state overrides (37 keys, optional). State-level wins over zone-level. */
  stateOverrides: Partial<Record<StateCode, RegionalOverrides>>;
}

// ─── Default card (matches admin defaults; admin can override per env) ─────

export const DEFAULT_RATE_CARD: RateCard = {
  version:       '2026-05-18.002',
  effectiveFrom: '2026-05-18',
  vatPct:        0.075,

  ride: {
    vehicles: [
      { id: 'okada', label: 'Okada', icon: 'bicycle-outline',   subKey: 'okadaSub', description: 'Fastest in traffic',    eta: '2 min', base:  600, perKm:  60, capacityKey: 'capacityRider',  capacityCount:  1, features: ['Fast', 'Cheap'],         shareable: false },
      { id: 'keke',  label: 'Keke',  icon: 'car-outline',       subKey: 'kekeSub',  description: 'Affordable shaded ride', eta: '3 min', base:  900, perKm:  90, capacityKey: 'capacityRiders', capacityCount:  3, features: ['Shaded', 'Affordable'], shareable: false },
      { id: 'car',   label: 'Car',   icon: 'car-sport-outline', subKey: 'carSub',   description: 'Comfortable AC ride',    eta: '4 min', base: 1500, perKm: 180, capacityKey: 'capacityRiders', capacityCount:  4, features: ['AC', 'Comfort'],        shareable: true  },
      { id: 'danfo', label: 'Danfo', icon: 'bus-outline',       subKey: 'danfoSub', description: 'Group / shared bus',     eta: '8 min', base: 3500, perKm: 300, capacityKey: 'capacityRiders', capacityCount: 14, features: ['Large', 'Group'],       shareable: true  },
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
      { upToKg:        5, surchargePerBlockKg:   5, surchargePerBlockNgn:    0, handlingFlatNgn:     0 },
      { upToKg:       20, surchargePerBlockKg:   5, surchargePerBlockNgn:   50, handlingFlatNgn:   200 },
      { upToKg:      100, surchargePerBlockKg:  10, surchargePerBlockNgn:  100, handlingFlatNgn:   800 },
      { upToKg:      500, surchargePerBlockKg:  25, surchargePerBlockNgn:  150, handlingFlatNgn:  2500 },
      { upToKg:     3000, surchargePerBlockKg:  50, surchargePerBlockNgn:  200, handlingFlatNgn:  8000 },
      { upToKg: Infinity, surchargePerBlockKg: 100, surchargePerBlockNgn:  300, handlingFlatNgn: 20000 },
    ],
    serviceFeePct: 0.18,
  },

  // Categories keyed by send.tsx PACKAGE_CATEGORIES ids.
  categories: {
    documents:    { pct: 0.00, driverSharePct: 0.50 },
    small_parcel: { pct: 0.00, driverSharePct: 0.50 },
    food:         { pct: 0.10, driverSharePct: 0.50 },  // treat as hot food
    fragile:      { pct: 0.20, driverSharePct: 0.50, forbiddenVehicles: ['bicycle'] },
    agricultural: { pct: 0.00, driverSharePct: 0.50 },
    building:     { pct: 0.15, driverSharePct: 0.50, forbiddenVehicles: ['bicycle', 'motorcycle'] },
    furniture:    { pct: 0.25, driverSharePct: 0.50, forbiddenVehicles: ['bicycle', 'motorcycle', 'keke'] },
    moving:       { pct: 0.40, driverSharePct: 0.50, forbiddenVehicles: ['bicycle', 'motorcycle', 'keke', 'car'] },
    market_goods: { pct: 0.00, driverSharePct: 0.50 },
    heavy:        { pct: 0.15, driverSharePct: 0.50, forbiddenVehicles: ['bicycle', 'motorcycle'] },
  },

  timeSurcharges: {
    night:   { label: 'night',   pct: 0.25, driverPct: 0.80, startHour: 22, endHour: 5 },
    peak:    { label: 'peak',    pct: 0.15, driverPct: 0.60, startHour: 17, endHour: 19, daysOfWeek: [1, 2, 3, 4, 5] },
    weekend: { label: 'weekend', pct: 0.10, driverPct: 0.70, daysOfWeek: [0, 6] },
  },

  zone: {
    intraStateLongHaulKm:     100,
    intraStateLongHaulPct:    0.15,   // long trip within one state — modest bump
    interStateAdjacentPct:    0.20,   // crossing into a neighbour state
    interStateDistantPct:     0.30,   // non-adjacent state crossing
    crossZonePct:             0.40,   // crossing geopolitical zone (NW↔SS, etc.)
    overnightFeeKm:           500,
    overnightFeeNgn:          5000,
    restrictedZoneDefaultPct: 0.50,
  },

  perStopBonus: 300,

  dwell: {
    freeMinutes:        5,
    perMinuteNgn:       40,
    capMinutes:         30,
    driverPerMinuteNgn: 25,
  },

  cancellation: {
    preAssignNgn:    0,
    postAssignNgn:   300,
    midRouteFlatNgn: 500,
    noShowFlatNgn:   300,
    noShowWaitMin:   10,
  },

  returnTrip: {
    callAttempts:    3,
    callIntervalMin: 5,
    returnFlatNgn:   500,
    storageFlatNgn:  500,
  },

  cod: {
    enabled:         true,
    handlingFlatNgn: 200,
    handlingPct:     0.01,
    handlingCapNgn:  2000,
  },

  // ── Per-geopolitical-zone overrides ────────────────────────────────────
  // Sensible starting points; admin tunes each from the dashboard. The
  // baseline above is calibrated for Lagos / urban SW. Other zones adjust
  // up or down based on local cost structure, security, fuel scarcity.
  zoneOverrides: {
    SW: {
      rateMultiplier: 1.00,
      reason: 'Baseline — calibrated for SW urban (Lagos/Ibadan/Abeokuta).',
    },
    SE: {
      rateMultiplier: 0.95,
      reason: 'Lower wages + denser urban network reduce per-trip cost.',
    },
    SS: {
      rateMultiplier: 1.10,
      fuelPrices: { petrolNgn: 1050, dieselNgn: 1350 },   // delta region — supply quirks
      reason: 'Oil delta — security premium + fuel-supply variability.',
    },
    NC: {
      rateMultiplier: 1.05,
      reason: 'FCT premium + longer rural routes between mid-belt towns.',
    },
    NW: {
      rateMultiplier: 0.90,
      reason: 'Lower wage base + cheaper fuel access (Kano hub).',
    },
    NE: {
      rateMultiplier: 1.15,
      dwellBufferMin: 3,         // longer ID checks at security stops
      reason: 'Security premium (parts of Borno/Yobe/Adamawa).',
    },
  },

  // ── Per-state overrides (only states that differ from their zone) ──────
  // Anything not listed inherits its zone's override (which inherits baseline).
  stateOverrides: {
    LA: { rateMultiplier: 1.10, reason: 'Lagos — traffic + higher cost of living.' },
    FC: { rateMultiplier: 1.10, reason: 'FCT — institutional demand premium.' },
    RI: { rateMultiplier: 1.15, reason: 'Port Harcourt — refinery/oil traffic + security.' },
    BO: {
      rateMultiplier: 1.30,
      restrictedSubZones: [
        { name: 'NE corridor (security advisory)', surchargePct: 0.50, reason: 'Active security advisory; admin can refine to specific LGAs.' },
      ],
      reason: 'Borno — heightened security across most LGAs.',
    },
    KN: { rateMultiplier: 0.85, reason: 'Kano metro — cheaper than SW baseline.' },
  },
};

// ─── Pure pricing helpers ───────────────────────────────────────────────────

/**
 * Cumulative weight surcharge — adds the full max of every tier the weight
 * passes through, plus the partial blocks in the active tier. Handling fee
 * is just the active tier's flat (not cumulative).
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
      handling     = tier.handlingFlatNgn;
    }
    prevUpper = tier.upToKg;
  }
  return { surcharge, handling };
}

/** Returns the time surcharge windows currently active. */
export function activeTimeSurcharges(card: RateCard, now: Date = new Date()): TimeSurchargeWindow[] {
  const hr  = now.getHours();
  const dow = now.getDay();
  const out: TimeSurchargeWindow[] = [];
  for (const win of Object.values(card.timeSurcharges)) {
    const dowOk = !win.daysOfWeek || win.daysOfWeek.includes(dow);
    if (!dowOk) continue;
    if (win.startHour == null || win.endHour == null) { out.push(win); continue; }
    const inWindow = win.startHour <= win.endHour
      ? hr >= win.startHour && hr < win.endHour
      : hr >= win.startHour || hr < win.endHour;     // wraps midnight
    if (inWindow) out.push(win);
  }
  return out;
}

/** Combined time-surcharge %, capped at 100%. */
function totalTimePct(card: RateCard, now: Date): { pct: number; labels: string[] } {
  const active = activeTimeSurcharges(card, now);
  return {
    pct:    Math.min(1, active.reduce((s, w) => s + w.pct, 0)),
    labels: active.map(w => w.label),
  };
}

/**
 * Resolve effective regional overrides for the given state, merging the
 * baseline ↘ zone override ↘ state override (state-level wins).
 */
export function resolveRegionalOverrides(
  card: RateCard,
  stateCode: StateCode | null,
): RegionalOverrides {
  if (!stateCode) return {};
  const zone   = getStateZone(stateCode);
  const fromZ  = zone ? card.zoneOverrides[zone]  ?? {} : {};
  const fromS  = card.stateOverrides[stateCode]   ?? {};
  return {
    ...fromZ,
    ...fromS,
    // Merge vehicle overrides instead of replacing — state can override
    // a single vehicle while inheriting the zone's other rates.
    vehicleOverrides: { ...(fromZ.vehicleOverrides ?? {}), ...(fromS.vehicleOverrides ?? {}) },
    // Same for fuel + restrictedSubZones (concat).
    fuelPrices:       { ...(fromZ.fuelPrices ?? {}),       ...(fromS.fuelPrices ?? {}) },
    restrictedSubZones: [
      ...(fromZ.restrictedSubZones ?? []),
      ...(fromS.restrictedSubZones ?? []),
    ],
  };
}

/** Apply rate-multiplier + per-vehicle overrides to a vehicle's base + perKm. */
function applyRegionalVehicle<T extends { id: string; base: number; perKm: number }>(
  v: T,
  ov: RegionalOverrides,
): { base: number; perKm: number } {
  const mult = ov.rateMultiplier ?? 1;
  const vehOv = ov.vehicleOverrides?.[v.id];
  return {
    base:  Math.round((vehOv?.base  ?? v.base)  * mult),
    perKm: Math.round((vehOv?.perKm ?? v.perKm) * mult),
  };
}

/**
 * State-aware zone surcharge. Replaces the old "long-distance %" with a
 * tier that knows whether you're staying in one state, crossing to a
 * neighbour, going across zones, or entering a restricted sub-zone.
 *
 * Returns 0% / 0 NGN when pickup or dropoff coords aren't provided.
 */
function zoneSurchargeFor(
  card: RateCard,
  distKm: number,
  pickupState: StateCode | null,
  dropoffState: StateCode | null,
): { pct: number; flat: number; labels: string[] } {
  const labels: string[] = [];
  let pct = 0;

  if (pickupState && dropoffState) {
    if (pickupState === dropoffState) {
      if (distKm > card.zone.intraStateLongHaulKm) {
        pct += card.zone.intraStateLongHaulPct;
        labels.push('intraStateLongHaul');
      }
    } else {
      const sameZone = getStateZone(pickupState) === getStateZone(dropoffState);
      if (!sameZone) {
        pct += card.zone.crossZonePct;
        labels.push('crossZone');
      } else if (areStatesAdjacent(pickupState, dropoffState)) {
        pct += card.zone.interStateAdjacentPct;
        labels.push('interStateAdjacent');
      } else {
        pct += card.zone.interStateDistantPct;
        labels.push('interStateDistant');
      }
    }
  } else if (distKm > card.zone.intraStateLongHaulKm) {
    // Coords missing — fall back to distance-based heuristic.
    pct += card.zone.intraStateLongHaulPct;
    labels.push('longHaul');
  }

  const flat = distKm > card.zone.overnightFeeKm ? card.zone.overnightFeeNgn : 0;
  if (flat > 0) labels.push('overnight');

  return { pct, flat, labels };
}

/** Cash-on-delivery handling fee. Returns 0 when COD is disabled or amount is 0. */
export function codHandlingFee(card: RateCard, codAmountNgn: number): number {
  if (!card.cod.enabled || codAmountNgn <= 0) return 0;
  const raw = card.cod.handlingFlatNgn + codAmountNgn * card.cod.handlingPct;
  return Math.min(card.cod.handlingCapNgn, Math.round(raw));
}

/** Dwell-fee (post-trip) — for trip-progress integration. */
export function dwellFee(card: RateCard, waitMinutes: number): number {
  const billable = Math.max(0, Math.min(card.dwell.capMinutes, waitMinutes) - card.dwell.freeMinutes);
  return billable * card.dwell.perMinuteNgn;
}

/** Cancellation fee by stage. */
export function cancellationFee(
  card: RateCard,
  stage: 'preAssign' | 'postAssign' | 'midRoute' | 'noShow',
): number {
  switch (stage) {
    case 'preAssign':  return card.cancellation.preAssignNgn;
    case 'postAssign': return card.cancellation.postAssignNgn;
    case 'midRoute':   return card.cancellation.midRouteFlatNgn;
    case 'noShow':     return card.cancellation.noShowFlatNgn;
  }
}

// ─── Fare calculators ──────────────────────────────────────────────────────

/** Coordinates pair — supplied by screens that have map context. */
export interface Coords { latitude: number; longitude: number }

export interface RideFareResult {
  base:              number;
  dist:              number;
  categorySurcharge: number;
  timeSurcharge:     number;
  zoneSurcharge:     number;
  zoneFlat:          number;
  service:           number;
  shareDiscount:     number;
  vat:               number;
  total:             number;
  vehicle:           RideVehicleRate;
  timeLabels:        string[];
  zoneLabels:        string[];
  /** Region context used for this fare — non-null when coords provided. */
  pickupState:       StateCode | null;
  dropoffState:      StateCode | null;
}

export interface PackageFareResult {
  base:              number;
  dist:              number;
  weight:            number;
  handling:          number;
  categorySurcharge: number;
  timeSurcharge:     number;
  zoneSurcharge:     number;
  zoneFlat:          number;
  perStopBonus:      number;
  codFee:            number;
  service:           number;
  vat:               number;
  total:             number;
  vehicle:           PackageVehicleRate;
  timeLabels:        string[];
  zoneLabels:        string[];
  pickupState:       StateCode | null;
  dropoffState:      StateCode | null;
}

/**
 * Ride fare = base + km×perKm + categorySurcharge + timeSurcharge + zoneSurcharge + overnight + service − shareDiscount + VAT
 *
 * Surcharges compound on the running subtotal (matches spec scenario E).
 * When pickup/dropoff coords are provided, base + perKm are adjusted by
 * the pickup region's rateMultiplier (and any per-vehicle override), and
 * the zone surcharge tier reflects actual state crossings.
 */
export function calcRideFare(
  card:      RateCard,
  vehicleId: string,
  distKm:    number,
  shared:    boolean,
  opts: {
    now?:           Date;
    pickupCoords?:  Coords | null;
    dropoffCoords?: Coords | null;
  } = {},
): RideFareResult {
  const v0       = card.ride.vehicles.find(x => x.id === vehicleId) ?? card.ride.vehicles[0];
  const safeKm   = Math.max(0, distKm || 0);

  const pickupState  = opts.pickupCoords  ? detectStateFromCoords(opts.pickupCoords.latitude,  opts.pickupCoords.longitude)  : null;
  const dropoffState = opts.dropoffCoords ? detectStateFromCoords(opts.dropoffCoords.latitude, opts.dropoffCoords.longitude) : null;
  const region       = resolveRegionalOverrides(card, pickupState);

  const adjusted = applyRegionalVehicle(v0, region);
  const base     = adjusted.base;
  const dist     = Math.round(safeKm * adjusted.perKm);
  let   running  = base + dist;

  const categorySurcharge = 0;   // ride flow has no category concept today
  running += categorySurcharge;

  const time = totalTimePct(card, opts.now ?? new Date());
  const timeSurcharge = Math.round(running * time.pct);
  running += timeSurcharge;

  const zone = zoneSurchargeFor(card, safeKm, pickupState, dropoffState);
  const zoneSurcharge = Math.round(running * zone.pct);
  running += zoneSurcharge + zone.flat;

  const serviceFeePct = region.serviceFeeRideOverride ?? card.ride.serviceFeePct;
  const service       = Math.round(running * serviceFeePct);
  running            += service;

  const shareDiscount = shared && v0.shareable ? Math.round(running * card.ride.shareDiscountPct) : 0;
  running            -= shareDiscount;

  const vat   = Math.round(running * card.vatPct);
  const total = running + vat;

  return {
    base, dist, categorySurcharge,
    timeSurcharge, zoneSurcharge, zoneFlat: zone.flat,
    service, shareDiscount, vat, total,
    vehicle: v0,
    timeLabels: time.labels,
    zoneLabels: zone.labels,
    pickupState, dropoffState,
  };
}

/**
 * Package fare = base + km×perKm + weight + handling + categorySurcharge + timeSurcharge + zoneSurcharge + overnight + perStopBonus + codFee + service + VAT
 */
export function calcPackageFare(
  card:      RateCard,
  vehicleId: string,
  distKm:    number,
  kg:        number,
  opts: {
    now?:           Date;
    categoryId?:    string | null;
    codAmountNgn?:  number;
    extraStops?:    number;
    pickupCoords?:  Coords | null;
    dropoffCoords?: Coords | null;
  } = {},
): PackageFareResult {
  const v0       = card.package.vehicles.find(x => x.id === vehicleId) ?? card.package.vehicles[0];
  const safeKm   = Math.max(0, distKm || 0);
  const safeKg   = Math.max(0, kg || 0);

  const pickupState  = opts.pickupCoords  ? detectStateFromCoords(opts.pickupCoords.latitude,  opts.pickupCoords.longitude)  : null;
  const dropoffState = opts.dropoffCoords ? detectStateFromCoords(opts.dropoffCoords.latitude, opts.dropoffCoords.longitude) : null;
  const region       = resolveRegionalOverrides(card, pickupState);

  const adjusted = applyRegionalVehicle(v0, region);
  const base     = adjusted.base;
  const dist     = Math.round(safeKm * adjusted.perKm);
  const { surcharge: weight, handling } = weightSurchargeNgn(card, safeKg);
  let running    = base + dist + weight + handling;

  const cat = opts.categoryId ? card.categories[opts.categoryId] : undefined;
  const categorySurcharge = cat ? Math.round(running * cat.pct) : 0;
  running += categorySurcharge;

  const time = totalTimePct(card, opts.now ?? new Date());
  const timeSurcharge = Math.round(running * time.pct);
  running += timeSurcharge;

  const zone = zoneSurchargeFor(card, safeKm, pickupState, dropoffState);
  const zoneSurcharge = Math.round(running * zone.pct);
  running += zoneSurcharge + zone.flat;

  const perStopBonus = Math.max(0, opts.extraStops ?? 0) * card.perStopBonus;
  running += perStopBonus;

  const codFee = codHandlingFee(card, opts.codAmountNgn ?? 0);
  running += codFee;

  const serviceFeePct = region.serviceFeePackageOverride ?? card.package.serviceFeePct;
  const service       = Math.round(running * serviceFeePct);
  running            += service;

  const vat   = Math.round(running * card.vatPct);
  const total = running + vat;

  return {
    base, dist, weight, handling, categorySurcharge,
    timeSurcharge, zoneSurcharge, zoneFlat: zone.flat,
    perStopBonus, codFee, service, vat, total,
    vehicle: v0,
    timeLabels: time.labels,
    zoneLabels: zone.labels,
    pickupState, dropoffState,
  };
}

// Convenient view of just the vehicle lists for screens that don't need the whole card.
export const RIDE_VEHICLES    = DEFAULT_RATE_CARD.ride.vehicles;
export const PACKAGE_VEHICLES = DEFAULT_RATE_CARD.package.vehicles;
