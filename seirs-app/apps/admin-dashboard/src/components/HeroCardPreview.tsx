'use client';
import { SeirsMarkBold } from '@/components/SeirsLogo';

/**
 * What the customer actually sees, drawn before it goes live.
 *
 * ── THE SYMPTOM ──────────────────────────────────────────────────────
 * Founder 2026-08-26: "i will like to see a full preview before
 * publishing, not just text preview." The website editor's Preview
 * button rendered the markdown body as HTML in a grey box. That tells
 * you nothing about the surface the content is actually going to: a
 * 200px image card on the app home carousel, where the title is clamped
 * to two lines, the excerpt to two more, and a badge pill sits over the
 * artwork. Copy that reads fine in a grey box gets cut mid-word there.
 *
 * ── WHY THESE EXACT NUMBERS ──────────────────────────────────────────
 * Every value below is copied from the real component, not estimated,
 * so the preview cannot flatter the content:
 *
 *   apps/business-app/components/HeroCardImage.tsx  (identical twin in
 *   apps/customer-app/components/HeroCardImage.tsx)
 *     height 200, width 100%, borderRadius Radius.xl = 20
 *     badge   top/left Spacing.md = 16, padding 10/4, radius full,
 *             FontSize.xs = 11, bold, letterSpacing 0.8, uppercase,
 *             text #0F2B4C on the category colour
 *     title   FontSize.lg = 20, bold, white, marginBottom 4, 2 lines
 *     desc    FontSize.sm = 13, medium, rgba(255,255,255,0.85),
 *             lineHeight 18, 2 lines
 *     overlay transparent to rgba(0,0,0,0.10) at 40% to
 *             rgba(15,43,76,0.85) at the bottom
 *     no image: 135deg #0F2B4C to #1A3A63 plus the okada mark at 0.14
 *             opacity, nudged up 14px
 *
 *   apps/customer-app/components/HeroCarousel.tsx
 *     each slide is the full screen width with Spacing.md = 16 of inner
 *     padding, so on a 360dp phone the card is 328 x 200.
 *
 * The card is rendered at that true 328 x 200 rather than stretched to
 * fill the admin panel: a preview that is twice as wide as the phone
 * would hide exactly the truncation this is built to expose.
 *
 * ── WHAT THIS PREVIEW CANNOT SHOW ────────────────────────────────────
 * The apps shuffle the featured stories on every launch (Fisher-Yates
 * in use-hero-cards.ts, founder 2026-08-13 "it should be auto shuffle"),
 * so slide ORDER is not previewable and is not promised here. The
 * caller says so in the panel around this card.
 */

/**
 * Category to pill colour. Mirrors BADGE_COLORS in
 * apps/customer-app/hooks/use-hero-cards.ts and its business-app twin.
 * If that map changes, this one has to change with it, otherwise the
 * preview lies about the colour.
 *
 * Note the pill colour is keyed off the CATEGORY, never off the badge
 * text: an admin typing "PROMO" into the label box on a story filed
 * under "news" still gets the blue news pill in the app.
 */
const BADGE_COLORS: Record<string, string> = {
  offer:          '#16A34A',
  promotion:      '#16A34A',
  news:           '#3A7BD5',
  press:          '#3A7BD5',
  product_update: '#C2410C',
  guide:          '#0E7C86',
  story:          '#0E7C86',
  impact:         '#0E7C86',
};

/** Two-line clamp, matching numberOfLines={2} on the native Text. */
const clamp2: React.CSSProperties = {
  display:           '-webkit-box',
  WebkitBoxOrient:   'vertical',
  WebkitLineClamp:   2,
  overflow:          'hidden',
};

export interface HeroCardPreviewProps {
  coverImageUrl?: string | null;
  /** The admin's "Card label". Blank falls back to the category, exactly as the server does. */
  featureBadge?:  string | null;
  category?:      string | null;
  title?:         string | null;
  /** The excerpt becomes the card description. The body never appears on a card. */
  excerpt?:       string | null;
}

export function HeroCardPreview({
  coverImageUrl, featureBadge, category, title, excerpt,
}: HeroCardPreviewProps) {
  // listFeaturedCards returns badge = featureBadge ?? category ?? null,
  // then the app does .replace(/_/g, ' '). Reproduced here rather than
  // simplified, so "product_update" previews as "PRODUCT UPDATE".
  const badgeText  = (featureBadge?.trim() || category || '').replace(/_/g, ' ');
  const badgeColor = BADGE_COLORS[category ?? ''] ?? '#3A7BD5';

  return (
    <div
      style={{
        width:        328,
        height:       200,
        borderRadius: 20,
        overflow:     'hidden',
        position:     'relative',
        background:   '#0F2B4C',
        boxShadow:    '0 8px 24px rgba(15,43,76,0.22)',
        flexShrink:   0,
      }}
    >
      {coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverImageUrl}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <>
          <div
            style={{
              position:   'absolute',
              inset:      0,
              background: 'linear-gradient(135deg, #0F2B4C 0%, #1A3A63 100%)',
            }}
          />
          {/* The okada watermark the app draws when a card has no cover.
              Same component, same 0.14 opacity, same 14px upward nudge,
              so a coverless card previews as the branded slide it will
              really be and not as a plain navy rectangle. */}
          <div
            style={{
              position:       'absolute',
              inset:          0,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              opacity:        0.14,
              transform:      'translateY(-14px)',
              pointerEvents:  'none',
            }}
          >
            <SeirsMarkBold size={190} color="#FFFFFF" hubColor="#0F2B4C" />
          </div>
        </>
      )}

      {/* Readability gradient over the lower part of the card. */}
      <div
        style={{
          position:   'absolute',
          inset:      0,
          background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.10) 40%, rgba(15,43,76,0.85) 100%)',
        }}
      />

      {badgeText ? (
        <div
          style={{
            position:        'absolute',
            top:             16,
            left:            16,
            background:      badgeColor,
            color:           '#0F2B4C',
            padding:         '4px 10px',
            borderRadius:    9999,
            fontSize:        11,
            fontWeight:      700,
            letterSpacing:   0.8,
            textTransform:   'uppercase',
            lineHeight:      1.2,
            maxWidth:        200,
            overflow:        'hidden',
            textOverflow:    'ellipsis',
            whiteSpace:      'nowrap',
          }}
        >
          {badgeText}
        </div>
      ) : null}

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16 }}>
        {title ? (
          <div
            style={{
              ...clamp2,
              color:        '#fff',
              fontSize:     20,
              fontWeight:   700,
              lineHeight:   '24px',
              marginBottom: 4,
            }}
          >
            {title}
          </div>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {excerpt ? (
            <div
              style={{
                ...clamp2,
                flex:       1,
                color:      'rgba(255,255,255,0.85)',
                fontSize:   13,
                fontWeight: 500,
                lineHeight: '18px',
              }}
            >
              {excerpt}
            </div>
          ) : (
            <div style={{ flex: 1 }} />
          )}
          {/* Ionicons chevron-forward, 20px white, drawn on every tappable card. */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 5l7 7-7 7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/**
 * Truthful warnings about how this exact card will land, computed from
 * the same rules the server and the app apply. Shown beside the card so
 * a problem is visible at authoring time rather than discovered on a
 * phone after publishing.
 */
export function heroCardWarnings(input: {
  coverImageUrl?: string | null;
  title?:         string | null;
  excerpt?:       string | null;
  status?:        string;
  featureFrom?:   string;
  featureUntil?:  string;
}): string[] {
  const out: string[] = [];

  // listFeaturedCards requires status = published. Everything else about
  // the card can be perfect and it still will not ship.
  if (input.status && input.status !== 'published') {
    out.push(
      `This story is ${input.status.replace(/_/g, ' ')}, so it will not appear on the carousel yet. Only published stories are served to the apps.`,
    );
  }
  if (!input.coverImageUrl) {
    out.push('No cover image, so the slide shows the navy okada card above instead of a photo.');
  }
  if (!input.excerpt?.trim()) {
    out.push('No excerpt, so the card shows a title with empty space under it. The body text is never used on a card.');
  }
  // Rough two-line budget at 20px bold across a 296px text column.
  if ((input.title ?? '').length > 60) {
    out.push('The title is long enough to be cut off after two lines. Check the card above.');
  }
  if ((input.excerpt ?? '').length > 110) {
    out.push('The excerpt is long enough to be cut off after two lines. Check the card above.');
  }
  if (input.featureUntil && new Date(input.featureUntil) <= new Date()) {
    out.push('The "stop showing" time is already in the past, so this card will never appear.');
  }
  if (
    input.featureFrom && input.featureUntil &&
    new Date(input.featureFrom) >= new Date(input.featureUntil)
  ) {
    out.push('"Show from" is on or after "stop showing", so this card will never appear.');
  }
  return out;
}
