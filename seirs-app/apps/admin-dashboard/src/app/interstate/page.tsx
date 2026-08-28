'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Truck, MapPin, ArrowRight, AlertCircle, Loader2, RefreshCw, PhoneCall, Search, Clock } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';

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
    user?: { id: string; name: string; phone?: string };
  };
}

const POPULAR = [
  { from: 'Lagos',  to: 'Ibadan', km: 145 },
  { from: 'Lagos',  to: 'Abuja',  km: 760 },
  { from: 'Ibadan', to: 'Abuja',  km: 605 },
  { from: 'Lagos',  to: 'Benin',  km: 320 },
  { from: 'Abuja',  to: 'Kano',   km: 350 },
  { from: 'Lagos',  to: 'Port Harcourt', km: 620 },
];

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

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return trips;
    return trips.filter(t =>
      [t.fromCity, t.toCity, t.driver?.user?.name, t.driver?.user?.phone, t.driver?.vehicleType]
        .some(v => String(v ?? '').toLowerCase().includes(term)));
  }, [trips, q]);

  const load = () => {
    setLoading(true);
    setError(null);
    // The filter was pinned to 'active' though the API also serves
    // completed and cancelled, so half the board was unreachable.
    adminApi.interstateTrips.list(status)
      .then((data: any) => setTrips(Array.isArray(data) ? data : []))
      .catch((e: any) => setError(e?.message ?? 'Could not load trips'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

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
              <div key={t.id} className="p-4 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <MapPin size={14} className="text-[#16A34A]" />
                  <span className="font-semibold text-[#0F2B4C]">{t.fromCity}</span>
                  <ArrowRight size={14} className="text-gray-400" />
                  <span className="font-semibold text-[#0F2B4C]">{t.toCity}</span>
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
            );
          })}
        </div>
      )}

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
