import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '@/constants/config';

/**
 * Live delivery-tracking hook.
 *
 * Wires the customer app to the backend's TrackingGateway (Socket.io on
 * the `/tracking` namespace). Receives:
 *   - driver:location   → driver's GPS pings
 *   - delivery:status   → status transitions (assigned → picked_up → in_transit → delivered)
 *   - delivery:assigned → driver profile when auto-match runs
 *
 * The previous implementation used a raw WebSocket on a non-existent /ws
 * endpoint and would silently never receive any updates. (See the
 * 2026-05-10 ecosystem audit.)
 */

interface DriverLocation {
  lat: number;
  lng: number;
  updatedAt?: string;
}

interface AssignedDriver {
  id?:          string;
  name:         string;
  vehicleType:  string;
  rating:       number;
  phone?:       string;
}

interface TrackingState {
  driverLocation: DriverLocation | null;
  deliveryStatus: string | null;
  assignedDriver: AssignedDriver | null;
  isConnected:    boolean;
}

export function useDeliveryTracking(deliveryId: string | null): TrackingState {
  const [state, setState] = useState<TrackingState>({
    driverLocation: null,
    deliveryStatus: null,
    assignedDriver: null,
    isConnected:    false,
  });
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!deliveryId) return;

    let cancelled = false;
    let socket: Socket | null = null;

    (async () => {
      // Pull JWT for authenticated rooms (driver pool / personal notifications).
      // Listening on a delivery room itself doesn't require auth, but the
      // backend logs the user when present.
      const stored = await AsyncStorage.getItem('seirs_user').catch(() => null);
      const token  = stored ? (JSON.parse(stored).token ?? null) : null;
      if (cancelled) return;

      socket = io(`${SOCKET_URL}/tracking`, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 2000,
        ...(token ? { auth: { token: `Bearer ${token}` } } : {}),
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        if (cancelled) return;
        setState(s => ({ ...s, isConnected: true }));
        socket!.emit('join:delivery', { deliveryId });
      });

      socket.on('disconnect', () => {
        if (cancelled) return;
        setState(s => ({ ...s, isConnected: false }));
      });

      socket.on('connect_error', () => {
        if (cancelled) return;
        setState(s => ({ ...s, isConnected: false }));
      });

      // Backend emits: { driverId, lat, lng, timestamp }
      socket.on('driver:location', (data: { driverId: string; lat: number; lng: number; timestamp: number }) => {
        if (cancelled) return;
        setState(s => ({
          ...s,
          driverLocation: {
            lat: Number(data.lat),
            lng: Number(data.lng),
            updatedAt: new Date(data.timestamp ?? Date.now()).toISOString(),
          },
        }));
      });

      // Backend emits: { deliveryId, status, timestamp, ...extra }
      socket.on('delivery:status', (data: { status: string }) => {
        if (cancelled) return;
        setState(s => ({ ...s, deliveryStatus: data.status }));
      });

      // Backend emits: { deliveryId, driver: { id, name, vehicleType, rating, phone }, timestamp }
      socket.on('delivery:assigned', (data: { driver: AssignedDriver }) => {
        if (cancelled || !data?.driver) return;
        setState(s => ({ ...s, assignedDriver: data.driver }));
      });
    })();

    return () => {
      cancelled = true;
      if (socket) {
        socket.emit('leave:delivery', { deliveryId });
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [deliveryId]);

  return state;
}
