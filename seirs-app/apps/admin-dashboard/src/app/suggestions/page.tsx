'use client';
import { useEffect, useState } from 'react';
import { Lightbulb, ThumbsUp, MessageSquare, Tag, Loader2, RefreshCw, AlertCircle, X } from 'lucide-react';
import { adminApi } from '@/lib/api';

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

const STATUS_LABEL: Record<string, string> = {
  under_review: 'Under Review',
  planned:      'Planned',
  in_progress:  'In Progress',
  shipped:      'Shipped',
  closed:       'Closed',
};

const STATUS_STYLES: Record<string, string> = {
  under_review: 'bg-yellow-100 text-yellow-700',
  planned:      'bg-[#3A7BD5]/10 text-[#3A7BD5]',
  in_progress:  'bg-green-100 text-green-700',
  shipped:      'bg-emerald-100 text-emerald-700',
  closed:       'bg-gray-100 text-gray-500',
};

const CATEGORY_STYLES: Record<string, string> = {
  ux:      'bg-purple-100 text-purple-700',
  feature: 'bg-[#0F2B4C]/10 text-[#0F2B4C]',
  bug:     'bg-red-100 text-red-700',
  i18n:    'bg-cyan-100 text-cyan-700',
  perf:    'bg-orange-100 text-orange-700',
  other:   'bg-gray-100 text-gray-700',
};

export default function SuggestionsPage() {
  const [items,   setItems]   = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [editing, setEditing] = useState<Suggestion | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.suggestions.list()
      .then((data: any) => setItems(data?.items ?? []))
      .catch((e: any) => setError(e?.message ?? 'Could not load suggestions'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <Lightbulb size={18} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#0F2B4C]">User Suggestions</h1>
          <p className="text-sm text-gray-500">Feature requests and feedback submitted by customers and drivers</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Suggestions', value: items.length,                              icon: Lightbulb,     color: 'text-yellow-500' },
          { label: 'Total Votes',       value: items.reduce((s, r) => s + r.voteCount, 0), icon: ThumbsUp,      color: 'text-[#3A7BD5]' },
          { label: 'Awaiting Review',   value: items.filter(s => s.status === 'under_review').length, icon: MessageSquare, color: 'text-green-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
              <Icon size={18} className={color} />
            </div>
            <div>
              <div className="text-xl font-bold text-[#0F2B4C]">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading suggestions…
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[#E5E7EB] text-gray-400">
          <Lightbulb size={32} className="mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No suggestions yet</p>
          <p className="text-xs mt-1">Customer + driver submissions will appear here.</p>
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
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${CATEGORY_STYLES[s.category] ?? 'bg-gray-100 text-gray-600'}`}>{s.category}</span>
                  </span>
                  <span className="text-xs text-gray-400">by {s.submittedBy?.name ?? 'Anonymous'}</span>
                  <span className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
              </div>
              <button onClick={() => setEditing(s)} className="text-xs text-[#3A7BD5] hover:underline font-medium shrink-0">Update</button>
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
          <h2 className="font-bold text-[#0F2B4C]">Update suggestion</h2>
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
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]">
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Admin Reply (visible to submitter)</label>
            <textarea value={adminReply} onChange={e => setAdminReply(e.target.value)} rows={4}
              placeholder="Thanks for the suggestion — we're targeting this for v1.1."
              className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm font-semibold bg-[#0F2B4C] text-white rounded-lg hover:bg-[#3A7BD5] disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
