import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DriversModule } from './drivers/drivers.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { TrackingModule } from './tracking/tracking.module';
import { MatchingModule } from './matching/matching.module';
import { PaymentsModule } from './payments/payments.module';
import { PartnersModule } from './partners/partners.module';
import { FallbackModule } from './fallback/fallback.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { FraudModule } from './fraud/fraud.module';
import { BulkModule } from './bulk/bulk.module';
import { RoutingModule } from './routing/routing.module';
import { MailModule } from './mail/mail.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(), // enables @Cron decorators

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): any => {
        const databaseUrl  = cfg.get<string>('DATABASE_URL');
        const isProduction = cfg.get<string>('NODE_ENV') === 'production';
        // SYNC_DB=true lets you force table creation on first production deploy
        const shouldSync   = !isProduction || cfg.get<string>('SYNC_DB') === 'true';
        const base = {
          type:        'postgres',
          entities:    [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: shouldSync,
          logging:     !isProduction,
        };
        if (databaseUrl) {
          return { ...base, url: databaseUrl, ssl: { rejectUnauthorized: false } };
        }
        return {
          ...base,
          host:     cfg.get<string>('DB_HOST',     'localhost'),
          port:     cfg.get<number>('DB_PORT',     5432),
          username: cfg.get<string>('DB_USERNAME', 'postgres'),
          password: cfg.get<string>('DB_PASSWORD', 'password'),
          database: cfg.get<string>('DB_NAME',     'seirs_db'),
        };
      },
    }),

    // Phase 1–4
    AuthModule,
    UsersModule,
    DriversModule,
    DeliveriesModule,
    TrackingModule,
    MatchingModule,
    PaymentsModule,
    PartnersModule,
    FallbackModule,
    AdminModule,

    // Phase 5
    NotificationsModule,
    SchedulerModule,
    FraudModule,
    BulkModule,
    RoutingModule,
    MailModule,
    UploadModule,
  ],
})
export class AppModule {}
