import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';
import { HandoffOtp } from './handoff-otp.entity';
import { HandoffRecord } from './handoff-record.entity';
import { User } from '../users/user.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { MailModule } from '../mail/mail.module';
import { FeesModule } from '../fees/fees.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([HandoffOtp, HandoffRecord, User, Delivery]),
    MailModule,
    FeesModule,
  ],
  controllers: [IdentityController],
  providers:   [IdentityService],
  exports:     [IdentityService],
})
export class IdentityModule implements OnModuleInit {
  private readonly logger = new Logger(IdentityModule.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async onModuleInit() {
    // Self-heal: HandoffStage gained DRIVER_TO_DRIVER (2026-08-09,
    // interstate relay). The stage column is a Postgres enum type, so
    // new values need ALTER TYPE ADD VALUE. IF NOT EXISTS makes this
    // idempotent. Same no-SYNC_DB pattern as the other modules.
    try {
      await this.ds.query(`
        ALTER TYPE "handoff_records_stage_enum"
          ADD VALUE IF NOT EXISTS 'driver_to_driver'
      `);
      // customer_to_driver (2026-08-25): the sender's door handover, the
      // first link a plain door-to-door delivery was missing entirely.
      await this.ds.query(`
        ALTER TYPE "handoff_records_stage_enum"
          ADD VALUE IF NOT EXISTS 'customer_to_driver'
      `);
      this.logger.log('handoff_records stage enum self-heal complete');
    } catch (e: any) {
      this.logger.warn(`handoff stage enum self-heal skipped: ${e?.message ?? e}`);
    }

    // Two new verification methods (2026-08-25). Same ALTER TYPE story as
    // the stage enum above: the method column is a Postgres enum, so a new
    // TypeScript value is not a new database value.
    //
    // Each ADD VALUE runs in its own statement: Postgres refuses more than
    // one ADD VALUE per transaction on some versions, and a batch that
    // half-applies is worse than one that retries next boot.
    for (const method of ['typed_signature', 'receiver_name']) {
      try {
        await this.ds.query(`
          ALTER TYPE "handoff_records_method_enum"
            ADD VALUE IF NOT EXISTS '${method}'
        `);
      } catch (e: any) {
        this.logger.warn(`handoff method '${method}' self-heal skipped: ${e?.message ?? e}`);
      }
    }

    // Columns behind the chain of custody the pitch deck claims
    // (2026-08-25). Additive and re-runnable. WHY they exist is on the
    // entity; the short version is that a scan alone cannot answer a
    // partner store denying it ever took the package, so every custody
    // transition now carries a named human, their role, and the store.
    try {
      await this.ds.query(`
        ALTER TABLE "handoff_records"
          ADD COLUMN IF NOT EXISTS "signedByRole" varchar(16) NULL,
          ADD COLUMN IF NOT EXISTS "releasedByName" varchar(120) NULL,
          ADD COLUMN IF NOT EXISTS "partnerStoreId" uuid NULL,
          ADD COLUMN IF NOT EXISTS "signatureSource" varchar(8) NULL
      `);
      await this.ds.query(`
        CREATE INDEX IF NOT EXISTS "idx_handoff_store"
          ON "handoff_records" ("partnerStoreId")
      `);
      // The chain is read by delivery id on every tracking view and every
      // dispute. It was indexed already; this one covers the ordered read.
      await this.ds.query(`
        CREATE INDEX IF NOT EXISTS "idx_handoff_delivery_created"
          ON "handoff_records" ("deliveryId", "createdAt")
      `);
      this.logger.log('handoff_records custody columns self-heal complete');
    } catch (e: any) {
      this.logger.warn(`handoff custody column self-heal skipped: ${e?.message ?? e}`);
    }
  }
}
