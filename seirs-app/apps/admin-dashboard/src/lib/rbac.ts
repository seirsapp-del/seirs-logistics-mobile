export const AdminRole = {
  SUPER_ADMIN:       'super_admin',
  OPS_MANAGER:       'ops_manager',
  SUPPORT_AGENT:     'support_agent',
  FINANCE_OFFICER:   'finance_officer',
  DRIVER_COMPLIANCE: 'driver_compliance',
  MEDIA_CONTENT:     'media_content',
  ANALYST:           'analyst',
  PARTNER_MANAGER:   'partner_manager',
} as const;

export type AdminRoleType = typeof AdminRole[keyof typeof AdminRole];

export const ROLE_LABELS: Record<AdminRoleType, string> = {
  super_admin:       'Super Admin',
  ops_manager:       'Ops Manager',
  support_agent:     'Support Agent',
  finance_officer:   'Finance Officer',
  driver_compliance: 'Driver Compliance',
  media_content:     'Media & Content',
  analyst:           'Analyst',
  partner_manager:   'Partner Manager',
};

export const ROLE_COLORS: Record<AdminRoleType, string> = {
  super_admin:       'bg-red-100 text-red-700',
  ops_manager:       'bg-blue-100 text-blue-700',
  support_agent:     'bg-green-100 text-green-700',
  finance_officer:   'bg-yellow-100 text-yellow-700',
  driver_compliance: 'bg-purple-100 text-purple-700',
  media_content:     'bg-pink-100 text-pink-700',
  analyst:           'bg-cyan-100 text-cyan-700',
  partner_manager:   'bg-orange-100 text-orange-700',
};

// Exported so src/middleware.ts can import the one true map. It used to
// keep its own copy, which had drifted: ops_manager was missing fees,
// health, notify and eight more, so the middleware and the sidebar
// disagreed about who could open what.
// 'sos' is granted to EVERY role on purpose. The SOS banner renders on
// every admin page for every admin with no permission check of its own
// (NavWrapper mounts SosBanner unconditionally), so any role can be told
// "open the SOS desk" and must be able to. Because PATH_PERMISSIONS in
// middleware.ts is derived from NAV_SECTIONS, giving the nav item a
// narrower key would gate /sos behind that key and bounce the very
// people the banner just summoned. An open emergency is not role-scoped.
export const PERMISSIONS: Record<AdminRoleType, string[]> = {
  super_admin:       ['*'],
  ops_manager:       ['sos','overview','ops-map','deliveries','drivers','users','partners','partner-redirects','specialists','analytics','tickets','support','pricing','fees','disputes','health','last-order-compliance','notify','interstate','dev-accounts','dev-usage','dev-docs'],
  support_agent:     ['sos','tickets','support','users','suggestions','deliveries','disputes'],
  finance_officer:   ['sos','overview','wallet','pricing','fees','referrals','insurance','analytics','reports','dev-accounts','dev-usage'],
  // audit-log removed 2026-08-23: /audit-log is super-admin only, so the
  // grant put a nav entry in front of a wall that always said Access
  // Restricted. Grant it back only if the page stops being super-admin only.
  driver_compliance: ['sos','drivers','kyc','identity','duplicates','fraud','users','interstate','last-order-compliance'],
  media_content:     ['sos','cms','promotions','email-templates','dev-docs'],
  analyst:           ['sos','overview','analytics','reports'],
  partner_manager:   ['sos','partners','partner-redirects','specialists','deliveries','overview'],
};

// Legacy users that pre-date granular adminRole carry role='admin' on the
// User record but no adminRole. Treat them as super_admin so the sidebar
// renders properly and they retain full access until their record is migrated.
function isLegacyAdmin(role: AdminRoleType | string | undefined): boolean {
  return role === 'admin';
}

/**
 * Permissions every signed-in admin holds, whatever their role.
 *
 * 'sos' is here rather than only in PERMISSIONS above because a custom
 * dynamic role gets its permission list from the backend role catalogue,
 * which this app cannot add a slug to. Without this, a super admin who
 * created a custom role would see the SOS banner on every page and have
 * no SOS Desk in the sidebar, which is the exact defect being fixed
 * (founder 2026-08-24: "i see sos alert and here i see no sos tab").
 * The backend still guards the SOS endpoints themselves.
 */
export const ALWAYS_GRANTED = ['sos'];

export function canAccess(role: AdminRoleType | undefined, page: string): boolean {
  if (!role) return false;
  if (isLegacyAdmin(role)) return true;
  if (ALWAYS_GRANTED.includes(page)) return true;
  const perms = PERMISSIONS[role] ?? [];
  return perms.includes('*') || perms.includes(page);
}

// Spec V8. server-driven permission check. Call this when the user
// object exposes `permissions` + `roleSlug` from the dynamic role
// system. Falls back to the hardcoded enum check for legacy sessions.
export function canAccessFromUser(
  user: { adminRole?: AdminRoleType; role?: string; permissions?: string[]; roleSlug?: string | null } | null,
  page: string,
): boolean {
  if (!user) return false;
  if (user.role === 'admin' && !user.adminRole && !user.roleSlug) return true;
  if (ALWAYS_GRANTED.includes(page)) return true;
  if (Array.isArray(user.permissions) && user.roleSlug) {
    return user.permissions.includes('*') || user.permissions.includes(page);
  }
  return canAccess(user.adminRole, page);
}

export function isSuperAdmin(role: AdminRoleType | undefined): boolean {
  return role === AdminRole.SUPER_ADMIN || isLegacyAdmin(role);
}

// Same idea. checks the server-provided role slug first, falls back to enum.
export function isSuperAdminFromUser(
  user: { adminRole?: AdminRoleType; role?: string; roleSlug?: string | null } | null,
): boolean {
  if (!user) return false;
  if (user.roleSlug === 'super_admin') return true;
  return isSuperAdmin(user.adminRole);
}

// ── NDPR tooling allow-lists ────────────────────────────────────────────
// These mirror AdminService.NDPR_EXPORT_ROLES / NDPR_DELETE_ROLES on the
// backend exactly. Symptom they fix: /users/[id] and /drivers/[id]
// rendered a fully enabled "NDPR hard-delete" to ops_manager and
// driver_compliance, who only discovered the API refuses them after
// typing a reason and confirming the account name. Keep both lists in
// step with the service if the backend allow-lists ever move.
const NDPR_EXPORT_ROLES = ['super_admin', 'support_agent', 'finance_officer'];
const NDPR_DELETE_ROLES = ['super_admin', 'support_agent'];

type SessionUser = { adminRole?: AdminRoleType; role?: string; roleSlug?: string | null } | null;

// The slug the backend will actually see for this session. A dynamic role
// carries roleSlug; a legacy admin carries role='admin' and nothing else,
// and the backend treats that as super_admin.
function effectiveRoleSlug(user: SessionUser): string | undefined {
  if (!user) return undefined;
  if (user.roleSlug) return user.roleSlug;
  if (user.adminRole) return user.adminRole;
  return isLegacyAdmin(user.role) ? AdminRole.SUPER_ADMIN : undefined;
}

export function canExportNdprData(user: SessionUser): boolean {
  const slug = effectiveRoleSlug(user);
  return !!slug && NDPR_EXPORT_ROLES.includes(slug);
}

export function canHardDeleteAccount(user: SessionUser): boolean {
  const slug = effectiveRoleSlug(user);
  return !!slug && NDPR_DELETE_ROLES.includes(slug);
}

// Ship flags for nav entries whose feature is not live yet. The page
// itself stays routable (and middleware-gated, since PATH_PERMISSIONS is
// derived from NAV_SECTIONS) but it does not take a permanent sidebar
// slot. /partner-redirects renders three preview rows against no backend.
export const NAV_FEATURE_FLAGS: Record<string, boolean> = {
  '/partner-redirects': false,
};

export function isNavItemVisible(href: string): boolean {
  return NAV_FEATURE_FLAGS[href] !== false;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export interface NavItem {
  href:       string;
  label:      string;
  icon:       string;
  permission: string;
  badge?:     'tickets' | 'fraud';
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'OVERVIEW',
    items: [
      { href: '/',         label: 'Dashboard',        icon: 'LayoutDashboard', permission: 'overview'    },
      { href: '/ops-map',  label: 'Real-Time Ops Map', icon: 'Map',            permission: 'ops-map'     },
      // The SOS desk had NO nav entry at all: the page existed and the
      // only way in was clicking the red banner, so if that banner ever
      // failed to render the emergency queue was unreachable (founder
      // spotted it 2026-08-24: "i see sos alert and here i see no sos tab").
      // First in OVERVIEW because it outranks everything when it is live.
      // Permission is its own 'sos' key, granted to every role above.
      // It was first written as 'overview', but support_agent,
      // driver_compliance and media_content do not hold 'overview': they
      // would have seen the SOS banner on every page and had no SOS Desk
      // in their sidebar, and middleware (which derives its path gate
      // from this list) would have had /sos behind a key they lack.
      { href: '/sos',      label: 'SOS Desk',          icon: 'Siren',          permission: 'sos'         },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      { href: '/deliveries',        label: 'Deliveries',          icon: 'Package',        permission: 'deliveries'        },
      { href: '/drivers',           label: 'Drivers',             icon: 'Truck',          permission: 'drivers'           },
      { href: '/users',             label: 'Customers',           icon: 'Users',          permission: 'users'             },
      { href: '/partners',          label: 'Partner Accounts',    icon: 'Store',          permission: 'partners'          },
      { href: '/partner-applications', label: 'Partner Applications', icon: 'FileText',    permission: 'partners'          },
      { href: '/partner-redirects', label: 'Partner Redirects',   icon: 'ArrowRightLeft', permission: 'partner-redirects' },
      { href: '/specialists',       label: 'Specialist Partners', icon: 'Briefcase',      permission: 'specialists'       },
    ],
  },
  {
    title: 'FINANCE',
    items: [
      { href: '/wallet',          label: 'Wallet & Payouts',  icon: 'Wallet',     permission: 'wallet'    },
      { href: '/pricing',         label: 'Pricing Engine',    icon: 'Tag',        permission: 'pricing'   },
      { href: '/service-catalog', label: 'Service Catalog',   icon: 'List',       permission: 'pricing'   },
      { href: '/fees',            label: 'Fee Catalogue',     icon: 'DollarSign', permission: 'fees'      },
      { href: '/referrals', label: 'Referrals',          icon: 'Share2',     permission: 'referrals' },
      { href: '/insurance', label: 'Insurance Partners', icon: 'Shield',     permission: 'insurance' },
    ],
  },
  {
    title: 'COMPLIANCE',
    items: [
      { href: '/fraud',                  label: 'Fraud & Risk',        icon: 'ShieldAlert',    permission: 'fraud',                  badge: 'fraud' },
      { href: '/duplicates',             label: 'Duplicate Accounts',  icon: 'Copy',           permission: 'duplicates'              },
      { href: '/recycle-bin',            label: 'Recycle Bin',         icon: 'Trash2',         permission: 'users'                   },
      { href: '/kyc',                    label: 'Driver KYC Queue',    icon: 'ClipboardCheck', permission: 'kyc'                     },
      { href: '/identity',               label: 'Customer ID Queue',    icon: 'ShieldCheck',    permission: 'identity'                },
      { href: '/disputes',               label: 'Liability Disputes',  icon: 'ShieldCheck',    permission: 'disputes'                },
      { href: '/last-order-compliance',  label: 'Last-Order Compliance',icon: 'MoonStar',      permission: 'last-order-compliance'   },
      { href: '/interstate',             label: 'Interstate Trips',     icon: 'Truck',         permission: 'interstate'              },
    ],
  },
  {
    title: 'OPS',
    items: [
      { href: '/health',           label: 'System Health',     icon: 'Activity', permission: 'health'           },
      { href: '/notify',           label: 'Push Composer',     icon: 'Send',     permission: 'notify'           },
      { href: '/email-templates',  label: 'Email Templates',   icon: 'Mail',     permission: 'email-templates'  },
    ],
  },
  {
    title: 'DEVELOPER PLATFORM',
    items: [
      { href: '/dev-accounts',  label: 'Developer Accounts', icon: 'Code2',    permission: 'dev-accounts' },
      { href: '/dev-usage',     label: 'Platform Stats',     icon: 'BarChart3',permission: 'dev-usage'    },
      { href: '/dev-docs',      label: 'Developer Docs',     icon: 'BookOpen', permission: 'dev-docs'     },
    ],
  },
  {
    title: 'SUPPORT',
    items: [
      // Ticketing removed from the nav 2026-08-16: it was a second view
      // of the same support_tickets data that Support Inbox serves. The
      // route still redirects there for old links.
      { href: '/support',     label: 'Support Inbox',    icon: 'Inbox',     permission: 'support',     badge: 'tickets' },
      { href: '/suggestions', label: 'User Suggestions', icon: 'Lightbulb', permission: 'suggestions'  },
    ],
  },
  {
    title: 'CONTENT',
    items: [
      { href: '/cms',        label: 'In-App CMS', icon: 'FileText', permission: 'cms'        },
      { href: '/website',    label: 'Website',    icon: 'Globe',    permission: 'cms'        },
      { href: '/promotions', label: 'Promotions', icon: 'Percent',  permission: 'promotions' },
    ],
  },
  {
    title: 'ANALYTICS',
    items: [
      { href: '/analytics', label: 'Analytics', icon: 'BarChart2',    permission: 'analytics' },
      { href: '/reports',   label: 'Reports',   icon: 'FileBarChart', permission: 'reports'   },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      { href: '/admins',    label: 'Staff Management', icon: 'UserCog',     permission: 'super_admin_only' },
      { href: '/roles',     label: 'Role Management',  icon: 'ShieldCheck', permission: 'roles'            },
      { href: '/audit-log', label: 'Audit Log',        icon: 'ScrollText',  permission: 'audit-log'        },
      { href: '/settings',  label: 'System Settings',  icon: 'Settings',    permission: 'super_admin_only' },
    ],
  },
];
