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

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

type Segment = 'rewards' | 'earnings';

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const canPartner = !!(user as any)?.capabilities?.canPartner;

  const [segment,  setSegment]  = useState<Segment>('rewards');
  const [wallet,   setWallet]   = useState<any>(null);
  const [txns,     setTxns]     = useState<any[]>([]);
  const [loyalty,  setLoyalty]  = useState<any>(null);
  const [payouts,  setPayouts]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const loads: Promise<any>[] = [
      businessApi.wallet().catch(() => null),
      // Points come from payments that actually settled, not from the
      // retired wallet ledger: this feed was still listing naira debits
      // like "-N10,103" for a sender who holds no balance (2026-08-16).
      paymentsApi.history().catch(() => []),
      businessApi.loyalty().catch(() => null),
    ];
    if (canPartner) loads.push(partnerApi.payouts(1).catch(() => null));
    Promise.all(loads).then(([w, t, l, p]) => {
      setWallet(w);
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
            <Text style={styles.heroTitle}>Wallet</Text>
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
              <Text style={styles.heroBig}>{fmt(pendingOwed)}</Text>
              <Text style={styles.heroNote}>
                Paid out so far: {fmt(paidOut)} · settled weekly to your business bank account.
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
                    {fmt(Number(p.amount ?? 0))}
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
  noteCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    margin: 16, marginBottom: 0, padding: 14, borderRadius: 12, borderWidth: 1,
  },
  noteText:  { flex: 1, fontSize: 13, lineHeight: 17 },
  teaser: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    margin: 16, marginBottom: 0, padding: 16, borderRadius: 14, borderWidth: 1,
  },
  teaserTitle: { fontSize: 15, fontWeight: '700' },
  teaserSub:   { fontSize: 13, marginTop: 2, lineHeight: 16 },
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
