import {
  Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { HandoffOtp } from './handoff-otp.entity';
import { HandoffRecord, HandoffMethod, HandoffStage } from './handoff-record.entity';
import { MailService } from '../mail/mail.service';
import { FeesService } from '../fees/fees.service';

const OTP_TTL_MIN = 10;
const RATE_LIMIT_PER_MIN = 3;

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  // In-memory rate-limit map (per-process is fine for single-instance Railway;
  // moves to Redis once we go multi-pod).
  private readonly issueAttempts = new Map<string, number[]>();

  constructor(
    @InjectRepository(User)           private usersRepo:      Repository<User>,
    @InjectRepository(Delivery)       private deliveriesRepo: Repository<Delivery>,
    @InjectRepository(HandoffOtp)     private otpRepo:        Repository<HandoffOtp>,
    @InjectRepository(HandoffRecord)  private recordRepo:     Repository<HandoffRecord>,
    private readonly mailService: MailService,
    private readonly feesService: FeesService,
  ) {}

  // ── SEIRS ID lookup ────────────────────────────────────────────────────
  // Spec V8 backup-ID flow — partner staff scans recipient's QR (CUST-XXXX)
  // and the system shows what the registered name SHOULD be so the recipient
  // can speak it and have it typed back for verification.
  //
  // Returns minimal info — never the email/phone of someone else's account.
  async lookupBySeirsId(code: string) {
    const normalized = code.trim().toUpperCase();
    if (!/^(CUST|DRV|PART|BIZ)-[A-Z0-9]+$/.test(normalized)) {
      throw new BadRequestException('Invalid SEIRS ID format');
    }
    const user = await this.usersRepo.findOne({
      where: { accountId: normalized },
      select: ['id', 'name', 'profilePhoto', 'emailVerified'],
    });
    if (!user) throw new NotFoundException('SEIRS ID not found');
    return {
      seirsId:     normalized,
      name:        user.name,
      profilePhoto: user.profilePhoto ?? null,
      verified:    user.emailVerified,
    };
  }

  // ── Handoff OTP issuance ──────────────────────────────────────────────
  // Generates a 6-digit OTP, hashes it, persists with 10min expiry,
  // emails the recipient. Rate-limited to 3/min per recipient to deter
  // abuse without blocking real retries.
  async issueHandoffOtp(deliveryId: string, recipientUserId: string) {
    this.checkRateLimit(recipientUserId);

    const recipient = await this.usersRepo.findOne({ where: { id: recipientUserId } });
    if (!recipient) throw new NotFoundException('Recipient not found');

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);

    await this.otpRepo.save(this.otpRepo.create({
      deliveryId,
      recipientUserId,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60 * 1000),
    }));

    // Use the existing mail service template path — keeps OTP delivery
    // consistent with auth OTPs (Resend SMTP via @seirs.co)
    await this.mailService
      .sendHandoffOtp(recipient.email, recipient.name, code, deliveryId)
      .catch((err: Error) => this.logger.error(`Handoff OTP email failed: ${err.message}`));

    return { sent: true, expiresInMinutes: OTP_TTL_MIN };
  }

  // ── Handoff verification ──────────────────────────────────────────────
  // Two methods accepted; partner/driver app picks based on what the
  // recipient can produce. On success returns the handoff record id so
  // the caller can attach it to the delivery audit trail.
  async verifyHandoff(
    payload: {
      deliveryId: string;
      stage:      HandoffStage;
      fromUserId?: string;
      method:     HandoffMethod;
      // PHYSICAL_ID args
      idType?:    string;
      idNumber?:  string;
      otp?:       string;
      idPhotoUrl?: string;
      // SEIRS_ID args
      seirsCode?: string;
      typedName?: string;
      // Both methods may attach a proof photo
      proofPhotoUrl?: string;
    },
  ): Promise<{ recordId: string; recipientUserId: string }> {
    const delivery = await this.deliveriesRepo.findOne({
      where: { id: payload.deliveryId },
      relations: ['customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found');

    // For Spec V8 the recipient is the customer who placed the order. When
    // we add proxy receivers (e.g. "send to my office"), this resolves to
    // the proxy User instead.
    const recipientUserId = delivery.customer.id;

    if (payload.method === HandoffMethod.PHYSICAL_ID) {
      return this.verifyPhysicalId(payload, delivery, recipientUserId);
    }
    if (payload.method === HandoffMethod.SEIRS_ID) {
      return this.verifySeirsId(payload, delivery, recipientUserId);
    }
    throw new BadRequestException('Unknown verification method');
  }

  private async verifyPhysicalId(
    payload: any,
    delivery: Delivery,
    recipientUserId: string,
  ): Promise<{ recordId: string; recipientUserId: string }> {
    if (!payload.idType || !payload.idNumber || !payload.otp) {
      throw new BadRequestException('idType, idNumber and otp are required for physical ID verification');
    }

    // Validate OTP
    const otpRow = await this.otpRepo
      .createQueryBuilder('o')
      .addSelect('o.codeHash')
      .where('o.deliveryId = :did', { did: delivery.id })
      .andWhere('o.recipientUserId = :uid', { uid: recipientUserId })
      .andWhere('o.consumed = false')
      .andWhere('o.expiresAt > NOW()')
      .orderBy('o.createdAt', 'DESC')
      .getOne();

    if (!otpRow) throw new ForbiddenException('No valid OTP — issue a new one and try again');

    const otpMatch = await bcrypt.compare(String(payload.otp), otpRow.codeHash);
    if (!otpMatch) throw new ForbiddenException('OTP did not match');

    // High-value packages require ID photo (Spec V8 — threshold from Fee Catalogue)
    const threshold = await this.feesService.getValueOr('high_value_threshold_ngn', 50000);
    if (Number(delivery.price) >= threshold && !payload.idPhotoUrl) {
      throw new BadRequestException(
        `High-value delivery (₦${threshold.toLocaleString()}+) requires a photo of recipient holding the ID`,
      );
    }

    await this.otpRepo.update(otpRow.id, { consumed: true, consumedAt: new Date() });

    const idStr = String(payload.idNumber);
    const record = await this.recordRepo.save(this.recordRepo.create({
      deliveryId:    delivery.id,
      stage:         payload.stage,
      method:        HandoffMethod.PHYSICAL_ID,
      fromUserId:    payload.fromUserId ?? null,
      toUserId:      recipientUserId,
      idType:        String(payload.idType),
      idLast4:       idStr.slice(-4),
      proofPhotoUrl: payload.idPhotoUrl ?? payload.proofPhotoUrl ?? null,
    }));

    return { recordId: record.id, recipientUserId };
  }

  private async verifySeirsId(
    payload: any,
    delivery: Delivery,
    recipientUserId: string,
  ): Promise<{ recordId: string; recipientUserId: string }> {
    if (!payload.seirsCode || !payload.typedName) {
      throw new BadRequestException('seirsCode and typedName are required for SEIRS ID verification');
    }

    const lookup = await this.lookupBySeirsId(payload.seirsCode);

    // The SEIRS ID must belong to the actual recipient on this delivery —
    // otherwise anyone with their own SEIRS ID could claim someone else's package.
    const recipient = await this.usersRepo.findOne({
      where: { id: recipientUserId },
      select: ['id', 'name', 'accountId'],
    });
    if (!recipient || recipient.accountId !== lookup.seirsId) {
      throw new ForbiddenException('This SEIRS ID does not belong to the package recipient');
    }

    // Typed name must match the registered name (case-insensitive, whitespace-tolerant)
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    if (norm(payload.typedName) !== norm(recipient.name)) {
      throw new ForbiddenException('Typed name did not match the registered name on this SEIRS ID');
    }

    const record = await this.recordRepo.save(this.recordRepo.create({
      deliveryId:    delivery.id,
      stage:         payload.stage,
      method:        HandoffMethod.SEIRS_ID,
      fromUserId:    payload.fromUserId ?? null,
      toUserId:      recipientUserId,
      signatureName: recipient.name,
      proofPhotoUrl: payload.proofPhotoUrl ?? null,
    }));

    return { recordId: record.id, recipientUserId };
  }

  // ── Audit / chain of custody ───────────────────────────────────────────
  async getHandoffChain(deliveryId: string) {
    return this.recordRepo.find({
      where: { deliveryId },
      order: { createdAt: 'ASC' },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private checkRateLimit(userId: string) {
    const now = Date.now();
    const windowStart = now - 60_000;
    const recent = (this.issueAttempts.get(userId) ?? []).filter(t => t > windowStart);
    if (recent.length >= RATE_LIMIT_PER_MIN) {
      throw new ForbiddenException('Too many OTP requests — wait 60 seconds and try again');
    }
    recent.push(now);
    this.issueAttempts.set(userId, recent);
  }
}
