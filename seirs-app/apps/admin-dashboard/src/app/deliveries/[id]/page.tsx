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
import { ArrowLeft, MapPin, Navigation, Package, User, Bike, Store, Receipt, AlertTriangle, Camera, Siren } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { naira } from "@/lib/money";

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


function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-[#F5F5F0] last:border-0">
      <span className="text-xs text-[#0F2B4C]/50">{label}</span>
      <span className="text-xs font-medium text-[#0F2B4C] text-right">{value}</span>
    </div>
  );
}

/**
 * Photo columns arrive in three shapes and one of them is a lie.
 *
 * `packagePhotos` and the stops' `packagePhotoUrls` / `proofPhotoUrls`
 * are jsonb, so they come back as a real array. `proofPhotoUrl` is a
 * single varchar. And a jsonb column written by an older client can
 * still hand back a bare string. Normalise all three to an array here
 * so nothing downstream has to guess, and drop empties so a column
 * holding "" does not render a broken image tile.
 */
function photoList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  }
  if (typeof v === 'string' && v.trim() !== '') return [v];
  return [];
}

/**
 * One image tile, which says so when it cannot load.
 *
 * A dead URL renders as the browser's broken-image glyph, and on this
 * page that glyph is indistinguishable from "no photo was ever taken":
 * the exact confusion this section exists to end. It is not a rare
 * case either. UploadService hands back a placeholder.seirs.co URL
 * whenever R2 credentials are unset, and a real R2 object can be
 * deleted, or its bucket made private, long after the URL was written
 * to the row. So a failure gets its own labelled tile, and keeps the
 * URL in the tooltip for whoever has to go and find the file.
 */
function Shot({ url, alt, size }: { url: string; alt: string; size: 'card' | 'mini' }) {
  const [broken, setBroken] = useState(false);
  const box = size === 'card' ? 'h-36 w-36' : 'h-12 w-12';

  if (broken) {
    return (
      <span
        className={`${box} flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-1 text-center text-[9px] font-semibold leading-tight text-amber-800`}
        title={`A photo URL is on the record but the image did not load: ${url}`}
      >
        <AlertTriangle size={size === 'card' ? 18 : 12} />
        {size === 'card' ? 'On the record, did not load' : 'no load'}
      </span>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" title="Open the full-size image in a new tab">
      <img
        src={url}
        alt={alt}
        onError={() => setBroken(true)}
        className={`${box} rounded-lg border border-[#E5E7EB] object-cover transition-colors hover:border-[#3A7BD5]`}
      />
    </a>
  );
}

/**
 * One side of the evidence pair.
 *
 * Deliberately renders its empty state rather than hiding: on a disputed
 * run "the rider filed no proof photo" is itself the finding, and a
 * section that silently disappears reads as if the admin simply has not
 * scrolled far enough.
 *
 * Capture time is shown from whatever timestamp the record actually has.
 * Neither photo column carries a per-image timestamp, so the caller
 * passes the event these photos belong to (booking, handover) and the
 * label says which event it is rather than implying the shutter time.
 */
function EvidenceShots({
  title, note, urls, capturedAt, capturedLabel, empty,
}: {
  title:         string;
  note:          string;
  urls:          string[];
  capturedAt?:   string | null;
  capturedLabel: string;
  empty:         string;
}) {
  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-[#0F2B4C]/40">{title}</h3>
      <p className="mt-0.5 text-xs text-[#0F2B4C]/50">{note}</p>
      {urls.length === 0 ? (
        <div className="mt-2 rounded-lg border border-dashed border-[#0F2B4C]/15 bg-[#F5F5F0] px-3 py-4 text-xs text-[#0F2B4C]/50">
          {empty}
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs font-medium text-[#0F2B4C]/70">
            {capturedAt
              ? `${capturedLabel} ${new Date(capturedAt).toLocaleString()}`
              : `${capturedLabel} not recorded`}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {urls.map((u, i) => (
              <Shot
                key={`${u}-${i}`}
                url={u}
                alt={`${title}, image ${i + 1} of ${urls.length}`}
                size="card"
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Per-package thumbnails, sized for a table cell rather than a card. */
function MiniShots({ label, urls, at }: { label: string; urls: string[]; at?: string | null }) {
  if (urls.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="w-12 shrink-0 text-[10px] font-bold uppercase tracking-wide text-[#0F2B4C]/40"
        title={at ? new Date(at).toLocaleString() : undefined}
      >
        {label}
      </span>
      {urls.map((u, i) => (
        <Shot key={`${u}-${i}`} url={u} alt={`${label} ${i + 1}`} size="mini" />
      ))}
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
  const [rtBusy,  setRtBusy]  = useState(false);
  const [rtNote,  setRtNote]  = useState('');
  const [rfPct,   setRfPct]   = useState('');
  const [rfPrev,  setRfPrev]  = useState<any>(null);
  const [rfBusy,  setRfBusy]  = useState(false);
  const [rfNote,  setRfNote]  = useState('');
  const [rfError, setRfError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  /**
   * Whether anybody pressed the panic button on this run.
   *
   * This page had no idea. A trip where a rider hit SOS and a trip where
   * nothing happened rendered identically, so anyone opening a run to
   * work out what went wrong, a refund, a dispute, a complaint, was
   * reading it with the single most serious event on the record missing.
   * The alert was only ever visible on the SOS desk, and only while it
   * was still open.
   */
  const [sos, setSos] = useState<any[]>([]);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    adminApi.sos.history('all', 20, { deliveryId: String(id) })
      .then((r: any) => { if (alive) setSos(Array.isArray(r) ? r : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [id]);

  /**
   * Who was holding this parcel, and when it changed hands.
   *
   * The deck opens on "every person who touched the parcel signed for it",
   * the records have been written at every counter and doorstep since
   * 2026-08-25, and this page drew NONE of them. handoff_records rendered in
   * exactly one place, the disputes screen, which an agent only reaches once
   * something has already gone wrong and been flagged. Anyone asking the
   * ordinary question, who had this parcel, opened THIS page and saw nothing.
   *
   * Same endpoint disputes uses. Fails quietly: a delivery from before we
   * recorded handoffs has none, and that is not an error.
   */
  const [chain, setChain] = useState<any[]>([]);
  const [chainErr, setChainErr] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    adminApi.identity.handoffChain(String(id))
      .then((r: any) => { if (alive) setChain(Array.isArray(r) ? r : []); })
      .catch((e: any) => { if (alive) setChainErr(e?.message ?? 'Could not load the chain of custody.'); });
    return () => { alive = false; };
  }, [id]);
  /* Preview is deliberately separate from issuing: an agent should see
     the split before any money moves. */
  const previewRefund = async (pct: string) => {
    setRfPct(pct);
    setRfError(null);
    const n = Number(pct);
    if (!pct.trim() || !Number.isFinite(n) || n < 0 || n > 100) {
      setRfPrev(null);
      return;
    }
    try {
      setRfPrev(await adminApi.refundPreview(String(id), n));
    } catch {
      setRfPrev(null);
    }
  };

  const issueRefund = async () => {
    if (!rfPrev) return;
    setRfBusy(true);
    setRfError(null);
    try {
      await adminApi.issueRefund(String(id), {
        percent: Number(rfPct),
        note:    rfNote.trim() || undefined,
      });
      setD(await adminApi.delivery(String(id)));
      setRfPct('');
      setRfPrev(null);
      setRfNote('');
    } catch (e: unknown) {
      setRfError(e instanceof Error ? e.message : 'Could not issue that refund.');
    } finally {
      setRfBusy(false);
    }
  };

  const decideReturn = async (approve: boolean) => {
    setRtBusy(true);
    try {
      await adminApi.decideReturn(String(id), {
        approve,
        note: rtNote.trim() || undefined,
      });
      setD(await adminApi.delivery(String(id)));
      setRtNote('');
    } catch (e: unknown) {
      setRfError(e instanceof Error ? e.message : 'Could not save that decision.');
    } finally {
      setRtBusy(false);
    }
  };

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

  /* Evidence, gathered once so the section below and the packages table
     agree about what exists. Run-level columns hold the single-package
     case; the stop columns hold a multi-package run, where each parcel
     carries its own pair. */
  const sentPhotos  = photoList(d.packagePhotos);
  const proofPhotos = photoList(d.proofPhotoUrl);
  const stopSent    = stops.flatMap((st: any) => photoList(st.packagePhotoUrls));
  const stopProof   = stops.flatMap((st: any) => photoList(st.proofPhotoUrls));

  return (
    <div className="p-6 max-w-5xl">
      <Link href="/deliveries" className="inline-flex items-center gap-1 text-sm text-[#3A7BD5] hover:underline">
        <ArrowLeft size={14} /> All deliveries
      </Link>

      {/* Above the fold, always. An SOS outranks every other fact on this
          page: it is the reason someone is reading it. */}
      {sos.length > 0 && (
        <div className="mt-3 rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-red-800">
            <Siren size={16} />
            SOS was pressed on this run
            {sos.length > 1 ? ` (${sos.length} times)` : ''}
          </p>
          <div className="mt-2 space-y-2">
            {sos.map((a: any) => (
              <div key={a.id} className="rounded-lg bg-white px-3 py-2 text-xs">
                <p className="font-semibold text-[#0F2B4C]">
                  {a.user?.name ?? 'Someone'}
                  {a.user?.role ? ` (${String(a.user.role).toLowerCase()})` : ''}
                  {' · '}
                  {new Date(a.createdAt).toLocaleString('en-NG')}
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    a.status === 'active' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {a.status}
                  </span>
                </p>
                {a.note && <p className="mt-1 text-[#0F2B4C]">They said: {a.note}</p>}
                <p className="mt-1 text-[#0F2B4C]/60">
                  {a.status === 'cancelled'
                    ? 'Stood down by whoever raised it.'
                    : a.resolutionNote
                      ? `Support: ${a.resolutionNote}`
                      : a.status === 'active'
                        ? 'Still open on the SOS desk.'
                        : 'Closed with no note.'}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-3 font-semibold">
                  <Link href="/sos" className="text-[#3A7BD5] hover:underline">SOS desk</Link>
                  {a.user?.id && (
                    <Link href={`/users/${a.user.id}`} className="text-[#3A7BD5] hover:underline">
                      Their record
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-xl font-bold text-[#0F2B4C]">{d.trackingCode}</h1>
          <p className="mt-1 text-sm text-[#0F2B4C]/50">
            {d.kind === 'ride' ? `Ride · passenger ${[d.receiverFirstName, d.receiverLastName].filter(Boolean).join(' ')}` : stops.length > 1 ? `${stops.length} packages in one run` : 'Single package'}
            {d.vehicleType ? ` · ${d.vehicleType}` : ''}
            {d.createdAt ? ` · booked ${new Date(d.createdAt).toLocaleString()}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[d.status] ?? 'bg-[#0F2B4C]/5'}`}>
            {String(d.status ?? '').replace('_', ' ')}
          </span>
          {/* /disputes needs the delivery UUID and this page never showed
              it, so the liability chain was reachable only by digging the
              id out of the URL by hand. */}
          <Link
            href={`/disputes?deliveryId=${encodeURIComponent(String(d.id ?? ''))}`}
            className="text-xs font-semibold text-[#3A7BD5] hover:underline"
          >
            Open chain of custody
          </Link>
        </div>
      </div>

      {d.returnStatus && (
        <div className="mt-4 rounded-xl border border-[#7C3AED]/30 bg-[#7C3AED]/5 p-4">
          <div className="flex items-center gap-2 text-[#7C3AED]">
            <Package size={16} />
            <span className="text-sm font-bold uppercase tracking-wide">
              Return to sender {d.returnStatus}
            </span>
          </div>

          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-[#0F2B4C]/40">
                Going back to (fixed)
              </div>
              <div className="font-medium text-[#0F2B4C]">{d.pickupAddress ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-[#0F2B4C]/40">Quote</div>
              <div className="font-medium text-[#0F2B4C]">
                {d.returnQuoteNgn != null
                  ? naira(d.returnQuoteNgn)
                  : '-'}
                {d.returnQuoteKm != null
                  ? ` \u00b7 ${Number(d.returnQuoteKm).toFixed(1)} km by road`
                  : ''}
              </div>
            </div>
          </div>

          {d.returnStatus === 'approved' && !d.returnPaidAt && (
            <div className="mt-3 rounded-lg border border-[#D97706]/30 bg-[#D97706]/5 px-3 py-2 text-xs text-[#92400E]">
              Approved and waiting for payment. The driver does not turn around
              until the money lands.
            </div>
          )}

          {d.returnStatus === 'pending' && (
            <div className="mt-3 border-t border-[#7C3AED]/20 pt-3">
              <input
                value={rtNote}
                onChange={(e) => setRtNote(e.target.value)}
                placeholder="Note to the sender, shown if you reject"
                className="w-full rounded-lg border border-[#0F2B4C]/15 px-3 py-2 text-sm outline-none focus:border-[#7C3AED]"
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => void decideReturn(true)}
                  disabled={rtBusy}
                  className="rounded-lg bg-[#16A34A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#15803D] disabled:opacity-50"
                >
                  {rtBusy ? 'Saving...' : 'Approve return'}
                </button>
                <button
                  onClick={() => void decideReturn(false)}
                  disabled={rtBusy}
                  className="rounded-lg border border-[#DC2626]/40 px-4 py-2 text-sm font-semibold text-[#DC2626] hover:bg-[#DC2626]/5 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Refund calculator. Lives on every delivery, not just disputed
          ones, because support settles things for all sorts of reasons. */}
      <div className="mt-4 rounded-xl border border-[#0F2B4C]/10 bg-white p-4">
        <div className="flex items-center gap-2 text-[#0F2B4C]">
          <Receipt size={16} />
          <span className="text-sm font-bold uppercase tracking-wide">Refund calculator</span>
        </div>
        <p className="mt-1 text-xs text-[#0F2B4C]/50">
          A refund comes out of two pockets. SEIRS margin absorbs it first, then
          the driver&apos;s payout, and the driver floor stops an honest report
          costing them the trip.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs">
            <div className="mb-1 font-semibold text-[#0F2B4C]/60">Refund percentage</div>
            <input
              value={rfPct}
              onChange={(e) => void previewRefund(e.target.value)}
              placeholder="0 to 100"
              className="w-full rounded-lg border border-[#0F2B4C]/15 px-3 py-2 text-sm outline-none focus:border-[#3A7BD5]"
            />
          </label>
          <label className="text-xs">
            <div className="mb-1 font-semibold text-[#0F2B4C]/60">Reason</div>
            <input
              value={rfNote}
              onChange={(e) => setRfNote(e.target.value)}
              placeholder="Kept on the delivery record"
              className="w-full rounded-lg border border-[#0F2B4C]/15 px-3 py-2 text-sm outline-none focus:border-[#3A7BD5]"
            />
          </label>
        </div>

        {rfPrev && (
          <div className="mt-3 rounded-lg bg-[#0F2B4C]/[0.03] p-3 font-mono text-xs text-[#0F2B4C]">
            <Row label="Fare paid" value={naira(rfPrev.farePaid)} />
            <Row label={`Refund at ${rfPrev.percent}%`} value={naira(rfPrev.refundNgn)} />
            <Row label="From SEIRS margin" value={naira(rfPrev.fromMargin)} />
            <Row label="From driver payout" value={naira(rfPrev.fromDriver)} />
            <Row label="Driver floor" value={naira(rfPrev.driverFloorNgn)} />
            <Row label="Driver is paid" value={naira(rfPrev.driverPayAfter)} />
            {rfPrev.floorApplied && (
              <div className="mt-2 rounded border border-[#D97706]/30 bg-[#D97706]/5 px-2 py-1 text-[11px] text-[#92400E]">
                The floor rescued {naira(rfPrev.absorbedByFloor)} of the
                driver&apos;s pay. SEIRS covers that, not them.
              </div>
            )}
          </div>
        )}

        {rfError && (
          <div className="mt-2 rounded-lg border border-[#DC2626]/30 bg-[#DC2626]/5 px-3 py-2 text-xs text-[#DC2626]">
            {rfError}
          </div>
        )}

        <button
          onClick={() => void issueRefund()}
          disabled={rfBusy || !rfPrev}
          className="mt-3 rounded-lg bg-[#0F2B4C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0F2B4C]/90 disabled:opacity-40"
        >
          {rfBusy ? 'Issuing...' : 'Issue this refund'}
        </button>
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
                Re-quote from the driver&apos;s position
              </div>
              <div className="font-medium text-[#0F2B4C]">
                {d.addressChangeQuoteNgn != null
                  ? naira(d.addressChangeQuoteNgn)
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
              Paid and applied. The driver has been told the new address.
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
                      /* Mirrors the live quote to the kobo so the admin can
                         see exactly what is being corrected. No thousands
                         separator: this field is typed into, and a comma
                         would come back as garbage. */
                      d.addressChangeQuoteNgn != null
                        ? Number(d.addressChangeQuoteNgn).toFixed(2)
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
              Driver reported a problem
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
                alt="Driver's photo of the package"
                className="max-h-48 rounded-lg border border-[#DC2626]/30"
              />
            </a>
          )}
        </div>
      )}

      {/* Photo evidence.
          The page showed sender, rider, route, money and a full receipt
          and not one image, on the only screen whose job is settling an
          argument between two people about a parcel neither the admin
          nor SEIRS ever saw (founder 2026-08-25: "no way for the admin
          to see or verify whatever package was sent and delivered, how
          do we solve a dispute of things we can't see"). The customer
          app renders both sides already. The adjudicator saw neither.

          Placed above the sender and rider cards on purpose: during a
          dispute this is the first thing wanted, not the last.

          No reveal gate here, unlike identity documents. These are
          photographs of a parcel, and an admin looking at them is the
          entire point. The redaction shipped today protects riders from
          CUSTOMERS, never from staff. */}
      <section className="mt-4 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
        <h2 className="flex items-center gap-1.5 border-b border-[#E5E7EB] bg-[#F5F5F0] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/40">
          <Camera size={12} /> Photo evidence
          {d.kind !== 'ride' && sentPhotos.length + proofPhotos.length + stopSent.length + stopProof.length === 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
              nothing on file
            </span>
          )}
        </h2>
        <div className="grid gap-6 p-4 md:grid-cols-2">
          <EvidenceShots
            title="What the sender sent"
            note="Photographed by the sender at booking, before anyone had a reason to argue."
            urls={sentPhotos}
            capturedAt={d.createdAt}
            capturedLabel="Uploaded with the booking on"
            empty={
              stopSent.length > 0
                ? `Nothing on the run itself. Each package carries its own photo instead: see the ${stops.length} rows under Packages below.`
                : d.kind === 'ride'
                  ? 'A ride carries a passenger, not a parcel. No booking photo is asked for and none is missing.'
                  : 'The sender filed no booking photo. On a damage claim there is no before-picture to compare against.'
            }
          />
          <EvidenceShots
            title="Proof of delivery"
            note="Photographed by the driver at handover. Required by the server before a run can flip to delivered."
            urls={proofPhotos}
            capturedAt={d.deliveredAt}
            capturedLabel="Handover recorded at"
            empty={
              stopProof.length > 0
                ? `Nothing on the run itself. Each package carries its own proof instead: see the ${stops.length} rows under Packages below.`
                : String(d.status) !== 'delivered'
                  ? 'Not handed over yet, so there is nothing to show.'
                  : d.kind === 'ride'
                    /* Do not tell the adjudicator a ride is exempt. The
                       driver app skips the camera on a ride (active.tsx
                       guards on kind !== 'ride'), while the server
                       refuses ANY run reaching delivered without a
                       photo, rides included. The two rules disagree, so
                       the only honest reading of a missing ride photo is
                       that it is unexplained. */
                    ? 'This ride was closed with no photo on the record. The driver app does not ask for one on a ride while the server refuses any run without one, so treat this as unexplained rather than as normal.'
                    : 'Marked delivered with no proof photo on the record. Worth asking how that transition was made.'
            }
          />
        </div>
        {(d.recipientSignature || d.deliveredAt) && (
          <div className="border-t border-[#E5E7EB] px-4 py-3">
            <Row label="Recipient signature" value={d.recipientSignature} />
            <Row
              label="Delivered at"
              value={d.deliveredAt ? new Date(d.deliveredAt).toLocaleString() : null}
            />
          </div>
        )}
      </section>

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
          {/* Consent is a record, not a button state: this timestamp is
              what a dispute actually needs. Old bookings predate the
              field and say so instead of pretending. */}
          <div className="mt-2 text-xs text-[#0F2B4C]/50">
            Terms accepted:{' '}
            {d.termsAcceptedAt
              ? new Date(d.termsAcceptedAt).toLocaleString()
              : 'not recorded (booked before consent capture, 21 Aug 2026)'}
          </div>
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
                {/* The sender name a few lines up has always been a link
                    and the driver name was a plain div, so on one card an
                    admin could click one person and not the other
                    (founder 2026-08-24, mid emergency). Driver profile
                    where we have the driver row, account otherwise. */}
                {d.driver.id || d.driver.user?.id ? (
                  <Link
                    href={d.driver.id ? `/drivers/${d.driver.id}` : `/users/${d.driver.user.id}`}
                    className="text-sm font-semibold text-[#3A7BD5] hover:underline"
                  >
                    {d.driver.user?.name ?? d.driver.id?.slice(0, 8)}
                  </Link>
                ) : (
                  <div className="text-sm font-semibold text-[#0F2B4C]">{d.driver.user?.name ?? '-'}</div>
                )}
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
                {/* Where the rider is RIGHT NOW, in numbers. The map above
                    draws a dot, which is unreadable down a phone line and
                    cannot be pasted anywhere. Ops needs to be able to say
                    the coordinates out loud. */}
                {d.driver.lastLat != null && d.driver.lastLng != null && (
                  <div className="mt-2 rounded-lg bg-[#F3F4F6] px-3 py-2">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[#0F2B4C]/40">
                      Live position
                    </div>
                    <div className="font-mono text-xs text-[#0F2B4C]">
                      {Number(d.driver.lastLat).toFixed(5)}, {Number(d.driver.lastLng).toFixed(5)}
                    </div>
                    <a
                      className="mt-1 inline-block text-xs font-semibold text-[#3A7BD5] hover:underline"
                      href={`https://www.google.com/maps?q=${d.driver.lastLat},${d.driver.lastLng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open where they are now
                    </a>
                  </div>
                )}
                {d.driverAcceptedLat != null && d.driverAcceptedLng != null && (
                  <a
                    className="mt-1 inline-block text-xs font-semibold text-[#3A7BD5] hover:underline"
                    href={`https://www.google.com/maps?q=${d.driverAcceptedLat},${d.driverAcceptedLng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Where the driver accepted from
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
              {/*
                The margin floor, which until now enforced nothing and
                showed nowhere. It is a warning, not a block: a thin job
                still runs, and the operator gets told it was thin.
              */}
              {d.receipt.belowFloor && (
                <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900">
                  Below your margin floor of {naira(d.receipt.marginFloorNgn)}. This job ran, and it
                  kept less than the minimum set in Pricing.
                </p>
              )}
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
                    {/* Per-package evidence. On a multi-drop run the
                        photos live on the stop, not the delivery, so the
                        card above is empty and the only place an admin
                        can tell parcel three from parcel four is right
                        here on its own row (founder 2026-08-25). */}
                    <div className="mt-2 space-y-1.5">
                      <MiniShots label="Sent"  urls={photoList(st.packagePhotoUrls)} at={d.createdAt} />
                      <MiniShots label="Proof" urls={photoList(st.proofPhotoUrls)}   at={st.deliveredAt} />
                    </div>
                    {st.status === 'delivered' && photoList(st.proofPhotoUrls).length === 0 && (
                      <div className="mt-1 text-[10px] font-semibold text-amber-700">
                        Delivered with no proof photo
                      </div>
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
                    {st.legKm != null && (
                      <div className="text-[10px] text-[#0F2B4C]/40 mt-0.5"
                        title="Road distance of the leg arriving at this stop, measured at booking">
                        +{Number(st.legKm).toFixed(1)} km leg
                      </div>
                    )}
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

      {/* Chain of custody. Every change of hands, in order, with who signed. */}
      <section className="mt-4 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
        <h2 className="flex items-center gap-1.5 border-b border-[#E5E7EB] bg-[#F5F5F0] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/40">
          <User size={12} /> Chain of custody
          {chain.length > 0 && (
            <span className="ml-2 rounded-full bg-[#0F2B4C]/10 px-2 py-0.5 text-[10px] font-semibold text-[#0F2B4C]">
              {chain.length} {chain.length === 1 ? 'handover' : 'handovers'}
            </span>
          )}
        </h2>

        {chainErr ? (
          <p className="p-4 text-sm text-red-700">{chainErr}</p>
        ) : chain.length === 0 ? (
          <p className="p-4 text-sm text-[#0F2B4C]/50">
            No handovers recorded. Deliveries completed before SEIRS recorded them have none,
            and a run that never left the sender has none yet.
          </p>
        ) : (
          <ol className="p-4">
            {chain.map((h: any, i: number) => (
              <li key={h.id ?? i} className="relative flex gap-3 pb-4 last:pb-0">
                {/* The line down the side is what makes it read as a sequence
                    rather than a list of unrelated events. */}
                {i < chain.length - 1 && (
                  <span className="absolute left-[9px] top-5 h-full w-px bg-[#E5E7EB]" aria-hidden="true" />
                )}
                <span className="relative z-10 mt-1 h-[18px] w-[18px] shrink-0 rounded-full border-2 border-white bg-[#0F2B4C]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#0F2B4C]">
                    {stageLabel(h.stage)}
                  </p>
                  <p className="text-xs text-[#0F2B4C]/60">
                    {h.signatureName
                      ? <>Signed by <span className="font-semibold text-[#0F2B4C]">{h.signatureName}</span></>
                      : 'No name recorded'}
                    {h.idType ? ` · ${h.idType}${h.idLast ? ` ending ${h.idLast}` : ''}` : ''}
                    {h.method ? ` · ${methodLabel(h.method)}` : ''}
                  </p>
                  <p className="text-xs text-[#0F2B4C]/40">
                    {h.createdAt ? new Date(h.createdAt).toLocaleString() : 'no timestamp'}
                  </p>
                  {h.proofPhotoUrl && (
                    <a
                      href={h.proofPhotoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#0F2B4C] hover:underline"
                    >
                      <Camera size={11} /> photo taken at the handover
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/**
 * Stage codes read as database values, and an agent under pressure should not
 * have to translate driver_to_store in their head. Unknown values fall
 * through unchanged rather than being hidden, because a stage we do not
 * recognise is exactly the one worth seeing.
 */
function stageLabel(stage?: string): string {
  // Checked against HandoffStage in handoff-record.entity.ts, not guessed.
  // "customer" is the sender in that enum; the word here is the one a person
  // reading this page would use.
  const MAP: Record<string, string> = {
    customer_to_store:   'Sender dropped it at the counter',
    customer_to_driver:  'Sender handed it to the rider',
    store_to_driver:     'Counter released it to the rider',
    driver_to_store:     'Rider handed it in at the counter',
    store_to_recipient:  'Counter released it to the recipient',
    driver_to_recipient: 'Rider handed it to the recipient',
    driver_to_driver:    'Rider handed it to another rider',
  };
  return MAP[stage ?? ''] ?? (stage ?? 'Handover');
}

/**
 * HandoffMethod, same treatment and for the same reason.
 *
 * This was rendering the raw value, so the page said "physical_id" to a
 * reader who is not a developer. I had warned the other session about exactly
 * this an hour before doing it myself, which is a fair reminder that the
 * check has to be a habit rather than a thing you spot in someone else.
 *
 * Checked against HandoffMethod in handoff-record.entity.ts.
 */
function methodLabel(method?: string): string {
  const MAP: Record<string, string> = {
    physical_id:     'showed an ID document',
    seirs_id:        'confirmed by SEIRS ID',
    typed_signature: 'typed their name',
  };
  return MAP[method ?? ''] ?? (method ?? '');
}
