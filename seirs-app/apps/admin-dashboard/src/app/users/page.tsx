'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmDialog';
import { Search, AlertCircle } from 'lucide-react';

const ROLE_COLORS: Record<string, string> = {
  customer: 'bg-blue-100 text-blue-700',
  driver:   'bg-[#3A7BD5]/10 text-[#3A7BD5]',
  admin:    'bg-violet-100 text-violet-700',
  business: 'bg-amber-100 text-amber-700',
  partner:  'bg-emerald-100 text-emerald-700',
};

// Business accounts are stored as role='customer' + businessRole +
// BIZ- account id backend-side; derive the honest display type so
// business/partner accounts stop masquerading as customers.
function displayType(u: any): string {
  if (u.role === 'admin' || u.role === 'driver') return u.role;
  const isPartner  = u.businessRole === 'partner' || u.capabilities?.canPartner === true;
  const isBusiness = !!u.businessRole || String(u.accountId ?? '').startsWith('BIZ-');
  if (isPartner)  return 'partner';
  if (isBusiness) return 'business';
  return 'customer';
}

export default function UsersPage() {
  const [data,    setData]    = useState<any>(null);
  const [page,    setPage]    = useState(1);
  const [role,    setRole]    = useState('');
  /**
   * Find one customer. There was no way to, on the page whose whole
   * job is customers: you scrolled, or you used the global TopBar
   * search, which returns three hits per type and is a jump-to rather
   * than a list. Support is handed a phone number far more often than
   * a name, so both are in here, with the SEIRS ID and the email.
   */
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const confirm = useConfirm();

  const load = (p = 1, term = search) => {
    setLoading(true);
    setError(null);
    adminApi.users(p, role || undefined, term.trim() || undefined)
      .then(setData)
      // A swallowed error looked exactly like "no users on this filter".
      .catch((e: any) => setError(e?.message ?? 'Could not load users'))
      .finally(() => setLoading(false));
    setPage(p);
  };

  useEffect(() => { load(1); }, [role]);

  // Debounced, so typing a phone number is one request and not eleven.
  useEffect(() => {
    const id = setTimeout(() => load(1, search), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const toggleBan = async (id: string, isActive: boolean) => {
    const ok = await confirm(isActive
      ? {
          title:        'Ban this user?',
          message:      'They will be signed out on their next request and cannot use the app until unbanned. Their historical data, deliveries, and wallet balance are preserved.',
          confirmLabel: 'Ban',
          danger:       true,
        }
      : {
          title:        'Unban this user?',
          message:      'They will regain full access on next sign-in.',
          confirmLabel: 'Unban',
        });
    if (!ok) return;
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
            {['', 'customer', 'business', 'partner', 'driver', 'admin'].map((r) => (
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

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xl">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#0F2B4C]/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone or SEIRS ID"
              className="w-full rounded-lg border border-[#E5E7EB] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#3A7BD5]"
            />
          </div>
          {search.trim() !== '' && (
            <span className="text-xs text-[#0F2B4C]/50">
              {data?.total ?? 0} match{(data?.total ?? 0) === 1 ? '' : 'es'}
            </span>
          )}
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => load(page)} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-[#0F2B4C]/30">Loading…</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F5F0] border-b border-[#E5E7EB]">
                <tr>
                  {['User', 'SEIRS ID', 'Phone', 'Role', 'Status', 'Joined', 'Actions'].map((h) => (
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
                    <td className="px-4 py-3">
                      {u.accountId ? (
                        <span className="text-xs font-mono text-[#0F2B4C]/70">{u.accountId}</span>
                      ) : (
                        <span className="text-xs text-[#0F2B4C]/30">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#0F2B4C]/60">{u.phone ?? '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${ROLE_COLORS[displayType(u)] ?? 'bg-[#0F2B4C]/5 text-[#0F2B4C]/50'}`}>
                        {displayType(u)}
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
              <div className="text-center py-16 text-[#0F2B4C]/30">
                {search.trim() ? `Nobody matches "${search.trim()}"` : 'No users found'}
              </div>
            )}

            {/* Says which slice you are looking at. "Page 3" alone does
                not tell you whether you are near the end, and the pager
                vanished entirely under 20 results, so a filtered view
                lost its own count. */}
            {(() => {
              const total    = Number(data?.total ?? 0);
              const lastPage = Math.max(1, Math.ceil(total / 20));
              const firstRow = total === 0 ? 0 : (page - 1) * 20 + 1;
              const lastRow  = Math.min(page * 20, total);
              return (
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t border-[#F5F5F0] text-sm text-[#0F2B4C]/50">
                  <span className="tabular-nums">
                    {total === 0
                      ? 'Nobody here'
                      : `Showing ${firstRow.toLocaleString()}-${lastRow.toLocaleString()} of ${total.toLocaleString()}`}
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => load(1)} disabled={page <= 1}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#E5E7EB] disabled:opacity-40 hover:bg-[#F5F5F0] transition-colors">
                      First
                    </button>
                    <button onClick={() => load(page - 1)} disabled={page <= 1}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E5E7EB] disabled:opacity-40 hover:bg-[#F5F5F0] transition-colors">
                      Prev
                    </button>
                    <span className="px-3 py-1.5 text-xs tabular-nums">Page {page} of {lastPage}</span>
                    <button onClick={() => load(page + 1)} disabled={page >= lastPage}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E5E7EB] disabled:opacity-40 hover:bg-[#F5F5F0] transition-colors">
                      Next
                    </button>
                    <button onClick={() => load(lastPage)} disabled={page >= lastPage}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#E5E7EB] disabled:opacity-40 hover:bg-[#F5F5F0] transition-colors">
                      Last
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </main>
    </div>
  );
}
