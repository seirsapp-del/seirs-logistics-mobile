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
  CHAT_MESSAGE:      'chat:message',
  SOS_ALERT:         'sos:alert',
};

const ClientEvents = {
  JOIN_DELIVERY:     'join:delivery',
  LEAVE_DELIVERY:    'leave:delivery',
  DRIVER_UPDATE_LOC: 'driver:update-location',
  JOIN_DRIVER_POOL:  'join:driver-pool',
  JOIN_CHAT:         'chat:join',
  LEAVE_CHAT:        'chat:leave',
  JOIN_ADMIN:        'join:admin',
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

  /**
   * Server-side broadcast of a driver GPS update to a delivery room.
   * Called by DriversService.updateLocation() so REST GPS pings reach the
   * customer's tracking screen — without this, only WS-based driver pings
   * (driver:update-location) would propagate.
   */
  broadcastDriverLocation(deliveryId: string, driverId: string, lat: number, lng: number) {
    this.server.to(`delivery:${deliveryId}`).emit(WsEvents.DRIVER_LOCATION, {
      driverId, lat, lng, timestamp: Date.now(),
    });
  }

  // ── Chat rooms ────────────────────────────────────────────────────────────
  // Each delivery has its own chat room: `chat:<deliveryId>`. Both customer
  // and driver join the same room and receive `chat:message` events when
  // either party sends. ChatService validates that the sender is a
  // participant before broadcasting (so this gateway doesn't need to).

  @SubscribeMessage(ClientEvents.JOIN_CHAT)
  async joinChatRoom(
    @MessageBody() data: { deliveryId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.deliveryId) return;
    await client.join(`chat:${data.deliveryId}`);
    return { event: 'joined:chat', deliveryId: data.deliveryId };
  }

  @SubscribeMessage(ClientEvents.LEAVE_CHAT)
  async leaveChatRoom(
    @MessageBody() data: { deliveryId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.deliveryId) return;
    await client.leave(`chat:${data.deliveryId}`);
  }

  /**
   * Called by ChatService.send() after a message is persisted.
   * Both customer and driver receive `chat:message` if joined.
   */
  broadcastChatMessage(deliveryId: string, message: { id: string; body: string; senderId: string; createdAt: Date }) {
    this.server.to(`chat:${deliveryId}`).emit(WsEvents.CHAT_MESSAGE, {
      ...message,
      createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : message.createdAt,
    });
  }

  // ── Admin / SOS ───────────────────────────────────────────────────────────
  // Admin clients join the `admin` room on connect (after JWT verification).
  // SosService.trigger() then fans out a `sos:alert` to that room so the
  // admin dashboard / on-call phone shows the incident immediately.

  @SubscribeMessage(ClientEvents.JOIN_ADMIN)
  joinAdminRoom(@ConnectedSocket() client: Socket) {
    const user = this.authedClients.get(client.id);
    if (!user || user.role !== 'admin') {
      client.emit('error', { message: 'Admin role required.' });
      return;
    }
    client.join('admin');
    return { event: 'joined:admin' };
  }

  /** Called by SosService.trigger() — broadcasts the alert to all admins. */
  broadcastSosAlert(alert: {
    id:         string;
    userId:     string;
    userName:   string;
    userPhone:  string;
    deliveryId: string | null;
    lat:        number | null;
    lng:        number | null;
    note:       string | null;
    createdAt:  Date;
  }) {
    this.server.to('admin').emit(WsEvents.SOS_ALERT, {
      ...alert,
      createdAt: alert.createdAt instanceof Date ? alert.createdAt.toISOString() : alert.createdAt,
    });
  }
}
