'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Store, Plus, Search, MapPin, Package, Store as StoreIcon, AlertTriangle } from 'lucide-react';
import { adminApi } from '@/lib/api';

// Faded design-preview rows shown when there are ZERO real partner stores.
// Purpose: preview the intended layout so a real admin isn't looking at a
// blank page. Rendered greyed-out with a "Preview" chip so nobody mistakes
// them for live data. Deleted the moment even one real partner exists.
const PREVIEW_ROWS = [
  { name: 'Lagos Fresh Market', owner: 'Adebayo Okonkwo', location: 'Ikeja, Lagos',       capacity: '50 orders/day', status: 'Active' },
  { name: 'Abuja Superstore',   owner: 'Fatima Al-Hassan', location: 'Wuse, Abuja',        capacity: '30 orders/day', status: 'Active' },
  { name: 'PH Depot Express',   owner: 'Chukwuemeka Eze',  location: 'GRA, Port Harcourt', capacity: '20 orders/day', status: 'Pending' },
];

const STATUS_STYLES: Record<string, string> = {
  approved:        'bg-emerald-100 text-emerald-700',
  pending_review:  'bg-amber-100 text-amber-700',
  suspended:       'bg-red-100 text-red-700',
  rejected:        'bg-gray-100 text-gray-600',
  // Legacy "active" value tolerated in old rows
  active:          'bg-emerald-100 text-emerald-700',
};

const STATUS_LABEL: Record<string, string> = {
  approved:       'Approved',
  pending_review: 'Pending',
  suspended:      'Suspended',
  rejected:       'Rejected',
  active:         'Approved',
};

export default function PartnersPage() {
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<string>('');
  const [search, setSearch]   = useState('');

  useEffect(() => {
    setLoading(true);
    adminApi.partnerStores.list(filter || undefined)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [filter]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (r.storeName ?? '').toLowerCase().includes(q) ||
      (r.storeAddress ?? '').toLowerCase().includes(q) ||
      (r.phone ?? '').includes(q),
    );
  }, [rows, search]);

  const isEmpty = !loading && rows.length === 0;
  const stats = useMemo(() => {
    const approved = rows.filter((r) => r.status === 'approved' || r.status === 'active').length;
    const pending  = rows.filter((r) => r.status === 'pending_review').length;
    return { total: rows.length, approved, pending };
  }, [rows]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <Store size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Partner Accounts</h1>
            <p className="text-sm text-gray-500">Manage approved and pending partner stores</p>
          </div>
        </div>
        <Link
          href="/partner-applications"
          className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#2f6cc0] transition-colors"
        >
          <Plus size={15} />
          Review applications
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Partners', value: loading ? '-' : stats.total, icon: Store },
          { label: 'Approved',       value: loading ? '-' : stats.approved, icon: Package },
          { label: 'Pending Review', value: loading ? '-' : stats.pending, icon: MapPin },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#0F2B4C]/8 flex items-center justify-center">
              <Icon size={18} className="text-[#0F2B4C]" />
            </div>
            <div>
              <div className="text-xl font-bold text-[#0F2B4C]">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2">
        {[
          { key: '',                label: 'All' },
          { key: 'approved',        label: 'Approved' },
          { key: 'pending_review',  label: 'Pending' },
          { key: 'suspended',       label: 'Suspended' },
          { key: 'rejected',        label: 'Rejected' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filter === f.key
                ? 'bg-[#3A7BD5] text-white border-[#3A7BD5]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-[#0F2B4C]/20'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-[#0F2B4C]">
            {loading ? 'Loading...' : `${filtered.length} partner${filtered.length === 1 ? '' : 's'}`}
          </span>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
            <Search size={13} className="text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-sm bg-transparent outline-none placeholder:text-gray-400 w-40"
              placeholder="Search partners…"
            />
          </div>
        </div>

        {isEmpty ? (
          // Empty state with a faded design preview so ops can still see the
          // intended layout while waiting for real partners to sign up.
          <div className="p-8">
            <div className="text-center mb-6">
              <StoreIcon size={40} className="text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-[#0F2B4C]">No partner stores yet</h3>
              <p className="text-sm text-gray-500 mt-1">
                Approved partner stores appear here.{' '}
                <Link href="/partner-applications" className="text-[#3A7BD5] hover:underline">
                  Review pending applications
                </Link>
                {' '}or wait for new signups.
              </p>
            </div>
            <div className="relative rounded-lg border border-dashed border-gray-200 overflow-hidden">
              <div className="absolute top-2 right-2 z-10 text-xs bg-white/95 border border-gray-200 rounded-full px-2 py-0.5 font-medium text-gray-500">
                Design preview
              </div>
              <table className="w-full text-sm opacity-40 pointer-events-none select-none">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Store Name</th>
                    <th className="text-left px-4 py-3">Owner</th>
                    <th className="text-left px-4 py-3">Location</th>
                    <th className="text-left px-4 py-3">Capacity</th>
                    <th className="text-left px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {PREVIEW_ROWS.map((p) => (
                    <tr key={p.name}>
                      <td className="px-4 py-3 font-medium text-[#0F2B4C]">{p.name}</td>
                      <td className="px-4 py-3 text-gray-600">{p.owner}</td>
                      <td className="px-4 py-3 text-gray-600">{p.location}</td>
                      <td className="px-4 py-3 text-gray-600">{p.capacity}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">{p.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Store Name</th>
                  <th className="text-left px-4 py-3">Address</th>
                  <th className="text-left px-4 py-3">Phone</th>
                  <th className="text-left px-4 py-3">Capacity</th>
                  <th className="text-left px-4 py-3">Hours</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Accepting</th>
                  <th className="text-left px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((s: any) => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-[#0F2B4C]">
                      {s.storeName}
                      {s.storeCode && (
                        <span className="block text-[10px] font-mono text-gray-400 mt-0.5">{s.storeCode}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className="flex items-center gap-1">
                        <MapPin size={12} className="text-gray-400 shrink-0" />
                        <span className="truncate max-w-xs">{s.storeAddress || '-'}</span>
                      </span>
                      {/* A store with no coordinates is invisible on every
                          map AND its drop-offs never become driver jobs
                          (the driver-leg bridge skips it). Surfaced here
                          because nobody reads server logs. */}
                      {(s.storeLat == null || s.storeLng == null) && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
                          <AlertTriangle size={10} /> No map location: cannot dispatch
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.phone || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{s.maxCapacity ?? '-'}/day</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{s.openTime}–{s.closeTime}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[s.status] ?? STATUS_STYLES.rejected}`}>
                        {STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {s.acceptingNew ? (
                        <span className="text-xs text-emerald-700">Yes</span>
                      ) : (
                        <span className="text-xs text-gray-400">Paused</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {(s.status === 'approved' || s.status === 'active') ? (
                        <button
                          onClick={async () => {
                            const note = prompt('Suspension reason (required, kept for the audit trail). The store stops taking packages and the owner loses partner access until re-approved:');
                            if (!note?.trim()) return;
                            try {
                              await adminApi.suspendPartnerStore(s.id, note.trim());
                              alert('Store suspended. Re-approve from Partner Applications to restore.');
                              window.location.reload();
                            } catch (e: any) { alert(`Suspend failed: ${e?.message ?? 'unknown'}`); }
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                        >
                          Suspend
                        </button>
                      ) : s.status === 'suspended' ? (
                        <button
                          onClick={async () => {
                            if (!confirm('Re-approve this store? The owner regains partner access and the store can take packages again.')) return;
                            try {
                              await adminApi.approvePartnerStore(s.id, 'Re-approved after suspension');
                              window.location.reload();
                            } catch (e: any) { alert(`Re-approve failed: ${e?.message ?? 'unknown'}`); }
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                        >
                          Re-approve
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
