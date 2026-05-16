'use client';
import { useEffect, useMemo, useState } from 'react';
import { Copy, AlertTriangle, RefreshCw, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { adminApi } from '@/lib/api';

interface Candidate {
  id:              string;
  primaryUserId:   string;
  duplicateUserId: string;
  primaryName:     string;
  primaryEmail:    string;
  primaryPhone:    string;
  duplicateName:   string;
  duplicateEmail:  string;
  duplicatePhone:  string;
  matchScore:      number | string;
  reason:          string;
  status:          'open' | 'confirmed' | 'merged' | 'dismissed';
  createdAt:       string;
  resolvedAt:      string | null;
}

const STATUS_STYLES: Record<string, string> = {
  open:      'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-red-100 text-red-700',
  merged:    'bg-emerald-100 text-emerald-700',
  dismissed: 'bg-gray-100 text-gray-500',
};
const STATUS_LABEL: Record<string, string> = {
  open: 'Under Review', confirmed: 'Confirmed', merged: 'Merged', dismissed: 'Dismissed',
};
const REASON_LABEL: Record<string, string> = {
  same_phone: 'Same phone', email_lookalike: 'Email lookalike',
  name_phone_match: 'Name + phone', nin_match: 'NIN match',
};

export default function DuplicatesPage() {
  const [items,    setItems]    = useState<Candidate[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [toast,    setToast]    = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.duplicates.list()
      .then(list => setItems(Array.isArray(list) ? list : []))
      .catch((e: any) => setError(e?.message ?? 'Could not load duplicates'))
      .finally(() => setLoading(false));
  };

  const scan = async () => {
    setScanning(true);
    setError(null); setToast(null);
    try {
      const r = await adminApi.duplicates.scan();
      setToast(`Scan complete — ${r.newCandidates} new candidate${r.newCandidates === 1 ? '' : 's'} across ${r.scanned} users.`);
      setTimeout(() => setToast(null), 3500);
      load();
    } catch (e: any) { setError(e?.message ?? 'Scan failed'); }
    finally { setScanning(false); }
  };

  const merge = async (c: Candidate) => {
    if (!confirm(`Merge "${c.duplicateName}" into "${c.primaryName}"?\n\nThe duplicate is deactivated and a merge pointer is set. This cannot be undone.`)) return;
    try { await adminApi.duplicates.merge(c.id); load(); }
    catch (e: any) { alert(e?.message ?? 'Merge failed'); }
  };

  const dismiss = async (c: Candidate) => {
    try { await adminApi.duplicates.dismiss(c.id); load(); }
    catch (e: any) { alert(e?.message ?? 'Dismiss failed'); }
  };

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({
    open:      items.filter(i => i.status === 'open').length,
    confirmed: items.filter(i => i.status === 'confirmed').length,
    merged:    items.filter(i => i.status === 'merged').length,
    dismissed: items.filter(i => i.status === 'dismissed').length,
  }), [items]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <Copy size={18} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#0F2B4C]">Duplicate Accounts</h1>
          <p className="text-sm text-gray-500">Detected accounts with overlapping identity signals — review and merge or dismiss.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50">
          <RefreshCw size={14} /> Refresh
        </button>
        <button onClick={scan} disabled={scanning}
          className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#2f6cc0] disabled:opacity-50">
          {scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {scanning ? 'Scanning…' : 'Run scan'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {toast && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={16} /> {toast}
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <Stat label="Under Review" value={counts.open}      color="text-yellow-600" />
        <Stat label="Confirmed"    value={counts.confirmed} color="text-red-600" />
        <Stat label="Merged"       value={counts.merged}    color="text-emerald-600" />
        <Stat label="Dismissed"    value={counts.dismissed} color="text-gray-500" />
      </div>

      <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
        <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
        <p className="text-sm text-red-800">
          Confirmed duplicates may indicate bonus abuse or identity fraud. Merge sets the duplicate&apos;s
          <code className="px-1 mx-1 bg-red-100 rounded">mergedIntoUserId</code> and deactivates it.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-[#0F2B4C]">Flagged Pairs</span>
          <span className="text-xs text-gray-400">{items.length} total</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Copy size={32} className="mx-auto mb-3 opacity-40" />
            <p className="font-semibold">No duplicate pairs flagged yet</p>
            <p className="text-xs mt-1">Tap &ldquo;Run scan&rdquo; above to detect candidate pairs.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Primary (keep)</th>
                  <th className="text-left px-4 py-3">Duplicate</th>
                  <th className="text-left px-4 py-3">Reason</th>
                  <th className="text-left px-4 py-3">Score</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#0F2B4C]">{c.primaryName}</div>
                      <div className="text-xs text-gray-500 truncate">{c.primaryEmail}</div>
                      <div className="text-[10px] text-gray-400 font-mono truncate">{c.primaryUserId.slice(0, 8)}…</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#0F2B4C]">{c.duplicateName}</div>
                      <div className="text-xs text-gray-500 truncate">{c.duplicateEmail}</div>
                      <div className="text-[10px] text-gray-400 font-mono truncate">{c.duplicateUserId.slice(0, 8)}…</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{REASON_LABEL[c.reason] ?? c.reason}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold text-red-600">{Math.round(Number(c.matchScore) * 100)}%</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                    </td>
                    <td className="px-4 py-3 flex gap-3">
                      {(c.status === 'open' || c.status === 'confirmed') ? (
                        <>
                          <button onClick={() => merge(c)}   className="text-xs text-red-600 hover:underline font-medium">Merge</button>
                          <button onClick={() => dismiss(c)} className="text-xs text-gray-500 hover:underline font-medium">Dismiss</button>
                        </>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
