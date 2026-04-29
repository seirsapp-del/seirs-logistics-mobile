'use client';
import { usePathname } from 'next/navigation';
import AdminNav from './AdminNav';

// Renders the nav on every page except /login
export default function NavWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin  = pathname === '/login';

  return (
    <>
      {!isLogin && <AdminNav />}
      {children}
    </>
  );
}
