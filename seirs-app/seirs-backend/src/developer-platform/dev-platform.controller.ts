import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
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
}
