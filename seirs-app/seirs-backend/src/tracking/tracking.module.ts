import { Module } from '@nestjs/common';
import { TrackingGateway } from './tracking.gateway';
import { RedisService } from './redis.service';

@Module({
  providers: [TrackingGateway, RedisService],
  exports: [TrackingGateway, RedisService],
})
export class TrackingModule {}
