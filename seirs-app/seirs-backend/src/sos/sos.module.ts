import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';
import { SosAlert } from './sos-alert.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { TrackingModule } from '../tracking/tracking.module';
import { AuditLogEntry } from '../admin/audit-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SosAlert, Delivery, AuditLogEntry]), TrackingModule],
  controllers: [SosController],
  providers: [SosService],
  exports: [SosService],
})
export class SosModule implements OnModuleInit {
  private readonly logger = new Logger(SosModule.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * resolutionNote was added 2026-08-24 so support can document what was
   * actually done about an alert. Self-heal rather than a migration file,
   * matching how the pricing and deliveries modules add columns here.
   */
  async onModuleInit() {
    try {
      await this.dataSource.query(
        `ALTER TABLE "sos_alerts" ADD COLUMN IF NOT EXISTS "resolutionNote" text NULL`,
      );
      /**
       * Reading one person's alerts became a routine query on 2026-08-28:
       * every admin profile page now asks for that user's SOS record, and
       * every delivery page asks for that trip's. Both were seq scans.
       */
      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS "idx_sos_alerts_user" ON "sos_alerts" ("userId")`,
      );
      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS "idx_sos_alerts_delivery" ON "sos_alerts" ("deliveryId")`,
      );
    } catch (e: any) {
      this.logger.error(`sos self-heal failed: ${e?.message ?? e}`);
    }
  }
}
