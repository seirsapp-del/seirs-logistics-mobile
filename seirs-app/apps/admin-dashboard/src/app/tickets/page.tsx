'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import {
  MessageSquare, ChevronRight, Clock, AlertCircle, CheckCircle2, XCircle, Send,
} from 'lucide-react';

type TicketStatus   = 'open' | 'in_progress' | 'resolved' | 'closed';
type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

interface TicketReply {
  id:        string;
  message:   string;
  sender:    string;
  createdAt: string;
}

interface Ticket {
  id:          string;
  subject:     string;
  description: string;
  status:      TicketStatus;
  priority:    TicketPriority;
  category?:   string;
  user?:       { id: string; name: string; email: string };
  assignedTo?: { id: string; name: string };
  replies?:    TicketReply[];
  createdAt:   string;
  updatedAt:   string;
  resolvedAt?: string;
  slaBreached?: boolean;
}

const STATUS_COLORS: Record<TicketStatus, string> = {
  open:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved:    'bg-emerald-100 text-emerald-700',
  closed:      'bg-gray-100 text-gray-600',
};

const STATUS_ICON: Record<TicketStatus, React.ComponentType<any>> = {
  open:        AlertCircle,
  in_progress: Clock,
  resolved:    CheckCircle2,
  closed:      XCircle,
};

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low:    'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-600',
  high:   'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

const SLA_RESPONSE_MS  = 2  * 60 * 60 * 1000;  // 2 hours
const SLA_RESOLVE_MS   = 24 * 60 * 60 * 1000;  // 24 hours

function slaColor(createdAt: string, status: TicketStatus): string {
  const age = Date.now() - new Date(createdAt).getTime();
  if (status === 'resolved' || status === 'closed') return 'text-emerald-500';
  if (age > SLA_RESOLVE_MS) return 'text-red-500';
  if (age > SLA_RESPONSE_MS) return 'text-amber-500';
  return 'text-gray-400';
}

function slaLabel(createdAt: string, status: TicketStatus): string {
  const age = Date.now() - new Date(createdAt).getTime();
  if (status === 'resolved' || status === 'closed') return 'Resolved';
  const h = Math.floor(age / 3_600_000);
  if (h < 1) return '<1h old';
  if (h < 24) return `${h}h old`;
  return `${Math.floor(h / 24)}d old`;
}

export default function TicketsPage() {
  const [tickets,  setTickets]  = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [status,   setStatus]   = useState<TicketStatus | 'all'>('all');
  const [priority, setPriority] = useState<TicketPriority | 'all'>('all');
  const [page,     setPage]     = useState(1);
  const [hasMore,  setHasMore]  = useState(false);
  const [reply,    setReply]    = useState('');
  const [sending,  setSending]  = useState(false);
  const [acting,   setActing]   = useState(false);

  const me = getUser();

  const load = (p = 1) => {
    setLoading(true);
    adminApi.tickets.list(p, status !== 'all' ? status : undefined, priority !== 'all' ? priority : undefined)
      .then((data: any) => {
        const items = Array.isArray(data) ? data : data?.items ?? [];
        setTickets(p === 1 ? items : (prev) => [...prev, ...items]);
        setHasMore(data?.hasMore ?? false);
        setPage(p);
      }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(1); }, [status, priority]);

  const openTicket = async (t: Ticket) => {
    try {
      const full = await adminApi.tickets.get(t.id);
      setSelected(full);
    } catch {
      setSelected(t);
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      await adminApi.tickets.reply(selected.id, reply.trim());
      setReply('');
      const updated = await adminApi.tickets.get(selected.id);
      setSelected(updated);
      load(1);
    } finally {
      setSending(false);
    }
  };

  const updateStatus = async (newStatus: TicketStatus) => {
    if (!selected) return;
    setActing(true);
    try {
      await adminApi.tickets.update(selected.id, { status: newStatus });
      const updated = await adminApi.tickets.get(selected.id);
      setSelected(updated);
      load(1);
    } finally {
      setActing(false);
    }
  };

  const assignToMe = async () => {
    if (!selected || !me) return;
    setActing(true);
    try {
      await adminApi.tickets.assign(selected.id, me.id);
      const updated = await adminApi.tickets.get(selected.id);
      setSelected(updated);
      load(1);
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Ticket list */}
      <div className={`${selected ? 'hidden lg:flex' : 'flex'} flex-col flex-1 lg:max-w-[480px] border-r border-gray-100`}>
        <div className="p-6 border-b border-gray-100 bg-white sticky top-0 z-10">
          <h1 className="text-xl font-bold text-[#0F2B4C] mb-4">Support Tickets</h1>

          {/* Filters */}
          <div className="space-y-2">
            <div className="flex gap-1 flex-wrap">
              {(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                    status === s ? 'bg-[#0F2B4C] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
            <div className="flex gap-1 flex-wrap">
              {(['all', 'urgent', 'high', 'medium', 'low'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                    priority === p ? 'bg-[#0F2B4C] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-[#F5F5F0]">
          {loading && tickets.length === 0 ? (
            <div className="text-center py-20 text-[#0F2B4C]/30 text-sm">Loading…</div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-20 text-[#0F2B4C]/30 text-sm">No tickets found</div>
          ) : (
            <>
              {tickets.map((t) => {
                const StatusIcon = STATUS_ICON[t.status];
                const isSelected = selected?.id === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => openTicket(t)}
                    className={`w-full text-left px-5 py-4 border-b border-gray-100 hover:bg-white transition-colors ${isSelected ? 'bg-white' : 'bg-white/70'}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="font-medium text-[#0F2B4C] text-sm leading-tight truncate flex-1">{t.subject}</p>
                      <ChevronRight size={14} className="text-gray-300 mt-0.5 shrink-0" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1 ${STATUS_COLORS[t.status]}`}>
                        <StatusIcon size={11} />
                        {t.status.replace('_', ' ')}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${PRIORITY_COLORS[t.priority]}`}>
                        {t.priority}
                      </span>
                      {t.slaBreached && (
                        <span className="text-xs text-red-500 font-medium">SLA breached</span>
                      )}
                      <span className={`text-xs ml-auto ${slaColor(t.createdAt, t.status)}`}>
                        {slaLabel(t.createdAt, t.status)}
                      </span>
                    </div>
                    {t.user && (
                      <p className="text-xs text-gray-400 mt-1 truncate">{t.user.name} · {t.user.email}</p>
                    )}
                  </button>
                );
              })}
              {hasMore && (
                <button
                  onClick={() => load(page + 1)}
                  className="w-full py-3 text-sm text-[#3A7BD5] hover:bg-white transition-colors"
                >
                  Load more
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Ticket detail */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 bg-white flex items-start gap-4 sticky top-0 z-10">
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 mt-0.5 lg:hidden">
              ←
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-[#0F2B4C] truncate">{selected.subject}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[selected.status]}`}>
                  {selected.status.replace('_', ' ')}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${PRIORITY_COLORS[selected.priority]}`}>
                  {selected.priority} priority
                </span>
                <span className={`text-xs ${slaColor(selected.createdAt, selected.status)}`}>
                  {slaLabel(selected.createdAt, selected.status)}
                </span>
              </div>
            </div>
            {/* Actions */}
            <div className="flex gap-2 shrink-0">
              {!selected.assignedTo && (
                <button
                  onClick={assignToMe}
                  disabled={acting}
                  className="text-xs px-3 py-1.5 bg-[#3A7BD5]/10 text-[#3A7BD5] rounded-lg hover:bg-[#3A7BD5]/20 font-medium disabled:opacity-50 transition-colors"
                >
                  Assign to me
                </button>
              )}
              {selected.status === 'open' && (
                <button onClick={() => updateStatus('in_progress')} disabled={acting}
                  className="text-xs px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 font-medium disabled:opacity-50 transition-colors">
                  Start
                </button>
              )}
              {(selected.status === 'open' || selected.status === 'in_progress') && (
                <button onClick={() => updateStatus('resolved')} disabled={acting}
                  className="text-xs px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 font-medium disabled:opacity-50 transition-colors">
                  Resolve
                </button>
              )}
              {selected.status === 'resolved' && (
                <button onClick={() => updateStatus('closed')} disabled={acting}
                  className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-200 font-medium disabled:opacity-50 transition-colors">
                  Close
                </button>
              )}
            </div>
          </div>

          {/* SLA indicator */}
          <div className="px-6 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 flex gap-6">
            <span>Response SLA: <span className="font-medium text-[#0F2B4C]">&lt;2 hours</span></span>
            <span>Resolution SLA: <span className="font-medium text-[#0F2B4C]">&lt;24 hours</span></span>
            {selected.assignedTo && <span>Assigned: <span className="font-medium text-[#0F2B4C]">{selected.assignedTo.name}</span></span>}
          </div>

          {/* Thread */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Original message */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-[#0F2B4C]">
                  {selected.user?.name ?? 'Customer'}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(selected.createdAt).toLocaleString('en-NG')}
                </span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.description}</p>
            </div>

            {/* Replies */}
            {selected.replies?.map((r) => (
              <div key={r.id} className={`rounded-xl border p-4 ${r.sender === 'admin' ? 'bg-[#0F2B4C]/5 border-[#0F2B4C]/10 ml-8' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-semibold ${r.sender === 'admin' ? 'text-[#0F2B4C]' : 'text-gray-700'}`}>
                    {r.sender === 'admin' ? 'Support Agent' : selected.user?.name ?? 'Customer'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(r.createdAt).toLocaleString('en-NG')}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.message}</p>
              </div>
            ))}
          </div>

          {/* Reply box */}
          {selected.status !== 'closed' && (
            <div className="px-6 py-4 border-t border-gray-100 bg-white">
              <div className="flex gap-3">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write a reply…"
                  rows={3}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5] resize-none"
                />
                <button
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  className="self-end flex items-center gap-2 bg-[#0F2B4C] text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-[#3A7BD5] disabled:opacity-50 transition-colors"
                >
                  <Send size={15} />
                  {sending ? 'Sending…' : 'Reply'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 hidden lg:flex items-center justify-center text-[#0F2B4C]/20">
          <div className="text-center">
            <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a ticket to view details</p>
          </div>
        </div>
      )}
    </div>
  );
}
