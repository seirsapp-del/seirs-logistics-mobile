import type { Metadata } from "next";
import Link from "next/link";
import SeirsLogo from "@/components/SeirsLogo";

/**
 * 404. Rebuilt 2026-08-23: it drew a bare letter "S" in a navy square rather
 * than the mark every other page uses, so the one page a lost visitor lands
 * on was the one page that did not look like SEIRS. It also exported no
 * metadata, so a 404 inherited the homepage title.
 */
export const metadata: Metadata = {
  title: "Page not found",
  description: "That page does not exist. Track a delivery or head back to the SEIRS homepage.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-off-white">
      <div className="text-center">
        <div className="flex justify-center mb-6">
          <SeirsLogo variant="lockup" size={170} />
        </div>
        <h1 className="text-7xl font-black text-navy mb-3">404</h1>
        <p className="text-text-muted text-lg mb-8">
          This page doesn&apos;t exist.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 bg-navy text-white font-bold px-8 py-4 rounded-btn hover:opacity-90 transition-opacity"
          >
            Back to Home
          </Link>
          {/* Most people who land here arrived from a forwarded link holding
              a tracking code, so give them the door they were looking for. */}
          <Link
            href="/track"
            className="inline-flex items-center justify-center gap-2 border-2 border-navy/20 text-navy font-semibold px-8 py-4 rounded-btn hover:bg-navy/5 transition-colors"
          >
            Track a delivery
          </Link>
        </div>
      </div>
    </div>
  );
}
