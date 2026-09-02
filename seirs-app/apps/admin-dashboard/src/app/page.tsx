'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { naira, nairaAxis } from "@/lib/money";
import FuelDriftBanner from '@/components/FuelDriftBanner';
import {
  Users, Truck, ClipboardList, Zap, Package,
  Clock, TrendingUp, ChevronRight, AlertTriangle,
  Activity, Timer, Gauge, ShieldAlert, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';


/** One queue from GET /admin/queues, with the age of its oldest item. */
interface QueueRow {
  key: string;
  label: string;
  href: string;
  count: number;
  /** Null when the queue is empty. */
  oldestMinutes: number | null;
  /** Past this age the queue is behind, and the card says so. */
  warnAfterMin: number;
}

interface Stats {
  // total is every non-driver account. customers is private individuals
  // only; businesses and partners are counted out of it. All three are
  // optional so an older server still renders.
  users:      { total: number; customers?: number; businesses?: number; partners?: number };
  drivers:    { total: number; pendingKyc: number };
  deliveries: { total: number; active: number; today: number; pending: number };
  revenue: {
    total: number; commission: number; commissionRate?: number;
    /** Money that actually reached the processor. The headline. */
    received?: number; receivedCount?: number;
    /** Delivered but not necessarily paid, and including demo rows. */
    booked?: number;
    /** booked minus received: what SEIRS is still owed. */
    outstanding?: number;
  };
}

export default function DashboardPage() {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [split,   setSplit]   = useState<any>(null);
  const [revenue, setRevenue] = useState<any[]>([]);
  const [live,    setLive]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<Date | null>(null);
  const [drill, setDrill] = useState<DrillKey | null>(null);
  const [queues, setQueues] = useState<QueueRow[]>([]);
  const [forward, setForward] = useState<any[]>([]);
  const [demand, setDemand] = useState<any>(null);
  const [corridors, setCorridors] = useState<any[]>([]);
  /**
   * Off by default. Every delivery on the platform today was made by a
   * demo account, so both charts render blank, and a blank chart with no
   * explanation looks broken rather than honest. The panel offers to
   * show the test data instead of just sitting there.
   */
  const [showDemo, setShowDemo] = useState(false);

  /**
   * Explain the bounce. middleware.ts redirects a role that opens a page
   * it lacks to /?denied=1, and nothing anywhere read that param, so the
   * admin was silently teleported to the dashboard with no idea why the
   * page they clicked did not open. Read from window.location rather than
   * useSearchParams so this page needs no Suspense boundary.
   */
  const [deniedFrom, setDeniedFrom] = useState<string | null>(null);
  // 'unlisted' means the path is not in ROUTE_PERMISSIONS at all: a typo,
  // or a page shipped without registering it. Blaming the admin's role
  // for that would send them to a super admin who then finds nothing to
  // grant, so the two cases get different wording.
  const [deniedKind, setDeniedKind] = useState<'role' | 'unlisted'>('role');
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const flag = q.get('denied');
      if (flag === '1' || flag === 'unlisted') {
        setDeniedKind(flag === 'unlisted' ? 'unlisted' : 'role');
        setDeniedFrom(q.get('from') ?? '');
      }
    } catch { /* no query string is the normal case */ }
  }, []);



  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      adminApi.stats(),
      adminApi.revenueSplit().then(setSplit).catch(() => {}),
      adminApi.analytics.revenue(30),
    ]).then(([s, , r]) => {
      setStats(s);
      setRevenue(Array.isArray(r?.data) ? r.data : []);
    }).catch((e: any) => {
      setError(e?.message ?? 'Could not load dashboard. Backend may be waking up (Railway cold start).');
    }).finally(() => setLoading(false));
  };


  /**
   * Queues are polled with the live panel rather than loaded once: an
   * operator leaves this page open, and a queue that was empty when they
   * opened it is exactly the one they need to be told about.
   */
  const loadQueues = () => {
    adminApi.queues()
      .then((rows: QueueRow[]) => setQueues(Array.isArray(rows) ? rows : []))
      .catch(() => setQueues([]));
  };

  const loadForward = () => {
    adminApi.forwardBook(7)
      .then((r: any[]) => setForward(Array.isArray(r) ? r : []))
      .catch(() => setForward([]));
  };

  const loadLive = () => {
    adminApi.liveDashboard().then((d) => {
      setLive(d);
      setLiveUpdatedAt(new Date());
    }).catch(() => {});
  };

  useEffect(() => { load(); loadLive(); loadQueues(); loadForward(); }, []);

  // Re-fetch both charts when the demo toggle flips.
  useEffect(() => {
    adminApi.demandByHour(60, showDemo).then(setDemand).catch(() => setDemand(null));
    adminApi.topCorridors(8, 90, showDemo)
      .then((r: any[]) => setCorridors(Array.isArray(r) ? r : []))
      .catch(() => setCorridors([]));
  }, [showDemo]);
  // Auto-refresh live panel every 30 seconds while the page is visible
  useEffect(() => {
    const id = setInterval(() => { loadLive(); loadQueues(); }, 30_000);
    return () => clearInterval(id);
  }, []);

  /**
   * Every card that represents a queue of real records carries a drill
   * key (founder 2026-08-13: "i see 2 pending dispatch and i cant even
   * click to see them... for everything being able to click them and see
   * the details is important"). Clicking opens a drawer listing those
   * records with the action that queue needs.
   *
   * Cards without a drill key are totals with no actionable list behind
   * them, so they stay static rather than pretending to be buttons.
   */
  const cards: {
    label: string; value: string; sub?: string; Icon: LucideIcon;
    color: string; bg: string;
    /** Opens the drawer, for queues with an action attached. */
    drill?: DrillKey;
    /**
     * Navigates instead, for totals whose detail lives on its own page.
     * A number you cannot click is a number you have to go and look up
     * somewhere else, which is the whole complaint that produced the
     * drill keys in the first place. Six of these tiles still had
     * neither (2026-08-28).
     */
    href?: string;
  }[] = stats ? [
    {
      /*
       * Private individuals only. This tile said "Total Customers" and
       * counted every non-driver account, so a trader with a registered
       * company and a partner shop was filed as somebody buying a delivery
       * for themselves (founder, 1 September). A business sender keeps
       * role 'customer' and carries a businessAccountId, which is why the
       * old count could not tell them apart.
       *
       * Falls back to the old total on an older server that does not send
       * the split, rather than rendering an empty tile.
       */
      label: 'Customers', value: (stats.users.customers ?? stats.users.total).toLocaleString(),
      sub: stats.users.businesses != null
        ? `${stats.users.businesses} business${stats.users.businesses === 1 ? '' : 'es'}${stats.users.partners ? `, ${stats.users.partners} partner${stats.users.partners === 1 ? '' : 's'}` : ''} counted separately`
        : 'demo accounts excluded',
      Icon: Users, color: 'text-[#3A7BD5]', bg: 'bg-[#3A7BD5]/10',
      href: '/users',
    },
    {
      label: 'Total Drivers', value: stats.drivers.total.toLocaleString(),
      sub: `${stats.drivers.pendingKyc} pending KYC`,
      Icon: Truck, color: 'text-violet-600', bg: 'bg-violet-100',
      href: '/drivers',
    },
    {
      label: 'Active Deliveries', value: stats.deliveries.active.toLocaleString(),
      sub: `${stats.deliveries.today} today`,
      Icon: Zap, color: 'text-emerald-600', bg: 'bg-emerald-100',
      drill: 'active',
    },
    {
      label: 'Pending Dispatch', value: stats.deliveries.pending.toLocaleString(),
      Icon: Clock, color: stats.deliveries.pending > 5 ? 'text-red-600' : 'text-amber-600',
      bg: stats.deliveries.pending > 5 ? 'bg-red-100' : 'bg-amber-100',
      drill: 'pending',
    },
    {
      label: 'Total Deliveries', value: stats.deliveries.total.toLocaleString(),
      Icon: Package, color: 'text-[#0F2B4C]', bg: 'bg-[#0F2B4C]/10',
      href: '/deliveries',
    },
    {
      label: 'Pending KYC', value: stats.drivers.pendingKyc.toLocaleString(),
      Icon: ClipboardList, color: 'text-orange-600', bg: 'bg-orange-100',
      drill: 'kyc',
    },
    /**
     * Three money tiles, and the labels are the whole point.
     *
     * "Total Revenue" used to sum every DELIVERED delivery whether or not
     * anybody paid, so this read 15,309.06 while SEIRS had banked
     * 2,609.06. Booked and banked are different numbers and the front
     * page has to say which one it is showing (2026-08-28).
     */
    {
      label: 'Revenue received', value: naira(stats.revenue.received ?? stats.revenue.total),
      sub: `${stats.revenue.receivedCount ?? 0} payment${(stats.revenue.receivedCount ?? 0) === 1 ? '' : 's'} settled`,
      Icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-100',
      href: '/wallet',
    },
    {
      label: 'Owed to SEIRS', value: naira(stats.revenue.outstanding ?? 0),
      sub: `${naira(stats.revenue.booked ?? 0)} delivered, not all collected`,
      Icon: Clock,
      color: (stats.revenue.outstanding ?? 0) > 0 ? 'text-amber-600' : 'text-gray-400',
      bg:    (stats.revenue.outstanding ?? 0) > 0 ? 'bg-amber-100'   : 'bg-gray-100',
      href: '/deliveries?status=delivered',
    },
    {
      label: 'Platform Commission', value: naira(stats.revenue.commission),
      // rate % 0.01 === 0 is essentially never true in binary floating
      // point, so the old test always took the 1-decimal branch and a flat
      // 15% rendered as "15.0%". Round the percentage instead and drop the
      // trailing zero only when there is one.
      sub: stats.revenue.commissionRate != null
        ? `${Number((stats.revenue.commissionRate * 100).toFixed(1))}% of money received`
        : 'of money received',
      Icon: TrendingUp, color: 'text-[#3A7BD5]', bg: 'bg-[#3A7BD5]/10',
      href: '/wallet',
    },
  ] : [];

  return (
    <div className="min-h-screen">
      <main className="p-6 lg:p-8 max-w-7xl mx-auto">

        {deniedFrom !== null && (
          <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">
              {deniedKind === 'unlisted' ? (
                <>
                  {deniedFrom
                    ? <><span className="font-mono font-semibold">{deniedFrom}</span> is not a page in this dashboard,</>
                    : 'That is not a page in this dashboard,'}
                  {' '}so you were brought back here. Check the link, and tell an
                  engineer if the page is supposed to exist.
                </>
              ) : (
                <>
                  {deniedFrom
                    ? <><span className="font-mono font-semibold">{deniedFrom}</span> is not part of your role, so you were brought back here.</>
                    : 'That page is not part of your role, so you were brought back here.'}
                  {' '}Ask a super admin if you need access.
                </>
              )}
            </span>
            <button
              onClick={() => setDeniedFrom(null)}
              className="shrink-0 text-amber-700 hover:text-amber-900"
              aria-label="Dismiss"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Fuel is the largest variable cost in the business and the one
            most likely to drift unnoticed. It belongs above the fold. */}
        <FuelDriftBanner />

      {/* Two product lines, measured apart (founder 2026-08-23). */}
      {split && (
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500">PACKAGES · last {split.windowDays} days</p>
              <span className="rounded bg-[#3A7BD5]/10 px-2 py-0.5 text-[10px] font-bold text-[#3A7BD5]">SEND</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-gray-900">{naira(split.packages.grossNgn)}</p>
            <p className="text-xs text-gray-500">{split.packages.bookings} paid bookings</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500">RIDES · last {split.windowDays} days</p>
              <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">RIDE</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-gray-900">{naira(split.rides.grossNgn)}</p>
            <p className="text-xs text-gray-500">{split.rides.bookings} paid bookings</p>
          </div>
        </div>
      )}

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
              {cards.map((c) => {
                const clickable = !!c.drill || !!c.href;
                const Tag: any = c.href ? Link : c.drill ? 'button' : 'div';
                return (
                  <Tag
                    key={c.label}
                    {...(c.href ? { href: c.href } : {})}
                    {...(!c.href && c.drill ? { onClick: () => setDrill(c.drill!), type: 'button' as const } : {})}
                    className={`bg-white rounded-xl p-5 shadow-sm border border-gray-100 text-left w-full ${
                      clickable
                        ? 'hover:border-[#3A7BD5] hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]'
                        : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${c.bg} mb-3`}>
                        <c.Icon size={17} className={c.color} />
                      </div>
                      {clickable && <ChevronRight size={15} className="text-[#0F2B4C]/25 mt-1" />}
                    </div>
                    <div className="text-xl font-bold text-[#0F2B4C]">{c.value}</div>
                    <div className="text-xs text-[#0F2B4C]/50 mt-0.5">{c.label}</div>
                    {c.sub && <div className="text-xs text-[#3A7BD5] mt-1">{c.sub}</div>}
                  </Tag>
                );
              })}
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
                    <YAxis tickFormatter={nairaAxis} tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} width={56} />
                    <Tooltip
                      formatter={(v: any) => [naira(v), 'Revenue']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#3A7BD5" strokeWidth={2} fill="url(#rev)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/*
              The work waiting, with how long it has been waiting.

              These were four hardcoded cards showing bare counts. Two
              numbers that look identical can be opposite problems: an
              unassigned delivery forty minutes old is an emergency and
              one forty seconds old is normal, and on the live database
              this panel immediately showed two driver KYC reviews that
              had been sitting for 109 days behind a tile that just said
              "2" (2026-08-28).

              Driven by GET /admin/queues so a new queue appears here by
              being added server-side, rather than by somebody
              remembering to hardcode a fifth card.
            */}
            {/*
              When work happens, and where.

              A revenue line shows a trend and never says WHEN, which is
              the question that decides staffing. Two live policies
              already depend on the answer with nothing validating
              either: riders activate at 4am and scheduling runs 5am to
              9pm.

              Demo rows are excluded by default because a seeded cohort
              is created in one batch at whatever hour the seeder ran and
              would draw a spike at a time nobody ordered anything. Every
              delivery on the platform today is demo, so the empty state
              says so and offers the toggle rather than looking broken.
            */}
            <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2">
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold text-[#0F2B4C]">When the work comes in</h2>
                  <span className="text-xs text-[#0F2B4C]/40">
                    last {demand?.daysBack ?? 60} days, Lagos time
                  </span>
                  {(demand?.demoAvailable ?? 0) > 0 && (
                    <button
                      onClick={() => setShowDemo((v) => !v)}
                      className="ml-auto rounded border border-gray-200 px-2 py-1 text-[11px] font-medium text-[#0F2B4C]/60 hover:bg-gray-50"
                    >
                      {showDemo ? 'Hide test data' : `Show ${demand?.demoAvailable} test deliveries`}
                    </button>
                  )}
                </div>

                {!demand || demand.peak === 0 ? (
                  <p className="py-8 text-center text-sm text-[#0F2B4C]/40">
                    {(demand?.demoAvailable ?? 0) > 0
                      ? `No real deliveries yet. ${demand.demoAvailable} test deliveries exist.`
                      : 'No deliveries in this window.'}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="min-w-[560px]">
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, d) => (
                        <div key={day} className="mb-0.5 flex items-center gap-1">
                          <span className="w-8 shrink-0 text-[10px] text-[#0F2B4C]/40">{day}</span>
                          {Array.from({ length: 24 }, (_, h) => {
                            const v = demand.grid?.[d]?.[h] ?? 0;
                            const pct = demand.peak > 0 ? v / demand.peak : 0;
                            return (
                              <div
                                key={h}
                                title={`${day} ${String(h).padStart(2, '0')}:00 - ${v} booking${v === 1 ? '' : 's'}`}
                                className="h-4 flex-1 rounded-[2px]"
                                style={{
                                  backgroundColor: v === 0
                                    ? '#F3F4F6'
                                    : `rgba(58,123,213,${0.15 + pct * 0.85})`,
                                }}
                              />
                            );
                          })}
                        </div>
                      ))}
                      <div className="mt-1 flex gap-1 pl-9">
                        {Array.from({ length: 24 }, (_, h) => (
                          <span key={h} className="flex-1 text-center text-[8px] text-[#0F2B4C]/30">
                            {h % 3 === 0 ? h : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="mb-3">
                  <h2 className="text-sm font-semibold text-[#0F2B4C]">Busiest corridors</h2>
                  <span className="text-xs text-[#0F2B4C]/40">by state, from coordinates</span>
                </div>
                {corridors.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[#0F2B4C]/40">
                    Nothing to map yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {corridors.map((c) => {
                      const top = corridors[0]?.count || 1;
                      return (
                        <div key={c.corridor}>
                          <div className="flex items-baseline justify-between text-xs">
                            <span className="font-medium text-[#0F2B4C]">{c.corridor}</span>
                            <span className="text-[#0F2B4C]/40">{c.count}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                            <div className="h-1.5 rounded-full bg-[#3A7BD5]"
                              style={{ width: `${Math.max(4, (c.count / top) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/*
              What SEIRS has already promised.

              The dashboard could see now and the past and nothing about
              committed future work, which is the wrong half of time for
              a business where people book days ahead: scheduled pickups
              run 5am to 9pm, interstate trips are declared up to three
              days out, and seats are sold against those trips in
              advance (founder 2026-08-28: "i am suprised it does not
              have a calender").
            */}
            {forward.length > 0 && (
              <div className="mb-6 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold text-[#0F2B4C]">The week ahead</h2>
                  <span className="text-xs text-[#0F2B4C]/40">work already committed</span>
                </div>
                <div className="grid grid-cols-4 gap-2 md:grid-cols-7">
                  {forward.map((d, i) => {
                    const dt = new Date(d.day + 'T00:00:00');
                    const busy = d.total > 0;
                    return (
                      <div key={d.day}
                        className={`rounded-lg border p-3 text-center ${
                          busy ? 'border-[#3A7BD5]/30 bg-[#3A7BD5]/5' : 'border-gray-100'
                        }`}>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#0F2B4C]/40">
                          {i === 0 ? 'Today' : dt.toLocaleDateString('en-NG', { weekday: 'short' })}
                        </div>
                        <div className="text-[10px] text-[#0F2B4C]/30">
                          {dt.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                        </div>
                        <div className={`mt-1 text-xl font-bold ${busy ? 'text-[#0F2B4C]' : 'text-[#0F2B4C]/20'}`}>
                          {d.total}
                        </div>
                        {busy && (
                          <div className="mt-1 space-y-0.5 text-[10px] text-[#0F2B4C]/50">
                            {d.scheduled > 0 && <div>{d.scheduled} scheduled</div>}
                            {d.trips > 0 && <div>{d.trips} trip{d.trips === 1 ? '' : 's'}</div>}
                            {d.seats > 0 && <div>{d.seats} seat{d.seats === 1 ? '' : 's'}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-[#0F2B4C]">Work waiting</h2>
              <span className="text-xs text-[#0F2B4C]/40">oldest item in each queue</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {queues.length === 0 ? (
                <div className="md:col-span-3 rounded-xl border border-gray-100 bg-white p-5 text-sm text-[#0F2B4C]/40">
                  Nothing waiting anywhere. Every queue is clear.
                </div>
              ) : (
                queues.map((q) => <QueueCard key={q.key} q={q} />)
              )}
            </div>
          </>
        )}
      </main>

      {drill && (
        <DrillDrawer
          which={drill}
          onClose={() => setDrill(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

/** Which overview cards open a drawer, and what each one lists. */
type DrillKey = 'pending' | 'active' | 'kyc';

const DRILL_META: Record<DrillKey, { title: string; blurb: string; empty: string }> = {
  pending: {
    title: 'Pending dispatch',
    blurb: 'Booked and paid for, but no driver has taken them. These need a person.',
    empty: 'Nothing waiting. Auto-match has placed every booking.',
  },
  active: {
    title: 'Active deliveries',
    blurb: 'On the road right now: assigned, picked up, or in transit.',
    empty: 'Nothing moving at the moment.',
  },
  kyc: {
    title: 'Drivers awaiting KYC',
    blurb: 'Signed up and waiting to be approved. Until you approve them they cannot earn.',
    empty: 'No drivers waiting for review.',
  },
};

/**
 * Slide-over showing the records behind an overview number, with the
 * action that queue actually needs (founder 2026-08-13: "i still need to
 * be able to take action on whatever i click").
 *
 * Deliberately not a second copy of the deliveries table: it shows the
 * few fields needed to decide, plus one action, and links out to the
 * full page for anything deeper.
 */
function DrillDrawer({ which, onClose, onChanged }: {
  which:     DrillKey;
  onClose:   () => void;
  onChanged: () => void;
}) {
  const [rows,    setRows]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const meta = DRILL_META[which];

  const load = () => {
    setLoading(true);
    const p = which === 'kyc'
      ? adminApi.drivers(1, 'pending').then((d: any) => d?.drivers ?? [])
      : adminApi.deliveries(1, which === 'pending' ? 'pending' : 'assigned').then((d: any) => d?.deliveries ?? []);
    p.then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  };

  useEffect(load, [which]);

  const approve = async (driverId: string) => {
    await adminApi.approveDriver(driverId);
    load();
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={meta.title}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-[#0F2B4C]">{meta.title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{meta.blurb}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-12">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-12 px-6">{meta.empty}</p>
          ) : which === 'kyc' ? (
            rows.map(d => (
              <div key={d.id} className="px-5 py-3 border-b border-gray-50 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#0F2B4C] truncate">{d.user?.name ?? '-'}</p>
                  <p className="text-xs text-gray-400 capitalize">{d.vehicleType ?? 'vehicle unknown'}</p>
                </div>
                <a href={`/drivers/${d.id}`} className="text-xs text-[#3A7BD5] font-semibold hover:underline">Review</a>
                <button
                  onClick={() => approve(d.id)}
                  className="text-xs font-semibold bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700"
                >
                  Approve
                </button>
              </div>
            ))
          ) : (
            rows.map(d => (
              <div key={d.id} className="px-5 py-3 border-b border-gray-50">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-[#0F2B4C]">{d.trackingCode}</span>
                  <span className="text-xs font-semibold text-[#0F2B4C]">{naira(d.price)}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1 truncate">{d.pickupAddress}</p>
                <p className="text-xs text-gray-500 truncate">→ {d.dropoffAddress}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-gray-400">
                    {d.driver?.user?.name ? `Driver: ${d.driver.user.name}` : 'No driver yet'}
                  </span>
                  <a
                    href={`/deliveries?status=${which === 'pending' ? 'pending' : 'assigned'}`}
                    className="text-xs text-[#3A7BD5] font-semibold hover:underline"
                  >
                    {which === 'pending' ? 'Assign a driver' : 'Open'}
                  </a>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
          <a
            href={which === 'kyc' ? '/kyc' : `/deliveries?status=${which === 'pending' ? 'pending' : 'assigned'}`}
            className="text-sm font-semibold text-[#0F2B4C] hover:text-[#3A7BD5]"
          >
            Open the full list →
          </a>
        </div>
      </aside>
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
          <Bar label="Revenue"    actual={targets.monthlyRevenue?.actual  ?? 0} target={targets.monthlyRevenue?.target  ?? 0} pct={targets.monthlyRevenue?.pct}    formatter={naira} />
          <Bar label="Deliveries" actual={targets.monthlyDeliveries?.actual ?? 0} target={targets.monthlyDeliveries?.target ?? 0} pct={targets.monthlyDeliveries?.pct} formatter={(n) => n.toLocaleString()} />
        </div>
      )}
    </div>
  );
}

// Channel breakdown pie. Colour palette maps to source: customer_app is
// SEIRS blue, business_app is emerald, partner_store is amber, developer_api
// is navy. Anything unknown falls back to gray.
function ChannelDonut({ data }: { data: Array<{ source: string; count: number }> }) {
  const COLOURS: Record<string, string> = {
    customer_app:  '#3A7BD5',
    business_app:  '#10B981',
    partner_store: '#F59E0B',
    developer_api: '#0F2B4C',
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
// amber between good and bad, red above bad. Renders "-" when we have no
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
        {seconds == null ? '-' : fmtDur(seconds)}
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
  const buckets: Array<{ key: string; title: string; count: number; items: any[]; render: (i: any) => string; href?: string; note?: string }> = [
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
    /*
      Five money and safety watches. The panel used to monitor three
      things, all of them a delivery running late, and said "All clear"
      while money could be sitting in the wrong place and areas could be
      closed. Each of these should normally be zero, so any non-zero is
      the story rather than a threshold to tune.
    */
    {
      key: 'refunds',
      title: 'Refunds owed to customers and never issued',
      count: anomalies.refundsOwed?.count ?? 0,
      items: [],
      href: '/wallet',
      render: () => '',
      note: anomalies.refundsOwed?.count
        ? `${naira(anomalies.refundsOwed?.totalNgn ?? 0)} of customer money still held by SEIRS.`
        : '',
    },
    {
      key: 'payouts',
      title: 'Payouts declined in the last 7 days',
      count: anomalies.payoutsDeclined7d?.count ?? 0,
      items: [],
      href: '/wallet',
      render: () => '',
      note: 'A driver was owed and the transfer was refused.',
    },
    {
      key: 'zones',
      title: 'Areas where SEIRS is not operating',
      count: anomalies.zonesBlocking?.count ?? 0,
      items: [],
      href: '/zones',
      render: () => '',
      note: 'A published zone is blocking pickups, dropoffs or both.',
    },
    {
      key: 'dropsUnconfirmed',
      title: 'Drops the passenger never confirmed',
      count: anomalies.dropsUnconfirmed?.count ?? 0,
      items: [],
      href: '/travel-buddy',
      render: () => '',
      note: 'A driver marked someone dropped and nobody agreed.',
    },
    {
      key: 'dropsGeofence',
      title: 'Drops recorded far from the declared stop',
      count: anomalies.dropsOffGeofence?.count ?? 0,
      items: [],
      href: '/travel-buddy',
      render: () => '',
      note: 'Allowed, because roads close, but worth a look.',
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
        {buckets.filter((b) => b.count > 0).map((b) => {
          // The money and zone watches carry no item list, only a
          // destination: the detail lives on a page built to work it,
          // and duplicating it here would be a second thing to keep true.
          const Body = (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#78350F]">{b.title}</span>
                <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">{b.count}</span>
              </div>
              {b.note && <p className="mt-1 text-xs text-[#78350F]/80">{b.note}</p>}
              {b.items.length > 0 && (
                <ul className="mt-2 space-y-0.5 font-mono text-xs text-[#78350F]/90">
                  {b.items.slice(0, 5).map((i, idx) => <li key={idx}>· {b.render(i)}</li>)}
                </ul>
              )}
              {b.href && (
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#3A7BD5]">
                  Open <ChevronRight size={12} />
                </span>
              )}
            </>
          );
          return b.href ? (
            <Link key={b.key} href={b.href}
              className="block rounded-lg border border-amber-100 bg-amber-50/40 p-3 transition-colors hover:bg-amber-50">
              {Body}
            </Link>
          ) : (
            <div key={b.key} className="rounded-lg border border-amber-100 bg-amber-50/40 p-3">
              {Body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A queue, its size, and how long the oldest item has been sitting.
 *
 * The age is the point. Two identical counts can be opposite problems,
 * and the old cards showed only the count: on the live database this
 * panel immediately surfaced two driver KYC reviews that had been
 * waiting 109 days behind a tile that just said "2".
 *
 * Oldest rather than average, because the thing ignored longest is the
 * thing that hurts, and an average hides it behind everything handled
 * promptly since.
 */
function QueueCard({ q }: { q: QueueRow }) {
  const empty   = q.count === 0;
  const overdue = !empty && q.oldestMinutes != null && q.oldestMinutes >= q.warnAfterMin;

  const age = q.oldestMinutes == null
    ? null
    : q.oldestMinutes < 60
      ? `${q.oldestMinutes}m`
      : q.oldestMinutes < 60 * 48
        ? `${Math.floor(q.oldestMinutes / 60)}h ${q.oldestMinutes % 60}m`
        : `${Math.floor(q.oldestMinutes / 1440)} days`;

  return (
    <Link
      href={q.href}
      className={`group block rounded-xl border p-5 shadow-sm transition-all hover:shadow-md ${
        overdue ? 'border-red-200 bg-red-50/40'
        : empty  ? 'border-gray-100 bg-white'
                 : 'border-amber-200 bg-amber-50/30'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#0F2B4C]">{q.label}</h3>
        <div className="flex items-center gap-1.5">
          {overdue && <AlertTriangle size={14} className="text-red-500" />}
          <span className={`text-2xl font-bold ${
            overdue ? 'text-red-600' : empty ? 'text-[#0F2B4C]/25' : 'text-amber-600'
          }`}>
            {q.count}
          </span>
        </div>
      </div>

      {empty ? (
        <p className="text-sm text-[#0F2B4C]/35">Nothing waiting.</p>
      ) : (
        <p className={`text-sm ${overdue ? 'text-red-700' : 'text-[#0F2B4C]/55'}`}>
          Oldest has been waiting <strong>{age}</strong>
          {overdue ? '. That is past the point it should have been handled.' : '.'}
        </p>
      )}

      <div className="mt-3 flex items-center gap-1 text-xs font-medium text-[#3A7BD5] transition-all group-hover:gap-2">
        {empty ? 'Open' : 'Work this queue'} <ChevronRight size={13} />
      </div>
    </Link>
  );
}

