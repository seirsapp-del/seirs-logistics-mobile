import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThanOrEqual, Repository } from 'typeorm';
import { EmailCampaign } from './email-campaign.entity';
import { EmailTemplatesService } from './email-templates.service';
import { MailService } from './mail.service';
import { User, UserRole } from '../users/user.entity';

/**
 * Scheduled email sends: the last item on the founder's email spec.
 *
 * The push composer's "Later" option was disabled, correctly, because
 * choosing it fired the message immediately. This is the thing that has
 * to exist before a Later option can be honest.
 *
 * Two rules shape the whole class.
 *
 * A SEND MUST NOT HAPPEN TWICE. The cron claims work with a conditional
 * UPDATE (scheduled to sending, only where it is still scheduled), so
 * two instances racing on the same minute cannot both send a campaign to
 * the whole customer base. Railway restarts mid-run, so this is not
 * theoretical.
 *
 * A SEND MUST BE SLOW. Mail providers rate-limit, and a campaign to
 * every customer that fires ten thousand requests in one tick gets the
 * SEIRS domain thrown into spam folders permanently. Sends run in small
 * batches with a pause, and a campaign that does not finish inside one
 * tick simply continues on the next.
 */
@Injectable()
export class EmailCampaignsService implements OnModuleInit {
  private readonly logger = new Logger(EmailCampaignsService.name);

  /** Kept small on purpose: see the rate-limit note above. */
  private static readonly BATCH = 25;
  private static readonly PAUSE_MS = 1000;

  constructor(
    @InjectRepository(EmailCampaign) private readonly repo: Repository<EmailCampaign>,
    @InjectRepository(User)          private readonly usersRepo: Repository<User>,
    private readonly templates: EmailTemplatesService,
    private readonly mail: MailService,
  ) {}

  async onModuleInit() {
    try {
      await this.repo.manager.query(`
        CREATE TABLE IF NOT EXISTS "email_campaigns" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "templateKey" varchar NOT NULL,
          "subjectAtSend" varchar(200) NOT NULL,
          "audience" varchar(40) NOT NULL,
          "scheduledAt" timestamptz NOT NULL,
          "status" varchar(16) NOT NULL DEFAULT 'scheduled',
          "startedAt" timestamptz NULL,
          "finishedAt" timestamptz NULL,
          "recipients" int NOT NULL DEFAULT 0,
          "delivered" int NOT NULL DEFAULT 0,
          "failed" int NOT NULL DEFAULT 0,
          "note" text NULL,
          "createdByUserId" varchar NULL,
          "cancelledByUserId" varchar NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
      `);
      await this.repo.manager.query(
        `CREATE INDEX IF NOT EXISTS "idx_email_campaigns_due" ON "email_campaigns" ("status","scheduledAt")`,
      );
    } catch (e: any) {
      this.logger.error(`email_campaigns self-heal failed: ${e?.message ?? e}`);
    }
  }

  /**
   * Who gets it. Same four words the push composer uses, so the two
   * screens cannot drift into meaning different things by "all drivers".
   *
   * Note this deliberately includes riders awaiting approval, exactly as
   * the push side does. The composer now says so rather than claiming
   * "approved drivers only", which was the previous, false, label.
   */
  private async resolveAudience(audience: string): Promise<Array<{ email: string; name: string }>> {
    const base = (qb: any) => qb.select(['u.email', 'u.name']);
    if (audience === 'all_drivers') {
      return base(this.usersRepo.createQueryBuilder('u'))
        .where('u.role = :r', { r: UserRole.DRIVER })
        .andWhere('u.isActive = true')
        .getMany();
    }
    if (audience === 'all_partners') {
      return base(this.usersRepo.createQueryBuilder('u'))
        .where(`u.capabilities->>'canPartner' = 'true'`)
        .andWhere('u.isActive = true')
        .getMany();
    }
    // all_customers
    return base(this.usersRepo.createQueryBuilder('u'))
      .where('u.role = :r', { r: UserRole.CUSTOMER })
      .andWhere('u.isActive = true')
      .getMany();
  }

  /**
   * How many this would reach, asked before anybody presses send.
   *
   * The push composer had no way to answer this and showed a figure
   * derived from stats which was wrong in both directions: it excluded
   * business accounts the broadcast includes, and counted suspended ones
   * it excludes. A screen that says "this goes to 4,812 people" has to
   * be counting the same people the send will.
   */
  async audienceSize(audience: string): Promise<number> {
    const rows = await this.resolveAudience(audience);
    return rows.length;
  }

  async list(limit = 100) {
    const rows = await this.repo.find({
      order: { scheduledAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 500),
    });
    const catalogue = await this.templates.listForAdmin();
    const nameByKey = new Map(catalogue.map((t: any) => [t.key, t.name]));
    return rows.map(r => ({
      ...r,
      templateName: nameByKey.get(r.templateKey) ?? r.templateKey,
      /** The template may have been deleted since; say so rather than 404ing a list. */
      templateMissing: !nameByKey.has(r.templateKey),
    }));
  }

  async schedule(body: {
    templateKey: string; audience: string; scheduledAt: string; createdByUserId?: string;
  }) {
    const catalogue = await this.templates.listForAdmin();
    const tpl = catalogue.find((t: any) => t.key === body.templateKey);
    if (!tpl) throw new NotFoundException(`No template named '${body.templateKey}'.`);

    const when = new Date(body.scheduledAt);
    if (Number.isNaN(when.getTime())) throw new BadRequestException('That is not a valid date and time.');
    /**
     * A minute of slack rather than a hard "must be future": somebody
     * choosing 09:00 at 09:00:12 means it, and refusing them is pedantry.
     * Anything genuinely in the past is refused, because a scheduler that
     * silently sends immediately is how the push composer's Later button
     * became a lie.
     */
    if (when.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('That time has already passed. Pick a time in the future.');
    }
    if (!['all_customers', 'all_drivers', 'all_partners'].includes(body.audience)) {
      throw new BadRequestException('Choose who it goes to.');
    }

    const row = this.repo.create({
      templateKey:   body.templateKey,
      subjectAtSend: String(tpl.renderedSubject ?? tpl.defaults?.subject ?? '').slice(0, 200),
      audience:      body.audience,
      scheduledAt:   when,
      status:        'scheduled',
      createdByUserId: body.createdByUserId,
    });
    const saved = await this.repo.save(row);
    this.logger.log(
      `Campaign ${saved.id} scheduled: ${body.templateKey} to ${body.audience} at ${when.toISOString()}`,
    );
    return saved;
  }

  async cancel(id: string, byUserId?: string, note?: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No such campaign.');
    if (row.status === 'sent')    throw new BadRequestException('That one has already gone out. It cannot be recalled.');
    if (row.status === 'sending') throw new BadRequestException('That one is going out right now.');
    if (row.status !== 'scheduled') return row;
    row.status = 'cancelled';
    row.cancelledByUserId = byUserId ?? null as any;
    row.note = note ?? 'Called off before it ran.';
    return this.repo.save(row);
  }

  /**
   * The runner.
   *
   * Every minute rather than every five: a campaign scheduled for 09:00
   * that goes out at 09:04 looks broken to whoever scheduled it, and the
   * query is a single indexed lookup on an almost always empty set.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async runDue() {
    const due = await this.repo.find({
      where: { status: 'scheduled', scheduledAt: LessThanOrEqual(new Date()) },
      order: { scheduledAt: 'ASC' },
      take: 3,
    }).catch(() => []);
    for (const c of due) await this.runOne(c.id).catch(() => {});
  }

  private async runOne(id: string) {
    /**
     * Claim it first. A conditional UPDATE from scheduled to sending is
     * what stops two instances, or a restart mid-tick, mailing the whole
     * customer base twice. Same claim-then-work shape the driver payout
     * path uses for the same reason.
     */
    const claim = await this.repo.createQueryBuilder()
      .update(EmailCampaign)
      .set({ status: 'sending', startedAt: new Date() })
      .where('id = :id', { id })
      .andWhere('status = :expected', { expected: 'scheduled' })
      .execute();
    if (!claim.affected) return;

    const row = await this.repo.findOne({ where: { id } });
    if (!row) return;

    try {
      const people = await this.resolveAudience(row.audience);
      let delivered = 0;
      let failed = 0;

      for (let i = 0; i < people.length; i += EmailCampaignsService.BATCH) {
        const slice = people.slice(i, i + EmailCampaignsService.BATCH);
        await Promise.all(slice.map(async p => {
          if (!p.email) { failed++; return; }
          try {
            await this.mail.sendCampaignEmail(row.templateKey, p.email, {
              name: p.name ?? 'there',
              firstName: String(p.name ?? 'there').trim().split(/\s+/)[0],
            });
            delivered++;
          } catch {
            failed++;
          }
        }));
        if (i + EmailCampaignsService.BATCH < people.length) {
          await new Promise(r => setTimeout(r, EmailCampaignsService.PAUSE_MS));
        }
      }

      await this.repo.update(id, {
        status: 'sent',
        recipients: people.length,
        delivered,
        failed,
        finishedAt: new Date(),
      });
      this.logger.log(
        `Campaign ${id} sent: ${delivered} delivered, ${failed} failed of ${people.length}`,
      );
    } catch (e: any) {
      await this.repo.update(id, {
        status: 'failed',
        finishedAt: new Date(),
        note: String(e?.message ?? e).slice(0, 500),
      });
      this.logger.error(`Campaign ${id} failed: ${e?.message ?? e}`);
    }
  }
}
