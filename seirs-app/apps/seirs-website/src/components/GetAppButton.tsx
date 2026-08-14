'use client';

import { useEffect, useState } from 'react';
import { STORE, type AppName } from '@/lib/launch';

/**
 * Sends the visitor to the right app store for the device they are holding.
 *
 * The site is written as though SEIRS has shipped, so "Start Sending" goes to
 * a store listing rather than a contact form. Nigeria is overwhelmingly
 * Android, so Play is the default and the honest fallback for desktop, where
 * "download the app" has no good answer anyway and a Play listing at least
 * shows the product.
 *
 * Resolution happens after mount because the server has no idea what device
 * is asking. The href is correct before hydration too, just not yet
 * personalised, so this degrades to a working Play link with JS disabled.
 */
export function GetAppButton({
  app = 'customer',
  children,
  className,
}: {
  app?: AppName;
  children: React.ReactNode;
  className?: string;
}) {
  const [href, setHref] = useState(() => STORE.play(app));

  useEffect(() => {
    const ua = navigator.userAgent;
    // iPadOS 13+ reports as Macintosh, so check for touch to catch it.
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (isIOS) setHref(STORE.apple(app));
  }, [app]);

  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
