'use client';

/**
 * Support inbox for the SEIRS ops team.
 *
 * Two-pane layout: ticket list on the left, active thread on the right.
 * Filters at the top: status, topic, account type. Recent-activity
 * first so the highest-signal tickets are always visible without
 * scrolling.
 *
 * Access-gated at the backend (super_admin or support_agent). This
 * page renders for any admin, and the API rejects the queue fetch
 * with 403 for anyone else — surfaced inline as an empty state.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Inbox, MessageSquare, RefreshCw, CheckCircle2, XCircle, User,
  Building2, Bike, Filter, Send, AlertCircle,
} from 'lucide-react';
import { adminApi } from '@/lib/api';

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
  user?:             { id: string; name: string; email: string };
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

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  open:            { label: 'Open',            color: 'bg-blue-100 text-blue-800 border-blue-200' },
  awaiting_agent:  { label: 'Awaiting agent',  color: 'bg-amber-100 text-amber-800 border-amber-200' },
  awaiting_user:   { label: 'Awaiting user',   color: 'bg-slate-100 text-slate-700 border-slate-200' },
  resolved:        { label: 'Resolved',        color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  closed:          { label: 'Closed',          color: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const ACCOUNT_ICON: Record<string, any> = {
  customer: User,
  driver:   Bike,
  business: Building2,
  admin:    User,
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)                 return 'just now';
  if (diff < 3600_000)               return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)             return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
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

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await adminApi.support.queue({
        status:      (statusFilter || undefined) as any,
        topic:       (topicFilter  || undefined) as any,
        accountType: accountTypeFilter || undefined,
        limit:       50,
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

  const sendReply = async () => {
    if (!selectedId || !reply.trim() || sending) return;
    setSending(true);
    try {
      await adminApi.support.reply(selectedId, reply.trim());
      setReply('');
      await loadThread(selectedId);
      await loadQueue();
    } catch (e: any) {
      alert(`Send failed: ${e?.message ?? 'unknown'}`);
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (status: string) => {
    if (!selectedId) return;
    try {
      await adminApi.support.setStatus(selectedId, status);
      await loadThread(selectedId);
      await loadQueue();
    } catch (e: any) {
      alert(`Status change failed: ${e?.message ?? 'unknown'}`);
    }
  };

  const openCount = useMemo(
    () => tickets.filter(t => t.status === 'open' || t.status === 'awaiting_agent').length,
    [tickets],
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header + filters */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0F2B4C]">
              <Inbox size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#0F2B4C]">Support Inbox</h1>
              <p className="text-xs text-gray-500">
                {tickets.length} ticket{tickets.length === 1 ? '' : 's'} shown
                {openCount > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{openCount} awaiting agent</span>}
              </p>
            </div>
          </div>
          <button
            onClick={loadQueue}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Filter size={13} className="text-gray-400" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-[#3A7BD5]">
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="awaiting_agent">Awaiting agent</option>
            <option value="awaiting_user">Awaiting user</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select value={topicFilter} onChange={e => setTopicFilter(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-[#3A7BD5]">
            <option value="">All topics</option>
            <option value="billing">Billing</option>
            <option value="driver">Driver</option>
            <option value="account">Account</option>
            <option value="delivery">Delivery</option>
            <option value="other">Other</option>
          </select>
          <select value={accountTypeFilter} onChange={e => setAccountTypeFilter(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-[#3A7BD5]">
            <option value="">All account types</option>
            <option value="customer">Customer</option>
            <option value="driver">Driver</option>
            <option value="business">Business</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-700 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Two-pane body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Ticket list */}
        <div className="w-96 shrink-0 overflow-y-auto border-r border-gray-200 bg-white">
          {loading && tickets.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">Loading…</div>
          ) : tickets.length === 0 ? (
            <div className="p-10 text-center">
              <MessageSquare size={32} className="mx-auto mb-2 text-gray-300" />
              <div className="text-sm font-bold text-gray-700">No tickets</div>
              <div className="mt-1 text-xs text-gray-500">Adjust filters or wait for new tickets.</div>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tickets.map(t => {
                const AIcon = ACCOUNT_ICON[t.userAccountType] ?? User;
                const status = STATUS_LABEL[t.status] ?? { label: t.status, color: 'bg-gray-100 text-gray-700 border-gray-200' };
                const selected = selectedId === t.id;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setSelectedId(t.id)}
                      className={`w-full text-left px-4 py-3 transition ${selected ? 'bg-[#3A7BD5]/10 border-l-4 border-[#3A7BD5]' : 'hover:bg-gray-50 border-l-4 border-transparent'}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                          <AIcon size={14} className="text-gray-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="truncate text-sm font-semibold text-gray-900">{t.subject}</div>
                            <div className="shrink-0 text-[10px] text-gray-400">{formatRelative(t.lastMessageAt)}</div>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${status.color}`}>
                              {status.label}
                            </span>
                            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-600">
                              {t.topic}
                            </span>
                          </div>
                          {t.user && (
                            <div className="mt-1 truncate text-[11px] text-gray-500">{t.user.name}</div>
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
                <div className="text-sm font-semibold text-gray-700">Select a ticket to respond</div>
                <div className="mt-1 text-xs text-gray-500">Threads load on click.</div>
              </div>
            </div>
          ) : threadLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-500">Loading thread…</div>
          ) : thread ? (
            <>
              {/* Thread header */}
              <div className="border-b border-gray-200 bg-white px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-gray-900">{thread.ticket.subject}</div>
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    {thread.ticket.user?.name ?? 'User'} · {thread.ticket.userAccountType} · {thread.ticket.topic}
                    {thread.ticket.linkedDeliveryId && ` · delivery ${thread.ticket.linkedDeliveryId.slice(0, 8)}`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/* Vehicle-change review: approve/reject a driver's pending
                      vehicle swap (2026-08-10 policy). */}
                  {thread.ticket.subject === 'Vehicle change request' &&
                    thread.ticket.status !== 'resolved' && thread.ticket.status !== 'closed' &&
                    thread.ticket.user?.id && (
                    <>
                      <button
                        onClick={async () => {
                          if (!confirm('Approve this vehicle change? The driver profile switches to the new vehicle.')) return;
                          try {
                            await adminApi.vehicleChange.resolve(thread.ticket.user!.id, true);
                            alert('Vehicle change approved. The driver was notified in their Messages.');
                            loadThread(thread.ticket.id);
                          } catch (e: any) { alert(`Approve failed: ${e?.message ?? 'unknown'}`); }
                        }}
                        className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        title="Apply the pending vehicle details (audit-logged)"
                      >
                        <CheckCircle2 size={12} /> Approve vehicle change
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm('Reject this vehicle change? The pending details are discarded; the registered vehicle stays.')) return;
                          try {
                            await adminApi.vehicleChange.resolve(thread.ticket.user!.id, false);
                            alert('Vehicle change rejected. The driver was notified in their Messages.');
                            loadThread(thread.ticket.id);
                          } catch (e: any) { alert(`Reject failed: ${e?.message ?? 'unknown'}`); }
                        }}
                        className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                        title="Discard the pending vehicle details (audit-logged)"
                      >
                        <XCircle size={12} /> Reject
                      </button>
                    </>
                  )}
                  {/* Bank-change review: approve/reject a driver's pending
                      payout-account replacement. Buttons only appear on the
                      system-generated review ticket. */}
                  {thread.ticket.subject === 'Bank account change request' &&
                    thread.ticket.status !== 'resolved' && thread.ticket.status !== 'closed' &&
                    thread.ticket.user?.id && (
                    <>
                      <button
                        onClick={async () => {
                          if (!confirm('Approve this bank change? Future payouts go to the NEW account.')) return;
                          try {
                            await adminApi.bankChange.resolve(thread.ticket.user!.id, true);
                            alert('Bank change approved. The driver was notified in their Messages.');
                            loadThread(thread.ticket.id);
                          } catch (e: any) { alert(`Approve failed: ${e?.message ?? 'unknown'}`); }
                        }}
                        className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        title="Apply the pending bank account (audit-logged)"
                      >
                        <CheckCircle2 size={12} /> Approve bank change
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm('Reject this bank change? The pending account is discarded and payouts stay on the current account.')) return;
                          try {
                            await adminApi.bankChange.resolve(thread.ticket.user!.id, false);
                            alert('Bank change rejected. The driver was notified in their Messages.');
                            loadThread(thread.ticket.id);
                          } catch (e: any) { alert(`Reject failed: ${e?.message ?? 'unknown'}`); }
                        }}
                        className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                        title="Discard the pending bank account (audit-logged)"
                      >
                        <XCircle size={12} /> Reject
                      </button>
                    </>
                  )}
                  {/* PII-frozen chat re-open. Only visible when the ticket
                      is linked to a delivery. Backend enforces PII_VIEW_ROLES
                      + audit-logs the reason + clamps window to 1-72h. */}
                  {thread.ticket.linkedDeliveryId && (
                    <button
                      onClick={async () => {
                        const reason = prompt(
                          'Reason for re-opening this delivery chat (min 6 chars).\nThe customer and driver will be able to message each other again for 24 hours.',
                        );
                        if (!reason || reason.trim().length < 6) return;
                        try {
                          await adminApi.chatReopen.reopen(thread.ticket.linkedDeliveryId!, {
                            hours:    24,
                            reason:   reason.trim(),
                            ticketId: thread.ticket.id,
                          });
                          alert('Chat re-opened for 24 hours. This action was audit-logged.');
                        } catch (e: any) {
                          alert(`Re-open failed: ${e?.message ?? 'unknown'}`);
                        }
                      }}
                      className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                      title="Re-open the customer-driver chat for this delivery (24h, audit-logged)"
                    >
                      <MessageSquare size={12} /> Re-open chat
                    </button>
                  )}
                  {thread.ticket.status !== 'resolved' && (
                    <button onClick={() => setStatus('resolved')}
                      className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                      <CheckCircle2 size={12} /> Resolve
                    </button>
                  )}
                  {thread.ticket.status !== 'closed' && (
                    <button onClick={() => setStatus('closed')}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                      <XCircle size={12} /> Close
                    </button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {thread.messages.length === 0 ? (
                  <div className="text-center text-sm text-gray-400 py-6">No messages yet.</div>
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
                  const isAgent = (m.sender && m.sender.id !== thread.ticket.user?.id);
                  return (
                    <div key={m.id} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-md rounded-2xl px-4 py-2.5 ${isAgent ? 'bg-[#0F2B4C] text-white' : 'bg-white border border-gray-200 text-gray-900'}`}>
                        {m.body}
                        <div className={`mt-1 text-[10px] ${isAgent ? 'text-white/60' : 'text-gray-400'}`}>
                          {m.sender?.name ?? 'Unknown'} · {formatRelative(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply bar */}
              {thread.ticket.status !== 'closed' && (
                <div className="border-t border-gray-200 bg-white px-5 py-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendReply(); }}
                      placeholder="Reply to this ticket… (Ctrl+Enter to send)"
                      rows={2}
                      className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
                    />
                    <button
                      onClick={sendReply}
                      disabled={!reply.trim() || sending}
                      className="flex items-center gap-1.5 rounded-lg bg-[#0F2B4C] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3A7BD5] disabled:opacity-50"
                    >
                      <Send size={14} />
                      {sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-500">Failed to load thread.</div>
          )}
        </div>
      </div>
    </div>
  );
}
