'use client';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearSession, getUser } from '@/lib/auth';
import {
  LayoutDashboard, Map, Package, Truck, Users, Store, ArrowRightLeft, Briefcase,
  Wallet, Tag, DollarSign, Share2, Shield, ShieldAlert, Copy, ClipboardCheck,
  Ticket, Lightbulb, FileText, Percent, BarChart2, FileBarChart,
  UserCog, ScrollText, Settings, LogOut, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { canAccess, isSuperAdmin, ROLE_COLORS, ROLE_LABELS, NAV_SECTIONS } from '@/lib/rbac';
import type { AdminRoleType } from '@/lib/rbac';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  LayoutDashboard, Map, Package, Truck, Users, Store, ArrowRightLeft, Briefcase,
  Wallet, Tag, DollarSign, Share2, Shield, ShieldAlert, Copy, ClipboardCheck,
  Ticket, Lightbulb, FileText, Percent, BarChart2, FileBarChart,
  UserCog, ScrollText, Settings,
};

export default function AdminNav() {
  const router   = useRouter();
  const pathname = usePathname();
  const [user,      setUser]      = useState<any>(null);
  const [role,      setRole]      = useState<AdminRoleType | undefined>(undefined);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const u = getUser();
    setUser(u);
    // Fall back to legacy `role: 'admin'` if granular adminRole isn't set
    setRole((u?.adminRole ?? (u as any)?.role) as AdminRoleType | undefined);
    const saved = localStorage.getItem('seirs_nav_collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      localStorage.setItem('seirs_nav_collapsed', String(!c));
      return !c;
    });
  };

  const logout = () => { clearSession(); router.replace('/login'); };

  const isVisible = (permission: string) => {
    if (permission === 'super_admin_only') return isSuperAdmin(role);
    return canAccess(role, permission);
  };

  const w = collapsed ? 'w-[60px]' : 'w-[240px]';

  return (
    <aside
      className={`${w} shrink-0 bg-[#0F2B4C] text-white flex flex-col h-screen sticky top-0 overflow-hidden transition-all duration-200 z-40`}
    >
      {/* Logo */}
      <div className={`flex items-center h-14 border-b border-white/10 px-3 shrink-0 ${collapsed ? 'justify-center' : 'gap-3'}`}>
        <div className="w-8 h-8 rounded-lg bg-[#3A7BD5] flex items-center justify-center shrink-0">
          <Package size={15} className="text-white" />
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black tracking-widest leading-tight">SEIRS</div>
            <div className="text-[10px] text-white/40 font-medium">Admin Portal</div>
          </div>
        )}
        <button
          onClick={toggleCollapse}
          className="ml-auto w-6 h-6 flex items-center justify-center text-white/40 hover:text-white transition-colors"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* User profile */}
      {!collapsed && user && (
        <div className="px-3 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#3A7BD5]/30 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-[#3A7BD5]">
                {user.name?.[0]?.toUpperCase() ?? '?'}
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{user.name}</div>
              {role && ROLE_COLORS[role] && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium inline-block mt-0.5 ${ROLE_COLORS[role]}`}>
                  {ROLE_LABELS[role]}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-thin">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) => isVisible(item.permission));
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.title} className="mb-1">
              {!collapsed && (
                <div className="px-3 pt-3 pb-1">
                  <span className="text-[9px] font-bold text-white/30 tracking-[0.12em] uppercase">
                    {section.title}
                  </span>
                </div>
              )}
              {collapsed && <div className="my-1 mx-2 border-t border-white/10" />}
              {visibleItems.map((item) => {
                const Icon = ICON_MAP[item.icon];
                const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center mx-2 my-0.5 rounded-lg transition-colors relative group ${
                      collapsed ? 'justify-center p-3' : 'gap-2.5 px-3 py-2'
                    } ${
                      active
                        ? 'bg-[#3A7BD5] text-white'
                        : 'text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {Icon && <Icon size={16} />}
                    {!collapsed && (
                      <span className="text-[13px] font-medium flex-1 truncate">{item.label}</span>
                    )}
                    {/* Tooltip when collapsed */}
                    {collapsed && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                        {item.label}
                      </div>
                    )}
                  </a>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="shrink-0 border-t border-white/10 p-2">
        <button
          onClick={logout}
          className={`w-full flex items-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors ${
            collapsed ? 'justify-center p-3' : 'gap-2.5 px-3 py-2'
          }`}
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut size={16} />
          {!collapsed && <span className="text-[13px] font-medium">Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
