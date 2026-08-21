import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FeesService } from './fees.service';
import { FeesController } from './fees.controller';
import { Fee } from './fee.entity';
import { FeeHistory } from './fee-history.entity';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports:     [TypeOrmModule.forFeature([Fee, FeeHistory]), TrackingModule],
  controllers: [FeesController],
  providers:   [FeesService],
  exports:     [FeesService],
})
export class FeesModule implements OnModuleInit {
  private readonly logger = new Logger(FeesModule.name);

  constructor(private readonly ds: DataSource) {}

  /**
   * Teach the stored enum the non-monetary units.
   *
   * Production runs with synchronize off, so a new FeeUnit member in the
   * TypeScript enum never reaches Postgres on its own and the first write
   * of a row carrying one fails. Each label is added on its own because
   * ALTER TYPE takes a single value at a time, and one failure should not
   * stop the others.
   */
  async onModuleInit() {
    for (const label of ['minutes', 'hours', 'days', 'count', 'hour_of_day']) {
      try {
        await this.ds.query(
          `ALTER TYPE "fees_unit_enum" ADD VALUE IF NOT EXISTS '${label}'`,
        );
      } catch (e: any) {
        // A database created by synchronize already has every label, and
        // on a very first boot the type may not exist yet.
        this.logger.debug(
          `fees_unit_enum: could not add '${label}': ${e?.message ?? e}`,
        );
      }
    }
  }
}
