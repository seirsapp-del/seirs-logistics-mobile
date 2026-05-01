'use client';
import { ArrowRightLeft, Plus, Info } from 'lucide-react';

const PLACEHOLDER_REDIRECTS = [
  { source: '/shop/lagos-mart',  destination: '/partners/lagos-fresh-market', type: 'Permanent', hits: '—', status: 'Active'   },
  { source: '/shop/abuja-hub',   destination: '/partners/abuja-superstore',   type: 'Temporary', hits: '—', status: 'Active'   },
  { source: '/shop/ph-depot',    destination: '/partners/ph-depot-express',   type: 'Permanent', hits: '—', status: 'Inactive' },
];

const STATUS_STYLES: Record<string, string> = {
  Active:   'bg-green-100 text-green-700',
  Inactive: 'bg-gray-100 text-gray-600',
};

export default function PartnerRedirectsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <ArrowRightLeft size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Partner Redirects</h1>
            <p className="text-sm text-gray-500">Manage URL redirects for partner storefronts and landing pages</p>
          </div>
        </div>
        <button className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#2f6cc0] transition-colors">
          <Plus size={15} />
          New Redirect
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-[#3A7BD5]/8 border border-[#3A7BD5]/20 rounded-xl p-4">
        <Info size={16} className="text-[#3A7BD5] mt-0.5 shrink-0" />
        <p className="text-sm text-[#0F2B4C]">
          Partner redirects allow you to map short or legacy URLs to active partner pages. Permanent redirects (301) are cached by browsers; temporary redirects (302) are not.
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-[#0F2B4C]">Active Redirect Rules</span>
          <span className="text-xs text-gray-400">{PLACEHOLDER_REDIRECTS.length} rules</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-3">Source Path</th>
                <th className="text-left px-4 py-3">Destination</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Hit Count</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {PLACEHOLDER_REDIRECTS.map((r) => (
                <tr key={r.source} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-[#3A7BD5]">{r.source}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.destination}</td>
                  <td className="px-4 py-3 text-gray-600">{r.type}</td>
                  <td className="px-4 py-3 text-gray-600">{r.hits}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[r.status]}`}>{r.status}</span>
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
          Showing placeholder data — connect to API to load live redirect rules
        </div>
      </div>
    </div>
  );
}
