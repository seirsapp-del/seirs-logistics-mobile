'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';

/**
 * Who has been in the admin dashboard, and when.
 *
 * The founder asked for this three times across three days, in the same
 * words: "i cant tell if she signed in or not as a super admin, thats not
 * good." He was right that nothing existed. adminLogin recorded nothing at
 * all, so there was no way to answer who had been in, from where, or whether
 * somebody had spent a night trying passwords against a super admin account.
 *
 * Failures are shown, not only successes. A list of successful sign-ins
 * cannot show an attack; six bad passwords at 3am followed by one success is
 * the only shape that tells you what happened, and it needs both halves.
 *
 * Outside-hours sign-ins are FLAGGED, never blocked. Founder's decision on
 * 2 September when asked which: a super admin is emailed and can suspend the
 * account in one tap from the row. Locking somebody out of the dashboard at
 * 2am during a launch incident is its own kind of outage.
 */

const OUTCOME: Record<string, { label: string; cls: string; Icon: any }> = {
  success:      { label: 'Signed in',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  bad_password: { label: 'Wrong password',   cls: 'bg-red-50 text-red-700 border-red-200',             Icon: XCircle },
  no_account:   { label: 'No such account',  cls: 'bg-amber-50 text-amber-800 border-amber-200',       Icon: AlertTriangle },
  not_admin:    { label: 'Not a staff account', cls: 'bg-amber-50 text-amber-800 border-amber-200',    Icon: AlertTriangle },
  locked:       { label: 'Locked out',       cls: 'bg-red-50 text-red-700 border-red-200',             Icon: ShieldAlert },
  suspended:    { label: 'Suspended account', cls: 'bg-gray-100 text-gray-600 border-gray-200',        Icon: XCircle },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

export default function SignInsPage() {
  const [tab,     setTab]     = useState<'log' | 'people'>('log');
  const [rows,    setRows]    = useState<any[] | null>(null);
  const [people,  setPeople]  = useState<any[] | null>(null);
  const [filter,  setFilter]  = useState<string>('');
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (tab === 'log') {
        const r = await adminApi.signIns.list(1, filter || undefined);
        setRows(r?.items ?? []);
      } else {
        setPeople(await adminApi.signIns.hours(30));
      }
    } catch (e: any) {
      // A support agent hitting this gets a 403, which is correct: this log
      // names every staff member's movements.
      setError(e?.message ?? 'Could not load the sign-in log.');
      setRows([]); setPeople([]);
    }
  }, [tab, filter]);

  useEffect(() => { void load(); }, [load]);

  const flagged = (rows ?? []).filter(r => r.outsideHours && r.outcome === 'success').length;
  const failed  = (rows ?? []).filter(r => r.outcome === 'bad_password').length;

  return (
    <div className="p-8">
      <PageIntro
        title="Staff sign-ins"
        purpose="Every attempt to sign in to this dashboard, successful or not. Nothing here blocks anybody: an out-of-hours sign-in is flagged and emailed to a super admin, who decides."
        storageKey="sign-ins"
        help={
          <>
            <p><strong>Wrong password</strong> rows are the ones to read together. One is somebody fumbling. Six in a row at night, then a success, is somebody getting in.</p>
            <p><strong>Outside hours</strong> means before 6am or after 10pm Lagos time. It is a flag, not a verdict: staff work late.</p>
            <p><strong>By person</strong> summarises the last 30 days: how often each person signed in, how often they failed, and their earliest and latest hour.</p>
          </>
        }
      />

      {(flagged > 0 || failed > 0) && (
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <span className="font-semibold text-amber-900">Worth a look</span>
          {failed > 0 && (
            <span className="text-amber-900"><strong className="tabular-nums">{failed}</strong> failed attempt{failed === 1 ? '' : 's'} on this page</span>
          )}
          {flagged > 0 && (
            <span className="text-amber-900"><strong className="tabular-nums">{flagged}</strong> sign-in{flagged === 1 ? '' : 's'} outside working hours</span>
          )}
          <span className="text-amber-800/80">Nobody has been blocked. Open the person to suspend them.</span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {(['log', 'people'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              tab === t ? 'bg-[#0F2B4C] text-white' : 'border border-[#E5E7EB] bg-white text-[#0F2B4C]'
            }`}>
            {t === 'log' ? 'Every attempt' : 'By person, last 30 days'}
          </button>
        ))}
        {tab === 'log' && (
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-sm">
            <option value="">All outcomes</option>
            <option value="success">Signed in</option>
            <option value="bad_password">Wrong password</option>
            <option value="locked">Locked out</option>
            <option value="no_account">No such account</option>
          </select>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
        </div>
      )}

      {tab === 'log' ? (
        rows === null ? (
          <div className="flex items-center gap-2 py-10 text-sm text-[#0F2B4C]/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Clock className="h-5 w-5" />} title="Nothing recorded yet"
            body="Sign-ins are logged from the moment this shipped. Older sessions were never recorded and cannot be recovered." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-[#E5E7EB] bg-[#F5F5F0] text-left">
                <tr>
                  <th className="px-4 py-2 font-semibold">When</th>
                  <th className="px-4 py-2 font-semibold">Who</th>
                  <th className="px-4 py-2 font-semibold">Outcome</th>
                  <th className="px-4 py-2 font-semibold">From</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cfg = OUTCOME[r.outcome] ?? { label: r.outcome, cls: 'bg-gray-100 text-gray-600 border-gray-200', Icon: Clock };
                  return (
                    <tr key={r.id} className={`border-b border-gray-50 ${r.outsideHours && r.outcome === 'success' ? 'bg-amber-50/40' : ''}`}>
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums text-[#5C6E82]">
                        {when(r.createdAt)}
                        {r.outsideHours && r.outcome === 'success' && (
                          <span className="ml-2 rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            outside hours
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {r.userId ? (
                          <Link href={`/users/${r.userId}`} className="font-medium text-[#3A7BD5] hover:underline">
                            {r.name ?? r.email}
                          </Link>
                        ) : (
                          <span className="text-[#0F2B4C]">{r.email}</span>
                        )}
                        {r.adminRole && <span className="ml-2 text-xs text-[#5C6E82]">{r.adminRole}</span>}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${cfg.cls}`}>
                          <cfg.Icon className="h-3 w-3" /> {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-[#5C6E82]">{r.ip ?? 'unknown'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        people === null ? (
          <div className="flex items-center gap-2 py-10 text-sm text-[#0F2B4C]/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : people.length === 0 ? (
          <EmptyState icon={<Clock className="h-5 w-5" />} title="Nobody has signed in yet"
            body="This summary is built from the log, so it starts filling from the day logging shipped." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-[#E5E7EB] bg-[#F5F5F0] text-left">
                <tr>
                  <th className="px-4 py-2 font-semibold">Staff</th>
                  <th className="px-4 py-2 font-semibold">Sign-ins</th>
                  <th className="px-4 py-2 font-semibold">Failed</th>
                  <th className="px-4 py-2 font-semibold">Outside hours</th>
                  <th className="px-4 py-2 font-semibold">Earliest / latest</th>
                  <th className="px-4 py-2 font-semibold">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.userId} className="border-b border-gray-50">
                    <td className="px-4 py-2">
                      <Link href={`/users/${p.userId}`} className="font-medium text-[#3A7BD5] hover:underline">
                        {p.name ?? p.email}
                      </Link>
                      {p.adminRole && <span className="ml-2 text-xs text-[#5C6E82]">{p.adminRole}</span>}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{p.signIns}</td>
                    <td className={`px-4 py-2 tabular-nums ${Number(p.failed) > 0 ? 'font-semibold text-red-700' : ''}`}>{p.failed}</td>
                    <td className={`px-4 py-2 tabular-nums ${Number(p.outsideHours) > 0 ? 'font-semibold text-amber-700' : ''}`}>{p.outsideHours}</td>
                    <td className="px-4 py-2 tabular-nums text-[#5C6E82]">
                      {p.earliestHour != null ? `${String(p.earliestHour).padStart(2, '0')}:00` : '-'}
                      {' – '}
                      {p.latestHour != null ? `${String(p.latestHour).padStart(2, '0')}:00` : '-'}
                    </td>
                    <td className="px-4 py-2 text-[#5C6E82]">{p.lastSeen ? when(p.lastSeen) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-gray-50 px-4 py-3 text-xs text-[#5C6E82]">
              This is a sign-in record, not a timesheet. It shows when somebody opened the
              dashboard, not what they did or how long they stayed.
            </p>
          </div>
        )
      )}
    </div>
  );
}
