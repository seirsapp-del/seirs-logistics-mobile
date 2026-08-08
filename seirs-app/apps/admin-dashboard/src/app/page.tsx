'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import {
  Users, Truck, ClipboardList, Zap, Package,
  Clock, TrendingUp, ChevronRight, AlertTriangle,
  Activity, Timer, Gauge, ShieldAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

interface Stats {
  users:      { total: number };
  drivers:    { total: number; pendingKyc: number };
  deliveries: { total: number; active: number; today: number; pending: number };
  revenue:    { total: number; commission: number; commissionRate?: number };
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

const fmtShort = (n: number) => {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${n}`;
};

export default function DashboardPage() {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [revenue, setRevenue] = useState<any[]>([]);
  const [live,    setLive]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<Date | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      adminApi.stats(),
      adminApi.analytics.revenue(30),
    ]).then(([s, r]) => {
      setStats(s);
      setRevenue(Array.isArray(r?.data) ? r.data : []);
    }).catch((e: any) => {
      setError(e?.message ?? 'Could not load dashboard. Backend may be waking up (Railway cold start).');
    }).finally(() => setLoading(false));
  };

  const loadLive = () => {
    adminApi.liveDashboard().then((d) => {
      setLive(d);
      setLiveUpdatedAt(new Date());
    }).catch(() => {});
  };

  useEffect(() => { load(); loadLive(); }, []);
  // Auto-refresh live panel every 30 seconds while the page is visible
  useEffect(() => {
    const id = setInterval(loadLive, 30_000);
    return () => clearInterval(id);
  }, []);

  const cards: { label: string; value: string; sub?: string; Icon: LucideIcon; color: string; bg: string }[] = stats ? [
    {
      label: 'Total Customers', value: stats.users.total.toLocaleString(),
      Icon: Users, color: 'text-[#3A7BD5]', bg: 'bg-[#3A7BD5]/10',
    },
    {
      label: 'Total Drivers', value: stats.drivers.total.toLocaleString(),
      sub: `${stats.drivers.pendingKyc} pending KYC`,
      Icon: Truck, color: 'text-violet-600', bg: 'bg-violet-100',
    },
    {
      label: 'Active Deliveries', value: stats.deliveries.active.toLocaleString(),
      sub: `${stats.deliveries.today} today`,
      Icon: Zap, color: 'text-emerald-600', bg: 'bg-emerald-100',
    },
    {
      label: 'Pending Dispatch', value: stats.deliveries.pending.toLocaleString(),
      Icon: Clock, color: stats.deliveries.pending > 5 ? 'text-red-600' : 'text-amber-600',
      bg: stats.deliveries.pending > 5 ? 'bg-red-100' : 'bg-amber-100',
    },
    {
      label: 'Total Deliveries', value: stats.deliveries.total.toLocaleString(),
      Icon: Package, color: 'text-[#0F2B4C]', bg: 'bg-[#0F2B4C]/10',
    },
    {
      label: 'Pending KYC', value: stats.drivers.pendingKyc.toLocaleString(),
      Icon: ClipboardList, color: 'text-orange-600', bg: 'bg-orange-100',
    },
    {
      label: 'Total Revenue', value: fmt(stats.revenue.total),
      Icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-100',
    },
    {
      label: 'Platform Commission', value: fmt(stats.revenue.commission),
      sub: stats.revenue.commissionRate != null
        ? `${(stats.revenue.commissionRate * 100).toFixed(stats.revenue.commissionRate % 0.01 === 0 ? 0 : 1)}% of gross revenue`
        : 'of gross revenue',
      Icon: TrendingUp, color: 'text-[#3A7BD5]', bg: 'bg-[#3A7BD5]/10',
    },
  ] : [];

  return (
    <div className="min-h-screen">
      <main className="p-6 lg:p-8 max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F2B4C]">Platform Overview</h1>
            <p className="text-[#0F2B4C]/40 text-sm mt-1">
              {new Date().toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#0F2B4C]/60 bg-white border border-[#0F2B4C]/10 px-3 py-1.5 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold">Live</span>
            {liveUpdatedAt && (
              <span className="text-[#0F2B4C]/40">
                · updated {Math.max(1, Math.floor((Date.now() - liveUpdatedAt.getTime()) / 1000))}s ago
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-800">Could not load dashboard</p>
              <p className="text-xs text-red-700/80 mt-0.5 break-words">{error}</p>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="shrink-0 text-xs font-semibold text-red-700 hover:text-red-900 underline disabled:opacity-40"
            >
              {loading ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-[#0F2B4C]/30">Loading…</div>
          </div>
        ) : error && !stats ? null : (
          <>
            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {cards.map((c) => (
                <div key={c.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                  <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${c.bg} mb-3`}>
                    <c.Icon size={17} className={c.color} />
                  </div>
                  <div className="text-xl font-bold text-[#0F2B4C]">{c.value}</div>
                  <div className="text-xs text-[#0F2B4C]/50 mt-0.5">{c.label}</div>
                  {c.sub && <div className="text-xs text-[#3A7BD5] mt-1">{c.sub}</div>}
                </div>
              ))}
            </div>

            {/* Currently active drivers strip */}
            {live?.drivers && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Activity size={16} className="text-emerald-600" />
                  <h2 className="text-sm font-semibold text-[#0F2B4C]">Driver activity right now</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <ActivityStat label="Online" value={live.drivers.online} color="text-emerald-700" />
                  <ActivityStat label="On a trip" value={live.drivers.busy}   color="text-[#3A7BD5]" />
                  <ActivityStat label="Idle"      value={live.drivers.idle}   color="text-[#0F2B4C]" />
                  <ActivityStat label="Stale (no ping >10min)" value={live.drivers.stale} color={live.drivers.stale > 0 ? 'text-amber-600' : 'text-[#0F2B4C]/40'} />
                </div>
              </div>
            )}

            {/* Speed of service */}
            {live?.speedOfService && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Gauge size={16} className="text-[#3A7BD5]" />
                    <h2 className="text-sm font-semibold text-[#0F2B4C]">Speed of service (last 24h, median)</h2>
                  </div>
                  <span className="text-xs text-[#0F2B4C]/40">
                    n = {live.speedOfService.sampleSize}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <SosCard label="Booking → accepted" seconds={live.speedOfService.acceptSec} good={60}    bad={180} />
                  <SosCard label="Accepted → pickup"  seconds={live.speedOfService.pickupSec} good={600}   bad={1200} />
                  <SosCard label="Pickup → delivered" seconds={live.speedOfService.dropSec}   good={1800}  bad={3600} />
                </div>
              </div>
            )}

            {/* Anomaly panel */}
            {live?.anomalies && (
              <AnomalyPanel anomalies={live.anomalies} />
            )}

            {/* Monthly targets vs actual */}
            {live?.targets && (
              <TargetsCard targets={live.targets} onSave={async (p) => { await adminApi.setDashboardTargets(p); loadLive(); }} />
            )}

            {/* Channel breakdown donut */}
            {live?.channels && live.channels.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Package size={16} className="text-[#3A7BD5]" />
                  <h2 className="text-sm font-semibold text-[#0F2B4C]">Deliveries by channel (all time)</h2>
                </div>
                <ChannelDonut data={live.channels} />
              </div>
            )}

            {/* Hourly demand chart */}
            {live?.hourly && live.hourly.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Timer size={16} className="text-[#0F2B4C]" />
                  <h2 className="text-sm font-semibold text-[#0F2B4C]">Bookings by hour (last 24h)</h2>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={live.hourly.map((h: any) => ({
                    hour: new Date(h.hour).toLocaleTimeString('en-NG', { hour: 'numeric', hour12: true }).replace(' ', ''),
                    deliveries: h.deliveries,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F0" />
                    <XAxis dataKey="hour" tick={{ fill: '#0F2B4C', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#0F2B4C', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0F2B4C', border: 'none', borderRadius: 8, color: '#fff' }}
                      cursor={{ fill: 'rgba(58, 123, 213, 0.08)' }}
                    />
                    <Bar dataKey="deliveries" fill="#3A7BD5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Revenue chart */}
            {revenue.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-[#0F2B4C]">Revenue. Last 30 Days</h2>
                  <span className="text-xs text-[#0F2B4C]/40">Daily gross</span>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={revenue} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3A7BD5" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#3A7BD5" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} width={56} />
                    <Tooltip
                      formatter={(v: any) => [fmt(v), 'Revenue']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#3A7BD5" strokeWidth={2} fill="url(#rev)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Quick actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <QuickCard
                title="Pending KYC Reviews"
                count={stats?.drivers.pendingKyc ?? 0}
                desc="Drivers awaiting document verification"
                href="/drivers?status=pending"
                urgent={(stats?.drivers.pendingKyc ?? 0) > 0}
              />
              <QuickCard
                title="Unassigned Deliveries"
                count={stats?.deliveries.pending ?? 0}
                desc="Deliveries without an assigned driver"
                href="/deliveries?status=pending"
                urgent={(stats?.deliveries.pending ?? 0) > 5}
              />
              <QuickCard
                title="Active Deliveries"
                count={stats?.deliveries.active ?? 0}
                desc="Currently in progress across the platform"
                href="/deliveries?status=assigned"
                urgent={false}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// Monthly targets card. Inline-editable via a small "Set targets" affordance
// that opens a plain dialog for revenueNgn + deliveries. Progress bars
// clamp at 100% width so a hot month doesn't overflow the container; a
// small "104%" pill next to the numeric surfaces the overage.
function TargetsCard({ targets, onSave }: { targets: any; onSave: (p: { revenueNgn?: number; deliveries?: number }) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [rev, setRev]         = useState(String(targets.monthlyRevenue?.target ?? 0));
  const [del, setDel]         = useState(String(targets.monthlyDeliveries?.target ?? 0));
  const [saving, setSaving]   = useState(false);
  const fmtN = (n: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

  const submit = async () => {
    setSaving(true);
    try {
      await onSave({ revenueNgn: Number(rev) || 0, deliveries: Number(del) || 0 });
      setEditing(false);
    } finally { setSaving(false); }
  };

  const Bar = ({ label, actual, target, pct, formatter }: { label: string; actual: number; target: number; pct: number | null; formatter: (n: number) => string }) => {
    const clampedPct = pct == null ? 0 : Math.min(100, pct);
    const overshoot  = pct != null && pct > 100;
    const barColour = pct == null ? 'bg-gray-200' : pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-[#3A7BD5]' : 'bg-amber-500';
    return (
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold text-[#0F2B4C]">{label}</span>
          <span className="text-xs text-[#0F2B4C]/50">
            {formatter(actual)} / {target > 0 ? formatter(target) : 'no target set'}
            {pct != null && <span className={`ml-2 font-bold ${overshoot ? 'text-emerald-600' : 'text-[#0F2B4C]'}`}>{pct}%</span>}
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-full ${barColour} transition-all`} style={{ width: `${clampedPct}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-emerald-600" />
          <h2 className="text-sm font-semibold text-[#0F2B4C]">This month vs target</h2>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs font-semibold text-[#3A7BD5] hover:underline">Set targets</button>
        )}
      </div>
      {editing ? (
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-[#0F2B4C] mb-1">Monthly revenue target (NGN)</span>
            <input type="number" value={rev} onChange={(e) => setRev(e.target.value)} min="0" className="w-full text-sm p-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-[#0F2B4C] mb-1">Monthly deliveries target (count)</span>
            <input type="number" value={del} onChange={(e) => setDel(e.target.value)} min="0" className="w-full text-sm p-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditing(false)} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#0F2B4C]/60 hover:bg-gray-100">Cancel</button>
            <button onClick={submit} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#3A7BD5] hover:bg-[#2a6bc4] disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Bar label="Revenue"    actual={targets.monthlyRevenue?.actual  ?? 0} target={targets.monthlyRevenue?.target  ?? 0} pct={targets.monthlyRevenue?.pct}    formatter={fmtN} />
          <Bar label="Deliveries" actual={targets.monthlyDeliveries?.actual ?? 0} target={targets.monthlyDeliveries?.target ?? 0} pct={targets.monthlyDeliveries?.pct} formatter={(n) => n.toLocaleString()} />
        </div>
      )}
    </div>
  );
}

// Channel breakdown pie. Colour palette maps to source: customer_app is
// SEIRS blue, business_app is emerald, partner_store is amber, developer_api
// is purple. Anything unknown falls back to gray.
function ChannelDonut({ data }: { data: Array<{ source: string; count: number }> }) {
  const COLOURS: Record<string, string> = {
    customer_app:  '#3A7BD5',
    business_app:  '#10B981',
    partner_store: '#F59E0B',
    developer_api: '#8B5CF6',
  };
  const LABELS: Record<string, string> = {
    customer_app:  'Customer app',
    business_app:  'Business app',
    partner_store: 'Partner store',
    developer_api: 'Developer API',
  };
  const rows = data.map((r) => ({
    name:  LABELS[r.source] ?? r.source,
    value: r.count,
    fill:  COLOURS[r.source] ?? '#9CA3AF',
  }));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="flex items-center gap-6">
      <ResponsiveContainer width={180} height={180}>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
            {rows.map((r, i) => <Cell key={i} fill={r.fill} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-2">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: r.fill }} />
              <span className="text-[#0F2B4C]">{r.name}</span>
            </div>
            <span className="text-xs text-[#0F2B4C]/60 font-mono">
              {r.value} <span className="text-[#0F2B4C]/40">({total > 0 ? Math.round((r.value / total) * 100) : 0}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-[#0F2B4C]/50 mt-0.5">{label}</div>
    </div>
  );
}

// Speed-of-service card. Colour thresholds are ops-tuned: green below `good`,
// amber between good and bad, red above bad. Renders "—" when we have no
// sample data yet so an empty platform doesn't look broken.
function SosCard({ label, seconds, good, bad }: { label: string; seconds: number | null; good: number; bad: number }) {
  const fmtDur = (s: number) => {
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60), r = s % 60;
    return r === 0 ? `${m}m` : `${m}m ${r}s`;
  };
  const colour =
    seconds == null ? 'text-[#0F2B4C]/30' :
    seconds <= good ? 'text-emerald-600' :
    seconds <= bad  ? 'text-amber-600' :
    'text-red-600';
  return (
    <div>
      <div className={`text-xl font-bold ${colour}`}>
        {seconds == null ? '—' : fmtDur(seconds)}
      </div>
      <div className="text-xs text-[#0F2B4C]/50 mt-1 leading-tight">{label}</div>
      <div className="text-xs text-[#0F2B4C]/30 mt-0.5">
        target &lt; {fmtDur(good)}
      </div>
    </div>
  );
}

// Anomaly panel: three buckets of things that need admin attention. Renders
// nothing when all counts are zero (clean board = no visual noise).
function AnomalyPanel({ anomalies }: { anomalies: any }) {
  const buckets: Array<{ key: string; title: string; count: number; items: any[]; render: (i: any) => string }> = [
    {
      key: 'pending', title: 'Pending > 15 min (no driver accepted)',
      count: anomalies.pendingOver15Min?.count ?? 0,
      items: anomalies.pendingOver15Min?.items ?? [],
      render: (i) => `${i.trackingCode} · ${i.customerName ?? 'unknown'} · waiting ${i.waitingMin}min`,
    },
    {
      key: 'assigned', title: 'Assigned > 30 min (driver has not picked up)',
      count: anomalies.assignedOver30Min?.count ?? 0,
      items: anomalies.assignedOver30Min?.items ?? [],
      render: (i) => `${i.trackingCode} · ${i.driverName ?? 'driver'} · ${i.waitingMin}min since accept`,
    },
    {
      key: 'velocity', title: 'Drivers with > 6 accepts in the last hour',
      count: anomalies.highVelocityDrivers?.count ?? 0,
      items: anomalies.highVelocityDrivers?.items ?? [],
      render: (i) => `Driver ${i.driverId} · ${i.acceptedLastHour} accepts`,
    },
  ];
  const anyAnomaly = buckets.some((b) => b.count > 0);
  if (!anyAnomaly) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert size={16} className="text-emerald-600" />
          <h2 className="text-sm font-semibold text-[#0F2B4C]">Attention required</h2>
        </div>
        <p className="text-xs text-[#0F2B4C]/50">All clear. No anomalies right now.</p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert size={16} className="text-amber-600" />
        <h2 className="text-sm font-semibold text-[#0F2B4C]">Attention required</h2>
      </div>
      <div className="space-y-3">
        {buckets.filter((b) => b.count > 0).map((b) => (
          <div key={b.key} className="border border-amber-100 bg-amber-50/40 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#78350F]">{b.title}</span>
              <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">{b.count}</span>
            </div>
            <ul className="mt-2 space-y-0.5 text-xs text-[#78350F]/90 font-mono">
              {b.items.slice(0, 5).map((i, idx) => <li key={idx}>· {b.render(i)}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickCard({ title, count, desc, href, urgent }: {
  title: string; count: number; desc: string; href: string; urgent: boolean;
}) {
  return (
    <a
      href={href}
      className={`group block bg-white rounded-xl p-5 shadow-sm border hover:shadow-md transition-all ${
        urgent && count > 0 ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-[#0F2B4C] text-sm">{title}</h3>
        <div className="flex items-center gap-1.5">
          {urgent && count > 0 && <AlertTriangle size={14} className="text-amber-500" />}
          <span className={`text-2xl font-bold ${urgent && count > 0 ? 'text-amber-600' : 'text-[#0F2B4C]'}`}>
            {count}
          </span>
        </div>
      </div>
      <p className="text-sm text-[#0F2B4C]/40">{desc}</p>
      <div className="mt-3 flex items-center gap-1 text-xs font-medium text-[#3A7BD5] group-hover:gap-2 transition-all">
        View all <ChevronRight size={13} />
      </div>
    </a>
  );
}
