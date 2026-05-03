import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../users/user.entity';
import { Driver } from '../drivers/driver.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { FraudModule } from '../fraud/fraud.module';
import { MailModule } from '../mail/mail.module';
import { FraudFlag } from '../fraud/fraud-flag.entity';
import { CmsItem } from './cms-item.entity';
import { SupportTicket } from './support-ticket.entity';
import { AuditLogEntry } from './audit-log.entity';
import { PricingConfig } from './pricing-config.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Driver, Delivery, FraudFlag, CmsItem, SupportTicket, AuditLogEntry, PricingConfig]),
    FraudModule,
    MailModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
