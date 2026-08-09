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
      this.logger.log('handoff_records stage enum self-heal complete');
    } catch (e: any) {
      this.logger.warn(`handoff stage enum self-heal skipped: ${e?.message ?? e}`);
    }
  }
}
