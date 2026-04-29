'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

const ROLE_COLORS: Record<string, string> = {
  customer: 'bg-blue-100 text-blue-700',
  driver:   'bg-[#F4600C]/10 text-[#F4600C]',
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
            <h1 className="text-2xl font-bold text-[#0D1B2A]">Users</h1>
            {data && (
              <p className="text-sm text-[#0D1B2A]/50 mt-1">{data.total.toLocaleString()} total</p>
            )}
          </div>
          <div className="flex gap-2">
            {['', 'customer', 'driver', 'admin'].map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  role === r
                    ? 'bg-[#F4600C] text-white border-[#F4600C]'
                    : 'bg-white text-[#0D1B2A]/50 border-[#EDE4D9] hover:border-[#0D1B2A]/20'
                }`}
              >
                {r ? r.charAt(0).toUpperCase() + r.slice(1) : 'All'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-[#0D1B2A]/30">Loading…</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-[#EDE4D9] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F0EB] border-b border-[#EDE4D9]">
                <tr>
                  {['User', 'Phone', 'Role', 'Status', 'Joined', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-semibold text-[#0D1B2A]/40 text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F0EB]">
                {data?.users?.map((u: any) => (
                  <tr key={u.id} className="hover:bg-[#F5F0EB] transition-colors">
                    <td className="px-4 py-3">
                      <a href={`/users/${u.id}`} className="font-medium text-[#0D1B2A] hover:text-[#F4600C] transition-colors">{u.name}</a>
                      <div className="text-xs text-[#0D1B2A]/40">{u.email}</div>
                    </td>
                    <td className="px-4 py-3 text-[#0D1B2A]/60">{u.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${ROLE_COLORS[u.role] ?? 'bg-[#0D1B2A]/5 text-[#0D1B2A]/50'}`}>
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
                    <td className="px-4 py-3 text-[#0D1B2A]/40 text-xs">
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
              <div className="text-center py-16 text-[#0D1B2A]/30">No users found</div>
            )}

            {data?.total > 20 && (
              <div className="flex justify-center gap-3 p-4 border-t border-[#F5F0EB]">
                <button onClick={() => load(page - 1)} disabled={page === 1}
                  className="px-4 py-2 text-sm rounded-lg border border-[#EDE4D9] disabled:opacity-40 hover:bg-[#F5F0EB] transition-colors">
                  Previous
                </button>
                <span className="px-4 py-2 text-sm text-[#0D1B2A]/50">Page {page}</span>
                <button onClick={() => load(page + 1)} disabled={page * 20 >= data.total}
                  className="px-4 py-2 text-sm rounded-lg border border-[#EDE4D9] disabled:opacity-40 hover:bg-[#F5F0EB] transition-colors">
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
