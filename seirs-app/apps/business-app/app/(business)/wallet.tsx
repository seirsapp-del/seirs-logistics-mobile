import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/Icon';
import { businessApi } from '@/services/api';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

const QUICK_AMOUNTS = [5000, 10000, 25000, 50000, 100000];

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const [wallet,   setWallet]   = useState<any>(null);
  const [txns,     setTxns]     = useState<any[]>([]);
  const [loyalty,  setLoyalty]  = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [amount,   setAmount]   = useState('');
  const [funding,  setFunding]  = useState(false);
  const [showFund, setShowFund] = useState(false);

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

  const handleFund = async () => {
    const n = Number(amount);
    if (!n || n < 100) { Alert.alert('Invalid amount', 'Minimum top-up is ₦100'); return; }
    setFunding(true);
    try {
      await businessApi.fundWallet(n);
      const w = await businessApi.wallet();
      setWallet(w);
      setAmount('');
      setShowFund(false);
      Alert.alert('Wallet Funded', `₦${n.toLocaleString()} has been added to your wallet.`);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Payment failed.');
    } finally {
      setFunding(false);
    }
  };

  const txnIcon = (type: string) => {
    if (type === 'credit') return 'ArrowDownLeft';
    if (type === 'delivery') return 'Package';
    return 'ArrowUpRight';
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F0' }}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Balance header */}
        <LinearGradient
          colors={['#0F2B4C', '#1a3a5c']}
          style={[styles.hero, { paddingTop: insets.top + 20 }]}
        >
          <Text style={styles.heroLabel}>Business Wallet Balance</Text>
          {loading ? (
            <ActivityIndicator color="#fff" style={{ marginVertical: 12 }} />
          ) : (
            <Text style={styles.heroBalance}>{fmt(wallet?.balance ?? 0)}</Text>
          )}
          <View style={styles.heroBtns}>
            <Pressable style={styles.heroBtn} onPress={() => setShowFund((v) => !v)}>
              <Icon name="Plus" size={16} color="#0F2B4C" />
              <Text style={styles.heroBtnText}>Fund</Text>
            </Pressable>
          </View>
        </LinearGradient>

        {/* Fund panel */}
        {showFund && (
          <View style={styles.fundPanel}>
            <Text style={styles.fundTitle}>Top-Up Amount</Text>
            <View style={styles.quickRow}>
              {QUICK_AMOUNTS.map((q) => (
                <Pressable
                  key={q}
                  style={[styles.quickBtn, amount === String(q) && styles.quickBtnActive]}
                  onPress={() => setAmount(String(q))}
                >
                  <Text style={[styles.quickText, amount === String(q) && styles.quickTextActive]}>
                    ₦{(q / 1000).toFixed(0)}k
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.amtRow}>
              <Text style={styles.currency}>₦</Text>
              <TextInput
                style={styles.amtInput}
                value={amount}
                onChangeText={setAmount}
                placeholder="Custom amount"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
              />
            </View>
            <Pressable
              style={[styles.fundBtn, (!amount || funding) && styles.fundBtnDisabled]}
              onPress={handleFund}
              disabled={!amount || funding}
            >
              {funding
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.fundBtnText}>Pay via Flutterwave</Text>
              }
            </Pressable>
          </View>
        )}

        {/* Loyalty */}
        {loyalty && (
          <View style={styles.loyaltyCard}>
            <View style={styles.loyaltyLeft}>
              <Icon name="Star" size={20} color="#7C3AED" />
              <View>
                <Text style={styles.loyaltyTitle}>Loyalty Points</Text>
                <Text style={styles.loyaltySub}>Earn 1 point per ₦500 spent</Text>
              </View>
            </View>
            <View style={styles.loyaltyRight}>
              <Text style={styles.loyaltyPoints}>{loyalty.points ?? 0}</Text>
              <Text style={styles.loyaltyLabel}>pts</Text>
            </View>
          </View>
        )}

        {/* Transactions */}
        <View style={styles.txnsSection}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
          {loading ? (
            <ActivityIndicator color="#3A7BD5" />
          ) : txns.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="CreditCard" size={32} color="#D1D5DB" />
              <Text style={styles.emptyText}>No transactions yet</Text>
            </View>
          ) : (
            txns.map((t, i) => (
              <View key={t.id ?? i} style={styles.txnRow}>
                <View style={[styles.txnIcon, { backgroundColor: t.type === 'credit' ? '#DCFCE7' : '#FEF3C7' }]}>
                  <Icon
                    name={txnIcon(t.type)}
                    size={16}
                    color={t.type === 'credit' ? '#16A34A' : '#D97706'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txnDesc}>{t.description ?? t.type}</Text>
                  <Text style={styles.txnDate}>
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
  heroBtns:      { flexDirection: 'row', gap: 12 },
  heroBtn:       {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10,
  },
  heroBtnText:   { fontSize: 14, fontWeight: '700', color: '#0F2B4C' },
  fundPanel:     {
    backgroundColor: '#fff', margin: 16, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  fundTitle:     { fontSize: 15, fontWeight: '700', color: '#0F2B4C', marginBottom: 14 },
  quickRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  quickBtn:      {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F5F5F0', borderWidth: 1, borderColor: '#E5E7EB',
  },
  quickBtnActive: { backgroundColor: '#0F2B4C', borderColor: '#0F2B4C' },
  quickText:     { fontSize: 13, fontWeight: '600', color: '#374151' },
  quickTextActive: { color: '#fff' },
  amtRow:        {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F5F5F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 14,
  },
  currency:      { fontSize: 18, fontWeight: '700', color: '#0F2B4C', marginRight: 6 },
  amtInput:      { flex: 1, fontSize: 18, fontWeight: '700', color: '#0F2B4C' },
  fundBtn:       { backgroundColor: '#0F2B4C', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  fundBtnDisabled: { opacity: 0.4 },
  fundBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
  loyaltyCard:   {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#F5F3FF', borderRadius: 14, margin: 16, padding: 16,
    borderWidth: 1, borderColor: '#DDD6FE',
  },
  loyaltyLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  loyaltyTitle:  { fontSize: 14, fontWeight: '700', color: '#0F2B4C' },
  loyaltySub:    { fontSize: 11, color: '#7C3AED', marginTop: 2 },
  loyaltyRight:  { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  loyaltyPoints: { fontSize: 28, fontWeight: '900', color: '#7C3AED' },
  loyaltyLabel:  { fontSize: 13, color: '#7C3AED', fontWeight: '600' },
  txnsSection:   { padding: 16 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', color: '#0F2B4C', marginBottom: 14 },
  empty:         { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText:     { fontSize: 14, color: '#9CA3AF' },
  txnRow:        {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  txnIcon:       {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  txnDesc:       { fontSize: 13, fontWeight: '600', color: '#0F2B4C' },
  txnDate:       { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  txnAmount:     { fontSize: 14, fontWeight: '700' },
});
