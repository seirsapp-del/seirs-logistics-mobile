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
import { detectStateFromCoords } from '../pricing/regions';
import { UsersService } from '../users/users.service';
import { PaymentsService } from '../payments/payments.service';
import { FeesService } from '../fees/fees.service';
import { DriversService } from '../drivers/drivers.service';
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
  /**
   * Set by AdminModule after construction, not injected.
   *
   * AdminService cannot take NotificationsService in its constructor:
   * that creates a module cycle through DeliveriesModule, which is why
   * manual assignment still does not notify the rider. The same house
   * pattern TravelBuddyModule uses for paymentsServiceRef gets the
   * account-and-security notices out of here without widening the
   * dependency graph.
   *
   * Suspension and reactivation are exactly the events a person must be
   * told about: an account going quiet with no explanation is
   * indistinguishable from the app being broken, and support then spends
   * the call establishing what the notice would have said.
   */
  accountSecurityRef?: any;

  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User)                       private usersRepo:      Repository<User>,
    @InjectRepository(ArchivedUser)               private archiveRepo:    Repository<ArchivedUser>,
    @InjectRepository(Driver)                     private driversRepo:    Repository<Driver>,
    @InjectRepository(Delivery)                   private deliveriesRepo: Repository<Delivery>,
    @InjectRepository(FraudFlag)                  private flagsRepo:      Repository<FraudFlag>,
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
  async listPendingDeletions(page = 1, limit = 50) {
    return this.usersService.listPendingDeletions(page, limit);
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
    // Name the reviewer on the change row itself, not only in the audit
    // log. A compliance question a year later ("who accepted this
    // ownership document?") is asked against the request, and
    // driver_vehicle_changes.decidedByAdminId was sitting empty.
    const result = await this.driversService.resolveVehicleChange(targetUserId, approve, {
      adminId: admin?.id ?? admin?.sub ?? undefined,
    });
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

  /**
   * Paged, with a count (2026-08-28). 200 rows and no total meant a
   * duplicate-account queue could be hiding the rest with nothing on
   * screen to say so, on a board whose entire job is catching people
   * farming sign-up bonuses across accounts.
   */
  async listDuplicates(status?: DuplicateStatus, page = 1, limit = 50) {
    const where = status ? { status } : {};
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const [items, total] = await this.duplicatesRepo.findAndCount({
      where,
      order: { matchScore: 'DESC', createdAt: 'DESC' },
      take,
      skip,
    });
    return { items, total, page: Math.max(Number(page) || 1, 1), limit: take };
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
      /**
       * Real accounts only. 25 customers and 9 drivers were nearly all
       * seeded, so the front page counted a test cohort as a business.
       * isDemo is the flag every money guard already reads.
       */
      this.usersRepo.count({ where: { role: 'customer' as any, isDemo: false } as any }),
      this.driversRepo
        .createQueryBuilder('dr')
        .leftJoin('dr.user', 'u')
        .where('COALESCE(u."isDemo", false) = false')
        .getCount(),
      this.driversRepo
        .createQueryBuilder('dr')
        .leftJoin('dr.user', 'u')
        .where('dr.status = :st', { st: DriverStatus.PENDING })
        .andWhere('COALESCE(u."isDemo", false) = false')
        .getCount(),
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
    /**
     * Revenue means money SEIRS RECEIVED, not deliveries that completed.
     *
     * This summed d.price over every DELIVERED delivery, whoever booked
     * it and whether or not anybody paid. On 2026-08-28 that put
     * 15,309.06 on the front page of the admin while the platform had
     * actually taken 2,609.06: one real payment out of fourteen rows,
     * every other one pending, and almost all of them seeded demo data.
     * A headline overstated six times over, on the first screen an
     * investor sees.
     *
     * It is the same fault the Wallet page had, which reported what
     * riders EARNED as what SEIRS SENT. Booked and banked are different
     * numbers and the dashboard has to say which one it is showing.
     *
     * Received is now the headline, read from payments that genuinely
     * reached the processor. Booked is kept beside it, clearly named, so
     * the pipeline is still visible and the gap between the two is
     * itself the useful figure: it is what is owed to SEIRS.
     */
    const revenueResult = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select('SUM(d.price)', 'total')
      .addSelect('SUM(COALESCE(d.driverEarnings, 0))', 'driverTotal')
      .where('d.status = :status', { status: DeliveryStatus.DELIVERED })
      .getRawOne();

    const bookedTotal      = Number(revenueResult?.total ?? 0);
    const bookedDriverCut  = Number(revenueResult?.driverTotal ?? 0);

    /**
     * Demo rows are excluded from every headline.
     *
     * 41 deliveries, 25 customers and 9 drivers are nearly all seeded, so
     * the front page described a test cohort rather than a business.
     * isDemo is the flag every money guard already reads, so it is the
     * honest scope here too. The demo figures are returned separately
     * rather than dropped, so a toggle can show them deliberately.
     */
    /**
     * Money is judged by whether it MOVED, never by whose account moved it.
     *
     * My first pass filtered this on isDemo alongside the people counts,
     * and it reported zero. The only payment SEIRS has ever actually
     * banked, 2,609.06 through Flutterwave, was made from a seeded
     * account because that is how the founder tested it. The naira is
     * real; the account label is not the test.
     *
     * So the demo filter belongs on counts of PEOPLE, where a seeded
     * cohort genuinely is not a customer base, and never on payments. A
     * successful charge is revenue whoever pressed the button.
     */
    const receivedRow: Array<{ total: string; cnt: string }> = await this.usersRepo.manager.query(
      `SELECT COALESCE(SUM(p."amountKobo"), 0) AS total, COUNT(*) AS cnt
         FROM "payments" p
        WHERE p.status = 'success'`,
    ).catch(() => [{ total: '0', cnt: '0' }]);

    const receivedTotal = Number(receivedRow?.[0]?.total ?? 0) / 100;
    const receivedCount = Number(receivedRow?.[0]?.cnt ?? 0);

    // Driver share of what was actually received, so commission is a
    // real margin rather than a margin on money nobody paid.
    const realCutRow: Array<{ driverTotal: string }> = await this.usersRepo.manager.query(
      `SELECT COALESCE(SUM(d."driverEarnings"), 0) AS "driverTotal"
         FROM "deliveries" d
         JOIN "payments" p ON p."deliveryId" = d.id AND p.status = 'success'`,
    ).catch(() => [{ driverTotal: '0' }]);

    const revenueTotal = receivedTotal;
    const driverTotal  = Number(realCutRow?.[0]?.driverTotal ?? 0);
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
        // Money that reached the processor. THIS is the headline.
        total:          +revenueTotal.toFixed(2),
        received:       +revenueTotal.toFixed(2),
        receivedCount,
        // Delivered but not necessarily paid, and including demo rows.
        // Named so nobody mistakes it for cash again.
        booked:         +bookedTotal.toFixed(2),
        bookedDriverShare: +bookedDriverCut.toFixed(2),
        // What has been delivered and not yet collected: the gap that
        // matters, because it is money owed to SEIRS.
        outstanding:    +Math.max(0, bookedTotal - revenueTotal).toFixed(2),
        driverShare:    +driverTotal.toFixed(2),
        commission,
        // The rate the books actually show, not a constant. Null rather
        // than a fake zero when nothing has been delivered yet, so the UI
        // can say "no data" instead of "0%".
        commissionRate: revenueTotal > 0 ? +(commission / revenueTotal).toFixed(4) : null,
      },
    };
  }

  /**
   * The work waiting, with how long it has been waiting.
   *
   * The dashboard showed queues as bare counts: "Pending KYC Reviews: 2".
   * Two from this morning and two from three weeks ago are the same
   * number and opposite problems, and an unassigned delivery forty
   * minutes old is an emergency while one forty seconds old is normal.
   * A queue without an age cannot be triaged, so an operator had to open
   * every list to find out whether anything was actually wrong.
   *
   * Each entry carries its count, the age of its OLDEST item in minutes,
   * and where to go to work it. Oldest rather than average, because the
   * thing that has been ignored longest is the thing that hurts.
   */
  async queueAges() {
    const q = async (sql: string, params: any[] = []) => {
      const r: Array<{ cnt: string; oldest: string | null }> =
        await this.usersRepo.manager.query(sql, params).catch(() => []);
      return {
        count:        Number(r?.[0]?.cnt ?? 0),
        oldestMinutes: r?.[0]?.oldest == null ? null : Math.floor(Number(r[0].oldest) / 60),
      };
    };

    const [kyc, unassigned, tickets, identity, dropReview, stuckRefunds] = await Promise.all([
      q(`SELECT COUNT(*) AS cnt, MAX(EXTRACT(EPOCH FROM (NOW() - dr."createdAt"))) AS oldest
           FROM "drivers" dr LEFT JOIN "users" u ON u.id = dr."userId"
          WHERE dr.status = 'pending' AND COALESCE(u."isDemo", false) = false`),
      q(`SELECT COUNT(*) AS cnt, MAX(EXTRACT(EPOCH FROM (NOW() - d."createdAt"))) AS oldest
           FROM "deliveries" d WHERE d.status = 'pending'`),
      q(`SELECT COUNT(*) AS cnt, MAX(EXTRACT(EPOCH FROM (NOW() - t."createdAt"))) AS oldest
           FROM "support_tickets" t
          WHERE t.status IN ('open','awaiting_agent')`),
      // identity_verifications, and the waiting state is 'submitted'
      // (UserVerificationService.adminList defaults to it), not 'pending'.
      q(`SELECT COUNT(*) AS cnt, MAX(EXTRACT(EPOCH FROM (NOW() - v."submittedAt"))) AS oldest
           FROM "identity_verifications" v WHERE v.status = 'submitted'`),
      q(`SELECT COUNT(*) AS cnt, MAX(EXTRACT(EPOCH FROM (NOW() - b."dropped_at"))) AS oldest
           FROM "seat_bookings" b
          WHERE b.status = 'dropped' AND b."drop_confirmed_at" IS NULL`),
      // Money SEIRS is holding that belongs to a customer. This one should
      // always be zero, so any age at all is the story.
      q(`SELECT COUNT(*) AS cnt, MAX(EXTRACT(EPOCH FROM (NOW() - p."createdAt"))) AS oldest
           FROM "payments" p JOIN "deliveries" d ON d.id = p."deliveryId"
          WHERE p."escrowStatus" = 'held' AND d.status IN ('cancelled','failed')`),
    ]);

    return [
      { key: 'kyc',          label: 'Driver KYC reviews',   href: '/kyc',          ...kyc,          warnAfterMin: 60 * 24 },
      { key: 'unassigned',   label: 'Unassigned deliveries', href: '/deliveries?status=pending', ...unassigned, warnAfterMin: 15 },
      { key: 'tickets',      label: 'Open support tickets', href: '/support',      ...tickets,      warnAfterMin: 60 * 4 },
      { key: 'identity',     label: 'Customer ID queue',    href: '/identity',     ...identity,     warnAfterMin: 60 * 24 },
      { key: 'dropReview',   label: 'Drops awaiting confirmation', href: '/travel-buddy', ...dropReview, warnAfterMin: 60 * 2 },
      { key: 'stuckRefunds', label: 'Refunds owed and unissued',   href: '/wallet',       ...stuckRefunds, warnAfterMin: 0 },
    ];
  }

  /**
   * The work already promised, day by day, for the week ahead.
   *
   * The dashboard could show what is happening now and what happened
   * before, and nothing at all about what SEIRS has committed to. That
   * is the wrong half of time for this business: scheduled pickups run
   * on a 5am to 9pm window, interstate trips are declared up to three
   * days ahead, and Travel Buddy seats are booked against those trips
   * days in advance. An ops manager could not answer "what is committed
   * for tomorrow?" (founder 2026-08-28: "i am suprised it does not have
   * a calender").
   *
   * Seven days including today, in Lagos time, because a day boundary
   * read in UTC puts an hour of Nigerian evening work on the wrong date.
   */
  async forwardBook(days = 7) {
    const n = Math.min(Math.max(Number(days) || 7, 1), 31);
    const rows: Array<{ day: string; scheduled: string; trips: string; seats: string }> =
      await this.usersRepo.manager.query(
        `WITH d AS (
           SELECT generate_series(
             date_trunc('day', NOW() AT TIME ZONE 'Africa/Lagos'),
             date_trunc('day', NOW() AT TIME ZONE 'Africa/Lagos') + ($1::int - 1) * INTERVAL '1 day',
             INTERVAL '1 day'
           )::date AS day
         )
         SELECT d.day::text AS day,
           (SELECT COUNT(*) FROM "deliveries" x
             WHERE x."scheduledFor" IS NOT NULL
               AND (x."scheduledFor" AT TIME ZONE 'Africa/Lagos')::date = d.day
               AND x.status NOT IN ('cancelled','failed','delivered')) AS scheduled,
           (SELECT COUNT(*) FROM "driver_trips" t
             WHERE (t."departAt" AT TIME ZONE 'Africa/Lagos')::date = d.day
               AND t.status = 'active') AS trips,
           (SELECT COUNT(*) FROM "seat_bookings" b
             JOIN "driver_trips" t2 ON t2.id = b."trip_id"
            WHERE (t2."departAt" AT TIME ZONE 'Africa/Lagos')::date = d.day
              AND b.status IN ('booked','boarded')) AS seats
         FROM d ORDER BY d.day`,
        [n],
      ).catch(() => []);

    return rows.map((r) => ({
      day:       r.day,
      scheduled: Number(r.scheduled ?? 0),
      trips:     Number(r.trips ?? 0),
      seats:     Number(r.seats ?? 0),
      total:     Number(r.scheduled ?? 0) + Number(r.trips ?? 0) + Number(r.seats ?? 0),
    }));
  }

  /**
   * When work actually happens: hour of day against day of week.
   *
   * A thirty-day revenue line shows a trend but never says WHEN, and for
   * a delivery business that is the question that decides staffing. Two
   * live policies already depend on the answer and nothing validated
   * either: riders activate at 4am, and scheduling runs 5am to 9pm.
   *
   * Bucketed in Lagos time. Demo rows are excluded because a seeded
   * cohort was created in a batch at whatever hour the seeder ran, which
   * would draw a spike at a time nobody ordered anything.
   */
  async demandByHour(daysBack = 60, includeDemo = false) {
    const n = Math.min(Math.max(Number(daysBack) || 60, 7), 365);
    const rows: Array<{ dow: string; hour: string; cnt: string }> =
      await this.usersRepo.manager.query(
        `SELECT EXTRACT(DOW  FROM (d."createdAt" AT TIME ZONE 'Africa/Lagos'))::int::text AS dow,
                EXTRACT(HOUR FROM (d."createdAt" AT TIME ZONE 'Africa/Lagos'))::int::text AS hour,
                COUNT(*) AS cnt
           FROM "deliveries" d
           LEFT JOIN "users" u ON u.id = d."customerId"
          WHERE d."createdAt" >= NOW() - ($1::int * INTERVAL '1 day')
            AND ($2::boolean OR COALESCE(u."isDemo", false) = false)
          GROUP BY 1, 2`,
        [n, includeDemo],
      ).catch(() => []);

    // Dense grid: an absent hour means nobody ordered, which is itself
    // the finding, so it must render as a zero rather than a gap.
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let peak = 0;
    for (const r of rows) {
      const dow = Number(r.dow), hour = Number(r.hour), c = Number(r.cnt ?? 0);
      if (dow >= 0 && dow < 7 && hour >= 0 && hour < 24) {
        grid[dow][hour] = c;
        if (c > peak) peak = c;
      }
    }
    /**
     * Say how much was left out, so an empty chart explains itself.
     *
     * Every delivery on the platform today was made by a demo account,
     * so this renders blank, and a blank chart with no explanation looks
     * broken rather than honest. demoAvailable lets the panel offer to
     * show the test data instead of just sitting there.
     */
    const demoRow: Array<{ cnt: string }> = await this.usersRepo.manager.query(
      `SELECT COUNT(*) AS cnt FROM "deliveries" d
         LEFT JOIN "users" u ON u.id = d."customerId"
        WHERE d."createdAt" >= NOW() - ($1::int * INTERVAL '1 day')
          AND COALESCE(u."isDemo", false) = true`,
      [n],
    ).catch(() => [{ cnt: '0' }]);

    return {
      grid, peak, daysBack: n, timezone: 'Africa/Lagos',
      includeDemo,
      demoAvailable: Number(demoRow?.[0]?.cnt ?? 0),
    };
  }

  /**
   * Where the work is, as city pairs.
   *
   * There is an ops map, but the dashboard had no sense of place at all,
   * and in Lagos where matters as much as when. Corridors are what a
   * rider actually plans around and what a zone is eventually drawn on.
   */
  async topCorridors(limit = 8, daysBack = 90, includeDemo = false) {
    const n    = Math.min(Math.max(Number(limit) || 8, 3), 20);
    const days = Math.min(Math.max(Number(daysBack) || 90, 7), 365);

    /**
     * Place comes from coordinates, not from parsing the address text.
     *
     * Delivery has no city or state column, only pickupAddress and
     * pickupLat/Lng. Splitting the address string on commas would invent
     * a second, worse notion of where things happen: Nigerian addresses
     * are not uniformly formatted, and "Ikeja" would end up as a
     * different place from "Ikeja, Lagos".
     *
     * detectStateFromCoords is the platform's own answer to that
     * question, already used by the pricing engine to decide interstate
     * surcharges, so the dashboard and the price agree about geography
     * by construction.
     */
    const rows: Array<{ plat: string; plng: string; dlat: string; dlng: string; price: string }> =
      await this.deliveriesRepo.manager.query(
        `SELECT d."pickupLat" AS plat, d."pickupLng" AS plng,
                d."dropoffLat" AS dlat, d."dropoffLng" AS dlng,
                COALESCE(d.price, 0) AS price
           FROM "deliveries" d
           LEFT JOIN "users" u ON u.id = d."customerId"
          WHERE d."createdAt" >= NOW() - ($1::int * INTERVAL '1 day')
            AND ($2::boolean OR COALESCE(u."isDemo", false) = false)
            AND d."pickupLat" IS NOT NULL AND d."dropoffLat" IS NOT NULL`,
        [days, includeDemo],
      ).catch(() => []);

    const bucket = new Map<string, { count: number; revenue: number }>();
    for (const r of rows) {
      const from = detectStateFromCoords(Number(r.plat), Number(r.plng));
      const to   = detectStateFromCoords(Number(r.dlat), Number(r.dlng));
      if (!from || !to) continue;   // offshore or a bad pin, not a corridor
      const key = from === to ? `Within ${from}` : `${from} to ${to}`;
      const cur = bucket.get(key) ?? { count: 0, revenue: 0 };
      cur.count   += 1;
      cur.revenue += Number(r.price ?? 0);
      bucket.set(key, cur);
    }

    return [...bucket.entries()]
      .map(([corridor, v]) => ({ corridor, count: v.count, revenue: +v.revenue.toFixed(2) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
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

    /**
     * The money and safety watches, added 2026-08-28.
     *
     * The panel monitored three things, all of them a delivery running
     * late, and reported "All clear" while money could be sitting in the
     * wrong place and areas could be closed. An exception feed that
     * cannot see money is not watching the thing that hurts most.
     *
     * Each of these should normally be zero, so any non-zero is the
     * story rather than a threshold to tune.
     */
    const [refundsOwed, payoutsFailed, dropsUnconfirmed, dropsOffGeofence, zonesBlocking] =
      await Promise.all([
        // Money SEIRS holds that belongs to a customer.
        this.usersRepo.manager.query(
          `SELECT COUNT(*) AS c, COALESCE(SUM(p."amountKobo"), 0) AS kobo
             FROM "payments" p JOIN "deliveries" d ON d.id = p."deliveryId"
            WHERE p."escrowStatus" = 'held' AND d.status IN ('cancelled','failed')`,
        ).catch(() => [{ c: '0', kobo: '0' }]),
        // A rider was owed and the transfer was refused.
        this.usersRepo.manager.query(
          `SELECT COUNT(*) AS c FROM "audit_logs"
            WHERE action = 'payout.declined' AND "createdAt" >= NOW() - INTERVAL '7 days'`,
        ).catch(() => [{ c: '0' }]),
        // A passenger was marked dropped and never confirmed it.
        this.usersRepo.manager.query(
          `SELECT COUNT(*) AS c FROM "seat_bookings"
            WHERE status = 'dropped' AND "drop_confirmed_at" IS NULL`,
        ).catch(() => [{ c: '0' }]),
        // Dropped far from the declared stop: allowed, but recorded.
        this.usersRepo.manager.query(
          `SELECT COUNT(*) AS c FROM "seat_bookings" WHERE "drop_off_geofence" = true`,
        ).catch(() => [{ c: '0' }]),
        // The banner the Zones spec asked for and nobody built: SEIRS is
        // not operating somewhere right now, and the dashboard says so.
        this.usersRepo.manager.query(
          `SELECT COUNT(*) AS c FROM "zones"
            WHERE published = true AND status IN ('closed','no_pickup','no_dropoff')`,
        ).catch(() => [{ c: '0' }]),
      ]);

    const moneyAndZoneAnomalies = {
      refundsOwed: {
        count: Number(refundsOwed?.[0]?.c ?? 0),
        totalNgn: +(Number(refundsOwed?.[0]?.kobo ?? 0) / 100).toFixed(2),
      },
      payoutsDeclined7d: { count: Number(payoutsFailed?.[0]?.c ?? 0) },
      dropsUnconfirmed:  { count: Number(dropsUnconfirmed?.[0]?.c ?? 0) },
      dropsOffGeofence:  { count: Number(dropsOffGeofence?.[0]?.c ?? 0) },
      zonesBlocking:     { count: Number(zonesBlocking?.[0]?.c ?? 0) },
    };

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
        // The five money and safety watches built just above. Without
        // this spread they were computed on every poll and thrown away,
        // which is exactly how the panel kept saying "All clear".
        ...moneyAndZoneAnomalies,
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

  /**
   * The users LIST. Explicit columns (2026-08-28).
   *
   * A bare createQueryBuilder selects every column of User, so this was
   * serving bank account name, number and code, date of birth, home
   * address, next of kin, device hashes, FCM token, Google and Apple
   * ids, failed login counts, lockout state and password reset expiry,
   * for twenty accounts at a time. The page draws a name, an email, a
   * phone, a role and a status.
   *
   * Password and passwordResetToken were never at risk: both are
   * select:false on the entity, which is the pattern this list should
   * have followed and did not.
   */
  async getUsers(page: number, limit: number, role?: string, search?: string) {
    const qb = this.usersRepo.createQueryBuilder('u')
      .select([
        'u.id', 'u.name', 'u.firstName', 'u.middleName', 'u.lastName',
        'u.email', 'u.phone', 'u.role', 'u.accountId', 'u.businessRole',
        'u.capabilities', 'u.isActive', 'u.isDemo', 'u.createdAt',
        'u.emailVerified', 'u.identityVerifiedAt', 'u.profilePhoto',
        'u.deactivatedAt', 'u.adminRole', 'u.roleId',
      ])
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

    /**
     * Search, which the dashboard has been sending and the server
     * discarding, exactly as it was doing for drivers (2026-08-28).
     *
     * adminApi.users() appends &search=; the controller destructured
     * only { page, limit, role }. The users page had no box to type in,
     * so nothing revealed it, but the capability was absent rather than
     * unbuilt: support hunting one customer had the global TopBar search
     * (three hits per type, a jump-to, not a list) or nothing.
     *
     * andWhere, not where: the role branches above are already on this
     * builder, and a bare .where() here would have silently discarded
     * them, turning "banned business accounts called X" into "anyone
     * called X". Alias is `u` and every column is property form, so the
     * reserved-word trap that broke driver search cannot bite here.
     */
    const q = (search ?? '').trim();
    if (q) {
      const like = `%${q}%`;
      qb.andWhere(`(
             u.name        ILIKE :like
          OR u.firstName   ILIKE :like
          OR u.lastName    ILIKE :like
          OR u.email       ILIKE :like
          OR u.phone       ILIKE :like
          OR u.accountId   ILIKE :like
          OR CAST(u.id AS text) = :exact
        )`, { like, exact: q });
    }

    const [users, total] = await qb.getManyAndCount();
    return { users, total, page, limit };
  }

  /**
   * Every SOS this person ever raised, resolved ones included.
   *
   * Symptom (founder, 2026-08-24): he resolved a real alert from a rider,
   * typed a resolution note, and it disappeared from every operator view.
   * The data was in Postgres the whole time. `GET /sos/active` filters on
   * `status = 'active'`, the admin module never touched the table, and
   * the NDPR export left it out, so a resolved alert and the note about
   * what was actually done were write-only in practice.
   *
   * A safety signal about a person that only exists in a queue nobody
   * revisits is not a safety signal. The point of showing it here is the
   * pattern: three alerts from the same rider in a month is the thing an
   * operator needs to see before deciding anything about them.
   *
   * Raw SQL because AdminService does not hold a SosAlert repository and
   * this is not the deploy to start rearranging the module graph. Names
   * are joined in so the page does not need a second round trip to turn
   * `resolvedById` into a human.
   */
  private async getSosHistoryForUser(userId: string | null) {
    if (!userId) return [];
    try {
      return await this.dataSource.query(
        `SELECT s.id, s.lat, s.lng, s.note, s.status,
                s."resolvedAt", s."resolutionNote", s."createdAt",
                s."deliveryId",
                s."resolvedById"        AS "resolvedById",
                ru.name                 AS "resolvedByName",
                d."trackingCode"        AS "deliveryTrackingCode"
           FROM sos_alerts s
           LEFT JOIN users      ru ON ru.id = s."resolvedById"
           LEFT JOIN deliveries d  ON d.id  = s."deliveryId"
          WHERE s."userId" = $1
          ORDER BY s."createdAt" DESC
          LIMIT 50`,
        [userId],
      );
    } catch (e: any) {
      // Same discipline as every other branch on these detail pages: a
      // sub-query that fails must not take the whole record down.
      this.logger.warn(`sos history lookup failed for ${userId}: ${e?.message ?? e}`);
      return [];
    }
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
      sosAlerts,
      completedCount,
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
      // Safety history, resolved alerts included. See getSosHistoryForUser.
      this.getSosHistoryForUser(id),
      /**
       * Its own COUNT, not a filter over the page above.
       *
       * `deliveries` is the first 10 rows of a findAndCount, so counting
       * DELIVERED inside it produced a number that could never exceed ten
       * however many the customer had actually completed. It was computed
       * and quietly never returned, which is the only reason nobody saw a
       * customer with 400 deliveries credited with 7.
       */
      this.deliveriesRepo.count({
        where: { customer: { id } as any, status: DeliveryStatus.DELIVERED },
      }).catch(() => 0),
    ]);

    const [deliveries, deliveryCount] = deliveryPage as [any[], number];
    const totalSpent = Number((spentRow as any)?.total ?? 0);

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
      completedCount,
      sosAlerts,
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
    /**
     * Reactivation is the only field change here worth telling somebody
     * about, and it is worth telling them a lot: an account coming back
     * silently means they discover it by trying again some days later,
     * if they bother. Read the previous value first, so the notice fires
     * on the TRANSITION rather than on every save that happens to carry
     * isActive: true.
     */
    const before = data.isActive === true
      ? await this.usersRepo.findOne({ where: { id }, select: ['id', 'isActive'] })
      : null;

    await this.usersRepo.update(id, data);

    if (before && before.isActive === false) {
      try {
        await this.accountSecurityRef?.accountReactivated?.(id);
      } catch (e: any) {
        this.logger.warn(`Reactivated ${id} but could not notify: ${e?.message ?? e}`);
      }
    }
    return this.usersRepo.findOne({ where: { id } });
  }

  /**
   * Lift or restore an account's demo flag.
   *
   * isDemo is the single flag every money guard checks: payouts, wallet
   * credits, manual assignment and dispatch all refuse a demo account,
   * because the seeded cohort carries real-looking bank details while
   * Flutterwave runs in live mode. Clearing it therefore arms an account
   * to move real money, which is why this is super-admin only, writes an
   * audit row every time, and names the actor.
   *
   * Built 2026-08-27 so the founder could run the platform's first real
   * withdrawal against a seeded rider. Restore the flag afterwards: an
   * account that looks like demo data but can touch real money is worse
   * than either one on its own.
   */
  async setUserDemoFlag(
    id: string,
    isDemo: boolean,
    actor: { id: string; name?: string },
    ip?: string,
  ): Promise<{ id: string; email: string; name: string; isDemo: boolean; previous: boolean }> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const previous = Boolean((user as any).isDemo);
    await this.usersRepo.update(id, { isDemo } as any);

    await this.auditRepo.save(this.auditRepo.create({
      adminId:   actor.id,
      adminName: actor.name ?? 'unknown',
      action:    isDemo ? 'user.demo_flag.set' : 'user.demo_flag.cleared',
      // Prefixed so it shows on the user's own admin timeline.
      target:    `user:${id}`,
      meta:      { email: user.email, name: user.name, previous, next: isDemo },
      ip:        ip ?? '',
    }));

    return {
      id,
      email: user.email,
      name:  user.name,
      isDemo,
      previous,
    };
  }

  // ── Admin management ──────────────────────────────────────────────────────

  /**
   * Staff list for ACCESS CONTROL. Explicit columns (2026-08-28).
   *
   * find() with no select returns whole User rows, so opening the staff
   * page handed every colleague's device hashes, failed login counts,
   * lockout state, date of birth, home address and bank details to
   * whoever was looking. On the one page whose subject is who can do
   * what, that is the wrong default twice over.
   */
  async getAdmins() {
    return this.usersRepo.find({
      where: { role: UserRole.ADMIN },
      order: { createdAt: 'ASC' },
      select: {
        id: true, name: true, firstName: true, lastName: true,
        email: true, phone: true, role: true, adminRole: true,
        roleId: true, isActive: true, createdAt: true,
        accountId: true, deactivatedAt: true,
        /* NOT lastLoginAt: the User entity has no such column, and never
           has. The staff page renders member.lastLoginAt, so its "last
           login" has always been blank. Recording a login timestamp is a
           real change (a write on every sign-in) and is left as its own
           decision rather than smuggled into a data-exposure fix. */
      },
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

    /**
     * A placeholder password so the row is never created without one.
     * Nobody is ever told what it is: when the creating admin does not
     * set an explicit password, this value exists only to be replaced by
     * whatever the invitee chooses through the set-password link below.
     *
     * The old comment claimed "they'll reset via the email-link flow on
     * first login" and nothing sent that email, so the honest onboarding
     * route was reading a password off a screen into WhatsApp.
     */
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

    /**
     * Send the invite. This is the whole onboarding path, so it runs for
     * EVERY new admin, not only the ones created with a roleId.
     *
     * The token used to be minted here and never sent anywhere, and the
     * write was fire-and-forget (`.catch(() => {})` on an un-awaited
     * update), so it could also lose a race with the response. It is
     * awaited now: an invite nobody can use is the same as no invite.
     *
     * 1 hour, not 24 (founder 2026-08-13). A staff invite is a key to an
     * account with dashboard access, and it sits in an inbox until used.
     * A day of validity is a day for it to be forwarded, synced to a
     * shared machine, or found. An hour covers "I am adding you now,
     * check your email"; anything longer is convenience bought with the
     * most privileged accounts we issue.
     */
    const inviteToken = crypto.randomBytes(32).toString('hex');
    await this.usersRepo.update(user.id, {
      passwordResetToken:  inviteToken,
      passwordResetExpiry: new Date(Date.now() + 3600_000),
    });

    /**
     * A failed send does not fail the creation: the account already
     * exists at this point, and throwing would leave an orphan that the
     * next attempt cannot recreate because the email is taken. The
     * creating admin is told instead, through inviteSent, so they know
     * to resend rather than assuming the new hire got an email.
     */
    let inviteSent = false;
    try {
      await this.mailService.sendAdminInvite(email, fullName, inviteToken, user.accountId);
      inviteSent = true;
    } catch (e: any) {
      this.logger.error(
        `Admin invite email failed for ${email}: ${e?.message ?? e}. ` +
        'Account exists but nobody can sign in until an invite reaches them.',
      );
    }

    // passwordResetToken is stripped alongside the hash: it is a live
    // credential for this account, and an API response is not where a
    // credential belongs.
    const { password: _pw, passwordResetToken: _tok, ...safe } = user as any;
    return { ...safe, inviteSent };
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

  /**
   * The drivers LIST. Narrow on purpose (2026-08-28).
   *
   * leftJoinAndSelect returned the whole Driver row and the whole User
   * behind it, so this endpoint was serving every driver's national ID
   * front and back, licence, selfie, guarantor letter, insurance
   * certificate, ownership proof, vehicle document, the vehicle owner's
   * ID, name and phone, plus bank account name, number and code, date
   * of birth, home address, next of kin, device hashes, FCM token and
   * lockout state. Verified live against production.
   *
   * The list renders a name, an account id, an email, a photo, a
   * vehicle type, a rating and a status. Not one document is drawn.
   *
   * KYC review is not affected: it runs on getDriverDetail, which loads
   * the relation separately and sits behind the kyc permission. That
   * separation is the whole point. Reviewing somebody's identity papers
   * should mean opening their file, not listing a page.
   */
  async getDrivers(page: number, limit: number, status?: string, search?: string) {
    /**
     * Alias is `du`, not `user`.
     *
     * `user` is a RESERVED WORD in Postgres, and TypeORM only quotes an
     * alias when it recognises the `alias.property` form. A fragment
     * like user."accountId" is not that form, so it went to the server
     * as bare user."accountId" and every search request 500'd. The join
     * carried this alias for as long as nothing filtered on it, which is
     * exactly why it surfaced the moment search started working.
     */
    const qb = this.driversRepo
      .createQueryBuilder('d')
      .leftJoin('d.user', 'du')
      .select([
        'd.id', 'd.status', 'd.isOnline', 'd.rating', 'd.totalDeliveries',
        'd.vehicleType', 'd.vehiclePlate', 'd.createdAt', 'd.lastOnlineAt',
        'd.valueLevel', 'd.locationUpdatedAt',
      ])
      .addSelect([
        'du.id', 'du.name', 'du.email', 'du.phone',
        'du.accountId', 'du.profilePhoto',
      ])
      .orderBy('d.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) qb.andWhere('d.status = :status', { status });

    /**
     * SEARCH, which the dashboard has been sending since it was written
     * and the server has been throwing away (2026-08-28).
     *
     * adminApi.drivers() appends &search=, the controller destructured
     * only { page, limit, status }, and this method never took the
     * parameter, so the term vanished at the edge with no error.
     * Verified against production: search=Emeka and search=zzzzzqqq both
     * returned all nine drivers.
     *
     * Two screens depended on it. The assign-driver dialog on a delivery
     * has a box reading "Search approved drivers by name", which did
     * nothing, so manual dispatch meant eyeballing an unfiltered list at
     * the moment somebody is waiting for a rider. The drivers page had
     * no box at all and now has one.
     *
     * Plate is in here deliberately: when a customer reports a vehicle
     * they almost never have the rider's name, they have what was
     * written on the okada.
     */
    const q = (search ?? '').trim();
    if (q) {
      const like = `%${q}%`;
      /* Property form throughout (du.accountId, not du."accountId"), so
         TypeORM quotes the alias for us and nothing reaches Postgres
         bare. */
      qb.andWhere(`(
             du.name            ILIKE :like
          OR du.email           ILIKE :like
          OR du.phone           ILIKE :like
          OR du.accountId       ILIKE :like
          OR d.vehiclePlate     ILIKE :like
          OR CAST(d.id AS text) = :exact
        )`, { like, exact: q });
    }

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
      sosAlerts,
      completedCount,
      inProgressCount,
      earningsSplit,
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
      // Safety history, resolved alerts included. See getSosHistoryForUser.
      // It matters most here: a rider raising SOS repeatedly is either in
      // real danger on a route or gaming the button, and neither is
      // visible from a queue that only shows what is open right now.
      this.getSosHistoryForUser(userId),
      /**
       * Completed runs. The profile showed total and cancelled and simply
       * had no completed figure, so the one number that says whether a
       * rider actually works was missing from the page that decides
       * whether to keep them.
       *
       * Its own COUNT rather than a filter over `deliveries`, which is
       * capped at ten rows.
       */
      this.deliveriesRepo.count({
        where: { driver: { id } as any, status: DeliveryStatus.DELIVERED },
      }).catch(() => 0),
      /**
       * In progress: everything the rider is actually holding right now.
       *
       * This page used to apologise for not having it, and the apology
       * outlived the fix: completedCount and cancelledCount WERE added,
       * so the note claiming neither existed was wrong on two of three
       * counts and stale on the third (2026-08-27).
       *
       * Counting the live statuses explicitly beats subtracting
       * completed and cancelled from the total, because that arithmetic
       * silently folds failed and returned runs into "in progress" and
       * a driver page that lies is worse than one that says nothing.
       */
      this.deliveriesRepo.count({
        where: {
          driver: { id } as any,
          status: In([
            DeliveryStatus.PENDING,
            DeliveryStatus.ASSIGNED,
            DeliveryStatus.PICKED_UP,
            DeliveryStatus.IN_TRANSIT,
          ]),
        },
      }).catch(() => 0),
      /**
       * What this rider can actually draw, and what is still cooling off.
       *
       * The driver page had a money tile with no money on it: it named
       * the earnings ledger and linked to another screen rather than
       * answering the question (founder 2026-08-27: "why is this not
       * showing his available to withdraw"). Directions are not an
       * answer when the answer is a number.
       *
       * driverId on the ledger is the USER id, which is why this reads
       * from the relation rather than the driver row's own id.
       */
      (async () => {
        if (!userId) return { available: 0, pending: 0 };
        /**
         * Entity PROPERTY names, not quoted column names.
         *
         * The first version wrote e."driverId" and SUM(e."driverNet"),
         * which are the TypeScript names. The actual columns are
         * driver_id and driver_net, so Postgres threw, the .catch
         * swallowed it, and the tile read 0.00 next to a Wallet page
         * showing 1,469.68 (founder: "it still shows he has nothing to
         * withdraw, that's false"). A catch that turns a broken query
         * into a plausible number is worse than a crash.
         *
         * Unquoted property paths let TypeORM do the mapping, which is
         * the whole point of using the QueryBuilder over raw SQL.
         */
        try {
          const rows = await this.earningsRepo
            .createQueryBuilder('e')
            .select('e.status', 'status')
            .addSelect('SUM(e.driverNet)', 'total')
            .where('e.driverId = :uid', { uid: userId })
            .groupBy('e.status')
            .getRawMany();
          const by = (st: string) =>
            Number(rows.find((r: any) => r.status === st)?.total ?? 0) || 0;
          return { available: by('available'), pending: by('pending') };
        } catch (e: any) {
          // Say so rather than returning a number that looks real.
          this.logger?.warn?.(`Earnings split failed for ${userId}: ${e?.message}`);
          return { available: 0, pending: 0 };
        }
      })(),
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
      completedCount,
      inProgressCount,
      availableNgn: earningsSplit?.available ?? 0,
      pendingNgn:   earningsSplit?.pending   ?? 0,
      sosAlerts,
      loyalty:    { balance: loyaltyBalance, tier },
      identity,
      referrer,
      referredUsers,
      relatedAccounts,
      auditLog:   auditRows,
      fraudFlags,
    };
  }

  /**
   * Change a rider's status, and RECORD WHY (2026-08-28).
   *
   * This accepted a rejectionReason, sent it in an email and discarded
   * it. The reason then existed only in the rider's inbox: no admin
   * screen could show it, a second reviewer could not see what the first
   * one objected to, and when the rider rang to ask why, whoever
   * answered could not tell them. Suspension took no reason at all.
   *
   * Now persisted with the actor and the timestamp, so the decision has
   * a record attached to the person it was made about.
   */
  async updateDriverStatus(
    id: string,
    status: string,
    rejectionReason?: string,
    actor?: { id?: string; name?: string },
    ip?: string,
  ) {
    const reason = String(rejectionReason ?? '').trim();
    await this.driversRepo.update(id, {
      status: status as DriverStatus,
      /* Keep the previous reason when a status moves for a reason nobody
         gave, rather than blanking the record of why they were rejected
         in the first place. */
      ...(reason ? { statusReason: reason.slice(0, 2000) } : {}),
      statusChangedByUserId: actor?.id ?? null,
      statusChangedAt: new Date(),
    } as any);
    const driver = await this.driversRepo.findOne({ where: { id }, relations: ['user'] });

    if (driver?.user) {
      if (status === DriverStatus.APPROVED) {
        this.mailService.sendDriverApproved(driver.user.email, driver.user.name).catch(() => {});
      } else if (status === DriverStatus.REJECTED) {
        this.mailService.sendDriverRejected(driver.user.email, driver.user.name, rejectionReason).catch(() => {});
      }
    }

    /**
     * On the rider's own admin timeline, so "why is this person
     * suspended" is answerable from their record rather than from
     * whoever remembers.
     */
    await this.auditRepo.save(this.auditRepo.create({
      adminId:   actor?.id ?? '',
      adminName: actor?.name ?? 'unknown',
      action:    `driver.${status}`,
      target:    `user:${driver?.user?.id ?? ''}`,
      meta:      { driverId: id, status, reason: reason || null },
      ip:        ip ?? '',
    })).catch((e) => this.logger.error(`driver status audit failed: ${e?.message}`));

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
    /**
     * NARROW SELECTS, and the reason is not tidiness (2026-08-28).
     *
     * This was leftJoinAndSelect on customer and driver, which selects
     * every column of both entities. Measured against production: 41
     * rows returned real bank account numbers on 9 of them, home
     * addresses on 38, and live driver GPS on 9. Also in the payload,
     * schema-wide: date of birth, next-of-kin name and phone, device
     * hashes, FCM tokens, Google and Apple ids, lockout state, and on
     * the driver every KYC document URL there is, national ID front and
     * back, licence, selfie, guarantor, insurance, plus the vehicle
     * owner's name and phone, who is frequently not the driver and
     * never consented to appear on a dispatch screen.
     *
     * The dashboard renders NONE of it. This page shows a tracking code,
     * a customer name and a status. Every one of those fields was
     * travelling to any browser that opened the list, where it sits in
     * the network tab, and /deliveries is granted to support_agent and
     * ops_manager, not just the founder. Reading a customer's bank
     * details should require going to that customer, deliberately, on a
     * page that says so.
     *
     * The columns below are exactly what the list and the reassign
     * dialog draw, nothing more. The joins stay wide enough for the
     * search clause, which filters on customer email, name and id:
     * leftJoin still lets WHERE reach a column it does not return.
     */
    const qb = this.deliveriesRepo
      .createQueryBuilder('d')
      .leftJoin('d.customer', 'customer')
      .addSelect([
        'customer.id', 'customer.name', 'customer.email',
        'customer.phone', 'customer.accountId', 'customer.isDemo',
      ])
      .leftJoin('d.driver', 'driver')
      .addSelect([
        'driver.id', 'driver.vehicleType', 'driver.vehiclePlate',
        'driver.rating', 'driver.status', 'driver.isOnline',
      ])
      /**
       * driver.user was never joined at all, so the reassign dialog's
       * "Currently with {driver.user.name}" has always rendered its
       * fallback: you could take a job off somebody without being told
       * whose job you were taking.
       */
      .leftJoin('driver.user', 'driverUser')
      .addSelect(['driverUser.id', 'driverUser.name', 'driverUser.phone'])
      .leftJoinAndSelect('d.stops', 'stops')
      .orderBy('d.createdAt', 'DESC')
      .addOrderBy('stops.sequenceOrder', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    /**
     * Virtual filters, because the three questions a dispatcher actually
     * asks are not delivery statuses (2026-08-28).
     *
     *   unassigned  pending with nobody on it. The only queue that needs
     *               a human right now, and it was mixed in with pending
     *               jobs that already have a rider on the way.
     *   disputed    the list already flags "rider reported a problem" on
     *               a row, so the flag existed and could not be filtered
     *               to: you found a complaint by scrolling past it.
     *   scheduled   a booking for later. It sits in pending looking
     *               exactly like an overdue job, so ops chase work that
     *               is not due. Same virtual-filter pattern getUsers
     *               already uses for business and partner accounts.
     */
    if (status === 'unassigned') {
      qb.andWhere('d.status = :st', { st: DeliveryStatus.PENDING })
        .andWhere('d."driverId" IS NULL');
    } else if (status === 'disputed') {
      qb.andWhere('d."disputedAt" IS NOT NULL');
    } else if (status === 'scheduled') {
      qb.andWhere('d."scheduledFor" IS NOT NULL')
        .andWhere('d."scheduledFor" > NOW()')
        .andWhere('d.status NOT IN (:...done)', {
          done: [DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED],
        });
    } else if (status) {
      qb.andWhere('d.status = :status', { status });
    }
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

    /**
     * PAGINATE ON DELIVERIES, NOT ON JOINED ROWS (2026-08-28).
     *
     * This was getManyAndCount() on a builder that leftJoinAndSelects
     * d.stops, a one-to-many. Postgres returns one row per stop, so
     * LIMIT 20 was counting STOPS, and a five-package run ate five
     * places in the page. Measured against production: page 1 returned
     * 12 rows saying total=12, page 2 returned 17 saying total=37, page
     * 3 returned 12 saying total=52. The real number is 41.
     *
     * The count being wrong was the mild half. The dashboard disables
     * Next when a page comes back short of the limit, and page 1 came
     * back short every time, so the button was dead on arrival and 29
     * of 41 deliveries could not be reached from the UI by any route.
     * On a dispatch board an unreachable job is an undispatched job.
     *
     * Fixed the standard way: page over distinct delivery ids first,
     * then load those rows whole. The id query keeps the joins the
     * filters need, because search reaches into stops and customer, and
     * COUNT(DISTINCT d.id) is what getCount() emits, so the total is
     * deliveries and not join products.
     */
    const total = await qb.getCount();

    const idRows = await qb
      .clone()
      .select('d.id', 'id')
      .addSelect('d."createdAt"', 'createdAt')
      .distinct(true)
      .orderBy('d."createdAt"', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();

    const ids = idRows.map((r: any) => r.id);
    if (ids.length === 0) return { deliveries: [], total, page, limit };

    /**
     * Second pass loads the full rows for exactly those ids, with no
     * limit, so a run with twelve packages arrives complete instead of
     * truncated at the page boundary. Re-sorted in the id order because
     * an IN () does not preserve one.
     */
    const rows = await this.deliveriesRepo
      .createQueryBuilder('d')
      .leftJoin('d.customer', 'customer')
      .addSelect([
        'customer.id', 'customer.name', 'customer.email',
        'customer.phone', 'customer.accountId', 'customer.isDemo',
      ])
      .leftJoin('d.driver', 'driver')
      .addSelect([
        'driver.id', 'driver.vehicleType', 'driver.vehiclePlate',
        'driver.rating', 'driver.status', 'driver.isOnline',
      ])
      .leftJoin('driver.user', 'driverUser')
      .addSelect(['driverUser.id', 'driverUser.name', 'driverUser.phone'])
      .leftJoinAndSelect('d.stops', 'stops')
      .where('d.id IN (:...ids)', { ids })
      .orderBy('d.createdAt', 'DESC')
      .addOrderBy('stops.sequenceOrder', 'ASC')
      .getMany();

    const order = new Map(ids.map((id: string, i: number) => [id, i]));
    const deliveries = rows.sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );

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
      /**
       * Same narrowing as the list, for the same reason (2026-08-28).
       *
       * findOne with relations loads whole entities, so this page was
       * serving the customer's bank details, date of birth, home
       * address, next of kin, device hashes and lockout state, and the
       * driver's entire KYC folder: national ID front and back,
       * licence, selfie, guarantor, insurance, ownership proof, plus
       * the vehicle owner's name and phone. A dispute or a refund is
       * the reason somebody opens this page, and none of that is
       * needed to settle one. The driver's KYC lives on Driver KYC,
       * behind its own permission, which is the point of having one.
       */
      customer: d.customer ? {
        id:        d.customer.id,
        name:      d.customer.name,
        email:     d.customer.email,
        phone:     d.customer.phone,
        accountId: d.customer.accountId,
        isDemo:    d.customer.isDemo,
      } : null,
      driver: d.driver ? {
        id:           d.driver.id,
        status:       d.driver.status,
        rating:       d.driver.rating,
        isOnline:     d.driver.isOnline,
        vehicleType:  d.driver.vehicleType,
        vehiclePlate: d.driver.vehiclePlate,
        vehiclePhotoUrl: d.driver.vehiclePhotoUrl,
        // Kept: the detail page draws the driver's last known position
        // on this delivery's map.
        lastLat: d.driver.lastLat,
        lastLng: d.driver.lastLng,
        locationUpdatedAt: d.driver.locationUpdatedAt,
        user: d.driver.user ? {
          id:    d.driver.user.id,
          name:  d.driver.user.name,
          phone: d.driver.user.phone,
          email: d.driver.user.email,
        } : null,
      } : null,
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

  /**
   * The date selector was decorative on five of seven analytics panels.
   *
   * The dashboard has 7/14/30/90 buttons that read as governing the
   * page, and only revenue and driver-hours ever took a range. The other
   * five returned all-time figures that did not move when the buttons
   * were pressed, so somebody comparing a week against a quarter was
   * reading the same numbers twice and concluding the page was broken,
   * or worse, believing them.
   *
   * `days` is optional on every one of them. Omitted means all time,
   * which is the behaviour every existing caller had, so nothing changes
   * for anyone who does not ask for a window.
   */
  private sinceFor(days?: number): Date | null {
    const n = Number(days);
    if (!Number.isFinite(n) || n <= 0) return null;
    const d = new Date();
    d.setDate(d.getDate() - Math.min(n, 3650));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  async getDeliveriesByStatus(days?: number) {
    const rows0 = this.deliveriesRepo
      .createQueryBuilder('d')
      .select('d.status', 'status')
      .addSelect('COUNT(d.id)', 'count')
      .groupBy('d.status');
    const sinceStatus = this.sinceFor(days);
    if (sinceStatus) rows0.andWhere('d.createdAt >= :since', { since: sinceStatus });
    const rows = await rows0.getRawMany();

    return rows.map(r => ({ status: r.status, count: Number(r.count) }));
  }

  /**
   * A LEADERBOARD. It has no business holding anybody's papers.
   *
   * This is an analytics endpoint behind the `analytics` permission,
   * and leftJoinAndSelect made it return every driver's full KYC folder
   * and bank details, verified live against production.
   *
   * Worse than the drivers list, because of where the rows end up:
   * Reports builds "Driver activity" straight from this array and
   * writes it to a file the operator downloads. A finance officer
   * running a routine top-50 report was exporting fifty people's
   * national ID scans, bank account numbers, dates of birth and home
   * addresses onto a laptop. That is the shape of an NDPR incident, and
   * nothing on either screen ever displayed a single one of those
   * fields.
   */
  async getTopDrivers(limit = 10, days?: number) {
    return this.driversRepo
      .createQueryBuilder('d')
      .leftJoin('d.user', 'user')
      .select([
        'd.id', 'd.rating', 'd.totalDeliveries', 'd.vehicleType', 'd.status',
      ])
      .addSelect(['user.id', 'user.name', 'user.accountId'])
      .orderBy('d.totalDeliveries', 'DESC')
      .addOrderBy('d.rating', 'DESC')
      .take(limit)
      .getMany();
  }

  // Spec V8. deliveries grouped by driver's vehicle type (motorcycle vs van etc.)
  async getDeliveriesByVehicle(days?: number) {
    const qbv = this.deliveriesRepo
      .createQueryBuilder('d')
      .leftJoin('d.driver', 'driver')
      .select('driver.vehicleType', 'vehicleType')
      .addSelect('COUNT(d.id)', 'count')
      .where('d.status = :status', { status: DeliveryStatus.DELIVERED })
      .groupBy('driver.vehicleType');
    const sinceVeh = this.sinceFor(days);
    if (sinceVeh) qbv.andWhere('d.createdAt >= :since', { since: sinceVeh });
    const rows = await qbv.getRawMany();
    return rows
      .filter(r => r.vehicleType)
      .map(r => ({ vehicleType: r.vehicleType as string, count: Number(r.count) }));
  }

  // Spec V8. deliveries grouped by package category (using urgency as proxy
  // until per-category field ships in the multi-drop e-commerce module)
  async getDeliveriesByCategory(days?: number) {
    const qbc = this.deliveriesRepo
      .createQueryBuilder('d')
      .select('d.urgency',  'category')
      .addSelect('COUNT(d.id)', 'count')
      .groupBy('d.urgency');
    const sinceCat = this.sinceFor(days);
    if (sinceCat) qbc.andWhere('d.createdAt >= :since', { since: sinceCat });
    const rows = await qbc.getRawMany();
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

  async suspendUser(id: string, requester: any, ip?: string, reason?: string) {
    await this.usersRepo.update(id, { isActive: false });
    await this.logAudit(requester, 'suspend', `user:${id}`, { reason: reason ?? null }, ip);
    // Never let a failed notice block the suspension: the safety action
    // is the point, and telling them is the courtesy that follows it.
    try {
      await this.accountSecurityRef?.accountSuspended?.(
        id, reason ?? 'Your account has been suspended by SEIRS support.',
      );
    } catch (e: any) {
      this.logger.warn(`Suspended ${id} but could not notify: ${e?.message ?? e}`);
    }
    return { message: 'User suspended.' };
  }

  // Spec V8. admin offboarding footprint. Lists what a soon-to-be-
  // offboarded admin currently owns so the super-admin can reassign
  // before deactivating. Counts only. full lists live on their
  // respective pages (tickets, fraud, cms, dev-platform/keys).
  async getAdminFootprint(adminUserId: string) {
    const mgr = this.usersRepo.manager;

    const [openTickets, apiKeys, openFraudFlags, auditEntries] = await Promise.all([
      mgr.createQueryBuilder()
        .from('support_tickets', 't')
        .where('t."assignedToId" = :uid', { uid: adminUserId })
        .andWhere('t.status IN (:...s)', { s: ['open', 'in_progress'] })
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
  /**
   * Bring an offboarded colleague back, WITHOUT giving them their old
   * powers back.
   *
   * The admins page has shipped a "Reactivate Account" button for some
   * time and the route behind it was never built, so it 404s. Adding it
   * naively would be worse than leaving it broken: offboarding
   * deliberately wipes adminRole and roleId, precisely so that
   * reinstatement grants nothing on its own. The founder named the
   * vector on 2026-08-13: "an attacker vector could just focus on
   * reinstating a user, and if the user already have certain
   * permissions." Reactivating a former colleague looks far more
   * innocent in a log than granting somebody super_admin.
   *
   * So this restores the login and nothing else. Whoever comes back can
   * sign in and see nothing until a super admin deliberately re-grants a
   * role, which is a decision that gets noticed. The audit entry records
   * that no role was restored, so the second half of the rehire is
   * visible by its absence.
   */
  async reactivateAdmin(adminUserId: string, requester: any, ip?: string) {
    const target = await this.usersRepo.findOne({
      where:  { id: adminUserId },
      select: ['id', 'name', 'email', 'isActive', 'adminRole', 'roleId'],
    });
    if (!target) throw new NotFoundException('Admin not found');
    if (target.isActive) {
      return { message: 'That account is already active.', roleRestored: false };
    }

    await this.usersRepo.update(adminUserId, {
      isActive:           true,
      deactivatedAt:      null as any,
      deactivationReason: null as any,
      // adminRole and roleId are deliberately NOT touched. See above.
    });

    await this.logAudit(requester, 'reactivate_admin', `user:${adminUserId}`, {
      email:        target.email,
      roleRestored: false,
      // Null here is the point: it says out loud that the account came
      // back with no powers, so a later grant is a separate, visible act.
      currentRole:  target.adminRole ?? null,
    }, ip);

    try {
      await this.accountSecurityRef?.accountReactivated?.(adminUserId);
    } catch (e: any) {
      this.logger.warn(`Reactivated admin ${adminUserId} but could not notify: ${e?.message ?? e}`);
    }

    return {
      message: target.adminRole
        ? 'Account reactivated.'
        : 'Account reactivated with no role. Grant one before they can do anything.',
      roleRestored: false,
      hasRole: !!target.adminRole,
    };
  }

  /**
   * Force a password reset on a staff account.
   *
   * The button existed and the route did not. This does not set a
   * password or return one: it invalidates the current one and starts
   * the normal reset flow, so no plaintext credential is ever created,
   * logged, or read over a phone by whoever pressed the button.
   */
  async resetAdminPassword(adminUserId: string, requester: any, ip?: string) {
    const target = await this.usersRepo.findOne({
      where:  { id: adminUserId },
      select: ['id', 'name', 'email'],
    });
    if (!target?.email) throw new NotFoundException('Admin not found');

    /**
     * Invalidate the current password AND issue a reset in one step.
     *
     * Invalidating alone would lock somebody out with no way back, and
     * issuing a link alone leaves the old password working while a
     * laptop is missing, which is the case this button exists for. Both,
     * in that order.
     *
     * No plaintext credential is created, returned or logged, so nobody
     * has to read a password down a phone line.
     */
    // bcryptjs, already imported at the top of this file. The package is
    // bcryptjs and not bcrypt: reaching for the wrong one compiles in an
    // editor and fails at build.
    const { randomBytes, randomUUID } = await import('crypto');
    const unusable = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
    const token = randomUUID();
    const expiry = new Date(Date.now() + 60 * 60 * 1000);

    await this.usersRepo.update(adminUserId, {
      password:            unusable,
      passwordResetToken:  token,
      passwordResetExpiry: expiry,
    } as any);

    await this.logAudit(requester, 'reset_admin_password', `user:${adminUserId}`, {
      email: target.email,
      // The token is deliberately absent: an audit row a reader can use
      // to take over the account is not an audit row.
      expiresAt: expiry.toISOString(),
    }, ip);

    try {
      await this.mailService.sendPasswordReset(
        target.email, target.name ?? 'there', token, 'admin',
      );
    } catch (e: any) {
      this.logger.warn(`Password invalidated for ${adminUserId} but the reset email failed: ${e?.message ?? e}`);
    }

    return {
      message: 'Their password no longer works. A reset link has been emailed to them.',
    };
  }

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

  /**
   * Transfers that actually left, read from the payout ledger.
   *
   * This listed EARNING rows marked paid and reported driverNet as the
   * transfer amount. driverNet is what the rider earned, not what SEIRS
   * sent, and the two differ by the new-rider holdback: the first real
   * payout moved 1,322.71 and this screen showed 1,469.68 against it
   * (founder, 2026-08-27). The row count was wrong in the same way, one
   * line per earning rather than per transfer, so a single withdrawal
   * settling three deliveries read as three transfers.
   *
   * driver_payouts records one row per transfer with the amount actually
   * sent. Older payouts predate that table, so the earnings-derived view
   * is kept as a labelled fallback rather than silently showing nothing:
   * those rows carry `estimated: true` and should not be reconciled
   * against the bank without checking the Flutterwave reference.
   */
  async listRecentWithdrawals(limit = 50) {
    try {
      const payouts: Array<any> = await this.earningsRepo.manager.query(
        `SELECT p.*, u."name" AS "userName"
           FROM "driver_payouts" p
           LEFT JOIN "users" u ON u.id = p."driver_id"
          ORDER BY p."created_at" DESC
          LIMIT $1`,
        [limit],
      );
      if (payouts.length > 0) {
        return payouts.map((p) => ({
          id:                    p.id,
          driverId:              p.driver_id,
          driverName:            p.userName ?? p.driver_name ?? '-',
          sentNgn:               Number(p.sent_ngn),
          requestedNgn:          Number(p.requested_ngn),
          holdbackNgn:           Number(p.holdback_ngn ?? 0),
          // Kept so existing dashboard columns keep rendering, but it now
          // carries what was SENT rather than what was earned.
          driverNet:             Number(p.sent_ngn),
          paidAt:                p.created_at,
          reference:             p.reference,
          flutterwaveTransferId: p.flutterwave_transfer_id,
          earningCount:          Number(p.earning_count ?? 0),
          estimated:             false,
        }));
      }
    } catch {
      // Table not created yet on this deploy: fall through.
    }

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
      sentNgn:               Number(r.driverNet),
      paidAt:                r.paidAt,
      flutterwaveTransferId: r.flutterwaveTransferId,
      deliveryId:            r.deliveryId,
      // This figure is what the rider EARNED. If a holdback applied, less
      // than this reached the bank.
      estimated:             true,
    }));
  }

  /**
   * Record what actually left the bank, for a payout made before the
   * ledger existed (founder, 2026-08-28).
   *
   * driver_payouts records one row per transfer with the real amount
   * sent. Payouts made before that table shipped have no row, so the
   * dashboard falls back to summing EARNINGS, and an earning is what a
   * rider was owed, not what SEIRS transferred. On the first real payout
   * the rider earned 1,469.68, a 10% new-rider holdback kept 146.97, and
   * 1,322.71 reached the bank. The board showed 1,469.68 under "sent",
   * labelled "not confirmed sent" precisely because it could not know.
   *
   * The number is NOT inferred here. Deriving it as earned minus the
   * holdback percentage would usually be right and would be a guess
   * about money, and a guess that reconciles is worse than a gap that
   * does not, because it stops anybody looking. So an admin reads the
   * real figure off Flutterwave and enters it, and the row is written
   * under their name.
   *
   * The unique index on reference is what stops the same transfer being
   * recorded twice.
   */
  async reconcilePayout(
    body: {
      earningId: string;
      sentNgn: number;
      holdbackNgn?: number;
      flutterwaveTransferId?: string;
    },
    actor: any,
    ip?: string,
  ) {
    const earning = await this.earningsRepo.findOne({
      where: { id: body.earningId },
      relations: ['driver'],
    });
    if (!earning)                  throw new NotFoundException('No such earning.');
    if (earning.status !== 'paid') throw new BadRequestException('That earning has not been paid out.');

    const earned = Number(earning.driverNet ?? 0);
    const sent   = Number(body.sentNgn);
    if (!Number.isFinite(sent) || sent < 0) {
      throw new BadRequestException('Enter the amount that actually reached the bank.');
    }
    if (sent > earned + 0.01) {
      throw new BadRequestException(
        `That is more than the rider earned on this payout (${earned.toFixed(2)}). Check the figure.`,
      );
    }
    const holdback = body.holdbackNgn != null
      ? Number(body.holdbackNgn)
      : Math.round((earned - sent) * 100) / 100;

    const reference = `RECON-${earning.id}`;
    const existing = await this.earningsRepo.manager.query(
      `SELECT id FROM "driver_payouts" WHERE "reference" = $1 LIMIT 1`, [reference],
    ).catch(() => []);
    if (existing?.length) {
      throw new BadRequestException('This payout has already been reconciled.');
    }

    await this.earningsRepo.manager.query(
      `INSERT INTO "driver_payouts"
         ("driver_id","driver_name","requested_ngn","sent_ngn","holdback_ngn",
          "reference","flutterwave_transfer_id","earning_count","created_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        earning.driverId,
        earning.driver?.name ?? null,
        earned.toFixed(2),
        sent.toFixed(2),
        holdback.toFixed(2),
        reference,
        body.flutterwaveTransferId ?? earning.flutterwaveTransferId ?? null,
        1,
        earning.paidAt ?? new Date(),
      ],
    );

    await this.logAudit(actor, 'payout.reconciled', `user:${earning.driverId}`, {
      earningId: earning.id, earned, sent, holdback,
      flutterwaveTransferId: body.flutterwaveTransferId ?? earning.flutterwaveTransferId ?? null,
    }, ip);

    return { ok: true, earned, sent, holdback, reference };
  }

  /**
   * Credit a rider's earnings balance to correct a settlement error.
   *
   * There was no way to put money back. Earnings could be held and
   * released, but nothing could restore an amount the platform had taken
   * and failed to send, so the first such case had no remedy inside the
   * product at all: the new-rider holdback was marked paid and never
   * transferred, and Emeka Nwachukwu was left owed 146.97 with the only
   * options being a hand-written SQL statement or nothing.
   *
   * Deliberately narrow, because an endpoint that mints rider earnings
   * is a way to move real money:
   *   - super admin only
   *   - a reason is required and stored, so no correction is anonymous
   *   - capped, so a typo cannot create a fortune
   *   - lands as `available`, never `paid`, so it flows through the
   *     normal payout path and its own guards
   *   - writes an audit row naming the actor, the rider and the reason
   *
   * This is a correction tool, not a bonus tool. Anything promotional
   * belongs in the loyalty ledger where it can be capped and expired.
   */
  async creditEarningCorrection(
    driverUserId: string,
    amountNgn: number,
    reason: string,
    admin: any,
    ip?: string,
  ) {
    const MAX_CORRECTION_NGN = 100_000;

    const amount = Number(amountNgn);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive number.');
    }
    if (amount > MAX_CORRECTION_NGN) {
      throw new BadRequestException(
        `Corrections are capped at ₦${MAX_CORRECTION_NGN.toLocaleString()}. Raise this deliberately in code if a larger one is ever genuinely needed.`,
      );
    }
    const cleanReason = (reason ?? '').trim();
    if (cleanReason.length < 10) {
      throw new BadRequestException('Give a reason of at least 10 characters. It is stored on the row.');
    }

    const user = await this.usersRepo.findOne({ where: { id: driverUserId } });
    if (!user) throw new NotFoundException('User not found');

    // Reuse the rider's most recent earning for the delivery link, which
    // the column requires. The correction belongs to that settlement.
    const [recent] = await this.earningsRepo.find({
      where: { driverId: driverUserId } as any,
      order: { createdAt: 'DESC' },
      take: 1,
    });
    if (!recent) {
      throw new BadRequestException('This rider has no earnings history to attach a correction to.');
    }

    const rounded = Math.round(amount * 100) / 100;
    const draft = this.earningsRepo.create({
      driverId:    driverUserId,
      deliveryId:  recent.deliveryId,
      grossAmount: '0',
      seirsCut:    '0',
      driverNet:   rounded.toFixed(2),
      status:      'available' as const,
      availableAt: new Date(),
      holdReason:  `Correction by ${admin?.name ?? 'admin'}: ${cleanReason}`,
    });
    const row = await this.earningsRepo.save(draft as DriverEarning);

    await this.logAudit(
      admin,
      'earning.correction',
      `user:${driverUserId}`,
      { amountNgn: rounded, reason: cleanReason, earningId: row.id, riderName: user.name },
      ip,
    );

    return {
      ok: true,
      earningId: row.id,
      driverUserId,
      riderName: user.name,
      amountNgn: rounded,
      reason: cleanReason,
    };
  }

  /**
   * Refunds that were owed and never issued.
   *
   * refundEscrow used to swallow a Flutterwave failure and stamp
   * REFUNDED anyway, so a declined refund left the customer out of
   * pocket while the row said their money was back. That now leaves the
   * escrow HELD instead, which is truthful and retryable, but only
   * helps if somebody can see it: both callers catch the error and log,
   * so nothing surfaces on its own.
   *
   * A payment still HELD against a delivery that is cancelled or failed
   * is money SEIRS is sitting on that belongs to a customer. That is the
   * query, and it should be empty.
   */
  async stuckRefunds(limit = 100) {
    const rows: Array<any> = await this.usersRepo.manager.query(
      `SELECT p.id,
              p."amountKobo",
              p."escrowStatus",
              p."providerReference",
              p."flutterwaveTransactionId",
              p."createdAt",
              d.id            AS "deliveryId",
              d."trackingCode",
              d.status        AS "deliveryStatus",
              u.id            AS "customerId",
              u.name          AS "customerName",
              u.email         AS "customerEmail"
         FROM "payments" p
         JOIN "deliveries" d ON d.id = p."deliveryId"
         LEFT JOIN "users" u ON u.id = d."customerId"
        WHERE p."escrowStatus" = 'held'
          AND d.status IN ('cancelled', 'failed')
        ORDER BY p."createdAt" DESC
        LIMIT $1`,
      [limit],
    ).catch(() => []);

    return rows.map((r) => ({
      paymentId:      r.id,
      amountNgn:      Number(r.amountKobo ?? 0) / 100,
      deliveryId:     r.deliveryId,
      trackingCode:   r.trackingCode,
      deliveryStatus: r.deliveryStatus,
      customerId:     r.customerId,
      customerName:   r.customerName ?? '-',
      customerEmail:  r.customerEmail ?? null,
      providerReference:        r.providerReference,
      flutterwaveTransactionId: r.flutterwaveTransactionId,
      heldSince:      r.createdAt,
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

    /**
     * Paid Out reads the payout ledger, not the earnings rows.
     *
     * Summing driverNet over paid earnings answers "how much did riders
     * earn on the jobs we settled", which is a different question from
     * "how much money left SEIRS" whenever a holdback applied. The first
     * real payout sent 1,322.71 and this reported 1,469.68. The count
     * was wrong too: it counted earning rows, so one withdrawal settling
     * three deliveries showed as three transfers.
     */
    let paidMtdTotal = Number(mtdPaid?.total ?? 0);
    let paidMtdCount = Number(mtdPaid?.count ?? 0);
    let paidMtdEstimated = true;
    try {
      const row = await this.earningsRepo.manager.query(
        `SELECT COALESCE(SUM("sent_ngn"), 0) AS total, COUNT(*) AS count
           FROM "driver_payouts"
          WHERE "created_at" >= DATE_TRUNC('month', NOW())`,
      );
      if (row?.[0] && Number(row[0].count) > 0) {
        paidMtdTotal     = Number(row[0].total);
        paidMtdCount     = Number(row[0].count);
        paidMtdEstimated = false;
      }
    } catch {
      // Ledger table absent on this deploy: keep the earnings-derived figure.
    }

    return {
      pendingTotal:  Number(pending?.total ?? 0),
      pendingCount:  Number(pending?.count ?? 0),
      heldTotal:     Number(held?.total ?? 0),
      heldCount:     Number(held?.count ?? 0),
      paidMtdTotal,
      paidMtdCount,
      // False once the ledger is answering. While true, the figure is what
      // riders earned on settled jobs, which can exceed what was sent.
      paidMtdEstimated,
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
