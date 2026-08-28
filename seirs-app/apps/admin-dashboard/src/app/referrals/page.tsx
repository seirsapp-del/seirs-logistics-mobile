'use client';

/**
 * Referrals: who came to SEIRS because somebody else told them to.
 *
 * One job: see whether the referral scheme is bringing people in, and
 * spot codes that are not matching a real account.
 *
 * What this page canNOT tell you, and used to imply it could: whether a
 * referral bonus was actually paid. The server derives each row's state
 * purely from whether the typed code matches an existing SEIRS ID. The
 * bonus itself is awarded later, on the new person's first completed
 * delivery, by a separate check. Calling the matched rows "Credited"
 * and putting a "Credited %" tile above them read as a payout report,
 * which is money the page has never actually looked at.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Share2, Users, TrendingUp, Gift, RefreshCw, AlertCircle } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';

interface ReferralRow {
  referredId:   string;
  referredName: string;
  referredAt:   string;
  code:         string;
  referrerId:   string | null;
  referrerName: string | null;
  status:       'credited' | 'pending';
}

const STATUS_STYLES: Record<string, string> = {
  credited: 'bg-green-100 text-green-700',
  pending:  'bg-yellow-100 text-yellow-700',
};

/** The server sends the 100 most recent sign-ups and offers no page two. */
const ROW_CAP = 100;

export default function ReferralsPage() {
  const [rows, setRows]         = useState<ReferralRow[]>([]);
  const [summary, setSummary]   = useState<{ totalReferrals: number; monthToDate: number } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);

  // A failed fetch used to render as "no referrals yet", which on this
  // page reads as a dead referral programme rather than a dead request.
  const load = async () => {
    setLoading(true);
    setError(null);
    const failures: string[] = [];
    try {
      const [list, s] = await Promise.all([
        adminApi.referrals.list().catch(() => { failures.push('the list of sign-ups'); return []; }),
        adminApi.referrals.summary().catch(() => { failures.push('the totals'); return null; }),
      ]);
      setRows(list ?? []);
      setSummary(s);
      if (failures.length) setError(`Could not load ${failures.join(' and ')}.`);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const matchedCount = rows.filter(r => r.status === 'credited').length;
  const matchedPct   = rows.length > 0 ? Math.round((matchedCount / rows.length) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      <PageIntro
        title="Referrals"
        purpose="Everybody who typed somebody else's SEIRS ID when they signed up, and whether that ID matched a real account."
        storageKey="referrals"
        help={
          <>
            <p><b>This page does not show bonuses.</b> It cannot tell you whether anybody was paid. The reward is worked out separately, when the new person completes their first delivery.</p>
            <p><b>Code matched</b> means the ID they typed belongs to a real SEIRS account, so there is somebody who could earn from it.</p>
            <p><b>Code matched nobody</b> means the ID they typed does not exist: a typo, or somebody guessing. Nobody will ever earn from that row, and it is worth checking whether the sign-up screen is confusing people.</p>
            <p>Nothing on this page changes anything. There are no buttons here that touch an account.</p>
          </>
        }
        actions={
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => load()} className="shrink-0 font-semibold underline hover:no-underline">Try again</button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: 'People who arrived with a code, ever',
            value: summary?.totalReferrals?.toLocaleString() ?? '-',
            icon:  Users,
            color: 'text-[#3A7BD5]',
          },
          {
            label: 'And so far this month',
            value: summary?.monthToDate?.toLocaleString() ?? '-',
            icon:  Gift,
            color: 'text-green-600',
          },
          {
            /* This tile said "Credited %". Nobody has been credited
               anything at the point this page can see: the figure is how
               many typed codes matched a real account. */
            label: `Codes that matched a real account (of the last ${Math.min(rows.length, ROW_CAP)})`,
            value: rows.length > 0 ? `${matchedPct}%` : '-',
            icon:  TrendingUp,
            color: 'text-yellow-600',
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
              <Icon size={18} className={color} />
            </div>
            <div>
              <div className="text-xl font-bold text-[#0F2B4C] tabular-nums">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <span className="text-sm font-semibold text-[#0F2B4C]">Newest sign-ups first</span>
          {/* The table is capped at 100 rows by the server with no page
              two, while the tiles above count every referral ever. Those
              two numbers disagreeing needed explaining. */}
          <span className="text-xs text-gray-500">
            {rows.length >= ROW_CAP
              ? `Showing the ${ROW_CAP} most recent. The totals above count all of them.`
              : `${rows.length} in the list`}
          </span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : error && rows.length === 0 ? (
            <EmptyState
              icon={<AlertCircle size={20} />}
              title="The list would not load"
              body="This is the dashboard failing to read, not an empty referral scheme."
              action={{ label: 'Try again', onClick: () => load() }}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Share2 size={20} />}
              title="Nobody has signed up with a code yet"
              body="Anybody who types another person's SEIRS ID on the sign-up screen appears here, whether or not the ID turns out to be real."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Who signed up</th>
                  <th className="text-left px-4 py-3">The code they typed</th>
                  <th className="text-left px-4 py-3">Who that code belongs to</th>
                  <th className="text-left px-4 py-3">When</th>
                  <th className="text-left px-4 py-3">Did the code work</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.referredId} className="hover:bg-gray-50 transition-colors">
                    {/* Both names lead to the account behind them. Chasing
                        a suspicious referral chain meant copying a name
                        into the Users search by hand. */}
                    <td className="px-4 py-3 font-medium text-[#0F2B4C]">
                      <Link href={`/users/${r.referredId}`} className="hover:text-[#3A7BD5] hover:underline">
                        {r.referredName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#3A7BD5]">{r.code}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.referrerId && r.referrerName ? (
                        <Link href={`/users/${r.referrerId}`} className="hover:text-[#3A7BD5] hover:underline">
                          {r.referrerName}
                        </Link>
                      ) : (
                        <span className="text-gray-400 italic">Nobody: no account has this ID</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{new Date(r.referredAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-3">
                      {/*
                        "Credited" and "Pending" were the words here, and
                        both were wrong: nothing is credited at this point
                        and nothing about a mismatched code is pending.
                      */}
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[r.status]}`}
                        title={r.status === 'credited'
                          ? 'The ID they typed belongs to a real account. Whether a bonus was paid is decided later, on their first completed delivery.'
                          : 'No SEIRS account has this ID. Nobody can earn a bonus from this sign-up.'}
                      >
                        {r.status === 'credited' ? 'Code matched' : 'Code matched nobody'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
