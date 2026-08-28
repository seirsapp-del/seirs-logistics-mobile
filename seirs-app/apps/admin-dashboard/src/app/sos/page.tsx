'use client';
/**
 * The SOS desk (founder 2026-08-23). Everything an operator needs to
 * act in the first minute: who (full identity: admin always sees
 * everything), where (GPS, one click onto the live ops map), what they
 * were doing (the booking), and one Resolve action when it is handled.
 *
 * 2026-08-24: two changes from the founder reading this desk.
 *   1. What the raiser actually said now reads as a quote block, not as
 *      grey text tacked onto the timestamp. "Passenger threatening me" is
 *      the most important string on the card and it was the smallest.
 *   2. Resolve records what was done about it, so the queue can be
 *      reviewed later instead of collapsing into "closed, by someone".
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Siren, MapPin, Phone, Package, CheckCircle2, Copy, Quote, ClipboardCheck,
         PhoneCall, Navigation, Bell, BellOff, Repeat, UserRound, Clock } from 'lucide-react';
import { adminApi } from '@/lib/api';

export default function SosDeskPage() {
  const router  = useRouter();
  const [alerts,  setAlerts]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied,  setCopied]  = useState<string | null>(null);
  // The alert currently being closed. Holding the whole object, not the id,
  // so the dialog can show who and what the agent is closing: they should
  // not be typing the outcome blind.
  const [resolving, setResolving] = useState<any | null>(null);
  const [saving,    setSaving]    = useState(false);
  /**
   * Resolved alerts, with what was done about them.
   *
   * Closing an alert has recorded a resolution note since 2026-08-24,
   * added so that a month later somebody could tell a false alarm from a
   * real incident. Nothing could read one back: the desk only ever
   * listed OPEN alerts, so the moment an alert was resolved it left the
   * product entirely (2026-08-28). For a safety feature that is the
   * wrong shape. The history is what shows a pattern, the same rider or
   * the same stretch of road recurring, and it is the only evidence
   * SEIRS responded at all if an incident is ever disputed.
   */
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [histStatus, setHistStatus] = useState<'resolved' | 'cancelled' | 'all'>('resolved');
  const [histQuery,  setHistQuery]  = useState('');
  /**
   * A desk you have to be staring at is not a desk.
   *
   * This page polled every 15 seconds and changed silently. An operator
   * with the tab open behind a spreadsheet found out about an emergency
   * whenever they next looked. Now the tab title carries the count, and
   * a new alert makes a sound. The sound is a plain oscillator rather
   * than an audio file so there is no asset to fail to load, and it is
   * off until switched on because browsers refuse audio before a click
   * anyway: the toggle IS the gesture that unlocks it.
   */
  const [sound, setSound] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());

  const beep = () => {
    try {
      const Ctx = (window as any).AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      [0, 0.45].forEach((offset) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.18, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.35);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.36);
      });
    } catch { /* audio is a bonus, never a dependency */ }
  };

  const load = () =>
    adminApi.sos.active().then((r: any[]) => setAlerts(r ?? [])).catch(() => {});

  const loadHistory = () =>
    adminApi.sos.history(histStatus, 200)
      .then((r: any[]) => setHistory(r ?? []))
      .catch(() => setHistory([]));

  useEffect(() => { if (showHistory) loadHistory(); }, [showHistory, histStatus]);

  /**
   * Alert the operator who is not looking at this tab: the count goes
   * into the browser tab title, and a genuinely new id makes a noise.
   * Comparing ids rather than the count means a resolve-then-raise in
   * the same 15 second window still sounds.
   */
  useEffect(() => {
    const open = alerts.length;
    document.title = open ? `(${open}) SOS - SEIRS admin` : 'SEIRS admin';
    const fresh = alerts.filter((a) => !seenIds.current.has(a.id));
    alerts.forEach((a) => seenIds.current.add(a.id));
    if (fresh.length && sound) beep();
    return () => { document.title = 'SEIRS admin'; };
  }, [alerts, sound]);

  useEffect(() => {
    load().finally(() => setLoading(false));
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  /**
   * Close the alert and record what was done. The note is not hard-required:
   * an emergency queue that cannot be cleared quickly is its own problem, so
   * the empty case exists but is a deliberate second click, never a slip.
   */
  const doResolve = async (a: any, resolutionNote: string) => {
    setSaving(true);
    try {
      await adminApi.sos.resolve(a.id, resolutionNote.trim() || undefined);
      setResolving(null);
      load();
    } catch (e: any) {
      alert(e?.message ?? 'Resolve failed');
    } finally {
      setSaving(false);
    }
  };

  /**
   * One line an operator can paste into WhatsApp or read down a phone to
   * the police. Copying raw coordinates, which is all this desk offered,
   * gives whoever receives it two numbers and no name, no callback and
   * no map.
   */
  const copyDispatch = (a: any) => {
    const maps = a.lat != null && a.lng != null
      ? `https://www.google.com/maps?q=${a.lat},${a.lng}`
      : 'no GPS fix';
    const lines = [
      `SEIRS EMERGENCY - ${a.user?.name ?? 'unknown user'} (${String(a.user?.role ?? 'user').toLowerCase()})`,
      `Phone: ${a.user?.phone ?? 'none on file'}`,
      a.note ? `They said: ${a.note}` : 'No detail given.',
      `Location: ${maps}`,
      a.counterparty ? `Other party: ${a.counterparty.name} (${a.counterparty.role}) ${a.counterparty.phone ?? ''}`.trim() : null,
      a.user?.emergencyContactPhone
        ? `Their emergency contact: ${a.user.emergencyContactName ?? 'unnamed'} ${a.user.emergencyContactPhone}`
        : null,
      a.delivery?.trackingCode ? `Booking: ${a.delivery.trackingCode}` : null,
      `Raised: ${new Date(a.createdAt).toLocaleString('en-NG')}`,
    ].filter(Boolean);
    navigator.clipboard.writeText(lines.join(String.fromCharCode(10)))
      .then(() => { setCopied(a.id + ':d'); setTimeout(() => setCopied(null), 1800); })
      .catch(() => {});
  };

  const copyPhone = (a: any, phone: string, key: string) => {
    navigator.clipboard.writeText(phone)
      .then(() => { setCopied(a.id + ':' + key); setTimeout(() => setCopied(null), 1500); })
      .catch(() => {});
  };

  /** Text filter over what an operator would actually remember: a name, a
   *  phone, what was said, what was done, or the tracking code. */
  const shownHistory = history.filter((h) => {
    const q = histQuery.trim().toLowerCase();
    if (!q) return true;
    return [h.user?.name, h.user?.phone, h.note, h.resolutionNote,
            h.delivery?.trackingCode, h.resolvedBy?.name]
      .some((v) => String(v ?? '').toLowerCase().includes(q));
  });

  const copyCoords = (a: any) => {
    navigator.clipboard.writeText(`${Number(a.lat).toFixed(6)}, ${Number(a.lng).toFixed(6)}`)
      .then(() => { setCopied(a.id); setTimeout(() => setCopied(null), 1500); })
      .catch(() => {});
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="p-8 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-red-600 flex items-center justify-center">
            <Siren size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">SOS Desk</h1>
            <p className="text-xs text-gray-500">
              Live emergency alerts from any SEIRS app · refreshes every 15s
            </p>
          </div>
          <button
            onClick={() => { setSound((v) => !v); if (!sound) beep(); }}
            title={sound ? 'Alert sound is on' : 'Alert sound is off'}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${
              sound
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            {sound ? <Bell size={13} /> : <BellOff size={13} />}
            {sound ? 'Sound on' : 'Sound off'}
          </button>
        </div>

        {/*
          The desk listed only OPEN alerts, so a resolved incident left
          the product entirely and the resolution note nobody could read
          was recorded for nothing. History is what shows a pattern and
          what proves SEIRS responded at all.
        */}
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            {showHistory ? 'Hide resolved alerts' : 'Show resolved alerts'}
          </button>
          {showHistory && (
            <span className="text-xs text-gray-400">
              {history.length} closed alert{history.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-24 text-center text-gray-400">Loading…</div>
        ) : alerts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3" />
            <p className="font-semibold text-gray-800">No open alerts</p>
            <p className="text-sm text-gray-500 mt-1">
              When anyone presses SOS in a SEIRS app, it appears here and as a
              red banner on every admin page.
            </p>
          </div>
        ) : (
          alerts.map((a) => (
            <div key={a.id} className="bg-white rounded-2xl border-2 border-red-200 p-5 mb-4 shadow-sm">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-base font-bold text-gray-900">
                    {/* Clickable. Every control on this card pointed at the
                        ops map, so ops could find WHERE someone was and
                        never WHO they were (founder 2026-08-24). */}
                    {a.user?.id ? (
                      <Link
                        href={`/users/${a.user.id}`}
                        className="underline decoration-red-300 underline-offset-2 hover:text-red-700"
                      >
                        {a.user?.name ?? 'Unknown user'}
                      </Link>
                    ) : (a.user?.name ?? 'Unknown user')}
                    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 align-middle">
                      {String(a.user?.role ?? '').toUpperCase() || 'USER'}
                    </span>
                  </p>
                  {/*
                    Calling them is the first thing anyone does, and the
                    number was flat grey text: the desk let you copy the
                    COORDINATES but not the phone. You ring before you
                    navigate.
                  */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {a.user?.phone ? (
                      <>
                        <a
                          href={`tel:${String(a.user.phone).replace(/[^+\d]/g, '')}`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700"
                        >
                          <PhoneCall size={14} /> Call {a.user.phone}
                        </a>
                        <button
                          onClick={() => copyPhone(a, a.user.phone, 'p')}
                          className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
                        >
                          {copied === a.id + ':p' ? 'Copied!' : 'Copy number'}
                        </button>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                        <Phone size={13} /> No phone on file
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {a.user?.email ?? 'no email'} · raised{' '}
                    {new Date(a.createdAt).toLocaleString('en-NG')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {/*
                    How long this has been open, big enough to read across
                    a room. The card showed a raise timestamp and left the
                    subtraction to the operator, in the one situation where
                    nobody does arithmetic.
                  */}
                  <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold tabular-nums ${
                    a.openMinutes >= 15 ? 'bg-red-600 text-white'
                    : a.openMinutes >= 5 ? 'bg-amber-100 text-amber-800'
                    : 'bg-gray-100 text-gray-700'
                  }`}>
                    <Clock size={13} />
                    {a.openMinutes < 60
                      ? `open ${a.openMinutes}m`
                      : `open ${Math.floor(a.openMinutes / 60)}h ${a.openMinutes % 60}m`}
                  </span>
                  <button
                    onClick={() => setResolving(a)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Resolve
                  </button>
                </div>
              </div>

              {/*
                A repeat raiser is a signal in both directions: someone
                genuinely in danger on a route they keep working, or
                someone leaning on the button. The desk should know
                before it picks up the phone.
              */}
              {a.raiserAlertCount > 1 && (
                <Link
                  href={`/users/${a.user?.id}`}
                  className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  <Repeat size={13} />
                  This is alert number {a.raiserAlertCount} from{' '}
                  {a.user?.name ?? 'this person'}. Read their record before you call.
                </Link>
              )}

              {/*
                What they said, at a glance. This used to be grey 12px text
                trailing a timestamp, which is the wrong weight for the one
                line that tells the desk whether this is a flat tyre or a
                threat inside the vehicle.
              */}
              {a.note ? (
                <div className="mt-4 rounded-xl border-l-4 border-red-500 bg-red-50 px-4 py-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-red-700">
                    <Quote size={12} /> They said
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-base font-semibold leading-snug text-red-900">
                    {a.note}
                  </p>
                </div>
              ) : (
                <div className="mt-4 rounded-xl bg-gray-50 px-4 py-2.5">
                  <p className="text-xs text-gray-500">
                    No detail from them yet. Their app asks what is happening
                    after the alert is sent, so it can still arrive: this list
                    refreshes every 15s.
                  </p>
                </div>
              )}

              {/* Only ever set on an alert an admin has already closed. The
                  live feed is active-only today, so this renders whenever a
                  resolved alert reaches this list by any other route. */}
              {a.resolutionNote && (
                <div className="mt-3 rounded-xl border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                    <ClipboardCheck size={12} /> What support did
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-snug text-emerald-900">
                    {a.resolutionNote}
                  </p>
                </div>
              )}

              {/*
                Who else is in that vehicle.
                When a rider presses SOS mid-trip the other party is the
                most relevant person on earth, and this desk could not
                name them. It knew the booking, so it offered "open their
                booking" and sent the operator to read a second page for
                a phone number, in the first minute of an emergency.
              */}
              {a.counterparty && (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                    <UserRound size={12} />
                    The {a.counterparty.role} on this trip
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/users/${a.counterparty.id}`}
                      className="text-sm font-semibold text-gray-900 underline decoration-gray-300 underline-offset-2 hover:text-[#3A7BD5]"
                    >
                      {a.counterparty.name ?? 'Unknown'}
                    </Link>
                    {a.counterparty.phone ? (
                      <>
                        <a
                          href={`tel:${String(a.counterparty.phone).replace(/[^+\d]/g, '')}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-100"
                        >
                          <PhoneCall size={12} /> Call {a.counterparty.phone}
                        </a>
                        <button
                          onClick={() => copyPhone(a, a.counterparty.phone, 'c')}
                          className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-900"
                        >
                          {copied === a.id + ':c' ? 'Copied!' : 'Copy'}
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-amber-700">no phone on file</span>
                    )}
                  </div>
                </div>
              )}

              {/*
                The next of kin they already gave us.
                Every SEIRS user is asked for an emergency contact and
                the answer is stored on their record. On the one screen
                that exists for an emergency, it was not shown, so an
                operator holding a live alert had to go and open the
                person's profile to find the number their own app
                collected for exactly this moment.

                Deliberately quieter than the buttons above it. Ringing
                somebody's family is a judgement call, not the next step:
                you call the person first. It only has to be reachable
                without leaving this page.
              */}
              {a.user?.emergencyContactPhone && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                    Their emergency contact
                  </span>
                  <span className="text-sm font-semibold text-gray-800">
                    {a.user.emergencyContactName || 'unnamed'}
                  </span>
                  <a
                    href={`tel:${String(a.user.emergencyContactPhone).replace(/[^+\d]/g, '')}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    <PhoneCall size={12} /> {a.user.emergencyContactPhone}
                  </a>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {a.lat != null && a.lng != null ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 font-mono text-xs text-gray-700">
                      <MapPin size={12} /> {Number(a.lat).toFixed(5)}, {Number(a.lng).toFixed(5)}
                    </span>
                    <button
                      onClick={() => copyCoords(a)}
                      className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
                    >
                      {copied === a.id ? 'Copied!' : 'Copy'}
                    </button>
                    <Link
                      href={`/ops-map?lat=${a.lat}&lng=${a.lng}&label=${encodeURIComponent('SOS · ' + (a.user?.name ?? ''))}&from=${encodeURIComponent('/sos')}&fromLabel=${encodeURIComponent('Back to the SOS desk')}`}
                      className="rounded-lg bg-[#0F2B4C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#163B66]"
                    >
                      View on ops map
                    </Link>
                    {/*
                      The ops map is for SEIRS. This one is for everybody
                      else: it is what an operator sends a police station
                      or a family member, and what gives whoever is
                      driving to them turn-by-turn directions.
                    */}
                    <a
                      href={`https://www.google.com/maps?q=${a.lat},${a.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                    >
                      <Navigation size={12} /> Directions
                    </a>
                  </>
                ) : (
                  <span className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
                    No GPS fix came with this alert: call them.
                  </span>
                )}
                {a.delivery?.id && (
                  <button
                    onClick={() => router.push(`/deliveries/${a.delivery.id}`)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
                  >
                    <Package size={12} />
                    {a.delivery.trackingCode ? `Booking ${a.delivery.trackingCode}` : 'Open their booking'}
                  </button>
                )}
                <button
                  onClick={() => copyDispatch(a)}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  <Copy size={12} />
                  {copied === a.id + ':d' ? 'Copied for dispatch' : 'Copy for dispatch'}
                </button>
              </div>
            </div>
          ))
        )}

        {showHistory && (
          <section className="mt-8">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-800">Past alerts</h2>
              {/*
                Cancelled is not a lesser resolved. A person pressing SOS
                and immediately withdrawing it is either a pocket press,
                which says the button is in the wrong place, or somebody
                who was told to take it back. Both are worth seeing, and
                filtering to resolved only hid them.
              */}
              <div className="flex overflow-hidden rounded-lg border border-gray-200">
                {(['resolved', 'cancelled', 'all'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setHistStatus(st)}
                    className={`px-3 py-1.5 text-xs font-medium capitalize ${
                      histStatus === st
                        ? 'bg-[#0F2B4C] text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              <input
                value={histQuery}
                onChange={(e) => setHistQuery(e.target.value)}
                placeholder="Filter by name, note or tracking code"
                className="min-w-[240px] flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-[#3A7BD5] focus:outline-none"
              />
            </div>
            {shownHistory.length === 0 ? (
              <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
                {history.length === 0
                  ? `No ${histStatus === 'all' ? '' : histStatus + ' '}alerts on record.`
                  : 'Nothing matches that filter.'}
              </div>
            ) : (
              <div className="space-y-2">
                {shownHistory.map((h) => (
                  <div key={h.id} className="rounded-xl border border-gray-100 bg-white p-4">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-semibold text-gray-800">
                        {h.user?.name ?? 'Unknown'}
                      </span>
                      {h.user?.role && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                          {h.user.role}
                        </span>
                      )}
                      {histStatus === 'all' && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          h.status === 'active'    ? 'bg-red-100 text-red-700'
                          : h.status === 'cancelled' ? 'bg-gray-100 text-gray-600'
                          : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {h.status}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {new Date(h.createdAt).toLocaleString('en-NG')}
                      </span>
                      {/*
                        How long it stayed open is the number that says
                        whether SEIRS responded, so it is not buried.
                      */}
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        h.openMinutes > 60 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        open {h.openMinutes < 60 ? `${h.openMinutes}m` : `${Math.round(h.openMinutes / 60)}h`}
                      </span>
                    </div>
                    {h.note && (
                      <p className="mt-2 text-sm text-gray-600">
                        <span className="text-gray-400">They said:</span> {h.note}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-gray-700">
                      <span className="text-gray-400">Outcome:</span>{' '}
                      {h.status === 'cancelled' ? (
                        /* Withdrawn by the person who raised it, so there is
                           no support note to be missing and flagging one as
                           an omission would be wrong. */
                        <em className="text-gray-500">stood down by {h.user?.name ?? 'the raiser'}</em>
                      ) : (
                        h.resolutionNote || <em className="text-amber-600">closed with no note</em>
                      )}
                      {h.resolvedBy?.name && h.status !== 'cancelled' && (
                        <span className="text-gray-400"> · by {h.resolvedBy.name}</span>
                      )}
                    </p>
                    {h.delivery?.trackingCode && (
                      <button
                        onClick={() => router.push(`/deliveries/${h.delivery.id}`)}
                        className="mt-2 text-xs font-medium text-[#3A7BD5] hover:underline"
                      >
                        {h.delivery.trackingCode}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {resolving && (
        <ResolveSosModal
          alert={resolving}
          saving={saving}
          onCancel={() => setResolving(null)}
          onConfirm={(note) => doResolve(resolving, note)}
        />
      )}
    </div>
  );
}

/**
 * Closing an alert asks what was done about it (founder 2026-08-24: "when
 * you click resolve can a support leave a quick comment to document it").
 *
 * Deliberately NOT a browser prompt(): some browser configurations block
 * prompt() outright, and a blocked dialog on the emergency desk means the
 * alert silently cannot be closed. Same local-modal pattern as
 * RejectDriverModal in drivers/[id], styled like ConfirmDialog.
 *
 * The note is optional but never accidental: the primary button stays
 * disabled until something is typed, and closing with no record takes a
 * second, explicit click. An emergency queue that cannot be cleared fast is
 * its own kind of failure, so the escape hatch stays.
 */
function ResolveSosModal({
  alert: a, saving, onCancel, onConfirm,
}: {
  alert:     any;
  saving:    boolean;
  onCancel:  () => void;
  onConfirm: (resolutionNote: string) => void;
}) {
  const [note,      setNote]      = useState('');
  const [skipArmed, setSkipArmed] = useState(false);
  const hasNote = note.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-bold text-[#0F2B4C]">What was done about it?</h2>
          <p className="mt-1 text-xs text-gray-500">
            Closing {a.user?.name ?? 'this alert'}
            {a.user?.role ? ` (${String(a.user.role).toLowerCase()})` : ''}, raised{' '}
            {new Date(a.createdAt).toLocaleString('en-NG')}. Logged with your admin identity.
          </p>
        </div>

        {/* The alert's own detail, so the agent is not typing blind. */}
        <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
          {a.note ? (
            <p className="whitespace-pre-wrap break-words text-sm font-semibold text-red-900">
              “{a.note}”
            </p>
          ) : (
            <p className="text-sm text-gray-500">They sent no detail with this alert.</p>
          )}
          <p className="mt-1 text-[11px] text-gray-500">
            {a.user?.phone ?? 'no phone on file'}
            {a.lat != null && a.lng != null
              ? ` · ${Number(a.lat).toFixed(5)}, ${Number(a.lng).toFixed(5)}`
              : ' · no GPS fix'}
          </p>
        </div>

        <div className="p-5">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Resolution note
          </label>
          <textarea
            value={note}
            onChange={(e) => { setNote(e.target.value); setSkipArmed(false); }}
            rows={3}
            maxLength={1000}
            autoFocus
            placeholder="e.g. Called her back, she was safe at the filling station and the police had arrived. Trip cancelled, no charge."
            className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[#3A7BD5] focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Stored on the alert. This is what anyone reviewing the queue later
            will have. Up to 1000 characters.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            Cancel
          </button>
          {!hasNote && (
            <button
              onClick={() => (skipArmed ? onConfirm('') : setSkipArmed(true))}
              disabled={saving}
              className={`rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${
                skipArmed
                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {skipArmed ? 'Confirm: close with no record' : 'Close without a note'}
            </button>
          )}
          <button
            onClick={() => onConfirm(note)}
            disabled={!hasNote || saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Resolving…' : 'Resolve and log this'}
          </button>
        </div>
      </div>
    </div>
  );
}
