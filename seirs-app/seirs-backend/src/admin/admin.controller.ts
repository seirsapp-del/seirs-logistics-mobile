import {
  Controller, Get, Post, Patch, Param, Body,
  UseGuards, Query,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FraudFlagStatus } from '../fraud/fraud-flag.entity';

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
}
