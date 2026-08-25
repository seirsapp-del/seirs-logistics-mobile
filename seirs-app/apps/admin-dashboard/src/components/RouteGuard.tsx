'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { getUser } from '@/lib/auth';
import {
  firstAllowedRoute,
  permissionForRoute,
  permsAllow,
  resolveSessionPerms,
} from '@/lib/rbac';

/**
 * Second gate, in the browser, over the same table middleware uses.
 *
 * It exists because middleware cannot see the whole picture. The admin
 * JWT carries { sub, email, role, adminRole } and nothing else, so an
 * admin on a custom role built in the backend role catalogue is
 * indistinguishable at the edge from a legacy super admin. The stored
 * login response, on the other hand, carries the role's real slug and
 * its real permission list. This gate reads that, so a custom role is
 * gated by what it was actually granted rather than by what a token
 * happened to omit.
 *
 * It deliberately calls permissionForRoute / permsAllow / firstAllowedRoute,
 * the very functions middleware calls, rather than reimplementing the
 * rules. Two hand-written copies of a permission check is how
 * PATH_PERMISSIONS drifted 15 entries away from the sidebar in the first
 * place.
 *
 * Neither gate is a security boundary. localStorage and cookies both
 * belong to whoever owns the browser. The backend guards on /admin/*
 * are the real check; these two stop an admin from reaching a page they
 * were never granted, and stop the UI from lying about what they hold.
 */
export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // 'checking' covers the first render only. getUser() reads
  // localStorage, which does not exist during SSR, so the decision
  // cannot be made until the component has mounted. Rendering children
  // during that frame would let a denied page mount and fire its data
  // fetches, so it renders nothing instead. The sidebar and top bar are
  // already painted by NavWrapper, so there is no visible flash.
  // The decision is stored WITH the path it was made for. On navigation
  // the path changes before the effect re-runs, and reading a stale
  // 'allow' for one frame would mount the new page and let it fire its
  // data fetches before being told it is forbidden. Comparing the two
  // makes any pathname the guard has not judged yet read as 'checking'
  // during render, so a denied page never mounts at all.
  const [decision, setDecision] = useState<{ path: string; state: 'allow' | 'deny'; home: string } | null>(null);
  const state = decision && decision.path === pathname ? decision.state : 'checking';
  const home  = decision?.home ?? '/sos';

  useEffect(() => {
    const user = getUser();
    // No stored session at all. Middleware is already redirecting to
    // /login; showing a denial on top of that would just be noise.
    if (!user) { setDecision({ path: pathname, state: 'allow', home: '/sos' }); return; }

    const resolved   = resolveSessionPerms(user);
    const perms      = resolved?.perms ?? [];
    const slug       = resolved?.slug;
    const permission = permissionForRoute(pathname);

    // Same rule as middleware: a route missing from ROUTE_PERMISSIONS is
    // denied to everyone except a '*' holder, so a page shipped without
    // being registered fails closed rather than open.
    const allowed = permission
      ? permsAllow(perms, permission, slug)
      : perms.includes('*');

    setDecision({
      path:  pathname,
      state: allowed ? 'allow' : 'deny',
      home:  firstAllowedRoute(perms, slug),
    });
  }, [pathname]);

  if (state === 'checking') return null;

  if (state === 'deny') {
    return (
      <div className="min-h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 mb-4">
            <Lock size={28} className="text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-[#0F2B4C] mb-1">Access Restricted</h2>
          <p className="text-sm text-[#0F2B4C]/50 mb-5">
            <span className="font-mono font-semibold">{pathname}</span> is not part of your
            role. If you were sent here by a colleague, ask a Super Admin to grant it.
          </p>
          <Link
            href={home}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[#0F2B4C] text-white text-sm font-semibold"
          >
            Back to a page you can open
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
