import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { earningsApi, paymentsApi, type EarningsDashboard } from '@/services/api';
import { naira } from '@/utils/money';
import { alertDialog } from '@/components/SeirsDialog';

/**
 * Withdraw screen: THE single real money-out path for drivers.
 *
 * Backed by the V8 Driver Earnings ledger (earningsApi), not the generic
 * wallet: available balance respects the 24h dispute window, daily caps,
 * and the new-driver holdback. The payout itself is a Flutterwave
 * Transfer to the driver's verified bank account (registered via
 * /add-bank, stored server-side).
 *
 * Withdrawal amounts are matched FIFO to whole completed deliveries, so
 * the actual paid figure can be slightly below the requested amount; the
 * success screen always shows the exact transferred amount.
 */
const QUICK_AMOUNTS = [1000, 2000, 3000, 5000, 10000, 20000, 50000];
// D-4.4: the server reads driver_min_payout_ngn from the Fee Catalogue,
// so a hardcoded client gate silently disagrees the day an admin moves
// the row. Read it from the dashboard when it is there; this constant is
// only the fallback. BACKEND TODO: expose minPayoutNgn (and the daily
// caps) on GET /earnings/dashboard.
const MIN_WITHDRAWAL_FALLBACK = 1000;

interface BankDetails {
  bankName:          string | null;
  bankCode:          string | null;
  bankAccountNumber: string | null;
  bankAccountName:   string | null;
  pendingBankName?:          string | null;
  pendingBankAccountNumber?: string | null;
}

export default function WithdrawalScreen() {
  const [sheet, setSheet] = useState<SeirsSheetSpec | null>(null);
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [amount,     setAmount]     = useState('');
  const [dashboard,  setDashboard]  = useState<EarningsDashboard | null>(null);
  const [bank,       setBank]       = useState<BankDetails | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);

  // Reload on focus so returning from /add-bank shows the new account.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, b] = await Promise.all([
          earningsApi.dashboard().catch(() => null),
          paymentsApi.getBankDetails().catch(() => null),
        ]);
        if (!cancelled) { setDashboard(d); setBank(b); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []));

  const cleared         = Number(dashboard?.available ?? 0);
  const pending         = Number(dashboard?.pending ?? 0);
  const clearanceDays   = Number(dashboard?.clearanceBusinessDays ?? 2);
  // Cast: the shared EarningsDashboard type has no minPayoutNgn yet. The
  // server owns this number (Fee Catalogue driver_min_payout_ngn); once it
  // is on the response the cast and the fallback both go away.
  const minWithdrawalRaw = Number((dashboard as any)?.minPayoutNgn ?? (dashboard as any)?.minWithdrawalNgn ?? NaN);
  // Used exactly as the server states it. Rounding it here could put the
  // client's minimum below the server's and hand the driver a rejection
  // after they had already been told the amount was fine.
  const MIN_WITHDRAWAL  = Number.isFinite(minWithdrawalRaw) && minWithdrawalRaw > 0
    ? minWithdrawalRaw
    : MIN_WITHDRAWAL_FALLBACK;
  const available       = cleared;
  const numericAmount   = Math.round((parseFloat(amount.replace(/,/g, '')) || 0) * 100) / 100;
  const hasBank         = !!(bank?.bankCode && bank?.bankAccountNumber);
  // Fraud guard: a pending bank change freezes withdrawals until support
  // resolves the review ticket (backend enforces this too).
  const frozen          = !!bank?.pendingBankAccountNumber;
  const canWithdraw     = hasBank && !frozen && numericAmount >= MIN_WITHDRAWAL && numericAmount <= available;

  /**
   * The field accepts kobo.
   *
   * It used to be whole-naira only, on the reasoning that this masks what
   * the driver TYPES rather than rendering a server figure. That reasoning
   * had a hole: "All" filled Math.floor(available), so a balance of
   * 1,469.68 offered 1,469 and the 68 kobo could never be withdrawn by
   * any input the field would accept. It was not rounding, it was money
   * stranded in the ledger permanently, and it compounds on every payout.
   * Found on device 2026-08-27.
   */
  const formatAmount = (raw: string) => {
    // One decimal point, at most two digits after it.
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    const whole = firstDot === -1 ? cleaned : cleaned.slice(0, firstDot);
    const frac  = firstDot === -1
      ? null
      : cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, 2);
    const wholeNum = whole.replace(/^0+(?=\d)/, '');
    const grouped = wholeNum ? parseInt(wholeNum, 10).toLocaleString() : (frac !== null ? '0' : '');
    return frac === null ? grouped : `${grouped}.${frac}`;
  };

  /** Exactly what is available, kobo included, formatted for the field. */
  const allAmountText = () =>
    available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleWithdraw = () => {
    if (!canWithdraw) return;
    // Money out of the app. The destination account and the fee both go
    // in front of the rider before the row that spends it, and the row
    // itself names the amount rather than saying a bare "Withdraw"
    // (2026-08-25 dialog sweep).
    setSheet({
      title: 'Confirm withdrawal',
      message:
        `Withdraw up to ${naira(numericAmount)} to ${bank?.bankName ?? 'your bank'} ` +
        `(${bank?.bankAccountNumber}).\n\nAmounts are matched to your completed deliveries, ` +
        `so the exact figure can be slightly lower. You will see the final amount sent.`,
      options: [
        {
          label: `Withdraw ${naira(numericAmount)}`,
          variant: 'primary',
          icon: 'cash-outline',
          onPress: async () => {
            setSubmitting(true);
            try {
              const res = await earningsApi.payout(numericAmount);
              setPaidAmount(res.paidAmount);
            } catch (err: any) {
              alertDialog('Withdrawal failed', err?.message ?? 'Please try again later.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
      cancelLabel: 'Not now',
    });
  };

  if (paidAmount !== null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl }}>
        <View style={[styles.successCircle, { backgroundColor: '#22C55E18' }]}>
          <Ionicons name="checkmark-circle" size={64} color="#22C55E" />
        </View>
        <Text style={[styles.successTitle, { color: theme.text }]}>Withdrawal Sent!</Text>
        <Text style={[styles.successSub, { color: theme.textSecond }]}>
          {naira(paidAmount)} is on its way to {bank?.bankName ?? 'your bank'} ({bank?.bankAccountNumber}).
          Arrival time depends on your bank.
        </Text>
        {paidAmount < numericAmount && (
          <Text style={[styles.successNote, { color: theme.textThird }]}>
            You asked for {naira(numericAmount)}; {naira(paidAmount)} was paid because
            withdrawals match whole deliveries. The rest stays available.
          </Text>
        )}
        <Pressable style={[styles.doneBtn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    // D-5.1: 'bottom' is deliberately NOT in edges. The sticky CTA bar
    // below already adds insets.bottom, and with edgeToEdgeEnabled the two
    // paddings stacked and floated the button ~112dp up the screen on
    // 3-button navigation.
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Withdraw Earnings</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Withdrawals frozen while a bank change is under review */}
          {frozen && (
            <View style={[styles.frozenCard, { backgroundColor: isDark ? '#1F1500' : '#FFFBEB', borderColor: '#D9770640' }]}>
              <Ionicons name="lock-closed-outline" size={20} color="#D97706" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.frozenTitle, { color: '#D97706' }]}>Withdrawals paused</Text>
                <Text style={[styles.frozenText, { color: theme.textSecond }]}>
                  Your bank account change ({bank?.pendingBankName ?? 'new bank'}, ending {String(bank?.pendingBankAccountNumber ?? '').slice(-4)})
                  is under review. For your protection, withdrawals resume once support confirms it (up to 3 business days).
                </Text>
              </View>
            </View>
          )}

          {/* Balance (neutral card per founder feedback 2026-08-09: the
              green wash background clashed; green stays on the number) */}
          <View style={[styles.balCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            <Text style={[styles.balLabel, { color: theme.textSecond }]}>Available to withdraw</Text>
            <Text style={[styles.balAmount, { color: '#16A34A' }]}>{naira(available)}</Text>
            <Text style={[styles.balMin, { color: theme.textThird }]}>Minimum withdrawal {naira(MIN_WITHDRAWAL)}</Text>
            {pending > 0 && (
              <View style={styles.pendingRow}>
                <Ionicons name="time-outline" size={13} color={theme.textThird} />
                <Text style={[styles.balPending, { color: theme.textThird }]}>
                  {naira(pending)} clearing ({clearanceDays} business days after each delivery)
                </Text>
              </View>
            )}
          </View>


          {/* Amount input */}
          <View style={[styles.amountCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Amount</Text>
            <View style={[styles.amountInputWrap, { borderColor: numericAmount > available ? '#EF4444' : theme.border, backgroundColor: theme.background }]}>
              <Text style={[styles.nairaSign, { color: numericAmount > 0 ? theme.text : theme.textThird }]}>₦</Text>
              <TextInput
                style={[styles.amountInput, { color: theme.text }]}
                placeholder="0"
                placeholderTextColor={theme.textThird}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={v => setAmount(formatAmount(v))}
              />
            </View>
            {numericAmount > available && (
              <Text style={styles.amountError}>Amount exceeds available balance</Text>
            )}
            {/* Quick amounts + withdraw-all. Always visible so drivers
                learn them; amounts above the balance are grayed, not
                hidden (founder feedback 2026-08-09). */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
              <Pressable
                style={[styles.quickChip, { borderColor: numericAmount === available && available >= MIN_WITHDRAWAL ? theme.primary : theme.border, backgroundColor: numericAmount === available && available >= MIN_WITHDRAWAL ? theme.primary + '12' : 'transparent' }]}
                onPress={() => setAmount(allAmountText())}
                disabled={available < MIN_WITHDRAWAL}
              >
                <Text style={[styles.quickText, { color: available >= MIN_WITHDRAWAL ? theme.primary : theme.textThird, fontWeight: FontWeight.bold }]}>All</Text>
              </Pressable>
              {QUICK_AMOUNTS.map(q => {
                const affordable = q <= available;
                return (
                  <Pressable
                    key={q}
                    disabled={!affordable}
                    style={[
                      styles.quickChip,
                      { borderColor: numericAmount === q ? theme.primary : theme.border, backgroundColor: numericAmount === q ? theme.primary + '12' : 'transparent' },
                      !affordable && { opacity: 0.35 },
                    ]}
                    onPress={() => setAmount(q.toLocaleString())}
                  >
                    <Text style={[styles.quickText, { color: numericAmount === q ? theme.primary : theme.textSecond }]}>{naira(q)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Destination: the registered payout account */}
          <View style={[styles.bankCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            <View style={styles.bankCardHeader}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Destination</Text>
              <Pressable onPress={() => router.push('/(driver)/add-bank')}>
                <Text style={[styles.addBankLink, { color: theme.primary }]}>{hasBank ? 'Change' : '+ Add Bank'}</Text>
              </Pressable>
            </View>
            {hasBank ? (
              <View style={[styles.bankRow, { borderColor: theme.primary, backgroundColor: theme.primary + '08' }]}>
                <View style={[styles.bankIcon, { backgroundColor: theme.surfaceSecond }]}>
                  <Ionicons name="business-outline" size={20} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bankName, { color: theme.text }]}>{bank?.bankName ?? 'Bank account'}</Text>
                  <Text style={[styles.bankAccount, { color: theme.textSecond }]}>
                    {bank?.bankAccountName} · {bank?.bankAccountNumber}
                  </Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
              </View>
            ) : (
              <Pressable
                style={[styles.noBankRow, { borderColor: theme.border, backgroundColor: theme.background }]}
                onPress={() => router.push('/(driver)/add-bank')}
              >
                <Ionicons name="alert-circle-outline" size={20} color="#D97706" />
                <Text style={[styles.noBankText, { color: theme.textSecond }]}>
                  No payout account yet. Add your bank account to withdraw.
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
              </Pressable>
            )}
          </View>

          {/* Info note */}
          <View style={[styles.infoNote, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Ionicons name="information-circle-outline" size={16} color={theme.textThird} />
            <Text style={[styles.infoText, { color: theme.textSecond }]}>
              Earnings clear {clearanceDays} business days after each delivery, then withdraw free any time.
              Withdrawals are matched to whole deliveries and sent as a bank transfer; arrival time depends on your bank.
            </Text>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      )}

      {/* CTA (safe-area padded so Android gesture nav never covers it) */}
      {!loading && (
        <View style={[styles.ctaBar, { backgroundColor: theme.navBackground, borderTopColor: theme.border, paddingBottom: Spacing.md + insets.bottom }]}>
          <Pressable
            style={[styles.withdrawBtn, { backgroundColor: canWithdraw ? theme.primary : theme.surfaceSecond }]}
            onPress={handleWithdraw}
            disabled={!canWithdraw || submitting}
          >
            <Ionicons name="arrow-up-circle-outline" size={20} color={canWithdraw ? '#fff' : theme.textThird} />
            <Text style={[styles.withdrawBtnText, { color: canWithdraw ? '#fff' : theme.textThird }]}>
              {submitting ? 'Processing…' : `Withdraw${numericAmount >= MIN_WITHDRAWAL ? ` ${naira(numericAmount)}` : ''}`}
            </Text>
          </Pressable>
        </View>
      )}
      <SeirsSheet spec={sheet} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md },

  frozenCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  frozenTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  frozenText:  { fontSize: FontSize.xs, lineHeight: 17, marginTop: 2 },

  balCard:    { alignItems: 'center', padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, gap: 4 },
  checkbox:     { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  balLabel:   { fontSize: FontSize.sm },
  balAmount:  { fontSize: FontSize['3xl'], fontWeight: FontWeight.bold },
  balMin:     { fontSize: FontSize.xs },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  balPending: { fontSize: FontSize.xs },

  amountCard:      { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  cardTitle:       { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  amountInputWrap: { flexDirection: 'row', alignItems: 'center', height: 60, borderRadius: Radius.xl, borderWidth: 1.5, paddingHorizontal: Spacing.md },
  nairaSign:       { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, marginRight: 4 },
  amountInput:     { flex: 1, fontSize: FontSize['2xl'], fontWeight: FontWeight.bold },
  amountError:     { fontSize: FontSize.xs, color: '#EF4444' },
  quickRow:        { gap: Spacing.sm },
  quickChip:       { paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5 },
  quickText:       { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  bankCard:       { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  bankCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  addBankLink:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  bankRow:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.sm + 2, borderRadius: Radius.lg, borderWidth: 1.5 },
  bankIcon:       { width: 40, height: 40, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  bankName:       { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  bankAccount:    { fontSize: FontSize.sm, marginTop: 2 },
  noBankRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5, borderStyle: 'dashed' },
  noBankText:     { flex: 1, fontSize: FontSize.sm, lineHeight: 19 },

  infoNote: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  infoText: { flex: 1, fontSize: FontSize.sm, lineHeight: 20 },

  ctaBar:      { padding: Spacing.md, borderTopWidth: 1 },
  withdrawBtn: { height: 54, borderRadius: Radius.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  withdrawBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  successCircle: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.lg },
  successTitle:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold, marginBottom: Spacing.sm },
  successSub:    { fontSize: FontSize.base, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.md },
  successNote:   { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.lg },
  doneBtn:       { paddingHorizontal: Spacing.xl * 2, paddingVertical: Spacing.md, borderRadius: Radius.full },
  doneBtnText:   { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
