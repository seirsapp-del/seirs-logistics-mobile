'use client';

/**
 * The queue for jobs the rate card refuses to price.
 *
 * A generator that needs four men and a permit. A church pew. A cold-chain
 * box. The price engine now throws SPECIAL_REQUEST_REQUIRED rather than
 * returning a plausible number for these, so this screen is the ONLY place
 * one of them can get a price. Until it existed, a sender could submit and
 * nobody could answer.
 *
 * The quote composer is itemised and the server rejects a bare total. On a
 * job somebody has never bought before, a large number with nothing behind
 * it reads as a demand rather than a price, and gives them nothing to
 * argue with. Every line here is a thing the customer can picture.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api';
import { usePrompt, useNotify } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';

type Line = { kind: string; label: string; qty: number; unitNgn: number; amountNgn: number };

/** Every kind the server accepts. Free text here would defeat itemising. */
const LINE_KINDS = [
  { key: 'vehicle',   label: 'Vehicle',   hint: 'The class of vehicle the load actually needs.' },
  { key: 'labour',    label: 'Hands',     hint: 'People, and for how long. Usually the biggest line.' },
  { key: 'waiting',   label: 'Waiting',   hint: 'Time on site that is not driving.' },
  { key: 'permit',    label: 'Permit',    hint: 'Anything the load legally requires.' },
  { key: 'escort',    label: 'Escort',    hint: 'A second vehicle, or a person walking it through.' },
  { key: 'insurance', label: 'Insurance', hint: 'Uplift above the standard cover.' },
  { key: 'other',     label: 'Other',     hint: 'Say plainly what it is.' },
];

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  submitted: { label: 'New',            tone: 'bg-blue-100 text-blue-800 border-blue-200' },
  in_review: { label: 'Being looked at', tone: 'bg-amber-100 text-amber-800 border-amber-200' },
  quoted:    { label: 'Priced',          tone: 'bg-violet-100 text-violet-800 border-violet-200' },
  escalated: { label: 'Passed on',       tone: 'bg-orange-100 text-orange-800 border-orange-200' },
  accepted:  { label: 'Accepted',        tone: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  declined:  { label: 'Declined',        tone: 'bg-gray-100 text-gray-600 border-gray-200' },
  expired:   { label: 'Price lapsed',    tone: 'bg-gray-100 text-gray-600 border-gray-200' },
  withdrawn: { label: 'Withdrawn',       tone: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const naira = (n: number) =>
  `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SpecialRequestsPage() {
  const notify = useNotify();
  const prompt = usePrompt();

  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [status, setStatus]   = useState('');
  const [from, setFrom]       = useState('');
  const [to, setTo]           = useState('');
  const [openId, setOpenId]   = useState<string | null>(null);
  const [detail, setDetail]   = useState<any>(null);
  const [busy, setBusy]       = useState(false);

  /** The quote being composed, per request. Never posted until it totals. */
  const [lines, setLines] = useState<Line[]>([]);

  const load = useCallback((s = status, f = from, t = to) => {
    setLoading(true);
    setError(null);
    adminApi.specialRequests.queue(s || undefined, f || undefined, t || undefined)
      .then(r => setRows(Array.isArray(r) ? r : []))
      // A failed fetch must not look like an empty queue: on this board
      // "nothing waiting" is good news and the wrong answer.
      .catch(e => setError(e?.message ?? 'Could not load the queue.'))
      .finally(() => setLoading(false));
  }, [status, from, to]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id); setDetail(null); setLines([]);
    try {
      setDetail(await adminApi.specialRequests.detail(id));
    } catch (e: any) {
      notify({ title: 'Could not open it', message: e?.message ?? 'Try again.', tone: 'error' });
    }
  };

  const total = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.amountNgn) || 0), 0),
    [lines],
  );

  const addLine = (kind: string) =>
    setLines(ls => [...ls, { kind, label: '', qty: 1, unitNgn: 0, amountNgn: 0 }]);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines(ls => ls.map((l, n) => {
      if (n !== i) return l;
      const next = { ...l, ...patch };
      // qty x unit drives the amount, so a reader can see where a number
      // came from rather than being handed a figure to trust.
      if (patch.qty !== undefined || patch.unitNgn !== undefined) {
        next.amountNgn = Number(next.qty || 0) * Number(next.unitNgn || 0);
      }
      return next;
    }));

  const sendQuote = async (id: string) => {
    if (!lines.length) {
      notify({ title: 'A quote needs its lines', message: 'A total on its own gives the customer nothing to question.', tone: 'error' });
      return;
    }
    if (lines.some(l => !l.label.trim())) {
      notify({ title: 'Every line needs a label', message: 'Write what the customer will read, not a code.', tone: 'error' });
      return;
    }
    const note = await prompt({
      title: 'Anything they should understand about the price?',
      message: 'Optional, and it is the place to explain a line that will surprise them.',
      label: 'Note for the customer',
      multiline: true,
      confirmLabel: `Send ${naira(total)}`,
    });
    if (note === null) return;

    setBusy(true);
    try {
      const r = await adminApi.specialRequests.quote(id, { lines, note: String(note ?? '') || undefined });
      notify({ title: 'Quote sent', message: r?.message ?? 'The customer can see it now.', tone: 'success' });
      setLines([]); setOpenId(null); setDetail(null); load();
    } catch (e: any) {
      notify({ title: 'Not sent', message: e?.message ?? 'Try again.', tone: 'error' });
    } finally { setBusy(false); }
  };

  const decline = async (id: string) => {
    const reason = await prompt({
      title: 'Why are we saying no?',
      message: 'The customer sees this. "No" with nothing after it cannot be acted on, and whoever picks this up next has nothing to go on either.',
      label: 'Reason',
      multiline: true,
      confirmLabel: 'Decline it',
    });
    if (reason === null) return;
    if (!String(reason).trim()) {
      notify({ title: 'A reason is required', message: 'The server refuses a decline without one.', tone: 'error' });
      return;
    }
    setBusy(true);
    try {
      const r = await adminApi.specialRequests.decline(id, String(reason));
      notify({ title: 'Declined', message: r?.message ?? '', tone: 'success' });
      setOpenId(null); load();
    } catch (e: any) {
      notify({ title: 'Not saved', message: e?.message ?? 'Try again.', tone: 'error' });
    } finally { setBusy(false); }
  };

  const escalate = async (id: string) => {
    const note = await prompt({
      title: 'Pass it to someone who knows',
      message: 'Say what you are unsure about. Being unsure is a legitimate answer on these; starting the next person from nothing is not.',
      label: 'What you need checked',
      multiline: true,
      confirmLabel: 'Pass it on',
    });
    if (note === null) return;
    setBusy(true);
    try {
      const r = await adminApi.specialRequests.escalate(id, String(note));
      notify({ title: 'Passed on', message: r?.message ?? '', tone: 'success' });
      setOpenId(null); load();
    } catch (e: any) {
      notify({ title: 'Not saved', message: e?.message ?? 'Try again.', tone: 'error' });
    } finally { setBusy(false); }
  };

  const logCall = async (id: string, connected: boolean) => {
    const spokeTo = connected ? await prompt({
      title: 'Who did you speak to?',
      message: 'Their name, and how they relate to the job.',
      label: 'Name',
      multiline: false,
      confirmLabel: 'Next',
    }) : '';
    if (spokeTo === null) return;
    const notes = await prompt({
      title: connected ? 'What was agreed?' : 'What happened?',
      message: connected
        ? 'On these jobs the call IS the product. What is not written here exists only in your memory.'
        : 'A call that did not connect is worth recording: three in a row says something.',
      label: 'Notes',
      multiline: true,
      confirmLabel: 'Save the call',
    });
    if (notes === null) return;
    try {
      const r = await adminApi.specialRequests.logCall(id, {
        connected, spokeTo: String(spokeTo ?? ''), notes: String(notes ?? ''),
      });
      notify({ title: 'Recorded', message: r?.message ?? '', tone: 'success' });
      setDetail(await adminApi.specialRequests.detail(id));
    } catch (e: any) {
      notify({ title: 'Not saved', message: e?.message ?? 'Try again.', tone: 'error' });
    }
  };

  return (
    <div className="p-6">
      <div className="mb-1 flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-[#0F2B4C]">Special requests</h1>
        <span className="text-xs text-[#0F2B4C]/50">
          {loading ? 'Loading' : `${rows.length} waiting`}
        </span>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-[#5C6E82]">
        Jobs the rate card will not price: oversized, heavy, hazardous, cold chain, livestock,
        relocations. Nothing here is bookable and nothing is charged until somebody writes a
        price and the customer accepts it while it is still valid.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); load(e.target.value, from, to); }}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-medium"
        >
          <option value="">Still open</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <span className="text-[#0F2B4C]/50">Sent</span>
        <input type="date" value={from} max={to || undefined}
          onChange={e => { setFrom(e.target.value); load(status, e.target.value, to); }}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5" />
        <span className="text-[#0F2B4C]/40">to</span>
        <input type="date" value={to} min={from || undefined}
          onChange={e => { setTo(e.target.value); load(status, from, e.target.value); }}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5" />
        {(status || from || to) && (
          <button onClick={() => { setStatus(''); setFrom(''); setTo(''); load('', '', ''); }}
            className="font-semibold text-[#3A7BD5] hover:underline">Clear</button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}{' '}
          <button onClick={() => load()} className="font-semibold underline">Retry</button>
        </div>
      )}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          body="No special request needs a price right now. They arrive when somebody sends something the rate card refuses to quote."
        />
      ) : (
        <div className="space-y-2">
          {rows.map(r => {
            const st = STATUS_LABEL[r.status] ?? { label: r.status, tone: 'bg-gray-100 text-gray-700 border-gray-200' };
            const open = openId === r.id;
            return (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <button onClick={() => openDetail(r.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-[#0F2B4C]">{r.reference}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${st.tone}`}>{st.label}</span>
                      <span className="text-xs text-gray-500">{r.category?.replace('_', ' ')}</span>
                      {r.hazardous && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          Hazardous
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm text-[#16232F]">{r.description}</p>
                    <p className="text-xs text-gray-500">{r.pickupAddress} &rarr; {r.dropoffAddress}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {r.currentQuote && (
                      <p className="text-sm font-semibold tabular-nums text-[#0F2B4C]">
                        {naira(Number(r.currentQuote.totalNgn))}
                      </p>
                    )}
                    <p className={`text-xs tabular-nums ${r.waitingHours >= 24 ? 'text-amber-700' : 'text-gray-500'}`}>
                      waiting {r.waitingHours}h
                    </p>
                  </div>
                </button>

                {open && (
                  <div className="border-t border-gray-100 bg-[#FBFAF7] px-4 py-4">
                    {!detail ? (
                      <p className="text-sm text-gray-400">Opening...</p>
                    ) : (
                      <>
                        {/* What it is. A quote on one of these is guesswork
                            without the photographs and the access notes. */}
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">The load</p>
                            <p className="mt-1 text-sm text-[#16232F]">{detail.description}</p>
                            <p className="mt-1 text-xs text-gray-600">
                              {detail.weightKg ? `${detail.weightKg} kg` : 'weight not given'}
                              {detail.lengthCm ? ` · ${detail.lengthCm}×${detail.widthCm ?? '?'}×${detail.heightCm ?? '?'} cm` : ''}
                              {detail.liftingHands ? ` · needs ${detail.liftingHands} hands` : ''}
                            </p>
                            {detail.timeCriticality && (
                              <p className="mt-1 text-xs text-amber-800">
                                {/* Labelled as THEIR words. We do not promise
                                    arrival times, and a field rendered as a
                                    deadline is one step from becoming one. */}
                                What they told us about timing: {detail.timeCriticality}
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Getting to it</p>
                            <p className="mt-1 text-xs text-gray-600">Pickup: {detail.accessPickup || 'nothing noted'}</p>
                            <p className="text-xs text-gray-600">Drop-off: {detail.accessDropoff || 'nothing noted'}</p>
                            <p className="mt-1 text-xs text-gray-600">
                              {detail.pickupContactPhone || 'no pickup number'} · {detail.dropoffContactPhone || 'no drop-off number'}
                            </p>
                          </div>
                        </div>

                        {detail.photoUrls?.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {detail.photoUrls.map((u: string) => (
                              <a key={u} href={u} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={u} alt="load" className="h-20 w-20 rounded-lg border border-gray-200 object-cover" />
                              </a>
                            ))}
                          </div>
                        )}

                        {/* Quotes we have already given, newest first. Kept
                            rather than overwritten: this is the record when
                            somebody says you quoted me less last week. */}
                        {detail.quotes?.length > 0 && (
                          <div className="mt-4">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Prices given</p>
                            <ul className="mt-1 space-y-1">
                              {detail.quotes.map((q: any) => (
                                <li key={q.id} className="text-xs text-gray-600">
                                  <span className="font-semibold tabular-nums text-[#16232F]">{naira(Number(q.totalNgn))}</span>
                                  {' · '}{new Date(q.createdAt).toLocaleString('en-NG')}
                                  {q.supersededAt ? ' · replaced' : q.acceptedAt ? ' · accepted' : ' · current'}
                                  {!q.supersededAt && !q.acceptedAt && new Date(q.expiresAt) < new Date() && ' · lapsed'}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* The composer. */}
                        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Write a price</p>
                          {lines.length === 0 && (
                            <p className="mt-1 text-xs text-gray-500">
                              Add a line for each thing the job needs. The customer sees every one of
                              them, which is the point: a total on its own reads as a demand.
                            </p>
                          )}

                          {lines.map((l, i) => (
                            <div key={i} className="mt-2 grid grid-cols-12 items-center gap-2">
                              <span className="col-span-2 text-xs font-semibold text-gray-500">
                                {LINE_KINDS.find(k => k.key === l.kind)?.label ?? l.kind}
                              </span>
                              <input
                                value={l.label}
                                onChange={e => setLine(i, { label: e.target.value })}
                                placeholder="What the customer reads, e.g. Three men, two hours"
                                className="col-span-5 rounded border border-gray-200 px-2 py-1 text-sm"
                              />
                              <input
                                type="number" value={l.qty} min={0}
                                onChange={e => setLine(i, { qty: Number(e.target.value) })}
                                className="col-span-1 rounded border border-gray-200 px-2 py-1 text-sm tabular-nums"
                              />
                              <input
                                type="number" value={l.unitNgn} min={0}
                                onChange={e => setLine(i, { unitNgn: Number(e.target.value) })}
                                className="col-span-2 rounded border border-gray-200 px-2 py-1 text-sm tabular-nums"
                              />
                              <span className="col-span-1 text-right text-sm font-semibold tabular-nums">
                                {naira(l.amountNgn)}
                              </span>
                              <button onClick={() => setLines(ls => ls.filter((_, n) => n !== i))}
                                className="col-span-1 text-xs text-red-600 hover:underline">remove</button>
                            </div>
                          ))}

                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {LINE_KINDS.map(k => (
                              <button key={k.key} onClick={() => addLine(k.key)} title={k.hint}
                                className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-semibold text-[#0F2B4C]/70 hover:border-[#3A7BD5]">
                                + {k.label}
                              </button>
                            ))}
                          </div>

                          {lines.length > 0 && (
                            <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                              <span className="text-sm font-semibold text-[#0F2B4C]">
                                Total {naira(total)}
                              </span>
                              <button
                                onClick={() => sendQuote(r.id)}
                                disabled={busy}
                                className="rounded-lg bg-[#0F2B4C] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                              >
                                Send this price
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Calls. On these jobs the call IS the product. */}
                        <div className="mt-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Calls</p>
                          {detail.calls?.length ? (
                            <ul className="mt-1 space-y-1">
                              {detail.calls.map((c: any) => (
                                <li key={c.id} className="text-xs text-gray-600">
                                  {c.calledAt
                                    ? `Spoke to ${c.spokeTo || 'someone'}`
                                    : 'Did not connect'}
                                  {' · '}{new Date(c.createdAt).toLocaleString('en-NG')}
                                  {c.notes ? ` — ${c.notes}` : ''}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-xs text-gray-400">
                              Nobody has called yet. Nothing about a job like this gets settled on a form.
                            </p>
                          )}
                          <div className="mt-2 flex gap-2">
                            <button onClick={() => logCall(r.id, true)}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-[#0F2B4C]">
                              Record a call
                            </button>
                            <button onClick={() => logCall(r.id, false)}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-[#5C6E82]">
                              No answer
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                          <button onClick={() => escalate(r.id)} disabled={busy}
                            className="rounded-lg border border-orange-300 px-4 py-2 text-sm font-medium text-orange-700 disabled:opacity-50">
                            I am not sure, pass it on
                          </button>
                          <button onClick={() => decline(r.id)} disabled={busy}
                            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50">
                            Decline
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
