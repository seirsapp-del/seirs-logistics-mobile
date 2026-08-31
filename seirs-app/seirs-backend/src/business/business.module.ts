import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { FeesModule } from '../fees/fees.module';
import { BusinessController } from './business.controller';
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
import { PaymentsModule } from '../payments/payments.module';
import { RoutingModule } from '../routing/routing.module';
import { Delivery } from '../deliveries/delivery.entity';
import { DeliveryStop } from '../deliveries/delivery-stop.entity';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { DriversModule } from '../drivers/drivers.module';

@Module({
  imports: [
    PaymentsModule,
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
    ]),
    MulterModule.register({ limits: { fileSize: 5 * 1024 * 1024 } }),
    MailModule,
    PricingModule,
    RoutingModule,
    FeesModule,
    // Business cancellation reuses the delivery transition so escrow
    // refunds and the rest of the side effects fire. forwardRef because
    // PricingModule already closes a cycle back to this module.
    forwardRef(() => DeliveriesModule),
    // Cargo Space validates the trip a load is posted to.
    forwardRef(() => DriversModule),
  ],
  controllers: [BusinessController],
  providers:   [BusinessService],
  exports:     [BusinessService],
})
export class BusinessModule {}
