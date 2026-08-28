'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { naira, nairaAxis } from '@/lib/money';
import { deliveryStatus } from '@/lib/labels';
import { PageIntro } from '@/components/PageIntro';
import { AlertCircle, Star } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts';

/**
 * Reading the business.
 *
 * The date buttons at the top look like they govern the page. They do
 * not: only two of the seven panels below have ever taken a date range,
 * and the other five are all-time figures sitting next to them with no
 * visual difference. Somebody comparing "last 7 days" against "last 90"
 * watched five panels refuse to move and reasonably concluded the page
 * was broken, or worse, believed the numbers.
 *
 * Every panel now states its own window. And "Total Revenue" is not
 * revenue: it is the sum of what customers were charged on completed
 * jobs, which is a much bigger number than what SEIRS keeps, and it is
 * counted on the day the job was BOOKED rather than the day it landed.
 */

const STATUS_COLORS: Record<string, string> = {
  pending:    '#F59E0B',
  assigned:   '#3B82F6',
  picked_up:  '#0F2B4C',
  in_transit: '#06B6D4',
  delivered:  '#10B981',
  failed:     '#EF4444',
  cancelled:  '#6B7280',
};

/** The words riders and customers actually use for these machines. */
const VEHICLE_WORDS: Record<string, string> = {
  bicycle:     'Bicycle',
  motorcycle:  'Okada',
  tricycle:    'Keke',
  car:         'Car',
  van:         'Van',
  truck_small: 'Small truck',
  truck_large: 'Large truck',
};

const URGENCY_WORDS: Record<string, string> = {
  economy:  'Economy, 2 to 3 days',
  standard: 'Standard, next day',
  instant:  'Instant, same day',
};

/** A small honest label on every panel saying what period it covers. */
function Window({ text }: { text: string }) {
  return (
    <span className="rounded-full bg-[#F5F5F0] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0F2B4C]/40">
      {text}
    </span>
  );
}

function Panel({
  title, window: win, note, children,
}: { title: string; window: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#0F2B4C]/70">{title}</h2>
        <Window text={win} />
      </div>
      {note && <p className="mb-3 text-xs leading-relaxed text-[#0F2B4C]/40">{note}</p>}
      {children}
    </div>
  );
}

function NoData({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-2 text-center text-sm text-[#0F2B4C]/30">
      {failed ? (
        <>
          <AlertCircle size={18} className="text-red-400" />
          <p className="text-red-600">This one did not load. It does not mean the figure is zero.</p>
          <button onClick={onRetry} className="text-xs font-semibold text-[#3A7BD5] underline">Try again</button>
        </>
      ) : (
        <p>Nothing happened in this period.</p>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const [revenue,    setRevenue]    = useState<any[]>([]);
  const [byStatus,   setByStatus]   = useState<any[]>([]);
  const [topDrivers, setTopDrivers] = useState<any[]>([]);
  const [byVehicle,  setByVehicle]  = useState<any[]>([]);
  const [byCategory, setByCategory] = useState<any[]>([]);
  const [driverHrs,  setDriverHrs]  = useState<any[]>([]);
  const [referral,   setReferral]   = useState<{ referredSignups: number; firstDeliveryDone: number; conversionPercent: number } | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [days,       setDays]       = useState(30);
  // Which panels failed, so an outage never renders as a quiet business.
  const [failed,     setFailed]     = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    setLoading(true);
    const mark = (key: string, ok: boolean) =>
      setFailed(prev => ({ ...prev, [key]: !ok }));

    Promise.all([
      // Every call catches its own failure. Promise.all used to reject as
      // a whole if either of the first two threw, which emptied all seven
      // panels and rendered the entire page as "No data yet".
      adminApi.analytics.revenue(days).then(r => { mark('revenue', true); return r; }).catch(() => { mark('revenue', false); return null; }),
      adminApi.analytics.deliveriesByStatus(days).then(r => { mark('status', true); return r; }).catch(() => { mark('status', false); return []; }),
      adminApi.analytics.topDrivers(10, days).then(r => { mark('drivers', true); return r; }).catch(() => { mark('drivers', false); return []; }),
      adminApi.analytics.deliveriesByVehicle(days).then(r => { mark('vehicle', true); return r; }).catch(() => { mark('vehicle', false); return []; }),
      adminApi.analytics.deliveriesByCategory(days).then(r => { mark('urgency', true); return r; }).catch(() => { mark('urgency', false); return []; }),
      adminApi.analytics.driverHours(days, 8).then(r => { mark('hours', true); return r; }).catch(() => { mark('hours', false); return []; }),
      adminApi.analytics.referralFunnel().then(r => { mark('referral', true); return r; }).catch(() => { mark('referral', false); return null; }),
    ]).then(([rev, status, drivers, veh, cat, hrs, ref]) => {
      // Backend wraps revenue in { data: [...] }; other endpoints return raw arrays
      setRevenue(Array.isArray(rev) ? rev : ((rev as any)?.data ?? []));
      setByStatus(Array.isArray(status) ? status : []);
      setTopDrivers(Array.isArray(drivers) ? drivers : []);
      setByVehicle(Array.isArray(veh) ? veh : []);
      setByCategory(Array.isArray(cat) ? cat : []);
      setDriverHrs(Array.isArray(hrs) ? hrs : []);
      setReferral(ref as any);
    }).finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const totalCharged    = revenue.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const totalDeliveries = revenue.reduce((s, r) => s + Number(r.count ?? 0), 0);
  const anyFailed       = Object.values(failed).some(Boolean);
  const rangeLabel      = `Last ${days} days`;

  const statusData  = byStatus.map(r => ({ ...r, label: deliveryStatus(r.status) }));
  const vehicleData = byVehicle.map(r => ({ ...r, label: VEHICLE_WORDS[r.vehicleType] ?? r.vehicleType ?? 'Not recorded' }));
  const urgencyData = byCategory.map(r => ({ ...r, label: URGENCY_WORDS[r.category] ?? r.category ?? 'Not recorded' }));

  return (
    <div className="min-h-screen">
      <main className="p-8">
        <PageIntro
          title="Analytics"
          purpose="See how much SEIRS moved and earned over a period, which riders carried it, and where the work is coming from."
          storageKey="analytics"
          help={
            <>
              <p>The date buttons only change the two panels marked with a date range. Everything else is an all-time figure and says so on its own label.</p>
              <p><strong>Customer payments</strong> is what customers were charged, not what SEIRS keeps after paying the rider and the card processor.</p>
              <p>Nothing on this page changes anything. It is safe to click about.</p>
            </>
          }
          actions={
            <div className="flex gap-2">
              {[7, 14, 30, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    days === d
                      ? 'border-[#3A7BD5] bg-[#3A7BD5] text-white'
                      : 'border-[#E5E7EB] bg-white text-[#0F2B4C]/50 hover:border-[#0F2B4C]/20'
                  }`}
                >
                  {d} days
                </button>
              ))}
            </div>
          }
        />

        {anyFailed && !loading && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">
              Some of these panels did not load. The ones marked below are missing, not empty, so do not read them as zero.
            </span>
            <button onClick={load} className="shrink-0 font-semibold underline hover:no-underline">Reload</button>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-[#0F2B4C]/30">Loading</div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/40">
                    Charged to customers
                  </p>
                  <Window text={rangeLabel} />
                </div>
                <p className="mt-1 text-3xl font-black text-[#0F2B4C]">{naira(totalCharged)}</p>
                {/* The tile said "Total Revenue". It is the full price the
                    customer paid on completed jobs: the rider's share and
                    the card fee both come out of it, so it is not what
                    SEIRS earns. */}
                <p className="mt-1 text-xs leading-relaxed text-[#0F2B4C]/40">
                  The full price of completed deliveries. The rider&apos;s share and card fees come out of this,
                  so it is not what SEIRS keeps. Counted on the day each job was booked.
                </p>
              </div>
              <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/40">
                    Deliveries completed
                  </p>
                  <Window text={rangeLabel} />
                </div>
                <p className="mt-1 text-3xl font-black text-[#0F2B4C]">{totalDeliveries.toLocaleString()}</p>
                <p className="mt-1 text-xs text-[#0F2B4C]/40">
                  Jobs booked in this period that were delivered.
                </p>
              </div>
            </div>

            <Panel
              title="Money taken each day"
              window={rangeLabel}
              note="The full customer price of jobs that completed, by the day they were booked."
            >
              {revenue.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={revenue} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    {/* getRevenueByDay returns { date, revenue, count } and
                        `date` is already a formatted label like "5 Aug".
                        Reading r.day gave undefined, so the axis rendered
                        blank and the tooltip said "Invalid Date". No
                        formatter: the string is the label. */}
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#0F2B4C', opacity: 0.4 }}
                    />
                    {/* Axis ticks abbreviate because a full kobo amount will not fit in the
                        gutter. The exact figure is one hover away in the tooltip. */}
                    <YAxis tickFormatter={nairaAxis} tick={{ fontSize: 11, fill: '#0F2B4C', opacity: 0.4 }} width={60} />
                    <Tooltip
                      formatter={(v: any) => [naira(v), 'Charged to customers']}
                      contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', boxShadow: 'none' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#3A7BD5"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#3A7BD5' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : <NoData failed={!!failed.revenue} onRetry={load} />}
            </Panel>

            <div className="grid grid-cols-2 gap-6">
              <Panel
                title="Where deliveries stand"
                window={rangeLabel}
                note="Every delivery SEIRS has ever taken, whatever the dates above say."
              >
                {statusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        // Was the raw column value: "in_transit 12%".
                        label={({ label, percent }) => `${label} ${((percent ?? 0) * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {statusData.map((entry) => (
                          <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#94A3B8'} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any, n: any) => [`${v} deliveries`, n]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <NoData failed={!!failed.status} onRetry={load} />}
              </Panel>

              <Panel
                title="Busiest riders"
                window={rangeLabel}
                note="Ranked by total deliveries ever completed, not by this period."
              >
                <div className="space-y-2">
                  {topDrivers.slice(0, 8).map((d: any, i: number) => (
                    <div key={d.id} className="flex items-center gap-3">
                      <span className="w-4 text-xs font-bold text-[#0F2B4C]/30">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/drivers/${d.id}`} className="block truncate text-sm font-medium text-[#0F2B4C] hover:text-[#3A7BD5]">
                          {d.user?.name ?? 'Name missing'}
                        </Link>
                        <p className="text-xs text-[#0F2B4C]/40">{VEHICLE_WORDS[d.vehicleType] ?? d.vehicleType}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums text-[#0F2B4C]">{d.totalDeliveries}</p>
                        {/* Number(null).toFixed(1) is "0.0", so a rider
                            nobody has rated read as the worst on the
                            platform. A dash is the actual fact. */}
                        {d.rating == null ? (
                          <span className="text-xs text-[#0F2B4C]/30" title="Nobody has rated them yet">not rated</span>
                        ) : (
                          <div className="flex items-center justify-end gap-0.5">
                            <Star size={10} fill="#FFBE0B" color="#FFBE0B" />
                            <span className="text-xs text-[#0F2B4C]/50">{Number(d.rating).toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {topDrivers.length === 0 && <NoData failed={!!failed.drivers} onRetry={load} />}
                </div>
              </Panel>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <Panel
                title="What carried it"
                window={rangeLabel}
                note="Completed deliveries by the kind of machine that carried them."
              >
                {vehicleData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={vehicleData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#0F2B4C', opacity: 0.4 }} />
                      <YAxis tick={{ fontSize: 11, fill: '#0F2B4C', opacity: 0.4 }} />
                      <Tooltip
                        formatter={(v: any) => [`${v} deliveries`, 'Completed']}
                        contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', boxShadow: 'none' }}
                      />
                      <Bar dataKey="count" fill="#3A7BD5" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <NoData failed={!!failed.vehicle} onRetry={load} />}
              </Panel>

              <Panel
                title="How fast customers asked for it"
                window={rangeLabel}
                /* The backend groups this by d.urgency, not by category
                   code, so the legend reads express/standard. Renamed to
                   match the query rather than mislabelling the data. */
                note="Which speed of service people chose when booking."
              >
                {urgencyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={urgencyData}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ label, percent }) => `${label} ${((percent ?? 0) * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {urgencyData.map((entry, i) => (
                          <Cell key={entry.category} fill={['#10B981', '#3B82F6', '#F59E0B'][i % 3]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any, n: any) => [`${v} deliveries`, n]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <NoData failed={!!failed.urgency} onRetry={load} />}
              </Panel>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <Panel
                title="Hours riders spent on jobs"
                window={rangeLabel}
                note="From accepting a job to delivering it, added up per rider."
              >
                {driverHrs.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={driverHrs} layout="vertical" margin={{ top: 4, right: 16, left: 60, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#0F2B4C', opacity: 0.4 }} />
                      <YAxis type="category" dataKey="driverName" tick={{ fontSize: 11, fill: '#0F2B4C', opacity: 0.4 }} width={80} />
                      <Tooltip
                        formatter={(v: any) => [`${v} hours`, 'On jobs']}
                        contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', boxShadow: 'none' }}
                      />
                      <Bar dataKey="hours" fill="#10B981" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <NoData failed={!!failed.hours} onRetry={load} />}
              </Panel>

              <Panel
                title="People who joined through a referral"
                window="All time"
                note="A referral only pays out once the new person completes their first delivery."
              >
                {referral ? (
                  <div className="flex flex-col gap-4 py-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/40">Signed up with a code</p>
                      <p className="mt-1 text-3xl font-black tabular-nums text-[#0F2B4C]">{referral.referredSignups.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/40">Went on to complete a delivery</p>
                      <p className="mt-1 text-3xl font-black tabular-nums text-[#10B981]">{referral.firstDeliveryDone.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/40">That is</p>
                      <p className="mt-1 text-3xl font-black tabular-nums text-[#3A7BD5]">{referral.conversionPercent}%</p>
                    </div>
                  </div>
                ) : <NoData failed={!!failed.referral} onRetry={load} />}
              </Panel>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
