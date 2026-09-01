'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2 } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { Section } from '@/components/DetailSections';

/**
 * The machine, and everything ever decided about it.
 *
 * WHY. The driver profile covered the person well: identity, SOS, financial,
 * fraud flags, audit trail. The machine got one photo, a class and a plate.
 * Stored on the driver record and rendered nowhere: make, model, year,
 * colour, the ownership papers, the insurance certificate, and the entire
 * third-party owner packet including the owner's ID and their typed consent
 * signature. That last one is the evidence that a rider on a borrowed keke
 * had permission, and it was invisible.
 *
 * The history half answers the founder's question directly: what happens to
 * the rest of their information after you approve. Approval copies the type,
 * plate, make, model, colour, the OUTSIDE photo, the papers and the owner
 * packet onto the driver record, and does not copy the inside photo, the
 * plate close-up or the rider's own reason. Those live only on the change
 * row, and the only screen that rendered one filtered to pending, so the
 * plate close-up, the most identifying image in the set, became unreachable
 * the moment somebody pressed Approve.
 */

const STATUS_CLS: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  pending:  'bg-amber-50 text-amber-800 border-amber-200',
};

const isPdf = (u: string) => /\.pdf($|\?|#)/i.test(u);

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

function Shot({ label, url }: { label: string; url?: string | null }) {
  return (
    <div className="space-y-1">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-[#E5E7EB] bg-[#F5F5F0]">
        {url ? (
          <Link href={url} target="_blank" className="block h-full w-full">
            {isPdf(url) ? (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[#3A7BD5]">
                <FileText className="h-6 w-6" />
                <span className="text-[11px] font-semibold">PDF</span>
              </span>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={url} alt={label} className="h-full w-full object-cover transition hover:scale-[1.03]" />
            )}
          </Link>
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[11px] text-[#0F2B4C]/35">
            not provided
          </span>
        )}
      </div>
      <p className="text-xs text-[#5C6E82]">{label}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-[#0F2B4C]/40">{label}</p>
      <p className="text-sm text-[#0F2B4C]">{value ?? <span className="text-[#0F2B4C]/30">not recorded</span>}</p>
    </div>
  );
}

export function VehicleAndHistory({ driver, driverId }: { driver: any; driverId: string }) {
  const [history, setHistory] = useState<any[] | null>(null);

  useEffect(() => {
    let alive = true;
    adminApi.driverDocuments.vehicleHistory(driverId)
      .then(r => { if (alive) setHistory(r?.items ?? []); })
      .catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [driverId]);

  const d       = driver ?? {};
  const details = d.vehicleDetails ?? {};
  const owned   = d.vehicleOwnership === 'third_party';

  return (
    <>
      <Section
        title="Vehicle on file"
        storageKey="driver-vehicle"
        bare
        summary={[d.vehicleType, d.vehiclePlate].filter(Boolean).join(' · ') || 'nothing recorded'}
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Row label="Class"  value={d.vehicleType} />
          <Row label="Plate"  value={d.vehiclePlate ? <span className="font-mono">{d.vehiclePlate}</span> : null} />
          <Row label="Make"   value={details.make} />
          <Row label="Model"  value={details.model} />
          <Row label="Year"   value={details.year} />
          <Row label="Colour" value={details.color} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Shot label="Vehicle photo"     url={d.vehiclePhotoUrl} />
          <Shot label="Ownership papers"  url={d.ownershipProofUrl} />
          <Shot label="Insurance"         url={d.insuranceCertUrl} />
        </div>

        {/*
          Who owns it. A large share of okada and keke riders do not own the
          machine, and the consent record is the only thing that says a rider
          on somebody else's bike had permission. It was stored and shown
          nowhere.
        */}
        <div className="mt-5 rounded-lg border border-[#E8ECF1] bg-[#FAFBFC] p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/50">
            Who owns it
          </p>
          {owned ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Row label="Owner"        value={d.vehicleOwnerName} />
                <Row label="Phone"        value={d.vehicleOwnerPhone ? <span className="font-mono">{d.vehicleOwnerPhone}</span> : null} />
                <Row label="Relationship" value={d.vehicleOwnerRelationship} />
                <Row label="Consented"    value={fmt(d.vehicleOwnerConsentAt)} />
              </div>
              <p className="mt-3 text-xs text-[#5C6E82]">
                Signed as <strong className="text-[#0F2B4C]">{d.vehicleOwnerSignatureName ?? 'no name recorded'}</strong>.
                A typed full name is a signature under the Evidence Act section 84.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Shot label="Owner consent" url={d.vehicleOwnerConsentUrl} />
                <Shot label="Owner ID"      url={d.vehicleOwnerIdUrl} />
              </div>
            </>
          ) : (
            <p className="text-sm text-[#5C6E82]">
              {d.vehicleOwnerConsentAt || d.vehicleOwnership === 'self'
                ? 'The rider says the vehicle is theirs.'
                : 'Never asked. Every rider registered before 25 August 2026 is in this state, and it is not the same as them saying it is theirs.'}
            </p>
          )}
        </div>
      </Section>

      <Section
        title="Vehicle history"
        storageKey="driver-vehicle-history"
        bare
        defaultOpen={false}
        summary={history === null ? 'loading' : `${history.length} change${history.length === 1 ? '' : 's'}`}
      >
        {history === null ? (
          <div className="flex items-center gap-2 py-4 text-sm text-[#0F2B4C]/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-[#5C6E82]">
            This rider has never submitted a vehicle change. What is on file above came from
            their original application.
          </p>
        ) : (
          <div className="space-y-4">
            {history.map((h) => (
              <div key={h.id} className="rounded-lg border border-[#E8ECF1] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[h.status] ?? ''}`}>
                      {h.status}
                    </span>
                    <span className="text-sm font-semibold text-[#0F2B4C]">
                      {[h.make, h.model, h.year, h.color].filter(Boolean).join(' ') || h.vehicleType}
                    </span>
                    {h.vehiclePlate && <span className="font-mono text-xs text-[#5C6E82]">{h.vehiclePlate}</span>}
                  </div>
                  <span className="text-xs text-[#5C6E82]">
                    submitted {fmt(h.createdAt)}
                    {h.decidedAt && ` · decided ${fmt(h.decidedAt)}`}
                    {h.decidedByName && ` by ${h.decidedByName}`}
                  </span>
                </div>

                {h.reason && (
                  <p className="mt-2 text-sm text-[#5C6E82]">
                    <span className="text-[#0F2B4C]/40">Their reason:</span> {h.reason}
                  </p>
                )}
                {h.status === 'rejected' && (
                  <p className="mt-1 text-sm text-red-700">
                    {h.rejectedItems?.length
                      ? `Turned down over: ${h.rejectedItems.join(', ')}.`
                      : 'Turned down.'}
                    {h.decisionNote ? ` ${h.decisionNote}` : ''}
                  </p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <Shot label="Outside"   url={h.photoExteriorUrl} />
                  <Shot label="Inside"    url={h.photoInteriorUrl} />
                  <Shot label="Plate"     url={h.photoPlateUrl} />
                  <Shot label="Ownership" url={h.ownershipProofUrl} />
                  <Shot label="Insurance" url={h.insuranceCertUrl} />
                </div>

                {h.ownership === 'third_party' && (
                  <p className="mt-3 text-xs text-[#5C6E82]">
                    Owner {h.ownerName ?? 'unnamed'}
                    {h.ownerPhone ? ` on ${h.ownerPhone}` : ''}
                    {h.ownerRelationship ? `, ${h.ownerRelationship}` : ''}
                    {h.ownerSignatureName ? `. Signed as ${h.ownerSignatureName}` : ''}
                    {h.ownerConsentAt ? ` on ${fmt(h.ownerConsentAt)}` : ''}.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
