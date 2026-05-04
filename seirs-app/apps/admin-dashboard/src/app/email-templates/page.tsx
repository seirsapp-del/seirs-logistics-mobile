'use client';
import { useState } from 'react';
import { Mail, Save, Eye, AlertCircle } from 'lucide-react';

// Spec V8 §3.13 — email template editor. Currently the mail service
// hardcodes 10 transactional templates (OTP, reset, welcome, delivery
// updates, driver approved/rejected, handoff OTP). This admin page
// catalogues them, lets staff preview & edit subject + body, with
// variable interpolation hints.
//
// Backend persistence (EmailTemplate entity + override mechanism)
// ships in a follow-up commit; this UI catalogues current state and
// gives admins a place to draft updates that go through CMS approval.

const TEMPLATES = [
  { key: 'email_verification',  name: 'Email Verification OTP',     subject: 'Your Seirs verification code',           vars: ['name', 'otp'] },
  { key: 'password_reset',      name: 'Password Reset Link',        subject: 'Reset your Seirs password',              vars: ['name', 'resetUrl'] },
  { key: 'welcome',             name: 'Welcome',                    subject: 'Welcome to Seirs!',                      vars: ['name'] },
  { key: 'delivery_assigned',   name: 'Delivery — Driver Assigned', subject: 'Your driver is on the way',              vars: ['name', 'trackingCode', 'driverName'] },
  { key: 'delivery_picked_up',  name: 'Delivery — Picked Up',       subject: 'Your package is in transit',             vars: ['name', 'trackingCode'] },
  { key: 'delivery_complete',   name: 'Delivery — Complete',        subject: 'Your delivery is complete',              vars: ['name', 'trackingCode'] },
  { key: 'delivery_failed',     name: 'Delivery — Failed',          subject: 'Delivery attempt failed',                vars: ['name', 'trackingCode'] },
  { key: 'driver_approved',     name: 'Driver Approved',            subject: 'Your driver application is approved',    vars: ['name'] },
  { key: 'driver_rejected',     name: 'Driver Rejected',            subject: 'Update on your driver application',      vars: ['name', 'reason'] },
  { key: 'handoff_otp',         name: 'Handoff Pickup OTP',         subject: 'Your Seirs pickup verification code',    vars: ['name', 'otp', 'deliveryRef'] },
];

export default function EmailTemplatesPage() {
  const [activeKey, setActiveKey] = useState<string>(TEMPLATES[0].key);
  const active = TEMPLATES.find(t => t.key === activeKey) ?? TEMPLATES[0];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <Mail size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#0F2B4C]">Email Templates</h1>
          <p className="text-sm text-gray-500">
            Transactional email catalogue. Edit subject + body, use variable interpolation, preview before publishing.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
        <span>
          Currently templates are hardcoded in the backend mail service. Persistence + override layer + CMS approval flow ship in a follow-up. This page catalogues current state.
        </span>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Template list */}
        <aside className="col-span-4 bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-2">
          {TEMPLATES.map(t => {
            const on = activeKey === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveKey(t.key)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                  on ? 'bg-[#3A7BD5] text-white' : 'hover:bg-gray-50 text-[#0F2B4C]'
                }`}
              >
                <p className="text-sm font-semibold">{t.name}</p>
                <p className={`text-[10px] font-mono mt-0.5 ${on ? 'text-white/70' : 'text-gray-400'}`}>{t.key}</p>
              </button>
            );
          })}
        </aside>

        {/* Editor */}
        <div className="col-span-8 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-5 space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Template Key (read-only)</label>
              <p className="text-sm font-mono mt-1 text-[#0F2B4C]">{active.key}</p>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Subject</label>
              <input
                type="text"
                defaultValue={active.subject}
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:border-[#3A7BD5]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Available variables</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {active.vars.map(v => (
                  <code key={v} className="text-xs bg-[#3A7BD5]/10 text-[#3A7BD5] px-2 py-1 rounded font-mono">
                    {`{{${v}}}`}
                  </code>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Body (HTML)</label>
              <textarea
                defaultValue={`<p>Hi {{${active.vars[0] ?? 'name'}}},</p>\n<p>Customise this template body…</p>`}
                rows={10}
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm font-mono focus:outline-none focus:border-[#3A7BD5]"
              />
            </div>

            <div className="flex gap-2">
              <button className="flex items-center gap-2 bg-[#0F2B4C] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3A7BD5]">
                <Save size={14} />
                Save draft
              </button>
              <button className="flex items-center gap-2 border border-[#E5E7EB] text-[#0F2B4C] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50">
                <Eye size={14} />
                Preview
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
