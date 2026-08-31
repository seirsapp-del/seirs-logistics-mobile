'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Banknote, CheckCircle2, Download, FileSpreadsheet, Inbox,
  Landmark, Lock, Package, Truck, Users,
} from 'lucide-react';
import { downloadExportCsv, type ExportKey } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { permsAllow, resolveSessionPerms } from '@/lib/rbac';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm } from '@/components/ConfirmDialog';

/**
 * Data Exports.
 *
 * Until this page existed the admin had exactly one export in it, the
 * NDPR bundle on a single driver, so reconciling a payout run against a
 * bank statement or handing an accountant a month of revenue meant
 * reading numbers off a screen and retyping them.
 *
 * Two permissions, not one. The money files are the stricter grant
 * because they are what gets reconciled; the operational files are a
 * whole customer or driver table in one click. A card the viewer was not
 * granted is not rendered at all rather than rendered and refused: this
 * app has a written history of fully enabled buttons whose every action
 * answered 403, and the fix each time was to make the screen tell the
 * truth about what the API will allow.
 */

const FINANCE_PERMISSION     = 'exports-finance';
const OPERATIONAL_PERMISSION = 'exports-operational';

interface ExportCard {
  key:         ExportKey;
  title:       string;
  description: string;
  permission:  string;
  icon:        any;
}

const MONEY_EXPORTS: ExportCard[] = [
  {
    key:         'driver-payouts',
    title:       'Driver payouts',
    description:
      'One row per transfer that actually left, with what was requested, what was sent, what was withheld, our reference and the Flutterwave id. This is the file you reconcile against the bank statement.',
    permission:  FINANCE_PERMISSION,
    icon:        Landmark,
  },
  {
    key:         'driver-earnings',
    title:       'Driver earnings ledger',
    description:
      'Every earning row with its status, so pending, available, paying, paid and held are separable rather than summed into one misleading total.',
    permission:  FINANCE_PERMISSION,
    icon:        Banknote,
  },
  {
    key:         'payments',
    title:       'Customer payments in',
    description:
      'Payments received, with escrow status and purpose, so held money is distinguishable from released money and a fare from a redirect fee.',
    permission:  FINANCE_PERMISSION,
    icon:        FileSpreadsheet,
  },
  {
    key:         'deliveries',
    title:       'Deliveries with price breakdown',
    description:
      'Every delivery with its priced components named separately: fare, driver earnings, night fee, partner handling, cancellation, redirect, return and address-change quotes.',
    permission:  FINANCE_PERMISSION,
    icon:        Package,
  },
];

const OPERATIONAL_EXPORTS: ExportCard[] = [
  {
    key:         'drivers',
    title:       'Drivers',
    description:
      'Driver roster with vehicle, status, value level and rating. Bank details are the last 4 digits only, and no KYC document, selfie or live position is included.',
    permission:  OPERATIONAL_PERMISSION,
    icon:        Truck,
  },
  {
    key:         'customers',
    title:       'Customers',
    description:
      'Customer accounts with contact details and verification state. No credentials, no reset tokens, no push tokens, no home addresses, no dates of birth.',
    permission:  OPERATIONAL_PERMISSION,
    icon:        Users,
  },
  {
    key:         'support-tickets',
    title:       'Support tickets',
    description:
      'Ticket rows with topic, status and response timestamps. Message bodies stay in the thread where they were written.',
    permission:  OPERATIONAL_PERMISSION,
    icon:        Inbox,
  },
];

/**
 * Today in Lagos, not in the browser's timezone.
 *
 * The API reads the range as Africa/Lagos because that is what an
 * operator asking for "August" means, and the founder is frequently not
 * in that timezone. Defaulting from the laptop clock would put the
 * picker a day out from what the server will actually cut on.
 */
function lagosToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
}

function lagosDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
}

function startOfMonth(offsetMonths: number): { from: string; to: string } {
  const today = new Date(`${lagosToday()}T12:00:00.000+01:00`);
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offsetMonths, 1, 12));
  const last  = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offsetMonths + 1, 0, 12));
  const fmt   = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  return { from: fmt(first), to: fmt(last) };
}

const MAX_RANGE_DAYS = 366;

export default function ExportsPage() {
  const [from, setFrom]       = useState(lagosDaysAgo(29));
  const [to, setTo]           = useState(lagosToday());
  const [busy, setBusy]       = useState<ExportKey | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [done, setDone]       = useState<string | null>(null);
  // Permissions come from localStorage, which does not exist during SSR,
  // so the decision cannot be made until after mount.
  const [perms, setPerms]     = useState<{ perms: string[]; slug?: string } | null>(null);
  const [ready, setReady]     = useState(false);
  const confirm               = useConfirm();

  useEffect(() => {
    const resolved = resolveSessionPerms(getUser());
    setPerms(resolved ? { perms: resolved.perms, slug: resolved.slug } : { perms: [] });
    setReady(true);
  }, []);

  const may = (permission: string) =>
    !!perms && permsAllow(perms.perms, permission, perms.slug);

  const money       = useMemo(() => MONEY_EXPORTS.filter(c => may(c.permission)), [perms]);
  const operational = useMemo(() => OPERATIONAL_EXPORTS.filter(c => may(c.permission)), [perms]);

  const rangeError = useMemo(() => {
    if (!from || !to) return 'Pick a start and an end date.';
    if (from > to) return 'The start date is after the end date.';
    const days = Math.round(
      (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
    );
    if (days > MAX_RANGE_DAYS) {
      return `A single export covers at most ${MAX_RANGE_DAYS} days. Pull the period in shorter runs.`;
    }
    return null;
  }, [from, to]);

  const run = async (card: ExportCard) => {
    if (rangeError) { setError(rangeError); return; }
    /**
     * The operational files are whole tables of real people's names,
     * phone numbers and emails leaving the building as a file on
     * somebody's laptop. That deserves a sentence before the click, not
     * a line of small print further up the page.
     */
    if (card.permission === OPERATIONAL_PERMISSION) {
      const ok = await confirm({
        title:        `Download ${card.title.toLowerCase()} to this computer?`,
        message:      `This is a file of real people's personal details for ${from} to ${to}. Once it is on your machine SEIRS cannot recall it or delete it, so keep it off shared drives and delete it when you are done.

Your name, the dates and the number of rows are written to the Audit Log.`,
        confirmLabel: 'Download it',
      });
      if (!ok) return;
    }
    setBusy(card.key);
    setError(null);
    setDone(null);
    try {
      await downloadExportCsv(card.key, from, to);
      // "downloaded" alone left people hunting for the file.
      setDone(`${card.title} for ${from} to ${to} has been saved to this computer's Downloads folder. It opens in Excel.`);
    } catch (e: any) {
      setError(`${card.title} failed: ${e?.message ?? 'unknown error'}`);
    } finally {
      setBusy(null);
    }
  };

  const applyPreset = (preset: 'last30' | 'thisMonth' | 'lastMonth' | 'thisYear') => {
    setError(null);
    setDone(null);
    if (preset === 'last30')    { setFrom(lagosDaysAgo(29)); setTo(lagosToday()); return; }
    if (preset === 'thisMonth') { const r = startOfMonth(0);  setFrom(r.from); setTo(r.to); return; }
    if (preset === 'lastMonth') { const r = startOfMonth(-1); setFrom(r.from); setTo(r.to); return; }
    const year = lagosToday().slice(0, 4);
    setFrom(`${year}-01-01`);
    setTo(lagosToday());
  };

  // Returning null flashed a blank page while permissions were read.
  if (!ready) return <div className="p-8 text-sm text-gray-400">Checking what you are allowed to download…</div>;

  const nothingGranted = money.length === 0 && operational.length === 0;

  return (
    <div className="p-6 space-y-6">
      <PageIntro
        title="Download the numbers"
        purpose="Take a dated slice of SEIRS out as a spreadsheet: what was paid in, what was paid out, and who did what."
        storageKey="exports"
        help={
          <>
            <p><b>Nothing here changes anything.</b> These buttons only read. No customer, driver or partner is affected by a download.</p>
            <p><b>Money is written to the kobo</b> so a payout run adds up against the bank statement rather than being rounded into disagreement.</p>
            <p><b>Dates are Nigerian dates.</b> Both ends are included, so "1 to 31 August" means the whole of August in Lagos, whatever timezone your laptop is in.</p>
            <p><b>Every download is recorded</b> in the Audit Log with your name, the dates and the number of rows. The personal-data files are real people's contact details: keep them off shared drives.</p>
          </>
        }
      />

      {/* Range picker */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="export-from">
              From
            </label>
            <input
              id="export-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => { setFrom(e.target.value); setError(null); setDone(null); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-[#0F2B4C]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="export-to">
              To
            </label>
            <input
              id="export-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => { setTo(e.target.value); setError(null); setDone(null); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-[#0F2B4C]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ['last30',    'Last 30 days'],
              ['thisMonth', 'This month'],
              ['lastMonth', 'Last month'],
              ['thisYear',  'Year to date'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className="px-3 py-2 rounded-lg border border-gray-300 text-xs font-medium text-[#0F2B4C] hover:bg-gray-50"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Ranges are read in Africa/Lagos and both ends are inclusive, so a month means that month in
          Nigeria. Every download is recorded in the Audit Log with your name, the range and the row
          count.
        </p>
        {rangeError && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {rangeError}
          </p>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {done && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
          <span>{done}</span>
        </div>
      )}

      {nothingGranted && (
        <div className="bg-white rounded-xl border border-gray-200">
          <EmptyState
            icon={<Lock size={20} />}
            title="Your account cannot download anything"
            body={'Being allowed to read a screen and being allowed to download the whole table are granted separately. Ask a Super Admin to add "Export money data" or "Export operational data" to your role.'}
          />
        </div>
      )}

      {money.length > 0 && (
        <Section
          title="Money"
          note="Every amount is in naira to two decimal places, the way Flutterwave reports it, so the figures reconcile against the bank. Bank account numbers show their last four digits only."
          cards={money}
          busy={busy}
          disabled={!!rangeError}
          onRun={run}
        />
      )}

      {operational.length > 0 && (
        <Section
          title="People"
          note="Real people's contact details. Only named columns are included: no passwords, no reset links, no ID documents, no live positions."
          cards={operational}
          busy={busy}
          disabled={!!rangeError}
          onRun={run}
        />
      )}
    </div>
  );
}

function Section({
  title, note, cards, busy, disabled, onRun,
}: {
  title:    string;
  note:     string;
  cards:    ExportCard[];
  busy:     ExportKey | null;
  disabled: boolean;
  onRun:    (card: ExportCard) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-[#0F2B4C]">{title}</h2>
        <p className="text-xs text-gray-500">{note}</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {cards.map((card) => {
          const Icon    = card.icon;
          const running = busy === card.key;
          return (
            <div key={card.key} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#0F2B4C]/8 flex items-center justify-center shrink-0">
                  <Icon size={18} className="text-[#0F2B4C]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0F2B4C]">{card.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{card.description}</p>
                </div>
              </div>
              <button
                onClick={() => onRun(card)}
                disabled={running || disabled || busy !== null}
                className="mt-auto flex items-center justify-center gap-1.5 bg-[#0F2B4C] text-white text-xs font-medium py-2 rounded-lg hover:bg-[#0F2B4C]/90 transition-colors disabled:opacity-50"
              >
                <Download size={12} />
                {running ? 'Preparing…' : 'Download the spreadsheet'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
