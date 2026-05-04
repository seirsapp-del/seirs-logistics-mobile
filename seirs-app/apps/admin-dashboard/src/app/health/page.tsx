'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Activity, CheckCircle2, AlertCircle, XCircle, RefreshCw } from 'lucide-react';

// Spec V8 §3.11 — system health snapshot. Lightweight ops view that
// pings each external dependency and the analytics endpoints to
// confirm everything responds. Real ops dashboards usually layer this
// on top of Grafana / Datadog; this surface is for the times an admin
// needs to know "is anything obviously down right now?"

type CheckStatus = 'ok' | 'warn' | 'down' | 'pending';

interface Check {
  key:    string;
  label:  string;
  status: CheckStatus;
  detail: string;
  ms?:    number;
}

const STATUS_META: Record<CheckStatus, { color: string; Icon: any; label: string }> = {
  ok:      { color: '#16A34A', Icon: CheckCircle2, label: 'OK'      },
  warn:    { color: '#D97706', Icon: AlertCircle,  label: 'Warn'    },
  down:    { color: '#DC2626', Icon: XCircle,      label: 'Down'    },
  pending: { color: '#9CA3AF', Icon: Activity,     label: 'Checking…'},
};

export default function HealthDashboardPage() {
  const [checks, setChecks] = useState<Check[]>(initialChecks());
  const [loading, setLoading] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);

  const runChecks = async () => {
    setLoading(true);
    setChecks(initialChecks());
    const next: Check[] = [];

    // Each check is a real API call timed end-to-end
    next.push(await timeCheck('api',         'Backend API',          () => adminApi.stats()));
    next.push(await timeCheck('auth',        'Auth (admin/me)',      () => adminApi.stats()));
    next.push(await timeCheck('analytics',   'Analytics endpoints',  () => adminApi.analytics.revenue(7)));
    next.push(await timeCheck('opsmap',      'Ops Map (Postgres)',   () => adminApi.opsMap.activeDeliveries()));
    next.push(await timeCheck('drivers',     'Drivers list',         () => adminApi.drivers(1)));
    next.push(await timeCheck('fees',        'Fee Catalogue',        () => adminApi.fees.list()));

    setChecks(next);
    setLastRunAt(new Date());
    setLoading(false);
  };

  useEffect(() => { runChecks(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const okCount   = checks.filter(c => c.status === 'ok').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;
  const downCount = checks.filter(c => c.status === 'down').length;
  const overall: CheckStatus = downCount > 0 ? 'down' : warnCount > 0 ? 'warn' : 'ok';
  const overallMeta = STATUS_META[overall];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <Activity size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">System Health</h1>
            <p className="text-sm text-gray-500">
              Live ops view of backend dependencies. Refresh to re-run all checks.
            </p>
          </div>
        </div>
        <button
          onClick={runChecks}
          disabled={loading}
          className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#2f6cc0] disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Running…' : 'Re-run checks'}
        </button>
      </div>

      {/* Overall summary */}
      <div
        className="rounded-xl p-6 border-2"
        style={{ borderColor: overallMeta.color, backgroundColor: overallMeta.color + '08' }}
      >
        <div className="flex items-center gap-4">
          <overallMeta.Icon size={36} color={overallMeta.color} />
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: overallMeta.color }}>
              {overallMeta.label.toUpperCase()}
            </p>
            <p className="text-xl font-bold text-[#0F2B4C] mt-1">
              {downCount > 0
                ? `${downCount} system${downCount === 1 ? '' : 's'} down`
                : warnCount > 0
                  ? `${warnCount} system${warnCount === 1 ? '' : 's'} warning`
                  : 'All systems operational'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {okCount} healthy · {warnCount} warning · {downCount} down
              {lastRunAt && ` · last checked ${lastRunAt.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>
        </div>
      </div>

      {/* Checks table */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
        {checks.map(c => {
          const meta = STATUS_META[c.status];
          return (
            <div key={c.key} className="px-4 py-3 flex items-center gap-4">
              <meta.Icon size={20} color={meta.color} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#0F2B4C]">{c.label}</p>
                <p className="text-xs text-gray-500 truncate">{c.detail}</p>
              </div>
              {c.ms != null && (
                <span className="text-xs font-mono text-gray-500">{c.ms}ms</span>
              )}
              <span
                className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded"
                style={{ backgroundColor: meta.color + '20', color: meta.color }}
              >
                {meta.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footnote */}
      <p className="text-xs text-gray-400 text-center">
        Lightweight checks only — for deep observability use Grafana / Railway logs / Sentry.
      </p>
    </div>
  );
}

function initialChecks(): Check[] {
  return [
    { key: 'api',       label: 'Backend API',         status: 'pending', detail: 'GET /admin/stats' },
    { key: 'auth',      label: 'Auth (admin/me)',     status: 'pending', detail: 'GET /admin/stats' },
    { key: 'analytics', label: 'Analytics endpoints', status: 'pending', detail: 'GET /admin/analytics/revenue' },
    { key: 'opsmap',    label: 'Ops Map (Postgres)',  status: 'pending', detail: 'GET /admin/ops-map/deliveries' },
    { key: 'drivers',   label: 'Drivers list',        status: 'pending', detail: 'GET /admin/drivers' },
    { key: 'fees',      label: 'Fee Catalogue',       status: 'pending', detail: 'GET /admin/fees' },
  ];
}

async function timeCheck(key: string, label: string, fn: () => Promise<any>): Promise<Check> {
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    return {
      key, label,
      status: ms > 2000 ? 'warn' : 'ok',
      detail: ms > 2000 ? 'Responded but slowly' : 'Healthy',
      ms,
    };
  } catch (e: any) {
    return {
      key, label,
      status: 'down',
      detail: e?.message ?? 'Request failed',
      ms: Date.now() - start,
    };
  }
}
