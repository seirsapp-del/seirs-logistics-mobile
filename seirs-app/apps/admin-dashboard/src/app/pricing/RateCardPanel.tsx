/**
 * Admin · Pricing. RateCard editor.
 *
 * Loads the currently-active RateCard from /config/rate-card, lets the
 * admin edit every numeric field, then publishes a new version via
 * PUT /admin/rate-card. Each publish increments version, deactivates
 * the previous active row, and stamps `activatedBy` + `activatedAt` +
 * `changeReason` for the audit trail.
 *
 * UI pattern: nested cards per system area (fuel, vehicles, dwell,
 * surcharges, discounts, fees, partner store). Each editable input has
 * a "what is this for?" hover hint so non-engineer admin staff can
 * change rates safely.
 *
 * Inflation shortcut: bumps every labour_per_km + base fare by +X%
 * with a confirm. Useful when Nigerian inflation requires a
 * platform-wide tune-up.
 */
'use client';
import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Save, RefreshCw, AlertCircle, History, TrendingUp, Loader2, Plus, Trash2, CheckCircle2, PencilLine } from 'lucide-react';
import {
  NIGERIAN_STATES,
  GEOPOLITICAL_ZONES,
  statesInZone,
  newSubZoneId,
  type GeopoliticalZone,
  type StateCode,
} from '@/lib/nigerianStates';
import { useConfirm } from '@/components/ConfirmDialog';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';

const VEHICLE_ORDER = ['bicycle', 'motorcycle', 'tricycle', 'car', 'van', 'truck_small', 'truck_large'] as const;
const VEHICLE_LABEL: Record<string, string> = {
  bicycle: 'Bicycle', motorcycle: 'Motorcycle', tricycle: 'Tricycle',
  car: 'Car', van: 'Van', truck_small: 'Small Truck', truck_large: 'Large Truck',
};

const ZONE_ORDER: GeopoliticalZone[] = ['NW', 'NE', 'NC', 'SW', 'SE', 'SS'];

// Shape of a manually-added restricted sub-zone row.
interface SubZone {
  id:           string;
  name:         string;
  stateCode:    StateCode | '';
  surchargePct: number;
  reason:       string;
  active:       boolean;
}

type RateCard = any;

/**
 * How many individual numbers the admin has actually changed.
 *
 * This screen is a draft editor pretending to be a settings page: typing
 * in a box changes nothing anybody is charged until Publish is pressed,
 * and until now the screen looked identical either way. An admin who
 * edited nine fields, got called away and came back to a reloaded tab
 * lost all nine with no warning, and an admin who edited one field and
 * walked off believed the price had changed when it had not.
 */
function countChanges(before: any, after: any, path = ''): string[] {
  if (before === after) return [];
  const isObj = (v: any) => v && typeof v === 'object';
  if (!isObj(before) || !isObj(after)) {
    return String(before ?? '') === String(after ?? '') ? [] : [path];
  }
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out: string[] = [];
  for (const k of keys) {
    // Server-set bookkeeping. Not something an admin edited.
    if (['id', 'version', 'isActive', 'activatedAt', 'activatedBy', 'deactivatedAt', 'createdAt', 'changeReason'].includes(k)) continue;
    out.push(...countChanges(before?.[k], after?.[k], path ? `${path}.${k}` : k));
  }
  return out;
}

/** Turn a dot-path into something an ops person can read. */
const SECTION_NAMES: Record<string, string> = {
  fuelPrices:     'Fuel prices',
  insurance:      'Goods-in-transit insurance',
  vehicleRates:   'Per-vehicle delivery rates',
  rideRates:      'Ride rates',
  serviceFees:    'Service fee',
  highValue:      'High-value premium',
  stopAndDwell:   'Multi-stop and waiting',
  weightTiers:    'Weight tiers',
  dwellBuffers:   'Waiting-time buffers',
  timeSurcharges: 'Night, peak and weekend surcharges',
  zoneSurcharges: 'Distance and zone surcharges',
  discounts:      'Discounts',
  feeRules:       'Cancellation, waiting and return fees',
  partnerStore:   'Partner store economics',
  vatRate:        'VAT',
};

export function RateCardPanel() {
  const confirm               = useConfirm();
  const [card, setCard]       = useState<RateCard | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [changeReason, setChangeReason] = useState('');
  // The card exactly as the server sent it, so the screen can tell the
  // admin what they have changed and what is still only a draft.
  const [published, setPublished] = useState<RateCard | null>(null);

  // Reload + initial fetch
  const reload = async () => {
    setLoading(true);
    try {
      const [active, hist] = await Promise.all([
        adminApi.rateCard.getActive(),
        adminApi.rateCard.history().catch(() => []),
      ]);
      setCard(active);
      setPublished(structuredClone(active));
      setHistory(hist);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load rate card');
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const changedPaths = useMemo(
    () => (card && published ? countChanges(published, card) : []),
    [card, published],
  );
  const dirty = changedPaths.length > 0;

  // The sections touched, in words, for the banner and the confirm.
  const changedSections = useMemo(() => {
    const set = new Set<string>();
    for (const p of changedPaths) {
      const head = p.split('.')[0];
      set.add(SECTION_NAMES[head] ?? head);
    }
    return [...set];
  }, [changedPaths]);

  /**
   * Closing the tab mid-edit used to throw the work away in silence.
   * Prices are typed in from a spreadsheet, one section at a time, so
   * losing a half-finished card costs somebody their afternoon.
   */
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Generic patch helper. keeps nested keys editable via dot-path.
  // Auto-creates intermediate objects so new sections (regions, etc.) work
  // even when the loaded RateCard doesn't yet contain them.
  const patchPath = (path: string, value: any) => {
    setCard((prev: any) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const keys = path.split('.');
      let cur: any = next;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
        cur = cur[k];
      }
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const publish = async () => {
    if (!card) return;
    if (!changeReason.trim()) {
      setError('Say what you changed and why before publishing. The next person to open this page reads that line to understand why prices moved.');
      return;
    }
    if (!dirty) {
      setError('Nothing on this page differs from the version already live, so there is nothing to publish.');
      return;
    }

    /**
     * Publishing re-prices the whole country. It was a single click with
     * no summary of what was about to change, on a page with roughly two
     * hundred editable numbers on it.
     */
    const ok = await confirm({
      title:        `Change prices for every new booking?`,
      message:      [
        `${changedPaths.length} value${changedPaths.length === 1 ? '' : 's'} changed, in: ${changedSections.join(', ')}.`,
        'Every quote given from about five minutes after you publish uses these numbers, in the customer app, the business app and the driver app. Deliveries already booked and paid for keep the price they were quoted.',
        'There is no undo button. The version live now is kept in the history below, but putting it back means typing the old numbers in again, so check the figures before you publish.',
      ].join('\n\n'),
      confirmLabel: 'Publish and go live',
      danger:       true,
    });
    if (!ok) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      // Strip the snapshot id/version so the backend generates new ones.
      // activatedBy is stripped too: it would otherwise carry the previous
      // version's value straight onto the new one.
      const { id: _id, version: _v, isActive: _a, activatedAt: _aa,
        deactivatedAt: _da, createdAt: _ca, activatedBy: _ab, ...payload } = card;
      const result = await adminApi.rateCard.publish({
        ...payload,
        changeReason: changeReason.trim(),
        // activatedBy used to be the literal string 'admin', so the
        // History "By" column said 'admin' for every version and pricing
        // changes were unattributable. Dropped: the authoritative fix is
        // the controller setting it from @CurrentUser(), the way syncFuel
        // already does. Until that lands the column reads "-", which is
        // honest, where 'admin' was not.
      });
      setSuccess(`Published version ${result?.version ?? '?'}.`);
      setChangeReason('');
      await reload();
    } catch (e: any) {
      setError(e?.message ?? 'Could not publish rate card');
    } finally { setSaving(false); }
  };

  const inflationBump = async (pct: number) => {
    if (!card) return;
    const ok = await confirm({
      title:        `Raise every vehicle rate by ${pct}%?`,
      message:      `Each vehicle's base fare and per-kilometre labour rate, on both the customer side and the driver side, is multiplied by ${(1 + pct / 100).toFixed(2)}. Fuel is not touched: that is worked out from the pump prices at the top of the page.

Nothing goes live yet. It fills the boxes on this page so you can check them, and you still have to press Publish.`,
      confirmLabel: `Raise everything ${pct}%`,
      danger:       true,
    });
    if (!ok) return;
    const factor = 1 + pct / 100;
    const next = structuredClone(card);
    for (const v of Object.keys(next.vehicleRates)) {
      next.vehicleRates[v].baseFareCustomer    = round2(next.vehicleRates[v].baseFareCustomer    * factor);
      next.vehicleRates[v].baseFareDriver      = round2(next.vehicleRates[v].baseFareDriver      * factor);
      next.vehicleRates[v].labourPerKmCustomer = round2(next.vehicleRates[v].labourPerKmCustomer * factor);
      next.vehicleRates[v].labourPerKmDriver   = round2(next.vehicleRates[v].labourPerKmDriver   * factor);
    }
    setCard(next);
    if (!changeReason.trim()) setChangeReason(`Inflation adjustment: +${pct}% on labour + base`);
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading rate card…
      </div>
    );
  }

  if (!card) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="rounded-xl border border-red-200 bg-red-50">
          <EmptyState
            icon={<AlertCircle size={20} />}
            title="The price list would not load"
            body={`${error ?? 'The server did not answer.'} Nothing is broken for customers: the apps keep using the version they already have. Try again, and tell engineering if it keeps failing.`}
            action={{ label: 'Try again', onClick: reload }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto pb-32 space-y-6">

      {/*
        Everything on this page is a draft until Publish. The old header
        gave the version number and left the rest to be inferred, which
        is how an admin ends up believing a price changed because they
        typed it into a box.
      */}
      <PageIntro
        title="Pricing engine"
        purpose="The numbers SEIRS uses to work out what every delivery and every ride costs. Nothing you type here reaches a customer until you publish it."
        storageKey="pricing"
        help={
          <>
            <p><b>Typing changes nothing.</b> The whole page is a draft. Press <b>Publish new version</b> at the bottom and the three apps pick the new prices up within about five minutes.</p>
            <p><b>Already-booked jobs are safe.</b> A delivery keeps the price it was quoted. Only new quotes use the new numbers.</p>
            <p><b>There is no undo.</b> Old versions are kept for reading in History, but going back means typing the old numbers in again.</p>
            <p>Fixed fees (commission, subscriptions, storage) live in the <a className="font-semibold text-[#3A7BD5] hover:underline" href="/fees">Fee catalogue</a>. Whether SEIRS operates in an area at all lives in <a className="font-semibold text-[#3A7BD5] hover:underline" href="/zones">Zones</a>.</p>
          </>
        }
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-gray-50"
            >
              <History className="w-4 h-4" /> Past versions ({history.length})
            </button>
            <button
              onClick={() => inflationBump(5)}
              title="Fills every vehicle rate box with a figure 5% higher. Still needs publishing."
              className="px-3 py-2 bg-amber-100 border border-amber-300 text-amber-900 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-amber-200"
            >
              <TrendingUp className="w-4 h-4" /> Raise all rates 5%
            </button>
          </div>
        }
      />

      <p className="-mt-2 text-sm text-gray-500">
        Live now: version <b>{card.version}</b>, published{' '}
        {card.activatedAt ? new Date(card.activatedAt).toLocaleString('en-NG') : 'at an unrecorded time'}.
      </p>

      {/* Unpublished-work warning. Without it the page looks identical
          whether or not the admin has edited anything. */}
      {dirty && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          <PencilLine size={16} className="shrink-0" />
          <span className="flex-1">
            <b>{changedPaths.length} value{changedPaths.length === 1 ? '' : 's'} changed and not published yet</b>
            {' '}({changedSections.join(', ')}). Customers are still being charged the old prices until you publish.
          </span>
          <button
            onClick={async () => {
              const ok = await confirm({
                title:        'Throw away your changes?',
                message:      `The ${changedPaths.length} value${changedPaths.length === 1 ? '' : 's'} you have edited go back to what is live now. This cannot be undone.`,
                confirmLabel: 'Throw them away',
                danger:       true,
              });
              if (ok && published) { setCard(structuredClone(published)); setChangeReason(''); }
            }}
            className="shrink-0 font-semibold underline hover:no-underline"
          >
            Undo my changes
          </button>
        </div>
      )}

      {/* Alerts */}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <CheckCircle2 size={16} /> {success}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* History panel. It used to render nothing at all when there was
          no history, so the button looked broken on a fresh install. */}
      {showHistory && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="font-semibold text-gray-900">Price lists SEIRS has used</h3>
            <span className="text-xs text-gray-500">
              {history.length === 0
                ? 'Nothing published yet'
                : `Showing the ${Math.min(10, history.length)} most recent of ${history.length}`}
            </span>
          </div>
          {history.length === 0 ? (
            <EmptyState
              icon={<History size={20} />}
              title="This is the first price list"
              body="Nobody has published a change yet. Once somebody does, every version stays here with who published it and why."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-200 text-left">
                  <th className="py-2">Version</th><th>Live now</th><th>Published</th><th>By</th><th>What changed and why</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 10).map((h: any) => (
                  <tr key={h.id} className="border-b border-gray-100">
                    <td className="py-2 font-mono">v{h.version}</td>
                    <td>{h.isActive ? <span className="text-green-700 font-bold">Yes</span> : ''}</td>
                    <td>{h.activatedAt ? new Date(h.activatedAt).toLocaleString('en-NG') : '-'}</td>
                    {/* activatedBy is not filled in by the server yet, so
                        this reads "not recorded" rather than a bare dash
                        that looks like a rendering fault. */}
                    <td className={h.activatedBy ? '' : 'text-gray-400'}>{h.activatedBy ?? 'not recorded'}</td>
                    <td className="text-gray-600">{h.changeReason ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Fuel prices ───────────────────────────────────────────── */}
      {/*
        WHY THERE ARE TWO FUEL PRICES, and why neither is a duplicate
        (founder, 2026-08-28: "we have 2 fuel prices thats not okay").

        THIS one is what the published rates were BUILT ON. fuelPerKm
        reads it on every quote, so it is the number that decides what a
        customer pays and what a rider is reimbursed.

        The Fee Catalogue's current_petrol_price_ngn is what fuel COSTS
        AT THE PUMP TODAY. It prices nothing. It exists to answer "has
        the published card fallen behind", which is the drift warning,
        and to be copied in here in one action when it has.

        The code carries a comment saying this was briefly wired the
        other way round, and that doing so "split the truth in two: the
        admin pricing page showed one fuel price while reimbursement used
        another, so editing the visible one did nothing". So the two
        stay, and the labels now say which is which.
      */}
      <Card title="Fuel prices the rates are built on" hint="What every quote and every driver reimbursement is calculated from. Changing it recomputes all vehicle km rates, and takes effect when you publish. Today's actual pump price is a separate reference in the fee catalogue below; the drift banner compares the two and tells you when to copy it up.">
        <Row>
          <FieldNumber
            label="Petrol (PMS) ₦ per litre"
            value={card.fuelPrices.petrolPerLitreNgn}
            onChange={(v) => patchPath('fuelPrices.petrolPerLitreNgn', v)}
            hint="Used for motorcycle, tricycle, car, van."
          />
          <FieldNumber
            label="Diesel (AGO) ₦ per litre"
            value={card.fuelPrices.dieselPerLitreNgn}
            onChange={(v) => patchPath('fuelPrices.dieselPerLitreNgn', v)}
            hint="Used for small + large trucks."
          />
        </Row>
      </Card>

      {/* ── Insurance ─────────────────────────────────────────────── */}
      <Card
        title="Goods-in-transit insurance"
        hint="NOT BUILT YET. These fields save and publish, but no code reads them, so nothing is charged and no cover exists whatever you set here."
      >
        {/*
          The panel warned about the business risk of enabling insurance
          without an underwriter, and said nothing about the technical
          one: the pricing engine does not read card.insurance at all
          (audit, 2026-08-28). The steps below ended "Tick Enabled last,
          then Publish", which reads as though that switches it on.

          It does not. Enabling is currently safe in the only direction
          that matters for customers, since no premium is collected and
          no promise reaches the app. It is dangerous in the other
          direction: the founder could believe SEIRS carries goods-in-
          transit cover and say so to a customer or an investor.

          The fields stay editable, per the standing rule that a value
          set in advance is a decision already made. What changes is that
          the screen no longer implies the switch is live.
        */}
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-900">
          <p className="font-semibold">Nothing here is wired up yet.</p>
          <p className="mt-1">
            These five fields save and publish like any other, but no part of SEIRS reads
            them. Ticking <b>Enabled</b> does not start charging a premium and does not create
            any cover. Until the premium is actually implemented, treat this section as a
            place to record the terms you have agreed, not as a switch. Ask for it to be
            built when you have an underwriter.
          </p>
        </div>
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          <p className="font-semibold">When a partner is signed, and once this is built, set it up in this order:</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4">
            <li>Set <b>Premium</b> to the underwriter&apos;s rate on declared value.</li>
            <li>Set <b>Minimum premium</b> to the floor they charge per parcel.</li>
            <li>Set <b>Offer cover above</b> to the declared value where cover starts being worth collecting.</li>
            <li>Set <b>Maximum payout</b> to what the policy actually pays. Never leave this at zero once enabled, or the app offers cover with no stated limit.</li>
            <li>Tick <b>Enabled</b> last, then <b>Publish</b>. That step does nothing today.</li>
          </ol>
          <p className="mt-2">
            Do not enable this before a policy exists. Charging a premium with no underwriter
            behind it sells a promise the company cannot keep. Your commission on referred
            policies is a separate Fee Catalogue row, <b>insurance_referral_commission</b>.
          </p>
        </div>
        <Row>
          <label className="flex items-center gap-2 text-sm text-[#0F2B4C]">
            <input
              type="checkbox"
              checked={Boolean(card.insurance?.enabled)}
              onChange={(e) => patchPath('insurance.enabled', e.target.checked as any)}
              className="h-4 w-4 rounded border-[#0F2B4C]/30"
            />
            <span>Enabled <span className="text-[#0F2B4C]/50">(leave off until an underwriter is signed)</span></span>
          </label>
        </Row>
        <Row>
          <FieldNumber
            label="Premium % of declared value"
            value={card.insurance?.premiumPct ?? 0}
            onChange={(v) => patchPath('insurance.premiumPct', v)}
            hint="Enter as a percentage, e.g. 2 for 2%. Leave 0 while unset."
          />
          <FieldNumber
            label="Minimum premium ₦"
            value={card.insurance?.minPremiumNgn ?? 0}
            onChange={(v) => patchPath('insurance.minPremiumNgn', v)}
            hint="Floor charged per parcel."
          />
        </Row>
        <Row>
          <FieldNumber
            label="Offer cover above declared value ₦"
            value={card.insurance?.declaredValueThresholdNgn ?? 0}
            onChange={(v) => patchPath('insurance.declaredValueThresholdNgn', v)}
            hint="Below this, cover is not offered."
          />
          <FieldNumber
            label="Maximum payout ₦"
            value={card.insurance?.maxCoverageNgn ?? 0}
            onChange={(v) => patchPath('insurance.maxCoverageNgn', v)}
            hint="What the policy actually pays. Must not stay 0 once enabled."
          />
        </Row>
      </Card>

      {/* ── Per-vehicle rates ─────────────────────────────────────── */}
      <Card title="Per-vehicle rates" hint="Base fare (connection fee) + labour per km. Fuel is added on top automatically using the prices above.">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left border-b border-gray-200">
              <th className="py-2 pr-3">Vehicle</th>
              <th className="px-2">Base ₦ (cust)</th>
              <th className="px-2">Base ₦ (driver)</th>
              <th className="px-2">Labour ₦/km (cust)</th>
              <th className="px-2">Labour ₦/km (driver)</th>
              <th className="px-2">km/L</th>
              <th className="px-2">Fuel</th>
              <th className="px-2">Max kg</th>
              <th className="px-2" title="Longest trip this vehicle class is offered for. Blank or 0 = no cap. The Send screens read this live (bicycle ships with 3).">Max km</th>
            </tr>
          </thead>
          <tbody>
            {VEHICLE_ORDER.map((v) => {
              const r = card.vehicleRates[v];
              if (!r) return null;
              return (
                <tr key={v} className="border-b border-gray-100">
                  <td className="py-2 pr-3 font-medium text-gray-900">{VEHICLE_LABEL[v]}</td>
                  <td className="px-1"><InlineNum value={r.baseFareCustomer}    onChange={(n) => patchPath(`vehicleRates.${v}.baseFareCustomer`, n)} /></td>
                  <td className="px-1"><InlineNum value={r.baseFareDriver}      onChange={(n) => patchPath(`vehicleRates.${v}.baseFareDriver`, n)} /></td>
                  <td className="px-1"><InlineNum value={r.labourPerKmCustomer} onChange={(n) => patchPath(`vehicleRates.${v}.labourPerKmCustomer`, n)} /></td>
                  <td className="px-1"><InlineNum value={r.labourPerKmDriver}   onChange={(n) => patchPath(`vehicleRates.${v}.labourPerKmDriver`, n)} /></td>
                  <td className="px-1"><InlineNum value={r.kmPerLitre}          onChange={(n) => patchPath(`vehicleRates.${v}.kmPerLitre`, n)} /></td>
                  <td className="px-1 text-xs text-gray-500">{r.fuelType}</td>
                  <td className="px-1"><InlineNum value={r.maxPayloadKg}        onChange={(n) => patchPath(`vehicleRates.${v}.maxPayloadKg`, n)} /></td>
                  <td className="px-1"><InlineNum value={r.maxRouteKm ?? 0}     onChange={(n) => patchPath(`vehicleRates.${v}.maxRouteKm`, n)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* ── Ride rates (Book a Ride rebuild 2026-08-23) ──────────── */}
      <Card
        title="Ride rates"
        hint="Passenger trips: base + labour per km, customer and driver sides, fuel passed through at pump price / km-per-litre. Okada = motorcycle, Keke = tricycle, Danfo = van. Time surcharges, hotspot circles and the ride service fee apply on top."
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left border-b border-gray-200">
              <th className="py-2 pr-3">Vehicle</th>
              <th className="px-2">Base ₦ (cust)</th>
              <th className="px-2">₦/km (cust)</th>
              <th className="px-2">Base ₦ (driver)</th>
              <th className="px-2">₦/km (driver)</th>
              <th className="px-2">km/L</th>
            </tr>
          </thead>
          <tbody>
            {[['motorcycle','Okada'],['tricycle','Keke'],['car','Car'],['van','Danfo / Bus']].map(([v, label]) => {
              const r = card.rideRates?.[v] ?? {};
              return (
                <tr key={v} className="border-b border-gray-100">
                  <td className="py-2 pr-3 font-medium text-gray-900">{label}</td>
                  <td className="px-1"><InlineNum value={r.baseFareCustomer ?? 0}    onChange={(n) => patchPath(`rideRates.${v}.baseFareCustomer`, n)} /></td>
                  <td className="px-1"><InlineNum value={r.labourPerKmCustomer ?? 0} onChange={(n) => patchPath(`rideRates.${v}.labourPerKmCustomer`, n)} /></td>
                  <td className="px-1"><InlineNum value={r.baseFareDriver ?? 0}      onChange={(n) => patchPath(`rideRates.${v}.baseFareDriver`, n)} /></td>
                  <td className="px-1"><InlineNum value={r.labourPerKmDriver ?? 0}   onChange={(n) => patchPath(`rideRates.${v}.labourPerKmDriver`, n)} /></td>
                  <td className="px-1"><InlineNum value={r.kmPerLitre ?? 0}          onChange={(n) => patchPath(`rideRates.${v}.kmPerLitre`, n)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* ── Service fee ───────────────────────────────────────────── */}
      {/*
        RESTORED 2026-08-28, an hour after I wrongly replaced it.
        These fees ARE read by the engine. I removed the editor after a
        search for `card.serviceFees` found nothing, because the three
        real reads are written `(card as any).serviceFees?.rideNgn`, and
        the cast plus the optional chain defeated the pattern. They are
        at pricing.service lines 823 and 887 for rides and 1238 for
        packages, and they land in vatBase, so this fee reaches every
        customer bill.
      */}
      <Card title="Service fee">
        <Row>
          <FieldNumber label="Package service fee ₦"
            value={card.serviceFees?.packageNgn ?? 0}
            onChange={(v) => patchPath('serviceFees.packageNgn', v)}
            hint="Flat platform fee on every package booking. Charged after discounts (promotions cannot erode it) and before VAT. 0 = no fee." />
          <FieldNumber label="Ride service fee ₦"
            value={card.serviceFees?.rideNgn ?? 0}
            onChange={(v) => patchPath('serviceFees.rideNgn', v)}
            hint="The same fee on a ride booking. Read by the ride pricing path." />
        </Row>
      </Card>

      {/*
        RESTORED 2026-08-28, wrongly replaced the same hour and for the
        same reason: the engine reads it as `(card as any).highValue`, at
        pricing.service line 1269, which my search for `card.highValue`
        could not see. The premium is charged in the engine so the quote
        and the booking always agree.

        The Fee Catalogue's high_value_threshold_ngn is a DIFFERENT
        thing: it gates the handoff-signature requirement in deliveries.
        Two thresholds, two jobs, and neither replaces the other.
      */}
      <Card title="High-value premium">
        <Row>
          <FieldNumber label="Threshold ₦ (declared value)"
            value={card.highValue?.thresholdNgn ?? 50000}
            onChange={(v) => patchPath('highValue.thresholdNgn', v)}
            hint="Premium applies to the declared value ABOVE this. Over-declaring costs the premium, under-declaring caps the payout via the liability matrix." />
          <FieldNumber label="Premium % of excess value"
            value={card.highValue?.premiumPct ?? 0.5}
            onChange={(v) => patchPath('highValue.premiumPct', v)}
            hint="Charged in the engine, so quote and booking always match. 0 disables. Matching only offers such jobs to drivers whose level covers the value." />
          <FieldNumber label="Driver share of premium %"
            value={card.highValue?.driverSharePct ?? 0}
            onChange={(v) => patchPath('highValue.driverSharePct', v)}
            hint="Slice of the collected premium paid to the driver carrying the risk. 0 = all premium stays with SEIRS." />
        </Row>
      </Card>

      {/* ── Stop & dwell ──────────────────────────────────────────── */}
      <Card title="Multi-stop &amp; dwell bonuses">
        <Row>
          <FieldNumber label="Per-stop bonus ₦ (customer)"
            value={card.stopAndDwell.perStopBonusCustomer}
            onChange={(v) => patchPath('stopAndDwell.perStopBonusCustomer', v)}
            hint="Charged to customer for each stop beyond the first." />
          <FieldNumber label="Per-stop bonus ₦ (driver)"
            value={card.stopAndDwell.perStopBonusDriver}
            onChange={(v) => patchPath('stopAndDwell.perStopBonusDriver', v)}
            hint="What the driver earns per extra stop." />
          <FieldNumber label="Leg allowance km/stop"
            value={card.stopAndDwell.legAllowanceKmPerStop ?? 0.5}
            onChange={(v) => patchPath('stopAndDwell.legAllowanceKmPerStop', v)}
            hint="Charged, never displayed (founder): extra km added to the priced distance per stop beyond the first, covering gates, one-way streets and estate detours." />
        </Row>
        <Row>
          <FieldNumber label="Wait fee ₦/min (customer)"
            value={card.stopAndDwell.perDwellMinuteCustomer}
            onChange={(v) => patchPath('stopAndDwell.perDwellMinuteCustomer', v)}
            hint="After free threshold. Charged if sender keeps driver waiting at pickup." />
          <FieldNumber label="Wait fee ₦/min (driver)"
            value={card.stopAndDwell.perDwellMinuteDriver}
            onChange={(v) => patchPath('stopAndDwell.perDwellMinuteDriver', v)}
            hint="Driver's share of wait fee." />
        </Row>
        <Row>
          <FieldNumber label="Free wait threshold (minutes)"
            value={card.stopAndDwell.freeDwellThresholdMinutes}
            onChange={(v) => patchPath('stopAndDwell.freeDwellThresholdMinutes', v)}
            hint="No wait fee inside this window." />
          <FieldNumber label="Wait fee cap (minutes)"
            value={card.stopAndDwell.dwellCapMinutes}
            onChange={(v) => patchPath('stopAndDwell.dwellCapMinutes', v)}
            hint="After this, driver can cancel and still get paid." />
        </Row>
      </Card>

      {/* ── Weight tiers ──────────────────────────────────────────── */}
      <Card title="Weight tiers (dwell minutes added)" hint="Extra dwell time per stop based on shipment weight.">
        {card.weightTiers.map((tier: any, idx: number) => (
          <Row key={idx}>
            <FieldNumber label="Min kg"
              value={tier.minKg}
              onChange={(v) => patchPath(`weightTiers.${idx}.minKg`, v)} />
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600">Max kg</label>
              <input
                type="text"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                value={tier.maxKg ?? ''}
                placeholder="(open)"
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  patchPath(`weightTiers.${idx}.maxKg`, raw === '' ? null : Number(raw));
                }}
              />
            </div>
            <FieldNumber label="Extra dwell min"
              value={tier.extraMinutes}
              onChange={(v) => patchPath(`weightTiers.${idx}.extraMinutes`, v)} />
          </Row>
        ))}
      </Card>

      {/* ── Cultural buffers ──────────────────────────────────────── */}
      <Card title="Nigerian cultural buffers" hint="Extra minutes added at every stop on top of category setup + weight.">
        <Row>
          <FieldNumber label="Baseline (every stop)"
            value={card.dwellBuffers.baselineMinutes}
            onChange={(v) => patchPath('dwellBuffers.baselineMinutes', v)}
            hint="Network for OTP, gate security, conversation." />
          <FieldNumber label="Estate / compound stops"
            value={card.dwellBuffers.estateMinutes}
            onChange={(v) => patchPath('dwellBuffers.estateMinutes', v)}
            hint="Security log book, parking instructions." />
        </Row>
        <Row>
          <FieldNumber label="Market / open stall"
            value={card.dwellBuffers.marketMinutes}
            onChange={(v) => patchPath('dwellBuffers.marketMinutes', v)}
            hint="Crowds, haggling, narrow parking." />
          <FieldNumber label="Government / bank"
            value={card.dwellBuffers.govtMinutes}
            onChange={(v) => patchPath('dwellBuffers.govtMinutes', v)}
            hint="Sign-in, ID check, escort to recipient." />
        </Row>
      </Card>

      {/* ── Surcharges ────────────────────────────────────────────── */}
      <Card title="Time surcharges" hint="Applied as percent uplift on subtotal before zone surcharges + discounts.">
        <h4 className="text-sm font-semibold text-gray-700 mt-2">Night ({card.timeSurcharges.night.windowStart} – {card.timeSurcharges.night.windowEnd})</h4>
        <Row>
          <FieldNumber label="Customer surcharge %"
            value={card.timeSurcharges.night.customerPercent}
            onChange={(v) => patchPath('timeSurcharges.night.customerPercent', v)} />
          <FieldNumber label="Driver share of surcharge %"
            value={card.timeSurcharges.night.driverSharePercent}
            onChange={(v) => patchPath('timeSurcharges.night.driverSharePercent', v)} />
        </Row>
        <h4 className="text-sm font-semibold text-gray-700 mt-4">Peak ({card.timeSurcharges.peak.windowStart} – {card.timeSurcharges.peak.windowEnd}, weekdays)</h4>
        <Row>
          <FieldNumber label="Customer surcharge %"
            value={card.timeSurcharges.peak.customerPercent}
            onChange={(v) => patchPath('timeSurcharges.peak.customerPercent', v)} />
          <FieldNumber label="Driver share of surcharge %"
            value={card.timeSurcharges.peak.driverSharePercent}
            onChange={(v) => patchPath('timeSurcharges.peak.driverSharePercent', v)} />
        </Row>
        <h4 className="text-sm font-semibold text-gray-700 mt-4">Weekend</h4>
        <Row>
          <FieldNumber label="Customer surcharge %"
            value={card.timeSurcharges.weekend.customerPercent}
            onChange={(v) => patchPath('timeSurcharges.weekend.customerPercent', v)} />
          <FieldNumber label="Driver share of surcharge %"
            value={card.timeSurcharges.weekend.driverSharePercent}
            onChange={(v) => patchPath('timeSurcharges.weekend.driverSharePercent', v)} />
        </Row>
      </Card>

      <Card title="Zone surcharges" hint="Tiered by how far the trip goes. stays in one state, crosses to a neighbour, or crosses to a different geopolitical zone.">
        <Row>
          <FieldNumber label="Intra-state long-haul threshold (km)"
            value={card.zoneSurcharges?.intraStateLongHaulKm ?? 100}
            onChange={(v) => patchPath('zoneSurcharges.intraStateLongHaulKm', v)}
            hint="Trips within one state above this kilometre count add the surcharge below." />
          <FieldNumber label="Intra-state long-haul %"
            value={pctVal(card.zoneSurcharges?.intraStateLongHaulPct, 0.15)}
            step={1}
            onChange={(v) => patchPath('zoneSurcharges.intraStateLongHaulPct', v / 100)} />
        </Row>
        <Row>
          <FieldNumber label="Inter-state (adjacent) %"
            value={pctVal(card.zoneSurcharges?.interStateAdjacentPct, 0.20)}
            step={1}
            onChange={(v) => patchPath('zoneSurcharges.interStateAdjacentPct', v / 100)}
            hint="Crossing into a neighbour state (Lagos ↔ Ogun)." />
          <FieldNumber label="Inter-state (distant) %"
            value={pctVal(card.zoneSurcharges?.interStateDistantPct, 0.30)}
            step={1}
            onChange={(v) => patchPath('zoneSurcharges.interStateDistantPct', v / 100)}
            hint="Non-adjacent state crossing within the same geopolitical zone." />
        </Row>
        <Row>
          <FieldNumber label="Cross-zone %"
            value={pctVal(card.zoneSurcharges?.crossZonePct, 0.40)}
            step={1}
            onChange={(v) => patchPath('zoneSurcharges.crossZonePct', v / 100)}
            hint="Trip crosses a geopolitical zone (NW↔SS, etc.). usually long-distance." />
          <FieldNumber label="Restricted sub-zone default %"
            value={pctVal(card.zoneSurcharges?.restrictedZoneDefaultPct, 0.50)}
            step={1}
            onChange={(v) => patchPath('zoneSurcharges.restrictedZoneDefaultPct', v / 100)}
            hint="Fallback % when an admin-added sub-zone has no explicit surcharge." />
        </Row>
        <Row>
          <FieldNumber label="Overnight fee ₦"
            value={card.zoneSurcharges?.overnightFeeNgn ?? 5000}
            onChange={(v) => patchPath('zoneSurcharges.overnightFeeNgn', v)}
            hint="Flat fee added when trip distance exceeds the threshold below." />
          <FieldNumber label="Overnight threshold (km)"
            value={card.zoneSurcharges?.overnightFeeKm ?? 500}
            onChange={(v) => patchPath('zoneSurcharges.overnightFeeKm', v)} />
        </Row>
      </Card>

      {/*
        THE FOUR AREA-PRICING EDITORS ARE GONE (2026-08-28).

        Geopolitical zone overrides, State overrides, Hotspot pricing
        circles and Restricted sub-zones all wrote into the rate card's
        `regions` block, and `regions` is NULL on the live card, so none
        of them changed a single quote. They were also a second
        area-pricing system competing with the Zones page, which is real
        and enforced: Victoria Island is published there at 2.2x and was
        measured against production.

        Two screens for "what does this area cost" is how somebody closes
        an area in one place and watches nothing happen. Zones wins
        because it works, and it does more: it can close an area, ban a
        vehicle class, run on a schedule and show itself on the ops map.
      */}
      <Card title="Pricing by area">
        <p className="text-sm text-[#0F2B4C]/70">
          Area pricing lives on the <a href="/zones" className="font-semibold text-[#3A7BD5] hover:underline">Zones</a> page.
          Draw a circle, a state or a geopolitical zone, set a multiplier or a surcharge, and publish it.
          Zones can also close an area outright or ban a vehicle class, which this page never could.
        </p>
        <p className="mt-2 text-xs text-[#0F2B4C]/45">
          The four editors that used to sit here (zone overrides, state overrides, hotspot circles and
          restricted sub-zones) wrote to a field the pricing engine no longer reads, so nothing they
          were set to ever reached a customer.
        </p>
      </Card>

      {/* ── Discounts ─────────────────────────────────────────────── */}
      <Card title="Discounts">
        <Row>
          <FieldNumber label="Bulk CSV off %"
            value={card.discounts.bulkUploadOffPercent}
            onChange={(v) => patchPath('discounts.bulkUploadOffPercent', v)} />
          <FieldNumber label="Bulk CSV min packages"
            value={card.discounts.bulkUploadMinPackages}
            onChange={(v) => patchPath('discounts.bulkUploadMinPackages', v)} />
        </Row>
        <Row>
          <FieldNumber label="Recurring schedule off %"
            value={card.discounts.recurringOffPercent}
            onChange={(v) => patchPath('discounts.recurringOffPercent', v)} />
          <FieldNumber label="Loyalty point value ₦"
            value={card.discounts.loyaltyPointValueNgn}
            onChange={(v) => patchPath('discounts.loyaltyPointValueNgn', v)}
            hint="What one reward point is worth when a customer spends points on a booking. Customers hold points, never a naira balance." />
        </Row>
        <Row>
          <FieldNumber label="Welcome offer %"
            value={card.discounts.welcomeOffPercent}
            onChange={(v) => patchPath('discounts.welcomeOffPercent', v)} />
          <FieldNumber label="Welcome offer cap ₦"
            value={card.discounts.welcomeMaxNgn}
            onChange={(v) => patchPath('discounts.welcomeMaxNgn', v)} />
        </Row>
      </Card>

      {/* ── Cancellation / wait / return fees ─────────────────────── */}
      <Card title="Cancellation / wait / return">
        <Row>
          <FieldNumber label="Pre-assign cancellation ₦ (cust)"
            value={card.feeRules.cancelPreAssignCustomer}
            onChange={(v) => patchPath('feeRules.cancelPreAssignCustomer', v)} />
          <FieldNumber label="Post-assign cancellation ₦ (cust)"
            value={card.feeRules.cancelPostAssignCustomer}
            onChange={(v) => patchPath('feeRules.cancelPostAssignCustomer', v)} />
        </Row>
        {/*
          Four of the seven fields in this section are read by nothing
          and sat beside three that are, with no way to tell them apart
          (audit, 2026-08-28). Worse, each dead one disagrees with the
          live Fee Catalogue row that does its job, so an operator could
          set a 10-minute wait here while the platform waits 15.

          Left editable, per the rule that a value set in advance is a
          decision already made. Labelled, so nobody tunes a number that
          changes nothing.
        */}
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          <p className="font-semibold">Four fields below are not wired up.</p>
          <p className="mt-1">
            The three cancellation fees are live. <b>Sender no-show fee</b>, <b>No-show wait
            window</b>, <b>Return trip base fee</b> and <b>Recipient call attempts</b> are not:
            nothing reads them. What actually runs today lives in the Fee Catalogue further
            down this page, and it does not match what is typed here:
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            <li>Waiting on a sender is <b>sender_response_window_minutes</b>, currently 15,
              not the 10 shown here.</li>
            <li>A driver is paid for a wasted trip by <b>driver_failed_trip_base_ngn</b>,
              a base plus fuel for the distance ridden, not a flat fee.</li>
            <li>Returns are charged by <b>return_to_sender_fee</b>, currently 1,500.00.</li>
            <li>Nothing counts recipient call attempts at all.</li>
          </ul>
        </div>
        <Row>
          <FieldNumber label="Driver gets on post-assign cancel ₦"
            value={card.feeRules.cancelPostAssignDriver}
            onChange={(v) => patchPath('feeRules.cancelPostAssignDriver', v)} />
          <div className="flex-1" />
        </Row>
        {/*
          The four dead fields are gone from this panel (2026-08-28).
          Labelling them "(not wired)" left four boxes an operator could
          still type into for no effect, which is the disabled-field
          state the founder rejected: it either works or it is not
          offered. The stored values are untouched, so nothing is lost if
          any of them is ever built.

          They were also superseded rather than merely unbuilt. The
          approved "When Delivery Fails" design (21 Aug) replaced the flat
          return fee with trip pricing from the parcel's current position
          back to the immutable original pickup, and moved the waiting
          windows into the Fee Catalogue.
        */}
        <div className="mt-3 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-xs leading-relaxed text-[#0F2B4C]/70">
          <p className="font-semibold text-[#0F2B4C]">Waiting, no-shows and returns are set below, not here.</p>
          <p className="mt-1">
            This card used to offer a sender no-show fee, a no-show wait window, a flat return
            trip fee and a recipient call-attempt count. None of them were read by anything, and
            each disagreed with the row that actually runs. They have been removed rather than
            left as boxes that do nothing:
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            <li>Waiting on a sender: <b>sender_response_window_minutes</b>, 15 minutes.</li>
            <li>A wasted trip pays the driver <b>driver_failed_trip_base_ngn</b> plus fuel for
              the distance actually ridden, not a flat fee.</li>
            <li>A return is priced as a <b>real trip</b> from where the parcel is back to the
              original pickup address, plus any storage accrued. The pickup address cannot be
              changed, which is what stops a short delivery being redirected across Lagos.</li>
            <li>Nothing counts recipient call attempts.</li>
          </ul>
        </div>
      </Card>

      {/* ── Partner store ─────────────────────────────────────────── */}
      <Card title="Partner store economics">
        <p className="text-sm text-[#0F2B4C]/70">Set in the <a href="#fees" className="font-semibold text-[#3A7BD5] hover:underline">Fee Catalogue</a>, under <b>partner_store_handling_ngn</b> and the counter fee rows.</p>
        <p className="mt-2 text-xs text-[#0F2B4C]/45">The rate card carries a partnerStore block that no pricing code reads: perPackageFeeNgn, an overstay start day and two daily tiers. The live behaviour is a single per-day rate from the Fee Catalogue below, so the card’s second tier describes an escalation SEIRS does not currently charge.</p>
      </Card>

      {/* ── VAT ───────────────────────────────────────────────────── */}
      <Card title="VAT">
        <Row>
          {/*
            This asked for a decimal: 0.075 for 7.5%. Anybody typing what
            they actually know, 7.5, set VAT to 750% on every booking in
            the country. It takes and shows a percentage now, and stores
            the decimal the engine wants.
          */}
          <FieldNumber label="VAT charged on the service fee (%)"
            value={pctVal(card.vatRate, 0.075)}
            step={0.1}
            onChange={(v) => patchPath('vatRate', v / 100)}
            hint="Nigerian VAT on services is 7.5%. Type 7.5, not 0.075." />
          <div className="flex-1" />
        </Row>
      </Card>

      {/* ── Publish bar (sticky at bottom) ─────────────────────────── */}
      <div className="sticky bottom-0 left-0 right-0 -mx-6 border-t border-gray-200 bg-white px-6 py-4 shadow-lg">
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={changeReason}
            onChange={(e) => setChangeReason(e.target.value)}
            placeholder="What did you change, and why? e.g. petrol at 1,100 per litre from Monday"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <button
            onClick={async () => {
              // Reload used to silently discard an afternoon of typing.
              if (dirty) {
                const ok = await confirm({
                  title:        'Throw away your changes and start again?',
                  message:      `You have ${changedPaths.length} unpublished change${changedPaths.length === 1 ? '' : 's'}. Reloading fetches the live prices and loses them.`,
                  confirmLabel: 'Reload and lose them',
                  danger:       true,
                });
                if (!ok) return;
              }
              reload();
            }}
            disabled={saving}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" /> Start again
          </button>
          <button
            onClick={publish}
            disabled={saving || !changeReason.trim() || !dirty}
            className="px-4 py-2 bg-navy-700 bg-[#0F2B4C] text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Publish new version
          </button>
        </div>
        {/* A greyed-out button with no reason next to it is the single
            most common "the dashboard is broken" report. */}
        <p className="mt-2 text-xs text-gray-500">
          {!dirty
            ? 'Nothing has been changed yet, so there is nothing to publish.'
            : !changeReason.trim()
              ? 'Write one line about what you changed. It is kept forever and is what the next person reads when they ask why prices moved.'
              : `Ready: ${changedPaths.length} change${changedPaths.length === 1 ? '' : 's'} will go live in all three apps within about five minutes.`}
        </p>
      </div>

    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Small reusable bits

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-4">{children}</div>;
}

function FieldNumber({
  label, value, onChange, hint, step = 1,
}: { label: string; value: number; onChange: (v: number) => void; hint?: string; step?: number }) {
  return (
    <div className="flex-1 min-w-[220px]">
      <label className="text-xs font-medium text-gray-700 block">{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums focus:outline-none focus:border-blue-500"
      />
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

function InlineNum({
  value, onChange, step = 1, placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      step={step}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value.trim();
        onChange(raw === '' ? null : Number(raw));
      }}
      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm tabular-nums focus:outline-none focus:border-blue-500"
    />
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Display value for a decimal % (0.15) shown as 15. Falls back to default × 100. */
function pctVal(v: number | undefined, fallback: number): number {
  return Math.round(((v ?? fallback) * 100) * 10) / 10;
}

// ──────────────────────────────────────────────────────────────────────
// State overrides. table with collapse + filter


/*
 * StateOverridesTable, HotspotsEditor and SubZonesEditor lived here and
 * are deleted (2026-08-28).
 *
 * All three edited the rate card's `regions` block, which is NULL on the
 * live card and is no longer read by the pricing engine at all. They were
 * a second area-pricing system competing with the Zones page, which is the
 * one that is actually enforced.
 *
 * Their JSX was removed from the page above; these definitions then had no
 * callers, so leaving them would be dead code that still compiles and
 * invites somebody to wire it back up.
 */