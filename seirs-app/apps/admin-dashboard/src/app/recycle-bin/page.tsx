'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Trash2, RotateCcw, AlertTriangle, ShieldAlert, Clock } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { useConfirm, useNotify } from '@/components/ConfirmDialog';
import { HardDeleteModal } from '@/components/HardDeleteModal';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { roleLabel } from '@/lib/labels';
import { canHardDeleteAccount } from '@/lib/rbac';
import { getUser } from '@/lib/auth';

// Recycle Bin: users scheduled for hard-delete but still within the 30-day
// grace window. Admin can restore (cancel deletion) or force-purge now.
// See users.service.ts:archiveExpiredAccounts for the daily cron that
// actually runs the purge.

interface PendingDeletion {
  id:                  string;
  name:                string;
  email:               string;
  phone:               string | null;
  role:                string;
  accountId:           string | null;
  deletionRequestedAt: string | null;
  deletionScheduledAt: string;
  deletionRequestedBy: string | null;
  deletionReason:      string | null;
  createdAt:           string;
}

const fmtRelative = (iso: string | null): string => {
  if (!iso) return '-';
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
};

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

export default function RecycleBinPage() {
  const [rows, setRows]       = useState<PendingDeletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState<string | null>(null);
  // Which row is being purged for good. Held separately from busyId so
  // the two-stage modal cannot be confused with the one-tap restore.
  const [purging, setPurging] = useState<PendingDeletion | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const confirm               = useConfirm();
  const notify                = useNotify();
  // "Delete forever" is the same super_admin/support_agent NDPR path as
  // /users/[id]. Rendering it to every role that can reach this
  // compliance surface promised a purge the API then refused.
  const canPurge              = canHardDeleteAccount(getUser());

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    adminApi.pendingDeletions.list()
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((e: any) => { setRows([]); setError(e?.message ?? 'Could not load the recycle bin'); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const restore = async (row: PendingDeletion) => {
    const ok = await confirm({
      title:        `Keep ${row.name}'s account?`,
      message:
        'The deletion is called off and the account goes back to normal straight away.\n\n' +
        'They are told their account was kept. Their deliveries, points and history are all still there.\n\n' +
        'Nothing is lost by doing this: it can be scheduled for deletion again later.',
      confirmLabel: 'Keep the account',
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await adminApi.pendingDeletions.cancel(row.id);
      void notify({ title: 'Account kept', message: `${row.name} will not be deleted, and has been told.`, tone: 'success' });
      load();
    } catch (e: any) {
      void notify({ title: 'It was not restored', message: e?.message ?? 'The server refused it. The account is still scheduled for deletion.', tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Delete forever: skip the rest of the grace window and purge now.
   * Same NDPR path as the users page, behind the same two-stage guard
   * (reason for the audit log, then type the name). Nothing here can be
   * undone, which is exactly why it is not a one-tap button next to
   * Restore.
   */
  const purgeNow = async (reason: string) => {
    if (!purging) return;
    const row = purging;
    setBusyId(row.id);
    try {
      await adminApi.ndpr.hardDeleteUser(row.id, reason.trim());
      void notify({ title: 'Erased', message: `${row.name}'s account is gone for good. Only the anonymous archive record remains.`, tone: 'success' });
      setPurging(null);
      load();
    } catch (e: any) {
      void notify({ title: 'Nothing was erased', message: e?.message ?? 'The server refused it. The account is untouched.', tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const urgentCount = rows.filter((r) => {
    const days = Math.round((new Date(r.deletionScheduledAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    return days <= 3;
  }).length;

  /**
   * Soonest to be erased, first. The rows arrived in whatever order the
   * server returned, so the account with two days left could be below
   * one with twenty-eight, on the one screen where the deadline is the
   * entire point.
   */
  const sorted = useMemo(
    () => [...rows].sort(
      (a, b) => new Date(a.deletionScheduledAt).getTime() - new Date(b.deletionScheduledAt).getTime(),
    ),
    [rows],
  );

  return (
    <div className="space-y-6 p-8">
      <PageIntro
        title="Recycle Bin"
        purpose="Accounts on their way to being erased for good. Anybody here can still be saved, right up until the date shown."
        storageKey="recycle-bin"
        help={
          <>
            <p><strong>Keep the account</strong> calls the deletion off and tells the person. Nothing is lost, and it can be scheduled again later.</p>
            <p><strong>Erase for good</strong> skips the rest of the waiting period and destroys the account now. It asks for a reason and then asks you to type the name, because it cannot be undone by anybody.</p>
            <p>Doing nothing is also a decision: on the date shown, the account is erased automatically overnight.</p>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Accounts waiting to be erased', value: loading ? '-' : rows.length,     icon: Trash2,        color: 'text-[#0F2B4C]' },
          { label: 'Gone within 3 days',            value: loading ? '-' : urgentCount,     icon: AlertTriangle, color: urgentCount > 0 ? 'text-red-600' : 'text-gray-400' },
          { label: 'How long people get to change their mind', value: '30 days',            icon: Clock,         color: 'text-[#3A7BD5]' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#0F2B4C]/8 flex items-center justify-center">
              <Icon size={18} className={color} />
            </div>
            <div>
              <div className={`text-xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* A failed fetch used to render as "Recycle bin is empty", which on a
          compliance surface reads as "nothing is scheduled for deletion". */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={load} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
        </div>
      )}

      {!canPurge && (
        <p className="text-xs text-gray-500">
          You can keep an account, but not erase one early: that needs a Super Admin or Support Agent.
        </p>
      )}

      {/* Info banner. "the daily 3 AM cron moves the account to
          archived_users" was a sentence about a database table, aimed at
          somebody who has never seen one. */}
      <div className="flex items-start gap-3 rounded-xl border border-[#3A7BD5]/20 bg-[#3A7BD5]/[0.08] p-4">
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-[#3A7BD5]" />
        <p className="text-sm text-[#0F2B4C]">
          People can also save themselves: signing in before the date and tapping{' '}
          <span className="font-semibold">Cancel Deletion</span> in the app calls it off.
          After that date the account is erased overnight, leaving only an anonymous record that an account of that
          type existed. Name, email, phone and history all go.
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-[#0F2B4C]">
            {loading
              ? 'Loading'
              : `${rows.length} account${rows.length === 1 ? '' : 's'} waiting to be erased, soonest first`}
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading</div>
        ) : error ? (
          <EmptyState
            icon={<AlertTriangle size={20} />}
            title="The recycle bin could not be loaded"
            body="This is a connection or permission problem. It does not mean nothing is scheduled for deletion."
            action={{ label: 'Try again', onClick: load }}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Trash2 size={20} />}
            tone="good"
            title="Nobody is waiting to be erased"
            body="No account is scheduled for deletion. Accounts arrive here when somebody asks to leave, or when staff schedule it."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3 text-left">Account</th>
                  <th className="px-4 py-3 text-left">SEIRS ID</th>
                  <th className="px-4 py-3 text-left">Asked for</th>
                  <th className="px-4 py-3 text-left">Who asked</th>
                  <th className="px-4 py-3 text-left">Why</th>
                  <th className="px-4 py-3 text-left">Erased on</th>
                  <th className="px-4 py-3 text-left" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((r) => {
                  const days = Math.round((new Date(r.deletionScheduledAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                  const urgent = days <= 3;
                  return (
                    <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${urgent ? 'bg-red-50/40' : ''}`}>
                      <td className="px-4 py-3">
                        <Link href={`/users/${r.id}`} className="font-medium text-[#0F2B4C] hover:text-[#3A7BD5]">{r.name}</Link>
                        <div className="text-xs text-gray-500">{r.email}</div>
                        {/* Whether this is a customer, a rider or a
                            partner store changes what is being thrown
                            away, and it was in the payload unused. */}
                        {r.role && <div className="text-[10px] text-gray-400">{roleLabel(r.role)}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-600">{r.accountId ?? '-'}</td>
                      <td className="px-4 py-3 text-xs">
                        <div className="text-gray-700">{fmtDate(r.deletionRequestedAt)}</div>
                        <div className="text-gray-400">{fmtRelative(r.deletionRequestedAt)}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {r.deletionRequestedBy === 'self' ? (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700">They asked</span>
                        ) : (
                          <span className="rounded-full bg-[#0F2B4C]/10 px-2 py-0.5 font-medium text-[#0F2B4C]">SEIRS staff</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate" title={r.deletionReason ?? ''}>
                        {r.deletionReason ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className={`font-semibold ${urgent ? 'text-red-700' : 'text-gray-700'}`}>{fmtRelative(r.deletionScheduledAt)}</div>
                        <div className="text-gray-400">{fmtDate(r.deletionScheduledAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => restore(r)}
                            disabled={busyId === r.id}
                            className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-200 font-medium disabled:opacity-50"
                          >
                            <RotateCcw size={12} />
                            {busyId === r.id ? 'Working' : 'Keep the account'}
                          </button>
                          {canPurge && (
                            <button
                              onClick={() => setPurging(r)}
                              disabled={busyId === r.id}
                              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                              title="Erase now instead of waiting for the date. Nobody can undo this."
                            >
                              <Trash2 size={12} />
                              Erase for good
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {purging && (
        <HardDeleteModal
          userName={purging.name}
          onCancel={() => setPurging(null)}
          onConfirm={purgeNow}
        />
      )}
    </div>
  );
}
