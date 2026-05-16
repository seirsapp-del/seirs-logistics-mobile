'use client';
import { useEffect, useState } from 'react';
import { Wallet, Clock, ArrowDownCircle, TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';
import { adminApi } from '@/lib/api';

interface PendingPayout {
  id: string;
  driverId: string;
  driverName: string;
  driverNet: number;
  availableAt: string;
  deliveryId: string;
}

interface HeldEarning {
  id: string;
  driverId: string;
  driverName: string;
  driverNet: number;
  holdReason: string | null;
  updatedAt: string;
  deliveryId: string;
}

interface RecentWithdrawal {
  id: string;
  driverId: string;
  driverName: string;
  driverNet: number;
  paidAt: string;
  flutterwaveTransferId: string | null;
  deliveryId: string;
}

interface Summary {
  pendingTotal: number; pendingCount: number;
  heldTotal: number;    heldCount: number;
  paidMtdTotal: number; paidMtdCount: number;
}

export default function WalletPage() {
  const [summary,    setSummary]    = useState<Summary | null>(null);
  const [pending,    setPending]    = useState<PendingPayout[]>([]);
  const [held,       setHeld]       = useState<HeldEarning[]>([]);
  const [paid,       setPaid]       = useState<RecentWithdrawal[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [busyId,     setBusyId]     = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, p, h, w] = await Promise.all([
        adminApi.wallet.summary().catch(() => null),
        adminApi.wallet.pendingPayouts().catch(() => []),
        adminApi.wallet.heldEarnings().catch(() => []),
        adminApi.wallet.recentWithdrawals().catch(() => []),
      ]);
      setSummary(s);
      setPending(p ?? []);
      setHeld(h ?? []);
      setPaid(w ?? []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const release = async (id: string) => {
    if (!confirm('Release this held earning back to "available" so it can be paid out?')) return;
    setBusyId(id);
    try {
      await adminApi.wallet.releaseHeld(id);
      await load();
    } catch (e: any) {
      alert(`Release failed: ${e?.message ?? 'unknown error'}`);
    } finally { setBusyId(null); }
  };

  const fmt = (n: number) => `₦${Number(n).toLocaleString()}`;
  const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-NG', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <Wallet size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Wallet & Payouts</h1>
            <p className="text-sm text-gray-500">Driver earnings ledger — pending payouts, held earnings, recent transfers.</p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Available Payouts" sub={`${summary?.pendingCount ?? 0} earnings ready`} value={fmt(summary?.pendingTotal ?? 0)} Icon={Clock}        color="text-yellow-600" />
        <SummaryCard label="Held Earnings"     sub={`${summary?.heldCount ?? 0} flagged for review`}  value={fmt(summary?.heldTotal ?? 0)}    Icon={AlertCircle}   color="text-red-600" />
        <SummaryCard label="Paid Out (MTD)"    sub={`${summary?.paidMtdCount ?? 0} transfers`}         value={fmt(summary?.paidMtdTotal ?? 0)} Icon={TrendingUp}    color="text-green-600" />
      </div>

      {/* Held earnings (urgent) */}
      <section className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <AlertCircle size={15} className="text-red-500" />
          <span className="text-sm font-semibold text-[#0F2B4C]">Held Earnings — needs review</span>
          <span className="ml-auto text-xs text-gray-500">{held.length} row{held.length === 1 ? '' : 's'}</span>
        </div>
        <div className="overflow-x-auto">
          {held.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No held earnings.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Driver</th>
                  <th className="text-left px-4 py-3">Net</th>
                  <th className="text-left px-4 py-3">Reason</th>
                  <th className="text-left px-4 py-3">Flagged</th>
                  <th className="text-left px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {held.map(h => (
                  <tr key={h.id}>
                    <td className="px-4 py-3 font-medium text-[#0F2B4C]">{h.driverName}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{fmt(h.driverNet)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{h.holdReason ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(h.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => release(h.id)}
                        disabled={busyId === h.id}
                        className="text-xs px-3 py-1.5 font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Release
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Pending payouts */}
      <section className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <Clock size={15} className="text-yellow-600" />
          <span className="text-sm font-semibold text-[#0F2B4C]">Available Payouts</span>
          <span className="ml-auto text-xs text-gray-500">{pending.length} ready · drivers self-serve via /payments/withdraw</span>
        </div>
        <div className="overflow-x-auto">
          {pending.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No pending payouts.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Driver</th>
                  <th className="text-left px-4 py-3">Net</th>
                  <th className="text-left px-4 py-3">Available Since</th>
                  <th className="text-left px-4 py-3">Delivery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pending.map(p => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-medium text-[#0F2B4C]">{p.driverName}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{fmt(p.driverNet)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(p.availableAt)}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.deliveryId.slice(0, 8)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Recent transfers */}
      <section className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <ArrowDownCircle size={15} className="text-[#3A7BD5]" />
          <span className="text-sm font-semibold text-[#0F2B4C]">Recent Transfers</span>
          <span className="ml-auto text-xs text-gray-500">Last {paid.length} successful</span>
        </div>
        <div className="overflow-x-auto">
          {paid.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No transfers yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Driver</th>
                  <th className="text-left px-4 py-3">Net</th>
                  <th className="text-left px-4 py-3">Paid</th>
                  <th className="text-left px-4 py-3">FLW Transfer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paid.map(w => (
                  <tr key={w.id}>
                    <td className="px-4 py-3 font-medium text-[#0F2B4C]">{w.driverName}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{fmt(w.driverNet)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(w.paidAt)}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{w.flutterwaveTransferId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, sub, value, Icon, color }: {
  label: string; sub: string; value: string; Icon: any; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
        <Icon size={18} className={color} />
      </div>
      <div>
        <div className="text-xl font-bold text-[#0F2B4C]">{value}</div>
        <div className="text-xs font-medium text-gray-700">{label}</div>
        <div className="text-xs text-gray-400">{sub}</div>
      </div>
    </div>
  );
}
