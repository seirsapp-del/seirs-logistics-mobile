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
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON not set - push notifications disabled');
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
      this.logger.log('Firebase Admin SDK initialised - push notifications enabled');
    } catch (e) {
      this.logger.error(`Firebase init failed: ${e.message}`);
    }
  }

  /**
   * Whether push can actually leave this server.
   *
   * FIREBASE_SERVICE_ACCOUNT_JSON unset means every send is a silent
   * no-op, and nothing outside this class could tell. Exposed so the
   * broadcast composer and /health can say so out loud rather than
   * letting an operator believe five hundred phones buzzed.
   */
  get isEnabled(): boolean {
    return !!this.messaging;
  }

  /**
   * Send, and say honestly what happened (2026-08-28).
   *
   * sendToToken answers one question, "should this token be deleted",
   * and returns false for all three of: it worked, it failed for a
   * reason that is not the token's fault, and push is switched off
   * entirely. broadcastToAudience was counting `!stale` as `pushed`, so
   * with FIREBASE_SERVICE_ACCOUNT_JSON unset a broadcast to five
   * hundred people reported five hundred delivered and not one phone
   * rang. A delivery report that cannot fail is not a delivery report.
   *
   * sendToToken keeps its old meaning so its other callers are
   * untouched; it now just reads its answer out of this.
   */
  async sendToTokenDetailed(
    fcmToken: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<{ sent: boolean; stale: boolean; reason?: string }> {
    if (!this.messaging) return { sent: false, stale: false, reason: 'push-disabled' };
    if (!fcmToken)       return { sent: false, stale: false, reason: 'no-token' };

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
      return { sent: true, stale: false };
    } catch (e) {
      const isStaleToken =
        e.code === 'messaging/registration-token-not-registered' ||
        e.code === 'messaging/invalid-registration-token';

      if (isStaleToken) {
        this.logger.log(`Stale FCM token removed for prefix ${fcmToken.slice(0, 10)}...`);
        return { sent: false, stale: true, reason: 'stale-token' };
      }

      this.logger.warn(`FCM send failed: ${e.message}`);
      return { sent: false, stale: false, reason: e.message };
    }
  }

  // Returns true if token should be removed (invalid/unregistered)
  async sendToToken(
    fcmToken: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<boolean> {
    const r = await this.sendToTokenDetailed(fcmToken, title, body, data);
    return r.stale;
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
