import type { AdminRoleType } from './rbac';
import { PERMS_COOKIE, encodePermsCookie, resolveSessionPerms } from './rbac';

const TOKEN_KEY   = 'seirs_admin_token';
const USER_KEY    = 'seirs_admin_user';
const ACTIVITY_KEY = 'seirs_admin_activity';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): {
  id: string; name: string; email: string; role: string;
  adminRole?: AdminRoleType;
  // Spec V8 dynamic roles
  roleId?: string | null; roleSlug?: string | null; roleName?: string | null;
  permissions?: string[];
} | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function getAdminRole(): AdminRoleType | undefined {
  return getUser()?.adminRole;
}

// Spec V8 - server-provided permissions take precedence over the
// hardcoded enum-based map. Returns null if the session predates
// dynamic roles (legacy admins) so callers can fall back.
export function getServerPermissions(): string[] | null {
  const u = getUser();
  return u?.permissions && Array.isArray(u.permissions) && u.roleSlug
    ? u.permissions
    : null;
}

export function saveSession(token: string, user: any) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  touchActivity();
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${60 * 60 * 8}; SameSite=Strict`;
  writePermsCookie(user);
}

/**
 * Companion cookie carrying the session's real permission list.
 *
 * The admin JWT carries only { sub, email, role, adminRole }: no
 * roleSlug, no permissions. So middleware, which can read cookies and
 * nothing else, could not tell a custom-role admin from a legacy super
 * admin and gated neither. The login response DOES carry roleSlug and
 * permissions, so it gets written here where the edge can see it.
 *
 * Not a security boundary. It is set from JS and editable by whoever
 * owns the browser, exactly like the token cookie beside it. It exists
 * so a correctly-configured role is actually enforced in the UI; the
 * backend guards on /admin/* remain the real check.
 */
function writePermsCookie(user: any) {
  const resolved = resolveSessionPerms(user);
  if (!resolved) {
    document.cookie = `${PERMS_COOKIE}=; path=/; max-age=0`;
    return;
  }
  const value = encodePermsCookie(resolved.slug, resolved.perms);
  document.cookie = `${PERMS_COOKIE}=${value}; path=/; max-age=${60 * 60 * 8}; SameSite=Strict`;
}

/**
 * Heal a session that pre-dates the permission cookie.
 *
 * Middleware now treats an unresolvable role as holding nothing, so a
 * session signed in before this shipped would be pinned to the SOS desk
 * until it expired. The stored login response already holds everything
 * the cookie needs, so this rebuilds it with no network call. Called on
 * mount from NavWrapper, which means one redirect at most before the
 * session is gated correctly again.
 */
export function ensurePermsCookie() {
  if (typeof document === 'undefined') return;
  if (document.cookie.includes(`${PERMS_COOKIE}=`)) return;
  const user = getUser();
  if (user) writePermsCookie(user);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ACTIVITY_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
  document.cookie = `${PERMS_COOKIE}=; path=/; max-age=0`;
}

export function touchActivity() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
}

export function isSessionExpired(): boolean {
  if (typeof window === 'undefined') return false;
  const last = parseInt(localStorage.getItem(ACTIVITY_KEY) ?? '0', 10);
  return Date.now() - last > SESSION_TIMEOUT_MS;
}
