import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

    const row = this.repo.create({
      userId,
      documentType:         dto.documentType,
      documentPhotoUrl:     dto.documentPhotoUrl,
      documentBackPhotoUrl: dto.documentBackPhotoUrl,
      selfiePhotoUrl:       dto.selfiePhotoUrl,
      submitterNote:        dto.submitterNote ?? null,
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
}
