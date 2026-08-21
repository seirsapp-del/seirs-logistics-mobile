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
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, MapPin, Navigation, Package, User, Bike, Store, Receipt, AlertTriangle } from 'lucide-react';
import { adminApi } from '@/lib/api';

/* Leaflet reaches for `window` the moment it is imported, so the map can
   only ever load in the browser. */
const DeliveryMap = dynamic(() => import('@/components/DeliveryMap'), {
  ssr: false,
  loading: () => <div className="h-[320px] animate-pulse rounded-[10px] bg-[#F5F5F0]" />,
});

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
  const [route, setRoute]           = useState<any>(null);
  const [acBusy,  setAcBusy]  = useState(false);
  const [acNote,  setAcNote]  = useState('');
  const [acQuote, setAcQuote] = useState('');
  const [acError, setAcError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  /* Support decides. Approving only unlocks payment: the drop-off
     moves when the sender pays, from the payments webhook. */
  const decideAddressChange = async (approve: boolean) => {
    setAcBusy(true);
    setAcError(null);
    try {
      const override = Number(acQuote);
      await adminApi.decideAddressChange(String(id), {
        approve,
        note: acNote.trim() || undefined,
        overrideQuoteNgn:
          approve && Number.isFinite(override) && acQuote.trim() !== ''
            ? override
            : undefined,
      });
      const fresh = await adminApi.delivery(String(id));
      setD(fresh);
      setAcNote('');
      setAcQuote('');
    } catch (e: unknown) {
      setAcError(e instanceof Error ? e.message : 'Could not save that decision.');
    } finally {
      setAcBusy(false);
    }
  };


  useEffect(() => {
    if (!id) return;
    adminApi.delivery(id)
      .then(setD)
      .catch((e: any) => setError(e?.message ?? 'Could not load this run'))
      .finally(() => setLoading(false));
  }, [id]);

  /**
   * The map follows a live run on its own rather than behind a refresh
   * button: tiles are free and the driver position comes from pings SEIRS
   * already collects, so a look costs nothing. Our own API is not free
   * though, which is why the endpoint returns `live` and polling stops the
   * moment the run is over.
   */
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const r = await adminApi.deliveryRoute(id);
        if (cancelled) return;
        setRoute(r);
        setRouteError(null);
        if (r?.live) timer = setTimeout(tick, 15_000);
      } catch (e: any) {
        if (!cancelled) setRouteError(e?.message ?? 'Could not load the route');
      }
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
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

      {d.addressChangeStatus && (
        <div className="mt-4 rounded-xl border border-[#3A7BD5]/30 bg-[#3A7BD5]/5 p-4">
          <div className="flex items-center gap-2 text-[#3A7BD5]">
            <MapPin size={16} />
            <span className="text-sm font-bold uppercase tracking-wide">
              Address change {d.addressChangeStatus}
            </span>
          </div>

          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-[#0F2B4C]/40">Requested address</div>
              <div className="font-medium text-[#0F2B4C]">{d.addressChangeNewAddress ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-[#0F2B4C]/40">
                Re-quote from the rider&apos;s position
              </div>
              <div className="font-medium text-[#0F2B4C]">
                {d.addressChangeQuoteNgn != null
                  ? `\u20a6${Number(d.addressChangeQuoteNgn).toLocaleString()}`
                  : '-'}
                {d.addressChangeQuoteKm != null
                  ? ` \u00b7 ${Number(d.addressChangeQuoteKm).toFixed(1)} km by road`
                  : ''}
              </div>
            </div>
          </div>

          {d.addressChangeDecisionNote && (
            <div className="mt-2 text-xs text-[#0F2B4C]/60">
              Note: {d.addressChangeDecisionNote}
            </div>
          )}

          {d.addressChangeStatus === 'approved' && !d.addressChangePaidAt && (
            <div className="mt-3 rounded-lg border border-[#D97706]/30 bg-[#D97706]/5 px-3 py-2 text-xs text-[#92400E]">
              Approved and waiting for the sender to pay. The drop-off does not
              move until the money lands.
            </div>
          )}

          {d.addressChangeStatus === 'applied' && (
            <div className="mt-3 rounded-lg border border-[#16A34A]/30 bg-[#16A34A]/5 px-3 py-2 text-xs text-[#166534]">
              Paid and applied. The rider has been told the new address.
            </div>
          )}

          {d.addressChangeStatus === 'pending' && (
            <div className="mt-3 border-t border-[#3A7BD5]/20 pt-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs">
                  <div className="mb-1 font-semibold text-[#0F2B4C]/60">
                    Correct the quote (optional)
                  </div>
                  <input
                    value={acQuote}
                    onChange={(e) => setAcQuote(e.target.value)}
                    placeholder={
                      d.addressChangeQuoteNgn != null
                        ? String(Math.round(Number(d.addressChangeQuoteNgn)))
                        : 'Naira'
                    }
                    className="w-full rounded-lg border border-[#0F2B4C]/15 px-3 py-2 text-sm outline-none focus:border-[#3A7BD5]"
                  />
                </label>
                <label className="text-xs">
                  <div className="mb-1 font-semibold text-[#0F2B4C]/60">
                    Note to the sender
                  </div>
                  <input
                    value={acNote}
                    onChange={(e) => setAcNote(e.target.value)}
                    placeholder="Shown to them if you reject"
                    className="w-full rounded-lg border border-[#0F2B4C]/15 px-3 py-2 text-sm outline-none focus:border-[#3A7BD5]"
                  />
                </label>
              </div>

              {acError && (
                <div className="mt-2 rounded-lg border border-[#DC2626]/30 bg-[#DC2626]/5 px-3 py-2 text-xs text-[#DC2626]">
                  {acError}
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => void decideAddressChange(true)}
                  disabled={acBusy}
                  className="rounded-lg bg-[#16A34A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#15803D] disabled:opacity-50"
                >
                  {acBusy ? 'Saving...' : 'Approve'}
                </button>
                <button
                  onClick={() => void decideAddressChange(false)}
                  disabled={acBusy}
                  className="rounded-lg border border-[#DC2626]/40 px-4 py-2 text-sm font-semibold text-[#DC2626] hover:bg-[#DC2626]/5 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {d.disputedAt && (
        <div className="mt-4 rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/5 p-4">
          <div className="flex items-center gap-2 text-[#DC2626]">
            <AlertTriangle size={16} />
            <span className="text-sm font-bold uppercase tracking-wide">
              Rider reported a problem
            </span>
          </div>
          <p className="mt-2 text-sm text-[#0F2B4C]">
            {({
              mismatch:   'Package does not match the description',
              overweight: 'Heavier than declared',
              absent:     'Sender not present or wrong address',
              unsafe:     'Unsafe or refused item',
            } as Record<string, string>)[d.disputeReason ?? ''] ?? d.disputeReason ?? 'Unspecified'}
          </p>
          <p className="mt-1 text-xs text-[#0F2B4C]/50">
            Reported {new Date(d.disputedAt).toLocaleString()}
          </p>
          {d.disputePhotoUrl && (
            <a
              href={d.disputePhotoUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block"
            >
              {/* The rider's photo of what they were actually handed.
                  Compare it against the sender's own booking photos below. */}
              <img
                src={d.disputePhotoUrl}
                alt="Rider's photo of the package"
                className="max-h-48 rounded-lg border border-[#DC2626]/30"
              />
            </a>
          )}
        </div>
      )}

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

          {/* Who actually takes it at the door. The sender names a receiver
              at booking; support needs that number as much as the driver
              does when a handoff goes wrong. */}
          {(d.receiverFirstName || d.receiverPhone) && (
            <div className="mt-3 border-t border-[#E5E7EB] pt-3">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/40">
                Receiver
              </div>
              <Row
                label="Name"
                value={[d.receiverFirstName, d.receiverLastName].filter(Boolean).join(' ') || '-'}
              />
              <Row label="Phone" value={d.receiverPhone} />
            </div>
          )}
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
                {/* Where the rider was when the job was assigned, recorded
                    before anyone had a reason to argue about it. A claim of
                    "I rode 15km to the pickup" can be checked against this
                    instead of taken on trust. */}
                {d.driverAcceptedDistanceKm != null && (
                  <Row
                    label="Distance at accept"
                    value={`${Number(d.driverAcceptedDistanceKm).toFixed(1)} km from pickup`}
                  />
                )}
                {d.driverAcceptedLat != null && d.driverAcceptedLng != null && (
                  <a
                    className="mt-1 inline-block text-xs font-semibold text-[#3A7BD5] hover:underline"
                    href={`https://www.google.com/maps?q=${d.driverAcceptedLat},${d.driverAcceptedLng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Where the rider accepted from
                  </a>
                )}
              </>
            : <div className="text-sm text-[#0F2B4C]/40">Not assigned yet</div>}
        </section>

        <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 md:col-span-2">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/40">
            <MapPin size={12} /> Route
            {route?.live && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                following live
              </span>
            )}
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

          <div className="mt-3">
            {routeError ? (
              <div className="rounded-[10px] bg-[#F5F5F0] p-4 text-xs text-red-600">{routeError}</div>
            ) : !route ? (
              <div className="h-[320px] animate-pulse rounded-[10px] bg-[#F5F5F0]" />
            ) : route.points?.length ? (
              <DeliveryMap points={route.points} trail={route.trail ?? []} />
            ) : (
              /* Addresses are typed, coordinates are geocoded, and an old
                 or hand-entered run can have the first without the second.
                 Say so plainly instead of showing an empty map. */
              <div className="rounded-[10px] bg-[#F5F5F0] p-4 text-xs text-[#0F2B4C]/50">
                No coordinates were recorded for this run, so there is nothing to plot.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-[#E5E7EB] bg-white p-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/40">Money</h2>
          <Row label="Fare"                    value={naira(d.price)} />
          <Row label="Counter handling"        value={Number(d.partnerHandlingNgn ?? 0) > 0 ? naira(d.partnerHandlingNgn) : null} />
          <Row label="Escrow held"             value={d.paymentHeldAt ? new Date(d.paymentHeldAt).toLocaleString() : 'Not held'} />
          <Row label="Cancellation fee"        value={d.cancellationFeeNgn ? naira(d.cancellationFeeNgn) : null} />
        </section>
      </div>

      {/* The full receipt. Admin only: these splits are our cost model
          and must never appear on anything a sender can print. */}
      {d.receipt && (
        <section className="mt-4 rounded-xl border border-[#E5E7EB] bg-white overflow-hidden">
          <h2 className="flex items-center gap-1.5 border-b border-[#E5E7EB] bg-[#F5F5F0] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/40">
            <Receipt size={12} /> Full receipt
            {d.receipt.unpaid && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                nothing collected
              </span>
            )}
          </h2>
          <div className="grid gap-x-8 p-4 md:grid-cols-2">
            <div>
              <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#0F2B4C]/40">What the customer paid</h3>
              <Row label="Quoted"    value={naira(d.receipt.customerPaid)} />
              <Row label="Collected" value={naira(d.receipt.actuallyCollected)} />
            </div>
            <div>
              <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#0F2B4C]/40">Where it went</h3>
              <Row label="Driver"            value={naira(d.receipt.driverPay)} />
              <Row label="Partner counters"  value={d.receipt.partnerHandling > 0 ? naira(d.receipt.partnerHandling) : null} />
              <Row label="Card processing"   value={`- ${naira(d.receipt.processorCost)}`} />
              <Row label="NIPOST levy"       value={`- ${naira(d.receipt.postalLevy)}`} />
              <Row label="Gross margin"      value={naira(d.receipt.grossMargin)} />
              <Row
                label="SEIRS keeps"
                value={
                  <span className={d.receipt.contribution < 0 ? 'text-red-600' : 'text-emerald-700'}>
                    {naira(d.receipt.contribution)} ({d.receipt.contributionPct}%)
                  </span>
                }
              />
            </div>
          </div>
          {Array.isArray(d.receipt.payments) && d.receipt.payments.length > 0 && (
            <div className="border-t border-[#E5E7EB] px-4 py-3">
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#0F2B4C]/40">Payments</h3>
              {d.receipt.payments.map((p: any, i: number) => (
                <div key={i} className="flex flex-wrap items-center gap-x-3 py-1 text-xs text-[#0F2B4C]/70">
                  <span className="font-mono font-semibold text-[#0F2B4C]">{naira(Number(p.amountKobo) / 100)}</span>
                  <span className="capitalize">{String(p.purpose ?? '').replace('_', ' ')}</span>
                  <span className={p.status === 'success' ? 'text-emerald-600' : 'text-amber-600'}>{p.status}</span>
                  {p.escrowStatus && <span className="text-[#0F2B4C]/40">escrow {p.escrowStatus}</span>}
                  {p.providerReference && <span className="font-mono text-[#0F2B4C]/40">{p.providerReference}</span>}
                  <span className="text-[#0F2B4C]/40">{new Date(p.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

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
