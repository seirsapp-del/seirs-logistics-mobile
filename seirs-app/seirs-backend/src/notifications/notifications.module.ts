import { Module, Global, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { AccountSecurityService } from './account-security.service';
import { NotificationsController } from './notifications.controller';
import { FcmService } from './fcm.service';
import { WhatsAppService } from './whatsapp.service';
import { Notification } from './notification.entity';
import { User } from '../users/user.entity';
import { MailModule } from '../mail/mail.module';

@Global()
@Module({
  // MailModule is already @Global, but AccountSecurityService is
  // declared here and its email half is not optional, so the dependency
  // is stated rather than inherited. Mail imports nothing from
  // notifications, so there is no cycle to create.
  imports: [TypeOrmModule.forFeature([Notification, User]), MailModule],
  providers: [NotificationsService, AccountSecurityService, FcmService, WhatsAppService],
  controllers: [NotificationsController],
  exports: [NotificationsService, AccountSecurityService, FcmService, WhatsAppService],
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
    const values = [
      'chat_message', 'sos_alert', 'system', 'general',
      // Account-and-security category (2026-08-28). Same reason as the
      // three above: without these the very first password-change
      // notice would throw on insert in production, and the one class
      // of notification that must never be lost would be the one class
      // that never arrived.
      'security_alert', 'account_update',
    ];
    for (const v of values) {
      try {
        await this.dataSource.query(
          `ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS '${v}'`,
        );
      } catch { /* type absent on a fresh DB, or value already present */ }
    }

    /**
     * Device memory for the new-device sign-in alert.
     *
     * Lives on users rather than in this module's own table because it
     * is read on the sign-in hot path, and a join there buys nothing.
     * Self-healed here, next to the enum, so the whole security
     * category has one place its schema needs are stated.
     */
    try {
      await this.dataSource.query(
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "knownDeviceHashes" jsonb NULL`,
      );
    } catch { /* table absent on a fresh DB, or column already present */ }
  }
}
