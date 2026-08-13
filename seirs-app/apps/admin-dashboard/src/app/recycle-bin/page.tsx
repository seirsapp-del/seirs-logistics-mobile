'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Trash2, RotateCcw, AlertTriangle, ShieldAlert, Clock } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmDialog';
import { HardDeleteModal } from '@/components/HardDeleteModal';

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
  const confirm               = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    adminApi.pendingDeletions.list()
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const restore = async (row: PendingDeletion) => {
    const ok = await confirm({
      title:        `Restore ${row.name}?`,
      message:      'This cancels the pending deletion. The account returns to normal active state.',
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await adminApi.pendingDeletions.cancel(row.id);
      load();
    } catch (e: any) {
      alert(e?.message ?? 'Restore failed');
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
      setPurging(null);
      load();
    } catch (e: any) {
      alert(e?.message ?? 'Purge failed');
    } finally {
      setBusyId(null);
    }
  };

  const urgentCount = rows.filter((r) => {
    const days = Math.round((new Date(r.deletionScheduledAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    return days <= 3;
  }).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <Trash2 size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Recycle Bin</h1>
            <p className="text-sm text-gray-500">
              Accounts scheduled for hard-delete. 30-day NDPR grace window.
              Restore anytime before scheduled purge.
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending deletions', value: loading ? '-' : rows.length,       icon: Trash2,     color: 'text-[#0F2B4C]' },
          { label: 'Purging within 3 days', value: loading ? '-' : urgentCount,   icon: AlertTriangle, color: urgentCount > 0 ? 'text-red-600' : 'text-gray-400' },
          { label: 'Grace window',          value: '30 days',                     icon: Clock,      color: 'text-[#3A7BD5]' },
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

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-[#3A7BD5]/8 border border-[#3A7BD5]/20 rounded-xl p-4">
        <ShieldAlert size={16} className="text-[#3A7BD5] mt-0.5 shrink-0" />
        <p className="text-sm text-[#0F2B4C]">
          Users can also restore themselves by signing in during the grace window and tapping{' '}
          <span className="font-semibold">Cancel Deletion</span> in the app.
          Once the scheduled time passes, the daily 3 AM cron moves the account to{' '}
          <span className="font-mono">archived_users</span> and purges from the live table.
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-[#0F2B4C]">
            {loading ? 'Loading…' : `${rows.length} pending deletion${rows.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16">
            <Trash2 size={40} className="text-gray-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-[#0F2B4C]">Recycle bin is empty</h3>
            <p className="text-sm text-gray-500 mt-1">
              No accounts are scheduled for deletion right now.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-left px-4 py-3">SEIRS ID</th>
                  <th className="text-left px-4 py-3">Requested</th>
                  <th className="text-left px-4 py-3">By</th>
                  <th className="text-left px-4 py-3">Reason</th>
                  <th className="text-left px-4 py-3">Purges</th>
                  <th className="text-left px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => {
                  const days = Math.round((new Date(r.deletionScheduledAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                  const urgent = days <= 3;
                  return (
                    <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${urgent ? 'bg-red-50/40' : ''}`}>
                      <td className="px-4 py-3">
                        <Link href={`/users/${r.id}`} className="font-medium text-[#0F2B4C] hover:text-[#3A7BD5]">{r.name}</Link>
                        <div className="text-xs text-gray-500">{r.email}</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-600">{r.accountId ?? '-'}</td>
                      <td className="px-4 py-3 text-xs">
                        <div className="text-gray-700">{fmtDate(r.deletionRequestedAt)}</div>
                        <div className="text-gray-400">{fmtRelative(r.deletionRequestedAt)}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {r.deletionRequestedBy === 'self' ? (
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Self</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-[#0F2B4C]/10 text-[#0F2B4C] font-medium">Admin</span>
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
                            {busyId === r.id ? '…' : 'Restore'}
                          </button>
                          <button
                            onClick={() => setPurging(r)}
                            disabled={busyId === r.id}
                            className="inline-flex items-center gap-1 text-xs text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 font-medium disabled:opacity-50"
                            title="Purge now instead of waiting for the scheduled date. Cannot be undone."
                          >
                            <Trash2 size={12} />
                            Delete forever
                          </button>
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
