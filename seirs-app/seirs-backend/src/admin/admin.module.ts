import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../users/user.entity';
import { Driver } from '../drivers/driver.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { FraudModule } from '../fraud/fraud.module';
import { MailModule } from '../mail/mail.module';
import { FraudFlag } from '../fraud/fraud-flag.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Driver, Delivery, FraudFlag]), FraudModule, MailModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
