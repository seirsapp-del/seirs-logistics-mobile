import { Body, Controller, Get, Param, Post, Patch, UseGuards } from '@nestjs/common';
import { PartnersService } from './partners.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

/**
 * Third-party logistics partners: GIG, Kobo360, DHL (audit 2026-08-14).
 *
 * This is an admin surface and was carrying only JwtAuthGuard, so every
 * signed-up customer could reach it. GET returned the full partner rows
 * including apiKey and apiSecret in plaintext, and PATCH passed an
 * arbitrary body straight into an update, so a customer could rewrite
 * priceMarkup or repoint apiBaseUrl at a server of their own. No client
 * has ever called these routes; the apps use the separate /partner/*
 * store controller.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Get()
  getAll() { return this.partnersService.getAllPartners(); }

  @Post()
  create(@Body() body: any) { return this.partnersService.createPartner(body); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.partnersService.updatePartner(id, body);
  }

  @Get('track/:deliveryId')
  track(@Param('deliveryId') id: string) {
    return this.partnersService.trackPartnerDelivery(id);
  }
}
