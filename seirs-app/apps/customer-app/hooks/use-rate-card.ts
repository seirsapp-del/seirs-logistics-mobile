/**
 * Live rate-card sync — fetches the active RateCard from the backend on
 * app launch, caches it in AsyncStorage (so first launch without internet
 * still has *something* sensible), and refreshes every 5 minutes.
 *
 * Customer-app screens never call this directly. They keep using the
 * curried calcRideFare / calcPackageFare exports, which read the cached
 * card via getActiveRateCard() at call time. When admin publishes a new
 * card, the next refresh pulls it and every subsequent fare calc reflects
 * the change — no app restart needed.
 *
 * SHAPE GAP: backend RateCard stores vehicles as a dict with combined
 * customer+driver fields (vehicleRates[id].baseFareCustomer etc.). The
 * customer-app's local RateCard has them as ride.vehicles[] / package.
 * vehicles[] arrays. Until we add the translation layer, we only sync
 * the fields that ARE the same shape on both ends:
 *   - regions (zoneOverrides, stateOverrides, restrictedSubZones)
 *   - zoneSurcharges (new v2 tier — admin can edit, customer respects)
 *   - vatPct, fuelPrices, dwell, cancellation, returnTrip, cod
 * Vehicle base + perKm + categories + discounts stay bundled until
 * the shape transformation is in (tracked as follow-up).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { configApi } from '@/services/api';
import { DEFAULT_RATE_CARD, type RateCard } from '@/constants/rateCard';

const CACHE_KEY        = 'seirs.rateCard.active';
const CACHE_VERSION    = 'v1';   // bump if RateCard shape changes incompatibly
const REFRESH_INTERVAL = 5 * 60 * 1000;   // 5 min — matches backend cache TTL

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
function mergeFromBackend(remote: any): RateCard {
  if (!remote) return DEFAULT_RATE_CARD;

  // Backend nests these under `regions`; customer-app schema has them
  // flat on the RateCard. Translate so admin edits in the dashboard
  // flow through without restructuring the local schema.
  const backendRegions = remote.regions ?? {};
  const d = DEFAULT_RATE_CARD;

  // Tiny helper — picks remote value when present and numeric, else falls
  // back to the default. Keeps mergers readable below.
  const num = (v: any, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const bool = (v: any, fallback: boolean) =>
    typeof v === 'boolean' ? v : fallback;

  return {
    ...d,
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
    cod: remote.cod ? {
      enabled:         bool(remote.cod.enabled,         d.cod.enabled),
      handlingFlatNgn: num(remote.cod.handlingFlatNgn,  d.cod.handlingFlatNgn),
      handlingPct:     num(remote.cod.handlingPct,      d.cod.handlingPct),
      handlingCapNgn:  num(remote.cod.handlingCapNgn,   d.cod.handlingCapNgn),
    } : d.cod,
    insurance: remote.insurance ? {
      enabled:                   bool(remote.insurance.enabled,                   d.insurance.enabled),
      premiumPct:                num(remote.insurance.premiumPct,                 d.insurance.premiumPct),
      minPremiumNgn:             num(remote.insurance.minPremiumNgn,              d.insurance.minPremiumNgn),
      declaredValueThresholdNgn: num(remote.insurance.declaredValueThresholdNgn,  d.insurance.declaredValueThresholdNgn),
      maxCoverageNgn:            num(remote.insurance.maxCoverageNgn,             d.insurance.maxCoverageNgn),
    } : d.insurance,
    discounts: remote.discounts ? {
      bulkUploadOffPct:           num(remote.discounts.bulkUploadOffPct,           d.discounts.bulkUploadOffPct),
      bulkUploadMinPackages:      num(remote.discounts.bulkUploadMinPackages,      d.discounts.bulkUploadMinPackages),
      recurringOffPct:            num(remote.discounts.recurringOffPct,            d.discounts.recurringOffPct),
      welcomeOffPct:              num(remote.discounts.welcomeOffPct,              d.discounts.welcomeOffPct),
      welcomeMaxNgn:              num(remote.discounts.welcomeMaxNgn,              d.discounts.welcomeMaxNgn),
      loyaltyPointValueNgn:       num(remote.discounts.loyaltyPointValueNgn,       d.discounts.loyaltyPointValueNgn),
      loyaltyMaxPointsPerBooking: num(remote.discounts.loyaltyMaxPointsPerBooking, d.discounts.loyaltyMaxPointsPerBooking),
      maxTotalPct:                num(remote.discounts.maxTotalPct,                d.discounts.maxTotalPct),
    } : d.discounts,
    returnTrip: remote.returnTrip ? {
      callAttempts:    num(remote.returnTrip.callAttempts,    d.returnTrip.callAttempts),
      callIntervalMin: num(remote.returnTrip.callIntervalMin, d.returnTrip.callIntervalMin),
      returnFlatNgn:   num(remote.returnTrip.returnFlatNgn,   d.returnTrip.returnFlatNgn),
      storageFlatNgn:  num(remote.returnTrip.storageFlatNgn,  d.returnTrip.storageFlatNgn),
    } : d.returnTrip,
    perStopBonus:    num(remote.perStopBonus, d.perStopBonus),
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
  } catch { /* ignore — fall back to DEFAULT_RATE_CARD */ }
}

async function fetchAndCache(force = false): Promise<void> {
  try {
    const remote = await configApi.rateCard(force);
    const merged = mergeFromBackend(remote);
    _activeCard = merged;
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ cacheVersion: CACHE_VERSION, card: merged }))
      .catch(() => { /* cache write is best-effort */ });
  } catch {
    // Backend unreachable — keep using cached or DEFAULT_RATE_CARD.
  }
}

/**
 * Call once in the app root (RootLayout). Loads the AsyncStorage cache
 * synchronously-ish, fetches fresh from backend, and starts a 5-min
 * refresh interval. Safe to render before this resolves — the calc
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

/** Manual refresh — for screens to call after admin publish notifications. */
export async function refreshRateCard(): Promise<void> {
  await fetchAndCache(true);
}
