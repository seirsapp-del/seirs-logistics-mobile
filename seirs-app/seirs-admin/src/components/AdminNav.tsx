'use client';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearSession, getUser } from '@/lib/auth';
import {
  LayoutDashboard, Truck, Users, ChartBar, ShieldAlert,
  Tag, UserCog, LogOut, Package,
} from 'lucide-react';

const LINKS = [
  { href: '/',           label: 'Overview',   icon: LayoutDashboard },
  { href: '/deliveries', label: 'Deliveries', icon: Package },
  { href: '/drivers',    label: 'Drivers',    icon: Truck },
  { href: '/users',      label: 'Users',      icon: Users },
  { href: '/analytics',  label: 'Analytics',  icon: ChartBar },
  { href: '/fraud',      label: 'Fraud',      icon: ShieldAlert },
  { href: '/pricing',    label: 'Pricing',    icon: Tag },
  { href: '/admins',     label: 'Admins',     icon: UserCog },
];

export default function AdminNav() {
  const router   = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);

  useEffect(() => { setUser(getUser()); }, []);

  const logout = () => {
    clearSession();
    router.replace('/login');
  };

  return (
    <nav className="bg-[#0D1B2A] text-white px-6 flex items-center justify-between shadow-xl border-b border-white/5" style={{ height: 56 }}>
      {/* Logo + links */}
      <div className="flex items-center gap-1 h-full">
        <a href="/" className="flex items-center gap-2 mr-4 pr-4 border-r border-white/10">
          <div className="w-7 h-7 rounded-lg bg-[#F4600C] flex items-center justify-center">
            <Package size={14} className="text-white" />
          </div>
          <span className="text-sm font-black tracking-widest text-[#F4600C]">SEIRS</span>
          <span className="text-xs text-white/40 font-medium">Admin</span>
        </a>

        {LINKS.map((l) => {
          const active = pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href));
          const Icon = l.icon;
          return (
            <a
              key={l.href}
              href={l.href}
              className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium border-b-2 transition-colors ${
                active
                  ? 'border-[#F4600C] text-white'
                  : 'border-transparent text-white/50 hover:text-white hover:border-white/20'
              }`}
            >
              <Icon size={14} />
              {l.label}
            </a>
          );
        })}
      </div>

      {/* User + logout */}
      <div className="flex items-center gap-3">
        {user && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#F4600C]/20 flex items-center justify-center">
              <span className="text-xs font-bold text-[#F4600C]">{user.name?.[0]?.toUpperCase()}</span>
            </div>
            <span className="text-xs text-white/60 hidden md:block">{user.name}</span>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white border border-white/10 hover:border-white/30 px-3 py-1.5 rounded-lg transition-colors"
        >
          <LogOut size={12} />
          Sign out
        </button>
      </div>
    </nav>
  );
}
