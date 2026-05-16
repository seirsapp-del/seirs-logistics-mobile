import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartnerStoreService } from './partner-store.service';
import { PartnerStoreController } from './partner-store.controller';
import { StoreDropoff } from './store-dropoff.entity';
import { PartnerStore } from '../business/partner-store.entity';
import { PartnerSponsorship } from './partner-sponsorship.entity';
import { User } from '../users/user.entity';
import { FeesModule } from '../fees/fees.module';
import { IdentityModule } from '../identity/identity.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StoreDropoff, PartnerStore, User, PartnerSponsorship]),
    FeesModule,
    IdentityModule,
    MailModule,
  ],
  controllers: [PartnerStoreController],
  providers:   [PartnerStoreService],
  exports:     [PartnerStoreService],
})
export class PartnerStoreModule {}
