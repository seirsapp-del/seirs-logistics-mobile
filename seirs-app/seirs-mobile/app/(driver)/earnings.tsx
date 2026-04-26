import {
  View, Text, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows, Palette } from '@/constants/theme';
import { paymentsApi } from '@/services/api';

export default function EarningsScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [balance, setBalance]       = useState<{ balanceNaira: number } | null>(null);
  const [history, setHistory]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [message, setMessage]       = useState('');

  useEffect(() => {
    Promise.all([paymentsApi.wallet(), paymentsApi.history()])
      .then(([b, h]) => { setBalance(b); setHistory(h); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleWithdraw = async () => {
    const amount = Number(withdrawAmount);
    if (!amount || amount < 1000) {
      setMessage('Minimum withdrawal is ₦1,000.');
      return;
    }
    setWithdrawing(true);
    try {
      const res = await paymentsApi.withdraw(amount);
      setMessage(res.message);
      setWithdrawModal(false);
      // Refresh balance
      const b = await paymentsApi.wallet();
      setBalance(b);
    } catch (e: any) {
      setMessage(e.message ?? 'Withdrawal failed.');
    } finally {
      setWithdrawing(false);
    }
  };

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
          <Text style={[styles.title, { color: theme.text }]}>Earnings</Text>
        </View>

        {/* Balance card */}
        <View style={[styles.balanceCard, { backgroundColor: theme.primary }]}>
          <Text style={styles.balLabel}>Available Balance</Text>
          <Text style={styles.balAmount}>
            ₦{(balance?.balanceNaira ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </Text>
          <Pressable
            style={styles.withdrawBtn}
            onPress={() => setWithdrawModal(true)}
          >
            <Text style={styles.withdrawBtnText}>Withdraw to Bank →</Text>
          </Pressable>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { label: 'Total Trips',   value: history.length.toString() },
            { label: 'This Week',     value: '₦0' },
            { label: 'Avg per Trip',  value: history.length ? `₦${Math.round((balance?.balanceNaira ?? 0) / history.length)}` : '—' },
          ].map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecond }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {message ? (
          <View style={[styles.msgBox, { backgroundColor: theme.success + '18' }]}>
            <Text style={[styles.msgText, { color: theme.success }]}>{message}</Text>
          </View>
        ) : null}

        {/* Earnings history */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Payouts</Text>
          {history.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Text style={styles.emptyIcon}>💰</Text>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No earnings yet</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>
                Complete deliveries to start earning.
              </Text>
            </View>
          ) : (
            history.map((tx) => (
              <View key={tx.id} style={[styles.txRow, { backgroundColor: theme.surface }, Shadows.sm]}>
                <View style={[styles.txIcon, { backgroundColor: Palette.success + '18' }]}>
                  <Text>💚</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.txTitle, { color: theme.text }]}>Delivery payout</Text>
                  <Text style={[styles.txDate, { color: theme.textSecond }]}>
                    {new Date(tx.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: theme.success }]}>
                  +₦{(tx.amountKobo / 100 * 0.8).toLocaleString()}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>

      {/* Withdraw modal */}
      <Modal visible={withdrawModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Withdraw Earnings</Text>
            <Text style={[styles.modalSub, { color: theme.textSecond }]}>
              Available: ₦{(balance?.balanceNaira ?? 0).toLocaleString()}
            </Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="Amount (min ₦1,000)"
              placeholderTextColor={theme.textSecond}
              keyboardType="numeric"
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
            />
            {message ? <Text style={[styles.modalMsg, { color: theme.error }]}>{message}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalCancel, { borderColor: theme.border }]}
                onPress={() => { setWithdrawModal(false); setMessage(''); }}
              >
                <Text style={[styles.modalCancelText, { color: theme.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirm, { backgroundColor: theme.primary }]}
                onPress={handleWithdraw}
                disabled={withdrawing}
              >
                {withdrawing
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalConfirmText}>Withdraw</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { padding: Spacing.xl, paddingBottom: Spacing.md },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold },
  balanceCard: {
    marginHorizontal: Spacing.xl, borderRadius: Radius.lg,
    padding: Spacing.xl, alignItems: 'center', marginBottom: Spacing.lg,
  },
  balLabel: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm, marginBottom: Spacing.sm },
  balAmount: { color: '#fff', fontSize: FontSize['3xl'], fontWeight: FontWeight.bold, marginBottom: Spacing.md },
  withdrawBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  withdrawBtnText: { color: '#fff', fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.xl, marginBottom: Spacing.lg },
  statCard: { flex: 1, padding: Spacing.md, borderRadius: Radius.md, alignItems: 'center', gap: 2 },
  statValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  statLabel: { fontSize: FontSize.xs, textAlign: 'center' },
  msgBox: { marginHorizontal: Spacing.xl, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
  msgText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  section: { paddingHorizontal: Spacing.xl },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, marginBottom: Spacing.md },
  emptyCard: { padding: Spacing.xl, borderRadius: Radius.lg, alignItems: 'center', gap: Spacing.sm },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  emptyDesc: { fontSize: FontSize.sm, textAlign: 'center' },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.sm },
  txIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  txTitle: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  txDate: { fontSize: FontSize.xs, marginTop: 2 },
  txAmount: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, gap: Spacing.md },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  modalSub: { fontSize: FontSize.sm },
  modalInput: { height: 52, borderRadius: Radius.md, borderWidth: 1.5, paddingHorizontal: Spacing.md, fontSize: FontSize.base },
  modalMsg: { fontSize: FontSize.sm },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  modalCancel: { flex: 1, height: 52, borderRadius: Radius.md, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  modalCancelText: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  modalConfirm: { flex: 2, height: 52, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
