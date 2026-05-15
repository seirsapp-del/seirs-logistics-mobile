import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoyaltyPoint } from './loyalty-point.entity';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';

@Module({
  imports:     [TypeOrmModule.forFeature([LoyaltyPoint])],
  providers:   [LoyaltyService],
  controllers: [LoyaltyController],
  exports:     [LoyaltyService],
})
export class LoyaltyModule {}
