'use client';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { useSearchParams } from 'next/navigation';
import { Bike, Car, Truck, Star, AlertCircle, Search, WifiOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  approved:  'bg-emerald-100 text-emerald-700',
  suspended: 'bg-red-100 text-red-700',
  rejected:  'bg-[#0F2B4C]/5 text-[#0F2B4C]/50',
};

const VEHICLE_ICONS: Record<string, LucideIcon> = {
  bicycle: Bike, motorcycle: Bike, tricycle: Truck, car: Car, van: Truck,
};

function DriversContent() {
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') ?? '';

  const [data, setData]       = useState<any>(null);
  /**
   * Joined between, as YYYY-MM-DD.
   *
   * Passed to the loader as arguments rather than read from state inside
   * it: a handler that sets state and loads in the same tick reads the
   * previous value out of the closure and fetches one edit behind. The
   * audit log already worked this way and it is not a style choice.
   */
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  /**
   * Find a driver. There was no way to.
   *
   * The dashboard has always appended &search= to this request and the
   * server discarded it, so even the assign-driver dialog's search box
   * was decorative. This page did not have a box at all: you found a
   * rider by reading the table. Fixed on the server 2026-08-28, so the
   * control can finally exist here.
   */
  const [search, setSearch]   = useState('');
  const confirm               = useConfirm();

  const load = (p = 1, term = search, f = from, t = to) => {
    setLoading(true);
    setError(null);
    adminApi.drivers(p, statusFilter || undefined, term.trim() || undefined, f || undefined, t || undefined)
      .then(setData)
      // A 403 or a cold backend used to render as an empty driver list.
      .catch((e: any) => setError(e?.message ?? 'Could not load drivers'))
      .finally(() => setLoading(false));
    setPage(p);
  };

  useEffect(() => { load(1); }, [statusFilter]);

  // Debounced, so typing a plate does not fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => load(1, search), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const approve = async (id: string) => {
    await adminApi.approveDriver(id);
    load(page);
  };

  /**
   * Bring a suspended rider back. updateDriverStatus is a plain setter,
   * so approve is also reactivate. A suspended driver had NO action on
   * this row at all, which made suspension look one-way from the only
   * screen that performs it.
   */
  const reactivate = async (id: string, name?: string) => {
    const ok = await confirm({
      title:        'Put this driver back on the road?',
      message:      `${name ?? 'They'} will start receiving dispatch offers again immediately.`,
      confirmLabel: 'Reactivate',
    });
    if (!ok) return;
    await adminApi.approveDriver(id);
    load(page);
  };

  const suspend = async (id: string) => {
    const ok = await confirm({
      title:        'Suspend this driver?',
      message:      'They will stop receiving new dispatch offers immediately. Any active in-progress trip continues to completion. Reactivate anytime from the driver detail page.',
      confirmLabel: 'Suspend',
      danger:       true,
    });
    if (!ok) return;
    await adminApi.suspendDriver(id);
    load(page);
  };

  return (
    <div className="min-h-screen">
      <main className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#0F2B4C]">Drivers</h1>
          <div className="flex gap-2">
            {/* Rejected was missing, so a rejected application could not
                be listed and therefore could not be reconsidered from
                anywhere. Link, not <a>: filtering forced a full reload. */}
            {['', 'pending', 'approved', 'suspended', 'rejected'].map((s) => (
              <Link
                key={s || 'all'}
                href={s ? `/drivers?status=${s}` : '/drivers'}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  statusFilter === s
                    ? 'bg-[#3A7BD5] text-white border-[#3A7BD5]'
                    : 'bg-white text-[#0F2B4C]/50 border-[#E5E7EB] hover:border-[#0F2B4C]/20'
                }`}
              >
                {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
              </Link>
            ))}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xl">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#0F2B4C]/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone, SEIRS ID or vehicle plate"
              className="w-full rounded-lg border border-[#E5E7EB] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#3A7BD5]"
            />
          </div>

          {/* Joined between.

              Ranged on the column this list is ordered by, so the window
              and the paging through it agree. The end date covers its whole
              day: a range ending on the 5th that stopped at midnight would
              drop everything from the 5th, and the result still looks like
              a plausible list, which is why that bug survives review. */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[#0F2B4C]/50">Joined</span>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => { setFrom(e.target.value); load(1, search, e.target.value, to); }}
              className="rounded-lg border border-[#E5E7EB] bg-white px-2 py-1.5 outline-none focus:border-[#3A7BD5]"
            />
            <span className="text-[#0F2B4C]/40">to</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => { setTo(e.target.value); load(1, search, from, e.target.value); }}
              className="rounded-lg border border-[#E5E7EB] bg-white px-2 py-1.5 outline-none focus:border-[#3A7BD5]"
            />
            {(from || to) && (
              <button
                onClick={() => { setFrom(''); setTo(''); load(1, search, '', ''); }}
                className="font-semibold text-[#3A7BD5] hover:underline"
              >
                Clear dates
              </button>
            )}
          </div>
          {search.trim() !== '' && (
            <span className="text-xs text-[#0F2B4C]/50">
              {data?.total ?? 0} match{(data?.total ?? 0) === 1 ? '' : 'es'}
            </span>
          )}
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => load(page)} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-[#0F2B4C]/30">Loading…</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F5F0] border-b border-[#E5E7EB]">
                <tr>
                  {['Driver', 'SEIRS ID', 'Vehicle', 'Status', 'Online', 'Rating', 'Deliveries', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-semibold text-[#0F2B4C]/40 text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F0]">
                {data?.drivers?.map((d: any) => {
                  const VehicleIcon = VEHICLE_ICONS[d.vehicleType] ?? Car;
                  return (
                    <tr key={d.id} className="hover:bg-[#F5F5F0] transition-colors">
                      <td className="px-4 py-3">
                        <a href={`/drivers/${d.id}`} className="font-medium text-[#0F2B4C] hover:text-[#3A7BD5] transition-colors">{d.user?.name}</a>
                        <div className="text-xs text-[#0F2B4C]/40">{d.user?.email}</div>
                        {/* A customer is told to check the driver's face
                            before handing over a package, so a missing
                            photo is an onboarding gap worth chasing. */}
                        {!d.user?.profilePhoto && (
                          <div className="text-[10px] text-[#B45309] mt-0.5">No profile photo</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {d.user?.accountId ? (
                          <span className="text-xs font-mono text-[#0F2B4C]/70">{d.user.accountId}</span>
                        ) : (
                          <span className="text-xs text-[#0F2B4C]/30">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <VehicleIcon size={14} className="text-[#0F2B4C]/50" />
                          <span className="text-xs text-[#0F2B4C]/60 capitalize">{d.vehicleType}</span>
                        </div>
                        {/* The plate is what a customer reporting a
                            vehicle actually has, so it belongs on the
                            row and not two clicks away. */}
                        {d.vehiclePlate && (
                          <div className="mt-0.5 font-mono text-[10px] uppercase text-[#0F2B4C]/40">
                            {d.vehiclePlate}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[d.status] ?? ''}`}>
                          {d.status}
                        </span>
                      </td>
                      {/*
                        Online is a flag the app sets, not a fact. A rider
                        whose last position is an hour old is marked
                        online and is a pin sitting where they no longer
                        are, which is the same lie the ops map was telling
                        until it started flagging stale pings. Dispatch
                        reads this column to decide who can take a job, so
                        it says which kind of online this is.
                      */}
                      <td className="px-4 py-3">
                        {(() => {
                          const seen  = d.locationUpdatedAt ?? d.lastOnlineAt;
                          const mins  = seen
                            ? Math.round((Date.now() - new Date(seen).getTime()) / 60000)
                            : null;
                          const stale = d.isOnline && mins != null && mins > 15;
                          return (
                            <>
                              <div className="flex items-center gap-1.5">
                                <span className={`inline-block w-2 h-2 rounded-full ${
                                  stale ? 'bg-amber-500' : d.isOnline ? 'bg-emerald-500' : 'bg-[#0F2B4C]/20'
                                }`} />
                                <span className="text-xs text-[#0F2B4C]/50">
                                  {d.isOnline ? 'Online' : 'Offline'}
                                </span>
                              </div>
                              {stale && (
                                <div className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-amber-700"
                                     title={`Last position ${new Date(seen).toLocaleString('en-NG')}`}>
                                  <WifiOff size={9} />
                                  no ping {mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {/* Number(null).toFixed(1) is "0.0", so every brand-new
                            driver read as the worst on the platform. A dash
                            says "no ratings yet", which is the actual fact. */}
                        {d.rating == null ? (
                          <span className="text-[#0F2B4C]/30" title="No ratings yet">-</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Star size={12} fill="#FFBE0B" color="#FFBE0B" />
                            <span className="font-semibold text-[#0F2B4C]">{Number(d.rating).toFixed(1)}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#0F2B4C]/70">{d.totalDeliveries}</td>
                      <td className="px-4 py-3 flex gap-2">
                        {d.status === 'pending' && (
                          <button onClick={() => approve(d.id)} className="text-xs bg-emerald-500 text-white px-2 py-1 rounded-lg hover:bg-emerald-600 font-medium transition-colors">
                            Approve
                          </button>
                        )}
                        {d.status === 'approved' && (
                          <button onClick={() => suspend(d.id)} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg hover:bg-red-200 font-medium transition-colors">
                            Suspend
                          </button>
                        )}
                        {/* A suspended or rejected rider had no action
                            here, so both states read as permanent from
                            the one screen that sets them. */}
                        {(d.status === 'suspended' || d.status === 'rejected') && (
                          <button
                            onClick={() => reactivate(d.id, d.user?.name)}
                            className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-100 font-medium transition-colors"
                          >
                            Reactivate
                          </button>
                        )}
                        <Link
                          href={`/drivers/${d.id}`}
                          className="text-xs text-[#3A7BD5] px-2 py-1 rounded-lg hover:bg-[#3A7BD5]/5 font-medium transition-colors"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data?.drivers?.length === 0 && (
              <div className="text-center py-16 text-[#0F2B4C]/30">
                {search.trim() ? `No driver matches "${search.trim()}"` : 'No drivers found'}
              </div>
            )}
          </div>
        )}

        {/*
          There was no pagination on this page at all. Not a broken
          control: none. The server pages at 20, so the moment SEIRS had
          a twenty first rider they were invisible here, with nothing on
          screen to suggest anything was missing. Same pager as
          Deliveries, driven by the total.
        */}
        {!loading && (() => {
          const total    = Number(data?.total ?? 0);
          const perPage  = Number(data?.limit ?? 20);
          const lastPage = Math.max(1, Math.ceil(total / perPage));
          const firstRow = total === 0 ? 0 : (page - 1) * perPage + 1;
          const lastRow  = Math.min(page * perPage, total);
          return (
            <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm text-[#0F2B4C]/50">
              <span className="tabular-nums">
                {total === 0
                  ? 'No drivers'
                  : `Showing ${firstRow.toLocaleString()}-${lastRow.toLocaleString()} of ${total.toLocaleString()}`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => load(1)}
                  disabled={page <= 1}
                  className="px-2.5 py-1.5 rounded-lg border border-[#E5E7EB] hover:bg-[#F5F5F0] disabled:opacity-40 transition-colors text-xs font-medium"
                >
                  First
                </button>
                <button
                  onClick={() => load(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] hover:bg-[#F5F5F0] disabled:opacity-40 transition-colors text-xs font-medium"
                >
                  Prev
                </button>
                <span className="px-3 py-1.5 text-xs tabular-nums">Page {page} of {lastPage}</span>
                <button
                  onClick={() => load(page + 1)}
                  disabled={page >= lastPage}
                  className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] hover:bg-[#F5F5F0] disabled:opacity-40 transition-colors text-xs font-medium"
                >
                  Next
                </button>
                <button
                  onClick={() => load(lastPage)}
                  disabled={page >= lastPage}
                  className="px-2.5 py-1.5 rounded-lg border border-[#E5E7EB] hover:bg-[#F5F5F0] disabled:opacity-40 transition-colors text-xs font-medium"
                >
                  Last
                </button>
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
}

export default function DriversPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-[#0F2B4C]/30">Loading…</div>}>
      <DriversContent />
    </Suspense>
  );
}
