import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { SeirsMarkBold } from '@seirs/shared/components/SeirsLogoV2';
import { authApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Colors, Palette } from '@/constants/theme';

export default function LoginScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { login } = useAuth();
  const { isDark } = useTheme();
  const theme   = Colors[isDark ? 'dark' : 'light'];

  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Login should not enforce password complexity: existing accounts may
  // pre-date the current policy. Just require non-empty.
  const canSubmit = email.trim() && password.length > 0 && !loading;

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const { token, user } = await authApi.login(email.trim().toLowerCase(), password);
      await login({ ...user, token }, rememberMe);
    } catch (e: any) {
      const msg: string = e.message ?? '';
      // Account exists but email not verified: route to OTP screen with
      // email pre-filled so user can finish verification.
      if (msg.toLowerCase().includes('verify your email')) {
        router.push({ pathname: '/(auth)/verify-otp' as any, params: { email: email.trim().toLowerCase() } });
        return;
      }
      setError(msg || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  // Brand gradient: Navy → lighter Navy. These are the canonical brand stops.

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Floating lockup, matching customer and driver. The navy bar was
          the last place a pre-login screen did its own thing
          (founder 2026-09-01). */}
      <Pressable
        style={styles.backBtn}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.canGoBack() ? router.back() : router.push('/(auth)/onboarding' as any)}
      >
        <View style={[styles.backCircle, { backgroundColor: theme.surface }]}>
          <Icon name="ArrowLeft" size={20} color={theme.text} />
        </View>
      </Pressable>

      <View style={styles.header}>
        <View style={styles.brandRow}>
          <SeirsMarkBold size={38} color={theme.primary} hubColor={theme.background} />
          <Text style={[styles.brand, { color: theme.primary }]}>SEIRS</Text>
          <Text style={[styles.brandSub, { color: theme.textThird }]}>Business &amp; Partners</Text>
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Welcome back</Text>
        <Text style={[styles.subtitle, { color: theme.textSecond }]}>Sign in to continue</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24, backgroundColor: theme.background }]}
        keyboardShouldPersistTaps="handled"
      >

        {error !== '' && (
          <View style={[styles.errorBox, { backgroundColor: isDark ? '#3F1F1F' : '#FEF2F2', borderColor: isDark ? '#7F1D1D' : '#FECACA' }]}>
            <Icon name="AlertCircle" size={16} color={theme.error} />
            <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
          </View>
        )}

        <Text style={[styles.label, { color: theme.textSecond }]}>Email address</Text>
        <View style={[styles.inputWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Icon name="Mail" size={16} color={theme.textThird} />
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

        <Text style={[styles.label, { color: theme.textSecond }]}>Password</Text>
        <View style={[styles.inputWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Icon name="Lock" size={16} color={theme.textThird} />
          <TextInput
            style={[styles.input, { flex: 1, color: theme.text }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor={theme.textThird}
            secureTextEntry={!showPass}
            autoComplete="password"
          />
          <Pressable onPress={() => setShowPass((v) => !v)}>
            <Icon name={showPass ? 'EyeOff' : 'Eye'} size={16} color={theme.textThird} />
          </Pressable>
        </View>
        {/* Remember me beside the forgot link, matching customer and driver.
            Ticked by default: staying signed in is the expectation, and
            unticking is the deliberate act. */}
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
            <Text style={[styles.rememberText, { color: theme.textSecond }]}>Remember me</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/(auth)/forgot-password' as any)}>
            <Text style={[styles.footerLink, { color: theme.accent }]}>Forgot password?</Text>
          </Pressable>
        </View>
        <Pressable
          style={[styles.btn, { backgroundColor: theme.primary }, !canSubmit && styles.btnDisabled]}
          onPress={handleLogin}
          disabled={!canSubmit}
        >
          {loading
            ? <ActivityIndicator color={theme.textOnPrimary} />
            : <Text style={[styles.btnText, { color: theme.textOnPrimary }]}>Sign In</Text>
          }
        </Pressable>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecond }]}>Don&apos;t have an account? </Text>
          <Pressable onPress={() => router.push('/(auth)/register' as any)}>
            <Text style={[styles.footerLink, { color: theme.accent }]}>Sign Up</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backBtn:    { marginBottom: 16, paddingHorizontal: 24, paddingTop: 8 },
  backCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  header:     { paddingHorizontal: 24, marginBottom: 24 },
  brandRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  brand:      { fontSize: 15, fontWeight: '900', letterSpacing: 4 },
  brandSub:   { fontSize: 12, marginTop: 1 },
  title:      { fontSize: 26, fontWeight: '800', marginBottom: 4 },
  subtitle:   { fontSize: 15 },
  logoRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  logoIcon:   {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  logoText:   { fontSize: 20, fontWeight: '900', letterSpacing: 3 },
  logoSub:    { fontSize: 12, marginTop: 1 },
  body:       { padding: 24, flexGrow: 1 },
  heading:    { fontSize: 24, fontWeight: '800', marginBottom: 20, marginTop: 8 },
  errorBox:   {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorText:  { fontSize: 14, flex: 1 },
  label:      { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  inputWrap:  {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, marginBottom: 14,
  },
  input:      { fontSize: 15, flex: 1 },
  fieldError: { fontSize: 13, marginTop: -10, marginBottom: 12, marginLeft: 4 },
  btn:        { height: 56, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  btnDisabled:{ opacity: 0.5 },
  btnText:    { fontWeight: '700', fontSize: 16 },
  rememberRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  rememberLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox:     { width: 20, height: 20, borderRadius: 5, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  checkmark:    { color: '#FFFFFF', fontSize: 12, fontWeight: '700', lineHeight: 14 },
  rememberText: { fontSize: 14 },
  forgotRow:  { alignSelf: 'flex-end', marginTop: -6, marginBottom: 4 },
  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { fontSize: 15 },
  footerLink: { fontWeight: '600', fontSize: 15 },
});
