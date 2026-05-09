import Link from "next/link";
import { Mail, Phone, MapPin } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-navy text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand column */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 bg-sky rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-black text-base">S</span>
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-white font-extrabold text-xl tracking-tight">
                  Seirs
                </span>
                <span className="text-sky text-[10px] font-semibold tracking-widest uppercase">
                  Logistics
                </span>
              </div>
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
                { label: "How it Works",   href: "/how-it-works" },
                { label: "For Business",   href: "/for-business" },
                { label: "For Drivers",    href: "/for-drivers" },
                { label: "Partner Stores", href: "/for-partner-stores" },
                { label: "Contact",        href: "/contact" },
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
              <li>
                <a
                  href="tel:+2348000000000"
                  className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors duration-150"
                >
                  <Phone size={14} className="text-sky flex-shrink-0" />
                  +234 800 000 0000
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
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
          </div>
        </div>
      </div>
    </footer>
  );
}
