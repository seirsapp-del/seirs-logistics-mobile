import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ALWAYS_GRANTED, NAV_SECTIONS, PERMISSIONS } from '@/lib/rbac';

/**
 * Path → permission-key map for RBAC.
 *
 * DERIVED from NAV_SECTIONS, never copied. The hand-maintained copy that
 * used to live here held 25 entries against the nav's 40, so /roles,
 * /fees, /settings, /website, /notify, /identity, /recycle-bin,
 * /disputes, /interstate, /health, /email-templates, /service-catalog,
 * /partner-applications, /last-order-compliance and the three developer
 * pages were completely ungated: a media_content admin could open Role
 * Management just by typing the URL. Adding a page to the sidebar now
 * gates it here automatically.
 *
 * Note: middleware-level RBAC is UX (prevents accidental access).
 * Backend API routes enforce real security via JWT verification + RBAC guards.
 */
const PATH_PERMISSIONS: Record<string, string> = {
  ...Object.fromEntries(
    NAV_SECTIONS.flatMap((s) => s.items.map((i) => [i.href, i.permission] as const)),
  ),
  // Routes with no sidebar entry, so NAV_SECTIONS cannot supply them.
  // /tickets was removed from the nav 2026-08-16 but still redirects to
  // /support for old links, so it keeps the same grant.
  '/tickets': 'tickets',
  // /sos used to be listed here as deliberately ungated. It now carries a
  // real nav entry, so NAV_SECTIONS supplies it above under the 'sos'
  // permission, which rbac.ts grants to every role for the same reason
  // the exemption existed: the SOS banner renders for EVERY admin on
  // every page, and bouncing someone off the desk they were just told to
  // open is worse than a wide grant. The backend still guards the
  // underlying routes.
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
    // roleSlug is read first so this starts gating dynamic-role admins
    // the moment the backend puts it in the token. Until it does, a
    // custom-role admin decodes as plain 'admin', fails
    // isKnownGranularRole and gets no middleware gating at all. That
    // half of A-H18 is a backend change (auth.service JWT payload).
    return data.roleSlug ?? data.adminRole ?? data.role;
  } catch {
    return undefined;
  }
}

function isAllowed(role: string | undefined, permission: string): boolean {
  if (!role) return false;
  if (permission === 'super_admin_only') return role === 'super_admin';
  // Keeps the sidebar and this gate agreeing about /sos. If the sidebar
  // shows the SOS Desk to everyone, this must not bounce anyone off it.
  if (ALWAYS_GRANTED.includes(permission)) return true;
  const perms = PERMISSIONS[role as keyof typeof PERMISSIONS] ?? [];
  return perms.includes('*') || perms.includes(permission);
}

/**
 * Returns true when the role is recognised by our permission map.
 * Older admin tokens may only carry role='admin' (legacy) - those should
 * fail open (let the page render and let the backend enforce real perms),
 * never redirect, to avoid a redirect loop.
 */
function isKnownGranularRole(role: string | undefined): boolean {
  return !!role && role in PERMISSIONS;
}

export function middleware(request: NextRequest) {
  const token        = request.cookies.get('seirs_admin_token')?.value;
  const { pathname } = request.nextUrl;
  const isLoginPage  = pathname === '/login';
  // Spec V8 §3 - admin password recovery is reachable without a session
  const isPublicAuthPage = pathname === '/forgot-password' || pathname === '/reset-password';
  // There is no /track route in this app: public tracking lives on the
  // marketing site (seirs-website /track/[code]). The bypass that used to
  // sit here was dead weight and implied a page that does not exist.

  // Unauthenticated - send to login (unless already on a public page)
  if (!token && !isLoginPage && !isPublicAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  // Already authenticated - skip login page
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
        // (never redirect to /login - that loops with the auth check above).
        if (isAllowed(role, 'overview') && pathname !== '/') {
          const url = request.nextUrl.clone();
          url.pathname = '/';
          url.searchParams.set('denied', '1');
          // Carry the path along so the dashboard can name the page that
          // was refused. Without it the admin just lands on the dashboard
          // and cannot tell whether their click missed or was blocked.
          url.searchParams.set('from', pathname);
          return NextResponse.redirect(url);
        }
        // No safe redirect target - let the page render with a "denied" banner
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
