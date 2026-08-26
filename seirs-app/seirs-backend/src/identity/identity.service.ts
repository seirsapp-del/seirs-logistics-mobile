import {
  Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { HandoffOtp } from './handoff-otp.entity';
import {
  HandoffRecord, HandoffMethod, HandoffStage, HandoffRole, SignatureSource,
} from './handoff-record.entity';
import { MailService } from '../mail/mail.service';
import { FeesService } from '../fees/fees.service';
import { generateOtp } from '../common/utils/auth-codes';

const OTP_TTL_MIN = 10;

/**
 * Who a handoff is being verified against.
 *
 * Resolved either from a Delivery or, for a partner drop-off that has
 * no driver leg yet, handed in directly by the caller.
 */
interface HandoffSubject {
  id:                 string;
  recipientUserId:    string;
  valueNgn:           number;
  receiverFirstName?: string | null;
  receiverLastName?:  string | null;
}
const RATE_LIMIT_PER_MIN = 3;
// Higher than the OTP limit: a partner store working through a queue of
// collections legitimately scans several QRs a minute. Still far below
// what walking the SEIRS ID space would need.
const LOOKUP_LIMIT_PER_MIN = 20;

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
  // Spec V8 backup-ID flow - partner staff scans recipient's QR (CUST-XXXX)
  // and the system shows what the registered name SHOULD be so the recipient
  // can speak it and have it typed back for verification.
  //
  // Returns minimal info - never the email/phone of someone else's account.
  async lookupBySeirsId(code: string, actorUserId?: string) {
    // Throttled per caller (audit 2026-08-14): this turns a SEIRS ID into
    // a real person's name and photo, and SEIRS IDs are short enough to
    // walk. Unthrottled it is a name-harvesting endpoint, which is the
    // reconnaissance risk the founder called out. Legitimate use is a
    // staff member scanning one QR in front of them.
    if (actorUserId) this.checkRateLimit(`lookup:${actorUserId}`, LOOKUP_LIMIT_PER_MIN);
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
  //
  // No recipientUserId (founder 2026-08-11): receivers often have no
  // SEIRS account (neighbours, security, family collect packages). The
  // code then goes to the SENDER's email; they forward it to whoever is
  // collecting - the Amazon one-time-PIN pattern. Verification still
  // records against the sender's user id, which is who verifyHandoff
  // resolves as the OTP owner.
  async issueHandoffOtp(deliveryId: string, recipientUserId?: string, actorUserId?: string) {
    if (actorUserId) await this.assertDeliveryParty(deliveryId, actorUserId);
    let resolvedId = recipientUserId;
    if (!resolvedId) {
      const delivery = await this.deliveriesRepo.findOne({
        where: { id: deliveryId },
        relations: ['customer'],
      });
      if (!delivery?.customer?.id) throw new NotFoundException('Delivery or sender not found');
      resolvedId = delivery.customer.id;
    }
    this.checkRateLimit(resolvedId);

    const recipient = await this.usersRepo.findOne({ where: { id: resolvedId } });
    if (!recipient) throw new NotFoundException('Recipient not found');

    // Was Math.random (audit 2026-08-14). generateOtp already exists and
    // its own docstring names handoff verification as the reason it was
    // written; this call site was missed when the rest were converted.
    // Math.random is seeded predictably enough that observing a few codes
    // narrows the next one, and this code releases high-value packages.
    const code = generateOtp();
    const codeHash = await bcrypt.hash(code, 10);

    await this.otpRepo.save(this.otpRepo.create({
      deliveryId,
      recipientUserId: resolvedId,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60 * 1000),
    }));

    // Use the existing mail service template path - keeps OTP delivery
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

      /**
       * The name typed by whoever TAKES custody here (2026-08-25).
       *
       * The founder's Nigerian case: a partner store receives a package
       * and later says it never did. A scan is a store id and a
       * timestamp, which is not an answer. A named human at the counter
       * signs for it, and that name is what the sender's receipt can
       * show when they ask who collected their package.
       *
       * When the app in the field has not been updated to ask for it,
       * the signed-in account's registered name is used instead and the
       * record says so via signatureSource. A weaker name beats the
       * empty chain this is replacing.
       */
      signatureName?: string;
      /** Typed name of whoever HANDS OVER. Store staff releasing, mostly. */
      releasedByName?: string;
      /** Role of the taker, so a dispute does not have to join out to find it. */
      signedByRole?: HandoffRole;
      /** Store this transition happened at, denormalised against staff churn. */
      partnerStoreId?: string;
      /**
       * Overrides who the record says took custody. On a store receipt
       * the taker is the staff member, NOT the OTP owner: the OTP proves
       * the sender authorised the release, it does not mean the sender
       * ended up holding their own package.
       */
      toUserId?: string;
      /**
       * A handoff that has no delivery behind it yet.
       *
       * A sender who books a partner drop-off walks into the store
       * before any driver exists, so there is no Delivery row: the
       * partner app passed the DROP-OFF id here and the lookup below
       * threw "Delivery not found", which is what store staff saw on
       * screen when they tried to take a package in (found on device
       * 2026-08-18). The counter could not receive anything at all.
       *
       * When the caller already knows who owns the OTP it says so, and
       * the delivery lookup is skipped. handoff_records.deliveryId is a
       * plain indexed column, not a foreign key, so the drop-off id
       * records fine and the chain stays queryable by that id.
       */
      subjectUserId?:      string;
      subjectValueNgn?:    number;
      receiverFirstName?:  string | null;
      receiverLastName?:   string | null;
    },
    actorUserId?: string,
  ): Promise<{ recordId: string; recipientUserId: string }> {
    if (actorUserId) await this.assertDeliveryParty(payload.deliveryId, actorUserId);

    /**
     * Counter handovers dispatch BEFORE the subject lookup below.
     *
     * That lookup resolves the counterparty to the delivery's CUSTOMER
     * for every stage, which is why a rider handing a parcel across a
     * partner counter could not verify anything at all: the physical-ID
     * path demanded an OTP emailed to the recipient, and the SEIRS-ID
     * path refused with "This SEIRS ID does not belong to the package
     * recipient". Both are the right answers to a question nobody asked
     * here. The recipient is not in the room; a shop is.
     */
    if (payload.method === HandoffMethod.TYPED_SIGNATURE) {
      return this.verifyTypedSignature(payload, actorUserId);
    }

    let subject: HandoffSubject;
    if (payload.subjectUserId) {
      subject = {
        id:                payload.deliveryId,
        recipientUserId:   payload.subjectUserId,
        valueNgn:          Number(payload.subjectValueNgn ?? 0),
        receiverFirstName: payload.receiverFirstName ?? null,
        receiverLastName:  payload.receiverLastName ?? null,
      };
    } else {
      const delivery = await this.deliveriesRepo.findOne({
        where: { id: payload.deliveryId },
        // 'stops' matters: on a multi-package run the declared value of
        // the goods lives per stop, so without it the high-value check
        // below reads nothing and passes everything.
        relations: ['customer', 'stops'],
      });
      if (!delivery) throw new NotFoundException('Delivery not found');
      // For Spec V8 the recipient is the customer who placed the order.
      // When we add proxy receivers (e.g. "send to my office"), this
      // resolves to the proxy User instead.
      subject = {
        id:                delivery.id,
        recipientUserId:   delivery.customer.id,
        /**
         * The declared value of the GOODS, never the fare.
         *
         * This read delivery.price, so a laptop worth NGN 500,000 sent on
         * an NGN 2,500 delivery was compared as 2,500 against the
         * high-value threshold, no ID was demanded, and the sender had
         * been told the handover would be ID-verified (founder
         * 2026-08-26).
         *
         * On a multi-package run the highest single declared value wins:
         * per-stop values never reached this check before, and one
         * valuable parcel among cheap ones is still valuable at the door.
         * Falls back to the fare only when nothing was declared, so
         * bookings that never carried a value behave as they always did.
         */
        valueNgn: (() => {
          const stops: any[] = Array.isArray((delivery as any).stops) ? (delivery as any).stops : [];
          const stopMax = stops.reduce(
            (max, st) => Math.max(max, Number(st?.declaredValueNgn ?? 0) || 0), 0,
          );
          const declared = Math.max(Number((delivery as any).declaredValueNgn ?? 0) || 0, stopMax);
          return declared > 0 ? declared : Number(delivery.price ?? 0);
        })(),
        receiverFirstName: (delivery as any).receiverFirstName ?? null,
        receiverLastName:  (delivery as any).receiverLastName ?? null,
      };
    }

    if (payload.method === HandoffMethod.PHYSICAL_ID) {
      return this.verifyPhysicalId(payload, subject);
    }
    if (payload.method === HandoffMethod.SEIRS_ID) {
      return this.verifySeirsId(payload, subject);
    }
    throw new BadRequestException('Unknown verification method');
  }

  /**
   * A counter handover, signed by a named human at the store.
   *
   * THE RULE, and it is worth stating plainly because a dispute months
   * from now is read by someone who was not in this conversation:
   *
   *   signatureName is ALWAYS the party TAKING custody.
   *   releasedByName is ALWAYS the party HANDING IT OVER.
   *
   * That invariant is the whole reason the chain settles anything. The
   * liability matrix moves responsibility when the TAKER signs, so if the
   * name meant "taker" on five stages and "giver" on one, reading a
   * record would require knowing the stage before you knew what the name
   * meant. Two fields, one meaning each, no exceptions.
   *
   * The apps send ONE typed name, because there is only one person at the
   * counter to type it, and the server files it on whichever side the
   * STORE is standing:
   *
   *   store_to_driver  the store hands over  -> releasedByName
   *   driver_to_store  the store takes it in -> signatureName
   *
   * The rider's own name is not typed on either. Their identity is
   * already established by the JWT this request arrived on, and it is the
   * store's word that a dispute puts in doubt: the founder's case is a
   * partner store that receives a package and later says it never did.
   * So their side of the record is the account name, marked ACCOUNT
   * rather than TYPED, and the store's side is a real signature.
   */
  private async verifyTypedSignature(
    payload: any,
    actorUserId?: string,
  ): Promise<{ recordId: string; recipientUserId: string }> {
    const stage: HandoffStage = payload.stage;
    const COUNTER_STAGES: HandoffStage[] = [
      HandoffStage.STORE_TO_DRIVER,
      HandoffStage.DRIVER_TO_STORE,
      HandoffStage.DRIVER_TO_DRIVER,
    ];
    if (!COUNTER_STAGES.includes(stage)) {
      // Handing to a RECIPIENT is never settled by a signature the person
      // handing over typed themselves. Those stages keep the ID + OTP and
      // SEIRS ID paths, which is also what the high-value DELIVERED gate
      // in DeliveriesService whitelists.
      throw new BadRequestException(
        'A typed signature only settles a handover between a store and a rider. ' +
        'Verify a recipient with their ID and code, or their SEIRS ID.',
      );
    }

    const typed = String(payload.signatureName ?? payload.typedName ?? '')
      .trim().replace(/\s+/g, ' ').slice(0, 120);
    if (typed.split(' ').filter(Boolean).length < 2) {
      throw new BadRequestException(
        'Type the full name, first and last, of the person signing for this package.',
      );
    }

    if (!actorUserId) {
      throw new ForbiddenException('Sign in to record a handover.');
    }
    const actor = await this.usersRepo.findOne({
      where: { id: actorUserId },
      select: ['id', 'name'],
    });

    // Which store this happened at. Denormalised onto the record because
    // resolving it later through a staff member's current employer gives
    // the wrong answer the moment that person changes shop.
    const storeId = payload.partnerStoreId
      ?? await this.resolveStoreForStage(payload.deliveryId, stage);

    const storeTakesIt = stage === HandoffStage.DRIVER_TO_STORE;

    /**
     * Upgrade the auto-record instead of stacking a second one on top.
     *
     * DeliveriesService writes a store_to_driver link the moment a rider
     * taps PICKED_UP, signed with their account name, so the chain is
     * never empty. If the rider then completes the counter scan, this
     * would otherwise INSERT a second row for the same handover, and two
     * rows for one handover reads to whoever settles the dispute as the
     * package changing hands twice.
     *
     * So a real typed signature replaces a fallback one on the same
     * stage. Only ever in that direction: an ACCOUNT name may be upgraded
     * to a TYPED one, never the reverse, so nothing here can weaken
     * evidence that already exists.
     */
    const weak = await this.recordRepo.findOne({
      where: {
        deliveryId: payload.deliveryId,
        stage,
        signatureSource: SignatureSource.ACCOUNT,
      },
      order: { createdAt: 'DESC' },
    });
    if (weak) {
      await this.recordRepo.update(weak.id, {
        method:          HandoffMethod.TYPED_SIGNATURE,
        signatureName:   storeTakesIt ? typed : (actor?.name ?? weak.signatureName),
        signatureSource: storeTakesIt ? SignatureSource.TYPED : SignatureSource.ACCOUNT,
        releasedByName:  storeTakesIt ? (actor?.name ?? null) : typed,
        signedByRole:    storeTakesIt ? HandoffRole.STORE_STAFF : HandoffRole.DRIVER,
        partnerStoreId:  storeId ?? weak.partnerStoreId,
        proofPhotoUrl:   payload.proofPhotoUrl ?? payload.idPhotoUrl ?? weak.proofPhotoUrl,
      });
      this.logger.log(
        `custody ${stage} upgraded to a typed signature for ${payload.deliveryId}, signed "${typed}"`,
      );
      return { recordId: weak.id, recipientUserId: actorUserId };
    }

    const record = await this.recordRepo.save(this.recordRepo.create({
      deliveryId: payload.deliveryId,
      stage,
      method:     HandoffMethod.TYPED_SIGNATURE,
      fromUserId: storeTakesIt ? actorUserId : (payload.fromUserId ?? null),
      // Store staff are not the caller here, so there is no user id for
      // them. The typed name is what identifies them, which is the point.
      toUserId:   storeTakesIt ? null : actorUserId,
      signatureName:   storeTakesIt ? typed : (actor?.name ?? null),
      signatureSource: storeTakesIt ? SignatureSource.TYPED : SignatureSource.ACCOUNT,
      releasedByName:  storeTakesIt ? (actor?.name ?? null) : typed,
      signedByRole:    storeTakesIt ? HandoffRole.STORE_STAFF : HandoffRole.DRIVER,
      partnerStoreId:  storeId,
      proofPhotoUrl:   payload.proofPhotoUrl ?? payload.idPhotoUrl ?? null,
    }));

    this.logger.log(
      `custody ${stage} recorded for ${payload.deliveryId}, signed "${typed}"`,
    );
    return { recordId: record.id, recipientUserId: actorUserId };
  }

  /**
   * The store a counter handover happened at, read off the drop-off this
   * delivery came from.
   *
   * Raw SQL for the same reason relatedCustodyIds uses it: this module
   * does not own StoreDropoff and PartnerStoreModule already imports this
   * service, so importing back would close a module loop.
   */
  private async resolveStoreForStage(
    deliveryId: string,
    stage: HandoffStage,
  ): Promise<string | null> {
    try {
      const rows: any[] = await this.deliveriesRepo.manager.query(
        `SELECT "pickupStoreId", "dropoffStoreId" FROM store_dropoffs
          WHERE "deliveryId" = $1 OR id = $1 LIMIT 1`,
        [deliveryId],
      );
      const row = rows?.[0];
      if (!row) return null;
      return stage === HandoffStage.DRIVER_TO_STORE
        ? (row.dropoffStoreId ?? row.pickupStoreId ?? null)
        : (row.pickupStoreId ?? null);
    } catch {
      // A door-to-door leg has no drop-off row at all. The signature is
      // still the evidence that matters; the store id is context.
      return null;
    }
  }

  private async verifyPhysicalId(
    payload: any,
    subject: HandoffSubject,
  ): Promise<{ recordId: string; recipientUserId: string }> {
    const { recipientUserId } = subject;
    if (!payload.idType || !payload.idNumber || !payload.otp) {
      throw new BadRequestException('idType, idNumber and otp are required for physical ID verification');
    }

    // Validate OTP
    const otpRow = await this.otpRepo
      .createQueryBuilder('o')
      .addSelect('o.codeHash')
      .where('o.deliveryId = :did', { did: subject.id })
      .andWhere('o.recipientUserId = :uid', { uid: recipientUserId })
      .andWhere('o.consumed = false')
      .andWhere('o.expiresAt > NOW()')
      .orderBy('o.createdAt', 'DESC')
      .getOne();

    if (!otpRow) throw new ForbiddenException('No valid OTP - issue a new one and try again');

    const otpMatch = await bcrypt.compare(String(payload.otp), otpRow.codeHash);
    if (!otpMatch) throw new ForbiddenException('OTP did not match');

    // High-value packages require ID photo (Spec V8 - threshold from Fee Catalogue)
    const threshold = await this.feesService.getValueOr('high_value_threshold_ngn', 100000);
    if (subject.valueNgn >= threshold && !payload.idPhotoUrl) {
      throw new BadRequestException(
        `High-value delivery (₦${threshold.toLocaleString()}+) requires a photo of recipient holding the ID`,
      );
    }

    await this.otpRepo.update(otpRow.id, { consumed: true, consumedAt: new Date() });

    const idStr = String(payload.idNumber);
    // The taker defaults to the OTP owner, but a store receipt overrides
    // it: the OTP proves the sender authorised the release, not that the
    // sender walked out holding their own package.
    const takerUserId = payload.toUserId ?? recipientUserId;
    const signature = await this.resolveSignature(payload.signatureName, takerUserId);
    const record = await this.recordRepo.save(this.recordRepo.create({
      deliveryId:    subject.id,
      stage:         payload.stage,
      method:        HandoffMethod.PHYSICAL_ID,
      fromUserId:    payload.fromUserId ?? null,
      toUserId:      takerUserId,
      idType:        String(payload.idType),
      idLast4:       idStr.slice(-4),
      proofPhotoUrl: payload.idPhotoUrl ?? payload.proofPhotoUrl ?? null,
      signatureName:   signature.name,
      signatureSource: signature.source,
      releasedByName:  payload.releasedByName?.trim().slice(0, 120) || null,
      signedByRole:    payload.signedByRole ?? null,
      partnerStoreId:  payload.partnerStoreId ?? null,
    }));

    return { recordId: record.id, recipientUserId };
  }

  private async verifySeirsId(
    payload: any,
    subject: HandoffSubject,
  ): Promise<{ recordId: string; recipientUserId: string }> {
    const { recipientUserId } = subject;
    if (!payload.seirsCode || !payload.typedName) {
      throw new BadRequestException('seirsCode and typedName are required for SEIRS ID verification');
    }

    const lookup = await this.lookupBySeirsId(payload.seirsCode);

    // The SEIRS ID must belong to the actual recipient on this delivery -
    // otherwise anyone with their own SEIRS ID could claim someone else's package.
    const recipient = await this.usersRepo.findOne({
      where: { id: recipientUserId },
      select: ['id', 'name', 'accountId'],
    });
    if (!recipient || recipient.accountId !== lookup.seirsId) {
      throw new ForbiddenException('This SEIRS ID does not belong to the package recipient');
    }

    // Typed-name match (founder 2026-08-11): when the sender named a
    // receiver at booking, the driver asks for the FIRST NAME and types
    // it themselves (nobody touches the driver's phone). Matches the
    // declared receiver's first name, their full name, or the account
    // holder's registered name - whichever the collector answers with.
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const typed = norm(payload.typedName);
    const declaredFirst = subject.receiverFirstName ? norm(subject.receiverFirstName) : null;
    const declaredFull  = declaredFirst
      ? norm(`${subject.receiverFirstName} ${subject.receiverLastName ?? ''}`)
      : null;
    const accountNorm   = norm(recipient.name);
    const accountFirst  = accountNorm.split(' ')[0];
    const matches = declaredFirst
      ? (typed === declaredFirst || typed === declaredFull)
      : (typed === accountNorm || typed === accountFirst);
    if (!matches) {
      throw new ForbiddenException(
        declaredFirst
          ? 'Typed name did not match the receiver named on this booking'
          : 'Typed name did not match the registered name on this SEIRS ID',
      );
    }

    const record = await this.recordRepo.save(this.recordRepo.create({
      deliveryId:    subject.id,
      stage:         payload.stage,
      method:        HandoffMethod.SEIRS_ID,
      fromUserId:    payload.fromUserId ?? null,
      toUserId:      recipientUserId,
      // The collector's own registered name, matched against the typed
      // answer above. Not the caller's signatureName: on this path the
      // taker is the person whose SEIRS ID was just verified.
      signatureName:   recipient.name,
      signatureSource: SignatureSource.TYPED,
      proofPhotoUrl:   payload.proofPhotoUrl ?? null,
      // Who released it. Founder asked specifically whether the sender's
      // receipt can show who handed the package over, not just a photo.
      releasedByName:  payload.releasedByName?.trim().slice(0, 120) || null,
      signedByRole:    payload.signedByRole ?? HandoffRole.RECIPIENT,
      partnerStoreId:  payload.partnerStoreId ?? null,
    }));

    return { recordId: record.id, recipientUserId };
  }

  // ── Scan-based custody transitions ─────────────────────────────────────

  /**
   * Write a custody record for a transition that is settled by a scan and
   * a signature rather than by an OTP challenge (2026-08-25).
   *
   * WHY this exists at all: handoff_records modelled six stages and
   * essentially nothing called it. Only two of the seven rows in the
   * liability matrix ever produced a record, both on the partner-store
   * route, so the admin Liability Disputes page said "No handoff records
   * yet for this delivery" on deliveries that had completed successfully.
   * The company's central claim, that every person who touched the parcel
   * signed for it, had nothing behind it.
   *
   * The matrix moves responsibility on scan events, and every one of its
   * "until X scans" rows is the same rule: whoever last signed is holding
   * it. That only works if the scans are actually written down.
   *
   * Deliberately does NOT verify anything. The strong paths above stay
   * the strong paths, and the high-value DELIVERED gate still names them
   * explicitly, so nothing recorded here can release a valuable package.
   */
  async recordHandoff(input: {
    deliveryId:      string;
    stage:           HandoffStage;
    method:          HandoffMethod;
    fromUserId?:     string | null;
    toUserId?:       string | null;
    /** Typed by the taker. Falls back to their account name. */
    signatureName?:  string | null;
    releasedByName?: string | null;
    signedByRole?:   HandoffRole | null;
    partnerStoreId?: string | null;
    proofPhotoUrl?:  string | null;
  }): Promise<HandoffRecord> {
    const signature = await this.resolveSignature(
      input.signatureName,
      input.toUserId ?? undefined,
    );
    return this.recordRepo.save(this.recordRepo.create({
      deliveryId:      input.deliveryId,
      stage:           input.stage,
      method:          input.method,
      fromUserId:      input.fromUserId ?? null,
      toUserId:        input.toUserId ?? null,
      signatureName:   signature.name,
      signatureSource: signature.source,
      releasedByName:  input.releasedByName?.trim().slice(0, 120) || null,
      signedByRole:    input.signedByRole ?? null,
      partnerStoreId:  input.partnerStoreId ?? null,
      proofPhotoUrl:   input.proofPhotoUrl ?? null,
    }));
  }

  /**
   * True when this stage already has a record, so a retry or a second
   * code path does not stamp the same handover twice.
   *
   * A duplicated link reads, to anyone settling a dispute, as the package
   * changing hands twice.
   */
  async hasHandoff(deliveryId: string, stage: HandoffStage): Promise<boolean> {
    const found = await this.recordRepo.findOne({
      where: { deliveryId, stage },
      select: ['id'],
    });
    return !!found;
  }

  /**
   * Put a name on the record, and be honest about where it came from.
   *
   * Typed wins. Falling back to the signed-in account's registered name
   * keeps the chain unbroken while partner and driver builds catch up
   * with the signature prompt, and signatureSource marks which it was so
   * a dispute is never misled about the strength of the evidence.
   */
  private async resolveSignature(
    typed: string | null | undefined,
    userId?: string,
  ): Promise<{ name: string | null; source: SignatureSource | null }> {
    const clean = String(typed ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (clean) return { name: clean, source: SignatureSource.TYPED };
    if (!userId) return { name: null, source: null };
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      select: ['id', 'name'],
    });
    return user?.name
      ? { name: user.name.slice(0, 120), source: SignatureSource.ACCOUNT }
      : { name: null, source: null };
  }

  // ── Audit / chain of custody ───────────────────────────────────────────

  /**
   * Every custody record for a package, whichever id you have.
   *
   * A partner-store package lives under two ids: the counter receipt is
   * filed against the store drop-off id (there is no Delivery row until a
   * driver leg exists), and the road journey against the delivery id.
   * Searching either one showed half a chain at best, which on the admin
   * dispute page looked exactly like the records were missing.
   *
   * Raw SQL for the drop-off lookup on purpose: IdentityModule does not
   * own StoreDropoff, and PartnerStoreModule already imports this service,
   * so pulling the entity in the other direction to answer one id question
   * is not worth the module-graph coupling.
   */
  async getHandoffChain(deliveryId: string, actorUserId?: string) {
    if (actorUserId) await this.assertDeliveryParty(deliveryId, actorUserId);
    const ids = await this.relatedCustodyIds(deliveryId);
    return this.recordRepo
      .createQueryBuilder('h')
      .where('h."deliveryId" IN (:...ids)', { ids })
      .orderBy('h."createdAt"', 'ASC')
      .getMany();
  }

  /**
   * The chain plus the answer the liability matrix exists to give: who is
   * holding this package right now, and who carries the loss if it went
   * missing at this moment.
   *
   * The matrix reduces to one rule. Whoever last signed for it holds it,
   * and keeps holding it until the next party signs. Every "until X
   * scans" row on the founder's slide is that rule stated for one leg,
   * which is why an append-only chain answers all seven of them without
   * a table of special cases.
   */
  async getCustodySummary(deliveryId: string, actorUserId?: string) {
    const chain = await this.getHandoffChain(deliveryId, actorUserId);
    const last = chain.length ? chain[chain.length - 1] : null;
    return {
      chain,
      current: this.describeCustody(last),
      // A chain is complete when the package reached a recipient. An
      // incomplete chain on a delivery already marked delivered is the
      // discrepancy a dispute is usually about.
      complete: !!last && (
        last.stage === HandoffStage.STORE_TO_RECIPIENT ||
        last.stage === HandoffStage.DRIVER_TO_RECIPIENT
      ),
    };
  }

  private describeCustody(last: HandoffRecord | null) {
    if (!last) {
      return {
        holder:         'sender',
        liable:         'sender',
        because:        'Nobody has signed for this package yet, so it has not left the sender.',
        since:          null as Date | null,
        signedBy:       null as string | null,
        partnerStoreId: null as string | null,
      };
    }
    const base = {
      since:          last.createdAt,
      signedBy:       last.signatureName ?? null,
      partnerStoreId: last.partnerStoreId ?? null,
    };
    switch (last.stage) {
      case HandoffStage.CUSTOMER_TO_STORE:
        return { ...base, holder: 'partner_store', liable: 'partner_store',
          because: 'The store signed for it and no rider has signed it out yet.' };
      case HandoffStage.CUSTOMER_TO_DRIVER:
      case HandoffStage.STORE_TO_DRIVER:
      case HandoffStage.DRIVER_TO_DRIVER:
        return { ...base, holder: 'driver', liable: 'driver',
          because: 'The rider signed for it and has not signed it over to anyone.' };
      case HandoffStage.DRIVER_TO_STORE:
        return { ...base, holder: 'partner_store', liable: 'partner_store',
          because: 'The destination store signed for it and the recipient has not collected.' };
      case HandoffStage.STORE_TO_RECIPIENT:
      case HandoffStage.DRIVER_TO_RECIPIENT:
        return { ...base, holder: 'recipient', liable: 'none',
          because: 'The recipient signed for it. The chain is closed.' };
      default:
        return { ...base, holder: 'unknown', liable: 'unknown',
          because: 'Unrecognised custody stage.' };
    }
  }

  /**
   * Every id this package's records could be filed under: the id given,
   * plus the delivery a drop-off spawned, or the drop-off a delivery came
   * from.
   */
  private async relatedCustodyIds(id: string): Promise<string[]> {
    const ids = new Set<string>([id]);
    try {
      const rows: any[] = await this.deliveriesRepo.manager.query(
        `SELECT id, "deliveryId" FROM store_dropoffs
          WHERE id = $1 OR "deliveryId" = $1`,
        [id],
      );
      for (const r of rows ?? []) {
        if (r?.id) ids.add(r.id);
        if (r?.deliveryId) ids.add(r.deliveryId);
      }
    } catch { /* store_dropoffs absent on very old databases; the given id still works */ }
    return [...ids];
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /**
   * Only people actually involved in a delivery may touch its custody
   * chain (audit 2026-08-14).
   *
   * Every handoff route carried JwtAuthGuard and stopped there, taking
   * the delivery id straight from the URL without asking whether the
   * caller had anything to do with it. Three consequences, all reachable
   * from any ordinary account by iterating delivery ids:
   *
   *   - issue-otp mailed a real verification code to a stranger's
   *     customer on demand, which is both an email bomb and the setup
   *     for a "read me your code" phone scam.
   *   - verify minted the handoff record that the DELIVERED gate on
   *     high-value packages checks for. The record is the gate.
   *   - the chain returned typed legal names, government ID type and
   *     last four digits, and doorstep photos for any delivery.
   *
   * Admins are allowed through: disputes are exactly the case where
   * somebody outside the delivery has to read the chain.
   */
  private async assertDeliveryParty(deliveryId: string, actorUserId: string) {
    const delivery = await this.deliveriesRepo.findOne({
      where: { id: deliveryId },
      relations: ['customer', 'driver', 'driver.user'],
    });
    // Not a delivery id. Before a driver leg exists a partner-store
    // package only has a drop-off id, and every route here takes one
    // interchangeably, so fall through to the drop-off's own party list
    // rather than reporting the package missing.
    if (!delivery) return this.assertDropoffParty(deliveryId, actorUserId);

    if (delivery.customer?.id === actorUserId) return delivery;
    if (delivery.driver?.user?.id === actorUserId) return delivery;

    const actor = await this.usersRepo.findOne({
      where: { id: actorUserId },
      select: ['id', 'adminRole'],
    });
    if (actor?.adminRole) return delivery;

    throw new ForbiddenException('You are not a party to this delivery.');
  }

  /**
   * Same question for a store drop-off, which has no Delivery row until a
   * driver leg exists.
   *
   * The delivery-only check above threw NotFound on a drop-off id, so the
   * partner app could not read back the counter receipt it had just
   * written, and the customer could not see who took their package in.
   *
   * Parties here are the sender, the named recipient if they have an
   * account, staff at either store, and admins. Raw SQL for the same
   * reason relatedCustodyIds uses it: this module does not own
   * StoreDropoff and importing it back would close a module loop.
   */
  private async assertDropoffParty(dropoffId: string, actorUserId: string) {
    const rows: any[] = await this.deliveriesRepo.manager.query(
      `SELECT "senderUserId", "recipientUserId", "pickupStoreId", "dropoffStoreId"
         FROM store_dropoffs WHERE id = $1 LIMIT 1`,
      [dropoffId],
    );
    const dropoff = rows?.[0];
    if (!dropoff) throw new NotFoundException('Delivery not found');

    if (dropoff.senderUserId === actorUserId) return;
    if (dropoff.recipientUserId && dropoff.recipientUserId === actorUserId) return;

    const actor = await this.usersRepo.findOne({
      where: { id: actorUserId },
      select: ['id', 'adminRole', 'partnerStoreId'],
    });
    if (actor?.adminRole) return;
    // Staff read the chain for a package sitting on their own counter,
    // and nobody else's.
    if (
      actor?.partnerStoreId &&
      (actor.partnerStoreId === dropoff.pickupStoreId ||
       actor.partnerStoreId === dropoff.dropoffStoreId)
    ) return;

    throw new ForbiddenException('You are not a party to this delivery.');
  }

  private checkRateLimit(key: string, limit: number = RATE_LIMIT_PER_MIN) {
    const now = Date.now();
    const windowStart = now - 60_000;
    const recent = (this.issueAttempts.get(key) ?? []).filter(t => t > windowStart);
    if (recent.length >= limit) {
      throw new ForbiddenException('Too many requests - wait 60 seconds and try again');
    }
    recent.push(now);
    this.issueAttempts.set(key, recent);
  }
}
