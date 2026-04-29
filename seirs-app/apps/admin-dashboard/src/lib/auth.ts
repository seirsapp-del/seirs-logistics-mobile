const TOKEN_KEY = 'seirs_admin_token';
const USER_KEY  = 'seirs_admin_user';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): any | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function saveSession(token: string, user: any) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // Write to cookie so Next.js middleware can gate pages server-side
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${60 * 60 * 8}; SameSite=Strict`;
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  // Expire the cookie
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
}
