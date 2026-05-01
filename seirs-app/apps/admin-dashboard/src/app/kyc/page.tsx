'use client';
import { ClipboardCheck, Search, Filter } from 'lucide-react';

const PLACEHOLDER_KYC = [
  { driver: 'Tunde Badmus',     docType: "Driver's Licence",     submitted: '30 Apr 2026', status: 'Pending'  },
  { driver: 'Chioma Nwosu',     docType: 'Vehicle Registration',  submitted: '29 Apr 2026', status: 'Pending'  },
  { driver: 'Musa Garba',       docType: 'NIN (Biometric)',       submitted: '29 Apr 2026', status: 'Approved' },
  { driver: 'Adaeze Obi',       docType: "Driver's Licence",      submitted: '28 Apr 2026', status: 'Rejected' },
  { driver: 'Segun Fashola',    docType: 'Proof of Address',      submitted: '27 Apr 2026', status: 'Pending'  },
  { driver: 'Yinka Adebayo',    docType: 'Vehicle Registration',  submitted: '26 Apr 2026', status: 'Approved' },
];

const STATUS_STYLES: Record<string, string> = {
  Pending:  'bg-yellow-100 text-yellow-700',
  Approved: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
};

export default function KycPage() {
  const pending  = PLACEHOLDER_KYC.filter((k) => k.status === 'Pending').length;
  const approved = PLACEHOLDER_KYC.filter((k) => k.status === 'Approved').length;
  const rejected = PLACEHOLDER_KYC.filter((k) => k.status === 'Rejected').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <ClipboardCheck size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#0F2B4C]">Driver KYC Queue</h1>
          <p className="text-sm text-gray-500">Review and approve driver identity and document submissions</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Awaiting Review', value: pending,  color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'Approved',        value: approved, color: 'text-green-600',  bg: 'bg-green-50'  },
          { label: 'Rejected',        value: rejected, color: 'text-red-600',    bg: 'bg-red-50'    },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`rounded-xl border border-gray-200 p-4 ${bg}`}>
            <div className={`text-3xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-600 mt-0.5 font-medium">{label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 gap-3">
          <span className="text-sm font-semibold text-[#0F2B4C] shrink-0">KYC Submissions</span>
          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
              <Search size={13} className="text-gray-400" />
              <input className="text-sm bg-transparent outline-none placeholder:text-gray-400 w-36" placeholder="Search driver…" />
            </div>
            <button className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 bg-white px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
              <Filter size={13} />
              Filter
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-3">Driver</th>
                <th className="text-left px-4 py-3">Document Type</th>
                <th className="text-left px-4 py-3">Submitted</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {PLACEHOLDER_KYC.map((k, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-[#0F2B4C]">{k.driver}</td>
                  <td className="px-4 py-3 text-gray-600">{k.docType}</td>
                  <td className="px-4 py-3 text-gray-500">{k.submitted}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[k.status]}`}>{k.status}</span>
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button className="text-xs text-[#3A7BD5] hover:underline font-medium">View Doc</button>
                    {k.status === 'Pending' && (
                      <>
                        <button className="text-xs text-green-600 hover:underline font-medium">Approve</button>
                        <button className="text-xs text-red-500 hover:underline font-medium">Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
          Showing placeholder data — connect to API to load live KYC submissions
        </div>
      </div>
    </div>
  );
}
