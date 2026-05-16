import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
export class WebsiteContentModule {}
