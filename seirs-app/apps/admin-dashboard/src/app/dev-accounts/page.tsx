'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Code2, AlertCircle, Loader2, RefreshCw, Pause, Play, Gauge, ChevronDown, ChevronRight } from 'lucide-react';

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
  rateLimitOverridePerMin: number | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
}

export default function DevAccountsPage() {
  const [keys,    setKeys]    = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [openOwner, setOpenOwner] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.devPlatform.listAccounts()
      .then((list: any) => setKeys(Array.isArray(list) ? list : []))
      .catch((e: any) => setError(e?.message ?? 'Could not load keys'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const suspend = async (ownerUserId: string) => {
    const reason = prompt('Suspend reason (visible in audit log):');
    if (!reason || reason.trim().length < 4) return;
    try {
      const r = await adminApi.devPlatform.suspendOwner(ownerUserId, reason.trim());
      alert(`Suspended ${r.suspended} key${r.suspended === 1 ? '' : 's'} for this owner.`);
      load();
    } catch (e: any) { alert(e?.message ?? 'Suspend failed'); }
  };

  const resume = async (ownerUserId: string) => {
    if (!confirm('Resume this developer account? All keys will be reactivated.')) return;
    try {
      const r = await adminApi.devPlatform.resumeOwner(ownerUserId);
      alert(`Resumed ${r.resumed} key${r.resumed === 1 ? '' : 's'} for this owner.`);
      load();
    } catch (e: any) { alert(e?.message ?? 'Resume failed'); }
  };

  const setRateLimit = async (key: ApiKey) => {
    const current = key.rateLimitOverridePerMin == null ? '' : String(key.rateLimitOverridePerMin);
    const input = prompt(
      `Rate-limit override for "${key.name}" (req/min). Leave blank to revert to default (60).`,
      current,
    );
    if (input === null) return;
    const limit = input.trim() === '' ? null : Math.max(1, Math.min(100000, Number(input) || 60));
    try {
      await adminApi.devPlatform.setKeyRateLimit(key.id, limit);
      load();
    } catch (e: any) { alert(e?.message ?? 'Update failed'); }
  };

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
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#0F2B4C]">Developer Accounts</h1>
          <p className="text-sm text-gray-500">
            Every business holding ≥1 API key. Suspend instantly revokes all their keys; set per-key rate-limit overrides for high-volume partners.
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card label="Total Accounts" value={accounts.length}    accent="#3A7BD5" />
        <Card label="Total Keys"     value={keys.length}        accent="#16A34A" />
        <Card label="Live Keys"      value={keys.filter(k => k.mode === 'live' && k.active).length} accent="#D97706" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" /> Loading…
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <AlertCircle size={28} className="mx-auto mb-3 opacity-40" />
            <p>No developer accounts yet.</p>
            <p className="text-xs mt-1">
              Businesses can issue keys from <code className="bg-gray-100 px-1 rounded">/(business)/api-keys</code>.
            </p>
          </div>
        ) : (
          accounts.map(([ownerId, ownerKeys]) => {
            const open       = openOwner === ownerId;
            const callsToday = ownerKeys.reduce((s, k) => s + (k.callsToday ?? 0), 0);
            const liveCount  = ownerKeys.filter(k => k.mode === 'live' && k.active).length;
            const suspended  = ownerKeys.every(k => !k.active && k.suspendedAt);
            return (
              <div key={ownerId} className="border-b border-[#F3F4F6] last:border-b-0">
                <button
                  onClick={() => setOpenOwner(open ? null : ownerId)}
                  className="w-full grid grid-cols-12 gap-4 px-4 py-3 items-center text-left hover:bg-gray-50"
                >
                  <div className="col-span-5 min-w-0 flex items-center gap-2">
                    {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                    <p className="text-sm font-semibold text-[#0F2B4C] font-mono truncate">{ownerId}</p>
                    {suspended && <span className="text-[10px] uppercase bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">Suspended</span>}
                  </div>
                  <div className="col-span-2 text-sm text-[#0F2B4C]">{ownerKeys.length} key{ownerKeys.length === 1 ? '' : 's'}</div>
                  <div className="col-span-2 text-right">
                    {liveCount > 0
                      ? <span className="text-xs font-bold uppercase bg-[#16A34A18] text-[#16A34A] px-2 py-1 rounded">{liveCount} live</span>
                      : <span className="text-xs text-gray-400">test only</span>}
                  </div>
                  <div className="col-span-1 text-right text-sm text-[#0F2B4C]">{callsToday.toLocaleString()}</div>
                  <div className="col-span-2 text-right">
                    {suspended ? (
                      <span onClick={e => { e.stopPropagation(); resume(ownerId); }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline cursor-pointer">
                        <Play size={12} /> Resume
                      </span>
                    ) : (
                      <span onClick={e => { e.stopPropagation(); suspend(ownerId); }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline cursor-pointer">
                        <Pause size={12} /> Suspend
                      </span>
                    )}
                  </div>
                </button>
                {open && (
                  <div className="bg-gray-50 px-4 py-3 border-t border-[#F3F4F6] space-y-2">
                    {ownerKeys.map(k => (
                      <div key={k.id} className="flex items-center gap-3 bg-white border border-[#E5E7EB] rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-[#0F2B4C]">
                            {k.name} <span className="text-[10px] uppercase ml-1 px-1 rounded bg-gray-100 text-gray-600">{k.mode}</span>
                          </div>
                          <div className="text-[10px] font-mono text-gray-400 truncate">{k.publicKey}</div>
                          {k.suspendedReason && (
                            <div className="text-[10px] text-red-600 mt-1">Reason: {k.suspendedReason}</div>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 shrink-0">{k.callsToday.toLocaleString()} calls today</div>
                        <div className="text-xs text-gray-500 shrink-0">
                          {k.rateLimitOverridePerMin != null
                            ? <span className="text-[#D97706] font-semibold">{k.rateLimitOverridePerMin}/min</span>
                            : <span>default 60/min</span>}
                        </div>
                        <button onClick={() => setRateLimit(k)}
                          className="flex items-center gap-1 text-xs font-semibold text-[#3A7BD5] hover:underline shrink-0">
                          <Gauge size={12} /> Rate-limit
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
