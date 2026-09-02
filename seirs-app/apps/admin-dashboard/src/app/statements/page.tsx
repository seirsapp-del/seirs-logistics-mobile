'use client';
import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, RotateCcw, Search, ShieldOff, XCircle } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm, useNotify } from '@/components/ConfirmDialog';

/**
 * Every statement SEIRS has issued.
 *
 * WHY it exists. Two statements were sitting in production with no way to
 * enumerate them: the only admin route was issue-by-id, which needs you to
 * already know whose statement you want. Nobody could answer "who is walking
 * around holding a SEIRS statement", which is the question you ask when one
 * turns up somewhere it should not be.
 *
 * hasDocument and expired are separate columns on purpose. They are two
 * different reasons a link fails and support has to tell them apart: a
 * statement issued before the bytes were stored has no document and never
 * will, while an expired one can be reissued in a tap.
 *
 * Revoke kills the download and leaves verification alone. That is not an
 * oversight: the paper somebody already holds must keep checking out, or
 * revoking a misdirected email would retroactively brand a genuine document
 * a forgery. Reissue mints a NEW code and recomputes from today's data, so a
 * refund that landed since shows up and nobody's existing copy is silently
 * overwritten.
 */

const SUBJECT: Record<string, string> = {
  business: 'Business',
  partner:  'Partner store',
  driver:   'Rider',
  customer: 'Customer',
};

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

export default function StatementsPage() {
  const [rows,    setRows]    = useState<any[] | null>(null);
  const [q,       setQ]       = useState('');
  const [type,    setType]    = useState('');
  const [busy,    setBusy]    = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const confirm = useConfirm();
  const notify  = useNotify();

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await adminApi.statements.list(1, type || undefined, q.trim() || undefined);
      setRows(r?.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load statements.');
      setRows([]);
    }
  }, [q, type]);

  useEffect(() => {
    const id = setTimeout(() => { void load(); }, 300);
    return () => clearTimeout(id);
  }, [load]);

  const revoke = async (row: any) => {
    const ok = await confirm({
      title:   'Kill this download link?',
      message: `Anyone holding the link for ${row.code} stops being able to download it. The document already sent stays valid and ${row.code} keeps verifying, because a document somebody is holding must not start reading as a forgery.`,
      confirmLabel: 'Kill the link',
      danger: true,
    });
    if (!ok) return;
    setBusy(row.code);
    try {
      await adminApi.statements.revoke(row.code);
      void notify({ title: 'Link killed', message: 'Verification is untouched.', tone: 'success' });
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not revoke.');
    } finally { setBusy(null); }
  };

  const reissue = async (row: any) => {
    const ok = await confirm({
      title:   'Issue a fresh statement?',
      message: "Same subject and period, recomputed from today's figures, with its own new reference. Anything settled or refunded since will show. The existing copy is not overwritten and keeps verifying.",
      confirmLabel: 'Reissue',
    });
    if (!ok) return;
    setBusy(row.code);
    try {
      const r: any = await adminApi.statements.reissue(row.code);
      void notify({
        title: 'Reissued',
        message: r?.code ? `New reference ${r.code}.` : 'A fresh document has been issued.',
        tone: 'success',
      });
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not reissue.');
    } finally { setBusy(null); }
  };

  return (
    <div className="p-8">
      <PageIntro
        title="Statements issued"
        purpose="Every statement SEIRS has ever put in somebody's hands, and what state its download link is in."
        storageKey="statements"
        help={
          <>
            <p><strong>No document</strong> means the bytes were never stored. Those cannot be downloaded and never will be: reissue to produce a fresh one.</p>
            <p><strong>Expired</strong> means the link aged out. The statement is fine; reissue gives a working link.</p>
            <p><strong>Kill the link</strong> is for a statement emailed to the wrong address. It stops downloads and deliberately leaves verification working, because the copy already sent must keep checking out.</p>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[#0F2B4C]/30" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Reference, name or email"
            className="w-72 rounded-lg border border-[#E5E7EB] py-2 pl-8 pr-3 text-sm"
          />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)}
          className="rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm">
          <option value="">Everyone</option>
          <option value="business">Businesses</option>
          <option value="partner">Partner stores</option>
          <option value="driver">Riders</option>
          <option value="customer">Customers</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
        </div>
      )}

      {rows === null ? (
        <div className="flex items-center gap-2 py-10 text-sm text-[#0F2B4C]/50">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title={q || type ? 'Nothing matches that' : 'No statement has been issued yet'}
          body={q || type
            ? 'Try a different reference or clear the filter.'
            : 'A statement appears here the moment somebody exports one from their app, or support issues one for them.'}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-[#E5E7EB] bg-[#F5F5F0] text-left">
              <tr>
                <th className="px-4 py-2 font-semibold">Reference</th>
                <th className="px-4 py-2 font-semibold">Who</th>
                <th className="px-4 py-2 font-semibold">Period</th>
                <th className="px-4 py-2 font-semibold">Issued</th>
                <th className="px-4 py-2 font-semibold">Download</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-b border-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-[#0F2B4C]">{r.code}</td>
                  <td className="px-4 py-2">
                    <span className="text-[#0F2B4C]">{r.subjectName ?? r.subjectId ?? 'unnamed'}</span>
                    <span className="ml-2 rounded bg-[#0F2B4C]/5 px-1.5 py-0.5 text-[11px] text-[#5C6E82]">
                      {SUBJECT[r.subjectType] ?? r.subjectType}
                    </span>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-[#5C6E82]">
                    {fmt(r.periodFrom)} - {fmt(r.periodTo)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-[#5C6E82]">
                    {fmt(r.createdAt)}
                    {r.issuedBy && <span className="ml-1 text-xs">by {r.issuedBy}</span>}
                  </td>
                  <td className="px-4 py-2">
                    {!r.hasDocument ? (
                      <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600"
                        title="Issued before the document was stored. It cannot be downloaded and never will be.">
                        no document
                      </span>
                    ) : r.revoked ? (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                        link killed
                      </span>
                    ) : r.expired ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        expired
                      </span>
                    ) : (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        live
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      {r.hasDocument && !r.revoked && !r.expired && (
                        <button type="button" disabled={busy === r.code} onClick={() => revoke(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                          <ShieldOff className="h-3.5 w-3.5" /> Kill link
                        </button>
                      )}
                      <button type="button" disabled={busy === r.code} onClick={() => reissue(r)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#DCE3EB] px-2 py-1 text-xs font-semibold text-[#0F2B4C] hover:bg-[#F5F5F0] disabled:opacity-50">
                        <RotateCcw className="h-3.5 w-3.5" /> Reissue
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
