'use client';

// Official store badges (founder 2026-08-10: the homemade lucide-icon
// buttons read as fake next to DHL/Amazon-grade sites). Assets are the
// vendors' own: Apple's "Download on the App Store" marketing SVG and
// Google's Play badge PNG (transparent margin trimmed so both sit at
// equal height). Until the apps actually publish, the env vars are
// unset and the badges render dimmed with a "coming soon" caption
// instead of broken links.
//
// Set on Vercel when the listings go live:
//   NEXT_PUBLIC_PLAY_STORE_URL  = https://play.google.com/store/apps/details?id=...
//   NEXT_PUBLIC_APP_STORE_URL   = https://apps.apple.com/ng/app/seirs/id...

interface Props {
  /** 'navy' = rendered on the navy hero, 'light' = on white sections; affects caption color only (official badges work on both). */
  theme?: 'navy' | 'light';
  /** Which audience the apps target, customer / driver / business, for the right-side label */
  app?: 'customer' | 'driver' | 'business';
  className?: string;
}

export function AppStoreBadges({ theme = 'light', app = 'customer', className = '' }: Props) {
  const playUrl = process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim() || null;
  const appUrl  = process.env.NEXT_PUBLIC_APP_STORE_URL?.trim()  || null;

  const caption = theme === 'navy' ? 'text-white/60' : 'text-gray-500';
  const anyInactive = !playUrl || !appUrl;

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
      {anyInactive && (
        <span className={`text-xs ${caption}`}>
          Coming soon to the App Store and Google Play.
        </span>
      )}
    </div>
  );
}

function Badge({ href, src, alt }: { href: string | null; src: string; alt: string }) {
  /* eslint-disable @next/next/no-img-element */
  const img = (
    <img
      src={src}
      alt={href ? alt : `${alt} - coming soon`}
      className={`h-12 w-auto ${href ? '' : 'opacity-50 grayscale'}`}
    />
  );
  if (!href) return <span aria-disabled>{img}</span>;
  return (
    <a href={href} target="_blank" rel="noopener" className="transition-opacity hover:opacity-85">
      {img}
    </a>
  );
}
