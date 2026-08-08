import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { IdentityVerification, VerificationStatus } from './user-verification.entity';
import { SubmitIdentityDto } from './dto/submit-verification.dto';
import { User } from '../users/user.entity';

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

  async adminList(status: VerificationStatus = 'submitted', limit = 100) {
    return this.repo.find({
      where: { status },
      order: { submittedAt: status === 'submitted' ? 'ASC' : 'DESC' },
      take:  limit,
      relations: ['user'],
    });
  }

  async adminGetOne(id: string) {
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
