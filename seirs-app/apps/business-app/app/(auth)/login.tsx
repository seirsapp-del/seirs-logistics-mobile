import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StatusBar,
  BackHandler,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { SeirsMarkBold } from '@seirs/shared/components/SeirsLogoV2';
import { PasswordInput } from '@/components/PasswordInput';
import { SocialSignIn } from '@/components/SocialSignIn';
import { authApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { tx } from '@/i18n/tx';

/**
 * Business sign-in.
 *
 * Rebuilt 2026-09-01 on the customer app's auth structure, which the founder
 * set as the reference after seeing this screen next to the other two: same
 * scroll shell, same floating back circle, same lockup, same raised form card,
 * same 56pt button. It had been laying its fields bare on the background with
 * hardcoded 24/13/12 spacing while customer and driver used the shared scale,
 * which is why it read as a different product rather than a different section
 * of the same one.
 *
 * What stays business's own: the "Business & Partners" tag and the register
 * route. The colours were always shared, so nothing here overrides them.
 */
export default function LoginScreen() {
  const router     = useRouter();
  const insets     = useSafeAreaInsets();
  const { login }  = useAuth();
  const { isDark } = useTheme();
  const theme      = Colors[isDark ? 'dark' : 'light'];

  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  // Login must not enforce password complexity: existing accounts may
  // pre-date the current policy. Non-empty is the whole bar.
  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  // Hardware back mirrors the on-screen arrow, so both routes out of this
  // screen land on onboarding rather than closing the app.
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) router.back();
      else router.push('/(auth)/onboarding' as any);
      return true;
    });
    return () => sub.remove();
  }, [router]));

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError('Please fill in all fields.'); return; }
    setError('');
    setLoading(true);
    try {
      const { token, user } = await authApi.login(email.trim().toLowerCase(), password);
      await login({ ...user, token }, rememberMe);
    } catch (e: any) {
      const msg: string = e.message ?? '';
      // Account exists but the email is unverified: carry them to the OTP
      // screen with the address filled in, rather than dead-ending on text.
      if (msg.toLowerCase().includes('verify your email')) {
        router.push({ pathname: '/(auth)/verify-otp' as any, params: { email: email.trim().toLowerCase() } });
        return;
      }
      setError(msg || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { backgroundColor: theme.background, paddingBottom: Spacing.xl + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <Pressable
          style={styles.backBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={tx('auto.login.back', 'Back')}
          onPress={() => router.canGoBack() ? router.back() : router.push('/(auth)/onboarding' as any)}
        >
          <View style={[styles.backCircle, { backgroundColor: theme.surface }, Shadows.xs]}>
            <Icon name="ArrowLeft" size={20} color={theme.text} />
          </View>
        </Pressable>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <SeirsMarkBold size={38} color={theme.primary} hubColor={theme.background} />
            <Text style={[styles.brand,    { color: theme.primary }]}>SEIRS</Text>
            <Text style={[styles.brandSub, { color: theme.textThird }]}>BUSINESS &amp; PARTNERS</Text>
          </View>
          <Text style={[styles.title,    { color: theme.text }]}>{tx('auto.login.welcomeBack', 'Welcome back')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>{tx('auto.login.signInToContinue', 'Sign in to continue')}</Text>
        </View>

        {/* Form card */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          {!!error && (
            <View style={[styles.errorBox, { backgroundColor: theme.error + '18' }]}>
              <Icon name="AlertCircle" size={16} color={theme.error} />
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          )}

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>{tx('auto.login.emailAddress', 'Email address')}</Text>
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

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>{tx('auto.login.password', 'Password')}</Text>
            <PasswordInput
              placeholder={tx('auto.login.yourPassword', 'Your password')}
              placeholderTextColor={theme.textThird}
              autoComplete="password"
              backgroundColor={theme.surfaceSecond}
              borderColor={theme.border}
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {/* Remember me beside the forgot link. Ticked by default: staying
              signed in is the expectation, unticking is the deliberate act. */}
          <View style={styles.rememberRow}>
            <Pressable style={styles.rememberLeft} onPress={() => setRememberMe(v => !v)}>
              <View style={[
                styles.checkbox,
                {
                  borderColor:     rememberMe ? theme.accent : theme.border,
                  backgroundColor: rememberMe ? theme.accent : 'transparent',
                },
              ]}>
                {rememberMe && <Text style={styles.checkmark}>{'✓'}</Text>}
              </View>
              <Text style={[styles.rememberText, { color: theme.textSecond }]}>{tx('auto.login.rememberMe', 'Remember me')}</Text>
            </Pressable>

            <Pressable onPress={() => router.push('/(auth)/forgot-password' as any)}>
              <Text style={[styles.forgotText, { color: theme.accent }]}>{tx('auto.login.forgotPassword', 'Forgot password?')}</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.submitBtn, { backgroundColor: theme.primary }, !canSubmit && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={!canSubmit}
          >
            {loading ? <ActivityIndicator color={theme.textOnPrimary} /> : (
              <View style={styles.submitRow}>
                <Text style={[styles.submitText, { color: theme.textOnPrimary }]}>{tx('auto.login.signIn', 'Sign In')}</Text>
                <Icon name="ArrowRight" size={18} color={theme.textOnPrimary} />
              </View>
            )}
          </Pressable>
        </View>

        {/*
          Standard Google and Apple buttons (founder 2026-09-05).

          role={role} is the load-bearing prop: it tells the server which
          app is asking, and the server refuses to CREATE an account for
          the driver and business apps, because their signup also makes a
          Driver row or a BusinessAccount that a social button cannot.
        */}
        <SocialSignIn
          role="business"
          theme={theme}
          disabled={loading}
          onError={setError}
          onSignedIn={(res) => login({ ...res.user, token: res.token }, rememberMe)}
        />

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecond }]}>Don&apos;t have an account?</Text>
          <Pressable onPress={() => router.push('/(auth)/register' as any)}>
            <Text style={[styles.footerLink, { color: theme.accent }]}> {tx('auto.login.signUp', 'Sign Up')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:  { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.xl, paddingBottom: Spacing.xl },
  backBtn:    { marginBottom: Spacing.lg },
  backCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  header:     { marginBottom: Spacing.xl },
  brandRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.md },
  brand:      { fontSize: FontSize.sm, fontWeight: FontWeight.black as any, letterSpacing: 3 },
  brandSub:   { fontSize: 9, fontWeight: FontWeight.medium as any, letterSpacing: 1.5, marginTop: 1 },
  title:      { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold as any, marginBottom: Spacing.xs },
  subtitle:   { fontSize: FontSize.base },
  card:       { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  errorBox:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  errorText:  { fontSize: FontSize.sm, fontWeight: FontWeight.medium as any, flex: 1 },
  field:      { marginBottom: Spacing.md, gap: Spacing.xs },
  label:      { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md },
  input:      { flex: 1, fontSize: FontSize.base, height: '100%' },
  rememberRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.lg, marginTop: -Spacing.xs },
  rememberLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  checkbox:     { width: 20, height: 20, borderRadius: Radius.xs, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  checkmark:    { color: '#FFFFFF', fontSize: 12, fontWeight: FontWeight.bold as any, lineHeight: 14 },
  rememberText: { fontSize: FontSize.sm },
  forgotText:   { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  submitBtn:    { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  btnDisabled:  { opacity: 0.5 },
  submitRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  submitText:   { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any },
  footer:       { flexDirection: 'row', justifyContent: 'center' },
  footerText:   { fontSize: FontSize.base },
  footerLink:   { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
});
