'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import AdminNav from './AdminNav';
import { clearSession, isSessionExpired, touchActivity } from '@/lib/auth';

const IDLE_CHECK_MS = 60_000;

export default function NavWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const isLogin  = pathname === '/login';
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isLogin) return;
    const handleActivity = () => touchActivity();
    window.addEventListener('mousemove',  handleActivity);
    window.addEventListener('keydown',    handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('click',      handleActivity);
    timerRef.current = setInterval(() => {
      if (isSessionExpired()) { clearSession(); router.replace('/login?reason=timeout'); }
    }, IDLE_CHECK_MS);
    return () => {
      window.removeEventListener('mousemove',  handleActivity);
      window.removeEventListener('keydown',    handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('click',      handleActivity);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isLogin, router]);

  if (isLogin) return <>{children}</>;

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminNav />
      <main className="flex-1 overflow-y-auto bg-[#F5F5F0]">
        {children}
      </main>
    </div>
  );
}
