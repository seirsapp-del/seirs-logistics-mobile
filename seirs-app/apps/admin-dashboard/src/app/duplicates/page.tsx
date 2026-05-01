'use client';
import { Copy, AlertTriangle, Search } from 'lucide-react';

const PLACEHOLDER_DUPLICATES = [
  { primaryId: 'USR-001', primaryName: 'Emeka Chukwu',   duplicateId: 'USR-087', duplicateEmail: 'emeka.c@yahoo.com',  matchScore: '98%', flaggedOn: '29 Apr 2026', status: 'Under Review' },
  { primaryId: 'DRV-034', primaryName: 'Bola Adeyinka',  duplicateId: 'DRV-192', duplicateEmail: 'b.adeyinka@gmail.com', matchScore: '95%', flaggedOn: '28 Apr 2026', status: 'Confirmed'    },
  { primaryId: 'USR-220', primaryName: 'Fatima Hassan',  duplicateId: 'USR-318', duplicateEmail: 'fhassan@hotmail.com', matchScore: '91%', flaggedOn: '27 Apr 2026', status: 'Dismissed'    },
];

const STATUS_STYLES: Record<string, string> = {
  'Under Review': 'bg-yellow-100 text-yellow-700',
  'Confirmed':    'bg-red-100 text-red-700',
  'Dismissed':    'bg-gray-100 text-gray-500',
};

export default function DuplicatesPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <Copy size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#0F2B4C]">Duplicate Accounts</h1>
          <p className="text-sm text-gray-500">Detected accounts with overlapping identity signals — review and action required</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Under Review', value: '—', color: 'text-yellow-600' },
          { label: 'Confirmed Duplicates', value: '—', color: 'text-red-600' },
          { label: 'Dismissed This Month', value: '—', color: 'text-gray-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Alert */}
      <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
        <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
        <p className="text-sm text-red-800">
          Confirmed duplicate accounts may indicate bonus abuse or identity fraud. Merge or suspend secondary accounts immediately after review.
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-[#0F2B4C]">Flagged Duplicate Accounts</span>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
            <Search size={13} className="text-gray-400" />
            <input className="text-sm bg-transparent outline-none placeholder:text-gray-400 w-36" placeholder="Search…" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-3">Primary Account</th>
                <th className="text-left px-4 py-3">Duplicate ID</th>
                <th className="text-left px-4 py-3">Duplicate Email</th>
                <th className="text-left px-4 py-3">Match Score</th>
                <th className="text-left px-4 py-3">Flagged On</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {PLACEHOLDER_DUPLICATES.map((d) => (
                <tr key={d.duplicateId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#0F2B4C]">{d.primaryName}</div>
                    <div className="text-xs text-gray-400 font-mono">{d.primaryId}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{d.duplicateId}</td>
                  <td className="px-4 py-3 text-gray-600">{d.duplicateEmail}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-bold text-red-600">{d.matchScore}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{d.flaggedOn}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[d.status]}`}>{d.status}</span>
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button className="text-xs text-[#3A7BD5] hover:underline font-medium">Review</button>
                    <button className="text-xs text-red-500 hover:underline font-medium">Suspend</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
          Showing placeholder data — connect to API to load live duplicate detection results
        </div>
      </div>
    </div>
  );
}
