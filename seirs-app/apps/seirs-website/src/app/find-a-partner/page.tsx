'use client';

/**
 * Public "Find a Partner Store" page.
 *
 * Discovery surface for the Tier 3 partner-store-async scenario:
 *   - Customers wanting cheaper / more convenient drop-off
 *   - Recipients away from home wanting pickup at a nearby counter
 *   - Small businesses running high-volume shipping who prefer bulk
 *     drop at one partner vs door pickup for every parcel
 *   - Partner store owners who signed up expecting foot traffic
 *
 * Data comes from GET /api/v1/partner-store/directory - a public,
 * no-auth endpoint. Only KYC-approved partners that are currently
 * accepting new drop-offs are returned. Owner phone, KYC docs, and
 * capacity numbers are never on the wire here.
 *
 * v1 is a searchable list. If the visitor grants browser geolocation,
 * results are re-sorted by Haversine distance from them (backend does
 * the SQL math). Stores without coordinates appear at the end of the
 * distance-sorted list. Follow-up: static map view once we have a
 * reasonable number of stores with coordinates.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPin, Phone, Clock, Search, Store, ExternalLink, Navigation } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://seirs-logistics-mobile-production.up.railway.app/api/v1';

interface PartnerStoreDTO {
  id:            string;
  storeName:     string;
  storeAddress:  string;
  phone:         string;
  operatingDays: string[];
  openTime:      string;
  closeTime:     string;
  lat:           number | null;
  lng:           number | null;
  distanceKm:    number | null;
}

interface DirectoryResponse {
  total:  number;
  limit:  number;
  offset: number;
  items:  PartnerStoreDTO[];
}

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatDays(days: string[]): string {
  if (!days || days.length === 0) return 'Hours unavailable';
  if (days.length === 7) return 'Every day';
  const sorted = [...days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  // Detect a contiguous span for a friendly "Mon - Sat" render.
  const idxs = sorted.map(d => DAY_ORDER.indexOf(d));
  const isContiguous = idxs.every((v, i) => i === 0 || v === idxs[i - 1] + 1);
  if (isContiguous && sorted.length > 2) {
    return `${sorted[0]} - ${sorted[sorted.length - 1]}`;
  }
  return sorted.join(', ');
}

function formatTime(t: string): string {
  // Backend stores as "HH:mm" (24h). Render as e.g. "8:00 AM".
  const [h, m] = (t || '').split(':').map(Number);
  if (isNaN(h)) return t || '';
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr}:${String(m).padStart(2, '0')} ${period}`;
}

export default function FindAPartnerPage() {
  const [q,        setQ]        = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [data,     setData]     = useState<DirectoryResponse | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [userLoc,  setUserLoc]  = useState<{ lat: number; lng: number } | null>(null);
  const [locState, setLocState] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocState('denied');
      return;
    }
    setLocState('requesting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocState('granted');
      },
      () => setLocState('denied'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQ) params.set('q', debouncedQ);
      if (userLoc) {
        params.set('lat', String(userLoc.lat));
        params.set('lng', String(userLoc.lng));
      }
      const res = await fetch(`${API_BASE}/partner-store/directory?${params.toString()}`);
      if (!res.ok) throw new Error('Could not load partner stores');
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, userLoc]);

  useEffect(() => { load(); }, [load]);

  const totalCount = data?.total ?? 0;

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
              <Store size={14} className="text-sky" />
              Partner network
            </div>
            <h1 className="text-3xl font-black leading-tight sm:text-4xl md:text-5xl">
              Find a Seirs partner store near you
            </h1>
            <p className="mt-4 text-lg text-white/70">
              Drop off a package on your way home, or pick up a delivery from a
              trusted local counter. Every partner is KYC-verified and open
              during posted hours.
            </p>
          </div>

          {/* Search + geolocation */}
          <div className="mt-8 flex max-w-xl flex-col gap-2 sm:flex-row">
            <label className="relative block flex-1">
              <span className="sr-only">Search partner stores</span>
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by store name or area (e.g. Yaba, Ikeja)"
                className="w-full rounded-xl border border-white/20 bg-white py-3.5 pl-11 pr-4 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/50"
              />
            </label>
            <button
              onClick={requestLocation}
              disabled={locState === 'requesting'}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-60"
              title={locState === 'granted' ? 'Location shared. Results sorted by distance.' : 'Sort by nearest to you.'}
            >
              <Navigation size={15} />
              {locState === 'granted'    ? 'Using your location'
                : locState === 'requesting' ? 'Requesting…'
                : locState === 'denied'  ? 'Try again'
                : 'Nearest to me'}
            </button>
          </div>
        </div>
      </section>

      {/* Directory */}
      <section className="mx-auto max-w-5xl px-4 py-10">
        {/* Result meta */}
        <div className="mb-6 flex items-baseline justify-between">
          <div className="text-sm text-slate-600">
            {loading
              ? 'Loading partners...'
              : error
                ? 'Directory unavailable'
                : `${totalCount} ${totalCount === 1 ? 'partner' : 'partners'} ${debouncedQ ? `matching "${debouncedQ}"` : 'in the network'}`}
          </div>
          <Link
            href="/for-partner-stores"
            className="text-sm font-semibold text-sky hover:underline"
          >
            Want to become a partner?
          </Link>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}. Please try again in a moment.
          </div>
        )}

        {!loading && !error && data && data.items.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-10 text-center">
            <Store size={40} className="mx-auto mb-3 text-slate-400" />
            <div className="text-sm font-bold text-slate-800">No partners match your search</div>
            <div className="mt-1 text-sm text-slate-600">
              Try a different area, or clear the search to see everyone.
            </div>
            {debouncedQ && (
              <button
                onClick={() => setQ('')}
                className="mt-4 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-dark"
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {!loading && !error && data && data.items.length > 0 && (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((s) => (
              <li
                key={s.id}
                className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-sky/50 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky/10">
                    <Store size={20} className="text-sky" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-900" title={s.storeName}>{s.storeName}</div>
                    <div className="mt-0.5 flex items-start gap-1.5 text-xs text-slate-600">
                      <MapPin size={12} className="mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{s.storeAddress || 'Address on request'}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs">
                  {s.distanceKm != null && (
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky/10 px-2 py-0.5 font-semibold text-sky">
                        <Navigation size={10} />
                        {s.distanceKm < 1
                          ? `${Math.round(s.distanceKm * 1000)} m away`
                          : `${s.distanceKm.toFixed(1)} km away`}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Clock size={12} className="text-slate-400" />
                    <span className="font-medium">{formatDays(s.operatingDays)}</span>
                    <span className="text-slate-400">·</span>
                    <span>{formatTime(s.openTime)} - {formatTime(s.closeTime)}</span>
                  </div>
                  {s.phone && (
                    <a
                      href={`tel:${s.phone}`}
                      className="flex items-center gap-1.5 text-slate-700 hover:text-sky"
                    >
                      <Phone size={12} className="text-slate-400" />
                      <span className="font-medium">{s.phone}</span>
                    </a>
                  )}
                </div>

                {s.lat != null && s.lng != null && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-sky hover:underline"
                  >
                    Get directions <ExternalLink size={11} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* CTA to Send flow */}
        <div className="mt-16 rounded-2xl bg-gradient-to-br from-navy to-navy-dark p-8 text-center text-white sm:p-10">
          <h2 className="text-2xl font-black sm:text-3xl">Ready to send with Seirs?</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/70">
            Choose a partner drop-off in the customer app to save on pickup fees,
            or schedule a door pickup. Both flows track live in the app and at
            seirs.app/track.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/how-it-works"
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-bold text-navy hover:bg-slate-100"
            >
              How it works
            </Link>
            <Link
              href="/for-business"
              className="rounded-lg border border-white/30 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10"
            >
              For businesses
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
