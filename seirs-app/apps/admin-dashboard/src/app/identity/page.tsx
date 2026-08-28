'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck, AlertCircle, RefreshCw, Loader2, CheckCircle2, XCircle,
  ExternalLink, User as UserIcon, FileText, Search,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm, useNotify, usePrompt } from '@/components/ConfirmDialog';

/**
 * Customer identity-verification queue.
 *
 * Distinct from /kyc, which is riders. A customer here has volunteered
 * a government ID to lift their limits; they already have full use of
 * the app either way, so nothing on this page blocks somebody from
 * using SEIRS. What it does decide is whether they are trusted with
 * higher value, insured jobs, interstate and cash on delivery, which is
 * money and liability, so the pack has to be read.
 *
 * SLA is 24 hours to 3 business days and the server hands the waiting
 * queue back oldest-first, so the top row is genuinely the next one.
 */

type Status = 'submitted' | 'approved' | 'rejected' | 'withdrawn' | 'revoked' | 'expired';

/**
 * The tabs used to render the raw column value: "withdrawn", "revoked".
 * Those are database words. Each tab now says what happened and, under
 * it, who did it, because "rejected" and "revoked" look alike and mean
 * opposite things to the person on the phone asking why their badge
 * disappeared.
 */
const TABS: Array<{ key: Status; label: string; blurb: string }> = [
  { key: 'submitted', label: 'Waiting for review', blurb: 'Sent in and not yet decided. Oldest first.' },
  { key: 'approved',  label: 'Verified',           blurb: 'Approved and currently holding the badge.' },
  { key: 'rejected',  label: 'Turned down',        blurb: 'We said no. The customer can send a new one.' },
  { key: 'withdrawn', label: 'Cancelled by the customer', blurb: 'They pulled the submission before we looked.' },
  { key: 'revoked',   label: 'Badge taken back',   blurb: 'Was approved, then withdrawn by SEIRS.' },
  { key: 'expired',   label: 'Document expired',   blurb: 'The ID passed its expiry date and lapsed on its own.' },
];

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

const statusLabel = (s: Status | string) =>
  TABS.find(t => t.key === s)?.label ?? String(s);

/** The server caps this queue at 100 rows and sends no total with it. */
const SERVER_CAP = 100;

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
  const confirm = useConfirm();
  const prompt  = usePrompt();
  const notify  = useNotify();

  const [status, setStatus]     = useState<Status>('submitted');
  const [items,  setItems]      = useState<Row[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [busyId,  setBusyId]    = useState<string | null>(null);
  // There is no server-side search on this endpoint, so this filters
  // the rows already on screen and says so, rather than pretending to
  // reach the whole table.
  const [filter,  setFilter]    = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    adminApi.identityVerifications.list(status)
      .then(list => setItems(Array.isArray(list) ? list : []))
      .catch((e: any) => setError(e?.message ?? 'Could not load the queue.'))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter(r =>
      (r.user?.name  ?? '').toLowerCase().includes(q) ||
      (r.user?.email ?? '').toLowerCase().includes(q) ||
      (r.user?.phone ?? '').toLowerCase().includes(q),
    );
  }, [items, filter]);

  const approve = async (row: Row) => {
    const name = row.user?.name ?? 'this customer';
    const ok = await confirm({
      title:   `Verify ${name}?`,
      message:
        `Their account is marked verified from now, against their ${DOC_LABEL[row.documentType] ?? row.documentType}.\n\n` +
        'It unlocks higher value limits, insured deliveries, interstate jobs and cash on delivery. It does not give them money and it changes no price.\n\n' +
        'They get an in-app notice telling them they were approved.\n\n' +
        'Check the face on the ID against the selfie and the name against the account before you press this.',
      confirmLabel: 'Approve verification',
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await adminApi.identityVerifications.approve(row.id);
      void notify({ title: 'Verified', message: `${name} has been told they are verified.`, tone: 'success' });
      setSelected(null);
      load();
    } catch (e: any) {
      void notify({ title: 'Approval failed', message: e?.message ?? 'The server refused it. Nothing was saved.', tone: 'error' });
    } finally { setBusyId(null); }
  };

  const reject = async (row: Row) => {
    const name = row.user?.name ?? 'this customer';
    /**
     * Was window.prompt(). Chrome suppresses repeat dialogs once a user
     * ticks "prevent this page from creating more dialogs", and after
     * that Reject is a button that does nothing at all with no error.
     */
    const reason = await prompt({
      title:       `Turn down ${name}?`,
      message:     'Say what is wrong with the submission so they can fix it. This exact text is shown to them.',
      label:       'Reason, shown to the customer',
      placeholder: 'Example: the photo of the ID is too blurry to read the number. Please send it again in daylight.',
      helper:      'Saved on the record and shown to the customer in the app. It stays readable here afterwards.',
      minLength:   6,
      confirmLabel: 'Continue',
      danger:      true,
    });
    if (!reason) return;
    const ok = await confirm({
      title:   `Reject ${name}?`,
      message:
        `They will see:\n\n"${reason.trim()}"\n\n` +
        'Their app access does not change: they keep everything they have today, minus the extra limits.\n\n' +
        'This record cannot be re-opened. To reverse it the customer sends a new submission, which they can do an hour after the last one.',
      confirmLabel: 'Reject submission',
      danger:       true,
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await adminApi.identityVerifications.reject(row.id, reason.trim());
      void notify({ title: 'Turned down', message: `${name} has been told why.`, tone: 'success' });
      setSelected(null);
      load();
    } catch (e: any) {
      void notify({ title: 'Rejection failed', message: e?.message ?? 'The server refused it. Nothing was saved.', tone: 'error' });
    } finally { setBusyId(null); }
  };

  /**
   * Take back a verification that was already granted. Used when the
   * document turns out to be fake or the account is being taken over.
   * The customer drops to unverified the moment this lands.
   */
  const revoke = async (row: Row) => {
    const name = row.user?.name ?? 'this customer';
    const reason = await prompt({
      title:       `Take back ${name}’s verification?`,
      message:     'Say why. This is shown to the customer and stays on the record.',
      label:       'Reason, shown to the customer',
      placeholder: 'Example: the document was later found to be forged.',
      helper:      'Saved on the record and readable on this page afterwards.',
      minLength:   6,
      confirmLabel: 'Continue',
      danger:      true,
    });
    if (!reason) return;
    const ok = await confirm({
      title:   `Remove ${name}’s verified badge?`,
      message:
        'They lose the badge and everything tied to it right now: higher limits, insured deliveries, interstate and cash on delivery.\n\n' +
        `They will see:\n\n"${reason.trim()}"\n\n` +
        'This record cannot be re-approved. Getting the badge back means a fresh submission from the customer.',
      confirmLabel: 'Take back the badge',
      danger:       true,
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await adminApi.identityVerifications.revoke(row.id, reason.trim());
      void notify({ title: 'Badge removed', message: `${name} is back to unverified and has been told why.`, tone: 'success' });
      setSelected(null);
      load();
    } catch (e: any) {
      void notify({ title: 'Could not remove it', message: e?.message ?? 'The server refused it. Nothing was saved.', tone: 'error' });
    } finally { setBusyId(null); }
  };

  const activeTab = TABS.find(t => t.key === status)!;

  return (
    <div className="p-8">
      <PageIntro
        title="Customer ID Queue"
        purpose="Read the ID a customer volunteered and decide whether to trust them with higher limits, insured deliveries, interstate and cash on delivery. Nobody here is blocked from using SEIRS while they wait."
        storageKey="identity"
        help={
          <>
            <p><strong>Approve</strong> marks the account verified and unlocks the higher limits. The customer is told in the app.</p>
            <p><strong>Reject</strong> saves your reason, shows it to the customer, and leaves their normal app access untouched. It cannot be re-opened: they send a new submission instead, an hour after the last.</p>
            <p><strong>Take back the badge</strong> is for a verification already granted that turned out to be wrong. It strips the limits immediately.</p>
            <p>Target turnaround is 24 hours to 3 business days. The waiting list is oldest first.</p>
          </>
        }
        actions={
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold text-[#0F2B4C] hover:bg-[#F5F5F0] disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      {/* Status tabs. revoked and expired had no tab at all until the
          type, the styles and the API all already supported them, so
          taking a badge back made the record vanish from the dashboard. */}
      <div className="mb-1 flex flex-wrap gap-2">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setStatus(t.key); setFilter(''); }}
            title={t.blurb}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              status === t.key
                ? 'border-[#3A7BD5] bg-[#3A7BD5] text-white'
                : 'border-[#E5E7EB] bg-white text-[#0F2B4C]/50 hover:border-[#0F2B4C]/20'
            }`}
          >
            {t.label}
            {status === t.key && items.length > 0 && (
              <span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 tabular-nums">
                {items.length}{items.length >= SERVER_CAP ? '+' : ''}
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="mb-4 text-xs text-[#0F2B4C]/50">{activeTab.blurb}</p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#0F2B4C]/30" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter the rows below by name, email or phone"
            className="w-full rounded-lg border border-[#E5E7EB] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#3A7BD5]"
          />
        </div>
        {filter.trim() !== '' && (
          <span className="text-xs text-[#0F2B4C]/50">
            {visible.length} of the {items.length} rows on screen
          </span>
        )}
      </div>

      {/* The endpoint returns at most 100 rows and no total, so a full
          queue can be hiding more and nothing else on the page would
          say so. */}
      {!loading && items.length >= SERVER_CAP && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This list stops at {SERVER_CAP} rows and there may be more waiting behind it. Work the oldest first and refresh as you clear them.
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={load} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 size={20} className="mr-2 animate-spin" /> Loading
          </div>
        ) : error ? (
          <EmptyState
            icon={<AlertCircle size={20} />}
            title="The queue could not be loaded"
            body="This is a connection or permission problem, not an empty queue. Nothing has been decided."
            action={{ label: 'Try again', onClick: load }}
          />
        ) : visible.length === 0 ? (
          filter.trim() ? (
            <EmptyState
              icon={<Search size={20} />}
              title={`Nothing on screen matches "${filter.trim()}"`}
              body="This only filters the rows already loaded. Clear it to see them all."
              action={{ label: 'Clear the filter', onClick: () => setFilter('') }}
            />
          ) : status === 'submitted' ? (
            <EmptyState
              icon={<ShieldCheck size={20} />}
              tone="good"
              title="Nobody is waiting for a decision"
              body="Every ID sent in has been reviewed. New submissions arrive here on their own."
            />
          ) : (
            <EmptyState
              icon={<FileText size={20} />}
              title={`Nothing under ${activeTab.label.toLowerCase()}`}
              body={activeTab.blurb}
            />
          )
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Document</th>
                <th className="px-4 py-3 text-left">{status === 'submitted' ? 'Waiting' : 'Sent in'}</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map(r => {
                const waited = Date.now() - new Date(r.submittedAt).getTime();
                const late   = r.status === 'submitted' && waited > 3 * 86_400_000;
                const due    = r.status === 'submitted' && waited > 86_400_000;
                return (
                  <tr key={r.id} className="cursor-pointer transition-colors hover:bg-gray-50" onClick={() => setSelected(r)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#0F2B4C]">{r.user?.name ?? 'Name missing'}</div>
                      <div className="text-xs text-gray-500">{r.user?.email ?? ''}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{DOC_LABEL[r.documentType] ?? r.documentType}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(r.submittedAt).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      <div className={`text-[10px] ${late ? 'font-semibold text-red-700' : due ? 'font-semibold text-amber-700' : 'text-gray-400'}`}>
                        {ageOf(r.submittedAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}>
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs font-medium text-[#3A7BD5]">
                        {r.status === 'submitted' ? 'Review' : 'Open'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

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
  const expiryDate   = row.documentExpiryDate ? new Date(row.documentExpiryDate) : null;
  const isExpired    = !!expiryDate && expiryDate.getTime() < Date.now();
  const daysToExpiry = expiryDate
    ? Math.floor((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-6 py-4">
          <div className="flex items-center gap-3">
            <UserIcon size={18} className="text-[#3A7BD5]" />
            <div>
              <h2 className="text-base font-bold text-[#0F2B4C]">{row.user?.name ?? 'Unknown customer'}</h2>
              <p className="text-xs text-[#0F2B4C]/50">{row.user?.email} &middot; {row.user?.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* The reviewer had no way to check who this person is:
                how long they have had an account, what they have sent,
                whether they are already flagged. That lives on their
                account page and this was a dead end. */}
            <Link
              href={`/users/${row.userId}`}
              className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-semibold text-[#0F2B4C] hover:bg-[#F5F5F0]"
            >
              Open their account
            </Link>
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-[#0F2B4C]/40 hover:bg-[#F5F5F0]">
              <XCircle size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/40">Document type</p>
              <p className="font-medium text-[#0F2B4C]">{DOC_LABEL[row.documentType] ?? row.documentType}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/40">Sent in</p>
              <p className="text-[#0F2B4C]">{new Date(row.submittedAt).toLocaleString('en-NG')}</p>
              <p className="text-xs text-gray-500">{ageOf(row.submittedAt)}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/40">Status</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status]}`}>
                {statusLabel(row.status)}
              </span>
            </div>
          </div>

          {/* Expiry callout: red past the date, amber inside a month. */}
          {expiryDate && (
            <div className={`rounded-lg border p-3 text-sm ${
              isExpired
                ? 'border-red-300 bg-red-50 text-red-800'
                : (daysToExpiry !== null && daysToExpiry < 30)
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-gray-200 bg-gray-50 text-gray-700'
            }`}>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide">Document expiry</p>
              <p>
                {expiryDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
                {isExpired
                  ? '. This ID has expired. Do not approve it.'
                  : daysToExpiry !== null && daysToExpiry < 30
                    ? `. Expires in ${daysToExpiry} day${daysToExpiry === 1 ? '' : 's'}.`
                    : ''}
              </p>
            </div>
          )}

          {row.submitterNote && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-[#0F2B4C]">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#3A7BD5]">Note from the customer</p>
              {row.submitterNote}
            </div>
          )}

          {/* Front, back and selfie. Legacy submissions have no back
              photo, so a placeholder says which case this is. */}
          <div className={`grid ${row.documentBackPhotoUrl ? 'grid-cols-3' : 'grid-cols-2'} gap-4`}>
            <PhotoCard title="ID front" url={row.documentPhotoUrl} />
            {row.documentBackPhotoUrl && <PhotoCard title="ID back" url={row.documentBackPhotoUrl} />}
            <PhotoCard title="Selfie holding the ID" url={row.selfiePhotoUrl} />
          </div>
          {!row.documentBackPhotoUrl && (
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Older submission: no photo of the back of the ID. The back is required on everything sent in since 8 August 2026.
            </p>
          )}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="mb-1 flex items-center gap-2 font-semibold">
              <AlertCircle size={14} /> Before approving, check:
            </p>
            <ul className="list-inside list-disc space-y-1 text-xs">
              <li>The face on the ID is the face in the selfie</li>
              <li>The name on the ID matches the account name ({row.user?.name})</li>
              <li>The document is not past its expiry date</li>
              <li>The photo is readable: no blur, glare or cut-off corners</li>
              <li>It is a real government ID, not a screenshot or a template</li>
            </ul>
          </div>

          {row.rejectionReason && (
            <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-800">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide">Why it was turned down (the customer sees this)</p>
              {row.rejectionReason}
            </div>
          )}

          {row.revokedReason && (
            <div className="rounded-lg border border-red-200 bg-red-100 p-3 text-sm text-red-900">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide">
                Badge taken back{row.revokedAt ? ` on ${new Date(row.revokedAt).toLocaleDateString('en-NG')}` : ''}. The customer sees this
              </p>
              {row.revokedReason}
            </div>
          )}

          {row.adminNote && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide">Internal note, not shown to the customer</p>
              {row.adminNote}
            </div>
          )}
        </div>

        {/* Waiting rows get Approve and Reject. A verified one gets the
            badge-removal. Everything else is finished and says so
            instead of leaving the reviewer looking for a button. */}
        {row.status === 'submitted' && (
          <div className="flex justify-end gap-3 border-t border-[#E5E7EB] px-6 py-4">
            <button
              onClick={onReject}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
            >
              <XCircle size={15} /> Reject
            </button>
            <button
              onClick={onApprove}
              disabled={busy || isExpired}
              title={isExpired ? 'This ID has expired. Reject it instead.' : ''}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCircle2 size={15} /> {busy ? 'Approving' : 'Approve'}
            </button>
          </div>
        )}
        {row.status === 'approved' && (
          <div className="flex items-center justify-between gap-3 border-t border-[#E5E7EB] px-6 py-4">
            <p className="flex-1 text-xs text-gray-500">
              Only take the badge back if you have evidence the document is fake, the account is being taken over, or the customer asked for it.
            </p>
            <button
              onClick={onRevoke}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              <XCircle size={15} /> {busy ? 'Working' : 'Take back the badge'}
            </button>
          </div>
        )}
        {row.status !== 'submitted' && row.status !== 'approved' && (
          <div className="border-t border-[#E5E7EB] px-6 py-4 text-xs text-gray-500">
            This submission is finished and cannot be changed. If the customer should be verified, ask them to send a new ID from the app.
          </div>
        )}
      </div>
    </div>
  );
}

function PhotoCard({ title, url }: { title: string; url: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 text-xs font-semibold text-[#0F2B4C]">
        <span className="flex items-center gap-1.5"><FileText size={12} /> {title}</span>
        <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#3A7BD5] hover:underline">
          Open full size <ExternalLink size={11} />
        </a>
      </div>
      {/* Plain <img>: the storage URLs are not in the Next image loader
          allowlist, and this is admin-only surface. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={title} className="h-72 w-full bg-black/5 object-contain" />
    </div>
  );
}

function ageOf(iso: string): string {
  const ms   = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
