'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { getAdminRole } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/rbac';
import { ShieldAlert, Filter, ChevronLeft, ChevronRight, Lock } from 'lucide-react';

interface AuditEntry {
  id:        string;
  adminId:   string;
  adminName: string;
  action:    string;
  target?:   string;
  meta?:     Record<string, any>;
  ip?:       string;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  login:          'bg-blue-100 text-blue-700',
  logout:         'bg-gray-100 text-gray-600',
  create:         'bg-emerald-100 text-emerald-700',
  update:         'bg-amber-100 text-amber-700',
  delete:         'bg-red-100 text-red-700',
  approve:        'bg-emerald-100 text-emerald-700',
  reject:         'bg-red-100 text-red-700',
  suspend:        'bg-orange-100 text-orange-700',
  publish:        'bg-violet-100 text-violet-700',
  role_change:    'bg-pink-100 text-pink-700',
  pricing_update: 'bg-indigo-100 text-indigo-700',
};

function actionColor(action: string): string {
  const key = Object.keys(ACTION_COLORS).find((k) => action.toLowerCase().includes(k));
  return key ? ACTION_COLORS[key] : 'bg-gray-100 text-gray-600';
}

export default function AuditLogPage() {
  const [entries,   setEntries]   = useState<AuditEntry[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [page,      setPage]      = useState(1);
  const [hasMore,   setHasMore]   = useState(false);
  const [adminId,   setAdminId]   = useState('');
  const [action,    setAction]    = useState('');
  const [expanded,  setExpanded]  = useState<string | null>(null);

  const [isSuper,  setIsSuper]  = useState<boolean | null>(null);

  const load = (p = 1) => {
    setLoading(true);
    adminApi.auditLog.list(p, adminId || undefined, action || undefined)
      .then((data: any) => {
        const items = Array.isArray(data) ? data : data?.items ?? [];
        setEntries(p === 1 ? items : (prev) => [...prev, ...items]);
        setHasMore(data?.hasMore ?? false);
        setPage(p);
      }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    const superAdmin = isSuperAdmin(getAdminRole());
    setIsSuper(superAdmin);
    if (superAdmin) load(1);
    else setLoading(false);
  }, [adminId, action]);

  if (isSuper === null) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-[#0F2B4C]/30 text-sm">Loading…</div></div>;
  }

  if (!isSuper) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 mb-4">
            <Lock size={28} className="text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-[#0F2B4C] mb-1">Access Restricted</h2>
          <p className="text-sm text-[#0F2B4C]/50">The Audit Log is visible to Super Admins only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <main className="p-6 lg:p-8 max-w-6xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#0F2B4C] flex items-center gap-2">
              <ShieldAlert size={22} className="text-[#0F2B4C]/60" />
              Audit Log
            </h1>
            <p className="text-sm text-[#0F2B4C]/40 mt-1">Immutable record of all admin actions</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#0F2B4C]/40 bg-[#0F2B4C]/5 px-3 py-1.5 rounded-lg">
            <Lock size={11} /> Super Admin only
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6 flex gap-3 flex-wrap items-end">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-0 mr-1">
            <Filter size={13} /> Filters:
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Admin ID</label>
            <input
              value={adminId}
              onChange={(e) => { setAdminId(e.target.value); }}
              onBlur={() => load(1)}
              placeholder="Filter by admin…"
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5] w-48"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Action</label>
            <input
              value={action}
              onChange={(e) => { setAction(e.target.value); }}
              onBlur={() => load(1)}
              placeholder="e.g. approve, suspend…"
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5] w-48"
            />
          </div>
          <button
            onClick={() => { setAdminId(''); setAction(''); setTimeout(() => load(1), 0); }}
            className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
        </div>

        {/* Log table */}
        {loading && entries.length === 0 ? (
          <div className="text-center py-20 text-[#0F2B4C]/30 text-sm">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-20 text-[#0F2B4C]/30 text-sm">No audit entries found</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_2fr_2fr_1fr_auto] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <span>Time</span>
              <span>Admin</span>
              <span>Action</span>
              <span>IP</span>
              <span />
            </div>

            {entries.map((e, idx) => (
              <div key={e.id} className={idx > 0 ? 'border-t border-gray-100' : ''}>
                <div
                  className="grid grid-cols-[1fr_2fr_2fr_1fr_auto] gap-4 px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors items-center"
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                >
                  <div>
                    <p className="text-xs text-[#0F2B4C]">
                      {new Date(e.createdAt).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(e.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#0F2B4C] truncate">{e.adminName}</p>
                    <p className="text-xs text-gray-400 truncate font-mono">{e.adminId}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${actionColor(e.action)}`}>
                      {e.action}
                    </span>
                    {e.target && <span className="text-xs text-gray-400 truncate">{e.target}</span>}
                  </div>
                  <p className="text-xs text-gray-400 font-mono">{e.ip ?? '—'}</p>
                  <ChevronRight
                    size={14}
                    className={`text-gray-300 transition-transform ${expanded === e.id ? 'rotate-90' : ''}`}
                  />
                </div>

                {expanded === e.id && e.meta && Object.keys(e.meta).length > 0 && (
                  <div className="px-5 pb-4 bg-gray-50 border-t border-gray-100">
                    <p className="text-xs text-gray-400 mb-2 mt-2 font-medium uppercase tracking-wide">Metadata</p>
                    <pre className="text-xs bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto text-[#0F2B4C] font-mono">
                      {JSON.stringify(e.meta, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}

            {/* Pagination */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => { if (page > 1) load(page - 1); }}
                disabled={page === 1 || loading}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <span className="text-xs text-gray-400">Page {page}</span>
              <button
                onClick={() => { if (hasMore) load(page + 1); }}
                disabled={!hasMore || loading}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40 transition-colors"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
