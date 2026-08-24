import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';
import { SosAlert } from './sos-alert.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [TypeOrmModule.forFeature([SosAlert, Delivery]), TrackingModule],
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
    } catch (e: any) {
      this.logger.error(`sos self-heal failed: ${e?.message ?? e}`);
    }
  }
}
