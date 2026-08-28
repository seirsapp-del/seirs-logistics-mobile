'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle, ClipboardCheck, ExternalLink, FileText, Loader2, Search,
  ShieldCheck, XCircle,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm, useNotify, usePrompt } from '@/components/ConfirmDialog';
import { driverStatus, humanHint } from '@/lib/labels';

/**
 * The rider approval queue.
 *
 * This page used to be a redirect to /drivers?status=pending, and that
 * redirect was the problem. The drivers table has an Approve button and
 * shows a name, a plate and a rating: not one of the eleven documents
 * the decision is actually about. Reviewing a KYC pack meant opening
 * the rider's full profile on another page, reading it, coming back,
 * and pressing a button on a row that showed none of it. In practice
 * that means the button gets pressed without the reading.
 *
 * Approving a rider lets them start earning and makes SEIRS liable for
 * what they carry. Rejecting one takes their income away before it
 * starts. Both decisions now sit directly under the evidence.
 */

const STATUSES = ['pending', 'approved', 'suspended', 'rejected'] as const;
type Status = typeof STATUSES[number];

const STATUS_STYLES: Record<Status, string> = {
  pending:   'bg-amber-100 text-amber-800',
  approved:  'bg-emerald-100 text-emerald-700',
  suspended: 'bg-red-100 text-red-700',
  rejected:  'bg-[#0F2B4C]/5 text-[#0F2B4C]/50',
};

/**
 * Spec V8 section 2.1: seven documents mandatory, the rest optional.
 * The queue said nothing about which were missing, so a pack with no
 * vehicle papers looked identical to a complete one.
 *
 * `legacy` covers the older single-file uploads early riders submitted
 * before the pack was split, so an old application does not read as
 * incomplete when the document is there under a different name.
 */
const DOCUMENTS: Array<{
  field:    string;
  legacy?:  string;
  label:    string;
  why:      string;
  required: boolean;
}> = [
  { field: 'nationalIdFrontUrl', legacy: 'idDocumentUrl', label: 'National ID, front',      why: 'Proves who they are.',                                required: true  },
  { field: 'nationalIdBackUrl',                           label: 'National ID, back',       why: 'The back carries issue and expiry detail.',           required: true  },
  { field: 'selfieUrl',                                   label: 'Selfie holding the ID',   why: 'The face on the ID must be the face applying.',       required: true  },
  { field: 'driversLicenseUrl',                           label: "Driver's licence",        why: 'Required for every vehicle that is not a bicycle.',   required: true  },
  { field: 'vehicleDocumentUrl',                          label: 'Vehicle papers',          why: 'Registration for the machine they will ride.',        required: true  },
  { field: 'ownershipProofUrl',                           label: 'Proof of ownership',      why: 'Ties the machine to a named owner.',                  required: true  },
  { field: 'vehiclePhotoUrl',                             label: 'Photo of the vehicle',    why: 'What the customer is told to look for.',              required: true  },
  { field: 'insuranceCertUrl',                            label: 'Insurance certificate',   why: 'Optional at signup, needed before interstate work.',  required: false },
  { field: 'guarantorUrl',                                label: 'Guarantor form',          why: 'Optional. Somebody who vouches for them.',            required: false },
];

export default function DriverKycQueuePage() {
  const confirm = useConfirm();
  const prompt  = usePrompt();
  const notify  = useNotify();

  const [status,  setStatus]  = useState<Status>('pending');
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // One pack open at a time. Eleven photos twice over is a scroll, not
  // a comparison.
  const [openId,      setOpenId]      = useState<string | null>(null);
  const [pack,        setPack]        = useState<any>(null);
  const [packErr,     setPackErr]     = useState<string | null>(null);
  const [packLoading, setPackLoading] = useState(false);
  const [busy,        setBusy]        = useState(false);

  const load = useCallback((p = 1, term = search, s = status) => {
    setLoading(true);
    setError(null);
    setOpenId(null);
    setPage(p);
    adminApi.drivers(p, s, term.trim() || undefined)
      .then(setData)
      // A 403 or a sleeping backend used to render as "no riders
      // waiting", which is the one wrong answer this queue can give.
      .catch((e: any) => setError(e?.message ?? 'Could not load the queue'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  useEffect(() => { load(1, search, status); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  // Debounced, so typing a plate does not fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => load(1, search, status), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const openPack = async (driverId: string) => {
    if (openId === driverId) { setOpenId(null); return; }
    setOpenId(driverId);
    setPack(null);
    setPackErr(null);
    setPackLoading(true);
    try {
      const detail = await adminApi.driver(driverId);
      setPack(detail?.driver ?? null);
    } catch (e: any) {
      setPackErr(e?.message ?? 'Could not load the documents.');
    } finally {
      setPackLoading(false);
    }
  };

  const missingRequired = (d: any): string[] =>
    DOCUMENTS.filter((doc) => doc.required && !d?.[doc.field] && !(doc.legacy && d?.[doc.legacy]))
             .map((doc) => doc.label);

  const approve = async (row: any, detail: any) => {
    const name    = row?.user?.name ?? 'this rider';
    const missing = detail ? missingRequired(detail) : [];
    const ok = await confirm({
      title:   `Put ${name} on the road?`,
      message:
        `${name} starts receiving dispatch offers immediately and can begin earning.\n\n` +
        'SEIRS emails them to say they were approved. Nobody else is told.\n\n' +
        (missing.length
          ? `WARNING: ${missing.length} required document${missing.length === 1 ? ' is' : 's are'} missing: ${missing.join(', ')}.\n\n`
          : '') +
        'This can be undone: suspending them later stops new offers.',
      confirmLabel: 'Approve rider',
      danger:       missing.length > 0,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await adminApi.approveDriver(row.id);
      void notify({ title: 'Approved', message: `${name} can now receive dispatch offers.`, tone: 'success' });
      load(page);
    } catch (e: any) {
      void notify({ title: 'Approval failed', message: e?.message ?? 'The server refused the change. Nothing was saved.', tone: 'error' });
    } finally { setBusy(false); }
  };

  const reject = async (row: any) => {
    const name   = row?.user?.name ?? 'this rider';
    const reason = await prompt({
      title:       `Turn down ${name}?`,
      message:     'Say why, in words they can act on. This exact text is emailed to them.',
      label:       'Reason, emailed to the rider',
      placeholder: 'Example: the photo of your licence is too blurry to read the expiry date. Please send it again in daylight.',
      helper:      'Emailed to the rider as written. It is NOT stored on their record, so keep a copy in your own notes if you will need it later.',
      minLength:   10,
      confirmLabel: 'Continue',
      danger:      true,
    });
    if (!reason) return;
    const ok = await confirm({
      title:   `Reject ${name}?`,
      message:
        `They will be emailed:\n\n"${reason.trim()}"\n\n` +
        'They cannot take jobs and cannot earn. This can be undone from the Rejected tab on this page.',
      confirmLabel: 'Reject rider',
      danger:       true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await adminApi.rejectDriver(row.id, reason.trim());
      void notify({ title: 'Rejected', message: `${name} has been emailed the reason.`, tone: 'success' });
      load(page);
    } catch (e: any) {
      void notify({ title: 'Rejection failed', message: e?.message ?? 'The server refused the change. Nothing was saved.', tone: 'error' });
    } finally { setBusy(false); }
  };

  /**
   * A rejected or suspended rider had no way back from any KYC screen,
   * so both states read as permanent from the queue that sets them. The
   * status setter is the same one Approve uses.
   */
  const reinstate = async (row: any) => {
    const name = row?.user?.name ?? 'this rider';
    const ok = await confirm({
      title:        `Put ${name} back on the road?`,
      message:      `${name} starts receiving dispatch offers again immediately, and is emailed to say they were approved.`,
      confirmLabel: 'Reinstate',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await adminApi.approveDriver(row.id);
      void notify({ title: 'Back on the road', message: `${name} can receive offers again.`, tone: 'success' });
      load(page);
    } catch (e: any) {
      void notify({ title: 'Could not reinstate', message: e?.message ?? 'The server refused the change.', tone: 'error' });
    } finally { setBusy(false); }
  };

  const suspend = async (row: any) => {
    const name = row?.user?.name ?? 'this rider';
    const ok = await confirm({
      title:   `Suspend ${name}?`,
      message:
        'They stop receiving new dispatch offers immediately. Any trip already running finishes normally, so nobody is left with a package in the air.\n\n' +
        'This can be undone: reinstate them from the Suspended tab on this page.',
      confirmLabel: 'Suspend',
      danger:       true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await adminApi.suspendDriver(row.id);
      void notify({ title: 'Suspended', message: `${name} will get no new offers.`, tone: 'success' });
      load(page);
    } catch (e: any) {
      void notify({ title: 'Could not suspend', message: e?.message ?? 'The server refused the change.', tone: 'error' });
    } finally { setBusy(false); }
  };

  const rows     = (data?.drivers ?? []) as any[];
  const total    = Number(data?.total ?? 0);
  const perPage  = Number(data?.limit ?? 20);
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const firstRow = total === 0 ? 0 : (page - 1) * perPage + 1;
  const lastRow  = Math.min(page * perPage, total);

  return (
    <div className="p-8">
      <PageIntro
        title="Driver KYC Queue"
        purpose="Read a new rider's documents and decide whether they can start carrying packages. Nobody in this queue can earn a naira until somebody here presses a button."
        storageKey="kyc"
        help={
          <>
            <p><strong>Review documents</strong> opens the rider&apos;s pack on this page. Read it before deciding: this is the only screen that puts it beside the buttons.</p>
            <p><strong>Approve</strong> starts their dispatch offers straight away and emails them. Reversible: suspend them later.</p>
            <p><strong>Reject</strong> emails them your reason and leaves them unable to work. Reversible from the Rejected tab.</p>
            <p><strong>Suspend</strong> stops new offers. A trip already running still finishes.</p>
          </>
        }
        actions={
          <Link
            href="/drivers"
            className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold text-[#0F2B4C] hover:bg-[#F5F5F0]"
          >
            Full rider roster
          </Link>
        }
      />

      {/* Rejected and Suspended are tabs here so a decision made on this
          page can be reversed from this page. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            title={humanHint('driver', s)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              status === s
                ? 'border-[#3A7BD5] bg-[#3A7BD5] text-white'
                : 'border-[#E5E7EB] bg-white text-[#0F2B4C]/50 hover:border-[#0F2B4C]/20'
            }`}
          >
            {driverStatus(s)}
            {status === s && total > 0 && (
              <span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 tabular-nums">{total}</span>
            )}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xl">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#0F2B4C]/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, SEIRS ID or vehicle plate"
            className="w-full rounded-lg border border-[#E5E7EB] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#3A7BD5]"
          />
        </div>
        {/* The search and the tab combine, so say which slice the count
            belongs to rather than leaving it to read as a global total. */}
        {search.trim() !== '' && (
          <span className="text-xs text-[#0F2B4C]/50">
            {total} match{total === 1 ? '' : 'es'} under {driverStatus(status).toLowerCase()}
          </span>
        )}
      </div>

      {/* Newest first is the server's order and cannot be changed from
          here, so say which end the longest wait is at rather than let
          somebody work the queue backwards without knowing. */}
      {status === 'pending' && lastPage > 1 && !loading && (
        <p className="mb-3 text-xs text-[#0F2B4C]/50">
          Newest applications first. The riders who have waited longest are on page {lastPage}.{' '}
          <button onClick={() => load(lastPage)} className="font-semibold text-[#3A7BD5] hover:underline">
            Go to the longest waiting
          </button>
        </p>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => load(page)} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-[#0F2B4C]/40">
            <Loader2 size={18} className="mr-2 animate-spin" /> Loading the queue
          </div>
        ) : error ? (
          <EmptyState
            icon={<AlertCircle size={20} />}
            title="The queue could not be loaded"
            body="This is a connection or permission problem, not an empty queue. Nothing has been decided."
            action={{ label: 'Try again', onClick: () => load(page) }}
          />
        ) : rows.length === 0 ? (
          search.trim() ? (
            <EmptyState
              icon={<Search size={20} />}
              title={`Nothing matches "${search.trim()}"`}
              body={`No ${driverStatus(status).toLowerCase()} rider matches that name, email, phone, SEIRS ID or plate.`}
              action={{ label: 'Clear the search', onClick: () => setSearch('') }}
            />
          ) : status === 'pending' ? (
            <EmptyState
              icon={<ShieldCheck size={20} />}
              tone="good"
              title="No rider is waiting to be approved"
              body="Every application has been decided. New sign-ups arrive here on their own."
            />
          ) : (
            <EmptyState
              icon={<ClipboardCheck size={20} />}
              title={`No riders are ${driverStatus(status).toLowerCase()}`}
              body="Nothing to show under this tab."
            />
          )
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[#E5E7EB] bg-[#F5F5F0]">
              <tr>
                {['Rider', 'Vehicle', 'Waiting', 'Status', ''].map((h) => (
                  <th key={h || 'actions'} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/40">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5F5F0]">
              {rows.map((d: any) => {
                const open = openId === d.id;
                return (
                  <tr key={d.id} className={open ? 'bg-[#3A7BD5]/[0.04]' : 'hover:bg-[#F5F5F0]'}>
                    <td colSpan={5} className="p-0">
                      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-4 px-4 py-3">
                        <div>
                          <div className="font-medium text-[#0F2B4C]">{d.user?.name ?? 'Name missing'}</div>
                          <div className="text-xs text-[#0F2B4C]/40">{d.user?.email}</div>
                          {d.user?.accountId && (
                            <div className="font-mono text-[10px] text-[#0F2B4C]/40">{d.user.accountId}</div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs capitalize text-[#0F2B4C]/70">{d.vehicleType ?? 'Not stated'}</div>
                          {d.vehiclePlate && (
                            <div className="mt-0.5 font-mono text-[10px] uppercase text-[#0F2B4C]/40">{d.vehiclePlate}</div>
                          )}
                        </div>
                        <WaitingFor since={d.createdAt} live={d.status === 'pending'} />
                        <div>
                          <span
                            title={humanHint('driver', d.status)}
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_STYLES[d.status as Status] ?? ''}`}
                          >
                            {driverStatus(d.status)}
                          </span>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openPack(d.id)}
                            className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2B4C] hover:bg-[#F5F5F0]"
                          >
                            {open ? 'Close documents' : 'Review documents'}
                          </button>
                          <Link
                            href={`/drivers/${d.id}`}
                            className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#3A7BD5] hover:bg-[#3A7BD5]/5"
                          >
                            Full profile
                          </Link>
                        </div>
                      </div>

                      {open && (
                        <div className="border-t border-[#E5E7EB]/60 px-4 pb-6 pt-4">
                          {packLoading ? (
                            <div className="flex items-center gap-2 py-8 text-sm text-[#0F2B4C]/40">
                              <Loader2 size={16} className="animate-spin" /> Loading the documents
                            </div>
                          ) : packErr ? (
                            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                              <AlertCircle size={16} className="mt-0.5 shrink-0" />
                              <span className="flex-1">{packErr} Do not decide without them.</span>
                              <button onClick={() => openPack(d.id)} className="shrink-0 font-semibold underline">Retry</button>
                            </div>
                          ) : pack ? (
                            <DocumentPack
                              detail={pack}
                              row={d}
                              busy={busy}
                              missing={missingRequired(pack)}
                              onApprove={() => approve(d, pack)}
                              onReject={() => reject(d)}
                              onSuspend={() => suspend(d)}
                              onReinstate={() => reinstate(d)}
                            />
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Driven by the total, never by rows.length, and it stays on
          screen for a filtered view: a search that finds 63 riders is
          exactly when the count matters most. */}
      {!loading && !error && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#0F2B4C]/50">
          <span className="tabular-nums">
            {total === 0
              ? 'Nothing to show'
              : `Showing ${firstRow.toLocaleString()}-${lastRow.toLocaleString()} of ${total.toLocaleString()} ${driverStatus(status).toLowerCase()}`}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => load(1)}        disabled={page <= 1}        className="rounded-lg border border-[#E5E7EB] px-2.5 py-1.5 text-xs font-medium hover:bg-[#F5F5F0] disabled:opacity-40">First</button>
            <button onClick={() => load(page - 1)} disabled={page <= 1}        className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-medium hover:bg-[#F5F5F0] disabled:opacity-40">Prev</button>
            <span className="px-3 py-1.5 text-xs tabular-nums">Page {page} of {lastPage}</span>
            <button onClick={() => load(page + 1)} disabled={page >= lastPage} className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-medium hover:bg-[#F5F5F0] disabled:opacity-40">Next</button>
            <button onClick={() => load(lastPage)} disabled={page >= lastPage} className="rounded-lg border border-[#E5E7EB] px-2.5 py-1.5 text-xs font-medium hover:bg-[#F5F5F0] disabled:opacity-40">Last</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * How long this person has been unable to work. Amber past a day, red
 * past three, because the published promise is a decision inside 24
 * hours to 3 business days and a queue that hides its own age is how
 * somebody ends up waiting a fortnight.
 */
function WaitingFor({ since, live }: { since?: string; live: boolean }) {
  if (!since) return <div className="text-xs text-[#0F2B4C]/30">Not recorded</div>;
  const ms   = Date.now() - new Date(since).getTime();
  const days = Math.floor(ms / 86_400_000);
  const hrs  = Math.floor(ms / 3_600_000);
  const text = hrs < 1 ? 'under an hour' : hrs < 24 ? `${hrs} hour${hrs === 1 ? '' : 's'}` : `${days} day${days === 1 ? '' : 's'}`;
  const tone = !live
    ? 'text-[#0F2B4C]/50'
    : days >= 3 ? 'font-semibold text-red-700'
    : hrs  >= 24 ? 'font-semibold text-amber-700'
    : 'text-[#0F2B4C]/50';
  return (
    <div>
      <div className={`text-xs ${tone}`}>
        {live ? text : new Date(since).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
      </div>
      {live && (
        <div className="text-[10px] text-[#0F2B4C]/30">
          since {new Date(since).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
        </div>
      )}
    </div>
  );
}

/**
 * The evidence, on the same screen as the buttons.
 *
 * Missing required documents are named at the top rather than left for
 * the reviewer to notice by counting tiles, and the buttons sit under
 * the pack so the reading happens first.
 */
function DocumentPack({
  detail, row, busy, missing, onApprove, onReject, onSuspend, onReinstate,
}: {
  detail:      any;
  row:         any;
  busy:        boolean;
  missing:     string[];
  onApprove:   () => void;
  onReject:    () => void;
  onSuspend:   () => void;
  onReinstate: () => void;
}) {
  const thirdParty = detail?.vehicleOwnership === 'third_party';
  return (
    <div className="space-y-4">
      {missing.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">
            {missing.length} required document{missing.length === 1 ? '' : 's'} not submitted
          </p>
          <p className="mt-0.5">{missing.join(', ')}. Reject with that as the reason so they know what to send.</p>
        </div>
      )}

      <div className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-3 text-sm">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/40">Who owns the machine</p>
        {thirdParty ? (
          <div className="space-y-1 text-[#0F2B4C]">
            <p><span className="text-[#0F2B4C]/50">Owner:</span> {detail.vehicleOwnerName ?? 'not given'} ({detail.vehicleOwnerRelationship ?? 'relationship not given'})</p>
            <p><span className="text-[#0F2B4C]/50">Owner phone:</span> {detail.vehicleOwnerPhone ?? 'not given'}</p>
            <p>
              <span className="text-[#0F2B4C]/50">Owner signed:</span>{' '}
              {detail.vehicleOwnerSignatureName
                ? `${detail.vehicleOwnerSignatureName}${detail.vehicleOwnerConsentAt ? ` on ${new Date(detail.vehicleOwnerConsentAt).toLocaleDateString('en-NG')}` : ''}`
                : 'no signature on file'}
            </p>
            <p className="text-xs text-[#0F2B4C]/50">
              The rider does not own this vehicle. The owner&apos;s written permission has to be in the pack below before you approve.
            </p>
          </div>
        ) : (
          <p className="text-[#0F2B4C]">The rider says the vehicle is their own.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {DOCUMENTS.map((doc) => {
          const url = detail?.[doc.field] ?? (doc.legacy ? detail?.[doc.legacy] : null);
          return <DocumentTile key={doc.field} label={doc.label} why={doc.why} url={url} required={doc.required} />;
        })}
        {thirdParty && (
          <>
            <DocumentTile label="Owner's written permission" why="The paper the owner signed by hand." url={detail?.vehicleOwnerConsentUrl} required />
            <DocumentTile label="Owner's ID"                 why="Ties that signature to a person."     url={detail?.vehicleOwnerIdUrl}      required={false} />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E5E7EB] bg-white px-4 py-3">
        <p className="max-w-xl text-xs leading-relaxed text-[#0F2B4C]/50">
          Check the face on the ID against the selfie, the name on the ID against the account name
          ({row.user?.name ?? 'unknown'}), and the plate in the vehicle photo against {row.vehiclePlate ?? 'the plate on file'}.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {row.status === 'pending' && (
            <>
              <button
                onClick={onReject}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
              >
                <XCircle size={15} /> Reject
              </button>
              <button
                onClick={onApprove}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                <ShieldCheck size={15} /> Approve rider
              </button>
            </>
          )}
          {row.status === 'approved' && (
            <button
              onClick={onSuspend}
              disabled={busy}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              Suspend
            </button>
          )}
          {(row.status === 'suspended' || row.status === 'rejected') && (
            <button
              onClick={onReinstate}
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              Reinstate rider
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentTile({
  label, why, url, required,
}: { label: string; why: string; url?: string | null; required: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white">
      <div className="flex items-center justify-between border-b border-[#E5E7EB] px-3 py-2 text-xs font-semibold text-[#0F2B4C]">
        <span className="flex min-w-0 items-center gap-1.5">
          <FileText size={12} className="shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-[#3A7BD5] hover:underline">
            Open <ExternalLink size={11} />
          </a>
        )}
      </div>
      {url ? (
        /* Plain <img>: the storage URLs are not in the Next image loader
           allowlist, and this is admin-only surface. */
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} className="h-48 w-full bg-black/5 object-contain" />
      ) : (
        <div className={`flex h-48 flex-col items-center justify-center px-3 text-center text-xs ${
          required ? 'bg-red-50 text-red-700' : 'bg-[#F5F5F0] text-[#0F2B4C]/40'
        }`}>
          <p className="font-semibold">{required ? 'Not submitted' : 'Not submitted (optional)'}</p>
          <p className="mt-1 leading-relaxed">{why}</p>
        </div>
      )}
    </div>
  );
}
