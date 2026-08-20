import { Injectable, ForbiddenException, CanActivate, ExecutionContext } from '@nestjs/common';

/**
 * Requires the caller to actually own a business account.
 *
 * JwtAuthGuard answers "is this person logged in, and who are they?". It
 * never answers "are they allowed to do this?". Every route on
 * BusinessController stopped at JwtAuthGuard, so the only thing keeping a
 * customer out of the business booking, wallet and statement endpoints was
 * that the service happened to call getBizAccount() and throw.
 *
 * That worked, but it is defence by coincidence: the check lives in each
 * service method, so the day someone adds a route that forgets to call it,
 * the route is open. Enforcing it at the controller makes the rule
 * structural instead of remembered.
 *
 * Reads businessAccountId off the JWT user, which is populated by
 * JwtAuthGuard, so this must run after it.
 */
@Injectable()
export class BusinessAccountGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (!req.user?.businessAccountId) {
      throw new ForbiddenException('Business account required.');
    }
    return true;
  }
}

/**
 * Same idea for the partner-store surface: inventory, capacity, release
 * and scan endpoints are meaningless without a store, and a customer
 * reaching them should be refused at the door rather than deeper in.
 */
@Injectable()
export class PartnerStoreGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (!req.user?.partnerStoreId) {
      throw new ForbiddenException('Partner store required.');
    }
    return true;
  }
}
