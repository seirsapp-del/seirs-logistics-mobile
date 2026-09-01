'use client';

/**
 * What somebody sees after following the link printed on a statement.
 *
 * The audience is a bank officer, a tax officer or an accountant holding
 * a sheet of paper, with no SEIRS account and no reason to make one. So
 * the page answers one question first, in one line, and only then shows
 * the figures to compare against the paper.
 *
 * It deliberately shows nothing about the business beyond what is
 * already printed on the document in the reader's hand: a name, a
 * period, two totals and a line count. Whoever holds the code should
 * learn nothing new from this page, only confirmation.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { naira } from '@/lib/money';
import { ShieldCheck, ShieldAlert, Loader2, RotateCw } from 'lucide-react';

// See the note in find-a-partner: NEXT_PUBLIC_API_BASE_URL is canonical,
// NEXT_PUBLIC_API_URL kept as a fallback for existing Vercel values.
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'https://seirs-logistics-mobile-production.up.railway.app/api/v1';

interface VerifyDTO {
  valid:            boolean;
  code?:            string;
  issuedTo?:        string;
  subjectType?:     string;
  periodFrom?:      string;
  periodTo?:        string;
  totalPaidNgn?:    number;
  totalPendingNgn?: number;
  lineCount?:       number;
  issuedAt?:        string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Matches the PDF's own date format exactly, month array and all.
 *
 * The document is rendered by pdfkit on the server and this page by the
 * browser, and the reader is holding them side by side. If one said
 * "01 Sept 2026" and the other "01 Sep 2026" the check would look like
 * it had failed. toLocaleString cannot be used here for the same reason
 * it is not used there: en-GB renders September with four letters and
 * the result moves with the runtime's ICU build.
 */
const dmy = (d?: string) => {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${String(x.getDate()).padStart(2, '0')} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
};

const SUBJECT_LABEL: Record<string, string> = {
  business: 'Business delivery spend',
  partner:  'Partner counter earnings',
  driver:   'Driver earnings',
};

export function VerifyView() {
  const { code } = useParams<{ code: string }>();
  const [data, setData]       = useState<VerifyDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const r = await fetch(`${API_BASE}/verify/${encodeURIComponent(code)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('lookup failed');
      setData(await r.json());
    } catch {
      // A network failure is NOT "this document is fake". Saying so
      // would be the same error as the 404 this page exists to fix,
      // just with a nicer typeface, so it offers a retry instead.
      setFailed(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => { load(); }, [load]);

  const clean = decodeURIComponent(String(code ?? '')).toUpperCase();

  if (loading) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-2xl bg-white p-12 text-center text-slate-500 shadow-sm">
          <Loader2 className="mx-auto mb-3 animate-spin text-slate-400" />
          Checking this statement against our records.
        </div>
      </main>
    );
  }

  if (failed) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
          <RotateCw className="mx-auto mb-3 text-slate-400" />
          <h1 className="mb-1 text-lg font-bold text-slate-900">We could not complete the check</h1>
          <p className="mb-1 text-sm text-slate-600">
            This does not mean the statement is wrong. We could not reach our records just now.
          </p>
          <p className="mb-4 text-sm text-slate-600">
            Reference <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{clean}</span>
          </p>
          <button
            onClick={load}
            className="inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  const ok = data?.valid === true;

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className={`px-6 py-7 text-center ${ok ? 'bg-emerald-50' : 'bg-red-50'}`}>
          {ok
            ? <ShieldCheck className="mx-auto mb-2 text-emerald-600" size={34} />
            : <ShieldAlert className="mx-auto mb-2 text-red-500" size={34} />}
          <h1 className={`text-lg font-bold ${ok ? 'text-emerald-900' : 'text-red-900'}`}>
            {ok ? 'This statement was issued by SEIRS' : 'No statement matches this code'}
          </h1>
          <p className={`mt-1 text-sm ${ok ? 'text-emerald-800' : 'text-red-800'}`}>
            {ok
              ? 'Compare the figures below with the document you are holding.'
              : 'We have no record of a statement with this reference. Check the code was typed correctly before treating the document as unreliable.'}
          </p>
          <p className="mt-3 font-mono text-xs text-slate-500">{clean}</p>
        </div>

        {ok && (
          <div className="px-6 py-5">
            <Row label="Issued to"    value={data?.issuedTo ?? ''} />
            <Row label="Statement"    value={SUBJECT_LABEL[data?.subjectType ?? ''] ?? 'Statement'} />
            <Row label="Period"       value={`${dmy(data?.periodFrom)} to ${dmy(data?.periodTo)}`} />
            <Row label="Paid in period" value={naira(data?.totalPaidNgn ?? 0)} strong />
            {/* Only shown when there is one. A business statement carries
                settled charges only, so a zero here would read as "nothing
                outstanding" rather than "not part of this document". */}
            {(data?.totalPendingNgn ?? 0) > 0 && (
              <Row label="Not yet paid" value={naira(data?.totalPendingNgn ?? 0)} />
            )}
            <Row label="Entries"      value={String(data?.lineCount ?? 0)} />
            <Row label="Issued"       value={dmy(data?.issuedAt)} />
          </div>
        )}
      </div>

      <p className="mt-5 px-1 text-xs leading-relaxed text-slate-500">
        {ok
          ? 'If any figure above differs from the document in front of you, the document has been altered. These are the figures SEIRS issued.'
          : 'A statement reference looks like STM- followed by eight characters. It is printed at the foot of the document and inside the QR code.'}
      </p>

      <p className="mt-4 px-1 text-xs text-slate-400">
        <Link href="/contact" className="underline hover:text-slate-600">Contact SEIRS</Link>
        {' '}if you need to confirm anything further about this document.
      </p>
    </main>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-slate-100 py-3 last:border-b-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-right text-sm ${strong ? 'font-bold text-slate-900' : 'font-medium text-slate-800'}`}>
        {value}
      </span>
    </div>
  );
}
