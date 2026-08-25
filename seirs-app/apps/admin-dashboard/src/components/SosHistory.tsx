'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Siren, AlertTriangle } from 'lucide-react';
import { adminApi } from '@/lib/api';

/**
 * SOS on a person's own record.
 *
 * The founder raised an SOS as a driver, resolved it from the SOS Desk
 * and wrote a resolution note, then opened that driver's profile and
 * found no trace of any of it (2026-08-25: "it doesn't show on their
 * person's account like number of SOS so admin or support can review it
 * or logged anywhere").
 *
 * A pattern of SOS events on one person is a safety signal in both
 * directions: a rider genuinely in danger on a route, or somebody
 * leaning on the button. Neither is readable if the only surface that
 * ever shows an alert drops it the moment it is closed.
 *
 * WHAT THIS CAN AND CANNOT SHOW, and why.
 *
 * `GET /sos/active` is the only SOS read endpoint that exists, and its
 * WHERE clause is `status = 'active'`. Nothing else in the backend
 * reads the sos_alerts table: the admin module never touches it, the
 * NDPR export bundle omits it, and SosService.resolve writes no audit
 * row. So a resolved alert, its note and its resolution note become
 * unreachable through the API the instant support closes it. The rows
 * are all still in Postgres with `note`, `resolutionNote`, `resolvedAt`
 * and `resolvedBy` intact; there is simply no route that returns them.
 *
 * So this renders in one of two modes.
 *
 *   `alerts` given: the person's full history, straight from the detail
 *   payload. Nothing sends it today. It is read anyway so that the day
 *   AdminService.getUserDetail / getDriverDetail adds one more branch
 *   to its Promise.all (sosRepo.find on that user, newest first), the
 *   history appears here with no second edit on the dashboard.
 *
 *   `alerts` absent: live alerts only, fetched from the SOS desk feed,
 *   plus a note saying in plain words that the past is not readable.
 *   An empty panel without that note would read as "this person has
 *   never pressed SOS", which is a different and dangerous claim.
 */
export function SosHistory({
  userId, personLabel, alerts,
}: {
  userId?:      string;
  personLabel:  string;
  /** Every alert this person has raised, newest first, when the server sends them. */
  alerts?:      any[] | null;
}) {
  const history = Array.isArray(alerts) ? alerts : null;
  const [live,  setLive]  = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    /* The desk feed is only a stand-in for history. When the server
       sends the real thing, skip the extra request entirely. */
    if (!userId || history) return;
    let alive = true;
    adminApi.sos.active()
      .then((rows: any) => {
        if (!alive) return;
        const list = Array.isArray(rows) ? rows : [];
        setLive(list.filter((a: any) => a?.user?.id === userId));
      })
      .catch((e: any) => { if (alive) setError(e?.message ?? 'Could not load SOS alerts'); });
    return () => { alive = false; };
  }, [userId, history]);

  if (!userId) return null;

  const fmt = (d: any) => d
    ? new Date(d).toLocaleString('en-NG', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '-';

  const rows       = history ?? live;
  const activeRows = (rows ?? []).filter((a: any) => String(a?.status ?? 'active') === 'active');

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
      <h3 className="text-sm font-bold text-[#0F2B4C] mb-3 flex items-center gap-1.5">
        <Siren size={14} className={activeRows.length > 0 ? 'text-red-600' : 'text-gray-400'} />
        Safety and SOS
        {history && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
            {history.length} on record
          </span>
        )}
        {activeRows.length > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
            {activeRows.length} live now
          </span>
        )}
      </h3>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {rows === null && !error && (
        <p className="text-sm text-gray-400">Checking the SOS desk...</p>
      )}

      {rows !== null && rows.length === 0 && (
        <p className="text-sm text-gray-500">
          {history
            ? `${personLabel} has never pressed SOS.`
            : `No alert from ${personLabel} is open right now.`}
        </p>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((a: any) => {
            const status = String(a?.status ?? 'active');
            const isLive = status === 'active';
            return (
              <div
                key={a.id}
                className={`rounded-lg border p-3 ${isLive ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${
                    isLive ? 'bg-red-600' : status === 'cancelled' ? 'bg-gray-500' : 'bg-green-700'
                  }`}>
                    {isLive ? 'Active' : status}
                  </span>
                  <span className={`text-xs font-semibold ${isLive ? 'text-red-900' : 'text-gray-700'}`}>
                    {fmt(a.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-[#0F2B4C]">
                  {a.note?.trim()
                    ? a.note
                    : 'No note was given. The button was pressed on its own, which is normal: detail must never gate the alarm.'}
                </p>

                {/* What support did about it. The whole point of finding
                    3: a resolution note that only ever lived in a queue
                    nobody revisits is not a record. */}
                {!isLive && (a.resolvedAt || a.resolutionNote || a.resolvedBy) && (
                  <div className="mt-2 rounded border border-gray-200 bg-white px-2.5 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                      Closed {a.resolvedAt ? fmt(a.resolvedAt) : 'at an unrecorded time'}
                      {a.resolvedBy?.name ? ` by ${a.resolvedBy.name}` : ''}
                    </p>
                    <p className="mt-0.5 text-sm text-[#0F2B4C]">
                      {a.resolutionNote?.trim() || 'Closed with no resolution note.'}
                    </p>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
                  {isLive && (
                    <Link href="/sos" className="text-[#3A7BD5] hover:underline">
                      Open the SOS desk
                    </Link>
                  )}
                  {a.delivery?.id && (
                    <Link href={`/deliveries/${a.delivery.id}`} className="text-[#3A7BD5] hover:underline">
                      The run they were on
                    </Link>
                  )}
                  {a.lat != null && a.lng != null && (
                    <Link
                      href={`/ops-map?lat=${a.lat}&lng=${a.lng}&label=${encodeURIComponent('SOS · ' + personLabel)}&from=${encodeURIComponent('/sos')}&fromLabel=${encodeURIComponent('Back to the SOS desk')}`}
                      className="text-[#3A7BD5] hover:underline"
                    >
                      Where they pressed it
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Say what is missing, in place. An empty panel here would read as
          "never pressed SOS", which is a different and dangerous claim. */}
      {!history && (
        <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
          <span className="font-semibold text-gray-700">Past alerts are not readable yet.</span>{' '}
          Every SOS is stored with its note, who closed it, when, and the
          resolution note support wrote, but the only endpoint that reads the
          table returns alerts that are still open, so a closed one cannot be
          fetched by any screen. Counting {personLabel}&apos;s history needs the
          server to return that person&apos;s sos_alerts rows on this profile;
          this dashboard will not guess at it.
        </div>
      )}
    </div>
  );
}
