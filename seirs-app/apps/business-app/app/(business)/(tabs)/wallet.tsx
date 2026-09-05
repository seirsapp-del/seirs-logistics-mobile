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
import { useColors } from '@/context/ThemeContext';
import { naira } from '@/utils/money';


type Segment = 'rewards' | 'earnings';

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const canPartner = !!(user as any)?.capabilities?.canPartner;

  const [segment,  setSegment]  = useState<Segment>('rewards');
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
  const week = (() => {
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = startOfDay(new Date());
    const DAY   = 24 * 60 * 60 * 1000;

    const days = Array.from({ length: 7 }, (_, i) => {
      const at = today - (6 - i) * DAY;
      return {
        at,
        label: new Date(at).toLocaleDateString('en-GB', { weekday: 'narrow' }),
        value: 0,
      };
    });

    const rows: any[] = segment === 'rewards' ? txns : payouts;
    for (const r of rows) {
      const raw = r?.createdAt ?? r?.date ?? r?.paidAt;
      const t = raw ? new Date(raw).getTime() : NaN;
      if (!Number.isFinite(t)) continue;       // an unreadable date must not invent a day
      const slot = days.find(d => d.at === startOfDay(new Date(t)));
      if (!slot) continue;
      const v = segment === 'rewards'
        ? Number(r?.pointsEarned ?? r?.points ?? 0)
        : Number(r?.amount ?? r?.amountNgn ?? 0);
      if (v > 0) slot.value += v;
    }

    const total = days.reduce((sum, d) => sum + d.value, 0);
    // Floor at 1 so a flat week is a flat row, not a full-height one.
    const peak  = Math.max(1, ...days.map(d => d.value));
    return { days, total, peak };
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

  const points = Number(loyalty?.points ?? 0);
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
          colors={['#0F2B4C', '#1a3a5c']}
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

          {loading ? (
            <ActivityIndicator color="#fff" style={{ marginVertical: 18 }} />
          ) : segment === 'rewards' ? (
            <View style={styles.heroBody}>
              <Text style={styles.heroLabel}>Total rewards</Text>
              <View style={styles.pointsRow}>
                <Text style={styles.heroBig}>{points.toLocaleString()}</Text>
                <Text style={styles.heroUnit}>points</Text>
              </View>
              <Text style={styles.heroNote}>Earn 1 point per ₦100 spent on deliveries.</Text>
            </View>
          ) : (
            <View style={styles.heroBody}>
              <Text style={styles.heroLabel}>SEIRS owes your store</Text>
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
                  <Text style={[styles.teaserTitle, { color: colors.primary }]}>Earn with SEIRS</Text>
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
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Last 7 days</Text>
                <Text style={[styles.weekTotal, { color: colors.primary }]}>
                  {week.total > 0
                    ? (segment === 'rewards' ? `+${week.total.toLocaleString()} pts` : naira(week.total))
                    : 'Nothing yet'}
                </Text>
              </View>
              <View style={styles.weekBars}>
                {week.days.map((d) => (
                  <View key={d.at} style={styles.weekCol}>
                    <View style={styles.weekTrack}>
                      <View style={[styles.weekBar, {
                        height: `${Math.round((d.value / week.peak) * 100)}%` as any,
                        backgroundColor: d.value > 0 ? colors.primary : colors.border,
                      }]} />
                    </View>
                    <Text style={[styles.weekLabel, { color: colors.textThird }]}>{d.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.weekFoot, { color: colors.textSecond }]}>
                {week.total > 0
                  ? (segment === 'rewards'
                      ? 'Every delivery you book adds to this.'
                      : 'Paid out to your business bank account weekly.')
                  : (segment === 'rewards'
                      ? 'Book a delivery and your points will show up here.'
                      : 'Payouts will show up here once packages move through your counter.')}
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Activity</Text>
              {loading ? (
                <ActivityIndicator color={colors.accent} />
              ) : txns.length === 0 ? (
                <View style={styles.empty}>
                  <Icon name="Star" size={32} color={colors.textThird} />
                  <Text style={[styles.emptyText, { color: colors.textThird }]}>
                    Book your first delivery to start earning points.
                  </Text>
                </View>
              ) : (
                txns
                  .filter((t: any) => t.status === 'success' && t.purpose === 'delivery')
                  .map((t: any, i: number) => {
                  const earned = Math.floor(Number(t.amountKobo ?? 0) / 100 / 100);
                  return (
                    <View key={t.id ?? i} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={[styles.rowIcon, { backgroundColor: '#FEF3C7' }]}>
                        <Icon name="Star" size={16} color="#D97706" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: colors.text }]}>
                          {t.delivery?.trackingCode ?? 'Delivery'}
                        </Text>
                        <Text style={[styles.rowSub, { color: colors.textThird }]}>
                          {new Date(t.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                      </View>
                      <Text style={[styles.rowAmt, { color: '#16A34A' }]}>
                        +{earned} pts
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          </>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Payouts</Text>
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
  hero:      { paddingHorizontal: 20, paddingBottom: 24 },
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
