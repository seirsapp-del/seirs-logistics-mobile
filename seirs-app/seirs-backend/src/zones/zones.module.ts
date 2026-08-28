import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FeesModule } from '../fees/fees.module';
import { PricingModule } from '../pricing/pricing.module';
import { PricingService } from '../pricing/pricing.service';
import { Zone } from './zone.entity';
import { ZonesService } from './zones.service';
import { ZonesAdminController, ZonesController } from './zones.controller';

/**
 * SEIRS Zones.
 *
 * One module owns the whole idea: the table, the resolution engine, the
 * admin API and the app-facing check. Pricing only gains a hook.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Zone]), FeesModule, PricingModule],
  controllers: [ZonesAdminController, ZonesController],
  providers: [ZonesService],
  exports: [ZonesService],
})
export class ZonesModule implements OnModuleInit {
  private readonly logger = new Logger(ZonesModule.name);

  constructor(
    private readonly zones: ZonesService,
    private readonly pricing: PricingService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async onModuleInit() {
    /**
     * Hand the pricing engine its zone port.
     *
     * Done here rather than through PricingModule's imports because this
     * module already depends on PricingService, and importing back the
     * other way would be a circular module reference. DriversModule wires
     * its notifications channel the same way for the same reason.
     */
    this.pricing.zoneEngine = this.zones;

    /**
     * synchronize is FALSE in production, so a new table has to be
     * created here or the first zone save after deploy throws on an
     * object Postgres does not have. Additive and safe to re-run.
     */
    try {
      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS "zones" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "name" varchar(120) NOT NULL,
          "colour" varchar(16) NOT NULL DEFAULT '#3A7BD5',
          "shape" jsonb NOT NULL,
          "status" varchar(16) NOT NULL DEFAULT 'open',
          "effects" jsonb NOT NULL DEFAULT '{}'::jsonb,
          "active" jsonb NOT NULL DEFAULT '{"mode":"always"}'::jsonb,
          "reason" text NOT NULL DEFAULT '',
          "priority" integer NOT NULL DEFAULT 0,
          "published" boolean NOT NULL DEFAULT false,
          "createdByAdminId" uuid NULL,
          "updatedByAdminId" uuid NULL,
          "publishedAt" timestamptz NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
      `);
      // The engine reads published rows on every quote, so that filter
      // is the one index that has to exist. Status is indexed for the
      // admin list, which filters on it constantly.
      await this.ds.query(
        `CREATE INDEX IF NOT EXISTS "idx_zones_published" ON "zones" ("published")`,
      );
      await this.ds.query(
        `CREATE INDEX IF NOT EXISTS "idx_zones_status" ON "zones" ("status")`,
      );
    } catch (e) {
      // A failed migration must not stop boot; the entity sync path
      // covers dev and the next boot retries. It is logged loudly
      // because until the table exists no closure can be declared.
      this.logger.error('zones table migration skipped: ' + ((e as any)?.message ?? e));
    }
  }
}
