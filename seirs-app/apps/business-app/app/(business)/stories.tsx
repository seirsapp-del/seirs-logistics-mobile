import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Image,
  ActivityIndicator, RefreshControl, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Newspaper, ExternalLink } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { storiesApi, type StoryDTO } from '@/services/api';

/**
 * SEIRS Stories (founder 2026-08-12). The "Stories" chip on home used
 * to open a dead "coming soon" alert. It now shows the real
 * admin-published content: news, offers, promotions. Same source as the
 * marketing site, so publishing once puts it in both places, and each
 * story can be opened on the website for the full page.
 */
const WEBSITE = 'https://seirs-website.vercel.app';

const CATEGORY_LABEL: Record<string, string> = {
  news:           'News',
  press:          'Press',
  product_update: 'Product',
  guide:          'Guide',
  story:          'Story',
  impact:         'Impact',
  offer:          'Offer',
  promotion:      'Promotion',
};

export default function StoriesScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  const [items,      setItems]      = useState<StoryDTO[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState('');

  const load = useCallback(async () => {
    try {
      const res = await storiesApi.list(20);
      setItems(Array.isArray(res?.items) ? res.items : []);
      setError('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not load stories.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmtDate = (iso: string | null) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return ''; }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Stories &amp; Offers</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={theme.primary}
            />
          }
        >
          {error !== '' && (
            <Text style={[styles.empty, { color: theme.error }]}>{error}</Text>
          )}

          {!error && items.length === 0 && (
            <View style={styles.center}>
              <Newspaper size={34} color={theme.textThird} strokeWidth={1.5} />
              <Text style={[styles.empty, { color: theme.textSecond }]}>
                No stories yet. New offers and updates land here.
              </Text>
            </View>
          )}

          {items.map(story => (
            <Pressable
              key={story.id}
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}
              onPress={() => Linking.openURL(`${WEBSITE}/news/${story.slug}`)}
            >
              {story.coverImageUrl ? (
                <Image
                  source={{ uri: story.coverImageUrl.startsWith('http') ? story.coverImageUrl : `${WEBSITE}${story.coverImageUrl}` }}
                  style={styles.cover}
                />
              ) : (
                <View style={[styles.cover, { backgroundColor: theme.primary + '18', alignItems: 'center', justifyContent: 'center' }]}>
                  <Newspaper size={26} color={theme.primary} strokeWidth={1.5} />
                </View>
              )}
              <View style={styles.cardBody}>
                <View style={styles.metaRow}>
                  {story.category && (
                    <Text style={[styles.category, { color: theme.primary }]}>
                      {(CATEGORY_LABEL[story.category] ?? story.category).toUpperCase()}
                    </Text>
                  )}
                  <Text style={[styles.date, { color: theme.textThird }]}>{fmtDate(story.publishedAt)}</Text>
                </View>
                <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>{story.title}</Text>
                {story.excerpt && (
                  <Text style={[styles.excerpt, { color: theme.textSecond }]} numberOfLines={3}>{story.excerpt}</Text>
                )}
                <View style={styles.readRow}>
                  <Text style={[styles.readMore, { color: theme.accent }]}>Read the story</Text>
                  <ExternalLink size={12} color={theme.accent} strokeWidth={2} />
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn:  { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:    { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  center:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.xxl },
  content:  { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },
  empty:    { fontSize: FontSize.sm, textAlign: 'center', paddingHorizontal: Spacing.xl, lineHeight: 20 },
  card:     { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  cover:    { width: '100%', height: 140 },
  cardBody: { padding: Spacing.md, gap: 6 },
  metaRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  category: { fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1 },
  date:     { fontSize: FontSize.xs },
  cardTitle:{ fontSize: FontSize.base, fontWeight: FontWeight.bold, lineHeight: 21 },
  excerpt:  { fontSize: FontSize.sm, lineHeight: 19 },
  readRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  readMore: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
});
