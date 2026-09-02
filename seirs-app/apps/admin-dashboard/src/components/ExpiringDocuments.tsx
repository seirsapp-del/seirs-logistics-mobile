'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';

/**
 * The documents that are lapsing or have lapsed, as a list you work through.
 *
 * WHY. There was a banner saying "3 expired, 5 expiring within 30 days" and
 * nothing behind it. The founder's objection is the right one and it is
 * about scale: "if we have 1000 drivers we will have to manually check all
 * their id again to know which is expired". A count tells you a problem
 * exists; it does not tell you whose, and it cannot be worked.
 *
 * Worst first: already expired at the top, then nearest to expiring. Each
 * row opens the rider, which is where the document and the decision are.
 *
 * Nothing here suspends anybody. Founder's standing decision from
 * 1 September: expiry flags, a person decides. The rows say plainly that
 * these riders are still receiving jobs, so nobody assumes the system has
 * already acted.
 */

const DOC_LABEL: Record<string, string> = {
  drivers_license:  "Driver's licence",
  insurance_cert:   'Insurance certificate',
  vehicle_document: 'Vehicle papers',
  ownership_proof:  'Proof of ownership',
};

const fmt = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function ExpiringDocuments({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const [rows,  setRows]  = useState<any[] | null>(null);
  const [days,  setDays]  = useState(30);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await adminApi.driverDocuments.expiring(days);
      setRows(r?.items ?? []);
      onCountChange?.((r?.items ?? []).length);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load expiring documents.');
      setRows([]);
      onCountChange?.(0);
    }
  }, [days, onCountChange]);

  useEffect(() => { void load(); }, [load]);

  const expired = (rows ?? []).filter(r => r.expired).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#0F2B4C]/60">
          Expiring documents
        </h2>
        {expired > 0 && (
          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
            {expired} already expired
          </span>
        )}
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="ml-auto rounded-lg border border-[#E5E7EB] px-2 py-1 text-xs"
        >
          <option value={30}>Next 30 days</option>
          <option value={60}>Next 60 days</option>
          <option value={90}>Next 90 days</option>
          <option value={0}>Already expired only</option>
        </select>
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
        </div>
      )}

      {rows === null ? (
        <div className="flex items-center gap-2 py-8 text-sm text-[#0F2B4C]/50">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="good"
          title="Nothing lapsing"
          body="No approved document expires in this window. Riders are emailed 30 days before their own documents lapse, so most are dealt with before they reach this list."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-[#E5E7EB] bg-[#F5F5F0] text-left">
              <tr>
                <th className="px-4 py-2 font-semibold">Rider</th>
                <th className="px-4 py-2 font-semibold">Document</th>
                <th className="px-4 py-2 font-semibold">Expires</th>
                <th className="px-4 py-2 font-semibold">Told?</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-b border-gray-50 ${r.expired ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 py-2">
                    <Link href={`/drivers/${r.driverId}`} className="font-medium text-[#3A7BD5] hover:underline">
                      {r.driverName ?? r.driverEmail ?? 'Unnamed rider'}
                    </Link>
                    {r.accountId && (
                      <span className="ml-2 font-mono text-[11px] text-[#5C6E82]">{r.accountId}</span>
                    )}
                    {r.driverStatus !== 'approved' && (
                      <span className="ml-2 text-[11px] text-[#5C6E82]">({r.driverStatus})</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-[#0F2B4C]">{DOC_LABEL[r.docId] ?? r.docId}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={r.expired ? 'font-semibold text-red-700' : r.daysLeft <= 30 ? 'text-amber-700' : 'text-[#5C6E82]'}>
                      {r.expired
                        ? `expired ${Math.abs(r.daysLeft)} day${Math.abs(r.daysLeft) === 1 ? '' : 's'} ago`
                        : r.daysLeft === 0 ? 'expires today'
                        : `in ${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'}`}
                    </span>
                    <span className="ml-2 text-xs text-[#0F2B4C]/40">{fmt(r.expiresAt)}</span>
                  </td>
                  <td className="px-4 py-2">
                    {r.warned ? (
                      <span className="inline-flex items-center gap-1 text-xs text-[#5C6E82]">
                        <CalendarClock className="h-3.5 w-3.5" /> warned
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700" title="The 30-day notice has not gone out yet. It runs daily at 8am.">
                        <AlertTriangle className="h-3.5 w-3.5" /> not yet
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/drivers/${r.driverId}`} className="text-xs font-semibold text-[#3A7BD5] hover:underline">
                      Open the rider
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-gray-50 px-4 py-3 text-xs text-[#5C6E82]">
            Everyone on this list is still receiving jobs. Expiry flags, it does not suspend:
            a person decides, which was the founder&apos;s call on 1 September.
          </p>
        </div>
      )}
    </div>
  );
}
