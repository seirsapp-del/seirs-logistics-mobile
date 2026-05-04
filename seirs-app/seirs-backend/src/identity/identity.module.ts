import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';
import { HandoffOtp } from './handoff-otp.entity';
import { HandoffRecord } from './handoff-record.entity';
import { User } from '../users/user.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { MailModule } from '../mail/mail.module';
import { FeesModule } from '../fees/fees.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([HandoffOtp, HandoffRecord, User, Delivery]),
    MailModule,
    FeesModule,
  ],
  controllers: [IdentityController],
  providers:   [IdentityService],
  exports:     [IdentityService],
})
export class IdentityModule {}
