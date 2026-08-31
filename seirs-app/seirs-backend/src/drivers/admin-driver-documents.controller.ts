import {
  Controller, Get, Post, Param, Query, Body, UseGuards,
  DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { DriversService } from './drivers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { DriverDocStatus } from './driver-document.entity';

/**
 * Driver KYC review queue.
 *
 * Built 2026-08-31 because there was no queue at all: a driver's documents
 * were written to columns on the driver row and nothing anywhere listed them
 * for a human. The founder uploaded documents, the app said "Verified", and
 * the admin dashboard had nothing to review.
 *
 * Oldest waiting first, deliberately: a driver sitting in the queue cannot
 * earn, and the fair order is the order they arrived.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/driver-documents')
export class AdminDriverDocumentsController {
  constructor(private readonly drivers: DriversService) {}

  // GET /api/v1/admin/driver-documents?status=submitted&page=1
  @Get()
  list(
    @Query('status') status?: DriverDocStatus,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
  ) {
    return this.drivers.listDriverDocuments(status, page);
  }

  // POST /api/v1/admin/driver-documents/:id/approve
  @Post(':id/approve')
  approve(@CurrentUser() user: User, @Param('id') id: string) {
    return this.drivers.reviewDriverDocument(id, user.id, 'approved');
  }

  // POST /api/v1/admin/driver-documents/:id/reject  { reason }
  @Post(':id/reject')
  reject(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.drivers.reviewDriverDocument(id, user.id, 'rejected', body?.reason);
  }
}
