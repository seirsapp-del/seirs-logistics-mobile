import {
  View, Text, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { paymentsApi } from '@/services/api';

export default function EarningsScreen() {
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const isDark      = colorScheme === 'dark';

  const [balance,        setBalance]        = useState<{ balanceNaira: number } | null>(null);
  const [history,        setHistory]        = useState<any[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [withdrawModal,  setWithdrawModal]  = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing,    setWithdrawing]    = useState(false);
  const [message,        setMessage]        = useState('');

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

  const walletGradient = isDark
    ? ([theme.walletCard, theme.walletCardEnd] as const)
    : (['#0D1B2A', '#1E3A5F'] as const);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.xl }}>

        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Earnings</Text>
        </View>

        {/* Balance card */}
        <View style={[styles.cardWrap, Shadows.md]}>
          <LinearGradient
            colors={walletGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.balanceCard}
          >
            <Text style={styles.balLabel}>Available Balance</Text>
            <Text style={styles.balAmount}>
              ₦{(balance?.balanceNaira ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </Text>
            <Pressable
              style={styles.withdrawBtn}
              onPress={() => setWithdrawModal(true)}
            >
              <Ionicons name="arrow-up-circle-outline" size={16} color="#fff" />
              <Text style={styles.withdrawBtnText}>Withdraw to Bank</Text>
            </Pressable>
          </LinearGradient>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { label: 'Total Trips',  value: history.length.toString(),                                                                       icon: 'navigate-outline' },
            { label: 'This Week',    value: '₦0',                                                                                             icon: 'calendar-outline' },
            { label: 'Avg / Trip',   value: history.length ? `₦${Math.round((balance?.balanceNaira ?? 0) / history.length)}` : '—',          icon: 'trending-up-outline' },
          ].map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Ionicons name={s.icon as any} size={20} color={theme.primary} />
              <Text style={[styles.statValue, { color: theme.text }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecond }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {message ? (
          <View style={[styles.msgBox, { backgroundColor: '#22C55E18', borderColor: '#22C55E30' }]}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#22C55E" />
            <Text style={[styles.msgText, { color: '#22C55E' }]}>{message}</Text>
          </View>
        ) : null}

        {/* Earnings history */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Payouts</Text>
          {history.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface }, Shadows.sm]}>
              <View style={[styles.emptyIconWrap, { backgroundColor: theme.surfaceSecond }]}>
                <Ionicons name="cash-outline" size={40} color={theme.textThird} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No earnings yet</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>
                Complete deliveries to start earning.
              </Text>
            </View>
          ) : (
            history.map((tx) => (
              <View key={tx.id} style={[styles.txRow, { backgroundColor: theme.surface }, Shadows.sm]}>
                <View style={[styles.txIcon, { backgroundColor: '#22C55E18' }]}>
                  <Ionicons name="arrow-down-circle-outline" size={22} color="#22C55E" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.txTitle, { color: theme.text }]}>Delivery payout</Text>
                  <Text style={[styles.txDate, { color: theme.textSecond }]}>
                    {new Date(tx.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: '#22C55E' }]}>
                  +₦{(tx.amountKobo / 100 * 0.8).toLocaleString()}
                </Text>
              </View>
            ))
          )}
        </View>

      </ScrollView>

      {/* Withdraw modal */}
      <Modal visible={withdrawModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>Withdraw Earnings</Text>
            <Text style={[styles.modalSub, { color: theme.textSecond }]}>
              Available: ₦{(balance?.balanceNaira ?? 0).toLocaleString()}
            </Text>
            <View style={[styles.modalInputWrap, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Ionicons name="cash-outline" size={18} color={theme.textThird} style={{ marginRight: Spacing.sm }} />
              <TextInput
                style={[styles.modalInput, { color: theme.text }]}
                placeholder="Amount (min ₦1,000)"
                placeholderTextColor={theme.textThird}
                keyboardType="numeric"
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
              />
            </View>
            {message ? (
              <View style={[styles.msgBox, { backgroundColor: theme.error + '12', borderColor: theme.error + '25' }]}>
                <Ionicons name="alert-circle-outline" size={15} color={theme.error} />
                <Text style={[styles.msgText, { color: theme.error }]}>{message}</Text>
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalCancel, { borderColor: theme.border }]}
                onPress={() => { setWithdrawModal(false); setMessage(''); setWithdrawAmount(''); }}
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
  header:     { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  title:      { fontSize: FontSize.xl, fontWeight: FontWeight.bold },

  cardWrap:    { marginHorizontal: Spacing.md, marginBottom: Spacing.md, borderRadius: Radius.xl, overflow: 'hidden' },
  balanceCard: { padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm },
  balLabel:    { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm },
  balAmount:   { color: '#fff', fontSize: FontSize['3xl'], fontWeight: FontWeight.bold, letterSpacing: -0.5 },
  withdrawBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.full, marginTop: 4 },
  withdrawBtnText: { color: '#fff', fontWeight: FontWeight.semibold, fontSize: FontSize.sm },

  statsRow:  { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
  statCard:  { flex: 1, padding: Spacing.md, borderRadius: Radius.xl, alignItems: 'center', gap: 4 },
  statValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  statLabel: { fontSize: FontSize.xs, textAlign: 'center' },

  msgBox:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1 },
  msgText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, flex: 1 },

  section:      { paddingHorizontal: Spacing.md },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, marginBottom: Spacing.md },

  emptyCard:     { padding: Spacing.xl, borderRadius: Radius.xl, alignItems: 'center', gap: Spacing.sm },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  emptyTitle:    { fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  emptyDesc:     { fontSize: FontSize.sm, textAlign: 'center' },

  txRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, marginBottom: Spacing.sm },
  txIcon:   { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  txTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  txDate:   { fontSize: FontSize.xs, marginTop: 2 },
  txAmount: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard:     { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.md },
  modalHandle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D1D6', alignSelf: 'center', marginBottom: Spacing.sm },
  modalTitle:    { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  modalSub:      { fontSize: FontSize.sm },
  modalInputWrap:{ flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md },
  modalInput:    { flex: 1, fontSize: FontSize.base },
  modalActions:  { flexDirection: 'row', gap: Spacing.sm },
  modalCancel:   { flex: 1, height: 52, borderRadius: Radius.xl, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  modalCancelText:  { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  modalConfirm:     { flex: 2, height: 52, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
