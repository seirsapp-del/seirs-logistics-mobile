import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { BulkService } from './bulk.service';
import { CreateBulkDeliveryDto } from './dto/bulk-delivery.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('bulk')
export class BulkController {
  constructor(private readonly bulkService: BulkService) {}

  // POST /api/v1/bulk/orders
  @Post('orders')
  createBulkOrder(
    @CurrentUser() user: any,
    @Body() dto: CreateBulkDeliveryDto,
  ) {
    return this.bulkService.createBulkOrder(user.id, dto);
  }

  // GET /api/v1/bulk/orders?page=1&limit=20
  @Get('orders')
  getHistory(
    @CurrentUser() user: any,
    @Query() q: { page?: number; limit?: number },
  ) {
    return this.bulkService.getBulkOrderHistory(user.id, q.page ?? 1, q.limit ?? 20);
  }
}
