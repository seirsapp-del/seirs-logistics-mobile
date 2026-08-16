import { useEffect, useState } from 'react';
import { storiesApi, type FeaturedCardDTO } from '@/services/api';
import { HERO_CARDS, type HeroCard } from '@/constants/heroCards';

/**
 * Home-carousel content (founder 2026-08-12).
 *
 * The slides after the animated okada used to be a hardcoded constant,
 * which meant a new promo needed an app release. They now come from the
 * same CMS that feeds the website: an admin writes the story once,
 * ticks "feature in app", and it appears here AND on seirs.com. Tapping
 * a slide opens the story in the app, with a link out to the full web
 * page.
 *
 * Fallback order, so the home screen is never blank:
 *   1. Featured stories from the backend
 *   2. The built-in HERO_CARDS (offline, cold start, nothing featured)
 *
 * Card 1 is always the animated brand hero, from either source.
 */

const BRAND_CARD: HeroCard = { id: 'brand', kind: 'animated' };

/** Category to pill colour. Brand family only, no purple. */
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

function toHeroCard(dto: FeaturedCardDTO): HeroCard {
  const badge = (dto.badge ?? dto.category ?? '').replace(/_/g, ' ');
  return {
    id:          `cms:${dto.slug}`,
    kind:        'image',
    imageUrl:    dto.coverImageUrl ?? undefined,
    // Raw text, not i18n keys: the CMS is already the authored copy.
    badge:       badge || undefined,
    badgeColor:  BADGE_COLORS[dto.category ?? ''] ?? '#3A7BD5',
    title:       dto.title,
    desc:        dto.excerpt ?? undefined,
    publishedAt: dto.publishedAt ?? undefined,
  };
}

/**
 * Fisher-Yates. Every story after the brand card gets an equal chance at
 * the second slot (founder 2026-08-13: "it should be auto shuffle").
 * Without this the newest story always shows first and the oldest is
 * seen by nobody who does not swipe, which wastes the older ones.
 */
function shuffle<T>(input: T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function useHeroCards() {
  // Built-in cards are shuffled too, so even the offline fallback does
  // not always open on the same slide. The okada stays pinned first: it
  // is the brand anchor, not one of the rotating stories.
  const [cards, setCards] = useState<HeroCard[]>(
    () => [HERO_CARDS[0], ...shuffle(HERO_CARDS.slice(1))],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res   = await storiesApi.featured(6);
        const items = Array.isArray(res?.items) ? res.items : [];
        // Nothing featured is a normal editorial state, not a failure:
        // keep the built-in cards rather than showing one lonely okada.
        if (!cancelled && items.length > 0) {
          setCards([BRAND_CARD, ...shuffle(items.map(toHeroCard))]);
        }
      } catch {
        /* offline or backend down: built-in cards already showing */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return cards;
}
