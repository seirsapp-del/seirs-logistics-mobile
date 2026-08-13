import { Injectable, ForbiddenException, CanActivate, ExecutionContext } from '@nestjs/common';
import { UserRole, AdminSubRole } from '../../users/user.entity';

/**
 * Super-admin only. Use on the handful of endpoints where a single
 * mistaken or malicious edit costs real money (founder 2026-08-13:
 * "in case anyone is trying to go rogue").
 *
 * AdminGuard proves someone is staff. It does not distinguish a content
 * editor from the CEO, so on its own it let any admin change the service
 * fee, the platform cut, or surge pricing. Those are not review-later
 * decisions: a wrong platform cut silently misprices every delivery
 * until somebody notices in the numbers.
 *
 * Read endpoints stay on AdminGuard. Finance staff still need to SEE
 * pricing to do their job; they just cannot rewrite it.
 *
 * Sub-role is checked directly rather than through the dynamic roles
 * table, so a misconfigured custom role cannot accidentally grant this.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (req.user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required.');
    }
    if (req.user?.adminRole !== AdminSubRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only a super admin can change this. Ask a super admin to make the change, or to grant you the role.',
      );
    }
    return true;
  }
}
