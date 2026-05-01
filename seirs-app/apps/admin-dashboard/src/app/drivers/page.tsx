'use client';
import { useEffect, useState, Suspense } from 'react';
import { adminApi } from '@/lib/api';
import { useSearchParams } from 'next/navigation';
import { Bike, Car, Truck, Star } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  approved:  'bg-emerald-100 text-emerald-700',
  suspended: 'bg-red-100 text-red-700',
  rejected:  'bg-[#0F2B4C]/5 text-[#0F2B4C]/50',
};

const VEHICLE_ICONS: Record<string, LucideIcon> = {
  bicycle: Bike, motorcycle: Bike, tricycle: Truck, car: Car, van: Truck,
};

function DriversContent() {
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') ?? '';

  const [data, setData]       = useState<any>(null);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);

  const load = (p = 1) => {
    setLoading(true);
    adminApi.drivers(p, statusFilter || undefined)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
    setPage(p);
  };

  useEffect(() => { load(1); }, [statusFilter]);

  const approve = async (id: string) => {
    await adminApi.approveDriver(id);
    load(page);
  };

  const suspend = async (id: string) => {
    if (!confirm('Suspend this driver?')) return;
    await adminApi.suspendDriver(id);
    load(page);
  };

  return (
    <div className="min-h-screen">
      <main className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#0F2B4C]">Drivers</h1>
          <div className="flex gap-2">
            {['', 'pending', 'approved', 'suspended'].map((s) => (
              <a
                key={s}
                href={s ? `/drivers?status=${s}` : '/drivers'}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  statusFilter === s
                    ? 'bg-[#3A7BD5] text-white border-[#3A7BD5]'
                    : 'bg-white text-[#0F2B4C]/50 border-[#E5E7EB] hover:border-[#0F2B4C]/20'
                }`}
              >
                {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
              </a>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-[#0F2B4C]/30">Loading…</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F5F0] border-b border-[#E5E7EB]">
                <tr>
                  {['Driver', 'Vehicle', 'Status', 'Online', 'Rating', 'Deliveries', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-semibold text-[#0F2B4C]/40 text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F0]">
                {data?.drivers?.map((d: any) => {
                  const VehicleIcon = VEHICLE_ICONS[d.vehicleType] ?? Car;
                  return (
                    <tr key={d.id} className="hover:bg-[#F5F5F0] transition-colors">
                      <td className="px-4 py-3">
                        <a href={`/drivers/${d.id}`} className="font-medium text-[#0F2B4C] hover:text-[#3A7BD5] transition-colors">{d.user?.name}</a>
                        <div className="text-xs text-[#0F2B4C]/40">{d.user?.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <VehicleIcon size={14} className="text-[#0F2B4C]/50" />
                          <span className="text-xs text-[#0F2B4C]/60 capitalize">{d.vehicleType}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[d.status] ?? ''}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-block w-2 h-2 rounded-full ${d.isOnline ? 'bg-emerald-500' : 'bg-[#0F2B4C]/20'}`} />
                          <span className="text-xs text-[#0F2B4C]/50">{d.isOnline ? 'Online' : 'Offline'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Star size={12} fill="#FFBE0B" color="#FFBE0B" />
                          <span className="font-semibold text-[#0F2B4C]">{Number(d.rating).toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#0F2B4C]/70">{d.totalDeliveries}</td>
                      <td className="px-4 py-3 flex gap-2">
                        {d.status === 'pending' && (
                          <button onClick={() => approve(d.id)} className="text-xs bg-emerald-500 text-white px-2 py-1 rounded-lg hover:bg-emerald-600 font-medium transition-colors">
                            Approve
                          </button>
                        )}
                        {d.status === 'approved' && (
                          <button onClick={() => suspend(d.id)} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg hover:bg-red-200 font-medium transition-colors">
                            Suspend
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data?.drivers?.length === 0 && (
              <div className="text-center py-16 text-[#0F2B4C]/30">No drivers found</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function DriversPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-[#0F2B4C]/30">Loading…</div>}>
      <DriversContent />
    </Suspense>
  );
}
