import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DevPlatformService } from './dev-platform.service';

@UseGuards(JwtAuthGuard)
@Controller('dev-platform')
export class DevPlatformController {
  constructor(private readonly svc: DevPlatformService) {}

  // ── API Keys ───────────────────────────────────────────────────────────

  @Post('keys')
  issueKey(@CurrentUser() user: any, @Body() body: { name: string; mode: 'live' | 'test' }) {
    return this.svc.issueKey(user.id, body.name, body.mode ?? 'test');
  }

  @Get('keys')
  listKeys(@CurrentUser() user: any) {
    return this.svc.listKeys(user.id);
  }

  @Delete('keys/:id')
  revokeKey(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.revokeKey(user.id, id);
  }

  // ── Webhooks ───────────────────────────────────────────────────────────

  @Post('webhooks')
  createEndpoint(@CurrentUser() user: any, @Body() body: { url: string; events: string[] }) {
    return this.svc.createEndpoint(user.id, body.url, body.events);
  }

  @Get('webhooks')
  listEndpoints(@CurrentUser() user: any) {
    return this.svc.listEndpoints(user.id);
  }

  @Get('webhook-deliveries')
  listDeliveries(@CurrentUser() user: any) {
    return this.svc.listDeliveries(user.id);
  }

  // ── Usage ──────────────────────────────────────────────────────────────

  @Get('usage')
  usage(@CurrentUser() user: any) {
    return this.svc.getUsageStats(user.id);
  }

  // ── Spec V8 §3.13 — Admin oversight (A48 + A49) ─────────────────────────
  // Admin-only — reuses the same /dev-platform path tree so the existing
  // adminApi.devPlatform helpers extend naturally.

  @UseGuards(AdminGuard)
  @Get('admin/keys')
  adminListAllKeys() {
    return this.svc.listAllKeys();
  }

  // POST /api/v1/dev-platform/admin/owners/:ownerUserId/suspend
  @UseGuards(AdminGuard)
  @Post('admin/owners/:ownerUserId/suspend')
  suspendOwner(
    @Param('ownerUserId') ownerUserId: string,
    @Body() body: { reason: string },
    @CurrentUser() admin: any,
  ) {
    return this.svc.suspendDeveloperAccount(ownerUserId, body?.reason ?? '', admin.id);
  }

  // POST /api/v1/dev-platform/admin/owners/:ownerUserId/resume
  @UseGuards(AdminGuard)
  @Post('admin/owners/:ownerUserId/resume')
  resumeOwner(
    @Param('ownerUserId') ownerUserId: string,
    @CurrentUser() admin: any,
  ) {
    return this.svc.resumeDeveloperAccount(ownerUserId, admin.id);
  }

  // PATCH /api/v1/dev-platform/admin/keys/:keyId/rate-limit
  // Body: { limitPerMin: number | null }  — null = revert to default
  @UseGuards(AdminGuard)
  @Patch('admin/keys/:keyId/rate-limit')
  setKeyRateLimit(
    @Param('keyId') keyId: string,
    @Body() body: { limitPerMin: number | null },
    @CurrentUser() admin: any,
  ) {
    return this.svc.setKeyRateLimit(keyId, body?.limitPerMin ?? null, admin.id);
  }
}
