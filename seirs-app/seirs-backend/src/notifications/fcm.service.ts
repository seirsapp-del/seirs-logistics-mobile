import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private messaging: any = null;

  constructor(private readonly cfg: ConfigService) {}

  onModuleInit() {
    const raw = this.cfg.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!raw) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications disabled');
      return;
    }

    try {
      const admin = require('firebase-admin');
      if (!admin.apps.length) {
        const serviceAccount = JSON.parse(raw);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }
      this.messaging = admin.messaging();
      this.logger.log('Firebase Admin SDK initialised — push notifications enabled');
    } catch (e) {
      this.logger.error(`Firebase init failed: ${e.message}`);
    }
  }

  // Returns true if token should be removed (invalid/unregistered)
  async sendToToken(
    fcmToken: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<boolean> {
    if (!this.messaging || !fcmToken) return false;

    try {
      await this.messaging.send({
        token: fcmToken,
        notification: { title, body },
        data: data ?? {},
        android: {
          priority: 'high',
          notification: { sound: 'default', channelId: 'seirs_default' },
        },
        apns: {
          payload: { aps: { sound: 'default', badge: 1 } },
        },
      });
      return false;
    } catch (e) {
      const isStaleToken =
        e.code === 'messaging/registration-token-not-registered' ||
        e.code === 'messaging/invalid-registration-token';

      if (isStaleToken) {
        this.logger.log(`Stale FCM token removed for prefix ${fcmToken.slice(0, 10)}...`);
        return true; // caller should clear this token
      }

      this.logger.warn(`FCM send failed: ${e.message}`);
      return false;
    }
  }

  async sendToMultiple(
    fcmTokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.messaging || !fcmTokens.length) return;

    const valid = fcmTokens.filter(Boolean);
    if (!valid.length) return;

    try {
      await this.messaging.sendEachForMulticast({
        tokens: valid,
        notification: { title, body },
        data: data ?? {},
        android: { priority: 'high' },
      });
    } catch (e) {
      this.logger.warn(`FCM multicast failed: ${e.message}`);
    }
  }
}
