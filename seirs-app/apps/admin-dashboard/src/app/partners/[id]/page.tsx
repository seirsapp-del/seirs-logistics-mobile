'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Store, MapPin, Phone, Clock, Package, Wallet, CheckCircle2, AlertTriangle,
  Copy, ArrowLeft, FileText, Download, ExternalLink,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { HardDeleteModal } from '@/components/HardDeleteModal';
import { SendDocumentModal } from '@/components/SendDocumentModal';

const STATUS_STYLES: Record<string, string> = {
  approved:       'bg-emerald-100 text-emerald-700',
  pending_review: 'bg-amber-100 text-amber-700',
  suspended:      'bg-red-100 text-red-700',
  rejected:       'bg-gray-100 text-gray-600',
  active:         'bg-emerald-100 text-emerald-700',
};

const fmtNgn = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

// Everything the admin knows about one partner store: the store row, the
// owner account behind it, activity numbers, and the KYC documents from
// the application. Built because the /partners list had no click-through
// (founder 2026-08-21).
export default function PartnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);

  const [sendDocOpen,    setSendDocOpen]    = useState(false);
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const [coordsCopied,   setCoordsCopied]   = useState(false);

  const reload = () =>
    adminApi.partnerStores.get(id).then(setData).catch((e: any) => setErr(e?.message ?? 'Load failed'));

  useEffect(() => {
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;
  if (err || !data?.store) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">{err ?? 'Partner store not found'}</div>;
  }

  const { store, owner, activity } = data;
  const hasCoords = store.storeLat != null && store.storeLng != null;

  const exportData = async () => {
    if (!owner?.id) return;
    try {
      const bundle = await adminApi.ndpr.exportUser(owner.id);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seirs-export-${owner.id}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { alert(e?.message ?? 'Export failed'); }
  };

  const runHardDelete = async (reason: string) => {
    if (!owner?.id) return;
    try {
      const r = await adminApi.ndpr.hardDeleteUser(owner.id, reason.trim());
      alert(`Account purged. Archived at ${r.archivedAt}.`);
      router.push('/partners');
    } catch (e: any) { alert(e?.message ?? 'Hard-delete failed'); }
  };

  const copyCoords = () => {
    if (!hasCoords) return;
    navigator.clipboard.writeText(`${Number(store.storeLat).toFixed(6)}, ${Number(store.storeLng).toFixed(6)}`)
      .then(() => { setCoordsCopied(true); setTimeout(() => setCoordsCopied(false), 1500); })
      .catch(() => alert('Copy failed'));
  };

  const suspendStore = async () => {
    const note = prompt('Suspension reason (required, kept for the audit trail). The store stops taking packages and the owner loses partner access until re-approved:');
    if (!note?.trim()) return;
    try {
      await adminApi.suspendPartnerStore(id, note.trim());
      alert('Store suspended.');
      reload();
    } catch (e: any) { alert(`Suspend failed: ${e?.message ?? 'unknown'}`); }
  };

  const reapproveStore = async () => {
    if (!confirm('Re-approve this store? The owner regains partner access and the store can take packages again.')) return;
    try {
      await adminApi.approvePartnerStore(id, 'Re-approved after suspension');
      reload();
    } catch (e: any) { alert(`Re-approve failed: ${e?.message ?? 'unknown'}`); }
  };

  const kycDocs: Array<{ label: string; url: string | null }> = [
    { label: 'Storefront photo', url: store.storefrontPhotoUrl },
    { label: 'CAC registration', url: store.cacRegUrl },
    { label: 'Owner ID',         url: store.ownerIdUrl },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="p-8 max-w-4xl mx-auto">
        <Link href="/partners" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
          <ArrowLeft size={15} /> All partner stores
        </Link>

        {/* Store card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-start gap-6">
            <div className="w-16 h-16 rounded-full bg-[#0F2B4C] flex items-center justify-center shrink-0">
              <Store size={28} color="#fff" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900">{store.storeName}</h1>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[store.status] ?? STATUS_STYLES.rejected}`}>
                  {store.status}
                </span>
                {store.acceptingNew ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Accepting drop-offs</span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Paused</span>
                )}
              </div>
              {store.storeCode && (
                <p className="text-xs text-gray-500 font-mono mb-1">Store code: {store.storeCode}</p>
              )}
              <p className="text-sm text-gray-600 flex items-center gap-1.5">
                <MapPin size={13} className="text-gray-400 shrink-0" /> {store.storeAddress || 'No address on file'}
              </p>
              <p className="text-sm text-gray-600 flex items-center gap-1.5 mt-0.5">
                <Phone size={13} className="text-gray-400 shrink-0" /> {store.phone || '-'}
              </p>
              <p className="text-sm text-gray-600 flex items-center gap-1.5 mt-0.5">
                <Clock size={13} className="text-gray-400 shrink-0" />
                {store.openTime}–{store.closeTime} · {(store.operatingDays ?? []).join(', ') || 'no days set'}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Capacity {store.maxCapacity ?? '-'} packages/day ·
                Joined {new Date(store.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {(store.status === 'approved' || store.status === 'active') && (
                <button onClick={suspendStore}
                  className="text-sm bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200 font-medium">
                  Suspend store
                </button>
              )}
              {store.status === 'suspended' && (
                <button onClick={reapproveStore}
                  className="text-sm bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg hover:bg-emerald-200 font-medium">
                  Re-approve store
                </button>
              )}
              {owner?.id && (
                <>
                  <button onClick={() => setSendDocOpen(true)}
                    className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 font-medium flex items-center gap-1.5 justify-center">
                    <FileText size={14} /> Send document
                  </button>
                  <button onClick={exportData}
                    title="NDPR data portability: download everything SEIRS holds on this account as JSON"
                    className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 font-medium flex items-center gap-1.5 justify-center">
                    <Download size={14} /> Export NDPR data
                  </button>
                  <button onClick={() => setHardDeleteOpen(true)}
                    title="NDPR erasure: permanently purge the owner account and its personal data"
                    className="text-sm bg-red-50 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 font-medium">
                    NDPR hard-delete
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Map location: same copy + ops-map pattern as driver pages */}
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm mb-6 flex items-center gap-3 flex-wrap">
          <MapPin size={20} className="text-gray-700" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">Map Location</p>
            {hasCoords ? (
              <p className="text-xs text-gray-500 font-mono">{Number(store.storeLat).toFixed(5)}, {Number(store.storeLng).toFixed(5)}</p>
            ) : (
              <p className="text-xs text-amber-700 flex items-center gap-1">
                <AlertTriangle size={11} /> No coordinates: invisible on the ops map and cannot dispatch
              </p>
            )}
          </div>
          {hasCoords && (
            <>
              <button onClick={copyCoords}
                title="Copy coordinates"
                className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200 font-medium flex items-center gap-1.5">
                <Copy size={12} /> {coordsCopied ? 'Copied!' : 'Copy'}
              </button>
              <Link
                href={`/ops-map?lat=${Number(store.storeLat)}&lng=${Number(store.storeLng)}&label=${encodeURIComponent(store.storeName)}`}
                className="text-xs bg-[#0F2B4C] text-white px-3 py-1.5 rounded-lg hover:bg-[#163B66] font-medium flex items-center gap-1.5">
                <MapPin size={12} /> View on ops map
              </Link>
            </>
          )}
        </div>

        {/* Activity numbers */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-gray-400 mb-1"><Package size={14} /><span className="text-xs">Holding now</span></div>
            <div className="text-2xl font-bold text-gray-900">{activity?.packagesHeldNow ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">Packages at the counter</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-gray-400 mb-1"><Package size={14} /><span className="text-xs">Lifetime</span></div>
            <div className="text-2xl font-bold text-gray-900">{activity?.lifetimeHandled ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">Packages handled</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-gray-400 mb-1"><Wallet size={14} /><span className="text-xs">Payouts owed</span></div>
            <div className="text-2xl font-bold text-gray-900">{fmtNgn(activity?.payoutsPendingNgn ?? 0)}</div>
            <div className="text-xs text-gray-500 mt-1">Pending + processing</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-gray-400 mb-1"><Wallet size={14} /><span className="text-xs">Payouts paid</span></div>
            <div className="text-2xl font-bold text-gray-900">{fmtNgn(activity?.payoutsPaidNgn ?? 0)}</div>
            <div className="text-xs text-gray-500 mt-1">Lifetime paid out</div>
          </div>
        </div>

        {/* Owner account */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Owner Account</h2>
            {owner?.id && (
              <Link href={`/users/${owner.id}`} className="text-xs text-[#3A7BD5] hover:underline flex items-center gap-1">
                Full account view <ExternalLink size={11} />
              </Link>
            )}
          </div>
          {owner ? (
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div><p className="text-xs text-gray-400 mb-0.5">Name</p><p className="text-gray-800 font-medium">{owner.name}</p></div>
              <div><p className="text-xs text-gray-400 mb-0.5">SEIRS ID</p><p className="text-gray-800 font-mono text-xs">{owner.accountId ?? '-'}</p></div>
              <div><p className="text-xs text-gray-400 mb-0.5">Email</p><p className="text-gray-800">{owner.email}</p></div>
              <div><p className="text-xs text-gray-400 mb-0.5">Phone</p><p className="text-gray-800">{owner.phone || '-'}</p></div>
              <div className="md:col-span-2 flex flex-wrap gap-1.5">
                {owner.emailVerified && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 size={12} /> Email verified</span>
                )}
                {owner.identityVerifiedAt && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 size={12} /> ID verified</span>
                )}
              </div>
            </div>
          ) : (
            <div className="p-5 text-sm text-gray-400">No owner account linked</div>
          )}
        </div>

        {/* KYC documents from the application */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900">Application Documents</h2>
          </div>
          <div className="p-5 flex flex-wrap gap-3">
            {kycDocs.every((d) => !d.url) && (
              <p className="text-sm text-gray-400">No documents on file</p>
            )}
            {kycDocs.map(({ label, url }) => url && (
              <a key={label} href={url} target="_blank" rel="noreferrer"
                className="text-xs bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 font-medium flex items-center gap-1.5">
                <FileText size={13} /> {label} <ExternalLink size={11} className="text-gray-400" />
              </a>
            ))}
          </div>
          {(store.reviewNote || store.reviewedAt) && (
            <div className="px-5 pb-4 text-xs text-gray-500">
              {store.reviewNote && <p className="mb-0.5">Review note: {store.reviewNote}</p>}
              {store.reviewedAt && <p>Reviewed {new Date(store.reviewedAt).toLocaleString('en-NG')}</p>}
            </div>
          )}
        </div>
      </main>

      {sendDocOpen && owner?.id && (
        <SendDocumentModal
          userName={owner.name ?? store.storeName}
          userId={owner.id}
          onClose={() => setSendDocOpen(false)}
        />
      )}
      {hardDeleteOpen && (
        <HardDeleteModal
          userName={owner?.name ?? store.storeName}
          onCancel={() => setHardDeleteOpen(false)}
          onConfirm={async (reason) => {
            setHardDeleteOpen(false);
            await runHardDelete(reason);
          }}
        />
      )}
    </div>
  );
}
