import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { MailService } from './mail.service';
import { EmailTemplatesService } from './email-templates.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/email-templates')
export class EmailTemplatesController {
  constructor(
    private readonly svc: EmailTemplatesService,
    private readonly mail: MailService,
  ) {}

  // GET /api/v1/admin/email-templates
  // Returns the full catalogue merged with any persisted overrides.
  @Get()
  list() {
    return this.svc.listForAdmin();
  }

  // PATCH /api/v1/admin/email-templates/:key
  // Body: { subject?, bodyHtml?, active? }
  @Patch(':key')
  upsert(
    @Param('key') key: string,
    @Body() body: { subject?: string; bodyHtml?: string; active?: boolean },
    @CurrentUser() user: User,
  ) {
    return this.svc.upsertOverride(key, { ...body, editedByUserId: user.id });
  }

  /**
   * POST /api/v1/admin/email-templates/:key/test-send
   *
   * Sends the template to the admin who asked for it, so "what does the
   * customer actually see" is answered by looking in your own inbox
   * rather than trusting a preview pane.
   */
  @Post(':key/test-send')
  async testSend(
    @Param('key') key: string,
    @Body() body: { to?: string },
    @CurrentUser() user: User,
  ) {
    const to = (body?.to || '').trim() || user.email;
    return this.mail.sendTemplateTest(key, to, {});
  }
}
