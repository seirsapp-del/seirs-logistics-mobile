import { create } from 'zustand';

export interface AppNotification {
  id:        string;
  type:      'job' | 'payment' | 'system' | 'rating';
  title:     string;
  body:      string;
  isRead:    boolean;
  createdAt: string;
  meta?:     Record<string, string>;
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount:   number;

  setNotifications: (items: AppNotification[]) => void;
  markRead:         (id: string) => void;
  markAllRead:      () => void;
  addNotification:  (n: AppNotification) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount:   0,

  setNotifications: (notifications) =>
    set({ notifications, unreadCount: notifications.filter((n) => !n.isRead).length }),

  markRead: (id) =>
    set((s) => {
      const updated = s.notifications.map((n) => n.id === id ? { ...n, isRead: true } : n);
      return { notifications: updated, unreadCount: updated.filter((n) => !n.isRead).length };
    }),

  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    })),

  addNotification: (n) =>
    set((s) => ({
      notifications: [n, ...s.notifications],
      unreadCount: s.unreadCount + (n.isRead ? 0 : 1),
    })),
}));
