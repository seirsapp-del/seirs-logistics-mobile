'use client';
import { useState, useEffect } from 'react';
import { Send, Users, Truck, Store, AlertCircle, CheckCircle2, Calendar, UserSearch } from 'lucide-react';
import { adminApi } from '@/lib/api';

// Spec V8 §3.13 - push composer for one-off ops broadcasts. Different
// from the CMS (which schedules editorial content) - this is for
// real-time messaging like "service paused in Lekki due to flooding".
//
// Both send paths are live: sendToUser for one person, broadcastToAudience
// for a whole segment. Neither is a placeholder. What does NOT exist is a
// scheduler, so the Schedule control is disabled rather than quietly
// firing now: see the Send section below.

// specific_zone was handled by three branches below but never listed in
// AUDIENCES, so the zone input was unreachable and the non-null find()
// would have thrown the moment it was selected. Dropped until the
// backend can actually filter a broadcast by zone.
type Audience = 'all_customers' | 'all_drivers' | 'all_partners' | 'one_user';

const AUDIENCES: Array<{ key: Audience; label: string; sub: string; Icon: any; color: string }> = [
  // One person first: support work is mostly one customer at a time, so
  // this is the common case, not the exotic one (founder 2026-08-13).
  { key: 'one_user',      label: 'One person',     sub: 'Search by name, email or SEIRS ID',  Icon: UserSearch, color: '#0F2B4C' },
  { key: 'all_customers', label: 'All customers',  sub: 'Everyone with a customer account',  Icon: Users, color: '#3A7BD5' },
  { key: 'all_drivers',   label: 'All drivers',    sub: 'Approved drivers only',              Icon: Truck, color: '#D97706' },
  { key: 'all_partners',  label: 'All partner stores', sub: 'Active partner store accounts',  Icon: Store, color: '#16A34A' },
];

export default function NotifyComposerPage() {
  const [audience, setAudience] = useState<Audience>('one_user');
  const [title,    setTitle]    = useState('');
  const [body,     setBody]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<{ recipients: number; pushed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote]   = useState<string | null>(null);

  // One-person mode: search customers/drivers and pick a single recipient.
  const [userQuery,   setUserQuery]   = useState('');
  const [userResults, setUserResults] = useState<any[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [recipient,   setRecipient]   = useState<any | null>(null);

  useEffect(() => {
    if (audience !== 'one_user') return;
    const q = userQuery.trim();
    if (q.length < 2) { setUserResults([]); return; }
    // Debounced so typing a name is not one request per keystroke.
    const t = setTimeout(() => {
      setSearching(true);
      adminApi.users(1, undefined, q)
        .then((r: any) => setUserResults(Array.isArray(r?.users) ? r.users.slice(0, 8) : []))
        .catch(() => setUserResults([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(t);
  }, [userQuery, audience]);

  const charLimit = 240;
  const titleOk = title.length > 0 && title.length <= 60;
  const bodyOk  = body.length  > 0 && body.length  <= charLimit;
  const audienceOk = audience === 'one_user' ? !!recipient : true;

  const canSend = titleOk && bodyOk && audienceOk && !submitting;

  const send = async () => {
    setSubmitting(true);
    setError(null);
    setSent(null);
    setNote(null);
    try {
      if (audience === 'one_user' && recipient) {
        const r = await adminApi.notifications.sendToUser({ userId: recipient.id, title, body });
        setSent({ recipients: 1, pushed: r.hasPushToken ? 1 : 0 });
        // Say plainly when it will only be seen in-app. Support needs to
        // know whether the person got a buzz or has to open the app.
        setNote(
          r.hasPushToken
            ? `Sent to ${r.recipientName}.`
            : `Saved to ${r.recipientName}'s inbox, but they have no push token, so they will only see it when they next open the app.`,
        );
        setTimeout(() => {
          setSent(null); setNote(null);
          setTitle(''); setBody(''); setRecipient(null); setUserQuery('');
        }, 6000);
        return;
      }
      // one_user returned above, so anything reaching here is a real
      // audience broadcast, and it fires immediately. There is no
      // scheduler behind this call, which is why the Schedule control is
      // disabled rather than accepting a datetime it would ignore.
      const res = await adminApi.notifications.broadcast({
        audience: audience as Exclude<Audience, 'one_user'>,
        title, body,
      });
      setSent(res);
      setTimeout(() => {
        setSent(null);
        setTitle(''); setBody('');
      }, 4000);
    } catch (e: any) {
      setError(e?.message ?? 'Broadcast failed');
    } finally {
      setSubmitting(false);
    }
  };

  const aud = AUDIENCES.find(a => a.key === audience)!;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <Send size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#0F2B4C]">Push Notification Composer</h1>
          <p className="text-sm text-gray-500">
            One-off broadcasts for ops events (service interruptions, weather alerts, system announcements). For editorial content use the CMS instead.
          </p>
        </div>
      </div>

      {sent && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
          <span>
            {note ?? `Broadcast sent to ${sent.recipients.toLocaleString()} ${sent.recipients === 1 ? 'user' : 'users'} (${sent.pushed.toLocaleString()} pushed).`}
          </span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Audience picker */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-5 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-gray-600">Audience</h2>
        <div className="grid grid-cols-2 gap-3">
          {AUDIENCES.map(a => {
            const active = audience === a.key;
            return (
              <button
                key={a.key}
                onClick={() => setAudience(a.key)}
                className={`text-left p-3 rounded-lg border-2 flex items-start gap-3 transition-colors ${
                  active ? 'border-[#3A7BD5] bg-[#3A7BD5]/5' : 'border-[#E5E7EB] hover:border-gray-300'
                }`}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: a.color + '15' }}
                >
                  <a.Icon size={16} color={a.color} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0F2B4C]">{a.label}</p>
                  <p className="text-xs text-gray-500 truncate">{a.sub}</p>
                </div>
              </button>
            );
          })}
        </div>
        {audience === 'one_user' && (
          <div className="mt-3">
            {recipient ? (
              <div className="flex items-center gap-3 p-3 rounded-lg border-2 border-[#3A7BD5] bg-[#3A7BD5]/5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#0F2B4C] truncate">{recipient.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {recipient.email}
                    {recipient.accountId ? ` · ${recipient.accountId}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => { setRecipient(null); setUserQuery(''); }}
                  className="text-xs font-semibold text-[#3A7BD5] hover:underline shrink-0"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Search by name, email or SEIRS ID"
                  value={userQuery}
                  onChange={e => setUserQuery(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:border-[#3A7BD5]"
                />
                {searching && <p className="text-xs text-gray-400 mt-2">Searching…</p>}
                {!searching && userQuery.trim().length >= 2 && userResults.length === 0 && (
                  <p className="text-xs text-gray-400 mt-2">No accounts match that.</p>
                )}
                {userResults.length > 0 && (
                  <div className="mt-2 border border-[#E5E7EB] rounded-lg divide-y divide-gray-50 overflow-hidden">
                    {userResults.map(u => (
                      <button
                        key={u.id}
                        onClick={() => setRecipient(u)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50"
                      >
                        <p className="text-sm font-medium text-[#0F2B4C] truncate">{u.name}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {u.email}
                          {u.accountId ? ` · ${u.accountId}` : ''}
                          {u.role ? ` · ${u.role}` : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Message */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-5 space-y-4">
        <div>
          <div className="flex justify-between items-baseline">
            <label className="text-xs font-bold uppercase tracking-wide text-gray-600">Title</label>
            <span className="text-[10px] text-gray-400">{title.length} / 60</span>
          </div>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value.slice(0, 60))}
            placeholder="Service paused in Lekki"
            className="w-full mt-1 px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:border-[#3A7BD5]"
          />
        </div>
        <div>
          <div className="flex justify-between items-baseline">
            <label className="text-xs font-bold uppercase tracking-wide text-gray-600">Message</label>
            <span className="text-[10px] text-gray-400">{body.length} / {charLimit}</span>
          </div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value.slice(0, charLimit))}
            placeholder="Heavy rain on Admiralty Way - driver pickups in the area are paused until 4pm. Tap to view alternatives."
            rows={4}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:border-[#3A7BD5]"
          />
        </div>
      </div>

      {/* Send timing. Schedule is disabled on purpose: send() never
          passed scheduleAt anywhere, so picking a time and pressing
          "Schedule broadcast" buzzed every phone immediately. An ops
          person scheduling "Service resumes at 6am" woke the whole user
          base at 11pm. Re-enable once a delayed-publish queue exists. */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-5 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-gray-600">Send</h2>
        <div className="flex gap-3">
          <div className="flex-1 p-3 rounded-lg border-2 border-[#3A7BD5] bg-[#3A7BD5]/5 text-sm font-semibold text-[#0F2B4C] text-center">
            Send now
          </div>
          <div
            aria-disabled="true"
            title="Scheduled sending is not built yet"
            className="flex-1 p-3 rounded-lg border-2 border-dashed border-[#E5E7EB] text-sm font-semibold text-gray-400 flex items-center justify-center gap-1.5 cursor-not-allowed"
          >
            <Calendar size={14} />
            Schedule
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Scheduling is not available yet. Every broadcast sent from this page goes out the moment you press send.
        </p>
      </div>

      {/* Preview */}
      <div className="bg-gradient-to-br from-[#0F2B4C] to-[#1a3d6b] rounded-xl p-5 text-white">
        <p className="text-[10px] font-bold uppercase tracking-wide opacity-60 mb-2">Preview</p>
        <div className="bg-white/10 rounded-lg p-4 space-y-2">
          <p className="font-bold text-sm">{title || 'Notification title'}</p>
          <p className="text-xs opacity-90">{body || 'Notification message body - appears in the device notification tray and in-app notification center.'}</p>
          <p className="text-[10px] opacity-50">to {aud.label}</p>
        </div>
      </div>

      <button
        onClick={send}
        disabled={!canSend}
        className="w-full bg-[#0F2B4C] text-white py-3 rounded-lg font-semibold hover:bg-[#3A7BD5] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
      >
        <Send size={16} />
        {submitting ? 'Sending…' : 'Send now'}
      </button>
    </div>
  );
}
