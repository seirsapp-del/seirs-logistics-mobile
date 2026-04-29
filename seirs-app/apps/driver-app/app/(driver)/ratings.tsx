import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { MOCK_DRIVER_RATINGS } from '@/constants/driverMockData';

export default function DriverRatingsScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { average, total, breakdown, recent } = MOCK_DRIVER_RATINGS;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>My Ratings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Hero */}
        <View style={[styles.heroCard, { backgroundColor: isDark ? '#1A1000' : '#FFFBEB', borderColor: '#FFBE0B30' }]}>
          <Text style={[styles.heroScore, { color: theme.text }]}>{average.toFixed(1)}</Text>
          <View style={styles.heroStars}>
            {[1, 2, 3, 4, 5].map(s => (
              <Ionicons key={s} name={s <= Math.round(average) ? 'star' : 'star-outline'} size={22} color="#FFBE0B" />
            ))}
          </View>
          <Text style={[styles.heroSub, { color: theme.textSecond }]}>Based on {total.toLocaleString()} ratings</Text>
        </View>

        {/* Breakdown */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Breakdown</Text>
          {[...breakdown].reverse().map(row => (
            <View key={row.stars} style={styles.barRow}>
              <View style={styles.barStarLabel}>
                <Ionicons name="star" size={12} color="#FFBE0B" />
                <Text style={[styles.barNum, { color: theme.textSecond }]}>{row.stars}</Text>
              </View>
              <View style={[styles.barTrack, { backgroundColor: theme.surfaceSecond }]}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.round(row.pct * 100)}%`, backgroundColor: '#FFBE0B' },
                  ]}
                />
              </View>
              <Text style={[styles.barPct, { color: theme.textThird }]}>{Math.round(row.pct * 100)}%</Text>
            </View>
          ))}
        </View>

        {/* Recent reviews */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Reviews</Text>
        {recent.map(r => (
          <View key={r.id} style={[styles.reviewCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
            <View style={styles.reviewTop}>
              <View style={[styles.reviewAvatar, { backgroundColor: theme.primary + '20' }]}>
                <Text style={[styles.reviewInitial, { color: theme.primary }]}>{r.customer.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.reviewCustomer, { color: theme.text }]}>{r.customer}</Text>
                <Text style={[styles.reviewDate, { color: theme.textThird }]}>{r.date}</Text>
              </View>
              <View style={styles.reviewStars}>
                {[1, 2, 3, 4, 5].map(s => (
                  <Ionicons key={s} name={s <= r.stars ? 'star' : 'star-outline'} size={13} color="#FFBE0B" />
                ))}
              </View>
            </View>
            {r.comment && (
              <Text style={[styles.reviewComment, { color: theme.textSecond }]}>"{r.comment}"</Text>
            )}
          </View>
        ))}

        {/* Tips */}
        <View style={[styles.tipsCard, { backgroundColor: isDark ? '#001020' : '#EFF6FF', borderColor: theme.primary + '30' }]}>
          <Ionicons name="bulb-outline" size={20} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.tipsTitle, { color: theme.text }]}>Tips to improve your rating</Text>
            {['Arrive on time', 'Handle packages with care', 'Be polite and professional', 'Keep your vehicle clean'].map(t => (
              <View key={t} style={styles.tipRow}>
                <Ionicons name="checkmark-circle-outline" size={14} color="#22C55E" />
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
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md },

  heroCard:  { alignItems: 'center', padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, gap: 8 },
  heroScore: { fontSize: 56, fontWeight: FontWeight.bold, letterSpacing: -2 },
  heroStars: { flexDirection: 'row', gap: 4 },
  heroSub:   { fontSize: FontSize.sm },

  card:      { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  cardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: 4 },

  barRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  barStarLabel:{ flexDirection: 'row', alignItems: 'center', gap: 3, width: 28 },
  barNum:      { fontSize: FontSize.xs },
  barTrack:    { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill:     { height: 8, borderRadius: 4 },
  barPct:      { width: 32, fontSize: FontSize.xs, textAlign: 'right' },

  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  reviewCard:    { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  reviewTop:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  reviewAvatar:  { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  reviewInitial: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  reviewCustomer:{ fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  reviewDate:    { fontSize: FontSize.xs, marginTop: 2 },
  reviewStars:   { flexDirection: 'row', gap: 2 },
  reviewComment: { fontSize: FontSize.sm, lineHeight: 20, fontStyle: 'italic' },

  tipsCard:  { flexDirection: 'row', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, alignItems: 'flex-start' },
  tipsTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: Spacing.sm },
  tipRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  tipText:   { fontSize: FontSize.sm },
});
