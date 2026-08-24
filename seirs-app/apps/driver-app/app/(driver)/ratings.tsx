import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft, Star, Lightbulb, CheckCircle, AlertTriangle,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { driversApi } from '@/services/api';

const RATING_THRESHOLD = 3.5;

const TIPS = [
  'Arrive on time: punctuality boosts your score most',
  'Handle packages carefully and with both hands',
  'Be polite, professional, and greet customers warmly',
  'Keep your vehicle clean inside and out',
  'Confirm delivery with a clear proof-of-delivery photo',
];

export default function DriverRatingsScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  // Real ratings from GET /drivers/me/ratings (production audit
  // 2026-08-10: this screen used to show the same mock numbers to
  // every driver).
  const [data,    setData]    = useState<Awaited<ReturnType<typeof driversApi.myRatings>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    driversApi.myRatings()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const average = Number(data?.average ?? 0);
  const total   = Number(data?.total ?? 0);
  const breakdown = [5, 4, 3, 2, 1].map(stars => ({
    stars,
    pct: total > 0 ? (Number(data?.breakdown?.[stars] ?? 0) / total) : 0,
  }));
  const recent = (data?.recent ?? []).map(r => ({
    id:       r.id,
    customer: `Trip ${r.trackingCode ?? ''}`.trim(),
    date:     r.deliveredAt ? new Date(r.deliveredAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
    stars:    r.rating,
    comment:  r.comment,
  }));

  const belowThreshold = total > 0 && average < RATING_THRESHOLD;

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>My Ratings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Warning banner: shown below 3.5 */}
        {belowThreshold && (
          <View style={[styles.warnBanner, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}>
            <AlertTriangle size={20} color="#EF4444" strokeWidth={1.75} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.warnTitle, { color: '#EF4444' }]}>Rating below minimum threshold</Text>
              <Text style={[styles.warnBody, { color: theme.textSecond }]}>
                Your average ({average.toFixed(1)}) is below {RATING_THRESHOLD}. Sustained low ratings may result in
                account review. See tips below to improve.
              </Text>
            </View>
          </View>
        )}

        {/* Hero score */}
        <View style={[styles.heroCard, {
          backgroundColor: isDark ? '#1A1000' : '#FFFBEB',
          borderColor: belowThreshold ? '#EF444430' : '#FFBE0B30',
        }]}>
          <Text style={[styles.heroScore, { color: belowThreshold ? '#EF4444' : theme.text }]}>
            {total > 0 ? average.toFixed(1) : '-'}
          </Text>
          <View style={styles.heroStars}>
            {[1, 2, 3, 4, 5].map(s => (
              <Star key={s} size={22} color="#FFBE0B" fill={total > 0 && s <= Math.round(average) ? '#FFBE0B' : 'transparent'} strokeWidth={1.75} />
            ))}
          </View>
          <Text style={[styles.heroSub, { color: theme.textSecond }]}>
            {total > 0 ? `Based on ${total.toLocaleString()} rating${total === 1 ? '' : 's'}` : 'No ratings yet. Complete deliveries to earn your first.'}
          </Text>
        </View>

        {/* Breakdown */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Breakdown</Text>
          {breakdown.map(row => (
            <View key={row.stars} style={styles.barRow}>
              <View style={styles.barStarLabel}>
                <Star size={12} color="#FFBE0B" fill="#FFBE0B" strokeWidth={0} />
                <Text style={[styles.barNum, { color: theme.textSecond }]}>{row.stars}</Text>
              </View>
              <View style={[styles.barTrack, { backgroundColor: theme.surfaceSecond }]}>
                <View style={[styles.barFill, { width: `${Math.round(row.pct * 100)}%`, backgroundColor: '#FFBE0B' }]} />
              </View>
              <Text style={[styles.barPct, { color: theme.textThird }]}>{Math.round(row.pct * 100)}%</Text>
            </View>
          ))}
        </View>

        {/* Recent reviews */}
        {recent.length > 0 && <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Reviews</Text>}
        {recent.map(r => (
          <View key={r.id} style={[styles.reviewCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
            <View style={styles.reviewTop}>
              {/* D-6.14: this printed r.customer.charAt(0) where r.customer is
                  always "Trip SRS-XXXX", so every single review avatar read
                  "T". GET /drivers/me/ratings returns no name (by design for
                  rides), so show the score instead of a fake initial. */}
              <View style={[styles.reviewAvatar, { backgroundColor: theme.primary + '20' }]}>
                <Star size={16} color={theme.primary} fill={theme.primary} strokeWidth={1} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.reviewCustomer, { color: theme.text }]}>{r.customer}</Text>
                <Text style={[styles.reviewDate,     { color: theme.textThird }]}>{r.date}</Text>
              </View>
              <View style={styles.reviewStars}>
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} size={13} color="#FFBE0B" fill={s <= r.stars ? '#FFBE0B' : 'transparent'} strokeWidth={1} />
                ))}
              </View>
            </View>
            {r.comment && (
              <Text style={[styles.reviewComment, { color: theme.textSecond }]}>"{r.comment}"</Text>
            )}
          </View>
        ))}

        {/* Tips */}
        <View style={[styles.tipsCard, {
          backgroundColor: isDark ? '#001020' : '#EFF6FF',
          borderColor: theme.primary + '30',
        }]}>
          <Lightbulb size={20} color={theme.primary} strokeWidth={1.75} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.tipsTitle, { color: theme.text }]}>Tips to improve your rating</Text>
            {TIPS.map(t => (
              <View key={t} style={styles.tipRow}>
                <CheckCircle size={14} color="#16A34A" strokeWidth={1.75} />
                <Text style={[styles.tipText, { color: theme.textSecond }]}>{t}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  content: { padding: Spacing.md, gap: Spacing.md },

  warnBanner: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, alignItems: 'flex-start' },
  warnTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.bold as any, marginBottom: 4 },
  warnBody:   { fontSize: FontSize.sm, lineHeight: 20 },

  heroCard:  { alignItems: 'center', padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, gap: 8 },
  heroScore: { fontSize: 56, fontWeight: FontWeight.bold as any, letterSpacing: -2 },
  heroStars: { flexDirection: 'row', gap: 4 },
  heroSub:   { fontSize: FontSize.sm },

  card:      { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  cardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any, marginBottom: 4 },

  barRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  barStarLabel: { flexDirection: 'row', alignItems: 'center', gap: 3, width: 28 },
  barNum:       { fontSize: FontSize.xs },
  barTrack:     { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill:      { height: 8, borderRadius: 4 },
  barPct:       { width: 32, fontSize: FontSize.xs, textAlign: 'right' },

  sectionTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  reviewCard:    { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  reviewTop:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  reviewAvatar:  { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  reviewCustomer:{ fontSize: FontSize.base, fontWeight: FontWeight.semibold as any },
  reviewDate:    { fontSize: FontSize.xs, marginTop: 2 },
  reviewStars:   { flexDirection: 'row', gap: 2 },
  reviewComment: { fontSize: FontSize.sm, lineHeight: 20, fontStyle: 'italic' },

  tipsCard:  { flexDirection: 'row', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, alignItems: 'flex-start' },
  tipsTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any, marginBottom: Spacing.sm },
  tipRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginTop: 4 },
  tipText:   { fontSize: FontSize.sm, flex: 1, lineHeight: 20 },
});
