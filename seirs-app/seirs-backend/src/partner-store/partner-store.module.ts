import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PartnerStoreService } from './partner-store.service';
import { PartnerStoreController } from './partner-store.controller';
import { StoreDropoff } from './store-dropoff.entity';
import { PartnerStore } from '../business/partner-store.entity';
import { PartnerSponsorship } from './partner-sponsorship.entity';
import { User } from '../users/user.entity';
import { FeesModule } from '../fees/fees.module';
import { IdentityModule } from '../identity/identity.module';
import { MailModule } from '../mail/mail.module';

/**
 * Idempotent boot-time schema self-heal for the partner_stores table.
 * Matches the pattern used by ChatModule / SupportModule / DeliveriesModule
 * so Railway does not need a manual SYNC_DB toggle when we add nullable
 * columns like the new storeLat / storeLng added for /find-a-partner
 * distance sort.
 */
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
export class PartnerStoreModule implements OnModuleInit {
  private readonly logger = new Logger(PartnerStoreModule.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async onModuleInit() {
    try {
      await this.ds.query(`
        ALTER TABLE "partner_stores"
          ADD COLUMN IF NOT EXISTS "storeLat" numeric(9,6) NULL
      `);
      await this.ds.query(`
        ALTER TABLE "partner_stores"
          ADD COLUMN IF NOT EXISTS "storeLng" numeric(9,6) NULL
      `);
      this.logger.log('partner_stores schema self-heal complete');
    } catch (e: any) {
      this.logger.warn(`partner_stores self-heal skipped: ${e?.message ?? e}`);
    }
  }
}
