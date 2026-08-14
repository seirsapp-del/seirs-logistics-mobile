import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

/**
 * Shared hero block for dedicated marketing pages (How it Works, For
 * Business, etc). Keeps the visual language consistent across pages:
 * same gradient, same spacing, same radial dot pattern as the
 * homepage hero, but scaled for content-first pages.
 *
 * `heroImageUrl` is optional and typically comes from a CMS page_block
 * so marketing can swap the hero backdrop without a code deploy. When
 * set, we render it as a low-opacity darkened overlay on top of the
 * navy gradient (so text stays readable regardless of the image), and
 * fall back cleanly to the pure gradient when unset.
 */
export function PageHero({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  primaryCtaLabel,
  primaryCtaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
  heroImageUrl,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle: string;
  icon: LucideIcon;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  heroImageUrl?: string | null;
}) {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, #0F2B4C 0%, #1a3a5c 60%, #0F2B4C 100%)",
      }}
    >
      {heroImageUrl && (
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center opacity-25"
          style={{ backgroundImage: `url(${heroImageUrl})` }}
        />
      )}
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      {/* Phone sizing 2026-08-14 (founder: the inner pages have the same
          problem the homepage hero had, buttons too big and stacked instead
          of side by side, and it should feel like the desktop page). This
          component is the hero on how-it-works, for-business, for-drivers and
          for-partner-stores, so fixing it here fixes four pages at once.
          Padding, icon, type and CTAs are all phone-first now and step back
          up to the original values at sm and lg. */}
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 sm:pt-16 sm:pb-24 lg:pt-20 lg:pb-28 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/10 border border-white/20 mb-5 lg:mb-8">
          <Icon size={22} className="text-sky lg:hidden" strokeWidth={1.75} />
          <Icon size={28} className="text-sky hidden lg:block" strokeWidth={1.75} />
        </div>

        <p className="text-sky text-[10px] lg:text-xs font-bold uppercase tracking-widest mb-3 lg:mb-4">
          {eyebrow}
        </p>

        <h1 className="text-[28px] sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] mb-4 lg:mb-6 tracking-tight">
          {title}
        </h1>

        <p className="text-white/70 text-sm sm:text-base lg:text-lg leading-relaxed mb-6 lg:mb-10 max-w-2xl mx-auto">
          {subtitle}
        </p>

        {/* Side by side at every width, matching the homepage hero. flex-1
            makes them share the row evenly on a phone. */}
        <div className="flex flex-row gap-2 sm:gap-3 justify-center">
          <Link
            href={primaryCtaHref}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 sm:gap-2 bg-white text-navy font-bold px-3 py-3 sm:px-8 sm:py-4 rounded-btn hover:bg-gray-50 transition-colors shadow-xl text-[13px] sm:text-base"
          >
            {primaryCtaLabel}
            <ArrowRight size={16} className="flex-shrink-0" />
          </Link>
          {secondaryCtaLabel && secondaryCtaHref ? (
            <Link
              href={secondaryCtaHref}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 border-2 border-white/40 text-white font-semibold px-3 py-3 sm:px-8 sm:py-4 rounded-btn hover:bg-white/10 transition-colors text-[13px] sm:text-base"
            >
              {secondaryCtaLabel}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0">
        <svg
          viewBox="0 0 1440 60"
          fill="none"
          preserveAspectRatio="none"
          className="w-full h-12"
        >
          <path
            d="M0 60L1440 60L1440 20C1200 50 960 60 720 40C480 20 240 0 0 20L0 60Z"
            fill="#F5F5F0"
          />
        </svg>
      </div>
    </section>
  );
}

/**
 * Standard CTA strip used at the bottom of marketing pages, same
 * navy gradient as the hero so the page bookends visually.
 */
export function PageCta({
  title,
  subtitle,
  primaryLabel,
  primaryHref,
}: {
  title: string;
  subtitle: string;
  primaryLabel: string;
  primaryHref: string;
}) {
  return (
    <section
      className="py-12 sm:py-16 lg:py-20"
      style={{
        background:
          "linear-gradient(135deg, #0F2B4C 0%, #1a3a5c 60%, #0F2B4C 100%)",
      }}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white mb-3 lg:mb-4">
          {title}
        </h2>
        <p className="text-white/70 text-sm sm:text-base lg:text-lg mb-6 lg:mb-8">{subtitle}</p>
        <Link
          href={primaryHref}
          className="inline-flex items-center justify-center gap-1.5 sm:gap-2 bg-sky text-white font-bold px-5 py-3 sm:px-8 sm:py-4 rounded-btn hover:opacity-90 transition-opacity shadow-xl text-[13px] sm:text-base"
        >
          {primaryLabel}
          <ArrowRight size={16} className="flex-shrink-0" />
        </Link>
      </div>
    </section>
  );
}
