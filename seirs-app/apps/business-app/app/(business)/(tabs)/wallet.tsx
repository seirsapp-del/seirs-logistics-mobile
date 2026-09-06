/**
 * Business · Wallet tab = REWARDS + EARNINGS (founder redesign 2026-08-16).
 *
 * "We are not a bank": nobody deposits money here. The tab now mirrors
 * the customer app's Rewards (points hero + how-to-earn + activity) and
 * the driver app's Earnings, reshaped for partner stores: the Earnings
 * segment activates only once the account is an APPROVED partner, and
 * shows what SEIRS owes them (pending payouts) plus payout history with
 * weekly settlement to their business bank account. Legacy prepaid
 * credit, where it still exists, is shown draining against bookings.
 */
import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/Icon';
import { Drawer } from '@/components/Drawer';
import { businessApi, paymentsApi, partnerApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useColors, useTheme } from '@/context/ThemeContext';
import { naira } from '@/utils/money';
import { tx } from '@/i18n/tx';


type Segment = 'rewards' | 'earnings';

/*
 * What points buy. Only what the server will actually honour: priority
 * and parcel cover are refused by loyalty.service with the points left
 * untouched, because neither is a real product yet.
 */
const POINT_USES = [
  { cost: 500,  label: '₦500 off a delivery', desc: 'Comes off the price before you pay.' },
  { cost: 1000, label: 'A free delivery',       desc: 'Covers one booking up to the reward cap.' },
];

// The ledger's reason codes in the sender's words, identical to the
// customer app's version: two spellings of one event read as two events.
function activityLabel(reason: string): string {
  switch (reason) {
    case 'delivery_complete':    return 'Delivery completed';
    case 'bank_transfer_bonus':  return 'Bank transfer bonus';
    case 'referral_bonus':       return 'Referral bonus';
    case 'rate_driver':          return 'Rated a driver';
    case 'monthly_streak':       return 'Monthly streak bonus';
    case 'redeem_discount':      return 'Redeemed ₦500 off';
    case 'redeem_free_delivery': return 'Redeemed free delivery';
    case 'admin_adjustment':     return 'Opening balance';
    case 'refund_clawback':      return 'Refund adjustment';
    case 'expired':              return 'Points expired';
    default:                     return reason;
  }
}

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const canPartner = !!(user as any)?.capabilities?.canPartner;

  const [segment,  setSegment]  = useState<Segment>('rewards');
  const [range,    setRange]    = useState<7 | 30>(7);

  /*
   * Earning is green here for the same reason it is green on the customer
   * Rewards tab (founder 2026-09-05: "now the same look replicate it
   * exactly for the business app").
   *
   * The bars were colors.primary, which is the same blue as the balance
   * card directly above them, so the screen had one accent doing four
   * jobs. #16A34A is the green the activity rows below already use, and
   * the one the driver app gives money earned. #4ADE80 was tried first
   * and read as a glow against a near-black page.
   */
  const POS = isDark ? '#16A34A' : '#166534';
  const [txns,     setTxns]     = useState<any[]>([]);
  const [loyalty,  setLoyalty]  = useState<any>(null);
  const [payouts,  setPayouts]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /**
   * The last seven days, the way the driver's earnings screen shows them
   * (founder 2026-09-05, same request as the customer Rewards screen).
   *
   * This screen said what you HAVE and offered no sense of whether you
   * are earning at all. A number is a state; a week of bars is a habit,
   * and habit is the thing a rewards screen is trying to build.
   *
   * Both segments read the same shape from different ledgers: points for
   * a sender, naira for a partner counter. Derived from rows already
   * fetched, so it costs no request and cannot fail separately from the
   * screen around it.
   */
  const points  = Number(loyalty?.points ?? 0);
  const tier    = loyalty?.tier ?? null;
  const history = Array.isArray(loyalty?.history) ? loyalty.history : [];
  const series  = Array.isArray(loyalty?.series)  ? loyalty.series  : [];

  // The same metals the customer tier pill uses.
  const TIER_METAL: Record<string, string> = {
    bronze: '#CD7F32', silver: '#C0C0C0', gold: '#FFD700', platinum: '#E5E4E2',
  };
  const tierMetal = TIER_METAL[String(tier ?? '').toLowerCase()] ?? '#FFFFFF';

  const chart = (() => {
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = startOfDay(new Date());
    const DAY   = 24 * 60 * 60 * 1000;

    const days = Array.from({ length: range }, (_, i) => ({
      at:    today - (range - 1 - i) * DAY,
      value: 0,
    }));

    /*
     * Points come from the LEDGER when the server sends it.
     *
     * Deriving them from payment rows was always an approximation, and the
     * approximation was zero because the field it summed did not exist.
     * The series is aggregated in SQL over 30 days, so it is exact at any
     * volume. The payment-derived path stays as a fallback for an app
     * pointed at a server that predates it.
     */
    if (segment === 'rewards' && series.length) {
      const byDate = new Map<string, number>(series.map((r: any) => [String(r.date), Number(r.earned ?? 0)]));
      for (const d of days) {
        const dt = new Date(d.at);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        d.value = byDate.get(key) ?? 0;
      }
      const total = days.reduce((sum, d) => sum + d.value, 0);
      const peak  = Math.max(1, ...days.map(d => d.value));
      const label = (i: number): string =>
        range === 7 ? new Date(days[i].at).toLocaleDateString('en-GB', { weekday: 'narrow' }) : '';
      const from = days.length
        ? new Date(days[0].at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        : '';
      return { days, total, peak, label, from };
    }

    const rows: any[] = segment === 'rewards' ? txns : payouts;
    for (const r of rows) {
      const raw = r?.createdAt ?? r?.date ?? r?.paidAt;
      const t = raw ? new Date(raw).getTime() : NaN;
      if (!Number.isFinite(t)) continue;       // an unreadable date must not invent a day
      const slot = days.find(d => d.at === startOfDay(new Date(t)));
      if (!slot) continue;

      let v = 0;
      if (segment === 'rewards') {
        /*
         * Points are DERIVED from the payment, exactly as the activity
         * list below derives them.
         *
         * This read r.pointsEarned ?? r.points, and a payment row carries
         * neither, so every bar on the rewards side was zero however much
         * the account had booked. The chart was not showing a quiet week,
         * it was reading a field that does not exist.
         *
         * Only settled delivery payments count, or a failed charge would
         * award points on screen that the account never earned.
         */
        if (r?.status !== 'success' || r?.purpose !== 'delivery') continue;
        v = Math.floor(Number(r?.amountKobo ?? 0) / 100 / 100);
      } else {
        v = Number(r?.amount ?? r?.amountNgn ?? 0);
      }
      if (v > 0) slot.value += v;
    }

    const total = days.reduce((sum, d) => sum + d.value, 0);
    // Floor at 1 so a flat stretch is a flat row, not a full-height one.
    const peak  = Math.max(1, ...days.map(d => d.value));

    // Seven days get a letter each. Thirty do not fit in a nine-pixel
    // column, so the long range labels its two ends instead.
    const label = (i: number): string =>
      range === 7 ? new Date(days[i].at).toLocaleDateString('en-GB', { weekday: 'narrow' }) : '';
    const from = days.length
      ? new Date(days[0].at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : '';

    return { days, total, peak, label, from };
  })();

  useEffect(() => {
    const loads: Promise<any>[] = [
      // Points come from payments that actually settled, not from the
      // retired wallet ledger: this feed was still listing naira debits
      // like "-N10,103" for a sender who holds no balance (2026-08-16).
      //
      // businessApi.wallet() was still fired here on every mount and its
      // answer was never read again (B-4.1): a retired ledger endpoint kept
      // warm in production traffic for nothing. Dropped with its state.
      paymentsApi.history().catch(() => []),
      businessApi.loyalty().catch(() => null),
    ];
    if (canPartner) loads.push(partnerApi.payouts(1).catch(() => null));
    Promise.all(loads).then(([t, l, p]) => {
      setTxns(Array.isArray(t) ? t : t?.items ?? []);
      setLoyalty(l);
      const rows = Array.isArray(p) ? p : p?.items ?? [];
      setPayouts(rows);
    }).finally(() => setLoading(false));
  }, [canPartner]);

  const pendingOwed = payouts
    .filter((p: any) => p?.status && p.status !== 'paid')
    .reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);
  const paidOut = payouts
    .filter((p: any) => p?.status === 'paid')
    .reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);

  const segments: Array<{ key: Segment; label: string; locked?: boolean }> = [
    { key: 'rewards', label: 'Rewards' },
    { key: 'earnings', label: 'Earnings', locked: !canPartner },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Drawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient
          /*
           * One gradient served both themes, so the hero sat at the same
           * lightness whether the screen behind it was cloud or near-black
           * (founder 2026-09-05, asking for dark mode to feel less dead on
           * both apps). Dark now lifts INTO the hue rather than away from
           * it, matching the customer Rewards hero exactly so the two
           * money screens read as one product.
           */
          colors={isDark ? ['#0A1F38', '#16406E'] : ['#0F2B4C', '#1a3a5c']}
          style={[styles.hero, { paddingTop: insets.top + 16 }]}
        >
          <View style={styles.heroTop}>
            <Pressable onPress={() => setDrawerOpen(true)} hitSlop={10}>
              <Icon name="AlignLeft" size={22} color="#fff" />
            </Pressable>
            {/* Senders tap a tab labelled Rewards; this heading was hardcoded
                "Wallet" for both roles (B-4.2). Only an approved partner
                store has an actual wallet, because only they hold earnings. */}
            <Text style={styles.heroTitle}>{canPartner ? 'Wallet' : 'Rewards'}</Text>
            <View style={{ width: 22 }} />
          </View>

          {/* Segmented control: Earnings unlocks with partner approval. */}
          <View style={styles.segRow}>
            {segments.map((seg) => {
              const active = segment === seg.key;
              return (
                <Pressable
                  key={seg.key}
                  style={[styles.segBtn, active && styles.segBtnActive]}
                  onPress={() => {
                    if (seg.locked) { router.push('/(business)/apply-partner' as any); return; }
                    setSegment(seg.key);
                  }}
                >
                  {seg.locked && <Icon name="Lock" size={12} color={active ? '#0F2B4C' : 'rgba(255,255,255,0.7)'} />}
                  <Text style={[styles.segText, active && styles.segTextActive]}>{seg.label}</Text>
                </Pressable>
              );
            })}
          </View>

        </LinearGradient>

        {/*
          The balance is a card on the page, not the bottom half of the
          header (founder 2026-09-05: "the switch between the reward and
          earning should stay at the top for easy switch but the rest of the
          screen can be copied from the customers app").

          The header keeps the title and the switch, which is what he asked
          to keep reachable. Everything below is the customer Rewards tab:
          a blue card carrying the balance and the tier, then the chart,
          then what was earned, then what it is all for.
        */}
        <LinearGradient
          colors={isDark ? ['#0A1F38', '#16406E'] : ['#0F2B4C', '#1a3a5c']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.balCard}
        >
          {loading ? (
            <ActivityIndicator color="#fff" style={{ marginVertical: 18 }} />
          ) : segment === 'rewards' ? (
            <>
              <View style={styles.balTop}>
                <View>
                  <Text style={styles.heroLabel}>{tx('auto.wallet.totalRewards', 'Total rewards')}</Text>
                  <View style={styles.pointsRow}>
                    <Text style={styles.heroBig}>{points.toLocaleString()}</Text>
                    <Text style={styles.heroUnit}>points</Text>
                  </View>
                </View>
                {/* The tier has been in this endpoint all along and no
                    screen ever showed it. Same metals as the customer
                    pill, so a tier looks the same in both apps. */}
                {!!tier && (
                  <View style={[styles.tierPill, { backgroundColor: tierMetal + '2E', borderColor: tierMetal + '99' }]}>
                    <Icon name="Star" size={14} color={tierMetal} />
                    <Text style={[styles.tierPillText, { color: tierMetal }]}>{tier}</Text>
                  </View>
                )}
              </View>

              <View style={styles.balActions}>
                {/* navigate, not push: this screen IS a tab, and pushing a
                    sibling tab route from inside the tab group did nothing at
                    all. Redeem sends them to the bookings list because a reward
                    attaches to a booking that exists and is not yet paid. */}
                <Pressable style={styles.balAction} onPress={() => router.push('/(business)/rewards' as any)}>
                  <View style={styles.balActionIcon}><Icon name="Gift" size={20} color="#FFCE3A" /></View>
                  <Text style={styles.balActionLabel}>{tx('auto.wallet.redeem', 'Redeem')}</Text>
                </Pressable>
                <Pressable style={styles.balAction} onPress={() => router.push('/(business)/referral' as any)}>
                  <View style={styles.balActionIcon}><Icon name="Plus" size={20} color="#fff" /></View>
                  <Text style={styles.balActionLabel}>{tx('auto.wallet.earnMore', 'Earn more')}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.heroBody}>
              <Text style={styles.heroLabel}>{tx('auto.wallet.seirsOwesYourStore', 'SEIRS owes your store')}</Text>
              <Text style={styles.heroBig}>{naira(pendingOwed)}</Text>
              <Text style={styles.heroNote}>
                Paid out so far: {naira(paidOut)} · settled weekly to your business bank account.
              </Text>
            </View>
          )}
        </LinearGradient>

        {segment === 'rewards' ? (
          <>
            {/* No sender balance is shown at all. SEIRS is not a bank:
                senders pay per booking through Flutterwave, and the only
                wallets are the EARNINGS ledgers held by partner counters
                and drivers (founder, restated 2026-08-16). Any legacy
                business credit still sitting in the database is an admin
                reconciliation job, not a spendable balance. */}

            {!canPartner && (
              <Pressable
                style={[styles.teaser, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
                onPress={() => router.push('/(business)/apply-partner' as any)}
              >
                <Icon name="Store" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.teaserTitle, { color: colors.primary }]}>{tx('auto.wallet.earnWithSeirs', 'Earn with SEIRS')}</Text>
                  <Text style={[styles.teaserSub, { color: colors.textSecond }]}>
                    Partner stores hold packages at their counter and get weekly payouts.
                  </Text>
                </View>
                <Icon name="ChevronRight" size={18} color={colors.primary} />
              </Pressable>
            )}

            {/* The week, as bars. See `week` above for why it reads rows
                already in hand rather than asking the server again. */}
            <View style={[styles.weekCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.weekHead}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {segment === 'rewards' ? 'Points earned' : 'Earnings'}
                </Text>
                {/* Neutral, not a filled accent: this control sits under the
                    balance card and was competing with it for attention. */}
                <View style={[styles.rangeToggle, { borderColor: colors.border }]}>
                  {([7, 30] as const).map(n => (
                    <Pressable
                      key={n}
                      onPress={() => setRange(n)}
                      hitSlop={6}
                      style={[styles.rangeBtn, range === n && { backgroundColor: colors.surfaceSecond }]}
                    >
                      <Text style={[styles.rangeText, { color: range === n ? colors.text : colors.textThird }]}>
                        {n} days
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <Text style={[styles.weekTotal, { color: chart.total > 0 ? POS : colors.textSecond }]}>
                {chart.total > 0
                  ? (segment === 'rewards' ? `+${chart.total.toLocaleString()} pts` : naira(chart.total))
                  : 'Nothing yet'}
              </Text>

              <View style={[styles.weekBars, { gap: range === 7 ? 6 : 2 }]}>
                {chart.days.map((d, i) => (
                  <View key={d.at} style={styles.weekCol}>
                    <View style={styles.weekTrack}>
                      <View style={[styles.weekBar, {
                        height: `${Math.round((d.value / chart.peak) * 100)}%` as any,
                        backgroundColor: d.value > 0 ? POS : colors.border,
                      }]} />
                    </View>
                    <Text numberOfLines={1} style={[styles.weekLabel, { color: colors.textThird }]}>
                      {chart.label(i)}
                    </Text>
                  </View>
                ))}
              </View>

              {range === 30 && (
                <View style={styles.axisRow}>
                  <Text style={[styles.weekLabel, { color: colors.textThird }]}>{chart.from}</Text>
                  <Text style={[styles.weekLabel, { color: colors.textThird }]}>{tx('auto.wallet.today', 'Today')}</Text>
                </View>
              )}
              <Text style={[styles.weekFoot, { color: colors.textSecond }]}>
                {chart.total > 0
                  ? (segment === 'rewards'
                      ? 'Every delivery you book adds to this.'
                      : 'Paid out to your business bank account weekly.')
                  : (segment === 'rewards'
                      ? 'Book a delivery and your points will show up here.'
                      : 'Payouts will show up here once packages move through your counter.')}
              </Text>
            </View>

            {/* A card, not a bare section: on the page background its text sat
                at 16dp while the chart card above put its own text at 32dp, so
                one screen had two left edges running down it. The customer app
                makes every section a card, which is what keeps its edge single. */}
            <View style={[styles.weekCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {/*
                Recent points, from the ledger, in the customer app's shape.

                This listed PAYMENT rows and called them activity, because
                business points were an integer with no entries behind them.
                An account holding 340 points was told to "book your first
                delivery to start earning" while the balance sat four inches
                above it. The server now writes a ledger entry per award, so
                the list can say what was earned, when, and why.
              */}
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{tx('auto.wallet.recentPoints', 'Recent points')}</Text>
              {loading ? (
                <ActivityIndicator color={colors.accent} />
              ) : history.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textThird, textAlign: 'left' }]}>
                  Points you earn and spend will be listed here, newest first.
                </Text>
              ) : (
                history.slice(0, 6).map((h: any, i: number) => {
                  const delta = Number(h?.delta ?? 0);
                  const up    = delta >= 0;
                  return (
                    <View
                      key={h.id ?? i}
                      style={[styles.ledgerRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                          {activityLabel(h.reason)}
                        </Text>
                        <Text style={[styles.rowSub, { color: colors.textThird }]}>
                          {h.createdAt ? new Date(h.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : ''}
                        </Text>
                      </View>
                      <Text style={[styles.rowAmt, { color: up ? POS : (isDark ? '#F87171' : '#991B1B') }]}>
                        {(up ? '+' : '') + delta.toLocaleString()} pts
                      </Text>
                    </View>
                  );
                })
              )}

            </View>

            <View style={[styles.weekCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {/*
                What the points are for, and how to take them.

                Until the ledger landed there was nothing to put here: business
                points could not be spent at all, so a card listing rewards
                would have promised something impossible. They are ordinary
                ledger points now, and the redemption path the customer app
                uses works on a business booking too.
              */}
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                What your points are for
              </Text>
              {POINT_USES.map((u, i) => {
                const ready = points >= u.cost;
                return (
                  <View key={u.label} style={[styles.ledgerRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                    <Text style={[styles.useCost, { color: ready ? colors.primary : colors.textThird }]}>
                      {u.cost.toLocaleString()}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>{u.label}</Text>
                      <Text style={[styles.rowSub, { color: colors.textSecond }]}>{u.desc}</Text>
                    </View>
                    <Text style={[styles.useReady, { color: ready ? colors.primary : colors.textThird }]}>
                      {ready ? 'Ready' : (u.cost - points).toLocaleString() + ' to go'}
                    </Text>
                  </View>
                );
              })}
              <Text style={[styles.rowSub, { color: colors.textSecond, marginTop: 10, lineHeight: 18 }]}>
                Open a booking you have not paid for yet and redeem there. The reward comes off
                that booking before you pay, and the points leave your balance at the same moment.
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{tx('auto.wallet.payouts', 'Payouts')}</Text>
            {loading ? (
              <ActivityIndicator color={colors.accent} />
            ) : payouts.length === 0 ? (
              <View style={styles.empty}>
                <Icon name="Banknote" size={32} color={colors.textThird} />
                <Text style={[styles.emptyText, { color: colors.textThird }]}>
                  No payouts yet. Packages handled at your counter earn a fee;
                  fees settle weekly to your business bank account.
                </Text>
              </View>
            ) : (
              payouts.map((p: any, i: number) => (
                <View key={p.id ?? i} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.rowIcon, { backgroundColor: p.status === 'paid' ? '#DCFCE7' : '#FEF3C7' }]}>
                    <Icon name="Banknote" size={16} color={p.status === 'paid' ? '#16A34A' : '#D97706'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>
                      {p.status === 'paid' ? 'Paid to bank' : 'Pending payout'}
                    </Text>
                    <Text style={[styles.rowSub, { color: colors.textThird }]}>
                      {p.paidAt
                        ? new Date(p.paidAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
                        : 'Settles with the weekly run'}
                    </Text>
                  </View>
                  <Text style={[styles.rowAmt, { color: p.status === 'paid' ? '#16A34A' : colors.text }]}>
                    {naira(Number(p.amount ?? 0))}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero:      { paddingHorizontal: 20, paddingBottom: 20 },
  balCard:   { marginHorizontal: 16, marginTop: 16, borderRadius: 18, padding: 18, gap: 18 },
  balTop:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  tierPill:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  tierPillText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  balActions:   { flexDirection: 'row' },
  balAction:    { flex: 1, alignItems: 'center', gap: 6 },
  balActionIcon:{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  balActionLabel:{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  useCost:   { fontSize: 15, fontWeight: '800', minWidth: 46 },
  useReady:  { fontSize: 11, fontWeight: '700' },
  heroTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  heroTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  segRow: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, padding: 4, marginBottom: 18,
  },
  segBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8, borderRadius: 9,
  },
  segBtnActive:  { backgroundColor: '#fff' },
  segText:       { color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: '600' },
  segTextActive: { color: '#0F2B4C' },
  heroBody:  { alignItems: 'flex-start' },
  heroLabel: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 4 },
  pointsRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  heroBig:   { fontSize: 36, fontWeight: '900', color: '#fff' },
  heroUnit:  { fontSize: 15, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  heroNote:  { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 8, lineHeight: 17, maxWidth: 300 },
  teaser: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    margin: 16, marginBottom: 0, padding: 16, borderRadius: 14, borderWidth: 1,
  },
  teaserTitle: { fontSize: 15, fontWeight: '700' },
  teaserSub:   { fontSize: 13, marginTop: 2, lineHeight: 16 },
  // Last 7 days. Same shape as the driver's earnings card and the
  // customer's Rewards card, deliberately: one question, three ledgers.
  weekCard:  { borderWidth: 1, borderRadius: 14, padding: 16, marginHorizontal: 16,
               marginBottom: 16, gap: 14 },
  rangeToggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  rangeBtn:    { paddingHorizontal: 10, paddingVertical: 5 },
  rangeText:   { fontSize: 11, fontWeight: '700' },
  axisRow:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 },
  weekHead:  { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  weekTotal: { fontSize: 13, fontWeight: '700' },
  weekBars:  { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
               height: 86, gap: 6 },
  weekCol:   { flex: 1, alignItems: 'center', gap: 6 },
  // Full-height track so every bar shares one baseline and a short bar
  // does not float in the middle of the row.
  weekTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  weekBar:   { width: '100%', borderRadius: 4, minHeight: 3 },
  weekLabel: { fontSize: 11, fontWeight: '600' },
  weekFoot:  { fontSize: 13, lineHeight: 18 },
  section:      { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 14 },
  empty:        { alignItems: 'center', paddingVertical: 40, gap: 12, paddingHorizontal: 24 },
  emptyText:    { fontSize: 14, textAlign: 'center', lineHeight: 19 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1,
  },
  rowIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowSub:   { fontSize: 12, marginTop: 2 },
  rowAmt:   { fontSize: 15, fontWeight: '700' },
});
