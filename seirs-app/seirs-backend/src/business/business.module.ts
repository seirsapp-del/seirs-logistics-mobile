import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { FeesModule } from '../fees/fees.module';
import { BusinessController } from './business.controller';
import { RecurringController } from './recurring.controller';
import { BusinessService } from './business.service';
import { BusinessAccount } from './business-account.entity';
import { PartnerStore } from './partner-store.entity';
import { BusinessPackage } from './business-package.entity';
import { BusinessWalletTx } from './business-wallet-tx.entity';
import { PartnerPayout } from './partner-payout.entity';
import { RecurringTemplate } from './recurring-template.entity';
import { User } from '../users/user.entity';
import { MailModule } from '../mail/mail.module';
import { PricingModule } from '../pricing/pricing.module';
import { SupportModule } from '../support/support.module';
import { StoreDropoff, DropoffStatus } from '../partner-store/store-dropoff.entity';
import { PaymentsModule } from '../payments/payments.module';
import { RoutingModule } from '../routing/routing.module';
import { Delivery } from '../deliveries/delivery.entity';
import { DeliveryStop } from '../deliveries/delivery-stop.entity';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { DriversModule } from '../drivers/drivers.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PaymentsModule,
    // For the working-hours alert. SupportModule pulls in only its own
    // repositories, so there is no cycle back to business.
    SupportModule,
    TypeOrmModule.forFeature([
      User,
      BusinessAccount,
      PartnerStore,
      BusinessPackage,
      BusinessWalletTx,
      PartnerPayout,
      Delivery,
      DeliveryStop,
      RecurringTemplate,
      StoreDropoff,
    ]),
    MulterModule.register({ limits: { fileSize: 5 * 1024 * 1024 } }),
    MailModule,
    PricingModule,
    RoutingModule,
    FeesModule,
    // Recurring runs push "ready to pay" and "cancelled, unpaid" to the
    // owner's phone (founder 2026-09-06).
    NotificationsModule,
    // Business cancellation reuses the delivery transition so escrow
    // refunds and the rest of the side effects fire. forwardRef because
    // PricingModule already closes a cycle back to this module.
    forwardRef(() => DeliveriesModule),
    // Cargo Space validates the trip a load is posted to.
    forwardRef(() => DriversModule),
  ],
  controllers: [BusinessController, RecurringController],
  providers:   [BusinessService],
  exports:     [BusinessService],
})
export class BusinessModule implements OnModuleInit {
  constructor(private readonly ds: DataSource) {}

  /**
   * Self-heal the two recurring columns on deliveries (2026-09-06). The
   * schema is not synchronised in production, so a new entity column is
   * only real once something adds it; same pattern as AdminModule.
   */
  async onModuleInit() {
    try {
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "isRecurring" boolean NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS "recurringTemplateId" uuid NULL
      `);
    } catch (e: any) {
      // A failure here must never stop the API booting; the cron logs
      // loudly if the columns are still missing when it runs.
      console.warn(`[BusinessModule] recurring columns self-heal skipped: ${e?.message ?? e}`);
    }
  }
}
