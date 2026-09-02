'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Store, MapPin, Phone, Clock, Package, Banknote, CheckCircle2, AlertTriangle,
  Copy, ArrowLeft, FileText, Download, ExternalLink,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { naira } from '@/lib/money';
import { HardDeleteModal } from '@/components/HardDeleteModal';
import { SendDocumentModal } from '@/components/SendDocumentModal';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm, usePrompt, useNotify } from '@/components/ConfirmDialog';

/**
 * Amber for needs_replacing, never red.
 *
 * A document that was good and has run out is not a rejection, and the
 * colour is half of how that reads. Rejection means they did something
 * wrong; an expired certificate means time passed.
 */
const DOC_STATUS_STYLES: Record<string, string> = {
  approved:        'bg-emerald-100 text-emerald-700',
  submitted:       'bg-blue-100 text-blue-700',
  needs_replacing: 'bg-amber-100 text-amber-800',
  rejected:        'bg-red-100 text-red-700',
};

const DOC_STATUS_LABEL: Record<string, string> = {
  approved:        'Approved',
  submitted:       'Waiting',
  needs_replacing: 'Needs replacing',
  rejected:        'Rejected',
};

const STATUS_STYLES: Record<string, string> = {
  approved:       'bg-emerald-100 text-emerald-700',
  pending_review: 'bg-amber-100 text-amber-700',
  suspended:      'bg-red-100 text-red-700',
  rejected:       'bg-gray-100 text-gray-600',
  active:         'bg-emerald-100 text-emerald-700',
};

/** The status chip printed the raw column value: "pending_review". */
const STATUS_LABEL: Record<string, string> = {
  approved:       'Taking packages',
  active:         'Taking packages',
  pending_review: 'Waiting to be reviewed',
  suspended:      'Suspended by SEIRS',
  rejected:       'Application turned down',
};



// Everything the admin knows about one partner store: the store row, the
// owner account behind it, activity numbers, and the KYC documents from
// the application. Built because the /partners list had no click-through
// (founder 2026-08-21).
export default function PartnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);

  const [sendDocOpen,    setSendDocOpen]    = useState(false);
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const [coordsCopied,   setCoordsCopied]   = useState(false);
  const confirm = useConfirm();
  const prompt  = usePrompt();
  const notify  = useNotify();
  const [docs, setDocs] = useState<any[] | null>(null);
  const [busyDoc, setBusyDoc] = useState<string | null>(null);

  const reload = () => {
    // Returned, because the caller does reload().finally(() => setLoading(false)).
    // The documents load is fired alongside it and deliberately not awaited:
    // the page should stop spinning when the SHOP has arrived.
    const storeLoad = adminApi.partnerStores.get(id)
      .then(setData)
      .catch((e: any) => setErr(e?.message ?? 'Load failed'));
    /**
     * Reviewable documents, separate from the URL columns on the store.
     *
     * Caught rather than allowed to reject: a failure here must not blank
     * the page. The shop's address, its owner and its packages are still
     * worth showing if the document store is unreachable, and an empty
     * array renders the "nothing uploaded" line rather than a spinner
     * that never resolves.
     */
    adminApi.partnerDocuments.forStore(id).then(setDocs).catch(() => setDocs([]));
    return storeLoad;
  };

  useEffect(() => {
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  if (err || !data?.store) {
    /* A failed load and a deleted shop both rendered one line of grey
       text with no way onward. */
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-xl rounded-xl border border-gray-200 bg-white">
          <EmptyState
            icon={<AlertTriangle size={20} />}
            title={err ? 'This shop would not load' : 'There is no shop with that address'}
            body={err ?? 'It may have been removed, or the link may be wrong.'}
            action={{ label: 'Back to all shops', href: '/partners' }}
          />
        </div>
      </div>
    );
  }

  const { store, owner, activity } = data;
  const hasCoords = store.storeLat != null && store.storeLng != null;

  const exportData = async () => {
    if (!owner?.id) return;
    try {
      const bundle = await adminApi.ndpr.exportUser(owner.id);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seirs-export-${owner.id}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      void notify({ title: 'Nothing was downloaded', message: e?.message ?? 'The server refused the request.', tone: 'error' });
    }
  };

  const runHardDelete = async (reason: string) => {
    if (!owner?.id) return;
    try {
      const r = await adminApi.ndpr.hardDeleteUser(owner.id, reason.trim());
      await notify({
        title:   'The owner account has been erased',
        message: `Their personal details are gone for good. A legal archive was kept at ${new Date(r.archivedAt).toLocaleString('en-NG')}.`,
        tone:    'success',
      });
      router.push('/partners');
    } catch (e: any) {
      void notify({ title: 'Nothing was erased', message: e?.message ?? 'The server refused the request.', tone: 'error' });
    }
  };

  const copyCoords = () => {
    if (!hasCoords) return;
    navigator.clipboard.writeText(`${Number(store.storeLat).toFixed(6)}, ${Number(store.storeLng).toFixed(6)}`)
      .then(() => { setCoordsCopied(true); setTimeout(() => setCoordsCopied(false), 1500); })
      .catch(() => void notify({ title: 'Could not copy', message: 'Your browser blocked the clipboard. Read the numbers off the screen instead.', tone: 'error' }));
  };

  /*
    prompt() and confirm() are the browser's own dialogs. Chrome stops
    showing them entirely once somebody ticks "prevent this page from
    creating more dialogs", and then Suspend does nothing at all, with no
    error, on a decision that cuts a shop off from its income.
  */
  const suspendStore = async () => {
    const note = await prompt({
      title:       `Stop ${store.storeName} taking packages?`,
      message:     `The shop stops being offered to customers as a collection point straight away, and the owner loses the partner screens in their SEIRS business app.

Packages already at the counter (${data?.activity?.packagesHeldNow ?? 0} right now) still have to be collected. Call them first. You can undo this with Re-approve.`,
      label:       'Why are you suspending them',
      placeholder: 'e.g. shop closed for two weeks, packages left outside',
      minLength:   4,
      multiline:   true,
      helper:      'Kept against your name. The owner is not shown these words.',
      confirmLabel:'Suspend the shop',
      danger:      true,
    });
    if (!note?.trim()) return;
    try {
      await adminApi.suspendPartnerStore(id, note.trim());
      void notify({ title: 'Shop suspended', message: `${store.storeName} is no longer taking packages. Re-approve to put it back.`, tone: 'success' });
      reload();
    } catch (e: any) {
      void notify({ title: 'Nothing was suspended', message: `${e?.message ?? 'The server refused the request.'} The shop is still taking packages.`, tone: 'error' });
    }
  };

  const reapproveStore = async () => {
    const ok = await confirm({
      title:        `Let ${store.storeName} take packages again?`,
      message:      'The shop starts being offered to customers as a collection point again, and the owner gets the partner screens back in their business app straight away.',
      confirmLabel: 'Re-approve',
    });
    if (!ok) return;
    try {
      await adminApi.approvePartnerStore(id, 'Re-approved after suspension');
      void notify({ title: 'Shop re-approved', message: `${store.storeName} can take packages again.`, tone: 'success' });
      reload();
    } catch (e: any) {
      void notify({ title: 'Nothing changed', message: e?.message ?? 'The server refused the request.', tone: 'error' });
    }
  };

  /**
   * Per-document review.
   *
   * The founder, 2026-09-02: "you created an entire section for something
   * that could have been wired into the drivers kyc queue, and when I told
   * you, your best idea was to stack it in the same page by putting it on
   * top of each other." So these controls replace the read-only list that
   * was already here rather than adding a section beneath it.
   */
  const decide = async (
    doc: any,
    kind: 'approve' | 'reject' | 'needs_replacing',
  ) => {
    let reason: string | null = null;
    if (kind === 'reject') {
      reason = await prompt({
        title: `Why is ${doc.label.toLowerCase()} not accepted?`,
        message: 'The partner reads this word for word. Without it they send the same photo again.',
        placeholder: 'The certificate number is not readable in this photo',
        confirmLabel: 'Reject document',
      });
      if (!reason?.trim()) return;
    }
    if (kind === 'needs_replacing') {
      reason = await prompt({
        title: `Ask for a new ${doc.label.toLowerCase()}`,
        message: 'Nobody is being blamed. Say what has run out, and when, if you know.',
        placeholder: 'The CAC certificate expired on 1 August',
        confirmLabel: 'Ask for a replacement',
      });
      if (reason === null) return;
    }

    let expiresAt: string | null = null;
    if (kind === 'approve' && doc.canExpire) {
      expiresAt = await prompt({
        title: `When does ${doc.label.toLowerCase()} run out?`,
        message: 'Read it off the document. Leave it blank if it does not say. '
               + 'This is what makes the expiry warnings work at all: approved with no date, it never lapses.',
        placeholder: 'YYYY-MM-DD',
        confirmLabel: 'Approve',
      });
      if (expiresAt === null) return;
      expiresAt = expiresAt.trim() || null;
    }

    setBusyDoc(doc.id);
    try {
      if (kind === 'approve')              await adminApi.partnerDocuments.approve(doc.id, expiresAt);
      else if (kind === 'reject')          await adminApi.partnerDocuments.reject(doc.id, reason!.trim());
      else                                 await adminApi.partnerDocuments.needsReplacing(doc.id, reason?.trim() || undefined);
      void notify({
        title: kind === 'approve' ? 'Document approved'
             : kind === 'reject'  ? 'Document rejected'
             : 'Replacement asked for',
        message: `${doc.label} - the partner has been told.`,
        tone: 'success',
      });
      reload();
    } catch (e: any) {
      void notify({ title: 'Nothing changed', message: e?.message ?? 'The server refused the request.', tone: 'error' });
    } finally {
      setBusyDoc(null);
    }
  };

  const editExpiry = async (doc: any) => {
    const next = await prompt({
      title: `Expiry for ${doc.label.toLowerCase()}`,
      message: 'YYYY-MM-DD. Leave it blank to remove the date entirely, which is a real answer if it was mistyped.',
      placeholder: doc.expiresAt ?? 'YYYY-MM-DD',
      confirmLabel: 'Save date',
    });
    if (next === null) return;
    setBusyDoc(doc.id);
    try {
      await adminApi.partnerDocuments.setExpiry(doc.id, next.trim() || null);
      void notify({ title: 'Date saved', message: `${doc.label} - no new decision notice was sent.`, tone: 'success' });
      reload();
    } catch (e: any) {
      void notify({ title: 'Nothing changed', message: e?.message ?? 'The server refused the request.', tone: 'error' });
    } finally {
      setBusyDoc(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="p-8 max-w-4xl mx-auto">
        <Link href="/partners" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
          <ArrowLeft size={15} /> All partner stores
        </Link>

        {/* Store card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-start gap-6">
            <div className="w-16 h-16 rounded-full bg-[#0F2B4C] flex items-center justify-center shrink-0">
              <Store size={28} color="#fff" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900">{store.storeName}</h1>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[store.status] ?? STATUS_STYLES.rejected}`}>
                  {STATUS_LABEL[store.status] ?? store.status}
                </span>
                {store.acceptingNew ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Accepting drop-offs</span>
                ) : (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500"
                    title="The shop paused new drop-offs itself, usually because it is full. This is not a SEIRS suspension."
                  >
                    Paused by the shop
                  </span>
                )}
              </div>
              {store.storeCode && (
                <p className="mb-1 font-mono text-xs text-gray-500" title="Customers and drivers quote this code when they call about a collection.">
                  Shop code: {store.storeCode}
                </p>
              )}
              <p className="text-sm text-gray-600 flex items-center gap-1.5">
                <MapPin size={13} className="text-gray-400 shrink-0" /> {store.storeAddress || 'No address on file'}
              </p>
              <p className="text-sm text-gray-600 flex items-center gap-1.5 mt-0.5">
                <Phone size={13} className="text-gray-400 shrink-0" /> {store.phone || '-'}
              </p>
              <p className="text-sm text-gray-600 flex items-center gap-1.5 mt-0.5">
                <Clock size={13} className="text-gray-400 shrink-0" />
                {store.openTime && store.closeTime ? `Open ${store.openTime} to ${store.closeTime}` : 'Opening hours not set'}
                {' · '}{(store.operatingDays ?? []).join(', ') || 'no days set'}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Takes {store.maxCapacity == null ? 'an unset number of' : store.maxCapacity} packages a day ·
                Joined {new Date(store.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {(store.status === 'approved' || store.status === 'active') && (
                <button onClick={suspendStore}
                  title="Stops the shop being offered to customers and removes the owner's partner screens. Can be undone."
                  className="text-sm bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200 font-medium">
                  Suspend this shop
                </button>
              )}
              {store.status === 'suspended' && (
                <button onClick={reapproveStore}
                  title="Puts the shop back on the map for customers and returns the owner's partner screens."
                  className="text-sm bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg hover:bg-emerald-200 font-medium">
                  Let them take packages again
                </button>
              )}
              {owner?.id && (
                <>
                  <button onClick={() => setSendDocOpen(true)}
                    className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 font-medium flex items-center gap-1.5 justify-center">
                    <FileText size={14} /> Send document
                  </button>
                  {/* "Export NDPR data" and "NDPR hard-delete" are the names
                      of the law, not of the action. What they do is now on
                      the button; the legal name stays in the tooltip for
                      whoever is answering the request. */}
                  <button onClick={exportData}
                    title="NDPR data portability request: downloads everything SEIRS holds on this owner as a file"
                    className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 font-medium flex items-center gap-1.5 justify-center">
                    <Download size={14} /> Download their data
                  </button>
                  <button onClick={() => setHardDeleteOpen(true)}
                    title="NDPR erasure request: permanently deletes the owner's account and personal details. Cannot be undone."
                    className="text-sm bg-red-50 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 font-medium">
                    Erase the owner for good
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Map location: same copy + ops-map pattern as driver pages */}
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm mb-6 flex items-center gap-3 flex-wrap">
          <MapPin size={20} className="text-gray-700" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">Where the shop is on the map</p>
            {hasCoords ? (
              <p className="text-xs text-gray-500 font-mono">{Number(store.storeLat).toFixed(5)}, {Number(store.storeLng).toFixed(5)}</p>
            ) : (
              <p className="text-xs text-amber-700 flex items-center gap-1">
                <AlertTriangle size={11} /> No map position, so drivers can never be sent here and the shop shows on no map
              </p>
            )}
          </div>
          {hasCoords && (
            <>
              <button onClick={copyCoords}
                title="Copy coordinates"
                className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200 font-medium flex items-center gap-1.5">
                <Copy size={12} /> {coordsCopied ? 'Copied!' : 'Copy'}
              </button>
              <Link
                href={`/ops-map?lat=${Number(store.storeLat)}&lng=${Number(store.storeLng)}&label=${encodeURIComponent(store.storeName)}&from=${encodeURIComponent(`/partners/${id}`)}&fromLabel=${encodeURIComponent(`Back to ${store.storeName}`)}`}
                className="text-xs bg-[#0F2B4C] text-white px-3 py-1.5 rounded-lg hover:bg-[#163B66] font-medium flex items-center gap-1.5">
                <MapPin size={12} /> View on ops map
              </Link>
            </>
          )}
        </div>

        {/* Activity numbers */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-gray-400 mb-1"><Package size={14} /><span className="text-xs">In the shop now</span></div>
            <div className="text-2xl font-bold text-gray-900">{activity?.packagesHeldNow ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">Packages at the counter</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-gray-400 mb-1"><Package size={14} /><span className="text-xs">Since they joined</span></div>
            <div className="text-2xl font-bold text-gray-900">{activity?.lifetimeHandled ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">Packages handled</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-gray-400 mb-1"><Banknote size={14} /><span className="text-xs">Owed to this shop</span></div>
            <div className="text-2xl font-bold text-gray-900 tabular-nums">{naira(activity?.payoutsPendingNgn ?? 0)}</div>
            <div className="text-xs text-gray-500 mt-1">Earned, not yet in their bank</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-gray-400 mb-1"><Banknote size={14} /><span className="text-xs">Already paid</span></div>
            <div className="text-2xl font-bold text-gray-900 tabular-nums">{naira(activity?.payoutsPaidNgn ?? 0)}</div>
            <div className="text-xs text-gray-500 mt-1">Everything SEIRS has sent them</div>
          </div>
        </div>

        {/* Owner account */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Who owns this shop</h2>
            {owner?.id && (
              <Link href={`/users/${owner.id}`} className="text-xs text-[#3A7BD5] hover:underline flex items-center gap-1">
                Open their full account <ExternalLink size={11} />
              </Link>
            )}
          </div>
          {owner ? (
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div><p className="text-xs text-gray-400 mb-0.5">Name</p><p className="text-gray-800 font-medium">{owner.name}</p></div>
              <div><p className="text-xs text-gray-400 mb-0.5">SEIRS ID</p><p className="text-gray-800 font-mono text-xs">{owner.accountId ?? '-'}</p></div>
              <div><p className="text-xs text-gray-400 mb-0.5">Email</p><p className="text-gray-800">{owner.email}</p></div>
              <div><p className="text-xs text-gray-400 mb-0.5">Phone</p><p className="text-gray-800">{owner.phone || '-'}</p></div>
              <div className="md:col-span-2 flex flex-wrap gap-1.5">
                {owner.emailVerified && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 size={12} /> Email verified</span>
                )}
                {owner.identityVerifiedAt && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 size={12} /> ID verified</span>
                )}
              </div>
            </div>
          ) : (
            <div className="p-5 text-sm text-gray-400">
              No SEIRS account is attached to this shop, so nobody can sign in to run it. Report it to engineering.
            </div>
          )}
        </div>

        {/* KYC documents, each reviewed as itself */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900">Documents</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Decide each one on its own. Turning down a blurry photo no longer refuses the whole
              application, and the partner is told which file to send again.
            </p>
          </div>

          {docs === null ? (
            <div className="p-5 text-sm text-gray-400">Loading documents...</div>
          ) : docs.length === 0 ? (
            <div className="p-5 text-sm text-gray-400">
              Nothing was uploaded with this application. There is no shopfront photo, no CAC
              certificate and no ID to check against.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {docs.map((d: any) => {
                const busy = busyDoc === d.id;
                const expired = d.expiresAt && new Date(d.expiresAt) < new Date();
                return (
                  <div key={d.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 text-sm">{d.label}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${DOC_STATUS_STYLES[d.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {DOC_STATUS_LABEL[d.status] ?? d.status}
                          </span>
                          {d.version > 1 && (
                            <span className="text-xs text-gray-400" title="How many times this file has been replaced">
                              v{d.version}
                            </span>
                          )}
                        </div>
                        {d.rejectionReason && (
                          <p className="text-xs text-gray-600 mt-1">What they were told: {d.rejectionReason}</p>
                        )}
                        {d.reviewedByName && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Signed off by {d.reviewedByName}
                            {d.reviewedAt ? ` on ${new Date(d.reviewedAt).toLocaleDateString('en-NG')}` : ''}
                          </p>
                        )}
                        {d.canExpire && (
                          <p className={`text-xs mt-0.5 ${expired ? 'text-amber-700 font-medium' : 'text-gray-400'}`}>
                            {d.expiresAt
                              ? `${expired ? 'Ran out' : 'Valid until'} ${new Date(d.expiresAt).toLocaleDateString('en-NG')}`
                              : 'No expiry recorded, so it will never be flagged'}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        {d.url && (
                          <a href={d.url} target="_blank" rel="noreferrer"
                            className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 font-medium flex items-center gap-1.5">
                            <FileText size={13} /> Open <ExternalLink size={11} className="text-gray-400" />
                          </a>
                        )}
                        <button disabled={busy} onClick={() => decide(d, 'approve')}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
                          Approve
                        </button>
                        <button disabled={busy} onClick={() => decide(d, 'needs_replacing')}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-40"
                          title="It was fine and has run out. Nobody is being blamed.">
                          Needs replacing
                        </button>
                        <button disabled={busy} onClick={() => decide(d, 'reject')}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40">
                          Reject
                        </button>
                        {d.canExpire && (
                          <button disabled={busy} onClick={() => editExpiry(d)}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                            title="Set or clear the date without sending a fresh approval notice">
                            {d.expiresAt ? 'Change date' : 'Set date'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(store.reviewNote || store.reviewedAt) && (
            <div className="px-5 py-3 border-t border-gray-50 text-xs text-gray-500">
              {/* The store-level decision, which answers a different question
                  from the ones above: should this business be a partner at
                  all, rather than is this photograph readable. */}
              {store.reviewNote && <p className="mb-0.5">On the application as a whole: {store.reviewNote}</p>}
              {store.reviewedAt && <p>Looked at on {new Date(store.reviewedAt).toLocaleString('en-NG')}</p>}
            </div>
          )}
        </div>
      </main>

      {sendDocOpen && owner?.id && (
        <SendDocumentModal
          userName={owner.name ?? store.storeName}
          userId={owner.id}
          onClose={() => setSendDocOpen(false)}
        />
      )}
      {hardDeleteOpen && (
        <HardDeleteModal
          userName={owner?.name ?? store.storeName}
          onCancel={() => setHardDeleteOpen(false)}
          onConfirm={async (reason) => {
            setHardDeleteOpen(false);
            await runHardDelete(reason);
          }}
        />
      )}
    </div>
  );
}
