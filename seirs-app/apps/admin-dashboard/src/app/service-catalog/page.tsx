/**
 * Admin · Service catalog editor.
 *
 * One job: control the list of "what are you sending" choices a customer
 * sees, and what each choice does to the price, to how long the rider is
 * expected to spend at the door, and to which vehicles may carry it.
 *
 * Two things about this screen that were invisible and are now said out
 * loud on it:
 *   1. Every card is a draft until its own Save is pressed. There is one
 *      Save per category, not one for the page.
 *   2. It reads /config/service-catalog, the same endpoint the phone apps
 *      read, and that endpoint only returns categories that are switched
 *      ON. Pausing one and saving therefore makes it disappear from this
 *      editor, with no way to bring it back from this dashboard.
 *
 * Saves are per-row via PUT /admin/service-catalog/:code. Apps refresh
 * from /config/service-catalog within 5 min.
 */
'use client';
import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Save, Loader2, AlertCircle, Pause, Play, PencilLine } from 'lucide-react';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm } from '@/components/ConfirmDialog';

const VEHICLE_KEYS = ['bicycle', 'motorcycle', 'tricycle', 'car', 'van', 'truck_small', 'truck_large'] as const;
const VEHICLE_LABEL: Record<string, string> = {
  bicycle: 'Bicycle', motorcycle: 'Motorcycle', tricycle: 'Tricycle',
  car: 'Car', van: 'Van', truck_small: 'Small Truck', truck_large: 'Large Truck',
};

type Cat = any;

export default function ServiceCatalogPage() {
  const [categories, setCategories] = useState<Cat[]>([]);
  /** The rows exactly as the server sent them, to spot unsaved edits. */
  const [saved,      setSaved]      = useState<Cat[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [rowError,   setRowError]   = useState<{ code: string; message: string } | null>(null);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const confirm = useConfirm();

  const reload = async () => {
    setLoading(true);
    try {
      const cats = await adminApi.serviceCatalog.list();
      setCategories(cats);
      setSaved(structuredClone(cats));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load service catalog');
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  /** Which cards have edits nobody has saved. */
  const dirtyCodes = useMemo(() => {
    const before = new Map(saved.map((c: Cat) => [c.code, JSON.stringify(c)]));
    return new Set(
      categories.filter((c: Cat) => before.get(c.code) !== JSON.stringify(c)).map((c: Cat) => c.code),
    );
  }, [categories, saved]);

  /**
   * Every card is a draft until its own Save. Closing the tab with a
   * half-edited card threw the work away without a word.
   */
  useEffect(() => {
    if (dirtyCodes.size === 0) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyCodes]);

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

  /**
   * Switching a category off is the heaviest thing on this page and it
   * used to be a one-click toggle labelled "Active". It removes the
   * choice from every customer's Send screen, and because this editor
   * reads the same switched-on-only list the apps read, the row also
   * vanishes from here the moment it is saved.
   */
  const togglePaused = async (idx: number, cat: Cat) => {
    if (cat.active) {
      const ok = await confirm({
        title:        `Stop offering "${cat.name}" to customers?`,
        message:      `Nobody will be able to pick ${cat.name} when sending something, in any of the apps, from about five minutes after you save.\n\nThis editor only lists categories that are switched on, so once you save, this card disappears from this screen and there is no button anywhere in this dashboard to bring it back. Engineering would have to switch it on in the database. Be sure.`,
        confirmLabel: 'Switch it off',
        danger:       true,
      });
      if (!ok) return;
    }
    updateCategory(idx, { active: !cat.active });
  };

  const save = async (cat: Cat) => {
    const ok = await confirm({
      title:        `Save "${cat.name}" and make it live?`,
      message:      [
        `Customers picking ${cat.name} will be charged ${Number(cat.surchargePercent) || 0}% more than the base price, riders are given ${Number(cat.setupDwellMinutes) || 0} minutes at each stop for it, and ${(cat.safetyRules?.blockedVehicles ?? []).length} vehicle type(s) are refused outright.`,
        cat.active
          ? 'The change reaches all three apps within about five minutes. Anything already booked keeps the price it was quoted.'
          : 'This category is switched OFF, so saving also removes it from every customer Send screen, and from this editor.',
      ].join('\n\n'),
      confirmLabel: 'Save',
      danger:       !cat.active,
    });
    if (!ok) return;

    setSavingCode(cat.code);
    setRowError(null);
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
      // A browser alert can be suppressed after the first one, which on
      // this page reads as "saved" when nothing was saved.
      setRowError({ code: cat.code, message: `Nothing was saved: ${e?.message ?? 'the server refused the request'}. Customers are still being charged the old way.` });
    } finally { setSavingCode(null); }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading the list of things people can send…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="rounded-xl border border-red-200 bg-red-50">
          <EmptyState
            icon={<AlertCircle size={20} />}
            title="The list would not load"
            body={`${error} Nothing is broken for customers: the apps keep using the list they already have.`}
            action={{ label: 'Try again', onClick: reload }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto pb-20 space-y-4">
      <PageIntro
        title="What people can send"
        purpose="The choices a customer picks from when they say what is in the package, and what each choice does to the price, the waiting time and which vehicles are allowed to carry it."
        storageKey="service-catalog"
        help={
          <>
            <p><b>Each card saves on its own.</b> Typing changes nothing until you press that card&apos;s Save. There is no page-wide save.</p>
            <p><b>Saving is live.</b> The three apps pick the change up within about five minutes. Jobs already booked keep the price they were quoted.</p>
            <p><b>Switching a category off hides it from customers</b>, and also hides the card from this screen, because this editor is fed by the same switched-on-only list the apps read. Nothing in this dashboard can switch it back on.</p>
            <p><b>Refused vehicles</b> stop a booking outright. <b>Warn-about vehicles</b> let the customer carry on after reading your warning.</p>
          </>
        }
      />

      <p className="text-sm text-gray-500">
        {/* "12 categories" was a count of the switched-on ones presented
            as the whole catalogue. */}
        {categories.length} categor{categories.length === 1 ? 'y is' : 'ies are'} switched on and being offered to customers.
        Any that were switched off are not listed here.
      </p>

      {dirtyCodes.size > 0 && (
        <div className="sticky top-0 z-20 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          <PencilLine size={16} className="shrink-0" />
          <span>
            <b>{dirtyCodes.size} card{dirtyCodes.size === 1 ? '' : 's'} changed and not saved.</b>{' '}
            Customers are still seeing the old settings. Each card has its own Save.
          </span>
        </div>
      )}

      {categories.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white">
          <EmptyState
            icon={<AlertCircle size={20} />}
            title="No category is switched on"
            body="Customers have nothing to pick from when they say what they are sending, which will block bookings. Tell engineering: nothing on this screen can switch one back on."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((cat, idx) => {
            const dirty = dirtyCodes.has(cat.code);
            return (
              <div key={cat.id} className={`bg-white border rounded-xl p-5 shadow-sm ${dirty ? 'border-amber-300' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between mb-3 gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="text"
                        value={cat.name}
                        onChange={(e) => updateCategory(idx, { name: e.target.value })}
                        title="What the customer sees in the picker"
                        className="text-lg font-bold text-gray-900 px-2 py-1 border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none"
                      />
                      <span
                        className="font-mono text-xs text-gray-400"
                        title="The name the apps use for this category. Quote it when reporting a problem to engineering."
                      >
                        {cat.code}
                      </span>
                      {dirty && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                          Not saved yet
                        </span>
                      )}
                    </div>
                    {/* The textarea had no label at all: it is the "e.g."
                        line the customer reads under the category name. */}
                    <label className="mt-2 block text-xs font-medium text-gray-700">
                      Examples shown to the customer under this choice
                    </label>
                    <textarea
                      value={cat.examples}
                      onChange={(e) => updateCategory(idx, { examples: e.target.value })}
                      rows={2}
                      placeholder="e.g. laptops, phones, glassware"
                      className="mt-1 w-full text-sm text-gray-600 px-2 py-1 border border-gray-200 rounded resize-y focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => togglePaused(idx, cat)}
                      title={cat.active
                        ? 'Customers can pick this. Press to stop offering it.'
                        : 'Customers cannot pick this. Save to make that real.'}
                      className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1.5 border ${
                        cat.active
                          ? 'bg-green-50 border-green-300 text-green-700'
                          : 'bg-gray-100 border-gray-300 text-gray-500'
                      }`}
                    >
                      {cat.active
                        ? <><Play className="w-3.5 h-3.5" /> Customers can pick this</>
                        : <><Pause className="w-3.5 h-3.5" /> Will be switched off on save</>}
                    </button>
                    <button
                      onClick={() => save(cat)}
                      disabled={savingCode === cat.code || !dirty}
                      title={dirty ? 'Make these settings live in all three apps' : 'Nothing has changed on this card'}
                      className="px-3 py-1.5 bg-[#0F2B4C] text-white rounded text-sm font-bold flex items-center gap-1.5 disabled:opacity-40"
                    >
                      {savingCode === cat.code ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {savingCode === cat.code ? 'Saving…' : 'Save this one'}
                    </button>
                  </div>
                </div>

                {rowError?.code === cat.code && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{rowError?.message}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <Field
                    label="Minutes the rider is given at each stop"
                    hint="Time for handling this kind of item, before anything added for weight or for the neighbourhood."
                  >
                    <input
                      type="number"
                      value={cat.setupDwellMinutes}
                      onChange={(e) => updateCategory(idx, { setupDwellMinutes: Number(e.target.value) })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </Field>
                  <Field
                    label="Extra charged for this kind of item (%)"
                    hint="Type 20 for twenty per cent more than the ordinary price. 0 for no extra."
                  >
                    <input
                      type="number"
                      step="0.5"
                      value={cat.surchargePercent}
                      onChange={(e) => updateCategory(idx, { surchargePercent: Number(e.target.value) })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </Field>
                  <Field label="Where it sits in the customer's list" hint="Lower numbers appear nearer the top.">
                    <input
                      type="number"
                      value={cat.sortOrder}
                      onChange={(e) => updateCategory(idx, { sortOrder: Number(e.target.value) })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </Field>
                </div>

                <div className="mt-4">
                  <div className="text-xs font-semibold text-gray-700 mb-2">
                    Vehicles SEIRS suggests for this
                    <span className="ml-1 font-normal text-gray-500">(what the app picks by default)</span>
                  </div>
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
                  {/* "SAFETY: BLOCKED VEHICLES (hard-stop)" is engineer's
                      shorthand for "the customer cannot book this". */}
                  <div className="text-xs font-semibold text-gray-700 mb-2">
                    Vehicles refused for this
                    <span className="ml-1 font-normal text-gray-500">(the customer cannot book it at all)</span>
                  </div>
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
                  <div className="text-xs font-semibold text-gray-700 mb-2">
                    Vehicles we warn about
                    <span className="ml-1 font-normal text-gray-500">(the customer reads the warning and may carry on)</span>
                  </div>
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
                  <Field
                    label="Only warn above this weight (kg)"
                    hint="Leave empty to warn whatever the parcel weighs."
                  >
                    <input
                      type="text"
                      value={cat.safetyRules?.weightThresholdKg ?? ''}
                      onChange={(e) => updateSafety(idx, {
                        weightThresholdKg: e.target.value === '' ? null : Number(e.target.value),
                      })}
                      placeholder="any weight"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </Field>
                  <Field
                    label="The warning the customer reads"
                    hint="Written to the customer, word for word, in the confirm box on their phone."
                  >
                    <input
                      type="text"
                      value={cat.safetyRules?.warningCopy ?? ''}
                      onChange={(e) => updateSafety(idx, { warningCopy: e.target.value })}
                      placeholder="e.g. Fragile items over 3kg are safer in a car than on a motorcycle."
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </Field>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
