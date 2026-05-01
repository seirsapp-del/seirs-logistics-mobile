'use client';
import { Lightbulb, ThumbsUp, MessageSquare, Tag } from 'lucide-react';

const PLACEHOLDER_SUGGESTIONS = [
  { user: 'Kemi Adeyemi',   subject: 'Add estimated delivery time to tracking page', category: 'UX',      votes: 24, replies: 3, date: '29 Apr 2026', status: 'Under Review' },
  { user: 'Emeka Obi',      subject: 'Allow scheduling deliveries up to 7 days ahead', category: 'Feature', votes: 19, replies: 5, date: '28 Apr 2026', status: 'Planned'      },
  { user: 'Halima Musa',    subject: 'Push notification for every status change',      category: 'Feature', votes: 31, replies: 7, date: '27 Apr 2026', status: 'In Progress'  },
  { user: 'Tobi Fashola',   subject: 'Support for Pidgin language UI',                category: 'i18n',    votes: 12, replies: 2, date: '26 Apr 2026', status: 'Under Review' },
  { user: 'Grace Nwosu',    subject: 'Add a dark mode option',                        category: 'UX',      votes: 44, replies: 9, date: '25 Apr 2026', status: 'Planned'      },
];

const STATUS_STYLES: Record<string, string> = {
  'Under Review': 'bg-yellow-100 text-yellow-700',
  'Planned':      'bg-[#3A7BD5]/10 text-[#3A7BD5]',
  'In Progress':  'bg-green-100 text-green-700',
  'Closed':       'bg-gray-100 text-gray-500',
};

const CATEGORY_STYLES: Record<string, string> = {
  UX:      'bg-purple-100 text-purple-700',
  Feature: 'bg-[#0F2B4C]/10 text-[#0F2B4C]',
  i18n:    'bg-cyan-100 text-cyan-700',
};

export default function SuggestionsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <Lightbulb size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#0F2B4C]">User Suggestions</h1>
          <p className="text-sm text-gray-500">Feature requests and feedback submitted by customers and drivers</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Suggestions', value: PLACEHOLDER_SUGGESTIONS.length, icon: Lightbulb,     color: 'text-yellow-500' },
          { label: 'Total Votes',       value: PLACEHOLDER_SUGGESTIONS.reduce((s, r) => s + r.votes, 0), icon: ThumbsUp, color: 'text-[#3A7BD5]' },
          { label: 'Total Replies',     value: PLACEHOLDER_SUGGESTIONS.reduce((s, r) => s + r.replies, 0), icon: MessageSquare, color: 'text-green-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
              <Icon size={18} className={color} />
            </div>
            <div>
              <div className="text-xl font-bold text-[#0F2B4C]">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {PLACEHOLDER_SUGGESTIONS.map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4 items-start hover:shadow-sm transition-shadow">
            {/* Vote count */}
            <div className="flex flex-col items-center gap-0.5 shrink-0 min-w-[44px]">
              <ThumbsUp size={14} className="text-[#3A7BD5]" />
              <span className="text-base font-bold text-[#0F2B4C]">{s.votes}</span>
              <span className="text-[10px] text-gray-400">votes</span>
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 flex-wrap">
                <p className="text-sm font-semibold text-[#0F2B4C] flex-1">{s.subject}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLES[s.status]}`}>{s.status}</span>
              </div>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Tag size={11} />
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${CATEGORY_STYLES[s.category] ?? 'bg-gray-100 text-gray-600'}`}>{s.category}</span>
                </span>
                <span className="text-xs text-gray-400">by {s.user}</span>
                <span className="text-xs text-gray-400">{s.date}</span>
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <MessageSquare size={11} />
                  {s.replies} replies
                </span>
              </div>
            </div>
            <button className="text-xs text-[#3A7BD5] hover:underline font-medium shrink-0">View</button>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 text-center">
        Showing placeholder data — connect to API to load live user suggestions
      </p>
    </div>
  );
}
