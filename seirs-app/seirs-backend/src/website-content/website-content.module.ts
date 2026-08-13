import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WebsiteContent } from './website-content.entity';
import { ContactSubmission } from './contact-submission.entity';
import { WebsiteContentService } from './website-content.service';
import { WebsiteContentController } from './website-content.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WebsiteContent, ContactSubmission])],
  controllers: [WebsiteContentController],
  providers: [WebsiteContentService],
  exports: [WebsiteContentService],
})
export class WebsiteContentModule implements OnModuleInit {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit() {
    const alters = [
      // Curated home-carousel slides for the customer app (2026-08-12).
      // Publishing an article does not push it to every phone; admin
      // ticks featureInApp per story.
      `ALTER TABLE "website_content" ADD COLUMN IF NOT EXISTS "featureInApp" boolean NOT NULL DEFAULT false`,
      `ALTER TABLE "website_content" ADD COLUMN IF NOT EXISTS "featureBadge" character varying(24)`,
      `CREATE INDEX IF NOT EXISTS "website_content_feature_in_app_idx" ON "website_content" ("featureInApp")`,
      // Special-offer window (2026-08-13): a promo card expires on its
      // own date instead of waiting for someone to untick it.
      `ALTER TABLE "website_content" ADD COLUMN IF NOT EXISTS "featureFrom" timestamptz`,
      `ALTER TABLE "website_content" ADD COLUMN IF NOT EXISTS "featureUntil" timestamptz`,
    ];
    for (const sql of alters) {
      try { await this.dataSource.query(sql); }
      catch { /* column exists or table not yet created; both fine */ }
    }
  }
}
