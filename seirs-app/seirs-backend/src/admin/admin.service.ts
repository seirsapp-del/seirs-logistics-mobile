import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { In, Not, MoreThan, Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User, UserRole, AdminSubRole } from '../users/user.entity';
import { ArchivedUser } from '../users/archived-user.entity';
import { Driver, DriverStatus } from '../drivers/driver.entity';
import { Delivery, DeliveryStatus, DeliverySource } from '../deliveries/delivery.entity';
import { FraudFlag, FraudFlagStatus } from '../fraud/fraud-flag.entity';
import { FraudService } from '../fraud/fraud.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { PaymentsService } from '../payments/payments.service';
import { FeesService } from '../fees/fees.service';
import { DriversService } from '../drivers/drivers.service';
import { CmsItem, ContentType, ContentStatus } from './cms-item.entity';
import { SupportTicket, TicketStatus } from '../support/support-ticket.entity';
import { SupportService } from '../support/support.service';
import { AuditLogEntry } from './audit-log.entity';
import { PricingConfig } from './pricing-config.entity';
import { DuplicateAccountCandidate, DuplicateReason, DuplicateStatus } from './duplicate-account.entity';
import { ExternalPartner, ExternalPartnerStatus, ExternalPartnerType } from './external-partner.entity';
import { PlatformConfig } from './platform-config.entity';
import { DriverEarning } from '../earnings/driver-earning.entity';
import { LoyaltyPoint } from '../loyalty/loyalty-point.entity';
import { IdentityVerification } from '../user-verification/user-verification.entity';
import { PLATFORM_COMMISSION } from '../common/constants/pricing';
import { AccountIdPrefix, generateUuidAccountId } from '../common/utils/auth-codes';

const PRICING_SINGLETON_ID = 'singleton';

// Universal-search hit shape. Kept flat so the UI can render a mixed list
// without switching on type for anything except the leading icon.
export type SearchHitType = 'user' | 'driver' | 'delivery' | 'statement';
export interface SearchHit {
  type:      SearchHitType;
  id:        string;
  label:     string;
  sublabel:  string;
  href:      string;
}

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
    private readonly supportService: SupportService,
    @InjectRepository(AuditLogEntry)              private auditRepo:      Repository<AuditLogEntry>,
    @InjectRepository(PricingConfig)              private pricingRepo:    Repository<PricingConfig>,
    @InjectRepository(DuplicateAccountCandidate)  private duplicatesRepo: Repository<DuplicateAccountCandidate>,
    @InjectRepository(ExternalPartner)            private partnersRepo:   Repository<ExternalPartner>,
    @InjectRepository(PlatformConfig)             private configRepo:     Repository<PlatformConfig>,
    @InjectRepository(DriverEarning)              private earningsRepo:   Repository<DriverEarning>,
    @InjectRepository(LoyaltyPoint)               private loyaltyRepo:    Repository<LoyaltyPoint>,
    @InjectRepository(IdentityVerification)       private identityRepo:   Repository<IdentityVerification>,
    private readonly fraudService: FraudService,
    private readonly mailService:  MailService,
    private readonly usersService: UsersService,
    private readonly paymentsService: PaymentsService,
    private readonly driversService: DriversService,
    private readonly feesService: FeesService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // ── Spec V8 §3.13. NDPR admin tools (A32 + A33) ──────────────────────────

  // Allow-list for NDPR tooling. Kept narrower than AdminGuard so a generic
  // admin can't pull PII bundles without an explicit compliance role.
  // Add roles here when the ops team's shape changes; do NOT widen the
  // guard itself.
  private readonly NDPR_EXPORT_ROLES: string[] = ['super_admin', 'support_agent', 'finance_officer'];
  private readonly NDPR_DELETE_ROLES: string[] = ['super_admin', 'support_agent'];
  // Identity documents are PII (NIN, licence, passport, PVC photos + selfies).
  // Only roles with a legitimate business need can reveal them. Every reveal
  // is audit-logged so ops can prove who saw what and when.
  private readonly PII_VIEW_ROLES:    string[] = ['super_admin', 'support_agent', 'driver_compliance'];

  private ensureNdprAccess(admin: any, allowed: string[], action: string) {
    const role = admin?.adminRole ?? null;
    if (!allowed.includes(role)) {
      this.logger.warn(`NDPR_ACCESS_DENIED admin=${admin?.id ?? admin?.sub} role=${role} action=${action}`);
      throw new ForbiddenException(
        `This action requires one of: ${allowed.join(', ')}. Your role: ${role ?? 'none'}.`,
      );
    }
  }

  // A32. export any user's NDPR bundle. Wraps the self-service export
  // for legal / subject-access requests where the user can't pull it.
  // Role-gated (compliance roles only) + audited so we can prove who
  // pulled which user's PII and when.
  async adminExportUserData(targetUserId: string, admin: any, ip?: string) {
    this.ensureNdprAccess(admin, this.NDPR_EXPORT_ROLES, 'ndpr_export');
    const bundle = await this.usersService.exportUserData(targetUserId);
    await this.logAudit(admin, 'ndpr_export', `user:${targetUserId}`, { fields: Object.keys(bundle ?? {}) }, ip);
    return bundle;
  }

  // A33. admin-triggered immediate hard-delete. Bypasses the 30-day
  // grace window for compliance requests the user has formally
  // escalated. Refuses on admins (use offboard) or on accounts with
  // active deliveries (would orphan a customer's package).
  // Reveal identity documents for a specific user. Called from the admin
  // dashboard when an admin explicitly requests to view PII (front/back/selfie
  // photos). Role-gated + audit-logged so we can prove exactly who viewed
  // whose ID and when. Even super_admins go through this flow so nothing
  // in the audit trail is missing.
  async revealIdentityDocs(targetUserId: string, admin: any, ip?: string) {
    this.ensureNdprAccess(admin, this.PII_VIEW_ROLES, 'pii_view');

    const identity = await this.identityRepo.findOne({
      where: { userId: targetUserId },
      order: { submittedAt: 'DESC' },
    });
    if (!identity) throw new NotFoundException('No identity verification on file for this user.');

    await this.logAudit(admin, 'pii_view', `user:${targetUserId}`, {
      identityId: identity.id,
      docType:    identity.documentType,
    }, ip);

    return {
      documentPhotoUrl:     identity.documentPhotoUrl,
      documentBackPhotoUrl: identity.documentBackPhotoUrl,
      selfiePhotoUrl:       identity.selfiePhotoUrl,
      documentExpiryDate:   identity.documentExpiryDate,
      // Client should treat these URLs as short-lived. Frontend auto-blurs
      // after 60 seconds and requires another reveal to see again.
      revealedAt: new Date().toISOString(),
    };
  }

  // Admin lists all users with a pending deletion (self- or admin-scheduled).
  // Sorted soonest-purge-first so the recycle-bin page has action items on top.
  async listPendingDeletions() {
    return this.usersService.listPendingDeletions();
  }

  /**
   * Approve or reject a driver's pending payout-bank change (2026-08-09
   * policy: replacing a bank account needs admin review within 3 business
   * days; the review ticket lives in support). PII-role gated + audited.
   */
  async resolveBankChange(targetUserId: string, approve: boolean, admin: any, ip?: string) {
    this.ensureNdprAccess(admin, this.PII_VIEW_ROLES, 'bank_change_review');
    const result = await this.paymentsService.resolveBankChange(targetUserId, approve);
    await this.logAudit(admin, approve ? 'bank_change_approved' : 'bank_change_rejected', `user:${targetUserId}`, {}, ip);
    return result;
  }

  /**
   * Approve or reject a driver's pending vehicle change (2026-08-10
   * policy: a driver always has a vehicle and cannot change it without
   * compliance approval). Same review-ticket pattern as bank changes.
   */
  async resolveVehicleChange(targetUserId: string, approve: boolean, admin: any, ip?: string) {
    this.ensureNdprAccess(admin, this.PII_VIEW_ROLES, 'vehicle_change_review');
    const result = await this.driversService.resolveVehicleChange(targetUserId, approve);
    await this.logAudit(admin, approve ? 'vehicle_change_approved' : 'vehicle_change_rejected', `user:${targetUserId}`, {}, ip);
    return result;
  }

  // Admin schedules a soft-delete on behalf of a user. Same 30-day grace as
  // self-service. Role-gated to compliance roles and audit-logged so the
  // trail matches hard-delete's paper trail.
  async adminSoftDeleteUser(targetUserId: string, admin: any, reason: string, ip?: string) {
    this.ensureNdprAccess(admin, this.NDPR_DELETE_ROLES, 'ndpr_soft_delete');
    if (!reason || reason.trim().length < 6) {
      throw new BadRequestException('Reason (min 6 chars) is required.');
    }
    const requesterId = admin?.id ?? admin?.sub;
    const result = await this.usersService.adminScheduleDeletion(targetUserId, requesterId, reason.trim());
    await this.logAudit(admin, 'soft_delete_scheduled', `user:${targetUserId}`, {
      reason:      reason.trim().slice(0, 500),
      scheduledAt: result.scheduledAt,
    }, ip);
    return result;
  }

  // Admin cancels a pending deletion. Also audit-logged so we can prove
  // who reversed the decision and when.
  async adminCancelUserDeletion(targetUserId: string, admin: any, ip?: string) {
    this.ensureNdprAccess(admin, this.NDPR_DELETE_ROLES, 'ndpr_cancel_deletion');
    const result = await this.usersService.adminCancelDeletion(targetUserId);
    await this.logAudit(admin, 'deletion_cancelled', `user:${targetUserId}`, {}, ip);
    return result;
  }

  /**
   * Re-open a completed delivery's chat for a support investigation.
   *
   * Chats auto-close for writes 1 hour after delivery (PII freeze).
   * When a user contacts support about a completed delivery, the agent
   * may need the two parties to exchange messages again (e.g. driver
   * returning an item left in the vehicle). This sets
   * delivery.chatReopenedUntil = now + `hours`, which chat.service.send
   * consults before rejecting a write.
   *
   * Restricted to PII_VIEW_ROLES (super_admin, support_agent,
   * driver_compliance) since re-opening exposes both parties' chat
   * surface again. Audit-logged with the reason + linked ticket.
   */
  async reopenDeliveryChat(
    deliveryId: string,
    admin: any,
    opts: { hours?: number; reason: string; ticketId?: string },
    ip?: string,
  ) {
    this.ensureNdprAccess(admin, this.PII_VIEW_ROLES, 'chat_reopen');
    if (!opts?.reason || opts.reason.trim().length < 6) {
      throw new BadRequestException('Reason (min 6 chars) is required.');
    }
    const delivery = await this.deliveriesRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Delivery not found.');

    // Clamp: 1 hour min, 72 hours max. Support cases resolve in days,
    // not weeks; a longer window means a longer PII re-exposure.
    const hours = Math.min(Math.max(opts.hours ?? 24, 1), 72);
    const until = new Date(Date.now() + hours * 3600_000);

    await this.deliveriesRepo.update(deliveryId, { chatReopenedUntil: until } as any);

    await this.logAudit(admin, 'chat_reopen', `delivery:${deliveryId}`, {
      hours,
      until:    until.toISOString(),
      reason:   opts.reason.trim(),
      ticketId: opts.ticketId ?? null,
    }, ip);

    return { deliveryId, chatReopenedUntil: until.toISOString(), hours };
  }

  /** Close a re-opened chat early (sets chatReopenedUntil to now). */
  async closeReopenedChat(deliveryId: string, admin: any, ip?: string) {
    this.ensureNdprAccess(admin, this.PII_VIEW_ROLES, 'chat_reopen_close');
    const delivery = await this.deliveriesRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    await this.deliveriesRepo.update(deliveryId, { chatReopenedUntil: new Date() } as any);
    await this.logAudit(admin, 'chat_reopen_close', `delivery:${deliveryId}`, {}, ip);
    return { deliveryId, closed: true };
  }

  async adminHardDeleteUser(targetUserId: string, admin: any, reason: string, ip?: string) {
    this.ensureNdprAccess(admin, this.NDPR_DELETE_ROLES, 'ndpr_hard_delete');
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
    const adminId = admin?.id ?? admin?.sub;
    this.logger.warn(`ADMIN_HARD_DELETE userId=${targetUserId} admin=${adminId} reason="${reason}"`);
    await this.logAudit(admin, 'ndpr_hard_delete', `user:${targetUserId}`, {
      reason:    reason.trim().slice(0, 500),
      accountId: user.accountId ?? null,
    }, ip);
    return { ok: true, archivedAt: new Date().toISOString() };
  }

  // ── Spec V8 §3.13. Duplicate account detection + merge (A21) ─────────────

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

  // ── Spec V8 §3.13. External partners directory (A40 + A41) ───────────────

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

    /**
     * Revenue and the platform's actual cut, both from real columns.
     *
     * commission used to be total x PLATFORM_COMMISSION, a 0.30 constant.
     * That is not what SEIRS earns: the margin is the spread between the
     * customer price and the driver's share, and both sides of that spread
     * are set by the active rate card. On the first live order (2026-08-24)
     * price was 2,609.06 and driverEarnings 1,469.68, a real cut of
     * 1,139.38, where the constant claimed 782.72. Reporting a policy
     * number from a constant is exactly what the admin-tunable rule
     * exists to prevent.
     */
    const revenueResult = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select('SUM(d.price)', 'total')
      .addSelect('SUM(COALESCE(d.driverEarnings, 0))', 'driverTotal')
      .where('d.status = :status', { status: DeliveryStatus.DELIVERED })
      .getRawOne();

    const revenueTotal = Number(revenueResult?.total ?? 0);
    const driverTotal  = Number(revenueResult?.driverTotal ?? 0);
    const commission   = +(revenueTotal - driverTotal).toFixed(2);

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
        total:          +revenueTotal.toFixed(2),
        driverShare:    +driverTotal.toFixed(2),
        commission,
        // The rate the books actually show, not a constant. Null rather
        // than a fake zero when nothing has been delivered yet, so the UI
        // can say "no data" instead of "0%".
        commissionRate: revenueTotal > 0 ? +(commission / revenueTotal).toFixed(4) : null,
      },
    };
  }

  // ── Live ops dashboard ────────────────────────────────────────────────────
  // Aggregates everything the admin needs to see the platform's current
  // pulse: driver activity, speed-of-service percentiles, anomalies that
  // need attention, and a 24-hour timeline. Called on ~30s interval from
  // the admin dashboard home; keep the total query time under ~500ms.
  async getLiveDashboard() {
    const now = new Date();
    const dayAgo  = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // ── Currently active drivers ──
    // Online = driver has isOnline flag. Busy = has an in-flight assigned
    // delivery. Idle = online minus busy. Stale = online but location not
    // updated in 10min (app is likely in pocket, count separately so ops
    // know real capacity is lower than "online" claims).
    const [onlineTotal, busyDriverCount, staleDriverCount] = await Promise.all([
      this.driversRepo.count({ where: { isOnline: true } }),
      this.deliveriesRepo
        .createQueryBuilder('d')
        .select('COUNT(DISTINCT d.driverId)', 'c')
        .where('d.status IN (:...s)', { s: [DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT] })
        .andWhere('d.driverId IS NOT NULL')
        .getRawOne()
        .then((r) => Number(r?.c ?? 0)),
      this.driversRepo
        .createQueryBuilder('d')
        .where('d.isOnline = true')
        .andWhere('(d.locationUpdatedAt IS NULL OR d.locationUpdatedAt < :cutoff)', {
          cutoff: new Date(now.getTime() - 10 * 60 * 1000),
        })
        .getCount()
        .catch(() => 0),
    ]);

    // ── Speed of service (last 24h, delivered only) ──
    // Postgres PERCENTILE_CONT on the time deltas. Nulls filtered so a
    // delivery missing a timestamp doesn't skew the median.
    const sos = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select([
        'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (d.assignedAt   - d.createdAt)))  AS accept_p50',
        'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (d.pickedUpAt   - d.assignedAt))) AS pickup_p50',
        'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (d.deliveredAt  - d.pickedUpAt))) AS drop_p50',
        'COUNT(*) AS sample',
      ])
      .where('d.status = :s', { s: DeliveryStatus.DELIVERED })
      .andWhere('d.createdAt >= :since', { since: dayAgo })
      .andWhere('d.assignedAt IS NOT NULL AND d.pickedUpAt IS NOT NULL AND d.deliveredAt IS NOT NULL')
      .getRawOne()
      .catch(() => ({ accept_p50: null, pickup_p50: null, drop_p50: null, sample: 0 }));

    // ── Anomalies (ops attention panel) ──
    // Each anomaly returns a count + the top few samples so admin can click
    // through. Kept intentionally small: 5 per bucket is enough for a
    // glance-and-act panel.
    const [stuckPending, stuckAssigned, velocityDrivers] = await Promise.all([
      // Pending > 15min = no driver has accepted this booking. Real problem.
      this.deliveriesRepo
        .createQueryBuilder('d')
        .leftJoinAndSelect('d.customer', 'c')
        .where('d.status = :s', { s: DeliveryStatus.PENDING })
        .andWhere('d.createdAt < :cut', { cut: new Date(now.getTime() - 15 * 60 * 1000) })
        .orderBy('d.createdAt', 'ASC')
        .take(5)
        .getMany()
        .catch(() => []),
      // Assigned > 30min = driver accepted but never picked up. Ghost job.
      this.deliveriesRepo
        .createQueryBuilder('d')
        .leftJoinAndSelect('d.driver', 'dr')
        .leftJoinAndSelect('dr.user', 'du')
        .where('d.status = :s', { s: DeliveryStatus.ASSIGNED })
        .andWhere('d.assignedAt < :cut', { cut: new Date(now.getTime() - 30 * 60 * 1000) })
        .orderBy('d.assignedAt', 'ASC')
        .take(5)
        .getMany()
        .catch(() => []),
      // Velocity: driver accepted >6 deliveries in the last hour. Scam signal.
      this.deliveriesRepo
        .createQueryBuilder('d')
        .select('d.driverId', 'driverId')
        .addSelect('COUNT(*)', 'accepted')
        .where('d.assignedAt >= :since', { since: hourAgo })
        .andWhere('d.driverId IS NOT NULL')
        .groupBy('d.driverId')
        .having('COUNT(*) > 6')
        .orderBy('accepted', 'DESC')
        .limit(5)
        .getRawMany()
        .catch(() => []),
    ]);

    // ── Hourly demand vs supply (last 24h) ──
    // Bookings per hour + drivers who were online (touched location) per hour.
    const hourlyBookings = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select("DATE_TRUNC('hour', d.createdAt)", 'hour')
      .addSelect('COUNT(*)', 'count')
      .where('d.createdAt >= :since', { since: dayAgo })
      .groupBy('hour')
      .orderBy('hour', 'ASC')
      .getRawMany()
      .catch(() => []);

    // ── Channel breakdown (all-time, by source) ──
    // Grouped counts by DeliverySource. Rows returned as { source, count }
    // for the admin donut. Legacy rows default to 'customer_app'.
    const channelRows = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select('d.source', 'source')
      .addSelect('COUNT(*)', 'count')
      .groupBy('d.source')
      .getRawMany()
      .catch(() => []);

    // ── Monthly target vs actual ──
    // Targets stored in platform_config; actuals summed for the current
    // calendar month. Returns pct as an integer 0-999 (can exceed 100 when
    // month is running hot - that's a feature, not a bug).
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [targetRows, monthRevenueRaw, monthDeliveryCount] = await Promise.all([
      this.configRepo.find({
        where: [
          { key: 'dashboard_target_monthly_revenue_ngn' },
          { key: 'dashboard_target_monthly_deliveries' },
        ],
      }).catch(() => []),
      this.deliveriesRepo
        .createQueryBuilder('d')
        .select('COALESCE(SUM(d.price), 0)', 'total')
        .where('d.status = :s', { s: DeliveryStatus.DELIVERED })
        .andWhere('d.createdAt >= :since', { since: monthStart })
        .getRawOne()
        .then((r) => Number(r?.total ?? 0))
        .catch(() => 0),
      this.deliveriesRepo.count({
        where: { status: DeliveryStatus.DELIVERED, createdAt: MoreThan(monthStart) as any },
      }).catch(() => 0),
    ]);
    const targetMap = new Map<string, number>(
      targetRows.map((r: any) => [String(r.key), Number(r.value) || 0] as [string, number]),
    );
    const revTarget: number = targetMap.get('dashboard_target_monthly_revenue_ngn') ?? 0;
    const delTarget: number = targetMap.get('dashboard_target_monthly_deliveries')   ?? 0;

    return {
      generatedAt: now.toISOString(),
      drivers: {
        online: onlineTotal,
        busy:   busyDriverCount,
        idle:   Math.max(0, onlineTotal - busyDriverCount),
        stale:  staleDriverCount,
      },
      speedOfService: {
        acceptSec:   sos?.accept_p50 !== null ? Math.round(Number(sos.accept_p50))  : null,
        pickupSec:   sos?.pickup_p50 !== null ? Math.round(Number(sos.pickup_p50))  : null,
        dropSec:     sos?.drop_p50   !== null ? Math.round(Number(sos.drop_p50))    : null,
        sampleSize:  Number(sos?.sample ?? 0),
      },
      anomalies: {
        pendingOver15Min: {
          count: stuckPending.length,
          items: stuckPending.map((d) => ({
            id: d.id, trackingCode: d.trackingCode,
            customerName: (d as any).customer?.name ?? null,
            waitingMin: Math.round((now.getTime() - new Date(d.createdAt).getTime()) / 60000),
          })),
        },
        assignedOver30Min: {
          count: stuckAssigned.length,
          items: stuckAssigned.map((d: any) => ({
            id: d.id, trackingCode: d.trackingCode,
            driverName: d.driver?.user?.name ?? null,
            waitingMin: d.assignedAt ? Math.round((now.getTime() - new Date(d.assignedAt).getTime()) / 60000) : null,
          })),
        },
        highVelocityDrivers: {
          count: velocityDrivers.length,
          items: velocityDrivers.map((r: any) => ({
            driverId: r.driverId, acceptedLastHour: Number(r.accepted),
          })),
        },
      },
      hourly: hourlyBookings.map((r: any) => ({
        hour: r.hour instanceof Date ? r.hour.toISOString() : String(r.hour),
        deliveries: Number(r.count),
      })),
      channels: channelRows.map((r: any) => ({
        source: String(r.source ?? DeliverySource.CUSTOMER_APP),
        count:  Number(r.count),
      })),
      targets: {
        monthlyRevenue: {
          target: revTarget,
          actual: monthRevenueRaw,
          pct:    revTarget > 0 ? Math.round((monthRevenueRaw / revTarget) * 100) : null,
        },
        monthlyDeliveries: {
          target: delTarget,
          actual: monthDeliveryCount,
          pct:    delTarget > 0 ? Math.round((monthDeliveryCount / delTarget) * 100) : null,
        },
      },
    };
  }

  // Getter + setter for the dashboard monthly targets. Kept as generic
  // key/value ops so more targets can be added without new endpoints. UI
  // uses PATCH /admin/dashboard/targets with { revenueNgn, deliveries }.
  /**
   * The monthly targets the dashboard compares actuals against.
   *
   * Only the setter existed, so the home page asked for targets and got
   * a 404 (audit 2026-08-18). Returns zeros when nothing has been set,
   * which the page reads as "no target" rather than as a failure.
   */
  /**
   * Everything needed to draw one delivery on a map.
   *
   * Pickup, every stop in order, where the driver is now, and where they
   * have actually been. Route on the admin order page was two lines of
   * text, so answering "where is my package" meant reading coordinates
   * out to somebody (founder 2026-08-19).
   *
   * No routing API is called. The planned line is drawn straight between
   * stops and the real path comes from the GPS trail SEIRS already
   * collects, because Directions and Distance Matrix are the calls that
   * cost money and neither answers where something is.
   */
  async getDeliveryRoute(deliveryId: string) {
    const d = await this.deliveriesRepo.findOne({
      where: { id: deliveryId },
      relations: ['stops', 'driver', 'driver.user'],
      order: { stops: { sequenceOrder: 'ASC' } } as any,
    });
    if (!d) throw new NotFoundException('Delivery not found.');

    const points: any[] = [];
    if (d.pickupLat != null && d.pickupLng != null) {
      points.push({
        kind: 'pickup', lat: Number(d.pickupLat), lng: Number(d.pickupLng),
        label: 'Pickup', detail: d.pickupAddress,
      });
    }

    const stops = (d as any).stops ?? [];
    if (stops.length) {
      for (const st of stops) {
        if (st.lat == null || st.lng == null) continue;
        points.push({
          kind: 'stop', lat: Number(st.lat), lng: Number(st.lng),
          label: st.packageTrackingCode ?? `Stop ${st.sequenceOrder}`,
          detail: [st.address, st.recipientName].filter(Boolean).join(' · '),
        });
      }
    } else if (d.dropoffLat != null && d.dropoffLng != null) {
      points.push({
        kind: 'stop', lat: Number(d.dropoffLat), lng: Number(d.dropoffLng),
        label: 'Drop-off', detail: d.dropoffAddress,
      });
    }

    // Live position and breadcrumb, only while there is a driver on it.
    let trail: Array<{ lat: number; lng: number }> = [];
    const driverId = (d as any).driverId ?? d.driver?.id;
    if (driverId) {
      trail = await this.dataSource.query(
        `SELECT lat::float AS lat, lng::float AS lng
           FROM gps_pings
          WHERE "deliveryId" = $1
          ORDER BY "recordedAt" ASC
          LIMIT 500`,
        [deliveryId],
      ).catch(() => []);
      const last = trail[trail.length - 1];
      if (last) {
        points.push({
          kind: 'driver', lat: last.lat, lng: last.lng,
          label: d.driver?.user?.name ?? 'Driver',
          detail: 'Last known position',
        });
      }
    }

    return {
      deliveryId,
      trackingCode: d.trackingCode,
      status:       d.status,
      driver:       d.driver ? { id: d.driver.id, name: d.driver.user?.name } : null,
      points,
      trail,
      /** True while it is worth following: stop polling once it is over. */
      live: ['assigned', 'picked_up', 'in_transit'].includes(String(d.status)),
    };
  }

  /**
   * Fill in the parts of a partner application the shopkeeper could not
   * supply themselves. Sets fields only; approval stays a human step.
   */
  async completeStoreApplication(
    storeId: string,
    patch: { lat?: number; lng?: number; storefrontPhotoUrl?: string },
  ) {
    const sets: string[] = [];
    const params: any[] = [storeId];
    if (patch.lat !== undefined && patch.lng !== undefined) {
      params.push(patch.lat, patch.lng);
      sets.push(`"storeLat" = $${params.length - 1}`, `"storeLng" = $${params.length}`);
    }
    if (patch.storefrontPhotoUrl !== undefined) {
      params.push(patch.storefrontPhotoUrl);
      sets.push(`"storefrontPhotoUrl" = $${params.length}`);
    }
    const rows = await this.dataSource.query(
      `UPDATE "partner_stores" SET ${sets.join(', ')}
        WHERE id = $1
    RETURNING id, "storeName", "storeLat", "storeLng", "storefrontPhotoUrl", status`,
      params,
    );
    if (!rows?.length) throw new NotFoundException('Partner store not found.');
    return rows[0];
  }

  async getDashboardTargets() {
    const read = async (key: string) => {
      const row = await this.configRepo.findOne({ where: { key } });
      const n = Number(row?.value);
      return Number.isFinite(n) ? n : 0;
    };
    const [revenueNgn, deliveries] = await Promise.all([
      read('dashboard_target_monthly_revenue_ngn'),
      read('dashboard_target_monthly_deliveries'),
    ]);
    return { revenueNgn, deliveries };
  }

  async setDashboardTargets(patch: { revenueNgn?: number; deliveries?: number }) {
    const upsert = async (key: string, value: number) => {
      const existing = await this.configRepo.findOne({ where: { key } });
      if (existing) {
        existing.value = String(value);
        await this.configRepo.save(existing);
      } else {
        await this.configRepo.save(this.configRepo.create({
          key,
          value: String(value),
          description: key === 'dashboard_target_monthly_revenue_ngn'
            ? 'Monthly gross revenue target in NGN, powers dashboard progress bar'
            : 'Monthly delivered-count target, powers dashboard progress bar',
          isEditable: true,
        }));
      }
    };
    if (typeof patch.revenueNgn === 'number' && patch.revenueNgn >= 0) {
      await upsert('dashboard_target_monthly_revenue_ngn', Math.floor(patch.revenueNgn));
    }
    if (typeof patch.deliveries === 'number' && patch.deliveries >= 0) {
      await upsert('dashboard_target_monthly_deliveries', Math.floor(patch.deliveries));
    }
    return { ok: true };
  }

  // ── Universal search ──────────────────────────────────────────────────────
  // Powers the admin top-bar search. Matches users by name/email/phone/SEIRS-ID,
  // drivers by name/plate, and deliveries by tracking code or price.
  // Returns a flat list of typed hits so the UI can render mixed results.
  async universalSearch(term: string, limit: number) {
    const q = term.trim();
    if (q.length < 2) return { hits: [] as SearchHit[] };

    const like = `%${q}%`;
    const takePerType = Math.max(3, Math.floor(limit / 3));

    // Users: name, email, phone, or accountId (SEIRS ID)
    const userRows = await this.usersRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.name', 'u.firstName', 'u.lastName', 'u.email', 'u.phone', 'u.role', 'u.accountId'])
      .where('u.name ILIKE :like', { like })
      .orWhere('u.firstName ILIKE :like', { like })
      .orWhere('u.lastName ILIKE :like', { like })
      .orWhere('u.email ILIKE :like', { like })
      .orWhere('u.phone ILIKE :like', { like })
      .orWhere('u.accountId ILIKE :like', { like })
      .orderBy('u.createdAt', 'DESC')
      .take(takePerType)
      .getMany()
      .catch(() => []);

    // Drivers: join to user for name/email match, or match plateNumber
    const driverRows = await this.driversRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.user', 'u')
      .where('u.name ILIKE :like', { like })
      .orWhere('u.firstName ILIKE :like', { like })
      .orWhere('u.lastName ILIKE :like', { like })
      .orWhere('u.email ILIKE :like', { like })
      .orWhere('u.phone ILIKE :like', { like })
      .orWhere('d.vehiclePlate ILIKE :like', { like })
      .orderBy('d.createdAt', 'DESC')
      .take(takePerType)
      .getMany()
      .catch(() => []);

    // Deliveries: tracking code prefix match (fast, indexed)
    const deliveryRows = await this.deliveriesRepo
      .createQueryBuilder('dv')
      .where('dv.trackingCode ILIKE :like', { like })
      .orderBy('dv.createdAt', 'DESC')
      .take(takePerType)
      .getMany()
      .catch(() => []);

    const hits: SearchHit[] = [];

    for (const u of userRows) {
      const displayName = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || '(no name)';
      hits.push({
        type:     'user',
        id:       u.id,
        label:    displayName,
        sublabel: `${u.role ?? 'customer'} · ${u.email}${u.accountId ? ` · ${u.accountId}` : ''}`,
        href:     `/users/${u.id}`,
      });
    }
    for (const d of driverRows) {
      const displayName = [d.user?.firstName, d.user?.lastName].filter(Boolean).join(' ') || d.user?.name || '(no name)';
      hits.push({
        type:     'driver',
        id:       d.id,
        label:    displayName,
        sublabel: `driver · ${d.vehicleType ?? 'unknown'}${d.vehiclePlate ? ` · ${d.vehiclePlate}` : ''}`,
        href:     `/drivers/${d.id}`,
      });
    }
    for (const dv of deliveryRows) {
      hits.push({
        type:     'delivery',
        id:       dv.id,
        label:    dv.trackingCode ?? dv.id,
        sublabel: `${dv.status} · ₦${Number(dv.price ?? 0).toLocaleString()}`,
        href:     `/deliveries?q=${encodeURIComponent(dv.trackingCode ?? dv.id)}`,
      });
    }

    /**
     * Statement codes.
     *
     * A partner or a bank rings support holding a statement and reads out
     * its code. Search covered users, drivers and deliveries and not
     * statements, so the one identifier printed on the document was the
     * one thing an agent could not look up (founder 2026-08-19).
     */
    if (/^stm/i.test(q) || q.length >= 4) {
      const stmtRows = await this.dataSource.query(
        `SELECT code, "subjectName", "subjectType", "periodFrom", "periodTo",
                "totalPaidNgn"::float AS paid
           FROM statement_records
          WHERE code ILIKE $1 OR "subjectName" ILIKE $1
          ORDER BY "createdAt" DESC
          LIMIT $2`,
        [like, takePerType],
      ).catch(() => []);
      for (const st of stmtRows as any[]) {
        const from = new Date(st.periodFrom).toISOString().slice(0, 10);
        const to   = new Date(st.periodTo).toISOString().slice(0, 10);
        hits.push({
          type:     'statement',
          id:       st.code,
          label:    st.code,
          sublabel: `${st.subjectName} · ${st.subjectType} · ${from} to ${to} · ₦${Number(st.paid ?? 0).toLocaleString()}`,
          href:     `/verify/${st.code}`,
        });
      }
    }

    return { hits: hits.slice(0, limit) };
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async getUsers(page: number, limit: number, role?: string) {
    const qb = this.usersRepo.createQueryBuilder('u')
      .orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    // Business accounts are stored as role='customer' + a businessRole
    // ('sender'/'partner') + BIZ- account id, so they were invisible in
    // the admin list (founder finding 2026-08-09). Virtual filters:
    //   role=business -> any business account
    //   role=partner  -> business accounts with the partner capability
    //   role=customer -> personal customers ONLY (business excluded)
    if (role === 'business') {
      qb.where(`(u."businessRole" IS NOT NULL OR u."accountId" LIKE 'BIZ-%')`);
    } else if (role === 'partner') {
      qb.where(`(u."businessRole" = 'partner' OR (u.capabilities ->> 'canPartner') = 'true')`);
    } else if (role === 'customer') {
      qb.where(`u.role = 'customer' AND u."businessRole" IS NULL AND u."accountId" NOT LIKE 'BIZ-%'`);
    } else if (role) {
      qb.where('u.role = :role', { role });
    }

    const [users, total] = await qb.getManyAndCount();
    return { users, total, page, limit };
  }

  async getUserDetail(id: string) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    // Batch every sub-query in parallel so the detail page opens fast even
    // with 8 aggregations per user. Every branch defaults to a safe empty
    // shape on failure so a broken sub-query never fails the whole load.
    const [
      deliveryPage,
      spentRow,
      cancelledCount,
      loyaltyBalance,
      identityLatest,
      referrer,
      referredUsers,
      relatedAccounts,
      auditRows,
      driverRow,
      fraudFlags,
    ] = await Promise.all([
      this.deliveriesRepo.findAndCount({
        where: { customer: { id } as any },
        order: { createdAt: 'DESC' },
        take: 10,
      }).catch(() => [[], 0] as any),
      this.deliveriesRepo.createQueryBuilder('d')
        .select('SUM(d.price)', 'total')
        .where('d.customer.id = :id', { id })
        .andWhere('d.status = :s', { s: DeliveryStatus.DELIVERED })
        .getRawOne()
        .catch(() => ({ total: 0 })),
      this.deliveriesRepo.count({
        where: { customer: { id } as any, status: DeliveryStatus.CANCELLED },
      }).catch(() => 0),
      this.loyaltyRepo.createQueryBuilder('lp')
        .select('COALESCE(SUM(lp.delta), 0)', 'balance')
        .where('lp.userId = :id', { id })
        .getRawOne()
        .then((r: any) => Number(r?.balance ?? 0))
        .catch(() => 0),
      this.identityRepo.findOne({
        where: { userId: id },
        order: { submittedAt: 'DESC' },
      }).catch(() => null),
      // Referrer: user whose accountId matches this user's referredByCode
      user.referredByCode
        ? this.usersRepo.findOne({
            where: { accountId: user.referredByCode },
            select: ['id', 'name', 'email', 'accountId', 'role'],
          }).catch(() => null)
        : Promise.resolve(null),
      // Users this user referred
      this.usersRepo.find({
        where: { referredByCode: user.accountId ?? '__none__' },
        select: ['id', 'name', 'email', 'accountId', 'createdAt'],
        order: { createdAt: 'DESC' },
        take: 20,
      }).catch(() => []),
      // Cross-account grouping: other accounts matching name + phone
      this.usersRepo.createQueryBuilder('u')
        .select(['u.id', 'u.name', 'u.email', 'u.phone', 'u.role', 'u.accountId'])
        .where('u.id != :id', { id })
        .andWhere('(u.name = :name OR u.phone = :phone)', {
          name: user.name ?? '__no_name__',
          phone: user.phone ?? '__no_phone__',
        })
        .orderBy('u.createdAt', 'DESC')
        .take(10)
        .getMany()
        .catch(() => []),
      // Recent audit log entries touching this user
      this.auditRepo.createQueryBuilder('a')
        .where('a.target = :target', { target: `user:${id}` })
        .orderBy('a.createdAt', 'DESC')
        .take(20)
        .getMany()
        .catch(() => []),
      // Driver record if this user has one (or ever did)
      this.driversRepo.findOne({
        where: { user: { id } as any },
      }).catch(() => null),
      // Open fraud flags on this user
      this.flagsRepo.find({
        where: { user: { id } as any },
        order: { createdAt: 'DESC' },
        take: 10,
      }).catch(() => []),
    ]);

    const [deliveries, deliveryCount] = deliveryPage as [any[], number];
    const totalSpent = Number((spentRow as any)?.total ?? 0);
    const deliveredCount = deliveries.filter((d: any) => d.status === DeliveryStatus.DELIVERED).length;

    // Loyalty tier is a derived value from the tier-thresholds table. Keep
    // this cheap and inline instead of a config lookup; if the thresholds
    // change later, adjust here or promote to a helper.
    const tier =
      loyaltyBalance >= 20000 ? 'Platinum' :
      loyaltyBalance >= 5000  ? 'Gold' :
      loyaltyBalance >= 1000  ? 'Silver' :
      'Bronze';

    return {
      user,
      deliveries,
      deliveryCount,
      totalSpent,
      cancelledCount,
      loyalty:    { balance: loyaltyBalance, tier },
      identity:   identityLatest ? {
        ...identityLatest,
        // PII redaction: document URLs stripped from the initial detail
        // response. Admin must hit POST /admin/users/:id/reveal-identity-docs
        // (role-gated + audit-logged) to actually view the images.
        documentPhotoUrl:     null,
        documentBackPhotoUrl: null,
        selfiePhotoUrl:       null,
        docsRedacted:         true,
      } : null,
      referrer,
      referredUsers,
      relatedAccounts,
      auditLog:   auditRows,
      driverRecord: driverRow,
      fraudFlags,
    };
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

    // If no password provided, generate a secure random one. they'll
    // reset via the email-link flow on first login.
    const rawPassword = data.password?.trim()
      || crypto.randomBytes(16).toString('base64url');

    /**
     * Staff get an ADM- SEIRS ID like everyone else (founder asked
     * 2026-08-13: "when i want to add a staff member how do they get
     * their seirs id"). They did not: createAdmin never set accountId,
     * so every staff account carried null.
     *
     * That broke the one-email-one-account-one-ID rule for the only
     * people whose actions most need to be traceable. Audit entries and
     * approval records name an admin, and "who is user
     * 9f3c-…-a12b" is a worse answer than ADM-XXXXXXXX when you are
     * reconstructing who published something or changed a fee.
     */
    const user = this.usersRepo.create({
      name:      fullName,
      email,
      phone:     data.phone?.trim() ?? '',
      password:  await bcrypt.hash(rawPassword, 12),
      role:      UserRole.ADMIN,
      adminRole: (data.adminRole as AdminSubRole) ?? null,
      roleId:    data.roleId ?? null,
      accountId: generateUuidAccountId(AccountIdPrefix.ADMIN),
    });
    await this.usersRepo.save(user);

    // If a roleId was passed, also email the new admin a password reset
    // link so they can set their own password on first sign-in.
    if (data.roleId || !data.password) {
      // 1 hour, not 24 (founder 2026-08-13). A staff invite is a key to
      // an account with dashboard access, and it sits in an inbox until
      // used. A day of validity is a day for it to be forwarded, synced
      // to a shared machine, or found. An hour covers "I am adding you
      // now, check your email"; anything longer is convenience bought
      // with the most privileged accounts we issue.
      this.usersRepo.update(user.id, {
        passwordResetToken:  crypto.randomBytes(32).toString('hex'),
        passwordResetExpiry: new Date(Date.now() + 3600_000),
      }).catch(() => {});
    }

    const { password: _pw, ...safe } = user as any;
    return safe;
  }

  // Role allow-list for role-mutation ops. Promotion to admin and any change
  // touching an existing admin should be super_admin only; peer flips
  // (customer <-> driver) can also be done by support_agent since they field
  // "please switch my account" tickets.
  private readonly ROLE_CHANGE_ROLES: string[] = ['super_admin', 'support_agent'];
  private readonly ADMIN_PROMOTION_ROLES: string[] = ['super_admin'];

  async changeUserRole(id: string, role: UserRole, admin: any, ip?: string) {
    const requesterId = admin?.id ?? admin?.sub;
    if (id === requesterId) throw new ConflictException('You cannot change your own role.');

    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found.');

    // Gate: promotions to admin or changes touching an existing admin need
    // super_admin. Peer flips (customer <-> driver) accept support_agent too.
    const touchesAdmin = role === UserRole.ADMIN || user.role === UserRole.ADMIN;
    const requiredRoles = touchesAdmin ? this.ADMIN_PROMOTION_ROLES : this.ROLE_CHANGE_ROLES;
    const adminRole = admin?.adminRole ?? null;
    if (!requiredRoles.includes(adminRole)) {
      this.logger.warn(
        `ROLE_CHANGE_DENIED admin=${requesterId} adminRole=${adminRole} target=${id} newRole=${role}`,
      );
      throw new ForbiddenException(
        `This role change requires one of: ${requiredRoles.join(', ')}. Your admin role: ${adminRole ?? 'none'}.`,
      );
    }

    const previousRole = user.role;
    await this.usersRepo.update(id, { role });

    // Cascade: if we're demoting a driver, suspend the drivers row so they
    // stop appearing as "approved" on the drivers list + stop receiving
    // dispatch. Flipping back later re-runs KYC intentionally.
    if (previousRole === UserRole.DRIVER && role !== UserRole.DRIVER) {
      try {
        await this.driversRepo.update(
          { user: { id } as any },
          { status: DriverStatus.SUSPENDED, isOnline: false } as any,
        );
      } catch (e: any) {
        this.logger.warn(`Driver row cascade suspend failed for user ${id}: ${e?.message ?? e}`);
      }
    }

    await this.logAudit(admin, 'role_change', `user:${id}`, {
      email: user.email,
      from:  previousRole,
      to:    role,
    }, ip);

    return this.usersRepo.findOne({ where: { id } });
  }

  // Note: the previously-planned regenerateAccountId admin endpoint was
  // removed on compliance grounds. Rotating a SEIRS ID breaks every
  // historical reference (audit logs, printed QR codes, support tickets).
  // The only sanctioned way to end up with a wrong-prefix account is:
  // NDPR hard-delete + fresh signup. See [[project_seirs_account_model]].

  // ── Drivers ───────────────────────────────────────────────────────────────

  // Query-derived compliance stats (audit 2026-08-11): honest numbers
  // from existing tables instead of waiting for dedicated columns.
  // offersToday  = job_request notifications pinged to the driver's user
  // acceptedToday = deliveries the driver took on today (Africa/Lagos day)
  // acceptance    = accepted/offers (null when no offers: no fake 100%s)
  async driverComplianceStats() {
    const rows: any[] = await this.driversRepo.manager.query(`
      SELECT d.id,
             u.name                                             AS "driverName",
             d."vehicleType",
             d.rating,
             d."isOnline",
             COALESCE(offers.cnt, 0)::int                       AS "offersToday",
             COALESCE(taken.cnt, 0)::int                        AS "acceptedToday",
             last_job."lastDeliveryAt"
        FROM drivers d
        JOIN users u ON u.id = d."userId"
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS cnt FROM notifications n
           -- Both sides cast to text on purpose. notifications."userId"
           -- is varchar and drivers."userId" is uuid, and Postgres will
           -- not compare them: this endpoint returned 500 on every call
           -- until the cast went in (2026-08-24). n.type is cast for the
           -- same class of reason, so an enum label the deployed type
           -- does not carry can never take the whole query down.
           WHERE n."userId" = d."userId"::text AND n.type::text = 'job_request'
             AND n."createdAt" >= date_trunc('day', NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'
        ) offers ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS cnt FROM deliveries dv
           WHERE dv."driverId" = d.id
             AND dv."assignedAt" >= date_trunc('day', NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'
        ) taken ON true
        LEFT JOIN LATERAL (
          SELECT MAX(dv."assignedAt") AS "lastDeliveryAt" FROM deliveries dv
           WHERE dv."driverId" = d.id
        ) last_job ON true
       ORDER BY u.name ASC
       LIMIT 200
    `);
    return {
      drivers: rows.map(r => ({
        id:               r.id,
        name:             r.driverName,
        vehicleType:      r.vehicleType,
        rating:           r.rating != null ? Number(r.rating) : null,
        isOnline:         !!r.isOnline,
        offersToday:      r.offersToday,
        acceptedToday:    r.acceptedToday,
        todayAcceptanceRate: r.offersToday > 0
          ? Math.round((r.acceptedToday / r.offersToday) * 100)
          : null,
        lastDeliveryAt:   r.lastDeliveryAt ?? null,
      })),
    };
  }

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

    // Batch every sub-query in parallel so a shallow load stays snappy even
    // as we add signals. Each branch has a safe empty fallback.
    const userId = driver.user?.id ?? null;
    const [
      deliveryPage,
      earnedRow,
      cancelledCount,
      loyaltyBalance,
      identityLatest,
      referrer,
      referredUsers,
      relatedAccounts,
      auditRows,
      fraudFlags,
    ] = await Promise.all([
      this.deliveriesRepo.findAndCount({
        where: { driver: { id } as any },
        order: { createdAt: 'DESC' },
        take: 10,
      }).catch(() => [[], 0] as any),
      this.deliveriesRepo.createQueryBuilder('d')
        .select('SUM(d.driverEarnings)', 'total')
        .where('d.driver.id = :id', { id })
        .andWhere('d.status = :s', { s: DeliveryStatus.DELIVERED })
        .getRawOne()
        .catch(() => ({ total: 0 })),
      this.deliveriesRepo.count({
        where: { driver: { id } as any, status: DeliveryStatus.CANCELLED },
      }).catch(() => 0),
      userId ? this.loyaltyRepo.createQueryBuilder('lp')
        .select('COALESCE(SUM(lp.delta), 0)', 'balance')
        .where('lp.userId = :uid', { uid: userId })
        .getRawOne()
        .then((r: any) => Number(r?.balance ?? 0))
        .catch(() => 0) : Promise.resolve(0),
      userId ? this.identityRepo.findOne({
        where: { userId },
        order: { submittedAt: 'DESC' },
      }).catch(() => null) : Promise.resolve(null),
      // Referrer (who invited this driver's user account)
      userId && driver.user?.referredByCode
        ? this.usersRepo.findOne({
            where: { accountId: driver.user.referredByCode },
            select: ['id', 'name', 'email', 'accountId', 'role'],
          }).catch(() => null)
        : Promise.resolve(null),
      // Users this driver referred
      driver.user?.accountId ? this.usersRepo.find({
        where: { referredByCode: driver.user.accountId },
        select: ['id', 'name', 'email', 'accountId', 'createdAt'],
        order: { createdAt: 'DESC' },
        take: 20,
      }).catch(() => []) : Promise.resolve([]),
      // Cross-account grouping. Other accounts with same name or phone
      userId ? this.usersRepo.createQueryBuilder('u')
        .select(['u.id', 'u.name', 'u.email', 'u.phone', 'u.role', 'u.accountId'])
        .where('u.id != :uid', { uid: userId })
        .andWhere('(u.name = :name OR u.phone = :phone)', {
          name:  driver.user?.name  ?? '__no_name__',
          phone: driver.user?.phone ?? '__no_phone__',
        })
        .orderBy('u.createdAt', 'DESC')
        .take(10)
        .getMany()
        .catch(() => []) : Promise.resolve([]),
      // Recent audit log entries touching this user
      userId ? this.auditRepo.createQueryBuilder('a')
        .where('a.target = :target', { target: `user:${userId}` })
        .orderBy('a.createdAt', 'DESC')
        .take(20)
        .getMany()
        .catch(() => []) : Promise.resolve([]),
      // Open fraud flags on the underlying user
      userId ? this.flagsRepo.find({
        where: { user: { id: userId } as any },
        order: { createdAt: 'DESC' },
        take: 10,
      }).catch(() => []) : Promise.resolve([]),
    ]);

    const [deliveries, deliveryCount] = deliveryPage as [any[], number];
    const totalEarned = Number((earnedRow as any)?.total ?? 0);

    // Identity docs get the same PII treatment as on user detail: URLs
    // stripped from the initial response, admin must hit the reveal
    // endpoint to see them.
    const identity = identityLatest ? {
      ...identityLatest,
      documentPhotoUrl:     null,
      documentBackPhotoUrl: null,
      selfiePhotoUrl:       null,
      docsRedacted:         true,
    } : null;

    const tier =
      loyaltyBalance >= 20000 ? 'Platinum' :
      loyaltyBalance >= 5000  ? 'Gold' :
      loyaltyBalance >= 1000  ? 'Silver' :
      'Bronze';

    return {
      driver,
      deliveries,
      deliveryCount,
      totalEarned,
      cancelledCount,
      loyalty:    { balance: loyaltyBalance, tier },
      identity,
      referrer,
      referredUsers,
      relatedAccounts,
      auditLog:   auditRows,
      fraudFlags,
    };
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

  /**
   * Delivery list for the admin desk.
   *
   * Loads each run's packages so a multi-package booking can be opened
   * without a second request, and accepts a free-text search so support
   * can paste whatever the person on the phone read out: a run code, a
   * single package code, an email, a name or an id (founder 2026-08-16).
   * Without this a package code found nothing at all, which is the one
   * thing a receiver actually has.
   */
  async getDeliveries(page: number, limit: number, status?: string, search?: string, kind?: string) {
    const qb = this.deliveriesRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.customer', 'customer')
      .leftJoinAndSelect('d.driver', 'driver')
      .leftJoinAndSelect('d.stops', 'stops')
      .orderBy('d.createdAt', 'DESC')
      .addOrderBy('stops.sequenceOrder', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) qb.andWhere('d.status = :status', { status });
    // Rides vs packages: two product lines, one table (founder 2026-08-23).
    if (kind === 'ride' || kind === 'package') qb.andWhere('d.kind = :kind', { kind });

    const q = (search ?? '').trim();
    if (q) {
      const like = `%${q}%`;
      qb.andWhere(`(
             d."trackingCode"          ILIKE :like
          OR stops."packageTrackingCode" ILIKE :like
          OR customer.email            ILIKE :like
          OR customer.name             ILIKE :like
          OR customer."accountId"      ILIKE :like
          OR stops."receiverFirstName" ILIKE :like
          OR CAST(d.id AS text)        = :exact
          OR CAST(customer.id AS text) = :exact
        )`, { like, exact: q });
    }

    const [deliveries, total] = await qb.getManyAndCount();
    return { deliveries, total, page, limit };
  }

  async getDeliveryDetail(id: string) {
    // Packages included: a multi-package run is meaningless on a detail
    // page without them (founder 2026-08-16).
    const d = await this.deliveriesRepo.findOne({
      where: { id },
      relations: ['customer', 'driver', 'driver.user', 'stops'],
      order: { stops: { sequenceOrder: 'ASC' } } as any,
    });
    if (!d) throw new NotFoundException('Delivery not found.');

    /**
     * The full receipt, for admin eyes only.
     *
     * A customer receipt shows what they paid and what it was for. This
     * shows where every naira went: the driver's cut, the counter's cut,
     * VAT, and what SEIRS actually kept after the processor, the postal
     * levy and the failed-delivery provision (founder 2026-08-18: the
     * admin should be able to see the full receipt breakdown).
     *
     * Never expose these splits to a sender. They are our cost model.
     */
    const payments = await this.dataSource.query(
      `SELECT "amountKobo", method, status, purpose, "escrowStatus",
              "providerReference", "flutterwaveTransactionId", "createdAt"
         FROM payments
        WHERE "deliveryId" = $1
        ORDER BY "createdAt" ASC`,
      [d.id],
    ).catch(() => []);

    const price          = Number(d.price ?? 0);
    const driverPay      = Number((d as any).driverEarnings ?? 0);
    const partnerHandling = Number((d as any).partnerHandlingNgn ?? 0);
    const collected      = (payments as any[])
      .filter(p => p.status === 'success')
      .reduce((sum, p) => sum + Number(p.amountKobo ?? 0) / 100, 0);

    const [processorPct, levyPct] = await Promise.all([
      this.feesService.getValueOr('card_processing_pct', 1.4),
      this.feesService.getValueOr('nipost_postal_fund_pct', 2),
    ]);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const processorCost = r2(price * (processorPct / 100));
    const postalLevy    = r2(price * (levyPct / 100));
    const grossMargin   = r2(price - driverPay - partnerHandling);
    const contribution  = r2(grossMargin - processorCost - postalLevy);

    return {
      ...d,
      receipt: {
        customerPaid:   price,
        actuallyCollected: r2(collected),
        driverPay,
        partnerHandling,
        processorCost,
        postalLevy,
        grossMargin,
        contribution,
        contributionPct: price > 0 ? Math.round((contribution / price) * 1000) / 10 : 0,
        unpaid:         collected <= 0,
        payments,
      },
    };
  }

  /**
   * Hand a delivery to a specific driver. This is the manual override
   * for when auto-match finds nobody, which is why the dispatcher needs
   * it reachable rather than buried (founder 2026-08-13).
   *
   * Guards added the same day. Before this it would assign a package to
   * literally any driver row: unapproved applicants who have never
   * passed KYC, and the staged demo driver whose whole purpose is to
   * never touch real work.
   */
  async manualReassign(deliveryId: string, driverId: string) {
    const driver = await this.driversRepo.findOne({
      where:     { id: driverId },
      relations: ['user'],
    });
    if (!driver) throw new NotFoundException('Driver not found.');

    if (driver.status !== DriverStatus.APPROVED) {
      throw new BadRequestException(
        `${driver.user?.name ?? 'This driver'} is not approved (${driver.status}). Approve them in Driver KYC first.`,
      );
    }
    if ((driver.user as any)?.isDemo) {
      throw new BadRequestException(
        'That is a demo account, staged for screenshots. It cannot be given a real delivery.',
      );
    }

    const delivery = await this.deliveriesRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if ([DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED].includes(delivery.status)) {
      throw new BadRequestException(`This delivery is already ${delivery.status}.`);
    }

    await this.deliveriesRepo.update(deliveryId, {
      driver,
      status:     DeliveryStatus.ASSIGNED,
      assignedAt: new Date(),
      // Manual assignment records the rider's position too, or an
      // admin-assigned job would be the one case with no accept location
      // and therefore no way to check a distance claim later.
      driverAcceptedLat: (driver as any)?.lastLat ?? null,
      driverAcceptedLng: (driver as any)?.lastLng ?? null,
    });

    this.logger.log(
      `Delivery ${delivery.trackingCode} manually assigned to driver ${driverId} by admin`,
    );

    // NOTE: the driver is not push-notified here. AdminService has no
    // NotificationsService injected, and wiring one in creates a module
    // cycle through DeliveriesModule. The driver sees the job when the
    // app polls. Worth fixing properly, but not by widening this class.

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

  async getRevenueSplit() {
    const rows = await this.deliveriesRepo.manager.query(`
      SELECT COALESCE("kind", 'package') AS kind,
             COUNT(*)::int               AS bookings,
             COALESCE(SUM("price"), 0)::float AS "grossNgn"
        FROM "deliveries"
       WHERE "paymentHeldAt" IS NOT NULL
         AND "createdAt" > NOW() - interval '7 days'
       GROUP BY COALESCE("kind", 'package')
    `);
    const get = (k: string) => rows.find((r: any) => r.kind === k) ?? { bookings: 0, grossNgn: 0 };
    return {
      windowDays: 7,
      // Kobo kept. Math.round reported the first live order as 2609
      // against a real price of 2,609.06, and the whole point of the
      // kobo rule (founder 2026-08-24) is that these figures reconcile
      // against the payment they came from.
      rides:    { bookings: Number(get('ride').bookings),    grossNgn: +Number(get('ride').grossNgn).toFixed(2) },
      packages: { bookings: Number(get('package').bookings), grossNgn: +Number(get('package').grossNgn).toFixed(2) },
    };
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

  // Spec V8. deliveries grouped by driver's vehicle type (motorcycle vs van etc.)
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

  // Spec V8. deliveries grouped by package category (using urgency as proxy
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

  // Spec V8 §2.4. total hours each top driver has been on active jobs
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

  // Spec V8 §1.13. funnel of referred users → completed first delivery
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

  // Spec V8. admin offboarding footprint. Lists what a soon-to-be-
  // offboarded admin currently owns so the super-admin can reassign
  // before deactivating. Counts only. full lists live on their
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
      action: `Revoke ${apiKeys} active API key${apiKeys === 1 ? '' : 's'} they own. apps using them will stop working.`,
    });
    if (openFraudFlags > 0) blockers.push({
      type: 'fraud_flags', count: openFraudFlags,
      action: `${openFraudFlags} fraud flag${openFraudFlags === 1 ? '' : 's'} pending their review. Reassign to another compliance reviewer.`,
    });

    return {
      adminUserId,
      ready: blockers.length === 0,
      blockers,
      auditEntries, // informational. never blocks; audit trail is retained per legal hold
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
          message: 'Cannot offboard. outstanding work to reassign first.',
          blockers: footprint.blockers,
        });
      }
    }
    /**
     * Strip permissions, do not just disable the account (founder
     * 2026-08-13): "an attacker vector could just focus on reinstating a
     * user, and if the user already have certain permissions".
     *
     * Correct, and it is the quiet way back in: a dormant account that
     * still carries super_admin needs only isActive flipped to be fully
     * live again, and reactivating a former colleague looks far more
     * innocent in a log than granting someone a new role. Wiping the
     * role means reinstatement grants nothing until a super admin
     * deliberately re-grants it, which is a decision that gets noticed.
     *
     * The previous role goes into the audit entry rather than being
     * lost, so a genuine rehire can be restored knowingly.
     */
    const outgoing = await this.usersRepo.findOne({
      where:  { id: adminUserId },
      select: ['id', 'adminRole', 'roleId'],
    });

    await this.usersRepo.update(adminUserId, {
      isActive:           false,
      deactivatedAt:      new Date(),
      deactivationReason: opts.reason ?? 'admin_offboarded',
      adminRole:          null as any,
      roleId:             null as any,
      // Kill the push token too: an offboarded account should stop
      // receiving operational notifications on a personal phone.
      fcmToken:           null as any,
    });

    await this.logAudit(requester, 'offboard_admin', `user:${adminUserId}`, {
      reason:          opts.reason,
      forced:          !!opts.force,
      revokedRole:     outgoing?.adminRole ?? null,
      revokedRoleId:   outgoing?.roleId ?? null,
    }, ip);

    return {
      message: 'Admin offboarded. Their role has been revoked: reinstating the account alone will not restore access.',
      revokedRole: outgoing?.adminRole ?? null,
    };
  }

  // TOTP setup is handled by the auth module; these are stubs
  async setupTOTP(_id: string) {
    return { message: 'TOTP setup initiated. handled by auth flow.' };
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

  /**
   * Ticket desk, unified on the SUPPORT module (2026-08-16). Two parallel
   * ticket systems shared one table: the apps wrote through the support
   * module while this desk read the legacy admin shape, so agents were
   * staring at an empty queue while real tickets piled up next to it.
   * These methods now read the canonical support entity and delegate
   * writes to SupportService, mapped to the response shape the dashboard
   * already renders.
   */
  private mapTicket(t: any, replies?: any[]) {
    return {
      id: t.id,
      subject: t.subject,
      status: t.status,
      category: t.topic,
      topic: t.topic,
      userAccountType: t.userAccountType,
      userId: t.user?.id ?? null,
      userName: t.user?.name ?? null,
      userEmail: t.user?.email ?? null,
      user: t.user ? { id: t.user.id, name: t.user.name, email: t.user.email } : undefined,
      assignedToId: t.assignedAgentId ?? null,
      linkedDeliveryId: t.linkedDeliveryId ?? null,
      lastMessageAt: t.lastMessageAt,
      resolvedAt: t.resolvedAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      ...(replies ? { replies } : {}),
    };
  }

  async getTickets(page: number, status?: string) {
    const limit = 20;
    const qb = this.ticketsRepo.createQueryBuilder('t')
      .leftJoinAndSelect('t.user', 'u')
      .orderBy('t.lastMessageAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (status) qb.andWhere('t.status = :status', { status });
    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((t) => this.mapTicket(t)), total, page, limit, hasMore: page * limit < total };
  }

  async getTicket(id: string, requester: any) {
    const { ticket, messages } = await this.supportService.getThread(id, requester);
    const ownerId = (ticket as any).user?.id;
    const replies = messages.map((m: any) => ({
      id: m.id,
      message: m.body,
      sender: m.sender && m.sender.id !== ownerId ? ('admin' as const) : ('user' as const),
      agentName: m.sender && m.sender.id !== ownerId ? m.sender?.name : undefined,
      createdAt: m.createdAt,
    }));
    const mapped = this.mapTicket(ticket, replies);
    if ((ticket as any).assignedAgentId) {
      const agent = await this.usersRepo.findOne({ where: { id: (ticket as any).assignedAgentId } });
      (mapped as any).assignedToName = agent?.name ?? null;
    }
    return mapped;
  }

  async assignTicket(id: string, agentId: string) {
    const agent = await this.usersRepo.findOne({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agent not found.');
    await this.ticketsRepo.update(id, { assignedAgentId: agentId } as any);
    const t = await this.ticketsRepo.findOne({ where: { id }, relations: ['user'] });
    if (!t) throw new NotFoundException('Ticket not found.');
    return this.mapTicket(t);
  }

  async updateTicket(
    id: string,
    data: { status?: string; resolution?: string },
    requester: any,
    ip?: string,
  ) {
    const updates: Partial<SupportTicket> = {};
    if (data.status) {
      const allowed = Object.values(TicketStatus) as string[];
      if (!allowed.includes(data.status)) throw new BadRequestException(`Unknown status: ${data.status}`);
      updates.status = data.status as TicketStatus;
      if (data.status === TicketStatus.RESOLVED) updates.resolvedAt = new Date();
    }
    await this.ticketsRepo.update(id, updates);
    await this.logAudit(requester, `ticket_${data.status}`, `ticket:${id}`, data, ip);
    const t = await this.ticketsRepo.findOne({ where: { id }, relations: ['user'] });
    if (!t) throw new NotFoundException('Ticket not found.');
    return this.mapTicket(t);
  }

  async replyToTicket(id: string, message: string, requester: any) {
    await this.supportService.agentReply(id, requester, message);
    return this.getTicket(id, requester);
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
      kind:         (dv as any).kind ?? 'package',
      trackingCode: dv.trackingCode,
      pickupLat:    Number(dv.pickupLat),
      pickupLng:    Number(dv.pickupLng),
      dropoffLat:   Number(dv.dropoffLat),
      dropoffLng:   Number(dv.dropoffLng),
      status:       dv.status,
    }));
  }

  /**
   * Partner stores for the ops-map store layer. Only rows with coords
   * are mappable; the count without coords is returned so ops knows
   * the backfill debt. Uses raw SQL to avoid importing the partner
   * module here.
   */
  async getOpsMapStores() {
    const rows: any[] = await this.deliveriesRepo.manager.query(`
      SELECT id, "storeName", "storeAddress", "storeLat", "storeLng",
             status, "acceptingNew"
        FROM partner_stores
       WHERE status IN ('approved', 'active')
    `);
    const withCoords = rows.filter(r => r.storeLat != null && r.storeLng != null);
    return {
      missingCoords: rows.length - withCoords.length,
      stores: withCoords.map(r => ({
        id:           r.id,
        storeName:    r.storeName,
        storeAddress: r.storeAddress,
        lat:          Number(r.storeLat),
        lng:          Number(r.storeLng),
        acceptingNew: !!r.acceptingNew,
      })),
    };
  }

  /**
   * Demand layer for the ops map:
   *   - pending: unassigned requests RIGHT NOW (each is a lost sale if
   *     no driver reaches it) as points with age-in-minutes
   *   - heat: pickup coordinates of every delivery created in the last
   *     24h, weighted 1 each. This is real demand density, unlike the
   *     old heat toggle which just blurred driver positions.
   */
  async getOpsMapDemand() {
    const pendingRows = await this.deliveriesRepo.find({
      where: { status: DeliveryStatus.PENDING },
      take: 300,
    });
    const dayAgo = new Date(Date.now() - 24 * 3600_000);
    const heatRows: any[] = await this.deliveriesRepo.manager.query(
      `SELECT "pickupLat", "pickupLng" FROM deliveries
        WHERE "createdAt" >= $1
          AND "pickupLat" IS NOT NULL AND "pickupLng" IS NOT NULL
        LIMIT 2000`,
      [dayAgo],
    );
    const now = Date.now();
    return {
      pending: pendingRows.map(d => ({
        id:           d.id,
        trackingCode: d.trackingCode,
        lat:          Number(d.pickupLat),
        lng:          Number(d.pickupLng),
        ageMinutes:   Math.round((now - new Date(d.createdAt).getTime()) / 60_000),
      })),
      heat: heatRows.map(r => ({ lat: Number(r.pickupLat), lng: Number(r.pickupLng) })),
    };
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

  // ── Wallet / Payouts (admin ops view) ───────────────────────────────────

  async listPendingPayouts(limit = 50) {
    const rows = await this.earningsRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.driver', 'driver')
      .where('e.status = :status', { status: 'available' })
      .orderBy('e.availableAt', 'ASC')
      .limit(limit)
      .getMany();
    return rows.map(r => ({
      id:             r.id,
      driverId:       r.driverId,
      driverName:     r.driver?.name ?? '-',
      grossAmount:    Number(r.grossAmount),
      seirsCut:       Number(r.seirsCut),
      driverNet:      Number(r.driverNet),
      availableAt:    r.availableAt,
      deliveryId:     r.deliveryId,
    }));
  }

  async listHeldEarnings(limit = 50) {
    const rows = await this.earningsRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.driver', 'driver')
      .where('e.status = :status', { status: 'held' })
      .orderBy('e.updatedAt', 'DESC')
      .limit(limit)
      .getMany();
    return rows.map(r => ({
      id:           r.id,
      driverId:     r.driverId,
      driverName:   r.driver?.name ?? '-',
      driverNet:    Number(r.driverNet),
      holdReason:   r.holdReason,
      updatedAt:    r.updatedAt,
      deliveryId:   r.deliveryId,
    }));
  }

  async releaseHeldEarning(id: string, admin: any) {
    const earning = await this.earningsRepo.findOne({ where: { id } });
    if (!earning) throw new NotFoundException('Earning row not found.');
    if (earning.status !== 'held') throw new BadRequestException('Only held earnings can be released.');
    await this.earningsRepo.update(id, { status: 'available', holdReason: null });
    await this.logAudit(admin, 'earning.release', `earning:${id}`, { previousStatus: 'held' });
    return { ok: true };
  }

  async listRecentWithdrawals(limit = 50) {
    const rows = await this.earningsRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.driver', 'driver')
      .where('e.status = :status', { status: 'paid' })
      .andWhere('e.paidAt IS NOT NULL')
      .orderBy('e.paidAt', 'DESC')
      .limit(limit)
      .getMany();
    return rows.map(r => ({
      id:                    r.id,
      driverId:              r.driverId,
      driverName:            r.driver?.name ?? '-',
      driverNet:             Number(r.driverNet),
      paidAt:                r.paidAt,
      flutterwaveTransferId: r.flutterwaveTransferId,
      deliveryId:            r.deliveryId,
    }));
  }

  async walletSummary() {
    const [pending, held, mtdPaid] = await Promise.all([
      this.earningsRepo.createQueryBuilder('e')
        .select('COALESCE(SUM(e.driverNet), 0)', 'total').addSelect('COUNT(e.id)', 'count')
        .where('e.status = :s', { s: 'available' }).getRawOne(),
      this.earningsRepo.createQueryBuilder('e')
        .select('COALESCE(SUM(e.driverNet), 0)', 'total').addSelect('COUNT(e.id)', 'count')
        .where('e.status = :s', { s: 'held' }).getRawOne(),
      this.earningsRepo.createQueryBuilder('e')
        .select('COALESCE(SUM(e.driverNet), 0)', 'total').addSelect('COUNT(e.id)', 'count')
        .where('e.status = :s', { s: 'paid' })
        .andWhere(`e.paidAt >= DATE_TRUNC('month', NOW())`).getRawOne(),
    ]);
    return {
      pendingTotal:  Number(pending?.total ?? 0),
      pendingCount:  Number(pending?.count ?? 0),
      heldTotal:     Number(held?.total ?? 0),
      heldCount:     Number(held?.count ?? 0),
      paidMtdTotal:  Number(mtdPaid?.total ?? 0),
      paidMtdCount:  Number(mtdPaid?.count ?? 0),
    };
  }

  // ── Referrals (admin view) ──────────────────────────────────────────────

  async listReferrals(limit = 100) {
    // Pair each user that signed up via a referredByCode with the user
    // whose accountId matches that code. Status is derived from the
    // referrer's existence (=credited if found, otherwise pending).
    const referred = await this.usersRepo.find({
      where:  { referredByCode: Not(undefined) },
      select: ['id', 'name', 'email', 'referredByCode', 'createdAt'],
      order:  { createdAt: 'DESC' },
      take:   limit,
    });
    const codes = referred.map(r => r.referredByCode).filter(Boolean);
    const referrers = codes.length
      ? await this.usersRepo.find({
          where: { accountId: In(codes) },
          select: ['id', 'name', 'accountId'],
        })
      : [];
    const byCode = new Map(referrers.map(r => [r.accountId, r]));
    return referred.map(r => {
      const referrer = byCode.get(r.referredByCode);
      return {
        referredId:   r.id,
        referredName: r.name,
        referredAt:   r.createdAt,
        code:         r.referredByCode,
        referrerId:   referrer?.id ?? null,
        referrerName: referrer?.name ?? null,
        status:       referrer ? 'credited' : 'pending',
      };
    });
  }

  async referralsSummary() {
    const totalRefs = await this.usersRepo
      .createQueryBuilder('u').where('u.referredByCode IS NOT NULL').getCount();
    const sinceMonth = await this.usersRepo
      .createQueryBuilder('u')
      .where('u.referredByCode IS NOT NULL')
      .andWhere(`u.createdAt >= DATE_TRUNC('month', NOW())`)
      .getCount();
    return { totalReferrals: totalRefs, monthToDate: sinceMonth };
  }

  // ── Platform Config (settings page) ─────────────────────────────────────

  private static DEFAULT_CONFIG: Array<Partial<PlatformConfig>> = [
    { key: 'platform_name',         value: 'Seirs Logistics',         description: 'Display name shown across the platform.', isEditable: false },
    { key: 'support_email',         value: 'support@seirs.co',        description: 'Public support inbox shown on website.',  isEditable: true  },
    { key: 'max_active_deliveries', value: '1000',                    description: 'Soft cap; matching pauses above this.',    isEditable: true  },
    { key: 'default_currency',      value: 'NGN',                     description: 'Settlement currency.',                     isEditable: false },
    { key: 'default_timezone',      value: 'Africa/Lagos',            description: 'Default app timezone.',                    isEditable: false },
    { key: 'maintenance_mode',      value: 'off',                     description: 'When "on", apps render maintenance UI.',   isEditable: true  },
  ];

  async listPlatformConfig() {
    const existing = await this.configRepo.find({ order: { key: 'ASC' } });
    const byKey = new Map(existing.map(r => [r.key, r]));
    // Backfill any new default key the DB hasn't seen yet so the UI
    // always renders the full set without a migration.
    const upserts: PlatformConfig[] = [];
    for (const def of AdminService.DEFAULT_CONFIG) {
      if (!byKey.has(def.key!)) {
        const row = this.configRepo.create(def);
        upserts.push(row);
      }
    }
    if (upserts.length > 0) {
      await this.configRepo.save(upserts);
      for (const r of upserts) byKey.set(r.key, r);
    }
    return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key));
  }

  async updatePlatformConfig(key: string, value: string, admin: any) {
    const row = await this.configRepo.findOne({ where: { key } });
    if (!row) throw new NotFoundException(`Unknown config key: ${key}`);
    if (!row.isEditable) throw new BadRequestException(`${key} is read-only.`);
    const previous = row.value;
    await this.configRepo.update(key, { value });
    await this.logAudit(admin, 'config.update', `config:${key}`, { previous, next: value });
    return this.configRepo.findOne({ where: { key } });
  }
}
