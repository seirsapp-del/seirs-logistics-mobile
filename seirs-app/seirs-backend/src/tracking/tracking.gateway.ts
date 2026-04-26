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
import { Logger, UseGuards } from '@nestjs/common';
import { RedisService } from './redis.service';

// Events the server emits to clients
export const WsEvents = {
  DRIVER_LOCATION:    'driver:location',      // live GPS update
  DELIVERY_STATUS:    'delivery:status',      // status change
  DRIVER_ASSIGNED:    'delivery:assigned',    // driver matched
  ETA_UPDATE:         'delivery:eta',         // ETA recalculated
  DELIVERY_COMPLETE:  'delivery:completed',   // package delivered
};

// Events clients send to the server
const ClientEvents = {
  JOIN_DELIVERY:      'join:delivery',        // customer tracks a delivery
  LEAVE_DELIVERY:     'leave:delivery',
  DRIVER_UPDATE_LOC:  'driver:update-location', // driver sends GPS ping
  JOIN_DRIVER_POOL:   'join:driver-pool',     // driver goes online
};

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/tracking',
})
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TrackingGateway.name);

  // Map socket.id → driverId (for cleanup on disconnect)
  private connectedDrivers = new Map<string, string>();

  constructor(private redisService: RedisService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const driverId = this.connectedDrivers.get(client.id);
    if (driverId) {
      this.connectedDrivers.delete(client.id);
      this.logger.log(`Driver ${driverId} disconnected`);
    }
  }

  // Customer joins a room to track their delivery
  @SubscribeMessage(ClientEvents.JOIN_DELIVERY)
  async joinDeliveryRoom(
    @MessageBody() data: { deliveryId: string },
    @ConnectedSocket() client: Socket,
  ) {
    await client.join(`delivery:${data.deliveryId}`);
    this.logger.log(`Client ${client.id} tracking delivery ${data.deliveryId}`);
    return { event: 'joined', deliveryId: data.deliveryId };
  }

  @SubscribeMessage(ClientEvents.LEAVE_DELIVERY)
  async leaveDeliveryRoom(
    @MessageBody() data: { deliveryId: string },
    @ConnectedSocket() client: Socket,
  ) {
    await client.leave(`delivery:${data.deliveryId}`);
  }

  // Driver registers as online and links their socket
  @SubscribeMessage(ClientEvents.JOIN_DRIVER_POOL)
  joinDriverPool(
    @MessageBody() data: { driverId: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.connectedDrivers.set(client.id, data.driverId);
    client.join(`driver:${data.driverId}`);
    this.logger.log(`Driver ${data.driverId} joined pool`);
  }

  // Driver sends GPS ping → store in Redis + broadcast to delivery room
  @SubscribeMessage(ClientEvents.DRIVER_UPDATE_LOC)
  async updateDriverLocation(
    @MessageBody() data: { driverId: string; deliveryId: string; lat: number; lng: number },
    @ConnectedSocket() client: Socket,
  ) {
    // Persist to Redis
    await this.redisService.setDriverLocation(data.driverId, data.lat, data.lng);

    // Broadcast to everyone tracking this delivery
    this.server.to(`delivery:${data.deliveryId}`).emit(WsEvents.DRIVER_LOCATION, {
      driverId:  data.driverId,
      lat:       data.lat,
      lng:       data.lng,
      timestamp: Date.now(),
    });
  }

  // Called by DeliveriesService when delivery status changes
  broadcastStatusChange(deliveryId: string, status: string, extra?: object) {
    this.server.to(`delivery:${deliveryId}`).emit(WsEvents.DELIVERY_STATUS, {
      deliveryId,
      status,
      timestamp: Date.now(),
      ...extra,
    });
  }

  // Called when a driver is matched — notify customer
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

  // Notify specific driver of a new job request
  notifyDriver(driverId: string, delivery: any) {
    this.server.to(`driver:${driverId}`).emit('job:request', {
      delivery,
      timestamp: Date.now(),
    });
  }

  // Push an in-app notification to a specific user (any role)
  notifyUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }

  // Client joins their personal room to receive notifications
  @SubscribeMessage('join:user')
  joinUserRoom(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`user:${data.userId}`);
    return { event: 'joined:user', userId: data.userId };
  }
}
