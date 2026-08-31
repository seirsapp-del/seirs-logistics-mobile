'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShieldAlert, Clock, MapPin, Navigation, PhoneCall, Loader2, RefreshCw, CheckCircle2,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';
import { naira } from '@/lib/money';

/**
 * Riders who agreed to carry a specific load and then did not.
 *
 * Built 2026-08-31. The founder wanted a rider who accepts and then
 * fails to deliver flagged and reported, "because they default of a
 * signed contract", and was explicit that it must not be an automatic
 * ban.
 *
 * So this page decides nothing. It lays out the evidence and asks a
 * person. That is not caution for its own sake: in Nigeria a rider whose
 * bike was seized at a checkpoint, or who was in an accident, or who
 * found no fuel, produces exactly the same database row as one who could
 * not be bothered. No threshold separates them. A human reading the note
 * and the history can.
 *
 * The strike count is shown because a pattern is meaningful. It is not
 * an instruction, and there is deliberately no button that acts on it.
 */

/** Suggested outcomes. Free text underneath, because real cases vary. */
const ACTIONS = [
  { key: 'excused',   label: 'Excused',        hint: 'Genuine failure. No mark against them.' },
  { key: 'warned',    label: 'Warned',         hint: 'Recorded and the rider told.' },
  { key: 'suspended', label: 'Suspended',      hint: 'Off the platform for now, reversible.' },
  { key: 'banned',    label: 'Banned',         hint: 'Removed. Do this deliberately.' },
];

function sinceAgreed(agreedAt: string | null, breachedAt: string): string {
  if (!agreedAt) return 'unknown';
  const ms = new Date(breachedAt).getTime() - new Date(agreedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min after agreeing`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr after agreeing`;
  return `${Math.round(hrs / 24)} days after agreeing`;
}

export default function AgreementBreachesPage() {
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReviewed, setShowReviewed] = useState(false);
  const [deciding, setDeciding] = useState<any | null>(null);
  const [action, setAction]     = useState('');
  const [note, setNote]         = useState('');
  const [saving, setSaving]     = useState(false);

  const load = async (reviewed = showReviewed) => {
    setLoading(true);
    try {
      const res = await adminApi.agreementBreaches.list(reviewed, 100);
      setRows(res?.items ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [showReviewed]);

  const submit = async () => {
    if (!deciding || !action.trim()) return;
    setSaving(true);
    try {
      await adminApi.agreementBreaches.review(deciding.id, action.trim(), note.trim() || undefined);
      setDeciding(null); setAction(''); setNote('');
      await load();
    } catch (e: any) {
      alert(e?.message ?? 'Could not save that decision.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <main className="p-8">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-[#0F2B4C]">Broken agreements</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#0F2B4C]/50">
              A rider was asked by name to carry a load, agreed, and then did not.
              Nothing here has been decided automatically. Read the case and choose.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReviewed((v) => !v)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                showReviewed
                  ? 'border-[#0F2B4C] bg-[#0F2B4C] text-white'
                  : 'border-[#E5E7EB] bg-white text-[#0F2B4C]/50 hover:border-[#0F2B4C]/30'
              }`}
            >
              {showReviewed ? 'Showing decided' : 'Showing open'}
            </button>
            <button
              onClick={() => load()}
              className="rounded-full border border-[#E5E7EB] bg-white p-2 text-[#0F2B4C]/50 hover:text-[#0F2B4C]"
              aria-label="Refresh"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-16 text-sm text-[#0F2B4C]/40">
            <Loader2 size={16} className="animate-spin" /> Loading
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={showReviewed ? <CheckCircle2 size={26} /> : <ShieldAlert size={26} />}
            title={showReviewed ? 'Nothing decided yet' : 'No broken agreements'}
            body={
              showReviewed
                ? 'Cases you have decided will be listed here with what you chose.'
                : 'When a rider agrees to carry a load and then backs out, the case lands here for you to read.'
            }
            tone={showReviewed ? 'quiet' : 'good'}
          />
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[#0F2B4C]">{r.driverName ?? 'Rider'}</span>
                      {r.driverPhone && (
                        <a
                          href={`tel:${r.driverPhone}`}
                          className="inline-flex items-center gap-1 text-xs text-[#3A7BD5] hover:underline"
                        >
                          <PhoneCall size={11} /> {r.driverPhone}
                        </a>
                      )}
                      <span className="text-xs text-[#0F2B4C]/40">
                        {r.vehicleType}{r.vehiclePlate ? ` · ${r.vehiclePlate}` : ''}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#0F2B4C]/50">
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} /> {sinceAgreed(r.agreedAt, r.createdAt)}
                      </span>
                      {r.stage && <span>broke off at: {r.stage}</span>}
                      {r.trackingCode && (
                        <Link href={`/deliveries?search=${r.trackingCode}`} className="font-mono text-[#3A7BD5] hover:underline">
                          {r.trackingCode}
                        </Link>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    {/* A pattern is meaningful. It is not an instruction, and
                        nothing on this page acts on it by itself. */}
                    <div className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      Number(r.strikeCount) >= 3
                        ? 'bg-red-50 text-red-700'
                        : Number(r.strikeCount) === 2
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-gray-100 text-[#0F2B4C]/50'
                    }`}>
                      {r.strikeCount === 1 ? 'First time' : `${r.strikeCount} in the window`}
                    </div>
                    {r.fareNgn != null && (
                      <div className="mt-1 text-xs text-[#0F2B4C]/40">
                        sender paid {naira(Number(r.fareNgn))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-sm text-[#0F2B4C]/70">
                  {r.pickupAddress && (
                    <div className="flex items-start gap-1.5">
                      <MapPin size={12} className="mt-0.5 shrink-0 text-emerald-500" />
                      <span>{r.pickupAddress}</span>
                    </div>
                  )}
                  {(r.counterDropAddress || r.dropoffAddress) && (
                    <div className="flex items-start gap-1.5">
                      <Navigation size={12} className="mt-0.5 shrink-0 text-red-500" />
                      <span>
                        {r.counterDropAddress ?? r.dropoffAddress}
                        {r.counterDropAddress && (
                          <span className="ml-1 text-xs text-amber-700">
                            (the rider proposed this spot themselves)
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* What the rider said, and what the sender had asked for.
                    Both matter: a rider who proposed the drop point and then
                    could not reach it is a different case from one who was
                    asked to go somewhere awkward. */}
                {r.reason && (
                  <p className="mt-3 rounded-lg bg-[#F5F5F0] px-3 py-2 text-sm text-[#0F2B4C]/70">
                    <span className="font-semibold">Rider said:</span> {r.reason}
                    {r.note ? ` — ${r.note}` : ''}
                  </p>
                )}
                {r.senderInstructions && (
                  <p className="mt-2 rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm text-[#0F2B4C]/60">
                    <span className="font-semibold">Sender had asked:</span> {r.senderInstructions}
                  </p>
                )}

                {r.reviewedAt ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#F5F5F0] pt-3 text-sm">
                    <span className="rounded bg-[#0F2B4C]/5 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/60">
                      {r.action}
                    </span>
                    {r.reviewNote && <span className="text-[#0F2B4C]/50">{r.reviewNote}</span>}
                  </div>
                ) : (
                  <button
                    onClick={() => { setDeciding(r); setAction(''); setNote(''); }}
                    className="mt-4 rounded-lg bg-[#0F2B4C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0F2B4C]/90"
                  >
                    Decide this case
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Decision */}
      {deciding && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-[#0F2B4C]">
              {deciding.driverName ?? 'This rider'}
            </h2>
            <p className="mt-1 text-sm text-[#0F2B4C]/50">
              Whatever you choose is recorded against the case, not applied
              automatically anywhere else. Excusing it is a real answer.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {ACTIONS.map((a) => (
                <button
                  key={a.key}
                  onClick={() => setAction(a.key)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    action === a.key
                      ? 'border-[#0F2B4C] bg-[#0F2B4C]/5'
                      : 'border-[#E5E7EB] hover:border-[#0F2B4C]/30'
                  }`}
                >
                  <div className="text-sm font-semibold text-[#0F2B4C]">{a.label}</div>
                  <div className="text-xs text-[#0F2B4C]/45">{a.hint}</div>
                </button>
              ))}
            </div>

            <input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="Or type your own"
              className="mt-3 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm"
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why. Whoever reads this in six months will not remember the call you made today."
              rows={3}
              className="mt-2 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeciding(null)}
                className="rounded-lg border border-[#E5E7EB] px-4 py-2 text-sm font-semibold text-[#0F2B4C]/60"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!action.trim() || saving}
                className="rounded-lg bg-[#0F2B4C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {saving ? 'Saving' : 'Record decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
