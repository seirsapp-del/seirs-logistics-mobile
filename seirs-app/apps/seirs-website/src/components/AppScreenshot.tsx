/**
 * A phone-shaped frame holding a real app screen.
 *
 * Until a capture exists, it draws a skeleton of that screen's layout rather
 * than a "coming soon" box. Two reasons: the site is written as though SEIRS
 * has shipped, so a visitor should never meet a placeholder that announces
 * itself, and a skeleton still communicates the shape of the screen being
 * described beside it. When the capture lands, register it in
 * APP_SCREENSHOTS and the skeleton is replaced with no layout change.
 *
 * Framing is deliberately restrained, matching the business app's standard:
 * a rounded border and a soft shadow. No glossy 3D device render, no notch
 * art, no floating perspective. The screen is the subject.
 */

import { APP_SCREENSHOTS, type ScreenKey } from '@/lib/launch';

/** Rough skeleton shapes per screen, used only until a capture exists. */
const SKELETONS: Record<ScreenKey, 'form' | 'profile' | 'map'> = {
  customerBooking: 'form',
  customerDriverAccepted: 'profile',
  customerTracking: 'map',
  driverHome: 'map',
  driverEarnings: 'form',
  businessDashboard: 'form',
};

export function AppScreenshot({
  screen,
  alt,
  className = '',
}: {
  screen: ScreenKey;
  alt: string;
  className?: string;
}) {
  const src = APP_SCREENSHOTS[screen];

  return (
    <div
      /* Founder 2026-08-14: the screens were too big on a phone. At 260px a
         19:9 frame is ~550px tall, so a single step filled the whole viewport
         and the story became one screen per scroll. 170px on a phone puts it
         at ~360px tall, so the screen and its copy sit together in one view,
         which is the desktop relationship. */
      className={`relative mx-auto w-full max-w-[170px] sm:max-w-[210px] lg:max-w-[260px] aspect-[9/19] rounded-2xl lg:rounded-[1.75rem] border border-gray-200 bg-white shadow-lg overflow-hidden ${className}`}
    >
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <Skeleton kind={SKELETONS[screen]} />
      )}
    </div>
  );
}

function Skeleton({ kind }: { kind: 'form' | 'profile' | 'map' }) {
  return (
    <div className="w-full h-full bg-gradient-to-b from-navy to-[#0b1b3a] p-3 flex flex-col gap-2.5">
      {/* status bar */}
      <div className="flex justify-between items-center px-1 pt-1">
        <div className="h-1.5 w-8 rounded-full bg-white/25" />
        <div className="h-1.5 w-5 rounded-full bg-white/25" />
      </div>

      {kind === 'map' && (
        <>
          <div className="flex-1 rounded-xl bg-white/10 relative overflow-hidden">
            <div className="absolute inset-x-4 top-1/3 h-0.5 bg-[#FFBE0B]/50 rotate-[-15deg]" />
            <div className="absolute left-5 top-1/3 w-2.5 h-2.5 rounded-full bg-[#FFBE0B]" />
            <div className="absolute right-5 top-[45%] w-2.5 h-2.5 rounded-full bg-white/60" />
          </div>
          <div className="rounded-xl bg-white/15 p-2.5 space-y-1.5">
            <div className="h-1.5 w-2/3 rounded-full bg-white/40" />
            <div className="h-1.5 w-1/2 rounded-full bg-white/25" />
          </div>
        </>
      )}

      {kind === 'form' && (
        <>
          <div className="h-2 w-1/2 rounded-full bg-white/40 mt-1" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg bg-white/10 h-8 flex items-center px-2.5 gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#FFBE0B]" />
              <div className="h-1.5 flex-1 rounded-full bg-white/25" />
            </div>
          ))}
          <div className="flex-1" />
          <div className="h-8 rounded-lg bg-[#FFBE0B]/80" />
        </>
      )}

      {kind === 'profile' && (
        <>
          <div className="flex items-center gap-2.5 mt-2">
            <div className="w-10 h-10 rounded-full bg-white/20 flex-shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-1.5 w-3/4 rounded-full bg-white/40" />
              <div className="h-1.5 w-1/2 rounded-full bg-white/25" />
            </div>
          </div>
          <div className="rounded-lg bg-white/10 h-10 mt-1" />
          <div className="flex-1 rounded-xl bg-white/10" />
          <div className="h-8 rounded-lg bg-[#FFBE0B]/80" />
        </>
      )}
    </div>
  );
}
