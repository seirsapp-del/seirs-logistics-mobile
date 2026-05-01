'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

const TYPE_LABELS: Record<string, string> = {
  high_cancellation_rate: 'High Cancellation Rate',
  failed_payment_pattern: 'Failed Payment Pattern',
  gps_velocity_anomaly:   'GPS Velocity Anomaly',
  duplicate_account:      'Duplicate Account',
  suspicious_withdrawal:  'Suspicious Withdrawal',
};

const STATUS_COLORS: Record<string, string> = {
  open:      'bg-red-100 text-red-700',
  reviewed:  'bg-blue-100 text-blue-700',
  dismissed: 'bg-[#0F2B4C]/5 text-[#0F2B4C]/50',
  actioned:  'bg-emerald-100 text-emerald-700',
};

export default function FraudPage() {
  const [data,    setData]    = useState<any>(null);
  const [page,    setPage]    = useState(1);
  const [filter,  setFilter]  = useState('open');
  const [loading, setLoading] = useState(true);

  const load = (p = 1) => {
    setLoading(true);
    adminApi.fraud.list(p, filter || undefined)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
    setPage(p);
  };

  useEffect(() => { load(1); }, [filter]);

  const resolve = async (id: string, status: string) => {
    await adminApi.fraud.resolve(id, status);
    load(page);
  };

  return (
    <div className="min-h-screen">
      <main className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#0F2B4C]">Fraud Flags</h1>
          <div className="flex gap-2">
            {['', 'open', 'reviewed', 'actioned', 'dismissed'].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  filter === s
                    ? 'bg-[#3A7BD5] text-white border-[#3A7BD5]'
                    : 'bg-white text-[#0F2B4C]/50 border-[#E5E7EB] hover:border-[#0F2B4C]/20'
                }`}
              >
                {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-[#0F2B4C]/30">Loading…</div>
        ) : (
          <div className="space-y-3">
            {data?.flags?.map((flag: any) => (
              <div key={flag.id} className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[flag.status] ?? ''}`}>
                        {flag.status}
                      </span>
                      <span className="text-sm font-semibold text-[#0F2B4C]">
                        {TYPE_LABELS[flag.type] ?? flag.type}
                      </span>
                    </div>
                    <p className="text-sm text-[#0F2B4C]/60">{flag.user?.name} — {flag.user?.email}</p>
                    {flag.details && (
                      <pre className="mt-2 text-xs bg-[#F5F5F0] rounded-lg p-2 text-[#0F2B4C]/50 overflow-x-auto border border-[#E5E7EB]">
                        {JSON.stringify(flag.details, null, 2)}
                      </pre>
                    )}
                    <p className="text-xs text-[#0F2B4C]/30 mt-2">
                      {new Date(flag.createdAt).toLocaleString('en-NG')}
                    </p>
                  </div>

                  {flag.status === 'open' && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => resolve(flag.id, 'reviewed')}
                        className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 font-medium transition-colors"
                      >
                        Mark Reviewed
                      </button>
                      <button
                        onClick={() => resolve(flag.id, 'actioned')}
                        className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 font-medium transition-colors"
                      >
                        Action (Ban)
                      </button>
                      <button
                        onClick={() => resolve(flag.id, 'dismissed')}
                        className="text-xs bg-[#0F2B4C]/5 text-[#0F2B4C]/60 px-3 py-1.5 rounded-lg hover:bg-[#0F2B4C]/10 font-medium transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {data?.flags?.length === 0 && (
              <div className="text-center py-16 text-[#0F2B4C]/30 bg-white rounded-xl border border-[#E5E7EB]">
                No fraud flags found
              </div>
            )}

            {data?.total > 20 && (
              <div className="flex justify-center gap-3 pt-4">
                <button onClick={() => load(page - 1)} disabled={page === 1}
                  className="px-4 py-2 text-sm rounded-lg border border-[#E5E7EB] disabled:opacity-40 hover:bg-[#F5F5F0] transition-colors">
                  Previous
                </button>
                <span className="px-4 py-2 text-sm text-[#0F2B4C]/50">Page {page}</span>
                <button onClick={() => load(page + 1)} disabled={page * 20 >= data.total}
                  className="px-4 py-2 text-sm rounded-lg border border-[#E5E7EB] disabled:opacity-40 hover:bg-[#F5F5F0] transition-colors">
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
