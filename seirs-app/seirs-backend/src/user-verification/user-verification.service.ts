import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository, Between } from 'typeorm';
import { IdentityVerification, VerificationStatus } from './user-verification.entity';
import { SubmitIdentityDto } from './dto/submit-verification.dto';
import { User } from '../users/user.entity';
import { AccountSecurityService } from '../notifications/account-security.service';

const SUBMIT_COOLDOWN_MS = 60 * 60 * 1000;   // 1 hour between submissions (anti-spam)

/**
 * User (customer) identity verification service.
 *
 * Distinct from driver KYC (which lives on the Driver entity) and from
 * the delivery handoff-OTP flow (in ../identity/). This one is about
 * a customer OPTIONALLY upgrading their trust tier by uploading a
 * government ID + selfie for admin review.
 */
@Injectable()
export class UserVerificationService {
  private readonly logger = new Logger(UserVerificationService.name);

  constructor(
    @InjectRepository(IdentityVerification)
    private readonly repo: Repository<IdentityVerification>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly security: AccountSecurityService,
  ) {}

  // ── User self-service ─────────────────────────────────────────────────

  async submit(userId: string, dto: SubmitIdentityDto) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Account not found');

    if (user.identityVerifiedAt) {
      throw new BadRequestException('Your identity is already verified. no need to re-submit.');
    }

    const latest = await this.repo.findOne({
      where: { userId },
      order: { submittedAt: 'DESC' },
    });

    if (latest?.status === 'submitted') {
      throw new BadRequestException(
        'You already have a submission being reviewed. Please wait 24 hours to 3 business days for the result.',
      );
    }

    if (latest && latest.submittedAt.getTime() > Date.now() - SUBMIT_COOLDOWN_MS) {
      const minutesAgo = Math.ceil((Date.now() - latest.submittedAt.getTime()) / (60 * 1000));
      const minutesLeft = 60 - minutesAgo;
      throw new BadRequestException(
        `Please wait ${minutesLeft} more minute${minutesLeft === 1 ? '' : 's'} before submitting again.`,
      );
    }

    // Optional documentExpiryDate. Only meaningful for licence/passport/PVC.
    // Reject anything already-expired at submission time so users don't wait
    // for admin review only to be rejected for staleness.
    let expiryDate: Date | null = null;
    if (dto.documentExpiryDate) {
      expiryDate = new Date(dto.documentExpiryDate);
      if (Number.isNaN(expiryDate.getTime())) {
        throw new BadRequestException('documentExpiryDate is not a valid date');
      }
      if (expiryDate.getTime() < Date.now()) {
        throw new BadRequestException(
          'This ID has already expired. Please upload a currently valid document.',
        );
      }
    }

    const row = this.repo.create({
      userId,
      documentType:         dto.documentType,
      documentPhotoUrl:     dto.documentPhotoUrl,
      documentBackPhotoUrl: dto.documentBackPhotoUrl,
      selfiePhotoUrl:       dto.selfiePhotoUrl,
      submitterNote:        dto.submitterNote ?? null,
      documentExpiryDate:   expiryDate,
      status:               'submitted',
    });
    return this.repo.save(row);
  }

  async myStatus(userId: string) {
    const latest = await this.repo.findOne({
      where: { userId },
      order: { submittedAt: 'DESC' },
      select: [
        'id', 'documentType', 'status', 'submittedAt',
        'reviewedAt', 'rejectionReason', 'submitterNote',
        'revokedAt', 'revokedReason', 'documentExpiryDate',
      ],
    });

    const user = await this.usersRepo.findOne({ where: { id: userId } });
    return {
      verifiedAt:      user?.identityVerifiedAt ?? null,
      verifiedDocType: user?.identityDocType   ?? null,
      latest,
    };
  }

  async withdraw(userId: string, submissionId: string) {
    const row = await this.repo.findOne({ where: { id: submissionId } });
    if (!row) throw new NotFoundException('Submission not found');
    if (row.userId !== userId) throw new ForbiddenException('Not your submission');
    if (row.status !== 'submitted') {
      throw new BadRequestException('Only pending submissions can be withdrawn');
    }
    row.status = 'withdrawn';
    return this.repo.save(row);
  }

  // ── Admin review ──────────────────────────────────────────────────────

  /**
   * NARROW SELECT, and a real total (2026-08-28).
   *
   * This was `relations: ['user']`, which loads every column of User, so
   * the Customer ID queue was serving bank account name, number and
   * code, date of birth, home address, next of kin, device hashes, FCM
   * token, Google and Apple ids and lockout state, for a screen that
   * draws a name, an email and a phone number. Same fault as the seven
   * admin endpoints fixed in 2dc3eba and f32b241; this one survived
   * because that sweep enumerated routes out of admin.controller.ts
   * alone and this lives in its own controller. The lesson is in the
   * sweep, not the fix: scope it by guard, not by file.
   *
   * The old signature also took a hard 100 with no total and no offset,
   * so past a hundred waiting submissions the rest were unreachable and
   * nothing on screen could say they existed. It pages now and returns
   * the count, so the queue can say "showing 1-50 of 214".
   */
  async adminList(
    status: VerificationStatus = 'submitted',
    limit = 50,
    page = 1,
    /**
     * Submitted between, as YYYY-MM-DD.
     *
     * This queue only grows, and it is ordered by submittedAt, so without
     * a range the only way to reach a given week is paging from one end of
     * the pile to the other.
     */
    from?: string,
    to?: string,
  ) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const [rows, total] = await this.repo.findAndCount({
      where: {
        status,
        /**
         * Ranged on submittedAt, which is also the column this list is
         * ordered by, so the window and the paging through it agree.
         *
         * `to` runs to the END of its day: stopping at midnight would drop
         * everything submitted ON the end date, and on a review queue that
         * reads as "nobody applied that day".
         */
        ...(from || to ? {
          submittedAt: Between(
            from ? new Date(`${from}T00:00:00Z`) : new Date(0),
            to   ? new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000)
                 : new Date(8.64e15),
          ),
        } : {}),
      },
      order: { submittedAt: status === 'submitted' ? 'ASC' : 'DESC' },
      take,
      skip,
      relations: ['user'],
      select: {
        user: { id: true, name: true, email: true, phone: true, accountId: true },
      },
    });

    return { items: rows, total, page: Math.max(Number(page) || 1, 1), limit: take };
  }

  /**
   * Same narrowing for the single-record read. A reviewer is deciding
   * whether a document matches a face; none of that decision needs the
   * submitter's bank details or their home address.
   */
  async adminGetOne(id: string) {
    const row = await this.repo.findOne({
      where: { id },
      relations: ['user'],
      select: {
        user: { id: true, name: true, email: true, phone: true, accountId: true },
      },
    });
    if (!row) throw new NotFoundException('Submission not found');
    return row;
  }

  /**
   * Internal reads that legitimately need the whole user row (approve
   * and reject both touch the User record), kept separate so the two
   * intentions cannot be confused at a call site.
   */
  private async adminGetOneFull(id: string) {
    const row = await this.repo.findOne({ where: { id }, relations: ['user'] });
    if (!row) throw new NotFoundException('Submission not found');
    return row;
  }

  async approve(id: string, adminUserId: string, adminNote?: string) {
    const row = await this.adminGetOne(id);
    if (row.status === 'approved') return row;
    if (row.status !== 'submitted') {
      throw new BadRequestException(`Only pending submissions can be approved (current: ${row.status})`);
    }

    row.status           = 'approved';
    row.reviewedAt       = new Date();
    row.reviewedByUserId = adminUserId;
    row.adminNote        = adminNote ?? row.adminNote;
    await this.repo.save(row);

    await this.usersRepo.update(row.userId, {
      identityVerifiedAt: new Date(),
      identityDocType:    row.documentType,
    });

    /**
     * Tell them. Approval was logged for us and announced to nobody.
     *
     * The person waited days for a human to look at their ID, and the
     * only way to find out the answer was to keep reopening the verify
     * screen. Doubling as a security notice: an approval nobody
     * submitted means somebody else uploaded a document from inside
     * this account.
     */
    this.security.identityVerificationResolved(row.userId, true)
      .catch(e => this.logger.warn(`identity-approved notice failed for ${row.userId}: ${e?.message ?? e}`));

    this.logger.log(`Identity approved for user ${row.userId} (${row.documentType}) by admin ${adminUserId}`);
    return this.adminGetOne(id);
  }

  async reject(id: string, adminUserId: string, reason: string, adminNote?: string) {
    const row = await this.adminGetOne(id);
    if (row.status !== 'submitted') {
      throw new BadRequestException(`Only pending submissions can be rejected (current: ${row.status})`);
    }
    row.status           = 'rejected';
    row.reviewedAt       = new Date();
    row.reviewedByUserId = adminUserId;
    row.rejectionReason  = reason;
    row.adminNote        = adminNote ?? row.adminNote;
    await this.repo.save(row);

    // The reason travels with it: a rejection with no cause sends the
    // person back to upload the same unreadable photo again.
    this.security.identityVerificationResolved(row.userId, false, reason)
      .catch(e => this.logger.warn(`identity-rejected notice failed for ${row.userId}: ${e?.message ?? e}`));

    this.logger.log(`Identity rejected for user ${row.userId} by admin ${adminUserId}: ${reason}`);
    return this.adminGetOne(id);
  }

  /**
   * Revoke an approved verification. Used when an admin discovers a doc
   * was fake, expired, or the user's status must be reset for any other
   * reason. Flips the user back to unverified and records who/why so the
   * customer can see the reason on their profile.
   */
  async revoke(id: string, adminUserId: string, reason: string, adminNote?: string) {
    const row = await this.adminGetOne(id);
    if (row.status !== 'approved') {
      throw new BadRequestException(
        `Only approved verifications can be revoked (current: ${row.status})`,
      );
    }
    row.status           = 'revoked';
    row.revokedAt        = new Date();
    row.revokedByUserId  = adminUserId;
    row.revokedReason    = reason;
    row.adminNote        = adminNote ?? row.adminNote;
    await this.repo.save(row);

    // Reset the user record so trust perks stop applying immediately.
    await this.usersRepo.update(row.userId, {
      identityVerifiedAt: null,
      identityDocType:    null,
    });

    // A revoke silently strips the badge and the limits that came with
    // it, so from the account holder's side it is indistinguishable
    // from the app breaking. Reuses the rejected notice: same outcome
    // for them, same next step.
    this.security.identityVerificationResolved(row.userId, false, reason)
      .catch(e => this.logger.warn(`identity-revoked notice failed for ${row.userId}: ${e?.message ?? e}`));

    this.logger.warn(`Identity REVOKED for user ${row.userId} by admin ${adminUserId}: ${reason}`);
    return this.adminGetOne(id);
  }

  /**
   * Daily cron: find approved verifications whose documentExpiryDate has
   * passed and flip them to 'expired'. Also resets the user record so
   * trust perks stop applying. Runs at 04:00 daily (low-traffic window).
   *
   * Users get prompted to resubmit next time they open the verify screen
   * (the /verify-identity screen's status endpoint returns the latest row).
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async expireOverdueVerifications() {
    try {
      const now = new Date();
      const overdue = await this.repo.find({
        where: {
          status:             'approved',
          documentExpiryDate: LessThan(now) as any,
        },
        take: 500, // batch, safe re-run tomorrow if more
      });
      if (overdue.length === 0) {
        this.logger.debug('Expiry cron: no verifications past their doc expiry');
        return;
      }
      for (const row of overdue) {
        try {
          row.status = 'expired';
          await this.repo.save(row);
          await this.usersRepo.update(row.userId, {
            identityVerifiedAt: null,
            identityDocType:    null,
          });
        } catch (e: any) {
          this.logger.error(`Expiry cron failed for ${row.id}: ${e.message}`);
        }
      }
      this.logger.log(`Expiry cron: expired ${overdue.length} verifications`);
    } catch (e: any) {
      this.logger.error(`Expiry cron error: ${e.message}`);
    }
  }
}
