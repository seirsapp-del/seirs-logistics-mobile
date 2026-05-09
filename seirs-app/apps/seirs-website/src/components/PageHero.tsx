import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

/**
 * Shared hero block for dedicated marketing pages (How it Works, For
 * Business, etc). Keeps the visual language consistent across pages
 * — same gradient, same spacing, same radial dot pattern as the
 * homepage hero, but scaled for content-first pages.
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
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle: string;
  icon: LucideIcon;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
}) {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, #0F2B4C 0%, #1a3a5c 60%, #0F2B4C 100%)",
      }}
    >
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

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-28 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 border border-white/20 mb-8">
          <Icon size={28} className="text-sky" strokeWidth={1.75} />
        </div>

        <p className="text-sky text-xs font-bold uppercase tracking-widest mb-4">
          {eyebrow}
        </p>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] mb-6 tracking-tight">
          {title}
        </h1>

        <p className="text-white/70 text-lg leading-relaxed mb-10 max-w-2xl mx-auto">
          {subtitle}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={primaryCtaHref}
            className="inline-flex items-center justify-center gap-2 bg-white text-navy font-bold px-8 py-4 rounded-btn hover:bg-gray-50 transition-colors shadow-xl"
          >
            {primaryCtaLabel}
            <ArrowRight size={18} />
          </Link>
          {secondaryCtaLabel && secondaryCtaHref ? (
            <Link
              href={secondaryCtaHref}
              className="inline-flex items-center justify-center gap-2 border-2 border-white/40 text-white font-semibold px-8 py-4 rounded-btn hover:bg-white/10 transition-colors"
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
 * Standard CTA strip used at the bottom of marketing pages — same
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
      className="py-20"
      style={{
        background:
          "linear-gradient(135deg, #0F2B4C 0%, #1a3a5c 60%, #0F2B4C 100%)",
      }}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
          {title}
        </h2>
        <p className="text-white/70 text-lg mb-8">{subtitle}</p>
        <Link
          href={primaryHref}
          className="inline-flex items-center justify-center gap-2 bg-sky text-white font-bold px-8 py-4 rounded-btn hover:opacity-90 transition-opacity shadow-xl"
        >
          {primaryLabel}
          <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}
