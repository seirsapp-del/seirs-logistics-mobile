'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cookie, X } from 'lucide-react';
import { SITE_URL } from '@/lib/launch';

/**
 * Storage notice for the public website.
 *
 * Rewritten 2026-08-23. What it used to say and what it actually did had
 * come apart in three places:
 *
 *  - It said "We use essential cookies to make this site work and optional
 *    cookies for analytics". This site sets no cookies at all and loads no
 *    third-party trackers. Its own comment said so.
 *  - "Accept all" and "Essential only" both called the same function, which
 *    only wrote a localStorage flag. Two buttons, one outcome, and nothing
 *    anywhere was gated on which one you pressed. A consent choice that
 *    changes nothing is worse than no choice offered.
 *  - "You can change your mind anytime in the Privacy Policy" was false. The
 *    privacy page has no consent control and the banner never reappears.
 *
 * So it is now one honest dismissal describing the two keys the site really
 * writes, and no promise of a control that does not exist. When analytics
 * ship this has to become a real two-outcome consent gate (NDPA Article 25
 * requires opt-in before non-essential storage) and the script tag must be
 * gated on the stored value.
 */

const STORAGE_KEY = 'seirs.cookie_consent';

// The host is shown in the heading, so it reads as "this site" rather than
// some other property. It used to be the literal string "seirs.co", which
// is one of the three places the canonical domain was hardcoded (W-M9).
const HOST = (() => {
  try {
    return new URL(SITE_URL).host;
  } catch {
    return 'this site';
  }
})();

export default function CookieBanner() {
  // null = not yet answered. Any stored value at all, including the older
  // 'accepted' / 'declined' pair, counts as answered so returning visitors
  // are not asked again by a rewrite.
  const [answered, setAnswered] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private window or blocked site data. Nothing was ever stored, so
      // showing the notice once per visit is the correct behaviour.
    }
    setAnswered(stored !== null);
    setHydrated(true);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'acknowledged');
    } catch {
      // Cannot persist. The notice reappears next visit, which is annoying
      // but honest: we genuinely did not remember.
    }
    setAnswered(true);
  };

  // Don't render until we know the persisted choice, prevents flash
  // on every page load for returning visitors.
  if (!hydrated || answered) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-40"
      role="region"
      aria-label="Storage notice"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-sky/10 flex items-center justify-center shrink-0">
            <Cookie size={20} className="text-sky" />
          </div>
          <div className="flex-1">
            {/* A div, not an h2. This is a fixed overlay on every page, so an
                h2 here injected a heading between whatever headings the page
                itself has and broke the outline for a screen reader. */}
            <div className="font-bold text-navy text-sm">Storage on {HOST}</div>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
              This site sets no cookies and loads no third-party trackers. It
              saves two things in your own browser: that you have seen this
              notice, and an invite code if you arrived from a referral link.
              Clearing your browser data removes both.{' '}
              <Link href="/privacy-policy#section-9" className="text-sky underline">
                How we handle data
              </Link>
              .
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Close notice"
            className="text-gray-400 hover:text-gray-700 -mr-1 -mt-1"
          >
            <X size={16} />
          </button>
        </div>
        <button
          onClick={dismiss}
          className="w-full px-3 py-2 text-xs font-semibold text-white bg-navy hover:bg-sky rounded-lg transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
