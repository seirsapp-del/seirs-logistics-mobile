import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StatusBar,
  BackHandler,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { authApi } from '@/services/api';
import { PasswordInput } from '@/components/PasswordInput';
import { GoogleIcon } from '@/components/GoogleIcon';
import {
  ArrowLeft, Mail, ArrowRight, Apple as AppleIcon, Truck,
} from 'lucide-react-native';

export default function LoginScreen() {
  const router      = useRouter();
  const cs          = useColorScheme();
  const theme       = Colors[cs ?? 'light'];
  const isDark      = cs === 'dark';
  const { login }   = useAuth();
  const { t }       = useTranslation();

  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  // Hardware back button: mirror the on-screen arrow's behavior so users
  // can rewatch the onboarding animation regardless of how they go back.
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
      const res = await authApi.login(email.trim().toLowerCase(), password);
      await login({ ...res.user, token: res.token, rememberMe });
    } catch (e: any) {
      const msg: string = e.message ?? '';
      // Account exists but email not verified — send them to OTP screen with
      // email pre-filled instead of dead-ending on the error text.
      if (msg.toLowerCase().includes('verify your email')) {
        router.push({ pathname: '/(auth)/verify-otp' as any, params: { email: email.trim().toLowerCase() } });
        return;
      }
      setError(msg || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    try {
      const res = await authApi.googleLogin();
      await login({ ...res.user, token: res.token, rememberMe });
    } catch (e: any) {
      setError(e.message ?? 'Google sign-in failed.');
    }
  };

  const handleApple = async () => {
    setError('');
    try {
      const res = await authApi.appleLogin();
      await login({ ...res.user, token: res.token, rememberMe });
    } catch (e: any) {
      setError(e.message ?? 'Apple sign-in failed.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <Pressable style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.push('/(auth)/onboarding')}>
          <View style={[styles.backCircle, { backgroundColor: theme.surface }, Shadows.xs]}>
            <ArrowLeft size={20} color={theme.text} strokeWidth={2} />
          </View>
        </Pressable>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Truck size={22} color={theme.primary} strokeWidth={2} />
            <Text style={[styles.brand, { color: theme.primary }]}>SEIRS</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{t('auth.welcomeBack')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>{t('auth.signInToContinue')}</Text>
        </View>

        {/* Form card */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          {!!error && (
            <View style={[styles.errorBox, { backgroundColor: '#EF444415' }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          )}

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>{t('auth.emailAddress')}</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <Mail size={17} color={theme.textThird} strokeWidth={1.75} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="you@gmail.com"
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
            <Text style={[styles.label, { color: theme.textSecond }]}>{t('auth.password')}</Text>
            <PasswordInput
              placeholder={t('auth.password')}
              placeholderTextColor={theme.textThird}
              autoComplete="password"
              backgroundColor={theme.surfaceSecond}
              borderColor={theme.border}
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {/* Remember Me + Forgot Password */}
          <View style={styles.rememberRow}>
            <Pressable style={styles.rememberLeft} onPress={() => setRememberMe(v => !v)}>
              <View style={[
                styles.checkbox,
                {
                  borderColor:     rememberMe ? theme.accent : theme.border,
                  backgroundColor: rememberMe ? theme.accent : 'transparent',
                },
              ]}>
                {rememberMe && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </View>
              <Text style={[styles.rememberText, { color: theme.textSecond }]}>{t('auth.rememberMe')}</Text>
            </Pressable>

            <Pressable onPress={() => router.push('/(auth)/forgot-password' as any)}>
              <Text style={[styles.forgotText, { color: theme.accent }]}>{t('auth.forgotPassword')}</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.submitBtn, { backgroundColor: theme.primary }, loading && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.submitRow}>
                <Text style={styles.submitText}>{t('auth.signIn')}</Text>
                <ArrowRight size={18} color="#fff" strokeWidth={2.5} />
              </View>
            )}
          </Pressable>
        </View>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <Text style={[styles.dividerText, { color: theme.textThird }]}>{t('auth.orContinueWith')}</Text>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
        </View>

        {/* Social buttons */}
        <View style={styles.socialRow}>
          <Pressable
            style={[styles.socialBtn, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
            onPress={handleGoogle}
          >
            <GoogleIcon size={20} />
            <Text style={[styles.socialText, { color: theme.text }]}>Continue with Google</Text>
          </Pressable>

          {Platform.OS === 'ios' && (
            <Pressable
              style={[styles.socialBtn, { backgroundColor: isDark ? '#FFFFFF' : '#000000', borderColor: 'transparent' }, Shadows.xs]}
              onPress={handleApple}
            >
              <AppleIcon size={20} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={1.75} />
              <Text style={[styles.socialText, { color: isDark ? '#000000' : '#FFFFFF' }]}>Apple</Text>
            </Pressable>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecond }]}>Don't have an account?</Text>
          <Pressable onPress={() => router.push('/(auth)/register' as any)}>
            <Text style={[styles.footerLink, { color: theme.accent }]}> Sign Up</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  backBtn:    { marginBottom: Spacing.lg },
  backCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  header:     { marginBottom: Spacing.xl },
  brandRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.md },
  brand:      { fontSize: FontSize.sm, fontWeight: FontWeight.black, letterSpacing: 3 },
  title:      { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, marginBottom: Spacing.xs },
  subtitle:   { fontSize: FontSize.base },
  card:       { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  errorBox:   { padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  errorText:  { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: '#EF4444' },
  field:      { marginBottom: Spacing.md, gap: Spacing.xs },
  label:      { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md },
  inputIcon:  { marginRight: Spacing.sm } as any,
  input:      { flex: 1, fontSize: FontSize.base, height: '100%' },

  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
    marginTop: -Spacing.xs,
  },
  rememberLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: Radius.xs,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark:    { color: '#FFFFFF', fontSize: 12, fontWeight: FontWeight.bold, lineHeight: 14 },
  rememberText: { fontSize: FontSize.sm },
  forgotText:   { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  submitBtn: { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  submitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  submitText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semibold },

  dividerRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg },
  divider:     { flex: 1, height: 1 },
  dividerText: { fontSize: FontSize.xs, whiteSpace: 'nowrap' } as any,

  socialRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
  socialBtn: {
    flex: 1, height: 52, borderRadius: Radius.lg, borderWidth: 1.5,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
  },
  socialText: { fontSize: FontSize.base, fontWeight: FontWeight.medium },

  footer:     { flexDirection: 'row', justifyContent: 'center' },
  footerText: { fontSize: FontSize.base },
  footerLink: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
