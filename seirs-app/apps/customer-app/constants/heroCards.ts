/**
 * Hero carousel card data - drives the swipeable card stack on the home
 * screen. Card 1 is always the animated SEIRS brand hero (the okada);
 * cards 2-5 cycle through editable content.
 *
 * Tapping a (non-animated) card opens its article view at
 * `/article/[id]` - a full-screen scrollable view with the hero image,
 * the title + description, and a long-form body. There is no sticky CTA:
 * an article ends with its own closing line, which is where the "Open
 * Send a package" sentence lives.
 *
 * As of 2026-08-12 the admin CMS drives this carousel: any article
 * ticked "feature in app" becomes a slide (see hooks/use-hero-cards.ts).
 * The constant below is now the FALLBACK, shown when the device is
 * offline, on cold start before the fetch lands, or when no story is
 * currently featured. Keep it evergreen: no dated promos here, since
 * changing it needs an app release.
 *
 * ── NO PLACEHOLDER IMAGES HERE. DELIBERATE. ───────────────────────────
 * These cards carried picsum.photos URLs, which serve a RANDOM stock
 * photo per seed. In testing on 2026-08-12/13 that produced a snowy
 * pine forest captioned "Now delivering from Shoprite Ikeja", and then
 * a beach of walruses under a referral offer. Funny in a dev build,
 * brand damage in production.
 *
 * With no imageUrl the card renders SEIRS navy, which is on-brand and
 * says nothing false. Any real artwork belongs in the CMS, where it can
 * be changed without an app release. Do not reintroduce a random-image
 * service here.
 *
 * For real launch photography, Black and Nigerian sources:
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
   * Raw (already-authored) text, used by CMS-sourced cards where the
   * copy comes from the admin dashboard rather than a translation
   * file. Takes precedence over the *Key fields when present.
   */
  badge?:    string;
  title?:    string;
  desc?:     string;
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
    badgeKey:   'home.heroBadgeOutlet',
    badgeColor: '#FFBE0B',
    titleKey:   'home.heroCard2Title',
    descKey:    'home.heroCard2Desc',
    // Body rewritten evergreen 2026-08-24. It used to name Shoprite, Spar
    // and specific branches with partnership claims, and carried a dated
    // "25% off this week" promo that was three months stale. This file is
    // the OFFLINE FALLBACK and only changes with an app release, so nothing
    // dated or contractual belongs in it.
    bodyKey:    'article.outletPickupBody',
    author:     'SEIRS Team',
    publishedAt:'2026-05-17T10:00:00Z',
  },

  // ── Card 3: WEEKLY TIP ───────────────────────────────────────────────
  {
    id:         'tip-schedule',
    kind:       'image',
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
