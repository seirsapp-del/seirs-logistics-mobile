import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User, UserRole, AdminSubRole } from '../users/user.entity';
import { Driver, DriverStatus } from '../drivers/driver.entity';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { FraudFlag, FraudFlagStatus } from '../fraud/fraud-flag.entity';
import { FraudService } from '../fraud/fraud.service';
import { MailService } from '../mail/mail.service';
import { CmsItem, ContentType, ContentStatus } from './cms-item.entity';
import { SupportTicket, TicketStatus, TicketPriority } from './support-ticket.entity';
import { AuditLogEntry } from './audit-log.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)           private usersRepo:      Repository<User>,
    @InjectRepository(Driver)         private driversRepo:    Repository<Driver>,
    @InjectRepository(Delivery)       private deliveriesRepo: Repository<Delivery>,
    @InjectRepository(FraudFlag)      private flagsRepo:      Repository<FraudFlag>,
    @InjectRepository(CmsItem)        private cmsRepo:        Repository<CmsItem>,
    @InjectRepository(SupportTicket)  private ticketsRepo:    Repository<SupportTicket>,
    @InjectRepository(AuditLogEntry)  private auditRepo:      Repository<AuditLogEntry>,
    private readonly fraudService: FraudService,
    private readonly mailService:  MailService,
  ) {}

  // ── Dashboard stats ───────────────────────────────────────────────────────

  async getDashboardStats() {
    const [
      totalUsers,
      totalDrivers,
      pendingKyc,
      totalDeliveries,
      activeDeliveries,
      deliveriesToday,
      pendingDeliveries,
    ] = await Promise.all([
      this.usersRepo.count({ where: { role: 'customer' as any } }),
      this.driversRepo.count(),
      this.driversRepo.count({ where: { status: DriverStatus.PENDING } }),
      this.deliveriesRepo.count(),
      this.deliveriesRepo.count({
        where: [
          { status: DeliveryStatus.ASSIGNED },
          { status: DeliveryStatus.PICKED_UP },
          { status: DeliveryStatus.IN_TRANSIT },
        ],
      }),
      this.deliveriesRepo
        .createQueryBuilder('d')
        .where('d.createdAt >= :today', { today: new Date(new Date().setHours(0, 0, 0, 0)) })
        .getCount(),
      this.deliveriesRepo.count({ where: { status: DeliveryStatus.PENDING } }),
    ]);

    // Revenue (sum of all successful delivery prices)
    const revenueResult = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select('SUM(d.price)', 'total')
      .where('d.status = :status', { status: DeliveryStatus.DELIVERED })
      .getRawOne();

    return {
      users: { total: totalUsers },
      drivers: {
        total:      totalDrivers,
        pendingKyc,
      },
      deliveries: {
        total:   totalDeliveries,
        active:  activeDeliveries,
        today:   deliveriesToday,
        pending: pendingDeliveries,
      },
      revenue: {
        total:      Number(revenueResult?.total ?? 0),
        commission: Number(revenueResult?.total ?? 0) * 0.30,
      },
    };
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async getUsers(page: number, limit: number, role?: string) {
    const qb = this.usersRepo.createQueryBuilder('u')
      .orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (role) qb.where('u.role = :role', { role });

    const [users, total] = await qb.getManyAndCount();
    return { users, total, page, limit };
  }

  async getUserDetail(id: string) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const [deliveries, deliveryCount] = await this.deliveriesRepo.findAndCount({
      where: { customer: { id } },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const spent = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select('SUM(d.price)', 'total')
      .where('d.customer.id = :id', { id })
      .andWhere('d.status = :status', { status: DeliveryStatus.DELIVERED })
      .getRawOne();

    return { user, deliveries, deliveryCount, totalSpent: Number(spent?.total ?? 0) };
  }

  async updateUser(id: string, data: Partial<User>) {
    await this.usersRepo.update(id, data);
    return this.usersRepo.findOne({ where: { id } });
  }

  // ── Admin management ──────────────────────────────────────────────────────

  async getAdmins() {
    return this.usersRepo.find({
      where: { role: UserRole.ADMIN },
      order: { createdAt: 'ASC' },
    });
  }

  async createAdmin(data: { name: string; email: string; phone: string; password: string }) {
    const email = data.email.trim().toLowerCase();
    const exists = await this.usersRepo.findOne({ where: { email } });
    if (exists) throw new ConflictException('Email already registered.');

    const user = this.usersRepo.create({
      name:     data.name.trim(),
      email,
      phone:    data.phone.trim(),
      password: await bcrypt.hash(data.password, 12),
      role:     UserRole.ADMIN,
    });
    await this.usersRepo.save(user);
    const { password: _pw, ...safe } = user as any;
    return safe;
  }

  async changeUserRole(id: string, role: UserRole, requesterId: string) {
    if (id === requesterId) throw new ConflictException('You cannot change your own role.');
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found.');
    const previousRole = user.role;
    await this.usersRepo.update(id, { role });
    const requester = await this.usersRepo.findOne({ where: { id: requesterId } });
    console.log(
      `[AUDIT] Role change: ${user.email} ${previousRole} → ${role} ` +
      `by ${requester?.email ?? requesterId} at ${new Date().toISOString()}`,
    );
    return this.usersRepo.findOne({ where: { id } });
  }

  // ── Drivers ───────────────────────────────────────────────────────────────

  async getDrivers(page: number, limit: number, status?: string) {
    const qb = this.driversRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.user', 'user')
      .orderBy('d.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) qb.where('d.status = :status', { status });

    const [drivers, total] = await qb.getManyAndCount();
    return { drivers, total, page, limit };
  }

  async getDriverDetail(id: string) {
    const driver = await this.driversRepo.findOne({ where: { id }, relations: ['user'] });
    if (!driver) throw new NotFoundException('Driver not found');

    const [deliveries, deliveryCount] = await this.deliveriesRepo.findAndCount({
      where: { driver: { id } },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const earned = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select('SUM(d.driverEarnings)', 'total')
      .where('d.driver.id = :id', { id })
      .andWhere('d.status = :status', { status: DeliveryStatus.DELIVERED })
      .getRawOne();

    return { driver, deliveries, deliveryCount, totalEarned: Number(earned?.total ?? 0) };
  }

  async updateDriverStatus(id: string, status: string, rejectionReason?: string) {
    await this.driversRepo.update(id, { status: status as DriverStatus });
    const driver = await this.driversRepo.findOne({ where: { id }, relations: ['user'] });

    if (driver?.user) {
      if (status === DriverStatus.APPROVED) {
        this.mailService.sendDriverApproved(driver.user.email, driver.user.name).catch(() => {});
      } else if (status === DriverStatus.REJECTED) {
        this.mailService.sendDriverRejected(driver.user.email, driver.user.name, rejectionReason).catch(() => {});
      }
    }

    return driver;
  }

  // ── Deliveries ────────────────────────────────────────────────────────────

  async getDeliveries(page: number, limit: number, status?: string) {
    const qb = this.deliveriesRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.customer', 'customer')
      .leftJoinAndSelect('d.driver', 'driver')
      .orderBy('d.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) qb.where('d.status = :status', { status });

    const [deliveries, total] = await qb.getManyAndCount();
    return { deliveries, total, page, limit };
  }

  async getDeliveryDetail(id: string) {
    const d = await this.deliveriesRepo.findOne({
      where: { id },
      relations: ['customer', 'driver', 'driver.user'],
    });
    if (!d) throw new NotFoundException('Delivery not found.');
    return d;
  }

  async manualReassign(deliveryId: string, driverId: string) {
    const driver = await this.driversRepo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found.');

    await this.deliveriesRepo.update(deliveryId, {
      driver,
      status:     DeliveryStatus.ASSIGNED,
      assignedAt: new Date(),
    });

    return this.getDeliveryDetail(deliveryId);
  }

  async cancelDelivery(deliveryId: string) {
    await this.deliveriesRepo.update(deliveryId, { status: DeliveryStatus.CANCELLED });
    return { message: 'Delivery cancelled.' };
  }

  // ── Pricing config (stored in memory for now, DB table in Phase 5) ────────

  private pricingConfig = {
    baseFare:      300,
    perKmRate:     80,
    platformCut:   0.30,
    surgeActive:   false,
    surgeMultiplier: 1.0,
  };

  getPricingConfig() { return this.pricingConfig; }

  updatePricingConfig(data: Partial<typeof this.pricingConfig>) {
    this.pricingConfig = { ...this.pricingConfig, ...data };
    return this.pricingConfig;
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  async getRevenueByDay(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select("DATE_TRUNC('day', d.createdAt)", 'day')
      .addSelect('SUM(d.price)',  'revenue')
      .addSelect('COUNT(d.id)',   'count')
      .where('d.status = :status', { status: DeliveryStatus.DELIVERED })
      .andWhere('d.createdAt >= :since', { since })
      .groupBy("DATE_TRUNC('day', d.createdAt)")
      .orderBy("DATE_TRUNC('day', d.createdAt)", 'ASC')
      .getRawMany();

    const data = rows.map(r => ({
      date:    new Date(r.day).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' }),
      revenue: Number(r.revenue),
      count:   Number(r.count),
    }));
    return { data };
  }

  async getDeliveriesByStatus() {
    const rows = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select('d.status', 'status')
      .addSelect('COUNT(d.id)', 'count')
      .groupBy('d.status')
      .getRawMany();

    return rows.map(r => ({ status: r.status, count: Number(r.count) }));
  }

  async getTopDrivers(limit = 10) {
    return this.driversRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.user', 'user')
      .orderBy('d.totalDeliveries', 'DESC')
      .addOrderBy('d.rating', 'DESC')
      .take(limit)
      .getMany();
  }

  async getDeliveryHeatmap() {
    return this.deliveriesRepo
      .createQueryBuilder('d')
      .select('d.pickupLat',  'lat')
      .addSelect('d.pickupLng', 'lng')
      .addSelect('COUNT(d.id)', 'count')
      .where('d.createdAt >= :since', { since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) })
      .groupBy('d.pickupLat, d.pickupLng')
      .orderBy('COUNT(d.id)', 'DESC')
      .limit(200)
      .getRawMany();
  }

  // ── Fraud ─────────────────────────────────────────────────────────────────

  getFraudFlags(page: number, limit: number, status?: string) {
    return this.fraudService.getFlags(page, limit, status);
  }

  resolveFraudFlag(flagId: string, adminId: string, status: FraudFlagStatus) {
    return this.fraudService.resolveFlag(flagId, adminId, status);
  }

  // ── Admin role & TOTP management ──────────────────────────────────────────

  async updateAdminRole(id: string, adminRole: string, requester: any, ip?: string) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user || user.role !== UserRole.ADMIN) throw new NotFoundException('Admin not found.');
    await this.usersRepo.update(id, { adminRole: adminRole as AdminSubRole });
    await this.logAudit(requester, 'role_change', `admin:${id}`, { adminRole }, ip);
    return this.usersRepo.findOne({ where: { id } });
  }

  async suspendUser(id: string, requester: any, ip?: string) {
    await this.usersRepo.update(id, { isActive: false });
    await this.logAudit(requester, 'suspend', `user:${id}`, {}, ip);
    return { message: 'User suspended.' };
  }

  // TOTP setup is handled by the auth module; these are stubs
  async setupTOTP(_id: string) {
    return { message: 'TOTP setup initiated — handled by auth flow.' };
  }

  async confirmTOTP(_id: string, _code: string) {
    return { message: 'TOTP confirmed.' };
  }

  // ── CMS ───────────────────────────────────────────────────────────────────

  async getCmsItems(type?: ContentType, status?: ContentStatus) {
    const qb = this.cmsRepo.createQueryBuilder('c').orderBy('c.updatedAt', 'DESC');
    if (type)   qb.andWhere('c.type = :type', { type });
    if (status) qb.andWhere('c.status = :status', { status });
    return qb.getMany();
  }

  async createCmsItem(
    data: { type: ContentType; title: string; body?: string; imageUrl?: string },
    createdById: string,
  ) {
    const item = this.cmsRepo.create({ ...data, createdById, status: ContentStatus.DRAFT });
    return this.cmsRepo.save(item);
  }

  async updateCmsItem(id: string, data: Partial<CmsItem>) {
    await this.cmsRepo.update(id, data);
    return this.cmsRepo.findOne({ where: { id } });
  }

  async approveCmsItem(id: string, requester: any, ip?: string) {
    await this.cmsRepo.update(id, { status: ContentStatus.PENDING, approvedById: requester.id });
    await this.logAudit(requester, 'approve', `cms:${id}`, {}, ip);
    return this.cmsRepo.findOne({ where: { id } });
  }

  async publishCmsItem(id: string, requester: any, ip?: string) {
    await this.cmsRepo.update(id, { status: ContentStatus.PUBLISHED, publishedAt: new Date() });
    await this.logAudit(requester, 'publish', `cms:${id}`, {}, ip);
    return this.cmsRepo.findOne({ where: { id } });
  }

  async deleteCmsItem(id: string, requester: any, ip?: string) {
    await this.cmsRepo.delete(id);
    await this.logAudit(requester, 'delete', `cms:${id}`, {}, ip);
    return { message: 'Content deleted.' };
  }

  // ── Support Tickets ───────────────────────────────────────────────────────

  async getTickets(page: number, status?: TicketStatus, priority?: TicketPriority) {
    const limit = 20;
    const qb = this.ticketsRepo.createQueryBuilder('t')
      .orderBy('t.priority', 'DESC')
      .addOrderBy('t.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status)   qb.andWhere('t.status = :status', { status });
    if (priority) qb.andWhere('t.priority = :priority', { priority });

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit, hasMore: page * limit < total };
  }

  async getTicket(id: string) {
    const t = await this.ticketsRepo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Ticket not found.');
    return {
      ...t,
      user: t.userId ? { id: t.userId, name: t.userName, email: t.userEmail } : undefined,
      assignedTo: t.assignedToId ? { id: t.assignedToId, name: t.assignedToName } : undefined,
    };
  }

  async assignTicket(id: string, agentId: string) {
    const agent = await this.usersRepo.findOne({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agent not found.');
    await this.ticketsRepo.update(id, {
      assignedToId:   agentId,
      assignedToName: agent.name,
      status:         TicketStatus.IN_PROGRESS,
    });
    return this.getTicket(id);
  }

  async updateTicket(
    id: string,
    data: { status?: TicketStatus; resolution?: string },
    requester: any,
    ip?: string,
  ) {
    const updates: Partial<SupportTicket> = {};
    if (data.status) updates.status = data.status;
    if (data.status === TicketStatus.RESOLVED) updates.resolvedAt = new Date();
    await this.ticketsRepo.update(id, updates);
    await this.logAudit(requester, `ticket_${data.status}`, `ticket:${id}`, data, ip);
    return this.getTicket(id);
  }

  async replyToTicket(id: string, message: string, requester: any) {
    const ticket = await this.ticketsRepo.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found.');

    const reply = {
      id:        crypto.randomUUID(),
      message,
      sender:    'admin' as const,
      agentId:   requester.id,
      agentName: requester.name,
      createdAt: new Date().toISOString(),
    };

    const replies = [...(ticket.replies ?? []), reply];
    await this.ticketsRepo.update(id, { replies });
    return this.getTicket(id);
  }

  // ── Audit Log ─────────────────────────────────────────────────────────────

  async getAuditLog(page: number, adminId?: string, action?: string) {
    const limit = 50;
    const qb = this.auditRepo.createQueryBuilder('a')
      .orderBy('a.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (adminId) qb.andWhere('a.adminId = :adminId', { adminId });
    if (action)  qb.andWhere('a.action ILIKE :action', { action: `%${action}%` });

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit, hasMore: page * limit < total };
  }

  private async logAudit(
    admin: any,
    action: string,
    target?: string,
    meta?: Record<string, any>,
    ip?: string,
  ) {
    const entry = this.auditRepo.create({
      adminId:   admin.id ?? admin.sub,
      adminName: admin.name ?? 'Admin',
      action,
      target,
      meta,
      ip,
    });
    await this.auditRepo.save(entry).catch(() => {});
  }
}
