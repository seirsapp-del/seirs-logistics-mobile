'use client';
import { Store, Plus, Search, MapPin, Package } from 'lucide-react';

const PLACEHOLDER_PARTNERS = [
  { name: 'Lagos Fresh Market', owner: 'Adebayo Okonkwo', location: 'Ikeja, Lagos', capacity: '50 orders/day', status: 'Active' },
  { name: 'Abuja Superstore',   owner: 'Fatima Al-Hassan', location: 'Wuse, Abuja',  capacity: '30 orders/day', status: 'Active' },
  { name: 'PH Depot Express',   owner: 'Chukwuemeka Eze', location: 'GRA, Port Harcourt', capacity: '20 orders/day', status: 'Pending' },
  { name: 'Kano Bulk Hub',      owner: 'Musa Ibrahim',    location: 'Nassarawa, Kano',    capacity: '40 orders/day', status: 'Active' },
  { name: 'Ibadan Traders Co.', owner: 'Bola Adeyemi',   location: 'UI Road, Ibadan',    capacity: '15 orders/day', status: 'Suspended' },
];

const STATUS_STYLES: Record<string, string> = {
  Active:    'bg-green-100 text-green-700',
  Pending:   'bg-yellow-100 text-yellow-700',
  Suspended: 'bg-red-100 text-red-700',
};

export default function PartnersPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <Store size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Partner Accounts</h1>
            <p className="text-sm text-gray-500">Manage registered store and business partners</p>
          </div>
        </div>
        <button className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#2f6cc0] transition-colors">
          <Plus size={15} />
          Add Partner
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Partners', value: '—', icon: Store },
          { label: 'Active This Week', value: '—', icon: Package },
          { label: 'Cities Covered', value: '—', icon: MapPin },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#0F2B4C]/8 flex items-center justify-center">
              <Icon size={18} className="text-[#0F2B4C]" />
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
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-[#0F2B4C]">All Partners</span>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
            <Search size={13} className="text-gray-400" />
            <input className="text-sm bg-transparent outline-none placeholder:text-gray-400 w-40" placeholder="Search partners…" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-3">Store Name</th>
                <th className="text-left px-4 py-3">Owner</th>
                <th className="text-left px-4 py-3">Location</th>
                <th className="text-left px-4 py-3">Capacity</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {PLACEHOLDER_PARTNERS.map((p) => (
                <tr key={p.name} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-[#0F2B4C]">{p.name}</td>
                  <td className="px-4 py-3 text-gray-600">{p.owner}</td>
                  <td className="px-4 py-3 text-gray-600 flex items-center gap-1">
                    <MapPin size={12} className="text-gray-400 shrink-0" />{p.location}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.capacity}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[p.status]}`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-[#3A7BD5] hover:underline font-medium">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
          Showing placeholder data — connect to API to load live partner records
        </div>
      </div>
    </div>
  );
}
