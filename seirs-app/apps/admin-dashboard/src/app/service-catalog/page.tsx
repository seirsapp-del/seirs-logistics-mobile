/**
 * Admin · Service Catalog editor.
 *
 * Each ServiceCategory drives suggested vehicle, dwell setup time, and
 * surcharge for that kind of cargo. Admin can toggle categories active/
 * inactive (pause platform-wide), edit dwell + surcharge, and adjust
 * the safety rules that block or warn certain vehicles.
 *
 * Saves are per-row via PUT /admin/service-catalog/:code. No versioning
 * here — categories are simple enough that history isn't worth the
 * extra UI. Apps refresh from /config/service-catalog within 5 min.
 */
'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Save, Loader2, AlertCircle, Pause, Play } from 'lucide-react';

const VEHICLE_KEYS = ['bicycle', 'motorcycle', 'tricycle', 'car', 'van', 'truck_small', 'truck_large'] as const;
const VEHICLE_LABEL: Record<string, string> = {
  bicycle: 'Bicycle', motorcycle: 'Motorcycle', tricycle: 'Tricycle',
  car: 'Car', van: 'Van', truck_small: 'Small Truck', truck_large: 'Large Truck',
};

type Cat = any;

export default function ServiceCatalogPage() {
  const [categories, setCategories] = useState<Cat[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const cats = await adminApi.serviceCatalog.list();
      setCategories(cats);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load service catalog');
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const updateCategory = (idx: number, patch: Partial<Cat>) => {
    setCategories(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };

  const updateSafety = (idx: number, patch: any) => {
    setCategories(prev => prev.map((c, i) => i === idx
      ? { ...c, safetyRules: { ...(c.safetyRules ?? {}), ...patch } }
      : c));
  };

  const toggleVehicleInList = (idx: number, listName: 'blockedVehicles' | 'warningVehicles' | 'suggestedVehicles', v: string) => {
    setCategories(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      if (listName === 'suggestedVehicles') {
        const cur: string[] = c.suggestedVehicles ?? [];
        const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
        return { ...c, suggestedVehicles: next };
      }
      const safety = c.safetyRules ?? {};
      const cur: string[] = safety[listName] ?? [];
      const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
      return { ...c, safetyRules: { ...safety, [listName]: next } };
    }));
  };

  const save = async (cat: Cat) => {
    setSavingCode(cat.code);
    try {
      await adminApi.serviceCatalog.upsert(cat.code, {
        name: cat.name,
        examples: cat.examples,
        suggestedVehicles: cat.suggestedVehicles,
        setupDwellMinutes: Number(cat.setupDwellMinutes),
        surchargePercent: Number(cat.surchargePercent),
        safetyRules: cat.safetyRules ?? null,
        active: cat.active,
        sortOrder: cat.sortOrder,
      });
      await reload();
    } catch (e: any) {
      alert(e?.message ?? 'Could not save');
    } finally { setSavingCode(null); }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading service catalog…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-red-700">Could not load service catalog</div>
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
    <div className="p-6 max-w-6xl mx-auto pb-20 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Service Catalog</h1>
        <p className="text-sm text-gray-500 mt-1">
          {categories.length} categories. Each drives suggested vehicle, dwell, surcharge, and safety rules.
          Apps refresh from this within 5 min of saving.
        </p>
      </div>

      <div className="space-y-3">
        {categories.map((cat, idx) => (
          <div key={cat.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-start justify-between mb-3 gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={cat.name}
                    onChange={(e) => updateCategory(idx, { name: e.target.value })}
                    className="text-lg font-bold text-gray-900 px-2 py-1 border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none"
                  />
                  <span className="font-mono text-xs text-gray-400">code: {cat.code}</span>
                </div>
                <textarea
                  value={cat.examples}
                  onChange={(e) => updateCategory(idx, { examples: e.target.value })}
                  rows={2}
                  className="mt-2 w-full text-sm text-gray-600 px-2 py-1 border border-gray-200 rounded resize-y focus:border-blue-500 outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateCategory(idx, { active: !cat.active })}
                  className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1.5 border ${
                    cat.active
                      ? 'bg-green-50 border-green-300 text-green-700'
                      : 'bg-gray-100 border-gray-300 text-gray-500'
                  }`}
                >
                  {cat.active ? <><Play className="w-3.5 h-3.5" /> Active</> : <><Pause className="w-3.5 h-3.5" /> Paused</>}
                </button>
                <button
                  onClick={() => save(cat)}
                  disabled={savingCode === cat.code}
                  className="px-3 py-1.5 bg-[#0F2B4C] text-white rounded text-sm font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {savingCode === cat.code ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <Field label="Setup dwell (min)" hint="Base minutes at each stop before weight + buffer.">
                <input
                  type="number"
                  value={cat.setupDwellMinutes}
                  onChange={(e) => updateCategory(idx, { setupDwellMinutes: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                />
              </Field>
              <Field label="Surcharge %" hint="Applied on subtotal (e.g. 20 for fragile +20%).">
                <input
                  type="number"
                  step="0.5"
                  value={cat.surchargePercent}
                  onChange={(e) => updateCategory(idx, { surchargePercent: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                />
              </Field>
              <Field label="Display order" hint="Lower numbers appear first in the picker.">
                <input
                  type="number"
                  value={cat.sortOrder}
                  onChange={(e) => updateCategory(idx, { sortOrder: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                />
              </Field>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-gray-700 mb-2">SUGGESTED VEHICLES (drives auto-pick)</div>
              <div className="flex flex-wrap gap-2">
                {VEHICLE_KEYS.map(v => {
                  const active = (cat.suggestedVehicles ?? []).includes(v);
                  return (
                    <button
                      key={v}
                      onClick={() => toggleVehicleInList(idx, 'suggestedVehicles', v)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${
                        active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-600'
                      }`}
                    >
                      {VEHICLE_LABEL[v]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3">
              <div className="text-xs font-semibold text-gray-700 mb-2">SAFETY: BLOCKED VEHICLES (hard-stop)</div>
              <div className="flex flex-wrap gap-2">
                {VEHICLE_KEYS.map(v => {
                  const active = (cat.safetyRules?.blockedVehicles ?? []).includes(v);
                  return (
                    <button
                      key={v}
                      onClick={() => toggleVehicleInList(idx, 'blockedVehicles', v)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${
                        active ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-300 text-gray-600'
                      }`}
                    >
                      {VEHICLE_LABEL[v]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3">
              <div className="text-xs font-semibold text-gray-700 mb-2">SAFETY: WARNING VEHICLES (soft-warn)</div>
              <div className="flex flex-wrap gap-2">
                {VEHICLE_KEYS.map(v => {
                  const active = (cat.safetyRules?.warningVehicles ?? []).includes(v);
                  return (
                    <button
                      key={v}
                      onClick={() => toggleVehicleInList(idx, 'warningVehicles', v)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${
                        active ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-gray-300 text-gray-600'
                      }`}
                    >
                      {VEHICLE_LABEL[v]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Weight threshold (kg) for warning" hint="Warnings fire above this weight. Leave blank to always warn.">
                <input
                  type="text"
                  value={cat.safetyRules?.weightThresholdKg ?? ''}
                  onChange={(e) => updateSafety(idx, {
                    weightThresholdKg: e.target.value === '' ? null : Number(e.target.value),
                  })}
                  placeholder="(any)"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                />
              </Field>
              <Field label="Warning copy" hint="Message shown to user in the confirm dialog.">
                <input
                  type="text"
                  value={cat.safetyRules?.warningCopy ?? ''}
                  onChange={(e) => updateSafety(idx, { warningCopy: e.target.value })}
                  placeholder="e.g. 'Fragile items above 3kg shouldn't go on a motorcycle.'"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                />
              </Field>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-700 block mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}
