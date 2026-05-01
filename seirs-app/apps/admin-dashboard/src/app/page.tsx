'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import {
  Users, Truck, ClipboardList, Zap, Package,
  Clock, TrendingUp, ChevronRight, AlertTriangle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface Stats {
  users:      { total: number };
  drivers:    { total: number; pendingKyc: number };
  deliveries: { total: number; active: number; today: number; pending: number };
  revenue:    { total: number; commission: number };
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.stats(),
      adminApi.analytics.revenue(30),
    ]).then(([s, r]) => {
      setStats(s);
      setRevenue(Array.isArray(r?.data) ? r.data : []);
    }).catch(() => {}).finally(() => setLoading(false));
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
      sub: '30% of gross revenue',
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
          <div className="text-xs text-[#0F2B4C]/40 bg-white border border-[#0F2B4C]/10 px-3 py-1.5 rounded-lg">
            Live
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-[#0F2B4C]/30">Loading…</div>
          </div>
        ) : (
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

            {/* Revenue chart */}
            {revenue.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-[#0F2B4C]">Revenue — Last 30 Days</h2>
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
