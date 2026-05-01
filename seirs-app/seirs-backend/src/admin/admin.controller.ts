import {
  Controller, Get, Post, Patch, Delete, Param, Body,
  UseGuards, Query, Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FraudFlagStatus } from '../fraud/fraud-flag.entity';
import { ContentType, ContentStatus } from './cms-item.entity';
import { TicketStatus, TicketPriority } from './support-ticket.entity';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Overview ──────────────────────────────────────────────────────────────

  // GET /api/v1/admin/stats
  @Get('stats')
  getStats() { return this.adminService.getDashboardStats(); }

  // ── Users ─────────────────────────────────────────────────────────────────

  // GET /api/v1/admin/users?page=1&limit=20&role=customer
  @Get('users')
  getUsers(@Query() q: { page?: number; limit?: number; role?: string }) {
    return this.adminService.getUsers(q.page ?? 1, q.limit ?? 20, q.role);
  }

  // GET /api/v1/admin/users/:id
  @Get('users/:id')
  getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  // GET  /api/v1/admin/admins
  @Get('admins')
  getAdmins() {
    return this.adminService.getAdmins();
  }

  // POST /api/v1/admin/admins
  @Post('admins')
  createAdmin(@Body() body: { name: string; email: string; phone: string; password: string }) {
    return this.adminService.createAdmin(body);
  }

  // PATCH /api/v1/admin/users/:id/role  { role: 'customer' | 'admin' }
  @Patch('users/:id/role')
  changeRole(
    @Param('id') id: string,
    @Body('role') role: string,
    @CurrentUser() admin: any,
  ) {
    return this.adminService.changeUserRole(id, role as any, admin.id);
  }

  // PATCH /api/v1/admin/users/:id  { isActive: false }
  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() body: { isActive?: boolean }) {
    return this.adminService.updateUser(id, body);
  }

  // ── Drivers ───────────────────────────────────────────────────────────────

  // GET /api/v1/admin/drivers?status=pending
  @Get('drivers')
  getDrivers(@Query() q: { page?: number; limit?: number; status?: string }) {
    return this.adminService.getDrivers(q.page ?? 1, q.limit ?? 20, q.status);
  }

  // GET /api/v1/admin/drivers/:id
  @Get('drivers/:id')
  getDriverDetail(@Param('id') id: string) {
    return this.adminService.getDriverDetail(id);
  }

  // PATCH /api/v1/admin/drivers/:id/approve
  @Patch('drivers/:id/approve')
  approveDriver(@Param('id') id: string) {
    return this.adminService.updateDriverStatus(id, 'approved');
  }

  // PATCH /api/v1/admin/drivers/:id/suspend
  @Patch('drivers/:id/suspend')
  suspendDriver(@Param('id') id: string) {
    return this.adminService.updateDriverStatus(id, 'suspended');
  }

  // ── Deliveries ────────────────────────────────────────────────────────────

  // GET /api/v1/admin/deliveries?status=pending&page=1
  @Get('deliveries')
  getDeliveries(@Query() q: { page?: number; limit?: number; status?: string }) {
    return this.adminService.getDeliveries(q.page ?? 1, q.limit ?? 20, q.status);
  }

  // GET /api/v1/admin/deliveries/:id
  @Get('deliveries/:id')
  getDelivery(@Param('id') id: string) {
    return this.adminService.getDeliveryDetail(id);
  }

  // PATCH /api/v1/admin/deliveries/:id/reassign  { driverId }
  @Patch('deliveries/:id/reassign')
  reassignDelivery(@Param('id') id: string, @Body() body: { driverId: string }) {
    return this.adminService.manualReassign(id, body.driverId);
  }

  // PATCH /api/v1/admin/deliveries/:id/cancel
  @Patch('deliveries/:id/cancel')
  cancelDelivery(@Param('id') id: string) {
    return this.adminService.cancelDelivery(id);
  }

  // ── Pricing control ───────────────────────────────────────────────────────

  // GET /api/v1/admin/pricing
  @Get('pricing')
  getPricing() { return this.adminService.getPricingConfig(); }

  // PATCH /api/v1/admin/pricing
  @Patch('pricing')
  updatePricing(@Body() body: any) {
    return this.adminService.updatePricingConfig(body);
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  // GET /api/v1/admin/analytics/revenue?days=30
  @Get('analytics/revenue')
  getRevenue(@Query('days') days?: number) {
    return this.adminService.getRevenueByDay(days ? Number(days) : 30);
  }

  // GET /api/v1/admin/analytics/deliveries-by-status
  @Get('analytics/deliveries-by-status')
  getDeliveriesByStatus() {
    return this.adminService.getDeliveriesByStatus();
  }

  // GET /api/v1/admin/analytics/top-drivers?limit=10
  @Get('analytics/top-drivers')
  getTopDrivers(@Query('limit') limit?: number) {
    return this.adminService.getTopDrivers(limit ? Number(limit) : 10);
  }

  // GET /api/v1/admin/analytics/heatmap
  @Get('analytics/heatmap')
  getHeatmap() {
    return this.adminService.getDeliveryHeatmap();
  }

  // ── Fraud ─────────────────────────────────────────────────────────────────

  // GET /api/v1/admin/fraud?status=open&page=1
  @Get('fraud')
  getFraudFlags(@Query() q: { page?: number; limit?: number; status?: string }) {
    return this.adminService.getFraudFlags(q.page ?? 1, q.limit ?? 20, q.status);
  }

  // PATCH /api/v1/admin/fraud/:id  { status: 'reviewed' | 'dismissed' | 'actioned' }
  @Patch('fraud/:id')
  resolveFraudFlag(
    @Param('id') id: string,
    @Body('status') status: FraudFlagStatus,
    @CurrentUser() admin: any,
  ) {
    return this.adminService.resolveFraudFlag(id, admin.id, status);
  }

  // ── Admin role management ─────────────────────────────────────────────────

  // PATCH /api/v1/admin/admins/:id/role  { adminRole }
  @Patch('admins/:id/role')
  updateAdminRole(
    @Param('id') id: string,
    @Body('adminRole') adminRole: string,
    @CurrentUser() admin: any,
    @Req() req: Request,
  ) {
    return this.adminService.updateAdminRole(id, adminRole, admin, req.ip);
  }

  // POST /api/v1/admin/admins/:id/totp/setup
  @Post('admins/:id/totp/setup')
  setupTOTP(@Param('id') id: string) {
    return this.adminService.setupTOTP(id);
  }

  // POST /api/v1/admin/admins/:id/totp/confirm
  @Post('admins/:id/totp/confirm')
  confirmTOTP(@Param('id') id: string, @Body('code') code: string) {
    return this.adminService.confirmTOTP(id, code);
  }

  // PATCH /api/v1/admin/users/:id/suspend
  @Patch('users/:id/suspend')
  suspendUser(@Param('id') id: string, @CurrentUser() admin: any, @Req() req: Request) {
    return this.adminService.suspendUser(id, admin, req.ip);
  }

  // PATCH /api/v1/admin/drivers/:id/reject  { reason? }
  @Patch('drivers/:id/reject')
  rejectDriver(
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.adminService.updateDriverStatus(id, 'rejected', reason);
  }

  // ── CMS ───────────────────────────────────────────────────────────────────

  // GET /api/v1/admin/cms?type=banner&status=published
  @Get('cms')
  getCmsItems(@Query() q: { type?: ContentType; status?: ContentStatus }) {
    return this.adminService.getCmsItems(q.type, q.status);
  }

  // POST /api/v1/admin/cms
  @Post('cms')
  createCmsItem(
    @Body() body: { type: ContentType; title: string; body?: string; imageUrl?: string },
    @CurrentUser() admin: any,
  ) {
    return this.adminService.createCmsItem(body, admin.id);
  }

  // PATCH /api/v1/admin/cms/:id
  @Patch('cms/:id')
  updateCmsItem(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateCmsItem(id, body);
  }

  // PATCH /api/v1/admin/cms/:id/approve
  @Patch('cms/:id/approve')
  approveCmsItem(@Param('id') id: string, @CurrentUser() admin: any, @Req() req: Request) {
    return this.adminService.approveCmsItem(id, admin, req.ip);
  }

  // PATCH /api/v1/admin/cms/:id/publish
  @Patch('cms/:id/publish')
  publishCmsItem(@Param('id') id: string, @CurrentUser() admin: any, @Req() req: Request) {
    return this.adminService.publishCmsItem(id, admin, req.ip);
  }

  // DELETE /api/v1/admin/cms/:id
  @Delete('cms/:id')
  deleteCmsItem(@Param('id') id: string, @CurrentUser() admin: any, @Req() req: Request) {
    return this.adminService.deleteCmsItem(id, admin, req.ip);
  }

  // ── Support Tickets ───────────────────────────────────────────────────────

  // GET /api/v1/admin/tickets?page=1&status=open&priority=urgent
  @Get('tickets')
  getTickets(@Query() q: { page?: number; status?: TicketStatus; priority?: TicketPriority }) {
    return this.adminService.getTickets(q.page ?? 1, q.status, q.priority);
  }

  // GET /api/v1/admin/tickets/:id
  @Get('tickets/:id')
  getTicket(@Param('id') id: string) {
    return this.adminService.getTicket(id);
  }

  // PATCH /api/v1/admin/tickets/:id/assign  { agentId }
  @Patch('tickets/:id/assign')
  assignTicket(@Param('id') id: string, @Body('agentId') agentId: string) {
    return this.adminService.assignTicket(id, agentId);
  }

  // PATCH /api/v1/admin/tickets/:id  { status?, resolution? }
  @Patch('tickets/:id')
  updateTicket(
    @Param('id') id: string,
    @Body() body: { status?: TicketStatus; resolution?: string },
    @CurrentUser() admin: any,
    @Req() req: Request,
  ) {
    return this.adminService.updateTicket(id, body, admin, req.ip);
  }

  // POST /api/v1/admin/tickets/:id/reply  { message }
  @Post('tickets/:id/reply')
  replyToTicket(
    @Param('id') id: string,
    @Body('message') message: string,
    @CurrentUser() admin: any,
  ) {
    return this.adminService.replyToTicket(id, message, admin);
  }

  // ── Audit Log ─────────────────────────────────────────────────────────────

  // GET /api/v1/admin/audit-log?page=1&adminId=...&action=...
  @Get('audit-log')
  getAuditLog(@Query() q: { page?: number; adminId?: string; action?: string }) {
    return this.adminService.getAuditLog(q.page ?? 1, q.adminId, q.action);
  }
}
