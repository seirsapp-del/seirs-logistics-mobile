'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef } from 'react';
import AdminNav from './AdminNav';
import TopBar from './TopBar';
import { ConfirmProvider } from './ConfirmDialog';
import SosBanner from './SosBanner';
import RouteGuard from './RouteGuard';
import { clearSession, ensurePermsCookie, isSessionExpired, touchActivity } from '@/lib/auth';
import { refreshAdminTokenIfPresent } from '@/lib/api';

const IDLE_CHECK_MS    = 60_000;
// Spec V8 §3.6. admin JWTs issue with a 30-min TTL. Refresh every
// 10 min while the admin is actively using the dashboard so they
// don't get bounced mid-action. Idle past 30 min still kicks them
// to login (server token expires + isSessionExpired() agrees).
const REFRESH_EVERY_MS = 10 * 60_000;


/**
 * Keep the reading position when a page reloads its data.
 *
 * Every list page swaps its whole table for a "Loading..." block while
 * refreshing. The scroll container's content collapses to nothing, the
 * browser resets scrollTop to 0, and when the table comes back the admin
 * is at the top again: clicking any button far down the page threw them
 * to the top (founder 2026-08-16). Twenty-five pages share the pattern,
 * so this is fixed once, here, where the scrolling actually happens.
 *
 * The saved position is dropped on navigation, so moving to another page
 * still starts at the top as it should.
 */
function useScrollPreservation(pathname: string) {
  const ref  = useRef<HTMLElement>(null);
  const last = useRef(0);

  useEffect(() => { last.current = 0; }, [pathname]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onScroll = () => { if (el.scrollTop > 0) last.current = el.scrollTop; };
    el.addEventListener('scroll', onScroll, { passive: true });

    // When the content grows back tall enough to hold the old position
    // again, put the admin back where they were.
    const obs = new ResizeObserver(() => {
      const target = last.current;
      if (target > 0 && el.scrollTop === 0 && el.scrollHeight - el.clientHeight >= target) {
        el.scrollTop = target;
      }
    });
    if (el.firstElementChild) obs.observe(el.firstElementChild);

    return () => { el.removeEventListener('scroll', onScroll); obs.disconnect(); };
  }, [pathname]);

  return ref;
}

export default function NavWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const mainRef  = useScrollPreservation(pathname);
  const isLogin  = pathname === '/login';
  const isPublicAuth = pathname === '/forgot-password' || pathname === '/reset-password';
  const isChromeless = isLogin || isPublicAuth;
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isChromeless) return;
    // Rebuild the permission cookie for a session that signed in before
    // it existed. Middleware now gives an unresolvable role nothing at
    // all, so without this an admin already signed in when this shipped
    // would be pinned to the SOS desk until their token expired. No
    // network call: the stored login response already holds the slug and
    // the permission list.
    ensurePermsCookie();
    const handleActivity = () => touchActivity();
    window.addEventListener('mousemove',  handleActivity);
    window.addEventListener('keydown',    handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('click',      handleActivity);
    timerRef.current = setInterval(() => {
      if (isSessionExpired()) { clearSession(); router.replace('/login?reason=timeout'); }
    }, IDLE_CHECK_MS);
    // Sliding-window refresh. fires every 10 min while admin is on
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

  if (isChromeless) return <ConfirmProvider>{children}</ConfirmProvider>;

  return (
    <ConfirmProvider>
      <div className="flex h-screen overflow-hidden">
        <AdminNav />
        <div className="flex-1 flex flex-col overflow-hidden">
          <SosBanner />
          <TopBar />
          <main ref={mainRef} className="flex-1 overflow-y-auto bg-[#F5F5F0]">
            {/* Wraps children, not the chrome: a denied admin keeps the
                sidebar so they can navigate somewhere they do hold. */}
            <RouteGuard>{children}</RouteGuard>
          </main>
        </div>
      </div>
    </ConfirmProvider>
  );
}
