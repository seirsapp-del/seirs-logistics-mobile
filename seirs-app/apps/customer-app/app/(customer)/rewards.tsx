import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { loyaltyApi, deliveriesApi, type LoyaltyTier } from '@/services/api';

// Tier thresholds MUST mirror the backend (loyalty.service.ts:TIER_THRESHOLDS).
// Keep in sync manually. The tier chip shown to the user is otherwise a lie.
// [[project_seirs_tier_policy]]: tiers only unlock the earning multiplier.
const TIERS: Array<{
  key: LoyaltyTier;
  name: string;
  min: number;
  max: number | null;
  multiplier: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: 'bronze',   name: 'Bronze',   min: 0,     max: 999,   multiplier: 1.0,  color: '#CD7F32', icon: 'medal-outline' },
  { key: 'silver',   name: 'Silver',   min: 1000,  max: 4999,  multiplier: 1.25, color: '#C0C0C0', icon: 'medal-outline' },
  { key: 'gold',     name: 'Gold',     min: 5000,  max: 14999, multiplier: 1.5,  color: '#FFD700', icon: 'medal' },
  { key: 'platinum', name: 'Platinum', min: 15000, max: null,  multiplier: 2.0,  color: '#E5E4E2', icon: 'diamond-outline' },
];

// Redemption catalogue MUST mirror loyalty.controller.ts REDEMPTION_COSTS.
// If the backend changes, this list changes.
type RedemptionType = 'discount_500' | 'free_delivery' | 'priority' | 'insurance';

interface Redemption {
  type: RedemptionType;
  label: string;
  desc:  string;
  cost:  number;
  icon:  keyof typeof Ionicons.glyphMap;
}

const REDEMPTIONS: Redemption[] = [
  { type: 'insurance',    label: '₦500 insurance cover',  desc: 'Insure a single delivery up to ₦50,000',            cost: 200,  icon: 'shield-checkmark-outline' },
  { type: 'priority',     label: 'Priority dispatch',      desc: 'Skip the queue on your next booking',              cost: 300,  icon: 'flash-outline' },
  { type: 'discount_500', label: '₦500 off',              desc: '₦500 discount on your next delivery',              cost: 500,  icon: 'pricetag-outline' },
  { type: 'free_delivery',label: 'Free delivery',          desc: 'One free delivery up to ₦2,000',                   cost: 1000, icon: 'gift-outline' },
];

// Helpers
const tierFor = (points: number) => TIERS.slice().reverse().find(t => points >= t.min) ?? TIERS[0];
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

export default function RewardsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { t }  = useTranslation();

  const [points,      setPoints]      = useState<number>(0);
  const [tierSlug,    setTierSlug]    = useState<LoyaltyTier>('bronze');
  const [history,     setHistory]     = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [redeemingType, setRedeemingType] = useState<RedemptionType | null>(null);
  // Active deliveries (pending or assigned): the only ones a redemption
  // can be applied to. Backend rejects anything else.
  const [activeDeliveries, setActiveDeliveries] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const [balance, delivs] = await Promise.all([
        loyaltyApi.balance().catch(() => null),
        deliveriesApi.myDeliveries(1, 20).catch(() => null),
      ]);
      if (balance) {
        setPoints(balance.balance ?? 0);
        setTierSlug((balance.tier as LoyaltyTier) ?? 'bronze');
        setHistory(Array.isArray(balance.history) ? balance.history : []);
      }
      const items: any[] = Array.isArray(delivs)
        ? delivs
        : Array.isArray((delivs as any)?.items) ? (delivs as any).items : [];
      setActiveDeliveries(items.filter((d) => d.status === 'pending' || d.status === 'assigned'));
    } catch { /* offline. keep previous values */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const currentTier = TIERS.find(t => t.key === tierSlug) ?? tierFor(points);
  const nextTier    = TIERS[TIERS.indexOf(currentTier) + 1] ?? null;
  const progress    = nextTier
    ? Math.min(1, Math.max(0, (points - currentTier.min) / (nextTier.min - currentTier.min)))
    : 1;

  // Expiring-soon signal from the ledger. Any positive-delta entry whose
  // expiresAt is in the next 30 days contributes to the callout total.
  const expiring = history
    .filter((h: any) => (h.delta ?? 0) > 0 && h.expiresAt && new Date(h.expiresAt).getTime() < Date.now() + 30 * 24 * 60 * 60 * 1000)
    .reduce((s: number, h: any) => s + (h.delta ?? 0), 0);

  const handleRedeem = async (r: Redemption) => {
    if (points < r.cost) return;
    // Rewards MUST be applied to a specific active delivery. If the user
    // has none, guide them to book one instead of silently deducting points.
    if (activeDeliveries.length === 0) {
      Alert.alert(
        'Book a delivery first',
        `You don't have any active deliveries to apply this reward to. Book a delivery, then come back here to redeem.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Book delivery', onPress: () => router.push('/(customer)/send' as any) },
        ],
      );
      return;
    }

    // If there's exactly one active delivery, skip the picker. Multiple
    // gets a chooser so the user knows exactly which booking they're
    // discounting.
    if (activeDeliveries.length === 1) {
      confirmAndRedeem(r, activeDeliveries[0]);
      return;
    }

    Alert.alert(
      `Apply ${r.label} to which delivery?`,
      'Pick the delivery you want this reward to apply to.',
      [
        { text: 'Cancel', style: 'cancel' },
        ...activeDeliveries.slice(0, 3).map((d: any) => ({
          text: `${d.trackingCode} (${d.status})`,
          onPress: () => confirmAndRedeem(r, d),
        })),
      ],
    );
  };

  const confirmAndRedeem = (r: Redemption, delivery: any) => {
    Alert.alert(
      `Redeem ${r.label}?`,
      `This will deduct ${r.cost.toLocaleString()} points from your balance and apply the reward to delivery ${delivery.trackingCode}. Cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem',
          onPress: async () => {
            setRedeemingType(r.type);
            try {
              const res = await loyaltyApi.redeem(r.type, delivery.id);
              setPoints(res.newBalance ?? points - r.cost);
              Alert.alert(
                'Redeemed!',
                `${r.label} applied to ${delivery.trackingCode}. New balance: ${(res.newBalance ?? points - r.cost).toLocaleString()} pts.`,
              );
              load();
            } catch (e: any) {
              Alert.alert('Redemption failed', e?.message ?? 'Please try again.');
            } finally {
              setRedeemingType(null);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t('rewards2.title')}</Text>
        <Pressable onPress={() => router.push('/(customer)/referral')}>
          <Ionicons name="gift-outline" size={22} color={theme.primary} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Points hero card */}
        <LinearGradient
          colors={isDark ? ['#0F2B4C', '#0A0A0A'] : ['#0F2B4C', '#1A3A63']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>Your points</Text>
              <Text style={styles.heroPoints}>{loading ? '-' : points.toLocaleString()}</Text>
              <Text style={styles.heroSub}>Earn {currentTier.multiplier}× multiplier at {currentTier.name}</Text>
            </View>
            <View style={[styles.tierBadge, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <Ionicons name={currentTier.icon} size={18} color={currentTier.color} />
              <Text style={[styles.tierName, { color: currentTier.color }]}>{currentTier.name}</Text>
            </View>
          </View>

          {/* Progress to next tier: real visual bar */}
          {nextTier && (
            <View style={styles.progressSection}>
              <View style={styles.progressLabels}>
                <Text style={styles.progressText}>{(nextTier.min - points).toLocaleString()} pts to {nextTier.name}</Text>
                <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: nextTier.color }]} />
              </View>
            </View>
          )}
        </LinearGradient>

        {/* Expiring soon urgency callout: only when there's actual expiry */}
        {expiring > 0 && (
          <View style={[styles.expiryCard, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
            <Ionicons name="time-outline" size={16} color="#92400E" />
            <Text style={[styles.expiryText, { color: '#78350F' }]}>
              {expiring.toLocaleString()} points expire in the next 30 days. Redeem or book a delivery to keep them.
            </Text>
          </View>
        )}

        {/* Redeem rewards: sorted cheapest first so users see something achievable */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Redeem your points</Text>
        {REDEMPTIONS.map(r => {
          const canRedeem = points >= r.cost;
          const busy      = redeemingType === r.type;
          return (
            <Pressable
              key={r.type}
              style={[
                styles.rewardRow,
                { backgroundColor: theme.surface, borderColor: canRedeem ? theme.primary : theme.border },
                Shadows.xs,
              ]}
              disabled={!canRedeem || busy}
              onPress={() => handleRedeem(r)}
            >
              <View style={[styles.rewardIcon, { backgroundColor: canRedeem ? (isDark ? '#001020' : '#EFF6FF') : theme.surfaceSecond }]}>
                <Ionicons name={r.icon} size={22} color={canRedeem ? theme.primary : theme.textThird} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rewardLabel, { color: canRedeem ? theme.text : theme.textSecond }]}>{r.label}</Text>
                <Text style={[styles.rewardDesc,  { color: theme.textSecond }]} numberOfLines={2}>{r.desc}</Text>
                <View style={styles.rewardMeta}>
                  <Ionicons name="star" size={12} color="#FFBE0B" />
                  <Text style={[styles.rewardPoints, { color: theme.textSecond }]}>{r.cost.toLocaleString()} pts</Text>
                </View>
              </View>
              {busy ? (
                <ActivityIndicator color={theme.primary} />
              ) : canRedeem ? (
                <View style={[styles.redeemBtn, { backgroundColor: theme.primary }]}>
                  <Text style={styles.redeemBtnText}>Redeem</Text>
                </View>
              ) : (
                <Text style={[styles.needMore, { color: theme.textThird }]}>
                  {(r.cost - points).toLocaleString()} more
                </Text>
              )}
            </Pressable>
          );
        })}

        {/* Tier ladder with per-tier multipliers made explicit */}
        <View style={[styles.tiersCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: Spacing.sm }]}>Membership tiers</Text>
          {TIERS.map((tier, i) => {
            const isActive = tier.key === currentTier.key;
            const reached  = points >= tier.min;
            return (
              <View
                key={tier.key}
                style={[
                  styles.tierRow,
                  isActive && { backgroundColor: isDark ? '#111' : '#F8FAFC', borderRadius: Radius.lg, paddingHorizontal: Spacing.sm },
                  i < TIERS.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                ]}
              >
                <View style={[styles.tierIcon, { backgroundColor: tier.color + '20' }]}>
                  <Ionicons name={tier.icon} size={20} color={tier.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tierRowName, { color: theme.text }]}>
                    {tier.name} <Text style={{ fontWeight: FontWeight.regular, color: theme.textSecond, fontSize: FontSize.xs }}>· {tier.multiplier}× earn</Text>
                  </Text>
                  <Text style={[styles.tierRange, { color: theme.textSecond }]}>
                    {tier.min.toLocaleString()}{tier.max ? ` – ${tier.max.toLocaleString()}` : '+'} pts
                  </Text>
                </View>
                {isActive ? (
                  <View style={[styles.currentBadge, { backgroundColor: theme.primary }]}>
                    <Text style={styles.currentBadgeText}>Current</Text>
                  </View>
                ) : reached ? (
                  <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
                ) : null}
              </View>
            );
          })}
        </View>

        {/* Recent activity from the ledger. Empty state when no activity yet. */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent activity</Text>
        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.md }} />
        ) : history.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="star-outline" size={28} color={theme.textThird} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No activity yet</Text>
            <Text style={[styles.emptySub, { color: theme.textSecond }]}>
              Complete a delivery to start earning points.
            </Text>
          </View>
        ) : (
          history.slice(0, 8).map((h: any) => (
            <View key={h.id ?? `${h.createdAt}-${h.reason}`} style={[styles.activityRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.activityIcon, { backgroundColor: (h.delta ?? 0) >= 0 ? '#DCFCE7' : '#FEE2E2' }]}>
                <Ionicons name={(h.delta ?? 0) >= 0 ? 'add' : 'remove'} size={16} color={(h.delta ?? 0) >= 0 ? '#166534' : '#991B1B'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.activityReason, { color: theme.text }]}>
                  {activityLabel(h.reason)}
                </Text>
                <Text style={[styles.activityDate, { color: theme.textSecond }]}>{fmtDate(h.createdAt)}</Text>
              </View>
              <Text style={[styles.activityDelta, { color: (h.delta ?? 0) >= 0 ? '#166534' : '#991B1B' }]}>
                {(h.delta ?? 0) >= 0 ? '+' : ''}{(h.delta ?? 0).toLocaleString()} pts
              </Text>
            </View>
          ))
        )}

        {/* How to earn: numbers match backend loyalty.service.ts exactly */}
        <View style={[styles.earnCard, { backgroundColor: isDark ? '#001020' : '#EFF6FF', borderColor: theme.primary + '30' }]}>
          <Text style={[styles.earnTitle, { color: theme.text }]}>How to earn</Text>
          {[
            { icon: 'car-outline',    text: '10 pts per ₦1,000 spent on a delivery' },
            { icon: 'card-outline',   text: '+5 bonus pts when you pay by bank transfer' },
            { icon: 'people-outline', text: '200 pts per friend who signs up + completes a delivery' },
            { icon: 'star-outline',   text: '5 pts for rating a driver' },
            { icon: 'trophy-outline', text: '50 pts bonus on your 5th delivery each month' },
          ].map(item => (
            <View key={item.text} style={styles.earnRow}>
              <Ionicons name={item.icon as any} size={16} color={theme.primary} />
              <Text style={[styles.earnText, { color: theme.textSecond }]}>{item.text}</Text>
            </View>
          ))}
          <Text style={[styles.earnFine, { color: theme.textThird }]}>
            Points expire 24 months after they're earned. Tier is based on points earned in the last 12 months.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// Reason keys come straight from the LoyaltyReason enum in the backend.
// Kept as a switch so unknown reasons fall back to something readable.
function activityLabel(reason: string): string {
  switch (reason) {
    case 'delivery_complete':      return 'Delivery completed';
    case 'bank_transfer_bonus':    return 'Bank transfer bonus';
    case 'referral_bonus':         return 'Referral bonus';
    case 'rate_driver':            return 'Rated a driver';
    case 'monthly_streak':         return 'Monthly streak bonus';
    case 'redeem_discount':        return 'Redeemed ₦500 off';
    case 'redeem_free_delivery':   return 'Redeemed free delivery';
    case 'redeem_priority':        return 'Redeemed priority dispatch';
    case 'redeem_insurance':       return 'Redeemed insurance cover';
    case 'admin_adjustment':       return 'Admin adjustment';
    case 'refund_clawback':        return 'Refund adjustment';
    case 'expired':                return 'Points expired';
    case 'tier_warning':           return 'Tier warning sent';
    default:                        return reason;
  }
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  heroCard:  { borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.md },
  heroTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLabel: { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm },
  heroPoints:{ color: '#fff', fontSize: 36, fontWeight: FontWeight.bold, letterSpacing: -0.5, marginTop: 2 },
  heroSub:   { color: 'rgba(255,255,255,0.6)', fontSize: FontSize.xs, marginTop: 4 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: Radius.full },
  tierName:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, textTransform: 'uppercase' },

  progressSection: { gap: 6 },
  progressLabels:  { flexDirection: 'row', justifyContent: 'space-between' },
  progressText:    { color: 'rgba(255,255,255,0.9)', fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  progressTrack:   { height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' },
  progressFill:    { height: '100%', borderRadius: 3 },

  expiryCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  expiryText: { flex: 1, fontSize: FontSize.xs, lineHeight: 17 },

  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginTop: Spacing.sm },

  rewardRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  rewardIcon:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  rewardLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  rewardDesc:  { fontSize: FontSize.xs, marginTop: 2, lineHeight: 16 },
  rewardMeta:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  rewardPoints:{ fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  redeemBtn:   { paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.md },
  redeemBtnText:{ color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  needMore:    { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textAlign: 'right' },

  tiersCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md },
  tierRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  tierIcon:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tierRowName:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },
  tierRange:  { fontSize: FontSize.xs, marginTop: 2 },
  currentBadge:{ paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  currentBadgeText:{ color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  emptyCard:  { alignItems: 'center', gap: 6, padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1 },
  emptyTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  emptySub:   { fontSize: FontSize.xs, textAlign: 'center' },

  activityRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  activityIcon:  { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  activityReason:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  activityDate:  { fontSize: FontSize.xs, marginTop: 2 },
  activityDelta: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  earnCard:  { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: 8, marginTop: Spacing.sm },
  earnTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  earnRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  earnText:  { flex: 1, fontSize: FontSize.sm, lineHeight: 19 },
  earnFine:  { fontSize: FontSize.xs, marginTop: 4, lineHeight: 15 },
});
