import { useEffect, useState } from 'react';
import { feesApi } from '@/services/api';

/**
 * How many legs a courier may hold at once.
 *
 * The number 4 was written out by hand in two places: the home screen's
 * pool badge rendered `{activeJobs.length}/4` and multi-leg.tsx computed
 * `4 - slotsUsed` and printed "/ 4 legs". Two copies of a policy figure
 * drift the first time anyone changes one of them, and neither copy was
 * admin-tunable, which the platform requires of every policy knob
 * (2026-08-23 sweep, D-2.4).
 *
 * This is the single client-side definition, and it prefers the Fee
 * Catalogue so an admin moving the cap moves what the driver sees. The
 * key is not seeded yet, so today every call falls back to the code
 * value and the screens behave exactly as before.
 *
 * STILL OWED BY THE BACKEND, and this hook cannot do it from here:
 * pooling.service.ts holds its own `const MAX_ACTIVE_LEGS = 4`, which is
 * the copy that actually enforces the cap. Until that reads the same
 * catalogue row, an admin editing the row would change the label a
 * driver reads without changing the rule the dispatcher applies, which
 * is worse than the hardcode. Seed `driver_max_active_legs` and point
 * pooling.service.ts at it in the same change.
 */
export const POOL_CAP_FALLBACK = 4;
export const POOL_CAP_FEE_KEY  = 'driver_max_active_legs';

export function usePoolCap(): number {
  const [cap, setCap] = useState<number>(POOL_CAP_FALLBACK);

  useEffect(() => {
    let alive = true;
    feesApi.get(POOL_CAP_FEE_KEY)
      .then((r: any) => {
        const n = Number(r?.value);
        // A zero or negative cap would render "3/0 legs" and claim the
        // driver is over capacity, so an unusable value keeps the code
        // fallback rather than being displayed.
        if (alive && Number.isFinite(n) && n >= 1) setCap(Math.floor(n));
      })
      .catch(() => { /* key not seeded yet: the fallback is correct */ });
    return () => { alive = false; };
  }, []);

  return cap;
}
