'use client';
import { Wallet, Clock, ArrowDownCircle, TrendingUp } from 'lucide-react';

const PENDING_PAYOUTS = [
  { driver: 'Tunde Fashola',    amount: '₦12,400', period: 'Apr 21–27',  trips: 14, status: 'Queued'     },
  { driver: 'Ngozi Obi',       amount: '₦8,750',  period: 'Apr 21–27',  trips: 10, status: 'Processing' },
  { driver: 'Damilola Adeola', amount: '₦15,200', period: 'Apr 21–27',  trips: 18, status: 'Queued'     },
  { driver: 'Kelechi Nwachukwu', amount: '₦6,300', period: 'Apr 21–27', trips: 7,  status: 'On Hold'    },
];

const WITHDRAWAL_REQUESTS = [
  { driver: 'Amaka Okonkwo',  amount: '₦5,000',  bank: 'GTBank ••••4821', requested: '30 Apr 2026', status: 'Pending'  },
  { driver: 'Segun Adeleke',  amount: '₦10,000', bank: 'Access ••••7743', requested: '29 Apr 2026', status: 'Approved' },
  { driver: 'Bisi Lawal',     amount: '₦2,500',  bank: 'UBA ••••3319',    requested: '28 Apr 2026', status: 'Pending'  },
];

const PAYOUT_STATUS: Record<string, string> = {
  Queued:     'bg-gray-100 text-gray-600',
  Processing: 'bg-[#3A7BD5]/10 text-[#3A7BD5]',
  'On Hold':  'bg-red-100 text-red-700',
};

const WITHDRAW_STATUS: Record<string, string> = {
  Pending:  'bg-yellow-100 text-yellow-700',
  Approved: 'bg-green-100 text-green-700',
};

export default function WalletPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <Wallet size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#0F2B4C]">Wallet & Payouts</h1>
          <p className="text-sm text-gray-500">Driver earnings, payout queues, and withdrawal requests</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Pending Payouts', value: '—', sub: 'This week', icon: Clock,           color: 'text-yellow-600' },
          { label: 'Withdrawal Requests',   value: '—', sub: 'Awaiting approval', icon: ArrowDownCircle, color: 'text-[#3A7BD5]' },
          { label: 'Total Paid Out (MTD)',  value: '—', sub: 'Month to date', icon: TrendingUp,   color: 'text-green-600' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
              <Icon size={18} className={color} />
            </div>
            <div>
              <div className="text-xl font-bold text-[#0F2B4C]">{value}</div>
              <div className="text-xs font-medium text-gray-700">{label}</div>
              <div className="text-xs text-gray-400">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Pending payouts table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-[#0F2B4C]">Pending Payouts</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-3">Driver</th>
                <th className="text-left px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Period</th>
                <th className="text-left px-4 py-3">Trips</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {PENDING_PAYOUTS.map((p) => (
                <tr key={p.driver} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-[#0F2B4C]">{p.driver}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{p.amount}</td>
                  <td className="px-4 py-3 text-gray-500">{p.period}</td>
                  <td className="px-4 py-3 text-gray-600">{p.trips}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAYOUT_STATUS[p.status]}`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-[#3A7BD5] hover:underline font-medium">Process</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Withdrawal requests table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-[#0F2B4C]">Withdrawal Requests</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-3">Driver</th>
                <th className="text-left px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Bank</th>
                <th className="text-left px-4 py-3">Requested</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {WITHDRAWAL_REQUESTS.map((w) => (
                <tr key={w.driver} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-[#0F2B4C]">{w.driver}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{w.amount}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{w.bank}</td>
                  <td className="px-4 py-3 text-gray-500">{w.requested}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${WITHDRAW_STATUS[w.status]}`}>{w.status}</span>
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button className="text-xs text-green-600 hover:underline font-medium">Approve</button>
                    <button className="text-xs text-red-500 hover:underline font-medium">Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
          Showing placeholder data — connect to Flutterwave API to load live wallet records
        </div>
      </div>
    </div>
  );
}
