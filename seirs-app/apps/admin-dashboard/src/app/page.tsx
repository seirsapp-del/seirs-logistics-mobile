'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import {
  Users, Bike, ClipboardList, Zap, Package,
  Clock, DollarSign, TrendingUp, ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Stats {
  users:      { total: number };
  drivers:    { total: number; pendingKyc: number };
  deliveries: { total: number; active: number; today: number; pending: number };
  revenue:    { total: number; commission: number };
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.stats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const cards: { label: string; value: string; Icon: LucideIcon; color: string }[] = stats ? [
    { label: 'Total Customers',     value: stats.users.total.toLocaleString(),       Icon: Users,         color: 'bg-blue-500' },
    { label: 'Total Drivers',       value: stats.drivers.total.toLocaleString(),      Icon: Bike,          color: 'bg-[#F4600C]' },
    { label: 'Pending KYC',         value: stats.drivers.pendingKyc.toLocaleString(), Icon: ClipboardList, color: 'bg-amber-500' },
    { label: 'Active Deliveries',   value: stats.deliveries.active.toLocaleString(),  Icon: Zap,           color: 'bg-emerald-500' },
    { label: 'Deliveries Today',    value: stats.deliveries.today.toLocaleString(),   Icon: Package,       color: 'bg-violet-500' },
    { label: 'Pending Dispatch',    value: stats.deliveries.pending.toLocaleString(), Icon: Clock,         color: 'bg-red-500' },
    { label: 'Total Revenue',       value: fmt(stats.revenue.total),                 Icon: DollarSign,    color: 'bg-emerald-600' },
    { label: 'Platform Commission', value: fmt(stats.revenue.commission),             Icon: TrendingUp,    color: 'bg-indigo-500' },
  ] : [];

  return (
    <div className="min-h-screen">
      <main className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#0D1B2A]">Platform Overview</h1>
          <p className="text-[#0D1B2A]/50 text-sm mt-1">
            {new Date().toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-[#0D1B2A]/30 text-lg">Loading stats…</div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {cards.map((c) => (
                <div key={c.label} className="bg-white rounded-xl p-5 shadow-sm border border-[#EDE4D9]">
                  <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${c.color} mb-3`}>
                    <c.Icon size={18} className="text-white" />
                  </div>
                  <div className="text-2xl font-bold text-[#0D1B2A]">{c.value}</div>
                  <div className="text-sm text-[#0D1B2A]/50 mt-1">{c.label}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <QuickActionCard
                title="Pending KYC Reviews"
                count={stats?.drivers.pendingKyc ?? 0}
                desc="Drivers awaiting document verification"
                href="/drivers?status=pending"
                urgent={true}
              />
              <QuickActionCard
                title="Pending Deliveries"
                count={stats?.deliveries.pending ?? 0}
                desc="Deliveries without an assigned driver"
                href="/deliveries?status=pending"
                urgent={(stats?.deliveries.pending ?? 0) > 5}
              />
              <QuickActionCard
                title="Active Deliveries"
                count={stats?.deliveries.active ?? 0}
                desc="Currently in progress"
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

function QuickActionCard({ title, count, desc, href, urgent }: {
  title: string; count: number; desc: string; href: string; urgent: boolean;
}) {
  return (
    <a href={href} className={`group block bg-white rounded-xl p-5 shadow-sm border hover:shadow-md transition-all ${urgent && count > 0 ? 'border-[#F4600C]/30' : 'border-[#EDE4D9]'}`}>
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-[#0D1B2A]">{title}</h3>
        <span className={`text-2xl font-bold ${urgent && count > 0 ? 'text-[#F4600C]' : 'text-[#0D1B2A]'}`}>{count}</span>
      </div>
      <p className="text-sm text-[#0D1B2A]/50">{desc}</p>
      <div className="mt-3 flex items-center gap-1 text-sm font-medium text-[#F4600C]">
        View all <ChevronRight size={14} />
      </div>
    </a>
  );
}
