'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Gift, ArrowRight } from 'lucide-react';
import { AppStoreBadges } from '@/components/AppStoreBadges';
import { STORE } from '@/lib/launch';

/**
 * The visible half of /r/[code].
 *
 * Two jobs, in this order:
 *
 *  1. Persist the code before anything can navigate away. localStorage is
 *     the only store available here: the visitor has no SEIRS account yet,
 *     which is the entire point of a referral link, so there is nothing to
 *     attach it to server-side. Wrapped in try/catch because a private
 *     window or a browser set to block site data throws on the write, and
 *     losing an attribution must not blank the page.
 *
 *  2. Forward to the store. Not instantly: an immediate redirect means the
 *     reader never sees who invited them or what they are joining, and on
 *     iOS a redirect fired before paint is sometimes swallowed. A short
 *     beat, then the store, with a button that does the same thing for
 *     anyone whose browser blocked the automatic hop.
 *
 * The code is READ BACK by nothing yet. Attribution still happens the way
 * it always has: the new user types the code into the app's signup field.
 * Carrying it from here into the install is deferred deep linking, which is
 * a Play Install Referrer / Apple attribution-token integration in the apps
 * and the backend, not a website change. Tracked in LAUNCH_CHECKLIST as
 * REFERRAL_DEFERRED_DEEPLINK so the stored value does not sit here looking
 * like it already works.
 */

const STORAGE_KEY = 'seirs.referral_code';

// Long enough to read the card, short enough that nobody thinks the page
// is broken. Matches the beat used on the collect page's post-payment
// recheck rather than being a new number pulled from nowhere.
const FORWARD_AFTER_MS = 2500;

export function ReferralLanding({ code }: { code: string | null }) {
  const [href, setHref] = useState(() => STORE.play('customer'));

  // Device resolution, same rule as GetAppButton: Nigeria is overwhelmingly
  // Android, so Play is the default and desktop's honest fallback.
  useEffect(() => {
    const ua = navigator.userAgent;
    // iPadOS 13+ reports as Macintosh, so check for touch to catch it.
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (isIOS) setHref(STORE.apple('customer'));
  }, []);

  useEffect(() => {
    if (!code) return;
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // Private window, blocked site data. Nothing to recover, and the
      // reader can still type the code into the app by hand.
    }
  }, [code]);

  useEffect(() => {
    const t = setTimeout(() => {
      window.location.href = href;
    }, FORWARD_AFTER_MS);
    return () => clearTimeout(t);
  }, [href]);

  return (
    <div className="bg-off-white min-h-screen flex items-start justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-card border border-gray-100 bg-white p-7 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky/10">
          <Gift size={26} className="text-sky" strokeWidth={1.75} />
        </div>

        <h1 className="mb-2 text-2xl font-extrabold text-navy">
          You have been invited to SEIRS
        </h1>

        {code ? (
          <>
            <p className="text-text-muted mb-5 text-sm leading-relaxed">
              Get the SEIRS app, create your account, and enter this invite
              code when it asks who sent you.
            </p>
            <div className="mb-6 rounded-btn border border-dashed border-sky/40 bg-sky/5 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-sky">
                Invite code
              </div>
              <div className="mt-1 font-mono text-xl font-bold tracking-widest text-navy">
                {code}
              </div>
            </div>
          </>
        ) : (
          /* Malformed or missing code. Chat apps regularly clip the last
             characters off a pasted link, so this is a normal arrival, not
             an error state. No invented code is shown, and the page still
             does the useful half of its job. */
          <p className="text-text-muted mb-6 text-sm leading-relaxed">
            That invite link came through incomplete, so we could not read the
            code. Ask whoever sent it to share it again, or get the app now and
            enter their code when you sign up.
          </p>
        )}

        <p className="text-text-muted mb-4 text-xs">
          Taking you to the app store...
        </p>

        <a
          href={href}
          className="mb-5 inline-flex w-full items-center justify-center gap-2 rounded-btn bg-navy px-5 py-3 font-bold text-white transition-colors hover:bg-navy-dark"
        >
          Get the SEIRS app
          <ArrowRight size={16} />
        </a>

        <div className="flex justify-center">
          <AppStoreBadges />
        </div>

        <p className="text-text-muted mt-6 border-t border-gray-100 pt-5 text-xs leading-relaxed">
          Already have a package on the way?{' '}
          <Link href="/track" className="text-sky font-semibold hover:underline">
            Track it here
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
