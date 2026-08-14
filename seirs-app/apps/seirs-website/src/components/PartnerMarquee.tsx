import type { PartnerLogo } from '@/lib/cms';

/**
 * The "Trusted by" strip: partner marks scrolling continuously to the left.
 *
 * Founder 2026-08-14: bigger logos, each with the company name, flowing left,
 * and no cap on how many can be added as partners sign.
 *
 * How the loop works: the list is rendered twice, back to back, inside a
 * track that translates from 0 to -50%. When the first copy has fully left
 * the frame the second copy sits exactly where the first began, so the reset
 * is invisible and the strip reads as endless. Duration scales with the
 * number of logos so the speed per logo stays constant whether there are
 * three partners or thirty.
 *
 * Accessibility and restraint:
 * - The duplicate copy is aria-hidden, so a screen reader hears each partner
 *   once rather than twice.
 * - The whole animation is disabled under prefers-reduced-motion, where the
 *   strip becomes a normal scrollable row.
 * - Pauses on hover, so a name can actually be read.
 */
export function PartnerMarquee({ logos }: { logos: PartnerLogo[] }) {
  if (logos.length === 0) return null;

  // ~4.5s per logo keeps the pace readable at any list length.
  const durationSeconds = Math.max(18, logos.length * 4.5);

  return (
    <section className="py-10 sm:py-14 bg-off-white border-y border-gray-200 overflow-hidden">
      <p className="text-center text-text-muted text-[11px] sm:text-xs font-semibold tracking-widest uppercase mb-7 sm:mb-9">
        Trusted by
      </p>

      <div className="marquee group relative">
        <div
          className="marquee-track flex items-center gap-10 sm:gap-16 w-max"
          style={{ animationDuration: `${durationSeconds}s` }}
        >
          {[0, 1].map((copy) => (
            <div
              key={copy}
              aria-hidden={copy === 1}
              className="flex items-center gap-10 sm:gap-16 shrink-0"
            >
              {logos.map((logo, i) => (
                <div key={`${copy}-${i}`} className="flex items-center gap-3 sm:gap-4 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logo.url}
                    alt={logo.name || ''}
                    className="h-12 sm:h-16 w-auto max-w-[160px] sm:max-w-[220px] object-contain"
                    loading="lazy"
                  />
                  {logo.name && (
                    <span className="text-navy font-bold text-sm sm:text-lg whitespace-nowrap">
                      {logo.name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Soft edges so marks enter and leave rather than snapping off. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-12 sm:w-24 bg-gradient-to-r from-off-white to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 sm:w-24 bg-gradient-to-l from-off-white to-transparent" />
      </div>
    </section>
  );
}
