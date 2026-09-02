import {
  Controller, Get, Post, Patch, Param, Query, Body, UseGuards,
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
    @Query('driverId') driverId?: string,
  ) {
    return this.drivers.listDriverDocuments(status, page, driverId);
  }

  // GET /api/v1/admin/driver-documents/queue
  // One row per rider waiting on ANY decision: account approval, documents,
  // or a vehicle change. Replaces three separate lists a reviewer had to
  // reconcile in their head.
  @Get('queue')
  queue() {
    return this.drivers.kycQueue();
  }

  // GET /api/v1/admin/driver-documents/vehicle-history/:driverId
  // Every vehicle change ever decided for this rider, with all five photos.
  // Approval copies only the OUTSIDE photo onto the driver record, so the
  // inside shot, the plate close-up and the rider's own reason are otherwise
  // unreachable the moment a change is approved.
  @Get('vehicle-history/:driverId')
  vehicleHistory(@Param('driverId') driverId: string) {
    return this.drivers.vehicleHistory(driverId);
  }

  // GET /api/v1/admin/driver-documents/expiring?days=30
  // The documents lapsing or already lapsed, as a LIST to work through.
  // counts returns numbers, and numbers are not work: with a thousand
  // riders nobody can open each profile to find out which ID has expired.
  @Get('expiring')
  expiring(@Query('days') days?: string) {
    return this.drivers.expiringDocuments(Number(days) || 30);
  }

  // PATCH /api/v1/admin/driver-documents/:id/expiry  { expiresAt }
  // Set or change the expiry on an ALREADY-approved document. Separate from
  // approve, which would fire a fresh "approved" notice at the rider for a
  // decision made days ago. Null clears it.
  @Patch(':id/expiry')
  setExpiry(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { expiresAt: string | null },
  ) {
    return this.drivers.setDocumentExpiry(id, user.id, body?.expiresAt ?? null);
  }

  // GET /api/v1/admin/driver-documents/counts
  // Feeds the dashboard: waiting, expired, expiring within 30 days.
  @Get('counts')
  counts() {
    return this.drivers.driverDocumentCounts();
  }

  // POST /api/v1/admin/driver-documents/:id/approve  { expiresAt? }
  @Post(':id/approve')
  approve(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body?: { expiresAt?: string | null },
  ) {
    return this.drivers.reviewDriverDocument(id, user.id, 'approved', undefined, body?.expiresAt ?? null);
  }

  // POST /api/v1/admin/driver-documents/:id/needs-replacing  { reason? }
  // For a document that was fine and has run out. Distinct from reject,
  // which tells the rider they did something wrong: an expired licence is
  // not a fault, and treating it as one is how you lose riders who have
  // done nothing but let time pass.
  @Post(':id/needs-replacing')
  needsReplacing(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body?: { reason?: string },
  ) {
    return this.drivers.reviewDriverDocument(id, user.id, 'needs_replacing', body?.reason);
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
