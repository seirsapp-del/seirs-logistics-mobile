'use client';

/**
 * Public tracking view. Anyone with a tracking code can see a delivery's
 * live status + timeline without logging in.
 *
 * This is the DHL-side of SEIRS tracking, layered on top of the Uber-
 * style live map that the customer app already provides for logged-in
 * senders. Same GET /deliveries/track/:code backend endpoint (public,
 * no bearer token).
 *
 * Auto-refresh: polls every 30s while a delivery is still active.
 * Stops polling on terminal statuses so a browser tab left open on a
 * delivered package generates zero background load.
 *
 * Split out of page.tsx on 2026-08-23. The whole route was 'use client', so
 * it could not export metadata and inherited the generic site title, on the
 * highest-intent search term a logistics site gets. page.tsx is now a server
 * component that owns the metadata and renders this.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { naira } from '@/lib/money';
import {
  Package, MapPin, Bike, Clock, CheckCircle2, XCircle, AlertTriangle,
  Camera, User, Store, Info, RefreshCw, Car, WifiOff, Lock, Wallet,
} from 'lucide-react';

// See the note in find-a-partner: NEXT_PUBLIC_API_BASE_URL is canonical,
// NEXT_PUBLIC_API_URL kept as a fallback for existing Vercel values.
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'https://seirs-logistics-mobile-production.up.railway.app/api/v1';

interface DeliveryEventDTO {
  id:          string;
  type:        string;
  actorRole:   string;
  description: string | null;
  lat:         number | null;
  lng:         number | null;
  meta:        Record<string, any> | null;
  createdAt:   string;
}

type DeliveryKind = 'package' | 'ride';

interface PublicDelivery {
  id:             string;
  trackingCode:   string;
  status:         string;
  /** package | ride. A tracked ride is a human being, not a parcel, and the
   *  backend has always sent this. The page ignored it until 2026-08-23 and
   *  told passengers they had been "Picked up" under a Package icon. */
  kind:           DeliveryKind;
  /** True while a booking is unpaid. Dispatch only ever sees paid work, so
   *  without this the page showed "Awaiting driver" for a booking no driver
   *  can see: exactly the invented progress the backend added the field to
   *  prevent. */
  awaitingPayment: boolean;
  pickupAddress:  string;
  dropoffAddress: string;
  /** Set when the receiver owes a redirect fee. While it is owed the backend
   *  masks dropoffAddress to a sentence telling them to settle up, so the
   *  page has to offer somewhere to do that. */
  redirectFeeOwedNgn: number | null;
  packageSize:    string;
  vehicleType:    string;
  assignedAt:     string | null;
  pickedUpAt:     string | null;
  deliveredAt:    string | null;
  createdAt:      string;
  driver:         { name: string; vehicleType: string | null; rating: number | null } | null;
  etaMinutes:     number | null;
  etaAsOf:        string | null;
  events:         DeliveryEventDTO[];
  /** Present when tracked by a per-package SRS-P- code: the receiver's
   *  scoped view of THEIR parcel in a multi-package run. */
  package?: {
    code:               string;
    sequenceOrder:      number;
    description:        string | null;
    photoUrl:           string | null;
    status:             string;
    recipientFirstName: string | null;
    address:            string;
    arrivedAt:          string | null;
    deliveredAt:        string | null;
  } | null;
}

interface StatusMeta { label: string; color: string; icon: any }

const PACKAGE_STATUS_META: Record<string, StatusMeta> = {
  pending:    { label: 'Awaiting driver',    color: 'amber',   icon: Clock },
  assigned:   { label: 'Driver assigned',    color: 'blue',    icon: User },
  picked_up:  { label: 'Picked up',          color: 'violet',  icon: Package },
  in_transit: { label: 'On the way',         color: 'violet',  icon: Bike },
  delivered:  { label: 'Delivered',          color: 'emerald', icon: CheckCircle2 },
  cancelled:  { label: 'Cancelled',          color: 'slate',   icon: XCircle },
  failed:     { label: 'Could not complete', color: 'red',     icon: AlertTriangle },
};

// A ride carries a person. Every label and icon that describes a parcel is
// wrong for one, so the ladder is separate rather than patched at the point
// of render.
const RIDE_STATUS_META: Record<string, StatusMeta> = {
  pending:    { label: 'Finding a driver',   color: 'amber',   icon: Clock },
  assigned:   { label: 'Driver on the way',  color: 'blue',    icon: User },
  picked_up:  { label: 'On board',           color: 'violet',  icon: Car },
  in_transit: { label: 'On the way',         color: 'violet',  icon: Car },
  delivered:  { label: 'Trip completed',     color: 'emerald', icon: CheckCircle2 },
  cancelled:  { label: 'Cancelled',          color: 'slate',   icon: XCircle },
  failed:     { label: 'Could not complete', color: 'red',     icon: AlertTriangle },
};

// The unpaid state. Same treatment the three apps landed on (C-D8,
// 2026-08-22): SEIRS brand yellow with navy text, because the generic
// Tailwind amber that used to be here appears nowhere in the palette.
const AWAITING_PAYMENT_META: StatusMeta = {
  label: 'Waiting for payment',
  color: 'brand-yellow',
  icon:  Wallet,
};

function statusMetaFor(kind: DeliveryKind, status: string): StatusMeta {
  const table = kind === 'ride' ? RIDE_STATUS_META : PACKAGE_STATUS_META;
  return table[status] ?? table.pending;
}

const TERMINAL_STATUSES = new Set(['delivered', 'cancelled', 'failed']);

const EVENT_META: Record<string, { icon: any; label: (e: DeliveryEventDTO, kind: DeliveryKind) => string }> = {
  status_change: {
    icon: Info,
    label: (e, kind) => {
      const to = String(e.meta?.toStatus ?? 'update');
      const table = kind === 'ride' ? RIDE_STATUS_META : PACKAGE_STATUS_META;
      return table[to]?.label ?? `Status: ${to}`;
    },
  },
  handoff:     { icon: Store,   label: (e) => e.description ?? 'Hand-off recorded' },
  driver_note: { icon: Bike,    label: (e) => e.description ?? 'Driver update' },
  admin_note:  { icon: User,    label: (e) => e.description ?? 'Support update' },
  scan:        { icon: Package, label: (e) => e.description ?? `Package scanned${e.meta?.at ? ` at ${e.meta.at}` : ''}` },
  photo_added: { icon: Camera,  label: (e) => e.meta?.kind === 'proof_of_delivery' ? 'Proof-of-delivery photo' : 'Photo added' },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Tailwind can only see literal class names, so we spell out every
// status color combo instead of interpolating.
const COLOR_CLASSES: Record<string, { bg: string; border: string; icon: string; title: string; sub: string }> = {
  amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',   icon: 'bg-amber-500',   title: 'text-slate-900', sub: 'text-slate-500' },
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',    icon: 'bg-blue-500',    title: 'text-slate-900', sub: 'text-slate-500' },
  violet:  { bg: 'bg-violet-50',  border: 'border-violet-200',  icon: 'bg-violet-500',  title: 'text-slate-900', sub: 'text-slate-500' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'bg-emerald-500', title: 'text-slate-900', sub: 'text-slate-500' },
  slate:   { bg: 'bg-slate-50',   border: 'border-slate-200',   icon: 'bg-slate-500',   title: 'text-slate-900', sub: 'text-slate-500' },
  red:     { bg: 'bg-red-50',     border: 'border-red-200',     icon: 'bg-red-500',     title: 'text-slate-900', sub: 'text-slate-500' },
  // Brand yellow ground, navy text. The icon disc is navy so a white glyph
  // still reads on it: white on #FFBE0B does not.
  'brand-yellow': {
    bg: 'bg-[#FFBE0B]', border: 'border-[#FFBE0B]', icon: 'bg-[#0F2B4C]',
    title: 'text-[#0F2B4C]', sub: 'text-[#0F2B4C]/75',
  },
};

export function TrackingView() {
  const params = useParams<{ code: string }>();
  const code   = String(params?.code ?? '').toUpperCase();

  const [delivery,   setDelivery]   = useState<PublicDelivery | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  // A failed lookup and a failed connection are different problems with
  // different fixes, and until 2026-08-23 both rendered "Tracking not
  // found", so a reader on a dropped Lagos connection was told their code
  // was wrong and had no reason to retry.
  const [offline,    setOffline]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetch,  setLastFetch]  = useState<Date | null>(null);

  const load = useCallback(async (background = false) => {
    if (!code) return;
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/deliveries/track/${encodeURIComponent(code)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `Tracking code ${code} not found`);
      }
      const data = await res.json();
      setDelivery(data);
      setError(null);
      setOffline(false);
      setLastFetch(new Date());
    } catch (e: unknown) {
      // fetch rejects with a TypeError when the request never reached a
      // server at all: no network, DNS failure, CORS refusal. Anything else
      // here is our own thrown Error carrying the API's message.
      const isNetwork = e instanceof TypeError;
      setOffline(isNetwork);
      setError(
        isNetwork
          ? 'We could not reach SEIRS. Check your connection and try again.'
          : (e instanceof Error ? e.message : 'Could not load tracking info'),
      );
      // A background refresh that fails must not wipe a delivery already on
      // screen. Losing the card because one poll timed out is worse than
      // showing a slightly stale one.
      if (!background) setDelivery(null);
    } finally {
      if (background) setRefreshing(false); else setLoading(false);
    }
  }, [code]);

  useEffect(() => { load(false); }, [load]);

  useEffect(() => {
    if (!delivery) return;
    if (TERMINAL_STATUSES.has(delivery.status)) return;
    const t = setInterval(() => load(true), 30_000);
    return () => clearInterval(t);
  }, [delivery, load]);

  if (loading && !delivery) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-2xl bg-white p-12 text-center text-slate-500 shadow-sm">
          Loading tracking...
        </div>
      </div>
    );
  }

  if (offline && !delivery) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
          <WifiOff size={40} className="mx-auto mb-3 text-slate-400" />
          <div className="mb-1 text-lg font-bold text-slate-900">We could not reach SEIRS</div>
          <div className="mb-4 text-sm text-slate-600">
            Your code looks fine. Something between this page and our servers
            did not answer, which is usually the connection.
          </div>
          <button
            onClick={() => load(false)}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <RefreshCw size={15} />
            Try again
          </button>
          <div className="mt-4">
            <Link href="/" className="text-xs text-slate-400 hover:text-slate-600">
              Back to SEIRS
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error || !delivery) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
          <XCircle size={40} className="mx-auto mb-3 text-red-500" />
          <div className="mb-1 text-lg font-bold text-slate-900">Tracking not found</div>
          <div className="mb-3 text-sm text-slate-600">
            We could not find a delivery with code{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{code}</code>.
          </div>
          <div className="text-xs text-slate-400">{error}</div>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Back to SEIRS
          </Link>
        </div>
      </div>
    );
  }

  const kind: DeliveryKind = delivery.kind === 'ride' ? 'ride' : 'package';
  const isRide = kind === 'ride';

  // Payment first. Nothing downstream of it has happened yet, so a status
  // ladder rendered over an unpaid booking is fiction.
  const statusMeta = delivery.awaitingPayment
    ? AWAITING_PAYMENT_META
    : statusMetaFor(kind, delivery.status);
  const StatusIcon = statusMeta.icon;
  const colorClasses = COLOR_CLASSES[statusMeta.color];
  const isActive = !delivery.awaitingPayment && !TERMINAL_STATUSES.has(delivery.status);

  const feeOwed = Number(delivery.redirectFeeOwedNgn ?? 0);

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 pb-4 pt-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {isRide ? 'SEIRS Ride' : 'SEIRS Tracking'}
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900">
              {delivery.package?.code ?? delivery.trackingCode}
            </div>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {delivery.package && (
          <div className="mx-5 mt-5 flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            {delivery.package.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={delivery.package.photoUrl}
                alt="Package"
                className="h-14 w-14 rounded-lg object-cover"
              />
            ) : null}
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {delivery.package.recipientFirstName
                  ? `Package for ${delivery.package.recipientFirstName}`
                  : `Package ${delivery.package.sequenceOrder}`}
              </div>
              {delivery.package.description && (
                <div className="mt-0.5 truncate text-sm font-medium text-slate-800">
                  {delivery.package.description}
                </div>
              )}
              <div className="mt-0.5 text-xs text-slate-500">
                {delivery.package.deliveredAt
                  ? 'Delivered'
                  : delivery.package.arrivedAt
                  ? 'Driver at your address'
                  : 'Drop ' + delivery.package.sequenceOrder + ' on this route'}
              </div>
            </div>
          </div>
        )}

        {/* Status hero */}
        <div className={`m-5 flex items-center gap-4 rounded-xl border p-4 ${colorClasses.bg} ${colorClasses.border}`}>
          <div className={`flex h-11 w-11 items-center justify-center rounded-full ${colorClasses.icon}`}>
            <StatusIcon size={22} className="text-white" />
          </div>
          <div className="flex-1">
            <div className={`text-sm font-bold ${colorClasses.title}`}>{statusMeta.label}</div>
            {delivery.awaitingPayment && (
              <div className={`mt-0.5 text-xs ${colorClasses.sub}`}>
                {isRide
                  ? 'No driver is looking for this trip yet. Dispatch starts once the fare is paid in the app.'
                  : 'No driver is looking for this package yet. Dispatch starts once the sender pays in the app.'}
              </div>
            )}
            {isActive && delivery.etaMinutes != null && (
              <div className="mt-0.5 text-sm font-semibold text-slate-700">
                Estimated arrival in ~{delivery.etaMinutes} min
              </div>
            )}
            {isActive && (
              <div className="mt-0.5 text-xs text-slate-500">
                Auto-refreshes every 30 seconds
                {lastFetch && ` · last updated ${lastFetch.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`}
              </div>
            )}
            {!isActive && !delivery.awaitingPayment && delivery.deliveredAt && (
              <div className="mt-0.5 text-xs text-slate-500">
                {new Date(delivery.deliveredAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* A background poll that failed while a card is already on screen.
            The card stays, but it stops claiming to be current. */}
        {offline && delivery && (
          <div className="mx-5 -mt-1 mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <WifiOff size={14} className="shrink-0 text-slate-400" />
            <span className="flex-1">Not updating right now. Showing the last status we had.</span>
            <button onClick={() => load(true)} className="font-semibold text-slate-900 hover:underline">
              Retry
            </button>
          </div>
        )}

        {/* Route */}
        <div className="border-t border-slate-100 px-5 pb-5 pt-4">
          <div className="flex items-start gap-3 py-3">
            <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
            <div className="flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pickup</div>
              <div className="text-sm leading-snug text-slate-900">{delivery.pickupAddress}</div>
            </div>
          </div>
          <div className="ml-1 h-4 w-0.5 bg-slate-200" />
          <div className="flex items-start gap-3 py-3">
            <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
            <div className="flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {isRide ? 'Destination' : 'Drop-off'}
              </div>
              <div className="text-sm leading-snug text-slate-900">{delivery.dropoffAddress}</div>
            </div>
          </div>

          {/* Redirect fee owed. While it is unpaid the backend replaces the
              dropoff address with a sentence telling the receiver to settle
              up, and this page used to render that sentence and stop, with
              no way to act on it. /collect/<code> is the page built for
              exactly this and nothing linked to it. */}
          {feeOwed > 0 && (
            <div className="mt-2 rounded-xl border border-[#FFBE0B] bg-[#FFBE0B]/15 p-4">
              <div className="flex items-start gap-3">
                <Lock size={18} className="mt-0.5 shrink-0 text-[#0F2B4C]" />
                <div className="flex-1">
                  <div className="text-sm font-bold text-[#0F2B4C]">
                    {naira(feeOwed)} to settle before collection
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-[#0F2B4C]/80">
                    Nobody was available when the rider arrived, so this package
                    is being kept safe at a SEIRS partner counter. The counter
                    address appears as soon as this is settled.
                  </div>
                  <Link
                    href={`/collect/${encodeURIComponent(delivery.package?.code ?? delivery.trackingCode)}`}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#0F2B4C] px-3 py-2 text-xs font-bold text-white hover:opacity-90"
                  >
                    Settle and reveal the counter
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Driver info */}
        {delivery.driver && (
          <div className="border-t border-slate-100 px-5 pb-5 pt-5">
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200">
                {isRide
                  ? <Car size={20} className="text-slate-700" />
                  : <Bike size={20} className="text-slate-700" />}
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-slate-900">{delivery.driver.name}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {delivery.driver.vehicleType ?? 'Vehicle'}
                  {delivery.driver.rating != null && ` · ${delivery.driver.rating.toFixed(1)}★`}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="border-t border-slate-100 px-5 pb-5 pt-5">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Timeline</div>
          {delivery.events.length === 0 ? (
            <div className="py-3 text-xs text-slate-400">No events yet.</div>
          ) : (
            <div className="flex flex-col">
              {delivery.events.slice().reverse().map((e, idx) => {
                const meta = EVENT_META[e.type] ?? EVENT_META.status_change;
                const EIcon = meta.icon;
                const isFirst = idx === 0;
                return (
                  <div key={e.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isFirst ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>
                        <EIcon size={12} />
                      </div>
                      {idx < delivery.events.length - 1 && <div className="mt-1 flex-1 w-0.5 bg-slate-200" />}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className={`text-sm text-slate-900 ${isFirst ? 'font-semibold' : 'font-medium'}`}>
                        {meta.label(e, kind)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">{formatTime(e.createdAt)}</div>
                      {/* Proof photos are no longer served to this page
                          (founder 2026-08-12): they are dispute evidence
                          for admin, and they usually show the recipient's
                          gate or door, which should not travel with a
                          forwarded tracking code. The interface carried a
                          dead proofPhotoUrl field until 2026-08-23. */}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 border-t border-slate-100 py-4 text-xs text-slate-400">
          <MapPin size={12} />
          <span>Powered by SEIRS Logistics</span>
        </div>
      </div>
    </div>
  );
}
