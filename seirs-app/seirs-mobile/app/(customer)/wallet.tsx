import {
  View, Text, Pressable, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { paymentsApi } from '@/services/api';

const METHOD_LABELS: Record<string, string> = {
  card:             '💳 Card',
  bank_transfer:    '🏦 Bank Transfer',
  mobile_money:     '📱 Mobile Money',
  wallet:           '👛 Wallet',
  cash_on_delivery: '💵 Cash',
};

const STATUS_COLORS: Record<string, string> = {
  success:   '#22C55E',
  pending:   '#FACC15',
  failed:    '#EF4444',
  refunded:  '#3B82F6',
  cancelled: '#9CA3AF',
};

export default function WalletScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [balance, setBalance]   = useState<{ balanceNaira: number; currency: string } | null>(null);
  const [history, setHistory]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([paymentsApi.wallet(), paymentsApi.history()])
      .then(([b, h]) => { setBalance(b); setHistory(h); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>My Wallet</Text>
        </View>

        {/* Balance card */}
        <View style={[styles.balanceCard, { backgroundColor: theme.primary }]}>
          <Text style={styles.balanceLabel}>Wallet Balance</Text>
          <Text style={styles.balanceAmount}>
            ₦{(balance?.balanceNaira ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </Text>
          <Text style={styles.balanceCurrency}>{balance?.currency ?? 'NGN'}</Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          {[
            { icon: '➕', label: 'Top Up' },
            { icon: '📤', label: 'Send' },
            { icon: '🏦', label: 'Withdraw' },
          ].map((a) => (
            <Pressable
              key={a.label}
              style={[styles.actionBtn, { backgroundColor: theme.surface }, Shadows.sm]}
            >
              <Text style={styles.actionIcon}>{a.icon}</Text>
              <Text style={[styles.actionLabel, { color: theme.text }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Transaction history */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Transaction History</Text>
          {history.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={[styles.emptyText, { color: theme.textSecond }]}>No transactions yet</Text>
            </View>
          ) : (
            history.map((tx) => (
              <View key={tx.id} style={[styles.txCard, { backgroundColor: theme.surface }, Shadows.sm]}>
                <View style={styles.txLeft}>
                  <Text style={styles.txIcon}>{METHOD_LABELS[tx.method]?.split(' ')[0] ?? '💳'}</Text>
                  <View>
                    <Text style={[styles.txMethod, { color: theme.text }]}>
                      {METHOD_LABELS[tx.method] ?? tx.method}
                    </Text>
                    <Text style={[styles.txDate, { color: theme.textSecond }]}>
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
                <View style={styles.txRight}>
                  <Text style={[styles.txAmount, { color: theme.text }]}>
                    ₦{(tx.amountKobo / 100).toLocaleString()}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[tx.status] ?? '#9CA3AF') + '20' }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[tx.status] ?? '#9CA3AF' }]}>
                      {tx.status}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { padding: Spacing.xl, paddingBottom: Spacing.md },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold },
  balanceCard: {
    marginHorizontal: Spacing.xl,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  balanceLabel: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm, marginBottom: Spacing.sm },
  balanceAmount: { color: '#fff', fontSize: FontSize['3xl'], fontWeight: FontWeight.bold },
  balanceCurrency: { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.sm, marginTop: 4 },
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  actionBtn: { flex: 1, padding: Spacing.md, borderRadius: Radius.md, alignItems: 'center', gap: 4 },
  actionIcon: { fontSize: 24 },
  actionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  section: { paddingHorizontal: Spacing.xl },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, marginBottom: Spacing.md },
  emptyCard: { padding: Spacing.xl, borderRadius: Radius.lg, alignItems: 'center', gap: Spacing.sm },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: FontSize.sm },
  txCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  txLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  txIcon: { fontSize: 22 },
  txMethod: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  txDate: { fontSize: FontSize.xs, marginTop: 2 },
  txRight: { alignItems: 'flex-end', gap: 4 },
  txAmount: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full },
  statusText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
});
