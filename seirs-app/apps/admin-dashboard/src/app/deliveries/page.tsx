'use client';
import { useEffect, useState, Suspense } from 'react';
import { adminApi } from '@/lib/api';
import { useSearchParams } from 'next/navigation';
import { MapPin, Navigation } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-amber-100 text-amber-700',
  assigned:   'bg-blue-100 text-blue-700',
  picked_up:  'bg-[#3A7BD5]/10 text-[#3A7BD5]',
  in_transit: 'bg-violet-100 text-violet-700',
  delivered:  'bg-emerald-100 text-emerald-700',
  failed:     'bg-red-100 text-red-700',
  cancelled:  'bg-[#0F2B4C]/5 text-[#0F2B4C]/50',
};

function DeliveriesContent() {
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') ?? '';

  const [data, setData]       = useState<any>(null);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const confirm               = useConfirm();

  /**
   * Manual dispatch (founder 2026-08-13). Auto-match handles the normal
   * case, but when it finds nobody the delivery sits at pending and a
   * dispatcher has to intervene. The backend could always do this; there
   * was simply no way to reach it from the dashboard, so pending jobs
   * had a Cancel button and nothing else.
   */
  const [assigning, setAssigning] = useState<any>(null);

  const load = (p = 1) => {
    setLoading(true);
    adminApi.deliveries(p, statusFilter || undefined)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
    setPage(p);
  };

  useEffect(() => { load(1); }, [statusFilter]);

  const handleCancel = async (id: string) => {
    const ok = await confirm({
      title:        'Cancel this delivery?',
      message:      'Notifies the customer + driver, releases any escrowed payment, and voids driver earnings for this trip. If the customer paid, they get a wallet refund. This cannot be undone.',
      confirmLabel: 'Cancel Delivery',
      danger:       true,
    });
    if (!ok) return;
    await adminApi.cancelDelivery(id);
    load(page);
  };

  return (
    <div className="min-h-screen">
      <main className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#0F2B4C]">Deliveries</h1>
          <div className="flex gap-2 flex-wrap">
            {['', 'pending', 'assigned', 'in_transit', 'delivered', 'failed'].map((s) => (
              <a
                key={s}
                href={s ? `/deliveries?status=${s}` : '/deliveries'}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  statusFilter === s
                    ? 'bg-[#3A7BD5] text-white border-[#3A7BD5]'
                    : 'bg-white text-[#0F2B4C]/50 border-[#E5E7EB] hover:border-[#0F2B4C]/20'
                }`}
              >
                {s ? s.replace('_', ' ') : 'All'}
              </a>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-[#0F2B4C]/30">Loading…</div>
        ) : (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#F5F5F0] border-b border-[#E5E7EB]">
                  <tr>
                    {['Tracking', 'Customer', 'Route', 'Status', 'Price', 'Created', 'Actions'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-semibold text-[#0F2B4C]/40 text-xs uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F5F5F0]">
                  {data?.deliveries?.map((d: any) => (
                    <tr key={d.id} className="hover:bg-[#F5F5F0] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-[#0F2B4C]">{d.trackingCode}</td>
                      <td className="px-4 py-3 text-[#0F2B4C]/70">{d.customer?.name ?? '-'}</td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="flex items-start gap-1 text-xs text-[#0F2B4C]/60 mb-0.5" title={d.pickupAddress}>
                          <MapPin size={10} className="mt-0.5 shrink-0 text-[#3A7BD5]" />
                          <span className="truncate">{d.pickupAddress}</span>
                        </div>
                        <div className="flex items-start gap-1 text-xs text-[#0F2B4C]/60" title={d.dropoffAddress}>
                          <Navigation size={10} className="mt-0.5 shrink-0 text-emerald-500" />
                          <span className="truncate">{d.dropoffAddress}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[d.status] ?? 'bg-[#0F2B4C]/5'}`}>
                          {d.status.replace('_', ' ')}
                        </span>
                        {/* Who actually took it. "Delivered" is a weak
                            answer when a customer disputes receipt. */}
                        {d.status === 'delivered' && d.receivedByRelation === 'other' && d.receivedByName && (
                          <div className="text-[10px] text-[#B45309] mt-1">
                            Left with {d.receivedByName}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#0F2B4C]">₦{d.price?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-[#0F2B4C]/40 text-xs">
                        {new Date(d.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        {!['delivered', 'cancelled', 'failed'].includes(d.status) && (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setAssigning(d)}
                              className="text-xs text-[#3A7BD5] hover:text-[#0F2B4C] font-semibold transition-colors"
                            >
                              {d.driver ? 'Reassign' : 'Assign driver'}
                            </button>
                            <button
                              onClick={() => handleCancel(d.id)}
                              className="text-xs text-red-600 hover:text-red-800 font-medium transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {data?.deliveries?.length === 0 && (
                <div className="text-center py-16 text-[#0F2B4C]/30">No deliveries found</div>
              )}
            </div>

            <div className="flex items-center justify-between mt-4 text-sm text-[#0F2B4C]/50">
              <span>Total: {data?.total?.toLocaleString()} deliveries</span>
              <div className="flex gap-2">
                <button
                  onClick={() => load(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] hover:bg-[#F5F5F0] disabled:opacity-40 transition-colors text-xs font-medium"
                >
                  ← Prev
                </button>
                <span className="px-3 py-1.5 text-xs">Page {page}</span>
                <button
                  onClick={() => load(page + 1)}
                  disabled={data?.deliveries?.length < 20}
                  className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] hover:bg-[#F5F5F0] disabled:opacity-40 transition-colors text-xs font-medium"
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {assigning && (
        <AssignDriverModal
          delivery={assigning}
          onClose={() => setAssigning(null)}
          onDone={() => { setAssigning(null); load(page); }}
        />
      )}
    </div>
  );
}

/**
 * Driver picker for manual dispatch. Lists approved drivers only,
 * because the backend rejects anyone else and finding that out after
 * clicking is a worse experience than not offering them.
 */
function AssignDriverModal({ delivery, onClose, onDone }: {
  delivery: any;
  onClose:  () => void;
  onDone:   () => void;
}) {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId,  setBusyId]  = useState<string | null>(null);
  const [search,  setSearch]  = useState('');
  const [err,     setErr]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    adminApi.drivers(1, 'approved', search || undefined)
      .then(d => setDrivers(Array.isArray(d?.drivers) ? d.drivers : []))
      .catch(() => setDrivers([]))
      .finally(() => setLoading(false));
  }, [search]);

  const assign = async (driverId: string) => {
    setBusyId(driverId); setErr(null);
    try {
      await adminApi.reassignDelivery(delivery.id, driverId);
      onDone();
    } catch (e: any) {
      setErr(e?.message ?? 'Assignment failed');
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="font-bold text-[#0F2B4C]">
            {delivery.driver ? 'Reassign' : 'Assign'} {delivery.trackingCode}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {delivery.pickupAddress} → {delivery.dropoffAddress}
          </p>
          {delivery.driver && (
            <p className="text-xs text-[#B45309] mt-1">
              Currently with {delivery.driver?.user?.name ?? 'a driver'}. Reassigning takes it off them.
            </p>
          )}
        </div>

        <div className="px-5 py-3 border-b border-gray-100">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search approved drivers by name"
            className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:border-[#3A7BD5]"
          />
        </div>

        {err && <div className="mx-5 mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-10">Loading drivers…</p>
          ) : drivers.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10">
              No approved drivers{search ? ' match that search' : ''}.
            </p>
          ) : drivers.map(dr => (
            <div key={dr.id} className="flex items-center gap-3 px-5 py-3 border-b border-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#0F2B4C] truncate">{dr.user?.name ?? '-'}</p>
                <p className="text-xs text-gray-400 capitalize">
                  {dr.vehicleType ?? 'vehicle unknown'}
                  {dr.isOnline ? ' · online' : ' · offline'}
                </p>
              </div>
              <button
                onClick={() => assign(dr.id)}
                disabled={busyId !== null}
                className="text-xs font-semibold bg-[#0F2B4C] text-white px-3 py-1.5 rounded-lg hover:bg-[#3A7BD5] disabled:opacity-50"
              >
                {busyId === dr.id ? 'Assigning…' : 'Assign'}
              </button>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">Close</button>
        </div>
      </div>
    </div>
  );
}

export default function DeliveriesPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-[#0F2B4C]/30">Loading…</div>}>
      <DeliveriesContent />
    </Suspense>
  );
}
