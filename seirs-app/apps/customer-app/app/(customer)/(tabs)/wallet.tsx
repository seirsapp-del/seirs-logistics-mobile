import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { loyaltyApi, deliveriesApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import {
  Gift, Plus, Sparkles, QrCode, Flame, Trophy, Users, Zap,
  Package, Award, ArrowRight, Star,
} from 'lucide-react-native';
import { HamburgerButton } from '@/components/HamburgerButton';

/**
 * Rewards tab hub.
 *
 * Design: elegant + motivating + personalized + social. Deliberately no
 * "total spent" or ₦ transaction history — see product decision to avoid
 * the accountant/guilt framing. Payment history lives on the Bookings tab.
 *
 * Sections top → bottom:
 *   1. Personalized greeting + this-month points (positive framing of activity)
 *   2. Points hero card (balance + tier + primary actions)
 *   3. Streak card (weeks-in-a-row)
 *   4. Featured promotion (admin-editable; hidden when none)
 *   5. Achievements strip (unlockable badges)
 *   6. Community pulse (social proof)
 */

interface Achievement {
  key:      string;
  label:    string;
  icon:     any;
  color:    string;
  earned:   boolean;
}

export default function WalletScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { t }   = useTranslation();
  const { user } = useAuth();

  const [balance,   setBalance]   = useState(0);
  const [tier,      setTier]      = useState<string | null>(null);
  const [history,   setHistory]   = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [pulse,     setPulse]     = useState<any>(null);
  const [promo,     setPromo]     = useState<any>(null);
  const [loading,   setLoading]   = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [l, d, p, pr] = await Promise.all([
        loyaltyApi.balance().catch(() => null),
        deliveriesApi.myDeliveries(1, 60).catch(() => null),
        deliveriesApi.communityPulse().catch(() => null),
        deliveriesApi.featuredPromotion().catch(() => null),
      ]);
      if (l) {
        setBalance(l.balance ?? 0);
        setTier(l.tier ?? null);
        setHistory(Array.isArray(l.history) ? l.history : []);
      }
      const items: any[] = Array.isArray(d) ? d : Array.isArray((d as any)?.items) ? (d as any).items : [];
      setDeliveries(items);
      if (p) setPulse(p);
      if (pr) setPromo(pr);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Derived signals (all client-side, no extra backend calls) ────────────
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const monthPoints = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    return history
      .filter((h: any) => (h.delta ?? 0) > 0 && new Date(h.createdAt).getTime() >= monthStart.getTime())
      .reduce((s: number, h: any) => s + (h.delta ?? 0), 0);
  }, [history]);

  // Weeks-in-a-row streak. Counts consecutive ISO weeks ending at "this
  // week" that contain at least one delivery in the user's history.
  // Broken week resets the streak; that's intentional per the streak
  // mental model users expect from apps like Duolingo/Snapchat.
  const streak = useMemo(() => {
    if (deliveries.length === 0) return 0;
    const weeks = new Set(
      deliveries
        .filter((d: any) => d.status === 'delivered')
        .map((d: any) => weekKey(new Date(d.createdAt))),
    );
    let count = 0;
    let cursor = new Date();
    while (weeks.has(weekKey(cursor))) {
      count++;
      cursor = new Date(cursor.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    return count;
  }, [deliveries]);

  const deliveredCount = deliveries.filter((d: any) => d.status === 'delivered').length;

  const achievements: Achievement[] = useMemo(() => [
    { key: 'first',    label: 'First delivery',  icon: Sparkles, color: '#3A7BD5', earned: deliveredCount >= 1  },
    { key: 'regular',  label: 'Regular',         icon: Package,  color: '#3A7BD5', earned: deliveredCount >= 3  },
    { key: 'champion', label: 'Champion',        icon: Trophy,   color: '#FFBE0B', earned: deliveredCount >= 10 },
    { key: 'silver',   label: 'Silver tier',     icon: Award,    color: '#C0C0C0', earned: tier === 'silver' || tier === 'gold' || tier === 'platinum' },
    { key: 'gold',     label: 'Gold tier',       icon: Award,    color: '#FFD700', earned: tier === 'gold' || tier === 'platinum' },
    { key: 'platinum', label: 'Platinum tier',   icon: Award,    color: '#E5E4E2', earned: tier === 'platinum' },
    { key: 'streak',   label: '4-week streak',   icon: Flame,    color: '#F97316', earned: streak >= 4 },
    { key: 'referral', label: 'Referral hero',   icon: Users,    color: '#22C55E', earned: false /* wired via loyaltyApi.myReferrals in a follow-up */ },
  ], [deliveredCount, tier, streak]);
  const earnedCount = achievements.filter(a => a.earned).length;

  const monthDelta = useMemo(() => {
    // Compare to previous month for the "+X% vs last month" copy under
    // the this-month hero stat. Positive framing of activity.
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prev = history
      .filter((h: any) => (h.delta ?? 0) > 0 && new Date(h.createdAt) >= prevMonthStart && new Date(h.createdAt) < thisMonthStart)
      .reduce((s: number, h: any) => s + (h.delta ?? 0), 0);
    if (prev === 0) return null;
    return Math.round(((monthPoints - prev) / prev) * 100);
  }, [history, monthPoints]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Spacing.xxl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      >

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <HamburgerButton />
            <Text style={[styles.title, { color: theme.text }]}>{t('rewardsTab.title')}</Text>
          </View>
          <Pressable
            style={[styles.iconBtn, { backgroundColor: theme.surfaceSecond }]}
            onPress={() => router.push('/(customer)/seirs-id' as any)}
            accessibilityLabel="SEIRS ID"
          >
            <QrCode size={20} color={theme.text} strokeWidth={1.75} />
          </Pressable>
        </View>

        {/* Personalized greeting + this-month hero */}
        <View style={[styles.greetCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.greetHi, { color: theme.textSecond }]}>Hi {firstName}</Text>
          <View style={styles.greetRow}>
            <Text style={[styles.greetPts, { color: theme.text }]}>
              {monthPoints.toLocaleString()}
              <Text style={[styles.greetUnit, { color: theme.textSecond }]}> pts this month</Text>
            </Text>
            {monthDelta != null && (
              <View style={[styles.deltaChip, { backgroundColor: monthDelta >= 0 ? '#DCFCE7' : '#FEE2E2' }]}>
                <Text style={{ color: monthDelta >= 0 ? '#166534' : '#991B1B', fontSize: FontSize.xs, fontWeight: FontWeight.bold }}>
                  {monthDelta >= 0 ? '+' : ''}{monthDelta}% vs last
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Points hero card */}
        <View style={styles.cardWrap}>
          <LinearGradient
            colors={isDark ? ['#1C2128', '#0D1117'] : ['#0F2B4C', '#1A3A63']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.balanceCard, Shadows.navy]}
          >
            <View style={styles.heroTopRow}>
              <View>
                <Text style={styles.balanceLabel}>Total rewards</Text>
                <Text style={styles.balanceAmount}>{balance.toLocaleString()}</Text>
                <Text style={styles.balancePts}>points</Text>
              </View>
              {tier && (
                <View style={styles.tierPill}>
                  <Sparkles size={14} color="#fff" strokeWidth={2} />
                  <Text style={styles.tierPillText}>{tier}</Text>
                </View>
              )}
            </View>
            <View style={styles.cardActions}>
              <Pressable style={styles.cardActionBtn} onPress={() => router.push('/(customer)/rewards' as any)}>
                <View style={styles.cardActionIcon}><Gift size={20} color="#fff" strokeWidth={2} /></View>
                <Text style={styles.cardActionLabel}>Redeem</Text>
              </Pressable>
              <Pressable style={styles.cardActionBtn} onPress={() => router.push('/(customer)/referral' as any)}>
                <View style={styles.cardActionIcon}><Plus size={20} color="#fff" strokeWidth={2} /></View>
                <Text style={styles.cardActionLabel}>Earn more</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </View>

        {/* Streak card. Elegant single-line stat; only renders when streak >= 1 */}
        {streak >= 1 && (
          <View style={[styles.subtleCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.streakIcon, { backgroundColor: '#FEF3C7' }]}>
              <Flame size={18} color="#F97316" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.streakTitle, { color: theme.text }]}>
                {streak}-week streak
              </Text>
              <Text style={[styles.streakSub, { color: theme.textSecond }]}>
                {streak >= 4
                  ? "You're on fire. Keep it going!"
                  : `${4 - streak} more week${4 - streak === 1 ? '' : 's'} to unlock the streak achievement.`}
              </Text>
            </View>
          </View>
        )}

        {/* Featured promotion. Only renders when admin has set one. Elegant
            single-tap CTA that goes to the /rewards catalogue. */}
        {promo && (
          <Pressable
            onPress={() => router.push('/(customer)/rewards' as any)}
            style={[styles.promoCard, { borderColor: theme.primary }]}
          >
            <LinearGradient
              colors={['#3A7BD5', '#5DA0FF']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.promoInner}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.promoTag}>FEATURED</Text>
                <Text style={styles.promoLabel}>{promo.label}</Text>
                <Text style={styles.promoDesc}>{promo.desc}</Text>
              </View>
              <ArrowRight size={22} color="#fff" strokeWidth={2.5} />
            </LinearGradient>
          </Pressable>
        )}

        {/* Achievements strip */}
        <View style={[styles.section, { paddingHorizontal: Spacing.md }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Achievements</Text>
            <Text style={[styles.sectionCount, { color: theme.textSecond }]}>
              {earnedCount} of {achievements.length}
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: Spacing.md }}>
            {achievements.map((a) => (
              <View
                key={a.key}
                style={[
                  styles.achievementCard,
                  { backgroundColor: theme.surface, borderColor: theme.border, opacity: a.earned ? 1 : 0.45 },
                ]}
              >
                <View style={[styles.achievementIcon, { backgroundColor: a.earned ? a.color + '20' : theme.surfaceSecond }]}>
                  <a.icon size={20} color={a.earned ? a.color : theme.textThird} strokeWidth={2} />
                </View>
                <Text style={[styles.achievementLabel, { color: a.earned ? theme.text : theme.textSecond }]} numberOfLines={2}>
                  {a.label}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Community pulse (social proof). Only shows when we have data. */}
        {pulse && pulse.deliveriesThisWeek > 0 && (
          <View style={[styles.pulseCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.pulseIcon, { backgroundColor: theme.primary + '15' }]}>
              <Users size={18} color={theme.primary} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pulseCount, { color: theme.text }]}>
                {pulse.deliveriesThisWeek.toLocaleString()}
                <Text style={[styles.pulseCountUnit, { color: theme.textSecond }]}> deliveries this week</Text>
              </Text>
              <Text style={[styles.pulseSub, { color: theme.textSecond }]}>
                By {pulse.activeCustomersThisWeek.toLocaleString()} SEIRS customers across Nigeria.
              </Text>
            </View>
          </View>
        )}

        {/* Empty state when everything is null (fresh account, no deliveries) */}
        {balance === 0 && deliveredCount === 0 && streak === 0 && !promo && (
          <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Zap size={28} color={theme.primary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Start earning</Text>
            <Text style={[styles.emptySub, { color: theme.textSecond }]}>
              Book your first delivery to unlock achievements and start earning SEIRS Rewards points.
            </Text>
            <Pressable onPress={() => router.push('/(customer)/send' as any)} style={[styles.emptyCta, { backgroundColor: theme.primary }]}>
              <Text style={styles.emptyCtaText}>Book a delivery</Text>
            </Pressable>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ISO week key so we can group deliveries by week for streak calc. Format
// YYYY-Www so week 1 sorts before week 10 alphabetically.
function weekKey(d: Date): string {
  const target = new Date(d.getTime());
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const week1 = new Date(target.getFullYear(), 0, 4);
  const week  = 1 + Math.round(((target.getTime() - week1.getTime()) / (24 * 60 * 60 * 1000) - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  title:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  iconBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  greetCard: { marginHorizontal: Spacing.md, marginBottom: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  greetHi:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  greetRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: 8 },
  greetPts:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold, letterSpacing: -0.5 },
  greetUnit: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  deltaChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },

  cardWrap:      { marginHorizontal: Spacing.md, marginBottom: Spacing.md },
  balanceCard:   { borderRadius: Radius.xl, padding: Spacing.lg },
  balanceLabel:  { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.sm, marginBottom: Spacing.xs },
  balanceAmount: { color: '#fff', fontSize: 36, fontWeight: FontWeight.bold, letterSpacing: -0.5 },
  balancePts:    { color: 'rgba(255,255,255,0.6)', fontSize: FontSize.xs, marginBottom: Spacing.md },
  heroTopRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tierPill:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
  tierPillText:  { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold, textTransform: 'capitalize' },
  cardActions:   { flexDirection: 'row', marginTop: Spacing.sm },
  cardActionBtn: { flex: 1, alignItems: 'center', gap: 6 },
  cardActionIcon:{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  cardActionLabel:{ color: 'rgba(255,255,255,0.9)', fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  subtleCard:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginHorizontal: Spacing.md, marginBottom: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  streakIcon:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  streakTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  streakSub:   { fontSize: FontSize.xs, marginTop: 2, lineHeight: 16 },

  promoCard:  { marginHorizontal: Spacing.md, marginBottom: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  promoInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  promoTag:   { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 1, marginBottom: 2 },
  promoLabel: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },
  promoDesc:  { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.xs, marginTop: 2, lineHeight: 16 },

  section:      { paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
  sectionHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  sectionCount: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  achievementCard:{ width: 92, alignItems: 'center', gap: 6, padding: 10, borderRadius: Radius.lg, borderWidth: 1 },
  achievementIcon:{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  achievementLabel:{ fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textAlign: 'center', lineHeight: 14 },

  pulseCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginHorizontal: Spacing.md, marginBottom: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  pulseIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pulseCount:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },
  pulseCountUnit:{ fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  pulseSub:  { fontSize: FontSize.xs, marginTop: 2, lineHeight: 15 },

  emptyCard: { marginHorizontal: Spacing.md, marginTop: Spacing.md, padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, alignItems: 'center', gap: 8 },
  emptyTitle:{ fontSize: FontSize.md, fontWeight: FontWeight.bold },
  emptySub:  { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  emptyCta:  { marginTop: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: 12, borderRadius: Radius.lg },
  emptyCtaText:{ color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
