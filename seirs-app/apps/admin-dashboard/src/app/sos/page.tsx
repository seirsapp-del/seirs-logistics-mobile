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
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Siren, MapPin, Phone, Package, CheckCircle2, Copy, Quote, ClipboardCheck } from 'lucide-react';
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

  const load = () =>
    adminApi.sos.active().then((r: any[]) => setAlerts(r ?? [])).catch(() => {});

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
                  <p className="text-sm text-gray-600 flex items-center gap-1.5 mt-1">
                    <Phone size={13} className="text-gray-400" />
                    {a.user?.phone ?? 'no phone on file'} · {a.user?.email ?? ''}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Raised {new Date(a.createdAt).toLocaleString('en-NG')}
                  </p>
                </div>
                <button
                  onClick={() => setResolving(a)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Resolve
                </button>
              </div>

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
                      href={`/ops-map?lat=${a.lat}&lng=${a.lng}&label=${encodeURIComponent('SOS · ' + (a.user?.name ?? ''))}`}
                      className="rounded-lg bg-[#0F2B4C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#163B66]"
                    >
                      View on ops map
                    </Link>
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
                    <Package size={12} /> Open their booking
                  </button>
                )}
              </div>
            </div>
          ))
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
