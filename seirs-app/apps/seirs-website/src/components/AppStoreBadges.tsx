'use client';
import { Smartphone, Apple } from 'lucide-react';

// Spec V8 — public download badges. Until the apps actually publish,
// the env vars are unset and the badges render in a soft "coming soon"
// state instead of broken empty links. When Play / App Store URLs land
// in Vercel env, the badges become active without a code change.
//
// Set on Vercel:
//   NEXT_PUBLIC_PLAY_STORE_URL  = https://play.google.com/store/apps/details?id=...
//   NEXT_PUBLIC_APP_STORE_URL   = https://apps.apple.com/ng/app/seirs/id...

interface Props {
  /** 'navy' = white-on-navy buttons (for hero), 'light' = navy-on-white (for footer/contact) */
  theme?: 'navy' | 'light';
  /** Which audience the apps target — customer / driver / business — for the right-side label */
  app?: 'customer' | 'driver' | 'business';
  className?: string;
}

export function AppStoreBadges({ theme = 'light', app = 'customer', className = '' }: Props) {
  const playUrl = process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim() || null;
  const appUrl  = process.env.NEXT_PUBLIC_APP_STORE_URL?.trim()  || null;

  const base = theme === 'navy'
    ? 'bg-white text-navy hover:bg-gray-50'
    : 'bg-navy text-white hover:opacity-90';
  const inactive = theme === 'navy'
    ? 'bg-white/10 text-white/50 border border-white/20 cursor-not-allowed'
    : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed';

  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      <Badge
        active={!!playUrl}
        href={playUrl ?? '#'}
        baseClass={base}
        inactiveClass={inactive}
        Icon={Smartphone}
        topLabel="GET IT ON"
        mainLabel="Google Play"
      />
      <Badge
        active={!!appUrl}
        href={appUrl ?? '#'}
        baseClass={base}
        inactiveClass={inactive}
        Icon={Apple}
        topLabel="Download on the"
        mainLabel="App Store"
      />
      {app !== 'customer' && (
        <span className={`text-xs self-center ${theme === 'navy' ? 'text-white/60' : 'text-gray-500'}`}>
          For the {app === 'driver' ? 'driver' : 'business / partner'} app
        </span>
      )}
    </div>
  );
}

function Badge({ active, href, baseClass, inactiveClass, Icon, topLabel, mainLabel }: {
  active: boolean; href: string;
  baseClass: string; inactiveClass: string;
  Icon: React.ComponentType<{ size?: number }>;
  topLabel: string; mainLabel: string;
}) {
  const content = (
    <span className="flex items-center gap-2.5">
      <Icon size={22} />
      <span className="flex flex-col leading-tight">
        <span className="text-[9px] uppercase tracking-wider opacity-80">
          {active ? topLabel : 'Coming soon to'}
        </span>
        <span className="text-sm font-bold">{mainLabel}</span>
      </span>
    </span>
  );
  const cls = `flex items-center px-4 py-2.5 rounded-lg transition-colors ${active ? baseClass : inactiveClass}`;

  if (!active) return <span className={cls} aria-disabled>{content}</span>;
  return <a href={href} target="_blank" rel="noopener" className={cls}>{content}</a>;
}
