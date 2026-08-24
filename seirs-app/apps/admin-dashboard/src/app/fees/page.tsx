'use client';
import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api';
import { naira } from '@/lib/money';
import FuelDriftBanner from '@/components/FuelDriftBanner';
import { isSuperAdminFromUser } from '@/lib/rbac';
import { getUser } from '@/lib/auth';
import { DollarSign, Save, X, History, Search, AlertCircle, CheckCircle2, Lock } from 'lucide-react';

interface Fee {
  key:               string;
  name:              string;
  description:       string;
  category:          string;
  unit:              string;
  value:             string | number;   // Postgres returns decimal as string
  active:            boolean;
  currentNote:       string | null;
  lastUpdatedByName: string | null;
  updatedAt:         string;
}

interface HistoryEntry {
  id:             string;
  feeKey:         string;
  previousValue:  string | number;
  newValue:       string | number;
  previousActive: boolean;
  newActive:      boolean;
  changedByName:  string | null;
  note:           string | null;
  changedAt:      string;
}

const CATEGORY_LABEL: Record<string, string> = {
  commission:    'Commission',
  customer_fee:  'Customer Fees',
  driver_fee:    'Driver Fees',
  storage:       'Storage',
  surge:         'Surge',
  subscription:  'Subscriptions',
  partner:       'Partner',
  zone:          'Zone Surcharges',
  pool:          'Pool & Multi-stop',
  financial:     'Financial Services',
  dev_platform:  'Developer Platform',
  loyalty:       'Loyalty & Referrals',
  config:        'System Config',
};

// Ordered by how often someone actually needs them. Partner and Loyalty
// used to sit near the end, and System Config had become a 24-row
// dumping ground at the very bottom that nobody scrolled to.
const CATEGORY_ORDER = [
  'commission', 'customer_fee', 'driver_fee', 'partner', 'loyalty',
  'storage', 'surge', 'pool', 'zone', 'subscription', 'financial',
  'dev_platform', 'config',
];

// Format the raw stored value into the right human-readable string
// based on the fee's unit. Negative values render with a leading minus.
function formatValue(value: number, unit: string): string {
  const n = Number(value);
  switch (unit) {
    case 'flat_ngn':  return n < 0 ? `−${naira(Math.abs(n))}` : naira(n);
    case 'percent':   return `${n}%`;
    case 'per_km':    return `${naira(n)}/km`;
    case 'per_day':   return `${naira(n)}/day`;
    case 'per_week':  return `${naira(n)}/wk`;
    case 'per_month': return `${naira(n)}/mo`;
    // Not money. These used to fall through to the naira branch, so
    // a 7 day abandonment threshold rendered as a naira amount.
    case 'minutes':   return `${n} ${n === 1 ? 'minute' : 'minutes'}`;
    case 'hours':     return `${n} ${n === 1 ? 'hour' : 'hours'}`;
    case 'days':      return `${n} ${n === 1 ? 'day' : 'days'}`;
    case 'count':     return String(n);
    case 'hour_of_day': {
      const h = ((Math.round(n) % 24) + 24) % 24;
      const display = h % 12 === 0 ? 12 : h % 12;
      return `${display}${h < 12 ? 'am' : 'pm'} (${String(h).padStart(2, '0')}:00 WAT)`;
    }
    default:          return String(n);
  }
}

export default function FeeCataloguePage() {
  const [fees,        setFees]        = useState<Fee[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [editing,     setEditing]     = useState<Fee | null>(null);
  const [history,     setHistory]     = useState<HistoryEntry[]>([]);
  const [newValue,    setNewValue]    = useState('');
  const [newNote,     setNewNote]     = useState('');
  const [newActive,   setNewActive]   = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [savedKey,    setSavedKey]    = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  // PATCH /fees/:key is super-admin only, but the nav grants this page to
  // ops_manager and finance_officer. They could open any fee, edit it,
  // hit an always-enabled Save and collect a 403 alert. Read-only for
  // them now, and the drawer says so before they start typing.
  const canEdit = isSuperAdminFromUser(getUser());

  // Initial load
  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.fees.list()
      .then(rows => setFees(Array.isArray(rows) ? rows : []))
      .catch((e: any) => { setFees([]); setError(e?.message ?? 'Could not load the fee catalogue'); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Group + filter for rendering
  const grouped = useMemo(() => {
    const filter = search.trim().toLowerCase();
    const visible = filter
      ? fees.filter(f =>
          f.name.toLowerCase().includes(filter) ||
          f.key.toLowerCase().includes(filter) ||
          f.description.toLowerCase().includes(filter),
        )
      : fees;
    const byCat: Record<string, Fee[]> = {};
    for (const f of visible) (byCat[f.category] ??= []).push(f);
    return byCat;
  }, [fees, search]);

  const openEditor = async (fee: Fee) => {
    setEditing(fee);
    setNewValue(String(fee.value));
    setNewNote('');
    setNewActive(fee.active);
    setHistory([]);
    try {
      const h = await adminApi.fees.history(fee.key, 20);
      setHistory(Array.isArray(h) ? h : []);
    } catch { /* non-fatal */ }
  };

  const closeEditor = () => {
    setEditing(null);
    setNewValue('');
    setNewNote('');
    setHistory([]);
  };

  const handleSave = async () => {
    if (!editing) return;
    const numericValue = Number(newValue);
    if (!Number.isFinite(numericValue)) {
      alert('Value must be a number');
      return;
    }
    setSaving(true);
    try {
      const updated = await adminApi.fees.update(editing.key, {
        value:       numericValue,
        active:      newActive,
        currentNote: newNote || undefined,
      });
      setFees(prev => prev.map(f => f.key === editing.key ? updated : f));
      setSavedKey(editing.key);
      setTimeout(() => setSavedKey(null), 2500);
      closeEditor();
    } catch (err: any) {
      alert(`Save failed: ${err?.message ?? 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* The fuel rows live on this page, so the warning about them does too. */}
      <FuelDriftBanner />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <DollarSign size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Fee Catalogue</h1>
            <p className="text-sm text-gray-500">
              Single source of truth for every editable fee, multiplier, and rate. Changes propagate live within 60s.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          {!canEdit && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
              <Lock size={11} /> Read-only
            </span>
          )}
          <span>{fees.length} fees · {fees.filter(f => f.active).length} active</span>
        </div>
      </div>

      {/* A 403 or a cold Railway boot used to render as "No fees
          configured yet", which reads as a bad seed, not a bad request. */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={load} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search fees by name, key, or description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:border-[#3A7BD5]"
        />
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading fee catalogue…</div>
      ) : fees.length === 0 ? (
        <div className="text-center py-20 text-gray-400">No fees configured yet - backend seed should have run on first deploy.</div>
      ) : (
        <div className="space-y-6">
          {/* Anything the backend adds that CATEGORY_ORDER has not heard of
              used to vanish silently. Known categories keep their order,
              unknown ones fall in at the end rather than disappearing. */}
          {[...CATEGORY_ORDER, ...Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c)).sort()]
            .filter(cat => grouped[cat]?.length).map(cat => (
            <section key={cat}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#0F2B4C]/60 mb-2 px-1">
                {CATEGORY_LABEL[cat] ?? cat}
              </h2>
              <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
                {grouped[cat].map(fee => (
                  <div
                    key={fee.key}
                    className="flex items-start gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => openEditor(fee)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-[#0F2B4C] truncate">{fee.name}</span>
                        {!fee.active && (
                          <span className="text-[10px] font-bold uppercase bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">Disabled</span>
                        )}
                        {savedKey === fee.key && (
                          <span className="flex items-center gap-1 text-[10px] font-bold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                            <CheckCircle2 size={10} /> Saved
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-1">{fee.description}</p>
                      <p className="text-[10px] text-gray-400 mt-1 font-mono">{fee.key}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-base font-bold ${fee.active ? 'text-[#0F2B4C]' : 'text-gray-400 line-through'}`}>
                        {formatValue(Number(fee.value), fee.unit)}
                      </div>
                      {fee.lastUpdatedByName && (
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          by {fee.lastUpdatedByName}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Edit drawer (right-side panel) */}
      {editing && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={closeEditor} />
          <aside className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[#E5E7EB] flex items-start justify-between p-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-[#0F2B4C] truncate">{editing.name}</h2>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{editing.description}</p>
                <p className="text-[10px] text-gray-400 mt-1 font-mono">{editing.key}</p>
              </div>
              <button onClick={closeEditor} className="p-1 hover:bg-gray-100 rounded">
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Value editor */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                  Value · {editing.unit.replace(/_/g, ' ')}
                </label>
                <input
                  type="number"
                  step="any"
                  value={newValue}
                  disabled={!canEdit}
                  onChange={e => setNewValue(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-base font-semibold focus:outline-none focus:border-[#3A7BD5] disabled:bg-gray-50 disabled:text-gray-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Preview: <span className="font-bold text-[#0F2B4C]">{formatValue(Number(newValue) || 0, editing.unit)}</span>
                </p>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-semibold text-[#0F2B4C]">Active</p>
                  <p className="text-xs text-gray-500">Disable to stop applying this fee without deleting it.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newActive}
                    disabled={!canEdit}
                    onChange={e => setNewActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-gray-300 peer-checked:bg-[#3A7BD5] rounded-full transition-colors relative">
                    <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                  </div>
                </label>
              </div>

              {/* Optional note */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                  Change note (optional)
                </label>
                <textarea
                  value={newNote}
                  disabled={!canEdit}
                  onChange={e => setNewNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. raised due to fuel spike on 2026-05-04"
                  className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:border-[#3A7BD5] disabled:bg-gray-50"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Captured in the history log alongside who changed it and when.
                </p>
              </div>

              {/* Save button. Hidden entirely rather than disabled: a
                  greyed-out Save invites a support ticket, a plain
                  sentence does not. */}
              {canEdit ? (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-[#0F2B4C] text-white font-semibold py-2.5 rounded-lg hover:bg-[#1a3d6b] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Save size={15} />
                  {saving ? 'Saving…' : 'Save change'}
                </button>
              ) : (
                <div className="flex items-start gap-2 p-3 bg-gray-50 border border-[#E5E7EB] rounded-lg">
                  <Lock size={14} className="text-gray-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-600">
                    Read-only. Fee values are editable by a Super Admin only. You can review the current value and its full change history here.
                  </p>
                </div>
              )}

              {canEdit && Number(editing.value) !== Number(newValue) && (
                <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertCircle size={14} className="text-yellow-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-900">
                    Changing from <strong>{formatValue(Number(editing.value), editing.unit)}</strong> to{' '}
                    <strong>{formatValue(Number(newValue) || 0, editing.unit)}</strong>. Live within 60s of save.
                  </p>
                </div>
              )}

              {/* History */}
              <div className="pt-4 border-t border-[#E5E7EB]">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/70 mb-2">
                  <History size={12} /> Change history
                </h3>
                {history.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">No changes yet - this is the seed value.</p>
                ) : (
                  <ol className="space-y-2">
                    {history.map(h => (
                      <li key={h.id} className="text-xs border-l-2 border-[#3A7BD5]/30 pl-3 pb-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#0F2B4C]">
                            {formatValue(Number(h.previousValue), editing.unit)} → {formatValue(Number(h.newValue), editing.unit)}
                          </span>
                          <span className="text-gray-400">
                            {new Date(h.changedAt).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <div className="text-gray-500">
                          by {h.changedByName ?? 'Admin'} · {new Date(h.changedAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {h.note && <p className="text-gray-600 italic mt-1">&quot;{h.note}&quot;</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
