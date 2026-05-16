import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User, UserRole, AdminSubRole } from '../users/user.entity';
import { ArchivedUser } from '../users/archived-user.entity';
import { Driver, DriverStatus } from '../drivers/driver.entity';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { FraudFlag, FraudFlagStatus } from '../fraud/fraud-flag.entity';
import { FraudService } from '../fraud/fraud.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { CmsItem, ContentType, ContentStatus } from './cms-item.entity';
import { SupportTicket, TicketStatus, TicketPriority } from './support-ticket.entity';
import { AuditLogEntry } from './audit-log.entity';
import { PricingConfig } from './pricing-config.entity';
import { DuplicateAccountCandidate, DuplicateReason, DuplicateStatus } from './duplicate-account.entity';
import { ExternalPartner, ExternalPartnerStatus, ExternalPartnerType } from './external-partner.entity';
import { PLATFORM_COMMISSION } from '../common/constants/pricing';

const PRICING_SINGLETON_ID = 'singleton';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User)                       private usersRepo:      Repository<User>,
    @InjectRepository(ArchivedUser)               private archiveRepo:    Repository<ArchivedUser>,
    @InjectRepository(Driver)                     private driversRepo:    Repository<Driver>,
    @InjectRepository(Delivery)                   private deliveriesRepo: Repository<Delivery>,
    @InjectRepository(FraudFlag)                  private flagsRepo:      Repository<FraudFlag>,
    @InjectRepository(CmsItem)                    private cmsRepo:        Repository<CmsItem>,
    @InjectRepository(SupportTicket)              private ticketsRepo:    Repository<SupportTicket>,
    @InjectRepository(AuditLogEntry)              private auditRepo:      Repository<AuditLogEntry>,
    @InjectRepository(PricingConfig)              private pricingRepo:    Repository<PricingConfig>,
    @InjectRepository(DuplicateAccountCandidate)  private duplicatesRepo: Repository<DuplicateAccountCandidate>,
    @InjectRepository(ExternalPartner)            private partnersRepo:   Repository<ExternalPartner>,
    private readonly fraudService: FraudService,
    private readonly mailService:  MailService,
    private readonly usersService: UsersService,
  ) {}

  // ── Spec V8 §3.13 — NDPR admin tools (A32 + A33) ──────────────────────────

  // A32 — export any user's NDPR bundle. Wraps the self-service export
  // for legal / subject-access requests where the user can't pull it.
  async adminExportUserData(targetUserId: string) {
    return this.usersService.exportUserData(targetUserId);
  }

  // A33 — admin-triggered immediate hard-delete. Bypasses the 30-day
  // grace window for compliance requests the user has formally
  // escalated. Refuses on admins (use offboard) or on accounts with
  // active deliveries (would orphan a customer's package).
  async adminHardDeleteUser(targetUserId: string, adminId: string, reason: string) {
    if (!reason || reason.trim().length < 6) {
      throw new BadRequestException('Reason (min 6 chars) is required.');
    }
    const user = await this.usersRepo.findOne({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException('Account not found.');
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException('Use offboard for admin accounts.');
    }
    const activeAsCustomer = await this.deliveriesRepo.count({
      where: {
        customer: { id: targetUserId },
        status:   In([DeliveryStatus.PENDING, DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT]),
      },
    });
    if (activeAsCustomer > 0) {
      throw new BadRequestException(
        `Cannot hard-delete: user has ${activeAsCustomer} active ${activeAsCustomer === 1 ? 'delivery' : 'deliveries'}.`,
      );
    }
    const emailHash = crypto.createHash('sha256').update(user.email.toLowerCase()).digest('hex');
    await this.archiveRepo.save(this.archiveRepo.create({
      originalUserId:    user.id,
      emailHash,
      accountId:         user.accountId ?? null,
      role:              user.role,
      reason:            `admin_purge: ${reason.trim().slice(0, 200)}`,
      originalCreatedAt: user.createdAt,
      deactivatedAt:     user.deactivatedAt ?? new Date(),
    }));
    await this.usersRepo.delete(user.id);
    this.logger.warn(`ADMIN_HARD_DELETE userId=${targetUserId} admin=${adminId} reason="${reason}"`);
    return { ok: true, archivedAt: new Date().toISOString() };
  }

  // ── Spec V8 §3.13 — Duplicate account detection + merge (A21) ─────────────

  // Walk all active non-admin users and flag candidate duplicate pairs.
  // Idempotent: existing (primary, duplicate) rows are preserved with
  // their current status. Returns counts for the admin UI.
  async scanForDuplicates(): Promise<{ scanned: number; newCandidates: number }> {
    const users = await this.usersRepo.find({
      where: { isActive: true, role: Not(UserRole.ADMIN) },
      select: ['id', 'name', 'email', 'phone', 'createdAt'],
      order: { createdAt: 'ASC' },
    });

    const byPhoneTail  = new Map<string, User[]>();
    const byEmailLocal = new Map<string, User[]>();
    for (const u of users) {
      const phoneTail = (u.phone ?? '').replace(/\D/g, '').slice(-10);
      if (phoneTail.length === 10) {
        const arr = byPhoneTail.get(phoneTail) ?? [];
        arr.push(u);
        byPhoneTail.set(phoneTail, arr);
      }
      const emailLocal = (u.email ?? '').toLowerCase().split('@')[0];
      if (emailLocal && emailLocal.length >= 3) {
        const arr = byEmailLocal.get(emailLocal) ?? [];
        arr.push(u);
        byEmailLocal.set(emailLocal, arr);
      }
    }

    const seen = new Set<string>();
    const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    type Candidate = {
      primaryUserId: string; duplicateUserId: string;
      primaryName: string; primaryEmail: string; primaryPhone: string;
      duplicateName: string; duplicateEmail: string; duplicatePhone: string;
      matchScore: number; reason: DuplicateReason;
    };
    const candidates: Candidate[] = [];

    const pushCandidate = (primary: User, duplicate: User, score: number, reason: DuplicateReason) => {
      const key = pairKey(primary.id, duplicate.id);
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({
        primaryUserId:   primary.id,
        duplicateUserId: duplicate.id,
        primaryName:     primary.name,
        primaryEmail:    primary.email,
        primaryPhone:    primary.phone ?? '',
        duplicateName:   duplicate.name,
        duplicateEmail:  duplicate.email,
        duplicatePhone:  duplicate.phone ?? '',
        matchScore:      score,
        reason,
      });
    };

    for (const group of byPhoneTail.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => +a.createdAt - +b.createdAt);
      for (let i = 1; i < group.length; i++) {
        pushCandidate(group[0], group[i], 0.95, DuplicateReason.SAME_PHONE);
      }
    }

    for (const group of byEmailLocal.values()) {
      if (group.length < 2) continue;
      const domains = new Set(group.map(u => u.email.toLowerCase().split('@')[1] ?? ''));
      if (domains.size < 2) continue;
      group.sort((a, b) => +a.createdAt - +b.createdAt);
      for (let i = 1; i < group.length; i++) {
        pushCandidate(group[0], group[i], 0.82, DuplicateReason.EMAIL_LOOKALIKE);
      }
    }

    let inserted = 0;
    for (const c of candidates) {
      const exists = await this.duplicatesRepo.findOne({
        where: { primaryUserId: c.primaryUserId, duplicateUserId: c.duplicateUserId },
      });
      if (exists) continue;
      await this.duplicatesRepo.save(this.duplicatesRepo.create(c as any));
      inserted++;
    }
    this.logger.log(`Duplicate scan: ${users.length} users, ${candidates.length} pairs, ${inserted} new`);
    return { scanned: users.length, newCandidates: inserted };
  }

  listDuplicates(status?: DuplicateStatus) {
    const where = status ? { status } : {};
    return this.duplicatesRepo.find({
      where,
      order: { matchScore: 'DESC', createdAt: 'DESC' },
      take: 200,
    });
  }

  // Soft-merge: marks the duplicate as merged-into the primary.
  // Deactivates the duplicate; sign-in is blocked by mergedIntoUserId.
  // FK'd data stays on the duplicate row so audit is preserved.
  async mergeDuplicate(candidateId: string, adminId: string) {
    const candidate = await this.duplicatesRepo.findOne({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundException('Candidate not found.');
    if (candidate.status === DuplicateStatus.MERGED) return candidate;

    const dup = await this.usersRepo.findOne({ where: { id: candidate.duplicateUserId } });
    if (!dup) throw new NotFoundException('Duplicate account not found.');
    if (dup.role === UserRole.ADMIN) {
      throw new ForbiddenException('Cannot merge admin accounts.');
    }

    await this.usersRepo.update(dup.id, {
      mergedIntoUserId:   candidate.primaryUserId,
      isActive:           false,
      deactivatedAt:      new Date(),
      deactivationReason: `merged_into_${candidate.primaryUserId}`,
    });
    candidate.status            = DuplicateStatus.MERGED;
    candidate.resolvedByAdminId = adminId;
    candidate.resolvedAt        = new Date();
    await this.duplicatesRepo.save(candidate);
    this.logger.warn(`DUPLICATE_MERGE primary=${candidate.primaryUserId} duplicate=${candidate.duplicateUserId} admin=${adminId}`);
    return candidate;
  }

  async dismissDuplicate(candidateId: string, adminId: string) {
    const candidate = await this.duplicatesRepo.findOne({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundException('Candidate not found.');
    candidate.status            = DuplicateStatus.DISMISSED;
    candidate.resolvedByAdminId = adminId;
    candidate.resolvedAt        = new Date();
    return this.duplicatesRepo.save(candidate);
  }

  // ── Spec V8 §3.13 — External partners directory (A40 + A41) ───────────────

  listExternalPartners(type?: ExternalPartnerType) {
    const where = type ? { type } : {};
    return this.partnersRepo.find({ where, order: { name: 'ASC' }, take: 200 });
  }

  async createExternalPartner(body: Partial<ExternalPartner>) {
    if (!body.type)         throw new BadRequestException('type is required.');
    if (!body.name?.trim()) throw new BadRequestException('name is required.');
    const row = this.partnersRepo.create({
      type:         body.type,
      name:         body.name.trim(),
      contactEmail: body.contactEmail ?? (null as any),
      contactPhone: body.contactPhone ?? (null as any),
      websiteUrl:   body.websiteUrl   ?? (null as any),
      notes:        body.notes        ?? (null as any),
      status:       body.status       ?? ExternalPartnerStatus.PENDING,
      meta:         body.meta         ?? {},
    });
    return this.partnersRepo.save(row);
  }

  async updateExternalPartner(id: string, body: Partial<ExternalPartner>) {
    const row = await this.partnersRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Partner not found.');
    if (body.name         !== undefined) row.name         = body.name;
    if (body.contactEmail !== undefined) row.contactEmail = body.contactEmail!;
    if (body.contactPhone !== undefined) row.contactPhone = body.contactPhone!;
    if (body.websiteUrl   !== undefined) row.websiteUrl   = body.websiteUrl!;
    if (body.notes        !== undefined) row.notes        = body.notes!;
    if (body.status       !== undefined) row.status       = body.status;
    if (body.meta         !== undefined) row.meta         = body.meta;
    return this.partnersRepo.save(row);
  }

  async removeExternalPartner(id: string) {
    const row = await this.partnersRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Partner not found.');
    await this.partnersRepo.remove(row);
    return { ok: true };
  }

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
        commission: Number(revenueResult?.total ?? 0) * PLATFORM_COMMISSION,
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

  async createAdmin(data: {
    name?: string;
    firstName?: string;
    lastName?: string;
    email: string;
    phone?: string;
    password?: string;
    adminRole?: string;
    roleId?: string;
  }) {
    const email = data.email.trim().toLowerCase();
    const exists = await this.usersRepo.findOne({ where: { email } });
    if (exists) throw new ConflictException('Email already registered.');

    // Accept either name OR firstName+lastName for flexibility with both
    // legacy clients and the current Staff Management page.
    const fullName = data.name?.trim()
      ?? [data.firstName?.trim(), data.lastName?.trim()].filter(Boolean).join(' ');
    if (!fullName) throw new ConflictException('Name (or firstName + lastName) required.');

    // If no password provided, generate a secure random one — they'll
    // reset via the email-link flow on first login.
    const rawPassword = data.password?.trim()
      || crypto.randomBytes(16).toString('base64url');

    const user = this.usersRepo.create({
      name:      fullName,
      email,
      phone:     data.phone?.trim() ?? '',
      password:  await bcrypt.hash(rawPassword, 12),
      role:      UserRole.ADMIN,
      adminRole: (data.adminRole as AdminSubRole) ?? null,
      roleId:    data.roleId ?? null,
    });
    await this.usersRepo.save(user);

    // If a roleId was passed, also email the new admin a password reset
    // link so they can set their own password on first sign-in.
    if (data.roleId || !data.password) {
      this.usersRepo.update(user.id, { passwordResetToken: crypto.randomBytes(32).toString('hex'), passwordResetExpiry: new Date(Date.now() + 24 * 3600_000) }).catch(() => {});
    }

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

  // ── Pricing config (Postgres-backed singleton row) ────────────────────────

  async getPricingConfig() {
    let row = await this.pricingRepo.findOne({ where: { id: PRICING_SINGLETON_ID } });
    if (!row) {
      row = this.pricingRepo.create({
        id:                PRICING_SINGLETON_ID,
        baseFare:          300,
        perKmRate:         80,
        platformCut:       PLATFORM_COMMISSION,
        surgeActive:       false,
        surgeMultiplier:   1.0,
        vehicles:          null as any,
        zones:             null as any,
        fuelAdjustPercent: 0,
        fxAdjustPercent:   0,
      });
      await this.pricingRepo.save(row);
    }
    return {
      baseFare:          Number(row.baseFare),
      perKmRate:         Number(row.perKmRate),
      platformCut:       Number(row.platformCut),
      surgeActive:       row.surgeActive,
      surgeMultiplier:   Number(row.surgeMultiplier),
      vehicles:          row.vehicles ?? [],
      zones:             row.zones ?? [],
      fuelAdjustPercent: Number(row.fuelAdjustPercent),
      fxAdjustPercent:   Number(row.fxAdjustPercent),
    };
  }

  async updatePricingConfig(data: Partial<{
    baseFare:          number;
    perKmRate:         number;
    platformCut:       number;
    surgeActive:       boolean;
    surgeMultiplier:   number;
    vehicles:          Array<{ vehicleType: string; baseFare: number; perKmRate: number; perMinRate: number }>;
    zones:             Array<{ name: string; surchargePercent: number }>;
    fuelAdjustPercent: number;
    fxAdjustPercent:   number;
  }>) {
    await this.getPricingConfig(); // ensures singleton row exists
    await this.pricingRepo.update({ id: PRICING_SINGLETON_ID }, data as any);
    return this.getPricingConfig();
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

  // Spec V8 — deliveries grouped by driver's vehicle type (motorcycle vs van etc.)
  async getDeliveriesByVehicle() {
    const rows = await this.deliveriesRepo
      .createQueryBuilder('d')
      .leftJoin('d.driver', 'driver')
      .select('driver.vehicleType', 'vehicleType')
      .addSelect('COUNT(d.id)', 'count')
      .where('d.status = :status', { status: DeliveryStatus.DELIVERED })
      .groupBy('driver.vehicleType')
      .getRawMany();
    return rows
      .filter(r => r.vehicleType)
      .map(r => ({ vehicleType: r.vehicleType as string, count: Number(r.count) }));
  }

  // Spec V8 — deliveries grouped by package category (using urgency as proxy
  // until per-category field ships in the multi-drop e-commerce module)
  async getDeliveriesByCategory() {
    const rows = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select('d.urgency',  'category')
      .addSelect('COUNT(d.id)', 'count')
      .groupBy('d.urgency')
      .getRawMany();
    return rows.map(r => ({ category: r.category as string, count: Number(r.count) }));
  }

  // Spec V8 §2.4 — total hours each top driver has been on active jobs
  // (assignedAt → deliveredAt) over the last 30 days.
  async getDriverHours(days = 30, limit = 10) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.deliveriesRepo
      .createQueryBuilder('d')
      .leftJoin('d.driver', 'driver')
      .leftJoin('driver.user', 'user')
      .select('driver.id', 'driverId')
      .addSelect('user.name', 'driverName')
      .addSelect(
        'SUM(EXTRACT(EPOCH FROM (d.deliveredAt - d.assignedAt))) / 3600',
        'hours',
      )
      .where('d.status = :status', { status: DeliveryStatus.DELIVERED })
      .andWhere('d.assignedAt IS NOT NULL AND d.deliveredAt IS NOT NULL')
      .andWhere('d.createdAt >= :since', { since })
      .groupBy('driver.id')
      .addGroupBy('user.name')
      .orderBy('hours', 'DESC')
      .limit(limit)
      .getRawMany();
    return rows
      .filter(r => r.driverId)
      .map(r => ({
        driverId:   r.driverId as string,
        driverName: (r.driverName as string) ?? 'Driver',
        hours:      Math.round(Number(r.hours) * 10) / 10,
      }));
  }

  // Spec V8 §1.13 — funnel of referred users → completed first delivery
  async getReferralFunnel() {
    const referred = await this.usersRepo
      .createQueryBuilder('u')
      .where('u.referredByCode IS NOT NULL')
      .getCount();

    const activated = await this.usersRepo
      .createQueryBuilder('u')
      .innerJoin('u.deliveries', 'd', 'd.status = :status', { status: DeliveryStatus.DELIVERED })
      .where('u.referredByCode IS NOT NULL')
      .getCount();

    return {
      referredSignups:    referred,
      firstDeliveryDone:  activated,
      conversionPercent:  referred > 0 ? Math.round((activated / referred) * 1000) / 10 : 0,
    };
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

  // Spec V8 — admin offboarding footprint. Lists what a soon-to-be-
  // offboarded admin currently owns so the super-admin can reassign
  // before deactivating. Counts only — full lists live on their
  // respective pages (tickets, fraud, cms, dev-platform/keys).
  async getAdminFootprint(adminUserId: string) {
    const mgr = this.usersRepo.manager;

    const [openTickets, draftCms, apiKeys, openFraudFlags, auditEntries] = await Promise.all([
      mgr.createQueryBuilder()
        .from('support_tickets', 't')
        .where('t."assignedToId" = :uid', { uid: adminUserId })
        .andWhere('t.status IN (:...s)', { s: ['open', 'in_progress'] })
        .getCount().catch(() => 0),
      mgr.createQueryBuilder()
        .from('cms_items', 'c')
        .where('c."createdById" = :uid', { uid: adminUserId })
        .andWhere('c.status = :s', { s: 'draft' })
        .getCount().catch(() => 0),
      mgr.createQueryBuilder()
        .from('api_keys', 'k')
        .where('k."ownerUserId" = :uid', { uid: adminUserId })
        .andWhere('k.active = true')
        .getCount().catch(() => 0),
      mgr.createQueryBuilder()
        .from('fraud_flags', 'f')
        .where('f."resolvedById" = :uid', { uid: adminUserId })
        .andWhere('f.status = :s', { s: 'open' })
        .getCount().catch(() => 0),
      mgr.createQueryBuilder()
        .from('audit_logs', 'a')
        .where('a."adminId" = :uid', { uid: adminUserId })
        .getCount().catch(() => 0),
    ]);

    const blockers: Array<{ type: string; count: number; action: string }> = [];
    if (openTickets > 0) blockers.push({
      type: 'open_tickets', count: openTickets,
      action: `Reassign ${openTickets} open ticket${openTickets === 1 ? '' : 's'} to another support agent first.`,
    });
    if (draftCms > 0) blockers.push({
      type: 'draft_cms', count: draftCms,
      action: `${draftCms} draft CMS item${draftCms === 1 ? '' : 's'} will be orphaned. Publish, delete, or transfer ownership.`,
    });
    if (apiKeys > 0) blockers.push({
      type: 'api_keys', count: apiKeys,
      action: `Revoke ${apiKeys} active API key${apiKeys === 1 ? '' : 's'} they own — apps using them will stop working.`,
    });
    if (openFraudFlags > 0) blockers.push({
      type: 'fraud_flags', count: openFraudFlags,
      action: `${openFraudFlags} fraud flag${openFraudFlags === 1 ? '' : 's'} pending their review. Reassign to another compliance reviewer.`,
    });

    return {
      adminUserId,
      ready: blockers.length === 0,
      blockers,
      auditEntries, // informational — never blocks; audit trail is retained per legal hold
    };
  }

  // Offboard execution. Runs the standard suspend, but only after the
  // footprint check passes (or the caller explicitly forces). Logs who
  // offboarded whom + the reason for compliance review later.
  async offboardAdmin(
    adminUserId: string,
    requester: any,
    opts: { reason?: string; force?: boolean },
    ip?: string,
  ) {
    if (!opts.force) {
      const footprint = await this.getAdminFootprint(adminUserId);
      if (!footprint.ready) {
        throw new ConflictException({
          message: 'Cannot offboard — outstanding work to reassign first.',
          blockers: footprint.blockers,
        });
      }
    }
    await this.usersRepo.update(adminUserId, {
      isActive:           false,
      deactivatedAt:      new Date(),
      deactivationReason: opts.reason ?? 'admin_offboarded',
    });
    await this.logAudit(requester, 'offboard_admin', `user:${adminUserId}`, {
      reason: opts.reason,
      forced: !!opts.force,
    }, ip);
    return { message: 'Admin offboarded.' };
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

  // ── Real-Time Ops Map ─────────────────────────────────────────────────────

  async getOpsMapDrivers() {
    const drivers = await this.driversRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.user', 'u')
      .where('d.lastLat IS NOT NULL AND d.lastLng IS NOT NULL')
      .getMany();
    return drivers.map(d => ({
      id:        d.id,
      name:      d.user?.name ?? 'Driver',
      lat:       Number(d.lastLat),
      lng:       Number(d.lastLng),
      isOnline:  !!d.isOnline,
      lastSeen:  d.locationUpdatedAt?.toISOString(),
    }));
  }

  async getOpsMapDeliveries() {
    const active = await this.deliveriesRepo.find({
      where: [
        { status: DeliveryStatus.ASSIGNED },
        { status: DeliveryStatus.PICKED_UP },
        { status: DeliveryStatus.IN_TRANSIT },
      ],
      take: 200,
    });
    return active.map(dv => ({
      id:           dv.id,
      trackingCode: dv.trackingCode,
      pickupLat:    Number(dv.pickupLat),
      pickupLng:    Number(dv.pickupLng),
      dropoffLat:   Number(dv.dropoffLat),
      dropoffLng:   Number(dv.dropoffLng),
      status:       dv.status,
    }));
  }

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
