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
import { Save, RefreshCw, AlertCircle, History, TrendingUp, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  NIGERIAN_STATES,
  GEOPOLITICAL_ZONES,
  statesInZone,
  newSubZoneId,
  type GeopoliticalZone,
  type StateCode,
} from '@/lib/nigerianStates';

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

      <Card title="Zone surcharges" hint="Tiered by how far the trip goes — stays in one state, crosses to a neighbour, or crosses to a different geopolitical zone.">
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
            hint="Trip crosses a geopolitical zone (NW↔SS, etc.) — usually long-distance." />
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

      {/* ── Geopolitical Zone Overrides ──────────────────────────── */}
      <Card title="Geopolitical zone overrides" hint="6 zones × 1 multiplier each. Multiplies vehicle base + per-km rates for any pickup in that zone. State overrides win over zone overrides.">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left border-b border-gray-200">
              <th className="py-2 pr-3">Zone</th>
              <th className="px-2">Multiplier (× rates)</th>
              <th className="px-2">Petrol override ₦/L</th>
              <th className="px-2">Diesel override ₦/L</th>
              <th className="px-2">Dwell buffer (min)</th>
              <th className="px-2">Reason / note</th>
            </tr>
          </thead>
          <tbody>
            {ZONE_ORDER.map((zoneCode) => {
              const path = `regions.zoneOverrides.${zoneCode}`;
              const ov   = card.regions?.zoneOverrides?.[zoneCode] ?? {};
              return (
                <tr key={zoneCode} className="border-b border-gray-100">
                  <td className="py-2 pr-3">
                    <div className="font-semibold text-gray-900">{zoneCode} · {GEOPOLITICAL_ZONES[zoneCode].name}</div>
                    <div className="text-xs text-gray-500">{GEOPOLITICAL_ZONES[zoneCode].description}</div>
                  </td>
                  <td className="px-1"><InlineNum value={ov.rateMultiplier ?? 1.0} step={0.01} onChange={(v) => patchPath(`${path}.rateMultiplier`, v)} /></td>
                  <td className="px-1"><InlineNum value={ov.fuelPrices?.petrolNgn ?? null} placeholder="—" onChange={(v) => patchPath(`${path}.fuelPrices.petrolNgn`, v)} /></td>
                  <td className="px-1"><InlineNum value={ov.fuelPrices?.dieselNgn ?? null} placeholder="—" onChange={(v) => patchPath(`${path}.fuelPrices.dieselNgn`, v)} /></td>
                  <td className="px-1"><InlineNum value={ov.dwellBufferMin ?? 0} onChange={(v) => patchPath(`${path}.dwellBufferMin`, v)} /></td>
                  <td className="px-1">
                    <input
                      type="text"
                      value={ov.reason ?? ''}
                      placeholder="Why this zone differs"
                      onChange={(e) => patchPath(`${path}.reason`, e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* ── State Overrides ──────────────────────────────────────── */}
      <Card
        title="State overrides"
        hint="37 federating units (36 states + FCT). Set a multiplier here only when a state differs from its zone's default. Leaving multiplier = 1.0 means 'inherit zone'."
      >
        <StateOverridesTable
          card={card}
          patchPath={patchPath}
        />
      </Card>

      {/* ── Restricted Sub-Zones — admin-addable ─────────────────── */}
      <Card
        title="Restricted sub-zones"
        hint="Manually-added zones (curfew areas, flood-affected LGAs, conflict corridors). Each row carries its own surcharge — backend matches by name + state when pricing a booking. Disable with the toggle to pause without deleting."
      >
        <SubZonesEditor card={card} patchPath={patchPath} />
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
// State overrides — table with collapse + filter

function StateOverridesTable({
  card, patchPath,
}: {
  card:      any;
  patchPath: (path: string, value: any) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const overrides = card.regions?.stateOverrides ?? {};
  const overriddenCodes = Object.keys(overrides);
  const visibleStates = showAll
    ? NIGERIAN_STATES
    : NIGERIAN_STATES.filter(s => overriddenCodes.includes(s.code));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-gray-600">
          {overriddenCodes.length} of 37 states have overrides.
        </div>
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
        >
          {showAll ? `Show only overridden (${overriddenCodes.length})` : `Show all 37`}
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-left border-b border-gray-200">
            <th className="py-2 pr-3">State</th>
            <th className="px-2">Zone</th>
            <th className="px-2">Multiplier (× zone × baseline)</th>
            <th className="px-2">Reason / note</th>
          </tr>
        </thead>
        <tbody>
          {visibleStates.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-gray-500 text-sm">
                No state overrides yet. Click <b>Show all 37</b> to add one.
              </td>
            </tr>
          )}
          {visibleStates.map((s) => {
            const ov   = overrides[s.code] ?? {};
            const path = `regions.stateOverrides.${s.code}`;
            const hasOverride = overriddenCodes.includes(s.code);
            return (
              <tr key={s.code} className={`border-b border-gray-100 ${hasOverride ? 'bg-amber-50/40' : ''}`}>
                <td className="py-2 pr-3">
                  <div className="font-medium text-gray-900">{s.name}</div>
                  <div className="text-xs text-gray-500">{s.code} · {s.capital}</div>
                </td>
                <td className="px-2 text-xs text-gray-500">{s.zone}</td>
                <td className="px-1">
                  <InlineNum
                    value={ov.rateMultiplier ?? null}
                    placeholder="1.00"
                    step={0.01}
                    onChange={(v) => patchPath(`${path}.rateMultiplier`, v)}
                  />
                </td>
                <td className="px-1">
                  <input
                    type="text"
                    value={ov.reason ?? ''}
                    placeholder={hasOverride ? 'Why this state differs' : '— inherits zone —'}
                    onChange={(e) => patchPath(`${path}.reason`, e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Restricted sub-zones — admin can add/remove/disable rows manually

function SubZonesEditor({
  card, patchPath,
}: {
  card:      any;
  patchPath: (path: string, value: any) => void;
}) {
  const subZones: SubZone[] = card.regions?.restrictedSubZones ?? [];

  const setSubZones = (next: SubZone[]) => patchPath('regions.restrictedSubZones', next);

  const addSubZone = () => {
    const row: SubZone = {
      id:           newSubZoneId(),
      name:         '',
      stateCode:    '',
      surchargePct: 50,
      reason:       '',
      active:       true,
    };
    setSubZones([...subZones, row]);
  };

  const patchSubZone = <K extends keyof SubZone>(idx: number, key: K, value: SubZone[K]) => {
    const next = subZones.slice();
    next[idx]  = { ...next[idx], [key]: value };
    setSubZones(next);
  };

  const removeSubZone = (idx: number) => {
    const row = subZones[idx];
    if (!confirm(`Delete restricted sub-zone "${row.name || '(unnamed)'}"? This can't be undone after publishing.`)) return;
    setSubZones(subZones.filter((_, i) => i !== idx));
  };

  return (
    <div>
      {subZones.length === 0 && (
        <div className="text-sm text-gray-500 italic mb-4 p-4 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-center">
          No restricted sub-zones yet. Use the button below to add one.
        </div>
      )}

      {subZones.length > 0 && (
        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="text-gray-500 text-left border-b border-gray-200">
              <th className="py-2 pr-2">Name</th>
              <th className="px-2">State</th>
              <th className="px-2">Surcharge %</th>
              <th className="px-2">Reason</th>
              <th className="px-2 w-20">Active</th>
              <th className="px-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {subZones.map((sz, idx) => (
              <tr key={sz.id} className={`border-b border-gray-100 ${sz.active ? '' : 'opacity-50'}`}>
                <td className="py-2 pr-1">
                  <input
                    type="text"
                    value={sz.name}
                    placeholder="e.g. Sambisa forest corridor"
                    onChange={(e) => patchSubZone(idx, 'name', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                  />
                </td>
                <td className="px-1">
                  <select
                    value={sz.stateCode}
                    onChange={(e) => patchSubZone(idx, 'stateCode', e.target.value as StateCode)}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select…</option>
                    {ZONE_ORDER.map(zone => (
                      <optgroup key={zone} label={`${zone} — ${GEOPOLITICAL_ZONES[zone].name}`}>
                        {statesInZone(zone).map(s => (
                          <option key={s.code} value={s.code}>{s.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td className="px-1">
                  <InlineNum
                    value={sz.surchargePct}
                    step={1}
                    onChange={(v) => patchSubZone(idx, 'surchargePct', v ?? 0)}
                  />
                </td>
                <td className="px-1">
                  <input
                    type="text"
                    value={sz.reason}
                    placeholder="e.g. Active security advisory"
                    onChange={(e) => patchSubZone(idx, 'reason', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                  />
                </td>
                <td className="px-1 text-center">
                  <input
                    type="checkbox"
                    checked={sz.active}
                    onChange={(e) => patchSubZone(idx, 'active', e.target.checked)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </td>
                <td className="px-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeSubZone(idx)}
                    className="text-red-600 hover:bg-red-50 rounded p-1"
                    title="Delete sub-zone"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button
        type="button"
        onClick={addSubZone}
        className="px-4 py-2 bg-[#0F2B4C] text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-[#1a3e6b]"
      >
        <Plus className="w-4 h-4" /> Add new restricted sub-zone
      </button>
    </div>
  );
}
