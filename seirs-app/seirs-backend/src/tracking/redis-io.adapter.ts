import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { INestApplicationContext, Logger } from '@nestjs/common';

// Custom socket.io adapter that uses Redis pub/sub so multiple Node instances
// share rooms. Without this, two Railway pods can't broadcast to the same
// delivery room.
//
// Falls back to default in-process behaviour if Redis is unavailable —
// single-instance deployments keep working without any Redis dependency.
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.warn('REDIS_URL not set — socket.io running in single-instance mode');
      return;
    }

    const opts = {
      lazyConnect:          true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue:   false,
      retryStrategy:        () => null,
      tls: url.startsWith('rediss://') ? {} : undefined,
    };

    const pubClient = new Redis(url, opts);
    const subClient = pubClient.duplicate();

    try {
      await Promise.all([pubClient.connect(), subClient.connect()]);
      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log('Socket.io Redis adapter connected — multi-instance broadcasting enabled');
    } catch (err) {
      this.logger.warn(`Socket.io Redis adapter failed (${(err as Error).message}) — running in single-instance mode`);
      this.adapterConstructor = null;
    }
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
