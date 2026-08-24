'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { MoonStar, AlertCircle, TrendingUp, TrendingDown, Star } from 'lucide-react';

// Spec V8 §3.12 - driver last-order compliance dashboard. Real
// query-derived numbers since 2026-08-11: offers = job pings sent to
// the driver today, accepted = jobs taken today, rate = the honest
// ratio (null when no offers: no fake 100%s).

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
  lastOrderActiveAt?:   string;
}

// Code fallback only. The live number comes from the Fee Catalogue so
// the founder can move it without a deploy (admin-tunable-everything).
const ACCEPTANCE_THRESHOLD_FALLBACK = 80;
const ACCEPTANCE_THRESHOLD_FEE_KEY  = 'last_order_min_acceptance_pct';

export default function LastOrderCompliancePage() {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(ACCEPTANCE_THRESHOLD_FALLBACK);

  useEffect(() => {
    adminApi.driverCompliance()
      .then(res => setDrivers(Array.isArray(res?.drivers) ? res.drivers : []))
      .catch(() => setDrivers([]))
      .finally(() => setLoading(false));
  }, []);

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

  // Bucket the drivers - surfaced backend will compute these properly;
  // until then we treat any driver with acceptance under threshold as
  // a compliance concern, and any with last-order toggle activity in
  // the last hour as winding down.
  const belowThreshold = drivers.filter(d =>
    d.todayAcceptanceRate != null && d.todayAcceptanceRate < threshold,
  );
  const windingDown = drivers.filter(d => !!d.lastOrderActiveAt);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <MoonStar size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Last-Order Compliance</h1>
            <p className="text-sm text-gray-500">
              Watch driver acceptance rates and Last Order toggle activity. {threshold}% is the target acceptance rate; today it is advisory, nothing blocks the wind-down toggle.
            </p>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Total Drivers" value={drivers.length} accent="#3A7BD5" />
        <SummaryCard label="Below Threshold" value={belowThreshold.length} accent="#DC2626" />
        <SummaryCard label="Currently Winding Down" value={windingDown.length} accent="#16A34A" />
      </div>

      {/* Rates are null until a driver has received at least one job
          ping today: honest dashes beat invented 100%s. */}
      {!loading && drivers.length > 0 && drivers.every(d => d.todayAcceptanceRate == null) && (
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
          <AlertCircle size={16} />
          <span>
            No job offers have gone out yet today, so acceptance rates show as dashes. They fill in as dispatch pings drivers.
          </span>
        </div>
      )}

      {/* Driver table */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-[#E5E7EB] text-[10px] font-bold uppercase tracking-wide text-gray-500">
          <div className="col-span-4">Driver</div>
          <div className="col-span-2">Vehicle</div>
          <div className="col-span-2 text-right">Rating</div>
          <div className="col-span-2 text-right">Today&apos;s Acceptance</div>
          <div className="col-span-2 text-right">Status</div>
        </div>
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading drivers…</div>
        ) : drivers.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No drivers yet.</div>
        ) : (
          drivers.map(d => {
            const rate = d.todayAcceptanceRate;
            const meets = rate == null || rate >= threshold;
            const status =
              d.lastOrderActiveAt ? { label: 'Winding down',  color: '#16A34A' } :
              d.isOnline           ? { label: 'Accepting',     color: '#3A7BD5' } :
                                     { label: 'Offline',       color: '#9CA3AF' };
            return (
              <div key={d.id} className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-[#F3F4F6] items-center">
                <div className="col-span-4">
                  <p className="text-sm font-semibold text-[#0F2B4C] truncate">{d.name ?? d.user?.name ?? 'Driver'}</p>
                  <p className="text-[10px] text-gray-400 font-mono truncate">
                    {d.offersToday != null ? `${d.acceptedToday ?? 0}/${d.offersToday} offers today` : d.id}
                  </p>
                </div>
                <div className="col-span-2 text-sm text-[#0F2B4C] capitalize">{d.vehicleType ?? '-'}</div>
                <div className="col-span-2 text-right">
                  {d.rating != null ? (
                    <span className="inline-flex items-center gap-1 text-sm text-[#0F2B4C]">
                      <Star size={12} fill="#FFBE0B" color="#FFBE0B" />
                      {Number(d.rating).toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </div>
                <div className="col-span-2 text-right">
                  {rate != null ? (
                    <span className={`inline-flex items-center gap-1 text-sm font-bold ${meets ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                      {meets ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {rate}%
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </div>
                <div className="col-span-2 text-right">
                  <span
                    className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded"
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
    <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-5">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-black mt-1" style={{ color: accent }}>{value}</p>
    </div>
  );
}
