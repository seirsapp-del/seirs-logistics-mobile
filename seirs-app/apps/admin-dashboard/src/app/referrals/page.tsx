'use client';
import { useEffect, useState } from 'react';
import { Share2, Users, TrendingUp, Gift, RefreshCw } from 'lucide-react';
import { adminApi } from '@/lib/api';

interface ReferralRow {
  referredId:   string;
  referredName: string;
  referredAt:   string;
  code:         string;
  referrerId:   string | null;
  referrerName: string | null;
  status:       'credited' | 'pending';
}

const STATUS_STYLES: Record<string, string> = {
  credited: 'bg-green-100 text-green-700',
  pending:  'bg-yellow-100 text-yellow-700',
};

export default function ReferralsPage() {
  const [rows, setRows]         = useState<ReferralRow[]>([]);
  const [summary, setSummary]   = useState<{ totalReferrals: number; monthToDate: number } | null>(null);
  const [loading, setLoading]   = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        adminApi.referrals.list().catch(() => []),
        adminApi.referrals.summary().catch(() => null),
      ]);
      setRows(list ?? []);
      setSummary(s);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const creditedCount = rows.filter(r => r.status === 'credited').length;
  const conversion = rows.length > 0 ? Math.round((creditedCount / rows.length) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <Share2 size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Referrals</h1>
            <p className="text-sm text-gray-500">Every user who signed up with a referral code.</p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Referrals',     value: summary?.totalReferrals?.toLocaleString() ?? '—', icon: Users,      color: 'text-[#3A7BD5]' },
          { label: 'Month-to-Date',       value: summary?.monthToDate?.toLocaleString() ?? '—',     icon: Gift,       color: 'text-green-600' },
          { label: 'Credited %',          value: rows.length > 0 ? `${conversion}%` : '—',          icon: TrendingUp, color: 'text-yellow-600' },
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

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-[#0F2B4C]">Recent Referrals</span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <Share2 size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">No referrals recorded yet.</p>
              <p className="text-xs text-gray-400 mt-1">Users who sign up via a referral deep-link appear here.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Referred User</th>
                  <th className="text-left px-4 py-3">Code</th>
                  <th className="text-left px-4 py-3">Referrer</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.referredId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-[#0F2B4C]">{r.referredName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#3A7BD5]">{r.code}</td>
                    <td className="px-4 py-3 text-gray-600">{r.referrerName ?? <span className="text-gray-400 italic">code not found</span>}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(r.referredAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[r.status]}`}>
                        {r.status === 'credited' ? 'Credited' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
