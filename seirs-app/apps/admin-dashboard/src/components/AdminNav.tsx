'use client';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearSession, getUser } from '@/lib/auth';
import { adminApi } from '@/lib/api';
import {
  LayoutDashboard, Map, Package, Truck, Users, Store, ArrowRightLeft, Briefcase,
  Wallet, Tag, DollarSign, Share2, Shield, ShieldAlert, ShieldCheck, Siren, Copy, ClipboardCheck,
  Ticket, Lightbulb, FileText, Percent, BarChart2, BarChart3, FileBarChart, Inbox,
  UserCog, ScrollText, Settings, LogOut, ChevronLeft, ChevronRight,
  Activity, Send, MoonStar, Mail, Code2, BookOpen,
  Globe, List, Trash2, Download, CircleDot, Rocket,
} from 'lucide-react';
import { canAccess, canAccessFromUser, isSuperAdmin, isSuperAdminFromUser, isNavItemVisible, ROLE_COLORS, ROLE_LABELS, NAV_SECTIONS } from '@/lib/rbac';
import type { AdminRoleType } from '@/lib/rbac';
import { SeirsMarkBold, SeirsLockup } from './SeirsLogo';

/**
 * Every icon named in NAV_SECTIONS must appear here.
 *
 * A name missing from this map used to render NO icon at all, which made
 * the row look like a section heading rather than a link. Website,
 * Service Catalog and Recycle Bin were all invisible-as-buttons for that
 * reason, and the founder reported not knowing Website was clickable and
 * not being able to find the Recycle Bin at all (2026-08-13).
 *
 * If you add a nav item, add its icon here in the same commit. The
 * fallback below stops a future miss from being silent again.
 */
const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  LayoutDashboard, Map, Package, Truck, Users, Store, ArrowRightLeft, Briefcase,
  Wallet, Tag, DollarSign, Share2, Shield, ShieldAlert, ShieldCheck, Siren, Copy, ClipboardCheck,
  Ticket, Lightbulb, FileText, Percent, BarChart2, BarChart3, FileBarChart, Inbox,
  UserCog, ScrollText, Settings,
  Activity, Send, MoonStar, Mail, Code2, BookOpen,
  Globe, List, Trash2, Download, Rocket,
};

// Anything unmapped still gets a bullet, so it reads as a link and lines
// up with its neighbours instead of disappearing into the section label.
const FALLBACK_ICON = CircleDot;

/**
 * Live count of tickets waiting on support, shown against Support Inbox.
 * The nav config has carried a `badge` field all along and nothing ever
 * rendered it, so an unanswered ticket was invisible until someone
 * thought to open the page (founder 2026-08-16: "so we dont forget or
 * miss any tickets").
 */
function useOpenFraudCount() {
  // rbac.ts declared badge: 'fraud' on Fraud & Risk and only the tickets
  // badge was ever rendered, so an open fraud flag stayed invisible until
  // someone happened to open the page. Exactly the bug the comment above
  // records being fixed once already, for tickets.
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => {
      adminApi.fraud.list(1, 'open')
        .then((res: any) => { if (alive) setCount(Number(res?.total ?? res?.flags?.length ?? 0)); })
        .catch(() => { if (alive) setCount(0); });
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return count;
}

function useOpenTicketCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => {
      adminApi.support.queue({ limit: 100 })
        .then((list: any[]) => {
          if (!alive) return;
          setCount((list ?? []).filter(
            (t) => t.status === 'open' || t.status === 'awaiting_agent',
          ).length);
        })
        .catch(() => { if (alive) setCount(0); });
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return count;
}

export default function AdminNav() {
  const openTickets = useOpenTicketCount();
  const openFraud   = useOpenFraudCount();
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
    if (permission === 'super_admin_only') return isSuperAdminFromUser(user);
    return canAccessFromUser(user, permission);
  };

  const w = collapsed ? 'w-[60px]' : 'w-[240px]';

  return (
    <aside
      className={`${w} shrink-0 bg-[#0F2B4C] text-white flex flex-col h-screen sticky top-0 overflow-hidden transition-all duration-200 z-40`}
    >
      {/* Brand lockup. Matches the mobile-app okada mark + SEIRS wordmark.
          Collapsed sidebar shows the mark only; expanded shows mark + wordmark
          + "Admin Portal" tagline. Hub cutout colour matches the sidebar bg. */}
      {/**
        * Collapsed, the mark IS the expand control.
        *
        * Founder 2026-08-27: "i need a way to navigate out of here."
        * The header used to render the 28px mark AND a 24px toggle side
        * by side inside a 60px rail with px-3 padding. That needs 76px
        * of the 60 available, and the <aside> is overflow-hidden, so the
        * toggle was clipped off the edge of the sidebar entirely. There
        * was no way to expand it again, and the collapsed state persists
        * in localStorage, so once collapsed it stayed collapsed across
        * every reload.
        *
        * One control at a time fixes it: collapsed shows only the mark,
        * which expands on click; expanded shows the lockup and a chevron
        * that now has real contrast rather than 40% white on navy.
        */}
      <div className={`flex items-center border-b border-white/10 shrink-0 ${collapsed ? 'justify-center px-0 h-14' : 'gap-3 px-3 h-16'}`}>
        {collapsed ? (
          <button
            onClick={toggleCollapse}
            className="w-full h-full flex items-center justify-center hover:bg-white/10 transition-colors"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <SeirsMarkBold size={26} color="#FFFFFF" hubColor="#0F2B4C" />
          </button>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <SeirsLockup
                size={170}
                color="#FFFFFF"
                hubColor="#0F2B4C"
                tagline="Admin Portal"
                taglineColor="rgba(255,255,255,0.55)"
              />
            </div>
            <button
              onClick={toggleCollapse}
              className="ml-auto w-7 h-7 rounded flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          </>
        )}
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
          const visibleItems = section.items.filter(
            (item) => isVisible(item.permission) && isNavItemVisible(item.href),
          );
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
                const Icon = ICON_MAP[item.icon] ?? FALLBACK_ICON;
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
                    <Icon size={16} />
                    {!collapsed && (
                      <span className="text-[13px] font-medium flex-1 truncate">{item.label}</span>
                    )}
                    {item.badge === 'tickets' && openTickets > 0 && (
                      <span
                        className={`rounded-full bg-red-500 text-white text-[10px] font-bold leading-none ${
                          collapsed
                            ? 'absolute top-1.5 right-1.5 h-4 min-w-4 px-1 flex items-center justify-center'
                            : 'px-1.5 py-0.5'
                        }`}
                        title={`${openTickets} ticket${openTickets === 1 ? '' : 's'} waiting on support`}
                      >
                        {openTickets > 99 ? '99+' : openTickets}
                      </span>
                    )}
                    {item.badge === 'fraud' && openFraud > 0 && (
                      <span
                        className={`rounded-full bg-red-500 text-white text-[10px] font-bold leading-none ${
                          collapsed
                            ? 'absolute top-1.5 right-1.5 h-4 min-w-4 px-1 flex items-center justify-center'
                            : 'px-1.5 py-0.5'
                        }`}
                        title={`${openFraud} open fraud flag${openFraud === 1 ? '' : 's'}`}
                      >
                        {openFraud > 99 ? '99+' : openFraud}
                      </span>
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
