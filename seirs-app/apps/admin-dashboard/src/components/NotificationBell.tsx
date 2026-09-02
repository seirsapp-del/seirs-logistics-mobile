'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, Loader2 } from 'lucide-react';
import { adminApi } from '@/lib/api';

/**
 * Where a notification addressed to an admin actually arrives.
 *
 * WHY it did not exist. The backend has had /notifications and
 * /notifications/unread-count since it was written, and they work for any
 * signed-in user, an admin included. The dashboard called neither. It had
 * endpoints for SENDING notifications to other people and no way to read its
 * own.
 *
 * So the expiry digest I built on 1 September, which tells super admins that
 * a rider's document has lapsed, wrote into a table that no screen here
 * displayed. The founder asked the obvious question the next morning: "where
 * do we see the notification, does it show on the dashboard?" It did not.
 * That is the third time this week something has been wired to nothing, and
 * it was mine.
 *
 * Deliberately small: a bell, a count, and the last twenty. Anything that
 * needs working through belongs on its own page with filters and a decision
 * attached, which is what /kyc and the SOS desk are for. This is the place
 * you find out that something happened.
 */

const when = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)    return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export function NotificationBell() {
  const [open,   setOpen]   = useState(false);
  const [count,  setCount]  = useState(0);
  const [items,  setItems]  = useState<any[] | null>(null);
  const [busy,   setBusy]   = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(() => {
    adminApi.myNotifications.unreadCount()
      .then(r => setCount(Number(r?.count ?? 0)))
      .catch(() => { /* an unreadable count must never break the top bar */ });
  }, []);

  useEffect(() => {
    loadCount();
    const id = setInterval(loadCount, 60_000);
    return () => clearInterval(id);
  }, [loadCount]);

  // Close when the click lands anywhere else.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && items === null) {
      try {
        const r = await adminApi.myNotifications.list(1, 20);
        setItems(r?.items ?? r?.notifications ?? []);
      } catch {
        setItems([]);
      }
    }
  };

  const markAll = async () => {
    setBusy(true);
    try {
      await adminApi.myNotifications.markAllRead();
      setCount(0);
      setItems(prev => (prev ?? []).map(n => ({ ...n, isRead: true })));
    } catch { /* leave the badge alone rather than lying about it */ }
    finally { setBusy(false); }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
        className="relative rounded-lg p-2 text-[#0F2B4C]/60 hover:bg-[#F5F5F0] hover:text-[#0F2B4C]"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-96 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-[#F0F2F5] px-4 py-2.5">
            <span className="text-sm font-bold text-[#0F2B4C]">Notifications</span>
            {count > 0 && (
              <button
                type="button" onClick={markAll} disabled={busy}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#3A7BD5] hover:underline disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items === null ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-[#0F2B4C]/50">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[#5C6E82]">
                Nothing yet. Expiring documents, security alerts and anything else
                addressed to you arrives here.
              </p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={`border-b border-[#F5F5F0] px-4 py-3 ${n.isRead ? '' : 'bg-[#3A7BD5]/[0.04]'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-[#0F2B4C]">{n.title}</p>
                    <span className="shrink-0 text-[11px] text-[#0F2B4C]/40">{when(n.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-[#5C6E82]">{n.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
