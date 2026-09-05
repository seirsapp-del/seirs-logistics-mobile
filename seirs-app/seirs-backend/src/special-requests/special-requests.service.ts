import {
  Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import {
  SpecialRequest, SpecialRequestStatus, SpecialRequestCategory,
} from './special-request.entity';
import {
  SpecialRequestQuote, SpecialRequestCall, QuoteLine, QuoteLineKind,
} from './special-request-quote.entity';
import { FeesService } from '../fees/fees.service';
import { secureCode } from '../common/utils/auth-codes';
import { rangeStart, rangeEnd } from '../common/utils/date-range';

/**
 * Jobs the rate card cannot price.
 *
 * The whole feature exists because some things have no fare until a person
 * looks at them. Everything below defends that: nothing is bookable, no
 * rider is assignable, and no money is taken until an admin has written a
 * number down and the sender has accepted it while it was still valid.
 */
@Injectable()
export class SpecialRequestsService {
  private readonly logger = new Logger(SpecialRequestsService.name);

  constructor(
    @InjectRepository(SpecialRequest)      private requests: Repository<SpecialRequest>,
    @InjectRepository(SpecialRequestQuote) private quotes: Repository<SpecialRequestQuote>,
    @InjectRepository(SpecialRequestCall)  private calls: Repository<SpecialRequestCall>,
    private readonly fees: FeesService,
  ) {}

  /** Statuses where the sender can still walk away. */
  private static readonly WITHDRAWABLE = [
    SpecialRequestStatus.SUBMITTED,
    SpecialRequestStatus.IN_REVIEW,
    SpecialRequestStatus.QUOTED,
    SpecialRequestStatus.ESCALATED,
  ];

  /** Statuses an admin can still act on. */
  private static readonly OPEN = [
    SpecialRequestStatus.SUBMITTED,
    SpecialRequestStatus.IN_REVIEW,
    SpecialRequestStatus.QUOTED,
    SpecialRequestStatus.ESCALATED,
  ];

  private async uniqueReference(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const candidate = 'SRQ-' + secureCode(5);
      const clash = await this.requests.findOne({
        where: { reference: candidate }, select: ['id'] as any,
      });
      if (!clash) return candidate;
    }
    return 'SRQ-' + secureCode(7);
  }

  // ── Sender ─────────────────────────────────────────────────────────────

  async create(userId: string, body: any) {
    const description = String(body?.description ?? '').trim();
    if (description.length < 10) {
      throw new BadRequestException(
        'Tell us what needs moving, in a sentence or two. A quote on a job like this is guesswork without it.',
      );
    }
    const pickupAddress  = String(body?.pickupAddress ?? '').trim();
    const dropoffAddress = String(body?.dropoffAddress ?? '').trim();
    if (!pickupAddress || !dropoffAddress) {
      throw new BadRequestException('We need both addresses before anyone can price this.');
    }

    const category = Object.values(SpecialRequestCategory).includes(body?.category)
      ? body.category as SpecialRequestCategory
      : SpecialRequestCategory.OTHER;

    const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : null);

    const saved = await this.requests.save(this.requests.create({
      reference:    await this.uniqueReference(),
      senderUserId: userId,
      status:       SpecialRequestStatus.SUBMITTED,
      category,
      description:  description.slice(0, 4000),
      weightKg:     num(body?.weightKg) != null ? String(num(body?.weightKg)) : null,
      lengthCm:     num(body?.lengthCm),
      widthCm:      num(body?.widthCm),
      heightCm:     num(body?.heightCm),
      liftingHands: num(body?.liftingHands),
      fragile:               !!body?.fragile,
      hazardous:             !!body?.hazardous,
      temperatureControlled: !!body?.temperatureControlled,
      timeCriticality: body?.timeCriticality ? String(body.timeCriticality).slice(0, 1000) : null,
      pickupAddress:  pickupAddress.slice(0, 500),
      pickupLat:      num(body?.pickupLat)  != null ? String(num(body?.pickupLat))  : null,
      pickupLng:      num(body?.pickupLng)  != null ? String(num(body?.pickupLng))  : null,
      dropoffAddress: dropoffAddress.slice(0, 500),
      dropoffLat:     num(body?.dropoffLat) != null ? String(num(body?.dropoffLat)) : null,
      dropoffLng:     num(body?.dropoffLng) != null ? String(num(body?.dropoffLng)) : null,
      accessPickup:   body?.accessPickup  ? String(body.accessPickup).slice(0, 1000)  : null,
      accessDropoff:  body?.accessDropoff ? String(body.accessDropoff).slice(0, 1000) : null,
      pickupContactName:   body?.pickupContactName   ?? null,
      pickupContactPhone:  body?.pickupContactPhone  ?? null,
      dropoffContactName:  body?.dropoffContactName  ?? null,
      dropoffContactPhone: body?.dropoffContactPhone ?? null,
      photoUrls: Array.isArray(body?.photoUrls) ? body.photoUrls.slice(0, 12) : null,
      /**
       * Recorded at submission, not at acceptance.
       *
       * The terms are about what is IN the crate, which is a thing only the
       * sender knows and only at the moment they describe it. Asking later,
       * next to a price, turns a declaration into a hurdle between somebody
       * and a number they already want.
       */
      liabilityAcceptedAt: body?.acceptedLiability ? new Date() : null,
    }));

    return {
      id: saved.id,
      reference: saved.reference,
      status: saved.status,
      message: 'Sent. Our team will look at it and come back with a price. '
             + 'Nothing is booked and nothing is charged until you accept a quote.',
    };
  }

  async listMine(userId: string) {
    const rows = await this.requests.find({
      where: { senderUserId: userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    if (!rows.length) return [];
    const current = await this.currentQuotes(rows.map(r => r.id));
    return rows.map(r => this.forSender(r, current.get(r.id) ?? null));
  }

  async mine(userId: string, id: string) {
    const req = await this.requests.findOne({ where: { id } });
    if (!req || req.senderUserId !== userId) {
      // Same answer for "not yours" and "does not exist": a different
      // message for each turns this into a way to test whether a reference
      // is real.
      throw new NotFoundException('That request was not found.');
    }
    const [quote] = await this.quotes.find({
      where: { requestId: id, supersededAt: IsNull() as any },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    return this.forSender(req, quote ?? null);
  }

  /**
   * What the SENDER may see.
   *
   * A named shape rather than the row, and the reason is the two leaks
   * fixed earlier tonight: an endpoint that returns an entity and trusts a
   * later branch to strip it is one refactor from handing over everything.
   * The escalation trail, the call log, the assigned admin and every
   * superseded quote stay on the admin route and have no path here.
   */
  private forSender(r: SpecialRequest, quote: SpecialRequestQuote | null) {
    const expired = quote ? new Date(quote.expiresAt).getTime() < Date.now() : false;
    return {
      id: r.id,
      reference: r.reference,
      status: r.status,
      category: r.category,
      description: r.description,
      pickupAddress: r.pickupAddress,
      dropoffAddress: r.dropoffAddress,
      photoUrls: r.photoUrls ?? [],
      createdAt: r.createdAt,
      declineReason: r.declineReason,
      deliveryId: r.deliveryId,
      quote: quote ? {
        id: quote.id,
        lines: quote.lines,
        totalNgn: Number(quote.totalNgn),
        expiresAt: quote.expiresAt,
        note: quote.note,
        expired,
        acceptedAt: quote.acceptedAt,
      } : null,
    };
  }

  private async currentQuotes(ids: string[]) {
    const rows = ids.length ? await this.quotes.find({
      where: { requestId: In(ids), supersededAt: IsNull() as any },
    }) : [];
    return new Map(rows.map(q => [q.requestId, q]));
  }

  async withdraw(userId: string, id: string) {
    const req = await this.requests.findOne({ where: { id } });
    if (!req || req.senderUserId !== userId) throw new NotFoundException('That request was not found.');
    if (!SpecialRequestsService.WITHDRAWABLE.includes(req.status)) {
      throw new BadRequestException('This one has gone too far to withdraw. Message support and they will sort it out.');
    }
    await this.requests.update(id, { status: SpecialRequestStatus.WITHDRAWN });
    return { message: 'Withdrawn. Nothing has been charged.' };
  }

  /**
   * The sender takes the price.
   *
   * Accepts the CURRENT quote and refuses a stale one, so no quote id
   * travels to the app and a screen cannot accept something we have since
   * replaced. Expiry is checked here rather than trusted from the client,
   * because the client's clock is not ours and the loss on an honoured
   * stale quote is ours either way.
   */
  async accept(userId: string, id: string) {
    const req = await this.requests.findOne({ where: { id } });
    if (!req || req.senderUserId !== userId) throw new NotFoundException('That request was not found.');
    if (req.status !== SpecialRequestStatus.QUOTED) {
      throw new BadRequestException('There is no price on this one to accept yet.');
    }

    const [quote] = await this.quotes.find({
      where: { requestId: id, supersededAt: IsNull() as any },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    if (!quote) throw new BadRequestException('There is no price on this one to accept yet.');

    if (new Date(quote.expiresAt).getTime() < Date.now()) {
      await this.requests.update(id, { status: SpecialRequestStatus.EXPIRED });
      throw new BadRequestException(
        'That price has expired. Fuel and labour move, so we cannot hold a quote indefinitely. '
        + 'Ask us to price it again and we will come straight back.',
      );
    }

    await this.quotes.update(quote.id, { acceptedAt: new Date() } as any);
    await this.requests.update(id, { status: SpecialRequestStatus.ACCEPTED });

    return {
      message: 'Accepted. Our team will confirm and arrange the move.',
      totalNgn: Number(quote.totalNgn),
      reference: req.reference,
    };
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  async adminQueue(status?: string, from?: string, to?: string) {
    const qb = this.requests.createQueryBuilder('r').orderBy('r.createdAt', 'ASC');
    if (status) qb.andWhere('r.status = :status', { status });
    else        qb.andWhere('r.status IN (:...open)', { open: SpecialRequestsService.OPEN });

    // Ranged on createdAt, the column this queue orders by.
    const f = rangeStart(from);
    const t = rangeEnd(to);
    if (f) qb.andWhere('r.createdAt >= :f', { f });
    if (t) qb.andWhere('r.createdAt <  :t', { t });

    const rows = await qb.take(200).getMany();
    const current = await this.currentQuotes(rows.map(r => r.id));
    return rows.map(r => ({
      ...r,
      currentQuote: current.get(r.id) ?? null,
      waitingHours: Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 3_600_000),
    }));
  }

  /** The full record, staff only. Everything the sender's route withholds. */
  async adminDetail(id: string) {
    const req = await this.requests.findOne({ where: { id } });
    if (!req) throw new NotFoundException('Request not found.');
    return {
      ...req,
      quotes: await this.quotes.find({ where: { requestId: id }, order: { createdAt: 'DESC' } }),
      calls:  await this.calls.find({ where: { requestId: id }, order: { createdAt: 'DESC' } }),
    };
  }

  /**
   * Write a price down, itemised, with an expiry.
   *
   * A bare total is refused. On a job somebody has never bought before, a
   * large number with nothing behind it reads as a demand rather than a
   * price, and it gives them nothing to argue with. Every line is a thing
   * they can picture.
   */
  async quote(id: string, adminId: string | undefined, body: {
    lines?: QuoteLine[]; note?: string; expiresInHours?: number;
  }) {
    const req = await this.requests.findOne({ where: { id } });
    if (!req) throw new NotFoundException('Request not found.');
    if (!SpecialRequestsService.OPEN.includes(req.status)) {
      throw new BadRequestException('This request is closed. Nothing can be quoted on it.');
    }

    const lines = Array.isArray(body?.lines) ? body.lines : [];
    if (!lines.length) {
      throw new BadRequestException(
        'A quote needs its lines. A total on its own tells the customer nothing and gives them nothing to question.',
      );
    }
    for (const l of lines) {
      if (!Object.values(QuoteLineKind).includes(l?.kind as QuoteLineKind)) {
        throw new BadRequestException(`"${l?.kind}" is not a kind of line.`);
      }
      if (!String(l?.label ?? '').trim()) {
        throw new BadRequestException('Every line needs a label the customer can read.');
      }
      if (!Number.isFinite(Number(l?.amountNgn))) {
        throw new BadRequestException(`The ${l.kind} line has no amount.`);
      }
    }

    const totalNgn = lines.reduce((s, l) => s + Number(l.amountNgn), 0);
    if (totalNgn <= 0) throw new BadRequestException('A quote has to come to more than nothing.');

    /**
     * How long the price stands, from the Fee Catalogue.
     *
     * Read, never seeded: production may already hold a number somebody
     * chose. 48 hours is the fallback, not a decision recorded here.
     */
    const hours = Number(body?.expiresInHours)
      || Number(await this.fees.getValueOr('special_quote_expiry_hours', 48).catch(() => 48))
      || 48;

    // Any previous quote is kept and marked, never overwritten: this is
    // the record of what we offered and when.
    await this.quotes.update(
      { requestId: id, supersededAt: IsNull() as any },
      { supersededAt: new Date() } as any,
    );

    const saved = await this.quotes.save(this.quotes.create({
      requestId: id,
      lines,
      totalNgn: totalNgn.toFixed(2),
      expiresAt: new Date(Date.now() + hours * 3_600_000),
      quotedByAdminId: adminId ?? null,
      note: body?.note?.trim()?.slice(0, 2000) ?? null,
    }));

    await this.requests.update(id, {
      status: SpecialRequestStatus.QUOTED,
      assignedAdminId: adminId ?? null,
    } as any);

    return { quoteId: saved.id, totalNgn, expiresAt: saved.expiresAt, message: 'Quote sent to the customer.' };
  }

  async decline(id: string, adminId: string | undefined, reason?: string) {
    const r = String(reason ?? '').trim();
    if (!r) {
      throw new BadRequestException(
        'A decline needs a reason. "No" with nothing after it cannot be acted on by the customer or explained by whoever picks this up next.',
      );
    }
    const req = await this.requests.findOne({ where: { id } });
    if (!req) throw new NotFoundException('Request not found.');

    await this.requests.update(id, {
      status: SpecialRequestStatus.DECLINED,
      declineReason: r.slice(0, 2000),
      assignedAdminId: adminId ?? null,
    } as any);
    return { message: 'Declined, and the customer has been told why.' };
  }

  /** Hand it to somebody who knows. Unsure is a legitimate answer. */
  async escalate(id: string, adminId: string | undefined, toAdminId?: string, note?: string) {
    const req = await this.requests.findOne({ where: { id } });
    if (!req) throw new NotFoundException('Request not found.');
    if (!String(note ?? '').trim()) {
      throw new BadRequestException('Say what you are unsure about, or the next person starts from nothing.');
    }
    await this.requests.update(id, {
      status: SpecialRequestStatus.ESCALATED,
      escalatedToAdminId: toAdminId ?? null,
      escalationNote: String(note).slice(0, 2000),
      assignedAdminId: adminId ?? null,
    } as any);
    return { message: 'Escalated.' };
  }

  /** On these jobs the call IS the product, and there was nowhere to put it. */
  async logCall(id: string, adminId: string | undefined, body: {
    connected?: boolean; spokeTo?: string; notes?: string;
  }) {
    const req = await this.requests.findOne({ where: { id }, select: ['id'] as any });
    if (!req) throw new NotFoundException('Request not found.');

    const connected = body?.connected !== false;
    if (connected && !String(body?.notes ?? '').trim()) {
      throw new BadRequestException('Write down what was agreed, or the call may as well not have happened.');
    }
    await this.calls.save(this.calls.create({
      requestId: id,
      adminUserId: adminId ?? null,
      calledAt: connected ? new Date() : null,
      spokeTo: body?.spokeTo?.trim()?.slice(0, 120) ?? null,
      notes: body?.notes?.trim()?.slice(0, 4000) ?? null,
    }));
    return { message: connected ? 'Call recorded.' : 'Recorded that the call did not connect.' };
  }

  /**
   * Quotes that nobody accepted in time.
   *
   * Marked expired rather than left sitting at "quoted" forever, so the
   * queue's own counts stay honest and a stale price cannot be accepted by
   * a screen that loaded before it lapsed.
   */
  async expireStaleQuotes(): Promise<number> {
    const stale = await this.quotes.find({
      where: { supersededAt: IsNull() as any, acceptedAt: IsNull() as any },
      take: 500,
    });
    const now = Date.now();
    let n = 0;
    for (const q of stale) {
      if (new Date(q.expiresAt).getTime() >= now) continue;
      const req = await this.requests.findOne({ where: { id: q.requestId }, select: ['id', 'status'] as any });
      if (req?.status !== SpecialRequestStatus.QUOTED) continue;
      await this.requests.update(q.requestId, { status: SpecialRequestStatus.EXPIRED });
      n++;
    }
    return n;
  }
}
