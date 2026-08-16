import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, View, Dimensions, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { HomeHeroAnimated } from './HomeHeroAnimated';
import { HeroCardImage } from './HeroCardImage';
import { type HeroCard } from '@/constants/heroCards';
import { useHeroCards } from '@/hooks/use-hero-cards';

/**
 * Horizontal swipeable card stack: the Joyn / Netflix "featured cards"
 * pattern. Card 1 is the animated SEIRS okada hero (brand anchor); the
 * rest come from the HERO_CARDS constant in @/constants/heroCards.ts.
 *
 *   - Swipe left/right to page through
 *   - Auto-advances every 5 seconds
 *   - Pauses for 8 seconds when the user touches it
 *   - SEAMLESS infinite loop: when the auto-advance passes the last
 *     real card, it slides to a clone of card 1 placed at the end, then
 *     silently snaps back to the real card 1 (no visible backward
 *     scroll across all cards)
 *   - Dot indicator below shows current position (clone counts as card 1)
 *   - Tapping a card opens its article at /article/[id]
 *
 * PHASE-2 SWAP POINT: when the admin "Hero Cards" CMS lands, replace
 * the `HERO_CARDS` constant with `useHeroCardsFromBackend()` (fetch +
 * cache via the same pattern as use-rate-card.ts). No other component
 * change required.
 */

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PAGE_WIDTH      = SCREEN_WIDTH;                 // each FlatList item is full screen
const CARD_INNER_PAD  = Spacing.md;                   // padding INSIDE the page so card has even gutters
const AUTO_ADVANCE_MS = 5000;
const RESUME_AFTER_MS = 8000;

export function HeroCarousel() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const { t }  = useTranslation();

  // For seamless loop we append a clone of card[0] at the end. The
  // dot indicator + activeIndex always track the REAL card (clone is
  // invisible to the user). When the user/auto reaches the clone, we
  // silently snap back to real index 0.
  // Slides come from the admin CMS, with the built-in cards as the
  // offline/cold-start fallback (see hooks/use-hero-cards.ts).
  const cards = useHeroCards();
  const data = useMemo<HeroCard[]>(() => [...cards, cards[0]], [cards]);
  const REAL_COUNT = cards.length;

  const listRef = useRef<FlatList<HeroCard>>(null);
  // displayedIndex is what's visually showing (0..REAL_COUNT, where
  // REAL_COUNT is the clone). activeIndex is the dot indicator
  // (always 0..REAL_COUNT-1).
  const [displayedIndex, setDisplayedIndex] = useState(0);
  const activeIndex = displayedIndex >= REAL_COUNT ? 0 : displayedIndex;
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The CMS fetch lands a moment after mount and can change the slide
  // count. Snap back to the brand card so the index, the dots, and the
  // scroll offset cannot disagree (a stale index past the new end makes
  // scrollToIndex throw and freezes the auto-advance).
  useEffect(() => {
    setDisplayedIndex(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [cards]);

  // Auto-advance: uses displayedIndex (can hit the clone), then the
  // momentum-end handler silently jumps back to real 0 if needed.
  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      const next = displayedIndex + 1;
      // If next would overflow past the clone, do nothing (the clone
      // path will already have snapped us back to 0 by now).
      if (next > REAL_COUNT) return;
      try {
        listRef.current?.scrollToIndex({ index: next, animated: true });
      } catch { /* FlatList not ready on first mount: will retry next tick */ }
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(interval);
  }, [displayedIndex, paused, REAL_COUNT]);

  const onMomentumScrollEnd = useCallback((e: any) => {
    const offset = e.nativeEvent.contentOffset.x;
    const i = Math.round(offset / PAGE_WIDTH);

    if (i === REAL_COUNT) {
      // We've landed on the clone of card 1. Silently jump to real index
      // 0: the user sees the same card, no flicker, and the next
      // auto-advance picks up from index 0 → 1, looping cleanly.
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      setDisplayedIndex(0);
    } else if (i !== displayedIndex) {
      setDisplayedIndex(i);
    }
  }, [displayedIndex, REAL_COUNT]);

  // Pause the moment the user touches; resume after 8s of no interaction.
  const onTouchStart = useCallback(() => {
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);
  const onTouchEnd = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), RESUME_AFTER_MS);
  }, []);
  useEffect(() => () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  // Card press → opens the article view. Card 1 (the animated brand
  // hero) has no article, so it's non-tappable.
  const openArticle = useCallback((card: HeroCard) => {
    if (card.kind === 'animated') return;
    router.push({ pathname: '/(business)/article/[id]', params: { id: card.id } } as any);
  }, [router]);

  const renderCard = useCallback(({ item }: { item: HeroCard }) => {
    return (
      <View style={[styles.page, { width: PAGE_WIDTH, paddingHorizontal: CARD_INNER_PAD }]}>
        {item.kind === 'animated' ? (
          <HomeHeroAnimated tagline={t('home.heroTagline')} />
        ) : (
          <HeroCardImage
            imageUrl={item.imageUrl}
            badgeKey={item.badgeKey}
            badgeColor={item.badgeColor}
            titleKey={item.titleKey}
            descKey={item.descKey}
            badge={item.badge}
            title={item.title}
            desc={item.desc}
            onPress={() => openArticle(item)}
          />
        )}
      </View>
    );
  }, [t, openArticle]);

  return (
    <View>
      <FlatList
        ref={listRef}
        data={data}
        // Clone of card 0 shares its id, so append index to keep keys unique.
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={renderCard}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        decelerationRate="fast"
        snapToInterval={PAGE_WIDTH}
        snapToAlignment="start"
        getItemLayout={(_, index) => ({
          length: PAGE_WIDTH,
          offset: PAGE_WIDTH * index,
          index,
        })}
      />

      {/* Dot indicators: based on activeIndex (clone never lights up).
          Active dot is wider (pill) for modern feel. */}
      <View style={styles.dotsRow}>
        {cards.map((_, i) => {
          const isActive = i === activeIndex;
          return (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: isActive ? theme.primary : theme.border,
                  width: isActive ? 18 : 6,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page:    { justifyContent: 'center' },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
