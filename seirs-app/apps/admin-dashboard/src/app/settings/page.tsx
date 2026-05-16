'use client';
import { useEffect, useState } from 'react';
import { Settings, Lock, AlertTriangle, RefreshCw, Save } from 'lucide-react';
import { adminApi } from '@/lib/api';

interface ConfigRow {
  key:         string;
  value:       string;
  description: string;
  isEditable:  boolean;
  updatedAt:   string;
}

const PRETTY_LABEL: Record<string, string> = {
  platform_name:         'Platform Name',
  support_email:         'Support Email',
  max_active_deliveries: 'Max Active Deliveries',
  default_currency:      'Default Currency',
  default_timezone:      'Default Timezone',
  maintenance_mode:      'Maintenance Mode',
};

export default function SettingsPage() {
  const [rows, setRows]       = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft]     = useState<string>('');
  const [saving, setSaving]   = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await adminApi.settings.list();
      setRows(list ?? []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const beginEdit = (row: ConfigRow) => {
    setEditing(row.key);
    setDraft(row.value);
  };

  const cancel = () => { setEditing(null); setDraft(''); };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await adminApi.settings.update(editing, draft.trim());
      await load();
      setEditing(null);
      setDraft('');
    } catch (e: any) {
      alert(`Save failed: ${e?.message ?? 'unknown error'}`);
    } finally { setSaving(false); }
  };

  const maintenanceRow = rows.find(r => r.key === 'maintenance_mode');
  const maintenanceOn  = maintenanceRow?.value === 'on';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <Settings size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">System Settings</h1>
            <p className="text-sm text-gray-500">Platform configuration. Edits are written to the audit log.</p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {maintenanceOn && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700">Maintenance mode is ON.</p>
            <p className="text-xs text-red-600 mt-0.5">
              All apps are showing the maintenance screen and matching is paused. Flip <code className="bg-red-100 px-1 rounded">maintenance_mode</code> to <code className="bg-red-100 px-1 rounded">off</code> to resume normal operation.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <Settings size={15} className="text-[#0F2B4C]" />
          <span className="text-sm font-semibold text-[#0F2B4C]">Platform Configuration</span>
        </div>
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No configuration keys defined yet.</div>
          ) : rows.map(row => {
            const label = PRETTY_LABEL[row.key] ?? row.key;
            const isEditing = editing === row.key;
            return (
              <div key={row.key} className="px-4 py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-gray-700">{label}</div>
                    {!row.isEditable && (
                      <span className="text-[10px] uppercase font-bold tracking-wide text-gray-400 flex items-center gap-1">
                        <Lock size={10} /> Read-only
                      </span>
                    )}
                  </div>
                  {row.description && (
                    <div className="text-xs text-gray-500 mt-0.5">{row.description}</div>
                  )}
                  {!isEditing ? (
                    <div className="text-sm text-[#0F2B4C] mt-2 font-mono">{row.value}</div>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        autoFocus
                        className="flex-1 max-w-md border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
                      />
                      <button
                        onClick={save}
                        disabled={saving || draft.trim() === ''}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 font-semibold bg-[#0F2B4C] text-white rounded-lg hover:bg-[#3A7BD5] disabled:opacity-50"
                      >
                        <Save size={12} />
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={cancel} className="text-xs px-3 py-1.5 text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                {!isEditing && row.isEditable && (
                  <button
                    onClick={() => beginEdit(row)}
                    className="text-xs text-[#3A7BD5] hover:underline font-medium border border-[#3A7BD5]/30 px-2.5 py-1 rounded-lg hover:bg-[#3A7BD5]/5 transition-colors shrink-0"
                  >
                    Edit
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-xs text-gray-400 text-center">
        Email templates live at <a className="text-[#3A7BD5] hover:underline" href="/email-templates">/email-templates</a>. Rate card lives at <a className="text-[#3A7BD5] hover:underline" href="/pricing">/pricing</a>. Fee catalogue lives at <a className="text-[#3A7BD5] hover:underline" href="/fees">/fees</a>.
      </div>
    </div>
  );
}
