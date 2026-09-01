import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StatusBar,
  BackHandler,
} from 'react-native';
import { ArrowLeft, Mail, ArrowRight, Truck, AlertCircle } from 'lucide-react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { authApi } from '@/services/api';
import { PasswordInput } from '@/components/PasswordInput';
import { SeirsMarkBold } from '@seirs/shared/components/SeirsLogoV2';

export default function LoginScreen() {
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const isDark      = colorScheme === 'dark';
  const { login }   = useAuth();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  /**
   * Nothing to submit until both fields carry something.
   *
   * The button used to be live from the first frame, so tapping it on
   * an empty form round-tripped to the server to be told the obvious.
   * Business already gated this; customer and driver did not.
   */
  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;
  const [error,    setError]    = useState('');

  // Hardware back button: mirror the on-screen arrow so users can
  // get back to the onboarding animation regardless of how they go back.
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) router.back();
      else router.push('/(auth)/onboarding' as any);
      return true;
    });
    return () => sub.remove();
  }, [router]));

  const handleLogin = async () => {
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      await login({ ...res.user, token: res.token }, rememberMe);
    } catch (e: any) {
      const msg: string = e.message ?? '';
      if (msg.toLowerCase().includes('verify your email')) {
        router.push({ pathname: '/(auth)/verify-otp' as any, params: { email } });
        return;
      }
      setError(msg || 'Login failed. Please try again.');
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
        <Pressable style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.push('/(auth)/onboarding')}>
          <View style={[styles.backCircle, { backgroundColor: theme.surface }]}>
            <ArrowLeft size={20} color={theme.text} />
          </View>
        </Pressable>

        <View style={styles.header}>
          <View style={styles.brandRow}>
            {/* Same lockup as onboarding (founder 2026-08-10): okada mark
                + spaced SEIRS wordmark + small DRIVER tag. */}
            <SeirsMarkBold size={40} color={theme.primary} hubColor={theme.background} />
            <Text style={[styles.brand, { color: theme.primary }]}>SEIRS</Text>
            <Text style={[styles.brandSub, { color: theme.textThird }]}>DRIVER</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Welcome back</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>Sign in to continue</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: '#EF444418' }]}>
              <AlertCircle size={16} color={theme.error} strokeWidth={1.5} />
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Email address</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <Mail size={18} color={theme.textThird} strokeWidth={1.5} style={styles.inputIcon as any} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="you@example.com"
                placeholderTextColor={theme.textThird}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Password</Text>
            <PasswordInput
              placeholder="Your password"
              placeholderTextColor={theme.textThird}
              autoComplete="password"
              backgroundColor={theme.surfaceSecond}
              borderColor={theme.border}
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {/* Remember me sits beside the forgot link, matching the customer
              app. Defaults to ticked: staying signed in is what a driver
              working a shift expects, and unticking is the deliberate act. */}
          <View style={styles.rememberRow}>
            <Pressable style={styles.rememberLeft} onPress={() => setRememberMe(v => !v)}>
              <View style={[
                styles.checkbox,
                {
                  borderColor:     rememberMe ? theme.primary : theme.border,
                  backgroundColor: rememberMe ? theme.primary : 'transparent',
                },
              ]}>
                {rememberMe && <Text style={styles.checkmark}>{'\u2713'}</Text>}
              </View>
              <Text style={[styles.rememberText, { color: theme.textSecond }]}>Remember me</Text>
            </Pressable>

            <Pressable onPress={() => router.push('/(auth)/forgot-password' as any)}>
              <Text style={[styles.forgotText, { color: theme.primary }]}>Forgot password?</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.submitBtn, { backgroundColor: theme.primary }, !canSubmit && { opacity: 0.5 }]}
            onPress={handleLogin}
            disabled={!canSubmit}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <View style={styles.submitRow}>
                <Text style={styles.submitText}>Sign In</Text>
                <ArrowRight size={20} color="#fff" />
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecond }]}>Don't have an account?</Text>
          <Pressable onPress={() => router.push('/(auth)/driver-register' as any)}>
            <Text style={[styles.footerLink, { color: theme.primary }]}> Sign Up</Text>
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
  brand:      { fontSize: FontSize.sm, fontWeight: FontWeight.black as any, letterSpacing: 4 },
  brandSub:   { fontSize: 9, fontWeight: FontWeight.medium as any, letterSpacing: 3, marginTop: 1 },
  title:      { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold as any, marginBottom: Spacing.xs },
  subtitle:   { fontSize: FontSize.base },
  card:       { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  errorBox:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  errorText:  { fontSize: FontSize.sm, fontWeight: FontWeight.medium as any, flex: 1 },
  field:      { marginBottom: Spacing.md, gap: Spacing.xs },
  label:      { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md },
  inputIcon:  { marginRight: Spacing.sm },
  input:      { flex: 1, fontSize: FontSize.base, height: '100%' },
  rememberRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.lg },
  rememberLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  checkbox:     { width: 20, height: 20, borderRadius: Radius.xs, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  checkmark:    { color: '#FFFFFF', fontSize: 12, fontWeight: FontWeight.bold as any, lineHeight: 14 },
  rememberText: { fontSize: FontSize.sm },
  forgotRow:  { alignItems: 'flex-end', marginBottom: Spacing.lg, marginTop: -Spacing.xs },
  forgotText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  submitBtn:  { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  submitRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  submitText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semibold as any },
  footer:     { flexDirection: 'row', justifyContent: 'center' },
  footerText: { fontSize: FontSize.base },
  footerLink: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
});
