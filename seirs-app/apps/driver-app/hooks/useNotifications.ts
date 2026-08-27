import { useState, useEffect, useCallback } from 'react';
import { notificationsApi } from '@/services/api';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  deliveryId?: string;
  createdAt: string;
}

interface UseNotificationsReturn {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

/**
 * One store, every consumer.
 *
 * This hook held its state per call site, and there are two: the bell in
 * the header and the notifications screen itself. Clearing on the screen
 * set THAT instance to zero while the bell kept the number it fetched on
 * mount, so the badge sat at 99+ over an empty list until the app was
 * restarted (founder 2026-08-27: "the notification bell has 99+ even
 * after i clear all notifications").
 *
 * A module-level store with subscribers fixes it without a provider, so
 * no screen has to be wrapped and no call site changes.
 */
type Store = { notifications: AppNotification[]; unreadCount: number; loading: boolean };
let store: Store = { notifications: [], unreadCount: 0, loading: false };
const listeners = new Set<(s: Store) => void>();
let hasFetched = false;

function setStore(patch: Partial<Store>) {
  store = { ...store, ...patch };
  listeners.forEach(fn => fn(store));
}

export function useNotifications(): UseNotificationsReturn {
  const [snapshot, setSnapshot] = useState<Store>(store);

  useEffect(() => {
    listeners.add(setSnapshot);
    return () => { listeners.delete(setSnapshot); };
  }, []);

  const notifications = snapshot.notifications;
  const unreadCount   = snapshot.unreadCount;
  const loading       = snapshot.loading;
  const setNotifications = (
    v: AppNotification[] | ((prev: AppNotification[]) => AppNotification[]),
  ) => setStore({ notifications: typeof v === 'function' ? v(store.notifications) : v });
  const setUnreadCount = (
    v: number | ((prev: number) => number),
  ) => setStore({ unreadCount: typeof v === 'function' ? v(store.unreadCount) : v });
  const setLoading = (v: boolean) => setStore({ loading: v });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, countRes] = await Promise.all([
        notificationsApi.list(1),
        notificationsApi.unreadCount(),
      ]);
      setNotifications(listRes.items as AppNotification[]);
      setUnreadCount(countRes.count);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    await notificationsApi.markRead(id).catch(() => {});
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, isRead: true } : n),
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await notificationsApi.markAllRead().catch(() => {});
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, []);

  /**
   * Fetch once for the whole app rather than once per consumer. Two
   * mounted hooks used to mean two identical round trips on every
   * screen that showed the bell.
   */
  useEffect(() => {
    if (!hasFetched) { hasFetched = true; refresh(); }
  }, [refresh]);

  return { notifications, unreadCount, loading, refresh, markRead, markAllRead };
}
