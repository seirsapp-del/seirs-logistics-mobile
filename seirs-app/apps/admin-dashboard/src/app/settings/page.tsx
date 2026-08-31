'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Settings, Lock, AlertTriangle, RefreshCw, Save, Sparkles, Trash2, AlertCircle } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm, useNotify } from '@/components/ConfirmDialog';

/**
 * The switches that govern the whole platform.
 *
 * The most dangerous control on this page was a free-text box. Putting
 * the platform into maintenance meant typing the word "on" into an
 * input, which stops every customer booking and every rider working,
 * with no confirmation of any kind. Worse, the server reads that value
 * case-insensitively and this page compared it with === 'on', so typing
 * "ON" took SEIRS offline while the banner here cheerfully said it was
 * not. It is a switch now, with a confirmation that says what it does.
 */

interface ConfigRow {
  key:         string;
  value:       string;
  description: string;
  isEditable:  boolean;
  updatedAt:   string;
}

/** The key is a column name. Nobody says "max_active_deliveries". */
const PRETTY: Record<string, { label: string; help?: string }> = {
  platform_name:         { label: 'What SEIRS calls itself',       help: 'The name shown across the apps and the website.' },
  support_email:         { label: 'Support email address',         help: 'Printed on the website and in emails to customers. Changing it changes where people write to.' },
  max_active_deliveries: { label: 'Most jobs running at once',     help: 'A safety cap. When more than this many deliveries are live, matching pauses and new bookings wait.' },
  default_currency:      { label: 'Currency SEIRS settles in',     help: 'Fixed at naira.' },
  default_timezone:      { label: 'Time zone the apps work in',    help: 'Fixed at Lagos time.' },
  maintenance_mode:      { label: 'Maintenance mode',              help: 'When this is on, every app shows a maintenance screen. Nobody can book, and drivers cannot take jobs.' },
};

function labelFor(key: string): string {
  if (PRETTY[key]) return PRETTY[key].label;
  const s = key.replace(/[._-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function SettingsPage() {
  const confirm = useConfirm();
  const notify  = useNotify();

  const [rows, setRows]       = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft]     = useState<string>('');
  const [saving, setSaving]   = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await adminApi.settings.list();
      setRows(list ?? []);
    } catch (e: any) {
      // load() had no catch at all, so a failure left the page saying
      // "no configuration keys defined yet", which reads as a fresh
      // install rather than a broken connection.
      setError(e?.message ?? 'The settings could not be loaded.');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const beginEdit = (row: ConfigRow) => {
    setEditing(row.key);
    setDraft(row.value);
  };

  const cancel = () => { setEditing(null); setDraft(''); };

  const write = async (key: string, value: string): Promise<boolean> => {
    setSaving(true);
    try {
      await adminApi.settings.update(key, value);
      await load();
      setEditing(null);
      setDraft('');
      return true;
    } catch (e: any) {
      void notify({
        title:   'Not saved',
        message: e?.message ?? 'The server refused the change. The old value still applies.',
        tone:    'error',
      });
      return false;
    } finally { setSaving(false); }
  };

  const save = async (row: ConfigRow) => {
    const next = draft.trim();
    if (!next || next === row.value) { cancel(); return; }
    const ok = await confirm({
      title:   `Change "${labelFor(row.key)}"?`,
      message:
        `From: ${row.value}\nTo: ${next}\n\n` +
        (PRETTY[row.key]?.help ? `${PRETTY[row.key].help}\n\n` : '') +
        'It applies to the live apps within a minute. Your name and both values go into the audit log.',
      confirmLabel: 'Save it',
    });
    if (!ok) return;
    if (await write(row.key, next)) {
      void notify({ title: 'Saved', message: `"${labelFor(row.key)}" is now ${next}.`, tone: 'success' });
    }
  };

  const maintenanceRow = rows.find(r => r.key === 'maintenance_mode');
  // The server compares lowercased, so "ON" takes the platform down.
  // This used to compare === 'on' and would have said everything was
  // fine while every app showed the maintenance screen.
  const maintenanceOn  = (maintenanceRow?.value ?? '').trim().toLowerCase() === 'on';

  const toggleMaintenance = async () => {
    if (!maintenanceRow) return;
    const turningOn = !maintenanceOn;
    const ok = await confirm({
      title: turningOn ? 'Take SEIRS offline for everybody?' : 'Bring SEIRS back online?',
      message: turningOn
        ? 'Every customer, driver and partner store immediately sees a maintenance screen instead of the app.\n\n'
          + 'Nobody can book. Drivers cannot accept jobs. Deliveries already on the road are not cancelled, but nothing new starts.\n\n'
          + 'Nobody is warned first, and there is no scheduled window. You can switch it back from this page at any time.'
        : 'The apps go back to normal within about a minute. Customers can book again and drivers can accept jobs.',
      confirmLabel: turningOn ? 'Take everything offline' : 'Bring it back online',
      danger:       turningOn,
    });
    if (!ok) return;
    if (await write('maintenance_mode', turningOn ? 'on' : 'off')) {
      void notify({
        title:   turningOn ? 'SEIRS is offline' : 'SEIRS is back online',
        message: turningOn
          ? 'Every app is showing the maintenance screen. Come back here to switch it off.'
          : 'The apps are working normally again.',
        tone: 'success',
      });
    }
  };

  const configRows = rows.filter(r => r.key !== 'featured_promotion' && r.key !== 'maintenance_mode');

  return (
    <div className="p-8">
      <PageIntro
        title="System Settings"
        purpose="The handful of switches that apply to the whole platform, including the one that takes every app offline."
        storageKey="settings"
        help={
          <>
            <p><strong>Maintenance mode</strong> stops every customer and driver using SEIRS, straight away and without warning them. Treat it as the emergency stop.</p>
            <p>Every change here is written to the audit log with your name, the old value and the new one.</p>
            <p>Prices, fees and email wording are not here. Each lives on its own page, linked at the bottom.</p>
          </>
        }
        actions={
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={load} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* The emergency stop, as a switch rather than a text box. */}
      {maintenanceRow && (
        <div className={`mb-6 rounded-xl border-2 p-4 ${maintenanceOn ? 'border-red-300 bg-red-50' : 'border-[#E5E7EB] bg-white'}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className={`mt-0.5 shrink-0 ${maintenanceOn ? 'text-red-600' : 'text-[#0F2B4C]/30'}`} />
              <div>
                <p className={`text-sm font-bold ${maintenanceOn ? 'text-red-700' : 'text-[#0F2B4C]'}`}>
                  {maintenanceOn ? 'SEIRS is offline right now' : 'Maintenance mode is off. Everything is running.'}
                </p>
                <p className={`mt-0.5 max-w-xl text-xs leading-relaxed ${maintenanceOn ? 'text-red-600' : 'text-[#0F2B4C]/50'}`}>
                  {maintenanceOn
                    ? 'Every customer, driver and partner store is seeing a maintenance screen. Nobody can book and no driver can take a job.'
                    : 'Switching this on shows every app a maintenance screen immediately, with no warning to anybody. Only use it when SEIRS genuinely must stop.'}
                </p>
                {maintenanceRow.updatedAt && (
                  <p className="mt-1 text-[11px] text-[#0F2B4C]/40">
                    Last changed {new Date(maintenanceRow.updatedAt).toLocaleString('en-NG')}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={toggleMaintenance}
              disabled={saving || !maintenanceRow.isEditable}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                maintenanceOn ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {maintenanceOn ? 'Bring SEIRS back online' : 'Take SEIRS offline'}
            </button>
          </div>
        </div>
      )}

      <FeaturedPromotionCard
        raw={rows.find(r => r.key === 'featured_promotion')?.value ?? ''}
        onSaved={load}
      />

      <DemoDataCard />

      <div className="mt-6 rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <Settings size={15} className="text-[#0F2B4C]" />
          <span className="text-sm font-semibold text-[#0F2B4C]">Platform settings</span>
        </div>
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading</div>
          ) : error ? (
            <EmptyState
              icon={<AlertCircle size={20} />}
              title="The settings could not be loaded"
              body="This is a connection or permission problem. Nothing has been changed."
              action={{ label: 'Try again', onClick: load }}
            />
          ) : configRows.length === 0 ? (
            <EmptyState
              icon={<Settings size={20} />}
              title="No settings are defined"
              body="The API creates these on first run, so an empty list usually means something is wrong with the deployment."
              action={{ label: 'Try again', onClick: load }}
            />
          ) : configRows.map(row => {
            const label = labelFor(row.key);
            const isEditing = editing === row.key;
            return (
              <div key={row.key} className="flex items-start justify-between gap-4 px-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-gray-700">{label}</div>
                    {!row.isEditable && (
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                        <Lock size={10} /> fixed, cannot be changed here
                      </span>
                    )}
                  </div>
                  {/* The server's own description, plus a plainer one
                      where the server's is written for engineers. */}
                  <div className="mt-0.5 text-xs text-gray-500">
                    {PRETTY[row.key]?.help ?? row.description}
                  </div>
                  {!isEditing ? (
                    <div className="mt-2 text-sm text-[#0F2B4C]">
                      <span className="font-semibold">{row.value}</span>
                      {row.updatedAt && (
                        <span className="ml-2 text-[11px] text-gray-400">
                          last changed {new Date(row.updatedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') save(row); if (e.key === 'Escape') cancel(); }}
                        className="max-w-md flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
                      />
                      <button
                        onClick={() => save(row)}
                        disabled={saving || draft.trim() === '' || draft.trim() === row.value}
                        className="flex items-center gap-1.5 rounded-lg bg-[#0F2B4C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3A7BD5] disabled:opacity-50"
                      >
                        <Save size={12} />
                        {saving ? 'Saving' : 'Save'}
                      </button>
                      <button onClick={cancel} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                {!isEditing && row.isEditable && (
                  <button
                    onClick={() => beginEdit(row)}
                    className="shrink-0 rounded-lg border border-[#3A7BD5]/30 px-2.5 py-1 text-xs font-medium text-[#3A7BD5] transition-colors hover:bg-[#3A7BD5]/5 hover:underline"
                  >
                    Change
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Link, not <a>: a bare anchor reloads the entire dashboard. */}
      <div className="mt-6 text-center text-xs text-gray-400">
        Email wording lives on <Link className="text-[#3A7BD5] hover:underline" href="/email-templates">Email Templates</Link>.
        Prices live on <Link className="text-[#3A7BD5] hover:underline" href="/pricing">Pricing Engine</Link>.
        Individual fees live on <Link className="text-[#3A7BD5] hover:underline" href="/fees">Fee Catalogue</Link>.
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

/* `live` mirrors REDEMPTIONS in the customer app's rewards.tsx.
   loyalty.service.ts only mutates the delivery price for the two
   naira-value rewards. Priority and insurance are recorded on the ledger
   but need dispatcher and insurance-partner wiring before they deliver
   anything, so the Rewards tab refuses to redeem them. Featuring one here
   would promote a reward the app then blocks, which is why they are
   labelled rather than silently offered. */
const PROMO_TYPES: { value: PromoType; name: string; hint: string; live: boolean }[] = [
  { value: 'discount_500',  live: true,  name: '500 naira off',      hint: '₦500 off the next delivery, costs the customer 500 points' },
  { value: 'free_delivery', live: true,  name: 'A free delivery',    hint: 'One free standard delivery, costs the customer 1,000 points' },
  { value: 'priority',      live: false, name: 'Priority dispatch',  hint: 'Priority on the next order, costs 300 points' },
  { value: 'insurance',     live: false, name: 'Package insurance',  hint: 'Insurance on the next order, costs 200 points' },
];

function FeaturedPromotionCard({ raw, onSaved }: { raw: string; onSaved: () => Promise<void> | void }) {
  const confirm = useConfirm();

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
  const chosen   = PROMO_TYPES.find(t => t.value === type);

  const save = async () => {
    setError(null);
    if (!label.trim() || !desc.trim()) {
      setError('Both the headline and the description are needed.');
      return;
    }
    let expiresAt: string | null = null;
    if (expiry) {
      const d = new Date(expiry);
      if (isNaN(d.getTime())) { setError('That expiry date is not a real date.'); return; }
      if (d.getTime() < Date.now()) { setError('The expiry has to be in the future.'); return; }
      expiresAt = d.toISOString();
    }

    // This card appears on the Rewards tab of every customer's app the
    // moment it is saved, and nothing said so.
    const ok = await confirm({
      title:   active ? 'Change what every customer sees?' : 'Show this to every customer?',
      message:
        `A card reading "${label.trim()}" appears on the Rewards tab in every customer's app straight away.\n\n` +
        `Reward offered: ${chosen?.name ?? type}.\n` +
        (expiresAt ? `It disappears on its own at ${new Date(expiresAt).toLocaleString('en-NG')}.\n` : 'It stays up until somebody removes it.\n') +
        (chosen?.live === false
          ? '\nWARNING: customers cannot actually redeem this reward yet. The app shows it and then refuses.\n'
          : '') +
        '\nNo notification is sent. You can change or remove it from this page at any time.',
      confirmLabel: active ? 'Update it' : 'Show it to customers',
      danger:       chosen?.live === false,
    });
    if (!ok) return;

    const payload = JSON.stringify({ type, label: label.trim(), desc: desc.trim(), expiresAt });
    setSaving(true);
    try {
      await adminApi.settings.update('featured_promotion', payload);
      await onSaved();
    } catch (e: any) {
      setError(`It was not saved: ${e?.message ?? 'the server did not answer'}.`);
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    // Was window.confirm, which some browsers suppress outright after a
    // user ticks "stop this page creating dialogs", leaving a dead button.
    const ok = await confirm({
      title:   'Take the promotion down?',
      message: 'The card disappears from the Rewards tab in every customer app. Nobody is told. You can put it back at any time.',
      confirmLabel: 'Take it down',
      danger:  true,
    });
    if (!ok) return;
    setClearing(true);
    try {
      await adminApi.settings.update('featured_promotion', '');
      await onSaved();
    } catch (e: any) {
      setError(`It was not removed: ${e?.message ?? 'the server did not answer'}.`);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-white px-4 py-3">
        <Sparkles size={15} className="text-amber-600" />
        <span className="text-sm font-semibold text-[#0F2B4C]">The offer on the customer Rewards tab</span>
        {active && !expired && (
          <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Customers can see it</span>
        )}
        {active && expired && (
          <span className="ml-auto rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">Expired, hidden</span>
        )}
        {!active && (
          <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">Nothing showing</span>
        )}
      </div>

      <div className="space-y-3 p-4">
        <p className="text-xs text-gray-500">
          One highlighted card at the top of the Rewards tab in the customer app. Leave the expiry blank and it stays until removed.
        </p>

        {parsed?.__invalid && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            What is stored is not readable. Saving here replaces it.
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs">
            <div className="mb-1 font-semibold text-gray-600">Which reward</div>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as PromoType)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
            >
              {/* Was the raw stored value, e.g. "discount_500". */}
              {PROMO_TYPES.map(t => (
                <option key={t.value} value={t.value}>
                  {t.name}{t.live ? '' : ' (customers cannot redeem it yet)'}
                </option>
              ))}
            </select>
            <div className="mt-1 text-[10px] text-gray-500">{chosen?.hint}</div>
            {chosen?.live === false && (
              <div className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-700">
                Customers cannot redeem this yet. The Rewards tab shows it and then blocks them,
                so featuring it advertises something that does not work.
              </div>
            )}
          </label>

          <label className="text-xs">
            <div className="mb-1 font-semibold text-gray-600">Take it down automatically at (optional)</div>
            <input
              type="datetime-local"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
            />
            <div className="mt-1 text-[10px] text-gray-500">Your local time. Blank means it stays up.</div>
          </label>
        </div>

        <label className="block text-xs">
          <div className="mb-1 font-semibold text-gray-600">Headline customers read</div>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="₦500 off your next order"
            maxLength={60}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
          />
          <div className="mt-1 text-[10px] tabular-nums text-gray-400">{label.length}/60</div>
        </label>

        <label className="block text-xs">
          <div className="mb-1 font-semibold text-gray-600">The line underneath</div>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Redeem 500 points and save on your next delivery."
            maxLength={140}
            rows={2}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
          />
          <div className="mt-1 text-[10px] tabular-nums text-gray-400">{desc.length}/140</div>
        </label>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={save}
            disabled={saving || !label.trim() || !desc.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-[#0F2B4C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3A7BD5] disabled:opacity-50"
          >
            <Save size={12} />
            {saving ? 'Saving' : (active ? 'Update what customers see' : 'Show it to customers')}
          </button>
          {active && (
            <button
              onClick={clear}
              disabled={clearing}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={12} />
              {clearing ? 'Removing' : 'Take it down'}
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
   populated with delivery history and ratings. Use these to sign in on
   the phone for marketing screenshots so a real user's name or SEIRS ID
   never appears on a public surface. */
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
      setError(e?.message ?? 'The demo accounts could not be created.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        <Sparkles size={15} className="text-[#0F2B4C]" />
        <span className="text-sm font-semibold text-[#0F2B4C]">Fake accounts for screenshots</span>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-xs leading-relaxed text-gray-500">
          Creates three permanent pretend accounts (a customer, a driver and a partner store) with believable
          delivery history, ratings and reward points, so you can sign in on a phone and take marketing
          screenshots without a real person&apos;s name or SEIRS ID ever appearing in public.
          Safe to run again: it refreshes the same three accounts rather than making more.
        </p>
        <button
          onClick={seed}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-[#0F2B4C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3A7BD5] disabled:opacity-50"
        >
          <Sparkles size={12} />
          {busy ? 'Creating them' : result ? 'Refresh the demo accounts' : 'Create the demo accounts'}
        </button>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <div className="grid grid-cols-3 divide-x divide-gray-100">
              {([
                ['customer', 'Customer'],
                ['driver',   'Driver'],
                ['business', 'Partner store'],
              ] as const).map(([k, title]) => (
                <div key={k} className="p-3">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{title}</div>
                  <div className="text-xs font-semibold text-[#0F2B4C]">{result.accounts[k].name}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-gray-500">{result.accounts[k].email}</div>
                  <div className="font-mono text-[10px] text-gray-400">{result.accounts[k].accountId}</div>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
              The password for all three: <code className="rounded border border-gray-200 bg-white px-1.5 py-0.5 font-mono">{result.password}</code>
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
