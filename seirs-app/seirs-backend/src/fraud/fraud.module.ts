import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FraudFlag } from './fraud-flag.entity';
import { FraudService } from './fraud.service';
import { Delivery } from '../deliveries/delivery.entity';
import { User } from '../users/user.entity';

@Module({
  imports:  [TypeOrmModule.forFeature([FraudFlag, Delivery, User])],
  providers: [FraudService],
  exports:   [FraudService],
})
export class FraudModule {}
