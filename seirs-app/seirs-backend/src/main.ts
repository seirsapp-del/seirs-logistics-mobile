import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && process.env.SYNC_DB === 'true') {
    console.warn(
      '\n⚠️  WARNING: SYNC_DB=true in production — TypeORM will auto-alter tables on startup.\n' +
      '   This can cause data loss if entities changed. Remove SYNC_DB after first deploy.\n',
    );
  }

  if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 chars in production.');
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api/v1');

  // In production, uploads go to Cloudflare R2 — local static serving is dev-only
  if (!isProduction) {
    app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  }

  // Serve admin dashboard at /admin
  app.useStaticAssets(join(process.cwd(), 'public'), { prefix: '/admin' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // Restrict CORS to declared origins — set ALLOWED_ORIGINS as comma-separated list in .env
  // e.g. ALLOWED_ORIGINS=https://admin.seirs.co,https://app.seirs.co
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3001,http://localhost:3000')
    .split(',')
    .map(o => o.trim());

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, curl)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    methods:         ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders:  ['Content-Type', 'Authorization'],
    credentials:     true,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Seirs API running on port ${port}`);
}

bootstrap();
