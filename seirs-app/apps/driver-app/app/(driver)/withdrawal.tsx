import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { MOCK_DRIVER_BANK_ACCOUNTS } from '@/constants/driverMockData';
import { paymentsApi } from '@/services/api';

const QUICK_AMOUNTS = [2000, 5000, 10000, 20000, 50000];

export default function WithdrawalScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [amount,         setAmount]         = useState('');
  const [selectedBank,   setSelectedBank]   = useState(MOCK_DRIVER_BANK_ACCOUNTS[0].id);
  const [submitting,     setSubmitting]     = useState(false);
  const [done,           setDone]           = useState(false);
  const [balance,        setBalance]        = useState(0);

  // Pull live wallet balance on mount; falls back to 0 if endpoint errors
  useEffect(() => {
    paymentsApi.wallet()
      .then(w => setBalance(w?.balanceNaira ?? 0))
      .catch(() => setBalance(0));
  }, []);

  const numericAmount = parseInt(amount.replace(/,/g, ''), 10) || 0;
  const canWithdraw   = numericAmount >= 1000 && numericAmount <= balance;
  const bank          = MOCK_DRIVER_BANK_ACCOUNTS.find(b => b.id === selectedBank)!;

  const formatAmount = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    return digits ? parseInt(digits, 10).toLocaleString() : '';
  };

  const handleWithdraw = () => {
    if (!canWithdraw) return;
    Alert.alert(
      'Confirm Withdrawal',
      `Withdraw ₦${numericAmount.toLocaleString()} to ${bank.bankName} (${bank.accountNumber})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          onPress: async () => {
            setSubmitting(true);
            try {
              await paymentsApi.withdraw(numericAmount);
              setDone(true);
            } catch (err: any) {
              const msg = err?.message ?? 'Withdrawal failed. Please try again.';
              Alert.alert('Withdrawal failed', msg);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl }}>
        <View style={[styles.successCircle, { backgroundColor: '#22C55E18' }]}>
          <Ionicons name="checkmark-circle" size={64} color="#22C55E" />
        </View>
        <Text style={[styles.successTitle, { color: theme.text }]}>Withdrawal Initiated!</Text>
        <Text style={[styles.successSub, { color: theme.textSecond }]}>
          ₦{numericAmount.toLocaleString()} will arrive in {bank.bankName} within 30 minutes.
        </Text>
        <Pressable style={[styles.doneBtn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Withdraw Earnings</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Balance */}
          <View style={[styles.balCard, { backgroundColor: isDark ? '#001A00' : '#F0FDF4', borderColor: '#22C55E30' }]}>
            <Text style={[styles.balLabel, { color: theme.textSecond }]}>Available Balance</Text>
            <Text style={[styles.balAmount, { color: '#22C55E' }]}>₦{balance.toLocaleString()}</Text>
            <Text style={[styles.balMin, { color: theme.textThird }]}>Minimum withdrawal ₦1,000</Text>
          </View>

          {/* Amount input */}
          <View style={[styles.amountCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Amount</Text>
            <View style={[styles.amountInputWrap, { borderColor: numericAmount > balance ? '#EF4444' : theme.border, backgroundColor: theme.background }]}>
              <Text style={[styles.nairaSign, { color: numericAmount > 0 ? theme.text : theme.textThird }]}>₦</Text>
              <TextInput
                style={[styles.amountInput, { color: theme.text }]}
                placeholder="0"
                placeholderTextColor={theme.textThird}
                keyboardType="numeric"
                value={amount}
                onChangeText={v => setAmount(formatAmount(v))}
              />
            </View>
            {numericAmount > balance && (
              <Text style={styles.amountError}>Amount exceeds available balance</Text>
            )}
            {/* Quick amounts */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
              {QUICK_AMOUNTS.map(q => (
                <Pressable
                  key={q}
                  style={[styles.quickChip, { borderColor: numericAmount === q ? theme.primary : theme.border, backgroundColor: numericAmount === q ? theme.primary + '12' : 'transparent' }]}
                  onPress={() => setAmount(q.toLocaleString())}
                >
                  <Text style={[styles.quickText, { color: numericAmount === q ? theme.primary : theme.textSecond }]}>₦{q.toLocaleString()}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Bank selector */}
          <View style={[styles.bankCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            <View style={styles.bankCardHeader}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Destination</Text>
              <Pressable onPress={() => router.push('/(driver)/add-bank')}>
                <Text style={[styles.addBankLink, { color: theme.primary }]}>+ Add Bank</Text>
              </Pressable>
            </View>
            {MOCK_DRIVER_BANK_ACCOUNTS.map(b => (
              <Pressable
                key={b.id}
                style={[
                  styles.bankRow,
                  { borderColor: selectedBank === b.id ? theme.primary : theme.border, backgroundColor: selectedBank === b.id ? theme.primary + '08' : theme.background },
                ]}
                onPress={() => setSelectedBank(b.id)}
              >
                <View style={[styles.bankIcon, { backgroundColor: theme.surfaceSecond }]}>
                  <Ionicons name="business-outline" size={20} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bankName, { color: theme.text }]}>{b.bankName}</Text>
                  <Text style={[styles.bankAccount, { color: theme.textSecond }]}>{b.accountName} · {b.accountNumber}</Text>
                </View>
                <View style={[
                  styles.radioOuter,
                  { borderColor: selectedBank === b.id ? theme.primary : theme.border },
                ]}>
                  {selectedBank === b.id && <View style={[styles.radioInner, { backgroundColor: theme.primary }]} />}
                </View>
              </Pressable>
            ))}
          </View>

          {/* Info note */}
          <View style={[styles.infoNote, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Ionicons name="information-circle-outline" size={16} color={theme.textThird} />
            <Text style={[styles.infoText, { color: theme.textSecond }]}>Withdrawals typically arrive within 30 minutes via NIP transfer.</Text>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* CTA */}
      <View style={[styles.ctaBar, { backgroundColor: theme.navBackground, borderTopColor: theme.border }]}>
        <Pressable
          style={[styles.withdrawBtn, { backgroundColor: canWithdraw ? theme.primary : theme.surfaceSecond }]}
          onPress={handleWithdraw}
          disabled={!canWithdraw || submitting}
        >
          <Ionicons name="arrow-up-circle-outline" size={20} color={canWithdraw ? '#fff' : theme.textThird} />
          <Text style={[styles.withdrawBtnText, { color: canWithdraw ? '#fff' : theme.textThird }]}>
            {submitting ? 'Processing…' : `Withdraw${numericAmount >= 1000 ? ` ₦${numericAmount.toLocaleString()}` : ''}`}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md },

  balCard:   { alignItems: 'center', padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, gap: 4 },
  balLabel:  { fontSize: FontSize.sm },
  balAmount: { fontSize: FontSize['3xl'], fontWeight: FontWeight.bold },
  balMin:    { fontSize: FontSize.xs },

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
  radioOuter:     { width: 20, height: 20, borderRadius: 10, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  radioInner:     { width: 10, height: 10, borderRadius: 5 },

  infoNote: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  infoText: { flex: 1, fontSize: FontSize.sm, lineHeight: 20 },

  ctaBar:      { padding: Spacing.md, borderTopWidth: 1 },
  withdrawBtn: { height: 54, borderRadius: Radius.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  withdrawBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  successCircle: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.lg },
  successTitle:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold, marginBottom: Spacing.sm },
  successSub:    { fontSize: FontSize.base, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.xl },
  doneBtn:       { paddingHorizontal: Spacing.xl * 2, paddingVertical: Spacing.md, borderRadius: Radius.full },
  doneBtnText:   { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
