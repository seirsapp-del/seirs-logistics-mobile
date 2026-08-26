import { Injectable, ForbiddenException, CanActivate, ExecutionContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
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
 * TWO ways to hold the role, because there are two ways to be given it
 * (founder decision, 2026-08-25).
 *
 * This used to test the legacy adminRole enum alone, and the comment
 * defended that as "a misconfigured custom role cannot accidentally
 * grant this". The reasoning does not survive contact with Role
 * Management: roles.service.ts assignToUser writes roleId and never
 * touches adminRole, so appointing someone Super Admin through the
 * founder's own screen left adminRole null. That admin saw Staff
 * Management, System Settings, Audit Log and the pricing controls in
 * their sidebar, and then every write behind them answered 403. The
 * appointment looked like it worked and silently did not.
 *
 * super_admin is not a "misconfigured custom role" either. It is a
 * seeded, protected system role that cannot be renamed or deleted, and
 * granting it is already gated behind this same guard plus the
 * last-super-admin check in assignToUser. Accepting it is accepting a
 * decision a super admin already made deliberately.
 *
 * The slug is read from the database rather than from the JWT on
 * purpose. The token would be cheaper, but it is minted for 30 minutes,
 * so a demoted super admin would keep spending money for the rest of
 * that window. This is the "in case anyone is trying to go rogue" guard;
 * it reads live. The extra query only runs for admins who are NOT
 * already super via the enum, and only on the handful of write
 * endpoints this guard protects.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    if (req.user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required.');
    }

    if (req.user?.adminRole === AdminSubRole.SUPER_ADMIN) return true;
    if (await this.holdsSuperAdminRole(req.user?.roleId)) return true;

    throw new ForbiddenException(
      'Only a super admin can change this. Ask a super admin to make the change, or to grant you the role.',
    );
  }

  private async holdsSuperAdminRole(roleId?: string | null): Promise<boolean> {
    if (!roleId) return false;
    const row = await this.dataSource
      .createQueryBuilder()
      .select('r.slug', 'slug')
      .from('roles', 'r')
      .where('r.id = :id', { id: roleId })
      .getRawOne();
    return row?.slug === 'super_admin';
  }
}
