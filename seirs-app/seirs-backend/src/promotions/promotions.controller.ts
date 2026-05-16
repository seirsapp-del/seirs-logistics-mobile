import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { PromoStatus, PromoType } from './promotion.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@Controller()
export class PromotionsController {
  constructor(private readonly svc: PromotionsService) {}

  // ── Customer-facing ───────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('promotions/active')
  listActive() {
    return this.svc.listActive();
  }

  // POST /api/v1/promotions/redeem  { code, subtotalKobo, deliveryId? }
  // Returns discountAppliedKobo + finalSubtotalKobo. Throws 4xx with
  // a human-readable message on any validation failure (expired,
  // already used, below minimum, etc.).
  @UseGuards(JwtAuthGuard)
  @Post('promotions/redeem')
  redeem(
    @CurrentUser() user: User,
    @Body() body: { code: string; subtotalKobo: number; deliveryId?: string },
  ) {
    return this.svc.redeem(user.id, body);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/promotions')
  list(@Query('status') status?: PromoStatus) {
    return this.svc.list({ status });
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/promotions')
  create(@CurrentUser() user: User, @Body() body: {
    code: string; type: PromoType; value: number; description?: string;
    validFrom: string; validTo: string;
    usageLimit?: number; perUserLimit?: number;
    minSubtotalKobo?: number; maxDiscountKobo?: number | null;
  }) {
    return this.svc.create(user.id, body);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/promotions/:id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.svc.update(id, body);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('admin/promotions/:id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
