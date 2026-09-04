'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Truck, MapPin, ArrowRight, AlertCircle, Loader2, RefreshCw, PhoneCall, Search, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';
import { seatStatus } from '@/lib/labels';
import { naira } from '@/lib/money';

// Spec V8 §3.12 - interstate trip board. READ-ONLY: it surfaces
// driver-declared intercity trips and their spare capacity so ops know
// who is going where. It does NOT match packages or override
// allocations; the comment used to claim both, and an ops person went
// looking for controls that were never built.
interface InterstateTrip {
  id:              string;
  fromCity:        string;
  toCity:          string;
  departAt:        string;
  spareCapacityKg: number;
  status:          'active' | 'completed' | 'cancelled';
  createdAt:       string;
  driver?: {
    id:           string;
    vehicleType?: string;
    vehiclePlate?: string;
    user?: { id: string; name: string; phone?: string };
  };
  /** The towns the van actually passes through, in order. */
  stops?: Array<{
    sequence: number; city: string; address?: string;
    description?: string | null; kmFromOrigin?: number | null; arrivedAt?: string | null;
  }>;
  /** Who is riding, and between which two of those towns. */
  seats?: Array<{
    id: string; status: string; priceNgn?: number | null; segmentKm?: number | null;
    boardCity?: string | null; alightCity?: string | null;
    boardAddress?: string | null; alightAddress?: string | null;
    passengerUserId?: string | null; passengerName?: string | null; passengerPhone?: string | null;
  }>;
}

const POPULAR = [
  { from: 'Lagos',  to: 'Ibadan', km: 145 },
  { from: 'Lagos',  to: 'Abuja',  km: 760 },
  { from: 'Ibadan', to: 'Abuja',  km: 605 },
  { from: 'Lagos',  to: 'Benin',  km: 320 },
  { from: 'Abuja',  to: 'Kano',   km: 350 },
  { from: 'Lagos',  to: 'Port Harcourt', km: 620 },
];

interface ParcelRequestRow {
  id: string; status: string;
  weightKg: number | null; categoryCode: string | null;
  packageDescription: string | null; declaredValueNgn: number | null;
  pickupAddress: string | null; dropoffAddress: string | null;
  senderInstructions: string | null;
  quotedNgn: number | null; quotedKm: number | null;
  counterQuotedNgn: number | null; counterQuotedKm: number | null;
  counterDropAddress: string | null; counterNote: string | null;
  declineReason: string | null;
  counteredAt: string | null; answeredAt: string | null;
  expiresAt: string | null; createdAt: string;
  deliveryId: string | null;
  senderUserId: string | null; senderName: string | null;
  tripId: string | null; fromCity: string | null; toCity: string | null; departAt: string | null;
  driverUserId: string | null; driverName: string | null;
  vehicleType: string | null; vehiclePlate: string | null;
  wasCountered: boolean; priceMovedNgn: number | null; dropMoved: boolean;
}

const PARCEL_STATUSES = ['countered', 'declined', 'requested', 'accepted', 'withdrawn', 'expired'] as const;

const PARCEL_PILL: Record<string, string> = {
  requested: 'bg-blue-50 text-blue-700',
  countered: 'bg-amber-50 text-amber-700',
  accepted:  'bg-green-50 text-green-700',
  declined:  'bg-red-50 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-600',
  expired:   'bg-gray-100 text-gray-600',
};

/**
 * The parcel side of the marketplace.
 *
 * Every other admin view of Travel Buddy is passenger-side, so until
 * 2026-09-04 a dispute about a PARCEL had no screen behind it: the sender's
 * instructions, the rider's counter-note and decline reason, both prices and
 * both distances were all recorded and none of it was rendered anywhere. The
 * founder asked to see the input and the comments of every party, and this is
 * that. Countered and declined lead the filter because they are the rows
 * somebody actually has to read.
 */
function ParcelNegotiations() {
  const [rows,    setRows]    = useState<ParcelRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);
  const [status,  setStatus]  = useState<string>('');
  const [open,    setOpen]    = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    adminApi.travelBuddy.parcelRequests(100, status || undefined)
      .then(r => { if (alive) { setRows(Array.isArray(r) ? r : []); setErr(null); } })
      .catch((e: any) => { if (alive) setErr(e?.message ?? 'Could not load parcel negotiations.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [status]);

  const when = (v: string | null) =>
    v ? new Date(v).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/70">
          Parcel negotiations
        </h2>
        <span className="text-xs text-gray-500">{rows.length} shown</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        What each side actually offered and said, before any money moved.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {['', ...PARCEL_STATUSES].map(s => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${
              status === s
                ? 'bg-[#0F2B4C] text-white border-[#0F2B4C]'
                : 'bg-white text-gray-600 border-[#E5E7EB] hover:bg-gray-50'
            }`}
          >
            {s === '' ? 'All' : s}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading negotiations
        </div>
      )}

      {!loading && err && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {err}
        </div>
      )}

      {!loading && !err && rows.length === 0 && (
        <p className="text-sm text-gray-500 py-6">
          No parcel requests{status ? ` with status "${status}"` : ''} yet.
        </p>
      )}

      <div className="space-y-2">
        {rows.map(r => {
          const isOpen = !!open[r.id];
          return (
            <div key={r.id} className="border border-[#E5E7EB] rounded-lg overflow-hidden">
              <button
                onClick={() => setOpen(o => ({ ...o, [r.id]: !o[r.id] }))}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50"
              >
                {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PARCEL_PILL[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {r.status}
                </span>
                <span className="text-sm font-semibold text-[#0F2B4C] truncate">
                  {r.senderName ?? 'Sender'}
                </span>
                <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-700 truncate">
                  {r.driverName ?? 'Rider'}
                </span>
                <span className="text-xs text-gray-500 truncate hidden md:inline">
                  {r.fromCity} → {r.toCity}
                </span>
                <span className="ml-auto text-sm shrink-0">
                  {r.quotedNgn != null && <span className="text-gray-500">{naira(r.quotedNgn)}</span>}
                  {r.priceMovedNgn != null && r.priceMovedNgn !== 0 && (
                    <span className={r.priceMovedNgn > 0 ? 'text-amber-700 font-semibold ml-1' : 'text-green-700 font-semibold ml-1'}>
                      {r.priceMovedNgn > 0 ? '+' : ''}{naira(r.priceMovedNgn)}
                    </span>
                  )}
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-[#E5E7EB] bg-gray-50 p-4 space-y-4 text-sm">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">The parcel</p>
                      <p className="text-[#0F2B4C]">{r.packageDescription || 'No description given'}</p>
                      <p className="text-gray-600 text-xs mt-1">
                        {r.weightKg != null ? `${r.weightKg} kg` : 'weight not given'}
                        {r.categoryCode ? ` · ${r.categoryCode}` : ''}
                        {r.declaredValueNgn != null ? ` · declared ${naira(r.declaredValueNgn)}` : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">The trip</p>
                      <p className="text-[#0F2B4C]">{r.fromCity} → {r.toCity}</p>
                      <p className="text-gray-600 text-xs mt-1">
                        departs {when(r.departAt)}
                        {r.vehicleType ? ` · ${r.vehicleType}` : ''}
                        {r.vehiclePlate ? ` ${r.vehiclePlate}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">Asked for</p>
                      <p className="text-gray-700 text-xs">Pick up: {r.pickupAddress || '-'}</p>
                      <p className="text-gray-700 text-xs">Drop off: {r.dropoffAddress || '-'}</p>
                      <p className="text-[#0F2B4C] mt-1">
                        {r.quotedNgn != null ? naira(r.quotedNgn) : 'no quote'}
                        {r.quotedKm != null ? ` · ${r.quotedKm} km` : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                        Rider offered instead {r.wasCountered ? '' : '(nothing)'}
                      </p>
                      {r.wasCountered ? (
                        <>
                          {r.counterDropAddress && (
                            <p className="text-gray-700 text-xs">Drop off: {r.counterDropAddress}</p>
                          )}
                          <p className="text-[#0F2B4C] mt-1">
                            {r.counterQuotedNgn != null ? naira(r.counterQuotedNgn) : 'same price'}
                            {r.counterQuotedKm != null ? ` · ${r.counterQuotedKm} km` : ''}
                          </p>
                          <p className="text-gray-500 text-xs mt-1">countered {when(r.counteredAt)}</p>
                        </>
                      ) : (
                        <p className="text-gray-500 text-xs">The rider did not counter.</p>
                      )}
                    </div>
                  </div>

                  {/* The whole point of the screen: what each party actually said. */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">In their own words</p>
                    {!r.senderInstructions && !r.counterNote && !r.declineReason && (
                      <p className="text-gray-500 text-xs">Neither side left a note.</p>
                    )}
                    {r.senderInstructions && (
                      <div className="bg-white border border-[#E5E7EB] rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-500 mb-1">
                          {r.senderName ?? 'Sender'} · instructions
                        </p>
                        <p className="text-[#0F2B4C] whitespace-pre-wrap">{r.senderInstructions}</p>
                      </div>
                    )}
                    {r.counterNote && (
                      <div className="bg-white border border-[#E5E7EB] rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-500 mb-1">
                          {r.driverName ?? 'Rider'} · why the different offer
                        </p>
                        <p className="text-[#0F2B4C] whitespace-pre-wrap">{r.counterNote}</p>
                      </div>
                    )}
                    {r.declineReason && (
                      <div className="bg-white border border-red-100 rounded-lg p-3">
                        <p className="text-xs font-semibold text-red-600 mb-1">
                          {r.driverName ?? 'Rider'} · why they said no
                        </p>
                        <p className="text-[#0F2B4C] whitespace-pre-wrap">{r.declineReason}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs text-gray-500 pt-1">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> asked {when(r.createdAt)}
                    </span>
                    <span>answered {when(r.answeredAt)}</span>
                    <span>expires {when(r.expiresAt)}</span>
                    {r.deliveryId && (
                      <Link href={`/deliveries/${r.deliveryId}`} className="text-[#0F2B4C] font-semibold hover:underline">
                        open the delivery it became
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function InterstateTripBoard() {
  const [trips,   setTrips]   = useState<InterstateTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [status,  setStatus]  = useState<'active' | 'completed' | 'cancelled'>('active');
  /**
   * Find the run going somewhere.
   *
   * The daily question here is "is anybody driving to Kano this week",
   * and the only way to answer it was to read the board. The server
   * returns up to a hundred rows in departure order with no search, so
   * this filters what is loaded and says so rather than pretending to
   * be a server search.
   */
  const [q, setQ] = useState('');
  /**
   * Which trips are opened out.
   *
   * The board showed a from-city and a to-city, so a driver who declared
   * Jos, then Ibadan, then Lagos appeared to be driving straight
   * through. The header says matching happens by contacting the driver,
   * and that conversation is impossible without knowing which towns the
   * van passes and which seats are gone.
   */
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return trips;
    return trips.filter(t =>
      [t.fromCity, t.toCity, t.driver?.user?.name, t.driver?.user?.phone, t.driver?.vehicleType]
        .some(v => String(v ?? '').toLowerCase().includes(term)));
  }, [trips, q]);

  /**
   * A departure-date range, for audit.
   *
   * Without one the finished tabs keep to recent history, which is what an
   * operator wants day to day. Answering "what ran through Ibadan last March"
   * needs the range, and that question is the reason the rows are never
   * deleted in the first place.
   */
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');

  const load = () => {
    setLoading(true);
    setError(null);
    // The filter was pinned to 'active' though the API also serves
    // completed and cancelled, so half the board was unreachable.
    adminApi.interstateTrips.list(status, from || undefined, to || undefined)
      .then((data: any) => setTrips(Array.isArray(data) ? data : []))
      .catch((e: any) => setError(e?.message ?? 'Could not load trips'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, from, to]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <Truck size={18} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#0F2B4C]">Interstate Trip Board</h1>
          <p className="text-sm text-gray-500">
            Drivers declare planned intercity routes and spare capacity. Read-only for now: matching is done by contacting the driver.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['active', 'completed', 'cancelled'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border capitalize transition-colors ${
                status === s
                  ? 'bg-[#3A7BD5] text-white border-[#3A7BD5]'
                  : 'bg-white text-[#0F2B4C]/50 border-[#E5E7EB] hover:border-[#0F2B4C]/20'
              }`}
            >
              {s}
            </button>
          ))}
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#0F2B4C]/30" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Filter by city, driver or plate"
            className="w-full rounded-lg border border-[#E5E7EB] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#3A7BD5]"
          />
        </div>

        {/* Departure range. Empty means the default window, which is recent
            history on the finished tabs and everything upcoming on active. */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-[#0F2B4C]/50">Departing</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="rounded-lg border border-[#E5E7EB] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#3A7BD5]"
          />
          <span className="text-xs text-[#0F2B4C]/40">to</span>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="rounded-lg border border-[#E5E7EB] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#3A7BD5]"
          />
          {(from || to) && (
            <button
              onClick={() => { setFrom(''); setTo(''); }}
              className="rounded-lg border border-[#E5E7EB] bg-white px-2 py-1.5 text-xs font-semibold text-[#0F2B4C]/60 hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </div>
        <span className="text-xs text-[#0F2B4C]/50">
          {q.trim()
            ? `${shown.length} of ${trips.length} shown`
            : `${trips.length} trip${trips.length === 1 ? '' : 's'}`}
        </span>
        {/* The server caps this board at 100 and returns no total, so a
            busy week would silently stop at a hundred with nothing on
            screen to say the rest existed. */}
        {trips.length >= 100 && (
          <span className="rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
            Showing the first 100. There may be more.
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading active trips…
        </div>
      ) : shown.length === 0 ? (
        /* An outage used to render as "no declared intercity trips",
           which reads as a quiet week rather than a broken board. */
        <div className="bg-white rounded-xl border border-[#E5E7EB]">
          <EmptyState
            icon={<Truck size={20} />}
            title={
              error ? 'The board did not load'
                : q.trim() ? `Nothing matches "${q.trim()}"`
                : `No ${status} intercity trips`
            }
            body={
              error ? 'This does not mean no driver is travelling. Try again.'
                : q.trim() ? 'Clear the filter to see the whole board.'
                : 'Trips appear here as drivers declare them in the driver app.'
            }
            action={
              error ? { label: 'Try again', onClick: load }
                : q.trim() ? { label: 'Clear the filter', onClick: () => setQ('') }
                : undefined
            }
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
          {shown.map(t => {
            const depart = new Date(t.departAt);
            return (
              <div key={t.id} className="p-4">
               <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {((t.stops?.length ?? 0) > 0 || (t.seats?.length ?? 0) > 0) ? (
                    <button
                      onClick={() => setOpen(m => ({ ...m, [t.id]: !m[t.id] }))}
                      aria-label={open[t.id] ? 'Hide the route' : 'Show the stops and who is riding'}
                      className="rounded p-0.5 text-[#3A7BD5] hover:bg-[#3A7BD5]/10"
                    >
                      {open[t.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  ) : <span className="w-[22px]" />}
                  <MapPin size={14} className="text-[#16A34A]" />
                  <span className="font-semibold text-[#0F2B4C]">{t.fromCity}</span>
                  {/* The towns in between, named on the row itself. A trip
                      through Ibadan is a different trip from one that is
                      not, and the board could not tell them apart. */}
                  {(t.stops?.length ?? 0) > 2 && (
                    <span className="flex items-center gap-1 text-xs text-[#0F2B4C]/45">
                      <ArrowRight size={11} />
                      {t.stops!.slice(1, -1).map(x => x.city).join(', ')}
                    </span>
                  )}
                  <ArrowRight size={14} className="text-gray-400" />
                  <span className="font-semibold text-[#0F2B4C]">{t.toCity}</span>
                  {(t.seats?.length ?? 0) > 0 && (
                    <span className="rounded bg-[#3A7BD5]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#3A7BD5]">
                      {t.seats!.length} booked
                    </span>
                  )}
                </div>
                {/* The phone was typed on the interface and never
                    rendered, so ops could see who was driving to Kano and
                    had no way to reach them. Admins always see full name
                    and phone: that is deliberate on this dashboard. */}
                {/*
                  This page says in its own header that matching happens
                  by contacting the driver, and then printed the number
                  as plain text. Ringing them is the entire workflow, so
                  it is a tel: link now. The <a href> on the name was a
                  full page reload that threw away the filter you used to
                  find them.
                */}
                <span className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  {t.driver?.id ? (
                    <Link href={`/drivers/${t.driver.id}`} className="font-medium text-[#3A7BD5] hover:underline">
                      {t.driver?.user?.name ?? 'Unknown driver'}
                    </Link>
                  ) : (t.driver?.user?.name ?? 'Unknown driver')}
                  {t.driver?.vehicleType && <span className="text-gray-400">{t.driver.vehicleType}</span>}
                  {t.driver?.user?.phone && (
                    <a
                      href={`tel:${String(t.driver.user.phone).replace(/[^+\d]/g, '')}`}
                      className="inline-flex items-center gap-1 rounded border border-[#E5E7EB] px-2 py-1 font-semibold text-[#0F2B4C] hover:bg-gray-50"
                    >
                      <PhoneCall size={11} /> {t.driver.user.phone}
                    </a>
                  )}
                </span>
                <span className="text-xs text-gray-500">
                  {depart.toLocaleString('en-NG', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                  {/*
                    A trip whose departure time has passed but is still
                    marked active is a driver who forgot to close it, and
                    the board was presenting it as upcoming capacity
                    somebody could still book onto.
                  */}
                  {status === 'active' && depart.getTime() < Date.now() && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                      <Clock size={9} />
                      left {Math.floor((Date.now() - depart.getTime()) / 86400000) >= 1
                        ? `${Math.floor((Date.now() - depart.getTime()) / 86400000)}d ago`
                        : `${Math.floor((Date.now() - depart.getTime()) / 3600000)}h ago`}
                    </span>
                  )}
                </span>
                <span className="text-xs font-bold uppercase text-[#3A7BD5] bg-[#3A7BD5]/10 px-2 py-1 rounded">
                  {Number(t.spareCapacityKg).toFixed(0)} kg free
                </span>
               </div>

               {open[t.id] && (
                 <div className="mt-4 grid gap-5 border-t border-[#E5E7EB] pt-4 lg:grid-cols-2">
                   <div>
                     <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#0F2B4C]/45">
                       The route, in order
                     </p>
                     {(t.stops?.length ?? 0) === 0 ? (
                       <p className="text-sm text-[#0F2B4C]/50">
                         Only two cities were declared, with no stops in between.
                       </p>
                     ) : (
                       <ol className="space-y-2.5">
                         {t.stops!.map((st, i) => (
                           <li key={st.sequence} className="flex gap-3">
                             <div className="flex flex-col items-center">
                               <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                 i === 0 ? 'bg-emerald-100 text-emerald-700'
                                   : i === t.stops!.length - 1 ? 'bg-[#0F2B4C] text-white'
                                   : 'bg-gray-200 text-gray-700'
                               }`}>{i + 1}</span>
                               {i < t.stops!.length - 1 && <span className="mt-1 w-px flex-1 bg-gray-300" />}
                             </div>
                             <div className="min-w-0 pb-1">
                               <p className="text-sm font-semibold text-[#0F2B4C]">
                                 {st.city}
                                 <span className="ml-2 text-xs font-normal text-[#0F2B4C]/40">
                                   {i === 0 ? 'start' : i === t.stops!.length - 1 ? 'end' : 'stop'}
                                   {st.kmFromOrigin != null && ` · ${Number(st.kmFromOrigin).toFixed(0)} km in`}
                                 </span>
                               </p>
                               {st.address && <p className="text-xs text-[#0F2B4C]/50">{st.address}</p>}
                               {st.arrivedAt && (
                                 <p className="text-[11px] font-semibold text-emerald-700">
                                   Reached {new Date(st.arrivedAt).toLocaleString('en-NG')}
                                 </p>
                               )}
                             </div>
                           </li>
                         ))}
                       </ol>
                     )}
                   </div>

                   <div>
                     <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#0F2B4C]/45">
                       Who is riding, and between where
                     </p>
                     {(t.seats?.length ?? 0) === 0 ? (
                       <p className="text-sm text-[#0F2B4C]/50">
                         Nobody has booked a seat on this trip yet, so all of the spare capacity is free.
                       </p>
                     ) : (
                       <div className="space-y-2">
                         {t.seats!.map(b => (
                           <div key={b.id} className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2">
                             <div className="flex flex-wrap items-center gap-2">
                               {b.passengerUserId ? (
                                 <Link href={`/users/${b.passengerUserId}`} className="text-sm font-semibold text-[#3A7BD5] hover:underline">
                                   {b.passengerName ?? 'Unknown'}
                                 </Link>
                               ) : (
                                 <span className="text-sm font-semibold text-[#0F2B4C]">{b.passengerName ?? 'Unknown'}</span>
                               )}
                               <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-600">
                                 {seatStatus(b.status)}
                               </span>
                               {b.priceNgn != null && (
                                 <span className="ml-auto text-sm font-semibold text-[#0F2B4C]">
                                   {naira(b.priceNgn)}
                                 </span>
                               )}
                             </div>
                             <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#0F2B4C]/65">
                               <span className="font-medium">{b.boardCity ?? t.fromCity}</span>
                               <ArrowRight size={10} className="text-gray-400" />
                               <span className="font-medium">{b.alightCity ?? t.toCity}</span>
                               {b.segmentKm != null && (
                                 <span className="text-[#0F2B4C]/40">{Number(b.segmentKm).toFixed(0)} km of the route</span>
                               )}
                             </p>
                             {/* Where they are actually standing, which is the
                                 thing a driver rings to confirm. */}
                             {(b.boardAddress || b.alightAddress) && (
                               <p className="mt-0.5 text-[11px] leading-snug text-[#0F2B4C]/45">
                                 {b.boardAddress && <>Picked up: {b.boardAddress}</>}
                                 {b.boardAddress && b.alightAddress && <br />}
                                 {b.alightAddress && <>Dropped at: {b.alightAddress}</>}
                               </p>
                             )}
                             {b.passengerPhone && (
                               <a
                                 href={`tel:${String(b.passengerPhone).replace(/[^+\d]/g, '')}`}
                                 className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#3A7BD5] hover:underline"
                               >
                                 <PhoneCall size={11} /> {b.passengerPhone}
                               </a>
                             )}
                           </div>
                         ))}
                       </div>
                     )}
                   </div>
                 </div>
               )}
              </div>
            );
          })}
        </div>
      )}

      {/* The parcel marketplace, which had no admin view at all until now. */}
      <ParcelNegotiations />

      {/* Common routes reference */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/70 mb-3">Popular intercity corridors</h2>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {POPULAR.map(r => (
            <div key={`${r.from}-${r.to}`} className="bg-gray-50 rounded-lg p-3">
              <p className="font-semibold text-[#0F2B4C]">{r.from} → {r.to}</p>
              <p className="text-xs text-gray-500 mt-1">~{r.km} km</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
