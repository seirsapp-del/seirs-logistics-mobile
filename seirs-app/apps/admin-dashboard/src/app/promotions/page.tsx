'use client';
import { Percent, Plus, Calendar, Users } from 'lucide-react';

const PLACEHOLDER_PROMOS = [
  { code: 'WELCOME50', type: 'Flat Discount', value: '₦500 off',  uses: '—', limit: 1000, starts: '01 May 2026', ends: '31 May 2026', status: 'Scheduled' },
  { code: 'FREESHIP',  type: 'Free Delivery', value: '100% off',  uses: '—', limit: 500,  starts: '15 Apr 2026', ends: '15 May 2026', status: 'Active'    },
  { code: 'BACK20',    type: '% Discount',    value: '20% off',   uses: '—', limit: 200,  starts: '01 Mar 2026', ends: '30 Apr 2026', status: 'Expired'   },
];

const STATUS_STYLES: Record<string, string> = {
  Active:    'bg-green-100 text-green-700',
  Scheduled: 'bg-[#3A7BD5]/10 text-[#3A7BD5]',
  Expired:   'bg-gray-100 text-gray-500',
  Paused:    'bg-yellow-100 text-yellow-700',
};

export default function PromotionsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <Percent size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Promotions</h1>
            <p className="text-sm text-gray-500">Manage discount codes, free delivery campaigns, and seasonal offers</p>
          </div>
        </div>
        <button className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#2f6cc0] transition-colors">
          <Plus size={15} />
          Create Promotion
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active Campaigns', value: PLACEHOLDER_PROMOS.filter((p) => p.status === 'Active').length,    icon: Percent,  color: 'text-green-600'  },
          { label: 'Upcoming',         value: PLACEHOLDER_PROMOS.filter((p) => p.status === 'Scheduled').length, icon: Calendar, color: 'text-[#3A7BD5]' },
          { label: 'Total Uses (MTD)', value: '—',                                                               icon: Users,    color: 'text-gray-600'   },
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
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#0F2B4C]">All Promotions</span>
          <span className="text-xs text-gray-400">{PLACEHOLDER_PROMOS.length} campaigns</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Value</th>
                <th className="text-left px-4 py-3">Uses / Limit</th>
                <th className="text-left px-4 py-3">Valid Period</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {PLACEHOLDER_PROMOS.map((p) => (
                <tr key={p.code} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-[#0F2B4C] tracking-wider">{p.code}</td>
                  <td className="px-4 py-3 text-gray-600">{p.type}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{p.value}</td>
                  <td className="px-4 py-3 text-gray-600">{p.uses} / {p.limit}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{p.starts} — {p.ends}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[p.status]}`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button className="text-xs text-[#3A7BD5] hover:underline font-medium">Edit</button>
                    <button className="text-xs text-red-500 hover:underline font-medium">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
          Showing placeholder data — connect to API to load live promotions
        </div>
      </div>
    </div>
  );
}
