import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../users/user.entity';
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
import { SupportTicket } from './support-ticket.entity';
import { AuditLogEntry } from './audit-log.entity';
import { PricingConfig } from './pricing-config.entity';
import { DuplicateAccountCandidate } from './duplicate-account.entity';
import { ExternalPartner } from './external-partner.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User, ArchivedUser, Driver, Delivery, FraudFlag,
      CmsItem, SupportTicket, AuditLogEntry, PricingConfig,
      DuplicateAccountCandidate, ExternalPartner,
    ]),
    FraudModule,
    MailModule,
    PartnerStoreModule,
    DriversModule,
    PaymentsModule,
    UsersModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
