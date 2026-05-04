import { Role } from './role.entity';

// Seeded baseline roles. Mirrors the original AdminSubRole enum so any
// existing admin user keeps working post-migration. Permissions match
// what the admin middleware enforces page-by-page.
//
// These are protected — super_admin cannot delete or rename a system
// role, only adjust its permissions if needed. Users wanting custom
// titles create new roles instead.
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
    description: 'Day-to-day operations — deliveries, drivers, partners, ops map, pricing levers.',
    permissions: [
      'overview','ops-map','deliveries','drivers','users','partners','partner-redirects',
      'specialists','analytics','tickets','pricing','fees','disputes','health',
      'last-order-compliance','notify','interstate','dev-accounts','dev-usage','dev-docs',
    ],
    isSystemRole: true,
    badgeColor:  'blue',
  },
  {
    slug:        'support_agent',
    name:        'Support Agent',
    description: 'Customer-facing support — tickets, user lookups, suggestion review, dispute reads.',
    permissions: ['tickets','users','suggestions','deliveries','disputes'],
    isSystemRole: true,
    badgeColor:  'green',
  },
  {
    slug:        'finance_officer',
    name:        'Finance Officer',
    description: 'Money and partnerships — wallet, pricing, fees, referrals, insurance commissions, dev platform billing.',
    permissions: ['overview','wallet','pricing','fees','referrals','insurance','analytics','reports','dev-accounts','dev-usage'],
    isSystemRole: true,
    badgeColor:  'yellow',
  },
  {
    slug:        'driver_compliance',
    name:        'Driver Compliance',
    description: 'Driver vetting and risk — KYC review, fraud queue, duplicate detection, last-order compliance.',
    permissions: ['drivers','kyc','duplicates','fraud','users','audit-log','interstate','last-order-compliance'],
    isSystemRole: true,
    badgeColor:  'purple',
  },
  {
    slug:        'media_content',
    name:        'Media & Content',
    description: 'In-app content + email templates + promotional campaigns + developer docs editing.',
    permissions: ['cms','promotions','email-templates','dev-docs'],
    isSystemRole: true,
    badgeColor:  'pink',
  },
  {
    slug:        'analyst',
    name:        'Analyst',
    description: 'Read-only analytics + reports access for performance review.',
    permissions: ['overview','analytics','reports'],
    isSystemRole: true,
    badgeColor:  'cyan',
  },
  {
    slug:        'partner_manager',
    name:        'Partner Manager',
    description: 'Partner store onboarding + redirect rules + specialist partner network.',
    permissions: ['partners','partner-redirects','specialists','deliveries','overview'],
    isSystemRole: true,
    badgeColor:  'orange',
  },
];

// Catalogue of all available permissions, grouped by sidebar section
// for the role-editor UI. Keep in sync with NAV_SECTIONS in rbac.ts.
export const PERMISSION_CATALOGUE: Array<{ section: string; items: Array<{ slug: string; label: string }> }> = [
  { section: 'OVERVIEW', items: [
    { slug: 'overview',  label: 'Dashboard' },
    { slug: 'ops-map',   label: 'Real-Time Ops Map' },
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
    { slug: 'disputes',               label: 'Liability Disputes' },
    { slug: 'last-order-compliance',  label: 'Last-Order Compliance' },
    { slug: 'interstate',             label: 'Interstate Trips' },
  ]},
  { section: 'SUPPORT', items: [
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
