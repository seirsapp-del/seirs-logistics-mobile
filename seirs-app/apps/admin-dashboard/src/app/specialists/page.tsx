'use client';
import { Briefcase, Plus, Star } from 'lucide-react';

const SPECIALTIES = ['Heavy Cargo', 'Cold Chain', 'Medical Supplies', 'Furniture & Appliances', 'Document Courier', 'Bulk Retail'];

const PLACEHOLDER_SPECIALISTS = [
  { name: 'Emeka Logistics Ltd',   specialty: 'Heavy Cargo',        rating: '4.8', deliveries: '—', status: 'Verified'  },
  { name: 'CoolRun Express',       specialty: 'Cold Chain',         rating: '4.6', deliveries: '—', status: 'Verified'  },
  { name: 'MedSwift Nigeria',      specialty: 'Medical Supplies',   rating: '4.9', deliveries: '—', status: 'Pending'   },
  { name: 'MegaMover Co.',         specialty: 'Furniture & Appliances', rating: '4.5', deliveries: '—', status: 'Verified' },
];

const STATUS_STYLES: Record<string, string> = {
  Verified: 'bg-[#3A7BD5]/10 text-[#3A7BD5]',
  Pending:  'bg-yellow-100 text-yellow-700',
};

export default function SpecialistsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <Briefcase size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Specialist Partners</h1>
            <p className="text-sm text-gray-500">Partners with certified specialisations for non-standard deliveries</p>
          </div>
        </div>
        <button className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#2f6cc0] transition-colors">
          <Plus size={15} />
          Register Specialist
        </button>
      </div>

      {/* Specialty tags */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-gray-500 self-center mr-1 font-medium">Specialties:</span>
        {SPECIALTIES.map((s) => (
          <span key={s} className="text-xs bg-[#0F2B4C]/8 text-[#0F2B4C] px-2.5 py-1 rounded-full font-medium">{s}</span>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-[#0F2B4C]">Specialist Partner Directory</span>
          <span className="text-xs text-gray-400">{PLACEHOLDER_SPECIALISTS.length} partners</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-3">Partner Name</th>
                <th className="text-left px-4 py-3">Specialty</th>
                <th className="text-left px-4 py-3">Rating</th>
                <th className="text-left px-4 py-3">Deliveries</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {PLACEHOLDER_SPECIALISTS.map((s) => (
                <tr key={s.name} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-[#0F2B4C]">{s.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s.specialty}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-gray-600">
                      <Star size={12} className="text-yellow-400 fill-yellow-400" />{s.rating}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.deliveries}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[s.status]}`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-[#3A7BD5] hover:underline font-medium">View Profile</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
          Showing placeholder data — connect to API to load live specialist records
        </div>
      </div>
    </div>
  );
}
