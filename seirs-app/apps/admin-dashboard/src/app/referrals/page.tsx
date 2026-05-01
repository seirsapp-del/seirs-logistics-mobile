'use client';
import { Share2, Users, TrendingUp, Gift } from 'lucide-react';

const PLACEHOLDER_REFERRALS = [
  { referrer: 'Adaeze Okafor',  referred: 'Chidera Okafor',  code: 'ADA001', bonus: '₦500', date: '28 Apr 2026', status: 'Credited'  },
  { referrer: 'Emeka Eze',      referred: 'Tobenna Eze',     code: 'EME002', bonus: '₦500', date: '27 Apr 2026', status: 'Pending'   },
  { referrer: 'Fatima Bello',   referred: 'Ibrahim Bello',   code: 'FAT003', bonus: '₦500', date: '26 Apr 2026', status: 'Credited'  },
  { referrer: 'Ola Adeyemi',    referred: 'Tola Adeyemi',    code: 'OLA004', bonus: '₦500', date: '25 Apr 2026', status: 'Rejected'  },
];

const STATUS_STYLES: Record<string, string> = {
  Credited: 'bg-green-100 text-green-700',
  Pending:  'bg-yellow-100 text-yellow-700',
  Rejected: 'bg-red-100 text-red-700',
};

export default function ReferralsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <Share2 size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#0F2B4C]">Referrals</h1>
          <p className="text-sm text-gray-500">Track referral codes, bonuses, and conversion rates</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Referrals',    value: '—', icon: Users,      color: 'text-[#3A7BD5]' },
          { label: 'Bonuses Paid (MTD)', value: '—', icon: Gift,       color: 'text-green-600' },
          { label: 'Conversion Rate',    value: '—', icon: TrendingUp, color: 'text-yellow-600' },
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

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-[#0F2B4C]">Recent Referrals</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-3">Referrer</th>
                <th className="text-left px-4 py-3">Referred User</th>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Bonus</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {PLACEHOLDER_REFERRALS.map((r) => (
                <tr key={r.code} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-[#0F2B4C]">{r.referrer}</td>
                  <td className="px-4 py-3 text-gray-600">{r.referred}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#3A7BD5]">{r.code}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{r.bonus}</td>
                  <td className="px-4 py-3 text-gray-500">{r.date}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
          Showing placeholder data — connect to API to load live referral records
        </div>
      </div>
    </div>
  );
}
