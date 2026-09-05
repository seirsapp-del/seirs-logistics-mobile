import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Only business accounts may touch the developer platform.
 *
 * The controller carried `@UseGuards(JwtAuthGuard)` and nothing else, and
 * `issueKey` checked nothing at all, so ANY signed-in account could mint a
 * LIVE API key: an ordinary customer, no business anywhere in sight
 * (audit 2026-09-05).
 *
 * What that actually bought an attacker was price scraping through
 * /v1/quote and junk bookings, not free deliveries, because API orders land
 * `status: 'pending'` and dispatch is gated on payment. Still: a live key is
 * programmatic access to booking, and it was handed to anyone who asked.
 *
 * businessRole is the same signal `businessLogin` already trusts to decide
 * who the business app is for, so this stays consistent with the gate that
 * was already right.
 */
@Injectable()
export class BusinessOnlyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user;
    if (!user?.businessRole) {
      throw new ForbiddenException(
        'The SEIRS API is for business accounts. Apply from the business app.',
      );
    }
    return true;
  }
}
