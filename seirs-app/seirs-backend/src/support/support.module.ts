import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SupportController } from './support.controller';
import { FeesModule } from '../fees/fees.module';
import { SupportService }    from './support.service';
import { SupportTicket }     from './support-ticket.entity';
import { ChatMessage }       from '../chat/chat-message.entity';
import { User }              from '../users/user.entity';

/**
 * Support toolkit module. Owns:
 *   - SupportTicket CRUD + rate-limited create + agent inbox
 *   - Read-side reuse of chat_messages via a nullable `ticketId` FK
 *   - Self-heal of the new schema so Railway does not need SYNC_DB
 *
 * Idempotent boot-time migrations:
 *   1. Ensure `support_tickets` table exists (see entity for shape).
 *   2. Ensure `chat_messages."ticketId"` column exists (nullable FK to
 *      the ticket). Same pattern as chat_messages.systemType +
 *      chat_messages.imageUrl self-heals already deployed.
 *
 * If a step fails (permissions, race), the module logs a warning and
 * boots normally so the fallback SYNC_DB=true toggle still works.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SupportTicket, ChatMessage, User]),
    // For the staleness threshold, read live rather than hard-coded.
    // FeesModule pulls in only TypeOrm and Tracking, so there is no cycle.
    FeesModule,
  ],
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule implements OnModuleInit {
  private readonly logger = new Logger(SupportModule.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Schema self-heal for support.
   *
   * Every statement runs independently. It used to be one try/catch
   * around the whole block, so a single failing statement silently
   * skipped everything after it, and a failure here is invisible: the
   * table ends up half-built and every support query 500s (opening a
   * ticket AND listing tickets were both broken on production,
   * 2026-08-16).
   *
   * CREATE TABLE IF NOT EXISTS also never repairs a table that predates
   * the current entity, so each column is added defensively too.
   */
  private async run(label: string, sql: string): Promise<boolean> {
    try {
      await this.ds.query(sql);
      return true;
    } catch (e: any) {
      this.logger.error(`support self-heal FAILED [${label}]: ${e?.message ?? e}`);
      return false;
    }
  }

  async onModuleInit() {
    await this.run('create table', `
      CREATE TABLE IF NOT EXISTS "support_tickets" (
        "id"                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId"             uuid         NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "userAccountType"    varchar(32)  NOT NULL,
        "topic"              varchar(16)  NOT NULL,
        "status"             varchar(24)  NOT NULL DEFAULT 'open',
        "subject"            varchar(200) NOT NULL,
        "linkedDeliveryId"   uuid         NULL,
        "assignedAgentId"    uuid         NULL,
        "firstAgentReplyAt"  timestamptz  NULL,
        "resolvedAt"         timestamptz  NULL,
        "autoClosedAt"       timestamptz  NULL,
        "lastMessageAt"      timestamptz  NOT NULL DEFAULT NOW(),
        "createdAt"          timestamptz  NOT NULL DEFAULT NOW(),
        "updatedAt"          timestamptz  NOT NULL DEFAULT NOW()
      )
    `);

    // Bring an older table up to the current entity. Each is a no-op when
    // the column is already there.
    const columns: Array<[string, string]> = [
      ['userId',            'uuid'],
      ['userAccountType',   'varchar(32)'],
      ['topic',             'varchar(16)'],
      ['status',            "varchar(24) NOT NULL DEFAULT 'open'"],
      ['subject',           'varchar(200)'],
      ['linkedDeliveryId',  'uuid NULL'],
      ['assignedAgentId',   'uuid NULL'],
      ['firstAgentReplyAt', 'timestamptz NULL'],
      ['resolvedAt',        'timestamptz NULL'],
      ['autoClosedAt',      'timestamptz NULL'],
      ['lastMessageAt',     'timestamptz NOT NULL DEFAULT NOW()'],
      ['createdAt',         'timestamptz NOT NULL DEFAULT NOW()'],
      ['updatedAt',         'timestamptz NOT NULL DEFAULT NOW()'],
      // Alerts SEIRS files about somebody, hidden from that somebody.
      ['internal',          'boolean NOT NULL DEFAULT false'],
    ];
    for (const [name, type] of columns) {
      await this.run(`add ${name}`, `
        ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "${name}" ${type}
      `);
    }

    /**
     * Legacy columns from an older support_tickets table are NOT NULL and
     * the current entity never sets them, so every insert failed and
     * opening a ticket returned a bare 500 (2026-08-16). Relaxing them
     * keeps the old admin queries working while letting the current
     * entity write.
     */
    for (const [col, dflt] of [
      ['description', "''"],
      ['priority',    "'normal'"],
      ['replies',     '0'],
      ['slaBreached', 'false'],
      ['category',    "'other'"],
      ['userEmail',   "''"],
      ['userName',    "''"],
    ] as Array<[string, string]>) {
      await this.run(`relax ${col}`, `
        ALTER TABLE "support_tickets" ALTER COLUMN "${col}" DROP NOT NULL
      `);
      await this.run(`default ${col}`, `
        ALTER TABLE "support_tickets" ALTER COLUMN "${col}" SET DEFAULT ${dflt}
      `);
    }

    /**
     * The legacy table created these as varchar while users.id and the
     * delivery ids are uuid, so every query joining a ticket to its user
     * died on "operator does not exist: uuid = character varying". That
     * is what broke opening AND listing tickets in all three apps
     * (2026-08-16). Casting in place keeps the existing rows.
     */
    for (const col of ['userId', 'linkedDeliveryId', 'assignedAgentId']) {
      await this.run(`cast ${col} to uuid`, `
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_name = 'support_tickets'
               AND column_name = '${col}'
               AND data_type <> 'uuid'
          ) THEN
            EXECUTE 'ALTER TABLE "support_tickets"
                       ALTER COLUMN "${col}" TYPE uuid USING NULLIF("${col}", '''')::uuid';
          END IF;
        END $$;
      `);
    }

    await this.run('idx user/status', `
      CREATE INDEX IF NOT EXISTS "support_tickets_user_status_idx"
        ON "support_tickets" ("userId", "status")
    `);
    await this.run('idx status/lastmsg', `
      CREATE INDEX IF NOT EXISTS "support_tickets_status_lastmsg_idx"
        ON "support_tickets" ("status", "lastMessageAt")
    `);

    // chat_messages carries support threads as well as delivery chats.
    await this.run('chat ticketId', `
      ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "ticketId" uuid NULL
    `);
    await this.run('idx chat ticket', `
      CREATE INDEX IF NOT EXISTS "chat_messages_ticket_created_idx"
        ON "chat_messages" ("ticketId", "createdAt")
    `);
    // A support message has no delivery, so this must be nullable or the
    // first message of every ticket violates NOT NULL and 500s.
    await this.run('chat deliveryId nullable', `
      ALTER TABLE "chat_messages" ALTER COLUMN "deliveryId" DROP NOT NULL
    `);

    /**
     * userAccountType is stamped on the ticket at creation, so tickets
     * filed before the classifier was fixed still read 'customer' for
     * business senders. Founder 2026-08-16: the demo store's id is
     * CUST-XB4KBEPL because the account began life as a customer and a
     * prefix never mutates, which is exactly why the prefix cannot be
     * the test. Backfill from the account's business link instead.
     */
    await this.run('backfill business account type', `
      UPDATE "support_tickets" t
         SET "userAccountType" = 'business'
        FROM "users" u
       WHERE u.id = t."userId"
         AND t."userAccountType" IS DISTINCT FROM 'business'
         AND (u."businessAccountId" IS NOT NULL OR u."businessRole" IS NOT NULL)
    `);

    this.logger.log('support schema self-heal complete');
  }
}
