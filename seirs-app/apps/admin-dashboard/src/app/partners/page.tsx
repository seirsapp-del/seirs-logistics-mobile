'use client';

/**
 * Partner stores: the shops that hold SEIRS packages.
 *
 * One job. see every shop currently allowed to take packages on SEIRS's
 * behalf, and stop one that has become a problem. Approving a new
 * applicant is a different job on a different screen (Partner
 * applications), which is why the only decision here is Suspend.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Store, Search, MapPin, Package, Store as StoreIcon, AlertTriangle, AlertCircle, SearchX, ClipboardCheck } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm, usePrompt, useNotify } from '@/components/ConfirmDialog';

// Faded design-preview rows shown when there are ZERO real partner stores.
// Purpose: preview the intended layout so a real admin isn't looking at a
// blank page. Rendered greyed-out with a "Preview" chip so nobody mistakes
// them for live data. Deleted the moment even one real partner exists.
const PREVIEW_ROWS = [
  { name: 'Lagos Fresh Market', owner: 'Adebayo Okonkwo', location: 'Ikeja, Lagos',       capacity: '50 orders/day', status: 'Active' },
  { name: 'Abuja Superstore',   owner: 'Fatima Al-Hassan', location: 'Wuse, Abuja',        capacity: '30 orders/day', status: 'Active' },
  { name: 'PH Depot Express',   owner: 'Chukwuemeka Eze',  location: 'GRA, Port Harcourt', capacity: '20 orders/day', status: 'Pending' },
];

const STATUS_STYLES: Record<string, string> = {
  approved:        'bg-emerald-100 text-emerald-700',
  pending_review:  'bg-amber-100 text-amber-700',
  suspended:       'bg-red-100 text-red-700',
  rejected:        'bg-gray-100 text-gray-600',
  // Legacy "active" value tolerated in old rows
  active:          'bg-emerald-100 text-emerald-700',
};

const STATUS_LABEL: Record<string, string> = {
  approved:       'Approved',
  pending_review: 'Pending',
  suspended:      'Suspended',
  rejected:       'Rejected',
  active:         'Approved',
};

export default function PartnersPage() {
  const router                = useRouter();
  const confirm               = useConfirm();
  const prompt                = usePrompt();
  const notify                = useNotify();
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<string>('');
  const [search, setSearch]   = useState('');
  const [error,  setError]    = useState<string | null>(null);

  // A swallowed failure looked exactly like "no partner stores yet".
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    adminApi.partnerStores.list(filter || undefined)
      .then(setRows)
      .catch((e: any) => { setRows([]); setError(e?.message ?? 'Could not load partner stores'); })
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (r.storeName ?? '').toLowerCase().includes(q) ||
      (r.storeAddress ?? '').toLowerCase().includes(q) ||
      (r.phone ?? '').includes(q),
    );
  }, [rows, search]);

  // A failed request also leaves rows empty, and showing the "no partner
  // stores yet" design preview on a 403 tells the admin the opposite of
  // what happened.
  const isEmpty = !loading && !error && rows.length === 0;
  const stats = useMemo(() => {
    const approved = rows.filter((r) => r.status === 'approved' || r.status === 'active').length;
    const pending  = rows.filter((r) => r.status === 'pending_review').length;
    return { total: rows.length, approved, pending };
  }, [rows]);

  return (
    <div className="p-6 space-y-6">
      <PageIntro
        title="Partner stores"
        purpose="Every shop allowed to hold SEIRS packages for collection, and the one control that stops a shop that has become a problem."
        storageKey="partners"
        help={
          <>
            <p><b>Suspend</b> takes effect straight away: the shop stops being offered as a drop-off point, and the owner loses the partner screens in their SEIRS business app. Packages already sitting in that shop still have to be collected, so ring them.</p>
            <p><b>Re-approve</b> puts it all back. Suspension is not permanent and nothing is deleted.</p>
            <p><b>No map location</b> on a row is serious: that shop cannot be dispatched to at all, because riders are never sent to a place with no coordinates. Fix it on the store's own page.</p>
            <p>New applicants are approved on <Link className="font-semibold text-[#3A7BD5] hover:underline" href="/partner-applications">Partner applications</Link>, not here.</p>
          </>
        }
        actions={
          <Link
            href="/partner-applications"
            className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#2f6cc0] transition-colors"
          >
            <ClipboardCheck size={15} />
            Review new applications
          </Link>
        }
      />

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => load()} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Shops on the platform',       value: loading ? '-' : stats.total,    icon: Store },
          { label: 'Taking packages today',       value: loading ? '-' : stats.approved, icon: Package },
          { label: 'Waiting to be looked at',     value: loading ? '-' : stats.pending,  icon: MapPin },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#0F2B4C]/8 flex items-center justify-center">
              <Icon size={18} className="text-[#0F2B4C]" />
            </div>
            <div>
              <div className="text-xl font-bold text-[#0F2B4C]">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2">
        {[
          { key: '',                label: 'All' },
          { key: 'approved',        label: 'Approved' },
          { key: 'pending_review',  label: 'Pending' },
          { key: 'suspended',       label: 'Suspended' },
          { key: 'rejected',        label: 'Rejected' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filter === f.key
                ? 'bg-[#3A7BD5] text-white border-[#3A7BD5]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-[#0F2B4C]/20'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          {/* "12 partners" while a search was running was a count of the
              matches presented as a count of the estate. */}
          <span className="text-sm font-semibold text-[#0F2B4C]">
            {loading
              ? 'Loading…'
              : search.trim()
                ? `${filtered.length} of ${rows.length} shop${rows.length === 1 ? '' : 's'} match "${search.trim()}"`
                : `${rows.length} shop${rows.length === 1 ? '' : 's'}${filter ? ' in this list' : ''}`}
          </span>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
            <Search size={13} className="text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-sm bg-transparent outline-none placeholder:text-gray-400 w-56"
              placeholder="Shop name, address or phone"
            />
          </div>
        </div>

        {!loading && error && rows.length === 0 ? (
          <EmptyState
            icon={<AlertCircle size={20} />}
            title="The list of shops would not load"
            body={`${error} Nothing has changed for the shops themselves: this is only the dashboard failing to read them.`}
            action={{ label: 'Try again', onClick: () => load() }}
          />
        ) : !loading && rows.length > 0 && filtered.length === 0 ? (
          /* A search matching nothing rendered an empty table body with
             no message: the admin was left staring at the headings. */
          <EmptyState
            icon={<SearchX size={20} />}
            title={`No shop matches "${search.trim()}"`}
            body="Search runs over every shop on this list, by name, address and phone. Try part of the name, or clear the status filter above."
            action={{ label: 'Clear the search', onClick: () => setSearch('') }}
          />
        ) : isEmpty ? (
          // Empty state with a faded design preview so ops can still see the
          // intended layout while waiting for real partners to sign up.
          <div className="p-8">
            <div className="text-center mb-6">
              <StoreIcon size={40} className="text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-[#0F2B4C]">
                {filter ? 'No shop is in this state right now' : 'No shop has been approved yet'}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {filter
                  ? 'Nothing is wrong. Try All above to see every shop.'
                  : 'Shops appear here once their application is approved.'}{' '}
                <Link href="/partner-applications" className="text-[#3A7BD5] hover:underline">
                  See who has applied
                </Link>
                . The rows below are an example of how this list will look, not real shops.
              </p>
            </div>
            <div className="relative rounded-lg border border-dashed border-gray-200 overflow-hidden">
              <div className="absolute top-2 right-2 z-10 text-xs bg-white/95 border border-gray-200 rounded-full px-2 py-0.5 font-medium text-gray-500">
                Design preview
              </div>
              <table className="w-full text-sm opacity-40 pointer-events-none select-none">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Store Name</th>
                    <th className="text-left px-4 py-3">Owner</th>
                    <th className="text-left px-4 py-3">Location</th>
                    <th className="text-left px-4 py-3">Capacity</th>
                    <th className="text-left px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {PREVIEW_ROWS.map((p) => (
                    <tr key={p.name}>
                      <td className="px-4 py-3 font-medium text-[#0F2B4C]">{p.name}</td>
                      <td className="px-4 py-3 text-gray-600">{p.owner}</td>
                      <td className="px-4 py-3 text-gray-600">{p.location}</td>
                      <td className="px-4 py-3 text-gray-600">{p.capacity}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">{p.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Shop</th>
                  <th className="text-left px-4 py-3">Address</th>
                  <th className="text-left px-4 py-3">Phone</th>
                  <th className="text-left px-4 py-3">Packages a day</th>
                  <th className="text-left px-4 py-3">Open</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Taking packages</th>
                  <th className="text-left px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((s: any) => (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/partners/${s.id}`)}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium text-[#0F2B4C]">
                      {/* The row navigated on click, which meant the shop
                          could not be opened in a second tab while the
                          admin kept the list. A real link can be. */}
                      <Link
                        href={`/partners/${s.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-[#3A7BD5] hover:underline"
                      >
                        {s.storeName}
                      </Link>
                      {s.storeCode && (
                        <span
                          className="block text-[10px] font-mono text-gray-400 mt-0.5"
                          title="The shop's code. Customers and riders quote this when they call about a collection."
                        >
                          {s.storeCode}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className="flex items-center gap-1">
                        <MapPin size={12} className="text-gray-400 shrink-0" />
                        <span className="truncate max-w-xs">{s.storeAddress || '-'}</span>
                      </span>
                      {/* A store with no coordinates is invisible on every
                          map AND its drop-offs never become driver jobs
                          (the driver-leg bridge skips it). Surfaced here
                          because nobody reads server logs. */}
                      {(s.storeLat == null || s.storeLng == null) && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
                          <AlertTriangle size={10} /> No map location: cannot dispatch
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.phone || '-'}</td>
                    {/* "-/day" was rendered when no capacity was set, which
                        reads like a broken cell rather than "not set". */}
                    <td className="px-4 py-3 text-gray-600">
                      {s.maxCapacity == null ? <span className="text-gray-400">Not set</span> : `${s.maxCapacity} a day`}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {s.openTime && s.closeTime ? `${s.openTime} to ${s.closeTime}` : <span className="text-gray-400">Not set</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[s.status] ?? STATUS_STYLES.rejected}`}>
                        {STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {s.acceptingNew ? (
                        <span className="text-xs text-emerald-700">Yes</span>
                      ) : (
                        <span className="text-xs text-gray-400" title="The shop itself has paused new drop-offs, usually because it is full.">
                          Paused by the shop
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {/*
                        These used the browser's own prompt() and alert(),
                        which Chrome stops showing entirely once somebody
                        ticks "prevent this page from creating more
                        dialogs": the button then does nothing at all with
                        no error. They also called window.location.reload(),
                        which threw away the status filter and the search
                        the admin had typed to find this shop.
                      */}
                      {(s.status === 'approved' || s.status === 'active') ? (
                        <button
                          onClick={async () => {
                            const note = await prompt({
                              title:       `Stop ${s.storeName} taking packages?`,
                              message:     `From the moment you save: the shop stops being offered to customers as a collection point, and the owner loses the partner screens in their SEIRS business app.

Any package already sitting in that shop still has to be collected, so call them on ${s.phone || 'their number'} before you do this. You can undo it with Re-approve on this same row.`,
                              label:       'Why are you suspending them',
                              placeholder: 'e.g. shop closed for two weeks, packages left outside',
                              minLength:   4,
                              multiline:   true,
                              helper:      'Kept against your name. The owner is not shown these words.',
                              confirmLabel:'Suspend the shop',
                              danger:      true,
                            });
                            if (!note?.trim()) return;
                            try {
                              await adminApi.suspendPartnerStore(s.id, note.trim());
                              void notify({
                                title:   'Shop suspended',
                                message: `${s.storeName} is no longer taking packages. Use Re-approve on the row to put it back.`,
                                tone:    'success',
                              });
                              load();
                            } catch (e: any) {
                              setError(`${s.storeName} was NOT suspended: ${e?.message ?? 'the server refused the request'}. It is still taking packages.`);
                            }
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                        >
                          Suspend
                        </button>
                      ) : s.status === 'suspended' ? (
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title:        `Let ${s.storeName} take packages again?`,
                              message:      'The shop starts being offered to customers as a collection point again, and the owner gets the partner screens back in their business app straight away.',
                              confirmLabel: 'Re-approve',
                            });
                            if (!ok) return;
                            try {
                              await adminApi.approvePartnerStore(s.id, 'Re-approved after suspension');
                              void notify({ title: 'Shop re-approved', message: `${s.storeName} can take packages again.`, tone: 'success' });
                              load();
                            } catch (e: any) {
                              setError(`${s.storeName} was NOT re-approved: ${e?.message ?? 'the server refused the request'}.`);
                            }
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                        >
                          Re-approve
                        </button>
                      ) : (
                        /* Rejected shops had a blank cell, which reads as
                           "nothing can be done" on the only screen that
                           lists them. */
                        <Link
                          href={`/partners/${s.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs font-medium text-[#3A7BD5] hover:underline"
                        >
                          Open the shop
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
