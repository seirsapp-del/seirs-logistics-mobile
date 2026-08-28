'use client';
import { useState } from 'react';
import Link from 'next/link';
import { FileBarChart, Download, BarChart2, TrendingUp, Package, Users, AlertCircle, ShieldAlert } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { deliveryStatus, driverStatus } from '@/lib/labels';
import { nairaAmount } from '@/lib/money';
import { PageIntro } from '@/components/PageIntro';
import { useConfirm } from '@/components/ConfirmDialog';

/**
 * Files that leave the building.
 *
 * Three things were wrong here and all three are about what is actually
 * in the file.
 *
 * 1. Nobody was told. The button said "Download CSV" and the columns
 *    were whatever keys happened to be on the first row of whatever the
 *    API returned that day. If a payload ever widens again (it has
 *    before: this page once wrote fifty riders' bank details and ID
 *    scans to an operator's laptop) the file widens with it, silently.
 *    So the columns are now DECLARED here, the file contains those and
 *    nothing else, and the screen lists them before the download.
 *
 * 2. The revenue file was broken. adminApi.analytics.revenue returns
 *    { data: [...] }, and the old code checked Array.isArray, found an
 *    object, and ran Object.entries over it. The result was a
 *    single-row CSV whose one cell held the whole month as JSON.
 *
 * 3. The descriptions were wrong. "Top drivers by completed-trip count
 *    and earnings" contained no earnings, and "referral funnel by
 *    referrer cohort" has no cohorts in it: it is three totals.
 */

type ReportKey = 'delivery_performance' | 'revenue_finance' | 'driver_activity' | 'customer_growth';

interface Column {
  header: string;
  /** Pulls one cell out of a row. Anything not named here never leaves. */
  get: (row: any) => string | number;
}

interface ReportDef {
  key:         ReportKey;
  title:       string;
  description: string;
  /** Said out loud before the download, so nobody exports blind. */
  contains:    string;
  icon:        any;
  columns:     Column[];
  /** True when the rows are about identifiable people. */
  personal:    boolean;
  fetch:       () => Promise<any[]>;
}

const REPORTS: ReportDef[] = [
  {
    key:         'delivery_performance',
    title:       'Where deliveries stand',
    description: 'One line per delivery state, with how many jobs are sitting in it. Covers every delivery SEIRS has ever taken, not a date range.',
    contains:    'Counts only. No customer, rider or address is named.',
    icon:        Package,
    personal:    false,
    columns: [
      { header: 'Delivery state', get: r => deliveryStatus(r.status) },
      { header: 'How many',       get: r => Number(r.count ?? 0) },
    ],
    fetch: async () => {
      const data = await adminApi.analytics.deliveriesByStatus();
      if (Array.isArray(data)) return data;
      return Object.entries(data ?? {}).map(([status, count]) => ({ status, count }));
    },
  },
  {
    key:         'revenue_finance',
    title:       'Money taken each day',
    description: 'One line per day for the last 30 days: what customers were charged on jobs that completed, and how many completed. Not what SEIRS keeps.',
    contains:    'Daily totals only. No customer or rider is named.',
    icon:        TrendingUp,
    personal:    false,
    columns: [
      { header: 'Day',                            get: r => String(r.date ?? '') },
      { header: 'Charged to customers (naira)',   get: r => nairaAmount(r.revenue) },
      { header: 'Deliveries completed',           get: r => Number(r.count ?? 0) },
    ],
    fetch: async () => {
      const data: any = await adminApi.analytics.revenue(30);
      // The endpoint wraps its rows in { data: [...] }. Reading it as an
      // array produced a one-row file with the whole month in one cell.
      if (Array.isArray(data)) return data;
      return Array.isArray(data?.data) ? data.data : [];
    },
  },
  {
    key:         'driver_activity',
    title:       'Busiest riders',
    description: 'The 50 riders with the most completed deliveries, with their rating and vehicle. There are no earnings in this file.',
    contains:    'Names real riders: name, SEIRS ID, vehicle, deliveries, rating, account state. No bank details, no documents, no phone number, no address.',
    icon:        BarChart2,
    personal:    true,
    columns: [
      { header: 'Rider',                 get: r => r.user?.name ?? 'Name missing' },
      { header: 'SEIRS ID',              get: r => r.user?.accountId ?? '' },
      { header: 'Vehicle',               get: r => r.vehicleType ?? '' },
      { header: 'Deliveries completed',  get: r => Number(r.totalDeliveries ?? 0) },
      { header: 'Rating',                get: r => (r.rating == null ? 'not rated' : Number(r.rating).toFixed(1)) },
      { header: 'Account state',         get: r => driverStatus(r.status) },
    ],
    fetch: async () => {
      const data = await adminApi.analytics.topDrivers(50);
      return Array.isArray(data) ? data : [];
    },
  },
  {
    key:         'customer_growth',
    title:       'Referral results',
    description: 'Three totals: how many people signed up with a referral code, how many of them completed a delivery, and the percentage.',
    contains:    'Three totals. Nobody is named.',
    icon:        Users,
    personal:    false,
    columns: [
      { header: 'Measure', get: r => String(r.measure ?? '') },
      { header: 'Value',   get: r => r.value ?? '' },
    ],
    fetch: async () => {
      const d: any = await adminApi.analytics.referralFunnel();
      if (!d) return [];
      // Was Object.entries into a column called "cohort". There are no
      // cohorts in this endpoint: it returns three numbers.
      return [
        { measure: 'Signed up with a referral code', value: d.referredSignups ?? 0 },
        { measure: 'Went on to complete a delivery', value: d.firstDeliveryDone ?? 0 },
        { measure: 'Percentage that completed one',  value: `${d.conversionPercent ?? 0}%` },
      ];
    },
  },
];

/**
 * Build the file from the declared columns only. The old version took
 * Object.keys of the first row, so the file was whatever the API felt
 * like sending.
 */
function toCsv(rows: any[], columns: Column[]): string {
  const head = columns.map(c => escape(c.header)).join(',');
  const body = rows.map(r => columns.map(c => escape(safeGet(c, r))).join(',')).join('\n');
  return `${head}\n${body}`;
}

function safeGet(col: Column, row: any): string | number {
  try { return col.get(row) ?? ''; } catch { return ''; }
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

export default function ReportsPage() {
  const confirm = useConfirm();
  const [busyKey, setBusyKey] = useState<ReportKey | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<Record<string, { at: string; rows: number }>>({});

  const generate = async (def: ReportDef) => {
    setBusyKey(def.key);
    setError(null);
    try {
      const rows = await def.fetch();
      if (rows.length === 0) {
        setError(`"${def.title}" has nothing in it for this period, so no file was created.`);
        return;
      }

      /**
       * Say what is about to land on the operator's laptop. A file with
       * fifty named riders in it should not be one unlabelled click.
       */
      const ok = await confirm({
        title:   `Download "${def.title}"?`,
        message:
          `${rows.length} row${rows.length === 1 ? '' : 's'}, with these columns:\n` +
          def.columns.map(c => `  - ${c.header}`).join('\n') +
          `\n\n${def.contains}\n\n` +
          'The file is saved to this computer. Once it is on a laptop or in an email, SEIRS cannot take it back, and this download is not recorded anywhere.',
        confirmLabel: 'Save the file',
        danger:       def.personal,
      });
      if (!ok) return;

      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`seirs_${def.key}_${stamp}.csv`, toCsv(rows, def.columns));
      setLastRun(prev => ({ ...prev, [def.key]: { at: new Date().toLocaleString('en-NG'), rows: rows.length } }));
    } catch (e: any) {
      setError(`"${def.title}" could not be built: ${e?.message ?? 'the server did not answer'}. No file was created.`);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="p-8">
      <PageIntro
        title="Reports"
        purpose="Take a set of figures out of SEIRS as a spreadsheet file you can open in Excel."
        storageKey="reports"
        help={
          <>
            <p>Each card says exactly which columns end up in the file, and whether anybody is named in it, before you download.</p>
            <p>These files are built from live figures at the moment you press the button. They are not stored anywhere and nothing schedules them.</p>
            <p><strong>Nothing here is recorded in the audit log.</strong> If you need a download that is traceable, use Data Exports under Finance instead.</p>
          </>
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <ShieldAlert size={16} className="mt-0.5 shrink-0" />
        <p>
          A file that leaves this dashboard cannot be recalled. Downloads from this page are not written to the audit log,
          so nobody can tell later who took what.{' '}
          <Link href="/exports" className="font-semibold underline">Data Exports</Link> records every download it makes.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {REPORTS.map(r => {
          const Icon = r.icon;
          const busy = busyKey === r.key;
          const run  = lastRun[r.key];
          return (
            <div key={r.key} className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0F2B4C]/[0.08]">
                  <Icon size={18} className="text-[#0F2B4C]" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-[#0F2B4C]">{r.title}</h3>
                    {r.personal && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                        names real people
                      </span>
                    )}
                  </div>
                  {/* The description used to name the API route it was
                      built from, which tells an ops hire nothing and an
                      engineer nothing they could not grep. */}
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{r.description}</p>
                </div>
              </div>

              {/* What is in the file, on the card, before the click. */}
              <div className="rounded-lg border border-[#E5E7EB] bg-[#F5F5F0] px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#0F2B4C]/40">Columns in the file</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#0F2B4C]/70">
                  {r.columns.map(c => c.header).join(', ')}
                </p>
              </div>

              <div className="flex items-center gap-4 border-t border-gray-100 pt-2 text-xs text-gray-500">
                <span>
                  <span className="font-medium text-gray-700">Last downloaded:</span>{' '}
                  {run ? `${run.at} (${run.rows} rows)` : 'not in this session'}
                </span>
              </div>
              <button
                onClick={() => generate(r)}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#0F2B4C] py-2 text-xs font-medium text-white transition-colors hover:bg-[#0F2B4C]/90 disabled:opacity-50"
              >
                <Download size={12} />
                {busy ? 'Building the file' : 'Download as a spreadsheet'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-gray-400">
        <FileBarChart size={12} />
        Emailing these on a schedule is not built yet. Run them here when you need them.
      </div>
    </div>
  );
}
