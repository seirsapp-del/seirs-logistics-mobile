"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import SeirsLogo from "./SeirsLogo";

// Track added 2026-08-15, second. /track/[code] has been live and working
// the whole time with nothing linking to it, so the only way in was to
// hand-type a deep URL. Recipients are the largest audience a Nigerian
// logistics site gets and they arrive already holding a code; making them
// open a menu to find tracking is the wrong trade. Sits high deliberately.
//
// Find a Partner is still here but the directory currently returns zero
// stores, so a top-level slot answers "0 partners in the network". Worth
// demoting until roughly ten are live.
const navLinks = [
  { label: "How it Works",     href: "/how-it-works" },
  { label: "Track",            href: "/track" },
  { label: "Find a Partner",   href: "/find-a-partner" },
  { label: "For Business",     href: "/for-business" },
  { label: "For Drivers",      href: "/for-drivers" },
  { label: "Partner Stores",   href: "/for-partner-stores" },
  { label: "News",             href: "/news" },
  { label: "Contact",          href: "/contact" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white border-b border-gray-200 shadow-sm"
          : "bg-white/95 backdrop-blur-sm"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo: SEIRS okada mark + wordmark, mirrors mobile SeirsLogoV2 */}
          <Link href="/" className="flex items-center flex-shrink-0" aria-label="SEIRS Logistics home">
            <SeirsLogo variant="lockup" size={130} />
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-text-muted hover:text-navy font-medium text-sm px-4 py-2 rounded-lg transition-colors duration-150 hover:bg-gray-50"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTA. There was a LangSwitcher here once. It was hidden
              in 2026-08-10 (founder: a dropdown that changes nothing reads as
              broken) and the 72-line component sat unrendered until it was
              deleted on 2026-08-23, its only remaining reference being this
              comment. The site is English with browser translation; the APPS
              carry the Yoruba, Igbo and Hausa translations. When real site
              translations land, build the switcher against whatever routing
              they use rather than restoring a localStorage flag that only
              ever set <html lang>. */}
          <div className="hidden md:flex items-center gap-2">
            <Link
              href="/contact"
              className="bg-sky text-white font-semibold text-sm px-5 py-2.5 rounded-btn hover:opacity-90 transition-opacity"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 rounded-lg text-navy hover:bg-gray-100 transition-colors"
            aria-label="Toggle menu"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {open && (
        <div className="md:hidden bg-white border-t border-gray-100 shadow-xl">
          <div className="px-4 py-4 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block text-text-dark font-medium text-base px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3 pb-1">
              <Link
                href="/contact"
                onClick={() => setOpen(false)}
                className="block w-full text-center bg-sky text-white font-semibold text-base px-5 py-3 rounded-btn hover:opacity-90 transition-opacity"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
