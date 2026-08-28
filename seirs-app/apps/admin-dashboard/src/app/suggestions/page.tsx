'use client';

/**
 * What customers and riders have asked for.
 *
 * One job: read what people are asking for, in the order the crowd cares
 * about it, and write back to them.
 *
 * The one thing this screen used to get wrong was its own arithmetic.
 * The server returns the top 30 by votes plus a `total`, and the page
 * counted the rows it happened to be holding and called that "Total
 * Suggestions" and "Total Votes". With 200 suggestions in the database
 * it reported 30.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lightbulb, ThumbsUp, MessageSquare, Tag, Loader2, RefreshCw, AlertCircle, X, Send } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';

interface Suggestion {
  id:        string;
  subject:   string;
  body:      string;
  category:  string;
  status:    string;
  voteCount: number;
  adminReply?: string;
  createdAt: string;
  submittedBy?: { id: string; name?: string } | null;
}

/** What the submitter reads on their own screen when you set this. */
const STATUS_LABEL: Record<string, string> = {
  under_review: 'Nobody has looked yet',
  planned:      'We are going to do it',
  in_progress:  'Being built now',
  shipped:      'Done and released',
  closed:       'Not going to happen',
};

const STATUS_STYLES: Record<string, string> = {
  under_review: 'bg-yellow-100 text-yellow-700',
  planned:      'bg-[#3A7BD5]/10 text-[#3A7BD5]',
  in_progress:  'bg-green-100 text-green-700',
  shipped:      'bg-emerald-100 text-emerald-700',
  closed:       'bg-gray-100 text-gray-500',
};

/** "i18n" and "perf" are engineering words on a screen about feedback. */
const CATEGORY_LABEL: Record<string, string> = {
  ux:      'How it looks and works',
  feature: 'Something new',
  bug:     'Something broken',
  i18n:    'Language',
  perf:    'Speed',
  other:   'Something else',
};

const CATEGORY_STYLES: Record<string, string> = {
  ux:      'bg-cyan-100 text-cyan-700',
  feature: 'bg-[#0F2B4C]/10 text-[#0F2B4C]',
  bug:     'bg-red-100 text-red-700',
  i18n:    'bg-cyan-100 text-cyan-700',
  perf:    'bg-orange-100 text-orange-700',
  other:   'bg-gray-100 text-gray-700',
};

/** The server sends 30 rows a page and this dashboard cannot ask for page two. */
const PAGE_SIZE = 30;

export default function SuggestionsPage() {
  const [items,   setItems]   = useState<Suggestion[]>([]);
  /** How many exist in total, which is not the same as how many are shown. */
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [editing, setEditing] = useState<Suggestion | null>(null);
  /** Narrowed on the server, so the count below stays true. */
  const [statusFilter, setStatusFilter] = useState('');

  const load = (status = statusFilter) => {
    setLoading(true);
    setError(null);
    adminApi.suggestions.list(status || undefined)
      .then((data: any) => { setItems(data?.items ?? []); setTotal(Number(data?.total ?? 0)); })
      .catch((e: any) => { setItems([]); setTotal(0); setError(e?.message ?? 'Could not load suggestions'); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(statusFilter); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);

  return (
    <div className="p-6 space-y-6">
      <PageIntro
        title="What people are asking for"
        purpose="Ideas and complaints sent in by customers and riders, most-voted first, and the place to write back to them."
        storageKey="suggestions"
        help={
          <>
            <p><b>Your reply goes to the person who wrote in</b>, word for word, on their own screen in the app. It cannot be unsent.</p>
            <p><b>The state you pick is public to them too.</b> "We are going to do it" is a promise somebody will hold us to, so use "Nobody has looked yet" until it is decided.</p>
            <p>The order is by votes: the top of this list is what most people want. Votes come from other users tapping the same idea.</p>
          </>
        }
        actions={
          <button
            onClick={() => load()}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      {/* Narrowed on the server, so "of N" stays honest when filtered. */}
      <div className="flex flex-wrap items-center gap-2">
        {[['', 'Everything'], ...Object.entries(STATUS_LABEL)].map(([key, label]) => (
          <button
            key={key || 'all'}
            onClick={() => setStatusFilter(key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === key
                ? 'border-[#3A7BD5] bg-[#3A7BD5] text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-[#0F2B4C]/20'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            /* Was items.length, which is at most one page. */
            label: statusFilter ? `Ideas in "${STATUS_LABEL[statusFilter]}"` : 'Ideas sent in altogether',
            value: total.toLocaleString(),
            icon:  Lightbulb,
            color: 'text-yellow-500',
          },
          {
            label: `Votes on the ${items.length} shown`,
            value: items.reduce((s, r) => s + r.voteCount, 0).toLocaleString(),
            icon:  ThumbsUp,
            color: 'text-[#3A7BD5]',
          },
          {
            label: 'Nobody has answered these yet',
            value: items.filter(s => s.status === 'under_review').length.toLocaleString(),
            icon:  MessageSquare,
            color: 'text-green-600',
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
              <Icon size={18} className={color} />
            </div>
            <div>
              <div className="text-xl font-bold text-[#0F2B4C] tabular-nums">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* The list stops at 30 and this dashboard cannot ask for the next
          page, so it says so rather than letting 30 read as "all". */}
      {!loading && items.length > 0 && (
        <p className="text-sm text-gray-500">
          {total > items.length
            ? `Showing the ${items.length} most-voted of ${total.toLocaleString()}. The rest cannot be reached from this screen yet: narrow with the buttons above.`
            : `All ${items.length} shown, most-voted first.`}
        </p>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading suggestions…
        </div>
      ) : error && items.length === 0 ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white">
          <EmptyState
            icon={<AlertCircle size={20} />}
            title="The suggestions would not load"
            body="Nothing has been lost. This is the dashboard failing to read them."
            action={{ label: 'Try again', onClick: () => load() }}
          />
        </div>
      ) : items.length === 0 && statusFilter ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white">
          <EmptyState
            icon={<Lightbulb size={20} />}
            title={`Nothing is in "${STATUS_LABEL[statusFilter]}"`}
            body="Nothing is wrong. No suggestion is in that state at the moment."
            action={{ label: 'Show everything', onClick: () => setStatusFilter('') }}
          />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white">
          <EmptyState
            icon={<Lightbulb size={20} />}
            title="Nobody has sent anything in yet"
            body="Customers and riders can send an idea from the Help screen in their app. It lands here the moment they do."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(s => (
            <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4 items-start hover:shadow-sm transition-shadow">
              <div className="flex flex-col items-center gap-0.5 shrink-0 min-w-[44px]">
                <ThumbsUp size={14} className="text-[#3A7BD5]" />
                <span className="text-base font-bold text-[#0F2B4C]">{s.voteCount}</span>
                <span className="text-[10px] text-gray-400">votes</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-[#0F2B4C] flex-1">{s.subject}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLES[s.status]}`}>
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1 line-clamp-2">{s.body}</p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Tag size={11} />
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${CATEGORY_STYLES[s.category] ?? 'bg-gray-100 text-gray-600'}`}>
                      {CATEGORY_LABEL[s.category] ?? s.category}
                    </span>
                  </span>
                  {/* The person who wrote in was a name and nothing else,
                      so there was no way to see who was asking. */}
                  <span className="text-xs text-gray-400">
                    by{' '}
                    {s.submittedBy?.id ? (
                      <Link href={`/users/${s.submittedBy.id}`} className="text-[#3A7BD5] hover:underline">
                        {s.submittedBy.name ?? 'a SEIRS user'}
                      </Link>
                    ) : (s.submittedBy?.name ?? 'somebody who has since left')}
                  </span>
                  <span className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  {/* Whether this person has already been answered is the
                      whole triage question and was not on the row. */}
                  {s.adminReply ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-700" title={s.adminReply}>
                      <Send size={10} /> answered
                    </span>
                  ) : (
                    <span className="text-xs text-amber-700">not answered yet</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setEditing(s)}
                className="shrink-0 text-xs font-medium text-[#3A7BD5] hover:underline"
              >
                Answer this
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <UpdateStatusModal
          suggestion={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function UpdateStatusModal({ suggestion, onClose, onSaved }: {
  suggestion: Suggestion;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status,     setStatus]     = useState(suggestion.status);
  const [adminReply, setAdminReply] = useState(suggestion.adminReply ?? '');
  const [saving,     setSaving]     = useState(false);
  const [err,        setErr]        = useState<string | null>(null);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await adminApi.suggestions.update(suggestion.id, { status, adminReply });
      onSaved();
    } catch (e: any) { setErr(e?.message ?? 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="font-bold text-[#0F2B4C]">Answer this suggestion</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <p className="text-xs text-gray-500">{suggestion.subject}</p>
          {err && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} /> {err}
            </div>
          )}
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
              What should they be told is happening
            </label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]">
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Your reply to them
            </label>
            <textarea value={adminReply} onChange={e => setAdminReply(e.target.value)} rows={4}
              placeholder="e.g. Thank you. We are adding this in the next update."
              className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
            {/* "(visible to submitter)" in a label was the only warning
                that this text reaches a real person, unremovably. */}
            <p className="mt-1 text-[11px] text-gray-500">
              {suggestion.submittedBy?.name ?? 'The person who sent this'} reads these words on their own screen, exactly as typed. It cannot be edited or taken back afterwards.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm font-semibold bg-[#0F2B4C] text-white rounded-lg hover:bg-[#3A7BD5] disabled:opacity-50">
            {saving ? 'Sending…' : 'Send it to them'}
          </button>
        </div>
      </div>
    </div>
  );
}
