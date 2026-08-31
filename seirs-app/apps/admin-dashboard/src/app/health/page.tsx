'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { PageIntro } from '@/components/PageIntro';
import { Activity, CheckCircle2, AlertCircle, XCircle, Lock, RefreshCw } from 'lucide-react';

/**
 * Is anything obviously broken right now.
 *
 * Two problems with the old version, both about the reader. Every row
 * was named after the route it called ("Auth (admin/me)", "Ops Map
 * (Postgres)", detail "GET /admin/stats"), which is a stack trace, not
 * a status board. And a refusal was rendered as DOWN: a support agent
 * has no right to the Fee Catalogue, so opening this page told them
 * SEIRS was down when the only thing that had happened was the server
 * correctly saying no. That is the worst possible false alarm on the
 * one page people open to decide whether to panic.
 *
 * It still does NOT probe external dependencies: nothing here touches
 * Flutterwave, Google Maps, R2 or email. Real dependency probes need
 * backend health endpoints, and claiming otherwise is exactly what
 * somebody trusts at 2am.
 */

type CheckStatus = 'ok' | 'slow' | 'down' | 'restricted' | 'pending';

interface Check {
  key:    string;
  label:  string;
  /** What being broken would mean for a customer or a rider. */
  why:    string;
  route:  string;
  status: CheckStatus;
  detail: string;
  ms?:    number;
}

const STATUS_META: Record<CheckStatus, { color: string; Icon: any; label: string }> = {
  ok:         { color: '#16A34A', Icon: CheckCircle2, label: 'Working'        },
  slow:       { color: '#D97706', Icon: AlertCircle,  label: 'Slow'           },
  down:       { color: '#DC2626', Icon: XCircle,      label: 'Not answering'  },
  restricted: { color: '#6B7280', Icon: Lock,         label: 'Not yours to see' },
  pending:    { color: '#9CA3AF', Icon: Activity,     label: 'Checking'       },
};

const PROBES: Array<{ key: string; label: string; why: string; route: string; run: () => Promise<any> }> = [
  {
    key: 'api', label: 'The SEIRS server', route: 'GET /admin/stats',
    why: 'If this is down, nothing in the apps works: no bookings, no tracking, no payments.',
    run: () => adminApi.stats(),
  },
  {
    key: 'auth', label: 'Your sign-in', route: 'GET /auth/me',
    why: 'Checks that your own session is still good. If it fails you will be signed out shortly.',
    // This row used to call adminApi.stats() as well, so two green rows
    // came from one probe: a broken auth path would still have read OK.
    run: () => adminApi.me(),
  },
  {
    key: 'analytics', label: 'The reporting figures', route: 'GET /admin/analytics/revenue',
    why: 'Only affects this dashboard. Customers and drivers are unaffected if it fails.',
    run: () => adminApi.analytics.revenue(7),
  },
  {
    key: 'opsmap', label: 'The live delivery board', route: 'GET /admin/ops-map/deliveries',
    why: 'If this fails, the ops map and dispatch cannot see which jobs are running.',
    run: () => adminApi.opsMap.activeDeliveries(),
  },
  {
    key: 'drivers', label: 'The driver records', route: 'GET /admin/drivers',
    why: 'If this fails, drivers cannot be approved, suspended or looked up.',
    run: () => adminApi.drivers(1),
  },
  {
    key: 'fees', label: 'The fee and price settings', route: 'GET /admin/fees',
    why: 'If this fails, prices fall back to what is built into the apps rather than what is set here.',
    run: () => adminApi.fees.list(),
  },
];

/**
 * A 403 is the server working correctly. Only a viewer without that
 * grant sees it, and calling it "down" starts an incident that is not
 * happening.
 */
function isRefusal(message: string): boolean {
  return /forbidden|not allowed|no permission|access denied|restricted/i.test(message);
}

export default function HealthDashboardPage() {
  const [checks, setChecks] = useState<Check[]>(initialChecks());
  const [loading, setLoading] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);

  const runChecks = async () => {
    setLoading(true);
    setChecks(initialChecks());
    const next: Check[] = [];
    for (const p of PROBES) {
      next.push(await timeCheck(p));
    }
    setChecks(next);
    setLastRunAt(new Date());
    setLoading(false);
  };

  useEffect(() => { runChecks(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const okCount      = checks.filter(c => c.status === 'ok').length;
  const slowCount    = checks.filter(c => c.status === 'slow').length;
  const downCount    = checks.filter(c => c.status === 'down').length;
  const lockedCount  = checks.filter(c => c.status === 'restricted').length;
  const overall: CheckStatus = downCount > 0 ? 'down' : slowCount > 0 ? 'slow' : 'ok';
  const overallMeta = STATUS_META[overall];

  const headline =
    downCount > 0
      ? `${downCount} thing${downCount === 1 ? ' is' : 's are'} not answering`
      : slowCount > 0
        ? `Everything works, ${slowCount} of them slowly`
        : 'Everything is working';

  const advice =
    downCount > 0
      ? 'Check Railway logs and the API deployment. Customers may be seeing errors in the apps right now.'
      : slowCount > 0
        ? 'The server is answering but taking over two seconds. Usually a cold start after a quiet period. Re-run the checks in a minute.'
        : 'Nothing to do. This is a snapshot, not a monitor: it only checks when you ask it to.';

  return (
    <div className="p-8">
      <PageIntro
        title="System Health"
        purpose="Ask SEIRS a few questions right now and see which parts answer, so you know whether a problem is real before you chase it."
        storageKey="health"
        help={
          <>
            <p>Each row is one real request made from your browser, just now. Green means it answered; it is not a promise that nothing is wrong.</p>
            <p><strong>Not yours to see</strong> means the server refused because your role does not include that area. That is normal and not a fault.</p>
            <p>This checks SEIRS only. Card payments, maps, photo storage and email are not tested here.</p>
            <p>Nothing on this page changes anything. Re-run it as often as you like.</p>
          </>
        }
        actions={
          <button
            onClick={runChecks}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-[#3A7BD5] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2f6cc0] disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Checking' : 'Check again'}
          </button>
        }
      />

      {/* Overall summary */}
      <div
        className="rounded-xl border-2 p-6"
        style={{ borderColor: overallMeta.color, backgroundColor: overallMeta.color + '08' }}
      >
        <div className="flex items-start gap-4">
          <overallMeta.Icon size={36} color={overallMeta.color} className="mt-1 shrink-0" />
          <div className="flex-1">
            <p className="text-xl font-bold text-[#0F2B4C]">{headline}</p>
            <p className="mt-1 text-sm text-[#0F2B4C]/60">{advice}</p>
            <p className="mt-2 text-xs text-gray-500">
              {okCount} working, {slowCount} slow, {downCount} not answering
              {lockedCount > 0 && `, ${lockedCount} your role cannot see`}
              {lastRunAt && ` · checked at ${lastRunAt.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>
        </div>
      </div>

      {/* Checks table */}
      <div className="mt-6 divide-y divide-[#E5E7EB] rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
        {checks.map(c => {
          const meta = STATUS_META[c.status];
          return (
            <div key={c.key} className="flex items-start gap-4 px-4 py-3">
              <meta.Icon size={20} color={meta.color} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#0F2B4C]">{c.label}</p>
                <p className="text-xs text-gray-600">{c.detail}</p>
                {/* What it means for a real person, rather than the URL. */}
                <p className="mt-0.5 text-xs text-gray-400">{c.why}</p>
                <p className="mt-0.5 font-mono text-[10px] text-gray-300">{c.route}</p>
              </div>
              {c.ms != null && (
                <span className="shrink-0 font-mono text-xs text-gray-500">
                  {c.ms < 1000 ? `${c.ms}ms` : `${(c.ms / 1000).toFixed(1)}s`}
                </span>
              )}
              <span
                className="shrink-0 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: meta.color + '20', color: meta.color }}
              >
                {meta.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-gray-400">
        A snapshot taken when you asked, not continuous monitoring. For that, use Railway logs and Sentry.
      </p>
    </div>
  );
}

function initialChecks(): Check[] {
  return PROBES.map(p => ({
    key: p.key, label: p.label, why: p.why, route: p.route,
    status: 'pending' as CheckStatus,
    detail: 'Asking now',
  }));
}

async function timeCheck(p: typeof PROBES[number]): Promise<Check> {
  const base = { key: p.key, label: p.label, why: p.why, route: p.route };
  const start = Date.now();
  try {
    await p.run();
    const ms = Date.now() - start;
    return {
      ...base,
      status: ms > 2000 ? 'slow' : 'ok',
      detail: ms > 2000
        ? 'It answered, but took longer than two seconds.'
        : 'Answered normally.',
      ms,
    };
  } catch (e: any) {
    const message = e?.message ?? 'The request failed with no explanation.';
    const ms = Date.now() - start;
    if (isRefusal(message)) {
      return {
        ...base,
        status: 'restricted',
        detail: 'Your role does not cover this area, so the server refused. Nothing is broken.',
        ms,
      };
    }
    return { ...base, status: 'down', detail: message, ms };
  }
}
