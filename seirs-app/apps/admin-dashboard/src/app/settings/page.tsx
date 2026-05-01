'use client';
import { Settings, Bell, Wrench, Lock, AlertTriangle } from 'lucide-react';

const PLATFORM_CONFIG = [
  { key: 'Platform Name',           value: 'Seirs Logistics',   editable: true  },
  { key: 'Support Email',           value: 'support@seirs.ng',  editable: true  },
  { key: 'Max Active Deliveries',   value: '1,000',             editable: true  },
  { key: 'Default Currency',        value: 'NGN (₦)',           editable: false },
  { key: 'Default Timezone',        value: 'Africa/Lagos (WAT)',editable: false },
];

const NOTIFICATION_TEMPLATES = [
  { name: 'Delivery Assigned',   channel: 'SMS + Push',  lastModified: '—', status: 'Active' },
  { name: 'Delivery Completed',  channel: 'SMS + Push',  lastModified: '—', status: 'Active' },
  { name: 'Payout Processed',    channel: 'Push',        lastModified: '—', status: 'Active' },
  { name: 'KYC Approved',        channel: 'Email + SMS', lastModified: '—', status: 'Active' },
  { name: 'Account Suspended',   channel: 'Email',       lastModified: '—', status: 'Active' },
];

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <Settings size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#0F2B4C]">System Settings</h1>
          <p className="text-sm text-gray-500">Platform configuration, templates, and maintenance controls</p>
        </div>
      </div>

      {/* Super Admin notice */}
      <div className="flex items-start gap-3 bg-[#0F2B4C]/5 border border-[#0F2B4C]/20 rounded-xl p-4">
        <Lock size={15} className="text-[#0F2B4C] mt-0.5 shrink-0" />
        <p className="text-sm text-[#0F2B4C]">
          Most settings on this page are restricted to <strong>Super Admins</strong> only. Edits are logged to the audit trail automatically.
        </p>
      </div>

      {/* Platform Config */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <Wrench size={15} className="text-[#0F2B4C]" />
          <span className="text-sm font-semibold text-[#0F2B4C]">Platform Configuration</span>
        </div>
        <div className="divide-y divide-gray-100">
          {PLATFORM_CONFIG.map((c) => (
            <div key={c.key} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium text-gray-700">{c.key}</div>
                <div className="text-xs text-gray-500 mt-0.5 font-mono">{c.value}</div>
              </div>
              {c.editable ? (
                <button className="text-xs text-[#3A7BD5] hover:underline font-medium border border-[#3A7BD5]/30 px-2.5 py-1 rounded-lg hover:bg-[#3A7BD5]/5 transition-colors">
                  Edit
                </button>
              ) : (
                <span className="text-xs text-gray-400 italic">Read-only</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Notification Templates */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <Bell size={15} className="text-[#0F2B4C]" />
          <span className="text-sm font-semibold text-[#0F2B4C]">Notification Templates</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-3">Template</th>
                <th className="text-left px-4 py-3">Channel</th>
                <th className="text-left px-4 py-3">Last Modified</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {NOTIFICATION_TEMPLATES.map((t) => (
                <tr key={t.name} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-[#0F2B4C]">{t.name}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{t.channel}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{t.lastModified}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">{t.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-[#3A7BD5] hover:underline font-medium">Edit Template</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Maintenance Mode */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <AlertTriangle size={15} className="text-red-500" />
          <span className="text-sm font-semibold text-[#0F2B4C]">Maintenance Mode</span>
          <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">Currently Off</span>
        </div>
        <div className="p-4 flex items-start gap-4">
          <div className="flex-1">
            <p className="text-sm text-gray-700 font-medium">Enable Maintenance Mode</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              When enabled, all app users see a maintenance screen. Drivers cannot start deliveries. Admin portal remains accessible.
            </p>
            <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
              <Lock size={11} />
              This control is restricted to Super Admins only.
            </p>
          </div>
          <div className="shrink-0">
            <button
              disabled
              title="Super Admin only"
              className="relative flex items-center gap-2 bg-gray-100 text-gray-400 text-sm font-medium px-4 py-2 rounded-lg cursor-not-allowed select-none border border-gray-200"
            >
              <Lock size={13} />
              Enable Maintenance
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
