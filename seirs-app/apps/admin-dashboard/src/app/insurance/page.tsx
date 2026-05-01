'use client';
import { Shield, Plus, ExternalLink, AlertCircle } from 'lucide-react';

const PLACEHOLDER_INSURERS = [
  { name: 'AIICO Insurance',   coverage: 'Cargo & Transit',     premium: '0.5% per delivery', limit: '₦500,000', status: 'Active',   claims: '—' },
  { name: 'Leadway Assurance', coverage: 'Driver Accident',     premium: '₦2,000/month',      limit: '₦1,000,000', status: 'Active', claims: '—' },
  { name: 'AXA Mansard',       coverage: 'Third-Party Liability', premium: '₦1,500/month',   limit: '₦750,000',   status: 'Pending', claims: '—' },
];

const STATUS_STYLES: Record<string, string> = {
  Active:  'bg-green-100 text-green-700',
  Pending: 'bg-yellow-100 text-yellow-700',
  Lapsed:  'bg-red-100 text-red-700',
};

export default function InsurancePage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <Shield size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Insurance Partners</h1>
            <p className="text-sm text-gray-500">Cargo, driver, and liability insurance coverage management</p>
          </div>
        </div>
        <button className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#2f6cc0] transition-colors">
          <Plus size={15} />
          Add Insurer
        </button>
      </div>

      {/* Alert */}
      <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <AlertCircle size={16} className="text-yellow-600 mt-0.5 shrink-0" />
        <p className="text-sm text-yellow-800">
          Ensure all active policies have up-to-date renewal dates. Lapsed policies expose drivers and cargo to uninsured risk.
        </p>
      </div>

      {/* Insurer table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#0F2B4C]">Insurance Providers</span>
          <span className="text-xs text-gray-400">{PLACEHOLDER_INSURERS.length} providers</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-3">Provider</th>
                <th className="text-left px-4 py-3">Coverage Type</th>
                <th className="text-left px-4 py-3">Premium</th>
                <th className="text-left px-4 py-3">Coverage Limit</th>
                <th className="text-left px-4 py-3">Open Claims</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {PLACEHOLDER_INSURERS.map((p) => (
                <tr key={p.name} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-[#0F2B4C] flex items-center gap-1.5">
                    {p.name}
                    <ExternalLink size={11} className="text-gray-300" />
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.coverage}</td>
                  <td className="px-4 py-3 text-gray-600">{p.premium}</td>
                  <td className="px-4 py-3 font-medium text-gray-700">{p.limit}</td>
                  <td className="px-4 py-3 text-gray-600">{p.claims}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[p.status]}`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-[#3A7BD5] hover:underline font-medium">Manage</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
          Showing placeholder data — connect to API to load live insurance records
        </div>
      </div>
    </div>
  );
}
