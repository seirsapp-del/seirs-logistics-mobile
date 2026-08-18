import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AccountIdPrefix, generateUuidAccountId } from '../common/utils/auth-codes';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DemoDataService } from './demo-data.service';
import { MoneyResetService } from './money-reset.service';
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
import { CmsItem } from './cms-item.entity';
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
    SupportModule,
    TypeOrmModule.forFeature([
      User, ArchivedUser, Driver, Delivery, FraudFlag,
      CmsItem, SupportTicket, AuditLogEntry, PricingConfig,
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
  ],
  controllers: [AdminController],
  providers: [AdminService, DemoDataService, MoneyResetService],
  exports: [AdminService],
})
export class AdminModule implements OnModuleInit {
  private readonly logger = new Logger(AdminModule.name);

  constructor(@InjectRepository(User) private readonly usersRepo: Repository<User>) {}

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
