/**
 * Hero carousel card data - drives the swipeable card stack on the home
 * screen. Card 1 is always the animated SEIRS brand hero (the okada);
 * cards 2-5 cycle through editable content.
 *
 * Tapping a (non-animated) card opens its article view at
 * `/article/[id]` - a full-screen scrollable view with the hero image,
 * the title + description, and a long-form body. The optional `ctaKey` /
 * `ctaRoute` render an action button at the bottom of the article so
 * the customer can act on it (Send a package, Open multi-stop, etc.).
 *
 * Until the admin "Hero Cards" CMS lands (Phase 2 - see
 * components/HeroCarousel.tsx for the swap point), this constant IS the
 * source of truth. Hot-edit a card here to change copy/image; reload to
 * see it.
 *
 * ── IMAGE SOURCES (for real-people-of-colour content) ──────────────────
 * The placeholders below use picsum.photos because it's reliable. For
 * launch content, swap to Black/Nigerian photos from:
 *
 *   - Nappy.co            https://nappy.co            (curated Black + Brown)
 *   - Pexels - Nigerian   https://www.pexels.com/search/nigerian/
 *   - Unsplash - Lagos    https://unsplash.com/s/photos/lagos
 *
 * All three are free for commercial use, no attribution required. Pick
 * a photo, right-click → "Copy image address" - paste into `imageUrl`.
 */

export type HeroCardKind = 'animated' | 'image';

export interface HeroCard {
  id:        string;
  kind:      HeroCardKind;
  // Image-card fields (ignored for kind === 'animated').
  imageUrl?: string;
  /** Short uppercase label rendered as a coloured pill on top-left. */
  badgeKey?: string;
  badgeColor?: string;
  titleKey?: string;
  descKey?:  string;
  /**
   * Article body - i18n key returning an array of strings. Each string
   * is one "block" rendered by <ArticleBody>. Use a tiny markdown DSL
   * for visual structure:
   *   "## Heading"          → h2 heading
   *   "### Subheading"      → h3 heading
   *   "- bullet"            → bulleted list item
   *   "1. item"             → ordered list item
   *   "> Quote text"        → pull quote
   *   "![caption](imgUrl)"  → inline image with optional caption
   *   anything else         → paragraph
   *
   * Adjacent `-` lines are grouped into one list automatically. Same
   * for `1.` lines.
   */
  bodyKey?:  string;
  /** Author or source attribution. Free text, shown in the meta row. */
  author?:    string;
  /** ISO 8601 publish date. Renders as a relative date ("2 days ago"). */
  publishedAt?: string;
  /** Optional CTA - kept on the shape for future inline use; the article
   *  view currently doesn't render a sticky CTA. */
  ctaKey?:    string;
  ctaRoute?:  string;
}

export const HERO_CARDS: HeroCard[] = [
  // ── Card 1: brand anchor (always first, animated okada) ──────────────
  {
    id:   'brand',
    kind: 'animated',
  },

  // ── Card 2: NEW OUTLET / PARTNER ─────────────────────────────────────
  {
    id:         'outlet-shoprite',
    kind:       'image',
    imageUrl:   'https://picsum.photos/seed/seirs-outlet/720/400',
    badgeKey:   'home.heroBadgeOutlet',
    badgeColor: '#FFBE0B',
    titleKey:   'home.heroCard2Title',
    descKey:    'home.heroCard2Desc',
    bodyKey:    'article.outletShopriteBody',
    author:     'SEIRS Partnerships',
    publishedAt:'2026-05-17T10:00:00Z',
  },

  // ── Card 3: WEEKLY TIP ───────────────────────────────────────────────
  {
    id:         'tip-schedule',
    kind:       'image',
    imageUrl:   'https://picsum.photos/seed/seirs-tip/720/400',
    badgeKey:   'home.heroBadgeTip',
    badgeColor: '#3A86FF',
    titleKey:   'home.heroCard3Title',
    descKey:    'home.heroCard3Desc',
    bodyKey:    'article.tipScheduleBody',
    author:     'SEIRS Team',
    publishedAt:'2026-05-18T09:00:00Z',
  },

  // ── Card 4: COMING SOON / NEW FEATURE ────────────────────────────────
  {
    id:         'feature-multistop',
    kind:       'image',
    imageUrl:   'https://picsum.photos/seed/seirs-feature/720/400',
    badgeKey:   'home.heroBadgeNew',
    badgeColor: '#FF6B00',
    titleKey:   'home.heroCard4Title',
    descKey:    'home.heroCard4Desc',
    bodyKey:    'article.featureMultistopBody',
    author:     'SEIRS Product',
    publishedAt:'2026-05-15T14:30:00Z',
  },

  // ── Card 5: PROMO / REFERRAL ─────────────────────────────────────────
  {
    id:         'referral',
    kind:       'image',
    imageUrl:   'https://picsum.photos/seed/seirs-referral/720/400',
    badgeKey:   'home.heroBadgePromo',
    badgeColor: '#22C55E',
    titleKey:   'home.heroCard5Title',
    descKey:    'home.heroCard5Desc',
    bodyKey:    'article.referralBody',
    author:     'SEIRS Team',
    publishedAt:'2026-05-19T08:00:00Z',
  },
];

/**
 * Find a card by ID - used by the article view to render the right
 * content. Returns undefined if the id is unknown (article screen
 * shows a "not found" state).
 */
export function findHeroCardById(id: string | undefined): HeroCard | undefined {
  if (!id) return undefined;
  return HERO_CARDS.find(c => c.id === id);
}
