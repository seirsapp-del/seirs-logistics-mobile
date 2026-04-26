import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '@/constants/config';
import { notificationsApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

export interface AppNotification {
  id:           string;
  title:        string;
  body:         string;
  type:         string;
  deliveryId:   string | null;
  trackingCode: string | null;
  isRead:       boolean;
  createdAt:    string;
}

interface UseNotificationsReturn {
  notifications: AppNotification[];
  unreadCount:   number;
  loading:       boolean;
  refresh:       () => void;
  markRead:      (id: string) => void;
  markAllRead:   () => void;
}

export function useNotifications(): UseNotificationsReturn {
  const { user }  = useAuth();
  const socketRef = useRef<Socket | null>(null);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [loading,       setLoading]       = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res   = await notificationsApi.list(1);
      const count = await notificationsApi.unreadCount();
      setNotifications(res.items);
      setUnreadCount(count.count);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [user?.id]);

  // Connect to WebSocket to receive real-time notifications
  useEffect(() => {
    if (!user) return;

    const socket = io(`${SOCKET_URL}/tracking`, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join:user', { userId: user.id });
    });

    socket.on('notification', (notif: AppNotification) => {
      setNotifications(prev => [notif, ...prev]);
      setUnreadCount(prev => prev + 1);
    });

    return () => { socket.disconnect(); };
  }, [user?.id]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markRead = useCallback(async (id: string) => {
    await notificationsApi.markRead(id);
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, isRead: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await notificationsApi.markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    refresh: fetchNotifications,
    markRead,
    markAllRead,
  };
}
