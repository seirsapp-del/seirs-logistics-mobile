'use client';

/**
 * Driver KYC review queue.
 *
 * Built 2026-08-31. Before this there was nowhere to review a driver's
 * documents at all: uploads wrote a URL onto the driver row and nothing
 * queued them. The founder uploaded documents for review, the driver app
 * reported them "Verified", and this dashboard had no page to open. The app
 * was calling them verified purely because the driver's ACCOUNT was already
 * approved, so a replacement licence inherited an approval nobody had given
 * it.
 *
 * Oldest first on purpose: a driver waiting in this queue cannot earn, and
 * the fair order is the order they arrived.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FileCheck, Loader2, RefreshCw, AlertCircle, Check, X, Clock, ExternalLink } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';

interface Doc {
  id:              string;
  docId:           string;
  url:             string;
  status:          string;
  rejectionReason: string | null;
  version:         number;
  createdAt:       string;
  reviewedAt:      string | null;
  driverId:        string;
  driverName:      string | null;
  driverEmail:     string | null;
  driverStatus:    string | null;
}

const STATUSES = ['submitted', 'approved', 'rejected'] as const;

const STATUS_STYLE: Record<string, string> = {
  submitted: 'bg-amber-50 text-amber-700 border-amber-200',
  approved:  'bg-green-50 text-green-700 border-green-200',
  rejected:  'bg-red-50 text-red-700 border-red-200',
};

/** Spec V8 §2.1 document ids, spelled how a person would say them. */
const DOC_LABEL: Record<string, string> = {
  national_id_front:  'National ID, front',
  national_id_back:   'National ID, back',
  drivers_license:    "Driver's licence",
  vehicle_document:   'Vehicle papers',
  vehicle_photo:      'Photo of the vehicle',
  ownership_proof:    'Proof of ownership',
  insurance_cert:     'Insurance certificate',
  selfie:             'Selfie',
  guarantor:          'Guarantor form',
  id_document:        'Identity document',
};

function when(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function DriverDocumentsPage() {
  const [rows,    setRows]    = useState<Doc[]>([]);
  const [total,   setTotal]   = useState(0);
  const [filter,  setFilter]  = useState<string>('submitted');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [busyId,  setBusyId]  = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.driverDocuments.list(filter || undefined, 1);
      setRows(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the queue.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const approve = async (d: Doc) => {
    setBusyId(d.id);
    try {
      await adminApi.driverDocuments.approve(d.id);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not approve that.');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (d: Doc) => {
    const reason = (reasons[d.id] ?? '').trim();
    if (!reason) {
      setError('Say why. The driver sees this, and without it they upload the same photo again.');
      return;
    }
    setBusyId(d.id);
    try {
      await adminApi.driverDocuments.reject(d.id, reason);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not reject that.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageIntro
        title="Driver documents"
        purpose="Everything waiting on a decision, across all drivers, oldest first. You can also review a single driver from their own profile."
        storageKey="driver-documents"
        help={
          <>
            Approving attaches to <strong>this file</strong>, not to the slot.
            If a driver re-uploads, the document returns to <em>Waiting</em>
            {' '}and the version number goes up, so an approved account cannot
            quietly swap in a different licence.
          </>
        }
      />

      <div className="flex items-center justify-between gap-3 mt-6 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilter('')}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              filter === '' ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            All
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm border capitalize ${
                filter === s ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s === 'submitted' ? 'Waiting' : s}
            </button>
          ))}
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileCheck size={20} />}
          title={filter === 'submitted' ? 'Nothing waiting' : 'No documents here'}
          body="Documents a driver uploads from the app appear here for a decision."
        />
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-3">
            {total} document{total === 1 ? '' : 's'}
            {filter ? ` marked ${filter === 'submitted' ? 'waiting' : filter}` : ''}
          </p>
          <div className="space-y-3">
            {rows.map((d) => (
              <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex gap-5 flex-wrap">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative w-40 h-28 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0 group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.url} alt={DOC_LABEL[d.docId] ?? d.docId} className="w-full h-full object-cover" />
                    <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      <ExternalLink size={18} className="text-white" />
                    </span>
                  </a>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-navy">{DOC_LABEL[d.docId] ?? d.docId}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLE[d.status] ?? STATUS_STYLE.rejected}`}>
                        {d.status === 'submitted' ? 'waiting' : d.status}
                      </span>
                      {d.version > 1 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                          re-uploaded &times;{d.version - 1}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 text-sm text-gray-600">
                      {/* Straight through to the driver. This queue is the
                          worklist; the profile is where everything about a
                          driver lives, and the two should never be separate
                          errands (founder 2026-08-31). */}
                      <Link href={`/drivers/${d.driverId}`} className="text-sky-700 hover:underline font-medium">
                        {d.driverName ?? 'Unknown driver'}
                      </Link>
                      {d.driverEmail ? <span className="text-gray-400"> &middot; {d.driverEmail}</span> : null}
                      {d.driverStatus ? <span className="text-gray-400"> &middot; account {d.driverStatus}</span> : null}
                    </div>
                    <div className="mt-1 text-xs text-gray-400 flex items-center gap-1">
                      <Clock size={11} /> uploaded {when(d.createdAt)}
                      {d.reviewedAt ? ` · reviewed ${when(d.reviewedAt)}` : ''}
                    </div>
                    {d.rejectionReason && (
                      <p className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        Rejected: {d.rejectionReason}
                      </p>
                    )}
                  </div>
                </div>

                {d.status === 'submitted' && (
                  <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col sm:flex-row gap-3 sm:items-center">
                    <input
                      value={reasons[d.id] ?? ''}
                      onChange={(e) => setReasons((r) => ({ ...r, [d.id]: e.target.value }))}
                      placeholder="If rejecting, what does the driver need to fix?"
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        disabled={busyId === d.id}
                        onClick={() => void reject(d)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-red-200 text-red-700 bg-white hover:bg-red-50 disabled:opacity-50"
                      >
                        <X size={14} /> Reject
                      </button>
                      <button
                        disabled={busyId === d.id}
                        onClick={() => void approve(d)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-navy text-white hover:opacity-90 disabled:opacity-50"
                      >
                        <Check size={14} /> Approve
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
