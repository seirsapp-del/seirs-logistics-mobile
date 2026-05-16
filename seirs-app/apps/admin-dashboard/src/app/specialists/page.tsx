'use client';
import { useEffect, useState } from 'react';
import { Briefcase, Plus, Star, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { ExternalPartnerModal, type ExternalPartner } from '@/components/ExternalPartnerEditor';

const STATUS_STYLES: Record<string, string> = {
  active:  'bg-[#3A7BD5]/10 text-[#3A7BD5]',
  pending: 'bg-yellow-100 text-yellow-700',
  paused:  'bg-gray-100 text-gray-500',
};

export default function SpecialistsPage() {
  const [items,   setItems]   = useState<ExternalPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [editing, setEditing] = useState<ExternalPartner | 'new' | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.externalPartners.list('specialist')
      .then(list => setItems(Array.isArray(list) ? list : []))
      .catch((e: any) => setError(e?.message ?? 'Could not load specialist partners'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Aggregate the unique specialty chips actually in use, so the tag
  // strip reflects the live directory (not a hardcoded list).
  const specialtiesInUse = Array.from(new Set(items.map(i => i.meta?.specialty).filter(Boolean))) as string[];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <Briefcase size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Specialist Partners</h1>
            <p className="text-sm text-gray-500">Partners with certified specialisations for non-standard deliveries</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => setEditing('new')}
            className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#2f6cc0]">
            <Plus size={15} /> Register Specialist
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {specialtiesInUse.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 self-center mr-1 font-medium">Active specialties:</span>
          {specialtiesInUse.map(s => (
            <span key={s} className="text-xs bg-[#0F2B4C]/8 text-[#0F2B4C] px-2.5 py-1 rounded-full font-medium">{s}</span>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-[#0F2B4C]">Specialist Directory</span>
          <span className="text-xs text-gray-400">{items.length} partner{items.length === 1 ? '' : 's'}</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Briefcase size={32} className="mx-auto mb-3 opacity-40" />
            <p className="font-semibold">No specialist partners yet</p>
            <p className="text-xs mt-1">Tap &ldquo;Register Specialist&rdquo; above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Partner</th>
                  <th className="text-left px-4 py-3">Specialty</th>
                  <th className="text-left px-4 py-3">Service Areas</th>
                  <th className="text-left px-4 py-3">Rating</th>
                  <th className="text-left px-4 py-3">Jobs</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setEditing(s)}>
                    <td className="px-4 py-3 font-medium text-[#0F2B4C]">{s.name}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s.meta?.specialty ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{(s.meta?.serviceAreas ?? []).join(', ') || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-gray-600">
                        <Star size={12} className="text-yellow-400 fill-yellow-400" />
                        {Number(s.meta?.rating ?? 0).toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.meta?.completedJobs ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLES[s.status] ?? ''}`}>{s.status}</span>
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
          type="specialist"
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
