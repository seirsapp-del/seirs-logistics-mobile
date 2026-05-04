'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Star } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  pending:    '#F59E0B',
  assigned:   '#3B82F6',
  picked_up:  '#8B5CF6',
  in_transit: '#06B6D4',
  delivered:  '#10B981',
  failed:     '#EF4444',
  cancelled:  '#6B7280',
};

const fmt = (n: number) =>
  n >= 1_000_000
    ? `₦${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `₦${(n / 1_000).toFixed(1)}K`
    : `₦${n}`;

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

  useEffect(() => {
    setLoading(true);
    Promise.all([
      adminApi.analytics.revenue(days),
      adminApi.analytics.deliveriesByStatus(),
      adminApi.analytics.topDrivers(10),
      adminApi.analytics.deliveriesByVehicle().catch(() => []),
      adminApi.analytics.deliveriesByCategory().catch(() => []),
      adminApi.analytics.driverHours(days, 8).catch(() => []),
      adminApi.analytics.referralFunnel().catch(() => null),
    ]).then(([rev, status, drivers, veh, cat, hrs, ref]) => {
      // Backend wraps revenue in { data: [...] }; other endpoints return raw arrays
      setRevenue(Array.isArray(rev) ? rev : (rev?.data ?? []));
      setByStatus(Array.isArray(status) ? status : []);
      setTopDrivers(Array.isArray(drivers) ? drivers : []);
      setByVehicle(Array.isArray(veh) ? veh : []);
      setByCategory(Array.isArray(cat) ? cat : []);
      setDriverHrs(Array.isArray(hrs) ? hrs : []);
      setReferral(ref);
    }).finally(() => setLoading(false));
  }, [days]);

  const totalRevenue    = revenue.reduce((s, r) => s + r.revenue, 0);
  const totalDeliveries = revenue.reduce((s, r) => s + r.count, 0);

  return (
    <div className="min-h-screen">
      <main className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#0F2B4C]">Analytics</h1>
          <div className="flex gap-2">
            {[7, 14, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  days === d
                    ? 'bg-[#3A7BD5] text-white border-[#3A7BD5]'
                    : 'bg-white text-[#0F2B4C]/50 border-[#E5E7EB] hover:border-[#0F2B4C]/20'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-[#0F2B4C]/30">Loading analytics…</div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-6">
                <p className="text-xs font-semibold text-[#0F2B4C]/40 uppercase tracking-wide">Total Revenue</p>
                <p className="text-3xl font-black text-[#0F2B4C] mt-1">{fmt(totalRevenue)}</p>
                <p className="text-xs text-[#0F2B4C]/30 mt-1">last {days} days</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-6">
                <p className="text-xs font-semibold text-[#0F2B4C]/40 uppercase tracking-wide">Deliveries Completed</p>
                <p className="text-3xl font-black text-[#0F2B4C] mt-1">{totalDeliveries.toLocaleString()}</p>
                <p className="text-xs text-[#0F2B4C]/30 mt-1">last {days} days</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-6">
              <h2 className="text-sm font-semibold text-[#0F2B4C]/60 mb-4">Daily Revenue (₦)</h2>
              {revenue.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={revenue} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(v) => new Date(v).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}
                      tick={{ fontSize: 11, fill: '#0F2B4C', opacity: 0.4 }}
                    />
                    <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11, fill: '#0F2B4C', opacity: 0.4 }} width={60} />
                    <Tooltip
                      formatter={(v: any) => [fmt(Number(v)), 'Revenue']}
                      labelFormatter={(l) => new Date(l).toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' })}
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
              ) : (
                <div className="h-60 flex items-center justify-center text-[#0F2B4C]/30 text-sm">No data yet</div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-6">
                <h2 className="text-sm font-semibold text-[#0F2B4C]/60 mb-4">Deliveries by Status</h2>
                {byStatus.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={byStatus}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {byStatus.map((entry) => (
                          <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#94A3B8'} />
                        ))}
                      </Pie>
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-56 flex items-center justify-center text-[#0F2B4C]/30 text-sm">No data yet</div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-6">
                <h2 className="text-sm font-semibold text-[#0F2B4C]/60 mb-4">Top Drivers</h2>
                <div className="space-y-2">
                  {topDrivers.slice(0, 8).map((d: any, i: number) => (
                    <div key={d.id} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-[#0F2B4C]/30 w-4">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#0F2B4C] truncate">{d.user?.name}</p>
                        <p className="text-xs text-[#0F2B4C]/40 capitalize">{d.vehicleType}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[#0F2B4C]">{d.totalDeliveries}</p>
                        <div className="flex items-center justify-end gap-0.5">
                          <Star size={10} fill="#FFBE0B" color="#FFBE0B" />
                          <span className="text-xs text-[#0F2B4C]/50">{Number(d.rating).toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {topDrivers.length === 0 && (
                    <p className="text-sm text-[#0F2B4C]/30 text-center py-8">No drivers yet</p>
                  )}
                </div>
              </div>
            </div>

            {/* Spec V8 — vehicle + category breakdown */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-6">
                <h2 className="text-sm font-semibold text-[#0F2B4C]/60 mb-4">Deliveries by Vehicle</h2>
                {byVehicle.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={byVehicle} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="vehicleType" tick={{ fontSize: 11, fill: '#0F2B4C', opacity: 0.4 }} />
                      <YAxis tick={{ fontSize: 11, fill: '#0F2B4C', opacity: 0.4 }} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', boxShadow: 'none' }} />
                      <Bar dataKey="count" fill="#3A7BD5" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-56 flex items-center justify-center text-[#0F2B4C]/30 text-sm">No data yet</div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-6">
                <h2 className="text-sm font-semibold text-[#0F2B4C]/60 mb-4">Deliveries by Category</h2>
                {byCategory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={byCategory}
                        dataKey="count"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {byCategory.map((entry, i) => (
                          <Cell key={entry.category} fill={['#10B981', '#3B82F6', '#F59E0B'][i % 3]} />
                        ))}
                      </Pie>
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-56 flex items-center justify-center text-[#0F2B4C]/30 text-sm">No data yet</div>
                )}
              </div>
            </div>

            {/* Driver active-hours + referral funnel */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-6">
                <h2 className="text-sm font-semibold text-[#0F2B4C]/60 mb-4">Driver Active Hours (last {days}d)</h2>
                {driverHrs.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={driverHrs} layout="vertical" margin={{ top: 4, right: 16, left: 60, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#0F2B4C', opacity: 0.4 }} />
                      <YAxis type="category" dataKey="driverName" tick={{ fontSize: 11, fill: '#0F2B4C', opacity: 0.4 }} width={80} />
                      <Tooltip
                        formatter={(v: any) => [`${v} hrs`, 'Active Time']}
                        contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', boxShadow: 'none' }}
                      />
                      <Bar dataKey="hours" fill="#10B981" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-56 flex items-center justify-center text-[#0F2B4C]/30 text-sm">No data yet</div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-6">
                <h2 className="text-sm font-semibold text-[#0F2B4C]/60 mb-4">Referral Funnel</h2>
                {referral ? (
                  <div className="flex flex-col gap-4 py-4">
                    <div>
                      <p className="text-xs font-semibold text-[#0F2B4C]/40 uppercase tracking-wide">Referred Signups</p>
                      <p className="text-3xl font-black text-[#0F2B4C] mt-1">{referral.referredSignups.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#0F2B4C]/40 uppercase tracking-wide">Completed First Delivery</p>
                      <p className="text-3xl font-black text-[#10B981] mt-1">{referral.firstDeliveryDone.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#0F2B4C]/40 uppercase tracking-wide">Conversion</p>
                      <p className="text-3xl font-black text-[#3A7BD5] mt-1">{referral.conversionPercent}%</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-56 flex items-center justify-center text-[#0F2B4C]/30 text-sm">No data yet</div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
