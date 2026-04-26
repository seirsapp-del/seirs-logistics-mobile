import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const LOCATION_TTL_SEC = 30; // driver location expires after 30s of no update

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private redisAvailable = false;
  private loggedUnavailable = false;

  constructor(private cfg: ConfigService) {}

  onModuleInit() {
    // Railway/Render/Fly.io provide REDIS_URL; fallback to individual vars for local dev
    const redisUrl = this.cfg.get<string>('REDIS_URL');
    this.client = redisUrl
      ? new Redis(redisUrl, {
          lazyConnect:          true,
          maxRetriesPerRequest: 0,
          enableOfflineQueue:   false,
          retryStrategy:        () => null,
          tls: redisUrl.startsWith('rediss://') ? {} : undefined,
        })
      : new Redis({
          host:                 this.cfg.get('REDIS_HOST', 'localhost'),
          port:                 this.cfg.get<number>('REDIS_PORT', 6379),
          password:             this.cfg.get('REDIS_PASSWORD', undefined),
          lazyConnect:          true,
          maxRetriesPerRequest: 0,
          enableOfflineQueue:   false,
          retryStrategy:        () => null,
        });

    this.client.on('error', () => {
      if (!this.loggedUnavailable) {
        this.logger.warn('Redis unavailable — running without cache (GPS & tracking still work via DB)');
        this.loggedUnavailable = true;
      }
    });

    this.client.connect().catch(() => {/* handled by error event */});
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  // Store driver GPS position with TTL
  async setDriverLocation(driverId: string, lat: number, lng: number): Promise<void> {
    try {
      await this.client.setex(
        `driver:${driverId}:location`,
        LOCATION_TTL_SEC,
        JSON.stringify({ lat, lng, updatedAt: Date.now() }),
      );
    } catch {
      // silently degrade if Redis is down
    }
  }

  async getDriverLocation(driverId: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const raw = await this.client.get(`driver:${driverId}:location`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // Publish event to a delivery room (all subscribers get it)
  async publishDeliveryEvent(deliveryId: string, event: object): Promise<void> {
    try {
      await this.client.publish(`delivery:${deliveryId}`, JSON.stringify(event));
    } catch {
      // silently degrade
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) await this.client.setex(key, ttl, value);
      else await this.client.set(key, value);
    } catch {}
  }

  async get(key: string): Promise<string | null> {
    try {
      return this.client.get(key);
    } catch {
      return null;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch {}
  }
}
