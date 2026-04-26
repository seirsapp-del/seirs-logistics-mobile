import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartnersService } from './partners.service';
import { PartnersController } from './partners.controller';
import { Partner } from './partner.entity';
import { PartnerDelivery } from './partner-delivery.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Partner, PartnerDelivery])],
  controllers: [PartnersController],
  providers: [PartnersService],
  exports: [PartnersService],
})
export class PartnersModule {}
