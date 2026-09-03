import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FraudFlag } from './fraud-flag.entity';
import { FraudService } from './fraud.service';
import { Delivery } from '../deliveries/delivery.entity';
import { User } from '../users/user.entity';

@Module({
  imports:  [TypeOrmModule.forFeature([FraudFlag, Delivery, User])],
  providers: [FraudService],
  exports:   [FraudService],
})
export class FraudModule implements OnModuleInit {
  private readonly logger = new Logger(FraudModule.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Idempotent self-heal so SYNC_DB is never needed.
   *
   * fraud_flags.type is a POSTGRES enum, not a varchar. Adding a value to
   * the TypeScript enum does nothing to the database type, so the first
   * attempt to raise the new flag would die on "invalid input value for
   * enum fraud_flags_type_enum" and, because the detector is called with
   * .catch(), it would die silently. A fraud detector that has quietly
   * stopped running looks exactly like a platform with no fraud on it.
   *
   * ALTER TYPE ... ADD VALUE cannot run inside a transaction block, which
   * is why this is its own statement rather than part of a batch.
   */
  async onModuleInit() {
    try {
      await this.dataSource.query(
        `ALTER TYPE "fraud_flags_type_enum" ADD VALUE IF NOT EXISTS 'vehicle_churn'`,
      );
    } catch (e: any) {
      this.logger.warn(`fraud enum self-heal skipped: ${e?.message ?? e}`);
    }
  }
}
