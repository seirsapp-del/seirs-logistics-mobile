import {
  Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query, Req, UseGuards,
  DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { WebsiteContentService } from './website-content.service';
import { WebContentStatus, WebContentType } from './website-content.entity';
import { ContactStatus, ContactSubject } from './contact-submission.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@Controller()
export class WebsiteContentController {
  constructor(private readonly svc: WebsiteContentService) {}

  // ── Public reads — used by apps/seirs-website with ISR ───────────────────
  // No JWT. Cacheable. Returns only PUBLISHED rows.

  // GET /api/v1/website/content?type=article&page=1
  @Public()
  @Get('website/content')
  list(
    @Query('type')     type:     WebContentType,
    @Query('category') category?: string,
    @Query('lang')     lang?:     string,
    @Query('page',     new DefaultValuePipe(1),  ParseIntPipe) page:     number = 1,
    @Query('pageSize', new DefaultValuePipe(12), ParseIntPipe) pageSize: number = 12,
  ) {
    return this.svc.listPublished({ type, category, lang, page, pageSize });
  }

  // GET /api/v1/website/content/:slug?lang=en
  @Public()
  @Get('website/content/:slug')
  getBySlug(@Param('slug') slug: string, @Query('lang') lang?: string) {
    return this.svc.getBySlug(slug, lang ?? 'en');
  }

  // GET /api/v1/website/page-block/:slug?lang=en
  // Returns the block OR a 404. Website pages use this to drop in
  // inline-editable copy chunks; they fall back to hardcoded copy
  // when the lookup returns nothing.
  @Public()
  @Get('website/page-block/:slug')
  async getPageBlock(@Param('slug') slug: string, @Query('lang') lang?: string) {
    const row = await this.svc.getPageBlock(slug, lang ?? 'en');
    if (!row) return null;
    return row;
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/website/content')
  adminList(
    @Query('type')   type?:   WebContentType,
    @Query('status') status?: WebContentStatus,
  ) {
    return this.svc.list({ type, status });
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/website/content/:id')
  adminGet(@Param('id') id: string) {
    return this.svc.getOne(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/website/content')
  adminCreate(@CurrentUser() user: User, @Body() body: any) {
    return this.svc.create(user.id, body);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/website/content/:id')
  adminUpdate(@Param('id') id: string, @Body() body: any) {
    return this.svc.update(id, body);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('admin/website/content/:id')
  adminDelete(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  // ── Public contact form (Spec V8 §3.13 — W7) ─────────────────────────────
  // No auth. Body: { name, email, phone?, subject, message }.
  // Returns { ok: true, id }.
  @Public()
  @Post('website/contact')
  submitContact(
    @Body() body: { name: string; email: string; phone?: string; subject: ContactSubject; message: string },
    @Ip()   sourceIp: string,
    @Req()  req: Request,
  ) {
    return this.svc.submitContact({
      ...body,
      sourceIp,
      userAgent: (req.headers['user-agent'] as string | undefined)?.slice(0, 500),
    });
  }

  // ── Admin contact-submission inbox ───────────────────────────────────────
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/contact-submissions')
  adminListContact(
    @Query('status') status?: ContactStatus,
    @Query('page',  new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
  ) {
    return this.svc.listContactSubmissions({ status, page });
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/contact-submissions/:id')
  adminUpdateContact(
    @Param('id') id: string,
    @Body() body: { status?: ContactStatus; internalNote?: string },
  ) {
    return this.svc.updateContactSubmission(id, body);
  }
}
