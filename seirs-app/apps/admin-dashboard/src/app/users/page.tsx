'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

const ROLE_COLORS: Record<string, string> = {
  customer: 'bg-blue-100 text-blue-700',
  driver:   'bg-[#3A7BD5]/10 text-[#3A7BD5]',
  admin:    'bg-violet-100 text-violet-700',
};

export default function UsersPage() {
  const [data,    setData]    = useState<any>(null);
  const [page,    setPage]    = useState(1);
  const [role,    setRole]    = useState('');
  const [loading, setLoading] = useState(true);

  const load = (p = 1) => {
    setLoading(true);
    adminApi.users(p, role || undefined)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
    setPage(p);
  };

  useEffect(() => { load(1); }, [role]);

  const toggleBan = async (id: string, isActive: boolean) => {
    if (!confirm(isActive ? 'Ban this user?' : 'Unban this user?')) return;
    await adminApi.updateUser(id, { isActive: !isActive });
    load(page);
  };

  return (
    <div className="min-h-screen">
      <main className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#0F2B4C]">Users</h1>
            {data && (
              <p className="text-sm text-[#0F2B4C]/50 mt-1">{data.total.toLocaleString()} total</p>
            )}
          </div>
          <div className="flex gap-2">
            {['', 'customer', 'driver', 'admin'].map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  role === r
                    ? 'bg-[#3A7BD5] text-white border-[#3A7BD5]'
                    : 'bg-white text-[#0F2B4C]/50 border-[#E5E7EB] hover:border-[#0F2B4C]/20'
                }`}
              >
                {r ? r.charAt(0).toUpperCase() + r.slice(1) : 'All'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-[#0F2B4C]/30">Loading…</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F5F0] border-b border-[#E5E7EB]">
                <tr>
                  {['User', 'Phone', 'Role', 'Status', 'Joined', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-semibold text-[#0F2B4C]/40 text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F0]">
                {data?.users?.map((u: any) => (
                  <tr key={u.id} className="hover:bg-[#F5F5F0] transition-colors">
                    <td className="px-4 py-3">
                      <a href={`/users/${u.id}`} className="font-medium text-[#0F2B4C] hover:text-[#3A7BD5] transition-colors">{u.name}</a>
                      <div className="text-xs text-[#0F2B4C]/40">{u.email}</div>
                    </td>
                    <td className="px-4 py-3 text-[#0F2B4C]/60">{u.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${ROLE_COLORS[u.role] ?? 'bg-[#0F2B4C]/5 text-[#0F2B4C]/50'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.isActive !== false ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-700">
                          <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                          Banned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#0F2B4C]/40 text-xs">
                      {new Date(u.createdAt).toLocaleDateString('en-NG', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleBan(u.id, u.isActive !== false)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                          u.isActive !== false
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        }`}
                      >
                        {u.isActive !== false ? 'Ban' : 'Unban'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {data?.users?.length === 0 && (
              <div className="text-center py-16 text-[#0F2B4C]/30">No users found</div>
            )}

            {data?.total > 20 && (
              <div className="flex justify-center gap-3 p-4 border-t border-[#F5F5F0]">
                <button onClick={() => load(page - 1)} disabled={page === 1}
                  className="px-4 py-2 text-sm rounded-lg border border-[#E5E7EB] disabled:opacity-40 hover:bg-[#F5F5F0] transition-colors">
                  Previous
                </button>
                <span className="px-4 py-2 text-sm text-[#0F2B4C]/50">Page {page}</span>
                <button onClick={() => load(page + 1)} disabled={page * 20 >= data.total}
                  className="px-4 py-2 text-sm rounded-lg border border-[#E5E7EB] disabled:opacity-40 hover:bg-[#F5F5F0] transition-colors">
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
