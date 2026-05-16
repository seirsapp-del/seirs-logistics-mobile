import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { EmailTemplatesService } from './email-templates.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/email-templates')
export class EmailTemplatesController {
  constructor(private readonly svc: EmailTemplatesService) {}

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
}
