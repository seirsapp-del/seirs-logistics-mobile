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

const PERMISSIONS: Record<AdminRoleType, string[]> = {
  super_admin:       ['*'],
  ops_manager:       ['overview','ops-map','deliveries','drivers','users','partners','partner-redirects','specialists','analytics','tickets','pricing','fees'],
  support_agent:     ['tickets','users','suggestions','deliveries'],
  finance_officer:   ['overview','wallet','pricing','fees','referrals','insurance','analytics','reports'],
  driver_compliance: ['drivers','kyc','duplicates','fraud','users','audit-log'],
  media_content:     ['cms','promotions'],
  analyst:           ['overview','analytics','reports'],
  partner_manager:   ['partners','partner-redirects','specialists','deliveries','overview'],
};

// Legacy users that pre-date granular adminRole carry role='admin' on the
// User record but no adminRole. Treat them as super_admin so the sidebar
// renders properly and they retain full access until their record is migrated.
function isLegacyAdmin(role: AdminRoleType | string | undefined): boolean {
  return role === 'admin';
}

export function canAccess(role: AdminRoleType | undefined, page: string): boolean {
  if (!role) return false;
  if (isLegacyAdmin(role)) return true;
  const perms = PERMISSIONS[role] ?? [];
  return perms.includes('*') || perms.includes(page);
}

export function isSuperAdmin(role: AdminRoleType | undefined): boolean {
  return role === AdminRole.SUPER_ADMIN || isLegacyAdmin(role);
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
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      { href: '/deliveries',        label: 'Deliveries',          icon: 'Package',        permission: 'deliveries'        },
      { href: '/drivers',           label: 'Drivers',             icon: 'Truck',          permission: 'drivers'           },
      { href: '/users',             label: 'Customers',           icon: 'Users',          permission: 'users'             },
      { href: '/partners',          label: 'Partner Accounts',    icon: 'Store',          permission: 'partners'          },
      { href: '/partner-redirects', label: 'Partner Redirects',   icon: 'ArrowRightLeft', permission: 'partner-redirects' },
      { href: '/specialists',       label: 'Specialist Partners', icon: 'Briefcase',      permission: 'specialists'       },
    ],
  },
  {
    title: 'FINANCE',
    items: [
      { href: '/wallet',    label: 'Wallet & Payouts',   icon: 'Wallet',     permission: 'wallet'    },
      { href: '/pricing',   label: 'Pricing Engine',     icon: 'Tag',        permission: 'pricing'   },
      { href: '/fees',      label: 'Fee Catalogue',      icon: 'DollarSign', permission: 'fees'      },
      { href: '/referrals', label: 'Referrals',          icon: 'Share2',     permission: 'referrals' },
      { href: '/insurance', label: 'Insurance Partners', icon: 'Shield',     permission: 'insurance' },
    ],
  },
  {
    title: 'COMPLIANCE',
    items: [
      { href: '/fraud',      label: 'Fraud & Risk',        icon: 'ShieldAlert',    permission: 'fraud',      badge: 'fraud'   },
      { href: '/duplicates', label: 'Duplicate Accounts',  icon: 'Copy',           permission: 'duplicates'  },
      { href: '/kyc',        label: 'Driver KYC Queue',    icon: 'ClipboardCheck', permission: 'kyc'         },
    ],
  },
  {
    title: 'SUPPORT',
    items: [
      { href: '/tickets',     label: 'Ticketing',        icon: 'Ticket',    permission: 'tickets',     badge: 'tickets' },
      { href: '/suggestions', label: 'User Suggestions', icon: 'Lightbulb', permission: 'suggestions'  },
    ],
  },
  {
    title: 'CONTENT',
    items: [
      { href: '/cms',        label: 'CMS',        icon: 'FileText', permission: 'cms'        },
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
      { href: '/admins',    label: 'Staff Management', icon: 'UserCog',    permission: 'super_admin_only' },
      { href: '/audit-log', label: 'Audit Log',        icon: 'ScrollText', permission: 'audit-log'        },
      { href: '/settings',  label: 'System Settings',  icon: 'Settings',   permission: 'super_admin_only' },
    ],
  },
];
