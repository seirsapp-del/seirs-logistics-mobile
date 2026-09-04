'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { isSuperAdminFromUser } from '@/lib/rbac';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { ShieldAlert, Filter, ChevronLeft, ChevronRight, Lock, AlertCircle, Search } from 'lucide-react';

/**
 * Who did what, and to whom.
 *
 * The record was here and unreadable. Rows said "ndpr_export" and
 * "user:9f2c1e4a-...", the filter asked for an "Admin ID" that nobody
 * has, and the detail panel was a JSON dump. All three are database
 * shapes shown to a person whose question is "did somebody download
 * Chidi's file, and who was it".
 *
 * So: the action is a sentence, the target is a link to the record it
 * names, and the admin filter is a list of names.
 */

interface AuditEntry {
  id:        string;
  adminId:   string;
  adminName: string;
  action:    string;
  target?:   string;
  meta?:     Record<string, any>;
  ip?:       string;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  login:          'bg-blue-100 text-blue-700',
  logout:         'bg-gray-100 text-gray-600',
  create:         'bg-emerald-100 text-emerald-700',
  update:         'bg-amber-100 text-amber-700',
  delete:         'bg-red-100 text-red-700',
  approve:        'bg-emerald-100 text-emerald-700',
  reject:         'bg-red-100 text-red-700',
  suspend:        'bg-orange-100 text-orange-700',
  publish:        'bg-violet-100 text-violet-700',
  role_change:    'bg-pink-100 text-pink-700',
  pricing_update: 'bg-indigo-100 text-indigo-700',
  // Matches both 'data_export' (bulk CSV) and 'ndpr_export' (one
  // user's bundle). Data leaving the building should not read as a
  // grey nothing-happened row in the trail.
  export:         'bg-fuchsia-100 text-fuchsia-700',
};

function actionColor(action: string): string {
  const key = Object.keys(ACTION_COLORS).find((k) => action.toLowerCase().includes(k));
  return key ? ACTION_COLORS[key] : 'bg-gray-100 text-gray-600';
}

/**
 * The action column, in words.
 *
 * Every key here is a real string written by the API (grep logAudit).
 * Anything not listed still renders, tidied, rather than blank: a new
 * action shipping to an empty cell would be the one row nobody reads.
 */
const ACTION_WORDS: Record<string, string> = {
  ndpr_export:              'Downloaded everything held on one person',
  ndpr_hard_delete:         'Permanently erased an account',
  data_export:              'Downloaded a spreadsheet of records',
  pii_view:                 'Looked at somebody’s ID documents',
  bank_change_approved:     'Approved a driver’s new bank account',
  bank_change_rejected:     'Refused a driver’s new bank account',
  vehicle_change_approved:  'Approved a driver’s change of vehicle',
  vehicle_change_rejected:  'Refused a driver’s change of vehicle',
  soft_delete_scheduled:    'Scheduled an account for deletion',
  deletion_cancelled:       'Called off a scheduled deletion',
  chat_reopen:              'Reopened a closed delivery chat',
  chat_reopen_close:        'Closed a reopened chat early',
  role_change:              'Changed what somebody is allowed to do',
  suspend:                  'Suspended an account',
  reactivate_admin:         'Let a member of staff sign in again',
  reset_admin_password:     'Emailed a staff password reset',
  offboard_admin:           'Offboarded a member of staff',
  'earning.release':        'Released a driver payout that was being held',
  'config.update':          'Changed a system setting',
  'launch_reset.preview':   'Previewed the launch reset',
  'launch_reset.started':   'Started the launch reset',
  'launch_reset.finished':  'Finished the launch reset',
  'launch_reset.account_deleted':  'Launch reset deleted an account',
  'launch_reset.account_selected': 'Launch reset picked an account to delete',
  'launch_reset.account_skipped':  'Launch reset spared an account',
};

/** Offered in the filter. Free text still works for anything else. */
const COMMON_ACTIONS: Array<{ value: string; label: string }> = [
  { value: 'export',      label: 'Data leaving the building' },
  { value: 'pii_view',    label: 'ID documents looked at' },
  { value: 'suspend',     label: 'Accounts suspended' },
  { value: 'role_change', label: 'Permissions changed' },
  { value: 'delete',      label: 'Deletions' },
  { value: 'admin',       label: 'Staff account changes' },
  { value: 'chat_reopen', label: 'Chats reopened' },
  { value: 'config',      label: 'Settings changed' },
  { value: 'launch_reset', label: 'Launch reset' },
];

function actionWords(action: string): string {
  if (ACTION_WORDS[action]) return ACTION_WORDS[action];
  if (action.startsWith('ticket_')) {
    return `Moved a support ticket to "${action.slice(7).replace(/_/g, ' ')}"`;
  }
  const s = action.replace(/[._]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * A target is written as "type:id". It was printed raw, which put a
 * bare UUID in front of somebody whose next question is always "which
 * customer is that". Where the id names a record with a page, it
 * becomes a link to it.
 */
function targetParts(target?: string): { label: string; href?: string; id?: string } | null {
  if (!target) return null;
  const [kind, ...rest] = target.split(':');
  const id = rest.join(':');
  switch (kind) {
    case 'user':     return { label: 'Account',          href: `/users/${id}`,      id };
    case 'admin':    return { label: 'Staff account',    href: `/admins`,           id };
    case 'delivery': return { label: 'Delivery',         href: `/deliveries/${id}`, id };
    case 'ticket':   return { label: 'Support ticket',   href: `/support`,          id };
    case 'earning':  return { label: 'Driver earning',    href: `/wallet`,           id };
    case 'config':   return { label: `Setting "${id}"`,  href: `/settings` };
    case 'export':   return { label: `Export "${id}"`,   href: `/exports` };
    case 'launch':   return { label: 'Launch reset' };
    default:         return { label: target };
  }
}

/** JSON is not a language people speak. */
function metaLines(meta: Record<string, any>): Array<[string, string]> {
  return Object.entries(meta).map(([k, v]) => {
    const key = k.replace(/([A-Z])/g, ' $1').replace(/[._]+/g, ' ').trim();
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    const value =
      v === null || v === undefined ? 'not recorded'
      : typeof v === 'boolean'      ? (v ? 'yes' : 'no')
      : Array.isArray(v)            ? v.join(', ')
      : typeof v === 'object'       ? JSON.stringify(v)
      : String(v);
    return [label, value] as [string, string];
  });
}

export default function AuditLogPage() {
  const [entries,   setEntries]   = useState<AuditEntry[]>([]);
  const [total,     setTotal]     = useState(0);
  const [limit,     setLimit]     = useState(50);
  const [loading,   setLoading]   = useState(true);
  const [page,      setPage]      = useState(1);
  const [hasMore,   setHasMore]   = useState(false);
  const [adminId,   setAdminId]   = useState('');
  const [action,    setAction]    = useState('');
  /**
   * The day, or span of days, being looked at.
   *
   * Every question an audit log answers is dated: who changed that on the
   * 3rd, what happened the night the rates moved. Without this the only
   * route was Previous and Next, guessing where a day started.
   */
  const [from,      setFrom]      = useState('');
  const [to,        setTo]        = useState('');
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [rawOpen,   setRawOpen]   = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  // Names for the admin filter, so nobody has to paste a UUID.
  const [staff,     setStaff]     = useState<Array<{ id: string; name: string }> | null>(null);

  const [isSuper,  setIsSuper]  = useState<boolean | null>(null);

  /**
   * Dates are parameters, not read from state.
   *
   * The other filters already work this way for a reason: a handler that
   * changes state and calls load() in the same tick reads the PREVIOUS
   * value out of the closure, so the fetch runs one edit behind. Clearing
   * the range would have re-fetched the range it was clearing.
   */
  const load = (p = 1, who = adminId, what = action, f = from, t = to) => {
    setLoading(true);
    adminApi.auditLog.list(p, who || undefined, what || undefined, f || undefined, t || undefined)
      .then((data: any) => {
        const items = Array.isArray(data) ? data : data?.items ?? [];
        // Previous/Next are page jumps, not infinite scroll. Appending on
        // anything but page 1 meant Next to 3 then Previous to 2 stacked
        // page 2 on top of the accumulated list: duplicate rows and
        // duplicate React keys. Every page change replaces the list.
        setEntries(items);
        setTotal(Number(data?.total ?? items.length));
        setLimit(Number(data?.limit ?? 50));
        setHasMore(data?.hasMore ?? false);
        setPage(p);
        setError(null);
      })
      // An immutable record that silently renders empty on a failed fetch
      // is worse than no record at all.
      .catch((e: any) => setError(e?.message ?? 'The audit log could not be loaded.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // isSuperAdmin only reads the legacy user.adminRole, so a super admin
    // on a dynamic role was shown "Access Restricted" on their own audit
    // log. isSuperAdminFromUser handles both shapes.
    const superAdmin = isSuperAdminFromUser(getUser());
    setIsSuper(superAdmin);
    if (superAdmin) {
      load(1, '', '');
      adminApi.admins.list()
        .then((rows: any) => setStaff(
          (Array.isArray(rows) ? rows : []).map((m: any) => ({
            id:   m.id,
            name: [m.firstName, m.lastName].filter(Boolean).join(' ') || m.name || m.email,
          })),
        ))
        .catch(() => setStaff(null));
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isSuper === null) {
    return <div className="flex min-h-screen items-center justify-center"><div className="text-sm text-[#0F2B4C]/30">Loading</div></div>;
  }

  if (!isSuper) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-sm text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100">
            <Lock size={28} className="text-red-500" />
          </div>
          <h2 className="mb-1 text-lg font-bold text-[#0F2B4C]">Only a super admin can read this</h2>
          <p className="text-sm text-[#0F2B4C]/50">
            The audit log records what every member of staff has done, so it is deliberately not something a role can be granted.
            Ask a super admin if you need something looked up.
          </p>
        </div>
      </div>
    );
  }

  const lastPage  = Math.max(1, Math.ceil(total / (limit || 50)));
  const firstRow  = total === 0 ? 0 : (page - 1) * limit + 1;
  const lastRow   = Math.min(page * limit, total);
  const filtersOn = !!(adminId || action);
  const whoName   = staff?.find(s => s.id === adminId)?.name;

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-6xl p-6 lg:p-8">

        <PageIntro
          title="Audit Log"
          purpose="Look up what a member of staff has done: whose records they opened, what they changed, and when. Nothing here can be edited or removed."
          storageKey="audit-log"
          help={
            <>
              <p>Every row is one thing somebody did. Click it to see the detail that was recorded at the time.</p>
              <p>Rows about data leaving the building, or somebody&apos;s ID being viewed, are coloured differently on purpose: those are the ones worth reading.</p>
              <p>This record is written by the API and cannot be changed from here, or from anywhere else in this dashboard.</p>
            </>
          }
          actions={
            <div className="flex items-center gap-1.5 rounded-lg bg-[#0F2B4C]/5 px-3 py-1.5 text-xs text-[#0F2B4C]/40">
              <Lock size={11} /> Super admin only
            </div>
          }
        />

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-0 mr-1 flex items-center gap-1.5 text-xs text-gray-400">
            <Filter size={13} /> Narrow it down:
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Who did it</label>
            {/* Was a text box asking for an "Admin ID", which is a UUID
                nobody has and nothing on the page could give them. */}
            {staff && staff.length > 0 ? (
              <select
                value={adminId}
                onChange={(e) => { setAdminId(e.target.value); load(1, e.target.value, action); }}
                className="w-56 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
              >
                <option value="">Anybody</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : (
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                  value={adminId}
                  onChange={(e) => setAdminId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') load(1); }}
                  onBlur={() => load(1)}
                  placeholder="Paste a staff account id"
                  className="w-56 rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
                />
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">What they did</label>
            <select
              value={COMMON_ACTIONS.some(a => a.value === action) ? action : ''}
              onChange={(e) => { setAction(e.target.value); load(1, adminId, e.target.value); }}
              className="w-56 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
            >
              <option value="">Anything</option>
              {COMMON_ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Or type part of an action</label>
            <input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(1); }}
              onBlur={() => load(1)}
              placeholder="suspend, export, refund"
              className="w-48 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
            />
          </div>

          {/* When.

              The one filter this page most needed. Every question an audit
              log exists to answer is dated, and without a range the only
              route to a given day was Previous and Next, guessing where it
              started. The end date covers its whole day: ranging the 3rd to
              the 3rd and getting nothing back would read as "nothing
              happened", which on an audit log is the worst available lie. */}
          <div>
            <label className="mb-1 block text-xs text-gray-500">When</label>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => { setFrom(e.target.value); setPage(1); load(1, adminId, action, e.target.value, to); }}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => { setTo(e.target.value); setPage(1); load(1, adminId, action, from, e.target.value); }}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
              />
              {(from || to) && (
                <button
                  onClick={() => { setFrom(''); setTo(''); setPage(1); load(1, adminId, action, '', ''); }}
                  className="text-sm font-semibold text-[#3A7BD5] hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          {filtersOn && (
            <button
              onClick={() => { setAdminId(''); setAction(''); load(1, '', ''); }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => load(page)} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
          </div>
        )}

        {/* Log table */}
        {loading && entries.length === 0 ? (
          <div className="py-20 text-center text-sm text-[#0F2B4C]/30">Loading</div>
        ) : error ? (
          <div className="rounded-xl border border-gray-100 bg-white">
            <EmptyState
              icon={<AlertCircle size={20} />}
              title="The audit log could not be loaded"
              body="This is a connection problem, not an empty record. Nothing has been lost."
              action={{ label: 'Try again', onClick: () => load(page) }}
            />
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-white">
            {filtersOn ? (
              <EmptyState
                icon={<Search size={20} />}
                title="Nothing matches those filters"
                body={`No recorded action${whoName ? ` by ${whoName}` : ''}${action ? ` matching "${action}"` : ''}.`}
                action={{ label: 'Clear the filters', onClick: () => { setAdminId(''); setAction(''); load(1, '', ''); } }}
              />
            ) : (
              <EmptyState
                icon={<ShieldAlert size={20} />}
                title="Nothing has been recorded yet"
                body="Actions appear here as staff take them. An empty log on a live system is worth asking about."
              />
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            {/* Header */}
            <div className="grid grid-cols-[1fr_1.6fr_3fr_1fr_auto] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span>When</span>
              <span>Who</span>
              <span>What they did</span>
              <span>From</span>
              <span />
            </div>

            {entries.map((e, idx) => {
              const target = targetParts(e.target);
              return (
                <div key={e.id} className={idx > 0 ? 'border-t border-gray-100' : ''}>
                  <div
                    className="grid cursor-pointer grid-cols-[1fr_1.6fr_3fr_1fr_auto] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-gray-50"
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  >
                    <div>
                      <p className="text-xs text-[#0F2B4C]">
                        {new Date(e.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(e.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#0F2B4C]">{e.adminName}</p>
                      {/* The raw admin UUID was under every name. It is
                          in the detail panel for anybody who needs it. */}
                    </div>
                    <div className="min-w-0">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${actionColor(e.action)}`}>
                        {actionWords(e.action)}
                      </span>
                      {target && (
                        <div className="mt-1 truncate text-xs text-gray-500">
                          {target.href ? (
                            <Link
                              href={target.href}
                              onClick={(ev) => ev.stopPropagation()}
                              className="text-[#3A7BD5] hover:underline"
                            >
                              {target.label}
                            </Link>
                          ) : target.label}
                          {target.id && <span className="ml-1 font-mono text-[10px] text-gray-400">{target.id.slice(0, 8)}</span>}
                        </div>
                      )}
                    </div>
                    <p className="font-mono text-xs text-gray-400">{e.ip ?? 'not recorded'}</p>
                    <ChevronRight
                      size={14}
                      className={`text-gray-300 transition-transform ${expanded === e.id ? 'rotate-90' : ''}`}
                    />
                  </div>

                  {expanded === e.id && (
                    <div className="border-t border-gray-100 bg-gray-50 px-5 pb-4 pt-3">
                      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                        <div className="flex gap-2">
                          <dt className="text-gray-500">Recorded as</dt>
                          <dd className="font-mono text-[#0F2B4C]">{e.action}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-gray-500">Staff account</dt>
                          <dd className="truncate font-mono text-[#0F2B4C]">{e.adminId}</dd>
                        </div>
                        {e.target && (
                          <div className="flex gap-2">
                            <dt className="text-gray-500">Record touched</dt>
                            <dd className="truncate font-mono text-[#0F2B4C]">{e.target}</dd>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <dt className="text-gray-500">Exact time</dt>
                          <dd className="text-[#0F2B4C]">{new Date(e.createdAt).toLocaleString('en-NG')}</dd>
                        </div>
                        {/* Was a JSON dump. Same facts, readable. */}
                        {e.meta && metaLines(e.meta).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <dt className="shrink-0 text-gray-500">{k}</dt>
                            <dd className="min-w-0 break-words text-[#0F2B4C]">{v}</dd>
                          </div>
                        ))}
                      </dl>
                      {e.meta && Object.keys(e.meta).length > 0 && (
                        <>
                          <button
                            onClick={() => setRawOpen(rawOpen === e.id ? null : e.id)}
                            className="mt-2 text-xs font-semibold text-[#3A7BD5] hover:underline"
                          >
                            {rawOpen === e.id ? 'Hide the raw record' : 'Show the raw record'}
                          </button>
                          {rawOpen === e.id && (
                            <pre className="mt-2 overflow-x-auto rounded-lg border border-gray-200 bg-white p-3 font-mono text-xs text-[#0F2B4C]">
                              {JSON.stringify(e.meta, null, 2)}
                            </pre>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Pagination. The server sends a real total, so say which
                slice this is rather than only "Page 3". */}
            <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-3">
              <button
                onClick={() => { if (page > 1) load(page - 1); }}
                disabled={page === 1 || loading}
                className="flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-700 disabled:opacity-40"
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <span className="text-xs tabular-nums text-gray-400">
                {total > 0
                  ? `Showing ${firstRow.toLocaleString()}-${lastRow.toLocaleString()} of ${total.toLocaleString()}${filtersOn ? ' matching' : ''}`
                  : `Page ${page}`}
              </span>
              <button
                onClick={() => { if (page < lastPage || hasMore) load(page + 1); }}
                disabled={(page >= lastPage && !hasMore) || loading}
                className="flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-700 disabled:opacity-40"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
