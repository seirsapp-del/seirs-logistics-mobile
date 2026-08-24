/**
 * Live rate-card sync: fetches the active RateCard from the backend on
 * app launch, caches it in AsyncStorage (so first launch without internet
 * still has *something* sensible), and refreshes every 5 minutes.
 *
 * Customer-app screens never call this directly. They keep using the
 * curried calcRideFare / calcPackageFare exports, which read the cached
 * card via getActiveRateCard() at call time. When admin publishes a new
 * card, the next refresh pulls it and every subsequent fare calc reflects
 * the change, no app restart needed.
 *
 * SHAPE GAP: backend RateCard stores vehicles as a dict with combined
 * customer+driver fields (vehicleRates[id].baseFareCustomer etc.). The
 * customer-app's local RateCard has them as ride.vehicles[] / package.
 * vehicles[] arrays. Until we add the translation layer, we only sync
 * the fields that ARE the same shape on both ends:
 *   - regions (zoneOverrides, stateOverrides, restrictedSubZones)
 *   - zoneSurcharges (new v2 tier: admin can edit, customer respects)
 *   - vatPct, fuelPrices, dwell, cancellation, returnTrip, cod
 * Vehicle base + perKm + categories + discounts stay bundled until
 * the shape transformation is in (tracked as follow-up).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { configApi } from '@/services/api';
import { DEFAULT_RATE_CARD, type RateCard } from '@/constants/rateCard';

const CACHE_KEY        = 'seirs.rateCard.active';
// v2: vehicle rates, category surcharges, dwell, cancellation, discounts
// and the per-stop bonus now genuinely merge from the backend. A card
// cached under v1 holds pre-merge numbers (a motorcycle base of 700
// where the card says 300), so it must be discarded rather than shown.
// v3: category surcharges were cached as whole-number percents (30)
// where every consumer expects a fraction (0.30), so a cached v2 card
// prices a frozen-food parcel at 100x. Discard rather than show: an
// install that already cached v2 would keep overcharging after the
// code fix shipped.
const CACHE_VERSION    = 'v3';
const REFRESH_INTERVAL = 5 * 60 * 1000;   // 5 min, matches backend cache TTL

// Module-level: every calc function in rateCard.ts reads from this. Starts
// as DEFAULT_RATE_CARD so the app prices correctly even before the first
// backend fetch resolves.
let _activeCard: RateCard = DEFAULT_RATE_CARD;

export function getActiveRateCard(): RateCard {
  return _activeCard;
}

/**
 * Merge backend-fetched fields into the local DEFAULT_RATE_CARD. Each
 * sub-object is merged defensively so the customer-app keeps any field
 * the backend didn't populate (rather than overwriting with undefined).
 *
 * Vehicle base + perKm + categories stay bundled until the shape
 * translation layer is in (backend stores them as dict with combined
 * customer+driver fields). Everything else is admin-editable from the
 * dashboard and propagates here on the next 5-min refresh.
 */

/**
 * Vehicle ids differ on each side, which is the reason this translation
 * was never written and vehicle pricing stayed bundled in the app.
 *
 * The app names vehicles the way a Lagos passenger does; the backend
 * uses the canonical taxonomy. Left of the arrow is a local id, right is
 * the rate card key.
 *
 * `danfo` has no backend counterpart: it is a fourteen-seater passenger
 * bus and the card's `van` is a cargo van with a payload rating, so
 * mapping them would price passengers off a freight rate. It keeps its
 * bundled values until the card carries a passenger-bus entry.
 */
const RIDE_VEHICLE_MAP: Record<string, string> = {
  okada: 'motorcycle',
  keke:  'tricycle',
  car:   'car',
};

const PACKAGE_VEHICLE_MAP: Record<string, string> = {
  bicycle:    'bicycle',
  motorcycle: 'motorcycle',
  keke:       'tricycle',
  car:        'car',
  van:        'van',
  truck_sm:   'truck_small',
  truck_lg:   'truck_large',
};

/**
 * Overlay the published customer rates onto a bundled vehicle list.
 *
 * Only the PRICING fields move. Labels, icons, accent colours, ETAs and
 * feature lists are presentation and the backend knows nothing about
 * them, so they stay exactly as shipped. A vehicle with no counterpart
 * on the card is returned untouched rather than zeroed.
 */
function mergeVehicles<T extends { id: string }>(
  local: readonly T[],
  remoteRates: any,
  idMap: Record<string, string>,
  num: (v: any, fallback: number) => number,
  isPackage: boolean,
): readonly T[] {
  if (!remoteRates) return local;
  return local.map((v) => {
    const r = remoteRates[idMap[v.id] ?? ''];
    if (!r) return v;
    const merged: any = {
      ...v,
      base:       num(r.baseFareCustomer,    (v as any).base),
      perKm:      num(r.labourPerKmCustomer, (v as any).perKm),
      kmPerLitre: num(r.kmPerLitre,          (v as any).kmPerLitre),
    };
    if (typeof r.fuelType === 'string') merged.fuelType = r.fuelType;
    // Bicycles carry Infinity locally, which no JSON payload can express.
    if (!Number.isFinite(merged.kmPerLitre)) merged.kmPerLitre = (v as any).kmPerLitre;
    if (isPackage && Number.isFinite(Number(r.maxPayloadKg))) {
      merged.maxKg = Number(r.maxPayloadKg);
    }
    return merged as T;
  });
}

function mergeFromBackend(remote: any): RateCard {
  if (!remote) return DEFAULT_RATE_CARD;

  // Backend nests these under `regions`; customer-app schema has them
  // flat on the RateCard. Translate so admin edits in the dashboard
  // flow through without restructuring the local schema.
  const backendRegions = remote.regions ?? {};
  const d = DEFAULT_RATE_CARD;

  // Tiny helper: picks remote value when present and numeric, else falls
  // back to the default. Keeps mergers readable below.
  const num = (v: any, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const bool = (v: any, fallback: boolean) =>
    typeof v === 'boolean' ? v : fallback;

  return {
    ...d,
    /**
     * Vehicle rates and category surcharges used to be excluded here,
     * so the base fare, the per-km rate and every category surcharge
     * stayed frozen at whatever shipped in the binary. An admin could
     * change any of them, watch the new rate card publish, and this app
     * would keep quoting the old numbers (audit 2026-08-18). They were
     * not even the same numbers: the card put a motorcycle base at
     * NGN 300 while the app charged NGN 700.
     */
    ride: {
      ...d.ride,
      vehicles: mergeVehicles(d.ride.vehicles, remote.vehicleRates, RIDE_VEHICLE_MAP, num, false),
    },
    package: {
      ...d.package,
      vehicles: mergeVehicles(d.package.vehicles, remote.vehicleRates, PACKAGE_VEHICLE_MAP, num, true),
    },
    version:       remote.version ? String(remote.version) : d.version,
    effectiveFrom: remote.activatedAt ? String(remote.activatedAt) : d.effectiveFrom,
    vatPct:        num(remote.vatRate, d.vatPct),
    fuelPrices: remote.fuelPrices
      ? {
          petrolNgn: num(remote.fuelPrices.petrolPerLitreNgn, d.fuelPrices.petrolNgn),
          dieselNgn: num(remote.fuelPrices.dieselPerLitreNgn, d.fuelPrices.dieselNgn),
        }
      : d.fuelPrices,
    zone: {
      ...d.zone,
      ...(remote.zoneSurcharges ?? {}),
    },
    /**
     * Waiting-time rules.
     *
     * This read `remote.dwell`, which the backend has never sent: the
     * card calls it `stopAndDwell` and names every field differently.
     * The branch therefore always fell through to the local defaults, so
     * editing waiting-time rates in the dashboard changed nothing in
     * this app and nobody could tell, because the local defaults happened
     * to match the seed (audit 2026-08-18).
     */
    dwell: remote.stopAndDwell ? {
      freeMinutes:        num(remote.stopAndDwell.freeDwellThresholdMinutes, d.dwell.freeMinutes),
      perMinuteNgn:       num(remote.stopAndDwell.perDwellMinuteCustomer,    d.dwell.perMinuteNgn),
      capMinutes:         num(remote.stopAndDwell.dwellCapMinutes,           d.dwell.capMinutes),
      driverPerMinuteNgn: num(remote.stopAndDwell.perDwellMinuteDriver,      d.dwell.driverPerMinuteNgn),
    } : d.dwell,
    /**
     * Cancellation and no-show. Same problem as dwell above: this read
     * `remote.cancellation`, which does not exist. The backend keeps
     * these under `feeRules` with different names, so every admin edit
     * to a cancellation fee stopped at the API and this app carried on
     * charging its bundled defaults.
     */
    cancellation: remote.feeRules ? {
      preAssignNgn:    num(remote.feeRules.cancelPreAssignCustomer,  d.cancellation.preAssignNgn),
      postAssignNgn:   num(remote.feeRules.cancelPostAssignCustomer, d.cancellation.postAssignNgn),
      midRouteFlatNgn: num(remote.feeRules.returnTripBaseFee,        d.cancellation.midRouteFlatNgn),
      noShowFlatNgn:   num(remote.feeRules.senderNoShowFlat,         d.cancellation.noShowFlatNgn),
      noShowWaitMin:   num(remote.feeRules.senderNoShowWaitMinutes,  d.cancellation.noShowWaitMin),
    } : d.cancellation,
    /**
     * Cash on delivery is not a SEIRS product (founder, twice: 2026-08-13
     * and again 2026-08-18). It is pinned off here rather than merged,
     * so no rate card can ever switch it back on by accident.
     */
    cod: { ...d.cod, enabled: false },
    /**
     * Goods-in-transit cover, which now lives on the rate card and is
     * editable from the dashboard. It ships disabled with every value at
     * zero until SEIRS has an underwriter, so nothing is charged and
     * nothing is promised.
     */
    insurance: remote.insurance ? {
      enabled:                   bool(remote.insurance.enabled,                  d.insurance.enabled),
      /**
       * The app multiplies declared value by this directly, so it is a
       * FRACTION: 0.02 means 2%. The dashboard field is labelled as a
       * percentage, because that is how an underwriter quotes. Anything
       * above 1 is therefore a percentage and is converted, so typing
       * "2" for two percent cannot become a 200% premium.
       */
      premiumPct:                (() => {
        const raw = num(remote.insurance.premiumPct, d.insurance.premiumPct);
        return raw > 1 ? raw / 100 : raw;
      })(),
      minPremiumNgn:             num(remote.insurance.minPremiumNgn,             d.insurance.minPremiumNgn),
      declaredValueThresholdNgn: num(remote.insurance.declaredValueThresholdNgn, d.insurance.declaredValueThresholdNgn),
      maxCoverageNgn:            num(remote.insurance.maxCoverageNgn,            d.insurance.maxCoverageNgn),
    } : d.insurance,
    /**
     * Discounts. The backend spells these ...OffPercent and the app read
     * ...OffPct, so none of them ever merged: a welcome discount changed
     * in the dashboard never reached a customer.
     */
    discounts: remote.discounts ? {
      bulkUploadOffPct:           num(remote.discounts.bulkUploadOffPercent,       d.discounts.bulkUploadOffPct),
      bulkUploadMinPackages:      num(remote.discounts.bulkUploadMinPackages,      d.discounts.bulkUploadMinPackages),
      recurringOffPct:            num(remote.discounts.recurringOffPercent,        d.discounts.recurringOffPct),
      welcomeOffPct:              num(remote.discounts.welcomeOffPercent,          d.discounts.welcomeOffPct),
      welcomeMaxNgn:              num(remote.discounts.welcomeMaxNgn,              d.discounts.welcomeMaxNgn),
      loyaltyPointValueNgn:       num(remote.discounts.loyaltyPointValueNgn,       d.discounts.loyaltyPointValueNgn),
      loyaltyMaxPointsPerBooking: num(remote.discounts.loyaltyMaxPointsPerBooking, d.discounts.loyaltyMaxPointsPerBooking),
      maxTotalPct:                num(remote.discounts.maxTotalPct,                d.discounts.maxTotalPct),
    } : d.discounts,
    /**
     * Return-trip rules sit under feeRules on the card. The interval and
     * the storage flat have no counterpart there yet, so they keep their
     * bundled values rather than being zeroed.
     */
    returnTrip: remote.feeRules ? {
      callAttempts:    num(remote.feeRules.returnCallAttempts, d.returnTrip.callAttempts),
      callIntervalMin: d.returnTrip.callIntervalMin,
      returnFlatNgn:   num(remote.feeRules.returnTripBaseFee,  d.returnTrip.returnFlatNgn),
      storageFlatNgn:  d.returnTrip.storageFlatNgn,
    } : d.returnTrip,
    // Lives under stopAndDwell on the card, not at the top level.
    perStopBonus:    num(remote.stopAndDwell?.perStopBonusCustomer, d.perStopBonus),
    zoneOverrides:   backendRegions.zoneOverrides  ?? d.zoneOverrides,
    stateOverrides:  backendRegions.stateOverrides ?? d.stateOverrides,
  };
}

async function loadCached(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.cacheVersion !== CACHE_VERSION) return;   // stale shape
    _activeCard = parsed.card;
  } catch { /* ignore: fall back to DEFAULT_RATE_CARD */ }
}

/**
 * Category ids differ on the two sides for one entry.
 * Everything else lines up by name.
 */
const CATEGORY_MAP: Record<string, string> = { agricultural: 'farm_produce' };

/**
 * Overlay published category surcharges onto the bundled ones.
 *
 * Only the percentage moves. The driver share and the forbidden-vehicle
 * list stay bundled deliberately: those are safety hard-stops, and a
 * safety rule that can be switched off remotely is not a safety rule.
 */
function mergeCategories(local: any, catalog: any[]): any {
  if (!Array.isArray(catalog) || catalog.length === 0) return local;
  const byCode = new Map(catalog.map((c: any) => [c.code, c]));
  const out: any = { ...local };
  for (const key of Object.keys(local)) {
    const remote = byCode.get(CATEGORY_MAP[key] ?? key);
    if (!remote) continue;
    /**
     * The API sends a WHOLE-NUMBER percent (food_cold is 30.00 meaning
     * 30%). The bundled card, and every consumer of `pct` in
     * rateCard.ts, uses a FRACTION (0.30). Assigning the API value raw
     * multiplied the running subtotal by 30 instead of by 0.30, so a
     * frozen-food parcel quoted at NGN 3,921 on the vehicle step billed
     * NGN 131,242 on the fare step. Categories at 0% were unaffected,
     * which is why this survived: documents and standard parcels, the
     * common cases, priced correctly.
     */
    const pct = Number(remote.surchargePercent) / 100;
    if (!Number.isFinite(pct)) continue;
    out[key] = { ...local[key], pct };
  }
  return out;
}

async function fetchAndCache(force = false): Promise<void> {
  try {
    /**
     * The catalog is fetched alongside the card because category
     * surcharges live there, not on the card. This app never asked for
     * it at all, so every surcharge an admin set (fragile at 20%, for
     * one) stopped at the API (audit 2026-08-18).
     *
     * Its failure is tolerated on purpose: a card without surcharges
     * still prices, a missing card does not.
     */
    const [remote, catalog] = await Promise.all([
      configApi.rateCard(force),
      configApi.serviceCatalog(force).catch(() => [] as any[]),
    ]);
    const base = mergeFromBackend(remote);
    const merged = { ...base, categories: mergeCategories(base.categories, catalog as any[]) };
    _activeCard = merged;
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ cacheVersion: CACHE_VERSION, card: merged }))
      .catch(() => { /* cache write is best-effort */ });
  } catch {
    // Backend unreachable: keep using cached or DEFAULT_RATE_CARD.
  }
}

/**
 * Call once in the app root (RootLayout). Loads the AsyncStorage cache
 * synchronously-ish, fetches fresh from backend, and starts a 5-min
 * refresh interval. Safe to render before this resolves, the calc
 * functions fall back to DEFAULT_RATE_CARD.
 */
export function useRateCardSync(): void {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadCached();
      if (cancelled) return;
      await fetchAndCache();
    })();

    const interval = setInterval(() => fetchAndCache(false), REFRESH_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);
}

/** Manual refresh: for screens to call after admin publish notifications. */
export async function refreshRateCard(): Promise<void> {
  await fetchAndCache(true);
}
