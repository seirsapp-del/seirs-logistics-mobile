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
  Package, Award, ArrowRight,
} from 'lucide-react-native';
import { HamburgerButton } from '@/components/HamburgerButton';
import { tx } from '@/i18n/tx';

/**
 * Rewards tab hub.
 *
 * Design: elegant + motivating + personalized + social. Deliberately no
 * "total spent" or ₦ transaction history: see product decision to avoid
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

/*
 * What points actually buy.
 *
 * Only the redemptions that are LIVE. The catalogue on the other Rewards
 * screen also lists insurance cover, which is marked live: false because
 * nothing redeems it, and this screen exists to answer "what can I use
 * these for": listing a reward that cannot be taken is the same mistake
 * as the rate-a-driver bonus that promised points nothing awarded.
 *
 * Costs are duplicated from that catalogue deliberately rather than
 * imported: if the two ever disagree the fix is to make redemptions a
 * shared module, not to let this screen quote a price it cannot honour.
 */
const POINT_USES = [
  { cost: 500,  label: '₦500 off a delivery', desc: 'Comes off the price before you pay.' },
  { cost: 1000, label: 'A free delivery',       desc: 'Covers one booking up to ₦2,000.' },
];

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

  // Earned and spent, in colours that survive dark mode. The old screen
  // used #166534 and #991B1B unconditionally, which are near-black on a
  // near-black page.
  // #4ADE80 was a mint that glowed against the near-black page (founder,
  // 2026-09-05: "its dark mode so a light green like that is too much").
  // #16A34A is the green the driver app already uses for money earned.
  const POS = isDark ? '#16A34A' : '#166534';
  const NEG = isDark ? '#F87171' : '#991B1B';


  /*
   * Points are gold. Deliveries are blue.
   *
   * The founder, on this screen (2026-09-05): "its alot of blue", and then
   * "the point earned and the bar could be some colour". Seven things on
   * one screen were the same accent: the balance card, the achievement
   * icons, the range pill, the total, every bar, the View all link and the
   * tab bar. An accent everything shares emphasises nothing.
   *
   * The first attempt at this made them gold, and the founder's answer was
   * immediate: "common yellow? looks weird, now you over did it". He was
   * right. Swapping one loud accent for a second loud accent does not calm
   * a screen down, it just adds a colour, and a saturated yellow slab under
   * a saturated blue card is worse than the blue was.
   *
   * So no new colour at all. Earned points take the SAME green the ledger
   * rows below already use for a positive entry, and which the driver app
   * uses for money earned. The screen ends up with one blue object (the
   * balance card), one green idea (earning), and controls that are simply
   * grey. Colour now means something in all three cases.
   */

  const [balance,   setBalance]   = useState(0);
  const [tier,      setTier]      = useState<string | null>(null);
  const [history,   setHistory]   = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [promo,     setPromo]     = useState<any>(null);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(false);
  // 30 days of points per day, aggregated server-side. See `chart` below
  // for why the bars cannot be built from `history` alone.
  const [series,    setSeries]    = useState<any[]>([]);
  const [range,     setRange]     = useState<7 | 30>(7);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // deliveriesApi.communityPulse() used to run here. The section it fed
      // was removed on founder call (see the note further down), so the
      // call was a round-trip whose result nothing read (sweep C-1.6).
      const [l, d, pr, rf] = await Promise.all([
        loyaltyApi.balance().catch(() => null),
        deliveriesApi.myDeliveries(1, 60).catch(() => null),
        deliveriesApi.featuredPromotion().catch(() => null),
        loyaltyApi.myReferrals().catch(() => null),
      ]);
      if (l) {
        setBalance(l.balance ?? 0);
        setTier(l.tier ?? null);
        setHistory(Array.isArray(l.history) ? l.history : []);
        setSeries(Array.isArray((l as any).series) ? (l as any).series : []);
      }
      const items: any[] = Array.isArray(d) ? d : Array.isArray((d as any)?.items) ? (d as any).items : [];
      setDeliveries(items);
      if (pr) setPromo(pr);
      setReferrals(Array.isArray(rf) ? rf : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Derived signals (all client-side, no extra backend calls) ────────────
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  /*
   * The tier pill is the tier's metal, not a grey of white.
   *
   * It sat in the corner of the balance card as translucent white on blue,
   * so Bronze, Silver, Gold and Platinum all looked identical: the pill
   * named a rank and then showed the same one to everybody. The colours
   * are the ones the matching achievement badges already use, so a tier
   * looks the same wherever the customer meets it.
   */
  const TIER_METAL: Record<string, string> = {
    bronze:   '#CD7F32',
    silver:   '#C0C0C0',
    gold:     '#FFD700',
    platinum: '#E5E4E2',
  };
  const tierMetal = TIER_METAL[String(tier ?? '').toLowerCase()] ?? '#FFFFFF';

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

  /*
   * The bars, over 7 or 30 days.
   *
   * Reads `series`, which the server aggregates in SQL, NOT `history`.
   * History is capped at 20 entries, so a customer with a busy fortnight
   * had every day older than their twentieth entry drawn as empty: the
   * chart invented quiet days and called them fact. The fallback below
   * still derives from history, because an app pointed at a server that
   * predates the series field should show an approximate week rather
   * than an empty box, but the server is the source once it is there.
   *
   * Earned only. Spending points is not a failure to earn them, and
   * netting the two would draw a good month redeemed down to nothing.
   */
  const chart = useMemo(() => {
    const DAY = 24 * 60 * 60 * 1000;
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

    let days: Array<{ at: number; earned: number }>;

    if (series.length) {
      days = series.slice(-range).map((r: any) => ({
        at:     new Date(r.date + 'T00:00:00').getTime(),
        earned: Number(r.earned ?? 0),
      }));
    } else {
      const today = startOfDay(new Date());
      days = Array.from({ length: range }, (_, i) => ({ at: today - (range - 1 - i) * DAY, earned: 0 }));
      for (const h of history as any[]) {
        const t = h?.createdAt ? new Date(h.createdAt).getTime() : NaN;
        if (!Number.isFinite(t)) continue;
        const delta = Number(h?.delta ?? 0);
        if (delta <= 0) continue;
        const slot = days.find(d => d.at === startOfDay(new Date(t)));
        if (slot) slot.earned += delta;
      }
    }

    const earned = days.reduce((sum, d) => sum + d.earned, 0);
    // A flat stretch must not render as a full-height row of bars, so the
    // scale floor is 1 rather than 0.
    const peak = Math.max(1, ...days.map(d => d.earned));

    /*
     * Seven days get a letter under each bar. Thirty do not: at that width
     * a column is about nine pixels, so a two-digit date rendered under one
     * truncates to an ellipsis, and the axis came out reading "7 ... ... ...
     * 1 5". Thirty repeated weekday letters would say nothing anyway.
     *
     * So the long range labels its two ends instead, which is what a reader
     * actually needs from a trend: where it starts and that it ends now.
     */
    const label = (i: number): string =>
      range === 7 ? new Date(days[i].at).toLocaleDateString('en-GB', { weekday: 'narrow' }) : '';

    const span = (at: number) =>
      new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    return {
      days, earned, peak, label,
      from:  days.length ? span(days[0].at) : '',
      exact: series.length > 0,
    };
  }, [series, history, range]);

  const deliveredCount = deliveries.filter((d: any) => d.status === 'delivered').length;

  const paidReferrals = useMemo(
    () => referrals.filter((r: any) => r?.bonusPaid).length,
    [referrals],
  );

  const achievements: Achievement[] = useMemo(() => [
    // Bronze, then teal. These two were both #3A7BD5, and they are the
    // only badges most customers will have earned, so the whole strip read
    // as two identical blue tiles: a row of the same thing twice rather
    // than two things somebody achieved. Bronze also starts the metal
    // ladder that silver, gold and platinum finish further along.
    { key: 'first',    label: 'First delivery',  icon: Sparkles, color: '#CD7F32', earned: deliveredCount >= 1  },
    { key: 'regular',  label: 'Regular',         icon: Package,  color: '#14B8A6', earned: deliveredCount >= 3  },
    { key: 'champion', label: 'Champion',        icon: Trophy,   color: '#FFBE0B', earned: deliveredCount >= 10 },
    { key: 'silver',   label: 'Silver tier',     icon: Award,    color: '#C0C0C0', earned: tier === 'silver' || tier === 'gold' || tier === 'platinum' },
    { key: 'gold',     label: 'Gold tier',       icon: Award,    color: '#FFD700', earned: tier === 'gold' || tier === 'platinum' },
    { key: 'platinum', label: 'Platinum tier',   icon: Award,    color: '#E5E4E2', earned: tier === 'platinum' },
    { key: 'streak',   label: '4-week streak',   icon: Flame,    color: '#D97706', earned: streak >= 4 },
    // Earned on a referral that actually PAID OUT. Counting sign-ups
    // would award this for an invite that never completed a delivery,
    // which is not what the badge says. Until this was wired the flag was
    // hardcoded false, so the badge could never be earned by anyone no
    // matter what they did (device sweep 2026-08-19).
    { key: 'referral', label: 'Referral hero',   icon: Users,    color: '#22C55E', earned: paidReferrals >= 1 },
  ], [deliveredCount, tier, streak, paidReferrals]);
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
            /*
             * The same blue as the other Rewards card (founder 2026-09-05:
             * "let that card on the screen have the same blue like the other
             * card on that other screen"). In dark mode this was #1C2128 to
             * #0D1117, a grey that vanished into the near-black page behind
             * it, so the balance sat on nothing while the drawer screen's
             * card glowed blue a tap away. One product, two answers to the
             * same question.
             */
            colors={isDark ? ['#0A1F38', '#16406E'] : ['#0F2B4C', '#1A3A63']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.balanceCard, Shadows.navy]}
          >
            <View style={styles.heroTopRow}>
              <View>
                <Text style={styles.balanceLabel}>{tx('auto.wallet.totalRewards', 'Total rewards')}</Text>
                <Text style={styles.balanceAmount}>{balance.toLocaleString()}</Text>
                <Text style={styles.balancePts}>points</Text>
              </View>
              {tier && (
                <View style={[styles.tierPill, { backgroundColor: tierMetal + '2E', borderColor: tierMetal + '99' }]}>
                  <Sparkles size={14} color={tierMetal} strokeWidth={2.2} />
                  <Text style={[styles.tierPillText, { color: tierMetal }]}>{tier}</Text>
                </View>
              )}
            </View>
            <View style={styles.cardActions}>
              <Pressable style={styles.cardActionBtn} onPress={() => router.push('/(customer)/rewards' as any)}>
                {/* The glyph and its plate are untouched; only the gift is
                    coloured (founder 2026-09-05: "the redeem icon could use
                    a different colour", then "just the colour"). */}
                <View style={styles.cardActionIcon}>
                  <Gift size={20} color="#FFCE3A" strokeWidth={2} />
                </View>
                <Text style={styles.cardActionLabel}>{tx('auto.wallet.redeem', 'Redeem')}</Text>
              </Pressable>
              <Pressable style={styles.cardActionBtn} onPress={() => router.push('/(customer)/referral' as any)}>
                <View style={styles.cardActionIcon}><Plus size={20} color="#fff" strokeWidth={2} /></View>
                <Text style={styles.cardActionLabel}>{tx('auto.wallet.earnMore', 'Earn more')}</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </View>

        {/* Streak card. Elegant single-line stat; only renders when streak >= 1 */}
        {streak >= 1 && (
          <View style={[styles.subtleCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.streakIcon, { backgroundColor: '#FEF3C7' }]}>
              <Flame size={18} color="#D97706" strokeWidth={2} />
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
              colors={['#3A7BD5', '#58A6FF']}
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
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{tx('auto.wallet.achievements', 'Achievements')}</Text>
            <Text style={[styles.sectionCount, { color: theme.textSecond }]}>
              {earnedCount} of {achievements.length}
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: Spacing.md }}>
            {achievements.map((a) => (
              /*
               * The tile is exactly the one that was here before. The founder,
               * on the version that tinted the plate, ringed the disc and added
               * a progress line: "even the achievements its too much, you could
               * have just change the icon colour inside the previous design".
               *
               * He is right that the tile was never the problem. Both earned
               * badges being the same blue was the problem, and that is one
               * value in the list above, not a new card.
               */
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

        {/* Community pulse REMOVED (founder 2026-08-13).

            It published our weekly delivery count and active customer
            count to anyone who installed the app. That is competitive
            intelligence and a targeting signal in one: it tells a rival
            exactly how big we are, and it tells anyone planning fraud or
            theft how thin our coverage is in a given week. Pre-launch
            those numbers are small enough to read as "not worth using",
            which is the opposite of the social proof it was meant to be.

            Volume figures stay internal, on the admin dashboard. If we
            want to publish a milestone it should be a deliberate
            statement with a number we chose, not a live counter. */}

        {/*
          The lower half of this screen was blank below the achievements
          strip. The founder, looking at it (2026-09-05): "the empty space
          should show the 7 days calender earning and then it could show
          their transaction with their points and what can they really use
          the points to do and how can they use it".

          Three questions, so three cards, in his order: am I earning, what
          have I earned, and what is any of it actually for. The last one
          matters most: a balance nobody knows how to spend is a number,
          not a reward.

          The header note above still holds. There is no NAIRA history here.
          This is the points ledger, which is the subject of this screen;
          money spent stays on the Bookings tab.
        */}

        {/* 1. Am I earning? */}
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.panelHead}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{tx('auto.wallet.pointsEarned', 'Points earned')}</Text>
            <View style={[styles.toggle, { borderColor: theme.border }]}>
              {([7, 30] as const).map(n => (
                <Pressable
                  key={n}
                  onPress={() => setRange(n)}
                  hitSlop={6}
                  // Neutral. This control sits directly under the balance
                  // card, and any filled colour here competes with it for
                  // no reason: which range you are looking at is worth a
                  // shade of grey, not an accent.
                  style={[styles.toggleBtn, range === n && { backgroundColor: theme.surfaceSecond }]}
                >
                  <Text style={[styles.toggleText, { color: range === n ? theme.text : theme.textThird }]}>
                    {n} days
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Text style={[styles.panelFigure, { color: chart.earned > 0 ? POS : theme.textSecond }]}>
            {chart.earned > 0 ? '+' + chart.earned.toLocaleString() + ' pts' : 'Nothing earned yet'}
          </Text>

          <View style={[styles.bars, { gap: range === 7 ? 6 : 2 }]}>
            {chart.days.map((d, i) => (
              <View key={d.at} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${Math.round((d.earned / chart.peak) * 100)}%`,
                        backgroundColor: d.earned > 0 ? POS : theme.border,
                      },
                    ]}
                  />
                </View>
                <Text numberOfLines={1} style={[styles.barLabel, { color: theme.textThird }]}>
                  {chart.label(i)}
                </Text>
              </View>
            ))}
          </View>

          {range === 30 && (
            <View style={styles.axisRow}>
              <Text style={[styles.barLabel, { color: theme.textThird }]}>{chart.from}</Text>
              <Text style={[styles.barLabel, { color: theme.textThird }]}>{tx('auto.wallet.today', 'Today')}</Text>
            </View>
          )}
        </View>

        {/* 2. What have I earned? */}
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.panelHead}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{tx('auto.wallet.recentPoints', 'Recent points')}</Text>
            {history.length > 6 && (
              <Pressable onPress={() => router.push('/(customer)/rewards' as any)} hitSlop={6}>
                <Text style={[styles.linkText, { color: theme.primary }]}>{tx('auto.wallet.viewAll', 'View all')}</Text>
              </Pressable>
            )}
          </View>

          {history.length === 0 ? (
            <Text style={[styles.panelNote, { color: theme.textSecond }]}>
              Points you earn and spend will be listed here, newest first.
            </Text>
          ) : (
            history.slice(0, 6).map((h: any, i: number) => {
              const delta = Number(h?.delta ?? 0);
              const up    = delta >= 0;
              return (
                <View
                  key={h.id ?? (h.createdAt + '-' + h.reason + '-' + i)}
                  style={[styles.ledgerRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.ledgerLabel, { color: theme.text }]} numberOfLines={1}>
                      {activityLabel(h.reason)}
                    </Text>
                    <Text style={[styles.ledgerDate, { color: theme.textThird }]}>{fmtDate(h.createdAt)}</Text>
                  </View>
                  {/* The hue carries the sign and so does the sign itself, so
                      a customer who cannot tell the two colours apart still
                      reads the row correctly. */}
                  <Text style={[styles.ledgerDelta, { color: up ? POS : NEG }]}>
                    {(up ? '+' : '') + delta.toLocaleString()} pts
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* 3. What is any of it for? */}
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{tx('auto.wallet.whatYourPointsAreFor', 'What your points are for')}</Text>

          {POINT_USES.map((u, i) => {
            const ready = balance >= u.cost;
            return (
              <View key={u.label} style={[styles.useRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                {/* The cost leads the row: it is the number being compared
                    against the balance at the top of the screen. */}
                <Text style={[styles.useCost, { color: ready ? theme.primary : theme.textThird }]}>
                  {u.cost.toLocaleString()}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.useLabel, { color: theme.text }]}>{u.label}</Text>
                  <Text style={[styles.useDesc, { color: theme.textSecond }]}>{u.desc}</Text>
                </View>
                <Text style={[styles.useReady, { color: ready ? theme.primary : theme.textThird }]}>
                  {ready ? 'Ready' : (u.cost - balance).toLocaleString() + ' to go'}
                </Text>
              </View>
            );
          })}

          {/* The "how", which this screen never said anywhere. A reward is
              applied to a booking that already exists, so redeeming with
              nothing in flight is the one thing that cannot work. */}
          <Text style={[styles.panelNote, { color: theme.textSecond }]}>
            Book a delivery first, then redeem. The reward comes off that booking before you pay,
            and the points leave your balance at the same moment.
          </Text>

          <Pressable
            onPress={() => router.push('/(customer)/rewards' as any)}
            style={[styles.useCta, { borderColor: theme.primary }]}
          >
            <Text style={[styles.useCtaText, { color: theme.primary }]}>{tx('auto.wallet.redeemPoints', 'Redeem points')}</Text>
            <ArrowRight size={16} color={theme.primary} strokeWidth={2.2} />
          </Pressable>
        </View>

        {/* Empty state when everything is null (fresh account, no deliveries) */}
        {balance === 0 && deliveredCount === 0 && streak === 0 && !promo && (
          <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Zap size={28} color={theme.primary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{tx('auto.wallet.startEarning', 'Start earning')}</Text>
            <Text style={[styles.emptySub, { color: theme.textSecond }]}>
              Book your first delivery to unlock achievements and start earning SEIRS Rewards points.
            </Text>
            <Pressable onPress={() => router.push('/(customer)/send' as any)} style={[styles.emptyCta, { backgroundColor: theme.primary }]}>
              <Text style={styles.emptyCtaText}>{tx('auto.wallet.bookADelivery', 'Book a delivery')}</Text>
            </Pressable>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// The ledger's reason codes, in the customer's words. Kept identical to
// the other Rewards screen's version: two spellings of the same event
// would read as two different events.
function activityLabel(reason: string): string {
  switch (reason) {
    case 'delivery_complete':    return 'Delivery completed';
    case 'bank_transfer_bonus':  return 'Bank transfer bonus';
    case 'referral_bonus':       return 'Referral bonus';
    case 'rate_driver':          return 'Rated a driver';
    case 'monthly_streak':       return 'Monthly streak bonus';
    case 'redeem_discount':      return 'Redeemed ₦500 off';
    case 'redeem_free_delivery': return 'Redeemed free delivery';
    case 'redeem_priority':      return 'Redeemed priority dispatch';
    case 'redeem_insurance':     return 'Redeemed insurance cover';
    case 'admin_adjustment':     return 'Adjustment';
    case 'refund_clawback':      return 'Refund adjustment';
    case 'expired':              return 'Points expired';
    case 'tier_warning':         return 'Tier warning sent';
    default:                     return reason;
  }
}

const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : '';

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
  tierPill:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  tierPillText:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, textTransform: 'capitalize' },
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


  // ── The three lower cards ───────────────────────────────────────────
  panel:       { marginHorizontal: Spacing.md, marginBottom: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, gap: 10 },
  panelHead:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelFigure: { fontSize: FontSize.lg, fontWeight: '700' },
  panelNote:   { fontSize: FontSize.sm, lineHeight: 19 },
  linkText:    { fontSize: FontSize.sm, fontWeight: '600' },

  toggle:      { flexDirection: 'row', borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  toggleBtn:   { paddingHorizontal: 10, paddingVertical: 5 },
  toggleText:  { fontSize: FontSize.xs, fontWeight: '700' },

  // The track is full height so every bar shares one baseline and the bar
  // grows inside it; without it a short bar would float in the middle.
  bars:        { flexDirection: 'row', alignItems: 'flex-end', height: 76 },
  barCol:      { flex: 1, alignItems: 'center', gap: 5 },
  barTrack:    { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar:         { width: '100%', borderRadius: 3, minHeight: 3 },
  barLabel:    { fontSize: 10, fontWeight: '600', height: 13 },
  axisRow:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },

  ledgerRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 10 },
  ledgerLabel: { fontSize: FontSize.sm, fontWeight: '600' },
  ledgerDate:  { fontSize: FontSize.xs, marginTop: 2 },
  ledgerDelta: { fontSize: FontSize.sm, fontWeight: '700' },

  useRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 10 },
  useCost:     { fontSize: FontSize.base, fontWeight: '800', minWidth: 46 },
  useLabel:    { fontSize: FontSize.sm, fontWeight: '600' },
  useDesc:     { fontSize: FontSize.xs, marginTop: 2 },
  useReady:    { fontSize: FontSize.xs, fontWeight: '700' },
  useCta:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: Radius.lg, borderWidth: 1.5 },
  useCtaText:  { fontSize: FontSize.sm, fontWeight: '700' },

  emptyCard: { marginHorizontal: Spacing.md, marginTop: Spacing.md, padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, alignItems: 'center', gap: 8 },
  emptyTitle:{ fontSize: FontSize.md, fontWeight: FontWeight.bold },
  emptySub:  { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  emptyCta:  { marginTop: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: 12, borderRadius: Radius.lg },
  emptyCtaText:{ color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
