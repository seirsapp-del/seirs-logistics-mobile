import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { loyaltyApi, type LoyaltyEntry, type LoyaltyTier } from '@/services/api';

/**
 * Loyalty Points — McDonald's-style non-monetary rewards.
 *
 * Per docs/payments-spec.md §⑤:
 *   - Customers earn points for paying for deliveries (10 pts per ₦1,000),
 *     bank-transfer payments (+5 bonus), monthly streaks (+50 every 5th
 *     delivery in a month), referrals (+200 each, capped 10/mo).
 *   - Tier multiplier (Bronze 1× → Silver 1.25× → Gold 1.5× → Platinum 2×)
 *     based on rolling 12-month earned points.
 *   - Redemption options: ₦500 off, free delivery, priority dispatch,
 *     insurance upgrade.
 *   - Points are NOT money. They have no NGN face value, are not
 *     transferable, expire after 24 months of inactivity.
 */
const TIER_COLORS: Record<LoyaltyTier, string> = {
  bronze:   '#CD7F32',
  silver:   '#C0C0C0',
  gold:     '#FFD700',
  platinum: '#E5E4E2',
};

const TIER_NEXT: Record<LoyaltyTier, { name: string; threshold: number } | null> = {
  bronze:   { name: 'Silver',   threshold: 1000  },
  silver:   { name: 'Gold',     threshold: 5000  },
  gold:     { name: 'Platinum', threshold: 15000 },
  platinum: null,
};

const REDEMPTIONS: Array<{
  id:    'discount_500' | 'free_delivery' | 'priority' | 'insurance';
  title: string;
  desc:  string;
  cost:  number;
  icon:  any;
}> = [
  { id: 'discount_500',  title: '₦500 off',           desc: 'Discount on your next delivery',         cost: 500,  icon: 'pricetag' },
  { id: 'free_delivery', title: 'Free delivery',      desc: 'Standard delivery up to 5 km, free',     cost: 1000, icon: 'gift'     },
  { id: 'priority',      title: 'Priority dispatch',  desc: 'Skip the queue on your next delivery',   cost: 300,  icon: 'flash'    },
  { id: 'insurance',     title: 'Insurance upgrade',  desc: '₦50,000 cover for one delivery',         cost: 200,  icon: 'shield'   },
];

export default function LoyaltyScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const [balance,  setBalance]  = useState(0);
  const [tier,     setTier]     = useState<LoyaltyTier>('bronze');
  const [history,  setHistory]  = useState<LoyaltyEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [redeeming, setRedeeming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await loyaltyApi.balance();
      setBalance(res.balance);
      setTier(res.tier);
      setHistory(res.history);
    } catch (e: any) {
      // ok to silently 0 — better than blocking the screen
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleRedeem = (r: typeof REDEMPTIONS[number]) => {
    if (balance < r.cost) {
      Alert.alert('Not enough points', `You have ${balance} pts. ${r.title} costs ${r.cost} pts.`);
      return;
    }
    Alert.alert(
      `Redeem ${r.title}?`,
      `${r.desc}. Costs ${r.cost} points. Will be available on your next delivery.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem', style: 'default',
          onPress: async () => {
            setRedeeming(r.id);
            try {
              const res = await loyaltyApi.redeem(r.id);
              setBalance(res.newBalance);
              await load();
              Alert.alert('Redeemed', `${r.title} unlocked. New balance: ${res.newBalance} pts.`);
            } catch (e: any) {
              Alert.alert('Redemption failed', e?.message ?? 'Try again later.');
            } finally {
              setRedeeming(null);
            }
          },
        },
      ],
    );
  };

  const next = TIER_NEXT[tier];
  // For progress bar — earned points (positive entries only) in the last year.
  const yearlyEarned = history.filter(h => h.delta > 0).reduce((s, h) => s + h.delta, 0);
  const progressPct = next
    ? Math.min(100, Math.round((yearlyEarned / next.threshold) * 100))
    : 100;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Rewards</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Hero balance card */}
          <View style={[styles.heroCard, { backgroundColor: theme.primary }]}>
            <View style={[styles.tierBadge, { backgroundColor: TIER_COLORS[tier] }]}>
              <Text style={styles.tierBadgeText}>{tier.toUpperCase()}</Text>
            </View>
            <Text style={styles.heroLabel}>Your points</Text>
            <Text style={styles.heroAmount}>{balance.toLocaleString()}</Text>

            {next && (
              <>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
                </View>
                <Text style={styles.progressLabel}>
                  {Math.max(0, next.threshold - yearlyEarned).toLocaleString()} pts to {next.name}
                </Text>
              </>
            )}
          </View>

          {/* Redeem options */}
          <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>Redeem</Text>
          {REDEMPTIONS.map(r => {
            const canAfford = balance >= r.cost;
            return (
              <Pressable
                key={r.id}
                style={[styles.redeemRow, {
                  backgroundColor: theme.surface,
                  borderColor:     theme.border,
                  opacity:         canAfford ? 1 : 0.5,
                }]}
                onPress={() => handleRedeem(r)}
                disabled={redeeming === r.id || !canAfford}
              >
                <View style={[styles.redeemIcon, { backgroundColor: theme.primary + '20' }]}>
                  <Ionicons name={r.icon} size={20} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.redeemTitle, { color: theme.text }]}>{r.title}</Text>
                  <Text style={[styles.redeemDesc, { color: theme.textSecond }]}>{r.desc}</Text>
                </View>
                <View>
                  <Text style={[styles.redeemCost, { color: canAfford ? theme.primary : theme.textThird }]}>
                    {r.cost} pts
                  </Text>
                  {redeeming === r.id && <ActivityIndicator color={theme.primary} size="small" />}
                </View>
              </Pressable>
            );
          })}

          {/* History */}
          <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>Recent</Text>
          {history.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textThird }]}>
              No activity yet. Complete a delivery to start earning points.
            </Text>
          ) : history.slice(0, 20).map(h => (
            <View
              key={h.id}
              style={[styles.historyRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <Ionicons
                name={h.delta > 0 ? 'add-circle' : 'remove-circle'}
                size={18}
                color={h.delta > 0 ? '#16A34A' : '#DC2626'}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.historyReason, { color: theme.text }]}>
                  {REASON_LABEL[h.reason] ?? h.reason}
                </Text>
                <Text style={[styles.historyDate, { color: theme.textSecond }]}>
                  {new Date(h.createdAt).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <Text style={[
                styles.historyDelta,
                { color: h.delta > 0 ? '#16A34A' : '#DC2626' },
              ]}>
                {h.delta > 0 ? '+' : ''}{h.delta}
              </Text>
            </View>
          ))}

          <View style={[styles.infoBox, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Ionicons name="information-circle-outline" size={14} color={theme.textSecond} />
            <Text style={[styles.infoText, { color: theme.textSecond }]}>
              Points have no cash value, are not transferable, and expire after 24 months of inactivity.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const REASON_LABEL: Record<string, string> = {
  delivery_complete:    'Delivery completed',
  bank_transfer_bonus:  'Bank transfer bonus',
  referral_bonus:       'Referral bonus',
  rate_driver:          'Driver rated',
  monthly_streak:       'Monthly streak bonus',
  redeem_discount:      'Redeemed: ₦500 off',
  redeem_free_delivery: 'Redeemed: free delivery',
  redeem_priority:      'Redeemed: priority dispatch',
  redeem_insurance:     'Redeemed: insurance upgrade',
  refund_clawback:      'Refund clawback',
  expired:              'Expired',
  admin_adjustment:     'Adjustment',
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    flex: 1, textAlign: 'center',
    fontSize: FontSize.lg, fontWeight: FontWeight.bold,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  content: { padding: Spacing.lg, gap: Spacing.md },

  heroCard: {
    padding: Spacing.lg, borderRadius: Radius.lg, gap: Spacing.sm,
    alignItems: 'center',
  },
  tierBadge: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
    marginBottom: Spacing.xs,
  },
  tierBadgeText: { color: '#0F2B4C', fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1 },
  heroLabel: { color: '#fff', fontSize: FontSize.sm, opacity: 0.85 },
  heroAmount: { color: '#fff', fontSize: 48, fontWeight: FontWeight.bold },
  progressTrack: {
    width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3, marginTop: Spacing.sm, overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: '#fff' },
  progressLabel: { color: '#fff', fontSize: FontSize.xs, opacity: 0.85, marginTop: 4 },

  sectionLabel: {
    fontSize: FontSize.sm, fontWeight: FontWeight.semibold,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.sm,
  },
  emptyText: { fontSize: FontSize.sm, textAlign: 'center', paddingVertical: Spacing.lg },

  redeemRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1,
  },
  redeemIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  redeemTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  redeemDesc:  { fontSize: FontSize.sm, marginTop: 2 },
  redeemCost:  { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1,
  },
  historyReason: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  historyDate:   { fontSize: FontSize.xs, marginTop: 2 },
  historyDelta:  { fontSize: FontSize.base, fontWeight: FontWeight.bold, fontFamily: 'monospace' },

  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1,
    marginTop: Spacing.lg,
  },
  infoText: { flex: 1, fontSize: FontSize.xs, lineHeight: 16 },
});
