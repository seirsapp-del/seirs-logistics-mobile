'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { Search, Package, Camera, FileText, ChevronRight, AlertCircle, ShieldCheck, ArrowLeft } from 'lucide-react';

// Spec V8 §3.10 - disputes review surface. Reads the chain-of-custody
// records emitted by the Identity module and lays them out as a
// timeline so an admin can see exactly who handed what to whom and
// when. Each row is one verification event.

interface Handoff {
  id:             string;
  deliveryId:     string;
  stage:          string;
  method:         string;
  fromUserId:     string | null;
  toUserId:       string | null;
  signatureName:  string | null;
  proofPhotoUrl:  string | null;
  idLast4:        string | null;
  idType:         string | null;
  createdAt:      string;
}

const STAGE_LABEL: Record<string, string> = {
  customer_to_store:   'Customer → Store',
  store_to_driver:     'Store → Driver',
  driver_to_store:     'Driver → Store',
  store_to_recipient:  'Store → Recipient',
  driver_to_recipient: 'Driver → Recipient',
};

const STAGE_COLOR: Record<string, string> = {
  customer_to_store:   '#3A7BD5',
  store_to_driver:     '#D97706',
  driver_to_store:     '#D97706',
  store_to_recipient:  '#16A34A',
  driver_to_recipient: '#16A34A',
};

function DisputesContent() {
  const searchParams = useSearchParams();
  const [deliveryId, setDeliveryId] = useState(searchParams.get('deliveryId') ?? '');
  /* Where the operator came from, if they came from anywhere.
     Read off the URL rather than off the input box: the box is typed
     into, and a back link that follows the typing would send the admin
     to whatever half-finished UUID is in it. */
  const cameFromDelivery = (searchParams.get('deliveryId') ?? '').trim();
  const [chain,      setChain]      = useState<Handoff[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [searched,   setSearched]   = useState(false);

  const load = async () => {
    if (!deliveryId.trim()) return;
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const list = await adminApi.identity.handoffChain(deliveryId.trim());
      setChain(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load chain of custody');
      setChain([]);
    } finally {
      setLoading(false);
    }
  };

  // Arriving from a delivery's "Open chain of custody" link
  // (/disputes?deliveryId=...) used to only type the UUID into the box and
  // stop there, so the admin landed on an empty page holding the answer
  // and had to notice the Look up button to see anything. Run the lookup
  // for them. Ref-guarded so it fires once on arrival and never fights
  // the admin if they clear the box and type a different id.
  const autoRan = useRef(false);
  useEffect(() => {
    const fromLink = searchParams.get('deliveryId')?.trim();
    if (!fromLink || autoRan.current) return;
    autoRan.current = true;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="p-6 space-y-6">
      {/* Return path. Arriving here from a delivery's "Open chain of
          custody" link left the operator stranded: the sidebar goes to
          lists, and nothing on this page named the run they had been
          reading a second earlier (founder 2026-08-25). */}
      {cameFromDelivery && (
        <Link
          href={`/deliveries/${encodeURIComponent(cameFromDelivery)}`}
          className="inline-flex items-center gap-1 text-sm text-[#3A7BD5] hover:underline"
        >
          <ArrowLeft size={14} /> Back to the delivery
        </Link>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <ShieldCheck size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Liability Disputes</h1>
            <p className="text-sm text-gray-500">
              Look up any delivery&apos;s chain-of-custody timeline. Each row is a verified handoff with photo + signature evidence.
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-4">
        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
          Delivery / Drop-off ID
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={deliveryId}
              onChange={e => setDeliveryId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load()}
              placeholder="UUID - or use Open chain of custody on a delivery"
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-[#E5E7EB] text-sm font-mono focus:outline-none focus:border-[#3A7BD5]"
            />
          </div>
          <button
            onClick={load}
            disabled={loading || !deliveryId.trim()}
            className="bg-[#0F2B4C] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#3A7BD5] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Loading…' : 'Look up'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {searched && !loading && !error && chain.length === 0 && (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-[#E5E7EB]">
          <Package size={32} className="mx-auto mb-3 opacity-40" />
          <p>No handoff records yet for this delivery.</p>
          <p className="text-xs mt-1">Either the delivery is still in progress, or no chain-of-custody events have been recorded.</p>
        </div>
      )}

      {chain.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
          <div className="p-4 border-b border-[#E5E7EB] bg-gray-50">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Chain of Custody</p>
            <p className="text-sm text-gray-700 mt-1">
              {chain.length} verified handoff{chain.length === 1 ? '' : 's'} · earliest first
            </p>
          </div>

          {chain.map((h, i) => {
            const stageColor = STAGE_COLOR[h.stage] ?? '#9CA3AF';
            const stageLabel = STAGE_LABEL[h.stage] ?? h.stage;
            return (
              <div key={h.id} className="p-4 flex gap-4">
                {/* Timeline dot */}
                <div className="flex flex-col items-center">
                  <div
                    className="w-3 h-3 rounded-full mt-1"
                    style={{ backgroundColor: stageColor }}
                  />
                  {i < chain.length - 1 && (
                    <div className="flex-1 w-0.5 bg-gray-200 mt-1" />
                  )}
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0 pb-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded"
                      style={{ backgroundColor: stageColor + '20', color: stageColor }}
                    >
                      {stageLabel}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(h.createdAt).toLocaleString('en-NG', {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase">Method</p>
                      <p className="text-sm text-[#0F2B4C] font-mono">
                        {h.method === 'physical_id' ? 'Physical ID + OTP' : 'SEIRS ID + Signature'}
                      </p>
                    </div>
                    {h.signatureName && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase">Typed Signature</p>
                        <p className="text-sm text-[#0F2B4C]">{h.signatureName}</p>
                      </div>
                    )}
                    {h.idType && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase">ID Type · last 4</p>
                        <p className="text-sm text-[#0F2B4C] font-mono">{h.idType} · ••••{h.idLast4}</p>
                      </div>
                    )}
                  </div>

                  {/* Show the handoff photo, do not just link to it.
                      This screen decides who pays for a lost or damaged
                      parcel, and the picture of the parcel changing
                      hands was a blue text link an adjudicator had to
                      guess was worth clicking, once per row (founder
                      2026-08-25: "no way for the admin to see or verify
                      whatever package was sent and delivered"). The link
                      stays, on the thumbnail, for the full-size view. */}
                  {h.proofPhotoUrl && (
                    <div className="mt-3">
                      <p className="text-[10px] font-semibold uppercase text-gray-500">Handoff photo</p>
                      <a
                        href={h.proofPhotoUrl}
                        target="_blank"
                        rel="noopener"
                        title="Open the full-size image in a new tab"
                        className="mt-1 inline-flex items-center gap-2"
                      >
                        <img
                          src={h.proofPhotoUrl}
                          alt={`Proof photo for the ${stageLabel} handoff`}
                          className="h-28 w-28 rounded-lg border border-[#E5E7EB] object-cover transition-colors hover:border-[#3A7BD5]"
                        />
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#3A7BD5] hover:underline">
                          <Camera size={12} />
                          Full size
                          <ChevronRight size={12} />
                        </span>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Liability matrix reference */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-4">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/70 mb-3">
          <FileText size={12} /> Liability matrix (Spec V8)
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E7EB] text-left text-[#0F2B4C]/50 text-xs uppercase tracking-wide">
              <th className="py-2">Lost between</th>
              <th className="py-2">Liable party</th>
            </tr>
          </thead>
          <tbody className="text-[#0F2B4C]">
            <tr className="border-b border-[#F3F4F6]"><td className="py-2">Customer → Partner store</td><td className="py-2">Customer (pre-handoff)</td></tr>
            <tr className="border-b border-[#F3F4F6]"><td className="py-2">Inside Partner store</td><td className="py-2">Partner store</td></tr>
            <tr className="border-b border-[#F3F4F6]"><td className="py-2">Partner store → Driver</td><td className="py-2">Partner store until driver scans</td></tr>
            <tr className="border-b border-[#F3F4F6]"><td className="py-2">Driver in transit</td><td className="py-2">Driver (rating + escrow withholding)</td></tr>
            <tr className="border-b border-[#F3F4F6]"><td className="py-2">Driver → Final Partner store</td><td className="py-2">Driver until store scans</td></tr>
            <tr className="border-b border-[#F3F4F6]"><td className="py-2">Inside final Partner store</td><td className="py-2">Partner store</td></tr>
            <tr><td className="py-2">Partner store → Recipient</td><td className="py-2">Partner store until recipient scans</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DisputesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[#0F2B4C]/40">Loading…</div>}>
      <DisputesContent />
    </Suspense>
  );
}
