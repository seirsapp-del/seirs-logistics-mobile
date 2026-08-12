'use client';
import { useEffect, useMemo, useState } from 'react';
import { Settings, Lock, AlertTriangle, RefreshCw, Save, Sparkles, Trash2 } from 'lucide-react';
import { adminApi } from '@/lib/api';

interface ConfigRow {
  key:         string;
  value:       string;
  description: string;
  isEditable:  boolean;
  updatedAt:   string;
}

const PRETTY_LABEL: Record<string, string> = {
  platform_name:         'Platform Name',
  support_email:         'Support Email',
  max_active_deliveries: 'Max Active Deliveries',
  default_currency:      'Default Currency',
  default_timezone:      'Default Timezone',
  maintenance_mode:      'Maintenance Mode',
};

export default function SettingsPage() {
  const [rows, setRows]       = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft]     = useState<string>('');
  const [saving, setSaving]   = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await adminApi.settings.list();
      setRows(list ?? []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const beginEdit = (row: ConfigRow) => {
    setEditing(row.key);
    setDraft(row.value);
  };

  const cancel = () => { setEditing(null); setDraft(''); };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await adminApi.settings.update(editing, draft.trim());
      await load();
      setEditing(null);
      setDraft('');
    } catch (e: any) {
      alert(`Save failed: ${e?.message ?? 'unknown error'}`);
    } finally { setSaving(false); }
  };

  const maintenanceRow = rows.find(r => r.key === 'maintenance_mode');
  const maintenanceOn  = maintenanceRow?.value === 'on';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <Settings size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">System Settings</h1>
            <p className="text-sm text-gray-500">Platform configuration. Edits are written to the audit log.</p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {maintenanceOn && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700">Maintenance mode is ON.</p>
            <p className="text-xs text-red-600 mt-0.5">
              All apps are showing the maintenance screen and matching is paused. Flip <code className="bg-red-100 px-1 rounded">maintenance_mode</code> to <code className="bg-red-100 px-1 rounded">off</code> to resume normal operation.
            </p>
          </div>
        </div>
      )}

      <FeaturedPromotionCard
        raw={rows.find(r => r.key === 'featured_promotion')?.value ?? ''}
        onSaved={load}
      />

      <DemoDataCard />

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <Settings size={15} className="text-[#0F2B4C]" />
          <span className="text-sm font-semibold text-[#0F2B4C]">Platform Configuration</span>
        </div>
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No configuration keys defined yet.</div>
          ) : rows.filter(r => r.key !== 'featured_promotion').map(row => {
            const label = PRETTY_LABEL[row.key] ?? row.key;
            const isEditing = editing === row.key;
            return (
              <div key={row.key} className="px-4 py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-gray-700">{label}</div>
                    {!row.isEditable && (
                      <span className="text-[10px] uppercase font-bold tracking-wide text-gray-400 flex items-center gap-1">
                        <Lock size={10} /> Read-only
                      </span>
                    )}
                  </div>
                  {row.description && (
                    <div className="text-xs text-gray-500 mt-0.5">{row.description}</div>
                  )}
                  {!isEditing ? (
                    <div className="text-sm text-[#0F2B4C] mt-2 font-mono">{row.value}</div>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        autoFocus
                        className="flex-1 max-w-md border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
                      />
                      <button
                        onClick={save}
                        disabled={saving || draft.trim() === ''}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 font-semibold bg-[#0F2B4C] text-white rounded-lg hover:bg-[#3A7BD5] disabled:opacity-50"
                      >
                        <Save size={12} />
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={cancel} className="text-xs px-3 py-1.5 text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                {!isEditing && row.isEditable && (
                  <button
                    onClick={() => beginEdit(row)}
                    className="text-xs text-[#3A7BD5] hover:underline font-medium border border-[#3A7BD5]/30 px-2.5 py-1 rounded-lg hover:bg-[#3A7BD5]/5 transition-colors shrink-0"
                  >
                    Edit
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-xs text-gray-400 text-center">
        Email templates live at <a className="text-[#3A7BD5] hover:underline" href="/email-templates">/email-templates</a>. Rate card lives at <a className="text-[#3A7BD5] hover:underline" href="/pricing">/pricing</a>. Fee catalogue lives at <a className="text-[#3A7BD5] hover:underline" href="/fees">/fees</a>.
      </div>
    </div>
  );
}

/* Featured Promotion widget. Backed by platform_config key
   `featured_promotion`. Value is a JSON string of shape:
     { type, label, desc, expiresAt }
   Customer-app Rewards tab reads via GET /deliveries/featured-promotion,
   which returns null when unset OR when expiresAt has passed. */

type PromoType = 'discount_500' | 'free_delivery' | 'priority' | 'insurance';

const PROMO_TYPES: { value: PromoType; hint: string }[] = [
  { value: 'discount_500',  hint: '₦500 off next delivery (500 pts)' },
  { value: 'free_delivery', hint: 'One free standard delivery (1000 pts)' },
  { value: 'priority',      hint: 'Priority dispatch on next order (300 pts)' },
  { value: 'insurance',     hint: 'Package insurance on next order (200 pts)' },
];

function FeaturedPromotionCard({ raw, onSaved }: { raw: string; onSaved: () => Promise<void> | void }) {
  const parsed = useMemo(() => {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return { __invalid: true, raw }; }
  }, [raw]);

  const [type,     setType]     = useState<PromoType>((parsed?.type as PromoType) ?? 'discount_500');
  const [label,    setLabel]    = useState<string>(parsed?.label ?? '');
  const [desc,     setDesc]     = useState<string>(parsed?.desc ?? '');
  const [expiry,   setExpiry]   = useState<string>(parsed?.expiresAt ? isoToLocalInput(parsed.expiresAt) : '');
  const [saving,   setSaving]   = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    setType((parsed?.type as PromoType) ?? 'discount_500');
    setLabel(parsed?.label ?? '');
    setDesc(parsed?.desc ?? '');
    setExpiry(parsed?.expiresAt ? isoToLocalInput(parsed.expiresAt) : '');
    setError(null);
  }, [raw]);

  const active   = !!parsed && !parsed.__invalid;
  const expired  = active && parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now();

  const save = async () => {
    setError(null);
    if (!label.trim() || !desc.trim()) {
      setError('Label and description are required.');
      return;
    }
    let expiresAt: string | null = null;
    if (expiry) {
      const d = new Date(expiry);
      if (isNaN(d.getTime())) { setError('Expiry date is invalid.'); return; }
      if (d.getTime() < Date.now()) { setError('Expiry must be in the future.'); return; }
      expiresAt = d.toISOString();
    }
    const payload = JSON.stringify({ type, label: label.trim(), desc: desc.trim(), expiresAt });
    setSaving(true);
    try {
      await adminApi.settings.update('featured_promotion', payload);
      await onSaved();
    } catch (e: any) {
      setError(`Save failed: ${e?.message ?? 'unknown'}`);
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!confirm('Remove the featured promotion? Customers will stop seeing it on the Rewards tab.')) return;
    setClearing(true);
    try {
      await adminApi.settings.update('featured_promotion', '');
      await onSaved();
    } catch (e: any) {
      setError(`Clear failed: ${e?.message ?? 'unknown'}`);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-white">
        <Sparkles size={15} className="text-amber-600" />
        <span className="text-sm font-semibold text-[#0F2B4C]">Featured Promotion</span>
        {active && !expired && (
          <span className="ml-auto text-[10px] uppercase font-bold tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Live</span>
        )}
        {active && expired && (
          <span className="ml-auto text-[10px] uppercase font-bold tracking-wide text-red-700 bg-red-50 px-2 py-0.5 rounded-full">Expired</span>
        )}
        {!active && (
          <span className="ml-auto text-[10px] uppercase font-bold tracking-wide text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Not set</span>
        )}
      </div>

      <div className="p-4 space-y-3">
        <p className="text-xs text-gray-500">
          Shown on the customer Rewards tab as a hero card. Leave expiry blank for no auto-expiry. Clearing removes the card entirely.
        </p>

        {parsed?.__invalid && (
          <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg p-2.5">
            Stored value is not valid JSON. Saving here will overwrite it.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs">
            <div className="text-gray-600 font-semibold mb-1">Type</div>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as PromoType)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
            >
              {PROMO_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.value}</option>
              ))}
            </select>
            <div className="text-[10px] text-gray-500 mt-1">
              {PROMO_TYPES.find(t => t.value === type)?.hint}
            </div>
          </label>

          <label className="text-xs">
            <div className="text-gray-600 font-semibold mb-1">Expires at (optional)</div>
            <input
              type="datetime-local"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
            />
            <div className="text-[10px] text-gray-500 mt-1">Local time. Blank = no auto-expiry.</div>
          </label>
        </div>

        <label className="text-xs block">
          <div className="text-gray-600 font-semibold mb-1">Headline (Label)</div>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. ₦500 off your next order"
            maxLength={60}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
          />
          <div className="text-[10px] text-gray-400 mt-1">{label.length}/60</div>
        </label>

        <label className="text-xs block">
          <div className="text-gray-600 font-semibold mb-1">Description</div>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="e.g. Redeem 500 points and save on your next delivery."
            maxLength={140}
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
          />
          <div className="text-[10px] text-gray-400 mt-1">{desc.length}/140</div>
        </label>

        {error && (
          <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg p-2.5">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={save}
            disabled={saving || !label.trim() || !desc.trim()}
            className="flex items-center gap-1.5 text-xs px-4 py-2 font-semibold bg-[#0F2B4C] text-white rounded-lg hover:bg-[#3A7BD5] disabled:opacity-50"
          >
            <Save size={12} />
            {saving ? 'Saving…' : (active ? 'Update Promotion' : 'Publish Promotion')}
          </button>
          {active && (
            <button
              onClick={clear}
              disabled={clearing}
              className="flex items-center gap-1.5 text-xs px-3 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={12} />
              {clearing ? 'Clearing…' : 'Clear'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* Demo/marketing accounts (founder 2026-08-11). One click stages 3
   permanent fake accounts - customer, driver, partner store, one per
   Nigeria's three major ethnic groups per the sample-data rule - fully
   populated with delivery history, ratings, and a wallet balance. Use
   these to sign in on the phone for marketing screenshots so a real
   user's name or SEIRS ID never appears on a public surface. */
function DemoDataCard() {
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    password: string;
    accounts: Record<'customer' | 'driver' | 'business', { email: string; name: string; accountId: string }>;
  } | null>(null);

  const seed = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi.demoData.seed();
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? 'Could not seed demo accounts');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Sparkles size={15} className="text-[#0F2B4C]" />
        <span className="text-sm font-semibold text-[#0F2B4C]">Demo Marketing Accounts</span>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          Stages 3 permanent fake accounts (customer, driver, partner store) with realistic
          delivery history, ratings, and a wallet balance: sign in on the phone with these for
          marketing screenshots or demos. Real accounts should never appear on a public surface.
          Safe to run again any time; it refreshes the data without duplicating anything.
        </p>
        <button
          onClick={seed}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#0F2B4C] text-white rounded-lg hover:bg-[#3A7BD5] disabled:opacity-50"
        >
          <Sparkles size={12} />
          {busy ? 'Seeding…' : result ? 'Refresh Demo Accounts' : 'Seed Demo Accounts'}
        </button>

        {error && (
          <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg p-2.5">
            {error}
          </div>
        )}

        {result && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-gray-100">
              {(['customer', 'driver', 'business'] as const).map((k) => (
                <div key={k} className="p-3">
                  <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wide mb-1">{k}</div>
                  <div className="text-xs font-semibold text-[#0F2B4C]">{result.accounts[k].name}</div>
                  <div className="text-[10px] font-mono text-gray-500 mt-0.5">{result.accounts[k].email}</div>
                  <div className="text-[10px] font-mono text-gray-400">{result.accounts[k].accountId}</div>
                </div>
              ))}
            </div>
            <div className="bg-gray-50 px-3 py-2 text-[11px] text-gray-600 border-t border-gray-100">
              Shared password for all three: <code className="bg-white border border-gray-200 px-1.5 py-0.5 rounded font-mono">{result.password}</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* Convert an ISO date string to the value accepted by <input type="datetime-local">,
   which needs `YYYY-MM-DDTHH:mm` in the browser's local zone. */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
