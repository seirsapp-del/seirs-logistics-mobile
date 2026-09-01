'use client';

/**
 * Support inbox for the SEIRS ops team.
 *
 * The one job: answer the people waiting on SEIRS right now, and mark
 * the conversation finished when it is done. Everything on the screen is
 * arranged around that: the queue on the left, the conversation on the
 * right, and the reply box under it.
 *
 * Two-pane layout: ticket list on the left, active thread on the right.
 * Filters at the top: status, topic, account type.
 *
 * Access-gated at the backend (super_admin or support_agent). This
 * page renders for any admin, and the API rejects the queue fetch
 * with 403 for anyone else, which is called out in the empty state
 * rather than looking like an inbox with nothing in it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MessageSquare, RefreshCw, CheckCircle2, XCircle, User,
  Building2, Bike, Filter, Send, AlertCircle, UserPlus, Paperclip,
  Search, Package, RotateCcw, ExternalLink, Clock,
} from 'lucide-react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm, usePrompt, useNotify } from '@/components/ConfirmDialog';
import { roleLabel } from '@/lib/labels';

interface Ticket {
  id:                string;
  userAccountType:   string;
  topic:             string;
  status:            string;
  subject:           string;
  linkedDeliveryId:  string | null;
  assignedAgentId:   string | null;
  firstAgentReplyAt: string | null;
  resolvedAt:        string | null;
  autoClosedAt:      string | null;
  lastMessageAt:     string;
  createdAt:         string;
  // role and driverId are carried so an agent clicking a rider's name opens
  // the rider, not the customer record of the same person.
  user?:             { id: string; name: string; email: string; phone?: string | null; accountId?: string | null; role?: string | null; driverId?: string | null };
}

interface Message {
  id:         string;
  body:       string;
  senderId:   string | null;
  systemType?: string | null;
  imageUrl?:   string | null;
  createdAt:  string;
  sender?:    { id: string; name: string } | null;
}

interface Thread {
  ticket:   Ticket;
  messages: Message[];
}

/**
 * `hint` is the sentence an agent on their second day needs: "awaiting
 * user" and "resolved" both mean "not my problem this minute", and
 * "open" and "awaiting agent" both mean "somebody is waiting on us",
 * which is not something the raw words say out loud.
 */
const STATUS_LABEL: Record<string, { label: string; color: string; hint: string }> = {
  open:            { label: 'New',             color: 'bg-blue-100 text-blue-800 border-blue-200',       hint: 'Just raised. Nobody from SEIRS has replied yet.' },
  awaiting_agent:  { label: 'Waiting on us',   color: 'bg-amber-100 text-amber-800 border-amber-200',    hint: 'They have replied and are waiting for an answer.' },
  awaiting_user:   { label: 'Waiting on them', color: 'bg-slate-100 text-slate-700 border-slate-200',    hint: 'We answered last. Nothing to do until they come back.' },
  resolved:        { label: 'Sorted',          color: 'bg-emerald-100 text-emerald-800 border-emerald-200', hint: 'Marked sorted by an agent. They can still reply and re-open it.' },
  closed:          { label: 'Closed',          color: 'bg-gray-100 text-gray-600 border-gray-200',       hint: 'Nobody can post to it, them or us, until it is re-opened.' },
};

/** The topic a customer picked when raising the ticket. "driver" is
 *  "Rider" everywhere a person can read it, same as the rest of the app. */
const TOPIC_LABEL: Record<string, string> = {
  billing:  'Billing',
  driver:   'Driver',
  account:  'Account',
  delivery: 'Delivery',
  other:    'Something else',
};

const ACCOUNT_ICON: Record<string, any> = {
  customer: User,
  driver:   Bike,
  business: Building2,
  admin:    User,
};

/**
 * The server caps the queue at 100 and offers no page two and no search,
 * so 100 is what we ask for and the screen says plainly when it is
 * standing on that ceiling. Asking for 50 (the old value) hid tickets
 * the server would happily have sent.
 */
const QUEUE_LIMIT = 100;

/** Statuses where a human is waiting on SEIRS to say something. */
const WAITING_ON_US = new Set(['open', 'awaiting_agent']);

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)                 return 'just now';
  if (diff < 3600_000)               return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)             return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(iso).toLocaleDateString('en-NG');
}

export default function SupportInboxPage() {
  const [tickets,      setTickets]      = useState<Ticket[]>([]);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [thread,       setThread]       = useState<Thread | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [threadLoading,setThreadLoading]= useState(false);
  const [reply,        setReply]        = useState('');
  const [sending,      setSending]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const [statusFilter,      setStatusFilter]      = useState<string>('open');
  const [topicFilter,       setTopicFilter]       = useState<string>('');
  const [accountTypeFilter, setAccountTypeFilter] = useState<string>('');

  /**
   * Find the ticket for the person currently on the phone.
   *
   * There was no way to. An agent taking a call had to read down the
   * list looking for a name. The support queue endpoint has no search
   * parameter, so this filters what is loaded and the label under the
   * box says exactly that, rather than implying it searched everything.
   */
  const [find, setFind] = useState('');

  /**
   * Triage order. The server returns newest activity first, which is the
   * wrong order for clearing a backlog: the person who has been waiting
   * since this morning is at the bottom of it.
   */
  const [sort, setSort] = useState<'recent' | 'waiting'>('recent');

  const confirm = useConfirm();
  const prompt  = usePrompt();
  const notify  = useNotify();
  const me      = getUser();

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await adminApi.support.queue({
        status:      (statusFilter || undefined) as any,
        topic:       (topicFilter  || undefined) as any,
        accountType: accountTypeFilter || undefined,
        limit:       QUEUE_LIMIT,
      });
      setTickets(list ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load support queue');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, topicFilter, accountTypeFilter]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const loadThread = useCallback(async (id: string) => {
    setThreadLoading(true);
    try {
      const t = await adminApi.support.thread(id);
      setThread(t);
    } catch (e: any) {
      setThread(null);
      setError(e?.message ?? 'Failed to load thread');
    } finally {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedId) loadThread(selectedId); }, [selectedId, loadThread]);

  /**
   * Send a file back to the customer.
   *
   * Users could attach from day one; agents could not, because the agent
   * endpoint takes text only and this bar had no control (founder
   * 2026-08-17). Support answering a billing question could not send the
   * receipt. Uses the same "📎 <url>" body the apps already parse and
   * render, so no client change is needed.
   */
  const [attaching, setAttaching] = useState(false);

  const attachFile = async (file: File) => {
    if (!selectedId || !file) return;
    // Attaching used to fire the moment the file was picked. It lands in
    // a real person's Messages and cannot be unsent, so it gets the same
    // are-you-sure any other outbound message gets.
    const ok = await confirm({
      title:        'Send this file to them?',
      message:      `${file.name} goes straight into ${thread?.ticket.user?.name ?? 'this person'}'s SEIRS app Messages. It cannot be unsent or deleted once it is there.`,
      confirmLabel: 'Send file',
    });
    if (!ok) return;
    setAttaching(true);
    setError(null);
    try {
      const { url } = await adminApi.upload.image(file, 'documents');
      await adminApi.support.reply(selectedId, `📎 ${url}`);
      await loadThread(selectedId);
      await loadQueue();
    } catch (e: any) {
      setError(e?.message ?? 'Could not attach that file');
    } finally {
      setAttaching(false);
    }
  };

  const sendReply = async () => {
    if (!selectedId || !reply.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await adminApi.support.reply(selectedId, reply.trim());
      setReply('');
      await loadThread(selectedId);
      await loadQueue();
    } catch (e: any) {
      // A failed send used to raise a browser alert, which some browsers
      // suppress outright after the first one. The typed reply is still
      // in the box, so the agent can read the reason and press Send again.
      setError(`Reply not sent: ${e?.message ?? 'unknown error'}. Your text is still in the box.`);
    } finally {
      setSending(false);
    }
  };

  /**
   * Taking a ticket. Carried over from the separate Ticketing page, which
   * was a second front door onto the same support_tickets table (founder
   * 2026-08-16: "why do we have ticketing and support inbox"). Ticketing
   * could assign and this could not, so the capability moved here before
   * that page was retired.
   */
  const assignToMe = async () => {
    if (!selectedId || !me?.id) return;
    try {
      await adminApi.tickets.assign(selectedId, me.id);
      await loadThread(selectedId);
      await loadQueue();
    } catch (e: any) {
      setError(e?.message ?? 'Could not assign ticket');
    }
  };

  const setStatus = async (status: string) => {
    if (!selectedId) return;
    try {
      await adminApi.support.setStatus(selectedId, status);
      await loadThread(selectedId);
      await loadQueue();
    } catch (e: any) {
      setError(`Could not change the status: ${e?.message ?? 'unknown error'}`);
    }
  };

  /**
   * Mark sorted. Soft: the customer can still write back, which re-opens
   * it. Said out loud on the button press because "Resolve" reads final
   * and is not, and an agent who thinks it is final will close instead.
   */
  const resolveTicket = async () => {
    const ok = await confirm({
      title:        'Mark this sorted?',
      message:      'It leaves the waiting-on-us queue. They can still write back, which puts it straight back in front of you. Nothing is sent to them when you press this.',
      confirmLabel: 'Mark sorted',
    });
    if (ok) await setStatus('resolved');
  };

  /**
   * Close. This one IS heavy: the backend refuses new messages from both
   * sides on a closed ticket, and the purge job deletes closed tickets
   * and their whole message history 7 days later. None of that was on
   * the screen next to a plain "Close" button.
   */
  const closeTicket = async () => {
    const ok = await confirm({
      title:        'Close this ticket for good?',
      message:      'Neither side can post to it after this: they get "this ticket is closed, please open a new one" if they try to reply. The conversation is deleted 7 days later. You can re-open it here in the meantime. Use "Mark sorted" instead if you just want it off the queue.',
      confirmLabel: 'Close ticket',
      danger:       true,
    });
    if (ok) await setStatus('closed');
  };

  /**
   * The way back. Resolve and Close were one-way doors from this screen:
   * a ticket closed by mistake, or closed and then chased up by phone,
   * could not be answered at all, because agent replies are refused on a
   * closed ticket and nothing here could change the status back.
   */
  const reopenTicket = async () => {
    const ok = await confirm({
      title:        'Re-open this ticket?',
      message:      'It goes back into the waiting-on-us queue and both sides can post to it again. They are not notified until you actually reply.',
      confirmLabel: 'Re-open',
    });
    if (ok) await setStatus('awaiting_agent');
  };

  const reopenChat = async () => {
    if (!thread?.ticket.linkedDeliveryId) return;
    const reason = await prompt({
      title:       'Let the customer and driver talk again?',
      message:     'The chat on this delivery is frozen once it finishes. Re-opening lets the two of them message each other for the next 24 hours, and shows each of them the other\'s messages again.',
      label:       'Why are you re-opening it',
      placeholder: 'e.g. package left at the wrong gate, driver needs to hear the directions',
      minLength:   6,
      multiline:   true,
      helper:      'Recorded against your name in the audit log. Keep it to the operational reason.',
      confirmLabel:'Re-open for 24 hours',
    });
    if (!reason) return;
    try {
      await adminApi.chatReopen.reopen(thread.ticket.linkedDeliveryId, {
        hours:    24,
        reason:   reason.trim(),
        ticketId: thread.ticket.id,
      });
      void notify({ title: 'Chat re-opened', message: 'The customer and the driver can message each other for the next 24 hours. Recorded in the audit log under your name.', tone: 'success' });
    } catch (e: any) {
      setError(`Could not re-open the chat: ${e?.message ?? 'unknown error'}`);
    }
  };

  const closeChat = async () => {
    if (!thread?.ticket.linkedDeliveryId) return;
    const ok = await confirm({
      title:        'Stop them messaging each other now?',
      message:      'The customer and the driver lose the delivery chat immediately, mid-sentence if either is typing. You can re-open it again from this same screen.',
      confirmLabel: 'Close the chat',
    });
    if (!ok) return;
    try {
      await adminApi.chatReopen.close(thread.ticket.linkedDeliveryId);
      void notify({ title: 'Chat closed', message: 'Neither of them can message the other on this delivery any more. Recorded in the audit log under your name.', tone: 'success' });
    } catch (e: any) {
      setError(`Could not close the chat: ${e?.message ?? 'unknown error'}`);
    }
  };

  const resolveVehicleChange = async (approve: boolean) => {
    const userId = thread?.ticket.user?.id;
    if (!userId) return;
    const ok = await confirm({
      title:        approve ? 'Approve this vehicle change?' : 'Turn down this vehicle change?',
      message:      approve
        ? 'The driver\'s profile switches to the new vehicle straight away, and dispatch starts offering them jobs sized for it. They are told in their app Messages. Recorded in the audit log.'
        : 'The new vehicle details are thrown away and the driver keeps the vehicle already on file. They are told in their app Messages. They can apply again.',
      confirmLabel: approve ? 'Approve' : 'Turn it down',
      danger:       !approve,
    });
    if (!ok) return;
    try {
      await adminApi.vehicleChange.resolve(userId, approve);
      void notify({
        title:   approve ? 'Vehicle change approved' : 'Vehicle change turned down',
        message: 'The driver has been told in their app Messages.',
        tone:    'success',
      });
      loadThread(thread!.ticket.id);
    } catch (e: any) {
      setError(`Could not save that decision: ${e?.message ?? 'unknown error'}`);
    }
  };

  const resolveBankChange = async (approve: boolean) => {
    const userId = thread?.ticket.user?.id;
    if (!userId) return;
    const ok = await confirm({
      title:        approve ? 'Send this driver\'s money to the new account?' : 'Turn down this bank change?',
      message:      approve
        ? 'Every future payout goes to the NEW bank account from the moment you press this. Check the account name matches the driver\'s name before you do. They are told in their app Messages, and this is recorded in the audit log under your name.'
        : 'The new bank details are thrown away and payouts keep going to the account already on file. They are told in their app Messages, and can apply again with better documents.',
      confirmLabel: approve ? 'Approve the new account' : 'Turn it down',
      danger:       true,
    });
    if (!ok) return;
    try {
      await adminApi.bankChange.resolve(userId, approve);
      void notify({
        title:   approve ? 'Payout account changed' : 'Bank change turned down',
        message: 'The driver has been told in their app Messages.',
        tone:    'success',
      });
      loadThread(thread!.ticket.id);
    } catch (e: any) {
      setError(`Could not save that decision: ${e?.message ?? 'unknown error'}`);
    }
  };

  const waitingCount = useMemo(
    () => tickets.filter(t => WAITING_ON_US.has(t.status)).length,
    [tickets],
  );

  /**
   * What the left pane actually draws: the loaded queue, narrowed by the
   * find box and ordered the way the agent asked for.
   */
  const visible = useMemo(() => {
    const term = find.trim().toLowerCase();
    const rows = term
      ? tickets.filter(t =>
          `${t.subject} ${t.user?.name ?? ''} ${t.user?.email ?? ''} ${t.user?.phone ?? ''} ${t.user?.accountId ?? ''}`
            .toLowerCase().includes(term))
      : tickets.slice();
    if (sort === 'waiting') {
      // Longest wait first, and only the ones actually waiting on us can
      // be "waiting": a thread we already answered is not a backlog item.
      rows.sort((a, b) => {
        const aw = WAITING_ON_US.has(a.status) ? 0 : 1;
        const bw = WAITING_ON_US.has(b.status) ? 0 : 1;
        if (aw !== bw) return aw - bw;
        return new Date(a.lastMessageAt).getTime() - new Date(b.lastMessageAt).getTime();
      });
    }
    return rows;
  }, [tickets, find, sort]);

  const filtersActive = Boolean(statusFilter || topicFilter || accountTypeFilter);
  const clearFilters  = () => { setStatusFilter(''); setTopicFilter(''); setAccountTypeFilter(''); setFind(''); };
  const isForbidden   = Boolean(error && /403|forbidden|support agent role/i.test(error));

  const t          = thread?.ticket;
  const isClosed   = t?.status === 'closed';
  const assignedToMe = Boolean(t?.assignedAgentId && me?.id && t.assignedAgentId === me.id);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header + filters */}
      <div className="border-b border-gray-200 bg-white px-6 pt-5 pb-4">
        {/*
          The screen opened with the word "Support Inbox" and nothing
          else. Every consequence on it (closing a ticket deletes the
          conversation, re-opening a chat un-freezes two people's private
          messages, approving a bank change redirects a rider's pay) lived
          only in the heads of the people who built it.
        */}
        <PageIntro
          title="Support inbox"
          purpose="Answer the customers, drivers and businesses who have written in, and mark each conversation sorted when it is done."
          storageKey="support"
          help={
            <>
              <p><b>Reply</b> lands in their SEIRS app Messages within seconds. It cannot be edited or unsent, so read it back first.</p>
              <p><b>Mark sorted</b> takes the ticket off the waiting-on-us queue. It is not final: if they write back it returns to the top.</p>
              <p><b>Close</b> is final. Neither side can post to a closed ticket, and the whole conversation is deleted 7 days later. Re-open it here if you closed it by mistake.</p>
              <p><b>Re-open chat</b> is about the customer and driver talking to <i>each other</i> on the delivery, not about this ticket. It un-freezes their private chat for 24 hours and is recorded against your name.</p>
              <p>Tickets nobody touches for 7 days close themselves.</p>
            </>
          }
          actions={
            <button
              onClick={loadQueue}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          }
        />

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Filter size={13} className="text-gray-400" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-[#3A7BD5]">
            <option value="">Any status</option>
            <option value="open">New</option>
            <option value="awaiting_agent">Waiting on us</option>
            <option value="awaiting_user">Waiting on them</option>
            <option value="resolved">Sorted</option>
            <option value="closed">Closed</option>
          </select>
          <select value={topicFilter} onChange={e => setTopicFilter(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-[#3A7BD5]">
            <option value="">Any topic</option>
            <option value="billing">Billing</option>
            <option value="driver">Driver</option>
            <option value="account">Account</option>
            <option value="delivery">Delivery</option>
            <option value="other">Something else</option>
          </select>
          <select value={accountTypeFilter} onChange={e => setAccountTypeFilter(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-[#3A7BD5]">
            <option value="">Anyone</option>
            <option value="customer">Customers</option>
            <option value="driver">Drivers</option>
            <option value="business">Businesses</option>
          </select>

          {/* Triage order. Newest-first is the server's order and is the
              wrong one when there is a backlog: it buries the person who
              has been waiting longest under people who wrote a minute ago. */}
          <select value={sort} onChange={e => setSort(e.target.value as 'recent' | 'waiting')}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-[#3A7BD5]"
            title="Which ticket ends up at the top of the list">
            <option value="recent">Newest activity first</option>
            <option value="waiting">Longest wait first</option>
          </select>

          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={find}
              onChange={e => setFind(e.target.value)}
              placeholder="Find a name, email, phone or SEIRS ID"
              className="w-72 rounded-lg border border-gray-200 bg-white py-1.5 pl-7 pr-2 font-medium focus:outline-none focus:ring-1 focus:ring-[#3A7BD5]"
            />
          </div>

          {filtersActive || find.trim() ? (
            <button onClick={clearFilters} className="font-semibold text-[#3A7BD5] hover:underline">
              Clear filters
            </button>
          ) : null}
        </div>

        {/*
          The old count said "50 tickets shown" and stopped, which reads
          as "there are 50". The queue endpoint has no page two, so when
          the list is standing on the server's ceiling the only honest
          thing to do is say the older ones are not on this screen.
        */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span>
            {find.trim()
              ? `${visible.length} of ${tickets.length} loaded ticket${tickets.length === 1 ? '' : 's'} match "${find.trim()}"`
              : `${tickets.length} ticket${tickets.length === 1 ? '' : 's'} loaded`}
          </span>
          {waitingCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              {waitingCount} waiting on us
            </span>
          )}
          {tickets.length >= QUEUE_LIMIT && (
            <span className="text-amber-700">
              This is the newest {QUEUE_LIMIT}. Older tickets exist and are not on this screen: narrow with the filters above.
            </span>
          )}
          {find.trim() && (
            <span className="text-gray-400">Searches the tickets loaded above, not the whole history.</span>
          )}
        </div>
      </div>

      {error && !isForbidden && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-700">
          <AlertCircle size={14} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => { setError(null); loadQueue(); }} className="font-semibold underline hover:no-underline">
            Try again
          </button>
        </div>
      )}

      {/* Two-pane body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Ticket list */}
        <div className="w-96 shrink-0 overflow-y-auto border-r border-gray-200 bg-white">
          {loading && tickets.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">Loading…</div>
          ) : isForbidden ? (
            /* A 403 used to render as "No tickets", so an admin without
               the support role was told the inbox was empty rather than
               that it was not theirs to read. */
            <EmptyState
              icon={<XCircle size={20} />}
              title="This inbox is not open to your account"
              body="The support queue is limited to support agents and super admins. Ask a super admin to add the support agent role to your account."
            />
          ) : error ? (
            <EmptyState
              icon={<AlertCircle size={20} />}
              title="The inbox would not load"
              body={error}
              action={{ label: 'Try again', onClick: () => { setError(null); loadQueue(); } }}
            />
          ) : visible.length === 0 && find.trim() ? (
            <EmptyState
              icon={<Search size={20} />}
              title={`Nothing loaded matches "${find.trim()}"`}
              body="Only the tickets loaded on the left are searched. Widen the filters above, or clear them, and look again."
              action={{ label: 'Clear filters', onClick: clearFilters }}
            />
          ) : tickets.length === 0 && filtersActive ? (
            <EmptyState
              icon={<Filter size={20} />}
              title="No ticket matches these filters"
              body="Nothing is wrong: this combination of status, topic and account type has nothing in it right now."
              action={{ label: 'Clear filters', onClick: clearFilters }}
            />
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 size={20} />}
              tone="good"
              title="Nobody is waiting"
              body="Every ticket has been answered. New ones appear here the moment somebody writes in."
            />
          ) : (
            <ul className="divide-y divide-gray-100">
              {visible.map(row => {
                const AIcon = ACCOUNT_ICON[row.userAccountType] ?? User;
                const status = STATUS_LABEL[row.status] ?? { label: row.status, color: 'bg-gray-100 text-gray-700 border-gray-200', hint: '' };
                const selected = selectedId === row.id;
                const waiting  = WAITING_ON_US.has(row.status);
                return (
                  <li key={row.id}>
                    <button
                      onClick={() => setSelectedId(row.id)}
                      className={`w-full text-left px-4 py-3 transition ${selected ? 'bg-[#3A7BD5]/10 border-l-4 border-[#3A7BD5]' : 'hover:bg-gray-50 border-l-4 border-transparent'}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                          <AIcon size={14} className="text-gray-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="truncate text-sm font-semibold text-gray-900">{row.subject}</div>
                            {/* Waiting tickets say how long somebody has
                                been waiting, because that is the number
                                the agent is triaging on. */}
                            <div className={`shrink-0 text-[10px] ${waiting ? 'font-semibold text-amber-700' : 'text-gray-400'}`}>
                              {waiting ? `waiting ${formatRelative(row.lastMessageAt).replace(' ago', '')}` : formatRelative(row.lastMessageAt)}
                            </div>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${status.color}`}
                              title={status.hint}
                            >
                              {status.label}
                            </span>
                            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-600">
                              {TOPIC_LABEL[row.topic] ?? row.topic}
                            </span>
                            {/* Who is already on it, so two agents do not
                                answer the same customer twice. */}
                            {row.assignedAgentId && (
                              <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-700">
                                {me?.id && row.assignedAgentId === me.id ? 'Yours' : 'Taken'}
                              </span>
                            )}
                          </div>
                          {row.user && (
                            <div className="mt-1 truncate text-[11px] text-gray-500">
                              {row.user.name}{row.user.email ? ` · ${row.user.email}` : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Active thread */}
        <div className="flex flex-1 flex-col bg-gray-50">
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center text-center">
              <div>
                <MessageSquare size={40} className="mx-auto mb-3 text-gray-300" />
                <div className="text-sm font-semibold text-gray-700">Pick a ticket on the left to read and answer it</div>
                <div className="mt-1 text-xs text-gray-500">The whole conversation, and the reply box, open here.</div>
              </div>
            </div>
          ) : threadLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-500">Loading the conversation…</div>
          ) : thread && t ? (
            <>
              {/* Thread header */}
              <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-gray-900">{t.subject}</div>
                  {/* The sender's name opens their full record. An agent
                      seeing only a name cannot check the account behind the
                      complaint: past deliveries, verification state, other
                      tickets (founder 2026-08-16). */}
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    {t.user?.id ? (
                      <Link
                        /* A driver opened at /users/:id lands on the customer
                           record, which is not their profile and carries none
                           of their documents or trips. Route by who they are. */
                        href={t.user.role === 'driver' && t.user.driverId
                          ? `/drivers/${t.user.driverId}`
                          : `/users/${t.user.id}`}
                        className="font-semibold text-[#3A7BD5] hover:underline"
                        title="Open this person's full record: their deliveries, payments and other tickets"
                      >
                        {t.user.name ?? 'User'}
                      </Link>
                    ) : (
                      <>{t.user?.name ?? 'User'}</>
                    )}
                    {t.user?.email ? ` · ${t.user.email}` : ''}
                    {t.user?.phone ? ` · ${t.user.phone}` : ''}
                    {' · '}{roleLabel(t.userAccountType)} · {TOPIC_LABEL[t.topic] ?? t.topic}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${(STATUS_LABEL[t.status]?.color) ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}
                      title={STATUS_LABEL[t.status]?.hint}
                    >
                      {STATUS_LABEL[t.status]?.label ?? t.status}
                    </span>
                    <span className="text-gray-400">
                      Raised {new Date(t.createdAt).toLocaleString('en-NG')}
                    </span>
                    <span className={assignedToMe ? 'font-semibold text-blue-700' : 'text-gray-400'}>
                      {t.assignedAgentId ? (assignedToMe ? 'You are handling this' : 'Another agent is handling this') : 'Nobody has taken this yet'}
                    </span>
                    {/*
                      The delivery this ticket is about was printed as
                      eight characters of a UUID and nothing else, so the
                      agent reading a complaint about a delivery could not
                      open the delivery.
                    */}
                    {t.linkedDeliveryId && (
                      <Link
                        href={`/deliveries/${t.linkedDeliveryId}`}
                        className="inline-flex items-center gap-1 font-semibold text-[#3A7BD5] hover:underline"
                        title="Open the delivery this ticket is about"
                      >
                        <Package size={11} /> Open the delivery <ExternalLink size={10} />
                      </Link>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  {/* Vehicle-change review: approve/reject a driver's pending
                      vehicle swap (2026-08-10 policy). */}
                  {t.subject === 'Vehicle change request' &&
                    t.status !== 'resolved' && t.status !== 'closed' && t.user?.id && (
                    <>
                      <button
                        onClick={() => resolveVehicleChange(true)}
                        className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        title="Switch this driver onto the new vehicle. Recorded in the audit log."
                      >
                        <CheckCircle2 size={12} /> Approve vehicle change
                      </button>
                      <button
                        onClick={() => resolveVehicleChange(false)}
                        className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                        title="Throw away the new vehicle details. The driver keeps the one on file and can apply again."
                      >
                        <XCircle size={12} /> Turn down
                      </button>
                    </>
                  )}
                  {/* Bank-change review: approve/reject a driver's pending
                      payout-account replacement. Buttons only appear on the
                      system-generated review ticket. */}
                  {t.subject === 'Bank account change request' &&
                    t.status !== 'resolved' && t.status !== 'closed' && t.user?.id && (
                    <>
                      <button
                        onClick={() => resolveBankChange(true)}
                        className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        title="Send every future payout to the new bank account. Recorded in the audit log."
                      >
                        <CheckCircle2 size={12} /> Approve bank change
                      </button>
                      <button
                        onClick={() => resolveBankChange(false)}
                        className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                        title="Throw away the new bank details. Payouts keep going to the account on file."
                      >
                        <XCircle size={12} /> Turn down
                      </button>
                    </>
                  )}
                  {/* PII-frozen chat re-open. Only visible when the ticket
                      is linked to a delivery. Backend enforces PII_VIEW_ROLES
                      + audit-logs the reason + clamps window to 1-72h.
                      Labelled "customer and rider" because "Re-open chat"
                      read as if it meant this support thread. */}
                  {t.linkedDeliveryId && (
                    <button
                      onClick={reopenChat}
                      className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                      title="Let the customer and the driver message each other again on this delivery, for 24 hours. Recorded in the audit log."
                    >
                      <MessageSquare size={12} /> Let customer and driver talk
                    </button>
                  )}
                  {/* chatReopen.close was defined against a live route and
                      called by nothing, so support could open a 24h PII
                      window and had no way to shut it early. */}
                  {t.linkedDeliveryId && (
                    <button
                      onClick={closeChat}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      title="Stop the customer and the driver messaging each other on this delivery. Recorded in the audit log."
                    >
                      <XCircle size={12} /> Stop that chat
                    </button>
                  )}
                  {!t.assignedAgentId && (
                    <button onClick={assignToMe}
                      title="Put your name on this ticket so another agent does not answer it too"
                      className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                      <UserPlus size={12} /> Take this ticket
                    </button>
                  )}
                  {t.status !== 'resolved' && t.status !== 'closed' && (
                    <button onClick={resolveTicket}
                      title="Take it off the waiting-on-us queue. They can still write back."
                      className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                      <CheckCircle2 size={12} /> Mark sorted
                    </button>
                  )}
                  {!isClosed && (
                    <button onClick={closeTicket}
                      title="Final. Nobody can post to it afterwards and it is deleted after 7 days."
                      className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                      <XCircle size={12} /> Close
                    </button>
                  )}
                  {/* Without this, closing was a one-way door: the reply
                      endpoint refuses closed tickets, so a ticket closed
                      by mistake could not be answered from anywhere. */}
                  {(isClosed || t.status === 'resolved') && (
                    <button onClick={reopenTicket}
                      title="Put it back in the waiting-on-us queue so you can reply again"
                      className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                      <RotateCcw size={12} /> Re-open
                    </button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {thread.messages.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-400">
                    Nothing has been written on this ticket yet.
                  </div>
                ) : thread.messages.map(m => {
                  if (!m.senderId && m.systemType) {
                    return (
                      <div key={m.id} className="text-center">
                        <div className="inline-block rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] text-gray-500">
                          {m.body}
                        </div>
                      </div>
                    );
                  }
                  // Support agent bubble on the right; user bubble on the left.
                  const isAgent = (m.sender && m.sender.id !== t.user?.id);
                  /*
                    A photo the customer attached was invisible here: the
                    message carries imageUrl and this pane only ever drew
                    the text, so somebody reporting a damaged package sent
                    a picture into a blank bubble. Agent-sent files use the
                    "📎 <url>" body the phone apps parse, which rendered as
                    a raw URL nobody could click.
                    */
                  const attached = m.imageUrl
                    ?? (m.body?.startsWith('📎 ') ? m.body.slice(2).trim() : null);
                  const isImage  = Boolean(attached && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(attached));
                  return (
                    <div key={m.id} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-md rounded-2xl px-4 py-2.5 ${isAgent ? 'bg-[#0F2B4C] text-white' : 'border border-gray-200 bg-white text-gray-900'}`}>
                        {attached ? (
                          <a
                            href={attached}
                            target="_blank"
                            rel="noreferrer"
                            className={`inline-flex flex-col gap-1.5 ${isAgent ? 'text-white' : 'text-[#3A7BD5]'}`}
                          >
                            {isImage && (
                              <img src={attached} alt="Attached by the sender" className="max-h-52 rounded-lg" />
                            )}
                            <span className="inline-flex items-center gap-1 text-xs font-semibold underline">
                              <Paperclip size={11} /> {isImage ? 'Open the full picture' : 'Open the attached file'}
                            </span>
                          </a>
                        ) : (
                          m.body
                        )}
                        <div className={`mt-1 text-[10px] ${isAgent ? 'text-white/60' : 'text-gray-400'}`}>
                          {m.sender?.name ?? 'Unknown'} · {formatRelative(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply bar */}
              {isClosed ? (
                /* The bar simply vanished on a closed ticket, so the agent
                   was left looking for a reply box that was not there and
                   no explanation of where it had gone. */
                <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-white px-5 py-3">
                  <p className="flex items-center gap-2 text-xs text-gray-500">
                    <Clock size={13} className="shrink-0" />
                    This ticket is closed, so neither you nor they can post to it. It is deleted 7 days after closing.
                  </p>
                  <button
                    onClick={reopenTicket}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    <RotateCcw size={13} /> Re-open to reply
                  </button>
                </div>
              ) : (
                <div className="border-t border-gray-200 bg-white px-5 py-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendReply(); }}
                      placeholder="Type your answer… (Ctrl+Enter sends it)"
                      rows={2}
                      className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
                    />
                    <label
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                      title="Send them a picture or a PDF, up to 10MB. It goes into their app Messages and cannot be unsent."
                    >
                      <Paperclip size={14} />
                      {attaching ? 'Sending…' : 'Attach'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,application/pdf"
                        className="hidden"
                        disabled={attaching}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) attachFile(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button
                      onClick={sendReply}
                      disabled={!reply.trim() || sending}
                      className="flex items-center gap-1.5 rounded-lg bg-[#0F2B4C] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3A7BD5] disabled:opacity-50"
                    >
                      <Send size={14} />
                      {sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                  {/* Where this goes and that it is permanent, said next to
                      the box rather than assumed. */}
                  <p className="mt-1.5 text-[11px] text-gray-400">
                    Goes to {t.user?.name ?? 'them'} in their SEIRS app Messages straight away. It cannot be edited or unsent.
                    {!t.assignedAgentId && ' Replying also puts your name on this ticket.'}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-6">
              <EmptyState
                icon={<AlertCircle size={20} />}
                title="That conversation would not open"
                body={error ?? 'The ticket could not be loaded. It may have been deleted by the 7-day purge on closed tickets.'}
                action={{ label: 'Try again', onClick: () => selectedId && loadThread(selectedId) }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
