import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceGuard } from './maintenance.guard';
import { PlatformConfig } from '../admin/platform-config.entity';

// Standalone module so any feature that needs the guard
// (deliveries, payments, business bulk) can import it without taking
// on the full AdminModule dependency surface.
@Module({
  imports: [TypeOrmModule.forFeature([PlatformConfig])],
  controllers: [MaintenanceController],
  providers: [MaintenanceService, MaintenanceGuard],
  exports: [MaintenanceService, MaintenanceGuard],
})
export class MaintenanceModule {}
