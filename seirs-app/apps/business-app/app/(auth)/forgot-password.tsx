import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { SeirsMarkBold } from '@seirs/shared/components/SeirsLogoV2';
import { authApi } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { tx } from '@/i18n/tx';

/**
 * Forgot password, and the "check your inbox" state that follows it.
 *
 * Audit 2026-08-10: customer and driver both had this flow and business had
 * none, so a business owner who forgot their password was locked out for
 * good. Rebuilt 2026-09-01 on the customer app's auth structure, which was
 * the last thing separating it from the other two: it had no back arrow, no
 * form card, hardcoded 24/13/12 spacing, and an error box painted
 * #FEF2F2/#FECACA, which is a near-white panel on a dark background.
 *
 * The two states deliberately share the container and reserve the same
 * height at the top, so the lockup does not jump the moment you submit.
 */
export default function ForgotPasswordScreen() {
  const router     = useRouter();
  const insets     = useSafeAreaInsets();
  const { isDark } = useTheme();
  const theme      = Colors[isDark ? 'dark' : 'light'];

  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  /* Was length > 3, so "notanemail" submitted happily and the next screen
     told them to check an inbox that cannot exist. The regex is loose on
     purpose: the server decides what is real, this only stops the obvious. */
  const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const canSubmit = EMAIL_RE.test(email.trim().toLowerCase()) && !loading;

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const Lockup = (
    <View style={styles.brandRow}>
      <SeirsMarkBold size={38} color={theme.primary} hubColor={theme.background} />
      <Text style={[styles.brand,    { color: theme.primary }]}>SEIRS</Text>
      <Text style={[styles.brandSub, { color: theme.textThird }]}>BUSINESS &amp; PARTNERS</Text>
    </View>
  );

  if (sent) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScrollView
          contentContainerStyle={[styles.container, { backgroundColor: theme.background, paddingBottom: Spacing.xl + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Holds the space the back arrow occupies on the form state. This
              state does not need an arrow (the full-width "Back to Sign In"
              button is right there), but without reserving its height the
              lockup jumps up the moment you submit. */}
          <View style={styles.backSpacer} />
          {Lockup}

          {/* Flat, not a raised card: a shadowed box around a single message
              is furniture. Brand blue rather than success green, because
              nothing succeeded and we deliberately do not reveal whether the
              account exists. */}
          <View style={styles.sentWrap}>
            <View style={[styles.sentIconWrap, { backgroundColor: theme.primary + (isDark ? '26' : '18') }]}>
              <Icon name="Mail" size={40} color={theme.primary} />
            </View>
            <Text style={[styles.sentTitle, { color: theme.text }]}>{tx('auto.forgotPassword.checkYourInbox', 'Check your inbox')}</Text>
            <Text style={[styles.sentDesc, { color: theme.textSecond }]}>
              If an account exists for {email.trim().toLowerCase()}, we sent a reset link.
              It expires in 15 minutes. Check spam if you do not see it.
            </Text>
          </View>

          <Pressable style={[styles.btn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
            <Text style={[styles.btnText, { color: theme.textOnPrimary }]}>{tx('auto.forgotPassword.backToSignIn', 'Back to Sign In')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={[styles.container, { backgroundColor: theme.background, paddingBottom: Spacing.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={styles.backBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={tx('auto.forgotPassword.back', 'Back')}
          onPress={() => router.back()}
        >
          <View style={[styles.backCircle, { backgroundColor: theme.surface }, Shadows.xs]}>
            <Icon name="ArrowLeft" size={20} color={theme.text} />
          </View>
        </Pressable>

        {Lockup}

        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>{tx('auto.forgotPassword.forgotPassword', 'Forgot password?')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            Enter your email and we&apos;ll send you a link to reset your password.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          {!!error && (
            <View style={[styles.errorBox, { backgroundColor: theme.error + '18' }]}>
              <Icon name="AlertCircle" size={16} color={theme.error} />
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          )}

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>{tx('auto.forgotPassword.emailAddress', 'Email address')}</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <Icon name="Mail" size={17} color={theme.textThird} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                value={email}
                onChangeText={setEmail}
                placeholder="business@company.ng"
                placeholderTextColor={theme.textThird}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>
          </View>

          <Pressable
            style={[styles.btn, { backgroundColor: theme.primary }, !canSubmit && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            {loading ? <ActivityIndicator color={theme.textOnPrimary} /> : (
              <View style={styles.btnRow}>
                <Text style={[styles.btnText, { color: theme.textOnPrimary }]}>{tx('auto.forgotPassword.sendResetLink', 'Send Reset Link')}</Text>
                <Icon name="ArrowRight" size={18} color={theme.textOnPrimary} />
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecond }]}>{tx('auto.forgotPassword.rememberYourPassword', 'Remember your password?')}</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={[styles.footerLink, { color: theme.accent }]}> {tx('auto.forgotPassword.signIn', 'Sign In')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:  { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.xxl, paddingBottom: Spacing.xl },
  backSpacer: { height: 40, marginBottom: Spacing.lg },
  backBtn:    { marginBottom: Spacing.lg },
  backCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  brandRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.md },
  brand:      { fontSize: FontSize.sm, fontWeight: FontWeight.black as any, letterSpacing: 3 },
  brandSub:   { fontSize: 9, fontWeight: FontWeight.medium as any, letterSpacing: 1.5, marginTop: 1 },
  header:     { marginBottom: Spacing.xl },
  title:      { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold as any, marginBottom: Spacing.xs },
  subtitle:   { fontSize: FontSize.base, lineHeight: 22 },
  card:       { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  errorBox:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  errorText:  { fontSize: FontSize.sm, fontWeight: FontWeight.medium as any, flex: 1 },
  field:      { marginBottom: Spacing.md, gap: Spacing.xs },
  label:      { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md },
  input:      { flex: 1, fontSize: FontSize.base, height: '100%' },
  btn:        { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  btnDisabled:{ opacity: 0.5 },
  btnRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  btnText:    { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any },
  footer:     { flexDirection: 'row', justifyContent: 'center' },
  footerText: { fontSize: FontSize.base },
  footerLink: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  sentWrap:     { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.lg, marginBottom: Spacing.lg },
  sentIconWrap: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  sentTitle:    { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any },
  sentDesc:     { fontSize: FontSize.base, lineHeight: 22, textAlign: 'center' },
});
