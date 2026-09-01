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
// "open the SOS desk" and must be able to. /sos is a row in
// ROUTE_PERMISSIONS like every other page, so giving it a narrower key
// would gate the desk behind that key and bounce the very people the
// banner just summoned. An open emergency is not role-scoped. The real
// grant lives in ALWAYS_GRANTED below, which covers dynamic roles too:
// the backend catalogue has no 'sos' slug to tick, so a custom role
// could never be given it explicitly.
//
// This list is ALSO seeded, separately, in the backend at
// seirs-backend/src/roles/roles.seed.ts SYSTEM_ROLES, and the two have
// drifted. See the note on canAccessFromUser.
// 'exports-finance' and 'exports-operational' appear in NO role below,
// on purpose, and the backend seed agrees. Bulk data egress is a founder
// decision rather than something that arrives with a deploy, so only a
// '*' holder has it until a super admin ticks it on a role in Role
// Management. Both slugs are in the backend PERMISSION_CATALOGUE so they
// are two clicks away, not a code change.
export const PERMISSIONS: Record<AdminRoleType, string[]> = {
  super_admin:       ['*'],
  // zones.close and zones.price granted 2026-08-28. Closing an area is an
  // operations decision made under time pressure, and reserving it to the
  // founder alone meant SEIRS could not close anywhere while he was
  // asleep, which is exactly when a curfew is announced. Mirrors the
  // backend seed: the buttons and the API have to agree, or the page
  // offers a control the server then refuses.
  ops_manager:       ['sos','overview','ops-map','deliveries','drivers','users','partners','partner-redirects','specialists','analytics','tickets','support','pricing','fees','disputes','health','last-order-compliance','notify','interstate','dev-accounts','dev-usage','dev-docs','zones.close','zones.price'],
  support_agent:     ['sos','tickets','support','users','suggestions','deliveries','disputes'],
  // zones.price, never zones.close: what an area costs is their job,
  // whether SEIRS operates there is not.
  finance_officer:   ['sos','overview','wallet','pricing','fees','referrals','insurance','analytics','reports','dev-accounts','dev-usage','zones.price'],
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

/**
 * Spec V8. server-driven permission check. Call this when the user
 * object exposes `permissions` + `roleSlug` from the dynamic role
 * system. Falls back to the hardcoded enum check for legacy sessions.
 *
 * KNOWN DRIFT, needs a backend change to close (verified 2026-08-25).
 * The eight built-in roles are defined TWICE: in PERMISSIONS above, and
 * in seirs-backend/src/roles/roles.seed.ts SYSTEM_ROLES. When an admin
 * is on the dynamic role table the server's copy wins here, and the two
 * no longer agree:
 *
 *   support_agent     server is missing 'support', so Support Inbox,
 *                     the page that role exists to work in, disappears
 *                     from their sidebar.
 *   driver_compliance server is missing 'identity' (the Customer ID
 *                     queue) and still grants 'audit-log', which was
 *                     deliberately revoked here on 2026-08-23.
 *   every role        server is missing 'sos'. ALWAYS_GRANTED covers
 *                     that one, which is why nobody has noticed.
 *
 * Worse, PERMISSION_CATALOGUE in the same backend file has no entry for
 * 'support', 'identity' or 'sos' at all, so a super admin building a
 * custom role cannot grant those three pages by any means. Do not
 * "fix" this by preferring the local copy: that would silently ignore a
 * super admin editing a role in the UI. The seed and the catalogue are
 * what need updating.
 */
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

// ── Route permission table ──────────────────────────────────────────────
/**
 * The ONE map of route path to permission key. Exhaustive over every
 * page.tsx under src/app, on purpose.
 *
 * Symptom this fixes: the middleware gate used to be DERIVED from
 * NAV_SECTIONS, so "not in the sidebar" silently meant "not gated". The
 * 2026-08-23 sweep found 17 pages reachable with no permission check at
 * all, /roles among them. Deriving from the nav closed those, but left
 * the same trapdoor open for the NEXT page anyone adds: a page with no
 * nav entry still had no gate, and an unknown route was ALLOWED.
 *
 * So the dependency is now inverted. This table is the source of truth,
 * NAV_SECTIONS reads its permission out of it, and middleware denies any
 * route missing from here. A new page is therefore protected by default
 * and has to be named here to become reachable, the same way the API
 * redaction is a whitelist rather than a blacklist.
 *
 * Sub-paths inherit by longest-prefix match, so /drivers/[id] is covered
 * by '/drivers' and does not need its own row.
 */
export const ROUTE_PERMISSIONS: Record<string, string> = {
  '/':                        'overview',
  '/ops-map':                 'ops-map',
  '/sos':                     'sos',

  '/deliveries':              'deliveries',
  '/drivers':                 'drivers',
  '/users':                   'users',
  '/partners':                'partners',
  '/partner-applications':    'partners',
  '/partner-redirects':       'partner-redirects',
  '/specialists':             'specialists',

  '/wallet':                  'wallet',
  '/pricing':                 'pricing',
  '/service-catalog':         'pricing',
  // SEIRS Zones sits under the pricing key on purpose. A zone is a
  // pricing surface first, and the two writes that are genuinely
  // dangerous (closing an area, repricing one) are gated separately in
  // the API by zones.close and zones.price, which is where a refusal
  // actually protects anybody. An unlisted route is denied outright
  // since 2026-08-25, so without this row the page would be unreachable.
  '/zones':                   'pricing',
  '/fees':                    'fees',
  '/referrals':               'referrals',
  '/insurance':               'insurance',

  '/fraud':                   'fraud',
  '/duplicates':              'duplicates',
  '/recycle-bin':             'users',
  // A vehicle swap is a DRIVER compliance decision, so it rides the
  // drivers grant rather than earning its own.
  '/vehicle-changes':         'drivers',
  '/kyc':                     'kyc',
  '/identity':                'identity',
  '/disputes':                'disputes',
  // Broken agreements are driver CONDUCT, and the outcome may be a
  // suspension, so it rides the drivers grant rather than disputes.
  // driver_compliance already holds it, which is the role that should
  // be reading these.
  '/agreement-breaches':      'drivers',
  '/last-order-compliance':   'last-order-compliance',
  '/interstate':              'interstate',
  // Seat ops share the interstate grant: it is the same product and the
  // same people work it, so a second permission would only be a second
  // thing to forget when a role is created.
  '/travel-buddy':            'interstate',

  '/health':                  'health',
  '/notify':                  'notify',
  '/email-templates':         'email-templates',

  '/dev-accounts':            'dev-accounts',
  '/dev-usage':               'dev-usage',
  '/dev-docs':                'dev-docs',

  '/support':                 'support',
  // /tickets left the sidebar 2026-08-16 and now redirects to /support
  // for old links. It is still a real route, so it still needs a row:
  // this is exactly the "page without a nav entry" case that used to
  // fall through the gate entirely.
  '/tickets':                 'tickets',
  '/suggestions':             'suggestions',
  '/contact-submissions':     'support',

  '/website':                 'cms',
  '/promotions':              'promotions',

  '/analytics':               'analytics',
  '/reports':                 'reports',

  // Two permissions, either of which opens the page, because the money
  // exports and the operational exports are separate grants and a
  // finance officer holding only the first must still be able to reach
  // the screen. permsAllow understands the '|' form; the page then
  // hides each individual button the viewer was not granted.
  '/exports':                 'exports-finance|exports-operational',

  '/admins':                  'super_admin_only',
  '/roles':                   'roles',
  '/audit-log':               'audit-log',
  '/settings':                'super_admin_only',
  // The launch reset deletes accounts in bulk. Super admin only, and
  // never a page a role can be granted: 'super_admin_only' is an
  // assertion about WHO the account is, so even a '*' holder fails it.
  '/launch-reset':            'super_admin_only',
};

/**
 * Routes that must render with no session at all. Spec V8 §3 puts admin
 * password recovery outside the wall. Anything NOT listed here and NOT
 * in ROUTE_PERMISSIONS is denied, which is the point.
 */
export const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password'];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/**
 * Permission guarding a path, by longest-prefix match so detail routes
 * inherit from their list route. Returns undefined for a route that is
 * not in the table, and every caller must treat that as DENY.
 */
export function permissionForRoute(pathname: string): string | undefined {
  let best: string | undefined;
  let bestLen = -1;
  for (const path in ROUTE_PERMISSIONS) {
    // path + '/' rather than startsWith(path) so '/users' does not
    // swallow a future '/users-export', and so '/' (which becomes '//')
    // only ever matches itself exactly.
    if ((pathname === path || pathname.startsWith(path + '/')) && path.length > bestLen) {
      best    = ROUTE_PERMISSIONS[path];
      bestLen = path.length;
    }
  }
  return best;
}

/**
 * Does this permission list satisfy `permission`?
 *
 * Shared by middleware and the client guard so the two cannot drift the
 * way PATH_PERMISSIONS and PERMISSIONS did. `slug` is only consulted for
 * 'super_admin_only', which is a role check rather than a grant.
 */
export function permsAllow(perms: string[], permission: string, slug?: string): boolean {
  // Checked BEFORE the wildcard on purpose. 'super_admin_only' is not a
  // page permission that a role can be granted, it is an assertion about
  // who the account is, so holding '*' must not satisfy it. The backend
  // agrees: SuperAdminGuard tests adminRole === 'super_admin' and
  // nothing else, so anyone else opening /admins or /settings would get
  // a fully enabled screen whose every save returns 403. That is the
  // same defect already documented on the NDPR buttons above.
  if (permission === 'super_admin_only') return slug === AdminRole.SUPER_ADMIN;
  // 'a|b' means either grant opens the route. Added for /exports, whose
  // two permissions are deliberately separate (money is a stricter grant
  // than operational data) while the page they share is one route. No
  // existing permission slug contains a pipe, so this changes nothing
  // for any other row in the table.
  if (permission.includes('|')) {
    return permission.split('|').some((p) => permsAllow(perms, p, slug));
  }
  if (perms.includes('*')) return true;
  if (ALWAYS_GRANTED.includes(permission)) return true;
  return perms.includes(permission);
}

/**
 * Where to send someone who asked for a page their role does not hold.
 *
 * Walks the sidebar in display order and returns the first page they can
 * actually open, skipping ALWAYS_GRANTED entries so a content editor
 * lands on the CMS rather than on the SOS desk. Falls back to /sos,
 * which every signed-in admin holds, so this never returns a path the
 * caller would bounce off again and never loops.
 */
export function firstAllowedRoute(perms: string[], slug?: string): string {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (ALWAYS_GRANTED.includes(item.permission)) continue;
      if (permsAllow(perms, item.permission, slug)) return item.href;
    }
  }
  return '/sos';
}

// ── Session permission cookie ───────────────────────────────────────────
/**
 * Middleware runs on the edge before any app code, so it can read
 * cookies and nothing else. The admin JWT carries only
 * { sub, email, role, adminRole, iat, exp } (decoded from a live
 * production token, 2026-08-25): there is NO roleSlug and NO
 * permissions claim.
 *
 * That is what makes a custom role LESS enforced than a built-in one. An
 * admin on a role created through the backend catalogue has
 * adminRole = null and role = 'admin', decodes as plain 'admin', and
 * used to fall straight past the whole RBAC block.
 *
 * The login/refresh RESPONSE does carry roleSlug + permissions, it just
 * never reaches the token. So the session writes them to this companion
 * cookie at sign-in, and middleware reads the real permission set from
 * there with no fetch and no added latency.
 *
 * This is UX-grade, not a security boundary: it is set from JS, so it is
 * editable by whoever owns the browser. The backend guards remain the
 * real wall. Its job is to stop a correctly-configured admin from being
 * silently ungated, not to stop an attacker.
 */
export const PERMS_COOKIE = 'seirs_admin_perms';

// '~' and '!' both survive encodeURIComponent untouched, so the cookie
// stays readable and roughly 700 bytes for a wide role. JSON here would
// percent-escape every quote and comma and triple the size against the
// 4KB cookie limit.
export function encodePermsCookie(slug: string, perms: string[]): string {
  return slug + '~' + perms.join('!');
}

export function decodePermsCookie(raw: string | undefined): { slug: string; perms: string[] } | null {
  if (!raw) return null;
  const sep = raw.indexOf('~');
  if (sep < 0) return null;
  const slug  = raw.slice(0, sep);
  const perms = raw.slice(sep + 1).split('!').filter(Boolean);
  if (!slug) return null;
  return { slug, perms };
}

/**
 * The permission set a session actually holds, from the login response
 * shape. Mirrors canAccessFromUser's precedence so the cookie cannot
 * disagree with the sidebar.
 */
export function resolveSessionPerms(
  user: { adminRole?: AdminRoleType; role?: string; permissions?: string[]; roleSlug?: string | null } | null,
): { slug: string; perms: string[] } | null {
  if (!user) return null;
  if (user.roleSlug && Array.isArray(user.permissions)) {
    return { slug: user.roleSlug, perms: user.permissions };
  }
  if (user.adminRole && user.adminRole in PERMISSIONS) {
    return { slug: user.adminRole, perms: PERMISSIONS[user.adminRole] };
  }
  // Legacy admin: role='admin', no adminRole, no dynamic role. They
  // pre-date granular roles and hold every PAGE, so the perms are '*'.
  //
  // The slug is deliberately NOT 'super_admin'. The backend's
  // SuperAdminGuard tests adminRole === 'super_admin', which a legacy
  // record does not have, so it refuses them on Staff Management and
  // System Settings. AdminNav already hides both (isSuperAdminFromUser
  // reads adminRole and answers false here), and the route gate used to
  // disagree and let them in, onto a page whose every action 403s.
  // Keeping the slug distinct makes permsAllow above refuse
  // 'super_admin_only' while '*' still opens every ordinary page.
  if (isLegacyAdmin(user.role)) return { slug: 'admin', perms: ['*'] };
  return null;
}

// ── Sidebar ─────────────────────────────────────────────────────────────
// Ship flags for nav entries whose feature is not live yet. The page
// itself stays routable and gated (ROUTE_PERMISSIONS covers it whether
// or not it has a sidebar slot) but it does not take a permanent one.
// /partner-redirects renders three preview rows against no backend.
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

// A nav entry carries no permission of its own any more. It is looked up
// in ROUTE_PERMISSIONS below, so the sidebar and the gate physically
// cannot disagree about a page. Adding an item here does NOT grant it a
// route; adding it to ROUTE_PERMISSIONS does.
interface NavItemDef {
  href:   string;
  label:  string;
  icon:   string;
  badge?: 'tickets' | 'fraud';
}

// A route missing from ROUTE_PERMISSIONS gets this sentinel, which no
// role can ever hold, so a mis-typed href hides its own nav row instead
// of rendering a link that middleware then bounces.
const UNREGISTERED_ROUTE = '__unregistered_route__';

const NAV_LAYOUT: Array<{ title: string; items: NavItemDef[] }> = [
  {
    title: 'OVERVIEW',
    items: [
      { href: '/',         label: 'Dashboard',         icon: 'LayoutDashboard' },
      { href: '/ops-map',  label: 'Real-Time Ops Map', icon: 'Map'             },
      // The SOS desk had NO nav entry at all: the page existed and the
      // only way in was clicking the red banner, so if that banner ever
      // failed to render the emergency queue was unreachable (founder
      // spotted it 2026-08-24: "i see sos alert and here i see no sos tab").
      // First in OVERVIEW because it outranks everything when it is live.
      // Its 'sos' key is in ALWAYS_GRANTED: the banner renders for every
      // admin on every page, so bouncing someone off the desk they were
      // just told to open is worse than a wide grant.
      { href: '/sos',      label: 'SOS Desk',          icon: 'Siren'           },
    ],
  },
  {
    /**
     * The things SEIRS moves, and the people who move them.
     *
     * Interstate Trips and Travel Buddy moved here from COMPLIANCE on
     * 2026-08-28. They are the intercity product, not a compliance
     * queue: a rider declares a route and a passenger books a seat on
     * it. They sat under COMPLIANCE only because that is where they
     * happened to land, which also made that section nine items deep.
     */
    title: 'OPERATIONS',
    items: [
      { href: '/deliveries', label: 'Deliveries',       icon: 'Package' },
      { href: '/drivers',    label: 'Drivers',          icon: 'Truck'   },
      { href: '/vehicle-changes', label: 'Vehicle changes', icon: 'Car' },
      { href: '/users',      label: 'Customers',        icon: 'Users'   },
      /**
       * Zones lives with operations, not with pricing.
       *
       * It does two jobs and they are not equally urgent. Tuning a
       * multiplier for a corridor is planned work. Closing an area for a
       * curfew, a flood or a riot is not, and closing is the reason
       * Zones exists at all: "when i say close it means closed so no
       * form of operation there" (founder, 2026-08-27), which is the
       * requirement the whole spec was built around.
       *
       * At 6pm with a curfew coming, the person scanning this sidebar is
       * an ops manager and they will look under OPERATIONS. Reaching a
       * multiplier a few seconds slower costs nothing. Reaching a
       * closure slower costs real risk.
       */
      { href: '/zones',      label: 'Zones',            icon: 'Map'     },
      { href: '/interstate', label: 'Interstate Trips', icon: 'Truck'   },
      { href: '/travel-buddy', label: 'Travel Buddy',   icon: 'Users'   },
    ],
  },
  {
    /**
     * Split out of OPERATIONS on 2026-08-28. Four partner rows were
     * making that section seven deep, and a partner relationship is a
     * different job from dispatching a delivery: you approve them,
     * suspend them, and pay them, none of which happens to a parcel.
     */
    title: 'PARTNERS',
    items: [
      { href: '/partners',             label: 'Partner Accounts',     icon: 'Store'          },
      { href: '/partner-applications', label: 'Partner Applications', icon: 'FileText'       },
      { href: '/partner-redirects',    label: 'Partner Redirects',    icon: 'ArrowRightLeft' },
      { href: '/specialists',          label: 'Specialist Partners',  icon: 'Briefcase'      },
    ],
  },
  {
    title: 'FINANCE',
    items: [
      { href: '/wallet',          label: 'Wallet & Payouts',   icon: 'Wallet'     },
      { href: '/pricing',         label: 'Pricing & Fees',     icon: 'Tag'        },
      { href: '/service-catalog', label: 'Service Catalog',    icon: 'List'       },
      { href: '/referrals',       label: 'Referrals',          icon: 'Share2'     },
      { href: '/insurance',       label: 'Insurance Partners', icon: 'Shield'     },
      // Until 2026-08-28 the only export in the whole admin was the NDPR
      // bundle on one driver, so reconciling a payout run against a bank
      // statement meant reading figures off a page and retyping them.
      //
      // It sat under ANALYTICS at first, which is where you go to look at
      // charts. This is where you go to take the money data away: it reads
      // the payout ledger, it is gated on exports-finance, and it is the
      // easiest way for a customer table to leave the building. It belongs
      // beside the money it reports on.
      { href: '/exports',         label: 'Data Exports',       icon: 'Download'   },
    ],
  },
  {
    title: 'COMPLIANCE',
    items: [
      { href: '/fraud',                 label: 'Fraud & Risk',          icon: 'ShieldAlert',    badge: 'fraud' },
      { href: '/duplicates',            label: 'Duplicate Accounts',    icon: 'Copy'           },
      { href: '/kyc',                   label: 'Driver KYC Queue',      icon: 'ClipboardCheck' },
      { href: '/identity',              label: 'Customer ID Queue',     icon: 'ShieldCheck'    },
      { href: '/disputes',              label: 'Liability Disputes',    icon: 'ShieldCheck'    },
      { href: '/agreement-breaches',    label: 'Broken Agreements',     icon: 'Handshake'      },
      { href: '/last-order-compliance', label: 'Last-Order Compliance', icon: 'MoonStar'       },
      { href: '/recycle-bin',           label: 'Recycle Bin',           icon: 'Trash2'         },
    ],
  },
  {
    /**
     * Everything the platform says to somebody, in one place.
     *
     * This replaces the old OPS section, which was a navigation bug
     * rather than a category: OPS and OPERATIONS mean the same thing, so
     * anyone looking for Deliveries read OPS first and found server
     * health. Its three rows were System Health (now SYSTEM), Push
     * Composer and Email Templates.
     *
     * Push, email, website copy and promotions were split across OPS and
     * CONTENT, so every outbound message the platform sends lived in two
     * different sections of the sidebar.
     */
    title: 'MESSAGING',
    items: [
      { href: '/notify',          label: 'Push Composer',   icon: 'Send'    },
      { href: '/email-templates', label: 'Email Templates', icon: 'Mail'    },
      // Labels swapped round 2026-08-26. They were exactly backwards.
      // "In-App CMS" writes to cms_items, which no app or website reads:
      // it has no public route at all. "Website" writes to
      // website_content, which feeds the customer app carousel, the
      // business app carousel, the in-app Stories list AND seirs.app.
      // The founder went looking for the app carousel, clicked the one
      // that said In-App, published, and nothing happened.
      { href: '/website',         label: 'App & Website Content', icon: 'Globe'   },
      { href: '/promotions',      label: 'Promotions',      icon: 'Percent' },
    ],
  },
  {
    title: 'SUPPORT',
    items: [
      // Ticketing removed from the nav 2026-08-16: it was a second view
      // of the same support_tickets data that Support Inbox serves. The
      // route still redirects there for old links.
      { href: '/support',     label: 'Support Inbox',    icon: 'Inbox',     badge: 'tickets' },
      // Added 2026-08-30. The website contact form has been saving rows
      // since it shipped and nothing in this dashboard ever read them, so
      // every message sent through seirs.co was invisible. No email fans
      // out either, which makes this page the only place they surface.
      { href: '/contact-submissions', label: 'Website Messages', icon: 'Mail' },
      { href: '/suggestions', label: 'User Suggestions', icon: 'Lightbulb' },
    ],
  },
  {
    title: 'DEVELOPER PLATFORM',
    items: [
      { href: '/dev-accounts', label: 'Developer Accounts', icon: 'Code2'     },
      { href: '/dev-usage',    label: 'Platform Stats',     icon: 'BarChart3' },
      { href: '/dev-docs',     label: 'Developer Docs',     icon: 'BookOpen'  },
    ],
  },
  {
    /**
     * Who can do what, and who did it. Lifted out of SETTINGS on
     * 2026-08-28.
     *
     * Access control is not a preference. It governs every other page in
     * this dashboard, and it sat between Audit Log and System Settings
     * with the same visual weight as a colour scheme. The audit log
     * belongs beside it rather than under SYSTEM: granting a role and
     * reading who used it are one job, and separating them is how a
     * permission change goes unnoticed.
     *
     * The night of 2026-08-27 made the case. A "Reactivate Account"
     * button called a route that did not exist, and the obvious fix
     * would have restored a dormant super admin along with the login.
     */
    title: 'ACCESS CONTROL',
    items: [
      { href: '/admins',    label: 'Staff Management', icon: 'UserCog'     },
      { href: '/roles',     label: 'Role Management',  icon: 'ShieldCheck' },
      { href: '/audit-log', label: 'Audit Log',        icon: 'ScrollText'  },
    ],
  },
  {
    /**
     * Reading the platform, and changing how it runs.
     *
     * Launch Reset stays last on purpose. It is the only irreversible
     * item in the sidebar: it deletes across forty tables, and it should
     * read as the end of the list rather than one more row of settings.
     */
    title: 'SYSTEM',
    items: [
      { href: '/analytics',    label: 'Analytics',       icon: 'BarChart2'    },
      { href: '/reports',      label: 'Reports',         icon: 'FileBarChart' },
      { href: '/health',       label: 'System Health',   icon: 'Activity'     },
      { href: '/settings',     label: 'System Settings', icon: 'Settings'     },
      { href: '/launch-reset', label: 'Launch Reset',    icon: 'Rocket'       },
    ],
  },
];
export const NAV_SECTIONS: NavSection[] = NAV_LAYOUT.map((section) => ({
  title: section.title,
  items: section.items.map((item) => ({
    ...item,
    permission: ROUTE_PERMISSIONS[item.href] ?? UNREGISTERED_ROUTE,
  })),
}));
