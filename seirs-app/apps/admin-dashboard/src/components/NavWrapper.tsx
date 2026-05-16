'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import AdminNav from './AdminNav';
import { clearSession, isSessionExpired, touchActivity } from '@/lib/auth';
import { refreshAdminTokenIfPresent } from '@/lib/api';

const IDLE_CHECK_MS    = 60_000;
// Spec V8 §3.6 — admin JWTs issue with a 30-min TTL. Refresh every
// 10 min while the admin is actively using the dashboard so they
// don't get bounced mid-action. Idle past 30 min still kicks them
// to login (server token expires + isSessionExpired() agrees).
const REFRESH_EVERY_MS = 10 * 60_000;

export default function NavWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const isLogin  = pathname === '/login';
  const isPublicAuth = pathname === '/forgot-password' || pathname === '/reset-password';
  const isChromeless = isLogin || isPublicAuth;
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isChromeless) return;
    const handleActivity = () => touchActivity();
    window.addEventListener('mousemove',  handleActivity);
    window.addEventListener('keydown',    handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('click',      handleActivity);
    timerRef.current = setInterval(() => {
      if (isSessionExpired()) { clearSession(); router.replace('/login?reason=timeout'); }
    }, IDLE_CHECK_MS);
    // Sliding-window refresh — fires every 10 min while admin is on
    // a chromed (logged-in) page. No-op if no token in storage.
    refreshRef.current = setInterval(() => {
      if (!isSessionExpired()) {
        refreshAdminTokenIfPresent().catch(() => {});
      }
    }, REFRESH_EVERY_MS);
    return () => {
      window.removeEventListener('mousemove',  handleActivity);
      window.removeEventListener('keydown',    handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('click',      handleActivity);
      if (timerRef.current)   clearInterval(timerRef.current);
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [isChromeless, router]);

  if (isChromeless) return <>{children}</>;

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminNav />
      <main className="flex-1 overflow-y-auto bg-[#F5F5F0]">
        {children}
      </main>
    </div>
  );
}
