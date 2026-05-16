import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailService } from './mail.service';
import { EmailTemplate } from './email-template.entity';
import { EmailTemplatesService } from './email-templates.service';
import { EmailTemplatesController } from './email-templates.controller';

@Global()
@Module({
  imports:     [TypeOrmModule.forFeature([EmailTemplate])],
  controllers: [EmailTemplatesController],
  providers:   [MailService, EmailTemplatesService],
  exports:     [MailService, EmailTemplatesService],
})
export class MailModule {}
