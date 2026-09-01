'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Car, Loader2, Phone, ShieldCheck, XCircle } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm, useNotify } from '@/components/ConfirmDialog';

/**
 * The vehicle change queue.
 *
 * WHY this page exists. Submitting a vehicle change writes a
 * driver_vehicle_changes row and then TRIES to open a support ticket so an
 * admin sees it. That ticket creation sits in a catch that only warns. When it
 * fails, the row is real, the rider is told "our team has it", and nothing
 * anywhere surfaces the request: there was a resolve endpoint but no way to
 * list one, so the only route in was the ticket that may not exist.
 *
 * A rider stuck here keeps being offered jobs sized for the vehicle they no
 * longer have, which is a pricing and a safety problem, not just a wait.
 *
 * Rows the ticket never reached are marked. Those are the ones this page was
 * built for.
 */

const ORPHAN_HELP =
  'No support ticket was created for this request, so it appears nowhere else in the dashboard.';

export default function VehicleChangesPage() {
  const [items,   setItems]   = useState<any[] | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [busyId,  setBusyId]  = useState<string | null>(null);
  const confirm = useConfirm();
  const notify  = useNotify();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await adminApi.vehicleChange.pending();
      setItems(res?.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the queue.');
      setItems([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decide = async (row: any, approve: boolean) => {
    const ok = await confirm({
      title: approve ? 'Approve this vehicle change?' : 'Turn down this vehicle change?',
      message: approve
        ? `${row.driverName ?? 'The rider'} switches to ${row.requestedVehicle} straight away, and dispatch starts offering them jobs sized for it. They are told in their app Messages, and it is recorded in the audit log.`
        : 'The new vehicle details are discarded and the rider keeps the vehicle already on file. They are told in their app Messages, and can apply again.',
      confirmLabel: approve ? 'Approve' : 'Turn down',
      danger: !approve,
    });
    if (!ok) return;
    if (!row.userId) {
      setError('This request has no linked user account, so it cannot be resolved here.');
      return;
    }
    setBusyId(row.id);
    try {
      await adminApi.vehicleChange.resolve(row.userId, approve);
      void notify({
        title:   approve ? 'Vehicle change approved' : 'Vehicle change turned down',
        message: 'The rider has been told in their app Messages.',
        tone:    'success',
      });
      await load();
    } catch (e: any) {
      setError(`Could not save that decision: ${e?.message ?? 'unknown error'}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageIntro
        title="Vehicle changes"
        purpose="Riders who have bought or swapped a vehicle and are waiting on a decision. Oldest first: the rider who has waited longest is the one being failed hardest. Identity documents are not re-checked here, only the proof about the machine."
      />

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {items === null ? (
        <div className="flex items-center gap-2 py-16 text-sm text-[#0F2B4C]/50">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the queue…
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Car className="h-5 w-5" />}
          title="Nothing waiting"
          body="Every vehicle change has been decided. New requests appear here the moment a rider submits one."
          tone="good"
        />
      ) : (
        <div className="space-y-4">
          {items.map((row) => (
            <div key={row.id} className="rounded-xl border border-[#DCE3EB] bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#0F2B4C]">{row.driverName ?? 'Unnamed rider'}</span>
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

              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {[
                  ['Outside',   row.photoExteriorUrl],
                  ['Inside',    row.photoInteriorUrl],
                  ['Plate',     row.photoPlateUrl],
                  ['Ownership', row.ownershipProofUrl],
                  ['Insurance', row.insuranceCertUrl],
                ].map(([label, url]) => (
                  <span key={String(label)}>
                    {url ? (
                      <Link href={String(url)} target="_blank" className="text-[#3A7BD5] underline underline-offset-2">
                        {label}
                      </Link>
                    ) : (
                      <span className="text-[#0F2B4C]/35">{label} missing</span>
                    )}
                  </span>
                ))}
              </div>

              <div className="mt-4 flex gap-2">
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
                {row.ticketId && (
                  <Link
                    href={`/support?ticket=${row.ticketId}`}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-[#3A7BD5]"
                  >
                    Open the ticket
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
