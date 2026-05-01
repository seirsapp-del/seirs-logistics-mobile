'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Save, ChevronDown, ChevronUp, Calculator } from 'lucide-react';

const VEHICLE_TYPES = [
  { key: 'bicycle',     label: 'Bicycle',       emoji: '🚲' },
  { key: 'motorcycle',  label: 'Motorcycle',     emoji: '🏍️' },
  { key: 'tricycle',    label: 'Tricycle',       emoji: '🛺' },
  { key: 'car',         label: 'Car',            emoji: '🚗' },
  { key: 'van',         label: 'Van',            emoji: '🚐' },
  { key: 'truck_small', label: 'Small Truck',    emoji: '🚛' },
  { key: 'truck_large', label: 'Large Truck',    emoji: '🚚' },
] as const;

type VehicleKey = typeof VEHICLE_TYPES[number]['key'];

interface VehicleRate {
  vehicleType:  VehicleKey;
  baseFare:     number;
  perKmRate:    number;
  perMinRate:   number;
}

interface ZoneSurcharge {
  name:             string;
  surchargePercent: number;
}

interface PricingConfig {
  vehicles:          VehicleRate[];
  surgeActive:       boolean;
  surgeMultiplier:   number;
  fuelAdjustPercent: number;
  fxAdjustPercent:   number;
  platformCut:       number;
  zones:             ZoneSurcharge[];
}

const DEFAULT_VEHICLES: VehicleRate[] = VEHICLE_TYPES.map(({ key }) => ({
  vehicleType: key,
  baseFare:    key === 'bicycle' ? 300 : key === 'motorcycle' ? 400 : key === 'tricycle' ? 500
              : key === 'car'  ? 800 : key === 'van' ? 1200
              : key === 'truck_small' ? 2000 : 3500,
  perKmRate:   key === 'bicycle' ? 40 : key === 'motorcycle' ? 60 : key === 'tricycle' ? 70
              : key === 'car'  ? 100 : key === 'van' ? 150
              : key === 'truck_small' ? 250 : 400,
  perMinRate:  key === 'bicycle' ? 5 : key === 'motorcycle' ? 8 : key === 'tricycle' ? 8
              : key === 'car' ? 12 : key === 'van' ? 15
              : key === 'truck_small' ? 20 : 30,
}));

const DEFAULT_CONFIG: PricingConfig = {
  vehicles:          DEFAULT_VEHICLES,
  surgeActive:       false,
  surgeMultiplier:   1.5,
  fuelAdjustPercent: 0,
  fxAdjustPercent:   0,
  platformCut:       0.30,
  zones: [
    { name: 'Lagos Island',   surchargePercent: 15 },
    { name: 'Victoria Island', surchargePercent: 20 },
    { name: 'Lekki Phase 1',  surchargePercent: 10 },
  ],
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

export default function PricingPage() {
  const [config,      setConfig]      = useState<PricingConfig>(DEFAULT_CONFIG);
  const [saved,       setSaved]       = useState<PricingConfig>(DEFAULT_CONFIG);
  const [saving,      setSaving]      = useState(false);
  const [saveDone,    setSaveDone]    = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [expanded,    setExpanded]    = useState<VehicleKey | null>('motorcycle');
  const [previewKm,   setPreviewKm]   = useState(10);
  const [previewMin,  setPreviewMin]  = useState(20);
  const [previewVeh,  setPreviewVeh]  = useState<VehicleKey>('motorcycle');

  useEffect(() => {
    adminApi.pricing.get()
      .then((data: any) => {
        const merged = { ...DEFAULT_CONFIG, ...data };
        if (!merged.vehicles?.length) merged.vehicles = DEFAULT_VEHICLES;
        setConfig(merged);
        setSaved(merged);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateVehicle = (vehicleType: VehicleKey, key: keyof VehicleRate, value: number) => {
    setConfig((c) => ({
      ...c,
      vehicles: c.vehicles.map((v) =>
        v.vehicleType === vehicleType ? { ...v, [key]: value } : v,
      ),
    }));
  };

  const updateZone = (idx: number, key: keyof ZoneSurcharge, value: string | number) => {
    setConfig((c) => ({
      ...c,
      zones: c.zones.map((z, i) => i === idx ? { ...z, [key]: value } : z),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveDone(false);
    try {
      const updated = await adminApi.pricing.update(config);
      const merged = { ...DEFAULT_CONFIG, ...updated };
      setConfig(merged);
      setSaved(merged);
      setSaveDone(true);
      setTimeout(() => setSaveDone(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const previewRate = config.vehicles.find((v) => v.vehicleType === previewVeh);
  const previewGross = previewRate
    ? Math.round(
        (previewRate.baseFare + previewRate.perKmRate * previewKm + previewRate.perMinRate * previewMin) *
        (config.surgeActive ? config.surgeMultiplier : 1) *
        (1 + (config.fuelAdjustPercent + config.fxAdjustPercent) / 100),
      )
    : 0;
  const previewDriver   = Math.round(previewGross * (1 - config.platformCut));
  const previewPlatform = Math.round(previewGross * config.platformCut);

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-[#3A7BD5]' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );

  const NumField = ({
    value, onChange, prefix = '', suffix = '', step = 1, min = 0,
  }: { value: number; onChange: (v: number) => void; prefix?: string; suffix?: string; step?: number; min?: number }) => (
    <div className="flex items-center gap-1">
      {prefix && <span className="text-sm text-gray-400">{prefix}</span>}
      <input
        type="number" value={value} min={min} step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 text-right border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5] bg-white text-[#0F2B4C]"
      />
      {suffix && <span className="text-sm text-gray-400">{suffix}</span>}
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[#0F2B4C]/30">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <main className="p-6 lg:p-8 max-w-4xl mx-auto">

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#0F2B4C]">Pricing Engine</h1>
            <p className="text-sm text-[#0F2B4C]/40 mt-1">Per-vehicle rates · Surge · Zone surcharges · Commission</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-[#0F2B4C] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3A7BD5] disabled:opacity-50 transition-colors"
          >
            <Save size={15} />
            {saving ? 'Saving…' : saveDone ? 'Saved!' : 'Save Changes'}
          </button>
        </div>

        <div className="space-y-6">

          {/* Per-vehicle rates */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/40 mb-3">Vehicle Rates</h2>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {VEHICLE_TYPES.map((vt, idx) => {
                const rate = config.vehicles.find((v) => v.vehicleType === vt.key)!;
                const isOpen = expanded === vt.key;
                const savedRate = saved.vehicles.find((v) => v.vehicleType === vt.key);
                const changed = savedRate &&
                  (rate.baseFare !== savedRate.baseFare || rate.perKmRate !== savedRate.perKmRate || rate.perMinRate !== savedRate.perMinRate);
                return (
                  <div key={vt.key} className={idx > 0 ? 'border-t border-gray-100' : ''}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : vt.key)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{vt.emoji}</span>
                        <span className="font-medium text-[#0F2B4C] text-sm">{vt.label}</span>
                        {changed && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Modified</span>}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-400">
                        <span>Base: ₦{rate.baseFare}</span>
                        <span>+₦{rate.perKmRate}/km</span>
                        <span>+₦{rate.perMinRate}/min</span>
                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 bg-gray-50 border-t border-gray-100">
                        <div className="grid grid-cols-3 gap-4 mt-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-2">Base Fare</label>
                            <NumField value={rate.baseFare} onChange={(v) => updateVehicle(vt.key, 'baseFare', v)} prefix="₦" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-2">Per Kilometre</label>
                            <NumField value={rate.perKmRate} onChange={(v) => updateVehicle(vt.key, 'perKmRate', v)} prefix="₦" suffix="/km" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-2">Per Minute (wait)</label>
                            <NumField value={rate.perMinRate} onChange={(v) => updateVehicle(vt.key, 'perMinRate', v)} prefix="₦" suffix="/min" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Surge + adjustments */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/40 mb-3">Surge Pricing</h2>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#0F2B4C]">Enable Surge</p>
                    <p className="text-xs text-gray-400 mt-0.5">Applies to all vehicle types</p>
                  </div>
                  <Toggle value={config.surgeActive} onChange={(v) => setConfig((c) => ({ ...c, surgeActive: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[#0F2B4C]">Multiplier</p>
                  <NumField value={config.surgeMultiplier} min={1} step={0.1}
                    onChange={(v) => setConfig((c) => ({ ...c, surgeMultiplier: v }))} prefix="×" />
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/40 mb-3">Dynamic Adjustments</h2>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#0F2B4C]">Fuel Adjustment</p>
                    <p className="text-xs text-gray-400 mt-0.5">Added to all fares</p>
                  </div>
                  <NumField value={config.fuelAdjustPercent} step={0.5}
                    onChange={(v) => setConfig((c) => ({ ...c, fuelAdjustPercent: v }))} suffix="%" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#0F2B4C]">FX Adjustment</p>
                    <p className="text-xs text-gray-400 mt-0.5">For USD-linked costs</p>
                  </div>
                  <NumField value={config.fxAdjustPercent} step={0.5}
                    onChange={(v) => setConfig((c) => ({ ...c, fxAdjustPercent: v }))} suffix="%" />
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                  <div>
                    <p className="text-sm font-medium text-[#0F2B4C]">Platform Cut</p>
                    <p className="text-xs text-gray-400 mt-0.5">Driver keeps remainder</p>
                  </div>
                  <NumField value={Math.round(config.platformCut * 100)} min={0} step={1}
                    onChange={(v) => setConfig((c) => ({ ...c, platformCut: v / 100 }))} suffix="%" />
                </div>
              </div>
            </section>
          </div>

          {/* Zone surcharges */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/40 mb-3">Zone Surcharges</h2>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {config.zones.map((z, i) => (
                <div key={i} className={`flex items-center gap-4 px-5 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                  <input
                    value={z.name}
                    onChange={(e) => updateZone(i, 'name', e.target.value)}
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
                  />
                  <NumField value={z.surchargePercent} step={1}
                    onChange={(v) => updateZone(i, 'surchargePercent', v)} suffix="%" />
                </div>
              ))}
              <button
                onClick={() => setConfig((c) => ({ ...c, zones: [...c.zones, { name: 'New Zone', surchargePercent: 0 }] }))}
                className="w-full py-3 text-sm text-[#3A7BD5] hover:bg-blue-50 transition-colors border-t border-gray-100"
              >
                + Add Zone
              </button>
            </div>
          </section>

          {/* Live preview */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/40 mb-3 flex items-center gap-1.5">
              <Calculator size={13} /> Live Fare Preview
            </h2>
            <div className="bg-[#0F2B4C] rounded-xl p-6 text-white">
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-xs text-white/40 mb-2">Vehicle</label>
                  <select
                    value={previewVeh}
                    onChange={(e) => setPreviewVeh(e.target.value as VehicleKey)}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
                  >
                    {VEHICLE_TYPES.map((v) => (
                      <option key={v.key} value={v.key} className="text-black">{v.emoji} {v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-2">Distance (km)</label>
                  <input
                    type="number" min={1} value={previewKm} onChange={(e) => setPreviewKm(Number(e.target.value))}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-2">Duration (min)</label>
                  <input
                    type="number" min={0} value={previewMin} onChange={(e) => setPreviewMin(Number(e.target.value))}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center border-t border-white/10 pt-5">
                <div>
                  <p className="text-xs text-white/40 mb-1">Customer Pays</p>
                  <p className="text-2xl font-black text-white">₦{previewGross.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40 mb-1">Driver Earns ({Math.round((1 - config.platformCut) * 100)}%)</p>
                  <p className="text-2xl font-black text-[#3A7BD5]">₦{previewDriver.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40 mb-1">Platform ({Math.round(config.platformCut * 100)}%)</p>
                  <p className="text-2xl font-black text-emerald-400">₦{previewPlatform.toLocaleString()}</p>
                </div>
              </div>
              {(config.surgeActive || config.fuelAdjustPercent !== 0 || config.fxAdjustPercent !== 0) && (
                <p className="text-xs text-white/30 mt-4 text-center">
                  Includes: {[
                    config.surgeActive && `${config.surgeMultiplier}× surge`,
                    config.fuelAdjustPercent && `${config.fuelAdjustPercent}% fuel`,
                    config.fxAdjustPercent && `${config.fxAdjustPercent}% FX`,
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
