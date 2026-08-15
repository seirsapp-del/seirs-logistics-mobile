import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { Drawer } from '@/components/Drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/Icon';
import { businessApi } from '@/services/api';
import { useColors, useTheme } from '@/context/ThemeContext';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { isDark } = useTheme();
  const [wallet,   setWallet]   = useState<any>(null);
  const [txns,     setTxns]     = useState<any[]>([]);
  const [loyalty,  setLoyalty]  = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      businessApi.wallet(),
      businessApi.transactions(),
      businessApi.loyalty(),
    ]).then(([w, t, l]) => {
      setWallet(w);
      setTxns(Array.isArray(t) ? t : t?.items ?? []);
      setLoyalty(l);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const txnIcon = (type: string) => {
    if (type === 'credit') return 'Plus';
    if (type === 'delivery') return 'Package';
    return 'Minus';
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Drawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Funding is gone (founder 2026-08-16: "we are not a bank").
            Businesses pay per booking through Flutterwave; nobody
            deposits money with SEIRS. Any remaining legacy balance
            simply drains against upcoming bookings. This screen becomes
            the full Billing home in the pay-per-booking rebuild. */}
        <LinearGradient
          colors={['#0F2B4C', '#1a3a5c']}
          style={[styles.hero, { paddingTop: insets.top + 20 }]}
        >
          <Pressable onPress={() => setDrawerOpen(true)} hitSlop={10} style={{ marginBottom: 14 }}>
            <Icon name="AlignLeft" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.heroLabel}>Billing</Text>
          {loading ? (
            <ActivityIndicator color="#fff" style={{ marginVertical: 12 }} />
          ) : (
            <>
              <Text style={styles.heroBalance}>{fmt(wallet?.balance ?? 0)}</Text>
              <Text style={styles.heroNote}>
                {Number(wallet?.balance ?? 0) > 0
                  ? 'Remaining credit: it is spent on your next bookings. New bookings are paid per booking via Flutterwave.'
                  : 'You pay per booking via Flutterwave. No deposits, no top-ups.'}
              </Text>
            </>
          )}
        </LinearGradient>

        {loyalty && (
          <View style={[styles.loyaltyCard, {
            backgroundColor: isDark ? '#2A1B47' : '#F5F3FF',
            borderColor:     isDark ? '#5E3FB1' : '#DDD6FE',
          }]}>
            <View style={styles.loyaltyLeft}>
              <Icon name="Star" size={20} color="#D97706" />
              <View>
                <Text style={[styles.loyaltyTitle, { color: colors.text }]}>Loyalty Points</Text>
                <Text style={styles.loyaltySub}>Earn 1 point per ₦100 spent</Text>
              </View>
            </View>
            <View style={styles.loyaltyRight}>
              <Text style={styles.loyaltyPoints}>{loyalty.points ?? 0}</Text>
              <Text style={styles.loyaltyLabel}>pts</Text>
            </View>
          </View>
        )}

        <View style={styles.txnsSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Transaction History</Text>
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : txns.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="CreditCard" size={32} color={colors.textThird} />
              <Text style={[styles.emptyText, { color: colors.textThird }]}>No transactions yet</Text>
            </View>
          ) : (
            txns.map((t, i) => (
              <View
                key={t.id ?? i}
                style={[styles.txnRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.txnIcon, { backgroundColor: t.type === 'credit' ? '#DCFCE7' : '#FEF3C7' }]}>
                  <Icon name={txnIcon(t.type)} size={16}
                    color={t.type === 'credit' ? '#16A34A' : '#D97706'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.txnDesc, { color: colors.text }]}>{t.description ?? t.type}</Text>
                  <Text style={[styles.txnDate, { color: colors.textThird }]}>
                    {new Date(t.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
                <Text style={[styles.txnAmount, { color: t.type === 'credit' ? '#16A34A' : '#DC2626' }]}>
                  {t.type === 'credit' ? '+' : '-'}{fmt(t.amount)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero:          { paddingHorizontal: 24, paddingBottom: 32 },
  heroLabel:     { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 6 },
  heroBalance:   { fontSize: 34, fontWeight: '900', color: '#fff', marginBottom: 20 },
  heroNote:      { fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 17, maxWidth: 300 },
  loyaltyCard:   {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: 14, margin: 16, padding: 16, borderWidth: 1,
  },
  loyaltyLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  loyaltyTitle:  { fontSize: 14, fontWeight: '700' },
  loyaltySub:    { fontSize: 11, color: '#D97706', marginTop: 2 },
  loyaltyRight:  { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  loyaltyPoints: { fontSize: 28, fontWeight: '900', color: '#D97706' },
  loyaltyLabel:  { fontSize: 13, color: '#D97706', fontWeight: '600' },
  txnsSection:   { padding: 16 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', marginBottom: 14 },
  empty:         { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText:     { fontSize: 14 },
  txnRow:        {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1,
  },
  txnIcon:       {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  txnDesc:       { fontSize: 13, fontWeight: '600' },
  txnDate:       { fontSize: 11, marginTop: 2 },
  txnAmount:     { fontSize: 14, fontWeight: '700' },
});
