'use client';
import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api';
import { naira } from '@/lib/money';
import { useConfirm } from '@/components/ConfirmDialog';
import {
  Map as MapIcon, Plus, Save, Trash2, X, AlertCircle, Lock,
  Eye, EyeOff, PlayCircle, Ban, CheckCircle2,
} from 'lucide-react';

/**
 * SEIRS Zones.
 *
 * Hotspot circles, restricted sub-zones and geopolitical overrides were
 * three separate forms for one idea, all writing into a rate-card column
 * that is null on the live card, so all three were inert. None of them
 * could say an area is CLOSED either, and a curfew is not a price:
 * charging 50% more to enter somewhere dangerous is an incentive, not a
 * control. This page replaces all three.
 *
 * Map drawing is deliberately not here yet. A working form that can
 * declare a closure tonight is worth more than half a map that cannot,
 * and every shape this page writes (circle centre and radius, polygon
 * ring, state, geopolitical zone) is exactly what a drawing tool would
 * produce, so adding one later is an input change and not a data change.
 */

type ZoneStatus = 'open' | 'surcharged' | 'no_pickup' | 'no_dropoff' | 'closed';
type ShapeKind  = 'circle' | 'polygon' | 'state' | 'geozone';
type WindowMode = 'always' | 'daily' | 'dateRange';

interface ZoneEffects {
  rateMultiplier?:    number;
  surchargePct?:      number;
  fuelPriceOverride?: { petrolNgn?: number; dieselNgn?: number };
  vehicleBans?:       string[];
}

interface Zone {
  id:        string;
  name:      string;
  colour:    string;
  shape:     any;
  status:    ZoneStatus;
  effects:   ZoneEffects;
  active:    { mode: WindowMode; dailyFrom?: string; dailyTo?: string; startsAt?: string | null; endsAt?: string | null };
  reason:    string;
  priority:  number;
  published: boolean;
  publishedAt: string | null;
}

const STATUS_LABEL: Record<ZoneStatus, string> = {
  open:       'Open',
  surcharged: 'Surcharged',
  no_pickup:  'No collections',
  no_dropoff: 'No deliveries in',
  closed:     'Closed',
};

const STATUS_HELP: Record<ZoneStatus, string> = {
  open:
    'Allowed. Effects still apply, so this is how a cheaper or a quietly dearer area works with no warning shown to the sender.',
  surcharged:
    'Allowed, and the quote carries a line naming this zone and its reason. An uplift is never silent.',
  no_pickup:
    'Refused as an ORIGIN, allowed as a destination. Deliveries INTO the area still work. Use this when somewhere cannot be collected from but can still receive.',
  no_dropoff:
    'Refused as a DESTINATION, allowed as an origin. Collections OUT of the area still work, which is what matters when people are leaving.',
  closed:
    'Refused at both ends. No quote, no booking, no rider offered the job.',
};

const BLOCKING: ZoneStatus[] = ['no_pickup', 'no_dropoff', 'closed'];
const isBlocking = (s: ZoneStatus) => BLOCKING.includes(s);

/**
 * The colour a zone reads as on a map, per the founder's key: blue for a
 * multiplier under 1.0 (cheaper), green for open, amber for surcharged,
 * red for anything that refuses work. Closed takes a solid red fill and
 * the one-directional blocks take stripes, because a full stop and a
 * half stop must not look identical at a glance.
 */
function swatchStyle(z: { status: ZoneStatus; effects?: ZoneEffects }): React.CSSProperties {
  const mult = Number(z.effects?.rateMultiplier);
  if (z.status === 'closed') return { background: '#DC2626' };
  if (z.status === 'no_pickup' || z.status === 'no_dropoff') {
    return {
      backgroundImage:
        'repeating-linear-gradient(45deg, #DC2626 0 5px, #FCA5A5 5px 10px)',
    };
  }
  if (z.status === 'surcharged') return { background: '#F59E0B' };
  if (Number.isFinite(mult) && mult > 0 && mult < 1) return { background: '#3A7BD5' };
  return { background: '#16A34A' };
}

const VEHICLES = [
  { id: 'bicycle',     label: 'Bicycle'     },
  { id: 'motorcycle',  label: 'Okada'       },
  { id: 'tricycle',    label: 'Keke'        },
  { id: 'car',         label: 'Car'         },
  { id: 'van',         label: 'Danfo / Van' },
  { id: 'truck_small', label: 'Small truck' },
  { id: 'truck_large', label: 'Large truck' },
];

function shapeSummary(shape: any, states: Array<{ code: string; name: string }>): string {
  if (!shape) return 'No shape';
  switch (shape.kind) {
    case 'circle':
      return Number(shape.radiusKm).toFixed(1) + ' km around ' +
        Number(shape.lat).toFixed(4) + ', ' + Number(shape.lng).toFixed(4);
    case 'polygon':
      return (shape.points?.length ?? 0) + '-point area';
    case 'state':
      return (states.find(s => s.code === shape.stateCode)?.name ?? shape.stateCode) + ' State';
    case 'geozone':
      return shape.geozone + ' geopolitical zone';
    default:
      return 'Unknown shape';
  }
}

function windowSummary(active: Zone['active']): string {
  if (!active || active.mode === 'always') return 'Always on';
  if (active.mode === 'daily') return 'Daily ' + (active.dailyFrom ?? '?') + ' to ' + (active.dailyTo ?? '?');
  const from = active.startsAt ? new Date(active.startsAt).toLocaleString('en-NG') : 'now';
  const to   = active.endsAt   ? new Date(active.endsAt).toLocaleString('en-NG')   : 'further notice';
  return from + ' until ' + to;
}

function effectsSummary(fx: ZoneEffects | undefined): string[] {
  const out: string[] = [];
  if (!fx) return out;
  const m = Number(fx.rateMultiplier);
  if (Number.isFinite(m) && m > 0 && m !== 1) {
    out.push(m < 1 ? m.toFixed(2) + 'x (cheaper)' : m.toFixed(2) + 'x');
  }
  const p = Number(fx.surchargePct);
  if (Number.isFinite(p) && p !== 0) out.push('+' + p + '% surcharge');
  if (fx.fuelPriceOverride?.petrolNgn) out.push('Petrol ' + naira(fx.fuelPriceOverride.petrolNgn) + '/L');
  if (fx.fuelPriceOverride?.dieselNgn) out.push('Diesel ' + naira(fx.fuelPriceOverride.dieselNgn) + '/L');
  if (fx.vehicleBans?.length) out.push('Bans ' + fx.vehicleBans.join(', '));
  return out;
}

/** For a datetime-local input, which will not read an ISO string with a Z. */
function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

const BLANK = {
  name: '',
  colour: '#3A7BD5',
  shapeKind: 'circle' as ShapeKind,
  lat: '', lng: '', radiusKm: '',
  polygonText: '',
  stateCode: 'LA',
  geozone: 'SW',
  status: 'open' as ZoneStatus,
  rateMultiplier: '',
  surchargePct: '',
  petrolNgn: '', dieselNgn: '',
  vehicleBans: [] as string[],
  windowMode: 'always' as WindowMode,
  dailyFrom: '18:00', dailyTo: '06:00',
  startsAt: '', endsAt: '',
  reason: '',
  priority: '0',
  published: false,
};

export default function ZonesPage() {
  const [zones,   setZones]   = useState<Zone[]>([]);
  const [options, setOptions] = useState<{ states: Array<{ code: string; name: string; zone: string }>; geozones: string[]; statuses: ZoneStatus[] }>({ states: [], geozones: [], statuses: [] });
  const [perms,   setPerms]   = useState<{ canClose: boolean; canPrice: boolean }>({ canClose: false, canPrice: false });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [editing,  setEditing]  = useState<Zone | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft,    setDraft]    = useState({ ...BLANK });
  const [saving,   setSaving]   = useState(false);
  const [formError, setFormError] = useState('');

  const [testOpen,   setTestOpen]   = useState(false);
  const [test,       setTest]       = useState({ pLat: '', pLng: '', dLat: '', dLng: '', vehicleType: '', at: '' });
  const [testResult, setTestResult] = useState<any>(null);
  const [testError,  setTestError]  = useState('');

  const confirm = useConfirm();

  const load = async () => {
    setLoading(true);
    try {
      const [z, o, p] = await Promise.all([
        adminApi.zones.list(),
        adminApi.zones.options(),
        adminApi.zones.permissions(),
      ]);
      setZones(Array.isArray(z) ? z : []);
      setOptions(o ?? { states: [], geozones: [], statuses: [] });
      setPerms(p ?? { canClose: false, canPrice: false });
      setError('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not load zones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  /**
   * What the draft would need in permissions if it were saved right now.
   * Mirrors the server rule so a control is disabled rather than offered
   * and then refused: a fully enabled screen whose every save 403s is
   * its own bug, and this dashboard has shipped that bug before.
   */
  const draftNeeds = useMemo(() => {
    const needsClose = isBlocking(draft.status) || draft.vehicleBans.length > 0;
    const mult = Number(draft.rateMultiplier);
    const pct  = Number(draft.surchargePct);
    const needsPrice =
      (draft.rateMultiplier !== '' && Number.isFinite(mult) && mult !== 1) ||
      (draft.surchargePct !== '' && Number.isFinite(pct) && pct !== 0) ||
      Number(draft.petrolNgn) > 0 || Number(draft.dieselNgn) > 0 ||
      draft.status === 'surcharged';
    return { needsClose, needsPrice };
  }, [draft]);

  const draftAllowed =
    (!draftNeeds.needsClose || perms.canClose) &&
    (!draftNeeds.needsPrice || perms.canPrice);

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setDraft({ ...BLANK });
    setFormError('');
  };

  const openEdit = (z: Zone) => {
    setEditing(z);
    setCreating(false);
    setFormError('');
    setDraft({
      name: z.name,
      colour: z.colour ?? '#3A7BD5',
      shapeKind: (z.shape?.kind ?? 'circle') as ShapeKind,
      lat: z.shape?.kind === 'circle' ? String(z.shape.lat ?? '') : '',
      lng: z.shape?.kind === 'circle' ? String(z.shape.lng ?? '') : '',
      radiusKm: z.shape?.kind === 'circle' ? String(z.shape.radiusKm ?? '') : '',
      polygonText: z.shape?.kind === 'polygon'
        ? (z.shape.points ?? []).map((p: any) => p.lat + ', ' + p.lng).join('\n')
        : '',
      stateCode: z.shape?.kind === 'state' ? z.shape.stateCode : 'LA',
      geozone:   z.shape?.kind === 'geozone' ? z.shape.geozone : 'SW',
      status: z.status,
      rateMultiplier: z.effects?.rateMultiplier != null ? String(z.effects.rateMultiplier) : '',
      surchargePct:   z.effects?.surchargePct   != null ? String(z.effects.surchargePct)   : '',
      petrolNgn: z.effects?.fuelPriceOverride?.petrolNgn != null ? String(z.effects.fuelPriceOverride.petrolNgn) : '',
      dieselNgn: z.effects?.fuelPriceOverride?.dieselNgn != null ? String(z.effects.fuelPriceOverride.dieselNgn) : '',
      vehicleBans: Array.isArray(z.effects?.vehicleBans) ? [...z.effects.vehicleBans] : [],
      windowMode: z.active?.mode ?? 'always',
      dailyFrom: z.active?.dailyFrom ?? '18:00',
      dailyTo:   z.active?.dailyTo   ?? '06:00',
      startsAt: toLocalInput(z.active?.startsAt),
      endsAt:   toLocalInput(z.active?.endsAt),
      reason: z.reason ?? '',
      priority: String(z.priority ?? 0),
      published: z.published,
    });
  };

  const close = () => { setEditing(null); setCreating(false); setFormError(''); };

  const buildShape = () => {
    switch (draft.shapeKind) {
      case 'circle':
        return { kind: 'circle', lat: Number(draft.lat), lng: Number(draft.lng), radiusKm: Number(draft.radiusKm) };
      case 'polygon': {
        const points = draft.polygonText
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .map(line => {
            const [a, b] = line.split(',').map(v => Number(v.trim()));
            return { lat: a, lng: b };
          });
        return { kind: 'polygon', points };
      }
      case 'state':   return { kind: 'state', stateCode: draft.stateCode };
      case 'geozone': return { kind: 'geozone', geozone: draft.geozone };
    }
  };

  const buildBody = () => {
    const effects: ZoneEffects = {};
    if (draft.rateMultiplier !== '') effects.rateMultiplier = Number(draft.rateMultiplier);
    if (draft.surchargePct   !== '') effects.surchargePct   = Number(draft.surchargePct);
    if (draft.petrolNgn !== '' || draft.dieselNgn !== '') {
      effects.fuelPriceOverride = {};
      if (draft.petrolNgn !== '') effects.fuelPriceOverride.petrolNgn = Number(draft.petrolNgn);
      if (draft.dieselNgn !== '') effects.fuelPriceOverride.dieselNgn = Number(draft.dieselNgn);
    }
    if (draft.vehicleBans.length > 0) effects.vehicleBans = draft.vehicleBans;

    const active: any = { mode: draft.windowMode };
    if (draft.windowMode === 'daily') {
      active.dailyFrom = draft.dailyFrom;
      active.dailyTo   = draft.dailyTo;
    }
    if (draft.windowMode === 'dateRange') {
      active.startsAt = draft.startsAt ? new Date(draft.startsAt).toISOString() : null;
      active.endsAt   = draft.endsAt   ? new Date(draft.endsAt).toISOString()   : null;
    }

    return {
      name: draft.name,
      colour: draft.colour,
      shape: buildShape(),
      status: draft.status,
      effects,
      active,
      reason: draft.reason,
      priority: Number(draft.priority) || 0,
      published: draft.published,
    };
  };

  const save = async () => {
    setSaving(true);
    setFormError('');
    try {
      if (editing) await adminApi.zones.update(editing.id, buildBody());
      else         await adminApi.zones.create(buildBody());
      close();
      await load();
    } catch (e: any) {
      setFormError(e?.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (z: Zone) => {
    if (!z.published && isBlocking(z.status)) {
      const ok = await confirm({
        title: 'Publish "' + z.name + '" as ' + STATUS_LABEL[z.status] + '?',
        message:
          'This takes effect on the next quote. New bookings stop immediately. Deliveries already on the road continue, because stranding a parcel is worse than completing one, and riders inside the area are told rather than logged out.',
        confirmLabel: 'Publish',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await adminApi.zones.setPublished(z.id, !z.published);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not change publish state');
    }
  };

  const remove = async (z: Zone) => {
    const ok = await confirm({
      title: 'Delete zone "' + z.name + '"?',
      message: isBlocking(z.status)
        ? 'This zone currently refuses work. Deleting it reopens the area on the next quote. This cannot be undone.'
        : 'This zone changes what jobs cost here. Deleting it returns the area to standard pricing. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminApi.zones.deleteOne(z.id);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete');
    }
  };

  const runTest = async () => {
    setTestError('');
    setTestResult(null);
    try {
      const body: any = {
        pickup: { latitude: Number(test.pLat), longitude: Number(test.pLng) },
        vehicleType: test.vehicleType || null,
        at: test.at ? new Date(test.at).toISOString() : null,
      };
      if (test.dLat !== '' && test.dLng !== '') {
        body.dropoff = { latitude: Number(test.dLat), longitude: Number(test.dLng) };
      }
      setTestResult(await adminApi.zones.preview(body));
    } catch (e: any) {
      setTestError(e?.message ?? 'Could not run the test');
    }
  };

  const field = 'w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm';
  const label = 'block text-xs font-semibold text-[#0F2B4C] mb-1';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <MapIcon size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Zones</h1>
            <p className="text-sm text-gray-500">
              One place to say what an area costs, and the only place that can say an area is closed.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTestOpen(v => !v)}
            className="flex items-center gap-2 border border-[#E5E7EB] text-[#0F2B4C] text-sm font-semibold px-3 py-2 rounded-lg hover:bg-gray-50"
          >
            <PlayCircle size={15} /> Test a job
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#2f6cc0]"
          >
            <Plus size={15} /> New zone
          </button>
        </div>
      </div>

      {(!perms.canClose || !perms.canPrice) && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <Lock size={15} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Your access here is partial.</p>
            <p className="text-xs mt-0.5">
              {perms.canClose ? 'You can close and reopen areas.' : 'You cannot close or reopen areas (needs zones.close).'}
              {' '}
              {perms.canPrice ? 'You can change what an area costs.' : 'You cannot change what an area costs (needs zones.price).'}
              {' '}Ask a super admin to grant the missing half.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Colour key. A full stop and a half stop must not look the same. */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1.5"><i className="w-4 h-4 rounded" style={{ background: '#16A34A' }} /> Open</span>
        <span className="flex items-center gap-1.5"><i className="w-4 h-4 rounded" style={{ background: '#3A7BD5' }} /> Cheaper (multiplier under 1.0)</span>
        <span className="flex items-center gap-1.5"><i className="w-4 h-4 rounded" style={{ background: '#F59E0B' }} /> Surcharged</span>
        <span className="flex items-center gap-1.5"><i className="w-4 h-4 rounded" style={{ background: '#DC2626' }} /> Closed (both ends)</span>
        <span className="flex items-center gap-1.5">
          <i className="w-4 h-4 rounded" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #DC2626 0 5px, #FCA5A5 5px 10px)' }} />
          One-way block (collections or deliveries only)
        </span>
      </div>

      {testOpen && (
        <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-4 space-y-3">
          <p className="text-sm font-bold text-[#0F2B4C]">Test a job against the live zones</p>
          <p className="text-xs text-gray-500">
            Answers for the instant you give, not for now, so a 7pm pickup can be checked against a 6pm curfew this afternoon.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div><label className={label}>Pickup lat</label><input className={field} value={test.pLat} onChange={e => setTest({ ...test, pLat: e.target.value })} /></div>
            <div><label className={label}>Pickup lng</label><input className={field} value={test.pLng} onChange={e => setTest({ ...test, pLng: e.target.value })} /></div>
            <div><label className={label}>Drop lat</label><input className={field} value={test.dLat} onChange={e => setTest({ ...test, dLat: e.target.value })} /></div>
            <div><label className={label}>Drop lng</label><input className={field} value={test.dLng} onChange={e => setTest({ ...test, dLng: e.target.value })} /></div>
            <div>
              <label className={label}>Vehicle</label>
              <select className={field} value={test.vehicleType} onChange={e => setTest({ ...test, vehicleType: e.target.value })}>
                <option value="">Any</option>
                {VEHICLES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
            <div><label className={label}>At</label><input type="datetime-local" className={field} value={test.at} onChange={e => setTest({ ...test, at: e.target.value })} /></div>
          </div>
          <button onClick={runTest} className="bg-[#0F2B4C] text-white text-sm font-semibold px-4 py-2 rounded-lg">Run test</button>
          {testError && <p className="text-xs text-red-600">{testError}</p>}
          {testResult && (
            <div className="text-sm">
              {testResult.refusal ? (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700">
                  <Ban size={15} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Refused at the {testResult.refusal.end}: {testResult.refusal.zoneName}</p>
                    <p className="text-xs mt-0.5">{testResult.refusal.reason}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-800">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Allowed</p>
                    <p className="text-xs mt-0.5">
                      Multiplier {testResult.rateMultiplier ?? 'unchanged'}, surcharge +{testResult.surchargePct ?? 0}% across both ends.
                      {testResult.notices?.length
                        ? ' Shown to the sender as: ' + testResult.notices.map((n: any) => n.zoneName + ' (' + n.reason + ')').join('; ')
                        : ' Nothing is shown to the sender.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading zones…</div>
      ) : zones.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] px-6 py-14 text-center">
          <p className="text-sm font-semibold text-[#0F2B4C]">No zones yet.</p>
          <p className="text-xs text-gray-500 mt-1">
            Nothing is priced or closed by area. Create one to change that.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
          {zones.map(z => (
            <div key={z.id} className="px-4 py-3 flex items-start gap-4">
              <i className="w-4 h-10 rounded shrink-0 mt-0.5" style={swatchStyle(z)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-[#0F2B4C]">{z.name}</p>
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${
                    isBlocking(z.status) ? 'bg-red-100 text-red-700'
                      : z.status === 'surcharged' ? 'bg-amber-100 text-amber-700'
                      : 'bg-green-100 text-green-700'}`}>
                    {STATUS_LABEL[z.status]}
                  </span>
                  {z.published
                    ? <span className="text-[10px] text-green-700 flex items-center gap-1"><Eye size={11} /> live</span>
                    : <span className="text-[10px] text-gray-400 flex items-center gap-1"><EyeOff size={11} /> draft</span>}
                  <span className="text-[10px] text-gray-400">priority {z.priority}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {shapeSummary(z.shape, options.states)} · {windowSummary(z.active)}
                </p>
                {effectsSummary(z.effects).length > 0 && (
                  <p className="text-xs text-gray-600 mt-1">{effectsSummary(z.effects).join(' · ')}</p>
                )}
                {z.reason && <p className="text-xs text-gray-500 mt-1 italic">“{z.reason}”</p>}
              </div>
              <button onClick={() => togglePublish(z)} className="text-xs text-[#3A7BD5] font-semibold hover:underline shrink-0">
                {z.published ? 'Unpublish' : 'Publish'}
              </button>
              <button onClick={() => openEdit(z)} className="text-xs text-[#3A7BD5] font-semibold hover:underline shrink-0">
                Edit
              </button>
              <button onClick={() => remove(z)} className="text-red-500 hover:text-red-700 shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {(editing || creating) && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={close} />
          <aside className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl z-50 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[#E5E7EB] flex items-start justify-between p-4 z-10">
              <h2 className="text-base font-bold text-[#0F2B4C]">
                {creating ? 'New zone' : 'Edit ' + (editing?.name ?? '')}
              </h2>
              <button onClick={close} className="p-1 hover:bg-gray-100 rounded"><X size={18} className="text-gray-500" /></button>
            </div>

            <div className="p-4 space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={label}>Name</label>
                  <input className={field} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Ikeja curfew area" />
                </div>
                <div>
                  <label className={label}>Priority</label>
                  <input className={field} value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value })} />
                  <p className="text-[10px] text-gray-400 mt-1">Highest wins where zones overlap. A block always wins regardless.</p>
                </div>
              </div>

              {/* Shape */}
              <div>
                <label className={label}>Shape</label>
                <div className="flex gap-2 mb-2">
                  {(['circle', 'polygon', 'state', 'geozone'] as ShapeKind[]).map(k => (
                    <button
                      key={k}
                      onClick={() => setDraft({ ...draft, shapeKind: k })}
                      className={`text-xs px-3 py-1.5 rounded-lg border ${draft.shapeKind === k ? 'bg-[#0F2B4C] text-white border-[#0F2B4C]' : 'border-[#E5E7EB] text-gray-600'}`}
                    >
                      {k === 'geozone' ? 'geopolitical zone' : k}
                    </button>
                  ))}
                </div>
                {draft.shapeKind === 'circle' && (
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className={label}>Centre latitude</label><input className={field} value={draft.lat} onChange={e => setDraft({ ...draft, lat: e.target.value })} placeholder="6.6018" /></div>
                    <div><label className={label}>Centre longitude</label><input className={field} value={draft.lng} onChange={e => setDraft({ ...draft, lng: e.target.value })} placeholder="3.3515" /></div>
                    <div><label className={label}>Radius (km)</label><input className={field} value={draft.radiusKm} onChange={e => setDraft({ ...draft, radiusKm: e.target.value })} placeholder="4" /></div>
                  </div>
                )}
                {draft.shapeKind === 'polygon' && (
                  <div>
                    <textarea
                      className={field + ' font-mono h-32'}
                      value={draft.polygonText}
                      onChange={e => setDraft({ ...draft, polygonText: e.target.value })}
                      placeholder={'6.6018, 3.3515\n6.6100, 3.3600\n6.5900, 3.3700'}
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                      One “latitude, longitude” per line, at least three. The ring closes itself.
                    </p>
                  </div>
                )}
                {draft.shapeKind === 'state' && (
                  <select className={field} value={draft.stateCode} onChange={e => setDraft({ ...draft, stateCode: e.target.value })}>
                    {options.states.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                  </select>
                )}
                {draft.shapeKind === 'geozone' && (
                  <select className={field} value={draft.geozone} onChange={e => setDraft({ ...draft, geozone: e.target.value })}>
                    {options.geozones.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                )}
              </div>

              {/* Status */}
              <div>
                <label className={label}>Status</label>
                <select
                  className={field}
                  value={draft.status}
                  onChange={e => setDraft({ ...draft, status: e.target.value as ZoneStatus })}
                >
                  {(['open', 'surcharged', 'no_pickup', 'no_dropoff', 'closed'] as ZoneStatus[]).map(s => (
                    <option key={s} value={s} disabled={isBlocking(s) && !perms.canClose}>
                      {STATUS_LABEL[s]}{isBlocking(s) && !perms.canClose ? ' (needs zones.close)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1.5 leading-snug">{STATUS_HELP[draft.status]}</p>
              </div>

              {/* Effects */}
              <div className={perms.canPrice ? '' : 'opacity-60'}>
                <label className={label}>Effects</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Rate multiplier</label>
                    <input className={field} disabled={!perms.canPrice} value={draft.rateMultiplier}
                      onChange={e => setDraft({ ...draft, rateMultiplier: e.target.value })} placeholder="1.00" />
                    <p className="text-[10px] text-gray-400 mt-1">
                      Under 1.00 is cheaper, and that is a real setting: some corridors cost less to serve, and a discount is how demand gets seeded somewhere new.
                    </p>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Surcharge %</label>
                    <input className={field} disabled={!perms.canPrice} value={draft.surchargePct}
                      onChange={e => setDraft({ ...draft, surchargePct: e.target.value })} placeholder="0" />
                    <p className="text-[10px] text-gray-400 mt-1">
                      Summed with the other end&apos;s zone and always shown on the quote with the reason below.
                    </p>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Petrol override (NGN/litre)</label>
                    <input className={field} disabled={!perms.canPrice} value={draft.petrolNgn}
                      onChange={e => setDraft({ ...draft, petrolNgn: e.target.value })} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Diesel override (NGN/litre)</label>
                    <input className={field} disabled={!perms.canPrice} value={draft.dieselNgn}
                      onChange={e => setDraft({ ...draft, dieselNgn: e.target.value })} placeholder="0.00" />
                  </div>
                </div>

                <label className={label + ' mt-3'}>Vehicles banned here</label>
                <div className="flex flex-wrap gap-2">
                  {VEHICLES.map(v => {
                    const on = draft.vehicleBans.includes(v.id);
                    return (
                      <button
                        key={v.id}
                        disabled={!perms.canClose}
                        onClick={() => setDraft({
                          ...draft,
                          vehicleBans: on
                            ? draft.vehicleBans.filter(x => x !== v.id)
                            : [...draft.vehicleBans, v.id],
                        })}
                        className={`text-xs px-3 py-1.5 rounded-lg border ${on ? 'bg-red-600 text-white border-red-600' : 'border-[#E5E7EB] text-gray-600'} ${perms.canClose ? '' : 'opacity-50 cursor-not-allowed'}`}
                      >
                        {v.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  A ban refuses that class at either end and names this zone. It is a refusal, so it needs zones.close.
                </p>
              </div>

              {/* Window */}
              <div>
                <label className={label}>When is it on?</label>
                <div className="flex gap-2 mb-2">
                  {(['always', 'daily', 'dateRange'] as WindowMode[]).map(m => (
                    <button
                      key={m}
                      onClick={() => setDraft({ ...draft, windowMode: m })}
                      className={`text-xs px-3 py-1.5 rounded-lg border ${draft.windowMode === m ? 'bg-[#0F2B4C] text-white border-[#0F2B4C]' : 'border-[#E5E7EB] text-gray-600'}`}
                    >
                      {m === 'dateRange' ? 'date range' : m}
                    </button>
                  ))}
                </div>
                {draft.windowMode === 'daily' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={label}>From</label><input type="time" className={field} value={draft.dailyFrom} onChange={e => setDraft({ ...draft, dailyFrom: e.target.value })} /></div>
                    <div><label className={label}>To</label><input type="time" className={field} value={draft.dailyTo} onChange={e => setDraft({ ...draft, dailyTo: e.target.value })} /></div>
                    <p className="col-span-2 text-[10px] text-gray-400">
                      Nigerian local time. An end earlier than the start is an overnight curfew, which is the normal case.
                    </p>
                  </div>
                )}
                {draft.windowMode === 'dateRange' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={label}>Starts</label><input type="datetime-local" className={field} value={draft.startsAt} onChange={e => setDraft({ ...draft, startsAt: e.target.value })} /></div>
                    <div><label className={label}>Ends</label><input type="datetime-local" className={field} value={draft.endsAt} onChange={e => setDraft({ ...draft, endsAt: e.target.value })} /></div>
                    <p className="col-span-2 text-[10px] text-gray-400">
                      Leave the end blank for “until further notice”, which is how an emergency is actually declared.
                    </p>
                  </div>
                )}
              </div>

              {/* Reason */}
              <div>
                <label className={label}>Reason shown to senders and riders</label>
                <textarea
                  className={field + ' h-20'}
                  value={draft.reason}
                  onChange={e => setDraft({ ...draft, reason: e.target.value })}
                  placeholder="Curfew in force across Ikeja until further notice. Collections resume when it lifts."
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Required for any block, any surcharge and any vehicle ban. A refusal with no reason reads as a broken app rather than a decision.
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm text-[#0F2B4C]">
                <input type="checkbox" checked={draft.published} onChange={e => setDraft({ ...draft, published: e.target.checked })} />
                Publish now (a draft zone changes nothing)
              </label>

              {!draftAllowed && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                  <Lock size={14} className="mt-0.5 shrink-0" />
                  This zone needs {draftNeeds.needsClose && !perms.canClose ? 'zones.close' : ''}
                  {draftNeeds.needsClose && !perms.canClose && draftNeeds.needsPrice && !perms.canPrice ? ' and ' : ''}
                  {draftNeeds.needsPrice && !perms.canPrice ? 'zones.price' : ''}, which you do not hold.
                </div>
              )}

              {formError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                  <AlertCircle size={14} /> {formError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={save}
                  disabled={saving || !draftAllowed}
                  className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  <Save size={15} /> {saving ? 'Saving…' : 'Save zone'}
                </button>
                <button onClick={close} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
