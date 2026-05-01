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
import { User } from '../users/user.entity';
import { MailModule } from '../mail/mail.module';

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
    ]),
    MulterModule.register({ limits: { fileSize: 5 * 1024 * 1024 } }),
    MailModule,
  ],
  controllers: [BusinessController],
  providers:   [BusinessService],
  exports:     [BusinessService],
})
export class BusinessModule {}
