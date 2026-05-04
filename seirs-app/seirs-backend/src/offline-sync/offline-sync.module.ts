import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OfflineSyncService } from './offline-sync.service';
import { OfflineSyncController } from './offline-sync.controller';
import { GpsPing } from './gps-ping.entity';

@Module({
  imports:     [TypeOrmModule.forFeature([GpsPing])],
  controllers: [OfflineSyncController],
  providers:   [OfflineSyncService],
  exports:     [OfflineSyncService],
})
export class OfflineSyncModule {}
