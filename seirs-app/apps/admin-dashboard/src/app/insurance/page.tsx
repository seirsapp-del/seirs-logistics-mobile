'use client';
import { useEffect, useState } from 'react';
import { Shield, Plus, ExternalLink, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { ExternalPartnerModal, type ExternalPartner } from '@/components/ExternalPartnerEditor';

const STATUS_STYLES: Record<string, string> = {
  active:  'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  lapsed:  'bg-red-100 text-red-700',
  paused:  'bg-gray-100 text-gray-500',
};

const COVERAGE_LABEL: Record<string, string> = {
  cargo:           'Cargo & Transit',
  driver_accident: 'Driver Accident',
  third_party:     'Third-Party Liability',
  cyber:           'Cyber Liability',
};

const fmtNgn = (n: number) => n > 0
  ? new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n)
  : '—';

export default function InsurancePage() {
  const [items,   setItems]   = useState<ExternalPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [editing, setEditing] = useState<ExternalPartner | 'new' | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.externalPartners.list('insurance')
      .then(list => setItems(Array.isArray(list) ? list : []))
      .catch((e: any) => setError(e?.message ?? 'Could not load insurance partners'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <Shield size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Insurance Partners</h1>
            <p className="text-sm text-gray-500">Cargo, driver, and liability insurance coverage management</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => setEditing('new')}
            className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#2f6cc0]">
            <Plus size={15} /> Add Insurer
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <AlertCircle size={16} className="text-yellow-600 mt-0.5 shrink-0" />
        <p className="text-sm text-yellow-800">
          Lapsed policies expose drivers and cargo to uninsured risk. Track renewal dates per provider.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#0F2B4C]">Insurance Providers</span>
          <span className="text-xs text-gray-400">{items.length} provider{items.length === 1 ? '' : 's'}</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Shield size={32} className="mx-auto mb-3 opacity-40" />
            <p className="font-semibold">No insurance partners yet</p>
            <p className="text-xs mt-1">Tap &ldquo;Add Insurer&rdquo; above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Provider</th>
                  <th className="text-left px-4 py-3">Coverage</th>
                  <th className="text-left px-4 py-3">Premium</th>
                  <th className="text-left px-4 py-3">Limit</th>
                  <th className="text-left px-4 py-3">Renewal</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setEditing(p)}>
                    <td className="px-4 py-3 font-medium text-[#0F2B4C] flex items-center gap-1.5">
                      {p.name}
                      {p.websiteUrl && <ExternalLink size={11} className="text-gray-300" />}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{COVERAGE_LABEL[p.meta?.coverageType] ?? p.meta?.coverageType ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{p.meta?.premium ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-700">{fmtNgn(Number(p.meta?.coverageLimitNgn ?? 0))}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {p.meta?.renewalDate
                        ? new Date(p.meta.renewalDate).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLES[p.status] ?? ''}`}>{p.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#3A7BD5] font-medium">Manage</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ExternalPartnerModal
          row={editing === 'new' ? null : editing}
          type="insurance"
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
