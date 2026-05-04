import { Module } from '@nestjs/common';
import { MultiDropRoutingService } from './multi-drop-routing.service';
import { MultiDropRoutingController } from './multi-drop-routing.controller';

@Module({
  controllers: [MultiDropRoutingController],
  providers:   [MultiDropRoutingService],
  exports:     [MultiDropRoutingService],
})
export class MultiDropRoutingModule {}
