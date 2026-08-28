'use client';

/**
 * The fee catalogue: every price SEIRS charges or pays, in one place.
 *
 * One job, and it is a live one: change a number here and the customer
 * app, the business app and the rider app all start using it inside a
 * minute. There is no staging copy and no publish step, so the screen
 * has to say that out loud before somebody types into a box.
 */
import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api';
import { naira } from '@/lib/money';
import FuelDriftBanner from '@/components/FuelDriftBanner';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm } from '@/components/ConfirmDialog';
import { isSuperAdminFromUser } from '@/lib/rbac';
import { getUser } from '@/lib/auth';
import { Save, X, History, Search, AlertCircle, CheckCircle2, Lock, SearchX, ChevronRight} from 'lucide-react';

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

/**
 * Real groups, replacing the database category (founder, 2026-08-28:
 * "driver level 1 to 10 could be collapable, and other things that need
 * their own categories").
 *
 * The stored category is too coarse to navigate. `driver_fee` alone held
 * 29 rows covering five unrelated subjects: what a rider is paid, the
 * ten value-level ceilings, how levels are earned, corridor matching,
 * and Travel Buddy timings. Corridor radius in metres is not a driver
 * fee, and hunting for it inside 29 rows is why this screen was hard to
 * use.
 *
 * Grouped by key, in the page, deliberately. Re-categorising properly
 * means adding values to a Postgres enum and migrating live rows, which
 * is not a thing to do to the table that holds every SEIRS price four
 * days before a pitch. The stored category is unchanged; only the
 * presentation is fixed.
 *
 * `collapsed` is the default state, not a restriction: the ten value
 * levels are a ladder somebody sets once and then scrolls past forever.
 */
interface FeeGroup {
  id: string;
  label: string;
  hint?: string;
  collapsed?: boolean;
  match: (key: string, category: string) => boolean;
}

const startsWith = (...prefixes: string[]) =>
  (k: string) => prefixes.some(p => k.startsWith(p));
const oneOf = (...keys: string[]) => (k: string) => keys.includes(k);

const FEE_GROUPS: FeeGroup[] = [
  { id: 'money-in', label: 'What SEIRS takes',
    hint: 'Commission and the processing costs that come off every booking.',
    match: (k, c) => c === 'commission' ||
      oneOf('card_processing_pct', 'nipost_postal_fund_pct', 'min_job_margin_ngn',
            'door_delivery_failure_pct')(k) },

  { id: 'customer', label: 'What a customer pays',
    hint: 'Booking fees, surcharges and the discounts that come off them.',
    match: (k, c) => c === 'customer_fee' || c === 'surge' || c === 'zone' || c === 'pool' ||
      oneOf('high_value_threshold_ngn', 'return_to_sender_fee')(k) },

  { id: 'driver-pay', label: 'What a rider is paid',
    hint: 'Payout floors, caps, the new-rider holdback and how long money is held.',
    match: (k) => oneOf(
      'driver_min_payout_ngn', 'driver_new_holdback_pct', 'driver_new_period_days',
      'driver_clearance_business_days', 'driver_daily_cap_ngn', 'driver_daily_cap_new_ngn',
      'driver_failed_trip_base_ngn')(k) },

  { id: 'driver-conduct', label: 'Rider reliability',
    hint: 'What happens when a rider cancels or turns work down.',
    match: (k) => oneOf('driver_cancel_free_per_day', 'driver_cancel_pause_hours',
                        'last_order_min_acceptance_pct')(k) },

  { id: 'driver-levels', label: 'Rider value levels', collapsed: true,
    hint: 'The ceiling on what each level may carry, and how a rider climbs. Set once, then rarely touched.',
    match: startsWith('driver_level_') },

  { id: 'matching', label: 'Matching and corridors',
    hint: 'How far SEIRS looks for a rider and how a corridor run is scored.',
    match: (k) => startsWith('corridor_')(k) ||
      oneOf('interstate_match_bonus', 'consolidated_dispatch_enabled', 'consolidated_floor_ngn',
            'trunk_assumed_parcels', 'pending_booking_expiry_minutes',
            'circuity_default_pct', 'circuity_min_pct', 'circuity_max_pct',
            'pricing_road_factor', 'routes_api_monthly_cap')(k) },

  { id: 'travel-buddy', label: 'Travel Buddy',
    hint: 'Seat bookings: how long an offer stands, what a no-show forfeits, when a seat is released.',
    match: startsWith('travel_buddy_') },

  { id: 'exception', label: 'When a delivery fails',
    hint: 'Storage, redirects, returns and the windows people are given to respond.',
    match: (k, c) => c === 'storage' ||
      oneOf('sender_response_window_minutes', 'admin_redirect_timeout_minutes',
            'perishable_max_hours', 'failed_delivery_redirect_fee',
            'cancel_processing_pct')(k) },

  { id: 'partner', label: 'Partner stores and counters',
    hint: 'What a counter is paid to hold a parcel, and what SEIRS keeps.',
    match: (k, c) => c === 'partner' },

  { id: 'loyalty', label: 'Loyalty and referrals',
    hint: 'Points, streaks and what a referral is worth. Customers hold points, never naira.',
    match: (k, c) => c === 'loyalty' },

  { id: 'fuel', label: 'Fuel reference',
    hint: 'Today\u2019s pump price. This prices NOTHING: quotes and rider reimbursement are built on the rate card above. These exist so the drift warning can tell you the card has fallen behind.',
    match: (k) => oneOf('current_petrol_price_ngn', 'current_diesel_price_ngn',
                        'fuel_reprice_trigger_pct')(k) },

  { id: 'future', label: 'Not launched yet', collapsed: true,
    hint: 'Set up in advance and read by nothing today. They stay because the value is a decision already made, not because anything uses it.',
    match: (k, c) => c === 'dev_platform' || c === 'subscription' || c === 'financial' ||
      oneOf('partner_sponsored_placement', 'insurance_referral_commission')(k) },
];

// Kept for the fallback path below: anything a group does not claim is
// still shown, under its stored category, rather than vanishing.
const CATEGORY_ORDER = [
  'commission', 'customer_fee', 'driver_fee', 'partner', 'loyalty',
  'storage', 'surge', 'pool', 'zone', 'subscription', 'financial',
  'dev_platform', 'config',
];

/**
 * What the number in the box actually means, in words.
 *
 * The drawer labelled the field "Value . flat ngn" and "Value . per km",
 * which are column values from the database. Somebody deciding whether
 * to type 15 or 0.15 needs the sentence, not the slug.
 */
const UNIT_LABEL: Record<string, string> = {
  flat_ngn:    'a fixed amount in naira',
  percent:     'a percentage (type 15 for 15%)',
  per_km:      'naira for every kilometre',
  per_day:     'naira per day',
  per_week:    'naira per week',
  per_month:   'naira per month',
  minutes:     'a number of minutes',
  hours:       'a number of hours',
  days:        'a number of days',
  count:       'a plain count',
  hour_of_day: 'an hour of the day, 0 to 23, Nigerian time',
};

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

export function FeeCataloguePanel() {
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

  const confirm = useConfirm();

  // PATCH /fees/:key is super-admin only, but the nav grants this page to
  // ops_manager and finance_officer. They could open any fee, edit it,
  // hit an always-enabled Save and collect a 403 alert. Read-only for
  // them now, and the drawer says so before they start typing.
  const canEdit = isSuperAdminFromUser(getUser());
  /**
   * Which groups are folded shut. Undefined means "use the group's own
   * default", so the ten value levels start closed without pinning every
   * other group open forever.
   */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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

  // Group + filter for rendering. matchCount is kept because a search
  // that matched nothing used to render an empty page with no message:
  // every category simply dropped out of the map and the admin was left
  // looking at a search box above white space.
  const { grouped, matchCount } = useMemo(() => {
    const filter = search.trim().toLowerCase();
    const visible = filter
      ? fees.filter(f =>
          f.name.toLowerCase().includes(filter) ||
          f.key.toLowerCase().includes(filter) ||
          f.description.toLowerCase().includes(filter),
        )
      : fees;
    const byCat: Record<string, Fee[]> = {};
    /* Group by the FEE_GROUPS map first; anything unclaimed falls back to
       its stored category so a row the backend adds can never disappear. */
    for (const f of visible) {
      const g = FEE_GROUPS.find(grp => grp.match(f.key, f.category));
      (byCat[g ? g.id : `cat:${f.category}`] ??= []).push(f);
    }
    return { grouped: byCat, matchCount: visible.length };
  }, [fees, search]);

  const openEditor = async (fee: Fee) => {
    setError(null);
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
    setError(null);
    setEditing(null);
    setNewValue('');
    setNewNote('');
    setHistory([]);
  };

  /**
   * Saving is the whole point of the page and it was one unguarded
   * click. A mistyped decimal here is a mistyped price in three phone
   * apps a minute later, charged to real customers, with nothing on the
   * screen having said so. The dialog states the before and the after,
   * who it reaches, and that putting the old number back is the way to
   * undo it (the history log keeps what it was).
   */
  const handleSave = async () => {
    if (!editing) return;
    const numericValue = Number(newValue);
    if (newValue.trim() === '' || !Number.isFinite(numericValue)) {
      setError(`"${newValue}" is not a number. Type digits only, for example 1500 or 12.5.`);
      return;
    }

    const valueChanged  = Number(editing.value) !== numericValue;
    const activeChanged = editing.active !== newActive;
    if (!valueChanged && !activeChanged && !newNote.trim()) {
      setError('Nothing has changed, so there is nothing to save.');
      return;
    }

    const lines: string[] = [];
    if (valueChanged) {
      lines.push(`${editing.name} changes from ${formatValue(Number(editing.value), editing.unit)} to ${formatValue(numericValue, editing.unit)}.`);
    }
    if (activeChanged) {
      lines.push(newActive
        ? `${editing.name} starts being applied again.`
        : `${editing.name} stops being applied at all: it is charged as zero until somebody switches it back on.`);
    }
    lines.push('Every new booking made from about a minute after you save uses this, in the customer app, the business app and the rider app. Jobs already priced and paid for are not touched.');
    lines.push('To undo it, set the old number back here: the change history keeps what it was and your name against both changes.');

    const ok = await confirm({
      title:        'Change what SEIRS charges?',
      message:      lines.join('\n\n'),
      confirmLabel: 'Save and go live',
      danger:       true,
    });
    if (!ok) return;

    setSaving(true);
    setError(null);
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
      // A browser alert can be suppressed after the first one, which on
      // this page would read as "the new price saved" when it did not.
      setError(`The price was NOT changed: ${err?.message ?? 'the server refused the request'}. It is still ${formatValue(Number(editing.value), editing.unit)}.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* The fuel rows live on this page, so the warning about them does too. */}
      <FuelDriftBanner />

      {/*
        The old header said "single source of truth ... changes propagate
        live within 60s", which is engineer's English for the one thing
        the reader must understand: type here and real customers are
        charged differently a minute later.
      */}
      <PageIntro
        title="Fee catalogue"
        purpose="Every price SEIRS charges a customer or pays a rider, in one list. Changing a number here changes what real people are charged, in all three apps, within about a minute."
        storageKey="fees"
        help={
          <>
            <p><b>There is no draft and no publish step.</b> Save is live. Bookings made after you save use the new number; anything already paid for keeps the price it was quoted.</p>
            <p><b>Off is not deleted.</b> Switching a fee off makes it zero for every new booking and leaves the row here so it can be switched back on.</p>
            <p><b>To undo, put the old number back.</b> Every change is kept with your name and the note you leave, in the history at the bottom of the drawer.</p>
            <p>Only a Super Admin can save. Everyone else can read every value and its history.</p>
          </>
        }
        actions={
          <div className="flex items-center gap-3 text-sm text-gray-500">
            {!canEdit && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                <Lock size={11} /> You can read this, not change it
              </span>
            )}
            <span>{fees.length} priced items, {fees.filter(f => f.active).length} switched on</span>
          </div>
        }
      />

      {/* A 403 or a cold Railway boot used to render as "No fees
          configured yet", which reads as a bad seed, not a bad request.
          Hidden while the drawer is open, because the drawer's overlay
          covers this strip: a failed save is reported inside the drawer
          instead, where the admin is actually looking. */}
      {error && !editing && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={load} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Search. Every fee is loaded in one request, so this really does
          search all of them, and the count says how many it found. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Find a fee by what it is called or what it does…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:border-[#3A7BD5]"
          />
        </div>
        {search.trim() && (
          <span className="text-xs text-gray-500">
            {matchCount} of {fees.length} match &quot;{search.trim()}&quot;
          </span>
        )}
        {search.trim() && (
          <button onClick={() => setSearch('')} className="text-xs font-semibold text-[#3A7BD5] hover:underline">
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading the fee catalogue…</div>
      ) : fees.length === 0 && !error ? (
        /* "backend seed should have run on first deploy" is a sentence
           for the person who wrote it, not the person reading it. */
        <div className="bg-white rounded-xl border border-[#E5E7EB]">
          <EmptyState
            icon={<AlertCircle size={20} />}
            title="No prices are set up at all"
            body="This is not normal: SEIRS cannot price a delivery without these. Report it to engineering rather than trying to add them here."
            action={{ label: 'Try loading again', onClick: load }}
          />
        </div>
      ) : matchCount === 0 ? (
        <div className="bg-white rounded-xl border border-[#E5E7EB]">
          <EmptyState
            icon={<SearchX size={20} />}
            title={`Nothing matches "${search.trim()}"`}
            body="Try a shorter word, or part of what the fee does rather than its exact name."
            action={{ label: 'Clear the search', onClick: () => setSearch('') }}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Anything the backend adds that CATEGORY_ORDER has not heard of
              used to vanish silently. Known categories keep their order,
              unknown ones fall in at the end rather than disappearing. */}
          {[...FEE_GROUPS.map(g => g.id),
            ...Object.keys(grouped).filter(c => c.startsWith('cat:')).sort()]
            .filter(id => grouped[id]?.length).map(id => {
            const g       = FEE_GROUPS.find(x => x.id === id);
            const label   = g?.label ?? (CATEGORY_LABEL[id.replace('cat:', '')] ?? id.replace('cat:', ''));
            /* A search should open what it matched: collapsing a group the
               operator is actively looking inside would be perverse. */
            const isOpen  = collapsed[id] === undefined
              ? !(g?.collapsed && !search.trim())
              : !collapsed[id];
            return (
            <section key={id}>
              <button
                onClick={() => setCollapsed(m => ({ ...m, [id]: isOpen }))}
                className="mb-2 flex w-full items-baseline gap-2 px-1 text-left"
              >
                <ChevronRight
                  size={13}
                  className={`shrink-0 self-center text-[#0F2B4C]/40 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                />
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#0F2B4C]/60">
                  {label}
                </h2>
                <span className="text-[11px] text-[#0F2B4C]/35">{grouped[id].length}</span>
                {g?.hint && (
                  <span className="ml-2 hidden truncate text-[11px] font-normal normal-case text-[#0F2B4C]/40 sm:inline">
                    {g.hint}
                  </span>
                )}
              </button>
              {isOpen && (
              <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
                {grouped[id].map(fee => (
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
                      {/* The bare slug sat under every row unexplained.
                          It is worth keeping (it is what engineering and
                          the specs call this fee) but it now says so. */}
                      <p
                        className="text-[10px] text-gray-400 mt-1 font-mono"
                        title="The name the apps and the specs use for this fee. Useful when reporting a problem."
                      >
                        {fee.key}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-base font-bold tabular-nums ${fee.active ? 'text-[#0F2B4C]' : 'text-gray-400 line-through'}`}>
                        {formatValue(Number(fee.value), fee.unit)}
                      </div>
                      {/* When a price last moved is the first thing asked
                          when something looks wrong on a receipt, and the
                          date was in the payload and drawn nowhere. */}
                      {fee.lastUpdatedByName && (
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          last changed by {fee.lastUpdatedByName}
                          {fee.updatedAt ? ` on ${new Date(fee.updatedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              )}
            </section>
            );
          })}
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
                  What it costs: {UNIT_LABEL[editing.unit] ?? editing.unit.replace(/_/g, ' ')}
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
                  <p className="text-sm font-semibold text-[#0F2B4C]">Charge this at all</p>
                  {/* "Active / disable" left it open whether switching it
                      off deletes the row or refunds anybody. Neither. */}
                  <p className="text-xs text-gray-500">
                    Switch off and this becomes zero on every new booking. The row and its history stay here, so it can be switched back on.
                  </p>
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
                  Only other admins see this. It is kept forever, next to your name and the time, and is what the next person reads when they ask why the price moved.
                </p>
              </div>

              {/* A save that was refused has to be visible where the
                  admin pressed Save, not on the page behind the overlay. */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-600" />
                  <p className="text-xs text-red-800">{error}</p>
                </div>
              )}

              {/* The before-and-after used to sit UNDER the Save button,
                  which is the one place an admin has already stopped
                  reading by the time it matters. */}
              {canEdit && Number(editing.value) !== Number(newValue) && (
                <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertCircle size={14} className="text-yellow-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-900">
                    You are changing this from <strong>{formatValue(Number(editing.value), editing.unit)}</strong> to{' '}
                    <strong>{formatValue(Number(newValue) || 0, editing.unit)}</strong>. Every booking made about a minute
                    after you save is priced the new way, in all three apps. Jobs already paid for keep the old price.
                  </p>
                </div>
              )}

              {canEdit && editing.active !== newActive && (
                <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertCircle size={14} className="text-yellow-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-900">
                    {newActive
                      ? <>You are switching <strong>{editing.name}</strong> back on. It starts being charged again.</>
                      : <>You are switching <strong>{editing.name}</strong> off. It is charged as nothing until somebody turns it back on.</>}
                  </p>
                </div>
              )}

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
                  {saving ? 'Saving…' : 'Save and make it live'}
                </button>
              ) : (
                <div className="flex items-start gap-2 p-3 bg-gray-50 border border-[#E5E7EB] rounded-lg">
                  <Lock size={14} className="text-gray-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-600">
                    Only a Super Admin can change a price. You can read the current value and the full history of who changed it and why.
                  </p>
                </div>
              )}

              {/* History */}
              <div className="pt-4 border-t border-[#E5E7EB]">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/70 mb-2">
                  <History size={12} /> Change history
                </h3>
                {history.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">
                    Nobody has ever changed this. It is still the value SEIRS launched with.
                  </p>
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
