import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  PERMISSIONS,
  PERMS_COOKIE,
  decodePermsCookie,
  firstAllowedRoute,
  isPublicRoute,
  permissionForRoute,
  permsAllow,
} from '@/lib/rbac';

/**
 * Route gating for the admin dashboard.
 *
 * Two separate holes were closed here on 2026-08-25.
 *
 * 1. The path table used to be DERIVED from NAV_SECTIONS, and before
 *    that it was a hand-maintained copy holding 25 entries against the
 *    nav's 40. Either way "no sidebar entry" meant "no gate", and an
 *    unknown route was ALLOWED: the `if (permission && ...)` test simply
 *    skipped anything it could not find. The table now lives in
 *    ROUTE_PERMISSIONS, is exhaustive over the routes rather than over
 *    the sidebar, and an unregistered route is DENIED.
 *
 * 2. Role resolution read `adminRole ?? role` off a JWT that carries
 *    neither roleSlug nor permissions, so an admin on a custom role
 *    decoded as plain 'admin', failed the "is this a role I know" test,
 *    and fell past the entire RBAC block. The more carefully a role was
 *    configured, the less it was enforced. Resolution now prefers the
 *    companion permission cookie that the session writes at sign-in, and
 *    an unresolvable session gets the LEAST privilege rather than the
 *    most.
 *
 * Middleware-level RBAC is still UX and defence in depth, not the
 * security boundary. Both the JWT claims and the companion cookie are
 * readable and writable by whoever owns the browser. The backend guards
 * on /admin/* are the real wall.
 */

interface JwtPayload {
  role?:        string;
  adminRole?:   string;
  roleSlug?:    string;
  permissions?: string[];
}

function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // base64url decode of the payload segment
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded  = payload + '='.repeat((4 - payload.length % 4) % 4);
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * The permission set this request actually holds, or null when it cannot
 * be established. Never fetches: middleware runs before app code on the
 * edge, so a lookup here would add a round trip to every navigation and
 * a new failure mode. Every source below is already on the request.
 */
function resolveSession(request: NextRequest, token: string): { slug?: string; perms: string[] } | null {
  // 1. The companion cookie the session writes at sign-in. This is the
  //    only source that knows a custom role's permission list, because
  //    the login RESPONSE carries roleSlug + permissions even though the
  //    token does not.
  const fromCookie = decodePermsCookie(request.cookies.get(PERMS_COOKIE)?.value);
  if (fromCookie) return { slug: fromCookie.slug, perms: fromCookie.perms };

  const payload = decodeJwt(token);
  if (!payload) return null;

  // 2. Forward compatibility. The moment auth.service.ts starts minting
  //    roleSlug + permissions into the token, this branch takes over and
  //    the cookie stops mattering. Nothing here needs to change then.
  if (payload.roleSlug && Array.isArray(payload.permissions)) {
    return { slug: payload.roleSlug, perms: payload.permissions };
  }
  if (payload.roleSlug && payload.roleSlug in PERMISSIONS) {
    return { slug: payload.roleSlug, perms: PERMISSIONS[payload.roleSlug as keyof typeof PERMISSIONS] };
  }

  // 3. One of the eight built-in granular roles, straight off the token.
  if (payload.adminRole && payload.adminRole in PERMISSIONS) {
    return { slug: payload.adminRole, perms: PERMISSIONS[payload.adminRole as keyof typeof PERMISSIONS] };
  }

  // 4. Unresolvable. role='admin' with no adminRole is BOTH a legacy
  //    super admin and a custom-role admin, and the token cannot tell
  //    them apart. It used to be read as super admin, which is why a
  //    custom role got no gating at all. Least privilege instead: the
  //    session lands on the SOS desk, NavWrapper writes the companion
  //    cookie from the stored login response on mount, and the next
  //    navigation resolves properly. A stale session therefore heals
  //    itself in one hop rather than silently holding the keys.
  return null;
}

export function middleware(request: NextRequest) {
  const token        = request.cookies.get('seirs_admin_token')?.value;
  const { pathname } = request.nextUrl;
  const isLoginPage  = pathname === '/login';
  // Spec V8 §3 - admin password recovery is reachable without a session.
  const isPublic     = isPublicRoute(pathname);
  // There is no /track route in this app: public tracking lives on the
  // marketing site (seirs-website /track/[code]). The bypass that used to
  // sit here was dead weight and implied a page that does not exist.

  // Unauthenticated - send to login (unless already on a public page)
  if (!token && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  // Already authenticated - skip login page
  if (token && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (token && !isPublic) {
    const session = resolveSession(request, token);
    // No resolvable role means no permissions, not all of them.
    const perms   = session?.perms ?? [];
    const slug    = session?.slug;

    const permission = permissionForRoute(pathname);

    // An unregistered route is denied. This is the whole point of the
    // whitelist: the next page anyone adds is protected until it is
    // named in ROUTE_PERMISSIONS, rather than exposed until someone
    // remembers to gate it. A '*' holder still passes, since '*' already
    // means every page including ones that do not exist yet, and letting
    // them through is what surfaces a genuine 404 to the person most
    // likely to fix the omission.
    const denied = permission
      ? !permsAllow(perms, permission, slug)
      : !perms.includes('*');

    if (denied) {
      const target = permsAllow(perms, 'overview', slug)
        ? '/'                              // the dashboard renders the denial banner
        : firstAllowedRoute(perms, slug);  // else the first page they do hold

      // firstAllowedRoute only ever returns a path this session passes,
      // falling back to /sos which every admin holds, so the target can
      // never bounce again. The equality check is belt and braces
      // against a redirect loop.
      if (target !== pathname) {
        const url = request.nextUrl.clone();
        url.pathname = target;
        url.search   = '';
        // 'unlisted' vs '1' so the banner does not blame the admin's role
        // for a route that simply is not in the table (a typo, or a page
        // someone shipped without registering it).
        url.searchParams.set('denied', permission ? '1' : 'unlisted');
        // Carry the path along so the dashboard can name the page that
        // was refused. Without it the admin just lands on the dashboard
        // and cannot tell whether their click missed or was blocked.
        url.searchParams.set('from', pathname);
        return NextResponse.redirect(url);
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  // Static assets are excluded so deny-by-default never intercepts a
  // file request. There is no public/ directory in this app today, but
  // the extension list keeps a future favicon or font from being
  // redirected into the dashboard.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|otf)$).*)',
  ],
};
