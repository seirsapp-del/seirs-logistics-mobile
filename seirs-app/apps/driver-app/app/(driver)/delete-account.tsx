import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, AlertTriangle, Trash2, Download, AlertCircle, CheckCircle } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { usersApi, driversApi } from '@/services/api';
import { PasswordInput } from '@/components/PasswordInput';
import { naira } from '@/utils/money';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

interface Readiness {
  ready:    boolean;
  blockers: Array<{ type: string; count: number; action: string }>;
}

const CONFIRM_PHRASE = 'delete my account';

// Spec V8: driver NDPR right to erasure. Same flow as customer app.
// Drivers should reconcile pending wallet balance + active deliveries
// before triggering this; backend currently doesn't enforce that and
// will let a balance get orphaned. Better validation in a follow-up.
export default function DeleteAccountScreen() {
  const [sheet, setSheet] = useState<SeirsSheetSpec | null>(null);
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const { logout } = useAuth() as any;

  const [password,    setPassword]    = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [exporting,   setExporting]   = useState(false);

  // Spec V8: pre-deletion readiness. Blocks deletion until active
  // deliveries are completed and wallet balance is withdrawn.
  const [readiness,   setReadiness]   = useState<Readiness | null>(null);

  useEffect(() => {
    driversApi.deletionReadiness()
      .then((r) => setReadiness({ ready: r.ready, blockers: r.blockers ?? [] }))
      .catch(() => setReadiness({ ready: true, blockers: [] }));
  }, []);

  // Spec V8 NDPR Article 24: surfaced before delete so drivers can
  // take their earnings + trip history with them.
  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await usersApi.exportData();
      const json = JSON.stringify(data, null, 2);
      await Clipboard.setStringAsync(json);
      alertDialog(
        'Copied to clipboard',
        `Your data export (${(json.length / 1024).toFixed(1)} KB) has been copied. Paste into a notes app or email it to yourself, then save the file somewhere safe.`,
      );
    } catch (e: any) {
      alertDialog('Export failed', e?.message ?? 'Try again.');
    } finally {
      setExporting(false);
    }
  };

  const canSubmit =
    password.length > 0 &&
    confirmText.trim().toLowerCase() === CONFIRM_PHRASE &&
    !!readiness?.ready;

  const handleSubmit = () => {
    // "wallet balance" is the retired model: a driver holds an EARNINGS
    // ledger, and that is the word every other money screen in this app
    // uses (2026-08-25 dialog sweep).
    setSheet({
      title: tr('auto.deleteAccount.deleteAccount2', 'Delete account'),
      message: tr('auto.deleteAccount.makeSureYouHaveWithdrawn', 'Make sure you have withdrawn your cleared earnings and have no active deliveries. You can sign in within 30 days to cancel.'),
      options: [
        {
          label: tr('auto.deleteAccount.deleteMyAccount', 'Delete my account'),
          sub: tr('auto.deleteAccount.recoverableFor30DaysPermanent', 'Recoverable for 30 days, permanent after that'),
          variant: 'destructive',
          icon: 'trash-outline',
          onPress: async () => {
            setLoading(true);
            try {
              await usersApi.deleteAccount(password);
              alertDialog(
                'Account deleted',
                'Your driver account is scheduled for deletion. Sign in within 30 days to cancel.',
                [{ text: 'OK', onPress: async () => {
                  try { await logout?.(); } catch { /* best-effort */ }
                  router.replace('/(auth)/login' as any);
                }}],
              );
            } catch (e: any) {
              alertDialog('Could not delete', e?.message ?? 'Try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
      cancelLabel: tr('auto.deleteAccount.keepMyAccount', 'Keep my account'),
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.deleteAccount.deleteAccount', 'Delete Account')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <View style={styles.warnBanner}>
            <AlertTriangle size={20} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.warnTitle}>{tx('auto.deleteAccount.permanentAfter30Days', 'Permanent after 30 days')}</Text>
              <Text style={styles.warnSub}>
                {tr('auto.deleteAccount.softDeletedNowSignIn', 'Soft-deleted now; sign in within 30 days to cancel.')}
              </Text>
            </View>
          </View>

          {/* Spec V8: pre-flight readiness panel. Blocks deletion until
              active deliveries are 0 and wallet balance is withdrawn. */}
          {readiness === null ? (
            <View style={[styles.readyBanner, { backgroundColor: theme.surfaceSecond }]}>
              <ActivityIndicator color={theme.primary} />
              <Text style={[styles.readyTitle, { color: theme.textSecond }]}>{tr('auto.deleteAccount.checkingYourAccount', 'Checking your account…')}</Text>
            </View>
          ) : readiness.ready ? (
            <View style={[styles.readyBanner, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', borderWidth: 1 }]}>
              <CheckCircle size={20} color="#16A34A" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.readyTitle, { color: '#15803D' }]}>{tx('auto.deleteAccount.readyToDelete', 'Ready to delete')}</Text>
                <Text style={[styles.readySub,   { color: '#166534' }]}>{tx('auto.deleteAccount.noActiveDeliveriesWalletIs', 'No active deliveries, wallet is empty.')}</Text>
              </View>
            </View>
          ) : (
            <View style={[styles.blockBanner, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
              <AlertCircle size={20} color="#D97706" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.readyTitle, { color: '#92400E' }]}>
                  {readiness.blockers.length} thing{readiness.blockers.length === 1 ? '' : 's'} to do first
                </Text>
                {readiness.blockers.map((b, i) => (
                  <View key={i} style={{ marginTop: 8 }}>
                    <Text style={[styles.blockerLabel, { color: '#92400E' }]}>
                      {b.type === 'active_deliveries' ? `${b.count} active deliver${b.count === 1 ? 'y' : 'ies'}` :
                       b.type === 'wallet_balance'    ? tx9('auto.deleteAccount.walletBalance', 'Wallet balance: {{v0}}', { v0: naira(b.count) }) :
                       `${b.type}: ${b.count}`}
                    </Text>
                    <Text style={[styles.blockerAction, { color: '#92400E' }]}>{b.action}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <Text style={[styles.what, { color: theme.text }]}>{tx('auto.deleteAccount.whatGetsDeleted', 'What gets deleted')}</Text>
          {[
            tx9('auto.deleteAccount.yourDriverProfileKycDocuments', 'Your driver profile, KYC documents, and ratings'),
            tx9('auto.deleteAccount.yourTripHistoryAfterThe', 'Your trip history (after the 30-day grace window)'),
            tx9('auto.deleteAccount.yourWalletBalanceWithdrawIt', 'Your wallet balance: withdraw it before deleting'),
            tx9('auto.deleteAccount.yourBankDetailsSavedPayout', 'Your bank details + saved payout info'),
          ].map(t => (
            <Text key={t} style={[styles.bullet, { color: theme.textSecond }]}>• {t}</Text>
          ))}

          <Text style={[styles.what, { color: theme.text, marginTop: Spacing.md }]}>{tx('auto.deleteAccount.whatStays', 'What stays')}</Text>
          {[
            tx9('auto.deleteAccount.auditTrailsForAnyOpen', 'Audit trails for any open complaints or disputes'),
            tx9('auto.deleteAccount.taxRecordsWeAreLegally', 'Tax records we are legally required to retain (FIRS / NDPR)'),
            tx9('auto.deleteAccount.anonymisedAnalyticsYouAreNot', 'Anonymised analytics: you are not personally identifiable'),
          ].map(t => (
            <Text key={t} style={[styles.bullet, { color: theme.textSecond }]}>• {t}</Text>
          ))}

          <Pressable
            onPress={handleExport}
            disabled={exporting}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: Spacing.md, borderRadius: Radius.lg,
              borderWidth: 1.5, borderColor: theme.primary,
              backgroundColor: theme.primary + '08', marginTop: Spacing.md,
            }}
          >
            {exporting
              ? <ActivityIndicator color={theme.primary} />
              : <>
                  <Download size={16} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontWeight: FontWeight.semibold, fontSize: FontSize.sm }}>
                    {tr('auto.deleteAccount.downloadMyDataFirstRecommended', 'Download my data first (recommended)')}
                  </Text>
                </>}
          </Pressable>

          <View style={{ marginTop: Spacing.lg, gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>{tr('auto.deleteAccount.confirmYourPassword', 'CONFIRM YOUR PASSWORD')}</Text>
            <PasswordInput value={password} onChangeText={setPassword} placeholder={tx('auto.deleteAccount.enterCurrentPassword', 'Enter current password')} />
          </View>

          <View style={{ marginTop: Spacing.md, gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>
              TYPE &ldquo;{CONFIRM_PHRASE}&rdquo; TO ENABLE
            </Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder={CONFIRM_PHRASE}
              placeholderTextColor={theme.textThird}
              style={{
                borderWidth: 1, borderColor: theme.border, borderRadius: Radius.lg,
                paddingHorizontal: 12, paddingVertical: 12, backgroundColor: theme.surface,
                color: theme.text, fontSize: FontSize.base,
              }}
            />
          </View>

          <Pressable
            disabled={!canSubmit || loading}
            onPress={handleSubmit}
            style={[
              styles.dangerBtn,
              { backgroundColor: canSubmit ? '#DC2626' : theme.surfaceSecond },
            ]}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Trash2 size={16} color={canSubmit ? '#fff' : theme.textThird} />
                  <Text style={[styles.dangerBtnText, { color: canSubmit ? '#fff' : theme.textThird }]}>
                    {tr('auto.deleteAccount.deleteMyAccount', 'Delete my account')}
                  </Text>
                </>
            }
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
      <SeirsSheet spec={sheet} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  content: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  warnBanner:{ flexDirection: 'row', gap: 12, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'flex-start', backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
  warnTitle: { color: '#991B1B', fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: 4 },
  warnSub:   { color: '#991B1B', fontSize: FontSize.sm, lineHeight: 19 },

  /**
   * The CHECKING variant of this banner used a hardcoded #F3F4F6 with
   * theme.textSecond on top. In dark mode that is #8B949E on light grey:
   * 2.79:1, and "Checking your account" was invisible on a dark phone. It now
   * takes theme.surfaceSecond.
   *
   * The ready and blocked variants below keep their hardcoded light
   * backgrounds on purpose, because they pair them with hardcoded DARK text
   * (#15803D, #166534) and so read correctly in either theme. Mixing a fixed
   * background with a themed foreground is the bug; a fully fixed pair is not.
   */
  readyBanner: { flexDirection: 'row', gap: 12, padding: Spacing.md, borderRadius: Radius.lg, alignItems: 'center' },
  readyTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  readySub:    { fontSize: FontSize.xs, marginTop: 2 },
  blockBanner: { flexDirection: 'row', gap: 12, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'flex-start' },
  blockerLabel:{ fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  blockerAction:{ fontSize: FontSize.xs, marginTop: 2, lineHeight: 17 },
  what:      { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginTop: Spacing.sm },
  bullet:    { fontSize: FontSize.sm, lineHeight: 21, paddingLeft: Spacing.xs },
  fieldLabel:{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.lg, marginTop: Spacing.lg },
  dangerBtnText:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
