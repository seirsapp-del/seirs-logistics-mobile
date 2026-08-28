import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { UserRole } from '../users/user.entity';
import { SYSTEM_ROLES } from '../roles/roles.seed';

/**
 * Permission slugs for the data exports.
 *
 * Two of them rather than one, because the two kinds of file carry
 * different risk. The money files are what an accountant reconciles; the
 * operational files are a whole customer or driver table, phone numbers
 * and email addresses included, in one click. An export is the single
 * easiest way for a customer list to walk out of the building, so the
 * stricter of the two is the money one and neither is implied by simply
 * being staff.
 *
 * These are real, grantable slugs: both appear in PERMISSION_CATALOGUE
 * in roles.seed.ts so a super admin can tick them on a role, and both
 * are mirrored in the dashboard's rbac.ts so the buttons match what the
 * API will actually allow. Deliberately NOT reused from the existing
 * page slugs: holding 'users' means being able to look a customer up,
 * and that is not the same decision as being able to download all of
 * them.
 */
export const EXPORTS_FINANCE_PERMISSION     = 'exports-finance';
export const EXPORTS_OPERATIONAL_PERMISSION = 'exports-operational';

export const EXPORT_PERMISSION_KEY = 'seirs:export-permission';

/** Names the permission a single export route requires. */
export const RequireExportPermission = (permission: string) =>
  SetMetadata(EXPORT_PERMISSION_KEY, permission);

/**
 * Authorization, not authentication.
 *
 * AdminGuard proves the caller is staff. It does not distinguish a
 * content editor from a finance officer, so on its own it would let
 * anyone with an admin login pull every payout, every payment and the
 * full customer table. This guard checks what the actor was actually
 * granted against what the route requires.
 *
 * Modelled on SuperAdminGuard, including the two things it learned the
 * hard way:
 *
 *  1. There are TWO ways to hold a role. The legacy `adminRole` enum,
 *     and a `roleId` pointing at a row in the dynamic `roles` table.
 *     roles.service.ts assignToUser writes roleId and never touches
 *     adminRole, so checking only the enum refuses people the founder's
 *     own Role Management screen says are entitled. Both are read and
 *     the results unioned.
 *
 *  2. The permission set is read from the database, not from the JWT.
 *     The admin token carries { sub, email, role, adminRole } and no
 *     permissions claim at all, and it lives for 30 minutes, so a
 *     revoked grant would otherwise keep working for the rest of that
 *     window. JwtStrategy already loads the live User row, so roleId and
 *     adminRole here are current; only the role's permission list needs
 *     fetching, and only for admins who actually hold a dynamic role.
 *
 * Fails closed in every direction: a route with no permission declared
 * is refused rather than allowed, and an unresolvable role holds nothing
 * rather than everything.
 */
@Injectable()
export class ExportPermissionGuard implements CanActivate {
  private readonly logger = new Logger(ExportPermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(EXPORT_PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    // A new export route that forgets its decorator must not be open to
    // every admin. Same reasoning as the dashboard's route table, where
    // an unregistered path is denied rather than allowed.
    if (!required) {
      throw new ForbiddenException('This export declares no permission and is therefore refused.');
    }

    const req  = ctx.switchToHttp().getRequest();
    const user = req.user;

    if (user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required.');
    }

    const held = await this.resolvePermissions(user);
    if (held.includes('*') || held.includes(required)) return true;

    // Logged as a warning, not silently: a refused export attempt is
    // worth seeing in the logs even though the audit trail only records
    // exports that actually ran.
    this.logger.warn(
      `EXPORT_ACCESS_DENIED admin=${user?.id} required=${required} held=${held.join(',') || 'none'}`,
    );
    throw new ForbiddenException(
      `This export requires the "${required}" permission. Ask a super admin to grant it on your role.`,
    );
  }

  /**
   * Every permission this actor holds, from both role systems.
   *
   * A legacy admin (role='admin', no adminRole, no roleId) predates
   * granular roles and holds everything. That matches resolveSessionPerms
   * in the dashboard, which gives the same account perms ['*'] and will
   * therefore render the export buttons for them. Refusing here instead
   * would produce the defect this codebase keeps writing comments about:
   * a fully enabled screen whose every action answers 403.
   */
  private async resolvePermissions(user: any): Promise<string[]> {
    const held = new Set<string>();

    if (user?.adminRole) {
      const seeded = SYSTEM_ROLES.find(r => r.slug === user.adminRole);
      for (const p of seeded?.permissions ?? []) held.add(p);
    }

    if (user?.roleId) {
      for (const p of await this.permissionsForRole(user.roleId)) held.add(p);
    }

    if (held.size === 0 && !user?.adminRole && !user?.roleId) return ['*'];
    return Array.from(held);
  }

  private async permissionsForRole(roleId: string): Promise<string[]> {
    try {
      const row = await this.dataSource
        .createQueryBuilder()
        .select('r.permissions', 'permissions')
        .from('roles', 'r')
        .where('r.id = :id', { id: roleId })
        .getRawOne();
      const raw = row?.permissions;
      if (Array.isArray(raw)) return raw;
      // Some drivers hand a jsonb column back as text.
      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      }
      return [];
    } catch (e: any) {
      // A lookup that fails grants nothing. Failing open here would mean
      // a database hiccup hands out the customer table.
      this.logger.error(`Could not read permissions for role ${roleId}: ${e?.message}`);
      return [];
    }
  }
}
