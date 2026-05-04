import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PoolingService } from './pooling.service';
import { PoolingController } from './pooling.controller';
import { PoolGroup } from './pool-group.entity';

@Module({
  imports:     [TypeOrmModule.forFeature([PoolGroup])],
  controllers: [PoolingController],
  providers:   [PoolingService],
  exports:     [PoolingService],
})
export class PoolingModule {}
