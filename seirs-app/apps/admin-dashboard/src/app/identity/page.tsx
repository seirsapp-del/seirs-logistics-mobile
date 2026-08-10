'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck, AlertCircle, RefreshCw, Loader2, CheckCircle2, XCircle,
  ExternalLink, Clock, User as UserIcon, FileText,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmDialog';

// Customer identity-verification queue.
// Distinct from /kyc (drivers). See docs/identity-policy.md. SLA is
// 24 hours to 3 business days, FIFO by default.

type Status = 'submitted' | 'approved' | 'rejected' | 'withdrawn' | 'revoked' | 'expired';

const DOC_LABEL: Record<string, string> = {
  nin:             'NIN',
  drivers_licence: "Driver's Licence",
  passport:        'Passport',
  pvc:             'Voter’s Card (PVC)',
};

const STATUS_STYLES: Record<Status, string> = {
  submitted: 'bg-amber-100 text-amber-700',
  approved:  'bg-emerald-100 text-emerald-700',
  rejected:  'bg-red-100 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-500',
  revoked:   'bg-red-200 text-red-800',
  expired:   'bg-orange-100 text-orange-700',
};

interface Row {
  id:                   string;
  userId:               string;
  documentType:         string;
  documentPhotoUrl:     string;
  documentBackPhotoUrl: string | null;   // required post-2026-08-08; may be null on legacy
  selfiePhotoUrl:       string;
  submitterNote:        string | null;
  documentExpiryDate:   string | null;   // ISO date; only set for docs with formal expiry
  status:               Status;
  submittedAt:          string;
  reviewedAt:           string | null;
  reviewedByUserId:     string | null;
  rejectionReason:      string | null;
  revokedReason:        string | null;
  revokedAt:            string | null;
  revokedByUserId:      string | null;
  adminNote:            string | null;
  user?: {
    id:    string;
    name:  string;
    email: string;
    phone: string;
  };
}

export default function IdentityVerificationPage() {
  const confirm                 = useConfirm();
  const [status, setStatus]     = useState<Status>('submitted');
  const [items,  setItems]      = useState<Row[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [busyId,  setBusyId]    = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    adminApi.identityVerifications.list(status)
      .then(list => setItems(Array.isArray(list) ? list : []))
      .catch((e: any) => setError(e?.message ?? 'Could not load verifications'))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const approve = async (row: Row) => {
    const ok = await confirm({
      title:        `Approve ${row.user?.name ?? 'this user'}?`,
      message:      `Their identity will be verified as of now and marked "${DOC_LABEL[row.documentType] ?? row.documentType}". They immediately unlock higher wallet + reward limits, insured deliveries, interstate, and priority support. Make sure you actually checked the ID + selfie match before approving.`,
      confirmLabel: 'Approve',
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await adminApi.identityVerifications.approve(row.id);
      setSelected(null);
      load();
    } catch (e: any) { alert(e?.message ?? 'Approve failed'); }
    finally { setBusyId(null); }
  };

  const reject = async (row: Row) => {
    const reason = prompt(
      'Reason for rejection. shown to the user so they can fix + re-submit.\n\nExamples: "Photo of ID is blurry", "Selfie face doesn\'t match ID", "ID has expired", "Name on ID doesn\'t match account".',
    );
    if (!reason || reason.trim().length < 6) return;
    const ok = await confirm({
      title:        `Reject ${row.user?.name ?? 'this submission'}?`,
      message:      `The user will see: "${reason.trim()}"\n\nThey can re-submit after an hour. Their existing app access is unchanged.`,
      confirmLabel: 'Reject',
      danger:       true,
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await adminApi.identityVerifications.reject(row.id, reason.trim());
      setSelected(null);
      load();
    } catch (e: any) { alert(e?.message ?? 'Reject failed'); }
    finally { setBusyId(null); }
  };

  // Revoke an already-approved verification. Used when we discover the
  // doc was fake, expired, or the user should be reset for any reason.
  // Flips user back to unverified so trust perks stop applying immediately.
  const revoke = async (row: Row) => {
    const reason = prompt(
      'Reason for revoking. shown to the user so they know why they lost verified status.\n\nExamples: "Document later found to be fraudulent", "ID expired", "User request", "Policy violation".',
    );
    if (!reason || reason.trim().length < 6) return;
    const ok = await confirm({
      title:        `Revoke ${row.user?.name ?? 'this verification'}?`,
      message:      `The user immediately loses their verified badge and any perks tied to it (higher limits, insured deliveries, interstate access, priority support). They will see: "${reason.trim()}"\n\nThis is a serious action. Prefer rejecting a fresh submission instead when possible.`,
      confirmLabel: 'Revoke verification',
      danger:       true,
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await adminApi.identityVerifications.revoke(row.id, reason.trim());
      setSelected(null);
      load();
    } catch (e: any) { alert(e?.message ?? 'Revoke failed'); }
    finally { setBusyId(null); }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <ShieldCheck size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Identity Verification</h1>
            <p className="text-sm text-gray-500">Customer submissions. SLA 24 hours to 3 business days</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 border-b border-[#E5E7EB]">
        {(['submitted', 'approved', 'rejected', 'withdrawn'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              status === s
                ? 'border-[#3A7BD5] text-[#0F2B4C]'
                : 'border-transparent text-[#0F2B4C]/40 hover:text-[#0F2B4C]/70'
            }`}
          >
            {s === 'submitted' ? 'To Review' : s}
            {status === s && items.length > 0 && (
              <span className="ml-2 text-xs bg-[#3A7BD5] text-white px-2 py-0.5 rounded-full">{items.length}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <ShieldCheck size={32} className="mx-auto mb-3 opacity-40" />
            <p className="font-semibold">
              {status === 'submitted' ? 'Queue is empty. nothing to review right now.' : `No ${status} submissions.`}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Document</th>
                <th className="text-left px-4 py-3">Submitted</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelected(r)}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#0F2B4C]">{r.user?.name ?? '-'}</div>
                    <div className="text-xs text-gray-500">{r.user?.email ?? ''}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{DOC_LABEL[r.documentType] ?? r.documentType}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(r.submittedAt).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    <div className="text-[10px] text-gray-400">{ageOf(r.submittedAt)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLES[r.status]}`}>
                      {r.status === 'submitted' ? 'Awaiting review' : r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#3A7BD5] font-medium">Review →</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Review modal */}
      {selected && (
        <ReviewModal
          row={selected}
          onClose={() => setSelected(null)}
          onApprove={() => approve(selected)}
          onReject={() => reject(selected)}
          onRevoke={() => revoke(selected)}
          busy={busyId === selected.id}
        />
      )}
    </div>
  );
}

function ReviewModal({
  row, onClose, onApprove, onReject, onRevoke, busy,
}: {
  row: Row;
  onClose:   () => void;
  onApprove: () => void;
  onReject:  () => void;
  onRevoke:  () => void;
  busy: boolean;
}) {
  const expiryDate  = row.documentExpiryDate ? new Date(row.documentExpiryDate) : null;
  const isExpired   = !!expiryDate && expiryDate.getTime() < Date.now();
  const daysToExpiry = expiryDate
    ? Math.floor((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-[#E5E7EB] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserIcon size={18} className="text-[#3A7BD5]" />
            <div>
              <h2 className="text-base font-bold text-[#0F2B4C]">{row.user?.name ?? 'Unknown user'}</h2>
              <p className="text-xs text-[#0F2B4C]/50">{row.user?.email} · {row.user?.phone}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F5F5F0] text-[#0F2B4C]/40">
            <XCircle size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Meta */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs font-bold text-[#0F2B4C]/40 uppercase tracking-wide mb-1">Document type</p>
              <p className="text-[#0F2B4C] font-medium">{DOC_LABEL[row.documentType] ?? row.documentType}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-[#0F2B4C]/40 uppercase tracking-wide mb-1">Submitted</p>
              <p className="text-[#0F2B4C]">{new Date(row.submittedAt).toLocaleString('en-NG')}</p>
              <p className="text-xs text-gray-500">{ageOf(row.submittedAt)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-[#0F2B4C]/40 uppercase tracking-wide mb-1">Status</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLES[row.status]}`}>
                {row.status}
              </span>
            </div>
          </div>

          {/* Document expiry callout. Big amber warning if past expiry,
              smaller neutral note if valid but expiring soon. */}
          {expiryDate && (
            <div className={`p-3 rounded-lg border text-sm ${
              isExpired
                ? 'bg-red-50 border-red-300 text-red-800'
                : (daysToExpiry !== null && daysToExpiry < 30)
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-gray-50 border-gray-200 text-gray-700'
            }`}>
              <p className="text-xs font-bold uppercase tracking-wide mb-1">
                Document expiry
              </p>
              <p>
                {expiryDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
                {isExpired
                  ? '  - EXPIRED. Do not approve.'
                  : daysToExpiry !== null && daysToExpiry < 30
                    ? `  - expires in ${daysToExpiry} day${daysToExpiry === 1 ? '' : 's'}`
                    : ''}
              </p>
            </div>
          )}

          {row.submitterNote && (
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-[#0F2B4C]">
              <p className="text-xs font-bold text-[#3A7BD5] uppercase tracking-wide mb-1">Note from submitter</p>
              {row.submitterNote}
            </div>
          )}

          {/* Photos: front + back + selfie. Legacy submissions have no
              back photo so we render a placeholder instead. */}
          <div className={`grid ${row.documentBackPhotoUrl ? 'grid-cols-3' : 'grid-cols-2'} gap-4`}>
            <PhotoCard title="ID front" url={row.documentPhotoUrl} />
            {row.documentBackPhotoUrl && (
              <PhotoCard title="ID back" url={row.documentBackPhotoUrl} />
            )}
            <PhotoCard title="Selfie holding ID" url={row.selfiePhotoUrl} />
          </div>
          {!row.documentBackPhotoUrl && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Legacy submission: no back-of-ID photo. If this passes review, note that back is now required for all new submissions.
            </p>
          )}

          {/* Review guidance */}
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
            <p className="font-semibold mb-1 flex items-center gap-2">
              <AlertCircle size={14} /> Before approving, verify:
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Face on ID matches face in selfie</li>
              <li>Name on ID matches the account name ({row.user?.name})</li>
              <li>Document is not visibly expired</li>
              <li>Document is legible (no blur, glare, or cropping)</li>
              <li>Document is a genuine government-issued ID (not a screenshot / template)</li>
            </ul>
          </div>

          {/* Rejection reason (if already rejected) */}
          {row.rejectionReason && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-800">
              <p className="text-xs font-bold uppercase tracking-wide mb-1">Rejection reason (shown to user)</p>
              {row.rejectionReason}
            </div>
          )}

          {/* Revocation reason (if approved-then-revoked) */}
          {row.revokedReason && (
            <div className="p-3 rounded-lg bg-red-100 border border-red-200 text-sm text-red-900">
              <p className="text-xs font-bold uppercase tracking-wide mb-1">
                Revoked{row.revokedAt ? ` on ${new Date(row.revokedAt).toLocaleDateString('en-NG')}` : ''} - reason shown to user
              </p>
              {row.revokedReason}
            </div>
          )}

          {row.adminNote && (
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700">
              <p className="text-xs font-bold uppercase tracking-wide mb-1">Admin note (internal)</p>
              {row.adminNote}
            </div>
          )}
        </div>

        {/* Footer actions. Submitted rows get Approve/Reject; approved
            rows get Revoke. Terminal states (rejected, withdrawn, revoked,
            expired) show no actions. */}
        {row.status === 'submitted' && (
          <div className="px-6 py-4 border-t border-[#E5E7EB] flex justify-end gap-3">
            <button
              onClick={onReject}
              disabled={busy}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-40"
            >
              <XCircle size={15} /> Reject
            </button>
            <button
              onClick={onApprove}
              disabled={busy || isExpired}
              title={isExpired ? 'Document is expired. Reject instead.' : ''}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckCircle2 size={15} /> {busy ? 'Approving…' : 'Approve'}
            </button>
          </div>
        )}
        {row.status === 'approved' && (
          <div className="px-6 py-4 border-t border-[#E5E7EB] flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500 flex-1">
              Only revoke if you have evidence the doc is fake, the account is being taken over, or the user has requested it.
            </p>
            <button
              onClick={onRevoke}
              disabled={busy}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40"
            >
              <XCircle size={15} /> {busy ? 'Revoking…' : 'Revoke verification'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PhotoCard({ title, url }: { title: string; url: string }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between text-xs font-semibold text-[#0F2B4C]">
        <span className="flex items-center gap-1.5"><FileText size={12} /> {title}</span>
        <a href={url} target="_blank" rel="noreferrer" className="text-[#3A7BD5] hover:underline flex items-center gap-1">
          Open <ExternalLink size={11} />
        </a>
      </div>
      {/* Using <img> deliberately here. the R2 URLs aren't in the Next
          Image loader's allowlist, and this is admin-only surface so we
          can skip the optimisation ceremony. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={title} className="w-full h-72 object-contain bg-black/5" />
    </div>
  );
}

function ageOf(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
