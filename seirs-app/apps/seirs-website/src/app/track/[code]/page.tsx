'use client';

/**
 * Public tracking page. Anyone with a tracking code can see a delivery's
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
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Package, MapPin, Bike, Clock, CheckCircle2, XCircle, AlertTriangle,
  Camera, User, Store, Info, RefreshCw,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://seirs-logistics-mobile-production.up.railway.app/api/v1';

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

interface PublicDelivery {
  id:             string;
  trackingCode:   string;
  status:         string;
  pickupAddress:  string;
  dropoffAddress: string;
  packageSize:    string;
  vehicleType:    string;
  assignedAt:     string | null;
  pickedUpAt:     string | null;
  deliveredAt:    string | null;
  createdAt:      string;
  proofPhotoUrl:  string | null;
  driver:         { name: string; vehicleType: string | null; rating: number | null } | null;
  etaMinutes:     number | null;
  etaAsOf:        string | null;
  events:         DeliveryEventDTO[];
}

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  pending:    { label: 'Awaiting driver',    color: 'amber',   icon: Clock },
  assigned:   { label: 'Driver assigned',    color: 'blue',    icon: User },
  picked_up:  { label: 'Picked up',          color: 'violet',  icon: Package },
  in_transit: { label: 'On the way',         color: 'violet',  icon: Bike },
  delivered:  { label: 'Delivered',          color: 'emerald', icon: CheckCircle2 },
  cancelled:  { label: 'Cancelled',          color: 'slate',   icon: XCircle },
  failed:     { label: 'Could not complete', color: 'red',     icon: AlertTriangle },
};

const TERMINAL_STATUSES = new Set(['delivered', 'cancelled', 'failed']);

const EVENT_META: Record<string, { icon: any; label: (e: DeliveryEventDTO) => string }> = {
  status_change: {
    icon: Info,
    label: (e) => {
      const to = e.meta?.toStatus ?? 'update';
      return STATUS_META[String(to)]?.label ?? `Status: ${to}`;
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
const COLOR_CLASSES: Record<string, { bg: string; border: string; icon: string }> = {
  amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',   icon: 'bg-amber-500'   },
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',    icon: 'bg-blue-500'    },
  violet:  { bg: 'bg-violet-50',  border: 'border-violet-200',  icon: 'bg-violet-500'  },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'bg-emerald-500' },
  slate:   { bg: 'bg-slate-50',   border: 'border-slate-200',   icon: 'bg-slate-500'   },
  red:     { bg: 'bg-red-50',     border: 'border-red-200',     icon: 'bg-red-500'     },
};

export default function PublicTrackingPage() {
  const params = useParams<{ code: string }>();
  const code   = String(params?.code ?? '').toUpperCase();

  const [delivery,   setDelivery]   = useState<PublicDelivery | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
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
      setLastFetch(new Date());
    } catch (e: any) {
      setError(e?.message ?? 'Could not load tracking info');
      setDelivery(null);
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
          Loading tracking…
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
            Back to Seirs
          </Link>
        </div>
      </div>
    );
  }

  const statusMeta = STATUS_META[delivery.status] ?? STATUS_META.pending;
  const StatusIcon = statusMeta.icon;
  const colorClasses = COLOR_CLASSES[statusMeta.color];
  const isActive   = !TERMINAL_STATUSES.has(delivery.status);

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 pb-4 pt-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Seirs Tracking
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900">
              {delivery.trackingCode}
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

        {/* Status hero */}
        <div className={`m-5 flex items-center gap-4 rounded-xl border p-4 ${colorClasses.bg} ${colorClasses.border}`}>
          <div className={`flex h-11 w-11 items-center justify-center rounded-full ${colorClasses.icon}`}>
            <StatusIcon size={22} className="text-white" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-slate-900">{statusMeta.label}</div>
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
            {!isActive && delivery.deliveredAt && (
              <div className="mt-0.5 text-xs text-slate-500">
                {new Date(delivery.deliveredAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>

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
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Drop-off</div>
              <div className="text-sm leading-snug text-slate-900">{delivery.dropoffAddress}</div>
            </div>
          </div>
        </div>

        {/* Driver info */}
        {delivery.driver && (
          <div className="border-t border-slate-100 px-5 pb-5 pt-5">
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200">
                <Bike size={20} className="text-slate-700" />
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
                        {meta.label(e)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">{formatTime(e.createdAt)}</div>
                      {/* Proof photos are no longer served to this page
                          (founder 2026-08-12): they are dispute evidence
                          for admin, and they usually show the recipient's
                          gate or door, which should not travel with a
                          forwarded tracking code. */}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 border-t border-slate-100 py-4 text-xs text-slate-400">
          <MapPin size={12} />
          <span>Powered by Seirs Logistics</span>
        </div>
      </div>
    </div>
  );
}
