import { KycModule } from '../kyc/kyc.module';
import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AccountIdPrefix, generateUuidAccountId } from '../common/utils/auth-codes';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccountSecurityService } from '../notifications/account-security.service';
import { DemoDataService } from './demo-data.service';
import { MoneyResetService } from './money-reset.service';
import { FeesModule } from '../fees/fees.module';
import { User, UserRole } from '../users/user.entity';
import { ArchivedUser } from '../users/archived-user.entity';
import { UsersModule } from '../users/users.module';
import { Driver } from '../drivers/driver.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { FraudModule } from '../fraud/fraud.module';
import { MailModule } from '../mail/mail.module';
import { PartnerStoreModule } from '../partner-store/partner-store.module';
import { DriversModule } from '../drivers/drivers.module';
import { PaymentsModule } from '../payments/payments.module';
import { FraudFlag } from '../fraud/fraud-flag.entity';
import { SupportTicket } from '../support/support-ticket.entity';
import { SupportModule } from '../support/support.module';
import { AuditLogEntry } from './audit-log.entity';
import { PricingConfig } from './pricing-config.entity';
import { DuplicateAccountCandidate } from './duplicate-account.entity';
import { ExternalPartner } from './external-partner.entity';
import { PlatformConfig } from './platform-config.entity';
import { DriverEarning } from '../earnings/driver-earning.entity';
import { LoyaltyPoint } from '../loyalty/loyalty-point.entity';
import { IdentityVerification } from '../user-verification/user-verification.entity';
import { BusinessAccount } from '../business/business-account.entity';
import { PartnerStore } from '../business/partner-store.entity';
import { Wallet } from '../payments/wallet.entity';
import { StoreDropoff } from '../partner-store/store-dropoff.entity';

@Module({
  imports: [
    KycModule,
    NotificationsModule,
    SupportModule,
    TypeOrmModule.forFeature([
      User, ArchivedUser, Driver, Delivery, FraudFlag,
      SupportTicket, AuditLogEntry, PricingConfig,
      DuplicateAccountCandidate, ExternalPartner,
      PlatformConfig, DriverEarning, LoyaltyPoint, IdentityVerification,
      BusinessAccount, PartnerStore, Wallet, StoreDropoff,
    ]),
    FraudModule,
    MailModule,
    PartnerStoreModule,
    DriversModule,
    PaymentsModule,
    UsersModule,
    FeesModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, DemoDataService, MoneyResetService],
  exports: [AdminService],
})
export class AdminModule implements OnModuleInit {
  private readonly logger = new Logger(AdminModule.name);

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly adminService: AdminService,
    private readonly accountSecurity: AccountSecurityService,
  ) {}

  /**
   * Backfill ADM- SEIRS IDs for staff created before 2026-08-13, when
   * createAdmin started assigning them. Existing admins, including the
   * founder's own account, carried null.
   *
   * Runs once in practice: after the first boot there is nothing left to
   * find. Kept idempotent rather than as a one-off script so a restored
   * backup or a fresh environment self-heals the same way.
   */
  async onModuleInit() {
    /**
     * The admin sign-in log (2026-09-02). The founder asked for this three
     * times: "i cant tell if she signed in or not as a super admin".
     * synchronize is off in production, so the table is created here.
     */
    try {
      await this.usersRepo.query(`
        CREATE TABLE IF NOT EXISTS "admin_sign_in_events" (
          "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId"       uuid NULL,
          "email"        varchar(180) NOT NULL,
          "name"         varchar(120) NULL,
          "adminRole"    varchar(40) NULL,
          "outcome"      varchar(24) NOT NULL,
          "ip"           varchar(60) NULL,
          "userAgent"    varchar(400) NULL,
          "lagosHour"    smallint NOT NULL,
          "outsideHours" boolean NOT NULL DEFAULT false,
          "createdAt"    timestamptz NOT NULL DEFAULT now()
        )
      `);
      await this.usersRepo.query(
        `CREATE INDEX IF NOT EXISTS "admin_sign_in_user_created"
           ON "admin_sign_in_events" ("userId", "createdAt")`);
      await this.usersRepo.query(
        `CREATE INDEX IF NOT EXISTS "admin_sign_in_created"
           ON "admin_sign_in_events" ("createdAt")`);
    } catch (e: any) {
      console.error(`admin_sign_in_events ensure failed: ${e?.message ?? e}`);
    }

    // Staff second factor (2026-09-02). The dashboard has called
    // /auth/admin-totp-verify since it was built, against a route that did
    // not exist.
    try {
      await this.usersRepo.query(`
        ALTER TABLE "users"
          ADD COLUMN IF NOT EXISTS "totpSecret"  varchar(64) NULL,
          ADD COLUMN IF NOT EXISTS "totpEnabled" boolean NOT NULL DEFAULT false,
          -- OTP guessing counter (audit 2026-09-05). The route throttle is
          -- per IP, so a distributed attacker had unlimited tries at a six
          -- digit code, and verify-otp hands back a session.
          ADD COLUMN IF NOT EXISTS "emailOtpAttempts" int NOT NULL DEFAULT 0
      `);
    } catch (e: any) {
      console.error(`totp columns self-heal failed: ${e?.message ?? e}`);
    }

    /**
     * Hand AdminService the security notifier after construction.
     *
     * It cannot be a constructor dependency: that creates a module cycle
     * through DeliveriesModule. Same pattern TravelBuddyModule uses for
     * paymentsServiceRef, and it is what lets a suspended person actually
     * be told they were suspended.
     */
    this.adminService.accountSecurityRef = this.accountSecurity;

    /**
     * Account-deletion columns production never got.
     *
     * The entity has carried these for a while, production runs with
     * synchronize off, and nothing self-healed them. Any query that
     * selects the whole User row therefore failed, which is why the
     * recycle bin returned a 500 and no admin could see or cancel a
     * pending deletion (audit 2026-08-18).
     */
    /**
     * Team members were removed from the product entirely (founder
     * 2026-08-19, "delete it completely, no back doors"). The roles were
     * advertised in the UI as access restrictions while being enforced
     * on three routes out of dozens, which is a false security claim
     * rather than an unfinished feature.
     *
     * The table goes with it. Leaving it would keep invited-but-inactive
     * rows and a shape that invites someone to wire it back up without
     * doing the enforcement work first.
     */
    for (const sql of [
      `DROP TABLE IF EXISTS "business_team_members"`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletionRequestedAt" timestamptz NULL`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletionScheduledAt" timestamptz NULL`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletionRequestedBy" varchar(128) NULL`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletionReason" text NULL`,
      // Signup consent, 2026-09-01. Both apps collected the age and terms
      // ticks and then discarded them: no columns existed and neither
      // register path wrote one. Default false on the backfill because we
      // genuinely have no record for anyone who signed up before today.
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ageConfirmed" boolean NOT NULL DEFAULT false`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" timestamptz NULL`,
      `CREATE INDEX IF NOT EXISTS "users_deletion_scheduled_idx" ON "users" ("deletionScheduledAt")`,
    ]) {
      try {
        await this.usersRepo.query(sql);
      } catch (e: any) {
        this.logger.error(`admin self-heal FAILED [${sql.slice(0, 60)}]: ${e?.message ?? e}`);
      }
    }

    try {
      const missing = await this.usersRepo.find({
        where:  { role: UserRole.ADMIN, accountId: IsNull() },
        select: ['id'],
      });
      for (const row of missing) {
        await this.usersRepo.update(row.id, {
          accountId: generateUuidAccountId(AccountIdPrefix.ADMIN),
        });
      }
      if (missing.length > 0) {
        this.logger.log(`Backfilled ADM- account IDs for ${missing.length} staff account(s)`);
      }
    } catch (err: any) {
      // Never block boot over a cosmetic identifier.
      this.logger.warn(`Admin accountId backfill skipped: ${err?.message}`);
    }
  }
}
