import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';
import { SosAlert } from './sos-alert.entity';
import { EmergencyContact } from './emergency-contact.entity';
import { EmergencyContactsController } from './emergency-contacts.controller';
import { EmergencyContactsService } from './emergency-contacts.service';
import { Delivery } from '../deliveries/delivery.entity';
import { TrackingModule } from '../tracking/tracking.module';
import { AuditLogEntry } from '../admin/audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SosAlert, EmergencyContact, Delivery, AuditLogEntry]),
    TrackingModule,
  ],
  controllers: [SosController, EmergencyContactsController],
  providers: [SosService, EmergencyContactsService],
  exports: [SosService, EmergencyContactsService],
})
export class SosModule implements OnModuleInit {
  private readonly logger = new Logger(SosModule.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly emergencyContacts: EmergencyContactsService,
  ) {}

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

      /**
       * The emergency directory (2026-08-31).
       *
       * Both SOS screens were written against
       * GET /config/emergency-contacts and nothing ever served it, so
       * the customer app ran permanently on its offline fallback and the
       * driver app on a hardcoded list that had 199 labelled "Police"
       * when 199 is the fire service.
       *
       * Created here rather than in a migration file, matching how the
       * deliveries and pricing modules add their tables.
       */
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS "emergency_contacts" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "name" varchar(80) NOT NULL,
          "numbers" jsonb NOT NULL DEFAULT '[]'::jsonb,
          "instruction" text NOT NULL DEFAULT '',
          "category" varchar(30) NULL,
          "sortOrder" integer NOT NULL DEFAULT 0,
          "isActive" boolean NOT NULL DEFAULT true,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
      `);
      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS "idx_emergency_contacts_active"
           ON "emergency_contacts" ("isActive", "sortOrder")`,
      );
      // Only fills an EMPTY table, so an admin who removes a row keeps
      // their decision across restarts.
      await this.emergencyContacts.seedIfEmpty();
    } catch (e: any) {
      this.logger.error(`sos self-heal failed: ${e?.message ?? e}`);
    }
  }
}
