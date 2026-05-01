'use client';
import { FileBarChart, Download, Calendar, BarChart2, TrendingUp, Package } from 'lucide-react';

const REPORT_TYPES = [
  {
    title:       'Delivery Performance Report',
    description: 'On-time rate, SLA breaches, average delivery time by zone and vehicle type.',
    icon:        Package,
    period:      'Weekly / Monthly',
    lastRun:     '—',
    format:      'CSV, PDF',
  },
  {
    title:       'Revenue & Finance Summary',
    description: 'Total revenue, platform fees, driver payouts, and refunds by period.',
    icon:        TrendingUp,
    period:      'Monthly',
    lastRun:     '—',
    format:      'XLSX, PDF',
  },
  {
    title:       'Driver Activity Report',
    description: 'Active drivers, trips completed, earnings, and compliance status.',
    icon:        BarChart2,
    period:      'Weekly',
    lastRun:     '—',
    format:      'CSV, PDF',
  },
  {
    title:       'Customer Growth Report',
    description: 'New signups, retention rate, referrals, and geographical spread.',
    icon:        FileBarChart,
    period:      'Monthly',
    lastRun:     '—',
    format:      'PDF',
  },
];

export default function ReportsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <FileBarChart size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Reports</h1>
            <p className="text-sm text-gray-500">Generate, schedule, and download platform reports</p>
          </div>
        </div>
        <button className="flex items-center gap-2 border border-[#3A7BD5] text-[#3A7BD5] text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#3A7BD5]/5 transition-colors">
          <Calendar size={15} />
          Schedule Report
        </button>
      </div>

      {/* Report cards */}
      <div className="grid grid-cols-2 gap-4">
        {REPORT_TYPES.map((r) => {
          const Icon = r.icon;
          return (
            <div key={r.title} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#0F2B4C]/8 flex items-center justify-center shrink-0">
                  <Icon size={18} className="text-[#0F2B4C]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0F2B4C]">{r.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{r.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t border-gray-100">
                <span><span className="font-medium text-gray-700">Period:</span> {r.period}</span>
                <span><span className="font-medium text-gray-700">Last run:</span> {r.lastRun}</span>
                <span><span className="font-medium text-gray-700">Formats:</span> {r.format}</span>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 flex items-center justify-center gap-1.5 bg-[#0F2B4C] text-white text-xs font-medium py-2 rounded-lg hover:bg-[#0F2B4C]/90 transition-colors">
                  <Download size={12} />
                  Generate Now
                </button>
                <button className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 text-gray-600 text-xs font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors">
                  <Calendar size={12} />
                  Schedule
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <FileBarChart size={32} className="text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Report history and download archive will appear here once reports are generated.</p>
        <p className="text-xs text-gray-400 mt-1">Connect to API to enable automated report generation and scheduling.</p>
      </div>
    </div>
  );
}
