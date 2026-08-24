'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Code2, AlertCircle, Loader2, RefreshCw, Pause, Play, Gauge, ChevronDown, ChevronRight } from 'lucide-react';
import { useConfirm, useNotify, usePrompt } from '@/components/ConfirmDialog';

// The owner block is what turns "suspend a UUID" into "suspend Ada
// Okafor". The backend does not send it yet (dev-platform.service
// listAllKeys does a bare find with no join), so every field here is
// optional and the UI falls back to the raw id. Admins must always see
// full identity, so the moment the join lands this renders it.
interface KeyOwner {
  id?:        string;
  name?:      string;
  email?:     string;
  phone?:     string;
  accountId?: string;
}

interface ApiKey {
  id:        string;
  publicKey: string;
  ownerUserId: string;
  owner?:    KeyOwner;
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
  const confirm                   = useConfirm();
  const prompt                    = usePrompt();
  const notify                    = useNotify();

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.devPlatform.listAccounts()
      .then((list: any) => setKeys(Array.isArray(list) ? list : []))
      .catch((e: any) => setError(e?.message ?? 'Could not load keys'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const suspend = async (ownerUserId: string, who: string) => {
    const reason = await prompt({
      title:        'Suspend this developer account?',
      message:      `Every API key held by ${who} stops working immediately. Their live integration starts failing on the next request.`,
      label:        'Suspend reason',
      placeholder:  'Repeated 429s from an unthrottled retry loop.',
      minLength:    4,
      helper:       'Kept in the audit log and shown to ops on each suspended key.',
      confirmLabel: 'Suspend keys',
      danger:       true,
    });
    if (reason === null) return;
    try {
      const r = await adminApi.devPlatform.suspendOwner(ownerUserId, reason.trim());
      void notify({ tone: 'success', message: `Suspended ${r.suspended} key${r.suspended === 1 ? '' : 's'} for this owner.` });
      load();
    } catch (e: any) { void notify({ tone: 'error', title: 'Suspend failed', message: e?.message ?? 'Suspend failed' }); }
  };

  const resume = async (ownerUserId: string) => {
    const ok = await confirm({
      title:        'Resume this developer account?',
      message:      'All previously-suspended API keys for this owner will be reactivated immediately. The owner will regain full API access with their existing quota.',
      confirmLabel: 'Resume',
    });
    if (!ok) return;
    try {
      const r = await adminApi.devPlatform.resumeOwner(ownerUserId);
      void notify({ tone: 'success', message: `Resumed ${r.resumed} key${r.resumed === 1 ? '' : 's'} for this owner.` });
      load();
    } catch (e: any) { void notify({ tone: 'error', title: 'Resume failed', message: e?.message ?? 'Resume failed' }); }
  };

  const setRateLimit = async (key: ApiKey) => {
    const current = key.rateLimitOverridePerMin == null ? '' : String(key.rateLimitOverridePerMin);
    const input = await prompt({
      title:        'Rate-limit override',
      message:      `How many requests per minute should "${key.name}" be allowed? Leave blank to revert to the default of 60.`,
      label:        'Requests per minute',
      initialValue: current,
      placeholder:  '60',
      numeric:      true,
      multiline:    false,
      helper:       'Takes effect on the key’s next request. 1 is the minimum: to stop the key entirely, suspend the account.',
      confirmLabel: 'Set limit',
    });
    if (input === null) return;
    // `Number(input) || 60` turned a typed 0 into 60, so "block this key"
    // silently became "default rate". 0 now clamps to the real minimum of
    // 1 and anything non-numeric is rejected instead of being guessed at.
    let limit: number | null = null;
    if (input.trim() !== '') {
      const n = Number(input.trim());
      if (!Number.isFinite(n)) {
        void notify({ tone: 'error', title: 'Not a number', message: 'The rate limit has to be a number of requests per minute.' });
        return;
      }
      limit = Math.max(1, Math.min(100000, Math.round(n)));
    }
    try {
      await adminApi.devPlatform.setKeyRateLimit(key.id, limit);
      load();
    } catch (e: any) { void notify({ tone: 'error', title: 'Update failed', message: e?.message ?? 'Update failed' }); }
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
            // Any key of this owner carries the same owner block, so take
            // the first one that has it rather than assuming index 0.
            const owner      = ownerKeys.find(k => k.owner)?.owner;
            const ownerName  = owner?.name?.trim() || null;
            const ownerLine  = [owner?.email, owner?.phone, owner?.accountId].filter(Boolean).join(' · ');
            return (
              <div key={ownerId} className="border-b border-[#F3F4F6] last:border-b-0">
                {/* Suspend/Resume used to be a clickable <span> nested
                    inside this <button>: invalid HTML and unreachable by
                    keyboard. It is a real sibling button now. */}
                <div className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-gray-50">
                  <button
                    onClick={() => setOpenOwner(open ? null : ownerId)}
                    aria-expanded={open}
                    className="col-span-10 grid grid-cols-10 gap-4 items-center text-left"
                  >
                    <div className="col-span-5 min-w-0 flex items-center gap-2">
                      {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-semibold text-[#0F2B4C] truncate ${ownerName ? '' : 'font-mono'}`}>
                            {ownerName ?? ownerId}
                          </p>
                          {suspended && <span className="text-[10px] uppercase bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold shrink-0">Suspended</span>}
                        </div>
                        {/* Identity, never redacted: an admin suspending an
                            account has to know whose integration they are
                            switching off. Falls back to the owner id until
                            the backend join ships. */}
                        <p className="text-[11px] text-gray-500 truncate">
                          {ownerLine || <span className="font-mono">owner id {ownerId}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="col-span-2 text-sm text-[#0F2B4C]">{ownerKeys.length} key{ownerKeys.length === 1 ? '' : 's'}</div>
                    <div className="col-span-2 text-right">
                      {liveCount > 0
                        ? <span className="text-xs font-bold uppercase bg-[#16A34A18] text-[#16A34A] px-2 py-1 rounded">{liveCount} live</span>
                        : <span className="text-xs text-gray-400">test only</span>}
                    </div>
                    <div className="col-span-1 text-right text-sm text-[#0F2B4C]">{callsToday.toLocaleString()}</div>
                  </button>
                  <div className="col-span-2 text-right">
                    {suspended ? (
                      <button onClick={() => resume(ownerId)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline">
                        <Play size={12} /> Resume
                      </button>
                    ) : (
                      <button onClick={() => suspend(ownerId, ownerName ?? 'this owner')}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline">
                        <Pause size={12} /> Suspend
                      </button>
                    )}
                  </div>
                </div>
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
