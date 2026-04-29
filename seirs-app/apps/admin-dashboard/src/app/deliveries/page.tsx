'use client';
import { useEffect, useState, Suspense } from 'react';
import { adminApi } from '@/lib/api';
import { useSearchParams } from 'next/navigation';
import { MapPin, Navigation } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-amber-100 text-amber-700',
  assigned:   'bg-blue-100 text-blue-700',
  picked_up:  'bg-[#F4600C]/10 text-[#F4600C]',
  in_transit: 'bg-violet-100 text-violet-700',
  delivered:  'bg-emerald-100 text-emerald-700',
  failed:     'bg-red-100 text-red-700',
  cancelled:  'bg-[#0D1B2A]/5 text-[#0D1B2A]/50',
};

function DeliveriesContent() {
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') ?? '';

  const [data, setData]       = useState<any>(null);
  const [page, setPage]       = useState(1);
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
          <h1 className="text-2xl font-bold text-[#0D1B2A]">Deliveries</h1>
          <div className="flex gap-2 flex-wrap">
            {['', 'pending', 'assigned', 'in_transit', 'delivered', 'failed'].map((s) => (
              <a
                key={s}
                href={s ? `/deliveries?status=${s}` : '/deliveries'}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  statusFilter === s
                    ? 'bg-[#F4600C] text-white border-[#F4600C]'
                    : 'bg-white text-[#0D1B2A]/50 border-[#EDE4D9] hover:border-[#0D1B2A]/20'
                }`}
              >
                {s ? s.replace('_', ' ') : 'All'}
              </a>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-[#0D1B2A]/30">Loading…</div>
        ) : (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-[#EDE4D9] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#F5F0EB] border-b border-[#EDE4D9]">
                  <tr>
                    {['Tracking', 'Customer', 'Route', 'Status', 'Price', 'Created', 'Actions'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-semibold text-[#0D1B2A]/40 text-xs uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F5F0EB]">
                  {data?.deliveries?.map((d: any) => (
                    <tr key={d.id} className="hover:bg-[#F5F0EB] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-[#0D1B2A]">{d.trackingCode}</td>
                      <td className="px-4 py-3 text-[#0D1B2A]/70">{d.customer?.name ?? '—'}</td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="flex items-start gap-1 text-xs text-[#0D1B2A]/60 mb-0.5" title={d.pickupAddress}>
                          <MapPin size={10} className="mt-0.5 shrink-0 text-[#F4600C]" />
                          <span className="truncate">{d.pickupAddress}</span>
                        </div>
                        <div className="flex items-start gap-1 text-xs text-[#0D1B2A]/60" title={d.dropoffAddress}>
                          <Navigation size={10} className="mt-0.5 shrink-0 text-emerald-500" />
                          <span className="truncate">{d.dropoffAddress}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[d.status] ?? 'bg-[#0D1B2A]/5'}`}>
                          {d.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#0D1B2A]">₦{d.price?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-[#0D1B2A]/40 text-xs">
                        {new Date(d.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        {!['delivered', 'cancelled', 'failed'].includes(d.status) && (
                          <button
                            onClick={() => handleCancel(d.id)}
                            className="text-xs text-red-600 hover:text-red-800 font-medium transition-colors"
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
                <div className="text-center py-16 text-[#0D1B2A]/30">No deliveries found</div>
              )}
            </div>

            <div className="flex items-center justify-between mt-4 text-sm text-[#0D1B2A]/50">
              <span>Total: {data?.total?.toLocaleString()} deliveries</span>
              <div className="flex gap-2">
                <button
                  onClick={() => load(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg border border-[#EDE4D9] hover:bg-[#F5F0EB] disabled:opacity-40 transition-colors text-xs font-medium"
                >
                  ← Prev
                </button>
                <span className="px-3 py-1.5 text-xs">Page {page}</span>
                <button
                  onClick={() => load(page + 1)}
                  disabled={data?.deliveries?.length < 20}
                  className="px-3 py-1.5 rounded-lg border border-[#EDE4D9] hover:bg-[#F5F0EB] disabled:opacity-40 transition-colors text-xs font-medium"
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

export default function DeliveriesPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-[#0D1B2A]/30">Loading…</div>}>
      <DeliveriesContent />
    </Suspense>
  );
}
