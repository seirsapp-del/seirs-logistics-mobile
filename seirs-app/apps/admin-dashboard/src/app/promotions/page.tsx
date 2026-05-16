'use client';
import { useEffect, useState } from 'react';
import { Percent, Plus, Calendar, Users, Loader2, RefreshCw, X, AlertCircle } from 'lucide-react';
import { adminApi } from '@/lib/api';

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
  flat_discount: 'Flat Discount',
  percent:       '% Discount',
  free_delivery: 'Free Delivery',
};

const STATUS_STYLES: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  scheduled: 'bg-[#3A7BD5]/10 text-[#3A7BD5]',
  expired:   'bg-gray-100 text-gray-500',
  paused:    'bg-yellow-100 text-yellow-700',
};

export default function PromotionsPage() {
  const [promos,  setPromos]  = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.promotions.list()
      .then((data: any) => setPromos(Array.isArray(data) ? data : []))
      .catch((e: any) => setError(e?.message ?? 'Could not load promotions'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const renderValue = (p: Promo) => {
    if (p.type === 'free_delivery') return '100% off delivery';
    if (p.type === 'percent')       return `${p.value}% off`;
    return `₦${Number(p.value).toLocaleString()} off`;
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-NG', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <Percent size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Promotions</h1>
            <p className="text-sm text-gray-500">Manage discount codes, free delivery campaigns, and seasonal offers</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#2f6cc0] transition-colors"
          >
            <Plus size={15} />
            Create Promotion
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active Campaigns', value: promos.filter(p => p.status === 'active').length,    icon: Percent,  color: 'text-green-600'  },
          { label: 'Scheduled',        value: promos.filter(p => p.status === 'scheduled').length, icon: Calendar, color: 'text-[#3A7BD5]' },
          { label: 'Total Uses',       value: promos.reduce((s, p) => s + p.usageCount, 0),         icon: Users,    color: 'text-gray-600'   },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
              <Icon size={18} className={color} />
            </div>
            <div>
              <div className="text-xl font-bold text-[#0F2B4C]">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#0F2B4C]">All Promotions</span>
          <span className="text-xs text-gray-400">{promos.length} campaigns</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" />
            Loading…
          </div>
        ) : promos.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Percent size={32} className="mx-auto mb-3 opacity-40" />
            <p className="font-semibold">No promotions yet</p>
            <p className="text-xs mt-1">Tap &ldquo;Create Promotion&rdquo; to add your first.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Code</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Value</th>
                  <th className="text-left px-4 py-3">Uses / Limit</th>
                  <th className="text-left px-4 py-3">Valid Period</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {promos.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-[#0F2B4C] tracking-wider">{p.code}</td>
                    <td className="px-4 py-3 text-gray-600">{TYPE_LABEL[p.type] ?? p.type}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{renderValue(p)}</td>
                    <td className="px-4 py-3 text-gray-600">{p.usageCount} / {p.usageLimit || '∞'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(p.validFrom)} — {fmtDate(p.validTo)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLES[p.status]}`}>{p.status}</span>
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      <button
                        onClick={async () => {
                          const next = p.status === 'paused' ? 'active' : 'paused';
                          await adminApi.promotions.update(p.id, { status: next });
                          load();
                        }}
                        className="text-xs text-[#3A7BD5] hover:underline font-medium"
                      >
                        {p.status === 'paused' ? 'Resume' : 'Pause'}
                      </button>
                      {p.usageCount === 0 && (
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete promotion "${p.code}"?`)) return;
                            try { await adminApi.promotions.remove(p.id); load(); }
                            catch (e: any) { alert(e?.message ?? 'Delete failed'); }
                          }}
                          className="text-xs text-red-500 hover:underline font-medium"
                        >
                          Delete
                        </button>
                      )}
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

function CreatePromoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [code, setCode]               = useState('');
  const [type, setType]               = useState<'flat_discount' | 'percent' | 'free_delivery'>('flat_discount');
  const [value, setValue]             = useState('500');
  const [description, setDescription] = useState('');
  const [validFrom, setValidFrom]     = useState('');
  const [validTo,   setValidTo]       = useState('');
  const [usageLimit, setUsageLimit]   = useState('1000');
  const [perUserLimit, setPerUserLimit] = useState('1');
  const [saving, setSaving]           = useState(false);
  const [err,    setErr]              = useState<string | null>(null);

  const submit = async () => {
    setSaving(true); setErr(null);
    try {
      await adminApi.promotions.create({
        code,
        type,
        value: Number(value),
        description,
        validFrom: new Date(validFrom).toISOString(),
        validTo:   new Date(validTo).toISOString(),
        usageLimit:   Number(usageLimit),
        perUserLimit: Number(perUserLimit),
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="font-bold text-[#0F2B4C]">Create Promotion</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          {err && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} /> {err}
            </div>
          )}
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Code</label>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="WELCOME50"
              className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg font-mono uppercase focus:outline-none focus:border-[#3A7BD5]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Type</label>
              <select value={type} onChange={e => setType(e.target.value as any)}
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]">
                <option value="flat_discount">Flat (₦)</option>
                <option value="percent">Percent (%)</option>
                <option value="free_delivery">Free delivery</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Value</label>
              <input value={value} onChange={e => setValue(e.target.value)} type="number" disabled={type === 'free_delivery'}
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg disabled:bg-gray-50 focus:outline-none focus:border-[#3A7BD5]" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="₦500 off your first order"
              className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Valid From</label>
              <input type="datetime-local" value={validFrom} onChange={e => setValidFrom(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Valid To</label>
              <input type="datetime-local" value={validTo} onChange={e => setValidTo(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Total Uses (0 = ∞)</label>
              <input value={usageLimit} onChange={e => setUsageLimit(e.target.value)} type="number"
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Per-User Uses</label>
              <input value={perUserLimit} onChange={e => setPerUserLimit(e.target.value)} type="number"
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button onClick={submit} disabled={saving || !code || !validFrom || !validTo}
            className="px-4 py-2 text-sm font-semibold bg-[#0F2B4C] text-white rounded-lg hover:bg-[#3A7BD5] disabled:opacity-50">
            {saving ? 'Saving…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
