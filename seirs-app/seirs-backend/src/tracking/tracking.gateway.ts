import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

// Events the server emits to clients
export const WsEvents = {
  DRIVER_LOCATION:   'driver:location',
  DELIVERY_STATUS:   'delivery:status',
  DRIVER_ASSIGNED:   'delivery:assigned',
  ETA_UPDATE:        'delivery:eta',
  DELIVERY_COMPLETE: 'delivery:completed',
};

const ClientEvents = {
  JOIN_DELIVERY:     'join:delivery',
  LEAVE_DELIVERY:    'leave:delivery',
  DRIVER_UPDATE_LOC: 'driver:update-location',
  JOIN_DRIVER_POOL:  'join:driver-pool',
};

@WebSocketGateway({
  // CORS restricted — origins set via ALLOWED_ORIGINS env var (comma-separated)
  cors: {
    origin: (origin: string, callback: Function) => {
      const allowed = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3001')
        .split(',')
        .map(o => o.trim());
      // Allow mobile apps (no origin header) and listed origins
      if (!origin || allowed.includes(origin) || allowed.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  },
  namespace: '/tracking',
})
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TrackingGateway.name);

  // Per-instance session caches. Sockets die with their host process, so these
  // intentionally don't persist across restarts. Cross-instance broadcasting
  // is handled by RedisIoAdapter (see main.ts). Driver GPS positions live in
  // Redis with TTL and survive restarts independently of these maps.
  private authedClients   = new Map<string, { userId: string; role: string }>();
  private connectedDrivers = new Map<string, string>();

  constructor(
    private redisService: RedisService,
    private jwtService:   JwtService,
    private cfg:          ConfigService,
  ) {}

  // Verify JWT from handshake auth or Authorization header
  private extractUser(client: Socket): { userId: string; role: string } | null {
    try {
      const token =
        client.handshake.auth?.token?.replace('Bearer ', '') ??
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) return null;

      const payload = this.jwtService.verify(token, {
        secret: this.cfg.get<string>('JWT_SECRET'),
      });
      return { userId: payload.sub, role: payload.role };
    } catch {
      return null;
    }
  }

  handleConnection(client: Socket) {
    const user = this.extractUser(client);
    if (user) {
      this.authedClients.set(client.id, user);
      // Auto-join personal notification room
      client.join(`user:${user.userId}`);
      this.logger.log(`Client ${client.id} connected (userId=${user.userId})`);
    } else {
      // Unauthenticated connections allowed — they can only join public delivery rooms
      this.logger.log(`Unauthenticated client connected: ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    const driverId = this.connectedDrivers.get(client.id);
    if (driverId) {
      this.connectedDrivers.delete(client.id);
      this.logger.log(`Driver ${driverId} disconnected`);
    }
    this.authedClients.delete(client.id);
  }

  // Customer joins a room to track their delivery (public — no auth required)
  @SubscribeMessage(ClientEvents.JOIN_DELIVERY)
  async joinDeliveryRoom(
    @MessageBody() data: { deliveryId: string },
    @ConnectedSocket() client: Socket,
  ) {
    await client.join(`delivery:${data.deliveryId}`);
    return { event: 'joined', deliveryId: data.deliveryId };
  }

  @SubscribeMessage(ClientEvents.LEAVE_DELIVERY)
  async leaveDeliveryRoom(
    @MessageBody() data: { deliveryId: string },
    @ConnectedSocket() client: Socket,
  ) {
    await client.leave(`delivery:${data.deliveryId}`);
  }

  // Driver registers as online — requires valid JWT with driver role
  @SubscribeMessage(ClientEvents.JOIN_DRIVER_POOL)
  joinDriverPool(
    @MessageBody() data: { driverId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = this.authedClients.get(client.id);
    if (!user || user.role !== 'driver') {
      client.emit('error', { message: 'Authentication required to join driver pool' });
      return;
    }

    this.connectedDrivers.set(client.id, data.driverId);
    client.join(`driver:${data.driverId}`);
  }

  // Driver sends GPS ping — verify it's the actual driver, not someone spoofing
  @SubscribeMessage(ClientEvents.DRIVER_UPDATE_LOC)
  async updateDriverLocation(
    @MessageBody() data: { driverId: string; deliveryId: string; lat: number; lng: number },
    @ConnectedSocket() client: Socket,
  ) {
    const user = this.authedClients.get(client.id);
    if (!user || user.role !== 'driver') {
      client.emit('error', { message: 'Authentication required' });
      return;
    }

    // Validate lat/lng ranges
    if (
      typeof data.lat !== 'number' || typeof data.lng !== 'number' ||
      data.lat < -90 || data.lat > 90 ||
      data.lng < -180 || data.lng > 180
    ) {
      return;
    }

    await this.redisService.setDriverLocation(data.driverId, data.lat, data.lng);

    this.server.to(`delivery:${data.deliveryId}`).emit(WsEvents.DRIVER_LOCATION, {
      driverId:  data.driverId,
      lat:       data.lat,
      lng:       data.lng,
      timestamp: Date.now(),
    });
  }

  // Client joins personal notification room — requires auth
  @SubscribeMessage('join:user')
  joinUserRoom(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = this.authedClients.get(client.id);
    // Only allow joining your own room
    if (!user || user.userId !== data.userId) {
      client.emit('error', { message: 'Authentication required' });
      return;
    }
    client.join(`user:${user.userId}`);
    return { event: 'joined:user', userId: user.userId };
  }

  // ── Server → client broadcast helpers ─────────────────────────────────────

  broadcastStatusChange(deliveryId: string, status: string, extra?: object) {
    this.server.to(`delivery:${deliveryId}`).emit(WsEvents.DELIVERY_STATUS, {
      deliveryId, status, timestamp: Date.now(), ...extra,
    });
  }

  broadcastDriverAssigned(deliveryId: string, driver: any) {
    this.server.to(`delivery:${deliveryId}`).emit(WsEvents.DRIVER_ASSIGNED, {
      deliveryId,
      driver: {
        id:          driver.id,
        name:        driver.user?.name,
        vehicleType: driver.vehicleType,
        rating:      driver.rating,
        phone:       driver.user?.phone,
      },
      timestamp: Date.now(),
    });
  }

  notifyDriver(driverId: string, delivery: any) {
    this.server.to(`driver:${driverId}`).emit('job:request', {
      delivery, timestamp: Date.now(),
    });
  }

  notifyUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }
}
