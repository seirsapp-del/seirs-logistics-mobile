import Link from 'next/link';
import { Reveal } from '@/components/Reveal';

/**
 * Alternating image/text story row (founder 2026-08-12: "it shouldn't
 * feel like boxes in columns and rows... every image that can tell a
 * story should").
 *
 * Images and words trade sides as you scroll instead of sitting in a
 * stacked block above a card grid. Renders text-only (full width) when
 * the image slot is empty, so a missing admin upload never leaves a
 * hole in the page.
 */
export function StoryRow({
  imageUrl,
  alt = '',
  eyebrow,
  title,
  body,
  points,
  linkHref,
  linkLabel,
  flip = false,
}: {
  imageUrl?: string;
  alt?: string;
  eyebrow?: string;
  title: string;
  body: string;
  points?: string[];
  linkHref?: string;
  linkLabel?: string;
  /** true = image on the right; alternate this down the page */
  flip?: boolean;
}) {
  const text = (
    <div className="flex-1 min-w-0">
      {eyebrow && <p className="section-label mb-3">{eyebrow}</p>}
      <h3 className="text-2xl md:text-3xl font-extrabold text-navy leading-tight mb-4">{title}</h3>
      <p className="text-text-muted text-base leading-relaxed">{body}</p>
      {points && points.length > 0 && (
        <ul className="mt-5 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#FFBE0B] flex-shrink-0" />
              <span className="text-text-dark text-sm leading-relaxed">{p}</span>
            </li>
          ))}
        </ul>
      )}
      {linkHref && linkLabel && (
        <Link
          href={linkHref}
          className="inline-flex items-center gap-1.5 mt-6 text-sm font-bold text-sky hover:gap-2.5 transition-all"
        >
          {linkLabel} <span aria-hidden>&rarr;</span>
        </Link>
      )}
    </div>
  );

  if (!imageUrl) {
    return (
      <Reveal>
        <div className="max-w-2xl">{text}</div>
      </Reveal>
    );
  }

  return (
    <Reveal>
      <div className={`flex flex-col ${flip ? 'md:flex-row-reverse' : 'md:flex-row'} gap-8 md:gap-14 items-center`}>
        <div className="flex-1 min-w-0 w-full">
          <div className="lift overflow-hidden rounded-card shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={alt}
              className="w-full h-64 md:h-80 object-cover"
              loading="lazy"
            />
          </div>
        </div>
        {text}
      </div>
    </Reveal>
  );
}
