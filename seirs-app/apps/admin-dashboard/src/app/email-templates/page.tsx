'use client';
import { useEffect, useState } from 'react';
import { Mail, Save, Eye, AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { adminApi } from '@/lib/api';

// Spec V8 §3.13 — admin-editable transactional email templates.
// Reads /admin/email-templates: defaults come from the in-code seed,
// overrides come from the email_templates table. Saving a draft
// upserts an override row that the mail renderer picks up on next send.

interface TemplateRow {
  key:      string;
  name:     string;
  vars:     string[];
  defaults: { subject: string; bodyHtml: string };
  override: { subject: string; bodyHtml: string; active: boolean; updatedAt: string } | null;
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [activeKey, setActiveKey] = useState<string>('');
  const [subject,   setSubject]   = useState('');
  const [bodyHtml,  setBodyHtml]  = useState('');
  const [active,    setActive]    = useState(true);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.emailTemplates.list()
      .then((data: any) => {
        const rows = Array.isArray(data) ? data : [];
        setTemplates(rows);
        if (!activeKey && rows.length) selectTemplate(rows[0]);
      })
      .catch((e: any) => setError(e?.message ?? 'Could not load templates'))
      .finally(() => setLoading(false));
  };

  const selectTemplate = (t: TemplateRow) => {
    setActiveKey(t.key);
    setSubject(t.override?.subject  ?? t.defaults.subject);
    setBodyHtml(t.override?.bodyHtml ?? t.defaults.bodyHtml);
    setActive(t.override?.active ?? true);
    setSaved(false);
    setShowPreview(false);
  };

  useEffect(() => { load(); }, []);

  const active_t = templates.find(t => t.key === activeKey);

  const save = async () => {
    if (!activeKey) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi.emailTemplates.update(activeKey, { subject, bodyHtml, active });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      load();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Cheap preview: substitute the first sample value for each var so
  // admins can see what the email roughly looks like.
  const renderedPreview = () => {
    if (!active_t) return '';
    let out = bodyHtml;
    active_t.vars.forEach(v => {
      const sample = SAMPLES[v] ?? `[${v}]`;
      out = out.replace(new RegExp(`\\{\\{\\s*${v}\\s*\\}\\}`, 'g'), sample);
    });
    return out;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <Mail size={18} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#0F2B4C]">Email Templates</h1>
          <p className="text-sm text-gray-500">
            Transactional email catalogue. Edits override the in-code default and take effect immediately.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading templates…
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {/* Template list */}
          <aside className="col-span-4 bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-2 max-h-[600px] overflow-y-auto">
            {templates.map(t => {
              const on   = activeKey === t.key;
              const has  = !!t.override;
              return (
                <button
                  key={t.key}
                  onClick={() => selectTemplate(t)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                    on ? 'bg-[#3A7BD5] text-white' : 'hover:bg-gray-50 text-[#0F2B4C]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{t.name}</p>
                    {has && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                        on ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                      }`}>edited</span>
                    )}
                  </div>
                  <p className={`text-[10px] font-mono mt-0.5 ${on ? 'text-white/70' : 'text-gray-400'}`}>{t.key}</p>
                </button>
              );
            })}
          </aside>

          {/* Editor */}
          <div className="col-span-8 space-y-4">
            {active_t && (
              <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-5 space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Template Key</label>
                  <p className="text-sm font-mono mt-1 text-[#0F2B4C]">{active_t.key}</p>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => { setSubject(e.target.value); setSaved(false); }}
                    className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:border-[#3A7BD5]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Available variables</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {active_t.vars.map(v => (
                      <code key={v} className="text-xs bg-[#3A7BD5]/10 text-[#3A7BD5] px-2 py-1 rounded font-mono">
                        {`{{${v}}}`}
                      </code>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Body (HTML)</label>
                  <textarea
                    value={bodyHtml}
                    onChange={e => { setBodyHtml(e.target.value); setSaved(false); }}
                    rows={10}
                    className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm font-mono focus:outline-none focus:border-[#3A7BD5]"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={e => { setActive(e.target.checked); setSaved(false); }}
                  />
                  Override is <b>active</b> — uncheck to revert to in-code default without losing this draft
                </label>

                <div className="flex gap-2">
                  <button
                    onClick={save}
                    disabled={saving}
                    className="flex items-center gap-2 bg-[#0F2B4C] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3A7BD5] disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
                    {saving ? 'Saving…' : saved ? 'Saved' : 'Save override'}
                  </button>
                  <button
                    onClick={() => setShowPreview(p => !p)}
                    className="flex items-center gap-2 border border-[#E5E7EB] text-[#0F2B4C] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50"
                  >
                    <Eye size={14} />
                    {showPreview ? 'Hide preview' : 'Preview'}
                  </button>
                </div>

                {showPreview && (
                  <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 border-b border-[#E5E7EB] text-xs font-semibold text-gray-600">
                      Subject: {subject}
                    </div>
                    <div className="p-4 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: renderedPreview() }} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Sample interpolation values for the preview pane.
const SAMPLES: Record<string, string> = {
  name:         'Adunni Bello',
  otp:          '482917',
  resetUrl:     'https://seirs.app/reset?token=sample',
  trackingCode: 'SR-7K2P9X',
  driverName:   'Emeka Obi',
  reason:       'Driver licence photo unreadable',
  deliveryRef:  'SR-7K2P9X',
};
