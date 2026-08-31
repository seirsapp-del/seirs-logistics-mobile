'use client';
/**
 * Choosing when an email goes out, and to whom.
 *
 * The push composer's "Later" option was disabled because choosing it
 * fired the message immediately, which is the worst way for a scheduler
 * to be missing. This is the UI over the campaign API, and it is built
 * around one idea: nothing here is reversible once it runs, so the
 * screen states the count and the time in words before the button, not
 * after it.
 */
import { useEffect, useState } from 'react';
import { CalendarClock, Users, X, AlertTriangle, Loader2 } from 'lucide-react';
import { adminApi } from '@/lib/api';

const AUDIENCES: Array<{ id: string; label: string; who: string }> = [
  { id: 'all_customers', label: 'All customers',
    who: 'Everybody with an active customer account, business accounts included.' },
  { id: 'all_drivers',   label: 'All drivers',
    who: 'Every active driver. This includes drivers still waiting for approval and drivers who were turned down, because that is who the server selects.' },
  { id: 'all_partners',  label: 'Partner stores',
    who: 'Every active account with the partner capability.' },
];

/** Local datetime for an <input type="datetime-local">, which will not read an ISO Z string. */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ScheduleSend({
  templateKey, templateName, onClose, onScheduled, notify,
}: {
  templateKey:  string;
  templateName: string;
  onClose:      () => void;
  onScheduled:  () => void;
  notify:       (o: any) => void;
}) {
  /* An hour from now, rounded, rather than "right now": the default on a
     scheduler should never be an accidental immediate send to everybody. */
  const [when, setWhen] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return toLocalInput(d);
  });
  const [audience, setAudience] = useState('all_customers');
  const [count, setCount]       = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [busy, setBusy]         = useState(false);
  const [armed, setArmed]       = useState(false);

  /* The real number, from the endpoint that counts the same people the
     send reaches. The push composer's figure came from stats and was
     wrong in both directions. */
  useEffect(() => {
    let alive = true;
    setCounting(true);
    setCount(null);
    adminApi.emailTemplates.campaigns.audienceSize(audience)
      .then(r => { if (alive) setCount(r.count); })
      .catch(() => { if (alive) setCount(null); })
      .finally(() => { if (alive) setCounting(false); });
    return () => { alive = false; };
  }, [audience]);

  useEffect(() => { setArmed(false); }, [when, audience]);

  const chosen = AUDIENCES.find(a => a.id === audience)!;
  const whenDate = when ? new Date(when) : null;
  const inPast = whenDate ? whenDate.getTime() < Date.now() - 60_000 : false;

  const go = async () => {
    if (!armed) { setArmed(true); return; }
    setBusy(true);
    try {
      await adminApi.emailTemplates.campaigns.schedule({
        templateKey,
        audience,
        scheduledAt: new Date(when).toISOString(),
      });
      notify({
        title: 'Queued',
        message: `"${templateName}" will go to ${count ?? 'the'} ${chosen.label.toLowerCase()} on ${whenDate?.toLocaleString('en-NG')}. You can call it off until it starts.`,
        tone: 'success',
      });
      onScheduled();
      onClose();
    } catch (e: any) {
      notify({ title: 'Not queued', message: e?.message ?? 'Something went wrong.', tone: 'error' });
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] px-5 py-4">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-[#0F2B4C]">
              <CalendarClock size={16} /> Send this email later
            </h3>
            <p className="mt-0.5 text-xs text-[#0F2B4C]/50">{templateName}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[#0F2B4C]/40 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/50">Who gets it</label>
            <div className="mt-1.5 space-y-1.5">
              {AUDIENCES.map(a => (
                <label
                  key={a.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${
                    audience === a.id ? 'border-[#3A7BD5] bg-[#3A7BD5]/5' : 'border-[#E5E7EB] hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    checked={audience === a.id}
                    onChange={() => setAudience(a.id)}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#0F2B4C]">{a.label}</span>
                    <span className="block text-xs text-[#0F2B4C]/50">{a.who}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/50">When</label>
            <input
              type="datetime-local"
              value={when}
              onChange={e => setWhen(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:border-[#3A7BD5]"
            />
            {inPast && (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-red-600">
                <AlertTriangle size={12} /> That time has already passed.
              </p>
            )}
            <p className="mt-1 text-[11px] text-[#0F2B4C]/45">
              Your own clock. It goes out within about a minute of that time.
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-[#F5F5F0] px-3 py-2.5">
            <Users size={14} className="mt-0.5 shrink-0 text-[#0F2B4C]/40" />
            <p className="text-sm text-[#0F2B4C]/70">
              {counting ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Counting
                </span>
              ) : count == null ? (
                'Could not count this audience. The send would still go to everyone in it.'
              ) : (
                <>
                  This reaches <strong className="tabular-nums text-[#0F2B4C]">{count.toLocaleString()}</strong>{' '}
                  {count === 1 ? 'person' : 'people'}, counted the same way the send counts them.
                </>
              )}
            </p>
          </div>

          {armed && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              <p className="font-semibold">Press again to queue it.</p>
              <p className="mt-0.5">
                Once it starts it cannot be recalled, edited or deleted, and everybody on the list
                gets it. You can call it off any time before {whenDate?.toLocaleString('en-NG')}.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#E5E7EB] bg-[#FAFAF7] px-5 py-3">
          <button onClick={onClose} className="px-3 py-2 text-sm text-[#0F2B4C]/60 hover:text-[#0F2B4C]">
            Cancel
          </button>
          <button
            onClick={go}
            disabled={busy || inPast || !when}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 ${
              armed ? 'bg-red-600 hover:bg-red-700' : 'bg-[#3A7BD5] hover:bg-[#2f66b3]'
            }`}
          >
            {busy ? 'Queueing' : armed ? 'Yes, queue it' : 'Queue this send'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   What is queued, and what already went.
   ──────────────────────────────────────────────────────────────────── */
const STATUS_WORDS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Waiting to go',  cls: 'bg-blue-50 text-blue-700' },
  sending:   { label: 'Going out now',  cls: 'bg-amber-100 text-amber-800' },
  sent:      { label: 'Sent',           cls: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Called off',     cls: 'bg-gray-100 text-gray-600' },
  failed:    { label: 'Did not send',   cls: 'bg-red-100 text-red-700' },
};

export function CampaignList({
  rows, onCancel, busyId,
}: {
  rows: Awaited<ReturnType<typeof adminApi.emailTemplates.campaigns.list>>;
  onCancel: (id: string, name: string) => void;
  busyId: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
      <table className="w-full text-sm">
        <thead className="bg-[#F5F5F0] text-[11px] uppercase tracking-wide text-[#0F2B4C]/40">
          <tr>
            <th className="px-4 py-3 text-left">Email</th>
            <th className="px-4 py-3 text-left">Who</th>
            <th className="px-4 py-3 text-left">When</th>
            <th className="px-4 py-3 text-left">State</th>
            <th className="px-4 py-3 text-left">Result</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F5F5F0]">
          {rows.map(c => {
            const s = STATUS_WORDS[c.status] ?? { label: c.status, cls: 'bg-gray-100 text-gray-600' };
            return (
              <tr key={c.id} className="hover:bg-[#FAFAF7]">
                <td className="px-4 py-3">
                  <p className="font-semibold text-[#0F2B4C]">{c.templateName}</p>
                  <p className="mt-0.5 truncate text-xs text-[#0F2B4C]/50">{c.subjectAtSend}</p>
                  {/* The template can be deleted after a campaign is
                      queued, and the send would then fail at run time.
                      Better to say so while it can still be called off. */}
                  {c.templateMissing && c.status === 'scheduled' && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                      <AlertTriangle size={9} /> This email has been deleted. It will fail.
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-[#0F2B4C]/70">
                  {AUDIENCES.find(a => a.id === c.audience)?.label ?? c.audience}
                </td>
                <td className="px-4 py-3 text-xs text-[#0F2B4C]/60">
                  {new Date(c.scheduledAt).toLocaleString('en-NG')}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${s.cls}`}>{s.label}</span>
                </td>
                <td className="px-4 py-3 text-xs text-[#0F2B4C]/60">
                  {c.status === 'sent' ? (
                    <span className="tabular-nums">
                      {c.delivered.toLocaleString()} delivered
                      {c.failed > 0 && <span className="text-red-600">, {c.failed} failed</span>}
                    </span>
                  ) : c.status === 'failed' ? (
                    <span className="text-red-600">{c.note ?? 'No reason recorded'}</span>
                  ) : c.status === 'cancelled' ? (
                    <span>{c.note ?? 'Called off'}</span>
                  ) : (
                    <span className="text-[#0F2B4C]/35">Not yet</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {c.status === 'scheduled' && (
                    <button
                      onClick={() => onCancel(c.id, c.templateName)}
                      disabled={busyId === c.id}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      Call it off
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
