'use client';

/**
 * Website contact inbox.
 *
 * Built 2026-08-30 because it did not exist. The website form has been
 * POSTing to /website/contact and the rows have been saving correctly, the
 * admin endpoint has been live behind AdminGuard, and nothing in this
 * dashboard ever called it. The founder sent a test message and could not
 * find it anywhere; it was in the table the whole time, along with a smoke
 * test from May.
 *
 * No email fans out on submission either (the service logs and returns, and
 * says so in a comment), so until that exists this page is the ONLY way
 * anyone sees a message sent through the website. That is why it defaults
 * to New and shows the count in the sidebar.
 */
import { useCallback, useEffect, useState } from 'react';
import { Mail, Loader2, RefreshCw, AlertCircle, Phone, Clock, Save } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';

interface Submission {
  id:           string;
  name:         string;
  email:        string;
  phone:        string | null;
  subject:      string;
  message:      string;
  status:       string;
  internalNote: string | null;
  createdAt:    string;
}

const STATUSES = ['new', 'in_review', 'replied', 'spam', 'closed'] as const;

const STATUS_STYLE: Record<string, string> = {
  new:       'bg-blue-50 text-blue-700 border-blue-200',
  in_review: 'bg-amber-50 text-amber-700 border-amber-200',
  replied:   'bg-green-50 text-green-700 border-green-200',
  spam:      'bg-gray-100 text-gray-600 border-gray-200',
  closed:    'bg-gray-100 text-gray-600 border-gray-200',
};

/** The website's own subject buckets, spelled how a person would say them. */
const SUBJECT_LABEL: Record<string, string> = {
  general:  'General',
  sender:   'Wants to send',
  business: 'Business account',
  driver:   'Wants to drive',
  partner:  'Partner store',
  support:  'Support',
};

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ContactSubmissionsPage() {
  const [rows,    setRows]    = useState<Submission[]>([]);
  const [total,   setTotal]   = useState(0);
  const [filter,  setFilter]  = useState<string>('new');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [busyId,  setBusyId]  = useState<string | null>(null);
  const [notes,   setNotes]   = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.contactSubmissions.list(filter || undefined, 1);
      setRows(res.items ?? []);
      setTotal(res.total ?? 0);
      const seed: Record<string, string> = {};
      for (const r of res.items ?? []) seed[r.id] = r.internalNote ?? '';
      setNotes(seed);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the inbox.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const patch = async (id: string, body: { status?: string; internalNote?: string }) => {
    setBusyId(id);
    try {
      await adminApi.contactSubmissions.update(id, body);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save that.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageIntro
        title="Messages from the website"
        purpose="Everything sent through the contact form on seirs.co. Nothing emails you when one arrives, so this page is where they live."
        storageKey="contact-submissions"
        help={
          <>
            The form asks for a subject, so you can tell a sender enquiry from a
            partner application from a complaint. Mark a message{' '}
            <strong>Replied</strong> once you have written back from your own
            mailbox, since replying does not happen here.
          </>
        }
      />

      <div className="flex items-center justify-between gap-3 mt-6 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilter('')}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              filter === '' ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            All
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm border capitalize ${
                filter === s ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Mail size={20} />}
          title={filter ? `No ${filter.replace('_', ' ')} messages` : 'No messages yet'}
          body="Anything sent through the website contact form appears here."
        />
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-3">
            {total} message{total === 1 ? '' : 's'}{filter ? ` marked ${filter.replace('_', ' ')}` : ''}
          </p>
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-navy">{r.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLE[r.status] ?? STATUS_STYLE.closed}`}>
                        {r.status.replace('_', ' ')}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                        {SUBJECT_LABEL[r.subject] ?? r.subject}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-500 flex-wrap">
                      <a href={`mailto:${r.email}`} className="text-sky-700 hover:underline">{r.email}</a>
                      {r.phone && (
                        <span className="flex items-center gap-1"><Phone size={12} /> {r.phone}</span>
                      )}
                      <span className="flex items-center gap-1"><Clock size={12} /> {when(r.createdAt)}</span>
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-gray-800 whitespace-pre-wrap leading-relaxed">{r.message}</p>

                <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col sm:flex-row gap-3 sm:items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">INTERNAL NOTE</label>
                    <input
                      value={notes[r.id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                      placeholder="Only admins see this"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={busyId === r.id}
                      onClick={() => void patch(r.id, { internalNote: notes[r.id] ?? '' })}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Save size={14} /> Save note
                    </button>
                    <select
                      disabled={busyId === r.id}
                      value={r.status}
                      onChange={(e) => void patch(r.id, { status: e.target.value })}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white capitalize disabled:opacity-50"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
