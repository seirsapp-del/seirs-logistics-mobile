'use client';

/**
 * Insurance partners: the cover SEIRS itself buys.
 *
 * One job: know that every policy protecting SEIRS riders and the goods
 * they carry is still in force, and see the next renewal coming before
 * it passes. A lapsed policy nobody noticed is the single most expensive
 * thing this screen can hide.
 *
 * Not to be confused with the cover SEIRS offers a customer on their
 * parcel: that is priced and switched on in the Pricing engine, and is
 * deliberately off until an underwriter is signed.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Shield, Plus, ExternalLink, AlertCircle, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { naira } from '@/lib/money';
import { ExternalPartnerModal, type ExternalPartner } from '@/components/ExternalPartnerEditor';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';

const STATUS_STYLES: Record<string, string> = {
  active:  'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  lapsed:  'bg-red-100 text-red-700',
  paused:  'bg-gray-100 text-gray-500',
};

/** What each state means for somebody deciding whether SEIRS is covered. */
const STATUS_LABEL: Record<string, { label: string; hint: string }> = {
  active:  { label: 'In force',      hint: 'We are covered by this policy.' },
  pending: { label: 'Not confirmed', hint: 'Added, but the paperwork has not been checked. Do not rely on it.' },
  lapsed:  { label: 'Expired',       hint: 'This policy no longer covers anything. Renew it or remove it.' },
  paused:  { label: 'Not in use',    hint: 'Kept on file but not relied on.' },
};

const COVERAGE_LABEL: Record<string, string> = {
  cargo:           'The goods being carried',
  driver_accident: 'Riders hurt while working',
  third_party:     'Damage we cause to other people',
  cyber:           'Data and systems',
};

/** The server returns at most 200 rows. */
const ROW_CAP = 200;

const fmtNgn = (n: number) => (n > 0 ? naira(n) : 'Not stated');

/** Days until a renewal date. Negative means it has already passed. */
function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

export default function InsurancePage() {
  const [items,   setItems]   = useState<ExternalPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [editing, setEditing] = useState<ExternalPartner | 'new' | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.externalPartners.list('insurance')
      .then(list => setItems(Array.isArray(list) ? list : []))
      .catch((e: any) => { setItems([]); setError(e?.message ?? 'Could not load insurance partners'); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  /**
   * Soonest renewal first, undated last.
   *
   * The server orders these alphabetically, which buries the policy that
   * expires on Friday under one that expires next year. Renewal is the
   * only thing anybody triages this list on.
   */
  const sorted = [...items].sort((a, b) => {
    const da = daysUntil(a.meta?.renewalDate);
    const db = daysUntil(b.meta?.renewalDate);
    if (da == null && db == null) return (a.name ?? '').localeCompare(b.name ?? '');
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });

  // Policies that have run out, or run out inside a month, counted for
  // the banner. This was left entirely to the reader's own eyes.
  const expired  = items.filter(i => { const d = daysUntil(i.meta?.renewalDate); return d != null && d < 0; });
  const dueSoon  = items.filter(i => { const d = daysUntil(i.meta?.renewalDate); return d != null && d >= 0 && d <= 30; });
  const undated  = items.filter(i => !i.meta?.renewalDate);

  return (
    <div className="p-6 space-y-6">
      <PageIntro
        title="Our insurance cover"
        purpose="Every policy SEIRS holds to protect its riders and the goods they carry, and when each one runs out."
        storageKey="insurance"
        help={
          <>
            <p><b>Nothing here is sold to customers.</b> This is the cover SEIRS buys for itself. Cover offered to a customer on their parcel is priced in the <Link className="font-semibold text-[#3A7BD5] hover:underline" href="/pricing">Pricing engine</Link> and stays switched off until an underwriter is signed.</p>
            <p><b>Expired means uninsured.</b> If a policy's renewal date has passed, SEIRS is carrying that risk itself from that date, whatever the row still says.</p>
            <p>Adding, editing and removing rows here changes nothing in the customer, business or rider apps. It is a record for the people who buy the cover.</p>
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <button onClick={load} className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button onClick={() => setEditing('new')}
              className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#2f6cc0]">
              <Plus size={15} /> Add a policy
            </button>
          </div>
        }
      />

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={load} className="shrink-0 font-semibold underline hover:no-underline">Try again</button>
        </div>
      )}

      {/*
        The old banner read "Lapsed policies expose drivers and cargo to
        uninsured risk. Track renewal dates per provider": a standing
        instruction to do arithmetic by eye on every visit. The dates are
        on the rows, so the page can just say what it found.
      */}
      {!loading && items.length > 0 && (
        expired.length > 0 || dueSoon.length > 0 || undated.length > 0 ? (
          <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <AlertCircle size={16} className="text-yellow-600 mt-0.5 shrink-0" />
            <div className="text-sm text-yellow-900">
              {expired.length > 0 && (
                <p className="font-semibold">
                  {expired.length} polic{expired.length === 1 ? 'y has' : 'ies have'} already run out: {expired.map(e => e.name).join(', ')}. SEIRS is carrying that risk itself right now.
                </p>
              )}
              {dueSoon.length > 0 && (
                <p className={expired.length > 0 ? 'mt-1' : 'font-semibold'}>
                  {dueSoon.length} run{dueSoon.length === 1 ? 's' : ''} out within 30 days. Start the renewal now.
                </p>
              )}
              {undated.length > 0 && (
                <p className="mt-1 text-yellow-800/80">
                  {undated.length} polic{undated.length === 1 ? 'y has' : 'ies have'} no renewal date on file, so nobody can tell whether they are still in force.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            <p className="text-sm text-emerald-900">
              Every policy on file is in date, and none runs out within the next 30 days.
            </p>
          </div>
        )
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-[#0F2B4C]">Policies, soonest renewal first</span>
          <span className="text-xs text-gray-400">
            {items.length} polic{items.length === 1 ? 'y' : 'ies'}
            {items.length >= ROW_CAP ? ` (the first ${ROW_CAP})` : ''}
          </span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" /> Loading…
          </div>
        ) : error && items.length === 0 ? (
          /* A failed load rendering as "no insurance partners yet" tells
             the reader SEIRS has no cover at all, which is the most
             alarming thing this page could say wrongly. */
          <EmptyState
            icon={<AlertCircle size={20} />}
            title="The policy list would not load"
            body="This is the dashboard failing to read the list. It says nothing about whether SEIRS is insured."
            action={{ label: 'Try again', onClick: load }}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Shield size={20} />}
            title="No policy has been recorded"
            body="Nobody can tell from this dashboard whether SEIRS is insured. Add the policies the company already holds."
            action={{ label: 'Add the first policy', onClick: () => setEditing('new') }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Insurer</th>
                  <th className="text-left px-4 py-3">What it covers</th>
                  <th className="text-left px-4 py-3">What we pay</th>
                  <th className="text-left px-4 py-3">Most it pays out</th>
                  <th className="text-left px-4 py-3">Runs out</th>
                  <th className="text-left px-4 py-3">State</th>
                  <th className="text-left px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(p => {
                  const days = daysUntil(p.meta?.renewalDate);
                  const gone = days != null && days < 0;
                  const soon = days != null && days >= 0 && days <= 30;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setEditing(p)}>
                      <td className="px-4 py-3 font-medium text-[#0F2B4C] flex items-center gap-1.5">
                        {p.name}
                        {p.websiteUrl && <ExternalLink size={11} className="text-gray-300" />}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {COVERAGE_LABEL[p.meta?.coverageType] ?? p.meta?.coverageType ?? <span className="text-gray-400">Not stated</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.meta?.premium || <span className="text-gray-400">Not stated</span>}</td>
                      <td className="px-4 py-3 font-medium text-gray-700 tabular-nums">{fmtNgn(Number(p.meta?.coverageLimitNgn ?? 0))}</td>
                      {/*
                        The date was printed and left at that, so a policy
                        that expired last month looked exactly like one
                        expiring next year.
                      */}
                      <td className="px-4 py-3 text-xs">
                        {p.meta?.renewalDate ? (
                          <>
                            <span className={gone ? 'font-semibold text-red-700' : soon ? 'font-semibold text-amber-700' : 'text-gray-500'}>
                              {new Date(p.meta.renewalDate).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                            <span className="block text-[10px] text-gray-400">
                              {gone
                                ? `ran out ${Math.abs(days!)} day${Math.abs(days!) === 1 ? '' : 's'} ago`
                                : days === 0 ? 'runs out today'
                                : `${days} day${days === 1 ? '' : 's'} left`}
                            </span>
                          </>
                        ) : (
                          <span className="text-amber-700">No date on file</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[p.status] ?? ''}`}
                          title={STATUS_LABEL[p.status]?.hint}
                        >
                          {STATUS_LABEL[p.status]?.label ?? p.status}
                        </span>
                        {/* The state is typed in by hand and the date is
                            not, so the two can disagree. Say which one to
                            believe. */}
                        {gone && p.status === 'active' && (
                          <span className="mt-1 block text-[10px] font-semibold text-red-700">
                            marked in force, but the date says otherwise
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#3A7BD5] font-medium">Edit or remove</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ExternalPartnerModal
          row={editing === 'new' ? null : editing}
          type="insurance"
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
