import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { useColors, useTheme } from '@/context/ThemeContext';
import { FontWeight, Shadows } from '@/constants/theme';
import { businessApi } from '@/services/api';
import { tx } from '@/i18n/tx';

/**
 * Redeem, for business accounts.
 *
 * The customer app's Redeem screen exists and the business app had nothing
 * behind its Redeem button (founder 2026-09-05: "the business app should
 * have those screens as well").
 *
 * What it deliberately does NOT repeat: the points chart and the recent
 * points list. Both sit on the Wallet tab one tap away, and the customer app
 * shows them twice, which is the duplication already flagged there. This
 * screen answers the one question the tab cannot: what can I take, how close
 * am I, and how do I earn more.
 */

/*
 * The catalogue, with `live` telling the truth.
 *
 * Parcel cover is listed because the customer app lists it and a sender
 * should see what is coming, but the server refuses it and leaves the points
 * untouched, so it is shown as unavailable rather than as a button that
 * errors.
 */
const REDEMPTIONS = [
  { key: 'insurance',     icon: 'Shield' as const, label: '₦500 parcel cover', desc: 'Cover a single delivery up to ₦50,000', cost: 200,  live: false },
  { key: 'discount_500',  icon: 'Gift'   as const, label: '₦500 off',          desc: '₦500 off your next booking',            cost: 500,  live: true  },
  { key: 'free_delivery', icon: 'Star'   as const, label: 'Free delivery',     desc: 'One booking covered up to the reward cap', cost: 1000, live: true  },
];

const HOW_TO_EARN = [
  { pts: '10 pts',  what: 'per ₦1,000 spent on a delivery' },
  { pts: '+5 pts',  what: 'bonus when you pay by bank transfer' },
  { pts: '200 pts', what: 'per business you refer who completes a delivery' },
  { pts: '50 pts',  what: 'bonus on your 5th delivery each month' },
];

export default function BusinessRewardsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { isDark } = useTheme();
  const router = useRouter();

  const [loyalty, setLoyalty] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    businessApi.loyalty()
      .then(setLoyalty)
      .catch(() => setLoyalty(null))
      .finally(() => setLoading(false));
  }, []);

  const points     = Number(loyalty?.points ?? 0);
  const tier       = loyalty?.tier ?? 'Bronze';
  const nextTierAt = loyalty?.nextTierAt ?? null;

  // The metals the tier pill uses everywhere else in the product.
  const TIER_METAL: Record<string, string> = {
    bronze: '#CD7F32', silver: '#C0C0C0', gold: '#FFD700', platinum: '#E5E4E2',
  };
  const metal = TIER_METAL[String(tier).toLowerCase()] ?? '#FFFFFF';

  const toNext = nextTierAt ? Math.max(nextTierAt - points, 0) : 0;
  const pct    = nextTierAt ? Math.min(Math.round((points / nextTierAt) * 100), 100) : 100;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Icon name="ArrowLeft" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{tx('auto.rewards.rewards', 'Rewards')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={isDark ? ['#0A1F38', '#16406E'] : ['#0F2B4C', '#1a3a5c']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.hero, Shadows.sm]}
        >
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>{tx('auto.rewards.yourPoints', 'Your points')}</Text>
              <Text style={styles.heroBig}>{loading ? '—' : points.toLocaleString()}</Text>
            </View>
            <View style={[styles.tierPill, { backgroundColor: metal + '2E', borderColor: metal + '99' }]}>
              <Icon name="Star" size={14} color={metal} />
              <Text style={[styles.tierPillText, { color: metal }]}>{tier}</Text>
            </View>
          </View>

          {/*
            Progress to the next tier: the one thing the Wallet tab does not
            say. A balance answers "how many", this answers "how close", and
            without it Bronze is a label rather than a position.
          */}
          {!!nextTierAt && (
            <>
              <View style={styles.progressTop}>
                <Text style={styles.progressText}>{toNext.toLocaleString()} pts to the next tier</Text>
                <Text style={styles.progressText}>{pct}%</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%` }]} />
              </View>
            </>
          )}
        </LinearGradient>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{tx('auto.rewards.redeemYourPoints', 'Redeem your points')}</Text>
        {REDEMPTIONS.map((r) => {
          const afford = r.live && points >= r.cost;
          return (
            <View
              key={r.key}
              style={[styles.row, {
                backgroundColor: colors.surface,
                borderColor: afford ? colors.primary : colors.border,
              }]}
            >
              <View style={[styles.rowIcon, { backgroundColor: colors.background }]}>
                <Icon name={r.icon} size={18} color={afford ? colors.primary : colors.textThird} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{r.label}</Text>
                <Text style={[styles.rowSub, { color: colors.textSecond }]}>{r.desc}</Text>
                <Text style={[styles.rowCost, { color: colors.textThird }]}>
                  {r.cost.toLocaleString()} pts
                  {!r.live ? ' · Not available yet' : ''}
                </Text>
              </View>
              {r.live && (
                <Text style={[styles.rowState, { color: afford ? colors.primary : colors.textThird }]}>
                  {afford ? 'Ready' : (r.cost - points).toLocaleString() + ' more'}
                </Text>
              )}
            </View>
          );
        })}

        {/*
          Where redeeming actually happens. A reward attaches to a booking
          that exists and has not been paid for, so this screen sends them to
          the list rather than pretending it can apply one to nothing.
        */}
        <Pressable
          onPress={() => router.navigate('/(business)/(tabs)/deliveries' as any)}
          style={[styles.cta, { borderColor: colors.primary }]}
        >
          <Text style={[styles.ctaText, { color: colors.primary }]}>{tx('auto.rewards.openAnUnpaidBookingTo', 'Open an unpaid booking to redeem')}</Text>
          <Icon name="ArrowRight" size={16} color={colors.primary} />
        </Pressable>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{tx('auto.rewards.howToEarn', 'How to earn')}</Text>
          {HOW_TO_EARN.map((h) => (
            <View key={h.pts} style={styles.earnRow}>
              <Text style={[styles.earnPts, { color: colors.primary }]}>{h.pts}</Text>
              <Text style={[styles.earnWhat, { color: colors.textSecond }]}>{h.what}</Text>
            </View>
          ))}
          <Text style={[styles.fine, { color: colors.textThird }]}>
            Points expire 24 months after they are earned. Your tier is based on the points
            earned in the last 12 months.
          </Text>
        </View>

        {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: FontWeight.bold },

  hero:      { margin: 16, borderRadius: 18, padding: 18, gap: 12 },
  heroTop:   { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  heroBig:   { color: '#fff', fontSize: 36, fontWeight: '900' },
  tierPill:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  tierPillText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },

  progressTop:  { flexDirection: 'row', justifyContent: 'space-between' },
  progressText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: 3, backgroundColor: '#fff' },

  sectionTitle: { fontSize: 16, fontWeight: '700', marginHorizontal: 16, marginBottom: 12 },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  rowIcon:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowSub:   { fontSize: 12, marginTop: 2 },
  rowCost:  { fontSize: 11, fontWeight: '700', marginTop: 4 },
  rowState: { fontSize: 11, fontWeight: '700' },

  cta:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginTop: 4, marginBottom: 18, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  ctaText: { fontSize: 14, fontWeight: '700' },

  card:      { marginHorizontal: 16, borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  earnRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  earnPts:   { fontSize: 13, fontWeight: '800', minWidth: 62 },
  earnWhat:  { flex: 1, fontSize: 13, lineHeight: 18 },
  fine:      { fontSize: 11, lineHeight: 16, marginTop: 2 },
});
