import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'crypto';

/**
 * The global rate limiter, scoped to HTTP only (audit 2026-08-14).
 *
 * A guard registered as APP_GUARD runs for every execution context, not
 * just HTTP, so the stock ThrottlerGuard would also fire on the tracking
 * gateway's WebSocket events. There it reads req.ips off a socket that
 * has no such field and throws, which would take live driver tracking
 * down with it.
 *
 * Sockets are not left unprotected by this: connections are authenticated
 * at handshake, and the volume control that matters for tracking is the
 * client's own emit interval rather than a per-message cap.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    return super.canActivate(context);
  }

  /**
   * Count against the caller's token when there is one, the IP when
   * there is not.
   *
   * Pure IP tracking misreads this user base badly. Nigerian mobile
   * carriers put large numbers of subscribers behind carrier-grade NAT,
   * and shared office and estate wifi does the same, so one address can
   * legitimately represent hundreds of people. Limiting them as a single
   * client would lock out real customers long before it inconvenienced
   * anyone abusive.
   *
   * The token is read from the header rather than req.user because a
   * global guard runs before the route's JwtAuthGuard, so req.user is
   * not populated yet. It is used unverified, which is fine for a bucket
   * key: it decides which counter to increment, never what the caller is
   * allowed to do. Minting fresh tokens to dodge a limit means logging
   * in repeatedly, and login is throttled per IP below.
   *
   * Unauthenticated routes fall back to IP, which is the right unit
   * there anyway: login and OTP attacks are exactly what we want counted
   * per origin, and there is no account to attribute them to yet.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const auth: string = req?.headers?.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (token) {
      return `tok:${createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
    }
    const ip = Array.isArray(req?.ips) && req.ips.length ? req.ips[0] : req?.ip;
    return `ip:${ip ?? 'unknown'}`;
  }
}
