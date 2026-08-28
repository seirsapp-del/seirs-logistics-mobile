'use client';
import { useState, useEffect } from 'react';
import { Send, Users, Truck, Store, AlertCircle, CheckCircle2, Calendar, UserSearch, X } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { roleLabel } from '@/lib/labels';
import { PageIntro } from '@/components/PageIntro';
import { useConfirm } from '@/components/ConfirmDialog';

/**
 * One-off push broadcasts for ops events. Different from the CMS, which
 * schedules editorial content: this is "service paused in Lekki because
 * of flooding", sent now.
 *
 * The thing this screen was missing is the only thing that matters on
 * it. Choosing "All customers" and pressing Send buzzed every phone in
 * the country immediately, with no confirmation step and no statement
 * of how many people that was. The recipient count appeared AFTER the
 * message had gone. A push cannot be recalled, edited or deleted from
 * anybody's phone, so the moment of truth has to come first.
 *
 * Both send paths are live: sendToUser for one person,
 * broadcastToAudience for a segment. What does NOT exist is a
 * scheduler, so the Schedule control is disabled rather than quietly
 * firing now.
 */

// specific_zone was handled by three branches in the API but never
// listed here, so the zone input was unreachable. Dropped until the
// backend can genuinely filter a broadcast by zone: today it silently
// falls back to every customer, which is not what the word means.
type Audience = 'all_customers' | 'all_drivers' | 'all_partners' | 'one_user';

/**
 * `sub` says exactly who the server sends to, not who we wish it sent
 * to. "Approved drivers only" was wrong: the API selects every rider
 * account that is active, which includes riders still waiting for
 * approval and riders who were turned down.
 */
const AUDIENCES: Array<{ key: Audience; label: string; sub: string; exact: string; Icon: any; color: string }> = [
  // One person first: support work is mostly one customer at a time, so
  // this is the common case, not the exotic one (founder 2026-08-13).
  { key: 'one_user',      label: 'One person',         sub: 'Search by name, email or SEIRS ID',
    exact: 'one account you pick below', Icon: UserSearch, color: '#0F2B4C' },
  { key: 'all_customers', label: 'Every customer',     sub: 'Every active customer account, business accounts included',
    exact: 'every customer account that is not suspended, business accounts included', Icon: Users, color: '#3A7BD5' },
  { key: 'all_drivers',   label: 'Every rider',        sub: 'Every active rider account, including ones still awaiting approval',
    exact: 'every rider account that is not suspended, including riders still waiting for approval', Icon: Truck, color: '#D97706' },
  { key: 'all_partners',  label: 'Every partner store', sub: 'Every active partner store account',
    exact: 'every partner store account that is not suspended', Icon: Store, color: '#16A34A' },
];

export default function NotifyComposerPage() {
  const confirm = useConfirm();

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

  /**
   * Exactly how many people an audience is (2026-08-28).
   *
   * This used to come from the dashboard totals, and was wrong in BOTH
   * directions: totalUsers excluded nothing, so it counted suspended
   * accounts the broadcast skips, and it missed business accounts the
   * broadcast includes. It also had no figure at all for partners. The
   * number shown before messaging the entire user base was therefore
   * not the number of people who would receive it.
   *
   * It now calls the same resolver the send calls, so the count and the
   * send cannot disagree, and it separates the two things that were
   * being reported as one: everybody in the audience gets an in-app
   * notification row, but only those with a device token saved have a
   * phone that can be buzzed.
   */
  const [reach, setReach] = useState<{
    recipients: number; withPush: number; withoutPush: number; pushEnabled: boolean;
  } | null>(null);
  const [sizing, setSizing] = useState(false);

  useEffect(() => {
    let alive = true;
    setSizing(true);
    setReach(null);
    adminApi.broadcastAudienceSize(audience)
      .then(r => { if (alive) setReach(r); })
      .catch(() => { if (alive) setReach(null); })
      .finally(() => { if (alive) setSizing(false); });
    return () => { alive = false; };
  }, [audience]);

  const approxFor = (_a: Audience): number | null => reach?.recipients ?? null;

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

  const aud = AUDIENCES.find(a => a.key === audience)!;

  const send = async () => {
    /**
     * The confirmation this page never had. Everything below the fold
     * of this dialog is irreversible: there is no unsend, no edit, and
     * no delete from anybody's phone or notification tray.
     */
    const size = approxFor(audience);
    const who  = audience === 'one_user'
      ? `${recipient?.name ?? 'this person'} (${recipient?.email ?? 'no email'})`
      : aud.exact;

    const ok = await confirm({
      title:   audience === 'one_user' ? `Send this to ${recipient?.name ?? 'this person'}?` : 'Send this to everybody?',
      message:
        `Going to: ${who}.\n` +
        (audience === 'one_user'
          ? ''
          : size !== null
            ? `That is roughly ${size.toLocaleString()} people. The exact figure is shown after it sends.\n`
            : 'This screen cannot count that audience before sending. The exact figure is shown afterwards.\n') +
        '\n' +
        `Title: ${title.trim()}\n` +
        `Message: ${body.trim()}\n\n` +
        'It buzzes their phone the moment you confirm. It CANNOT be recalled, edited or deleted afterwards.',
      confirmLabel: audience === 'one_user' ? 'Send it' : 'Send to everybody',
      danger:       audience !== 'one_user',
    });
    if (!ok) return;

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
            ? `Sent to ${r.recipientName}. Their phone buzzed.`
            : `Saved to ${r.recipientName}'s inbox, but their phone has no push set up, so they will only see it the next time they open the app.`,
        );
        setTitle(''); setBody(''); setRecipient(null); setUserQuery('');
        return;
      }
      // one_user returned above, so anything reaching here is a real
      // audience broadcast and it fires immediately. There is no
      // scheduler behind this call, which is why the Schedule control is
      // disabled rather than accepting a time it would ignore.
      const res = await adminApi.notifications.broadcast({
        audience: audience as Exclude<Audience, 'one_user'>,
        title, body,
      });
      setSent(res);
      setTitle(''); setBody('');
    } catch (e: any) {
      setError(e?.message ?? 'The send failed. Nothing went out.');
    } finally {
      setSubmitting(false);
    }
  };

  const size = approxFor(audience);

  return (
    <div className="max-w-3xl space-y-6 p-8">
      <PageIntro
        title="Push Composer"
        purpose="Send a message straight to people's phones, right now. Used for service interruptions, weather and system announcements."
        storageKey="notify"
        help={
          <>
            <p>Everything sent here goes out <strong>immediately</strong> and <strong>cannot be recalled</strong>. There is no unsend, no edit, and no way to remove it from somebody&apos;s phone.</p>
            <p>It buzzes their device and lands in their in-app inbox. Somebody with no push set up gets the inbox copy only.</p>
            <p>Pick an audience, write it, and read the confirmation before you press send: it names exactly who is about to be woken up.</p>
            <p>For editorial content and stories, use App &amp; Website Content instead. This is for things that cannot wait.</p>
          </>
        }
      />

      {/* The receipt used to erase itself after four seconds, so an
          operator who looked away lost the only record of how many
          people they had just messaged. It stays until dismissed. */}
      {sent && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">
            {note ?? `Sent to ${sent.recipients.toLocaleString()} ${sent.recipients === 1 ? 'person' : 'people'}. ${sent.pushed.toLocaleString()} phone${sent.pushed === 1 ? '' : 's'} buzzed; the rest will see it when they next open the app.`}
          </span>
          <button onClick={() => { setSent(null); setNote(null); }} aria-label="Dismiss" className="shrink-0 text-green-700/60 hover:text-green-900">
            <X size={14} />
          </button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Audience picker */}
      <div className="space-y-3 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wide text-gray-600">Who gets this</h2>
        <div className="grid grid-cols-2 gap-3">
          {AUDIENCES.map(a => {
            const active   = audience === a.key;
            const aSize    = approxFor(a.key);
            return (
              <button
                key={a.key}
                onClick={() => setAudience(a.key)}
                className={`flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors ${
                  active ? 'border-[#3A7BD5] bg-[#3A7BD5]/5' : 'border-[#E5E7EB] hover:border-gray-300'
                }`}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: a.color + '15' }}
                >
                  <a.Icon size={16} color={a.color} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0F2B4C]">
                    {a.label}
                    {aSize !== null && (
                      <span className="ml-1.5 font-normal text-xs text-[#0F2B4C]/50">{aSize.toLocaleString()}</span>
                    )}
                  </p>
                  <p className="text-xs leading-snug text-gray-500">{a.sub}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/*
          The two numbers that were being reported as one.
          EVERYBODY in the audience gets an in-app notification row.
          Only those with a device token saved have a phone that can be
          buzzed. Collapsing them is how "sent to 5,000 people" comes to
          mean five thousand rows nobody looked at.
        */}
        {audience !== 'one_user' && (
          <div className="mt-3 rounded-lg bg-[#F5F5F0] px-3 py-2.5 text-sm text-[#0F2B4C]/70">
            {sizing ? (
              'Counting who this reaches...'
            ) : reach == null ? (
              'Could not count this audience. The send would still go to everyone in it.'
            ) : (
              <>
                <strong className="tabular-nums text-[#0F2B4C]">{reach.recipients.toLocaleString()}</strong>
                {' '}{reach.recipients === 1 ? 'person gets' : 'people get'} this in the app.
                {' '}
                {!reach.pushEnabled ? (
                  <span className="font-semibold text-amber-800">
                    No phone will buzz: push is not switched on for this server.
                  </span>
                ) : (
                  <>
                    <strong className="tabular-nums text-[#0F2B4C]">{reach.withPush.toLocaleString()}</strong>
                    {' '}of them {reach.withPush === 1 ? 'has' : 'have'} a phone that can be buzzed
                    {reach.withoutPush > 0 && (
                      <>; the other {reach.withoutPush.toLocaleString()} will see it when they next open the app</>
                    )}.
                  </>
                )}
              </>
            )}
          </div>
        )}

        {audience === 'one_user' && (
          <div className="mt-3">
            {recipient ? (
              <div className="flex items-center gap-3 rounded-lg border-2 border-[#3A7BD5] bg-[#3A7BD5]/5 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#0F2B4C]">{recipient.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {recipient.email}
                    {recipient.accountId ? ` · ${recipient.accountId}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => { setRecipient(null); setUserQuery(''); }}
                  className="shrink-0 text-xs font-semibold text-[#3A7BD5] hover:underline"
                >
                  Pick somebody else
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Search by name, email or SEIRS ID"
                  value={userQuery}
                  onChange={e => setUserQuery(e.target.value)}
                  className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[#3A7BD5] focus:outline-none"
                />
                {searching && <p className="mt-2 text-xs text-gray-400">Searching</p>}
                {!searching && userQuery.trim().length >= 2 && userResults.length === 0 && (
                  <p className="mt-2 text-xs text-gray-400">No account matches that name, email or SEIRS ID.</p>
                )}
                {userResults.length > 0 && (
                  <div className="mt-2 divide-y divide-gray-50 overflow-hidden rounded-lg border border-[#E5E7EB]">
                    {userResults.map(u => (
                      <button
                        key={u.id}
                        onClick={() => setRecipient(u)}
                        className="w-full px-3 py-2 text-left hover:bg-gray-50"
                      >
                        <p className="truncate text-sm font-medium text-[#0F2B4C]">{u.name}</p>
                        <p className="truncate text-xs text-gray-400">
                          {u.email}
                          {u.accountId ? ` · ${u.accountId}` : ''}
                          {u.role ? ` · ${roleLabel(u.role)}` : ''}
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
      <div className="space-y-4 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <div>
          <div className="flex items-baseline justify-between">
            <label className="text-xs font-bold uppercase tracking-wide text-gray-600">Title</label>
            <span className="text-[10px] text-gray-400 tabular-nums">{title.length} / 60</span>
          </div>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value.slice(0, 60))}
            placeholder="Service paused in Lekki"
            className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[#3A7BD5] focus:outline-none"
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label className="text-xs font-bold uppercase tracking-wide text-gray-600">Message</label>
            <span className="text-[10px] text-gray-400 tabular-nums">{body.length} / {charLimit}</span>
          </div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value.slice(0, charLimit))}
            placeholder="Heavy rain on Admiralty Way. Rider pickups in the area are paused until 4pm."
            rows={4}
            className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[#3A7BD5] focus:outline-none"
          />
        </div>
      </div>

      {/* Send timing. Schedule is disabled on purpose: send() never
          passed scheduleAt anywhere, so picking a time and pressing
          "Schedule broadcast" buzzed every phone immediately. An ops
          person scheduling "Service resumes at 6am" woke the whole user
          base at 11pm. Re-enable once a delayed-publish queue exists. */}
      <div className="space-y-3 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wide text-gray-600">When</h2>
        <div className="flex gap-3">
          <div className="flex-1 rounded-lg border-2 border-[#3A7BD5] bg-[#3A7BD5]/5 p-3 text-center text-sm font-semibold text-[#0F2B4C]">
            Right now
          </div>
          <div
            aria-disabled="true"
            title="Scheduled sending is not built yet"
            className="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[#E5E7EB] p-3 text-sm font-semibold text-gray-400"
          >
            <Calendar size={14} /> Later
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Sending later is not built yet. Everything from this page goes out the moment you press send.
        </p>
      </div>

      {/* Preview */}
      <div className="rounded-xl bg-gradient-to-br from-[#0F2B4C] to-[#1a3d6b] p-5 text-white">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide opacity-60">How it will look on their phone</p>
        <div className="space-y-2 rounded-lg bg-white/10 p-4">
          <p className="text-sm font-bold">{title || 'Notification title'}</p>
          <p className="text-xs opacity-90">{body || 'The message body, as it appears in the phone notification tray and in the in-app inbox.'}</p>
          <p className="text-[10px] opacity-50">
            to {aud.label.toLowerCase()}
            {audience === 'one_user' && recipient ? `: ${recipient.name}` : size !== null ? `, ${size.toLocaleString()} people` : ''}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {audience === 'one_user'
          ? <>This goes to <strong>{recipient ? recipient.name : 'the person you pick above'}</strong> only.</>
          : <>This goes to <strong>{aud.exact}</strong>{size !== null ? <>, roughly <strong>{size.toLocaleString()} people</strong></> : ''}. The count is an estimate: this screen has no way to count the audience exactly before sending, and the true figure is shown afterwards.</>}
        {' '}Once sent it cannot be recalled, edited or deleted.
      </div>

      <button
        onClick={send}
        disabled={!canSend}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F2B4C] py-3 font-semibold text-white transition-colors hover:bg-[#3A7BD5] disabled:opacity-50"
      >
        <Send size={16} />
        {submitting
          ? 'Sending'
          : audience === 'one_user'
            ? `Send to ${recipient?.name ?? 'one person'}`
            : `Send to ${aud.label.toLowerCase()}`}
      </button>
      {!canSend && !submitting && (
        <p className="text-center text-xs text-[#0F2B4C]/40">
          {!audienceOk ? 'Pick who this is going to first.' : !titleOk ? 'A title is needed.' : 'A message is needed.'}
        </p>
      )}
    </div>
  );
}
