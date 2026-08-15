"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, PackageSearch } from "lucide-react";
import { HeroBackdrop } from "@/components/HeroBackdrop";

/**
 * /track: the front door to tracking.
 *
 * /track/[code] has been live, working and polling for status the whole time,
 * and nothing on the site linked to it. There was no index, so the only way
 * in was to hand-type a deep URL, and the one on-page reference to
 * "seirs.app/track" on Find a Partner was plain text pointing at a 404.
 *
 * This matters more than its size suggests. Recipients are the largest
 * audience a Nigerian logistics site gets: they arrive already holding a
 * code, from a WhatsApp message, and they are not looking to read marketing.
 * Giving them one input is the whole job.
 *
 * Built before there is anything to track on purpose. The empty state is
 * honest, and this becomes the permanent anchor of the post-launch site
 * rather than something bolted on later.
 */
export default function TrackIndexPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Codes are SRS- followed by 8 crypto-random alphanumerics, so the only
    // characters that can ever be valid are A-Z, 0-9 and the hyphen.
    // Whitelisting rather than stripping whitespace means nothing else
    // reaches the router or the API at all.
    //
    // Not strictly required for safety: the value is encodeURIComponent'd
    // into the path, the backend looks it up through a parameterised TypeORM
    // query, and React escapes it when the not-found state echoes it back.
    // This is defence in depth plus a better error, since a code with a
    // stray character otherwise produces a confusing "not found" for what is
    // really a typo.
    const clean = code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");

    if (!clean) {
      setError("Enter the tracking code from your confirmation message.");
      return;
    }
    if (clean.length < 6) {
      setError("That code looks too short. It should look like SRS-1A2B3C4D.");
      return;
    }
    if (clean.length > 24) {
      setError("That looks longer than a tracking code. Check for extra text.");
      return;
    }

    setError(null);
    router.push(`/track/${encodeURIComponent(clean)}`);
  }

  return (
    <div className="bg-off-white min-h-screen">
      <div className="relative overflow-hidden bg-navy py-14 sm:py-20">
        <HeroBackdrop slot="img_hero_track" />
        <div className="relative max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/10 border border-white/20 mb-5 lg:mb-6">
            <PackageSearch size={24} className="text-sky" strokeWidth={1.75} />
          </div>
          <h1 className="text-title-sm lg:text-title-lg font-extrabold text-white mb-3">
            Track your delivery
          </h1>
          <p className="text-white/70 text-sm sm:text-base mb-7 lg:mb-9">
            Enter the tracking code from your confirmation message. No account,
            no app, no sign-in.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              // Real codes are SRS- plus 8 characters (generateTrackingCode).
              // The first placeholder here showed "SRS4K92B", the wrong shape,
              // which would have had people hunting for a code that does not
              // look like the one they were sent.
              placeholder="e.g. SRS-1A2B3C4D"
              maxLength={24}
              aria-label="Tracking code"
              autoComplete="off"
              autoCapitalize="characters"
              className="flex-1 min-w-0 px-4 py-3.5 rounded-btn bg-white/10 border border-white/25 text-white placeholder-white/40 text-center sm:text-left tracking-widest font-semibold focus:outline-none focus:ring-2 focus:ring-sky/50 focus:border-sky transition-colors"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 bg-sky text-white font-bold px-6 py-3.5 rounded-btn hover:opacity-90 transition-opacity shadow-lg text-sm sm:text-base"
            >
              <Search size={17} className="flex-shrink-0" />
              Track
            </button>
          </form>

          {error && (
            <p className="text-warning-amber text-sm mt-3" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="bg-white rounded-card border border-gray-100 shadow-sm p-6 sm:p-8">
          <h2 className="text-navy font-bold text-lg mb-4">
            Where do I find my code?
          </h2>
          <ul className="space-y-3 text-text-muted text-sm leading-relaxed">
            <li className="flex gap-2.5">
              <span className="text-sky font-bold flex-shrink-0" aria-hidden>
                &bull;
              </span>
              In the confirmation the sender received when they booked, and in
              any message they forwarded to you.
            </li>
            <li className="flex gap-2.5">
              <span className="text-sky font-bold flex-shrink-0" aria-hidden>
                &bull;
              </span>
              On the notification sent when a driver accepted the delivery.
            </li>
            <li className="flex gap-2.5">
              <span className="text-sky font-bold flex-shrink-0" aria-hidden>
                &bull;
              </span>
              If you cannot find it, ask whoever sent the package: they can see
              it on their order at any time.
            </li>
          </ul>

          <p className="text-text-muted text-sm leading-relaxed mt-6 pt-6 border-t border-gray-100">
            Collecting on someone else&apos;s behalf?{" "}
            <Link href="/how-it-works" className="text-sky font-semibold hover:underline">
              See how handoffs are verified
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
