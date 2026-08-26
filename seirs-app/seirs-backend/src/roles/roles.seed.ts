import { Role } from './role.entity';

// Seeded baseline roles. Mirrors the original AdminSubRole enum so any
// existing admin user keeps working post-migration. Permissions match
// what the admin middleware enforces page-by-page.
//
// These are protected - super_admin cannot delete or rename a system
// role, only adjust its permissions if needed. Users wanting custom
// titles create new roles instead.
//
// This list is mirrored in the admin dashboard at
// apps/admin-dashboard/src/lib/rbac.ts PERMISSIONS, and the two had
// drifted (found 2026-08-25). When an admin is on the dynamic role
// table the SERVER copy is the one that renders their sidebar, so every
// slug missing here was a page that role could not reach:
//
//   support_agent     had no 'support', so the Support Inbox, the one
//                     page that role exists to work in, was invisible.
//   driver_compliance had no 'identity' (the Customer ID queue) and
//                     still carried 'audit-log', which the dashboard
//                     revoked on 2026-08-23 because /audit-log is
//                     super-admin only: the grant only ever put a nav
//                     row in front of an Access Restricted wall.
//   every role        had no 'sos'.
//
// 'sos' is granted to EVERY non-super role on purpose. The SOS banner
// renders on every admin page for every admin with no permission check
// of its own, so any role can be told "open the SOS desk" and must be
// able to. Bouncing someone off the desk the banner just summoned them
// to is worse than a wide grant. An open emergency is not role-scoped.
export const SYSTEM_ROLES: Array<Partial<Role>> = [
  {
    slug:        'super_admin',
    name:        'Super Admin',
    description: 'Full access to every page and every action. Can manage other admins and create custom roles.',
    permissions: ['*'],
    isSystemRole: true,
    badgeColor:  'red',
  },
  {
    slug:        'ops_manager',
    name:        'Ops Manager',
    description: 'Day-to-day operations - deliveries, drivers, partners, ops map, pricing levers.',
    permissions: [
      'sos','overview','ops-map','deliveries','drivers','users','partners','partner-redirects',
      'specialists','analytics','tickets','support','pricing','fees','disputes','health',
      'last-order-compliance','notify','interstate','dev-accounts','dev-usage','dev-docs',
    ],
    isSystemRole: true,
    badgeColor:  'blue',
  },
  {
    slug:        'support_agent',
    name:        'Support Agent',
    description: 'Customer-facing support - support inbox, tickets, user lookups, suggestion review, dispute reads.',
    permissions: ['sos','tickets','support','users','suggestions','deliveries','disputes'],
    isSystemRole: true,
    badgeColor:  'green',
  },
  {
    slug:        'finance_officer',
    name:        'Finance Officer',
    description: 'Money and partnerships - wallet, pricing, fees, referrals, insurance commissions, dev platform billing.',
    permissions: ['sos','overview','wallet','pricing','fees','referrals','insurance','analytics','reports','dev-accounts','dev-usage'],
    isSystemRole: true,
    badgeColor:  'yellow',
  },
  {
    slug:        'driver_compliance',
    name:        'Driver Compliance',
    description: 'Driver vetting and risk - KYC review, customer ID queue, fraud queue, duplicate detection, last-order compliance.',
    // 'audit-log' deliberately absent: /audit-log is super-admin only, so
    // granting it here only ever showed a nav row that led to a refusal.
    permissions: ['sos','drivers','kyc','identity','duplicates','fraud','users','interstate','last-order-compliance'],
    isSystemRole: true,
    badgeColor:  'purple',
  },
  {
    slug:        'media_content',
    name:        'Media & Content',
    description: 'In-app content + email templates + promotional campaigns + developer docs editing.',
    permissions: ['sos','cms','promotions','email-templates','dev-docs'],
    isSystemRole: true,
    badgeColor:  'pink',
  },
  {
    slug:        'analyst',
    name:        'Analyst',
    description: 'Read-only analytics + reports access for performance review.',
    permissions: ['sos','overview','analytics','reports'],
    isSystemRole: true,
    badgeColor:  'cyan',
  },
  {
    slug:        'partner_manager',
    name:        'Partner Manager',
    description: 'Partner store onboarding + redirect rules + specialist partner network.',
    permissions: ['sos','partners','partner-redirects','specialists','deliveries','overview'],
    isSystemRole: true,
    badgeColor:  'orange',
  },
];

// Catalogue of all available permissions, grouped by sidebar section
// for the role-editor UI. Keep in sync with NAV_SECTIONS in rbac.ts.
//
// This is the ONLY source of tickable permissions when a super admin
// builds a custom role, so a page missing from here cannot be granted by
// any means. 'sos', 'identity' and 'support' were all absent (found
// 2026-08-25), which made three of the four pages in the founder's own
// worked example ungrantable: he described hiring a support person and
// ticking Dashboard, SOS, Tickets and CMS, and only two of those four
// existed to tick.
export const PERMISSION_CATALOGUE: Array<{ section: string; items: Array<{ slug: string; label: string }> }> = [
  { section: 'OVERVIEW', items: [
    { slug: 'overview',  label: 'Dashboard' },
    { slug: 'ops-map',   label: 'Real-Time Ops Map' },
    { slug: 'sos',       label: 'SOS Desk' },
  ]},
  { section: 'OPERATIONS', items: [
    { slug: 'deliveries',         label: 'Deliveries' },
    { slug: 'drivers',            label: 'Drivers' },
    { slug: 'users',              label: 'Customers' },
    { slug: 'partners',           label: 'Partner Accounts' },
    { slug: 'partner-redirects',  label: 'Partner Redirects' },
    { slug: 'specialists',        label: 'Specialist Partners' },
  ]},
  { section: 'FINANCE', items: [
    { slug: 'wallet',     label: 'Wallet & Payouts' },
    { slug: 'pricing',    label: 'Pricing Engine' },
    { slug: 'fees',       label: 'Fee Catalogue' },
    { slug: 'referrals',  label: 'Referrals' },
    { slug: 'insurance',  label: 'Insurance Partners' },
  ]},
  { section: 'COMPLIANCE', items: [
    { slug: 'fraud',                  label: 'Fraud & Risk' },
    { slug: 'duplicates',             label: 'Duplicate Accounts' },
    { slug: 'kyc',                    label: 'Driver KYC Queue' },
    { slug: 'identity',               label: 'Customer ID Queue' },
    { slug: 'disputes',               label: 'Liability Disputes' },
    { slug: 'last-order-compliance',  label: 'Last-Order Compliance' },
    { slug: 'interstate',             label: 'Interstate Trips' },
  ]},
  { section: 'SUPPORT', items: [
    { slug: 'support',     label: 'Support Inbox' },
    { slug: 'tickets',     label: 'Ticketing' },
    { slug: 'suggestions', label: 'User Suggestions' },
  ]},
  { section: 'CONTENT', items: [
    { slug: 'cms',        label: 'CMS' },
    { slug: 'promotions', label: 'Promotions' },
  ]},
  { section: 'ANALYTICS', items: [
    { slug: 'analytics', label: 'Analytics' },
    { slug: 'reports',   label: 'Reports' },
  ]},
  { section: 'OPS TOOLING', items: [
    { slug: 'health',          label: 'System Health' },
    { slug: 'notify',          label: 'Push Composer' },
    { slug: 'email-templates', label: 'Email Templates' },
  ]},
  { section: 'DEVELOPER PLATFORM', items: [
    { slug: 'dev-accounts', label: 'Developer Accounts' },
    { slug: 'dev-usage',    label: 'Platform Stats' },
    { slug: 'dev-docs',     label: 'Developer Docs' },
  ]},
  { section: 'SETTINGS', items: [
    { slug: 'audit-log', label: 'Audit Log' },
    { slug: 'roles',     label: 'Role Management' },
  ]},
];

/**
 * Targeted reconciliation for system roles that are ALREADY in the
 * database.
 *
 * onModuleInit only inserts slugs it cannot find, deliberately, so that
 * a super admin's permission edits are not stamped over on every boot.
 * That is still the right default, but it also means editing
 * SYSTEM_ROLES above changes nothing for any database seeded before the
 * edit, which is every deployed environment. The drift above is visible
 * on the founder's own Role Management screen right now: Support Agent
 * still reads five permissions there.
 *
 * So the fix is applied as explicit grants and revokes rather than a
 * wholesale overwrite, and only ever to isSystemRole rows:
 *
 *  - 'sos', 'support' and 'identity' were never in PERMISSION_CATALOGUE,
 *    so nobody could have ticked or un-ticked them. Granting them cannot
 *    be undoing an administrator's decision.
 *  - 'audit-log' on driver_compliance is revoked because /audit-log is
 *    super-admin only. The grant only ever rendered a nav row in front
 *    of a wall that always refused. Revoking narrows access, which is
 *    the safe direction to move without asking.
 *
 * Custom roles are never touched, and a role holding the '*' wildcard is
 * skipped because it already covers everything.
 *
 * Once every environment has booted once on this build, this list is
 * inert and can be emptied.
 */
export const SYSTEM_ROLE_RECONCILE: Array<{
  slug:    string;
  grant?:  string[];
  revoke?: string[];
}> = [
  { slug: 'ops_manager',       grant: ['sos', 'support'] },
  { slug: 'support_agent',     grant: ['sos', 'support'] },
  { slug: 'finance_officer',   grant: ['sos'] },
  { slug: 'driver_compliance', grant: ['sos', 'identity'], revoke: ['audit-log'] },
  { slug: 'media_content',     grant: ['sos'] },
  { slug: 'analyst',           grant: ['sos'] },
  { slug: 'partner_manager',   grant: ['sos'] },
];
