'use client';
import { useState } from 'react';
import { adminApi } from '@/lib/api';
import { Search, Package, Camera, FileText, ChevronRight, AlertCircle, ShieldCheck } from 'lucide-react';

// Spec V8 §3.10 — disputes review surface. Reads the chain-of-custody
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
  store_to_driver:     '#8B5CF6',
  driver_to_store:     '#8B5CF6',
  store_to_recipient:  '#16A34A',
  driver_to_recipient: '#16A34A',
};

export default function DisputesPage() {
  const [deliveryId, setDeliveryId] = useState('');
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

  return (
    <div className="p-6 space-y-6">
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
              placeholder="UUID — paste from delivery detail page"
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

                  {h.proofPhotoUrl && (
                    <a
                      href={h.proofPhotoUrl}
                      target="_blank"
                      rel="noopener"
                      className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#3A7BD5] font-semibold hover:underline"
                    >
                      <Camera size={12} />
                      View proof photo
                      <ChevronRight size={12} />
                    </a>
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
