'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Ban, ExternalLink } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmDialog';

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
  const [error,   setError]   = useState<string | null>(null);
  const [busyId,  setBusyId]  = useState<string | null>(null);
  const confirm               = useConfirm();

  const load = (p = 1) => {
    setLoading(true);
    setError(null);
    adminApi.fraud.list(p, filter || undefined)
      .then(setData)
      .catch((e: any) => setError(e?.message ?? 'Could not load fraud flags'))
      .finally(() => setLoading(false));
    setPage(p);
  };

  useEffect(() => { load(1); }, [filter]);

  // resolveFlag only writes the flag row's status. It has never touched
  // the account, so the old "Action (Ban)" button cleared the queue and
  // left the flagged user fully able to sign in. The label now says what
  // it does, and banning is a separate, confirmed action.
  const resolve = async (id: string, status: string) => {
    setBusyId(id);
    try {
      await adminApi.fraud.resolve(id, status);
      load(page);
    } catch (e: any) {
      setError(e?.message ?? 'Could not update this flag');
    } finally { setBusyId(null); }
  };

  // Ban the account behind the flag, then mark the flag actioned so the
  // queue reflects that something actually happened.
  const banUser = async (flag: any) => {
    const userId = flag.user?.id ?? flag.userId;
    if (!userId) { setError('This flag carries no account to ban.'); return; }
    const ok = await confirm({
      title:        `Ban ${flag.user?.name ?? 'this account'}?`,
      message:      'They are signed out on their next request and cannot use the app until unbanned. Deliveries, ledger entries and history are preserved. The flag is marked actioned at the same time.',
      confirmLabel: 'Ban account',
      danger:       true,
    });
    if (!ok) return;
    setBusyId(flag.id);
    try {
      await adminApi.updateUser(userId, { isActive: false });
      await adminApi.fraud.resolve(flag.id, 'actioned');
      load(page);
    } catch (e: any) {
      setError(e?.message ?? 'Ban failed');
    } finally { setBusyId(null); }
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

        {/* A failed fetch used to look identical to a clean board. */}
        {error && (
          <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button onClick={() => load(page)} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
          </div>
        )}

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
                    {(flag.user?.id ?? flag.userId) ? (
                      <Link
                        href={`/users/${flag.user?.id ?? flag.userId}`}
                        className="inline-flex items-center gap-1 text-sm text-[#3A7BD5] hover:underline"
                      >
                        {flag.user?.name} - {flag.user?.email}
                        <ExternalLink size={12} />
                      </Link>
                    ) : (
                      <p className="text-sm text-[#0F2B4C]/60">{flag.user?.name} - {flag.user?.email}</p>
                    )}
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
                        disabled={busyId === flag.id}
                        className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 font-medium transition-colors disabled:opacity-50"
                      >
                        Mark Reviewed
                      </button>
                      <button
                        onClick={() => resolve(flag.id, 'actioned')}
                        disabled={busyId === flag.id}
                        title="Closes the flag only. It does not touch the account."
                        className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 font-medium transition-colors disabled:opacity-50"
                      >
                        Mark Actioned
                      </button>
                      <button
                        onClick={() => banUser(flag)}
                        disabled={busyId === flag.id}
                        title="Deactivates the account, then marks the flag actioned."
                        className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Ban size={12} /> Ban account
                      </button>
                      <button
                        onClick={() => resolve(flag.id, 'dismissed')}
                        disabled={busyId === flag.id}
                        className="text-xs bg-[#0F2B4C]/5 text-[#0F2B4C]/60 px-3 py-1.5 rounded-lg hover:bg-[#0F2B4C]/10 font-medium transition-colors disabled:opacity-50"
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
