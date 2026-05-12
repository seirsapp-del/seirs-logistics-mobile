'use client';

/**
 * Partner Store Applications — admin approval queue.
 *
 * Spec V8 hybrid-account (2026-05-11). Lists every PartnerStore that's
 * sitting in PENDING_REVIEW. Each card shows the user's KYC docs (storefront
 * photo + owner ID + optional CAC) inline so the admin can review without
 * leaving the page. Two actions: Approve (flips status + sets the user's
 * capabilities.canPartner = true) or Reject (with a required note explaining
 * what to fix so the user can re-apply).
 */
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Store, Phone, MapPin, Package, FileText, CheckCircle2, XCircle, Image as ImageIcon } from 'lucide-react';

interface Application {
  id: string;
  userId: string;
  storeName: string;
  storeAddress: string;
  phone: string;
  maxCapacity: number;
  status: string;
  storefrontPhotoUrl: string | null;
  cacRegUrl: string | null;
  ownerIdUrl: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
}

export default function PartnerApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId,  setBusyId]  = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    adminApi.partnerApplications()
      .then((list) => setApps(list))
      .catch(()    => setApps([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const approve = async (id: string) => {
    const note = prompt('Optional approval note (visible to applicant):') ?? undefined;
    setBusyId(id);
    try {
      await adminApi.approvePartnerStore(id, note);
      load();
    } catch (e: any) {
      alert(`Approve failed: ${e?.message ?? 'unknown error'}`);
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    const note = prompt('Rejection reason (required — applicant will see this so they know what to fix):');
    if (!note?.trim()) return;
    setBusyId(id);
    try {
      await adminApi.rejectPartnerStore(id, note);
      load();
    } catch (e: any) {
      alert(`Reject failed: ${e?.message ?? 'unknown error'}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen">
      <main className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#0F2B4C]">Partner Store Applications</h1>
            <p className="text-sm text-gray-500 mt-1">
              Review KYC docs and approve or reject pending partner stores.
            </p>
          </div>
          <button
            onClick={load}
            className="px-4 py-2 text-sm font-medium text-[#3A7BD5] bg-[#3A7BD5]/5 rounded-lg hover:bg-[#3A7BD5]/10"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-gray-500 text-sm">Loading…</div>
        ) : apps.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
            <Store size={36} className="mx-auto text-gray-300 mb-3" strokeWidth={1.5} />
            <h3 className="text-base font-semibold text-[#0F2B4C]">No pending applications</h3>
            <p className="text-sm text-gray-500 mt-1">New partner store applications appear here for review.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {apps.map((a) => (
              <div key={a.id} className="bg-white border border-gray-200 rounded-2xl p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h2 className="text-lg font-bold text-[#0F2B4C]">{a.storeName}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Submitted {new Date(a.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="px-3 py-1 text-xs font-semibold text-amber-700 bg-amber-100 rounded-full">
                    Pending review
                  </span>
                </div>

                {/* Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                  <Field icon={MapPin}   label="Address"   value={a.storeAddress} />
                  <Field icon={Phone}    label="Phone"     value={a.phone} />
                  <Field icon={Package}  label="Capacity"  value={`${a.maxCapacity} packages`} />
                  <Field icon={FileText} label="User ID"   value={a.userId.slice(0, 8) + '…'} />
                </div>

                {/* KYC docs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                  <DocSlot label="Storefront photo" url={a.storefrontPhotoUrl} required />
                  <DocSlot label="Owner ID"         url={a.ownerIdUrl}         required />
                  <DocSlot label="CAC registration" url={a.cacRegUrl}          required={false} />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => approve(a.id)}
                    disabled={busyId === a.id}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <CheckCircle2 size={16} strokeWidth={2} />
                    Approve
                  </button>
                  <button
                    onClick={() => reject(a.id)}
                    disabled={busyId === a.id}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
                  >
                    <XCircle size={16} strokeWidth={2} />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Field({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} className="text-gray-400 mt-0.5 flex-shrink-0" strokeWidth={1.75} />
      <div className="min-w-0">
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-sm text-[#0F2B4C] font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

function DocSlot({ label, url, required }: { label: string; url: string | null; required: boolean }) {
  if (!url) {
    return (
      <div className="border border-dashed border-gray-200 rounded-xl p-4 text-center">
        <ImageIcon size={20} className="mx-auto text-gray-300 mb-2" strokeWidth={1.5} />
        <div className="text-xs font-medium text-gray-500">{label}</div>
        <div className="text-[11px] text-gray-400 mt-0.5">
          {required ? 'Required — missing' : 'Not provided (optional)'}
        </div>
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block border border-gray-200 rounded-xl overflow-hidden hover:border-[#3A7BD5] transition"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="w-full h-32 object-cover bg-gray-50" />
      <div className="px-3 py-2 text-xs font-medium text-[#0F2B4C] bg-white">
        {label}
      </div>
    </a>
  );
}
