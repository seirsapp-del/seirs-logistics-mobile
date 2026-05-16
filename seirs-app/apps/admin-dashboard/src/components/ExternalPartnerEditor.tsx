'use client';
import { useState } from 'react';
import { X, AlertCircle, Loader2, Save, Trash2 } from 'lucide-react';
import { adminApi } from '@/lib/api';

// Spec V8 §3.13 — shared editor for Insurance + Specialist partner
// directories. Renders the right meta fields per type discriminator.

export interface ExternalPartner {
  id?:           string;
  type:          'insurance' | 'specialist';
  name:          string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  websiteUrl?:   string | null;
  notes?:        string | null;
  status:        'active' | 'pending' | 'lapsed' | 'paused';
  meta:          Record<string, any>;
  createdAt?:    string;
}

export function ExternalPartnerModal({ row, type, onClose, onSaved }: {
  row:     ExternalPartner | null;        // null = new
  type:    'insurance' | 'specialist';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name,         setName]         = useState(row?.name ?? '');
  const [contactEmail, setContactEmail] = useState(row?.contactEmail ?? '');
  const [contactPhone, setContactPhone] = useState(row?.contactPhone ?? '');
  const [websiteUrl,   setWebsiteUrl]   = useState(row?.websiteUrl ?? '');
  const [notes,        setNotes]        = useState(row?.notes ?? '');
  const [status,       setStatus]       = useState<ExternalPartner['status']>(row?.status ?? 'pending');
  const [meta,         setMeta]         = useState<Record<string, any>>(row?.meta ?? {});
  const [saving,       setSaving]       = useState(false);
  const [err,          setErr]          = useState<string | null>(null);

  const setMetaField = (k: string, v: any) => setMeta(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const body = { type, name, contactEmail, contactPhone, websiteUrl, notes, status, meta };
      if (row?.id) await adminApi.externalPartners.update(row.id, body);
      else         await adminApi.externalPartners.create(body);
      onSaved();
    } catch (e: any) { setErr(e?.message ?? 'Save failed'); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!row?.id || !confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    setSaving(true);
    try { await adminApi.externalPartners.remove(row.id); onSaved(); }
    catch (e: any) { setErr(e?.message ?? 'Delete failed'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="font-bold text-[#0F2B4C]">
            {row?.id ? 'Edit' : 'New'} {type === 'insurance' ? 'Insurer' : 'Specialist'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-3 text-sm">
          {err && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} /> {err}
            </div>
          )}

          <Field label="Provider name">
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact email">
              <input type="email" value={contactEmail ?? ''} onChange={e => setContactEmail(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
            </Field>
            <Field label="Contact phone">
              <input value={contactPhone ?? ''} onChange={e => setContactPhone(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
            </Field>
          </div>

          <Field label="Website">
            <input type="url" value={websiteUrl ?? ''} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://"
              className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
          </Field>

          {type === 'insurance' && (
            <>
              <Field label="Coverage type">
                <select value={meta.coverageType ?? 'cargo'} onChange={e => setMetaField('coverageType', e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]">
                  <option value="cargo">Cargo & Transit</option>
                  <option value="driver_accident">Driver Accident</option>
                  <option value="third_party">Third-Party Liability</option>
                  <option value="cyber">Cyber Liability</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Premium">
                  <input value={meta.premium ?? ''} onChange={e => setMetaField('premium', e.target.value)}
                    placeholder="₦2,000/month or 0.5% per delivery"
                    className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
                </Field>
                <Field label="Coverage limit (₦)">
                  <input type="number" value={meta.coverageLimitNgn ?? 0} onChange={e => setMetaField('coverageLimitNgn', Number(e.target.value) || 0)}
                    className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
                </Field>
              </div>
              <Field label="Renewal date">
                <input type="date" value={meta.renewalDate?.slice(0, 10) ?? ''} onChange={e => setMetaField('renewalDate', e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
              </Field>
            </>
          )}

          {type === 'specialist' && (
            <>
              <Field label="Specialty">
                <select value={meta.specialty ?? 'Heavy Cargo'} onChange={e => setMetaField('specialty', e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]">
                  <option>Heavy Cargo</option>
                  <option>Cold Chain</option>
                  <option>Medical Supplies</option>
                  <option>Furniture & Appliances</option>
                  <option>Document Courier</option>
                  <option>Bulk Retail</option>
                  <option>Live Animals</option>
                  <option>Industrial Parts</option>
                </select>
              </Field>
              <Field label="Service areas (comma-separated cities)">
                <input value={(meta.serviceAreas ?? []).join(', ')}
                  onChange={e => setMetaField('serviceAreas', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  placeholder="Lagos, Abuja, Port Harcourt"
                  className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Rating (0-5)">
                  <input type="number" step="0.1" min={0} max={5} value={meta.rating ?? 0}
                    onChange={e => setMetaField('rating', Math.max(0, Math.min(5, Number(e.target.value) || 0)))}
                    className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
                </Field>
                <Field label="Completed jobs">
                  <input type="number" value={meta.completedJobs ?? 0}
                    onChange={e => setMetaField('completedJobs', Math.max(0, Number(e.target.value) || 0))}
                    className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
                </Field>
              </div>
            </>
          )}

          <Field label="Status">
            <select value={status} onChange={e => setStatus(e.target.value as any)}
              className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]">
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              {type === 'insurance' && <option value="lapsed">Lapsed</option>}
              <option value="paused">Paused</option>
            </select>
          </Field>

          <Field label="Notes">
            <textarea value={notes ?? ''} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
          </Field>
        </div>

        <div className="flex justify-between gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <div>
            {row?.id && (
              <button onClick={remove} disabled={saving}
                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg">
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button onClick={save} disabled={saving || !name.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-[#0F2B4C] text-white rounded-lg hover:bg-[#3A7BD5] disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</label>
      {children}
    </div>
  );
}
