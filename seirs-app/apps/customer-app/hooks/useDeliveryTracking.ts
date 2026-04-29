import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SOCKET_URL } from '@/constants/config';

interface DriverLocation {
  lat: number;
  lng: number;
  updatedAt?: string;
}

interface AssignedDriver {
  name: string;
  vehicleType: string;
  rating: number;
}

interface TrackingState {
  driverLocation: DriverLocation | null;
  deliveryStatus: string | null;
  assignedDriver: AssignedDriver | null;
  isConnected: boolean;
}

export function useDeliveryTracking(deliveryId: string | null): TrackingState {
  const [state, setState] = useState<TrackingState>({
    driverLocation: null,
    deliveryStatus: null,
    assignedDriver: null,
    isConnected: false,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!deliveryId) return;

    let cancelled = false;

    const connect = async () => {
      if (cancelled) return;

      const stored = await AsyncStorage.getItem('seirs_user').catch(() => null);
      const token = stored ? (JSON.parse(stored).token ?? null) : null;

      const url = token
        ? `${SOCKET_URL.replace(/^http/, 'ws')}/ws?token=${token}&deliveryId=${deliveryId}`
        : `${SOCKET_URL.replace(/^http/, 'ws')}/ws?deliveryId=${deliveryId}`;

      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!cancelled) setState(s => ({ ...s, isConnected: true }));
        };

        ws.onmessage = (event) => {
          if (cancelled) return;
          try {
            const msg = JSON.parse(event.data);
            setState(s => {
              const next = { ...s };
              if (msg.driverLocation) next.driverLocation = msg.driverLocation;
              if (msg.status)         next.deliveryStatus = msg.status;
              if (msg.driver)         next.assignedDriver = msg.driver;
              return next;
            });
          } catch { /* ignore malformed frames */ }
        };

        ws.onerror = () => {
          if (!cancelled) setState(s => ({ ...s, isConnected: false }));
        };

        ws.onclose = () => {
          if (!cancelled) {
            setState(s => ({ ...s, isConnected: false }));
            reconnectRef.current = setTimeout(connect, 5000);
          }
        };
      } catch {
        if (!cancelled) {
          reconnectRef.current = setTimeout(connect, 5000);
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [deliveryId]);

  return state;
}
