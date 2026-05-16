'use client';
import { useState } from 'react';
import { FileBarChart, Download, BarChart2, TrendingUp, Package, Users, AlertCircle } from 'lucide-react';
import { adminApi } from '@/lib/api';

type ReportKey = 'delivery_performance' | 'revenue_finance' | 'driver_activity' | 'customer_growth';

const REPORTS: { key: ReportKey; title: string; description: string; icon: any }[] = [
  {
    key:         'delivery_performance',
    title:       'Delivery Performance',
    description: 'Counts by status over the last 30 days. Rebuilds from /admin/analytics/deliveries-by-status.',
    icon:        Package,
  },
  {
    key:         'revenue_finance',
    title:       'Revenue Trend',
    description: 'Daily revenue totals over the last 30 days. Rebuilds from /admin/analytics/revenue.',
    icon:        TrendingUp,
  },
  {
    key:         'driver_activity',
    title:       'Top Drivers',
    description: 'Top 50 drivers by completed-trip count + earnings. Rebuilds from /admin/analytics/top-drivers.',
    icon:        BarChart2,
  },
  {
    key:         'customer_growth',
    title:       'Referral Funnel',
    description: 'Counts of users who signed up via referral, broken down by referrer cohort.',
    icon:        Users,
  },
];

// Convert an array of objects to a CSV string. Keys from the first row
// become the header. Values are JSON.stringify'd if non-primitive so
// nested structures don't smash the row.
function toCsv(rows: any[]): string {
  if (!rows || rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const head = cols.map(escape).join(',');
  const body = rows.map(r => cols.map(c => escape(r[c])).join(',')).join('\n');
  return `${head}\n${body}`;
}

function escape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Quote if it contains comma, quote, or newline
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function fetchReport(key: ReportKey): Promise<any[]> {
  switch (key) {
    case 'delivery_performance': {
      const data = await adminApi.analytics.deliveriesByStatus();
      // Normalise — backend may return either an object or an array of {status,count}.
      if (Array.isArray(data)) return data;
      return Object.entries(data ?? {}).map(([status, count]) => ({ status, count }));
    }
    case 'revenue_finance': {
      const data = await adminApi.analytics.revenue(30);
      if (Array.isArray(data)) return data;
      return Object.entries(data ?? {}).map(([date, revenue]) => ({ date, revenue }));
    }
    case 'driver_activity': {
      const data = await adminApi.analytics.topDrivers(50);
      return Array.isArray(data) ? data : [];
    }
    case 'customer_growth': {
      const data = await adminApi.analytics.referralFunnel();
      if (Array.isArray(data)) return data;
      return Object.entries(data ?? {}).map(([cohort, count]) => ({ cohort, count }));
    }
  }
}

export default function ReportsPage() {
  const [busyKey, setBusyKey] = useState<ReportKey | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<Record<ReportKey, string | null>>({} as any);

  const generate = async (key: ReportKey, title: string) => {
    setBusyKey(key);
    setError(null);
    try {
      const rows = await fetchReport(key);
      if (rows.length === 0) {
        setError(`${title}: no data returned for the selected period.`);
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`seirs_${key}_${stamp}.csv`, toCsv(rows));
      setLastRun(prev => ({ ...prev, [key]: new Date().toLocaleString('en-NG') }));
    } catch (e: any) {
      setError(`${title} failed: ${e?.message ?? 'unknown error'}`);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <FileBarChart size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#0F2B4C]">Reports</h1>
          <p className="text-sm text-gray-500">CSV exports built from live analytics. Generated on demand.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {REPORTS.map(r => {
          const Icon = r.icon;
          const busy = busyKey === r.key;
          return (
            <div key={r.key} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#0F2B4C]/8 flex items-center justify-center shrink-0">
                  <Icon size={18} className="text-[#0F2B4C]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0F2B4C]">{r.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{r.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t border-gray-100">
                <span><span className="font-medium text-gray-700">Last run:</span> {lastRun[r.key] ?? '—'}</span>
              </div>
              <button
                onClick={() => generate(r.key, r.title)}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-1.5 bg-[#0F2B4C] text-white text-xs font-medium py-2 rounded-lg hover:bg-[#0F2B4C]/90 transition-colors disabled:opacity-50"
              >
                <Download size={12} />
                {busy ? 'Generating…' : 'Download CSV'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-gray-400 text-center">
        Scheduled report delivery (weekly/monthly email digests) is a v1.1 feature. For now, run on demand.
      </div>
    </div>
  );
}
