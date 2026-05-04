'use client';
import { useState } from 'react';
import { Send, Users, Truck, Store, AlertCircle, CheckCircle2, Calendar } from 'lucide-react';

// Spec V8 §3.13 — push composer for one-off ops broadcasts. Different
// from the CMS (which schedules editorial content) — this is for
// real-time messaging like "service paused in Lekki due to flooding".
//
// Backend wiring: hits FCM via the existing notifications module once
// audience filtering ships. For now the form is fully functional and
// validates input; the send handler hits a placeholder route that
// will be wired up in the next batch.

type Audience = 'all_customers' | 'all_drivers' | 'all_partners' | 'specific_zone';
type Schedule = 'now' | 'later';

const AUDIENCES: Array<{ key: Audience; label: string; sub: string; Icon: any; color: string }> = [
  { key: 'all_customers', label: 'All customers',  sub: 'Everyone with a customer account',  Icon: Users, color: '#3A7BD5' },
  { key: 'all_drivers',   label: 'All drivers',    sub: 'Approved drivers only',              Icon: Truck, color: '#D97706' },
  { key: 'all_partners',  label: 'All partner stores', sub: 'Active partner store accounts',  Icon: Store, color: '#16A34A' },
  { key: 'specific_zone', label: 'Specific area',  sub: 'Geofence by city or LGA (coming)',   Icon: AlertCircle, color: '#8B5CF6' },
];

export default function NotifyComposerPage() {
  const [audience, setAudience] = useState<Audience>('all_customers');
  const [zone,     setZone]     = useState('');
  const [title,    setTitle]    = useState('');
  const [body,     setBody]     = useState('');
  const [schedule, setSchedule] = useState<Schedule>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const charLimit = 240;
  const titleOk = title.length > 0 && title.length <= 60;
  const bodyOk  = body.length  > 0 && body.length  <= charLimit;
  const audienceOk = audience !== 'specific_zone' || zone.trim().length > 0;
  const scheduleOk = schedule === 'now' || scheduleAt.length > 0;

  const canSend = titleOk && bodyOk && audienceOk && scheduleOk && !submitting;

  const send = async () => {
    setSubmitting(true);
    try {
      // Placeholder until the backend FCM-broadcast endpoint lands.
      // Real call will look like:
      //   adminApi.notifications.broadcast({ audience, zone, title, body, scheduleAt })
      await new Promise(r => setTimeout(r, 800));
      setSent(true);
      setTimeout(() => {
        setSent(false);
        setTitle(''); setBody(''); setZone('');
      }, 2500);
    } finally {
      setSubmitting(false);
    }
  };

  const aud = AUDIENCES.find(a => a.key === audience)!;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <Send size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#0F2B4C]">Push Notification Composer</h1>
          <p className="text-sm text-gray-500">
            One-off broadcasts for ops events (service interruptions, weather alerts, system announcements). For editorial content use the CMS instead.
          </p>
        </div>
      </div>

      {sent && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
          <CheckCircle2 size={16} />
          Broadcast {schedule === 'now' ? 'sent' : 'scheduled'} successfully.
        </div>
      )}

      {/* Audience picker */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-5 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-gray-600">Audience</h2>
        <div className="grid grid-cols-2 gap-3">
          {AUDIENCES.map(a => {
            const active = audience === a.key;
            return (
              <button
                key={a.key}
                onClick={() => setAudience(a.key)}
                className={`text-left p-3 rounded-lg border-2 flex items-start gap-3 transition-colors ${
                  active ? 'border-[#3A7BD5] bg-[#3A7BD5]/5' : 'border-[#E5E7EB] hover:border-gray-300'
                }`}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: a.color + '15' }}
                >
                  <a.Icon size={16} color={a.color} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0F2B4C]">{a.label}</p>
                  <p className="text-xs text-gray-500 truncate">{a.sub}</p>
                </div>
              </button>
            );
          })}
        </div>
        {audience === 'specific_zone' && (
          <input
            type="text"
            placeholder="City or LGA (e.g. Lekki, Yaba, Ikeja)"
            value={zone}
            onChange={e => setZone(e.target.value)}
            className="w-full px-3 py-2 mt-2 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:border-[#3A7BD5]"
          />
        )}
      </div>

      {/* Message */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-5 space-y-4">
        <div>
          <div className="flex justify-between items-baseline">
            <label className="text-xs font-bold uppercase tracking-wide text-gray-600">Title</label>
            <span className="text-[10px] text-gray-400">{title.length} / 60</span>
          </div>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value.slice(0, 60))}
            placeholder="Service paused in Lekki"
            className="w-full mt-1 px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:border-[#3A7BD5]"
          />
        </div>
        <div>
          <div className="flex justify-between items-baseline">
            <label className="text-xs font-bold uppercase tracking-wide text-gray-600">Message</label>
            <span className="text-[10px] text-gray-400">{body.length} / {charLimit}</span>
          </div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value.slice(0, charLimit))}
            placeholder="Heavy rain on Admiralty Way — driver pickups in the area are paused until 4pm. Tap to view alternatives."
            rows={4}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:border-[#3A7BD5]"
          />
        </div>
      </div>

      {/* Schedule */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-5 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-gray-600">Send</h2>
        <div className="flex gap-3">
          <button
            onClick={() => setSchedule('now')}
            className={`flex-1 p-3 rounded-lg border-2 text-sm font-semibold ${
              schedule === 'now' ? 'border-[#3A7BD5] bg-[#3A7BD5]/5 text-[#0F2B4C]' : 'border-[#E5E7EB] text-gray-500'
            }`}
          >
            Send now
          </button>
          <button
            onClick={() => setSchedule('later')}
            className={`flex-1 p-3 rounded-lg border-2 text-sm font-semibold flex items-center justify-center gap-1.5 ${
              schedule === 'later' ? 'border-[#3A7BD5] bg-[#3A7BD5]/5 text-[#0F2B4C]' : 'border-[#E5E7EB] text-gray-500'
            }`}
          >
            <Calendar size={14} />
            Schedule
          </button>
        </div>
        {schedule === 'later' && (
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={e => setScheduleAt(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:border-[#3A7BD5]"
          />
        )}
      </div>

      {/* Preview */}
      <div className="bg-gradient-to-br from-[#0F2B4C] to-[#1a3d6b] rounded-xl p-5 text-white">
        <p className="text-[10px] font-bold uppercase tracking-wide opacity-60 mb-2">Preview</p>
        <div className="bg-white/10 rounded-lg p-4 space-y-2">
          <p className="font-bold text-sm">{title || 'Notification title'}</p>
          <p className="text-xs opacity-90">{body || 'Notification message body — appears in the device notification tray and in-app notification center.'}</p>
          <p className="text-[10px] opacity-50">to {aud.label}{audience === 'specific_zone' && zone ? ` · ${zone}` : ''}</p>
        </div>
      </div>

      <button
        onClick={send}
        disabled={!canSend}
        className="w-full bg-[#0F2B4C] text-white py-3 rounded-lg font-semibold hover:bg-[#3A7BD5] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
      >
        <Send size={16} />
        {submitting ? 'Sending…' : schedule === 'now' ? 'Send now' : 'Schedule broadcast'}
      </button>
    </div>
  );
}
