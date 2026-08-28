import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
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

  /**
   * POST /api/v1/admin/email-templates/preview
   *
   * The email as it will actually arrive, rendered through the same
   * baseTemplate() every real send uses. The editor used to preview by
   * dropping bodyHtml into a div, which its own code called a "rough
   * preview": no header, no banner, no accent colour, no footer, none of
   * the table layout a mail client applies. Somebody non-technical was
   * approving a thing they had never seen.
   *
   * Declared BEFORE the :key routes: 'preview' would otherwise be read
   * as a template key.
   */
  @Post('preview')
  preview(@Body() body: { bodyHtml?: string; bannerImageUrl?: string | null; accentColor?: string | null }) {
    return { html: this.svc.renderPreview(body ?? {}) };
  }

  /**
   * POST /api/v1/admin/email-templates
   *
   * Create a template of your own. Until now the only thing this screen
   * could do was edit the fixed set the code sends, because
   * upsertOverride refuses any key without a seed behind it.
   */
  @Post()
  create(
    @Body() body: {
      name: string; subject?: string; bodyHtml?: string; category?: string;
      bannerImageUrl?: string | null; accentColor?: string | null; previewText?: string | null;
    },
    @CurrentUser() user: User,
  ) {
    return this.svc.createCustom({ ...body, editedByUserId: user.id });
  }

  /**
   * DELETE /api/v1/admin/email-templates/:key
   *
   * Custom templates only. Deleting a system template's row would not
   * delete the email, it would drop it back to the in-code default while
   * the screen implied it was gone.
   */
  @Delete(':key')
  remove(@Param('key') key: string) {
    return this.svc.removeCustom(key);
  }

  // PATCH /api/v1/admin/email-templates/:key
  // Body: { subject?, bodyHtml?, active? }
  @Patch(':key')
  upsert(
    @Param('key') key: string,
    @Body() body: {
      subject?: string; bodyHtml?: string; active?: boolean;
      bannerImageUrl?: string | null; accentColor?: string | null;
      previewText?: string | null; name?: string; category?: string;
    },
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
