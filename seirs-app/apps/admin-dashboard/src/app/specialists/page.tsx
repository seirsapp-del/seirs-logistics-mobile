'use client';

/**
 * Specialist partners: SEIRS's contact book of outside operators.
 *
 * One job: keep an accurate list of the firms ops can ring when a job
 * is one SEIRS riders cannot do (a cold-chain run, a container, live
 * animals), with who to call and where they work.
 *
 * Nothing on this page is read by the customer, business or rider apps.
 * It is a directory for the people on the phone, and the screen says so,
 * because "Active" otherwise reads as "visible to customers".
 */
import { useEffect, useState } from 'react';
import { Briefcase, Plus, Star, AlertCircle, Loader2, RefreshCw, Search } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { ExternalPartnerModal, type ExternalPartner } from '@/components/ExternalPartnerEditor';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';

const STATUS_STYLES: Record<string, string> = {
  active:  'bg-[#3A7BD5]/10 text-[#3A7BD5]',
  pending: 'bg-yellow-100 text-yellow-700',
  paused:  'bg-gray-100 text-gray-500',
  lapsed:  'bg-red-100 text-red-700',
};

/** "pending" and "paused" are not obvious to somebody reading the row. */
const STATUS_LABEL: Record<string, { label: string; hint: string }> = {
  active:  { label: 'Use them',        hint: 'Checked and available. Ring them when a job needs their speciality.' },
  pending: { label: 'Not checked yet', hint: 'Someone added them but their paperwork has not been verified. Do not hand them a job yet.' },
  paused:  { label: 'Do not use',      hint: 'Paused by an admin. The reason should be in their notes.' },
  lapsed:  { label: 'Cover expired',   hint: 'Their insurance renewal date has passed.' },
};

/** The server returns at most 200 rows, ordered by name. */
const ROW_CAP = 200;

export default function SpecialistsPage() {
  const [items,   setItems]   = useState<ExternalPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [editing, setEditing] = useState<ExternalPartner | 'new' | null>(null);
  /** Find the firm you are about to ring, by name, speciality or city. */
  const [search,  setSearch]  = useState('');

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.externalPartners.list('specialist')
      .then(list => setItems(Array.isArray(list) ? list : []))
      .catch((e: any) => { setItems([]); setError(e?.message ?? 'Could not load specialist partners'); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Aggregate the unique specialty chips actually in use, so the tag
  // strip reflects the live directory (not a hardcoded list).
  const specialtiesInUse = Array.from(new Set(items.map(i => i.meta?.specialty).filter(Boolean))) as string[];

  const term    = search.trim().toLowerCase();
  const visible = term
    ? items.filter(i =>
        `${i.name} ${i.meta?.specialty ?? ''} ${(i.meta?.serviceAreas ?? []).join(' ')} ${i.contactPhone ?? ''}`
          .toLowerCase().includes(term))
    : items;

  return (
    <div className="p-6 space-y-6">
      <PageIntro
        title="Specialist operators"
        purpose="The outside firms SEIRS can hand a job to when it needs something our own drivers cannot carry: cold chain, heavy haulage, live animals."
        storageKey="specialists"
        help={
          <>
            <p><b>This is a contact book, not a live service.</b> Nothing here is shown in the customer, business or driver apps, and marking a firm active does not send them any work. Somebody still has to ring them.</p>
            <p><b>Use them / Not checked yet / Do not use</b> is the only thing the status column means. Keep it honest: it is what the next person on the phone will trust.</p>
            <p><b>The rating and job count are typed in by us</b>, from what we have seen, not calculated by SEIRS. Treat them as a note, not a measurement.</p>
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <button onClick={load} className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button onClick={() => setEditing('new')}
              className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#2f6cc0]">
              <Plus size={15} /> Add a firm
            </button>
          </div>
        }
      />

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={load} className="shrink-0 font-semibold underline hover:no-underline">Try again</button>
        </div>
      )}

      {specialtiesInUse.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 self-center mr-1 font-medium">What SEIRS can currently cover:</span>
          {specialtiesInUse.map(s => (
            <span key={s} className="text-xs bg-[#0F2B4C]/8 text-[#0F2B4C] px-2.5 py-1 rounded-full font-medium">{s}</span>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-[#0F2B4C]">
            {loading
              ? 'Loading…'
              : term
                ? `${visible.length} of ${items.length} firms match "${search.trim()}"`
                : `${items.length} firm${items.length === 1 ? '' : 's'} in the book`}
          </span>
          <div className="flex items-center gap-2">
            {/* There was no way to find a firm except reading the list. */}
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5">
              <Search size={13} className="text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, speciality or city"
                className="w-52 bg-transparent text-sm outline-none placeholder:text-gray-400"
              />
            </div>
            {items.length >= ROW_CAP && (
              <span className="text-xs text-amber-700">Showing the first {ROW_CAP} by name.</span>
            )}
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" /> Loading…
          </div>
        ) : error && items.length === 0 ? (
          /* A failed load used to show "No specialist partners yet",
             which tells ops there is nobody to call when in fact the
             list simply did not arrive. */
          <EmptyState
            icon={<AlertCircle size={20} />}
            title="The contact book would not load"
            body="Nothing has been lost. This is the dashboard failing to read the list."
            action={{ label: 'Try again', onClick: load }}
          />
        ) : items.length > 0 && visible.length === 0 ? (
          <EmptyState
            icon={<Search size={20} />}
            title={`Nothing matches "${search.trim()}"`}
            body="The search looks at the firm's name, its speciality and the cities it covers."
            action={{ label: 'Clear the search', onClick: () => setSearch('') }}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Briefcase size={20} />}
            title="No specialist firms have been added"
            body="Until one is here, a job needing cold chain or heavy haulage has nobody to go to. Add the firms ops already ring."
            action={{ label: 'Add the first firm', onClick: () => setEditing('new') }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Firm</th>
                  <th className="text-left px-4 py-3">What they do</th>
                  <th className="text-left px-4 py-3">Where they work</th>
                  <th className="text-left px-4 py-3">Who to ring</th>
                  <th className="text-left px-4 py-3" title="Typed in by SEIRS staff, not measured by the platform">Our rating</th>
                  <th className="text-left px-4 py-3">Jobs done</th>
                  <th className="text-left px-4 py-3">Can we use them</th>
                  <th className="text-left px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setEditing(s)}>
                    <td className="px-4 py-3 font-medium text-[#0F2B4C]">{s.name}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {s.meta?.specialty ?? 'Not stated'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {(s.meta?.serviceAreas ?? []).join(', ') || <span className="text-gray-400">Nowhere listed</span>}
                    </td>
                    {/* The phone number is the entire point of this page
                        for somebody with a stranded pallet, and it was
                        two clicks away inside the edit dialog. */}
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {s.contactPhone
                        ? <a href={`tel:${s.contactPhone}`} onClick={(e) => e.stopPropagation()} className="font-medium text-[#3A7BD5] hover:underline">{s.contactPhone}</a>
                        : <span className="text-amber-700">No number on file</span>}
                    </td>
                    <td className="px-4 py-3">
                      {/* Number(null).toFixed(1) is "0.0", so a firm nobody
                          has rated yet read as the worst in the book. */}
                      {s.meta?.rating == null || Number(s.meta.rating) === 0 ? (
                        <span className="text-gray-400" title="Nobody has rated them yet">Not rated</span>
                      ) : (
                        <span className="flex items-center gap-1 text-gray-600">
                          <Star size={12} className="text-yellow-400 fill-yellow-400" />
                          {Number(s.meta.rating).toFixed(1)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.meta?.completedJobs ?? 0}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[s.status] ?? ''}`}
                        title={STATUS_LABEL[s.status]?.hint}
                      >
                        {STATUS_LABEL[s.status]?.label ?? s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#3A7BD5] font-medium">Edit or remove</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ExternalPartnerModal
          row={editing === 'new' ? null : editing}
          type="specialist"
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
