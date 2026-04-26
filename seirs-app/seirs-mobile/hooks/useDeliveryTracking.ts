import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '@/constants/config';

const TRACKING_URL = `${SOCKET_URL}/tracking`;

export interface DriverLocation {
  driverId:  string;
  lat:       number;
  lng:       number;
  timestamp: number;
}

export interface DeliveryUpdate {
  deliveryId: string;
  status:     string;
  timestamp:  number;
}

export interface AssignedDriver {
  id:          string;
  name:        string;
  vehicleType: string;
  rating:      number;
  phone:       string;
}

interface UseDeliveryTrackingReturn {
  driverLocation:  DriverLocation | null;
  deliveryStatus:  string | null;
  assignedDriver:  AssignedDriver | null;
  isConnected:     boolean;
}

export function useDeliveryTracking(deliveryId: string | null): UseDeliveryTrackingReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected,    setIsConnected]    = useState(false);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<string | null>(null);
  const [assignedDriver, setAssignedDriver] = useState<AssignedDriver | null>(null);

  useEffect(() => {
    if (!deliveryId) return;

    const socket = io(TRACKING_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join:delivery', { deliveryId });
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('driver:location', (data: DriverLocation) => {
      setDriverLocation(data);
    });

    socket.on('delivery:status', (data: DeliveryUpdate) => {
      setDeliveryStatus(data.status);
    });

    socket.on('delivery:assigned', (data: { driver: AssignedDriver }) => {
      setAssignedDriver(data.driver);
      setDeliveryStatus('assigned');
    });

    socket.on('delivery:completed', () => {
      setDeliveryStatus('delivered');
    });

    return () => {
      socket.emit('leave:delivery', { deliveryId });
      socket.disconnect();
    };
  }, [deliveryId]);

  return { driverLocation, deliveryStatus, assignedDriver, isConnected };
}

// Hook for drivers — sends location pings
export function useDriverLocationBroadcast(driverId: string | null, deliveryId: string | null) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!driverId) return;

    const socket = io(TRACKING_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join:driver-pool', { driverId });
    });

    return () => { socket.disconnect(); };
  }, [driverId]);

  const sendLocation = useCallback((lat: number, lng: number) => {
    if (!socketRef.current?.connected || !driverId || !deliveryId) return;
    socketRef.current.emit('driver:update-location', { driverId, deliveryId, lat, lng });
  }, [driverId, deliveryId]);

  return { sendLocation };
}
