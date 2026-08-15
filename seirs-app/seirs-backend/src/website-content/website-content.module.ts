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
      // 'sender' added to ContactSubject 2026-08-15. The column is a real
      // Postgres enum type, so adding the value in TypeScript alone would
      // make every sender submission fail on insert in production. IF NOT
      // EXISTS makes this safe to re-run, and it must land before the
      // website starts sending ?subject=sender.
      `ALTER TYPE "contact_submissions_subject_enum" ADD VALUE IF NOT EXISTS 'sender'`,
      // Article gallery + video, 2026-08-15. Up to 5 extra images and one
      // video URL per article (founder: stories need more pictures, many
      // Nigerians are visual learners).
      `ALTER TABLE "website_content" ADD COLUMN IF NOT EXISTS "galleryImages" jsonb`,
      `ALTER TABLE "website_content" ADD COLUMN IF NOT EXISTS "videoUrl" text`,
    ];
    for (const sql of alters) {
      try { await this.dataSource.query(sql); }
      catch { /* column exists or table not yet created; both fine */ }
    }
  }
}
