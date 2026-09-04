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
import { Section } from '@/components/DetailSections';
import dynamic from 'next/dynamic';

/**
 * Leaflet touches window on import, so it cannot be server-rendered.
 * Same treatment the delivery pages give it.
 */
const DeliveryMap = dynamic(() => import('@/components/DeliveryMap'), {
  ssr: false,
  loading: () => <div className="h-[180px] rounded-lg bg-gray-50 border border-gray-100" />,
});

/**
 * Amber for needs_replacing, never red.
 *
 * A document that was good and has run out is not a rejection, and the
 * colour is half of how that reads. Rejection means they did something
 * wrong; an expired certificate means time passed.
 */
/**
 * The four groups, in the order a reviewer works through them.
 *
 * Owner first because identity is what an approval actually rests on;
 * premises last because it is the longest and the one with photographs
 * to open. The subtitle says what makes each group get asked again, which
 * is the whole reason they are separated (see kyc-labels on the server).
 */
const DOC_GROUPS: Array<{ key: string; title: string; note: string }> = [
  { key: 'owner',    title: 'The owner',   note: 'Asked once. Does not change if the shop moves.' },
  { key: 'business', title: 'The business', note: 'Optional. Most counter shops are not registered.' },
  { key: 'premises', title: 'The premises', note: 'Asked again if the shop moves. Photographed on site.' },
  { key: 'trust',    title: 'Trust',        note: 'Optional. They hold strangers\' parcels overnight.' },
];

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
  const docsWaiting = (docs ?? []).filter((d: any) => d.status === 'submitted').length;

  /**
   * Is this shop open at this moment, in Lagos.
   *
   * Recomputed on a one-minute tick rather than at page load, because the
   * founder asked to see this live and a badge that says "open" an hour
   * after closing time is worse than no badge: somebody would ring the
   * shop on the strength of it.
   *
   * Same rules the server uses in withinWorkingHours, including the two
   * that are easy to get wrong: no hours at all means OPEN, and a window
   * whose end is before its start runs past midnight.
   */
  const [move, setMove] = useState<any>(null);
  const [audit, setAudit] = useState<any>(null);
  const [openParcel, setOpenParcel] = useState<string | null>(null);
  const [movingBusy, setMovingBusy] = useState(false);

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  // Lagos is UTC+1 all year, no daylight saving.
  const lagos = new Date(nowTick + 60 * 60 * 1000);
  const TODAY_KEY = DAY_KEYS[lagos.getUTCDay()];

  /** Approved only. A pending upload must never become the shop's face. */
  const approvedStorefront = (docs ?? []).find(
    (d: any) => d.docId === 'storefront_photo' && d.status === 'approved',
  )?.url ?? null;

  const reload = () => {
    // Returned, because the caller does reload().finally(() => setLoading(false)).
    // The documents load is fired alongside it and deliberately not awaited:
    // the page should stop spinning when the SHOP has arrived.
    // A pending move, if there is one. Failure is silent and leaves the
    // panel hidden: a shop profile must still render when this route is
    // unavailable, because everything else on the page still matters.
    adminApi.partnerMoves.forStore(id).then(setMove).catch(() => setMove(null));
    // The shelf. Loaded always, not only during a move: a bare count is
    // what made "check the parcels first" impossible to follow.
    adminApi.partnerMoves.parcels(id).then(setAudit).catch(() => setAudit(null));

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

  /**
   * Open at this moment, by the same rules the server uses.
   *
   * Sits below the early return rather than beside the timer above it
   * because `store` does not exist until `data` has loaded. The timer
   * itself has to stay above: a hook that stops running on some renders
   * is a hook that breaks the whole component.
   *
   * The two rules worth stating, both easy to get backwards: no hours at
   * all means OPEN, not shut, and an end time before a start time is a
   * window that runs past midnight rather than an error.
   */
  const openRightNow = (() => {
    const hours: any = (store as any)?.workingHours;
    if (!hours) return true;
    const today = hours[TODAY_KEY];
    if (!today?.enabled) return false;
    const toMin = (v: string) => {
      const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? ''));
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };
    const from = toMin(today.start), to = toMin(today.end);
    if (from == null || to == null) return true;
    const mins = lagos.getUTCHours() * 60 + lagos.getUTCMinutes();
    return from <= to ? mins >= from && mins < to : mins >= from || mins < to;
  })();
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
      /**
       * A real calendar, the same one the driver queue uses.
       *
       * A free-text date is ambiguous and ConfirmDialog says why in its
       * own comment: a reader cannot tell whether 03/12 is March or
       * December, and will reverse it. date:true renders an
       * <input type="date"> which can only produce an unambiguous ISO
       * date. multiline:false is required alongside it, because
       * multiline defaults to true and a date without it renders a
       * textarea with no picker at all.
       */
      const answer = await prompt({
        title: `When does ${doc.label.toLowerCase()} run out?`,
        message: 'Pick the date printed on the document. The partner is told 30 days before, '
               + 'and our team is warned again once it lapses.',
        label: 'Expiry date',
        date: true,
        multiline: false,
        helper: 'Leave it blank if the document carries no expiry date. '
              + 'Approved with no date, it never lapses and nobody is ever warned.',
        confirmLabel: 'Approve',
      });
      if (answer === null) return;
      expiresAt = String(answer).trim() || null;
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
      title: doc.expiresAt ? 'Change the expiry date' : 'When does this expire?',
      message: 'The partner is told 30 days before, and our team is warned once it lapses.',
      label: 'Expiry date',
      date: true,
      multiline: false,
      initialValue: doc.expiresAt ? String(doc.expiresAt).slice(0, 10) : '',
      helper: 'Clear it and save to remove the date entirely, which is a real answer if it was mistyped.',
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
            {/**
              * The shop's own face, and only if a human approved it.
              *
              * Founder, 2026-09-03: "that would help a user who wants to
              * drop things off at a store, just like the way you know
              * that's your real driver." A rider's vehicle photo is
              * already on the customer trust card for exactly that
              * reason: somebody standing outside has to know it is the
              * right place.
              *
              * Read from the APPROVED document, never from the
              * partner_stores column and never from a pending upload.
              * The column is written the moment a partner sends a file,
              * so using it would let an unreviewed image become the
              * shop's public face by simply uploading one.
              */}
            {approvedStorefront ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={approvedStorefront}
                alt={store.storeName}
                className="w-16 h-16 rounded-full object-cover shrink-0 border border-gray-200"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#0F2B4C] flex items-center justify-center shrink-0">
                <Store size={28} color="#fff" strokeWidth={1.75} />
              </div>
            )}
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

        {/* Where the shop is, before the documents that claim it.
            No map to build: DeliveryMap already draws OpenStreetMap tiles
            with no API key and no per-load billing, chosen for exactly
            that reason. This is one pin, so a reviewer can see the shop
            sits on a street rather than in a lagoon without leaving the
            page. The ops-map link stays for the full picture. */}
        {Number.isFinite(Number(store.storeLat)) && Number.isFinite(Number(store.storeLng)) ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-baseline justify-between gap-4 flex-wrap">
              <h2 className="font-semibold text-gray-900">Where it is</h2>
              <span className="text-xs text-gray-400 font-mono">
                {Number(store.storeLat).toFixed(5)}, {Number(store.storeLng).toFixed(5)}
              </span>
            </div>
            <DeliveryMap
              height={180}
              points={[{
                lat: Number(store.storeLat),
                lng: Number(store.storeLng),
                label: store.storeName,
                kind: 'store',
                detail: store.storeAddress ?? undefined,
              }]}
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6 px-5 py-4">
            <h2 className="font-semibold text-gray-900 mb-1">Where it is</h2>
            <p className="text-sm text-amber-700">
              No coordinates on this shop. It was applied for with a typed address rather than one
              picked from the list, so it sorts last on Find a Partner and nothing can be checked
              against it. The photographs below cannot be distance-checked either.
            </p>
          </div>
        )}

        {/* Documents, reviewed here, grouped by what each one is about.
            The shared Section rather than a private card, so this panel
            remembers its state per admin like the driver page does, and
            opens itself only while something is waiting. */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
          <Section
            title="Documents"
            storageKey="partner-documents"
            bare
            defaultOpen={docsWaiting > 0}
            summary={
              docs === null ? 'loading' : (
                <span className="flex items-center gap-2">
                  {docsWaiting > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      {docsWaiting} waiting on you
                    </span>
                  )}
                  <span>{docs.length} on record</span>
                </span>
              )
            }
          >
            {docs === null ? (
              <p className="text-sm text-gray-400">Loading documents...</p>
            ) : docs.length === 0 ? (
              <p className="text-sm text-gray-400">
                Nothing was uploaded with this application. There is no shopfront photo, no CAC
                certificate and no ID to check against.
              </p>
            ) : (
              <div className="space-y-6">
                {DOC_GROUPS.map((g) => {
                  const inGroup = docs.filter((d: any) => d.group === g.key);
                  if (inGroup.length === 0) return null;
                  return (
                    <div key={g.key}>
                      <div className="mb-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{g.title}</h3>
                        <p className="text-xs text-gray-400">{g.note}</p>
                      </div>
                      <div className="space-y-2">
                        {inGroup.map((d: any) => {
                          const busy = busyDoc === d.id;
                          const expired = d.expiresAt && new Date(d.expiresAt) < new Date();
                          return (
                            <div key={d.id} className="flex items-start gap-3 border border-gray-100 rounded-lg p-3">
                              <a href={d.url} target="_blank" rel="noreferrer"
                                 className="w-16 h-16 rounded-md overflow-hidden bg-gray-50 border border-gray-200 flex-shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={d.url} alt={d.label} className="w-full h-full object-cover" />
                              </a>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-gray-800">{d.label}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${DOC_STATUS_STYLES[d.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                    {DOC_STATUS_LABEL[d.status] ?? d.status}
                                  </span>
                                  {!d.required && (
                                    <span className="text-xs text-gray-400">optional</span>
                                  )}
                                  {d.version > 1 && (
                                    <span className="text-xs text-gray-400">re-uploaded &times;{d.version - 1}</span>
                                  )}
                                </div>

                                {/* Three different things, kept apart on purpose.
                                    A phone that never said is not a phone that
                                    lied, and only the last line is a reason to
                                    doubt anybody. */}
                                {d.farFromStore && (
                                  <p className="mt-1 text-xs text-red-700 font-medium">
                                    Taken {(d.metresFromStore / 1000).toFixed(1)} km from the shop&apos;s address.
                                  </p>
                                )}
                                {!d.farFromStore && d.metresFromStore != null && (
                                  <p className="mt-1 text-xs text-emerald-700">
                                    Taken {d.metresFromStore} m from the address. Consistent.
                                  </p>
                                )}
                                {d.imprecise && (
                                  <p className="mt-1 text-xs text-gray-500">
                                    The phone was unsure of its position, so the distance above is soft.
                                  </p>
                                )}
                                {d.noLocation && (
                                  <p className="mt-1 text-xs text-gray-500">
                                    No location on this photo. Common indoors, and not a problem on its own.
                                  </p>
                                )}

                                {d.rejectionReason && (
                                  <p className="mt-1 text-xs text-red-700">What they were told: {d.rejectionReason}</p>
                                )}
                                {d.reviewedByName && d.reviewedAt && (
                                  <p className="mt-1 text-xs text-gray-500">
                                    {d.status === 'approved' ? 'Approved' : 'Reviewed'} by{' '}
                                    <span className="font-medium text-gray-700">{d.reviewedByName}</span>{' '}
                                    on {new Date(d.reviewedAt).toLocaleDateString('en-GB', {
                                      day: 'numeric', month: 'short', year: 'numeric',
                                    })}
                                  </p>
                                )}
                                {d.canExpire && (
                                  <p className={`mt-1 text-xs ${expired ? 'text-amber-700 font-medium' : 'text-gray-400'}`}>
                                    {d.expiresAt
                                      ? `${expired ? 'Ran out' : 'Valid until'} ${new Date(d.expiresAt).toLocaleDateString('en-GB')}`
                                      : 'No expiry recorded, so it will never be flagged'}
                                  </p>
                                )}

                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                  {d.status !== 'approved' && (
                                    <button type="button" disabled={busy} onClick={() => void decide(d, 'approve')}
                                      className="text-xs px-3 py-1.5 rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
                                      Approve
                                    </button>
                                  )}
                                  <button type="button" disabled={busy} onClick={() => void decide(d, 'needs_replacing')}
                                    className="text-xs px-3 py-1.5 rounded-lg font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-40"
                                    title="It was fine and has run out. Nobody is being blamed.">
                                    Ask for a new one
                                  </button>
                                  {/* Reject stays available AFTER approval. An
                                      approval made in error, or a forgery
                                      noticed later, must be undoable from the
                                      page it was made on. The driver page
                                      learned this the hard way. */}
                                  <button type="button" disabled={busy} onClick={() => void decide(d, 'reject')}
                                    className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40">
                                    Reject
                                  </button>
                                  {d.canExpire && d.status === 'approved' && (
                                    <button type="button" disabled={busy} onClick={() => void editExpiry(d)}
                                      className="text-xs font-semibold text-[#3A7BD5] hover:underline disabled:opacity-50 px-1">
                                      {d.expiresAt ? 'Change expiry date' : 'Set an expiry date'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

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

        {/* A shop asking to trade from a different building.

            Founder, 2026-09-04: a partner moving "have to put in a request
            and they have to go through the whole process so we can update
            their data", modelled on the rider vehicle change.

            Placed above everything else when it exists, because it is the
            only panel here with a shop waiting on the other end of it, and
            because approving it is the one action on this screen that
            changes where real people walk. */}
        {move && (
          <div className="bg-white rounded-xl border-2 border-[#3A7BD5] shadow-sm mb-6 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-semibold text-[#0F2B4C]">This shop wants to move</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Waiting on you
              </span>
            </div>

            <div className="p-5 space-y-4">
              {(move.parcelsHeldNow > 0 || move.parcelsHeldAtRequest > 0) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-900">
                    Holding {move.parcelsHeldNow} {move.parcelsHeldNow === 1 ? "parcel" : "parcels"} right now
                    {move.parcelsHeldAtRequest !== move.parcelsHeldNow && (
                      <span className="font-normal"> ({move.parcelsHeldAtRequest} when they asked)</span>
                    )}
                  </p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Those parcels are at the OLD address, and their customers were told to collect
                    them there. Sort the parcels before the address.
                  </p>
                </div>
              )}

              {!move.stillTradingAtOld && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm font-semibold text-red-800">The old shop is already shut</p>
                  <p className="text-xs text-red-700 mt-0.5">
                    They told us they can no longer receive there, so new drop-offs were stopped
                    automatically when they filed this.
                  </p>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Leaving</p>
                  <p className="text-sm text-[#16232F] mt-1">{move.oldStoreAddress ?? "not on file"}</p>
                </div>
                <div className="rounded-lg border border-[#3A7BD5]/40 bg-[#3A7BD5]/5 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#3A7BD5]">Going to</p>
                  <p className="text-sm text-[#16232F] mt-1">{move.newStoreAddress}</p>
                </div>
              </div>

              {move.reason && (
                <p className="text-sm text-[#5C6E82]">
                  <span className="font-medium text-[#16232F]">Their reason:</span> {move.reason}
                </p>
              )}

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Photos of the new premises
                </p>
                {(!move.documents || move.documents.length === 0) ? (
                  <p className="text-sm text-gray-400">
                    They have not sent any yet. Approving is blocked until the required ones arrive.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {move.documents.map((d: any) => (
                      <a
                        key={d.id}
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex gap-3 rounded-lg border border-gray-200 p-2 hover:border-[#3A7BD5] transition-colors"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={d.url} alt={d.label} className="w-14 h-14 rounded object-cover shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#16232F] truncate">{d.label}</p>
                          {d.farFromNewStore ? (
                            <p className="text-xs text-red-700">
                              Taken {(d.metresFromNewStore / 1000).toFixed(1)} km from the new address
                            </p>
                          ) : d.noLocation ? (
                            <p className="text-xs text-amber-700">No location recorded</p>
                          ) : d.imprecise ? (
                            <p className="text-xs text-amber-700">Weak fix, about {d.capturedAccuracyM} m</p>
                          ) : (
                            <p className="text-xs text-emerald-700">
                              At the new address{d.metresFromNewStore != null ? ", " + Math.round(d.metresFromNewStore) + " m" : ""}
                            </p>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 flex-wrap pt-1">
                <button
                  disabled={movingBusy}
                  onClick={async () => {
                    const note = await prompt({
                      title: "Approve this move?",
                      message: "The shop starts trading from the new address immediately. Customers and riders "
                             + "are directed there, and the new photos replace the old premises photos.",
                      label: "Note for the shop (optional)",
                      helper: "They see this on their move screen.",
                      multiline: true,
                      confirmLabel: "Approve the move",
                    });
                    if (note === null) return;
                    setMovingBusy(true);
                    try {
                      const r = await adminApi.partnerMoves.decide(id, true, String(note ?? ""));
                      void notify({ title: "Move approved", message: r.message, tone: "success" });
                      setMove(null);
                      adminApi.partnerStores.get(id).then((d: any) => setData(d)).catch(() => {});
                    } catch (e: any) {
                      void notify({ title: "Not approved", message: e?.message ?? "Try again.", tone: "error" });
                    } finally { setMovingBusy(false); }
                  }}
                  className="px-4 py-2 rounded-lg bg-[#0F2B4C] text-white text-sm font-medium disabled:opacity-50"
                >
                  Approve the move
                </button>
                <button
                  disabled={movingBusy}
                  onClick={async () => {
                    const note = await prompt({
                      title: "Refuse this move?",
                      message: "The shop keeps its current address. Tell them what was wrong, and which "
                             + "photos to redo, so they are not left rephotographing everything.",
                      label: "What they need to fix",
                      multiline: true,
                      confirmLabel: "Refuse the move",
                    });
                    if (note === null) return;
                    if (!String(note).trim()) {
                      void notify({ title: "A reason is required", message: "A refusal with no reason cannot be acted on.", tone: "error" });
                      return;
                    }
                    setMovingBusy(true);
                    try {
                      const r = await adminApi.partnerMoves.decide(id, false, String(note));
                      void notify({ title: "Move refused", message: r.message, tone: "success" });
                      setMove(null);
                    } catch (e: any) {
                      void notify({ title: "Not saved", message: e?.message ?? "Try again.", tone: "error" });
                    } finally { setMovingBusy(false); }
                  }}
                  className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm font-medium disabled:opacity-50"
                >
                  Refuse
                </button>
              </div>
            </div>
          </div>
        )}

        {/* What is actually on the shelf.

            Founder, 2026-09-04: "can they view each package in detail and
            all its life cycle, timestamps and chain of custody, every
            little detail."

            They could not. This page showed the number 6 in a tile and
            offered no way to learn anything about those six. Every field
            below already existed in the database; nothing returned it. So
            "audit the parcels before approving a move" was an instruction
            with no screen behind it. */}
        {audit && audit.parcels?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-semibold text-[#0F2B4C]">
                On the shelf right now ({audit.total})
              </h2>
              {audit.oldestHours >= 48 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  Oldest has been here {Math.floor(audit.oldestHours / 24)} days
                </span>
              )}
            </div>

            <div className="divide-y divide-gray-100">
              {audit.parcels.map((p: any) => {
                const open = openParcel === p.id;
                return (
                  <div key={p.id}>
                    <button
                      onClick={() => setOpenParcel(open ? null : p.id)}
                      className="w-full text-left px-5 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-semibold text-[#0F2B4C]">{p.dropCode}</span>
                          <span className="text-xs text-gray-500">{p.heldAs}</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5 truncate">
                          {p.sender?.name ?? "Sender not on file"}
                          {p.sender?.seirsId ? ` (${p.sender.seirsId})` : ""}
                          {" \u2192 "}
                          {p.recipient?.name ?? "no recipient named"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-semibold tabular-nums ${
                          (p.daysHeld ?? 0) >= 3 ? "text-amber-700" : "text-gray-700"
                        }`}>
                          {p.daysHeld != null ? `${p.daysHeld}d` : "-"}
                        </p>
                        {p.storageOwedNgn > 0 && (
                          <p className="text-xs text-gray-500 tabular-nums">
                            &#8358;{p.storageOwedNgn.toFixed(2)}
                          </p>
                        )}
                      </div>
                      <span className="text-gray-400 text-xs">{open ? "Hide" : "Open"}</span>
                    </button>

                    {open && (
                      <div className="px-5 pb-5 bg-[#FBFAF7] border-t border-gray-100">
                        <div className="grid gap-4 sm:grid-cols-2 pt-4">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Who it belongs to</p>
                            <p className="text-sm text-[#16232F]">{p.sender?.name ?? "-"}</p>
                            <p className="text-xs text-gray-600">{p.sender?.phone ?? "no phone on file"}</p>
                            <p className="text-xs text-gray-500 font-mono">{p.sender?.seirsId ?? ""}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Who should collect it</p>
                            <p className="text-sm text-[#16232F]">{p.recipient?.name ?? "-"}</p>
                            <p className="text-xs text-gray-600">{p.recipient?.phone ?? "no phone on file"}</p>
                            <p className="text-xs text-gray-500">{p.recipient?.address ?? ""}</p>
                          </div>
                        </div>

                        {p.photos?.length > 0 && (
                          <div className="mt-4">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                              The parcel itself
                            </p>
                            <div className="flex gap-3 flex-wrap">
                              {p.photos.map((ph: any) => (
                                <a key={ph.url} href={ph.url} target="_blank" rel="noreferrer" className="block">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={ph.url} alt={ph.label}
                                       className="w-28 h-28 rounded-lg object-cover border border-gray-200" />
                                  <p className="text-xs text-gray-500 mt-1">{ph.label}</p>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="mt-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">What has happened to it</p>
                          <ol className="space-y-1.5">
                            {p.timeline.map((t: any) => (
                              <li key={t.key} className="flex gap-3 text-sm">
                                <span className="text-gray-500 tabular-nums shrink-0 w-40">
                                  {new Date(t.at).toLocaleString("en-NG")}
                                </span>
                                <span className="text-[#16232F]">{t.label}</span>
                              </li>
                            ))}
                          </ol>
                        </div>

                        <div className="mt-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                            Who physically handled it
                          </p>
                          {p.chainOfCustody?.length ? (
                            <ol className="space-y-1.5">
                              {p.chainOfCustody.map((h: any, i: number) => (
                                <li key={i} className="flex gap-3 text-sm flex-wrap">
                                  <span className="text-gray-500 tabular-nums shrink-0 w-40">
                                    {new Date(h.createdAt).toLocaleString("en-NG")}
                                  </span>
                                  <span className="text-[#16232F]">
                                    {h.stage}
                                    {h.signatureName || h.releasedByName
                                      ? ` \u2014 signed by ${h.releasedByName ?? h.signatureName}`
                                      : ""}
                                    {h.idType ? ` (${h.idType} ending ${h.idLast4})` : ""}
                                  </span>
                                  {h.proofPhotoUrl && (
                                    <a href={h.proofPhotoUrl} target="_blank" rel="noreferrer"
                                       className="text-xs text-[#3A7BD5] underline">photo</a>
                                  )}
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <p className="text-sm text-gray-400">
                              Nobody has signed for this parcel yet. That is normal before it is taken
                              in, and a problem afterwards: it means we have no named person who
                              admits holding it.
                            </p>
                          )}
                        </div>

                        {p.deliveryId && (
                          <Link href={`/deliveries/${p.deliveryId}`}
                                className="inline-block mt-4 text-sm text-[#3A7BD5] hover:underline">
                            Open the full delivery
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* When this shop is open.
            Founder, 2026-09-03: partners "should be able to set up their
            working hours and we should see the live update on their
            profile", because a partner holding parcels who quietly stops
            opening is the failure that costs a customer their package.

            Mirrors the rider page's Working hours section rather than
            inventing a second shape, and reads the same workingHours
            object through the same rules: a day missing or disabled is
            closed, and no hours at all means open, not shut. */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
          <Section
            title="Opening hours"
            storageKey="partner-hours"
            bare
            defaultOpen={false}
            summary={
              <span className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  openRightNow
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-gray-50 text-gray-600 border-gray-200'
                }`}>
                  {openRightNow ? 'Open right now' : 'Closed right now'}
                </span>
                <span>
                  {store.workingHours
                    ? `${Object.values(store.workingHours as any).filter((d: any) => d?.enabled).length} days a week`
                    : 'never set'}
                </span>
              </span>
            }
          >
            {!store.workingHours ? (
              <p className="text-sm text-[#5C6E82]">
                They have never set any, so this shop counts as open at all times. That is
                deliberate: every store was created with default hours nobody chose, and
                treating a default as a decision would quietly drop shops out of the
                drop-off list on a rule their owner never made.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                  {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => {
                    const row: any = (store.workingHours as any)?.[d];
                    const on = row?.enabled;
                    const today = d === TODAY_KEY;
                    return (
                      <div key={d} className={`rounded-lg border p-2 text-center ${
                        on ? 'border-emerald-200 bg-emerald-50' : 'border-[#E5E7EB] bg-[#F5F5F0]'
                      } ${today ? 'ring-2 ring-[#3A7BD5]/40' : ''}`}>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-[#0F2B4C]/50">{d}</p>
                        <p className={`mt-0.5 text-xs tabular-nums ${on ? 'text-emerald-800' : 'text-[#0F2B4C]/30'}`}>
                          {on ? `${row.start} - ${row.end}` : 'closed'}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-[#5C6E82]">
                  Times are Lagos time, and the ringed day is today. Storage charges do not
                  build up on days this shop is closed, so a sender is never billed for a
                  wait they could not do anything about.
                </p>
              </>
            )}
            <p className="mt-3 text-xs text-[#5C6E82]">
              Changing these while holding parcels raises a support ticket under
              &ldquo;Hours changed&rdquo;, so somebody checks the parcels can still be
              collected. The change itself is never blocked: a partner who is punished for
              telling us stops telling us.
            </p>
          </Section>
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
