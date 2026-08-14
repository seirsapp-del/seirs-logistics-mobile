import type { PartnerLogo } from '@/lib/cms';

/**
 * The "Trusted by" strip: partner marks scrolling continuously to the left.
 *
 * Founder 2026-08-14: bigger marks, each with the company name, flowing left,
 * uncapped so partners can be added as they sign. Follow-up 2026-08-15: the
 * loop has to look like it never ends, and read as clean as other sites.
 *
 * Why the first attempt stuttered, and how this one does not:
 *
 * The track holds two identical copies of the list and animates to -50%, so
 * the second copy should land exactly where the first began. That only works
 * if one copy is EXACTLY half the track. The first version used a flex `gap`,
 * which also inserts a gap BETWEEN the two copies, so the track measured
 * copy + gap + copy and -50% landed half a gap short. Every loop showed a
 * small jump.
 *
 * So there is no gap here. Each item carries its own right margin, making
 * spacing part of the item's width. The track is then exactly 2x one copy,
 * -50% is exactly one copy, and the seam is invisible.
 *
 * Clean-up borrowed from how other sites do this well:
 * - Marks sit in a fixed-height box and are centred, so wildly different
 *   logo aspect ratios still share one optical baseline rather than
 *   bouncing up and down the row.
 * - Desaturated at rest, full colour on hover. A row of competing brand
 *   colours is the main reason these strips look busy.
 * - Edges fade into the background so marks enter and leave instead of
 *   being sliced off at the viewport edge.
 *
 * Accessibility: the duplicate copy is aria-hidden so a screen reader hears
 * each partner once; the strip pauses on hover so a name can be read; and
 * under prefers-reduced-motion the animation is dropped for a plain
 * scrollable row.
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

      <div className="marquee relative">
        <div
          className="marquee-track flex w-max items-center"
          style={{ animationDuration: `${durationSeconds}s` }}
        >
          {/* Two identical copies. No flex gap anywhere: spacing lives on the
              items, so one copy is exactly half the track. */}
          {[0, 1].map((copy) => (
            <div key={copy} aria-hidden={copy === 1} className="flex items-center">
              {logos.map((logo, i) => (
                <div
                  key={`${copy}-${i}`}
                  className="marquee-item flex shrink-0 items-center gap-3 sm:gap-4"
                >
                  <div className="flex h-12 w-[120px] items-center justify-center sm:h-16 sm:w-[170px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logo.url}
                      alt={logo.name || ''}
                      className="max-h-full max-w-full object-contain grayscale opacity-70 transition duration-300 hover:grayscale-0 hover:opacity-100"
                      loading="lazy"
                    />
                  </div>
                  {logo.name && (
                    <span className="whitespace-nowrap text-sm font-bold text-navy sm:text-lg">
                      {logo.name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Soft edges so marks enter and leave rather than snapping off. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-off-white to-transparent sm:w-28" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-off-white to-transparent sm:w-28" />
      </div>
    </section>
  );
}
