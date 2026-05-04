'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { BarChart3, AlertTriangle, Activity, TrendingUp } from 'lucide-react';

interface Usage {
  totalKeys:  number;
  activeKeys: number;
  callsToday: number;
}

export default function DevUsagePage() {
  const [usage,   setUsage]   = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.devPlatform.listAllUsage()
      .then(setUsage)
      .catch(() => setUsage(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <BarChart3 size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#0F2B4C]">Platform API Stats</h1>
          <p className="text-sm text-gray-500">
            Aggregate Developer Platform usage. Top consumers, error spikes, abuse detection.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Total Keys"   value={usage?.totalKeys  ?? 0} accent="#3A7BD5" Icon={Activity} />
            <Stat label="Active Keys"  value={usage?.activeKeys ?? 0} accent="#16A34A" Icon={Activity} />
            <Stat label="Calls Today"  value={(usage?.callsToday ?? 0).toLocaleString()} accent="#D97706" Icon={TrendingUp} />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-5">
            <h2 className="text-sm font-semibold text-[#0F2B4C]/70 mb-3">Coming next</h2>
            <ul className="space-y-3">
              {[
                { icon: BarChart3,    text: 'Top 10 consumers by call volume — leaderboard with daily / monthly toggles' },
                { icon: AlertTriangle,text: 'Error rate alerts — flag any account with 4xx rate spike >5% over baseline' },
                { icon: Activity,     text: 'p50 / p95 / p99 latency by endpoint — spot slow regressions early' },
                { icon: TrendingUp,   text: 'Monthly revenue projection — based on call volumes × tier pricing from Fee Catalogue' },
              ].map((item, i) => {
                const I = item.icon;
                return (
                  <li key={i} className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#3A7BD5]/10 flex items-center justify-center shrink-0">
                      <I size={14} className="text-[#3A7BD5]" />
                    </div>
                    <p className="text-sm text-[#0F2B4C]">{item.text}</p>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              Detailed metrics require traffic — once the public <code className="bg-yellow-100 px-1 rounded">/v1/*</code> surface accepts calls and the request middleware starts incrementing per-key counters, charts will populate here.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent, Icon }: any) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</p>
        <Icon size={16} color={accent} />
      </div>
      <p className="text-3xl font-black" style={{ color: accent }}>{value}</p>
    </div>
  );
}
