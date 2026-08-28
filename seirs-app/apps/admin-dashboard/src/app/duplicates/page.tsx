'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, AlertTriangle, RefreshCw, Loader2, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm, useNotify } from '@/components/ConfirmDialog';

/**
 * Two accounts that look like one person.
 *
 * The decision here shuts somebody out of SEIRS permanently and cannot
 * be undone, and the screen was showing the reviewer a name, an email
 * and a percentage. The phone numbers were in the payload and in this
 * file's own interface, and were never drawn: on a pair flagged for
 * sharing a phone, the shared phone was the one thing missing. Neither
 * account could be opened from the row either, so "is this really the
 * same person" had to be answered from four fields and a hunch.
 */

interface Candidate {
  id:              string;
  primaryUserId:   string;
  duplicateUserId: string;
  primaryName:     string;
  primaryEmail:    string;
  primaryPhone:    string;
  duplicateName:   string;
  duplicateEmail:  string;
  duplicatePhone:  string;
  matchScore:      number | string;
  reason:          string;
  status:          'open' | 'confirmed' | 'merged' | 'dismissed';
  createdAt:       string;
  resolvedAt:      string | null;
}

const STATUS_STYLES: Record<string, string> = {
  open:      'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-red-100 text-red-700',
  merged:    'bg-emerald-100 text-emerald-700',
  dismissed: 'bg-gray-100 text-gray-500',
};

const STATUS_LABEL: Record<string, string> = {
  open:      'Waiting on you',
  confirmed: 'Confirmed a duplicate',
  merged:    'Merged',
  dismissed: 'Two different people',
};

/** What the scan matched on, and what the reviewer should therefore
 *  check before merging. Vocabulary is local: labels.ts has no book for
 *  duplicate-detection reasons. */
const REASON: Record<string, { label: string; check: string }> = {
  same_phone: {
    label: 'Both use the same phone number',
    check: 'Compare the phone numbers below. Family members do share a handset, so check the delivery history on both before merging.',
  },
  email_lookalike: {
    label: 'Same email name on two different providers',
    check: 'For example chidi.okafor@gmail and chidi.okafor@yahoo. Common, and not proof on its own.',
  },
  name_phone_match: {
    label: 'Same name and the same phone number',
    check: 'The strongest signal the scan produces.',
  },
  nin_match: {
    label: 'The same NIN on both accounts',
    check: 'One NIN is one person. Treat this as near certain.',
  },
};

const TABS: Array<{ key: string; label: string }> = [
  { key: 'open',      label: 'Waiting on you' },
  { key: 'confirmed', label: 'Confirmed'      },
  { key: 'merged',    label: 'Merged'         },
  { key: 'dismissed', label: 'Left alone'     },
  { key: '',          label: 'Everything'     },
];

/** The server hands back at most 200 pairs and no total with them. */
const SERVER_CAP = 200;

function confidence(score: number): string {
  if (score >= 0.9)  return 'Almost certainly the same person';
  if (score >= 0.75) return 'Probably the same person';
  return 'Possibly the same person';
}

export default function DuplicatesPage() {
  const [items,    setItems]    = useState<Candidate[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [toast,    setToast]    = useState<string | null>(null);
  const [tab,      setTab]      = useState('open');
  const [busyId,   setBusyId]   = useState<string | null>(null);
  const confirm                 = useConfirm();
  const notify                  = useNotify();

  const load = () => {
    setLoading(true);
    setError(null);
    // Loaded unfiltered on purpose: the tab counts have to be true, and
    // a per-tab fetch would make each count describe only itself.
    adminApi.duplicates.list()
      .then(list => setItems(Array.isArray(list) ? list : []))
      .catch((e: any) => setError(e?.message ?? 'Could not load the flagged pairs.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const scan = async () => {
    setScanning(true);
    setError(null); setToast(null);
    try {
      const r = await adminApi.duplicates.scan();
      setToast(
        r.newCandidates === 0
          ? `Checked ${r.scanned.toLocaleString()} accounts and found no new pairs.`
          : `Checked ${r.scanned.toLocaleString()} accounts and found ${r.newCandidates} new pair${r.newCandidates === 1 ? '' : 's'}.`,
      );
      setTimeout(() => setToast(null), 6000);
      load();
    } catch (e: any) { setError(e?.message ?? 'The scan failed. Nothing was changed.'); }
    finally { setScanning(false); }
  };

  const merge = async (c: Candidate) => {
    const ok = await confirm({
      title:   `Close "${c.duplicateName}" and keep "${c.primaryName}"?`,
      message:
        `${c.duplicateName} (${c.duplicateEmail}) is shut down. They cannot sign in again, on that email or any other route into that account, and they are not sent any explanation.\n\n` +
        `${c.primaryName} (${c.primaryEmail}) is kept and is unaffected.\n\n` +
        'Everything already on the closed account (deliveries, earnings, history) stays where it is and stays readable.\n\n' +
        'THIS CANNOT BE UNDONE from this dashboard. If you are not certain these are the same person, leave them alone instead.',
      confirmLabel: 'Close the duplicate',
      danger:       true,
    });
    if (!ok) return;
    setBusyId(c.id);
    try {
      await adminApi.duplicates.merge(c.id);
      void notify({ title: 'Merged', message: `${c.duplicateName} can no longer sign in. ${c.primaryName} is untouched.`, tone: 'success' });
      load();
    } catch (e: any) {
      void notify({ title: 'Merge failed', message: e?.message ?? 'The server refused it. Neither account was changed.', tone: 'error' });
    } finally { setBusyId(null); }
  };

  /**
   * Dismiss fired the moment it was clicked, with no confirmation and
   * no way back, on a screen where the button next to it is permanent.
   */
  const dismiss = async (c: Candidate) => {
    const ok = await confirm({
      title:   'Two different people?',
      message:
        `Both accounts stay exactly as they are and this pair leaves the queue.\n\n` +
        'Nothing happens to either person. A later scan can raise the same pair again if the signals still match.',
      confirmLabel: 'They are different people',
    });
    if (!ok) return;
    setBusyId(c.id);
    try {
      await adminApi.duplicates.dismiss(c.id);
      void notify({ title: 'Left alone', message: 'Both accounts are untouched.', tone: 'success' });
      load();
    } catch (e: any) {
      void notify({ title: 'Could not dismiss', message: e?.message ?? 'The server refused it.', tone: 'error' });
    } finally { setBusyId(null); }
  };

  const counts = useMemo(() => ({
    open:      items.filter(i => i.status === 'open').length,
    confirmed: items.filter(i => i.status === 'confirmed').length,
    merged:    items.filter(i => i.status === 'merged').length,
    dismissed: items.filter(i => i.status === 'dismissed').length,
  }), [items]);

  const visible = useMemo(
    () => (tab ? items.filter(i => i.status === tab) : items),
    [items, tab],
  );

  return (
    <div className="p-8">
      <PageIntro
        title="Duplicate Accounts"
        purpose="Decide whether two accounts belong to the same person, and close the spare one if they do. A second account is how sign-up bonuses get farmed."
        storageKey="duplicates"
        help={
          <>
            <p><strong>Run the scan</strong> re-checks every account for shared phone numbers and lookalike emails. It only adds pairs, it never decides one.</p>
            <p><strong>Close the duplicate</strong> shuts the second account permanently. It cannot be undone from this dashboard, and the person is not told.</p>
            <p><strong>They are different people</strong> leaves both accounts alone and clears the pair from the queue.</p>
            <p>Open both accounts before you decide. A shared phone in a household is not fraud.</p>
          </>
        }
        actions={
          <>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button
              onClick={scan}
              disabled={scanning}
              className="flex items-center gap-2 rounded-lg bg-[#3A7BD5] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f6cc0] disabled:opacity-50"
            >
              {scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {scanning ? 'Checking every account' : 'Run the scan'}
            </button>
          </>
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={load} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
        </div>
      )}
      {toast && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={16} /> {toast}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Waiting on you"       value={counts.open}      color="text-yellow-600" />
        <Stat label="Confirmed duplicates" value={counts.confirmed} color="text-red-600" />
        <Stat label="Merged"               value={counts.merged}    color="text-emerald-600" />
        <Stat label="Left alone"           value={counts.dismissed} color="text-gray-500" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(t => (
          <button
            key={t.key || 'all'}
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t.key
                ? 'border-[#3A7BD5] bg-[#3A7BD5] text-white'
                : 'border-[#E5E7EB] bg-white text-[#0F2B4C]/50 hover:border-[#0F2B4C]/20'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!loading && items.length >= SERVER_CAP && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This list stops at {SERVER_CAP} pairs and there may be more behind it. Clear the strongest matches and refresh.
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <span className="text-sm font-semibold text-[#0F2B4C]">Flagged pairs</span>
          <span className="text-xs text-gray-400 tabular-nums">
            {loading ? 'Loading' : `Showing ${visible.length} of ${items.length} pairs`}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 size={20} className="mr-2 animate-spin" /> Loading
          </div>
        ) : error ? (
          <EmptyState
            icon={<AlertCircle size={20} />}
            title="The pairs could not be loaded"
            body="This is a connection or permission problem, not an empty queue."
            action={{ label: 'Try again', onClick: load }}
          />
        ) : visible.length === 0 ? (
          items.length === 0 ? (
            <EmptyState
              icon={<Copy size={20} />}
              tone="good"
              title="No pair has ever been flagged"
              body="Either nobody has run the scan, or it found nothing. Run the scan to check every account again."
              action={{ label: 'Run the scan', onClick: scan }}
            />
          ) : tab === 'open' ? (
            <EmptyState
              icon={<Copy size={20} />}
              tone="good"
              title="Nothing is waiting on you"
              body="Every flagged pair has been decided. Run the scan to look for new ones."
              action={{ label: 'Run the scan', onClick: scan }}
            />
          ) : (
            <EmptyState
              icon={<Copy size={20} />}
              title={`No pairs under "${TABS.find(t => t.key === tab)?.label}"`}
              body="Try another tab above."
              action={{ label: 'Show what is waiting', onClick: () => setTab('open') }}
            />
          )
        ) : (
          <div className="divide-y divide-gray-100">
            {visible.map(c => {
              const score    = Number(c.matchScore);
              const reason   = REASON[c.reason];
              const decided  = c.status === 'merged' || c.status === 'dismissed';
              const samePhone = !!c.primaryPhone && c.primaryPhone === c.duplicatePhone;
              return (
                <div key={c.id} className="p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status]}`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                    <span className="text-sm font-semibold text-[#0F2B4C]">
                      {reason?.label ?? c.reason.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-[#0F2B4C]/50">
                      {confidence(score)} ({Math.round(score * 100)}%)
                    </span>
                    <span className="text-xs text-[#0F2B4C]/30">
                      flagged {new Date(c.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <AccountCard
                      heading="Keep this one"
                      tone="keep"
                      userId={c.primaryUserId}
                      name={c.primaryName}
                      email={c.primaryEmail}
                      phone={c.primaryPhone}
                      phoneMatches={samePhone}
                    />
                    <AccountCard
                      heading={decided && c.status === 'merged' ? 'This one was closed' : 'Close this one'}
                      tone="close"
                      userId={c.duplicateUserId}
                      name={c.duplicateName}
                      email={c.duplicateEmail}
                      phone={c.duplicatePhone}
                      phoneMatches={samePhone}
                    />
                  </div>

                  {reason?.check && (
                    <p className="mt-3 text-xs leading-relaxed text-[#0F2B4C]/50">{reason.check}</p>
                  )}

                  {(c.status === 'open' || c.status === 'confirmed') ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => merge(c)}
                        disabled={busyId === c.id}
                        className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Close the duplicate
                      </button>
                      <button
                        onClick={() => dismiss(c)}
                        disabled={busyId === c.id}
                        className="rounded-lg border border-[#E5E7EB] px-4 py-2 text-xs font-semibold text-[#0F2B4C]/70 hover:bg-[#F5F5F0] disabled:opacity-50"
                      >
                        They are different people
                      </button>
                      <span className="text-xs text-[#0F2B4C]/40">Closing cannot be undone here.</span>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-[#0F2B4C]/40">
                      {c.status === 'merged'
                        ? `Closed${c.resolvedAt ? ` on ${new Date(c.resolvedAt).toLocaleDateString('en-NG')}` : ''}. Reopening the account is a support job, not something this page can do.`
                        : `Left alone${c.resolvedAt ? ` on ${new Date(c.resolvedAt).toLocaleDateString('en-NG')}` : ''}. Both accounts are untouched.`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
        <p className="text-sm text-red-800">
          A confirmed duplicate is often somebody farming sign-up bonuses, but it is also sometimes a family
          sharing one phone. Closing an account locks a real person out with no notice and no appeal route on
          this page, so open both accounts and look at their deliveries first.
        </p>
      </div>
    </div>
  );
}

function AccountCard({
  heading, tone, userId, name, email, phone, phoneMatches,
}: {
  heading: string;
  tone:    'keep' | 'close';
  userId:  string;
  name:    string;
  email:   string;
  phone:   string;
  phoneMatches: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${tone === 'keep' ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/40'}`}>
      <p className={`mb-1 text-[10px] font-bold uppercase tracking-wide ${tone === 'keep' ? 'text-emerald-700' : 'text-red-700'}`}>
        {heading}
      </p>
      {/* Neither account could be opened from this row, so the reviewer
          had four fields and no history to decide on. */}
      <Link href={`/users/${userId}`} className="inline-flex items-center gap-1 font-medium text-[#0F2B4C] hover:text-[#3A7BD5]">
        {name || 'Name missing'} <ExternalLink size={12} />
      </Link>
      <p className="truncate text-xs text-gray-600">{email || 'no email on file'}</p>
      {/* The phone was in the payload and never drawn, on pairs flagged
          precisely because the phone matched. */}
      <p className={`text-xs ${phoneMatches ? 'font-semibold text-red-700' : 'text-gray-600'}`}>
        {phone ? phone : 'no phone on file'}
        {phoneMatches ? ' (identical on both)' : ''}
      </p>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs text-gray-500">{label}</div>
    </div>
  );
}
