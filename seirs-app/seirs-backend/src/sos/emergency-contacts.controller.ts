import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { EmergencyContactsService } from './emergency-contacts.service';
import { EmergencyContact } from './emergency-contact.entity';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

/**
 * The emergency directory.
 *
 *   GET /config/emergency-contacts        public, both SOS screens
 *   GET /admin/emergency-contacts         admin, includes retired rows
 *   PUT /admin/emergency-contacts/:id     admin, edit one
 *   POST /admin/emergency-contacts        admin, add one
 *
 * The public read carries no token ON PURPOSE. Somebody reaching for
 * this screen may have a dead session, an expired token or no signal to
 * refresh one, and none of that is a reason to withhold a phone number
 * that is published on the side of a fire truck.
 *
 * Its own controller rather than a route on SosController, because that
 * one is @UseGuards(JwtAuthGuard) at class level and this route must not
 * be. Same split the pricing module uses for its public config reads.
 */
@Controller()
export class EmergencyContactsController {
  constructor(private readonly svc: EmergencyContactsService) {}

  @Public()
  @Get('config/emergency-contacts')
  list() {
    return this.svc.list(false);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/emergency-contacts')
  adminList(@Query('includeInactive') includeInactive?: string) {
    return this.svc.list(includeInactive !== 'false');
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/emergency-contacts')
  create(@Body() body: Partial<EmergencyContact>) {
    return this.svc.upsert(null, body ?? {});
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Put('admin/emergency-contacts/:id')
  update(@Param('id') id: string, @Body() body: Partial<EmergencyContact>) {
    return this.svc.upsert(id, body ?? {});
  }
}
