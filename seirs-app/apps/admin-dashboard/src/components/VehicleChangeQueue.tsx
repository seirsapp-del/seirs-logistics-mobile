'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Car, Loader2, Phone, ShieldCheck, XCircle } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm, useNotify, usePrompt } from '@/components/ConfirmDialog';

/**
 * Riders waiting on a decision about the machine, as a section of the KYC
 * queue rather than a page of its own.
 *
 * It WAS its own page for about two hours. The founder's objection landed
 * immediately and was right: "we already have a driver kyc queue". Two
 * queues both asking a reviewer to look at a rider's documents is the same
 * mistake the driver app had, where KYC and My Vehicle were separate screens
 * asking for three of the same documents. One reviewer, one place.
 *
 * The split that remains is real and is only a heading: the documents above
 * are about the person, this is about the machine, and the second one repeats
 * whenever they change vehicle.
 *
 * Photos render as photos. The first version listed them as five text links,
 * so deciding meant opening five tabs and coming back, and a reviewer with
 * forty of these will not do that forty times.
 */

const ORPHAN_HELP =
  'No support ticket was created for this request, so it appears nowhere else in the dashboard.';

/** Keyed exactly as the driver app names its upload slots and the backend stores them. */
const DOCS: { slot: string; label: string; urlKey: string }[] = [
  { slot: 'exterior',       label: 'Outside',   urlKey: 'photoExteriorUrl'  },
  { slot: 'interior',       label: 'Inside',    urlKey: 'photoInteriorUrl'  },
  { slot: 'plate',          label: 'Plate',     urlKey: 'photoPlateUrl'     },
  { slot: 'ownershipProof', label: 'Ownership', urlKey: 'ownershipProofUrl' },
  { slot: 'insuranceCert',  label: 'Insurance', urlKey: 'insuranceCertUrl'  },
];

const isPdf = (url: string) => /\.pdf($|\?|#)/i.test(url);

export function VehicleChangeQueue({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const [items,  setItems]  = useState<any[] | null>(null);
  const [error,  setError]  = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Which documents the reviewer has marked as the problem, per request. */
  const [faults, setFaults] = useState<Record<string, string[]>>({});
  const confirm = useConfirm();
  const prompt  = usePrompt();
  const notify  = useNotify();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await adminApi.vehicleChange.pending();
      const list = res?.items ?? [];
      setItems(list);
      onCountChange?.(list.length);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load vehicle changes.');
      setItems([]);
      onCountChange?.(0);
    }
  }, [onCountChange]);

  useEffect(() => { void load(); }, [load]);

  const toggleFault = (rowId: string, slot: string) =>
    setFaults(prev => {
      const cur = prev[rowId] ?? [];
      return {
        ...prev,
        [rowId]: cur.includes(slot) ? cur.filter(s => s !== slot) : [...cur, slot],
      };
    });

  const decide = async (row: any, approve: boolean) => {
    const marked = faults[row.id] ?? [];
    const named  = DOCS.filter(d => marked.includes(d.slot)).map(d => d.label.toLowerCase());
    let note: string | undefined;

    if (approve) {
      const ok = await confirm({
        title:   'Approve this vehicle change?',
        message: `${row.driverName ?? 'The rider'} switches to ${row.requestedVehicle} straight away, and dispatch starts offering them jobs sized for it. They are told in their app Messages, and it is recorded in the audit log.`,
        confirmLabel: 'Approve',
      });
      if (!ok) return;
    } else {
      const answer = await prompt({
        title: 'Turn down this vehicle change?',
        message: named.length
          ? `The rider will be told to redo ${named.join(', ')} and to leave the rest alone.`
          : 'You have not marked any document as the problem, so the rider is only told the request was turned down. Tick the documents that failed before turning down if this was about the paperwork.',
        label:        'Anything to add? (optional)',
        placeholder:  'Plate in the photo does not match the papers',
        helper:       'The rider reads this word for word in their app Messages.',
        confirmLabel: 'Turn down',
        multiline: true,
        danger: true,
      });
      if (answer === null) return;
      note = String(answer).trim() || undefined;
    }

    if (!row.userId) {
      setError('This request has no linked user account, so it cannot be resolved here.');
      return;
    }
    setBusyId(row.id);
    try {
      await adminApi.vehicleChange.resolve(row.userId, approve, {
        note,
        rejectedItems: approve ? undefined : marked,
      });
      void notify({
        title:   approve ? 'Vehicle change approved' : 'Vehicle change turned down',
        message: !approve && named.length
          ? `The rider has been told to redo ${named.join(', ')}.`
          : 'The rider has been told in their app Messages.',
        tone: 'success',
      });
      setFaults(prev => { const next = { ...prev }; delete next[row.id]; return next; });
      await load();
    } catch (e: any) {
      setError(`Could not save that decision: ${e?.message ?? 'unknown error'}`);
    } finally {
      setBusyId(null);
    }
  };

  if (items !== null && items.length === 0 && !error) {
    return (
      <EmptyState
        icon={<Car className="h-5 w-5" />}
        title="No vehicle changes waiting"
        body="Riders who buy or swap a vehicle appear here. Their identity documents are not re-checked, only the proof about the machine."
        tone="good"
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {items === null ? (
        <div className="flex items-center gap-2 py-10 text-sm text-[#0F2B4C]/50">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading vehicle changes…
        </div>
      ) : (
        items.map((row) => {
          const marked = faults[row.id] ?? [];
          return (
            <div key={row.id} className="rounded-xl border border-[#DCE3EB] bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    {/* The rider's own record, not the customer page. */}
                    <Link
                      href={`/drivers/${row.driverId}`}
                      className="font-semibold text-[#0F2B4C] hover:underline"
                    >
                      {row.driverName ?? 'Unnamed rider'}
                    </Link>
                    {row.accountId && (
                      <span className="rounded bg-[#0F2B4C]/5 px-2 py-0.5 font-mono text-xs text-[#0F2B4C]/70">
                        {row.accountId}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[#5C6E82]">
                    {row.currentVehicle ?? 'unknown'} <span aria-hidden>&rarr;</span>{' '}
                    <strong className="text-[#0F2B4C]">{row.requestedVehicle}</strong>
                    {row.vehiclePlate ? ` · ${row.vehiclePlate}` : ''}
                    {[row.make, row.model, row.year, row.color].filter(Boolean).length
                      ? ` · ${[row.make, row.model, row.year, row.color].filter(Boolean).join(' ')}`
                      : ''}
                  </p>
                </div>
                <div className="text-right text-xs text-[#5C6E82]">
                  <div className="tabular-nums">
                    waiting {row.waitingDays} {row.waitingDays === 1 ? 'day' : 'days'}
                  </div>
                  {row.orphaned && (
                    <div className="mt-1 flex items-center gap-1 text-amber-700" title={ORPHAN_HELP}>
                      <AlertTriangle className="h-3.5 w-3.5" /> no support ticket
                    </div>
                  )}
                </div>
              </div>

              {row.ownership === 'third_party' && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Not the rider&apos;s vehicle. Owner <strong>{row.ownerName ?? 'unnamed'}</strong>
                    {row.ownerPhone ? <> on <span className="font-mono">{row.ownerPhone}</span></> : null}.
                    Call and confirm they authorised this before approving.
                  </span>
                </div>
              )}

              {/*
                The documents, as documents. Click one to open it full size;
                tick it if it is the problem. Both actions sit on the thing
                being judged, so a reviewer decides from this card without
                opening five tabs and trying to remember which was which.
              */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {DOCS.map(({ slot, label, urlKey }) => {
                  const url = row[urlKey];
                  const bad = marked.includes(slot);
                  return (
                    <div key={slot} className="space-y-1.5">
                      <div
                        className={`relative aspect-[4/3] overflow-hidden rounded-lg border-2 bg-[#F5F5F0] ${
                          bad ? 'border-amber-400' : 'border-[#E5E7EB]'
                        }`}
                      >
                        {url ? (
                          <Link href={String(url)} target="_blank" className="block h-full w-full">
                            {isPdf(String(url)) ? (
                              <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[#3A7BD5]">
                                <ShieldCheck className="h-6 w-6" />
                                <span className="text-[11px] font-semibold">PDF, open it</span>
                              </span>
                            ) : (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={String(url)}
                                alt={label}
                                className="h-full w-full object-cover transition hover:scale-[1.03]"
                              />
                            )}
                          </Link>
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[11px] text-[#0F2B4C]/35">
                            not provided
                          </span>
                        )}
                      </div>
                      <label
                        className={`flex cursor-pointer items-center gap-1.5 text-xs ${
                          bad ? 'font-semibold text-amber-700' : 'text-[#5C6E82]'
                        }`}
                        title={url ? 'Tick if this document is the problem' : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={bad}
                          disabled={!url || busyId === row.id}
                          onChange={() => toggleFault(row.id, slot)}
                          className="h-3.5 w-3.5 accent-amber-600 disabled:opacity-30"
                        />
                        {label}
                      </label>
                    </div>
                  );
                })}
              </div>

              {marked.length > 0 && (
                <p className="mt-3 text-xs text-amber-700">
                  Turning down will tell the rider to redo{' '}
                  {DOCS.filter(d => marked.includes(d.slot)).map(d => d.label.toLowerCase()).join(', ')}
                  , and to leave everything else as it is.
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => decide(row, true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F2B4C] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" /> Approve
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => decide(row, false)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE3EB] px-3 py-2 text-sm font-semibold text-[#0F2B4C] disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" /> Turn down
                </button>
                <Link
                  href={`/drivers/${row.driverId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-[#3A7BD5] hover:underline"
                >
                  Open the rider
                </Link>
                {row.ticketId && (
                  <Link
                    href={`/support?ticket=${row.ticketId}`}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-[#3A7BD5] hover:underline"
                  >
                    Open the ticket
                  </Link>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
