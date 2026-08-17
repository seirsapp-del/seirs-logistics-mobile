'use client';
/**
 * One run, in full.
 *
 * The deliveries list could only ever show a summary row, and there was
 * no detail route at all: a multi-package booking was a single line with
 * a price, and support had no way to answer "which of my packages is
 * late" (founder 2026-08-16). The list now expands inline for a quick
 * look; this page is the full record behind it.
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Navigation, Package, User, Bike, Store } from 'lucide-react';
import { adminApi } from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-amber-100 text-amber-700',
  assigned:   'bg-blue-100 text-blue-700',
  picked_up:  'bg-indigo-100 text-indigo-700',
  in_transit: 'bg-indigo-100 text-indigo-700',
  delivered:  'bg-emerald-100 text-emerald-700',
  failed:     'bg-red-100 text-red-700',
  cancelled:  'bg-[#0F2B4C]/5 text-[#0F2B4C]/50',
};

const naira = (v: any) => `₦${Math.round(Number(v ?? 0)).toLocaleString()}`;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-[#F5F5F0] last:border-0">
      <span className="text-xs text-[#0F2B4C]/50">{label}</span>
      <span className="text-xs font-medium text-[#0F2B4C] text-right">{value}</span>
    </div>
  );
}

export default function DeliveryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD]         = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    adminApi.delivery(id)
      .then(setD)
      .catch((e: any) => setError(e?.message ?? 'Could not load this run'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-sm text-[#0F2B4C]/40">Loading…</div>;
  if (error || !d) {
    return (
      <div className="p-8">
        <button onClick={() => router.back()} className="text-sm text-[#3A7BD5] hover:underline">← Back</button>
        <div className="mt-4 text-sm text-red-600">{error ?? 'Run not found'}</div>
      </div>
    );
  }

  const stops: any[] = d.stops ?? [];

  return (
    <div className="p-6 max-w-5xl">
      <Link href="/deliveries" className="inline-flex items-center gap-1 text-sm text-[#3A7BD5] hover:underline">
        <ArrowLeft size={14} /> All deliveries
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-xl font-bold text-[#0F2B4C]">{d.trackingCode}</h1>
          <p className="mt-1 text-sm text-[#0F2B4C]/50">
            {stops.length > 1 ? `${stops.length} packages in one run` : 'Single package'}
            {d.vehicleType ? ` · ${d.vehicleType}` : ''}
            {d.createdAt ? ` · booked ${new Date(d.createdAt).toLocaleString()}` : ''}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[d.status] ?? 'bg-[#0F2B4C]/5'}`}>
          {String(d.status ?? '').replace('_', ' ')}
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-[#E5E7EB] bg-white p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/40">
            <User size={12} /> Sender
          </h2>
          {d.customer?.id ? (
            <Link href={`/users/${d.customer.id}`} className="text-sm font-semibold text-[#3A7BD5] hover:underline">
              {d.customer.name}
            </Link>
          ) : <span className="text-sm">-</span>}
          <Row label="Email"   value={d.customer?.email} />
          <Row label="Phone"   value={d.customer?.phone} />
          <Row label="SEIRS ID" value={d.customer?.accountId} />
        </section>

        <section className="rounded-xl border border-[#E5E7EB] bg-white p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/40">
            <Bike size={12} /> Driver
          </h2>
          {d.driver
            ? <>
                <div className="text-sm font-semibold text-[#0F2B4C]">{d.driver.user?.name ?? d.driver.id?.slice(0, 8)}</div>
                <Row label="Phone"   value={d.driver.user?.phone} />
                <Row label="Vehicle" value={d.driver.vehicleType} />
              </>
            : <div className="text-sm text-[#0F2B4C]/40">Not assigned yet</div>}
        </section>

        <section className="rounded-xl border border-[#E5E7EB] bg-white p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/40">
            <MapPin size={12} /> Route
          </h2>
          <div className="flex items-start gap-1.5 text-xs text-[#0F2B4C]/70">
            <MapPin size={11} className="mt-0.5 shrink-0 text-[#3A7BD5]" />
            <span>{d.pickupAddress}</span>
          </div>
          {d.dropoffAddress && (
            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-[#0F2B4C]/70">
              <Navigation size={11} className="mt-0.5 shrink-0 text-emerald-500" />
              <span>{d.dropoffAddress}</span>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#E5E7EB] bg-white p-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/40">Money</h2>
          <Row label="Fare"                    value={naira(d.price)} />
          <Row label="Counter handling"        value={Number(d.partnerHandlingNgn ?? 0) > 0 ? naira(d.partnerHandlingNgn) : null} />
          <Row label="Escrow held"             value={d.paymentHeldAt ? new Date(d.paymentHeldAt).toLocaleString() : 'Not held'} />
          <Row label="Cancellation fee"        value={d.cancellationFeeNgn ? naira(d.cancellationFeeNgn) : null} />
        </section>
      </div>

      {stops.length > 0 && (
        <section className="mt-4 rounded-xl border border-[#E5E7EB] bg-white overflow-hidden">
          <h2 className="flex items-center gap-1.5 border-b border-[#E5E7EB] bg-[#F5F5F0] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/40">
            <Package size={12} /> Packages ({stops.length})
          </h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-[#F5F5F0]">
              {stops.map((st) => (
                <tr key={st.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-mono text-[11px] font-bold text-[#0F2B4C]">
                      {st.packageTrackingCode ?? `Stop ${st.sequenceOrder}`}
                    </div>
                    {st.packageDescription && (
                      <div className="mt-0.5 text-xs text-[#0F2B4C]/60">{st.packageDescription}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#0F2B4C]/70">
                    {[st.receiverFirstName, st.receiverLastName].filter(Boolean).join(' ') || st.recipientName || '-'}
                    {st.recipientPhone && <div className="text-[#0F2B4C]/40">{st.recipientPhone}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#0F2B4C]/70 max-w-xs">
                    {st.destinationStoreName ? (
                      <span className="inline-flex items-center gap-1">
                        <Store size={11} className="text-[#3A7BD5]" /> {st.destinationStoreName}
                      </span>
                    ) : st.address}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${STATUS_COLORS[st.status] ?? 'bg-[#0F2B4C]/5'}`}>
                      {String(st.status ?? 'pending').replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    {st.packagePriceNgn ? <div className="font-semibold text-[#0F2B4C]">{naira(st.packagePriceNgn)}</div> : null}
                    {st.weightKg ? <div className="text-[#0F2B4C]/40">{Number(st.weightKg)}kg</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
