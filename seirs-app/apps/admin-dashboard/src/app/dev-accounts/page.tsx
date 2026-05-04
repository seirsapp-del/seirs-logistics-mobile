'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Code2, AlertCircle, Activity } from 'lucide-react';

interface ApiKey {
  id:        string;
  publicKey: string;
  ownerUserId: string;
  mode:      'live' | 'test';
  name:      string;
  active:    boolean;
  callsToday: number;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function DevAccountsPage() {
  const [keys,    setKeys]    = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.devPlatform.listAccounts()
      .then(list => setKeys(Array.isArray(list) ? list : []))
      .catch(() => setKeys([]))
      .finally(() => setLoading(false));
  }, []);

  // Group by ownerUserId — each unique owner is a "developer account"
  const byOwner = keys.reduce<Record<string, ApiKey[]>>((acc, k) => {
    (acc[k.ownerUserId] ??= []).push(k);
    return acc;
  }, {});
  const accounts = Object.entries(byOwner);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <Code2 size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#0F2B4C]">Developer Accounts</h1>
          <p className="text-sm text-gray-500">
            Every business that holds at least one Developer Platform API key. Each account may have multiple keys (live + test).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card label="Total Accounts" value={accounts.length}    accent="#3A7BD5" />
        <Card label="Total Keys"     value={keys.length}        accent="#16A34A" />
        <Card label="Live Keys"      value={keys.filter(k => k.mode === 'live' && k.active).length} accent="#D97706" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-[#E5E7EB] text-[10px] font-bold uppercase tracking-wide text-gray-500">
          <div className="col-span-5">Owner</div>
          <div className="col-span-3">Keys</div>
          <div className="col-span-2 text-right">Live</div>
          <div className="col-span-2 text-right">Calls Today</div>
        </div>
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <AlertCircle size={28} className="mx-auto mb-3 opacity-40" />
            <p>No developer accounts yet.</p>
            <p className="text-xs mt-1">
              Businesses can issue keys from <code className="bg-gray-100 px-1 rounded">/(business)/api-keys</code> in the partner app.
            </p>
          </div>
        ) : (
          accounts.map(([ownerId, ownerKeys]) => {
            const callsToday = ownerKeys.reduce((s, k) => s + (k.callsToday ?? 0), 0);
            const liveCount  = ownerKeys.filter(k => k.mode === 'live' && k.active).length;
            return (
              <div key={ownerId} className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-[#F3F4F6] items-center">
                <div className="col-span-5 min-w-0">
                  <p className="text-sm font-semibold text-[#0F2B4C] font-mono truncate">{ownerId}</p>
                </div>
                <div className="col-span-3 text-sm text-[#0F2B4C]">{ownerKeys.length} key{ownerKeys.length === 1 ? '' : 's'}</div>
                <div className="col-span-2 text-right">
                  {liveCount > 0
                    ? <span className="text-xs font-bold uppercase bg-[#16A34A18] text-[#16A34A] px-2 py-1 rounded">{liveCount} live</span>
                    : <span className="text-xs text-gray-400">test only</span>
                  }
                </div>
                <div className="col-span-2 text-right text-sm text-[#0F2B4C]">{callsToday.toLocaleString()}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-5">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-black mt-1" style={{ color: accent }}>{value}</p>
    </div>
  );
}
