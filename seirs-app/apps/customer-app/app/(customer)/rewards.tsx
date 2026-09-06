import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, ActivityIndicator,
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
import { showDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';

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
/*
 * 'priority' is GONE from the catalogue (founder 2026-09-05: "okay delete
 * it to make it less complicated"). It was never redeemable, and worse it
 * advertised something the tier policy says we will not do: tiers unlock
 * the earning multiplier and nothing else. The type keeps the value so the
 * backend contract and any historical ledger row still parse.
 */
type RedemptionType = 'discount_500' | 'free_delivery' | 'priority' | 'insurance';

interface Redemption {
  type: RedemptionType;
  label: string;
  desc:  string;
  cost:  number;
  icon:  keyof typeof Ionicons.glyphMap;
  /**
   * Whether redeeming this actually delivers anything.
   *
   * loyalty.service.ts only mutates the delivery price for the two
   * naira-value rewards. Priority and insurance are, in the backend's
   * own words, "recorded on the ledger but need dispatcher +
   * insurance-partner wiring to actually deliver value". The app
   * offered all four identically, so a customer could spend 300 real
   * points on priority dispatch, get a success alert naming their
   * tracking code, and receive nothing. Taking points for nothing is
   * not a rounding error, so these stay visible but unredeemable until
   * the wiring ships.
   */
  live: boolean;
}

const REDEMPTIONS: Redemption[] = [
  { type: 'insurance',    label: '₦500 insurance cover',  desc: 'Insure a single delivery up to ₦50,000',            cost: 200,  icon: 'shield-checkmark-outline', live: false },
  { type: 'discount_500', label: '₦500 off',              desc: '₦500 discount on your next delivery',              cost: 500,  icon: 'pricetag-outline', live: true },
  { type: 'free_delivery',label: 'Free delivery',          desc: 'One free delivery up to ₦2,000',                   cost: 1000, icon: 'gift-outline', live: true },
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

  /**
   * The last seven days, the way the driver's earnings screen shows them
   * (founder 2026-09-05: "something more informative like the drivers app").
   *
   * The screen already said what you HAVE and what you can spend it on,
   * and nothing at all about whether you are earning. A balance is a
   * number; a week of bars is a habit, and the driver's screen has had
   * exactly this since it was built.
   *
   * Read off the ledger already in hand, so it costs no request and
   * cannot fail separately from the screen around it. Earned and spent
   * are kept apart deliberately: netting them would hide a good week
   * spent down to nothing, which is the week most worth showing.
   */
  const week = (() => {
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = startOfDay(new Date());
    const DAY   = 24 * 60 * 60 * 1000;

    const days = Array.from({ length: 7 }, (_, i) => {
      const at = today - (6 - i) * DAY;
      return {
        at,
        label:  new Date(at).toLocaleDateString('en-GB', { weekday: 'narrow' }),
        earned: 0,
        spent:  0,
      };
    });

    for (const h of history as any[]) {
      const raw = h?.createdAt ?? h?.date;
      const t = raw ? new Date(raw).getTime() : NaN;
      if (!Number.isFinite(t)) continue;                 // an unreadable date is not a reason to lie about the week
      const day = startOfDay(new Date(t));
      const slot = days.find(d => d.at === day);
      if (!slot) continue;
      const delta = Number(h?.delta ?? 0);
      if (delta > 0) slot.earned += delta;
      else           slot.spent  += Math.abs(delta);
    }

    const earned = days.reduce((s, d) => s + d.earned, 0);
    const spent  = days.reduce((s, d) => s + d.spent, 0);
    // The tallest bar sets the scale. A flat week must not render as a
    // full-height row of bars, so the floor is 1 rather than 0.
    const peak = Math.max(1, ...days.map(d => d.earned));
    return { days, earned, spent, peak };
  })();

  const handleRedeem = async (r: Redemption) => {
    if (points < r.cost) return;
    if (!r.live) return;   // see Redemption.live
    // Rewards MUST be applied to a specific active delivery. If the user
    // has none, guide them to book one instead of silently deducting points.
    if (activeDeliveries.length === 0) {
      showDialog({
        title: 'Book a delivery first',
        message: `You don't have any active deliveries to apply this reward to. Book a delivery, then come back here to redeem.`,
        actions: [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Book delivery', style: 'primary', onPress: () => router.push('/(customer)/send' as any) },
        ],
      });
      return;
    }

    // If there's exactly one active delivery, skip the picker. Multiple
    // gets a chooser so the user knows exactly which booking they're
    // discounting.
    if (activeDeliveries.length === 1) {
      confirmAndRedeem(r, activeDeliveries[0]);
      return;
    }

    // BUG FIXED 2026-08-24: this was Cancel plus up to three deliveries,
    // which is four Alert buttons. Android's AlertDialog has three slots
    // and React Native drops the rest without a word, so a customer with
    // three active deliveries could never pick the third one, and the
    // slice(0, 3) that was meant to stay inside the limit was one over
    // it because Cancel counts too. SeirsDialog renders the whole list
    // and scrolls, so the cap is gone along with the bug.
    showDialog({
      title: `Apply ${r.label} to which delivery?`,
      message: 'Pick the delivery you want this reward to apply to.',
      actions: [
        ...activeDeliveries.map((d: any) => ({
          text: `${d.trackingCode} (${String(d.status).replace('_', ' ')})`,
          onPress: () => confirmAndRedeem(r, d),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    });
  };

  const confirmAndRedeem = (r: Redemption, delivery: any) => {
    showDialog({
      title: `Redeem ${r.label}?`,
      // Points are a count, not money, so they stay whole here. The
      // kobo rule applies to naira amounts, and customers hold points
      // rather than naira on this account.
      message: `This will deduct ${r.cost.toLocaleString()} points from your balance and apply the reward to delivery ${delivery.trackingCode}. Cannot be undone.`,
      actions: [
        {
          text: 'Redeem',
          style: 'primary',
          onPress: async () => {
            setRedeemingType(r.type);
            try {
              const res = await loyaltyApi.redeem(r.type, delivery.id);
              setPoints(res.newBalance ?? points - r.cost);
              showDialog({
                title: 'Redeemed',
                message: `${r.label} applied to ${delivery.trackingCode}. New balance: ${(res.newBalance ?? points - r.cost).toLocaleString()} pts.`,
              });
              load();
            } catch (e: any) {
              showDialog({ title: 'Redemption failed', message: e?.message ?? 'Please try again.' });
            } finally {
              setRedeemingType(null);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
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
          /*
           * Dark mode used to fade navy into #0A0A0A, pure black and not a
           * brand colour at all, so the one coloured surface on the screen
           * drained to nothing and the whole thing read as dead (founder
           * 2026-09-05: "the dark mode could be a little alive"). Light
           * mode never had the problem because it goes navy to a LIGHTER
           * navy.
           *
           * Now both directions keep the hue and only change where they
           * sit on it: dark goes deep navy to a lifted navy, so the card
           * still reads as SEIRS blue against a near-black screen instead
           * of dissolving into it.
           */
          colors={isDark ? ['#0A1F38', '#16406E'] : ['#0F2B4C', '#1A3A63']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>{tx('auto.rewards.yourPoints', 'Your points')}</Text>
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
            <Text style={[styles.expiryText, { color: '#92400E' }]}>
              {expiring.toLocaleString()} points expire in the next 30 days. Redeem or book a delivery to keep them.
            </Text>
          </View>
        )}

        {/* The week, as bars. See `week` above for why earned and spent
            are kept apart rather than netted. */}
        {/*
          ALWAYS shown (founder 2026-09-05: "i also like the calender that
          shows them the points they earn this week... if its real i want
          it back"). It is real: it reads the loyalty ledger, and a blank
          week means a blank week rather than a stub.
          
          I had briefly collapsed it to a line when empty, to kill the dead
          space he had complained about. Wrong trade: hiding the chart on a
          quiet week removes exactly the nudge a quiet week needs. The dead
          space is fixed inside the card instead, by saying what the empty
          bars mean and how far the next tier is.
        */}
        <View style={[styles.weekCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <View style={styles.weekHead}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{tx('auto.rewards.last7Days', 'Last 7 days')}</Text>
            <Text style={[styles.weekEarned, { color: theme.primary }]}>
              {week.earned > 0 ? `+${week.earned.toLocaleString()} pts` : 'No points yet'}
            </Text>
          </View>

          <View style={styles.weekBars}>
            {week.days.map((d) => (
              <View key={d.at} style={styles.weekCol}>
                <View style={styles.weekTrack}>
                  <View
                    style={[
                      styles.weekBar,
                      {
                        height: `${Math.round((d.earned / week.peak) * 100)}%`,
                        backgroundColor: d.earned > 0 ? theme.primary : theme.border,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.weekLabel, { color: theme.textThird }]}>{d.label}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.weekFoot, { color: theme.textSecond }]}>
            {week.earned === 0 && week.spent === 0
              ? (nextTier
                  ? `Nothing yet this week. Every delivery earns, and you are ${(nextTier.min - points).toLocaleString()} points from ${nextTier.name}.`
                  : 'Nothing yet this week. Every delivery you book earns points.')
              : `Earned ${week.earned.toLocaleString()}, redeemed ${week.spent.toLocaleString()} this week.`}
          </Text>
        </View>

        {/* Redeem rewards: sorted cheapest first so users see something achievable */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{tx('auto.rewards.redeemYourPoints', 'Redeem your points')}</Text>
        {REDEMPTIONS.map(r => {
          // A reward that delivers nothing cannot be redeemable, however
          // many points the customer has. See Redemption.live.
          const canRedeem = r.live && points >= r.cost;
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
                  {!r.live && (
                    <Text style={[styles.rewardPoints, { color: theme.textThird }]}>
                      · Not available yet
                    </Text>
                  )}
                </View>
              </View>
              {busy ? (
                <ActivityIndicator color={theme.primary} />
              ) : canRedeem ? (
                <View style={[styles.redeemBtn, { backgroundColor: theme.primary }]}>
                  <Text style={styles.redeemBtnText}>{tx('auto.rewards.redeem', 'Redeem')}</Text>
                </View>
              ) : points < r.cost ? (
                <Text style={[styles.needMore, { color: theme.textThird }]}>
                  {(r.cost - points).toLocaleString()} more
                </Text>
              ) : null}
              {/*
                This printed `cost - points` in EVERY non-redeemable case,
                so a reward you could easily afford but which is not live
                yet read "-211 more" (founder 2026-09-05, 411 points
                against a 200 point reward). Negative points needed is not
                a thing. The row already says "Not available yet", which is
                the actual reason, so nothing more belongs here.
              */}
            </Pressable>
          );
        })}

        {/* Tier ladder with per-tier multipliers made explicit */}
        <View style={[styles.tiersCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: Spacing.sm }]}>{tx('auto.rewards.membershipTiers', 'Membership tiers')}</Text>
          {TIERS.map((tier, i) => {
            const isActive = tier.key === currentTier.key;
            const reached  = points >= tier.min;
            return (
              <View
                key={tier.key}
                style={[
                  styles.tierRow,
                  isActive && { backgroundColor: isDark ? '#161B22' : '#F9FAFB', borderRadius: Radius.lg, paddingHorizontal: Spacing.sm },
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
                    <Text style={styles.currentBadgeText}>{tx('auto.rewards.current', 'Current')}</Text>
                  </View>
                ) : reached ? (
                  <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
                ) : null}
              </View>
            );
          })}
        </View>

        {/*
          Capped at 8 rows, and now it SAYS so (founder 2026-09-05: "if the
          user have 1000 orders and earn points every time that will be a
          long scrolling"). The cap already existed; what did not exist was
          any way for a person to know they were looking at a window rather
          than the whole ledger. Eight silent rows and a thousand
          deliveries look identical.
        */}
        <View style={styles.activityHead}>
          <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>{tx('auto.rewards.recentActivity', 'Recent activity')}</Text>
          {history.length > 8 && (
            <Text style={[styles.activityCount, { color: theme.textThird }]}>
              Last 8 of {history.length.toLocaleString()}
            </Text>
          )}
        </View>
        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.md }} />
        ) : history.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="star-outline" size={28} color={theme.textThird} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{tx('auto.rewards.noActivityYet', 'No activity yet')}</Text>
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
        {/*
          Plain surface, not a blue plate (founder 2026-09-05: "the bottom
          has the blue that makes it look somehow"). #001020 is a blue-black
          that sits a few percent off the near-black page behind it, so it
          read as a muddy smudge rather than a card. It now uses the same
          surface and border every other card on this screen uses, which is
          the business app's restraint applied here.

          And the leading pictograms are gone. Five different objects, a
          car, a card, two people, a star and a trophy, all in accent blue
          at 16px, read as emoji rather than as a list: the eye sorts them
          as pictures and the text becomes the caption. The points figure
          IS the information, so it leads each line instead.
        */}
        <View style={[styles.earnCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.earnTitle, { color: theme.text }]}>{tx('auto.rewards.howToEarn', 'How to earn')}</Text>
          {[
            { pts: '10 pts',  text: 'per ₦1,000 spent on a delivery' },
            { pts: '+5 pts',  text: 'bonus when you pay by bank transfer' },
            { pts: '200 pts', text: 'per friend who signs up and completes a delivery' },
            { pts: '5 pts',   text: 'for rating a driver' },
            { pts: '50 pts',  text: 'bonus on your 5th delivery each month' },
          ].map(item => (
            <View key={item.text} style={styles.earnRow}>
              <Text style={[styles.earnPts, { color: theme.primary }]}>{item.pts}</Text>
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

  // Last 7 days. Same shape as the driver's earnings card, deliberately:
  // it is the same question asked of a different ledger.
  weekCard:   { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.md },
  weekHead:   { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  cardTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  weekEarned: { fontSize: FontSize.sm, fontWeight: '700' },
  weekBars:   { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 72, gap: 6 },
  weekCol:    { flex: 1, alignItems: 'center', gap: 6 },
  // The track is the full height so every bar shares one baseline; the
  // bar grows inside it. Without the track a short bar would float.
  weekTrack:  { flex: 1, width: '100%', justifyContent: 'flex-end' },
  weekBar:    { width: '100%', borderRadius: 4, minHeight: 3 },
  weekLabel:  { fontSize: FontSize.xs, fontWeight: '600' },
  weekFoot:   { fontSize: FontSize.sm, lineHeight: 18 },
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

  activityHead:  { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
                   marginBottom: Spacing.sm },
  activityCount: { fontSize: FontSize.xs, fontWeight: '600' },
  activityRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  activityIcon:  { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  activityReason:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  activityDate:  { fontSize: FontSize.xs, marginTop: 2 },
  activityDelta: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  earnCard:  { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: 8, marginTop: Spacing.sm },
  earnTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  earnRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Fixed width so five different figures share one left edge and the
  // sentences after them line up. Tabular figures for the same reason.
  earnPts:   { width: 62, fontSize: FontSize.sm, fontWeight: '800',
               fontVariant: ['tabular-nums'] },
  earnText:  { flex: 1, fontSize: FontSize.sm, lineHeight: 19 },
  earnFine:  { fontSize: FontSize.xs, marginTop: 4, lineHeight: 15 },
});
