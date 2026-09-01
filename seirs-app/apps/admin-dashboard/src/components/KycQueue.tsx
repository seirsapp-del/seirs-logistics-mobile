'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Car, CheckCircle2, FileText, Loader2, Phone, ShieldCheck, UserPlus, XCircle,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm, useNotify, usePrompt } from '@/components/ConfirmDialog';

/**
 * The queue. One row per rider, whatever they are waiting on.
 *
 * Founder, 2 September 2026: "what you did is create an entire section for
 * something that could have been wired into the drivers kyc queue, and when
 * I told you, your best idea was to stack it in the same page by putting it
 * on top of each other."
 *
 * He was right twice. There were three things a reviewer had to notice about
 * one rider, in three places, and my answer to being told was to put two of
 * them on the same screen rather than in the same row.
 *
 * A rider appears once here. The row says what they are waiting on, and the
 * decisions live on the row. The worst case this fixes is invisible rather
 * than merely annoying: an APPROVED rider who uploads a new licence is not a
 * pending account and has no vehicle change, so before this they appeared in
 * no queue at all.
 *
 * Oldest wait first. Someone in this list cannot earn.
 */

const NEED_LABEL: Record<string, { label: string; Icon: any; tone: string }> = {
  account_approval: { label: 'Account approval', Icon: UserPlus,  tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  documents:        { label: 'Documents',        Icon: FileText,  tone: 'bg-blue-50 text-blue-800 border-blue-200'    },
  vehicle_change:   { label: 'Vehicle change',   Icon: Car,       tone: 'bg-violet-50 text-violet-800 border-violet-200' },
};

const DOCS: { slot: string; label: string; urlKey: string }[] = [
  { slot: 'exterior',       label: 'Outside',   urlKey: 'photoExteriorUrl'  },
  { slot: 'interior',       label: 'Inside',    urlKey: 'photoInteriorUrl'  },
  { slot: 'plate',          label: 'Plate',     urlKey: 'photoPlateUrl'     },
  { slot: 'ownershipProof', label: 'Ownership', urlKey: 'ownershipProofUrl' },
  { slot: 'insuranceCert',  label: 'Insurance', urlKey: 'insuranceCertUrl'  },
];

const isPdf = (u: string) => /\.pdf($|\?|#)/i.test(u);

export function KycQueue({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const [items,  setItems]  = useState<any[] | null>(null);
  const [error,  setError]  = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [faults, setFaults] = useState<Record<string, string[]>>({});
  const confirm = useConfirm();
  const prompt  = usePrompt();
  const notify  = useNotify();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await adminApi.driverDocuments.queue();
      setItems(res?.items ?? []);
      onCountChange?.(res?.count ?? 0);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the queue.');
      setItems([]);
      onCountChange?.(0);
    }
  }, [onCountChange]);

  useEffect(() => { void load(); }, [load]);

  const toggleFault = (rowId: string, slot: string) =>
    setFaults(prev => {
      const cur = prev[rowId] ?? [];
      return { ...prev, [rowId]: cur.includes(slot) ? cur.filter(s => s !== slot) : [...cur, slot] };
    });

  // ── Account decision ──────────────────────────────────────────────────
  const decideAccount = async (row: any, approve: boolean) => {
    if (approve) {
      const ok = await confirm({
        title:   'Approve this rider?',
        message: `${row.name ?? 'They'} can go online and start receiving jobs immediately, and are emailed. Reversible: you can suspend them later.`,
        confirmLabel: 'Approve',
      });
      if (!ok) return;
    }
    let reason: string | undefined;
    if (!approve) {
      const answer = await prompt({
        title:   'Turn down this application?',
        message: 'They are emailed your reason and cannot go online. Reversible from the Rejected tab.',
        label:   'Why (they read this word for word)',
        minLength: 6,
        multiline: true,
        confirmLabel: 'Turn down',
        danger: true,
      });
      if (answer === null) return;
      reason = String(answer).trim();
    }
    setBusyId(row.driverId);
    try {
      if (approve) await adminApi.approveDriver(row.driverId);
      else         await adminApi.rejectDriver(row.driverId, reason);
      void notify({
        title: approve ? 'Rider approved' : 'Application turned down',
        message: 'They have been emailed.',
        tone: 'success',
      });
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save that decision.');
    } finally {
      setBusyId(null);
    }
  };

  // ── Vehicle decision ──────────────────────────────────────────────────
  const decideVehicle = async (row: any, approve: boolean) => {
    const marked = faults[row.driverId] ?? [];
    const named  = DOCS.filter(d => marked.includes(d.slot)).map(d => d.label.toLowerCase());
    let note: string | undefined;

    if (approve) {
      const ok = await confirm({
        title:   'Approve this vehicle change?',
        message: `${row.name ?? 'The rider'} switches to ${row.vehicleChange?.requestedVehicle} straight away and dispatch starts offering jobs sized for it.`,
        confirmLabel: 'Approve',
      });
      if (!ok) return;
    } else {
      const answer = await prompt({
        title: 'Turn down this vehicle change?',
        message: named.length
          ? `They will be told to redo ${named.join(', ')} and to leave the rest alone.`
          : 'No document is ticked, so they are only told it was turned down. Tick the ones that failed if this was about the paperwork.',
        label:   'Anything to add? (optional)',
        helper:  'The rider reads this word for word in their app Messages.',
        multiline: true,
        confirmLabel: 'Turn down',
        danger: true,
      });
      if (answer === null) return;
      note = String(answer).trim() || undefined;
    }
    setBusyId(row.driverId);
    try {
      await adminApi.vehicleChange.resolve(row.userId, approve, {
        note, rejectedItems: approve ? undefined : marked,
      });
      void notify({
        title: approve ? 'Vehicle change approved' : 'Vehicle change turned down',
        message: !approve && named.length
          ? `They have been told to redo ${named.join(', ')}.`
          : 'They have been told in their app Messages.',
        tone: 'success',
      });
      setFaults(p => { const n = { ...p }; delete n[row.driverId]; return n; });
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save that decision.');
    } finally {
      setBusyId(null);
    }
  };

  if (items !== null && items.length === 0 && !error) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="h-5 w-5" />}
        title="Nobody is waiting"
        body="New applications, uploaded documents and vehicle changes all appear here the moment they arrive."
        tone="good"
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
        </div>
      )}

      {items === null ? (
        <div className="flex items-center gap-2 py-10 text-sm text-[#0F2B4C]/50">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the queue…
        </div>
      ) : items.map((row) => {
        const vc     = row.vehicleChange;
        const marked = faults[row.driverId] ?? [];
        const busy   = busyId === row.driverId;
        return (
          <div key={row.driverId} className="rounded-xl border border-[#DCE3EB] bg-white p-5 shadow-sm">

            {/* Who, and what they are waiting on */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/drivers/${row.driverId}`} className="font-semibold text-[#0F2B4C] hover:underline">
                    {row.name ?? 'Unnamed rider'}
                  </Link>
                  {row.accountId && (
                    <span className="rounded bg-[#0F2B4C]/5 px-2 py-0.5 font-mono text-xs text-[#0F2B4C]/70">
                      {row.accountId}
                    </span>
                  )}
                  <span className="text-xs text-[#5C6E82]">
                    {row.accountStatus === 'pending' ? 'new applicant' : `${row.accountStatus} rider`}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(row.needs ?? []).map((n: string) => {
                    const cfg = NEED_LABEL[n];
                    if (!cfg) return null;
                    const extra = n === 'documents' ? ` (${row.docsSubmitted})` : '';
                    return (
                      <span key={n} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${cfg.tone}`}>
                        <cfg.Icon className="h-3 w-3" /> {cfg.label}{extra}
                      </span>
                    );
                  })}
                  {row.docsRejected > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                      {row.docsRejected} rejected
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right text-xs text-[#5C6E82]">
                <div className={`tabular-nums ${row.waitingDays > 7 ? 'font-bold text-red-700' : ''}`}>
                  waiting {row.waitingDays} {row.waitingDays === 1 ? 'day' : 'days'}
                </div>
                {row.phone && <div className="mt-0.5 font-mono">{row.phone}</div>}
              </div>
            </div>

            {/* The vehicle change, in the same row rather than a second list */}
            {vc && (
              <div className="mt-4 rounded-lg border border-[#E8ECF1] bg-[#FAFBFC] p-4">
                <p className="text-sm text-[#5C6E82]">
                  {vc.currentVehicle ?? 'unknown'} <span aria-hidden>&rarr;</span>{' '}
                  <strong className="text-[#0F2B4C]">{vc.requestedVehicle}</strong>
                  {vc.vehiclePlate ? ` · ${vc.vehiclePlate}` : ''}
                  {[vc.make, vc.model, vc.year, vc.color].filter(Boolean).length
                    ? ` · ${[vc.make, vc.model, vc.year, vc.color].filter(Boolean).join(' ')}`
                    : ''}
                </p>

                {vc.ownership === 'third_party' && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Not their vehicle. Owner <strong>{vc.ownerName ?? 'unnamed'}</strong>
                      {vc.ownerPhone ? <> on <span className="font-mono">{vc.ownerPhone}</span></> : null}.
                      Call and confirm they authorised this before approving.
                    </span>
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {DOCS.map(({ slot, label, urlKey }) => {
                    const url = vc[urlKey];
                    const bad = marked.includes(slot);
                    return (
                      <div key={slot} className="space-y-1.5">
                        <div className={`relative aspect-[4/3] overflow-hidden rounded-lg border-2 bg-white ${bad ? 'border-amber-400' : 'border-[#E5E7EB]'}`}>
                          {url ? (
                            <Link href={String(url)} target="_blank" className="block h-full w-full">
                              {isPdf(String(url)) ? (
                                <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[#3A7BD5]">
                                  <FileText className="h-6 w-6" />
                                  <span className="text-[11px] font-semibold">PDF, open it</span>
                                </span>
                              ) : (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={String(url)} alt={label} className="h-full w-full object-cover transition hover:scale-[1.03]" />
                              )}
                            </Link>
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[11px] text-[#0F2B4C]/35">
                              not provided
                            </span>
                          )}
                        </div>
                        <label className={`flex cursor-pointer items-center gap-1.5 text-xs ${bad ? 'font-semibold text-amber-700' : 'text-[#5C6E82]'}`}>
                          <input
                            type="checkbox" checked={bad} disabled={!url || busy}
                            onChange={() => toggleFault(row.driverId, slot)}
                            className="h-3.5 w-3.5 accent-amber-600 disabled:opacity-30"
                          />
                          {label}
                        </label>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => decideVehicle(row, true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F2B4C] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    <ShieldCheck className="h-4 w-4" /> Approve vehicle
                  </button>
                  <button type="button" disabled={busy} onClick={() => decideVehicle(row, false)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE3EB] px-3 py-2 text-sm font-semibold text-[#0F2B4C] disabled:opacity-50">
                    <XCircle className="h-4 w-4" /> Turn down vehicle
                  </button>
                  {vc.ticketId && (
                    <Link href={`/support?ticket=${vc.ticketId}`} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-[#3A7BD5] hover:underline">
                      Open the ticket
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Documents and the account decision */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {row.docsSubmitted > 0 && (
                <Link
                  href={`/drivers/${row.driverId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE3EB] px-3 py-2 text-sm font-semibold text-[#0F2B4C] hover:bg-[#F5F5F0]"
                >
                  <FileText className="h-4 w-4" />
                  Read {row.docsSubmitted} document{row.docsSubmitted === 1 ? '' : 's'}
                </Link>
              )}

              {row.accountStatus === 'pending' && (
                <>
                  <button type="button" disabled={busy} onClick={() => decideAccount(row, true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F7A57] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    <ShieldCheck className="h-4 w-4" /> Approve rider
                  </button>
                  <button type="button" disabled={busy} onClick={() => decideAccount(row, false)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                    <XCircle className="h-4 w-4" /> Turn down rider
                  </button>
                  {row.docsSubmitted === 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" /> nothing uploaded yet
                    </span>
                  )}
                </>
              )}

              <Link href={`/drivers/${row.driverId}`} className="ml-auto text-sm text-[#3A7BD5] hover:underline">
                Open full profile
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
