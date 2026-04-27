import {
  View, Text, Pressable, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { paymentsApi } from '@/services/api';

type Tab = 'all' | 'ongoing' | 'completed' | 'cancelled';

const STATUS_COLORS: Record<string, string> = {
  success:   '#22C55E',
  pending:   '#FFBE0B',
  failed:    '#EF4444',
  refunded:  '#00C2FF',
  cancelled: '#71717A',
};

const METHOD_ICONS: Record<string, string> = {
  card:             'card',
  bank_transfer:    'business',
  mobile_money:     'phone-portrait',
  wallet:           'wallet',
  cash_on_delivery: 'cash',
};

export default function WalletScreen() {
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const isDark      = colorScheme === 'dark';

  const [balance,  setBalance]  = useState<{ balanceNaira: number; currency: string } | null>(null);
  const [history,  setHistory]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [activeTab, setTab]     = useState<Tab>('all');

  useEffect(() => {
    Promise.all([paymentsApi.wallet(), paymentsApi.history()])
      .then(([b, h]) => { setBalance(b); setHistory(h); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = history.filter((tx) => {
    if (activeTab === 'all')       return true;
    if (activeTab === 'ongoing')   return tx.status === 'pending';
    if (activeTab === 'completed') return tx.status === 'success';
    if (activeTab === 'cancelled') return ['failed', 'cancelled', 'refunded'].includes(tx.status);
    return true;
  });

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.primary} size="large" />
      </SafeAreaView>
    );
  }

  const walletColors = isDark
    ? [theme.walletCard, theme.walletCardEnd] as const
    : [theme.walletCard, theme.walletCardEnd] as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.xl }}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>My Wallet</Text>
          <Pressable style={[styles.historyBtn, { backgroundColor: theme.surface }]}>
            <Ionicons name="time-outline" size={20} color={theme.textSecond} />
          </Pressable>
        </View>

        {/* Balance card */}
        <View style={styles.cardWrap}>
          <LinearGradient
            colors={walletColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.balanceCard, isDark ? Shadows.orange : Shadows.lg]}
          >
            <Text style={styles.balanceLabel}>Wallet Balance</Text>
            <Text style={styles.balanceAmount}>
              ₦{(balance?.balanceNaira ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </Text>
            <Text style={styles.balanceSub}>+12.5% this week</Text>

            {/* Action buttons */}
            <View style={styles.cardActions}>
              {[
                { icon: 'add-circle', label: 'Top Up' },
                { icon: 'paper-plane', label: 'Send' },
                { icon: 'time', label: 'History' },
              ].map((a) => (
                <Pressable key={a.label} style={styles.cardActionBtn}>
                  <View style={styles.cardActionIcon}>
                    <Ionicons name={a.icon as any} size={20} color="#fff" />
                  </View>
                  <Text style={styles.cardActionLabel}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
          </LinearGradient>
        </View>

        {/* Quick transfer row */}
        <View style={[styles.transferCard, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Pressable style={styles.transferItem}>
            <View style={[styles.transferIcon, { backgroundColor: '#FFF0E8' }]}>
              <Ionicons name="arrow-up-circle" size={22} color="#F4600C" />
            </View>
            <Text style={[styles.transferLabel, { color: theme.text }]}>Withdraw</Text>
          </Pressable>
          <View style={[styles.transferDivider, { backgroundColor: theme.border }]} />
          <Pressable style={styles.transferItem}>
            <View style={[styles.transferIcon, { backgroundColor: '#E8F8F0' }]}>
              <Ionicons name="arrow-down-circle" size={22} color="#22C55E" />
            </View>
            <Text style={[styles.transferLabel, { color: theme.text }]}>Receive</Text>
          </Pressable>
          <View style={[styles.transferDivider, { backgroundColor: theme.border }]} />
          <Pressable style={styles.transferItem}>
            <View style={[styles.transferIcon, { backgroundColor: '#E8F0FF' }]}>
              <Ionicons name="card" size={22} color="#3A86FF" />
            </View>
            <Text style={[styles.transferLabel, { color: theme.text }]}>Pay</Text>
          </Pressable>
        </View>

        {/* Transaction history */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Transactions</Text>

          {/* Filter tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
            {(['all', 'ongoing', 'completed', 'cancelled'] as Tab[]).map((t) => (
              <Pressable
                key={t}
                style={[
                  styles.tab,
                  {
                    backgroundColor: activeTab === t ? theme.primary : theme.surface,
                    borderColor: activeTab === t ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => setTab(t)}
              >
                <Text style={[
                  styles.tabText,
                  { color: activeTab === t ? '#fff' : theme.textSecond },
                ]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {filtered.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Ionicons name="receipt-outline" size={44} color={theme.textThird} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No transactions</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>
                Your transaction history will appear here
              </Text>
            </View>
          ) : (
            filtered.map((tx) => (
              <View
                key={tx.id}
                style={[styles.txRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                <View style={[styles.txIconWrap, { backgroundColor: theme.surfaceSecond }]}>
                  <Ionicons
                    name={(METHOD_ICONS[tx.method] ?? 'card') as any}
                    size={20}
                    color={theme.textSecond}
                  />
                </View>
                <View style={styles.txInfo}>
                  <Text style={[styles.txMethod, { color: theme.text }]}>
                    {tx.method?.replace(/_/g, ' ')?.replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  </Text>
                  <Text style={[styles.txDate, { color: theme.textSecond }]}>
                    {new Date(tx.createdAt).toLocaleDateString('en-NG', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                </View>
                <View style={styles.txRight}>
                  <Text style={[styles.txAmount, { color: theme.text }]}>
                    ₦{(tx.amountKobo / 100).toLocaleString()}
                  </Text>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: (STATUS_COLORS[tx.status] ?? '#9CA3AF') + '20' },
                  ]}>
                    <Text style={[
                      styles.statusText,
                      { color: STATUS_COLORS[tx.status] ?? '#9CA3AF' },
                    ]}>
                      {tx.status}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  title:      { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  historyBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  cardWrap:      { marginHorizontal: Spacing.md, marginBottom: Spacing.md },
  balanceCard:   { borderRadius: Radius.xl, padding: Spacing.lg },
  balanceLabel:  { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm, marginBottom: Spacing.xs },
  balanceAmount: { color: '#fff', fontSize: FontSize['3xl'], fontWeight: FontWeight.bold, letterSpacing: -0.5, marginBottom: 4 },
  balanceSub:    { color: 'rgba(255,255,255,0.65)', fontSize: FontSize.xs, marginBottom: Spacing.md },
  cardActions:   { flexDirection: 'row', gap: Spacing.sm },
  cardActionBtn: { flex: 1, alignItems: 'center', gap: 6 },
  cardActionIcon:{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  cardActionLabel:{ color: 'rgba(255,255,255,0.9)', fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  transferCard: { marginHorizontal: Spacing.md, borderRadius: Radius.xl, flexDirection: 'row', padding: Spacing.md, marginBottom: Spacing.lg },
  transferItem: { flex: 1, alignItems: 'center', gap: 6 },
  transferIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  transferLabel:{ fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  transferDivider:{ width: 1, marginVertical: 8 },

  section:      { paddingHorizontal: Spacing.md },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, marginBottom: Spacing.md },

  tabs: { marginBottom: Spacing.md },
  tab:  { paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1, marginRight: Spacing.sm },
  tabText:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  emptyCard:  { padding: Spacing.xl, borderRadius: Radius.xl, alignItems: 'center', gap: Spacing.sm },
  emptyTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  emptyDesc:  { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },

  txRow:    { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, marginBottom: Spacing.sm, gap: Spacing.md },
  txIconWrap:{ width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  txInfo:   { flex: 1, gap: 3 },
  txMethod: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  txDate:   { fontSize: FontSize.xs },
  txRight:  { alignItems: 'flex-end', gap: 4 },
  txAmount: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  statusText:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
});
