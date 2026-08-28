'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Rocket, ShieldCheck, AlertTriangle, RefreshCw, Eye, Lock,
  CircleSlash, Layers, CheckCircle2, XCircle, ChevronDown, ChevronRight,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { naira } from '@/lib/money';
import type { LaunchResetReport, SkipCode } from '@/lib/launch-reset-types';

/**
 * Launch Reset.
 *
 * The screen exists so clearing the database on launch night is a
 * deliberate, reviewable act rather than a person typing DELETE
 * statements into a psql prompt at 2am. Everything about it is built
 * around one rule: the preview comes first, and the confirmation box
 * does not exist until the admin has one on screen.
 *
 * It is meant to feel reversible even though it is not. That is done by
 * showing the whole plan before the button appears: every entity type
 * with its count and a sample, every account being KEPT with the reason
 * and the amount of money attached, and every table being preserved.
 * The one thing it must never do is present a red button and a
 * reassuring sentence.
 */

const SKIP_LABEL: Record<SkipCode, string> = {
  real_payment:    'Real payment',
  escrow_released: 'Escrow released',
  earning_paid:    'Earnings paid',
  driver_payout:   'Bank transfer sent',
  partner_payout:  'Partner payout paid',
  shared_history:  'Shared with a kept account',
  staff_account:   'Staff account',
  acting_admin:    'Acting admin',
};

const SKIP_TONE: Record<SkipCode, string> = {
  real_payment:    'bg-red-100 text-red-700',
  escrow_released: 'bg-red-100 text-red-700',
  earning_paid:    'bg-red-100 text-red-700',
  driver_payout:   'bg-red-100 text-red-700',
  partner_payout:  'bg-red-100 text-red-700',
  shared_history:  'bg-amber-100 text-amber-700',
  staff_account:   'bg-slate-100 text-slate-700',
  acting_admin:    'bg-slate-100 text-slate-700',
};

export default function LaunchResetPage() {
  const [report,  setReport]  = useState<LaunchResetReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Two deliberate steps before anything can be typed. `armed` is what
  // reveals the confirmation input at all: until the admin has read a
  // preview and asked for it, there is no box to press enter in.
  const [armed,   setArmed]   = useState(false);
  const [phrase,  setPhrase]  = useState('');
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    // A fresh preview invalidates any half-typed confirmation. The
    // phrase must be typed against the numbers actually on screen.
    setArmed(false);
    setPhrase('');
    try {
      const r = await adminApi.launchReset.preview();
      setReport(r);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the preview');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  const finished  = Boolean(report && !report.dryRun);
  const phraseOk  = Boolean(report && phrase.trim() === report.confirmationPhrase);
  const hasWork   = Boolean(report && report.dryRun && report.accounts.deletable > 0);

  const run = async () => {
    if (!report || !phraseOk) return;
    setRunning(true);
    setError(null);
    try {
      const r = await adminApi.launchReset.execute(
        phrase.trim(),
        // Echoed back so a replayed or stale request is refused rather
        // than run against a set nobody reviewed.
        report.accounts.deletable,
      );
      setReport(r);
      setArmed(false);
      setPhrase('');
    } catch (e: any) {
      setError(e?.message ?? 'The reset did not run');
    } finally {
      setRunning(false);
    }
  };

  const failures = report?.failures ?? [];

  return (
    <div className="p-6 max-w-[1180px] mx-auto space-y-5">
      <Header onRefresh={loadPreview} loading={loading} />

      {error && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl p-4">
          <XCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <div className="text-sm text-red-700">
            <div className="font-semibold mb-0.5">Nothing was deleted.</div>
            <div className="text-[13px] leading-relaxed">{error}</div>
          </div>
        </div>
      )}

      {loading && !report && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">
          Working out what a reset would remove...
        </div>
      )}

      {report && (
        <>
          {finished && <RunResult report={report} onRefresh={loadPreview} />}

          <Summary report={report} />

          <EntityTable report={report} expanded={expanded} setExpanded={setExpanded} />

          <SkippedTable report={report} />

          <PreservedCard report={report} />

          <RulesCard report={report} />

          {report.dryRun && (
            <ConfirmCard
              report={report}
              armed={armed}
              setArmed={setArmed}
              phrase={phrase}
              setPhrase={setPhrase}
              phraseOk={phraseOk}
              hasWork={hasWork}
              running={running}
              onRun={run}
            />
          )}

          {failures.length > 0 && <FailureCard failures={failures} onRefresh={loadPreview} />}
        </>
      )}
    </div>
  );
}

/* ── Header ─────────────────────────────────────────────────────────── */

function Header({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Rocket size={18} className="text-[#0F2B4C]" />
            <h1 className="text-lg font-bold text-[#0F2B4C]">Launch Reset</h1>
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-[#0F2B4C] text-white">
              Super Admin
            </span>
          </div>
          <p className="text-[13px] text-gray-500 mt-1 max-w-2xl leading-relaxed">
            Clears the seeded demo accounts and everything hanging off them, so launch day starts
            on a database that only contains real activity. Configuration is kept. Accounts with
            money attached are kept. Nothing runs without a preview and a typed phrase.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#0F2B4C] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Checking...' : 'Re-run preview'}
        </button>
      </div>

      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="text-[13px] text-amber-900 leading-relaxed">
          <span className="font-semibold">This is not reversible.</span>{' '}
          There is no undo and no recycle bin behind it: the recycle bin is for accounts a person
          asked to delete, and these rows go straight out. What makes it safe is that you read the
          whole plan first. Everything below is what a run would actually do, counted from the
          live database using the same selection the delete uses.
        </div>
      </div>
    </div>
  );
}

/* ── Summary tiles ──────────────────────────────────────────────────── */

function Summary({ report }: { report: LaunchResetReport }) {
  const tiles = [
    { label: 'Demo accounts found', value: report.accounts.candidates, tone: 'text-[#0F2B4C]',
      note: 'Carrying the isDemo flag' },
    { label: 'Would be removed',    value: report.accounts.deletable,  tone: 'text-red-600',
      note: 'No money attached' },
    { label: 'Kept, with a reason', value: report.accounts.skipped,    tone: 'text-emerald-600',
      note: 'Money moved, or shares a record with one that did' },
    { label: 'Rows in scope',       value: report.totalRows,           tone: 'text-[#0F2B4C]',
      note: `Across ${report.entities.length} table${report.entities.length === 1 ? '' : 's'}` },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">{t.label}</div>
          <div className={`text-2xl font-bold mt-1 ${t.tone}`}>{t.value.toLocaleString('en-NG')}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">{t.note}</div>
        </div>
      ))}
    </div>
  );
}

/* ── What would be removed, by entity type ──────────────────────────── */

function EntityTable({
  report, expanded, setExpanded,
}: {
  report: LaunchResetReport;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
}) {
  const deletedByTable = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of report.deleted ?? []) m.set(d.table, d.deleted);
    return m;
  }, [report.deleted]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Layers size={15} className="text-[#0F2B4C]" />
        <span className="text-sm font-semibold text-[#0F2B4C]">
          {report.dryRun ? 'What would be removed' : 'What was removed'}
        </span>
        <span className="text-[11px] text-gray-400 ml-auto">
          Listed in deletion order: children before parents, so no foreign key blocks the run
        </span>
      </div>

      {report.entities.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400">
          Nothing in scope. There is no demo data to remove.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-400 tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 w-14">Order</th>
                <th className="text-left px-4 py-2">Entity</th>
                <th className="text-left px-4 py-2">Table</th>
                <th className="text-right px-4 py-2 w-28">Rows</th>
                {!report.dryRun && <th className="text-right px-4 py-2 w-28">Deleted</th>}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.entities.map((e) => {
                const open = expanded === e.table;
                const done = deletedByTable.get(e.table);
                return (
                  <Fragment key={e.table}>
                    <tr
                      onClick={() => setExpanded(open ? null : e.table)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-2.5 text-[11px] font-mono text-gray-400">
                        {String(e.order).padStart(2, '0')}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-[#0F2B4C]">{e.label}</div>
                        {e.note && (
                          <div className="text-[11px] text-gray-400 mt-0.5 max-w-xl leading-snug">{e.note}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[11px] font-mono text-gray-500">{e.table}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-[#0F2B4C] tabular-nums">
                        {e.rows < 0 ? <span className="text-red-600">count failed</span> : e.rows.toLocaleString('en-NG')}
                      </td>
                      {!report.dryRun && (
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                          {done === undefined
                            ? <span className="text-gray-300">-</span>
                            : <span className="text-emerald-600">{done.toLocaleString('en-NG')}</span>}
                        </td>
                      )}
                      <td className="px-2 text-gray-300">
                        {e.sample.length > 0 && (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                      </td>
                    </tr>
                    {open && e.sample.length > 0 && (
                      <tr className="bg-gray-50/70">
                        <td />
                        <td colSpan={report.dryRun ? 4 : 5} className="px-4 py-3">
                          <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wide mb-1.5">
                            Sample of the matched rows
                          </div>
                          <div className="space-y-1">
                            {e.sample.map((s) => (
                              <div key={s.id} className="flex items-center gap-3 text-[11px]">
                                <span className="font-mono text-gray-400">{s.id.slice(0, 8)}</span>
                                <span className="text-[#0F2B4C]">{s.label || <em className="text-gray-300">no label</em>}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td />
                <td className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Total</td>
                <td />
                <td className="px-4 py-2.5 text-right font-bold text-[#0F2B4C] tabular-nums">
                  {report.totalRows.toLocaleString('en-NG')}
                </td>
                {!report.dryRun && (
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-600 tabular-nums">
                    {(report.deleted ?? []).reduce((n, d) => n + d.deleted, 0).toLocaleString('en-NG')}
                  </td>
                )}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Kept, with the reason and the amount ───────────────────────────── */

function SkippedTable({ report }: { report: LaunchResetReport }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <ShieldCheck size={15} className="text-emerald-600" />
        <span className="text-sm font-semibold text-[#0F2B4C]">
          Kept ({report.skipped.length})
        </span>
        <span className="text-[11px] text-gray-400 ml-auto">
          A demo flag is a label. Money that moved is a fact, and the fact wins.
        </span>
      </div>

      {report.skipped.length === 0 ? (
        <div className="p-6 text-center text-[13px] text-gray-400">
          No demo account has money attached. Every candidate is removable.
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {report.skipped.map((s) => (
            <div key={s.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[#0F2B4C] text-sm">{s.name}</span>
                    <span className="text-[10px] font-mono text-gray-400">{s.accountId ?? 'no SEIRS ID'}</span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                      {s.role}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-gray-400 mt-0.5">{s.email}</div>
                </div>
                {s.topAmountNgn && (
                  <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">Attached</div>
                    <div className="text-sm font-bold text-red-600 tabular-nums">{naira(s.topAmountNgn)}</div>
                  </div>
                )}
              </div>

              <div className="mt-2 space-y-1.5">
                {s.reasons.map((r, idx) => (
                  <div key={`${s.id}-${r.code}-${idx}`} className="flex items-start gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${SKIP_TONE[r.code]}`}>
                      {SKIP_LABEL[r.code]}
                    </span>
                    <span className="text-[12px] text-gray-600 leading-relaxed">
                      {r.reason}
                      <span className="text-gray-400">
                        {' '}({r.rows} row{r.rows === 1 ? '' : 's'}
                        {r.amountNgn ? `, ${naira(r.amountNgn)}` : ''})
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Preserved configuration ────────────────────────────────────────── */

function PreservedCard({ report }: { report: LaunchResetReport }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Lock size={15} className="text-[#0F2B4C]" />
        <span className="text-sm font-semibold text-[#0F2B4C]">Never touched</span>
        <span className="text-[11px] text-gray-400 ml-auto">
          Configuration an admin tuned, not data a test generated
        </span>
      </div>
      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 divide-gray-100">
        {report.preserved.map((p, i) => (
          <div
            key={p.table}
            className={`px-4 py-2.5 ${i % 2 === 0 ? 'md:border-r border-gray-100' : ''} border-t border-gray-100 first:border-t-0 md:[&:nth-child(2)]:border-t-0`}
          >
            <div className="text-[12px] font-mono font-semibold text-[#0F2B4C]">{p.table}</div>
            <div className="text-[11px] text-gray-500 leading-snug mt-0.5">{p.why}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── The rules, stated on the screen rather than buried in the code ── */

function RulesCard({ report }: { report: LaunchResetReport }) {
  return (
    <div className="bg-[#0F2B4C]/[0.03] rounded-xl border border-[#0F2B4C]/10 p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <CircleSlash size={14} className="text-[#0F2B4C]" />
        <span className="text-[11px] uppercase font-bold text-[#0F2B4C] tracking-wide">
          How the scope is decided
        </span>
      </div>
      <div className="text-[12px] text-gray-600 leading-relaxed mb-2">
        <span className="font-semibold text-[#0F2B4C]">Scope:</span> {report.scope.note}
      </div>
      <ul className="space-y-1.5">
        {report.notes.map((n, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] text-gray-600 leading-relaxed">
            <span className="text-[#0F2B4C]/30 mt-0.5">-</span>
            <span>{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Confirmation, revealed only after a preview is on screen ───────── */

function ConfirmCard({
  report, armed, setArmed, phrase, setPhrase, phraseOk, hasWork, running, onRun,
}: {
  report:   LaunchResetReport;
  armed:    boolean;
  setArmed: (v: boolean) => void;
  phrase:   string;
  setPhrase: (v: string) => void;
  phraseOk: boolean;
  hasWork:  boolean;
  running:  boolean;
  onRun:    () => void;
}) {
  if (!hasWork) {
    return (
      <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
        <div className="text-[13px] text-emerald-900">
          <span className="font-semibold">Nothing to reset.</span>{' '}
          {report.accounts.candidates === 0
            ? 'There are no demo accounts in this database.'
            : 'Every demo account found has money attached, or shares a record with one that does, so all of them are being kept.'}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border-2 border-red-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border-b border-red-200">
        <AlertTriangle size={15} className="text-red-600" />
        <span className="text-sm font-semibold text-red-800">Run the reset</span>
      </div>

      <div className="p-4 space-y-3">
        {!armed ? (
          <>
            <p className="text-[13px] text-gray-600 leading-relaxed">
              You are about to permanently remove{' '}
              <span className="font-semibold text-[#0F2B4C]">
                {report.accounts.deletable} account{report.accounts.deletable === 1 ? '' : 's'}
              </span>{' '}
              and{' '}
              <span className="font-semibold text-[#0F2B4C]">
                {report.totalRows.toLocaleString('en-NG')} row{report.totalRows === 1 ? '' : 's'}
              </span>{' '}
              across {report.entities.length} table{report.entities.length === 1 ? '' : 's'}.{' '}
              {report.accounts.skipped > 0 && (
                <>
                  <span className="font-semibold text-emerald-700">{report.accounts.skipped}</span>{' '}
                  account{report.accounts.skipped === 1 ? ' is' : 's are'} being kept. Read that list
                  above before you continue.
                </>
              )}
            </p>
            <button
              onClick={() => setArmed(true)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-red-700 border border-red-300 rounded-lg hover:bg-red-50"
            >
              <Eye size={13} />
              I have read the plan, show the confirmation
            </button>
          </>
        ) : (
          <>
            <div>
              <label className="block text-[12px] font-semibold text-[#0F2B4C] mb-1">
                Type <code className="bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded font-mono text-[11px]">
                  {report.confirmationPhrase}
                </code> to confirm
              </label>
              <p className="text-[11px] text-gray-400 mb-2 leading-relaxed">
                The phrase stops a stray click. The server also checks the account count against
                what this preview showed, so a stale or replayed request is refused rather than run
                against a set nobody reviewed.
              </p>
              <input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={report.confirmationPhrase}
                className={`w-full max-w-md px-3 py-2 text-sm font-mono border rounded-lg outline-none ${
                  phrase && !phraseOk
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-gray-200 focus:border-[#3A7BD5]'
                }`}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onRun}
                disabled={!phraseOk || running}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Rocket size={13} />
                {running
                  ? 'Running...'
                  : `Delete ${report.accounts.deletable} account${report.accounts.deletable === 1 ? '' : 's'} and ${report.totalRows.toLocaleString('en-NG')} rows`}
              </button>
              <button
                onClick={() => { setArmed(false); setPhrase(''); }}
                disabled={running}
                className="px-4 py-2 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── After a run ────────────────────────────────────────────────────── */

function RunResult({ report, onRefresh }: { report: LaunchResetReport; onRefresh: () => void }) {
  const rows = (report.deleted ?? []).reduce((n, d) => n + d.deleted, 0);
  const ok   = report.complete !== false;

  return (
    <div className={`rounded-xl border p-4 ${ok ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex items-start gap-2.5">
        {ok
          ? <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" />
          : <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />}
        <div className="flex-1">
          <div className={`text-sm font-semibold ${ok ? 'text-emerald-900' : 'text-amber-900'}`}>
            {ok ? 'Reset complete.' : 'Reset finished with failures.'}
          </div>
          <div className={`text-[13px] mt-0.5 leading-relaxed ${ok ? 'text-emerald-800' : 'text-amber-800'}`}>
            {rows.toLocaleString('en-NG')} row{rows === 1 ? '' : 's'} deleted across{' '}
            {(report.deleted ?? []).filter(d => d.deleted > 0).length} table
            {(report.deleted ?? []).filter(d => d.deleted > 0).length === 1 ? '' : 's'}.{' '}
            {report.accounts.skipped > 0 && `${report.accounts.skipped} account${report.accounts.skipped === 1 ? ' was' : 's were'} kept. `}
            {!ok && 'Re-run the preview and run it again: the operation is resumable, and it picks up exactly where it stopped.'}
          </div>
          <button
            onClick={onRefresh}
            className="mt-2.5 flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-[#0F2B4C] bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={12} />
            Re-run the preview to confirm the database is clean
          </button>
        </div>
      </div>
    </div>
  );
}

function FailureCard({
  failures, onRefresh,
}: {
  failures: NonNullable<LaunchResetReport['failures']>;
  onRefresh: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border-2 border-amber-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border-b border-amber-200">
        <AlertTriangle size={15} className="text-amber-600" />
        <span className="text-sm font-semibold text-amber-800">
          {failures.length} statement{failures.length === 1 ? '' : 's'} failed
        </span>
        <button
          onClick={onRefresh}
          className="ml-auto text-[11px] font-semibold text-[#0F2B4C] underline"
        >
          Re-run preview
        </button>
      </div>
      <div className="p-4 space-y-2">
        <p className="text-[12px] text-gray-500 leading-relaxed">
          Nothing is stuck. Each statement commits on its own and the accounts are deleted last, so
          a failed run leaves every anchor in place. Running it again recomputes the same scope and
          finishes the job. Rows already gone match nothing the second time.
        </p>
        {failures.map((f) => (
          <div key={f.table} className="border border-gray-200 rounded-lg p-2.5">
            <div className="text-[12px] font-mono font-semibold text-[#0F2B4C]">{f.table}</div>
            <div className="text-[11px] text-red-600 font-mono mt-0.5 break-words">{f.error}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
