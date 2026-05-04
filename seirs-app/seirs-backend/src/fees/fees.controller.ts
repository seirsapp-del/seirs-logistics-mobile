import {
  Body, Controller, Get, Param, Patch, Query, UseGuards,
} from '@nestjs/common';
import { FeesService } from './fees.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

// Two surfaces in one controller:
//   1) Public read (GET /api/v1/fees) — clients can render price breakdowns
//   2) Admin CRUD (GET/PATCH /api/v1/admin/fees/*) — Fee Catalogue UI
//
// Spec V8 §3.9 — Admin Fee Catalogue.
@Controller()
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  // ── Public ─────────────────────────────────────────────────────────────
  // GET /api/v1/fees — all active fees, cached 60s.
  @Public()
  @Get('fees')
  listPublic() {
    return this.feesService.getAllActive();
  }

  // GET /api/v1/fees/:key — single fee value (public; cache-friendly).
  @Public()
  @Get('fees/:key')
  async getOnePublic(@Param('key') key: string) {
    return { key, value: await this.feesService.getValue(key) };
  }

  // ── Admin ──────────────────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/fees')
  list(@Query('grouped') grouped?: string) {
    if (grouped === 'true') return this.feesService.listGroupedByCategory();
    return this.feesService.listAll();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/fees/:key')
  getOne(@Param('key') key: string) {
    return this.feesService.getOne(key);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/fees/:key/history')
  getHistory(@Param('key') key: string, @Query('limit') limit?: number) {
    return this.feesService.getHistory(key, limit ? Number(limit) : 50);
  }

  // PATCH /api/v1/admin/fees/:key  { value?, active?, currentNote? }
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/fees/:key')
  update(
    @Param('key') key: string,
    @Body() body: { value?: number; active?: boolean; currentNote?: string },
    @CurrentUser() admin: any,
  ) {
    return this.feesService.update(key, body, admin);
  }
}
