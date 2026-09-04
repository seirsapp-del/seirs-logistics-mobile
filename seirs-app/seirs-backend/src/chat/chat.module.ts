import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ChatController } from './chat.controller';
import { ChatService }    from './chat.service';
import { ChatMessage }    from './chat-message.entity';
import { Delivery }       from '../deliveries/delivery.entity';
import { TrackingModule } from '../tracking/tracking.module';
import { FeesModule }     from '../fees/fees.module';

/**
 * ChatModule owns targeted schema self-healing for the chat_messages
 * table. Nest boots with SYNC_DB=false in production, so newly added
 * entity columns would cause TypeORM's SELECT hydration to 500 with
 * "column does not exist" the first time the app reads a message.
 *
 * The columns below were added in the pre-launch chat batch (systemType
 * for auto-inserted status pills, imageUrl for image messages, sender
 * being made nullable to support senderless system messages). All three
 * ALTERs are idempotent: they are no-ops on databases that already have
 * the schema (via IF NOT EXISTS + a check on the current NOT NULL flag).
 *
 * If the ALTERs fail for any reason (permissions, connection race), we
 * swallow the error and log a warning: the ambient SYNC_DB=true toggle
 * is still the intended long-term migration path and will pick up any
 * drift on the next admin-triggered deploy.
 */
@Module({
  // FeesModule: the chat opening time is a Fee Catalogue row, not a constant.
  imports: [TypeOrmModule.forFeature([ChatMessage, Delivery]), TrackingModule, FeesModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule implements OnModuleInit {
  private readonly logger = new Logger(ChatModule.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async onModuleInit() {
    try {
      await this.ds.query(`
        ALTER TABLE "chat_messages"
          ADD COLUMN IF NOT EXISTS "systemType" varchar(40) NULL
      `);
      await this.ds.query(`
        ALTER TABLE "chat_messages"
          ADD COLUMN IF NOT EXISTS "imageUrl" text NULL
      `);
      // Drop NOT NULL on sender to allow senderless system messages. The
      // WHERE guard makes this idempotent across replays.
      await this.ds.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'chat_messages'
              AND column_name = 'senderId'
              AND is_nullable = 'NO'
          ) THEN
            ALTER TABLE "chat_messages" ALTER COLUMN "senderId" DROP NOT NULL;
          END IF;
        END $$;
      `);
      this.logger.log('chat_messages schema self-heal complete');
    } catch (e: any) {
      this.logger.warn(`chat_messages self-heal skipped: ${e?.message ?? e}`);
    }
  }
}
