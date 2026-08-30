import Link from "next/link";
import { Mail, MapPin } from "lucide-react";
import { AppStoreBadges } from "@/components/AppStoreBadges";
import SeirsLogo from "@/components/SeirsLogo";

export default function Footer() {
  return (
    <footer className="bg-navy text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand column */}
          <div className="lg:col-span-1">
            <Link href="/" className="inline-flex items-center mb-4" aria-label="SEIRS Logistics home">
              {/* Footer background is navy, so render logo in white */}
              {/* hubColor is the ground the wheels sit on, so the axle holes read.
                  White-on-navy needs navy hubs; the default is the light one. */}
              <SeirsLogo variant="lockup" size={150} color="#FFFFFF" hubColor="#0F2B4C" />
            </Link>
            <p className="text-white/60 text-sm leading-relaxed mb-5">
              Nigeria&apos;s smartest last-mile delivery platform. Connecting businesses, drivers, and partner stores across Nigeria.
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-white/60 text-sm">
                <MapPin size={14} className="text-sky flex-shrink-0" />
                <span>Lagos, Nigeria</span>
              </div>
            </div>
          </div>

          {/* Company Links */}
          <div>
            <h4 className="text-white font-bold text-sm tracking-wider uppercase mb-4">
              Company
            </h4>
            <ul className="space-y-3">
              {/* Track, FAQ and Changelog added 2026-08-15. All three were
                  live, published and in the sitemap, but linked from nowhere
                  on the site: the FAQ has answers written and was deflecting
                  no support at all, and tracking could only be reached by
                  hand-typing a deep URL. Crawlable but unreachable is the
                  worst of both. */}
              {[
                { label: "How it Works",     href: "/how-it-works" },
                { label: "Track a Delivery", href: "/track" },
                { label: "Find a Partner",   href: "/find-a-partner" },
                { label: "For Business",     href: "/for-business" },
                { label: "For Drivers",      href: "/for-drivers" },
                { label: "Partner Stores",   href: "/for-partner-stores" },
                { label: "FAQ",              href: "/faq" },
                { label: "Careers",          href: "/careers" },
                { label: "News",             href: "/news" },
                { label: "Changelog",        href: "/changelog" },
                { label: "Contact",          href: "/contact" },
              ].map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-white/60 hover:text-white text-sm transition-colors duration-150"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="text-white font-bold text-sm tracking-wider uppercase mb-4">
              Legal
            </h4>
            <ul className="space-y-3">
              {[
                { label: "Privacy Policy", href: "/privacy-policy" },
                { label: "Terms of Service", href: "/terms-of-service" },
              ].map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-white/60 hover:text-white text-sm transition-colors duration-150"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-white font-bold text-sm tracking-wider uppercase mb-4">
              Contact
            </h4>
            <ul className="space-y-3">
              <li>
                <a
                  href="mailto:support@seirs.co"
                  className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors duration-150 group"
                >
                  <Mail size={14} className="text-sky flex-shrink-0" />
                  support@seirs.co
                </a>
              </li>
              <li>
                <a
                  href="mailto:business@seirs.co"
                  className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors duration-150"
                >
                  <Mail size={14} className="text-sky flex-shrink-0" />
                  business@seirs.co
                </a>
              </li>
              {/* Honesty fix 2026-08-14: the third entry dialled
                  +234 800 000 0000, a placeholder that connects to nothing.
                  The contact page dropped this exact number on 2026-08-11;
                  the footer was the surviving copy. Removed rather than
                  replaced: put a WhatsApp wa.me link here when a real
                  business line exists, since that converts better in
                  Nigeria than an email form. */}
            </ul>
          </div>
        </div>

        {/* App-store badges. The 'coming soon' state this comment described
            was removed on 2026-08-14: they are always real links now, built
            from the final package ids in lib/launch.ts, so they point at the
            correct forever-URL and start resolving the day the listings
            publish. NEXT_PUBLIC_PLAY_STORE_URL / APP_STORE_URL still win if
            set, for a beta or a regional listing. */}
        <div className="border-t border-white/10 pt-8 mb-6">
          <h4 className="text-white font-bold text-sm tracking-wider uppercase mb-4">
            Get the App
          </h4>
          <AppStoreBadges theme="navy" />
        </div>

        {/* Divider.
            text-white/40 raised to /55 on 2026-08-23. On the navy ground it
            measured 3.52:1, below the 4.5:1 AA threshold, and it was carrying
            the Privacy Policy, Terms of Service and Careers links at text-xs:
            the smallest type on the page in the lowest-contrast colour, on
            the three links a reader is most likely to be squinting for.
            /55 measures 5.35:1. */}
        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/55 text-sm text-center sm:text-left">
            &copy; 2026 SEIRS Logistics Ltd. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/privacy-policy"
              className="text-white/55 hover:text-white text-xs transition-colors"
            >
              Privacy Policy
            </Link>
            <span className="text-white/20">·</span>
            <Link
              href="/terms-of-service"
              className="text-white/55 hover:text-white text-xs transition-colors"
            >
              Terms of Service
            </Link>
            <span className="text-white/20">·</span>
            <Link
              href="/careers"
              className="text-white/55 hover:text-white text-xs transition-colors"
            >
              Careers
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
