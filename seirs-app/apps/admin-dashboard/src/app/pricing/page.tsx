/**
 * Admin · Pricing — RateCard editor.
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
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Save, RefreshCw, AlertCircle, History, TrendingUp, Loader2 } from 'lucide-react';

const VEHICLE_ORDER = ['bicycle', 'motorcycle', 'tricycle', 'car', 'van', 'truck_small', 'truck_large'] as const;
const VEHICLE_LABEL: Record<string, string> = {
  bicycle: 'Bicycle', motorcycle: 'Motorcycle', tricycle: 'Tricycle',
  car: 'Car', van: 'Van', truck_small: 'Small Truck', truck_large: 'Large Truck',
};

type RateCard = any;

export default function PricingPage() {
  const [card, setCard]       = useState<RateCard | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [changeReason, setChangeReason] = useState('');

  // Reload + initial fetch
  const reload = async () => {
    setLoading(true);
    try {
      const [active, hist] = await Promise.all([
        adminApi.rateCard.getActive(),
        adminApi.rateCard.history().catch(() => []),
      ]);
      setCard(active);
      setHistory(hist);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load rate card');
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  // Generic patch helper — keeps nested keys editable via dot-path.
  const patchPath = (path: string, value: any) => {
    setCard((prev: any) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const keys = path.split('.');
      let cur: any = next;
      for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const publish = async () => {
    if (!card) return;
    if (!changeReason.trim()) {
      alert('Please describe what you changed in this rate card update.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      // Strip the snapshot id/version so the backend generates new ones.
      const { id: _id, version: _v, isActive: _a, activatedAt: _aa,
        deactivatedAt: _da, createdAt: _ca, ...payload } = card;
      const result = await adminApi.rateCard.publish({
        ...payload,
        changeReason: changeReason.trim(),
        activatedBy:  'admin',  // backend can later read from JWT
      });
      setSuccess(`Published version ${result?.version ?? '?'}.`);
      setChangeReason('');
      await reload();
    } catch (e: any) {
      setError(e?.message ?? 'Could not publish rate card');
    } finally { setSaving(false); }
  };

  const inflationBump = (pct: number) => {
    if (!card) return;
    if (!confirm(`Increase ALL labour rates + base fares by ${pct}%? Fuel pass-through is unaffected.`)) return;
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
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-red-700">Could not load rate card</div>
            <div className="text-sm text-red-600 mt-1">{error}</div>
            <button onClick={reload} className="mt-3 px-3 py-1.5 bg-red-600 text-white rounded text-sm font-medium">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto pb-32 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pricing &amp; Rate Card</h1>
          <p className="text-sm text-gray-500 mt-1">
            Active version <b>{card.version}</b> · activated{' '}
            {card.activatedAt ? new Date(card.activatedAt).toLocaleString() : '—'}.
            Apps re-fetch within 5 minutes of publish.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-gray-50"
          >
            <History className="w-4 h-4" /> History ({history.length})
          </button>
          <button
            onClick={() => inflationBump(5)}
            className="px-3 py-2 bg-amber-100 border border-amber-300 text-amber-900 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-amber-200"
          >
            <TrendingUp className="w-4 h-4" /> +5% inflation bump
          </button>
        </div>
      </div>

      {/* Alerts */}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          ✓ {success}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* History panel */}
      {showHistory && history.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Recent versions</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200 text-left">
                <th className="py-2">Version</th><th>Active</th><th>Activated</th><th>By</th><th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 10).map((h: any) => (
                <tr key={h.id} className="border-b border-gray-100">
                  <td className="py-2 font-mono">v{h.version}</td>
                  <td>{h.isActive ? <span className="text-green-700 font-bold">YES</span> : '—'}</td>
                  <td>{h.activatedAt ? new Date(h.activatedAt).toLocaleString() : '—'}</td>
                  <td>{h.activatedBy ?? '—'}</td>
                  <td className="text-gray-600">{h.changeReason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Fuel prices ───────────────────────────────────────────── */}
      <Card title="Fuel prices" hint="Update when Nigerian pump prices change. All vehicle km rates recompute automatically.">
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
                </tr>
              );
            })}
          </tbody>
        </table>
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

      <Card title="Zone surcharges">
        <Row>
          <FieldNumber label="Intra-state %"
            value={card.zoneSurcharges.intraStatePercent}
            onChange={(v) => patchPath('zoneSurcharges.intraStatePercent', v)} />
          <FieldNumber label="Inter-state %"
            value={card.zoneSurcharges.interStatePercent}
            onChange={(v) => patchPath('zoneSurcharges.interStatePercent', v)} />
        </Row>
        <Row>
          <FieldNumber label="Long-distance %"
            value={card.zoneSurcharges.longDistancePercent}
            onChange={(v) => patchPath('zoneSurcharges.longDistancePercent', v)} />
          <FieldNumber label="Long-distance threshold (km)"
            value={card.zoneSurcharges.longDistanceThresholdKm}
            onChange={(v) => patchPath('zoneSurcharges.longDistanceThresholdKm', v)} />
        </Row>
        <Row>
          <FieldNumber label="Overnight fee ₦"
            value={card.zoneSurcharges.overnightFeeNgn}
            onChange={(v) => patchPath('zoneSurcharges.overnightFeeNgn', v)}
            hint="Flat fee for trips beyond the threshold below." />
          <FieldNumber label="Overnight threshold (km)"
            value={card.zoneSurcharges.overnightThresholdKm}
            onChange={(v) => patchPath('zoneSurcharges.overnightThresholdKm', v)} />
        </Row>
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
            hint="1 point earned per ₦100 wallet funding; this is what 1 point is worth at redemption." />
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
        <Row>
          <FieldNumber label="Driver gets on post-assign cancel ₦"
            value={card.feeRules.cancelPostAssignDriver}
            onChange={(v) => patchPath('feeRules.cancelPostAssignDriver', v)} />
          <FieldNumber label="Sender no-show fee ₦"
            value={card.feeRules.senderNoShowFlat}
            onChange={(v) => patchPath('feeRules.senderNoShowFlat', v)} />
        </Row>
        <Row>
          <FieldNumber label="No-show wait window (minutes)"
            value={card.feeRules.senderNoShowWaitMinutes}
            onChange={(v) => patchPath('feeRules.senderNoShowWaitMinutes', v)} />
          <FieldNumber label="Return trip base fee ₦"
            value={card.feeRules.returnTripBaseFee}
            onChange={(v) => patchPath('feeRules.returnTripBaseFee', v)} />
        </Row>
        <Row>
          <FieldNumber label="Recipient call attempts"
            value={card.feeRules.returnCallAttempts}
            onChange={(v) => patchPath('feeRules.returnCallAttempts', v)}
            hint="How many tries before declaring recipient unreachable." />
          <div className="flex-1" />
        </Row>
      </Card>

      {/* ── Partner store ─────────────────────────────────────────── */}
      <Card title="Partner store economics">
        <Row>
          <FieldNumber label="Per-package fee ₦"
            value={card.partnerStore.perPackageFeeNgn}
            onChange={(v) => patchPath('partnerStore.perPackageFeeNgn', v)} />
          <FieldNumber label="Default max capacity"
            value={card.partnerStore.defaultMaxCapacity}
            onChange={(v) => patchPath('partnerStore.defaultMaxCapacity', v)} />
        </Row>
        <Row>
          <FieldNumber label="Overstay tier 1 starts day"
            value={card.partnerStore.overstayTier1StartDay}
            onChange={(v) => patchPath('partnerStore.overstayTier1StartDay', v)} />
          <FieldNumber label="Tier 1 fee ₦/day"
            value={card.partnerStore.overstayTier1DailyFeeNgn}
            onChange={(v) => patchPath('partnerStore.overstayTier1DailyFeeNgn', v)} />
        </Row>
        <Row>
          <FieldNumber label="Tier 2 fee ₦/day"
            value={card.partnerStore.overstayTier2DailyFeeNgn}
            onChange={(v) => patchPath('partnerStore.overstayTier2DailyFeeNgn', v)} />
          <FieldNumber label="Return-trigger day"
            value={card.partnerStore.returnTriggerDay}
            onChange={(v) => patchPath('partnerStore.returnTriggerDay', v)}
            hint="Day on which package is auto-returned to sender." />
        </Row>
        <Row>
          <FieldNumber label="Partner share of overstay fee %"
            value={card.partnerStore.partnerSharePercent}
            onChange={(v) => patchPath('partnerStore.partnerSharePercent', v)}
            hint="The rest goes to SEIRS." />
          <div className="flex-1" />
        </Row>
      </Card>

      {/* ── VAT ───────────────────────────────────────────────────── */}
      <Card title="Tax (VAT)">
        <Row>
          <FieldNumber label="VAT rate (decimal)"
            value={card.vatRate}
            step={0.001}
            onChange={(v) => patchPath('vatRate', v)}
            hint="0.075 = 7.5% (current Nigerian VAT on services)." />
          <div className="flex-1" />
        </Row>
      </Card>

      {/* ── Publish bar (sticky at bottom) ─────────────────────────── */}
      <div className="sticky bottom-0 left-0 right-0 -mx-6 px-6 py-4 bg-white border-t border-gray-200 shadow-lg flex items-center gap-4">
        <input
          type="text"
          value={changeReason}
          onChange={(e) => setChangeReason(e.target.value)}
          placeholder="What changed and why? (required for audit log)"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <button
          onClick={reload}
          disabled={saving}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className="w-4 h-4" /> Reload
        </button>
        <button
          onClick={publish}
          disabled={saving || !changeReason.trim()}
          className="px-4 py-2 bg-navy-700 bg-[#0F2B4C] text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Publish new version
        </button>
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

function InlineNum({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm tabular-nums focus:outline-none focus:border-blue-500"
    />
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
