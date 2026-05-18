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
 * Merge backend-fetched fields into the local DEFAULT_RATE_CARD. Only the
 * fields where backend + customer-app schemas already match are taken
 * from backend; the rest fall back to DEFAULT to avoid shape mismatches.
 *
 * Defensive — backend could return null fields if admin hasn't filled
 * them in for an env, so each pull checks before overwriting.
 */
function mergeFromBackend(remote: any): RateCard {
  if (!remote) return DEFAULT_RATE_CARD;

  // Backend nests these under `regions`; customer-app schema has them
  // flat on the RateCard. Translate so admin edits in the dashboard
  // flow through without restructuring the local schema.
  const backendRegions = remote.regions ?? {};

  return {
    ...DEFAULT_RATE_CARD,
    version:       remote.version ? String(remote.version) : DEFAULT_RATE_CARD.version,
    effectiveFrom: remote.activatedAt ? String(remote.activatedAt) : DEFAULT_RATE_CARD.effectiveFrom,
    vatPct:        typeof remote.vatRate === 'number' ? Number(remote.vatRate) : DEFAULT_RATE_CARD.vatPct,
    fuelPrices: remote.fuelPrices
      ? {
          petrolNgn: Number(remote.fuelPrices.petrolPerLitreNgn ?? DEFAULT_RATE_CARD.fuelPrices.petrolNgn),
          dieselNgn: Number(remote.fuelPrices.dieselPerLitreNgn ?? DEFAULT_RATE_CARD.fuelPrices.dieselNgn),
        }
      : DEFAULT_RATE_CARD.fuelPrices,
    zone: {
      ...DEFAULT_RATE_CARD.zone,
      ...(remote.zoneSurcharges ?? {}),
    },
    zoneOverrides:  backendRegions.zoneOverrides  ?? DEFAULT_RATE_CARD.zoneOverrides,
    stateOverrides: backendRegions.stateOverrides ?? DEFAULT_RATE_CARD.stateOverrides,
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
