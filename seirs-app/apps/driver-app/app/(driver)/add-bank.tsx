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
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { paymentsApi } from '@/services/api';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

/**
 * Payout bank account setup: fully live.
 *   1. Bank list from GET /payments/banks (Flutterwave's Nigerian bank
 *      directory, includes transfer codes).
 *   2. Account resolution via POST /payments/verify-bank: the registered
 *      account name comes back from Flutterwave, never typed by hand.
 *   3. Save via PATCH /payments/bank-details, which stores the account
 *      on the user row that payouts read from.
 * One account per driver: saving replaces the previous one.
 */
interface Bank { id: string; name: string; code: string }

export default function AddBankScreen() {
  const [sheet, setSheet] = useState<SeirsSheetSpec | null>(null);
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [banks,          setBanks]          = useState<Bank[]>([]);
  const [banksLoading,   setBanksLoading]   = useState(true);
  const [current,        setCurrent]        = useState<{
    bankName: string | null; bankAccountNumber: string | null; bankAccountName: string | null;
    pendingBankName?: string | null; pendingBankAccountNumber?: string | null;
  } | null>(null);
  const [savedAsPending, setSavedAsPending] = useState(false);
  const [selectedBank,   setSelectedBank]   = useState<Bank | null>(null);
  const [accountNumber,  setAccountNumber]  = useState('');
  const [accountName,    setAccountName]    = useState('');
  const [bankModalOpen,  setBankModalOpen]  = useState(false);
  const [bankSearch,     setBankSearch]     = useState('');
  const [verifying,      setVerifying]      = useState(false);
  const [verified,       setVerified]       = useState(false);
  const [submitting,     setSubmitting]     = useState(false);
  const [done,           setDone]           = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      paymentsApi.banks().catch(() => [] as Bank[]),
      paymentsApi.getBankDetails().catch(() => null),
    ]).then(([bs, cur]) => {
      if (cancelled) return;
      setBanks((bs ?? []).sort((a, b) => a.name.localeCompare(b.name)));
      setCurrent(cur);
    }).finally(() => { if (!cancelled) setBanksLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filteredBanks = banks.filter(b => b.name.toLowerCase().includes(bankSearch.toLowerCase()));

  const handleVerify = async () => {
    if (accountNumber.length !== 10 || !selectedBank) return;
    setVerifying(true);
    try {
      const res = await paymentsApi.verifyBank(selectedBank.code, accountNumber);
      if (res.verified && res.accountName) {
        setAccountName(res.accountName);
        setVerified(true);
      } else {
        alertDialog('Could not verify', res.message ?? 'Check the bank and account number, then try again.');
      }
    } catch (e: any) {
      alertDialog('Could not verify', e?.message ?? 'Check your connection and try again.');
    } finally {
      setVerifying(false);
    }
  };

  const canSave = verified && !!selectedBank && accountNumber.length === 10;

  const submitSave = async () => {
    if (!selectedBank) return;
    setSubmitting(true);
    try {
      const res = await paymentsApi.updateBankDetails({
        bankName:          selectedBank.name,
        bankCode:          selectedBank.code,
        bankAccountNumber: accountNumber,
        bankAccountName:   accountName,
      });
      setSavedAsPending(!!(res as any)?.pending);
      setDone(true);
    } catch (e: any) {
      alertDialog('Save failed', e?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSave = () => {
    if (!canSave || !selectedBank) return;
    // Replacing an existing account: explicit warning BEFORE submitting,
    // since it freezes withdrawals until support approves the change.
    if (current?.bankAccountNumber) {
      // A rider's payout destination is the highest-stakes edit in the
      // app. The consequence goes on the row itself, where it cannot be
      // skimmed past (2026-08-25 dialog sweep).
      setSheet({
        title: tr('auto.addBank.replacePayoutAccount', 'Replace payout account?'),
        message:
          'Your withdrawals will PAUSE until our team reviews and approves this change (up to 3 business days). ' +
          'This protects your earnings if someone else gets into your account.\n\n' +
          `New account: ${selectedBank.name} · ${accountName} · ${accountNumber}`,
        options: [{
          label: tr('auto.vehicle.submitForReview', 'Submit for review'),
          sub: tr('auto.addBank.withdrawalsPauseUntilItIs', 'Withdrawals pause until it is approved'),
          variant: 'destructive',
          icon: 'shield-checkmark-outline',
          onPress: submitSave,
        }],
        cancelLabel: tr('auto.addBank.keepMyCurrentAccount', 'Keep my current account'),
      });
      return;
    }
    submitSave();
  };

  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl }}>
        <View style={[styles.successCircle, { backgroundColor: (savedAsPending ? theme.warning : theme.success) + '18' }]}>
          <Ionicons
            name={savedAsPending ? 'hourglass-outline' : 'checkmark-circle'}
            size={64}
            color={savedAsPending ? theme.warning : theme.success}
          />
        </View>
        <Text style={[styles.successTitle, { color: theme.text }]}>
          {savedAsPending ? tx9('auto.addBank.submittedForReview', 'Submitted for Review') : tx9('auto.addBank.bankSaved', 'Bank Saved!')}
        </Text>
        <Text style={[styles.successSub, { color: theme.textSecond }]}>
          {savedAsPending
            ? tx9('auto.addBank.weCheckPayoutAccountChanges', 'We check payout account changes, up to 3 business days.') +
              tx9('auto.addBank.payoutsPauseUntilThenAnd', 'Payouts pause until then, and nothing is lost.')
            : `${selectedBank?.name} account ending in ${accountNumber.slice(-4)} is now your payout account.`}
        </Text>
        <Pressable style={[styles.doneBtn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={styles.doneBtnText}>{tr('auto.profile.done', 'Done')}</Text>
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
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.addBank.payoutBankAccount', 'Payout Bank Account')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Current account (if any) */}
          {current?.bankAccountNumber ? (
            <View style={[styles.currentCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
              <View style={[styles.bankIcon, { backgroundColor: theme.surfaceSecond }]}>
                <Ionicons name="business-outline" size={20} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.currentLabel, { color: theme.textThird }]}>{tx('auto.addBank.currentPayoutAccount', 'Current payout account')}</Text>
                <Text style={[styles.currentValue, { color: theme.text }]}>
                  {current.bankName ?? tx9('auto.addBank.bank', 'Bank')} · {current.bankAccountName} · {current.bankAccountNumber}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Pending change banner */}
          {current?.pendingBankAccountNumber ? (
            <View style={[styles.currentCard, { backgroundColor: theme.warning + (isDark ? '22' : '14'), borderColor: theme.warning + '40' }]}>
              <Ionicons name="hourglass-outline" size={20} color={theme.warning} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.currentLabel, { color: theme.warning }]}>{tx('auto.addBank.changeUnderReview', 'Change under review')}</Text>
                <Text style={[styles.currentValue, { color: theme.text }]}>
                  {current.pendingBankName ?? tx9('auto.addBank.newBank', 'New bank')} account ending {String(current.pendingBankAccountNumber).slice(-4)}{tr('auto.addBank.reviewTakesUpTo3', '. Review takes up to 3 business days.')}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Bank selector */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.textSecond }]}>{tr('auto.addBank.bank', 'Bank')}</Text>
            <Pressable
              style={[styles.selectBtn, { backgroundColor: theme.surface, borderColor: selectedBank ? theme.primary : theme.border }, Shadows.xs]}
              onPress={() => setBankModalOpen(true)}
            >
              <Ionicons name="business-outline" size={18} color={selectedBank ? theme.primary : theme.textThird} />
              <Text style={[styles.selectText, { color: selectedBank ? theme.text : theme.textThird }]}>
                {banksLoading ? tx9('auto.addBank.loadingBanks', 'Loading banks…') : (selectedBank?.name || tx9('auto.addBank.selectBank2', 'Select bank…'))}
              </Text>
              <Ionicons name="chevron-down" size={16} color={theme.textThird} />
            </Pressable>
          </View>

          {/* Account number */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.textSecond }]}>{tx('auto.addBank.accountNumber', 'Account Number')}</Text>
            <View style={[styles.inputRow, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder={tx('auto.addBank.10DigitNuban', '10-digit NUBAN')}
                placeholderTextColor={theme.textThird}
                keyboardType="numeric"
                maxLength={10}
                value={accountNumber}
                onChangeText={v => { setAccountNumber(v.replace(/\D/g, '')); setVerified(false); setAccountName(''); }}
              />
              {accountNumber.length === 10 && selectedBank && !verified && (
                <Pressable style={[styles.verifyBtn, { backgroundColor: theme.primary }]} onPress={handleVerify} disabled={verifying}>
                  <Text style={styles.verifyBtnText}>{verifying ? tx9('auto.addBank.checking', 'Checking…') : tx9('auto.addBank.verify', 'Verify')}</Text>
                </Pressable>
              )}
              {verified && <Ionicons name="checkmark-circle" size={20} color="#22C55E" />}
            </View>
            <Text style={[styles.hint, { color: theme.textThird }]}>{accountNumber.length}/10 digits</Text>
          </View>

          {/* Account name (resolved by Flutterwave, never typed) */}
          {accountName ? (
            <View style={[styles.nameCard, { backgroundColor: isDark ? '#001800' : '#F0FDF4', borderColor: '#22C55E30' }]}>
              <Ionicons name="person-circle-outline" size={20} color="#22C55E" />
              <View>
                <Text style={[styles.nameLabel, { color: theme.textThird }]}>{tx('auto.addBank.accountName', 'Account Name')}</Text>
                <Text style={[styles.nameValue, { color: '#22C55E' }]}>{accountName}</Text>
              </View>
            </View>
          ) : null}

          {/* Info note */}
          <View style={[styles.infoNote, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Ionicons name="shield-checkmark-outline" size={16} color={theme.textThird} />
            <Text style={[styles.infoText, { color: theme.textSecond }]}>
              {tr('auto.addBank.theAccountNameIsConfirmed', 'The account name is confirmed directly with the bank. Your details are encrypted and used only for paying you.')}
              {current?.bankAccountNumber
                ? tx9('auto.addBank.replacingYourAccountPausesWithdrawals', 'Replacing your account pauses withdrawals until support approves the change (up to 3 business days). This protects your earnings if someone else gets into your account.')
                : ''}
            </Text>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Save CTA (safe-area padded so Android gesture nav never covers it) */}
      <View style={[styles.ctaBar, { backgroundColor: theme.navBackground, borderTopColor: theme.border, paddingBottom: Spacing.md + insets.bottom }]}>
        <Pressable
          style={[styles.saveBtn, { backgroundColor: canSave ? theme.primary : theme.surfaceSecond }]}
          onPress={handleSave}
          disabled={!canSave || submitting}
        >
          <Ionicons name="save-outline" size={20} color={canSave ? '#fff' : theme.textThird} />
          <Text style={[styles.saveBtnText, { color: canSave ? '#fff' : theme.textThird }]}>
            {submitting ? tx9('auto.addBank.saving', 'Saving…') : tx9('auto.addBank.saveBankAccount', 'Save Bank Account')}
          </Text>
        </Pressable>
      </View>

      {/* Bank picker modal */}
      <Modal visible={bankModalOpen} transparent animationType="slide" onRequestClose={() => setBankModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, paddingBottom: Spacing.lg + insets.bottom }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>{tx('auto.addBank.selectBank', 'Select Bank')}</Text>
            <View style={[styles.searchWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <Ionicons name="search-outline" size={16} color={theme.textThird} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder={tx('auto.addBank.searchBanks', 'Search banks…')}
                placeholderTextColor={theme.textThird}
                value={bankSearch}
                onChangeText={setBankSearch}
              />
            </View>
            {banksLoading ? (
              <ActivityIndicator color={theme.primary} style={{ paddingVertical: Spacing.xl }} />
            ) : (
              <FlatList
                data={filteredBanks}
                keyExtractor={b => b.id}
                style={{ maxHeight: 360 }}
                ListEmptyComponent={
                  <Text style={[styles.emptyBanks, { color: theme.textThird }]}>
                    {banks.length === 0 ? tx9('auto.addBank.bankListUnavailableCheckYour', 'Bank list unavailable. Check your connection and reopen.') : tx9('auto.addBank.noBankMatchesThatSearch', 'No bank matches that search.')}
                  </Text>
                }
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.bankItem, { borderBottomColor: theme.border }]}
                    onPress={() => { setSelectedBank(item); setBankModalOpen(false); setBankSearch(''); setVerified(false); setAccountName(''); }}
                  >
                    <Text style={[styles.bankItemText, { color: theme.text }]}>{item.name}</Text>
                    {selectedBank?.id === item.id && <Ionicons name="checkmark" size={18} color={theme.primary} />}
                  </Pressable>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
      <SeirsSheet spec={sheet} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.lg },

  currentCard:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  currentLabel: { fontSize: FontSize.xs },
  currentValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginTop: 2 },
  bankIcon:     { width: 40, height: 40, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },

  fieldGroup: { gap: Spacing.sm },
  label:      { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  selectBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  selectText:{ flex: 1, fontSize: FontSize.base },

  inputRow:   { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5, gap: Spacing.sm },
  input:      { flex: 1, fontSize: FontSize.base },
  verifyBtn:  { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full },
  verifyBtnText:{ color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  hint:       { fontSize: FontSize.xs },

  nameCard:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  nameLabel: { fontSize: FontSize.xs },
  nameValue: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  infoNote:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  infoText:  { flex: 1, fontSize: FontSize.sm, lineHeight: 20 },

  ctaBar:    { padding: Spacing.md, borderTopWidth: 1 },
  saveBtn:   { height: 54, borderRadius: Radius.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  saveBtnText:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard:    { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.md },
  modalHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D1D6', alignSelf: 'center', marginBottom: Spacing.sm },
  modalTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  searchWrap:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  searchInput:  { flex: 1, fontSize: FontSize.base },
  bankItem:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md, borderBottomWidth: 0.5 },
  bankItemText: { fontSize: FontSize.base },
  emptyBanks:   { textAlign: 'center', paddingVertical: Spacing.lg, fontSize: FontSize.sm },

  successCircle: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.lg },
  successTitle:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold, marginBottom: Spacing.sm },
  successSub:    { fontSize: FontSize.base, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.xl },
  doneBtn:       { paddingHorizontal: Spacing.xl * 2, paddingVertical: Spacing.md, borderRadius: Radius.full },
  doneBtnText:   { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
