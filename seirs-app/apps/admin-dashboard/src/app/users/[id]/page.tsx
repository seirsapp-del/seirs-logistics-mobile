'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-800',
  delivered:  'bg-green-100 text-green-700',
  assigned:   'bg-blue-100 text-blue-700',
  in_transit: 'bg-purple-100 text-purple-700',
  cancelled:  'bg-gray-100 text-gray-500',
  failed:     'bg-red-100 text-red-700',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    adminApi.user(id).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const toggleBan = async () => {
    if (!data) return;
    if (!confirm(data.user.isActive ? 'Ban this user?' : 'Unban this user?')) return;
    setSaving(true);
    await adminApi.updateUser(id, { isActive: !data.user.isActive });
    setData(await adminApi.user(id));
    setSaving(false);
  };

  const promoteToAdmin = async () => {
    if (!confirm(`Promote ${data.user.name} to admin? They will gain full platform access.`)) return;
    setSaving(true);
    await adminApi.changeRole(id, 'admin');
    setData(await adminApi.user(id));
    setSaving(false);
  };

  // Spec V8 §3.13 — NDPR admin tools (A32 + A33)
  const exportData = async () => {
    try {
      const bundle = await adminApi.ndpr.exportUser(id);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seirs-export-${id}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { alert(e?.message ?? 'Export failed'); }
  };

  const hardDelete = async () => {
    const reason = prompt(
      `IRREVERSIBLE hard-delete of ${data.user.name}.\n\nThis bypasses the 30-day NDPR grace window. The account is archived (PII reduced) and purged from the live users table immediately.\n\nReason for the legal audit log:`,
    );
    if (!reason || reason.trim().length < 6) return;
    if (!confirm(`Final confirm: hard-delete ${data.user.name}?\n\nReason: ${reason.trim()}\n\nThis cannot be undone.`)) return;
    try {
      const r = await adminApi.ndpr.hardDeleteUser(id, reason.trim());
      alert(`Account purged. Archived at ${r.archivedAt}.`);
      router.push('/users');
    } catch (e: any) { alert(e?.message ?? 'Hard-delete failed'); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;
  if (!data)   return <div className="min-h-screen flex items-center justify-center text-gray-400">User not found</div>;

  const { user, deliveries, deliveryCount, totalSpent } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="p-8 max-w-4xl mx-auto">
        {/* Profile card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6 flex items-start gap-6">
          <div className="w-16 h-16 rounded-full bg-[#3A7BD5] flex items-center justify-center text-white text-2xl font-black shrink-0">
            {user.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-gray-900">{user.name}</h1>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                user.role === 'customer' ? 'bg-blue-100 text-blue-700' :
                user.role === 'driver'   ? 'bg-orange-100 text-orange-700' :
                                           'bg-purple-100 text-purple-700'
              }`}>{user.role}</span>
              {user.isActive !== false ? (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Active</span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Banned</span>
              )}
            </div>
            <p className="text-sm text-gray-500">{user.email}</p>
            <p className="text-sm text-gray-500">{user.phone}</p>
            <p className="text-xs text-gray-400 mt-1">
              Joined {new Date(user.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={toggleBan}
              disabled={saving}
              className={`text-sm px-4 py-2 rounded-lg font-medium ${
                user.isActive !== false
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {saving ? '...' : user.isActive !== false ? 'Ban User' : 'Unban User'}
            </button>
            {user.role === 'customer' && (
              <button
                onClick={promoteToAdmin}
                disabled={saving}
                className="text-sm px-4 py-2 rounded-lg font-medium bg-purple-100 text-purple-700 hover:bg-purple-200"
              >
                Promote to Admin
              </button>
            )}
            <button
              onClick={exportData}
              className="text-sm px-4 py-2 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
              title="NDPR Article 24 — right to data portability"
            >
              Export NDPR data
            </button>
            {user.role !== 'admin' && (
              <button
                onClick={hardDelete}
                className="text-sm px-4 py-2 rounded-lg font-medium bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                title="NDPR right to erasure — immediate hard-delete"
              >
                NDPR hard-delete
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Deliveries', value: deliveryCount },
            { label: 'Total Spent',      value: fmt(totalSpent) },
            { label: 'FCM Token',        value: user.fcmToken ? '✓ Set' : '✗ None' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Recent deliveries */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900">Recent Deliveries</h2>
          </div>
          {deliveries.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No deliveries yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Tracking', 'From → To', 'Status', 'Amount', 'Date'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {deliveries.map((d: any) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{d.trackingCode}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="text-xs text-gray-700 truncate">{d.pickupAddress}</div>
                      <div className="text-xs text-gray-400 truncate">→ {d.dropoffAddress}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[d.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">₦{d.price?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(d.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
