'use client';
import { ArrowRightLeft, Info, ArrowRightLeft as ArrowIcon } from 'lucide-react';

// V2 feature: URL redirects that let us retire old partner storefront URLs
// without breaking existing links. No backend yet, so this page renders a
// clear "Not available yet" empty state with a faded design preview of the
// intended layout. Kept in nav so partner_manager admins know it's coming.
const PREVIEW_ROWS = [
  { source: '/shop/lagos-mart',  destination: '/partners/lagos-fresh-market', type: 'Permanent', hits: '-', status: 'Active'   },
  { source: '/shop/abuja-hub',   destination: '/partners/abuja-superstore',   type: 'Temporary', hits: '-', status: 'Active'   },
  { source: '/shop/ph-depot',    destination: '/partners/ph-depot-express',   type: 'Permanent', hits: '-', status: 'Inactive' },
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
            <p className="text-sm text-gray-500">Map short or legacy URLs to active partner pages</p>
          </div>
        </div>
      </div>

      {/* Not-yet-available banner */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <Info size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm text-[#78350F]">
          <p className="font-semibold">Not available at launch.</p>
          <p className="mt-1 text-[#78350F]/80">
            This feature is planned for a later release. When ready, admins will be able to create 301/302
            redirects from legacy or promotional URLs to live partner storefronts. The layout below is a
            design preview.
          </p>
        </div>
      </div>

      {/* Design preview */}
      <div className="bg-white rounded-xl border border-dashed border-gray-200 relative overflow-hidden">
        <div className="absolute top-2 right-2 z-10 text-xs bg-white/95 border border-gray-200 rounded-full px-2 py-0.5 font-medium text-gray-500">
          Design preview
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 opacity-40">
          <span className="text-sm font-semibold text-[#0F2B4C]">Active Redirect Rules</span>
          <span className="text-xs text-gray-400">{PREVIEW_ROWS.length} rules</span>
        </div>
        <div className="overflow-x-auto opacity-40 pointer-events-none select-none">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-3">Source Path</th>
                <th className="text-left px-4 py-3">Destination</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Hit Count</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {PREVIEW_ROWS.map((r) => (
                <tr key={r.source}>
                  <td className="px-4 py-3 font-mono text-xs text-[#3A7BD5]">{r.source}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.destination}</td>
                  <td className="px-4 py-3 text-gray-600">{r.type}</td>
                  <td className="px-4 py-3 text-gray-600">{r.hits}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
