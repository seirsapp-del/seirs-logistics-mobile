import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SupportController } from './support.controller';
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
  imports: [TypeOrmModule.forFeature([SupportTicket, ChatMessage, User])],
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule implements OnModuleInit {
  private readonly logger = new Logger(SupportModule.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async onModuleInit() {
    try {
      await this.ds.query(`
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
      await this.ds.query(`
        CREATE INDEX IF NOT EXISTS "support_tickets_user_status_idx"
          ON "support_tickets" ("userId", "status")
      `);
      await this.ds.query(`
        CREATE INDEX IF NOT EXISTS "support_tickets_status_lastmsg_idx"
          ON "support_tickets" ("status", "lastMessageAt")
      `);

      // Widen chat_messages so a message row can belong to EITHER a
      // delivery or a support ticket. Both FKs are nullable; the app
      // enforces exactly-one-set at write time.
      await this.ds.query(`
        ALTER TABLE "chat_messages"
          ADD COLUMN IF NOT EXISTS "ticketId" uuid NULL
      `);
      await this.ds.query(`
        CREATE INDEX IF NOT EXISTS "chat_messages_ticket_created_idx"
          ON "chat_messages" ("ticketId", "createdAt")
      `);
      // A support message has no delivery. deliveryId was still NOT NULL,
      // so writing the first message of a ticket failed and the whole
      // request 500'd: opening a support ticket was impossible from any
      // app (found on device 2026-08-16).
      await this.ds.query(`
        ALTER TABLE "chat_messages" ALTER COLUMN "deliveryId" DROP NOT NULL
      `);
      this.logger.log('support_tickets schema self-heal complete');
    } catch (e: any) {
      this.logger.warn(`support_tickets self-heal skipped: ${e?.message ?? e}`);
    }
  }
}
