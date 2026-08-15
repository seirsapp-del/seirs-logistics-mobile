import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard';
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
import { MapsModule } from './maps/maps.module';
import { MailModule } from './mail/mail.module';
import { UploadModule } from './upload/upload.module';
import { BusinessModule } from './business/business.module';
import { FxModule } from './fx/fx.module';
import { FeesModule } from './fees/fees.module';
import { ChatModule }   from './chat/chat.module';
import { SupportModule } from './support/support.module';
import { SosModule }    from './sos/sos.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { UserVerificationModule } from './user-verification/user-verification.module';
import { PartnerStoreModule } from './partner-store/partner-store.module';
import { PoolingModule } from './pooling/pooling.module';
import { MultiDropRoutingModule } from './multi-drop-routing/multi-drop-routing.module';
import { OfflineSyncModule } from './offline-sync/offline-sync.module';
import { DevPlatformModule } from './developer-platform/dev-platform.module';
import { RolesModule } from './roles/roles.module';
import { PricingModule } from './pricing/pricing.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { EarningsModule } from './earnings/earnings.module';
import { PromotionsModule } from './promotions/promotions.module';
import { SuggestionsModule } from './suggestions/suggestions.module';
import { WebsiteContentModule } from './website-content/website-content.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { AddressesModule } from './addresses/addresses.module';
import { MaintenanceModule } from './maintenance/maintenance.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global fallback for routes without their own @Throttle. Raised from
    // 100 now that the guard actually runs: authenticated traffic is
    // counted per token, but anonymous traffic still shares an IP, and a
    // Nigerian carrier NAT puts a great many real people behind one.
    // The routes worth defending closely carry their own strict limits.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
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
    MapsModule,
    MailModule,
    UploadModule,
    BusinessModule,
    FxModule,
    FeesModule,
    ChatModule,
    SupportModule,
    SosModule,
    DocumentsModule,
    HealthModule,
    IdentityModule,
    UserVerificationModule,
    PartnerStoreModule,
    PoolingModule,
    MultiDropRoutingModule,
    OfflineSyncModule,
    DevPlatformModule,
    RolesModule,
    PricingModule,
    LoyaltyModule,
    EarningsModule,
    PromotionsModule,
    SuggestionsModule,
    WebsiteContentModule,
    TelemetryModule,
    AddressesModule,
    MaintenanceModule,
  ],
  providers: [
    /**
     * Rate limiting (audit 2026-08-14).
     *
     * ThrottlerModule.forRoot has been configured since early on, and
     * auth carried @Throttle decorators on login, register and OTP. None
     * of it did anything: registering the module supplies the config,
     * but without the guard nothing consults it, so every decorator in
     * the codebase was decorative and the API had no rate limiting in
     * production at all.
     *
     * That is what made the add-card reference guessable in practice,
     * and it left login and OTP open to unlimited attempts.
     */
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
  ],
})
export class AppModule {}
