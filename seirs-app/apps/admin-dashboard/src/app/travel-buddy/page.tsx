'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users, AlertTriangle, Clock, MapPin, Loader2, RefreshCw, ArrowRight,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { naira } from '@/lib/money';

/**
 * Travel Buddy ops.
 *
 * Seats are the one product where SEIRS is not holding a parcel but a
 * person, and where a fare can be forfeited on one party's word. That
 * makes it the product most likely to produce an argument, and an
 * argument support cannot see into is an argument SEIRS loses.
 *
 * Four views the spec asked for, beside the existing drop review queue.
 * Every person named here is a link to their profile, because a name
 * that is only a string makes support retype an id to do anything about
 * it (standing rule, and the reason the driver list was changed too).
 */

type Tab = 'trips' | 'bookings' | 'noshows' | 'pending';

const TABS: Array<{ id: Tab; label: string; icon: any }> = [
  { id: 'trips',    label: 'Declared trips',   icon: MapPin },
  { id: 'bookings', label: 'Seat bookings',    icon: Users },
  { id: 'noshows',  label: 'Forfeited fares',  icon: AlertTriangle },
  { id: 'pending',  label: 'Awaiting payment', icon: Clock },
];

/** A person is a link, never a bare string. */
function PersonLink({ id, name }: { id?: string | null; name?: string | null }) {
  if (!id) return <span className="text-gray-400">{name ?? '-'}</span>;
  return (
    <Link href={`/users/${id}`} className="text-[#2563B0] hover:underline font-medium">
      {name ?? 'Unnamed'}
    </Link>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'booked' || status === 'boarded' || status === 'dropped'
      ? 'bg-green-100 text-green-700'
      : status === 'no_show' || status === 'cancelled' || status === 'declined'
      ? 'bg-red-100 text-red-700'
      : 'bg-amber-100 text-amber-700';
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function fmt(iso?: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-NG', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function TravelBuddyOpsPage() {
  const [tab, setTab] = useState<Tab>('trips');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data =
        tab === 'trips'    ? await adminApi.travelBuddy.trips()
      : tab === 'bookings' ? await adminApi.travelBuddy.bookings()
      : tab === 'noshows'  ? await adminApi.travelBuddy.noShows()
      :                      await adminApi.travelBuddy.pendingPayments();
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#0F2B4C]">Travel Buddy</h1>
          <p className="text-sm text-gray-500">
            Declared routes, who is riding which segment, and every fare somebody may dispute.
          </p>
        </div>
        <button
          onClick={load}
          className="ml-auto flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
              tab === id
                ? 'bg-[#0F2B4C] text-white'
                : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-gray-400">
            <Loader2 size={16} className="animate-spin" /> Loading
          </div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center text-sm text-gray-400">
            {tab === 'noshows'
              ? 'No forfeited fares. That is the good outcome.'
              : tab === 'pending'
              ? 'Nobody is keeping a rider waiting on payment.'
              : 'Nothing here yet.'}
          </div>
        ) : tab === 'trips' ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Route</th>
                <th className="px-4 py-3 text-left">Driver</th>
                <th className="px-4 py-3 text-left">Departs</th>
                <th className="px-4 py-3 text-left">Stops</th>
                <th className="px-4 py-3 text-left">Seats sold</th>
                <th className="px-4 py-3 text-left">Route km</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 font-medium text-gray-800">
                      {t.fromCity} <ArrowRight size={12} className="text-gray-400" /> {t.toCity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <PersonLink id={t.driverUserId} name={t.driverName} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{fmt(t.departAt)}</td>
                  <td className="px-4 py-3">
                    {t.legacyTwoCity ? (
                      <span
                        className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                        title="Declared before the stop model. Its seats are still priced across the whole route, not by segment."
                      >
                        two cities only
                      </span>
                    ) : (
                      <span className="text-gray-700">{t.stopCount}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {t.seatBookings} of {t.seatsTotal}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {t.routeKm == null ? '-' : `${t.routeKm} km`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : tab === 'noshows' ? (
          <div className="divide-y divide-gray-100">
            {rows.map((n) => (
              <div key={n.id} className="space-y-2 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status="no_show" />
                  <span className="font-semibold text-gray-800">{naira(n.priceNgn ?? 0)}</span>
                  <span className="text-sm text-gray-500">forfeited</span>
                  <span className="ml-auto text-xs text-gray-400">{fmt(n.noShowAt)}</span>
                </div>
                <div className="text-sm text-gray-600">
                  <PersonLink id={n.passengerUserId} name={n.passengerName} /> did not board at{' '}
                  <strong>{n.boardCity ?? 'their stop'}</strong>
                  {n.boardAddress ? ` (${n.boardAddress})` : ''}. Driver{' '}
                  <PersonLink id={n.driverUserId} name={n.driverName} /> waited{' '}
                  {n.waitedMinutes == null ? 'the agreed time' : `${n.waitedMinutes} minutes`} and made{' '}
                  {n.contactAttempts ?? 0} attempt{(n.contactAttempts ?? 0) === 1 ? '' : 's'} to reach them.
                </div>
                {/*
                  The trail is the whole point. A forfeited fare gets
                  disputed, and without the wait, the position and the
                  contact attempts in one place it is one person's word
                  against another and support has nothing to check.
                */}
                {Array.isArray(n.evidence) && n.evidence.length > 0 && (
                  <details className="rounded-lg bg-gray-50 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Evidence trail ({n.evidence.length})
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-gray-600">
                      {n.evidence.map((e: any, i: number) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-gray-400">{fmt(e.createdAt)}</span>
                          <span className="font-medium">{e.type.replace(/_/g, ' ')}</span>
                          <span className="text-gray-400">{e.actorRole}</span>
                          {e.lat != null && e.lng != null && (
                            <span className="text-gray-400">
                              {Number(e.lat).toFixed(4)}, {Number(e.lng).toFixed(4)}
                            </span>
                          )}
                          {e.note && <span className="italic text-gray-500">{e.note}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Passenger</th>
                <th className="px-4 py-3 text-left">Driver</th>
                <th className="px-4 py-3 text-left">Segment</th>
                <th className="px-4 py-3 text-left">Fare</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">
                  {tab === 'pending' ? 'Hold left' : 'Requested'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3">
                    <PersonLink id={b.passengerUserId} name={b.passengerName} />
                  </td>
                  <td className="px-4 py-3">
                    <PersonLink id={b.driverUserId} name={b.driverName} />
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {b.boardCity && b.alightCity ? (
                      <span className="flex items-center gap-1.5">
                        {b.boardCity} <ArrowRight size={11} className="text-gray-400" /> {b.alightCity}
                        {b.segmentKm != null && (
                          <span className="text-xs text-gray-400">{b.segmentKm} km</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-400">
                        {b.fromCity} to {b.toCity}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {naira(b.priceNgn ?? 0)}
                  </td>
                  <td className="px-4 py-3"><StatusPill status={b.status} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {tab === 'pending'
                      ? b.minutesLeft == null
                        ? '-'
                        : b.minutesLeft < 0
                        ? 'expired'
                        : `${b.minutesLeft} min`
                      : fmt(b.requestedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
