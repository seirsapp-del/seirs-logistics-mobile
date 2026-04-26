'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

const ROLE_COLORS: Record<string, string> = {
  customer: 'bg-blue-100 text-blue-700',
  driver:   'bg-orange-100 text-orange-700',
  admin:    'bg-purple-100 text-purple-700',
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
    <div className="min-h-screen bg-gray-50">
      <main className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Users</h1>
            {data && (
              <p className="text-sm text-gray-500 mt-1">{data.total.toLocaleString()} total</p>
            )}
          </div>
          <div className="flex gap-2">
            {['', 'customer', 'driver', 'admin'].map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  role === r
                    ? 'bg-[#F4600C] text-white border-[#F4600C]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                {r || 'All'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading...</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['User', 'Phone', 'Role', 'Status', 'Joined', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data?.users?.map((u: any) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <a href={`/users/${u.id}`} className="font-medium text-gray-900 hover:text-[#F4600C]">{u.name}</a>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.isActive !== false ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700">
                          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-700">
                          <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                          Banned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(u.createdAt).toLocaleDateString('en-NG', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleBan(u.id, u.isActive !== false)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
                          u.isActive !== false
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
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
              <div className="text-center py-16 text-gray-400">No users found</div>
            )}

            {data?.total > 20 && (
              <div className="flex justify-center gap-3 p-4 border-t border-gray-50">
                <button onClick={() => load(page - 1)} disabled={page === 1}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:border-gray-400">
                  Previous
                </button>
                <span className="px-4 py-2 text-sm text-gray-500">Page {page}</span>
                <button onClick={() => load(page + 1)} disabled={page * 20 >= data.total}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:border-gray-400">
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
