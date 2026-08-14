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
            <Link href="/" className="inline-flex items-center mb-4" aria-label="Seirs Logistics home">
              {/* Footer background is navy, so render logo in white */}
              <SeirsLogo variant="lockup" size={150} color="#FFFFFF" />
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
              {[
                { label: "How it Works",     href: "/how-it-works" },
                { label: "Find a Partner",   href: "/find-a-partner" },
                { label: "For Business",     href: "/for-business" },
                { label: "For Drivers",      href: "/for-drivers" },
                { label: "Partner Stores",   href: "/for-partner-stores" },
                { label: "Careers",          href: "/careers" },
                { label: "News",             href: "/news" },
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

        {/* App-store badges, render in 'coming soon' state until the
            apps publish and NEXT_PUBLIC_PLAY_STORE_URL + APP_STORE_URL
            are set on Vercel. */}
        <div className="border-t border-white/10 pt-8 mb-6">
          <h4 className="text-white font-bold text-sm tracking-wider uppercase mb-4">
            Get the App
          </h4>
          <AppStoreBadges theme="navy" />
        </div>

        {/* Divider */}
        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/40 text-sm text-center sm:text-left">
            &copy; 2026 Seirs Logistics Ltd. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/privacy-policy"
              className="text-white/40 hover:text-white/70 text-xs transition-colors"
            >
              Privacy Policy
            </Link>
            <span className="text-white/20">·</span>
            <Link
              href="/terms-of-service"
              className="text-white/40 hover:text-white/70 text-xs transition-colors"
            >
              Terms of Service
            </Link>
            <span className="text-white/20">·</span>
            <Link
              href="/careers"
              className="text-white/40 hover:text-white/70 text-xs transition-colors"
            >
              Careers
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
