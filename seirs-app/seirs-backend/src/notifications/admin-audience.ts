import { DataSource } from 'typeorm';

/**
 * Which staff should be told about a given thing.
 *
 * WHY this exists. Founder, 2 September 2026: "is it gated, because a person
 * assigned to website and apps has nothing to do with things like new sign
 * in and some other notification. Role and rule based control, right?"
 *
 * Right, and the routing was blunt in both directions. Both admin
 * notifications, the out-of-hours sign-in alert and the expiring-document
 * digest, went to `adminRole = 'super_admin'` and to nobody else. That is
 * safe but wrong twice over:
 *
 *   nobody gets what they should not     correct, a media_content person
 *                                        managing the website hears nothing
 *   nobody gets what they should either  driver_compliance exists precisely
 *                                        to handle KYC, and a rider's
 *                                        licence expiring is their actual
 *                                        job. They were never told.
 *
 * So every alert landed on the founder and only on the founder, which does
 * not survive a second member of staff.
 *
 * Routing is by PERMISSION, not by role name. A permission is what the role
 * was granted in order to do the work, so "tell whoever can act on this" and
 * "tell whoever holds the permission for it" are the same sentence. Adding a
 * role later needs no change here: grant it the permission and it starts
 * receiving.
 *
 * Two sources of truth are consulted because both exist in production:
 * roles.roleId for accounts on a custom role, and the legacy adminRole enum
 * for accounts predating it. Super admins always receive, since '*' covers
 * everything by definition.
 *
 * SECURITY_ALERT about a person's OWN account never comes through here: that
 * goes to the account owner, not to a permission group.
 */

/** Legacy adminRole enum values, mirroring roles.seed.ts. */
const LEGACY_ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin:       ['*'],
  ops_manager:       ['sos','overview','ops-map','deliveries','drivers','users','partners',
                      'analytics','tickets','support','pricing','fees','disputes','health',
                      'notify','interstate','zones.close','zones.price'],
  support_agent:     ['sos','tickets','support','users','suggestions','deliveries','disputes'],
  finance_officer:   ['sos','wallet','fees','pricing','reports','analytics','overview'],
  driver_compliance: ['sos','drivers','kyc','identity','duplicates','fraud','users',
                      'interstate','last-order-compliance'],
  media_content:     ['sos','cms','promotions','email-templates','dev-docs'],
  analyst:           ['sos','overview','analytics','reports'],
};

/**
 * Every admin user id that holds `permission`.
 *
 * Returns ids only. Deliberately no names, emails or roles: the caller wants
 * somebody to notify, not a staff directory, and a helper that hands back
 * user records invites one to be logged.
 */
export async function adminsWithPermission(
  ds: DataSource,
  permission: string,
  opts: { exclude?: string | null } = {},
): Promise<string[]> {
  const rows: Array<{ id: string; adminRole: string | null; permissions: string[] | null }> =
    await ds.query(`
      SELECT u.id, u."adminRole", r.permissions
        FROM users u
        LEFT JOIN roles r ON r.id = u."roleId"
       WHERE u.role = 'admin'
         AND u."isActive" = true
    `);

  const holds = (row: typeof rows[number]) => {
    // A custom role, when assigned, is the authority.
    const perms = row.permissions ?? LEGACY_ROLE_PERMISSIONS[row.adminRole ?? ''] ?? [];
    return perms.includes('*') || perms.includes(permission);
  };

  return rows
    .filter(r => r.id !== opts.exclude && holds(r))
    .map(r => r.id);
}
