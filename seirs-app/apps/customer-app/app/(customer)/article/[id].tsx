import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Image, StatusBar, Share,
  Animated as RNAnimated, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { ArticleBody } from '@/components/ArticleBody';
import { findHeroCardById, HERO_CARDS, type HeroCard } from '@/constants/heroCards';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { calcReadingMinutes, relativeDate } from '@/utils/articleMeta';

/**
 * Article view: opened when a customer taps a hero carousel card.
 * Tier 3 reading experience:
 *
 *   - Reading progress bar at the very top (animates with scroll)
 *   - Hero image (~280px) with floating back, share, bookmark buttons
 *   - Badge pill + bold title
 *   - Meta row: author · relative date · X min read
 *   - Lede (description)
 *   - Rich body via <ArticleBody> (parses headings, lists, quotes,
 *     inline images from a flat string-array i18n key)
 *   - "More from SEIRS" horizontal scroll of other articles at the bottom
 *   - No sticky CTA: intentionally a reading experience, not a funnel
 *
 * Data source: HERO_CARDS constant for now. When the CMS lands (Phase 2),
 * swap `findHeroCardById` for a backend fetch + swap `HERO_CARDS` (for
 * "More from SEIRS") for a backend query.
 */

const HERO_HEIGHT = 280;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MORE_CARD_WIDTH = 220;

export default function ArticleScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { t }   = useTranslation();
  const insets  = useSafeAreaInsets();
  const { id }  = useLocalSearchParams<{ id: string }>();
  const { isBookmarked, toggle: toggleBookmark } = useBookmarks();

  const card = findHeroCardById(id);

  // Body is an array of strings (one per "block": see ArticleBody for
  // the DSL). returnObjects:true lets a single key hold a list.
  const body = card?.bodyKey
    ? (t(card.bodyKey, { returnObjects: true, defaultValue: [] }) as string[])
    : [];
  const paragraphs = Array.isArray(body) ? body : [String(body)];

  // Meta: author + relative date + reading time. All from i18n so
  // locale switches reflect live.
  const readMinutes = useMemo(() => calcReadingMinutes(paragraphs), [paragraphs]);
  const relDate     = useMemo(() => relativeDate(card?.publishedAt, t), [card?.publishedAt, t]);

  // "More from SEIRS": every other image-kind card. Stable order from
  // the HERO_CARDS array.
  const moreArticles = useMemo<HeroCard[]>(
    () => HERO_CARDS.filter(c => c.id !== id && c.kind === 'image'),
    [id],
  );

  // Reading-progress bar: driven by ScrollView's onScroll. Width
  // animates 0 → 1 based on (scrollY / scrollableHeight).
  const scrollY    = useRef(new RNAnimated.Value(0)).current;
  const [contentH, setContentH] = useState(1);
  const [layoutH,  setLayoutH]  = useState(1);
  const scrollable = Math.max(1, contentH - layoutH);
  const progressWidth = scrollY.interpolate({
    inputRange:  [0, scrollable],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  // Not-found state: defensive (e.g. an article id removed from the
  // CMS while a customer has the URL deep-linked).
  if (!card) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.notFoundWrap}>
          <Ionicons name="document-text-outline" size={48} color={theme.textThird} />
          <Text style={[styles.notFoundTitle, { color: theme.text }]}>{t('article.notFoundTitle')}</Text>
          <Text style={[styles.notFoundDesc, { color: theme.textSecond }]}>{t('article.notFoundDesc')}</Text>
          <Button label={t('common.back')} onPress={() => router.back()} style={{ marginTop: Spacing.lg }} />
        </View>
      </SafeAreaView>
    );
  }

  const bookmarked = isBookmarked(card.id);

  const handleShare = async () => {
    try {
      const title = card.titleKey ? t(card.titleKey) : 'SEIRS';
      const desc  = card.descKey  ? t(card.descKey)  : '';
      // Until deep links are wired, a richer text-only share gets the
      // gist across in WhatsApp / Twitter / etc. URL placeholder kept
      // for the future when articles are reachable by link.
      await Share.share({
        title,
        message: `${title}${desc ? `\n\n${desc}` : ''}\n\nvia SEIRS`,
      });
    } catch { /* user cancelled */ }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" />

      {/* ── Reading progress bar: pinned to the top edge of the safe area */}
      <View style={[styles.progressTrack, { paddingTop: insets.top }]} pointerEvents="none">
        <RNAnimated.View
          style={[
            styles.progressBar,
            { width: progressWidth, backgroundColor: theme.primary },
          ]}
        />
      </View>

      <RNAnimated.ScrollView
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={RNAnimated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        onContentSizeChange={(_, h) => setContentH(h)}
        onLayout={e => setLayoutH(e.nativeEvent.layout.height)}
      >
        {/* ── Hero image with floating action buttons over it ─────────── */}
        <View style={styles.heroWrap}>
          {card.imageUrl ? (
            <Image source={{ uri: card.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={isDark ? ['#1C2128', '#0D1117'] : ['#0F2B4C', '#1A3A63']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[StyleSheet.absoluteFill, { height: 130 }]}
          />
          <SafeAreaView edges={['top']} style={styles.heroOverlay}>
            <Pressable
              style={[styles.iconBtn, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </Pressable>

            <View style={styles.heroOverlayRight}>
              <Pressable
                style={[styles.iconBtn, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
                onPress={() => toggleBookmark(card.id)}
                accessibilityRole="button"
                accessibilityLabel={t(bookmarked ? 'article.bookmarkRemove' : 'article.bookmarkAdd')}
              >
                <Ionicons
                  name={bookmarked ? 'bookmark' : 'bookmark-outline'}
                  size={20}
                  color="#fff"
                />
              </Pressable>
              <Pressable
                style={[styles.iconBtn, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
                onPress={handleShare}
                accessibilityRole="button"
                accessibilityLabel={t('article.share')}
              >
                <Ionicons name="share-outline" size={20} color="#fff" />
              </Pressable>
            </View>
          </SafeAreaView>
        </View>

        {/* ── Article header ───────────────────────────────────────────── */}
        <View style={styles.headerWrap}>
          {card.badgeKey ? (
            <View style={[styles.badge, { backgroundColor: card.badgeColor ?? theme.accent }]}>
              <Text style={styles.badgeText}>{t(card.badgeKey)}</Text>
            </View>
          ) : null}

          {card.titleKey ? (
            <Text style={[styles.title, { color: theme.text }]}>{t(card.titleKey)}</Text>
          ) : null}

          {/* Meta row: author · relative date · X min read */}
          <View style={styles.metaRow}>
            {card.author ? (
              <Text style={[styles.metaText, { color: theme.textSecond }]}>{card.author}</Text>
            ) : null}
            {card.author && relDate ? <MetaDot color={theme.textThird} /> : null}
            {relDate ? (
              <Text style={[styles.metaText, { color: theme.textSecond }]}>{relDate}</Text>
            ) : null}
            {(card.author || relDate) ? <MetaDot color={theme.textThird} /> : null}
            <Text style={[styles.metaText, { color: theme.textSecond }]}>
              {t('article.minRead', { n: readMinutes })}
            </Text>
          </View>

          {card.descKey ? (
            <Text style={[styles.lede, { color: theme.textSecond }]}>{t(card.descKey)}</Text>
          ) : null}
        </View>

        {/* ── Article body (rich) ──────────────────────────────────────── */}
        <View style={styles.bodyWrap}>
          {paragraphs.length === 0 ? (
            <Text style={[styles.bodyEmpty, { color: theme.textSecond }]}>
              {t('article.bodyEmpty')}
            </Text>
          ) : (
            <ArticleBody body={paragraphs} />
          )}
        </View>

        {/* ── More from SEIRS ──────────────────────────────────────────── */}
        {moreArticles.length > 0 ? (
          <View style={styles.moreWrap}>
            <Text style={[styles.moreHeading, { color: theme.text }]}>
              {t('article.moreFromSeirs')}
            </Text>
            <RNAnimated.ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.moreScrollContent}
            >
              {moreArticles.map(c => (
                <MoreCard
                  key={c.id}
                  card={c}
                  width={MORE_CARD_WIDTH}
                  onPress={() => router.replace({ pathname: '/(customer)/article/[id]', params: { id: c.id } } as any)}
                  t={t}
                  theme={theme}
                />
              ))}
            </RNAnimated.ScrollView>
          </View>
        ) : null}
      </RNAnimated.ScrollView>
    </View>
  );
}

// Small dot separator used in the meta row.
function MetaDot({ color }: { color: string }) {
  return <Text style={{ color, fontSize: FontSize.xs, marginHorizontal: 2 }}>·</Text>;
}

// One "More from SEIRS" card: smaller version of HeroCardImage.
function MoreCard({
  card, width, onPress, t, theme,
}: {
  card:   HeroCard;
  width:  number;
  onPress: () => void;
  t:      ReturnType<typeof useTranslation>['t'];
  theme:  (typeof Colors)[keyof typeof Colors];
}) {
  return (
    <Pressable onPress={onPress} style={[styles.moreCard, { width, backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
      {card.imageUrl ? (
        <Image source={{ uri: card.imageUrl }} style={styles.moreImage} resizeMode="cover" />
      ) : (
        <View style={[styles.moreImage, { backgroundColor: theme.surfaceSecond }]} />
      )}
      <View style={styles.moreContent}>
        {card.badgeKey ? (
          <View style={[styles.moreBadge, { backgroundColor: card.badgeColor ?? theme.accent }]}>
            <Text style={styles.moreBadgeText}>{t(card.badgeKey)}</Text>
          </View>
        ) : null}
        <Text style={[styles.moreTitle, { color: theme.text }]} numberOfLines={2}>
          {card.titleKey ? t(card.titleKey) : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Progress bar overlay: sits at very top of safe area.
  progressTrack: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 100,
  },
  progressBar: {
    height: 3,
  },

  heroWrap:    { height: HERO_HEIGHT, width: '100%', overflow: 'hidden' },
  heroOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
    zIndex: 10,
  },
  heroOverlayRight: { flexDirection: 'row', gap: Spacing.sm },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },

  headerWrap: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.full,
  },
  badgeText: {
    color: '#0F2B4C',
    fontSize: FontSize.xs, fontWeight: FontWeight.bold,
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, lineHeight: 32 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metaText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  lede:     { fontSize: FontSize.md, fontWeight: FontWeight.medium, lineHeight: 24, marginTop: Spacing.xs },

  bodyWrap: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  bodyEmpty: { fontSize: FontSize.base, fontStyle: 'italic' },

  moreWrap: {
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(127,127,127,0.15)',
  },
  moreHeading: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  moreScrollContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  moreCard: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  moreImage: { width: '100%', height: 110 },
  moreContent: {
    padding: Spacing.sm,
    gap: 6,
  },
  moreBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: Radius.full,
  },
  moreBadgeText: {
    color: '#0F2B4C',
    fontSize: 9, fontWeight: FontWeight.bold,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  moreTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    lineHeight: 18,
  },

  notFoundWrap: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: Spacing.xl, gap: Spacing.sm,
  },
  notFoundTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, marginTop: Spacing.sm },
  notFoundDesc:  { fontSize: FontSize.base, textAlign: 'center', lineHeight: 22 },
});
