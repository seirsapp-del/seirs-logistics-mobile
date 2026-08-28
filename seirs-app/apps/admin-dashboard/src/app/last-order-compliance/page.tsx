'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { MoonStar, AlertCircle, TrendingUp, TrendingDown, Star, RefreshCw } from 'lucide-react';

/**
 * Which riders are turning work down.
 *
 * Two things needed fixing. A failed request called setDrivers([]) and
 * the table then read "No drivers yet", so an outage looked like an
 * empty roster on a compliance screen. And the board was sorted by
 * whatever order the server returned, when the only reason to open it
 * is to find the riders at the bottom, so it now leads with the worst
 * acceptance rate.
 *
 * The "Currently winding down" tile is gone. It counted rows with a
 * `lastOrderActiveAt` field that this endpoint has never returned, so
 * it was structurally always zero: a permanent green number that meant
 * nothing. Wiring it needs the API to send the flag.
 */

interface DriverRow {
  id:                   string;
  name?:                string;
  user?:                { name?: string };
  vehicleType?:         string | null;
  rating?:              number | null;
  isOnline?:            boolean;
  offersToday?:         number;
  acceptedToday?:       number;
  todayAcceptanceRate?: number | null;
  lastDeliveryAt?:      string | null;
}

/** The words riders actually use for these machines. */
const VEHICLE_WORDS: Record<string, string> = {
  bicycle:     'Bicycle',
  motorcycle:  'Okada',
  tricycle:    'Keke',
  car:         'Car',
  van:         'Van',
  truck_small: 'Small truck',
  truck_large: 'Large truck',
};

// Code fallback only. The live number comes from the Fee Catalogue so
// the founder can move it without a deploy (admin-tunable-everything).
const ACCEPTANCE_THRESHOLD_FALLBACK = 80;
const ACCEPTANCE_THRESHOLD_FEE_KEY  = 'last_order_min_acceptance_pct';

export default function LastOrderCompliancePage() {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [threshold, setThreshold] = useState(ACCEPTANCE_THRESHOLD_FALLBACK);
  const [worstFirst, setWorstFirst] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    adminApi.driverCompliance()
      .then(res => setDrivers(Array.isArray(res?.drivers) ? res.drivers : []))
      // A failure used to empty the list silently, and an empty
      // compliance board reads as good news. It is not, if it is a lie.
      .catch((e: any) => setError(e?.message ?? 'The rider figures could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // A missing fee row, or a role without fee access, keeps the fallback.
  useEffect(() => {
    let alive = true;
    adminApi.fees.get(ACCEPTANCE_THRESHOLD_FEE_KEY)
      .then((row: any) => {
        const n = Number(row?.value);
        if (alive && Number.isFinite(n) && n > 0) setThreshold(n);
      })
      .catch(() => { /* code fallback stands */ });
    return () => { alive = false; };
  }, []);

  const belowThreshold = drivers.filter(d =>
    d.todayAcceptanceRate != null && d.todayAcceptanceRate < threshold,
  );
  const noOffersYet = drivers.filter(d => d.todayAcceptanceRate == null).length;

  /**
   * Sorted worst-first by default. The reason anybody opens this page is
   * to find the riders at the bottom, and they were wherever the server
   * happened to put them. Riders with no offers yet sink to the bottom:
   * they are not a problem, they are simply unmeasured.
   */
  const sorted = useMemo(() => {
    const copy = [...drivers];
    copy.sort((a, b) => {
      const ra = a.todayAcceptanceRate;
      const rb = b.todayAcceptanceRate;
      if (ra == null && rb == null) return 0;
      if (ra == null) return 1;
      if (rb == null) return -1;
      return worstFirst ? ra - rb : rb - ra;
    });
    return copy;
  }, [drivers, worstFirst]);

  return (
    <div className="p-8">
      <PageIntro
        title="Last-Order Compliance"
        purpose="See which riders are turning down the jobs dispatch sends them today, so somebody can call them before the board runs short."
        storageKey="last-order-compliance"
        help={
          <>
            <p><strong>Today&apos;s acceptance</strong> is jobs taken out of jobs offered, since midnight. It resets every day.</p>
            <p>The target is {threshold}%, set in the Fee Catalogue. It is advisory: nothing on this page or in the rider app blocks anybody for missing it.</p>
            <p>A dash means dispatch has not offered that rider anything yet today, which is not the same as refusing work.</p>
            <p>Nothing here changes anything. To act on a rider, open their profile.</p>
          </>
        }
        actions={
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={load} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Summary cards. "Currently winding down" was removed: it counted
          a field this endpoint does not send, so it was always zero. */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <SummaryCard label="Riders on the platform"        value={drivers.length}        accent="#3A7BD5" />
        <SummaryCard label={`Below ${threshold}% today`}   value={belowThreshold.length} accent="#DC2626" />
        <SummaryCard label="Not offered anything yet"      value={noOffersYet}           accent="#9CA3AF" />
      </div>

      {/* Rates are null until a driver has received at least one job
          ping today: honest dashes beat invented 100%s. */}
      {!loading && !error && drivers.length > 0 && drivers.every(d => d.todayAcceptanceRate == null) && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          <AlertCircle size={16} />
          <span>
            Dispatch has not offered anybody a job yet today, so every rate is a dash. They fill in through the day.
          </span>
        </div>
      )}

      {/* Driver table */}
      <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
        <div className="grid grid-cols-12 items-center gap-4 border-b border-[#E5E7EB] bg-gray-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-gray-500">
          <div className="col-span-4">Rider</div>
          <div className="col-span-2">Vehicle</div>
          <div className="col-span-2 text-right">Rating</div>
          <div className="col-span-2 text-right">
            {/* The column people triage on, so it sorts. */}
            <button
              onClick={() => setWorstFirst(w => !w)}
              className="uppercase tracking-wide hover:text-[#0F2B4C]"
              title={worstFirst ? 'Currently worst first. Click for best first.' : 'Currently best first. Click for worst first.'}
            >
              Accepted today {worstFirst ? '(worst first)' : '(best first)'}
            </button>
          </div>
          <div className="col-span-2 text-right">Right now</div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading the riders</div>
        ) : error ? (
          <EmptyState
            icon={<AlertCircle size={20} />}
            title="The rider figures could not be loaded"
            body="This is a connection or permission problem. It does not mean every rider is behaving."
            action={{ label: 'Try again', onClick: load }}
          />
        ) : drivers.length === 0 ? (
          <EmptyState
            icon={<MoonStar size={20} />}
            title="No riders on the platform yet"
            body="Once riders are approved they appear here with their acceptance for the day."
            action={{ label: 'Open the rider queue', href: '/kyc' }}
          />
        ) : (
          sorted.map(d => {
            const rate  = d.todayAcceptanceRate;
            const meets = rate == null || rate >= threshold;
            const status = d.isOnline
              ? { label: 'Online', color: '#3A7BD5' }
              : { label: 'Offline', color: '#9CA3AF' };
            return (
              <div key={d.id} className="grid grid-cols-12 items-center gap-4 border-b border-[#F3F4F6] px-4 py-3">
                <div className="col-span-4 min-w-0">
                  {/* The row was a dead end: no way to reach the person
                      it is complaining about. */}
                  <Link href={`/drivers/${d.id}`} className="block truncate text-sm font-semibold text-[#0F2B4C] hover:text-[#3A7BD5]">
                    {d.name ?? d.user?.name ?? 'Name missing'}
                  </Link>
                  <p className="truncate text-[10px] text-gray-400">
                    {d.offersToday != null
                      ? `Took ${d.acceptedToday ?? 0} of ${d.offersToday} offers today`
                      : 'No offers recorded today'}
                    {d.lastDeliveryAt
                      ? ` · last delivery ${new Date(d.lastDeliveryAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}`
                      : ' · no delivery on record'}
                  </p>
                </div>
                <div className="col-span-2 text-sm text-[#0F2B4C]">
                  {d.vehicleType ? (VEHICLE_WORDS[d.vehicleType] ?? d.vehicleType) : 'Not recorded'}
                </div>
                <div className="col-span-2 text-right">
                  {d.rating != null ? (
                    <span className="inline-flex items-center gap-1 text-sm text-[#0F2B4C]">
                      <Star size={12} fill="#FFBE0B" color="#FFBE0B" />
                      {Number(d.rating).toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400" title="Nobody has rated them yet">not rated</span>
                  )}
                </div>
                <div className="col-span-2 text-right">
                  {rate != null ? (
                    <span className={`inline-flex items-center gap-1 text-sm font-bold ${meets ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                      {meets ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {rate}%
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400" title="Dispatch has not offered them a job today">not offered any</span>
                  )}
                </div>
                <div className="col-span-2 text-right">
                  <span
                    className="inline-block rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
                    style={{ backgroundColor: status.color + '20', color: status.color }}
                  >
                    {status.label}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-black tabular-nums" style={{ color: accent }}>{value}</p>
    </div>
  );
}
