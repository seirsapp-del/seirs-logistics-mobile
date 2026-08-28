'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Ban, ExternalLink, ShieldCheck, Undo2 } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { naira } from '@/lib/money';
import { roleLabel } from '@/lib/labels';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm, useNotify } from '@/components/ConfirmDialog';

/**
 * The automatic-suspicion queue.
 *
 * Everything on this page is a machine's opinion about a real person's
 * account, and the buttons beside it can stop that person using SEIRS.
 * The evidence was being handed over as a raw JSON blob, which for the
 * reader this dashboard is written for is the same as no evidence at
 * all: they cannot check the machine's working, so they either believe
 * it or ignore it. Each flag now states what was noticed, in a sentence,
 * with the raw record one click away for anybody who wants it.
 */

/** Vocabulary lives here rather than in labels.ts: fraud has no book
 *  there yet, and this page must not invent one for the whole app. */
const TYPE_LABELS: Record<string, string> = {
  high_cancellation_rate: 'Cancels a lot of bookings',
  failed_payment_pattern: 'Repeated failed payments',
  gps_velocity_anomaly:   'Location jumped impossibly fast',
  duplicate_account:      'Looks like a second account',
  suspicious_withdrawal:  'Unusually large withdrawal',
};

const STATUS_LABELS: Record<string, string> = {
  open:      'Needs a look',
  reviewed:  'Looked at, nothing done',
  actioned:  'Acted on',
  dismissed: 'Not a problem',
};

const STATUS_COLORS: Record<string, string> = {
  open:      'bg-red-100 text-red-700',
  reviewed:  'bg-blue-100 text-blue-700',
  dismissed: 'bg-[#0F2B4C]/5 text-[#0F2B4C]/50',
  actioned:  'bg-emerald-100 text-emerald-700',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',      label: 'Needs a look' },
  { key: 'reviewed',  label: 'Looked at'    },
  { key: 'actioned',  label: 'Acted on'     },
  { key: 'dismissed', label: 'Dismissed'    },
  { key: '',          label: 'Everything'   },
];

/**
 * What the detector actually saw, in a sentence.
 *
 * The shapes come from fraud.service.ts, one per detector. Anything
 * unrecognised falls through to the raw record rather than to silence:
 * a new detector shipping to a blank explanation is worse than an
 * awkward one.
 */
function describe(flag: any): string | null {
  const d = flag?.details ?? {};
  switch (flag?.type) {
    case 'high_cancellation_rate':
      return `Cancelled ${d.cancelledCount} of ${d.totalDeliveries} bookings, which is ${d.cancellationRate}. The threshold is half.`;
    case 'suspicious_withdrawal':
      return `Asked to withdraw ${naira(d.amountNaira)} in one go. Anything over ${naira(50000)} is flagged automatically.`;
    case 'gps_velocity_anomaly':
      return `Their app reported moving ${d.distanceKm} km in ${d.elapsedSecs} seconds, which works out at ${d.speedKmh} km/h. Either the phone is faking its location or the GPS glitched.`;
    case 'failed_payment_pattern':
      return d.failedCount
        ? `${d.failedCount} card payments failed in a row.`
        : null;
    case 'duplicate_account':
      return d.matchedOn
        ? `Shares ${d.matchedOn} with another account.`
        : null;
    default:
      return null;
  }
}

export default function FraudPage() {
  const [data,    setData]    = useState<any>(null);
  const [page,    setPage]    = useState(1);
  const [filter,  setFilter]  = useState('open');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [busyId,  setBusyId]  = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState<string | null>(null);
  const confirm               = useConfirm();
  const notify                = useNotify();

  const load = (p = 1) => {
    setLoading(true);
    setError(null);
    adminApi.fraud.list(p, filter || undefined)
      .then(setData)
      .catch((e: any) => setError(e?.message ?? 'Could not load the flags.'))
      .finally(() => setLoading(false));
    setPage(p);
  };

  useEffect(() => { load(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter]);

  // resolveFlag only writes the flag row's status. It has never touched
  // the account, so the old "Action (Ban)" button cleared the queue and
  // left the flagged person fully able to sign in.
  const resolve = async (flag: any, status: string, ask: { title: string; message: string; label: string }) => {
    const ok = await confirm({
      title:        ask.title,
      message:      ask.message,
      confirmLabel: ask.label,
    });
    if (!ok) return;
    setBusyId(flag.id);
    try {
      await adminApi.fraud.resolve(flag.id, status);
      load(page);
    } catch (e: any) {
      void notify({ title: 'Could not update the flag', message: e?.message ?? 'The server refused it. Nothing changed.', tone: 'error' });
    } finally { setBusyId(null); }
  };

  /**
   * Stop the account, then close the flag.
   *
   * This used to call updateUser({ isActive: false }), which changes the
   * column and nothing else: no audit entry naming who did it, and no
   * word to the account holder, who then just finds the app broken. The
   * suspend route writes both, so it is the one to use for an action
   * this serious.
   */
  const banUser = async (flag: any) => {
    const userId = flag.user?.id ?? flag.userId;
    if (!userId) {
      void notify({ title: 'No account on this flag', message: 'This flag is not attached to an account, so there is nothing to suspend.', tone: 'error' });
      return;
    }
    const ok = await confirm({
      title:   `Suspend ${flag.user?.name ?? 'this account'}?`,
      message:
        'They are signed out on their next request and cannot use the app until somebody lifts it.\n\n' +
        'They are told their account was suspended. Their deliveries, earnings and history are all kept.\n\n' +
        'Your name and the time go into the audit log. The REASON is not stored anywhere, so write it on their support ticket.\n\n' +
        'This can be undone: use Lift the suspension on this flag, or the account page.',
      confirmLabel: 'Suspend account',
      danger:       true,
    });
    if (!ok) return;
    setBusyId(flag.id);
    try {
      await adminApi.suspendUser(userId);
      await adminApi.fraud.resolve(flag.id, 'actioned');
      void notify({ title: 'Account suspended', message: `${flag.user?.name ?? 'The account'} can no longer sign in, and has been told.`, tone: 'success' });
      load(page);
    } catch (e: any) {
      void notify({ title: 'Suspension failed', message: e?.message ?? 'The server refused it. The account was not changed.', tone: 'error' });
    } finally { setBusyId(null); }
  };

  /**
   * The way back. A suspension made here had no reverse anywhere on this
   * page, so the queue was a one-way door: the flag moved to "acted on"
   * and the person it was about disappeared from the screen entirely.
   */
  const liftBan = async (flag: any) => {
    const userId = flag.user?.id ?? flag.userId;
    if (!userId) return;
    const ok = await confirm({
      title:        `Let ${flag.user?.name ?? 'this account'} back in?`,
      message:      'They can sign in again straight away, and are told their account was restored. The flag stays on the record.',
      confirmLabel: 'Lift the suspension',
    });
    if (!ok) return;
    setBusyId(flag.id);
    try {
      await adminApi.updateUser(userId, { isActive: true });
      void notify({ title: 'Suspension lifted', message: `${flag.user?.name ?? 'They'} can sign in again.`, tone: 'success' });
      load(page);
    } catch (e: any) {
      void notify({ title: 'Could not lift it', message: e?.message ?? 'The server refused it.', tone: 'error' });
    } finally { setBusyId(null); }
  };

  const flags    = (data?.flags ?? []) as any[];
  const total    = Number(data?.total ?? 0);
  const perPage  = Number(data?.limit ?? 20);
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const firstRow = total === 0 ? 0 : (page - 1) * perPage + 1;
  const lastRow  = Math.min(page * perPage, total);
  const filterLabel = (FILTERS.find(f => f.key === filter)?.label ?? 'flags').toLowerCase();

  return (
    <div className="p-8">
      <PageIntro
        title="Fraud & Risk"
        purpose="Look at accounts the system has flagged by itself, decide whether the flag is real, and stop the account if it is."
        storageKey="fraud"
        help={
          <>
            <p><strong>Not a problem</strong> and <strong>Looked at</strong> only close the flag. Neither touches the account.</p>
            <p><strong>Suspend account</strong> stops them signing in, tells them, and records your name in the audit log. It can be lifted from this page.</p>
            <p>A flag is a machine&apos;s guess. Read what it noticed, open the account, and decide. Nothing here is proof on its own.</p>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <button
                key={f.key || 'all'}
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filter === f.key
                    ? 'border-[#3A7BD5] bg-[#3A7BD5] text-white'
                    : 'border-[#E5E7EB] bg-white text-[#0F2B4C]/50 hover:border-[#0F2B4C]/20'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      />

      {/* A failed fetch used to look identical to a clean board. */}
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => load(page)} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-[#0F2B4C]/30">Loading</div>
      ) : error ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white">
          <EmptyState
            icon={<AlertCircle size={20} />}
            title="The flags could not be loaded"
            body="This is a connection or permission problem. It does not mean the board is clear."
            action={{ label: 'Try again', onClick: () => load(page) }}
          />
        </div>
      ) : flags.length === 0 ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white">
          {filter === 'open' ? (
            <EmptyState
              icon={<ShieldCheck size={20} />}
              tone="good"
              title="Nothing needs a look"
              body="No account is currently flagged. New flags appear here on their own as the system spots them."
            />
          ) : (
            <EmptyState
              icon={<ShieldCheck size={20} />}
              title={`No flags are marked "${filterLabel}"`}
              body="Try another filter above."
              action={{ label: 'Show the ones needing a look', onClick: () => setFilter('open') }}
            />
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map((flag: any) => {
            const userId    = flag.user?.id ?? flag.userId;
            const sentence  = describe(flag);
            const suspended = flag.user?.isActive === false;
            return (
              <div key={flag.id} className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[flag.status] ?? ''}`}>
                        {STATUS_LABELS[flag.status] ?? flag.status}
                      </span>
                      <span className="text-sm font-semibold text-[#0F2B4C]">
                        {TYPE_LABELS[flag.type] ?? flag.type}
                      </span>
                      {suspended && (
                        <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Account suspended
                        </span>
                      )}
                    </div>

                    {userId ? (
                      <Link
                        href={`/users/${userId}`}
                        className="inline-flex items-center gap-1 text-sm text-[#3A7BD5] hover:underline"
                      >
                        {flag.user?.name ?? 'Name missing'} ({flag.user?.email ?? 'no email'})
                        <ExternalLink size={12} />
                      </Link>
                    ) : (
                      <p className="text-sm text-[#0F2B4C]/60">
                        This flag is not attached to an account.
                      </p>
                    )}
                    {flag.user?.role && (
                      <p className="text-xs text-[#0F2B4C]/40">
                        {roleLabel(flag.user.role)}
                        {flag.user.accountId ? ` · ${flag.user.accountId}` : ''}
                        {flag.user.createdAt ? ` · joined ${new Date(flag.user.createdAt).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' })}` : ''}
                      </p>
                    )}

                    {/* This was a JSON dump. The person reading it is on
                        the phone to a customer, not in a terminal. */}
                    {sentence ? (
                      <p className="mt-2 rounded-lg border border-[#E5E7EB] bg-[#F5F5F0] px-3 py-2 text-sm text-[#0F2B4C]">
                        {sentence}
                      </p>
                    ) : flag.details ? (
                      <dl className="mt-2 rounded-lg border border-[#E5E7EB] bg-[#F5F5F0] px-3 py-2 text-sm text-[#0F2B4C]">
                        {Object.entries(flag.details).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <dt className="text-[#0F2B4C]/50">{k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}:</dt>
                            <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="mt-2 text-sm text-[#0F2B4C]/40">
                        The system recorded no detail with this flag.
                      </p>
                    )}

                    {flag.details && sentence && (
                      <button
                        onClick={() => setRawOpen(rawOpen === flag.id ? null : flag.id)}
                        className="mt-1 text-xs font-semibold text-[#3A7BD5] hover:underline"
                      >
                        {rawOpen === flag.id ? 'Hide the raw record' : 'Show the raw record'}
                      </button>
                    )}
                    {rawOpen === flag.id && (
                      <pre className="mt-2 overflow-x-auto rounded-lg border border-[#E5E7EB] bg-[#F5F5F0] p-2 text-xs text-[#0F2B4C]/50">
                        {JSON.stringify(flag.details, null, 2)}
                      </pre>
                    )}

                    <p className="mt-2 text-xs text-[#0F2B4C]/30">
                      Flagged {new Date(flag.createdAt).toLocaleString('en-NG')}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    {flag.status === 'open' && (
                      <>
                        <button
                          onClick={() => resolve(flag, 'reviewed', {
                            title:   'Mark as looked at?',
                            message: 'This only closes the flag. The account is not touched and the person is not told anything.',
                            label:   'Mark as looked at',
                          })}
                          disabled={busyId === flag.id}
                          className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                        >
                          Looked at
                        </button>
                        <button
                          onClick={() => banUser(flag)}
                          disabled={busyId === flag.id}
                          className="flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                        >
                          <Ban size={12} /> Suspend account
                        </button>
                        <button
                          onClick={() => resolve(flag, 'dismissed', {
                            title:   'Dismiss this flag?',
                            message: 'You are saying the system got it wrong. The flag closes, the account is untouched, and the same check can raise it again later.',
                            label:   'Dismiss',
                          })}
                          disabled={busyId === flag.id}
                          className="rounded-lg bg-[#0F2B4C]/5 px-3 py-1.5 text-xs font-medium text-[#0F2B4C]/60 transition-colors hover:bg-[#0F2B4C]/10 disabled:opacity-50"
                        >
                          Not a problem
                        </button>
                      </>
                    )}

                    {/* Closed flags still need a door back, both to the
                        queue and out of a suspension. */}
                    {flag.status !== 'open' && (
                      <button
                        onClick={() => resolve(flag, 'open', {
                          title:   'Put this flag back in the queue?',
                          message: 'It shows up again under "Needs a look" so somebody else can go over it. Nothing happens to the account.',
                          label:   'Reopen',
                        })}
                        disabled={busyId === flag.id}
                        className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-medium text-[#0F2B4C]/70 hover:bg-[#F5F5F0] disabled:opacity-50"
                      >
                        Reopen
                      </button>
                    )}
                    {suspended && userId && (
                      <button
                        onClick={() => liftBan(flag)}
                        disabled={busyId === flag.id}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        <Undo2 size={12} /> Lift the suspension
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* The pager used to be wrapped in {total > 20 && ...}, so on any
          filter that returned fewer than 21 rows the count vanished
          along with it. Driven by the total, always on. */}
      {!loading && !error && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#0F2B4C]/50">
          <span className="tabular-nums">
            {total === 0
              ? 'Nothing to show'
              : `Showing ${firstRow.toLocaleString()}-${lastRow.toLocaleString()} of ${total.toLocaleString()} ${filterLabel === 'everything' ? 'flags' : `flags marked "${filterLabel}"`}`}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => load(1)}        disabled={page <= 1}        className="rounded-lg border border-[#E5E7EB] px-2.5 py-1.5 text-xs font-medium hover:bg-[#F5F5F0] disabled:opacity-40">First</button>
            <button onClick={() => load(page - 1)} disabled={page <= 1}        className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-medium hover:bg-[#F5F5F0] disabled:opacity-40">Prev</button>
            <span className="px-3 py-1.5 text-xs tabular-nums">Page {page} of {lastPage}</span>
            <button onClick={() => load(page + 1)} disabled={page >= lastPage} className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-medium hover:bg-[#F5F5F0] disabled:opacity-40">Next</button>
            <button onClick={() => load(lastPage)} disabled={page >= lastPage} className="rounded-lg border border-[#E5E7EB] px-2.5 py-1.5 text-xs font-medium hover:bg-[#F5F5F0] disabled:opacity-40">Last</button>
          </div>
        </div>
      )}
    </div>
  );
}
