import { Module, Global, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { FcmService } from './fcm.service';
import { WhatsAppService } from './whatsapp.service';
import { Notification } from './notification.entity';
import { User } from '../users/user.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Notification, User])],
  providers: [NotificationsService, FcmService, WhatsAppService],
  controllers: [NotificationsController],
  exports: [NotificationsService, FcmService, WhatsAppService],
})
export class NotificationsModule implements OnModuleInit {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Production runs with synchronize off, so NotificationType values
   * added after the last schema sync do not exist in the Postgres enum
   * and every insert using one throws.
   *
   * chat_message, sos_alert and system were all added later and none of
   * them were ever created in the deployed type. sos_alert is the one
   * that hurts: sos.service.ts notifies the other party inside a
   * .catch(() => {}), so during a real emergency the write failed and
   * nobody found out. Every other module that grew an enum value has a
   * self-heal like this one; notifications was the gap (2026-08-24).
   *
   * ADD VALUE IF NOT EXISTS is safe to re-run on every boot.
   */
  async onModuleInit() {
    const values = ['chat_message', 'sos_alert', 'system', 'general'];
    for (const v of values) {
      try {
        await this.dataSource.query(
          `ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS '${v}'`,
        );
      } catch { /* type absent on a fresh DB, or value already present */ }
    }
  }
}
