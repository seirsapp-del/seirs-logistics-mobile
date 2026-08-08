import { useEffect, useRef, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { chatApi, ChatMessageDTO } from '../services/api';

interface UseChatOptions {
  /** Backend Socket.io URL. Pass your app's SOCKET_URL constant. */
  socketUrl: string;
  /** AsyncStorage key the app stores its session under. */
  storageKey?: string;
}

interface UseChatState {
  messages: ChatMessageDTO[];
  loading:  boolean;
  sending:  boolean;
  send:     (body: string, imageUrl?: string | null) => Promise<void>;
}

/**
 * Live chat hook for the customer ↔ driver conversation tied to a delivery.
 *
 * - Loads the last 100 messages from REST on mount.
 * - Joins the Socket.io room `chat:<deliveryId>` and appends new messages
 *   in real time via the backend's `chat:message` event.
 * - `send()` posts to REST; the hook does NOT optimistically append because
 *   the WS broadcast will round-trip and add the message naturally
 *   (avoids duplicates).
 *
 * Pass `null` deliveryId to disable (e.g. on a new chat that hasn't
 * been created yet).
 */
export function useChat(deliveryId: string | null, opts: UseChatOptions): UseChatState {
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [sending,  setSending]  = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Initial REST fetch. Also marks the other party's messages as read
  // (backend side-effect of GET /chats/:id/messages).
  useEffect(() => {
    if (!deliveryId) { setMessages([]); return; }
    let cancelled = false;
    setLoading(true);
    chatApi.list(deliveryId)
      .then(list => { if (!cancelled) setMessages(list); })
      .catch(()   => { if (!cancelled) setMessages([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [deliveryId]);

  // Socket.io subscription to `chat:<deliveryId>` room.
  useEffect(() => {
    if (!deliveryId) return;

    let cancelled = false;
    let socket: Socket | null = null;

    (async () => {
      const stored = await AsyncStorage.getItem(opts.storageKey ?? 'seirs_user').catch(() => null);
      const token  = stored ? (JSON.parse(stored).token ?? null) : null;
      if (cancelled) return;

      socket = io(`${opts.socketUrl}/tracking`, {
        transports: ['websocket'],
        reconnection: true,
        ...(token ? { auth: { token: `Bearer ${token}` } } : {}),
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket!.emit('chat:join', { deliveryId });
      });

      socket.on('chat:message', (msg: ChatMessageDTO) => {
        if (cancelled) return;
        setMessages(prev =>
          // Dedupe in case the same message arrives twice (REST + WS race).
          prev.some(m => m.id === msg.id) ? prev : [...prev, msg],
        );
      });
    })();

    return () => {
      cancelled = true;
      if (socket) {
        socket.emit('chat:leave', { deliveryId });
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [deliveryId, opts.socketUrl, opts.storageKey]);

  const send = useCallback(async (body: string, imageUrl?: string | null) => {
    if (!deliveryId) return;
    const trimmedBody = body?.trim() ?? '';
    const cleanImage  = imageUrl?.trim() || null;
    // Reject only when BOTH are empty. Image-only messages are valid.
    if (!trimmedBody && !cleanImage) return;
    setSending(true);
    try {
      await chatApi.send(deliveryId, trimmedBody, cleanImage);
      // No local append. WS round-trip delivers it back.
    } finally {
      setSending(false);
    }
  }, [deliveryId]);

  return { messages, loading, sending, send };
}
