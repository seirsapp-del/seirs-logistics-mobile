'use client';

// Official store badges (founder 2026-08-10: the homemade lucide-icon
// buttons read as fake next to DHL/Amazon-grade sites). Assets are the
// vendors' own: Apple's "Download on the App Store" marketing SVG and
// Google's Play badge PNG (transparent margin trimmed so both sit at
// equal height).
//
// Behaviour changed 2026-08-14 (founder: the site should act as though the
// app is already live). These used to render as dead, dimmed <span>s with a
// "coming soon" caption whenever the env vars were unset, so the highest
// intent moment on the page, someone reaching for the app, went nowhere.
// They are now always real links, built from the final package ids in
// lib/launch.ts, so they point at the correct forever-URL and start
// resolving the day the listings publish, with no code change. The env vars
// still win if set, for pointing at a beta or a regional listing.

import { STORE, type AppName } from '@/lib/launch';

interface Props {
  /** 'navy' = rendered on the navy hero, 'light' = on white sections; affects caption color only (official badges work on both). */
  theme?: 'navy' | 'light';
  /** Which audience the apps target, customer / driver / business, for the right-side label */
  app?: AppName;
  className?: string;
}

export function AppStoreBadges({ theme = 'light', app = 'customer', className = '' }: Props) {
  const playUrl = process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim() || STORE.play(app);
  const appUrl  = process.env.NEXT_PUBLIC_APP_STORE_URL?.trim()  || STORE.apple(app);

  const caption = theme === 'navy' ? 'text-white/60' : 'text-gray-500';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        <Badge
          href={appUrl}
          src="/badges/app-store-badge.svg"
          alt="Download on the App Store"
        />
        <Badge
          href={playUrl}
          src="/badges/google-play-badge.png"
          alt="Get it on Google Play"
        />
        {app !== 'customer' && (
          <span className={`text-xs self-center ${caption}`}>
            For the {app === 'driver' ? 'driver' : 'business / partner'} app
          </span>
        )}
      </div>
    </div>
  );
}

function Badge({ href, src, alt }: { href: string; src: string; alt: string }) {
  /* eslint-disable @next/next/no-img-element */
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-85">
      <img src={src} alt={alt} className="h-12 w-auto" />
    </a>
  );
}
