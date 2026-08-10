// MUST stay at the very top - Sentry patches http/express/etc. on import
// and any module loaded before it will be invisible to the SDK.
import './common/instrument';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './tracking/redis-io.adapter';
import { SentryExceptionFilter } from './common/filters/sentry-exception.filter';

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && process.env.SYNC_DB === 'true') {
    console.warn(
      '\n⚠️  WARNING: SYNC_DB=true in production - TypeORM will auto-alter tables on startup.\n' +
      '   This can cause data loss if entities changed. Remove SYNC_DB after first deploy.\n',
    );
  }

  if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 chars in production.');
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Security headers - applied before all routes
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'"],
        styleSrc:    ["'self'", "'unsafe-inline'"],
        imgSrc:      ["'self'", 'data:', 'https:'],
        connectSrc:  ["'self'"],
        frameSrc:    ["'none'"],
        objectSrc:   ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // Internal apps + admin hit `/api/v1/*`. The public Developer
  // Platform surface (V1Controller) sits at `/v1/*` directly so
  // partners get Stripe-style URLs (api.seirs.app/v1/orders) instead
  // of the doubled `/api/v1/v1/*` shape.
  app.setGlobalPrefix('api/v1', {
    exclude: ['v1/(.*)', 'v1'],
  });

  // In production, uploads go to Cloudflare R2 - local static serving is dev-only
  if (!isProduction) {
    app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  }

  // Serve admin dashboard at /admin
  app.useStaticAssets(join(process.cwd(), 'public'), { prefix: '/admin' });

  // Legal pages accessible at /legal/privacy and /legal/terms
  app.useStaticAssets(join(process.cwd(), 'public', 'legal'), { prefix: '/legal' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // Capture every unhandled exception to Sentry + return safe JSON.
  // Registered after pipes so validation errors still surface as 4xx
  // through the framework (not reported - see filter for 5xx gating).
  app.useGlobalFilters(new SentryExceptionFilter());

  // Restrict CORS to declared origins. Set ALLOWED_ORIGINS as a comma
  // separated list in .env, e.g. ALLOWED_ORIGINS=https://admin.seirs.co,https://app.seirs.co
  //
  // Vercel preview deploys use randomised subdomains like
  // seirs-admin-xxxxxxx-seirsapp-5350s-projects.vercel.app. Rather than
  // enumerating every preview URL, we allow any *.vercel.app origin so
  // preview links from Vercel work end-to-end. Production URLs remain
  // gated by the explicit ALLOWED_ORIGINS list.
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3001,http://localhost:3000')
    .split(',')
    .map(o => o.trim());

  const VERCEL_PREVIEW_RE = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (VERCEL_PREVIEW_RE.test(origin)) return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods:         ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders:  ['Content-Type', 'Authorization'],
    credentials:     true,
  });

  // Wire socket.io Redis adapter (multi-instance pub/sub).
  // Falls back to in-process mode if Redis unavailable.
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Seirs API running on port ${port}`);
}

bootstrap();
