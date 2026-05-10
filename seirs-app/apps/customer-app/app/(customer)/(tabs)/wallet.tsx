import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { paymentsApi } from '@/services/api';

interface ApiTx {
  id:        string;
  amount:    number;
  status:    string;
  type?:     'credit' | 'debit';
  method?:   string;
  label?:    string;
  createdAt: string;
}
import {
  CreditCard, ArrowDownCircle, ArrowUpCircle, Receipt,
  Plus, ArrowUp, Clock, QrCode,
} from 'lucide-react-native';
import { HamburgerButton } from '@/components/HamburgerButton';

type Tab = 'all' | 'credit' | 'debit';

export default function WalletScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [activeTab,    setTab]         = useState<Tab>('all');
  const [withdrawing,  setWithdrawing]  = useState(false);
  const [balance,      setBalance]      = useState(0);
  const [transactions, setTransactions] = useState<ApiTx[]>([]);
  const [loading,      setLoading]      = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [w, h] = await Promise.all([
        paymentsApi.wallet().catch(() => null),
        paymentsApi.history().catch(() => []),
      ]);
      if (w) setBalance(w.balanceNaira ?? 0);
      // Backend returns Payment rows; we infer credit/debit from amount sign or type
      const txs = (Array.isArray(h) ? h : []).map((t: any): ApiTx => ({
        id:        t.id,
        amount:    Math.abs(Number(t.amount ?? t.amountNaira ?? 0)),
        status:    t.status,
        type:      t.type ?? (Number(t.amount ?? 0) >= 0 ? 'credit' : 'debit'),
        method:    t.method ?? 'Wallet',
        label:     t.label ?? t.description ?? (t.deliveryId ? 'Delivery' : 'Wallet activity'),
        createdAt: t.createdAt ?? new Date().toISOString(),
      }));
      setTransactions(txs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Escrow approximation: pending tx amounts. Backend will surface this
  // explicitly once the wallet endpoint is extended; for now we derive it.
  const escrow    = transactions
    .filter(t => t.status === 'pending')
    .reduce((s, t) => s + (t.type === 'credit' ? t.amount : 0), 0);
  const available = Math.max(0, balance - escrow);

  const filtered = transactions.filter(tx =>
    activeTab === 'all' ? true : tx.type === activeTab,
  );

  const handleWithdraw = () => {
    Alert.prompt(
      'Withdraw Funds',
      'Enter amount to withdraw (₦). Funds will be sent to your registered bank account.',
      async (input) => {
        const amount = parseFloat(input ?? '');
        if (!amount || amount <= 0) { Alert.alert('Invalid amount'); return; }
        if (amount > available) { Alert.alert('Insufficient balance', `Available: ₦${available.toLocaleString()}`); return; }
        setWithdrawing(true);
        try {
          await paymentsApi.withdraw(amount);
          Alert.alert('Withdrawal initiated', `₦${amount.toLocaleString()} will be sent to your bank account within 24 hours.`);
          refresh();
        } catch (e: any) {
          Alert.alert('Withdrawal failed', e.message ?? 'Please try again.');
        } finally {
          setWithdrawing(false);
        }
      },
      'plain-text',
    );
  };

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
            <Text style={[styles.title, { color: theme.text }]}>My Wallet</Text>
          </View>
          <Pressable
            style={[styles.iconBtn, { backgroundColor: theme.surfaceSecond }]}
            onPress={() => router.push('/(customer)/payment-methods' as any)}
          >
            <CreditCard size={20} color={theme.text} strokeWidth={1.75} />
          </Pressable>
        </View>

        {/* Balance card */}
        <View style={styles.cardWrap}>
          <LinearGradient
            colors={isDark ? ['#1C2128', '#0D1117'] : ['#0F2B4C', '#1A3A63']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.balanceCard, Shadows.navy]}
          >
            <Text style={styles.balanceLabel}>Wallet Balance</Text>
            <Text style={styles.balanceAmount}>
              ₦{balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </Text>

            {/* Escrow breakdown */}
            <View style={styles.escrowRow}>
              <View style={styles.escrowItem}>
                <Text style={styles.escrowLabel}>Available</Text>
                <Text style={styles.escrowValue}>₦{available.toLocaleString()}</Text>
              </View>
              <View style={[styles.escrowDivider]} />
              <View style={styles.escrowItem}>
                <View style={styles.escrowTitleRow}>
                  <Clock size={11} color="rgba(255,255,255,0.6)" strokeWidth={2} />
                  <Text style={styles.escrowLabel}>Pending (escrow)</Text>
                </View>
                <Text style={styles.escrowValue}>₦{escrow.toLocaleString()}</Text>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.cardActions}>
              {[
                {
                  Icon: Plus,
                  label: 'Top Up',
                  onPress: () => router.push('/(customer)/add-payment' as any),
                },
                {
                  Icon: ArrowUp,
                  label: 'Withdraw',
                  onPress: handleWithdraw,
                },
                {
                  Icon: CreditCard,
                  label: 'Cards',
                  onPress: () => router.push('/(customer)/payment-methods' as any),
                },
                {
                  Icon: QrCode,
                  label: 'My ID',
                  onPress: () => router.push('/(customer)/recipient-id' as any),
                },
              ].map(({ Icon, label, onPress }) => (
                <Pressable key={label} style={styles.cardActionBtn} onPress={onPress}>
                  <View style={styles.cardActionIcon}>
                    <Icon size={20} color="#fff" strokeWidth={2} />
                  </View>
                  <Text style={styles.cardActionLabel}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </LinearGradient>
        </View>

        {/* Stats */}
        <View style={[styles.statsRow, { backgroundColor: theme.surface }, Shadows.sm]}>
          {[
            { label: 'Total Spent',  value: `₦${transactions.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0).toLocaleString()}` },
            { label: 'Total Earned', value: `₦${transactions.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0).toLocaleString()}` },
            { label: 'Transactions', value: `${transactions.length}` },
          ].map((stat, i) => (
            <View key={stat.label} style={[styles.statItem, i < 2 && { borderRightWidth: 1, borderRightColor: theme.border }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecond }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Transactions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Transactions</Text>

          <View style={[styles.tabRow, { backgroundColor: theme.surfaceSecond }]}>
            {(['all', 'credit', 'debit'] as Tab[]).map(tab => (
              <Pressable
                key={tab}
                style={[styles.tab, activeTab === tab && { backgroundColor: theme.primary }]}
                onPress={() => setTab(tab)}
              >
                <Text style={[styles.tabText, { color: activeTab === tab ? '#fff' : theme.textSecond }]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {filtered.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface }]}>
              <Receipt size={40} color={theme.textThird} strokeWidth={1.5} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No transactions</Text>
            </View>
          ) : (
            filtered.map(tx => (
              <Pressable
                key={tx.id}
                style={[styles.txRow, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
                onPress={() => router.push({ pathname: '/(customer)/transaction/[id]', params: { id: tx.id } } as any)}
              >
                <View style={[styles.txIcon, { backgroundColor: (tx.type === 'credit' ? theme.success : theme.error) + '18' }]}>
                  {tx.type === 'credit'
                    ? <ArrowDownCircle size={20} color={theme.success} strokeWidth={1.75} />
                    : <ArrowUpCircle   size={20} color={theme.error}   strokeWidth={1.75} />
                  }
                </View>
                <View style={styles.txInfo}>
                  <Text style={[styles.txLabel, { color: theme.text }]}>{tx.label}</Text>
                  <Text style={[styles.txMeta,  { color: theme.textSecond }]}>
                    {new Date(tx.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })} · {tx.method}
                  </Text>
                </View>
                <View style={styles.txRight}>
                  <Text style={[styles.txAmount, { color: tx.type === 'credit' ? theme.success : theme.error }]}>
                    {tx.type === 'credit' ? '+' : '−'}₦{tx.amount.toLocaleString()}
                  </Text>
                  <View style={[
                    styles.statusDot,
                    { backgroundColor: tx.status === 'success' ? theme.success : tx.status === 'pending' ? theme.warning : theme.error },
                  ]} />
                </View>
              </Pressable>
            ))
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  title:     { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  iconBtn:   { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  cardWrap:      { marginHorizontal: Spacing.md, marginBottom: Spacing.md },
  balanceCard:   { borderRadius: Radius.xl, padding: Spacing.lg },
  balanceLabel:  { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.sm, marginBottom: Spacing.xs },
  balanceAmount: { color: '#fff', fontSize: 36, fontWeight: FontWeight.bold, letterSpacing: -0.5, marginBottom: Spacing.md },

  escrowRow:     { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.lg },
  escrowItem:    { flex: 1, gap: 4 },
  escrowTitleRow:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
  escrowDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: Spacing.md },
  escrowLabel:   { color: 'rgba(255,255,255,0.6)', fontSize: FontSize.xs },
  escrowValue:   { color: '#FFFFFF', fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  cardActions:    { flexDirection: 'row' },
  cardActionBtn:  { flex: 1, alignItems: 'center', gap: 6 },
  cardActionIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  cardActionLabel:{ color: 'rgba(255,255,255,0.9)', fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  statsRow:  { marginHorizontal: Spacing.md, borderRadius: Radius.xl, flexDirection: 'row', marginBottom: Spacing.lg },
  statItem:  { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
  statValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  statLabel: { fontSize: FontSize.xs, marginTop: 2 },

  section:      { paddingHorizontal: Spacing.md },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, marginBottom: Spacing.md },

  tabRow:  { flexDirection: 'row', borderRadius: Radius.full, padding: 3, marginBottom: Spacing.md },
  tab:     { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.full },
  tabText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  emptyCard:  { alignItems: 'center', gap: Spacing.sm, padding: Spacing.xl, borderRadius: Radius.xl },
  emptyTitle: { fontSize: FontSize.base, fontWeight: FontWeight.medium },

  txRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, marginBottom: Spacing.sm },
  txIcon:    { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  txInfo:    { flex: 1 },
  txLabel:   { fontSize: FontSize.base, fontWeight: FontWeight.semibold, marginBottom: 2 },
  txMeta:    { fontSize: FontSize.xs },
  txRight:   { alignItems: 'flex-end', gap: 4 },
  txAmount:  { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
});
