import { Body, Controller, Get, Param, Post, Patch, UseGuards } from '@nestjs/common';
import { PartnersService } from './partners.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
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
