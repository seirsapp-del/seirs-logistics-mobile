'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { naira } from '@/lib/money';
import { deliveryStatus } from '@/lib/labels';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import {
  Search, Package, Camera, FileText, ChevronRight, AlertCircle, AlertTriangle,
  ShieldCheck, ArrowLeft, Loader2,
} from 'lucide-react';

/**
 * Who was holding the parcel when it went wrong.
 *
 * Two things were wrong with this screen. It had no queue: opening
 * "Liability Disputes" from the sidebar gave you an empty box demanding
 * a delivery UUID, and the only person who could use it was somebody
 * who had already arrived from a delivery page. Every flagged job in
 * the system was invisible from the screen named after them.
 *
 * And the box only accepted a UUID. The person on the phone to an angry
 * customer has a tracking code, a name or an email. They never have a
 * UUID. So the lookup now searches deliveries the same way the dispatch
 * board does and resolves whatever they were given to a job.
 *
 * This page shows evidence. It does not move money: the refund and the
 * decision live on the delivery itself, and every route out of here
 * points there.
 */

interface Handoff {
  id:             string;
  deliveryId:     string;
  stage:          string;
  method:         string;
  fromUserId:     string | null;
  toUserId:       string | null;
  signatureName:  string | null;
  proofPhotoUrl:  string | null;
  idLast4:        string | null;
  idType:         string | null;
  createdAt:      string;
}

const STAGE_LABEL: Record<string, string> = {
  customer_to_store:   'Customer handed it to the partner store',
  store_to_driver:     'Partner store handed it to the driver',
  driver_to_store:     'Driver handed it to the partner store',
  store_to_recipient:  'Partner store handed it to the receiver',
  driver_to_recipient: 'Driver handed it to the receiver',
};

const STAGE_COLOR: Record<string, string> = {
  customer_to_store:   '#3A7BD5',
  store_to_driver:     '#D97706',
  driver_to_store:     '#D97706',
  store_to_recipient:  '#16A34A',
  driver_to_recipient: '#16A34A',
};

/**
 * The method used to fall through to "SEIRS ID + Signature" for ANY
 * unrecognised value, so a handoff verified some other way would have
 * been read out in an argument as a signature that was never given.
 */
const METHOD_LABEL: Record<string, string> = {
  physical_id: 'Physical ID checked, plus a one-time code',
  seirs_id:    'SEIRS ID, plus a typed signature',
  signature:   'SEIRS ID, plus a typed signature',
};

/** What the rider actually reported. Same wording as the delivery page. */
const DISPUTE_REASON: Record<string, string> = {
  mismatch:   'Package does not match the description',
  overweight: 'Heavier than declared',
  absent:     'Sender not present, or wrong address',
  unsafe:     'Unsafe or refused item',
};

function DisputesContent() {
  const searchParams = useSearchParams();

  /* Where the operator came from, if they came from anywhere. Read off
     the URL rather than off the input box: the box is typed into, and a
     back link that followed the typing would send the admin to whatever
     half-finished UUID is in it. */
  const cameFromDelivery = (searchParams.get('deliveryId') ?? '').trim();

  // ── The queue of flagged jobs ────────────────────────────────────────
  const [queue,        setQueue]        = useState<any>(null);
  const [queuePage,    setQueuePage]    = useState(1);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError,   setQueueError]   = useState('');

  /**
   * The window this queue is showing, as YYYY-MM-DD.
   *
   * Reviewing a claim is dated work: what happened around the 12th, what
   * was flagged the week of the outage. No backend change was needed for
   * it, because this board already reads through the deliveries endpoint,
   * which learned about ranges an hour ago.
   */
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');

  /**
   * Dates are parameters, not read from state, so a handler that sets
   * state and loads in the same tick does not fetch one edit behind.
   */
  const loadQueue = useCallback((p = 1, f = from, t = to) => {
    setQueueLoading(true);
    setQueueError('');
    setQueuePage(p);
    adminApi.deliveries(p, 'disputed', undefined, undefined, f || undefined, t || undefined)
      .then(setQueue)
      // A failure used to be indistinguishable from "nothing is flagged",
      // which on this page reads as good news and is the wrong answer.
      .catch((e: any) => setQueueError(e?.message ?? 'Could not load the flagged jobs.'))
      .finally(() => setQueueLoading(false));
  }, [from, to]);

  useEffect(() => { loadQueue(1); }, [loadQueue]);

  // ── The chain being read right now ───────────────────────────────────
  const [focusId,      setFocusId]      = useState('');
  const [focusRow,     setFocusRow]     = useState<any>(null);
  const [chain,        setChain]        = useState<Handoff[] | null>(null);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError,   setChainError]   = useState('');

  const openChain = useCallback(async (deliveryId: string, row?: any) => {
    if (!deliveryId) return;
    setFocusId(deliveryId);
    setFocusRow(row ?? null);
    setChain(null);
    setChainError('');
    setChainLoading(true);
    try {
      const list = await adminApi.identity.handoffChain(deliveryId);
      setChain(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setChainError(e?.message ?? 'Could not load the chain of custody.');
    } finally {
      setChainLoading(false);
    }
  }, []);

  // ── Free-text lookup ─────────────────────────────────────────────────
  const [term,        setTerm]        = useState(searchParams.get('deliveryId') ?? '');
  const [matches,     setMatches]     = useState<any[] | null>(null);
  const [lookupBusy,  setLookupBusy]  = useState(false);
  const [lookupError, setLookupError] = useState('');

  const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  const lookup = async () => {
    const q = term.trim();
    if (!q) return;
    setLookupBusy(true);
    setLookupError('');
    setMatches(null);
    try {
      const res  = await adminApi.deliveries(1, undefined, q);
      const rows = (res?.deliveries ?? []) as any[];
      if (rows.length === 1) {
        setMatches(null);
        await openChain(rows[0].id, rows[0]);
      } else if (rows.length > 1) {
        setMatches(rows);
      } else if (isUuid(q)) {
        // Nothing matched the search, but a bare id can still be a real
        // delivery the search index did not reach, so try it directly
        // rather than telling the operator it does not exist.
        await openChain(q);
      } else {
        setLookupError(`Nothing matches "${q}". Try the tracking code, the customer's email, or their name.`);
      }
    } catch (e: any) {
      setLookupError(e?.message ?? 'The lookup failed. Try again.');
    } finally {
      setLookupBusy(false);
    }
  };

  // Arriving from a delivery's "Open chain of custody" link used to type
  // the UUID into the box and stop there, so the admin landed on an
  // empty page holding the answer. Ref-guarded so it fires once and
  // never fights somebody typing a different id.
  const autoRan = useRef(false);
  useEffect(() => {
    const fromLink = searchParams.get('deliveryId')?.trim();
    if (!fromLink || autoRan.current) return;
    autoRan.current = true;
    openChain(fromLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const rows     = (queue?.deliveries ?? []) as any[];
  const total    = Number(queue?.total ?? 0);
  const perPage  = Number(queue?.limit ?? 20);
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const firstRow = total === 0 ? 0 : (queuePage - 1) * perPage + 1;
  const lastRow  = Math.min(queuePage * perPage, total);

  return (
    <div className="p-8">
      {cameFromDelivery && (
        <Link
          href={`/deliveries/${encodeURIComponent(cameFromDelivery)}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-[#3A7BD5] hover:underline"
        >
          <ArrowLeft size={14} /> Back to the delivery
        </Link>
      )}

      <PageIntro
        title="Liability Disputes"
        purpose="Work out who was holding a parcel when it went missing or arrived damaged, using the signed handoffs recorded at every change of hands."
        storageKey="disputes"
        help={
          <>
            <p><strong>Jobs a driver flagged</strong> is every delivery where the driver reported a problem. Their photo and their reason are on the row.</p>
            <p><strong>Open the handoffs</strong> lays out who verifiably handed the parcel to whom, with the photo and the signature taken at the time.</p>
            <p>Nothing on this page changes anything or moves money. Refunds, escrow and cancellation are decided on the delivery itself, so open the delivery when you know the answer.</p>
            <p>The liability table at the bottom says who is responsible at each leg. Read it against the last successful handoff.</p>
          </>
        }
      />

      {/* THE QUEUE. This page had none: every flagged job in the system
          was invisible from the screen named after them. */}
      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between gap-4 flex-wrap">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#0F2B4C]/70">Jobs a driver flagged</h2>
          <span className="text-xs text-[#0F2B4C]/50">
            {queueLoading ? 'Loading' : total === 0 ? 'None open' : `${total.toLocaleString()} in total`}
          </span>
        </div>

        {/* Booked between.

            Reviewing a claim is dated work: what happened around the 12th,
            what was flagged the week of the outage. There was no way to ask
            and the only route was paging.

            Ranged on when the job was BOOKED rather than when it was
            flagged, because that is what the underlying list is sorted by,
            and a window keyed on a different column from the ordering gives
            paging that jumps about. */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[#0F2B4C]/50">Booked</span>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => { setFrom(e.target.value); loadQueue(1, e.target.value, to); }}
            className="rounded-lg border border-[#E5E7EB] bg-white px-2 py-1.5 outline-none focus:border-[#3A7BD5]"
          />
          <span className="text-[#0F2B4C]/40">to</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => { setTo(e.target.value); loadQueue(1, from, e.target.value); }}
            className="rounded-lg border border-[#E5E7EB] bg-white px-2 py-1.5 outline-none focus:border-[#3A7BD5]"
          />
          {(from || to) && (
            <button
              onClick={() => { setFrom(''); setTo(''); loadQueue(1, '', ''); }}
              className="font-semibold text-[#3A7BD5] hover:underline"
            >
              Clear dates
            </button>
          )}
        </div>

        {queueError && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{queueError}</span>
            <button onClick={() => loadQueue(queuePage)} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
          {queueLoading ? (
            <div className="flex items-center justify-center py-14 text-[#0F2B4C]/40">
              <Loader2 size={18} className="mr-2 animate-spin" /> Loading flagged jobs
            </div>
          ) : queueError ? (
            <EmptyState
              icon={<AlertCircle size={20} />}
              title="The flagged jobs could not be loaded"
              body="This is a connection or permission problem. It does not mean there are none."
              action={{ label: 'Try again', onClick: () => loadQueue(queuePage) }}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck size={20} />}
              tone="good"
              title="No driver has flagged a job"
              body="Nothing is waiting to be adjudicated. You can still look up any delivery's handoffs below."
            />
          ) : (
            <div className="divide-y divide-[#F5F5F0]">
              {rows.map((d: any) => (
                <div key={d.id} className={`px-4 py-3 ${focusId === d.id ? 'bg-[#3A7BD5]/[0.04]' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/deliveries/${d.id}`} className="font-mono text-sm font-semibold text-[#0F2B4C] hover:text-[#3A7BD5]">
                          {d.trackingCode}
                        </Link>
                        <span className="rounded-full bg-[#F5F5F0] px-2 py-0.5 text-[10px] font-semibold text-[#0F2B4C]/60">
                          {deliveryStatus(d.status)}
                        </span>
                        <span className="text-xs text-[#0F2B4C]/50">{naira(d.price)}</span>
                      </div>
                      <p className="mt-1 text-sm text-[#DC2626]">
                        {DISPUTE_REASON[d.disputeReason ?? ''] ?? d.disputeReason ?? 'Reason not recorded'}
                      </p>
                      <p className="mt-0.5 text-xs text-[#0F2B4C]/50">
                        Sender {d.customer?.name ?? 'unknown'}
                        {d.driver?.user?.name ? `, driver ${d.driver.user.name}` : ', no driver on it'}
                        {d.disputedAt ? `, reported ${new Date(d.disputedAt).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {/* The rider's own photo of what they were handed.
                          It is the first thing an adjudicator wants and
                          it was two pages away. */}
                      {d.disputePhotoUrl && (
                        <a href={d.disputePhotoUrl} target="_blank" rel="noreferrer" title="The driver's photo, full size">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={d.disputePhotoUrl} alt="What the driver was handed" className="h-14 w-14 rounded-lg border border-[#E5E7EB] object-cover hover:border-[#3A7BD5]" />
                        </a>
                      )}
                      <button
                        onClick={() => (focusId === d.id ? setFocusId('') : openChain(d.id, d))}
                        className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-semibold text-[#0F2B4C] hover:bg-[#F5F5F0]"
                      >
                        {focusId === d.id ? 'Close the handoffs' : 'Open the handoffs'}
                      </button>
                      <Link
                        href={`/deliveries/${d.id}`}
                        className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#3A7BD5] hover:bg-[#3A7BD5]/5"
                      >
                        Open the delivery
                      </Link>
                    </div>
                  </div>

                  {focusId === d.id && (
                    <div className="mt-4">
                      <ChainPanel
                        loading={chainLoading}
                        error={chainError}
                        chain={chain}
                        finishedAt={d?.deliveredAt ?? d?.cancelledAt ?? null}
                        onRetry={() => openChain(d.id, d)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Driven by the total, so it does not disappear the moment the
            list is short and does not lie about the last page. */}
        {!queueLoading && !queueError && total > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-[#0F2B4C]/50">
            <span className="tabular-nums">
              Showing {firstRow.toLocaleString()}-{lastRow.toLocaleString()} of {total.toLocaleString()} flagged jobs
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => loadQueue(1)}             disabled={queuePage <= 1}        className="rounded-lg border border-[#E5E7EB] px-2.5 py-1.5 text-xs font-medium hover:bg-[#F5F5F0] disabled:opacity-40">First</button>
              <button onClick={() => loadQueue(queuePage - 1)} disabled={queuePage <= 1}        className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-medium hover:bg-[#F5F5F0] disabled:opacity-40">Prev</button>
              <span className="px-2 text-xs tabular-nums">Page {queuePage} of {lastPage}</span>
              <button onClick={() => loadQueue(queuePage + 1)} disabled={queuePage >= lastPage} className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-medium hover:bg-[#F5F5F0] disabled:opacity-40">Next</button>
              <button onClick={() => loadQueue(lastPage)}      disabled={queuePage >= lastPage} className="rounded-lg border border-[#E5E7EB] px-2.5 py-1.5 text-xs font-medium hover:bg-[#F5F5F0] disabled:opacity-40">Last</button>
            </div>
          </div>
        )}
      </section>

      {/* ── Look up any delivery ─────────────────────────────────────── */}
      <section className="mb-8 rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-[#0F2B4C]/70">Look up any other delivery</h2>
        <p className="mb-3 text-xs text-[#0F2B4C]/50">
          A complaint that never got flagged still has handoffs. Paste whatever the caller gave you.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={term}
              onChange={e => setTerm(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') lookup(); }}
              placeholder="Tracking code, customer email, customer name, or a delivery id"
              className="w-full rounded-lg border border-[#E5E7EB] py-2 pl-10 pr-3 text-sm focus:border-[#3A7BD5] focus:outline-none"
            />
          </div>
          <button
            onClick={lookup}
            disabled={lookupBusy || !term.trim()}
            className="rounded-lg bg-[#0F2B4C] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#3A7BD5] disabled:opacity-50"
          >
            {lookupBusy ? 'Looking' : 'Look up'}
          </button>
        </div>

        {lookupError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {lookupError}
          </div>
        )}

        {/* More than one job matched, so ask rather than guess. */}
        {matches && matches.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-lg border border-[#E5E7EB]">
            <p className="border-b border-[#E5E7EB] bg-[#F5F5F0] px-3 py-2 text-xs font-semibold text-[#0F2B4C]/60">
              {matches.length} deliveries match. Which one?
            </p>
            <div className="divide-y divide-[#F5F5F0]">
              {matches.map((m: any) => (
                <button
                  key={m.id}
                  onClick={() => { setMatches(null); openChain(m.id, m); }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[#F5F5F0]"
                >
                  <span className="font-mono text-[#0F2B4C]">{m.trackingCode}</span>
                  <span className="text-xs text-[#0F2B4C]/50">
                    {m.customer?.name ?? 'unknown sender'} &middot; {deliveryStatus(m.status)} &middot;{' '}
                    {new Date(m.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <ChevronRight size={14} className="text-[#0F2B4C]/30" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* A chain opened from the lookup, rather than from a queue row. */}
        {focusId && !rows.some((r: any) => r.id === focusId) && (
          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[#0F2B4C]">
                {focusRow?.trackingCode
                  ? <>Handoffs for <span className="font-mono font-semibold">{focusRow.trackingCode}</span>{focusRow.customer?.name ? `, sent by ${focusRow.customer.name}` : ''}</>
                  : <>Handoffs for delivery <span className="font-mono text-xs">{focusId}</span></>}
              </p>
              <Link href={`/deliveries/${focusId}`} className="text-xs font-semibold text-[#3A7BD5] hover:underline">
                Open the delivery
              </Link>
            </div>
            <ChainPanel
              loading={chainLoading}
              error={chainError}
              chain={chain}
              finishedAt={(focusRow as any)?.deliveredAt ?? (focusRow as any)?.cancelledAt ?? null}
              onRetry={() => openChain(focusId, focusRow)}
            />
          </div>
        )}
      </section>

      {/* Liability matrix reference */}
      <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[#0F2B4C]/70">
          <FileText size={12} /> Who is responsible, by leg
        </h2>
        <p className="mb-3 text-xs text-[#0F2B4C]/50">
          Find the last handoff that completed. Whoever the parcel was with after it is the party this table names.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E7EB] text-left text-xs uppercase tracking-wide text-[#0F2B4C]/50">
              <th className="py-2">Lost between</th>
              <th className="py-2">Who pays</th>
            </tr>
          </thead>
          <tbody className="text-[#0F2B4C]">
            <tr className="border-b border-[#F3F4F6]"><td className="py-2">Customer to partner store</td><td className="py-2">The customer, until the store takes it</td></tr>
            <tr className="border-b border-[#F3F4F6]"><td className="py-2">Inside the partner store</td><td className="py-2">The partner store</td></tr>
            <tr className="border-b border-[#F3F4F6]"><td className="py-2">Partner store to driver</td><td className="py-2">The partner store, until the driver scans</td></tr>
            <tr className="border-b border-[#F3F4F6]"><td className="py-2">With the driver, on the road</td><td className="py-2">The driver (rating, and earnings held back)</td></tr>
            <tr className="border-b border-[#F3F4F6]"><td className="py-2">Driver to the final partner store</td><td className="py-2">The driver, until the store scans</td></tr>
            <tr className="border-b border-[#F3F4F6]"><td className="py-2">Inside the final partner store</td><td className="py-2">The partner store</td></tr>
            <tr><td className="py-2">Partner store to the receiver</td><td className="py-2">The partner store, until the receiver scans</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

/**
 * The timeline itself. Pulled out so the queue row and the free-text
 * lookup render the identical thing: an adjudicator should never have
 * two versions of the same evidence depending on how they arrived.
 */
/**
 * Was this delivery finished before SEIRS recorded handoffs at all?
 *
 * recordCustodyTransition shipped on 25 August 2026. Before it, only the
 * two partner-store legs ever wrote a record, so an ordinary
 * door-to-door run completed with no chain of any kind.
 *
 * The founder hit exactly this: a delivery he remembers handing over in
 * person reads as "no handoff was ever recorded", which sounds like the
 * feature is broken rather than like the run predates it. Both sentences
 * are true and they mean opposite things to whoever is adjudicating, so
 * the screen has to say which one applies.
 */
const CUSTODY_RECORDING_SINCE = Date.parse('2026-08-25T00:00:00Z');

function predatesCustodyRecording(finishedAt?: string | null): boolean {
  if (!finishedAt) return false;
  const t = Date.parse(finishedAt);
  return Number.isFinite(t) && t < CUSTODY_RECORDING_SINCE;
}

function ChainPanel({
  loading, error, chain, onRetry, finishedAt,
}: {
  loading: boolean;
  error:   string;
  chain:   Handoff[] | null;
  onRetry: () => void;
  /** deliveredAt or cancelledAt, so an empty chain can say WHY it is empty. */
  finishedAt?: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-8 text-sm text-[#0F2B4C]/40">
        <Loader2 size={16} className="animate-spin" /> Loading the handoffs
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <span className="flex-1">{error} Do not decide liability without it.</span>
        <button onClick={onRetry} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
      </div>
    );
  }
  if (chain && chain.length === 0) {
    return (
      <div className="rounded-lg border border-[#E5E7EB] bg-white">
        <EmptyState
          icon={<Package size={20} />}
          title={predatesCustodyRecording(finishedAt)
            ? 'This delivery finished before SEIRS recorded handoffs'
            : 'No handoff was ever recorded for this delivery'}
          body={predatesCustodyRecording(finishedAt)
            ? 'Handoff recording started on 25 August 2026, and this run completed before that, so there is no chain to read. That is a gap in the record, not a sign that nobody signed for it. Settle this one on the delivery’s own evidence: the proof photo, the timestamps, and who it was released to.'
            : 'Either it has not changed hands yet, or it moved without anybody scanning. With no chain, the liability table cannot be applied and this has to be settled on the delivery’s own evidence.'}
        />
      </div>
    );
  }
  if (!chain) return null;

  return (
    <div className="divide-y divide-[#E5E7EB] rounded-xl border border-[#E5E7EB] bg-white">
      <div className="border-b border-[#E5E7EB] bg-gray-50 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-600">Chain of custody</p>
        <p className="mt-1 text-sm text-gray-700">
          {chain.length} recorded handoff{chain.length === 1 ? '' : 's'}, earliest first
        </p>
      </div>

      {chain.map((h, i) => {
        const stageColor = STAGE_COLOR[h.stage] ?? '#9CA3AF';
        const stageLabel = STAGE_LABEL[h.stage] ?? h.stage.replace(/_/g, ' ');
        return (
          <div key={h.id} className="flex gap-4 p-4">
            <div className="flex flex-col items-center">
              <div className="mt-1 h-3 w-3 rounded-full" style={{ backgroundColor: stageColor }} />
              {i < chain.length - 1 && <div className="mt-1 w-0.5 flex-1 bg-gray-200" />}
            </div>

            <div className="min-w-0 flex-1 pb-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span
                  className="rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide"
                  style={{ backgroundColor: stageColor + '20', color: stageColor }}
                >
                  {stageLabel}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(h.createdAt).toLocaleString('en-NG', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-gray-500">How it was verified</p>
                  <p className="text-sm text-[#0F2B4C]">
                    {METHOD_LABEL[h.method] ?? `Recorded as "${h.method}"`}
                  </p>
                </div>
                {h.signatureName && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-gray-500">Name typed as the signature</p>
                    <p className="text-sm text-[#0F2B4C]">{h.signatureName}</p>
                  </div>
                )}
                {h.idType && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-gray-500">ID shown, last 4 digits</p>
                    <p className="font-mono text-sm text-[#0F2B4C]">{h.idType} &middot; &bull;&bull;&bull;&bull;{h.idLast4}</p>
                  </div>
                )}
              </div>

              {/* Show the handoff photo, do not just link to it. This
                  screen decides who pays for a lost or damaged parcel,
                  and the picture of it changing hands used to be a blue
                  text link an adjudicator had to guess was worth
                  clicking, once per row. */}
              {h.proofPhotoUrl ? (
                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase text-gray-500">Photo taken at the handoff</p>
                  <a
                    href={h.proofPhotoUrl}
                    target="_blank"
                    rel="noopener"
                    title="Open the full-size image in a new tab"
                    className="mt-1 inline-flex items-center gap-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={h.proofPhotoUrl}
                      alt={`Photo taken when: ${stageLabel}`}
                      className="h-28 w-28 rounded-lg border border-[#E5E7EB] object-cover transition-colors hover:border-[#3A7BD5]"
                    />
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#3A7BD5] hover:underline">
                      <Camera size={12} /> Full size <ChevronRight size={12} />
                    </span>
                  </a>
                </div>
              ) : (
                /* Silence here is evidence too: a leg with no photo is
                   the weakest link in the chain and should be visible
                   as such rather than simply absent. */
                <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700">
                  <AlertTriangle size={12} /> No photo was taken at this handoff.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DisputesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[#0F2B4C]/40">Loading</div>}>
      <DisputesContent />
    </Suspense>
  );
}
