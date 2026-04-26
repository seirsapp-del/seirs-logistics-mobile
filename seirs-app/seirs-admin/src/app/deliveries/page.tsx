'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { useSearchParams } from 'next/navigation';

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-800',
  assigned:   'bg-blue-100 text-blue-800',
  picked_up:  'bg-orange-100 text-orange-800',
  in_transit: 'bg-purple-100 text-purple-800',
  delivered:  'bg-green-100 text-green-800',
  failed:     'bg-red-100 text-red-800',
  cancelled:  'bg-gray-100 text-gray-600',
};

export default function DeliveriesPage() {
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') ?? '';

  const [data, setData] = useState<any>(null);
  const [page, setPage]   = useState(1);
  const [loading, setLoading] = useState(true);

  const load = (p = 1) => {
    setLoading(true);
    adminApi.deliveries(p, statusFilter || undefined)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
    setPage(p);
  };

  useEffect(() => { load(1); }, [statusFilter]);

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this delivery?')) return;
    await adminApi.cancelDelivery(id);
    load(page);
  };

  return (
    <div className="min-h-screen">
      <main className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Deliveries</h1>
          <div className="flex gap-2">
            {['', 'pending', 'assigned', 'in_transit', 'delivered', 'failed'].map((s) => (
              <a
                key={s}
                href={s ? `/deliveries?status=${s}` : '/deliveries'}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
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
          <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Tracking', 'Customer', 'Route', 'Status', 'Price', 'Created', 'Actions'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data?.deliveries?.map((d: any) => (
                    <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-gray-900">{d.trackingCode}</td>
                      <td className="px-4 py-3 text-gray-700">{d.customer?.name ?? '—'}</td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="text-xs text-gray-600 truncate" title={d.pickupAddress}>📍 {d.pickupAddress}</div>
                        <div className="text-xs text-gray-600 truncate" title={d.dropoffAddress}>🏁 {d.dropoffAddress}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[d.status] ?? 'bg-gray-100'}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">₦{d.price?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(d.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        {!['delivered', 'cancelled', 'failed'].includes(d.status) && (
                          <button
                            onClick={() => handleCancel(d.id)}
                            className="text-xs text-red-600 hover:text-red-800 font-medium"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {data?.deliveries?.length === 0 && (
                <div className="text-center py-16 text-gray-400">No deliveries found</div>
              )}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>Total: {data?.total?.toLocaleString()} deliveries</span>
              <div className="flex gap-2">
                <button
                  onClick={() => load(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                >
                  ← Prev
                </button>
                <span className="px-3 py-1.5">Page {page}</span>
                <button
                  onClick={() => load(page + 1)}
                  disabled={data?.deliveries?.length < 20}
                  className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
