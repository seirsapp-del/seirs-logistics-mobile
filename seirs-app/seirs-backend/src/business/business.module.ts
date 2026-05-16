import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';
import { BusinessAccount, BusinessTeamMember } from './business-account.entity';
import { PartnerStore } from './partner-store.entity';
import { BusinessPackage } from './business-package.entity';
import { BusinessWalletTx } from './business-wallet-tx.entity';
import { PartnerPayout } from './partner-payout.entity';
import { RecurringTemplate } from './recurring-template.entity';
import { User } from '../users/user.entity';
import { MailModule } from '../mail/mail.module';
import { PricingModule } from '../pricing/pricing.module';
import { RoutingModule } from '../routing/routing.module';
import { Delivery } from '../deliveries/delivery.entity';
import { DeliveryStop } from '../deliveries/delivery-stop.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      BusinessAccount,
      BusinessTeamMember,
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
  ],
  controllers: [BusinessController],
  providers:   [BusinessService],
  exports:     [BusinessService],
})
export class BusinessModule {}
