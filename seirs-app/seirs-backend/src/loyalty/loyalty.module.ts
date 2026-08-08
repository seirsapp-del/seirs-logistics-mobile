import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoyaltyPoint } from './loyalty-point.entity';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';
import { User } from '../users/user.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { MailModule } from '../mail/mail.module';

@Module({
  imports:     [TypeOrmModule.forFeature([LoyaltyPoint, User, Delivery]), MailModule],
  providers:   [LoyaltyService],
  controllers: [LoyaltyController],
  exports:     [LoyaltyService],
})
export class LoyaltyModule {}
