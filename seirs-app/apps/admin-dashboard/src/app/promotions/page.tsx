'use client';
import { useEffect, useMemo, useState } from 'react';
import { Percent, Plus, Calendar, Users, Loader2, RefreshCw, X, AlertCircle, AlertTriangle } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { naira, nairaFromKobo } from '@/lib/money';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm, useNotify } from '@/components/ConfirmDialog';

/**
 * Discount codes, and what they cost SEIRS.
 *
 * Every control on this page moves real money out of the business, and
 * the page was silent about all of it. Creating a code was a single
 * unconfirmed click with no statement of what it could cost; pausing a
 * live campaign was another, with nothing saying that customers holding
 * the code would be refused at checkout a second later. So both now say
 * what happens first, and the create form works out the worst case
 * before it is signed off, because "1,000 uses of 50% off, uncapped" is
 * an arithmetic problem nobody should be doing in their head at 6pm.
 */

interface Promo {
  id:              string;
  code:            string;
  type:            'flat_discount' | 'percent' | 'free_delivery';
  value:           number;
  description?:    string;
  validFrom:       string;
  validTo:         string;
  usageLimit:      number;
  usageCount:      number;
  perUserLimit:    number;
  minSubtotalKobo: number;
  maxDiscountKobo: number | null;
  status:          'active' | 'scheduled' | 'expired' | 'paused';
}

const TYPE_LABEL: Record<string, string> = {
  flat_discount: 'Money off',
  percent:       'Percentage off',
  free_delivery: 'Delivery is free',
};

/** Plain words. "active" and "scheduled" are column values, not English. */
const STATUS_LABEL: Record<string, string> = {
  active:    'Live now',
  scheduled: 'Starts later',
  expired:   'Finished',
  paused:    'Paused by staff',
};

const STATUS_STYLES: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  scheduled: 'bg-[#3A7BD5]/10 text-[#3A7BD5]',
  expired:   'bg-gray-100 text-gray-500',
  paused:    'bg-yellow-100 text-yellow-700',
};

const TABS: Array<{ key: string; label: string }> = [
  { key: '',          label: 'All codes'    },
  { key: 'active',    label: 'Live now'     },
  { key: 'scheduled', label: 'Starts later' },
  { key: 'paused',    label: 'Paused'       },
  { key: 'expired',   label: 'Finished'     },
];

export default function PromotionsPage() {
  const [promos,  setPromos]  = useState<Promo[]>([]);
  /* The server sends a real count now, so the screen can stop guessing
     from the rows it happens to be holding. */
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [tab,     setTab]     = useState('');
  const confirm               = useConfirm();
  const notify                = useNotify();

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.promotions.list()
      .then((data: any) => {
        /* The endpoint returns { items, total } now. The array fallback
           stays so a stale deploy of either side degrades to a list
           rather than an empty board, which on a queue reads as
           "nothing to do" rather than "not loaded". */
          setPromos(Array.isArray(data) ? data : (data?.items ?? []));
        setTotal(Number(data?.total ?? (Array.isArray(data) ? data.length : 0)));
      })
      .catch((e: any) => setError(e?.message ?? 'Could not load the codes.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const visible = useMemo(
    () => (tab ? promos.filter(p => p.status === tab) : promos),
    [promos, tab],
  );

  const renderValue = (p: Promo) => {
    if (p.type === 'free_delivery') return 'The whole delivery fee';
    if (p.type === 'percent')       return `${p.value}% off`;
    return `${naira(p.value)} off`;
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-NG', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  // Kobo is how the entity stores a cap. Divide down, then show the kobo:
  // a 2,500.50 cap that renders as 2,501 is a cap nobody can reconcile.
  const ngn = nairaFromKobo;

  // An admin could not previously see that a percentage promo was
  // uncapped, which is how a 50% code on a large delivery gets minted by
  // accident. Uncapped percent promos are called out in red.
  const renderCap = (pr: Promo) => {
    const floor = pr.minSubtotalKobo > 0 ? `only on orders over ${ngn(pr.minSubtotalKobo)}` : null;
    if (pr.maxDiscountKobo != null) {
      return (
        <span className="text-gray-700">
          never more than {ngn(pr.maxDiscountKobo)}
          {floor ? <span className="text-gray-400">, {floor}</span> : null}
        </span>
      );
    }
    if (pr.type === 'percent') {
      return (
        <span className="font-semibold text-red-600">
          No ceiling
          {floor ? <span className="font-normal text-gray-400">, {floor}</span> : null}
        </span>
      );
    }
    return <span className="text-gray-400">{floor ?? 'No ceiling needed'}</span>;
  };

  const togglePause = async (p: Promo) => {
    const pausing = p.status !== 'paused';
    const ok = await confirm({
      title: pausing ? `Pause "${p.code}"?` : `Put "${p.code}" back on?`,
      message: pausing
        ? `Anyone typing ${p.code} at checkout is refused from the moment you confirm, including customers who were told about it today. Bookings already paid for keep their discount.\n\nYou can put it back on from this page at any time.`
        : `${p.code} starts working again immediately, within its dates and its remaining ${p.usageLimit ? `${Math.max(0, p.usageLimit - p.usageCount)} uses` : 'unlimited uses'}.`,
      confirmLabel: pausing ? 'Pause it' : 'Put it back on',
      danger:       pausing,
    });
    if (!ok) return;
    try {
      await adminApi.promotions.update(p.id, { status: pausing ? 'paused' : 'active' });
      load();
    } catch (e: any) {
      void notify({ title: 'Could not change it', message: e?.message ?? 'The server refused it. The code is unchanged.', tone: 'error' });
    }
  };

  const remove = async (p: Promo) => {
    const ok = await confirm({
      title:   `Delete "${p.code}" for good?`,
      message: 'Nobody has used it, so there is nothing to keep. It disappears from this list and the code stops existing.\n\nThis cannot be undone, but you can always create the same code again.',
      confirmLabel: 'Delete it',
      danger:  true,
    });
    if (!ok) return;
    try {
      await adminApi.promotions.remove(p.id);
      load();
    } catch (e: any) {
      void notify({ title: 'Delete failed', message: e?.message ?? 'The server refused it. Nothing was removed.', tone: 'error' });
    }
  };

  const liveCount = promos.filter(p => p.status === 'active').length;

  return (
    <div className="p-8">
      <PageIntro
        title="Promotions"
        purpose="Create and switch off the discount codes customers type at checkout. Every one of them is money SEIRS gives up, so the ceilings matter more than the codes."
        storageKey="promotions"
        help={
          <>
            <p><strong>Create a code</strong> works out the worst case before you sign it off. Read that figure: it is what this campaign can cost if everybody uses it.</p>
            <p><strong>Pause</strong> stops the code working at checkout immediately, including for customers who were sent it. Bookings already paid for keep their discount.</p>
            <p><strong>Delete</strong> is only offered while nobody has used a code. Once one person has, pause it instead so the receipts still make sense.</p>
            <p>A percentage code with no ceiling is the one thing to avoid: half off a large booking is a large number.</p>
          </>
        }
        actions={
          <>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 rounded-lg bg-[#3A7BD5] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2f6cc0]"
            >
              <Plus size={15} /> Create a code
            </button>
          </>
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={load} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-3 gap-4">
        {[
          { label: 'Live right now',        value: liveCount,                                              icon: Percent,  color: 'text-green-600'  },
          { label: 'Waiting to start',      value: promos.filter(p => p.status === 'scheduled').length,    icon: Calendar, color: 'text-[#3A7BD5]' },
          { label: 'Times a code was used', value: promos.reduce((s, p) => s + p.usageCount, 0),            icon: Users,    color: 'text-gray-600'   },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-gray-50">
              <Icon size={18} className={color} />
            </div>
            <div>
              <div className="text-xl font-bold tabular-nums text-[#0F2B4C]">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(t => (
          <button
            key={t.key || 'all'}
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t.key
                ? 'border-[#3A7BD5] bg-[#3A7BD5] text-white'
                : 'border-[#E5E7EB] bg-white text-[#0F2B4C]/50 hover:border-[#0F2B4C]/20'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <span className="text-sm font-semibold text-[#0F2B4C]">Discount codes</span>
          <span className="text-xs text-gray-400 tabular-nums">
            {loading ? 'Loading' : `Showing ${visible.length} of ${promos.length}`}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 size={20} className="mr-2 animate-spin" /> Loading
          </div>
        ) : error ? (
          <EmptyState
            icon={<AlertCircle size={20} />}
            title="The codes could not be loaded"
            body="This is a connection or permission problem, not an empty list."
            action={{ label: 'Try again', onClick: load }}
          />
        ) : visible.length === 0 ? (
          promos.length === 0 ? (
            <EmptyState
              icon={<Percent size={20} />}
              title="No discount code has been created"
              body="Nothing is being given away. Create one when a campaign needs it."
              action={{ label: 'Create a code', onClick: () => setShowForm(true) }}
            />
          ) : (
            <EmptyState
              icon={<Percent size={20} />}
              title={`No codes are ${(TABS.find(t => t.key === tab)?.label ?? '').toLowerCase()}`}
              body="Try another tab above."
              action={{ label: 'Show all codes', onClick: () => setTab('') }}
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">What it gives</th>
                  <th className="px-4 py-3 text-left">Ceiling</th>
                  <th className="px-4 py-3 text-left">Used</th>
                  <th className="px-4 py-3 text-left">Per person</th>
                  <th className="px-4 py-3 text-left">Runs from, until</th>
                  <th className="px-4 py-3 text-left">State</th>
                  <th className="px-4 py-3 text-left" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map(p => (
                  <tr key={p.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-bold tracking-wider text-[#0F2B4C]">
                      {p.code}
                      {p.description && <div className="mt-0.5 font-sans text-[11px] font-normal text-gray-400">{p.description}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-800">{renderValue(p)}</div>
                      <div className="text-[11px] text-gray-400">{TYPE_LABEL[p.type] ?? p.type}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{renderCap(p)}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-600">
                      {p.usageCount} of {p.usageLimit ? p.usageLimit.toLocaleString() : 'no limit'}
                    </td>
                    {/* The per-person limit is the anti-abuse knob and it
                        was not on this screen at all. */}
                    <td className="px-4 py-3 tabular-nums text-gray-600">
                      {p.perUserLimit ? `${p.perUserLimit} time${p.perUserLimit === 1 ? '' : 's'}` : <span className="font-semibold text-red-600">unlimited</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {fmtDate(p.validFrom)}<br />{fmtDate(p.validTo)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[p.status]}`}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <button
                          onClick={() => togglePause(p)}
                          className="text-xs font-medium text-[#3A7BD5] hover:underline"
                        >
                          {p.status === 'paused' ? 'Put it back on' : 'Pause'}
                        </button>
                        {p.usageCount === 0 ? (
                          <button onClick={() => remove(p)} className="text-xs font-medium text-red-500 hover:underline">
                            Delete
                          </button>
                        ) : (
                          <span className="text-xs text-gray-300" title="Somebody has used this code, so the receipts need it to stay">
                            Used, cannot delete
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && <CreatePromoModal onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </div>
  );
}

// Code fallback for the default cap on a percentage promo. Admin-tunable
// via the Fee Catalogue key below once it is seeded; until then this
// value applies. Every perk needs a ceiling, so a percent promo is never
// created with maxDiscountKobo null from this modal.
const DEFAULT_PERCENT_CAP_NGN = 2000;
const PERCENT_CAP_FEE_KEY     = 'promo_max_discount_default_ngn';

function CreatePromoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const confirm = useConfirm();

  const [code, setCode]               = useState('');
  const [type, setType]               = useState<'flat_discount' | 'percent' | 'free_delivery'>('flat_discount');
  const [value, setValue]             = useState('500');
  const [description, setDescription] = useState('');
  const [validFrom, setValidFrom]     = useState('');
  const [validTo,   setValidTo]       = useState('');
  const [usageLimit, setUsageLimit]   = useState('1000');
  const [perUserLimit, setPerUserLimit] = useState('1');
  // Both held in whole naira in the form and converted to kobo on submit,
  // which is what the entity stores.
  const [maxDiscount, setMaxDiscount] = useState(String(DEFAULT_PERCENT_CAP_NGN));
  const [minSubtotal, setMinSubtotal] = useState('0');
  const [saving, setSaving]           = useState(false);
  const [err,    setErr]              = useState<string | null>(null);

  // Pull the default cap from the Fee Catalogue if the row exists, so the
  // number is admin-tunable rather than baked into this bundle. A missing
  // row, or a role without fee access, quietly keeps the code fallback.
  useEffect(() => {
    let alive = true;
    adminApi.fees.get(PERCENT_CAP_FEE_KEY)
      .then((row: any) => {
        const n = Number(row?.value);
        if (alive && row?.active !== false && Number.isFinite(n) && n > 0) setMaxDiscount(String(Math.round(n)));
      })
      .catch(() => { /* code fallback stands */ });
    return () => { alive = false; };
  }, []);

  const capNgn  = Number(maxDiscount);
  const capOk   = type !== 'percent' || (Number.isFinite(capNgn) && capNgn > 0);
  const uses    = Number(usageLimit);
  const perUser = Number(perUserLimit);

  /**
   * What this campaign can cost if every use is taken.
   *
   * Nothing on this form did this arithmetic, so "50% off, 1,000 uses,
   * no ceiling" looked exactly as harmless as "200 naira off, 50 uses".
   */
  const worstCase = useMemo(() => {
    const unlimited = !Number.isFinite(uses) || uses <= 0;
    if (type === 'free_delivery') {
      return unlimited
        ? { text: 'Unlimited free deliveries. There is no ceiling on this at all.', danger: true }
        : { text: `Up to ${uses.toLocaleString()} free deliveries. The cost is whatever those deliveries would have earned.`, danger: uses > 500 };
    }
    const per = type === 'percent'
      ? (Number.isFinite(capNgn) && capNgn > 0 ? capNgn : null)
      : Number(value);
    if (per === null) {
      return { text: 'No ceiling per use, so this campaign has no maximum cost.', danger: true };
    }
    if (unlimited) {
      return { text: `Up to ${naira(per)} per use, with no limit on the number of uses. No maximum cost.`, danger: true };
    }
    const total = per * uses;
    return {
      text: `Worst case ${naira(total)}: ${naira(per)} each, ${uses.toLocaleString()} times.`,
      danger: total > 500_000,
    };
  }, [type, value, capNgn, uses]);

  const datesOk = !!validFrom && !!validTo && new Date(validTo).getTime() > new Date(validFrom).getTime();

  const submit = async () => {
    const ok = await confirm({
      title:   `Create the code ${code.trim().toUpperCase()}?`,
      message:
        `${code.trim().toUpperCase()} gives ${
          type === 'free_delivery' ? 'a free delivery'
          : type === 'percent'     ? `${value}% off, never more than ${naira(capNgn)}`
          : `${naira(Number(value))} off`
        }.\n\n` +
        `${worstCase.text}\n\n` +
        `Each person can use it ${perUser > 0 ? `${perUser} time${perUser === 1 ? '' : 's'}` : 'as often as they like, which is usually a mistake'}.\n\n` +
        `It works from ${validFrom ? new Date(validFrom).toLocaleString('en-NG') : 'the start date'} until ${validTo ? new Date(validTo).toLocaleString('en-NG') : 'the end date'}.\n\n` +
        'Anybody who has the code can use it from the moment it starts. You can pause it later, but you cannot take back a discount already given.',
      confirmLabel: 'Create the code',
      danger:       worstCase.danger,
    });
    if (!ok) return;

    setSaving(true); setErr(null);
    try {
      const minNgn = Number(minSubtotal);
      await adminApi.promotions.create({
        code,
        type,
        value: Number(value),
        description,
        validFrom: new Date(validFrom).toISOString(),
        validTo:   new Date(validTo).toISOString(),
        usageLimit:   Number(usageLimit),
        perUserLimit: Number(perUserLimit),
        // Null only where a cap is meaningless: a flat discount is
        // already its own ceiling. A percent promo always carries one.
        maxDiscountKobo: Number.isFinite(capNgn) && capNgn > 0 ? Math.round(capNgn) * 100 : null,
        minSubtotalKobo: Number.isFinite(minNgn) && minNgn > 0 ? Math.round(minNgn) * 100 : 0,
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? 'The code was not created.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="font-bold text-[#0F2B4C]">Create a discount code</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="space-y-3 p-5 text-sm">
          {err && (
            <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} /> {err}
            </div>
          )}
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500">The code customers type</label>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="WELCOME50"
              className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 font-mono uppercase focus:border-[#3A7BD5] focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">What it gives</label>
              <select value={type} onChange={e => setType(e.target.value as any)}
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 focus:border-[#3A7BD5] focus:outline-none">
                <option value="flat_discount">Money off</option>
                <option value="percent">Percentage off</option>
                <option value="free_delivery">Delivery is free</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
                {type === 'percent' ? 'How many percent' : type === 'flat_discount' ? 'How many naira' : 'Not needed'}
              </label>
              <input value={value} onChange={e => setValue(e.target.value)} type="number" disabled={type === 'free_delivery'}
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 focus:border-[#3A7BD5] focus:outline-none disabled:bg-gray-50" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Short description, for staff</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="500 naira off a first order"
              className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 focus:border-[#3A7BD5] focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Starts</label>
              <input type="datetime-local" value={validFrom} onChange={e => setValidFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 focus:border-[#3A7BD5] focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Stops</label>
              <input type="datetime-local" value={validTo} onChange={e => setValidTo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 focus:border-[#3A7BD5] focus:outline-none" />
            </div>
          </div>
          {validFrom && validTo && !datesOk && (
            <p className="text-xs font-semibold text-red-600">The stop time has to be after the start time.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Never give more than (naira){type === 'percent' ? ' *' : ''}
              </label>
              <input value={maxDiscount} onChange={e => setMaxDiscount(e.target.value)} type="number" min="0"
                placeholder="0 means no ceiling"
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 focus:border-[#3A7BD5] focus:outline-none" />
              <p className="mt-1 text-[11px] text-gray-400">
                {type === 'percent'
                  ? 'Required. Without it, half off a large booking has no ceiling.'
                  : 'Not needed here: an amount off is already its own ceiling.'}
              </p>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Only on orders over (naira)</label>
              <input value={minSubtotal} onChange={e => setMinSubtotal(e.target.value)} type="number" min="0"
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 focus:border-[#3A7BD5] focus:outline-none" />
              <p className="mt-1 text-[11px] text-gray-400">0 means it works on any order.</p>
            </div>
          </div>
          {type === 'percent' && !capOk && (
            <p className="text-xs font-semibold text-red-600">
              A percentage code needs a ceiling before it can be created.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Total uses (0 means no limit)</label>
              <input value={usageLimit} onChange={e => setUsageLimit(e.target.value)} type="number"
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 focus:border-[#3A7BD5] focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Uses per person</label>
              <input value={perUserLimit} onChange={e => setPerUserLimit(e.target.value)} type="number"
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 focus:border-[#3A7BD5] focus:outline-none" />
            </div>
          </div>

          {/* The number nobody was working out. */}
          <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
            worstCase.danger ? 'border-red-300 bg-red-50 text-red-800' : 'border-[#E5E7EB] bg-[#F5F5F0] text-[#0F2B4C]'
          }`}>
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>
              <b>What this can cost SEIRS.</b> {worstCase.text}
            </span>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button
            onClick={submit}
            disabled={saving || !code.trim() || !datesOk || !capOk}
            className="rounded-lg bg-[#0F2B4C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3A7BD5] disabled:opacity-50"
          >
            {saving ? 'Creating' : 'Create the code'}
          </button>
        </div>
      </div>
    </div>
  );
}
