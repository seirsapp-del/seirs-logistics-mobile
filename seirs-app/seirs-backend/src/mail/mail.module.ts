import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailService } from './mail.service';
import { EmailTemplate } from './email-template.entity';
import { EmailTemplatesService } from './email-templates.service';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailCampaign } from './email-campaign.entity';
import { EmailCampaignsService } from './email-campaigns.service';
import { User } from '../users/user.entity';

@Global()
@Module({
  imports:     [TypeOrmModule.forFeature([EmailTemplate, EmailCampaign, User])],
  controllers: [EmailTemplatesController],
  providers:   [MailService, EmailTemplatesService, EmailCampaignsService],
  exports:     [MailService, EmailTemplatesService, EmailCampaignsService],
})
export class MailModule {}
