import type { AdminRoleType } from './rbac';

const TOKEN_KEY   = 'seirs_admin_token';
const USER_KEY    = 'seirs_admin_user';
const ACTIVITY_KEY = 'seirs_admin_activity';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): { id: string; name: string; email: string; role: string; adminRole?: AdminRoleType } | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function getAdminRole(): AdminRoleType | undefined {
  return getUser()?.adminRole;
}

export function saveSession(token: string, user: any) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  touchActivity();
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${60 * 60 * 8}; SameSite=Strict`;
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ACTIVITY_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
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
