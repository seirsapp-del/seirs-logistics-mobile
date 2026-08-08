import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository, IsNull, Not, LessThan, MoreThan } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User } from './user.entity';
import { ArchivedUser } from './archived-user.entity';
import { UserProfileAudit, ProfileFieldName } from './user-profile-audit.entity';

const ARCHIVE_GRACE_DAYS = 30;

// Cool-downs (ms) per field. Higher friction on phone since it doubles as
// a recovery channel; profile photo is nearly-free but still rate-limited
// at the controller level. Fields not listed here have no cool-down.
// e.g. emergencyContact (safety trumps friction) and homeAddress.
//
// dateOfBirth uses a sentinel `Infinity` because it's LOCKED once set:
// admins can override via a separate admin-only endpoint, users cannot
// change it themselves.
const COOLDOWN_MS: Partial<Record<ProfileFieldName, number>> = {
  name:         30 * 24 * 60 * 60 * 1000,        // legacy. 30 days
  firstName:    30 * 24 * 60 * 60 * 1000,        // 30 days
  middleName:   30 * 24 * 60 * 60 * 1000,        // 30 days
  lastName:     30 * 24 * 60 * 60 * 1000,        // 30 days
  phone:        90 * 24 * 60 * 60 * 1000,        // 90 days
  profilePhoto:  1 * 24 * 60 * 60 * 1000,        // 1 day
  dateOfBirth:  Number.POSITIVE_INFINITY,        // LOCKED once set (admin override only)
};

// Fields exposed to updateProfile for the "did anything change?" comparison.
// Order matters for audit log readability.
const EDITABLE_FIELDS: ProfileFieldName[] = [
  'firstName', 'middleName', 'lastName', 'dateOfBirth',
  'name', 'phone', 'profilePhoto',
  'emergencyContactName', 'emergencyContactPhone', 'homeAddress',
];

interface UpdateContext {
  actorRole:   'self' | 'admin';
  actorUserId?: string | null;
  ipAddress?:  string | null;
  userAgent?:  string | null;
  adminReason?: string | null;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)              private repo:         Repository<User>,
    @InjectRepository(ArchivedUser)      private archiveRepo:  Repository<ArchivedUser>,
    @InjectRepository(UserProfileAudit)  private auditRepo:    Repository<UserProfileAudit>,
  ) {}

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  async updateFcmToken(userId: string, token: string) {
    await this.repo.update(userId, { fcmToken: token });
  }

  /**
   * Update a user's editable profile fields with cool-downs + audit trail.
   *
   * Per-field cool-downs enforced for self-initiated changes (name 30d,
   * phone 90d, photo 1d, DOB locked-after-first-set). Admin overrides
   * skip cool-downs but require ctx.actorRole = 'admin' + adminReason.
   *
   * Auto-composes the legacy `name` column from firstName + lastName
   * when either is set (backwards-compat with older clients).
   *
   * Only writes audit entries for fields that actually changed. Same
   * value re-submission is a no-op.
   */
  async updateProfile(
    userId: string,
    // Input shape mirrors UpdateProfileDto (dateOfBirth arrives as ISO
    // string from JSON; converted to Date below before persist).
    data: {
      name?:                  string;
      firstName?:             string;
      middleName?:            string;
      lastName?:              string;
      dateOfBirth?:           string | Date;
      phone?:                 string;
      profilePhoto?:          string;
      emergencyContactName?:  string;
      emergencyContactPhone?: string;
      homeAddress?: {
        label:   string;
        street:  string;
        city:    string;
        state:   string;
        coords?: { lat: number; lng: number } | null;
      };
    },
    ctx: UpdateContext = { actorRole: 'self' },
  ) {
    const current = await this.repo.findOne({ where: { id: userId } });
    if (!current) throw new NotFoundException('Account not found');

    // Auto-compose legacy `name` from firstName + lastName if the caller
    // sent split-name fields but not the legacy field.
    const composed = { ...data };
    if ((composed.firstName || composed.lastName) && !composed.name) {
      const first = composed.firstName ?? current.firstName ?? '';
      const last  = composed.lastName  ?? current.lastName  ?? '';
      const auto  = `${first} ${last}`.trim();
      if (auto) composed.name = auto;
    }

    // Convert DOB string → Date (DTO validated it's ISO, TypeORM wants Date)
    if (typeof composed.dateOfBirth === 'string') {
      composed.dateOfBirth = new Date(composed.dateOfBirth) as any;
    }

    // Diff against current record. Uses JSON compare so nested objects
    // (homeAddress) don't false-positive on reference change.
    const changes: Array<{
      field:    ProfileFieldName;
      oldValue: any;
      newValue: any;
    }> = [];
    for (const field of EDITABLE_FIELDS) {
      if ((composed as any)[field] === undefined) continue;
      const newValue = (composed as any)[field] ?? null;
      const oldValue = (current as any)[field] ?? null;
      if (jsonEqual(newValue, oldValue)) continue;
      changes.push({ field, oldValue, newValue });
    }
    if (changes.length === 0) return current;

    // Enforce cool-downs + special rules for self-initiated changes
    if (ctx.actorRole === 'self') {
      for (const { field, oldValue, newValue } of changes) {
        // DOB is LOCKED once set. users cannot change it via self-service.
        if (field === 'dateOfBirth' && oldValue !== null && oldValue !== undefined) {
          throw new BadRequestException(
            'Date of birth is locked once set. Contact support if you need to correct a typo.',
          );
        }
        // DOB age gate on FIRST set (13–120 years old)
        if (field === 'dateOfBirth' && newValue) {
          const dob = new Date(newValue);
          const age = ageInYears(dob);
          if (age < 13) throw new BadRequestException('You must be at least 13 years old to set a date of birth.');
          if (age > 120) throw new BadRequestException('Please enter a real date of birth.');
        }

        const cooldownMs = COOLDOWN_MS[field];
        if (cooldownMs == null || cooldownMs === 0) continue;         // no cool-down for this field
        if (cooldownMs === Number.POSITIVE_INFINITY) continue;        // handled above (DOB)

        const cutoff = new Date(Date.now() - cooldownMs);
        const recentChange = await this.auditRepo.findOne({
          where: {
            userId,
            field,
            actorRole: 'self',
            createdAt: MoreThan(cutoff) as any,
          },
          order: { createdAt: 'DESC' },
        });
        if (recentChange) {
          const daysAgo = Math.ceil((Date.now() - recentChange.createdAt.getTime()) / (24 * 60 * 60 * 1000));
          const daysRemaining = Math.max(1, Math.ceil(cooldownMs / (24 * 60 * 60 * 1000)) - daysAgo);
          throw new BadRequestException(
            `${labelFor(field)} was changed ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago. You can change it again in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}, or contact support if you need it changed sooner.`,
          );
        }
      }
    }

    // Persist all changes in a single update
    const patch: any = {};
    for (const { field, newValue } of changes) patch[field] = newValue;
    await this.repo.update(userId, patch);

    // Write one audit row per changed field
    await this.auditRepo.save(
      changes.map(({ field, oldValue, newValue }) =>
        this.auditRepo.create({
          userId,
          field,
          oldValue: serialiseForAudit(oldValue),
          newValue: serialiseForAudit(newValue),
          actorRole:   ctx.actorRole,
          actorUserId: ctx.actorUserId ?? null,
          ipAddress:   ctx.ipAddress   ?? null,
          userAgent:   ctx.userAgent   ?? null,
          adminReason: ctx.adminReason ?? null,
        }),
      ),
    );

    return this.findById(userId);
  }

  /**
   * Return the user's own audit log. self-service, they can see exactly
   * what changed and when. Limited to the last 50 entries; extend if the
   * UI ever needs full history (paginate then).
   */
  async getProfileAudit(userId: string) {
    return this.auditRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take:  50,
      // Hide raw IP + userAgent from user-facing endpoint. those are
      // for admin abuse review, not consumer display.
      select: ['id', 'field', 'oldValue', 'newValue', 'actorRole', 'adminReason', 'createdAt'],
    });
  }

  async updateNotificationPrefs(userId: string, prefs: Record<string, boolean>) {
    const existing = await this.repo.findOne({ where: { id: userId } });
    const merged = { ...(existing?.notificationPrefs ?? {}), ...prefs };
    await this.repo.update(userId, { notificationPrefs: merged });
    return { prefs: merged };
  }

  // Spec V8. NDPR right to erasure. Soft-delete first (isActive=false +
  // deactivatedAt timestamp) so we keep audit trails for any pending
  // disputes; the daily cron below hard-deletes after the 30-day grace
  // window and migrates a reduced PII record to archived_users.
  async deleteAccount(userId: string, password: string, reason?: string) {
    const user = await this.repo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.id = :id', { id: userId })
      .getOne();
    if (!user) throw new NotFoundException('Account not found');
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new BadRequestException('Password did not match. account not deleted.');

    // Spec V8. driver-specific pre-flight check via raw queries (so we
    // don't pull DriversService into UsersModule and create a cycle).
    // Drivers can't delete with active deliveries or non-zero wallet.
    if (user.role === 'driver') {
      const mgr = this.repo.manager;
      const driverRow = await mgr
        .createQueryBuilder()
        .select(['d.id AS id', 'd."walletBalance" AS balance'])
        .from('drivers', 'd')
        .where('d."userId" = :uid', { uid: userId })
        .getRawOne();
      if (driverRow) {
        const activeCount = await mgr
          .createQueryBuilder()
          .from('deliveries', 'd')
          .where('d."driverId" = :did', { did: driverRow.id })
          .andWhere('d.status IN (:...statuses)', {
            statuses: ['assigned', 'picked_up', 'in_transit'],
          })
          .getCount()
          .catch(() => 0);
        if (activeCount > 0) {
          throw new BadRequestException(
            `You have ${activeCount} active deliver${activeCount === 1 ? 'y' : 'ies'}. Complete them or contact ops to reassign before deleting.`,
          );
        }
        const balance = Number(driverRow.balance ?? 0);
        if (balance > 0) {
          throw new BadRequestException(
            `Withdraw your ₦${Math.round(balance).toLocaleString()} wallet balance before deleting your account.`,
          );
        }
      }
    }

    await this.repo.update(userId, {
      isActive:           false,
      deactivatedAt:      new Date(),
      deactivationReason: reason ?? 'self_deleted',
    });
    return {
      message: `Account scheduled for deletion. You have ${ARCHIVE_GRACE_DAYS} days to cancel by signing in again.`,
    };
  }

  // ── Archive cron. runs daily at 3am ──────────────────────────────────
  // Finds users that have been soft-deleted past the grace window and
  // moves a reduced record to archived_users, then hard-deletes from
  // the main table. Idempotent. running it twice is safe because
  // already-archived users are gone from `users` after the first pass.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async archiveExpiredAccounts() {
    const cutoff = new Date(Date.now() - ARCHIVE_GRACE_DAYS * 24 * 60 * 60 * 1000);
    const expired = await this.repo.find({
      where: {
        isActive:      false,
        deactivatedAt: LessThan(cutoff),
      },
      take: 200, // batch. large purges happen across multiple runs
    });

    if (expired.length === 0) {
      this.logger.debug('Archive cron: no expired accounts');
      return;
    }

    let archived = 0;
    for (const user of expired) {
      try {
        const emailHash = crypto.createHash('sha256').update(user.email.toLowerCase()).digest('hex');
        await this.archiveRepo.save(this.archiveRepo.create({
          originalUserId:    user.id,
          emailHash,
          accountId:         user.accountId ?? null,
          role:              user.role,
          reason:            user.deactivationReason ?? 'expired',
          originalCreatedAt: user.createdAt,
          deactivatedAt:     user.deactivatedAt!,
        }));
        await this.repo.delete(user.id);
        archived++;
      } catch (err: any) {
        this.logger.error(`Archive failed for user ${user.id}: ${err.message}`);
      }
    }
    this.logger.log(`Archive cron: archived ${archived} of ${expired.length} expired accounts`);
  }

  // ── Data export ───────────────────────────────────────────────────────
  // Spec V8 NDPR Article 24. right to data portability. Returns a
  // JSON-serialisable bundle of everything this user owns. Heavy.
  // typically called once per user when they request export, then
  // emailed as a downloadable file.
  async exportUserData(userId: string) {
    const user = await this.repo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Account not found');

    // Pull related data via raw queries to avoid eager-loading a lot of
    // entities here. Each one is a separate query so we can swap to
    // streaming later for larger payloads.
    const mgr = this.repo.manager;
    const deliveriesAsCustomer = await mgr
      .createQueryBuilder()
      .from('deliveries', 'd')
      .where('d.customerId = :uid', { uid: userId })
      .getRawMany().catch(() => []);
    const deliveriesAsDriver = await mgr
      .createQueryBuilder()
      .from('deliveries', 'd')
      .leftJoin('drivers', 'dr', 'dr.id = d.driverId')
      .where('dr.userId = :uid', { uid: userId })
      .getRawMany().catch(() => []);
    const payments = await mgr
      .createQueryBuilder()
      .from('payments', 'p')
      .where('p.userId = :uid', { uid: userId })
      .getRawMany().catch(() => []);
    const dropoffs = await mgr
      .createQueryBuilder()
      .from('store_dropoffs', 'sd')
      .where('sd.senderUserId = :uid OR sd.recipientUserId = :uid', { uid: userId })
      .getRawMany().catch(() => []);
    const handoffs = await mgr
      .createQueryBuilder()
      .from('handoff_records', 'h')
      .where('h.fromUserId = :uid OR h.toUserId = :uid', { uid: userId })
      .getRawMany().catch(() => []);

    return {
      generatedAt: new Date().toISOString(),
      profile: {
        id:           user.id,
        accountId:    user.accountId,
        name:         user.name,
        email:        user.email,
        phone:        user.phone,
        role:         user.role,
        profilePhoto: user.profilePhoto,
        emailVerified: user.emailVerified,
        createdAt:    user.createdAt,
        updatedAt:    user.updatedAt,
      },
      deliveries: {
        asCustomer: deliveriesAsCustomer,
        asDriver:   deliveriesAsDriver,
      },
      payments,
      storeDropoffs:   dropoffs,
      handoffRecords:  handoffs,
      notes: [
        'This export is yours per NDPR Article 24 (right to data portability).',
        'Free-text fields may contain PII of other parties (recipient names, addresses). handle accordingly.',
        'Audit log entries about your account remain in our system for legal compliance.',
      ],
    };
  }
}

// ── Helpers for updateProfile ────────────────────────────────────────────────

function jsonEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == b;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) return String(a) === String(b);
  if (typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

function ageInYears(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

function labelFor(field: ProfileFieldName): string {
  switch (field) {
    case 'name':                  return 'Name';
    case 'firstName':             return 'First name';
    case 'middleName':            return 'Middle name';
    case 'lastName':              return 'Last name';
    case 'dateOfBirth':           return 'Date of birth';
    case 'phone':                 return 'Phone number';
    case 'profilePhoto':          return 'Profile photo';
    case 'emergencyContactName':  return 'Emergency contact name';
    case 'emergencyContactPhone': return 'Emergency contact phone';
    case 'homeAddress':           return 'Home address';
  }
}

function serialiseForAudit(v: any): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
