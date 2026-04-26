'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { useSearchParams } from 'next/navigation';

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-800',
  approved:  'bg-green-100 text-green-800',
  suspended: 'bg-red-100 text-red-800',
  rejected:  'bg-gray-100 text-gray-600',
};

const VEHICLE_ICONS: Record<string, string> = {
  bicycle: '🚲', motorcycle: '🏍️', tricycle: '🛺', car: '🚗', van: '🚐',
};

export default function DriversPage() {
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') ?? '';

  const [data, setData]     = useState<any>(null);
  const [page, setPage]     = useState(1);
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
          <h1 className="text-2xl font-bold">Drivers</h1>
          <div className="flex gap-2">
            {['', 'pending', 'approved', 'suspended'].map((s) => (
              <a
                key={s}
                href={s ? `/drivers?status=${s}` : '/drivers'}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  statusFilter === s
                    ? 'bg-[#F4600C] text-white border-[#F4600C]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                {s || 'All'}
              </a>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading...</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Driver', 'Vehicle', 'Status', 'Online', 'Rating', 'Deliveries', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data?.drivers?.map((d: any) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <a href={`/drivers/${d.id}`} className="font-medium text-gray-900 hover:text-[#F4600C]">{d.user?.name}</a>
                      <div className="text-xs text-gray-400">{d.user?.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-lg">{VEHICLE_ICONS[d.vehicleType] ?? '🚗'}</span>
                      <span className="ml-1 text-xs text-gray-600 capitalize">{d.vehicleType}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[d.status] ?? ''}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block w-2 h-2 rounded-full ${d.isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <span className="ml-2 text-xs text-gray-500">{d.isOnline ? 'Online' : 'Offline'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold">⭐ {Number(d.rating).toFixed(1)}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{d.totalDeliveries}</td>
                    <td className="px-4 py-3 flex gap-2">
                      {d.status === 'pending' && (
                        <button onClick={() => approve(d.id)} className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600 font-medium">
                          Approve
                        </button>
                      )}
                      {d.status === 'approved' && (
                        <button onClick={() => suspend(d.id)} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 font-medium">
                          Suspend
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data?.drivers?.length === 0 && (
              <div className="text-center py-16 text-gray-400">No drivers found</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
