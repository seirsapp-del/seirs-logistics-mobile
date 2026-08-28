import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLogEntry } from '../admin/audit-log.entity';
import { User, UserRole } from '../users/user.entity';
import {
  AccountRow,
  DeletionOutcome,
  EntityCount,
  LAUNCH_RESET_PHRASE,
  LaunchResetReport,
  PreservedTable,
  SkipReason,
  SkippedAccount,
} from './launch-reset.types';

/**
 * The launch reset.
 *
 * On launch day the database is full of things that never happened:
 * seeded marketing accounts, the scenario cohort, deliveries nobody
 * booked, earnings nobody rode for, chat threads from QA. Somebody has
 * to clear that without destroying the things that took weeks to tune.
 *
 * Doing it by hand, at 2am, against production, is how a real
 * customer's account gets deleted. This service exists so the clear-out
 * is a deliberate, reviewable act instead of a sequence of ad-hoc
 * DELETE statements typed into a psql prompt.
 *
 * Four rules, decided before a line of this was written:
 *
 *  1. PREVIEW FIRST. Every reset is a dry run before it is a delete,
 *     and the dry run must be honest. Preview and execute walk the SAME
 *     ordered TARGETS table and build the SAME predicate from the SAME
 *     resolved id sets. Preview runs SELECT COUNT over each predicate,
 *     execute runs DELETE over it. There is one definition of "what is
 *     in scope", so the preview cannot describe a different set from
 *     the one the delete touches.
 *
 *  2. SCOPED BY isDemo. That is the flag every money and dispatch guard
 *     already reads (users.isDemo), and it is what DemoDataService
 *     stamps on everything it seeds. Demo accounts and the records
 *     hanging off them are the target; nothing else is even a
 *     candidate.
 *
 *  3. MONEY WINS OVER THE FLAG. A demo flag is a label somebody typed.
 *     Money that moved is a fact. If an account has a real payment, a
 *     released escrow, a paid or in-flight earning, a driver_payouts
 *     row or a paid partner payout, it is NOT deletable no matter what
 *     isDemo says, and it is reported as skipped with the reason and
 *     the amount. Emeka Nwachukwu is exactly this case: a seeded rider
 *     who has genuinely been paid 1,322.71.
 *
 *  4. CONFIGURATION SURVIVES. The rate card, the fee catalogue, the
 *     service categories, the email templates and the zone surcharges
 *     inside the rate card are weeks of tuned policy, not test data.
 *     Deleting the rate card would take the platform down. Nothing in
 *     TARGETS touches them, and PRESERVED lists them on the screen so
 *     the admin can see what is being kept.
 *
 * Never wrapped in one transaction, on purpose. See runDeletion().
 */
@Injectable()
export class LaunchResetService {
  private readonly logger = new Logger(LaunchResetService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(AuditLogEntry) private readonly auditRepo: Repository<AuditLogEntry>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * What WOULD be removed. Reads only. Safe to call as often as anyone
   * wants, including from a page that polls.
   */
  async preview(admin: any, ip?: string): Promise<LaunchResetReport> {
    await this.assertActorMayReset(admin);

    const report = await this.buildReport(admin);

    // Even a look is worth a row: knowing who inspected the reset and
    // when is part of the story if the real run goes wrong later.
    await this.logAudit(admin, 'launch_reset.preview', 'launch:reset', {
      candidates: report.accounts.candidates,
      deletable:  report.accounts.deletable,
      skipped:    report.accounts.skipped,
      totalRows:  report.totalRows,
    }, ip);

    return report;
  }

  /**
   * The real thing.
   *
   * Refuses without the typed phrase, and refuses unless the admin
   * echoes back the number of accounts the preview showed them. The
   * phrase stops a stray click; the echoed count stops a replayed
   * request, because a POST captured against yesterday's preview no
   * longer matches today's set and is rejected rather than replayed
   * against accounts nobody reviewed.
   */
  async execute(
    admin: any,
    body: { confirm?: string; expectedDeletableAccounts?: number },
    ip?: string,
  ): Promise<LaunchResetReport> {
    await this.assertActorMayReset(admin);

    if ((body?.confirm ?? '').trim() !== LAUNCH_RESET_PHRASE) {
      throw new BadRequestException(
        `Type the exact phrase "${LAUNCH_RESET_PHRASE}" to confirm. Nothing was deleted.`,
      );
    }

    // Recomputed here rather than trusted from the client. The preview
    // the admin looked at is evidence of intent, not an input.
    const report = await this.buildReport(admin);

    const expected = body?.expectedDeletableAccounts;
    if (typeof expected !== 'number' || !Number.isInteger(expected)) {
      throw new BadRequestException(
        'expectedDeletableAccounts is required. Re-run the preview and confirm against what it shows.',
      );
    }
    if (expected !== report.accounts.deletable) {
      throw new ConflictException(
        `The set changed since the preview: it showed ${expected} deletable account(s), ` +
        `there are now ${report.accounts.deletable}. Nothing was deleted. Re-run the preview and read it again.`,
      );
    }

    if (report.accounts.deletable === 0) {
      // Not an error. A second run after a clean one lands here, which
      // is exactly what an idempotent operation should do.
      return { ...report, dryRun: false, deleted: [], failures: [], complete: true };
    }

    const ids = await this.resolveIdSets(report.deletable.map(a => a.id));

    await this.logAudit(admin, 'launch_reset.started', 'launch:reset', {
      deletableAccounts: report.accounts.deletable,
      skippedAccounts:   report.accounts.skipped,
      plannedRows:       report.totalRows,
      userIds:           ids.userIds,
    }, ip);

    // Written BEFORE the delete. If the run dies halfway, the record of
    // who was spared and why, and who was lined up, still exists.
    await this.auditDecisions(admin, report.skipped, report.deletable, ip);

    const { deleted, failures } = await this.runDeletion(ids);

    // And the confirmation is written AFTER, and only if the users
    // statement actually succeeded. An audit row that says "deleted"
    // about an account still sitting in the table is worse than no row:
    // it is the thing somebody will trust six months from now.
    const usersOutcome = deleted.find(d => d.table === 'users');
    if (usersOutcome && !usersOutcome.error) {
      await this.auditDeleted(admin, report.deletable, ip);
    }

    const complete = failures.length === 0;
    await this.logAudit(admin, 'launch_reset.finished', 'launch:reset', {
      complete,
      rowsDeleted: deleted.reduce((n, d) => n + Math.max(0, d.deleted), 0),
      tablesTouched: deleted.filter(d => d.deleted > 0).map(d => `${d.table}:${d.deleted}`),
      failures: failures.map(f => `${f.table}: ${f.error}`),
    }, ip);

    // Reports what the DELETE actually returned, not what was planned.
    // A run that failed on the users statement removed nothing, and a
    // log line claiming otherwise is the first thing somebody reads.
    this.logger.warn(
      `Launch reset by ${admin?.name ?? admin?.id}: ` +
      `${usersOutcome?.deleted ?? 0} of ${report.accounts.deletable} account(s) removed, ` +
      `${report.accounts.skipped} kept, ${failures.length} statement(s) failed`,
    );

    return { ...report, dryRun: false, deleted, failures, complete };
  }

  // ── Authorization ────────────────────────────────────────────────────────

  /**
   * A guard proves identity, not standing.
   *
   * SuperAdminGuard already answered "is this token a super admin", and
   * it reads the role live so a demotion takes effect inside the token
   * window. This adds the checks the guard cannot make, against the
   * actor's own row rather than against the token: the account still
   * exists, is still active, is still staff, and is not itself a demo
   * account. A seeded admin running the reset that deletes seeded
   * accounts is a loop nobody wants to debug at 2am.
   */
  private async assertActorMayReset(admin: any): Promise<void> {
    const actorId = admin?.id ?? admin?.sub;
    if (!actorId) throw new ForbiddenException('No acting admin on this request.');

    const row = await this.usersRepo.findOne({
      where:  { id: actorId },
      select: ['id', 'role', 'isActive', 'isDemo', 'name', 'deletionScheduledAt'],
    });
    if (!row) {
      throw new ForbiddenException('The acting admin account no longer exists.');
    }
    if (row.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only a staff account can run the launch reset.');
    }
    if (!row.isActive) {
      throw new ForbiddenException('This staff account is deactivated.');
    }
    if (row.isDemo) {
      throw new ForbiddenException('A demo account cannot run the launch reset.');
    }
    if (row.deletionScheduledAt) {
      throw new ForbiddenException('This staff account is pending deletion.');
    }
  }

  // ── The report, shared by preview and execute ────────────────────────────

  private async buildReport(admin: any): Promise<LaunchResetReport> {
    const candidates = await this.loadCandidates();
    const { deletable, skipped } = await this.classifyAccounts(candidates, admin?.id ?? admin?.sub);

    const ids = await this.resolveIdSets(deletable.map(a => a.id));
    const entities = await this.countEntities(ids);

    return {
      dryRun:             true,
      generatedAt:        new Date().toISOString(),
      confirmationPhrase: LAUNCH_RESET_PHRASE,
      scope: {
        flag: 'users.isDemo',
        note:
          'Only accounts carrying the isDemo flag are candidates. That is the same flag ' +
          'every money and dispatch guard reads, and the flag DemoDataService stamps on ' +
          'everything it seeds. A real account is never selected.',
      },
      accounts: {
        candidates: candidates.length,
        deletable:  deletable.length,
        skipped:    skipped.length,
      },
      deletable,
      skipped,
      entities,
      totalRows: entities.reduce((n, e) => n + Math.max(0, e.rows), 0),
      preserved: PRESERVED,
      notes: NOTES,
    };
  }

  /** Every account in scope, before the money rules are applied. */
  private async loadCandidates(): Promise<AccountRow[]> {
    const rows = await this.ds.query(
      `SELECT id::text AS id, name, email, "accountId", role::text AS role, "isDemo"
         FROM "users"
        WHERE "isDemo" = true
        ORDER BY role, name`,
    );
    return (rows ?? []).map((r: any) => ({
      id:        r.id,
      name:      r.name,
      email:     r.email,
      accountId: r.accountId ?? null,
      role:      r.role,
      isDemo:    Boolean(r.isDemo),
    }));
  }

  /**
   * The hard requirement: which candidates may actually be deleted.
   *
   * Every rule here makes an account NON-deletable, and each one
   * reports its rows and its amount so the screen can say WHY and HOW
   * MUCH rather than just refusing. They run in bulk over the whole
   * candidate set, and in a fixed order, because the last rule depends
   * on the answer the money rules gave.
   *
   *   R1  a real payment at the processor
   *   R2  an escrow released to a driver
   *   R3  an earning marked paid, or in flight
   *   R4  a driver_payouts row: a bank transfer that left SEIRS
   *   R4b a partner payout already paid
   *   R6  a staff account, whatever isDemo says
   *   R7  the account running the reset
   *   R8  sharing a delivery or a drop-off with an account being kept,
   *       which runs last because it depends on what the others decided
   */
  private async classifyAccounts(
    candidates: AccountRow[],
    actorId: string,
  ): Promise<{ deletable: AccountRow[]; skipped: SkippedAccount[] }> {
    if (candidates.length === 0) return { deletable: [], skipped: [] };

    const ids = candidates.map(c => c.id);
    const reasons = new Map<string, SkipReason[]>();
    const add = (userId: string, r: SkipReason) => {
      const list = reasons.get(userId) ?? [];
      list.push(r);
      reasons.set(userId, list);
    };

    // R1 + R2. A payment that reached the processor, or an escrow that
    // was released to a driver. Both mean naira left a real card. A
    // refund counts: the money moved out and back, and the row is the
    // evidence. A Flutterwave transaction id counts even where the
    // status never settled, because the charge exists at the provider
    // whatever our row says.
    await this.tally(
      `SELECT p."customerId"::text            AS "userId",
              COUNT(*)::int                   AS rows,
              COALESCE(SUM(p."amountKobo"), 0) AS kobo,
              BOOL_OR(p."escrowStatus" = 'released') AS escrow
         FROM "payments" p
        WHERE p."customerId"::text = ANY($1::text[])
          AND ( p."status" IN ('success', 'refunded')
                OR p."escrowStatus" = 'released'
                OR p."flutterwaveTransactionId" IS NOT NULL )
        GROUP BY p."customerId"`,
      [ids],
      (r: any) => {
        const amount = (Number(r.kobo ?? 0) / 100).toFixed(2);
        add(r.userId, {
          code:      r.escrow ? 'escrow_released' : 'real_payment',
          reason:    r.escrow
            ? 'Escrow on this account was released to a driver. That money has already moved.'
            : 'This account has a real payment at the processor. A demo flag does not undo a charge.',
          rows:      Number(r.rows ?? 0),
          amountNgn: amount,
        });
      },
      'payments',
    );

    // R3. Earnings the rider has been paid, or that are mid-transfer.
    // `paying` is a claim held across the Flutterwave call: the money
    // may be in the air right now, so it blocks exactly like `paid`.
    await this.tally(
      `SELECT e."driver_id"::text AS "userId",
              COUNT(*)::int       AS rows,
              COALESCE(SUM(e."driver_net"), 0)::numeric AS ngn
         FROM "driver_earnings" e
        WHERE e."driver_id"::text = ANY($1::text[])
          AND e."status" IN ('paid', 'paying')
        GROUP BY e."driver_id"`,
      [ids],
      (r: any) => add(r.userId, {
        code:      'earning_paid',
        reason:    'This rider has earnings marked paid or in flight. Deleting them erases a settled ledger.',
        rows:      Number(r.rows ?? 0),
        amountNgn: Number(r.ngn ?? 0).toFixed(2),
      }),
      'driver_earnings',
    );

    // R4. The strongest fact available: a row in driver_payouts is one
    // bank transfer that actually left SEIRS. This is the table that
    // exists precisely because "earnings marked paid" was not the same
    // thing as "money sent", and it is the rule that saves Emeka.
    await this.tally(
      `SELECT p."driver_id"::text AS "userId",
              COUNT(*)::int       AS rows,
              COALESCE(SUM(p."sent_ngn"), 0)::numeric AS ngn
         FROM "driver_payouts" p
        WHERE p."driver_id"::text = ANY($1::text[])
        GROUP BY p."driver_id"`,
      [ids],
      (r: any) => add(r.userId, {
        code:      'driver_payout',
        reason:    'A bank transfer has left SEIRS to this account. The books have to keep pointing at somebody.',
        rows:      Number(r.rows ?? 0),
        amountNgn: Number(r.ngn ?? 0).toFixed(2),
      }),
      'driver_payouts',
    );

    // R4b. The same fact on the partner-store side. A paid partner
    // payout is money out of the company account, and the store owner
    // is the account it was paid against.
    await this.tally(
      `SELECT s."userId"::text AS "userId",
              COUNT(*)::int    AS rows,
              COALESCE(SUM(pp."amount"), 0)::numeric AS ngn
         FROM "partner_payouts" pp
         JOIN "partner_stores" s ON s."id"::text = pp."partnerStoreId"::text
        WHERE s."userId"::text = ANY($1::text[])
          AND pp."status" = 'paid'
        GROUP BY s."userId"`,
      [ids],
      (r: any) => add(r.userId, {
        code:      'partner_payout',
        reason:    'A partner payout has been paid against this store. That is money out of the company account.',
        rows:      Number(r.rows ?? 0),
        amountNgn: Number(r.ngn ?? 0).toFixed(2),
      }),
      'partner_payouts',
    );

    // R5 is the scope itself: only isDemo accounts are ever loaded as
    // candidates, so a real account cannot reach any rule below.

    // R6. Staff are never test data, even when somebody has flipped
    // isDemo on one. Deleting an admin account here would silently
    // route around the offboarding flow and its own checks.
    for (const c of candidates) {
      if (c.role === UserRole.ADMIN) {
        add(c.id, {
          code:      'staff_account',
          reason:    'Staff accounts are out of scope for the launch reset. Offboard them through Staff Management.',
          rows:      1,
          amountNgn: null,
        });
      }
    }

    // R7. Never the account running this.
    //
    // assertActorMayReset already refuses a demo actor, so in practice
    // nothing reaches here. It is written anyway because the two checks
    // answer different questions: that one asks whether this actor may
    // run a reset, this one asks whether this actor may be deleted BY
    // one. Authorization is about the actor against the resource, and
    // an admin is not authorized over their own removal just because
    // their token is valid.
    for (const c of candidates) {
      if (actorId && c.id === actorId) {
        add(c.id, {
          code:      'acting_admin',
          reason:    'This is the account running the reset. Nobody deletes themselves mid-operation.',
          rows:      1,
          amountNgn: null,
        });
      }
    }

    // R8. Shared records, settled to a fixed point. Runs LAST.
    //
    // This one is not a money rule, it is the referential one, and it
    // has to run AFTER the money rules because it depends on their
    // answer. Deliveries carry no cascade on customer or on driver, and
    // driver_earnings carries onDelete RESTRICT on both its driver and
    // its delivery. So if a delivery has one party being removed and
    // one party being kept, there is no order that works: deleting the
    // delivery breaks the kept party's ledger, and NOT deleting it
    // makes the removal of the other party fail on a foreign key.
    //
    // The resolution is that sharing a record with a KEPT account is
    // itself a reason to be kept. That includes real accounts, and it
    // includes demo accounts held back by the money rules, which is the
    // case that actually bites: a seeded customer whose six deliveries
    // were all ridden by the rider who has genuinely been paid cannot
    // be removed without destroying his settled ledger.
    //
    // It iterates because blocking one account can strand another. Each
    // pass only ever shrinks the deletable set, so it converges; the
    // cap is a guard against a pathological graph, not an expectation.
    let deletableIds = candidates
      .filter(c => !reasons.has(c.id))
      .map(c => c.id);

    for (let pass = 0; pass < 10; pass++) {
      const stranded = await this.strandedBySharedRecords(ids, deletableIds);
      const fresh = [...stranded.entries()].filter(([userId]) => deletableIds.includes(userId));
      if (fresh.length === 0) break;

      for (const [userId, rows] of fresh) {
        add(userId, {
          code:   'shared_history',
          reason:
            'This account shares a delivery or a store drop-off with an account that is being kept. ' +
            'There is no order of deletes that removes one without damaging the other.',
          rows,
          amountNgn: null,
        });
      }
      deletableIds = deletableIds.filter(id => !stranded.has(id));

      if (pass === 9) {
        this.logger.warn('launch reset: shared-record pass hit its cap, treating the current set as final');
      }
    }

    const skipped: SkippedAccount[] = [];
    const deletable: AccountRow[]   = [];
    for (const c of candidates) {
      const rs = reasons.get(c.id);
      if (rs && rs.length > 0) {
        const amounts = rs
          .map(r => Number(r.amountNgn ?? 0))
          .filter(n => Number.isFinite(n) && n > 0);
        skipped.push({
          ...c,
          reasons: rs,
          topAmountNgn: amounts.length ? Math.max(...amounts).toFixed(2) : null,
        });
      } else {
        deletable.push(c);
      }
    }

    // Money first, so the expensive refusals sit at the top of the list.
    skipped.sort((a, b) => Number(b.topAmountNgn ?? 0) - Number(a.topAmountNgn ?? 0));
    return { deletable, skipped };
  }

  /**
   * Candidates who cannot be removed because a record they are on also
   * names somebody who is being KEPT.
   *
   * A delivery has two parties (the customer, and the rider behind the
   * driver profile) and a store drop-off has three (sender, recipient,
   * and the owner of the pickup store). A record is CLEAN when every
   * party it names is either absent or in the deletable set. Any
   * candidate standing on a record that is not clean is stranded and
   * has to stay.
   *
   * `<> ALL($2)` is "not in the deletable set", and it reads TRUE
   * against an empty array, which is the correct answer: with nothing
   * deletable, every party is a kept party.
   */
  private async strandedBySharedRecords(
    candidateIds: string[],
    deletableIds: string[],
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (candidateIds.length === 0 || deletableIds.length === 0) return out;

    const fold = (rows: any[]) => {
      for (const r of rows ?? []) {
        const id = r.userId;
        if (!id) continue;
        out.set(id, (out.get(id) ?? 0) + Number(r.rows ?? 0));
      }
    };

    if (await this.tableExists('deliveries')) {
      try {
        fold(await this.ds.query(
          `WITH parties AS (
             SELECT d."id",
                    d."customerId"::text AS p1,
                    dr."userId"::text    AS p2
               FROM "deliveries" d
               LEFT JOIN "drivers" dr ON dr."id" = d."driverId"
           ),
           dirty AS (
             SELECT * FROM parties
              WHERE (p1 IS NOT NULL AND p1 <> ALL($2::text[]))
                 OR (p2 IS NOT NULL AND p2 <> ALL($2::text[]))
           )
           SELECT "userId", COUNT(*)::int AS rows FROM (
             SELECT p1 AS "userId" FROM dirty WHERE p1 = ANY($1::text[])
             UNION ALL
             SELECT p2 AS "userId" FROM dirty WHERE p2 = ANY($1::text[])
           ) x GROUP BY "userId"`,
          [candidateIds, deletableIds],
        ));
      } catch (e: any) {
        throw new BadRequestException(
          `Could not work out which accounts share a delivery with a kept account (${e?.message ?? e}). ` +
          `Refusing to describe a reset whose safety checks did not all run.`,
        );
      }
    }

    if (await this.tableExists('store_dropoffs')) {
      try {
        fold(await this.ds.query(
          `WITH parties AS (
             SELECT sd."id",
                    sd."senderUserId"::text    AS p1,
                    sd."recipientUserId"::text AS p2,
                    ps."userId"::text          AS p3
               FROM "store_dropoffs" sd
               LEFT JOIN "partner_stores" ps ON ps."id"::text = sd."pickupStoreId"::text
           ),
           dirty AS (
             SELECT * FROM parties
              WHERE (p1 IS NOT NULL AND p1 <> ALL($2::text[]))
                 OR (p2 IS NOT NULL AND p2 <> ALL($2::text[]))
                 OR (p3 IS NOT NULL AND p3 <> ALL($2::text[]))
           )
           SELECT "userId", COUNT(*)::int AS rows FROM (
             SELECT p1 AS "userId" FROM dirty WHERE p1 = ANY($1::text[])
             UNION ALL
             SELECT p2 AS "userId" FROM dirty WHERE p2 = ANY($1::text[])
             UNION ALL
             SELECT p3 AS "userId" FROM dirty WHERE p3 = ANY($1::text[])
           ) x GROUP BY "userId"`,
          [candidateIds, deletableIds],
        ));
      } catch (e: any) {
        throw new BadRequestException(
          `Could not work out which accounts share a store drop-off with a kept account (${e?.message ?? e}). ` +
          `Refusing to describe a reset whose safety checks did not all run.`,
        );
      }
    }

    return out;
  }

  /**
   * Run one money query and fold its rows into the skip map.
   *
   * A missing table is not an error. Different environments are at
   * different migration points, and a reset that refuses to describe
   * itself because one optional table was never created is a reset
   * nobody can use. It is logged, loudly, and treated as "no evidence
   * of money in that table".
   */
  private async tally(
    sql: string,
    params: any[],
    onRow: (row: any) => void,
    table: string,
  ): Promise<void> {
    if (!(await this.tableExists(table))) {
      this.logger.warn(`launch reset: ${table} is absent, its money rule contributed nothing`);
      return;
    }
    try {
      const rows = await this.ds.query(sql, params);
      for (const r of rows ?? []) onRow(r);
    } catch (e: any) {
      // Fail CLOSED is not an option here (that would mark everyone
      // skipped and make the tool useless), but failing silently would
      // be worse. Surface it as an error the admin cannot miss.
      this.logger.error(`launch reset: money rule over ${table} FAILED: ${e?.message ?? e}`);
      throw new BadRequestException(
        `Could not verify money against "${table}" (${e?.message ?? e}). ` +
        `Refusing to describe a reset whose money checks did not all run.`,
      );
    }
  }

  // ── Id sets ──────────────────────────────────────────────────────────────

  /**
   * Everything the deletable users own, resolved once and reused by
   * every predicate. Resolved from the CURRENT database on every call,
   * which is what makes a half-finished run resumable: users are
   * deleted LAST, so the anchor for all of these still exists when the
   * next run starts.
   */
  private async resolveIdSets(userIds: string[]): Promise<IdSets> {
    const empty: IdSets = {
      userIds:            [],
      driverIds:          [],
      deliveryIds:        [],
      businessAccountIds: [],
      partnerStoreIds:    [],
      driverTripIds:      [],
      seatBookingIds:     [],
      storeDropoffIds:    [],
      supportTicketIds:   [],
      suggestionIds:      [],
      webhookEndpointIds: [],
    };
    if (userIds.length === 0) return empty;

    const driverIds          = await this.ids('drivers',           'id', '"userId"::text = ANY($1::text[])', [userIds]);
    const businessAccountIds = await this.ids('business_accounts', 'id', '"ownerId"::text = ANY($1::text[])', [userIds]);
    const partnerStoreIds    = await this.ids('partner_stores',    'id', '"userId"::text = ANY($1::text[])', [userIds]);
    const supportTicketIds   = await this.ids('support_tickets',   'id', '"userId"::text = ANY($1::text[])', [userIds]);
    const suggestionIds      = await this.ids('suggestions',       'id', '"submittedById"::text = ANY($1::text[])', [userIds]);
    const webhookEndpointIds = await this.ids('webhook_endpoints', 'id', '"ownerUserId"::text = ANY($1::text[])', [userIds]);

    // A delivery is in scope when EITHER side of it belongs to a
    // deletable user, and that is safe only because R8 has already run.
    // At its fixed point no delivery has one deletable party and one
    // kept party, so "either side is ours" and "every side is ours"
    // describe the same set of rows. Without that rule this line would
    // reach into records the reset promised to keep.
    const deliveryIds = await this.ids(
      'deliveries', 'id',
      driverIds.length
        ? '"customerId"::text = ANY($1::text[]) OR "driverId"::text = ANY($2::text[])'
        : '"customerId"::text = ANY($1::text[])',
      driverIds.length ? [userIds, driverIds] : [userIds],
    );

    const driverTripIds = driverIds.length
      ? await this.ids('driver_trips', 'id', '"driverId"::text = ANY($1::text[])', [driverIds])
      : [];

    const seatBookingIds = await this.ids(
      'seat_bookings', 'id',
      driverTripIds.length
        ? '"passenger_id"::text = ANY($1::text[]) OR "trip_id"::text = ANY($2::text[])'
        : '"passenger_id"::text = ANY($1::text[])',
      driverTripIds.length ? [userIds, driverTripIds] : [userIds],
    );

    const storeDropoffIds = await this.ids(
      'store_dropoffs', 'id',
      partnerStoreIds.length
        ? '"senderUserId"::text = ANY($1::text[]) OR "recipientUserId"::text = ANY($1::text[])' +
          ' OR "pickupStoreId"::text = ANY($2::text[]) OR "dropoffStoreId"::text = ANY($2::text[])'
        : '"senderUserId"::text = ANY($1::text[]) OR "recipientUserId"::text = ANY($1::text[])',
      partnerStoreIds.length ? [userIds, partnerStoreIds] : [userIds],
    );

    return {
      userIds,
      driverIds,
      deliveryIds,
      businessAccountIds,
      partnerStoreIds,
      driverTripIds,
      seatBookingIds,
      storeDropoffIds,
      supportTicketIds,
      suggestionIds,
      webhookEndpointIds,
    };
  }

  private async ids(table: string, col: string, where: string, params: any[]): Promise<string[]> {
    if (!(await this.tableExists(table))) return [];
    try {
      const rows = await this.ds.query(
        `SELECT "${col}"::text AS v FROM "${table}" WHERE ${where}`,
        params,
      );
      return (rows ?? []).map((r: any) => r.v).filter(Boolean);
    } catch (e: any) {
      // Loud, not empty. An id lookup that quietly returns nothing
      // silently shrinks the scope, and a preview built on a shrunken
      // scope is exactly the lie this whole feature exists to prevent.
      this.logger.error(`launch reset: id lookup on ${table} failed: ${e?.message ?? e}`);
      throw new BadRequestException(
        `Could not work out which "${table}" rows belong to the demo accounts (${e?.message ?? e}). ` +
        `Refusing to describe or run a reset whose scope is incomplete.`,
      );
    }
  }

  // ── Counting (preview) and deleting (execute), off one TARGETS table ──────

  private async countEntities(ids: IdSets): Promise<EntityCount[]> {
    const out: EntityCount[] = [];

    for (const t of TARGETS) {
      const pred = t.where(ids);
      if (!pred) continue;                       // nothing in scope for this table

      if (!(await this.tableExists(t.table))) {
        out.push({ order: t.order, table: t.table, label: t.label, rows: 0, sample: [],
                   note: 'Table not present in this database.' });
        continue;
      }

      try {
        const c = await this.ds.query(
          `SELECT COUNT(*)::int AS n FROM "${t.table}" WHERE ${pred.sql}`,
          pred.params,
        );
        const rows = Number(c?.[0]?.n ?? 0);
        if (rows === 0) continue;                // an empty table is noise on the screen

        const sample = await this.ds.query(
          `SELECT "id"::text AS id, (${t.sampleLabel ?? `''`})::text AS label
             FROM "${t.table}" WHERE ${pred.sql} LIMIT 5`,
          pred.params,
        );

        out.push({
          order: t.order,
          table: t.table,
          label: t.label,
          rows,
          sample: (sample ?? []).map((s: any) => ({ id: s.id, label: s.label ?? '' })),
          note: t.note,
        });
      } catch (e: any) {
        this.logger.error(`launch reset preview: count on ${t.table} failed: ${e?.message ?? e}`);
        out.push({ order: t.order, table: t.table, label: t.label, rows: -1, sample: [],
                   note: `Count failed: ${e?.message ?? e}` });
      }
    }

    return out.sort((a, b) => a.order - b.order);
  }

  /**
   * Children before parents, and NOT inside one transaction.
   *
   * One transaction over forty tables sounds safer and is not. A
   * statement timeout partway through would roll the whole thing back,
   * so a run that got 90% of the way would leave the database exactly
   * as it found it and the next attempt would hit the same timeout at
   * the same place, forever. Each statement instead commits on its own,
   * so progress is kept.
   *
   * That is safe because of the ordering: users are the LAST thing
   * deleted, so every predicate's anchor survives an interrupted run.
   * Re-running recomputes the same id sets from the same surviving
   * users and deletes whatever is still there. Rows already gone match
   * nothing. The operation is therefore idempotent and resumable, and
   * running it twice on a clean database is a no-op rather than an
   * error.
   *
   * A failure does not abort the run. A later statement blocked by the
   * failed one (deliveries cannot go while an earnings row still points
   * at them: driver_earnings carries onDelete RESTRICT on both sides)
   * simply fails too and is reported, and the next run retries both.
   */
  private async runDeletion(ids: IdSets): Promise<{ deleted: DeletionOutcome[]; failures: DeletionOutcome[] }> {
    const deleted: DeletionOutcome[]  = [];
    const failures: DeletionOutcome[] = [];

    for (const t of TARGETS) {
      const pred = t.where(ids);
      if (!pred) continue;
      if (!(await this.tableExists(t.table))) continue;

      try {
        // RETURNING rather than a row count, because DataSource.query()
        // hands back the driver's `rows` array and a DELETE without
        // RETURNING produces an empty one. Reading affected rows off
        // that would report every table as "0 deleted" on a run that
        // actually cleared thousands, which is a worse lie on this
        // screen than no number at all. Every target table has an id
        // (the preview samples it), so this counts exactly.
        const res = await this.ds.query(
          `DELETE FROM "${t.table}" WHERE ${pred.sql} RETURNING "id"`,
          pred.params,
        );
        const n = Array.isArray(res) ? res.length : 0;
        deleted.push({ order: t.order, table: t.table, label: t.label, deleted: n });
      } catch (e: any) {
        const message = String(e?.message ?? e);
        this.logger.error(`launch reset: DELETE on ${t.table} FAILED: ${message}`);
        const row = { order: t.order, table: t.table, label: t.label, deleted: 0, error: message };
        deleted.push(row);
        failures.push(row);
      }
    }

    return { deleted, failures };
  }

  // ── Audit ────────────────────────────────────────────────────────────────

  /**
   * One row per account, so the audit log answers "what happened to
   * THIS account" and not only "a reset ran".
   *
   * Targets carry the `user:` prefix. A bare id writes a row the driver
   * and user detail pages never surface, which is the same as not
   * writing it at all for anyone looking at the account later.
   *
   * A cohort is tens of accounts. The cap only exists so a runaway
   * seeder cannot turn one reset into a hundred thousand audit rows.
   */
  private readonly AUDIT_CAP = 500;

  /** Written BEFORE the delete: the decision, and the intent. */
  private async auditDecisions(
    admin: any,
    skipped: SkippedAccount[],
    selected: AccountRow[],
    ip?: string,
  ): Promise<void> {
    for (const s of skipped.slice(0, this.AUDIT_CAP)) {
      await this.logAudit(admin, 'launch_reset.account_skipped', `user:${s.id}`, {
        name: s.name, email: s.email, accountId: s.accountId, role: s.role,
        reasons: s.reasons.map(r => ({
          code: r.code, reason: r.reason, rows: r.rows, amountNgn: r.amountNgn,
        })),
      }, ip);
    }

    for (const d of selected.slice(0, this.AUDIT_CAP)) {
      await this.logAudit(admin, 'launch_reset.account_selected', `user:${d.id}`, {
        name: d.name, email: d.email, accountId: d.accountId, role: d.role,
        note: 'Lined up for removal: no money is attached to this account. ' +
              'The matching launch_reset.account_deleted row is only written if the run got there.',
      }, ip);
    }
  }

  /** Written AFTER the delete, and only for a delete that succeeded. */
  private async auditDeleted(admin: any, removed: AccountRow[], ip?: string): Promise<void> {
    for (const d of removed.slice(0, this.AUDIT_CAP)) {
      await this.logAudit(admin, 'launch_reset.account_deleted', `user:${d.id}`, {
        name: d.name, email: d.email, accountId: d.accountId, role: d.role,
        note: 'Removed by the launch reset. No money was attached to this account.',
      }, ip);
    }
  }

  /**
   * Same shape as AdminService.logAudit, written here rather than
   * imported so this module does not reach into admin.service.ts.
   * Never throws: losing an audit row must not abort a reset that has
   * already started deleting.
   */
  private async logAudit(
    admin: any,
    action: string,
    target?: string,
    meta?: Record<string, any>,
    ip?: string,
  ): Promise<void> {
    const entry = this.auditRepo.create({
      adminId:   admin?.id ?? admin?.sub,
      adminName: admin?.name ?? 'Admin',
      action,
      target,
      meta,
      ip,
    });
    await this.auditRepo.save(entry).catch((e) => {
      this.logger.error(`launch reset: audit row "${action}" was lost: ${e?.message ?? e}`);
    });
  }

  // ── Small helpers ────────────────────────────────────────────────────────

  /**
   * Cached for the life of the process, deliberately. Preview and
   * execute must agree about which tables exist, and a table appearing
   * between the two would make the delete touch something the preview
   * never showed. A restart is the way to pick up a schema change.
   */
  private readonly tableCache = new Map<string, boolean>();

  private async tableExists(table: string): Promise<boolean> {
    const hit = this.tableCache.get(table);
    if (hit !== undefined) return hit;
    try {
      const r = await this.ds.query(`SELECT to_regclass($1) AS t`, [`public.${table}`]);
      const exists = Boolean(r?.[0]?.t);
      this.tableCache.set(table, exists);
      return exists;
    } catch {
      return false;
    }
  }
}

// ── Selection logic ────────────────────────────────────────────────────────

interface IdSets {
  userIds:            string[];
  driverIds:          string[];
  deliveryIds:        string[];
  businessAccountIds: string[];
  partnerStoreIds:    string[];
  driverTripIds:      string[];
  seatBookingIds:     string[];
  storeDropoffIds:    string[];
  supportTicketIds:   string[];
  suggestionIds:      string[];
  webhookEndpointIds: string[];
}

interface Predicate { sql: string; params: any[] }

interface Target {
  /** Deletion order. Lower runs first. Children carry lower numbers. */
  order: number;
  table: string;
  label: string;
  /** Null when no id set applies, so the table is skipped entirely. */
  where: (ids: IdSets) => Predicate | null;
  /** SQL text expression used as the preview sample's human label. */
  sampleLabel?: string;
  /** Shown against the row on the preview screen. */
  note?: string;
}

/**
 * OR together `column IN (set)` clauses, numbering the placeholders as
 * it goes, and drop any clause whose set is empty.
 *
 * Every comparison goes through ::text on both sides. Some of these
 * columns are uuid and some are plain varchar holding a uuid string
 * (notifications.userId, gps_pings.driverId, business_packages
 * .deliveryId and others were declared with a bare @Column()), and
 * comparing uuid to text[] is a type error in Postgres. Casting both
 * sides is the one form that works across all of them. It gives up the
 * index, which is a fair trade for a one-time operation that has to be
 * correct rather than fast.
 */
function anyOf(pairs: Array<[string, string[]]>): Predicate | null {
  const live = pairs.filter(([, set]) => set && set.length > 0);
  if (live.length === 0) return null;
  const sql = live
    .map(([col], i) => `"${col}"::text = ANY($${i + 1}::text[])`)
    .join(' OR ');
  return {
    sql: live.length > 1 ? `(${sql})` : sql,
    params: live.map(([, set]) => set),
  };
}

/** Add a fixed extra condition to a predicate built by anyOf. */
function and(pred: Predicate | null, extra: string): Predicate | null {
  if (!pred) return null;
  return { sql: `${pred.sql} AND (${extra})`, params: pred.params };
}

/**
 * THE deletion order, and the single definition of what is in scope.
 *
 * Preview counts each row of this table. Execute deletes each row of
 * this table. Neither has its own idea of what belongs to a demo
 * account, so the preview cannot be a lie about the delete.
 *
 * The order is children before parents, worked out from the entities
 * rather than assumed:
 *
 *   - driver_earnings carries onDelete RESTRICT on BOTH its driver and
 *     its delivery, so it has to go before deliveries or the delete
 *     stops dead.
 *   - deliveries has no cascade on customer or driver, so it has to go
 *     before drivers and before users.
 *   - Several links are plain id columns with no constraint at all, so
 *     nothing cascades and orphans would be silent: chat_messages
 *     carries ticketId with no FK (support wrote it through a column
 *     the entity did not know about), business_packages carries
 *     deliveryId, store_dropoffs carries deliveryId, payments carries
 *     dropoffId, gps_pings carries driverId and deliveryId,
 *     notifications carries userId and deliveryId. Every one of those
 *     is deleted explicitly, before the row it points at.
 *   - Where a driverId column could plausibly mean either a drivers.id
 *     or a users.id, both sets are supplied. The two id spaces are
 *     disjoint uuids and both are being deleted, so matching on either
 *     is correct and neither can reach a row outside the scope.
 */
const TARGETS: Target[] = [
  // ── Trips and seats (travel buddy) ─────────────────────────────────────
  { order: 1,  table: 'seat_booking_events', label: 'Seat booking events',
    where: (i) => anyOf([['booking_id', i.seatBookingIds], ['actorUserId', i.userIds]]) },

  { order: 2,  table: 'seat_bookings', label: 'Seat bookings',
    where: (i) => anyOf([['id', i.seatBookingIds]]) },

  { order: 3,  table: 'trip_stops', label: 'Trip stops',
    where: (i) => anyOf([['trip_id', i.driverTripIds]]) },

  { order: 4,  table: 'driver_trips', label: 'Driver trips',
    where: (i) => anyOf([['driverId', i.driverIds]]) },

  // ── Rows hanging off a delivery ────────────────────────────────────────
  { order: 5,  table: 'gps_pings', label: 'GPS pings',
    where: (i) => anyOf([['driverId', [...i.userIds, ...i.driverIds]], ['deliveryId', i.deliveryIds]]),
    note: 'driverId here is the rider user id; both id sets are supplied so neither reading can leave orphans.' },

  { order: 6,  table: 'handoff_otps', label: 'Handoff OTPs',
    where: (i) => anyOf([['deliveryId', i.deliveryIds], ['recipientUserId', i.userIds]]) },

  { order: 7,  table: 'handoff_records', label: 'Handoff records',
    where: (i) => anyOf([
      ['deliveryId', i.deliveryIds], ['fromUserId', i.userIds],
      ['toUserId', i.userIds], ['partnerStoreId', i.partnerStoreIds],
    ]) },

  { order: 8,  table: 'chat_messages', label: 'Chat messages',
    where: (i) => anyOf([
      ['deliveryId', i.deliveryIds], ['senderId', i.userIds], ['ticketId', i.supportTicketIds],
    ]),
    sampleLabel: `LEFT("body", 48)`,
    note: 'ticketId has no foreign key, so support threads would be orphaned silently. Deleted before the tickets.' },

  { order: 9,  table: 'support_tickets', label: 'Support tickets',
    where: (i) => anyOf([['userId', i.userIds]]),
    sampleLabel: `"subject"` },

  { order: 10, table: 'delivery_events', label: 'Delivery timeline events',
    where: (i) => anyOf([['deliveryId', i.deliveryIds], ['actorUserId', i.userIds]]) },

  { order: 11, table: 'delivery_stops', label: 'Delivery stops',
    where: (i) => anyOf([['deliveryId', i.deliveryIds]]) },

  { order: 12, table: 'driver_status_broadcasts', label: 'Driver status broadcasts',
    where: (i) => anyOf([
      ['driverId', i.driverIds], ['deliveryId', i.deliveryIds], ['acknowledgedByUserId', i.userIds],
    ]) },

  { order: 13, table: 'partner_deliveries', label: 'External partner delivery links',
    where: (i) => anyOf([['deliveryId', i.deliveryIds]]) },

  { order: 14, table: 'pool_groups', label: 'Pooling groups',
    where: (i) => anyOf([['driverId', [...i.driverIds, ...i.userIds]]]) },

  { order: 15, table: 'promo_redemptions', label: 'Promo redemptions',
    where: (i) => anyOf([['userId', i.userIds], ['deliveryId', i.deliveryIds]]) },

  { order: 16, table: 'sos_alerts', label: 'SOS alerts',
    where: (i) => anyOf([
      ['userId', i.userIds], ['resolvedById', i.userIds], ['deliveryId', i.deliveryIds],
    ]) },

  // ── Money rows that are safe to remove ─────────────────────────────────
  // Every account reaching here already failed to trip a money rule, so
  // what is left is pending, failed or cancelled: charges that never
  // moved a naira. The extra conditions below are a second, row-level
  // guard on top of the account-level one. Money that moved is a fact,
  // and the fact wins twice.
  { order: 17, table: 'driver_earnings', label: 'Driver earnings (unpaid)',
    where: (i) => and(
      anyOf([['driver_id', i.userIds], ['delivery_id', i.deliveryIds]]),
      `"status" NOT IN ('paid', 'paying')`,
    ),
    sampleLabel: `'NGN ' || to_char("driver_net", 'FM999999999990.00')`,
    note: 'Must go before deliveries: onDelete RESTRICT sits on both its driver and its delivery.' },

  { order: 18, table: 'payments', label: 'Payments (never charged)',
    where: (i) => and(
      anyOf([
        ['customerId', i.userIds], ['deliveryId', i.deliveryIds], ['dropoffId', i.storeDropoffIds],
      ]),
      `"status" NOT IN ('success', 'refunded')
       AND "flutterwaveTransactionId" IS NULL
       AND ("escrowStatus" IS NULL OR "escrowStatus" <> 'released')`,
    ),
    sampleLabel: `'NGN ' || to_char("amountKobo" / 100.0, 'FM999999999990.00')`,
    note: 'A row that reached the processor is left in place even on a deletable account.' },

  // ── Store and business records tied to a delivery or a drop-off ────────
  { order: 19, table: 'business_packages', label: 'Business packages',
    where: (i) => anyOf([
      ['deliveryId', i.deliveryIds], ['businessAccountId', i.businessAccountIds],
      ['partnerStoreId', i.partnerStoreIds],
    ]) },

  { order: 20, table: 'store_dropoffs', label: 'Partner store drop-offs',
    where: (i) => anyOf([['id', i.storeDropoffIds]]),
    sampleLabel: `"dropCode"` },

  { order: 21, table: 'notifications', label: 'Notifications',
    where: (i) => anyOf([['userId', i.userIds], ['deliveryId', i.deliveryIds]]),
    sampleLabel: `"title"` },

  { order: 22, table: 'deliveries', label: 'Deliveries',
    where: (i) => anyOf([['id', i.deliveryIds]]),
    sampleLabel: `"trackingCode"` },

  // ── Driver profile ─────────────────────────────────────────────────────
  { order: 23, table: 'driver_subscriptions', label: 'Driver subscriptions',
    where: (i) => anyOf([['driverId', [...i.driverIds, ...i.userIds]]]) },

  { order: 24, table: 'driver_level_changes', label: 'Driver level changes',
    where: (i) => anyOf([['driverId', [...i.driverIds, ...i.userIds]]]) },

  { order: 25, table: 'driver_vehicle_changes', label: 'Driver vehicle changes',
    where: (i) => anyOf([['driverId', [...i.driverIds, ...i.userIds]]]) },

  { order: 26, table: 'drivers', label: 'Driver profiles',
    where: (i) => anyOf([['id', i.driverIds]]),
    sampleLabel: `"vehiclePlate"` },

  // ── Partner store and business ─────────────────────────────────────────
  { order: 27, table: 'partner_sponsorships', label: 'Partner sponsorships',
    where: (i) => anyOf([['partnerStoreId', i.partnerStoreIds]]) },

  { order: 28, table: 'partner_payouts', label: 'Partner payouts (unpaid)',
    where: (i) => and(
      anyOf([['partnerStoreId', i.partnerStoreIds]]),
      `"status" <> 'paid'`,
    ),
    sampleLabel: `'NGN ' || to_char("amount", 'FM999999999990.00')`,
    note: 'A paid partner payout blocks its whole account, so nothing paid can reach this statement.' },

  { order: 29, table: 'business_wallet_transactions', label: 'Business wallet transactions',
    where: (i) => anyOf([['businessAccountId', i.businessAccountIds]]) },

  { order: 30, table: 'recurring_templates', label: 'Recurring send templates',
    where: (i) => anyOf([['ownerId', i.userIds]]),
    sampleLabel: `"name"` },

  { order: 31, table: 'partner_stores', label: 'Partner stores',
    where: (i) => anyOf([['id', i.partnerStoreIds]]),
    sampleLabel: `"storeName"` },

  { order: 32, table: 'business_accounts', label: 'Business accounts',
    where: (i) => anyOf([['id', i.businessAccountIds]]),
    sampleLabel: `"companyName"` },

  // ── Everything else owned by the user ──────────────────────────────────
  { order: 33, table: 'saved_addresses', label: 'Saved addresses',
    where: (i) => anyOf([['userId', i.userIds]]) },

  { order: 34, table: 'saved_cards', label: 'Saved cards',
    where: (i) => anyOf([['user_id', i.userIds]]) },

  { order: 35, table: 'wallets', label: 'Wallets',
    where: (i) => anyOf([['userId', i.userIds]]),
    sampleLabel: `'NGN ' || to_char("balanceKobo" / 100.0, 'FM999999999990.00')`,
    note: 'A staged demo balance is not money that moved. Any account whose money DID move never gets here.' },

  { order: 36, table: 'loyalty_points', label: 'Loyalty point entries',
    where: (i) => anyOf([['user_id', i.userIds], ['related_delivery_id', i.deliveryIds]]),
    sampleLabel: `"delta"::text || ' pts'` },

  { order: 37, table: 'user_documents', label: 'Issued documents',
    where: (i) => anyOf([['userId', i.userIds]]) },

  { order: 38, table: 'identity_verifications', label: 'Identity verifications',
    where: (i) => anyOf([['userId', i.userIds]]) },

  { order: 39, table: 'user_profile_audits', label: 'Profile change audits',
    where: (i) => anyOf([['userId', i.userIds], ['actorUserId', i.userIds]]),
    note: 'onDelete NO ACTION, so these will block the user delete unless removed first.' },

  { order: 40, table: 'fraud_flags', label: 'Fraud flags',
    where: (i) => anyOf([['userId', i.userIds]]) },

  { order: 41, table: 'suggestion_votes', label: 'Suggestion votes',
    where: (i) => anyOf([['userId', i.userIds], ['suggestionId', i.suggestionIds]]) },

  { order: 42, table: 'suggestions', label: 'Suggestions',
    where: (i) => anyOf([['id', i.suggestionIds]]),
    sampleLabel: `"subject"` },

  { order: 43, table: 'duplicate_accounts', label: 'Duplicate-account candidates',
    where: (i) => anyOf([['primaryUserId', i.userIds], ['duplicateUserId', i.userIds]]) },

  { order: 44, table: 'webhook_deliveries', label: 'Webhook deliveries',
    where: (i) => anyOf([['endpointId', i.webhookEndpointIds]]) },

  { order: 45, table: 'webhook_endpoints', label: 'Webhook endpoints',
    where: (i) => anyOf([['id', i.webhookEndpointIds]]) },

  { order: 46, table: 'api_keys', label: 'Developer API keys',
    where: (i) => anyOf([['ownerUserId', i.userIds]]) },

  { order: 47, table: 'statement_records', label: 'Statement records',
    where: (i) => anyOf([['subjectId', [...i.userIds, ...i.partnerStoreIds]]]),
    sampleLabel: `"code"` },

  // ── Last, always ───────────────────────────────────────────────────────
  { order: 48, table: 'users', label: 'Demo accounts',
    where: (i) => anyOf([['id', i.userIds]]),
    sampleLabel: `"name" || ' (' || COALESCE("accountId", 'no SEIRS ID') || ')'`,
    note: 'Deleted last on purpose: while these rows survive, an interrupted run can recompute the exact same scope and finish.' },
];

/**
 * What the reset keeps, shown on the screen so the admin can see it
 * rather than trust it. These are things an admin CONFIGURED, not
 * things a test generated, and several of them would take the platform
 * down if they went.
 */
const PRESERVED: PreservedTable[] = [
  { table: 'rate_cards',        why: 'Weeks of tuned pricing, including the zone and state surcharges. Deleting it takes the platform down.' },
  { table: 'fees',              why: 'The Fee Catalogue. Every admin-tunable policy knob lives here.' },
  { table: 'fee_history',       why: 'The record of who changed a fee and when. Config history, not test data.' },
  { table: 'service_categories', why: 'The service catalogue the apps price against.' },
  { table: 'zones',              why: 'Operating areas an admin drew, including the ones marked closed. Geography is configuration.' },
  { table: 'pricing_config',     why: 'Pricing engine settings.' },
  { table: 'platform_config',    why: 'System settings, including maintenance mode.' },
  { table: 'email_templates',    why: 'Authored transactional copy.' },
  { table: 'website_content',    why: 'The CMS behind the app carousels, the Stories list and seirs.app.' },
  { table: 'promotions',         why: 'Configured campaigns. Only the redemptions belonging to demo accounts are removed.' },
  { table: 'roles',              why: 'The role catalogue and its permissions.' },
  { table: 'partners',           why: 'External courier partners, configured not generated.' },
  { table: 'external_partners',  why: 'Specialist partner directory.' },
  { table: 'fx_rates',           why: 'Rate history used for reporting.' },
  { table: 'driver_payouts',     why: 'Every row is one bank transfer that left SEIRS. Nothing here is ever deleted, and any account it names is not deletable.' },
  { table: 'audit_logs',         why: 'The trail, including this reset. Deleting it would erase the evidence of the delete.' },
  { table: 'archived_users',     why: 'NDPR archive of accounts already purged elsewhere.' },
  { table: 'contact_submissions', why: 'Real enquiries from the public website.' },
];

const NOTES: string[] = [
  'A demo flag is a label. Money that moved is a fact, and the fact wins: an account with a real payment, a released escrow, a paid or in-flight earning, a driver payout or a paid partner payout is kept and reported, whatever isDemo says.',
  'Real accounts are never candidates. The only accounts considered are the ones carrying users.isDemo.',
  'Keeping one account can strand another. A demo account that shares a delivery or a store drop-off with an account being kept is kept too, because deliveries have no cascade and paid earnings restrict them: there is no order of deletes that removes one side without damaging the other. The rule is applied repeatedly until the set stops changing.',
  'Preview and execute walk the same ordered table and build the same predicate from the same id sets. The preview counts what the delete would remove, not an approximation of it.',
  'The run is idempotent. Accounts are deleted last, so an interrupted run leaves every anchor in place and the next run recomputes the same scope and finishes. Running it again on a clean database deletes nothing.',
];
