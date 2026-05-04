import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository, IsNull, Not, LessThan } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User } from './user.entity';
import { ArchivedUser } from './archived-user.entity';

const ARCHIVE_GRACE_DAYS = 30;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)         private repo:        Repository<User>,
    @InjectRepository(ArchivedUser) private archiveRepo: Repository<ArchivedUser>,
  ) {}

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  async updateFcmToken(userId: string, token: string) {
    await this.repo.update(userId, { fcmToken: token });
  }

  async updateProfile(userId: string, data: Partial<Pick<User, 'name' | 'phone' | 'profilePhoto'>>) {
    await this.repo.update(userId, data);
    return this.findById(userId);
  }

  // Spec V8 — NDPR right to erasure. Soft-delete first (isActive=false +
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
    if (!ok) throw new BadRequestException('Password did not match — account not deleted.');

    // Spec V8 — driver-specific pre-flight check via raw queries (so we
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

  // ── Archive cron — runs daily at 3am ──────────────────────────────────
  // Finds users that have been soft-deleted past the grace window and
  // moves a reduced record to archived_users, then hard-deletes from
  // the main table. Idempotent — running it twice is safe because
  // already-archived users are gone from `users` after the first pass.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async archiveExpiredAccounts() {
    const cutoff = new Date(Date.now() - ARCHIVE_GRACE_DAYS * 24 * 60 * 60 * 1000);
    const expired = await this.repo.find({
      where: {
        isActive:      false,
        deactivatedAt: LessThan(cutoff),
      },
      take: 200, // batch — large purges happen across multiple runs
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
  // Spec V8 NDPR Article 24 — right to data portability. Returns a
  // JSON-serialisable bundle of everything this user owns. Heavy —
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
        'Free-text fields may contain PII of other parties (recipient names, addresses) — handle accordingly.',
        'Audit log entries about your account remain in our system for legal compliance.',
      ],
    };
  }
}
