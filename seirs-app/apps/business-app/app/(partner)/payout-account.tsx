/**
 * Where the shop's counter earnings are sent.
 *
 * There was nowhere, and nothing anywhere in the app that could set one.
 * partner_payouts held an amount and a status with no destination, so a
 * counter accrued handling fees into a ledger that could not be settled
 * (2026-09-03).
 *
 * The account number is RESOLVED with the bank before anything is saved,
 * and the name shown back is the bank's answer rather than what was
 * typed. People mistype their own account numbers, and a transfer to a
 * mistyped number that happens to exist is somebody else's money now,
 * with no undo. So the shop confirms a NAME, not digits.
 *
 * The first account saves immediately. Replacing one is queued for a
 * person and the current account keeps paying until that is decided,
 * which is the same policy drivers have had since 2026-08-09: a
 * replacement is the step somebody taking over an account wants.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { partnerApi, paymentsApi } from '@/services/api';
import { useColors } from '@/context/ThemeContext';
import { alertDialog } from '@/components/SeirsDialog';

type Bank = { id: string; name: string; code: string };

export default function PayoutAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();

  const [current, setCurrent]   = useState<any>(null);
  const [banks, setBanks]       = useState<Bank[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefresh] = useState(false);

  const [editing, setEditing]   = useState(false);
  const [query, setQuery]       = useState('');
  const [bank, setBank]         = useState<Bank | null>(null);
  const [number, setNumber]     = useState('');
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    const [b, list] = await Promise.all([
      partnerApi.myBank().catch(() => null),
      paymentsApi.banks().catch(() => [] as Bank[]),
    ]);
    setCurrent(b);
    setBanks(Array.isArray(list) ? list : []);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return banks.slice(0, 8);
    return banks.filter(b => b.name.toLowerCase().includes(q)).slice(0, 8);
  }, [banks, query]);

  const ready = !!bank && /^\d{10}$/.test(number);

  const save = async () => {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const res = await partnerApi.setBank({
        bankName: bank!.name, bankCode: bank!.code, accountNumber: number,
      });
      // The bank's answer, not the typed digits. This is the confirmation
      // that matters: a wrong number that resolves to a stranger's name
      // is the failure this screen exists to prevent.
      alertDialog(
        res.pending ? 'We will check this first' : `Payouts will go to ${res.accountName}`,
        res.message,
      );
      setEditing(false);
      setBank(null); setNumber(''); setQuery('');
      await load();
    } catch (e: any) {
      alertDialog('Not saved', e?.message ?? 'That account could not be confirmed. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Payout account</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefresh(true); load().finally(() => setRefresh(false)); }}
              tintColor={colors.primary}
            />
          }
        >
          {/* No account is not a neutral state: it is the thing standing
              between this shop and being approved at all. */}
          {!current?.hasAccount && !editing && (
            <View style={[styles.notice, { backgroundColor: colors.warning + '14', borderColor: colors.warning + '55' }]}>
              <Icon name="AlertTriangle" size={16} color={colors.warning} />
              <Text style={[styles.noticeText, { color: colors.text }]}>
                We have no account for this shop, so there is nowhere to send what you earn.
                Your application cannot be approved until you add one.
              </Text>
            </View>
          )}

          {current?.hasAccount && !editing && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.textThird }]}>EARNINGS GO TO</Text>
              <Text style={[styles.accountName, { color: colors.text }]}>{current.accountName}</Text>
              <Text style={[styles.accountLine, { color: colors.textSecond }]}>
                {current.bankName}
              </Text>
              <Text style={[styles.accountNumber, { color: colors.textSecond }]}>
                {current.accountNumberMasked}
              </Text>

              {current.pending ? (
                <View style={[styles.pending, { backgroundColor: colors.warning + '14', borderColor: colors.warning + '55' }]}>
                  <Text style={[styles.pendingText, { color: colors.text }]}>
                    You asked to change this to {current.pending.accountName} at{' '}
                    {current.pending.bankName}. We are checking it. Until then your earnings keep
                    going to the account above.
                  </Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => setEditing(true)}
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>
                  Change this account
                </Text>
              </Pressable>
            </View>
          )}

          {(editing || !current?.hasAccount) && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.textThird }]}>
                {current?.hasAccount ? 'NEW ACCOUNT' : 'ADD YOUR ACCOUNT'}
              </Text>

              <Text style={[styles.fieldLabel, { color: colors.textSecond }]}>Your bank</Text>
              {bank ? (
                <Pressable
                  onPress={() => { setBank(null); setQuery(''); }}
                  style={[styles.chosenBank, { borderColor: colors.border, backgroundColor: colors.surfaceSecond }]}
                >
                  <Text style={[styles.chosenBankText, { color: colors.text }]}>{bank.name}</Text>
                  <Icon name="X" size={15} color={colors.textThird} />
                </Pressable>
              ) : (
                <>
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Start typing your bank"
                    placeholderTextColor={colors.textThird}
                    style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                  />
                  {matches.map(b => (
                    <Pressable
                      key={b.code}
                      onPress={() => { setBank(b); setQuery(''); }}
                      style={[styles.bankRow, { borderBottomColor: colors.border }]}
                    >
                      <Text style={[styles.bankRowText, { color: colors.text }]}>{b.name}</Text>
                    </Pressable>
                  ))}
                  {banks.length === 0 && (
                    <Text style={[styles.hint, { color: colors.textThird }]}>
                      We could not load the bank list. Pull down to try again.
                    </Text>
                  )}
                </>
              )}

              <Text style={[styles.fieldLabel, { color: colors.textSecond, marginTop: 14 }]}>
                Account number
              </Text>
              <TextInput
                value={number}
                onChangeText={t => setNumber(t.replace(/\D/g, '').slice(0, 10))}
                placeholder="10 digits"
                placeholderTextColor={colors.textThird}
                keyboardType="number-pad"
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              />
              <Text style={[styles.hint, { color: colors.textThird }]}>
                We check this with your bank and show you the name on the account before anything
                is saved.
              </Text>

              <Pressable
                onPress={save}
                disabled={!ready || saving}
                style={[styles.saveBtn, {
                  backgroundColor: colors.primary,
                  opacity: !ready || saving ? 0.45 : 1,
                }]}
              >
                <Text style={[styles.saveBtnText, { color: colors.textOnPrimary }]}>
                  {saving ? 'Checking with your bank...' : 'Check and save'}
                </Text>
              </Pressable>

              {current?.hasAccount && (
                <Pressable onPress={() => { setEditing(false); setBank(null); setNumber(''); }} style={styles.cancel}>
                  <Text style={[styles.cancelText, { color: colors.textSecond }]}>Cancel</Text>
                </Pressable>
              )}
            </View>
          )}

          <Text style={[styles.footNote, { color: colors.textThird }]}>
            Changing an account is checked by a person before it takes effect, so nobody else can
            redirect your earnings. Your current account keeps paying while we look.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1,
  },
  back:        { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  notice:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1,
                 borderRadius: 12, padding: 12, marginBottom: 14 },
  noticeText:  { flex: 1, fontSize: 13.5, lineHeight: 19 },

  card:        { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 14 },
  cardLabel:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  accountName: { fontSize: 19, fontWeight: '800' },
  accountLine: { fontSize: 14, marginTop: 3 },
  accountNumber: { fontSize: 14, marginTop: 1, letterSpacing: 1 },

  pending:     { borderWidth: 1, borderRadius: 10, padding: 11, marginTop: 12 },
  pendingText: { fontSize: 13, lineHeight: 18 },

  fieldLabel:  { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input:       { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  hint:        { fontSize: 12, lineHeight: 16, marginTop: 6 },

  bankRow:     { paddingVertical: 11, borderBottomWidth: 1 },
  bankRowText: { fontSize: 14.5 },
  chosenBank:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                 borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
  chosenBankText: { fontSize: 15, fontWeight: '600' },

  saveBtn:     { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  saveBtnText: { fontSize: 15, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', marginTop: 14 },
  secondaryBtnText: { fontSize: 14, fontWeight: '700' },
  cancel:      { alignItems: 'center', paddingVertical: 12 },
  cancelText:  { fontSize: 14, fontWeight: '600' },

  footNote:    { fontSize: 12, lineHeight: 17, paddingHorizontal: 2 },
});
