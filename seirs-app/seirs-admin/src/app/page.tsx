'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

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

  const cards = stats ? [
    { label: 'Total Customers',   value: stats.users.total.toLocaleString(),          icon: '👥', color: 'bg-blue-500' },
    { label: 'Total Drivers',     value: stats.drivers.total.toLocaleString(),         icon: '🛵', color: 'bg-orange-500' },
    { label: 'Pending KYC',       value: stats.drivers.pendingKyc.toLocaleString(),    icon: '📋', color: 'bg-yellow-500' },
    { label: 'Active Deliveries', value: stats.deliveries.active.toLocaleString(),     icon: '🚀', color: 'bg-green-500' },
    { label: 'Deliveries Today',  value: stats.deliveries.today.toLocaleString(),      icon: '📦', color: 'bg-purple-500' },
    { label: 'Pending Dispatch',  value: stats.deliveries.pending.toLocaleString(),    icon: '⏳', color: 'bg-red-500' },
    { label: 'Total Revenue',     value: fmt(stats.revenue.total),                    icon: '💰', color: 'bg-emerald-600' },
    { label: 'Platform Commission', value: fmt(stats.revenue.commission),              icon: '🏦', color: 'bg-indigo-500' },
  ] : [];

  return (
    <div className="min-h-screen">

      <main className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
          <p className="text-gray-500 text-sm mt-1">
            {new Date().toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400 text-lg">Loading stats...</div>
          </div>
        ) : (
          <>
            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {cards.map((c) => (
                <div key={c.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                  <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-white text-lg ${c.color} mb-3`}>
                    {c.icon}
                  </div>
                  <div className="text-2xl font-bold text-gray-900">{c.value}</div>
                  <div className="text-sm text-gray-500 mt-1">{c.label}</div>
                </div>
              ))}
            </div>

            {/* Quick links */}
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
    <a href={href} className={`block bg-white rounded-xl p-5 shadow-sm border hover:shadow-md transition-shadow ${urgent && count > 0 ? 'border-orange-200' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className={`text-2xl font-bold ${urgent && count > 0 ? 'text-orange-500' : 'text-gray-700'}`}>{count}</span>
      </div>
      <p className="text-sm text-gray-500">{desc}</p>
      <div className="mt-3 text-sm font-medium text-[#F4600C]">View all →</div>
    </a>
  );
}
