/**
 * Delete Account, business.
 *
 * Google Play requires that any app which lets someone create an account
 * lets them delete it from inside the app. Customer and driver have had
 * this since the NDPR work; business never did, and it has a register
 * screen, so this was a straight rejection waiting to happen (store audit,
 * 2026-08-30).
 *
 * Same backend as the other two: POST /users/me/delete soft-deletes with a
 * 30-day grace window, and a cron hard-deletes after it. Signing back in
 * inside the window cancels it.
 *
 * Colours come from the shared theme only. No literals.
 */
import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Icon } from '@/components/Icon';
import { usersApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/context/ThemeContext';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';

const CONFIRM_PHRASE = 'delete my account';

export default function DeleteBusinessAccountScreen() {
  const router   = useRouter();
  const colors   = useColors();
  const { logout } = useAuth() as any;

  const [password,    setPassword]    = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [exporting,   setExporting]   = useState(false);

  /** NDPR Article 24, data portability: take a copy before erasing. */
  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await usersApi.exportData();
      const json = JSON.stringify(data, null, 2);
      await Clipboard.setStringAsync(json);
      alertDialog(
        'Copied to clipboard',
        `Your data export (${(json.length / 1024).toFixed(1)} KB) has been copied. ` +
        'Paste it into a notes app or email it to yourself, then save it somewhere safe.',
      );
    } catch (e: any) {
      alertDialog('Could not export your data', e?.message ?? 'Try again in a moment.');
    } finally {
      setExporting(false);
    }
  };

  const canSubmit =
    password.length > 0 &&
    confirmText.trim().toLowerCase() === CONFIRM_PHRASE;

  const handleSubmit = () => {
    alertDialog(
      'Delete this business account?',
      'Your account is deactivated now and permanently deleted after 30 days. ' +
      'Sign in before then to cancel.',
      [
        { text: tr('auto.payoutAccount.cancel', 'Cancel'), style: 'cancel' },
        {
          text: tr('auto.deleteAccount.delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const res: any = await usersApi.deleteAccount(password);
              const scheduled = res?.scheduledAt
                ? new Date(res.scheduledAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
                : 'in 30 days';
              alertDialog(
                'Account deletion scheduled',
                `This account will be permanently deleted on ${scheduled}. Sign back in any time ` +
                'before then and tap Cancel in the banner at the top to keep it.',
                [{ text: 'OK', onPress: async () => {
                  try { await logout?.(); } catch { /* best effort */ }
                  router.replace('/(auth)/login' as any);
                } }],
              );
            } catch (e: any) {
              alertDialog('Could not delete the account', e?.message ?? 'Try again in a moment.');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: colors.surfaceSecond }]} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>{tx('auto.deleteAccount.deleteAccount', 'Delete Account')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <View style={[styles.warnBanner, { backgroundColor: colors.error + '14', borderColor: colors.error + '55' }]}>
            <Icon name="AlertTriangle" size={20} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.warnTitle, { color: colors.error }]}>{tx('auto.deleteAccount.permanentAfter30Days', 'Permanent after 30 days')}</Text>
              <Text style={[styles.warnSub, { color: colors.textSecond }]}>
                {tr('auto.deleteAccount.deactivatedNowSignInWithin', 'Deactivated now. Sign in within 30 days to cancel. After that everything below is removed for good.')}
              </Text>
            </View>
          </View>

          <Text style={[styles.what, { color: colors.text }]}>{tx('auto.deleteAccount.finishTheseFirst', 'Finish these first')}</Text>
          {[
            'Deliveries still in progress: let them complete or cancel them',
            'Packages sitting at a partner store waiting to be collected',
            'API keys in use by your shop, which stop working immediately',
          ].map((line) => (
            <Text key={line} style={[styles.bullet, { color: colors.textSecond }]}>{'•'} {line}</Text>
          ))}

          <Text style={[styles.what, { color: colors.text }]}>{tx('auto.deleteAccount.whatGetsDeleted', 'What gets deleted')}</Text>
          {[
            'Your business profile, contact details and logo',
            'Your delivery history and itemised statements, after the grace window',
            'Saved addresses, recurring runs and saved payment details',
            'Your API keys and webhook endpoints',
            'Loyalty points, which cannot be transferred or paid out',
          ].map((line) => (
            <Text key={line} style={[styles.bullet, { color: colors.textSecond }]}>{'•'} {line}</Text>
          ))}

          <Text style={[styles.what, { color: colors.text }]}>{tx('auto.deleteAccount.whatWeKeep', 'What we keep')}</Text>
          {[
            'Records tied to an open dispute, until it is settled',
            'Invoices and tax records we are legally required to retain',
            'Anonymised analytics, which cannot identify you',
          ].map((line) => (
            <Text key={line} style={[styles.bullet, { color: colors.textSecond }]}>{'•'} {line}</Text>
          ))}

          <Pressable
            onPress={handleExport}
            disabled={exporting}
            style={[styles.exportBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '0D' }]}
          >
            {exporting ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Icon name="Download" size={16} color={colors.primary} />
                <Text style={[styles.exportText, { color: colors.primary }]}>
                  {tr('auto.deleteAccount.downloadMyDataFirstRecommended', 'Download my data first (recommended)')}
                </Text>
              </>
            )}
          </Pressable>

          <View style={{ marginTop: 20, gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.textSecond }]}>{tr('auto.deleteAccount.confirmYourPassword', 'CONFIRM YOUR PASSWORD')}</Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={tx('auto.deleteAccount.enterCurrentPassword', 'Enter current password')}
                placeholderTextColor={colors.textThird}
                secureTextEntry={!showPass}
                autoCapitalize="none"
                style={[styles.input, { color: colors.text }]}
              />
              <Pressable onPress={() => setShowPass((v) => !v)} hitSlop={10}>
                <Icon name={showPass ? 'EyeOff' : 'Eye'} size={18} color={colors.textThird} />
              </Pressable>
            </View>
          </View>

          <View style={{ marginTop: 14, gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.textSecond }]}>
              TYPE {'“'}{CONFIRM_PHRASE}{'”'} TO ENABLE
            </Text>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder={CONFIRM_PHRASE}
              placeholderTextColor={colors.textThird}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, styles.inputWrap, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
          </View>

          <Pressable
            disabled={!canSubmit || loading}
            onPress={handleSubmit}
            style={[styles.dangerBtn, { backgroundColor: canSubmit ? colors.error : colors.surfaceSecond }]}
          >
            {loading ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <>
                <Icon name="Trash2" size={16} color={canSubmit ? colors.textOnPrimary : colors.textThird} />
                <Text style={[styles.dangerBtnText, { color: canSubmit ? colors.textOnPrimary : colors.textThird }]}>
                  {tr('auto.deleteAccount.deleteMyAccount', 'Delete my account')}
                </Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  backBtn:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: 17, fontWeight: '700' },
  content:    { padding: 16, gap: 8, paddingBottom: 48 },
  warnBanner: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, alignItems: 'flex-start' },
  warnTitle:  { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  warnSub:    { fontSize: 13.5, lineHeight: 19 },
  what:       { fontSize: 15, fontWeight: '700', marginTop: 14 },
  bullet:     { fontSize: 13.5, lineHeight: 21, paddingLeft: 4 },
  exportBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14, borderWidth: 1.5, marginTop: 16 },
  exportText: { fontWeight: '600', fontSize: 13.5 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12 },
  input:      { flex: 1, paddingVertical: 12, fontSize: 15 },
  dangerBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 22 },
  dangerBtnText: { fontSize: 15, fontWeight: '700' },
});
