import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Path → permission-key map for RBAC.
 * Mirrors PERMISSIONS in src/lib/rbac.ts.
 *
 * Note: middleware-level RBAC is UX (prevents accidental access).
 * Backend API routes enforce real security via JWT verification + RBAC guards.
 */
const PATH_PERMISSIONS: Record<string, string> = {
  '/':                  'overview',
  '/ops-map':           'ops-map',
  '/deliveries':        'deliveries',
  '/drivers':           'drivers',
  '/users':             'users',
  '/partners':          'partners',
  '/partner-redirects': 'partner-redirects',
  '/specialists':       'specialists',
  '/wallet':            'wallet',
  '/pricing':           'pricing',
  '/referrals':         'referrals',
  '/insurance':         'insurance',
  '/fraud':             'fraud',
  '/duplicates':        'duplicates',
  '/kyc':               'kyc',
  '/tickets':           'tickets',
  '/suggestions':       'suggestions',
  '/cms':               'cms',
  '/promotions':        'promotions',
  '/analytics':         'analytics',
  '/reports':           'reports',
  '/audit-log':         'audit-log',
  '/admins':            'super_admin_only',
  '/settings':          'super_admin_only',
};

const ROLE_PERMS: Record<string, string[]> = {
  super_admin:       ['*'],
  ops_manager:       ['overview','ops-map','deliveries','drivers','users','partners','partner-redirects','specialists','analytics','tickets','pricing'],
  support_agent:     ['tickets','users','suggestions','deliveries'],
  finance_officer:   ['overview','wallet','pricing','referrals','insurance','analytics','reports'],
  driver_compliance: ['drivers','kyc','duplicates','fraud','users','audit-log'],
  media_content:     ['cms','promotions'],
  analyst:           ['overview','analytics','reports'],
  partner_manager:   ['partners','partner-redirects','specialists','deliveries','overview'],
};

function decodeJwtRole(token: string): string | undefined {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return undefined;
    // base64url decode of payload
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded  = payload + '='.repeat((4 - payload.length % 4) % 4);
    const json    = atob(padded);
    const data    = JSON.parse(json);
    return data.adminRole ?? data.role;
  } catch {
    return undefined;
  }
}

function isAllowed(role: string | undefined, permission: string): boolean {
  if (!role) return false;
  if (permission === 'super_admin_only') return role === 'super_admin';
  const perms = ROLE_PERMS[role] ?? [];
  return perms.includes('*') || perms.includes(permission);
}

/**
 * Returns true when the role is recognised by our permission map.
 * Older admin tokens may only carry role='admin' (legacy) — those should
 * fail open (let the page render and let the backend enforce real perms),
 * never redirect, to avoid a redirect loop.
 */
function isKnownGranularRole(role: string | undefined): boolean {
  return !!role && role in ROLE_PERMS;
}

export function middleware(request: NextRequest) {
  const token        = request.cookies.get('seirs_admin_token')?.value;
  const { pathname } = request.nextUrl;
  const isLoginPage  = pathname === '/login';

  // Unauthenticated — send to login
  if (!token && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  // Already authenticated — skip login page
  if (token && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // RBAC: check role permission for the requested path
  // Fail-open: if we can't decode a granular admin role, allow through.
  // The page itself + backend API guards remain the source of truth.
  if (token && !isLoginPage) {
    const role = decodeJwtRole(token);

    if (isKnownGranularRole(role)) {
      // Find matching permission for this path (longest prefix match)
      let permission: string | undefined;
      let bestLen = -1;
      for (const [path, perm] of Object.entries(PATH_PERMISSIONS)) {
        if ((pathname === path || pathname.startsWith(path + '/')) && path.length > bestLen) {
          permission = perm;
          bestLen = path.length;
        }
      }

      if (permission && !isAllowed(role, permission)) {
        // Forbidden: redirect to dashboard root if accessible, else just allow
        // (never redirect to /login — that loops with the auth check above).
        if (isAllowed(role, 'overview') && pathname !== '/') {
          const url = request.nextUrl.clone();
          url.pathname = '/';
          url.searchParams.set('denied', '1');
          return NextResponse.redirect(url);
        }
        // No safe redirect target — let the page render with a "denied" banner
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
