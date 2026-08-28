import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLogEntry } from '../admin/audit-log.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { Driver } from '../drivers/driver.entity';
import { DriverEarning } from '../earnings/driver-earning.entity';
import { DriverPayout } from '../earnings/driver-payout.entity';
import { Payment } from '../payments/payment.entity';
import { SupportTicket } from '../support/support-ticket.entity';
import { User } from '../users/user.entity';
import { ExportPermissionGuard } from './export-permission.guard';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

/**
 * Admin CSV exports.
 *
 * Entities only, no services from the modules they belong to. The
 * exports read rows and write nothing, so pulling in EarningsService or
 * DeliveriesService would buy nothing and couple this module to code
 * that changes for unrelated reasons. Repositories registered through
 * forFeature here are the same repositories those modules use; there is
 * no second connection and no duplicated entity.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DriverPayout,
      DriverEarning,
      Payment,
      Delivery,
      Driver,
      User,
      SupportTicket,
      AuditLogEntry,
    ]),
  ],
  controllers: [ExportsController],
  providers:   [ExportsService, ExportPermissionGuard],
})
export class ExportsModule {}
