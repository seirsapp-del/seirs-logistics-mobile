'use client';

/**
 * Platform API traffic, in total.
 *
 * One job: tell somebody at a glance how much outside software is
 * leaning on SEIRS today. Which company is doing it is one click away on
 * Developer accounts, so this page deliberately stays a headline.
 *
 * It used to swallow its own failure: a failed request set usage to null
 * and the three tiles then rendered 0, 0, 0. A dead API and a quiet day
 * looked exactly the same, on the one screen whose job is spotting the
 * difference.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { BarChart3, AlertTriangle, Activity, TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';

interface Usage {
  totalKeys:  number;
  activeKeys: number;
  callsToday: number;
}

export default function DevUsagePage() {
  const [usage,   setUsage]   = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.devPlatform.listAllUsage()
      .then(setUsage)
      .catch((e: any) => { setUsage(null); setError(e?.message ?? 'The server did not answer.'); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-6">
      <PageIntro
        title="API traffic"
        purpose="How much outside software is calling SEIRS today, across every business plugged into us."
        storageKey="dev-usage"
        help={
          <>
            <p>Nothing on this page changes anything. It only counts.</p>
            <p><b>Calls today</b> resets at midnight Nigerian time. To see which business is responsible, or to cut one off, go to <Link className="font-semibold text-[#3A7BD5] hover:underline" href="/dev-accounts">Businesses plugged into SEIRS</Link>.</p>
          </>
        }
        actions={
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : error ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white">
          <EmptyState
            icon={<AlertCircle size={20} />}
            title="The traffic figures would not load"
            body={`${error} This is the dashboard failing to read them, and says nothing about whether the API itself is up.`}
            action={{ label: 'Try again', onClick: load }}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Keys that exist"          value={(usage?.totalKeys  ?? 0).toLocaleString()} accent="#3A7BD5" Icon={Activity} />
            <Stat label="Keys still working"       value={(usage?.activeKeys ?? 0).toLocaleString()} accent="#16A34A" Icon={Activity} />
            <Stat label="Requests since midnight"  value={(usage?.callsToday ?? 0).toLocaleString()} accent="#D97706" Icon={TrendingUp} />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-5">
            {/* Labelled as not built, plainly. A roadmap on an operations
                screen reads as a broken feature unless it says otherwise. */}
            <h2 className="text-sm font-semibold text-[#0F2B4C]">Not built yet</h2>
            <p className="mb-3 text-xs text-gray-500">
              None of the following exists today. There is nothing here for you to press or wait for.
            </p>
            <ul className="space-y-3">
              {[
                { icon: BarChart3,     text: 'A league table of the ten businesses calling us most, by day and by month.' },
                { icon: AlertTriangle, text: 'A warning when one business suddenly starts getting far more errors than usual, which normally means their software broke.' },
                { icon: Activity,      text: 'How long each part of the API takes to answer, so a slowdown is caught before partners complain.' },
                { icon: TrendingUp,    text: 'What this traffic is expected to earn, using the prices in the Fee catalogue.' },
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
              A count of zero here is normal for now: the public API is not open to outside traffic yet,
              so there is nothing to count. Once businesses start calling it, these numbers move on their own.
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
      <p className="text-3xl font-black tabular-nums" style={{ color: accent }}>{value}</p>
    </div>
  );
}
