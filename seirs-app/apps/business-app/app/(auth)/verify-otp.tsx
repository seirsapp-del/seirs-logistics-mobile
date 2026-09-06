import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StatusBar,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { SeirsMarkBold } from '@seirs/shared/components/SeirsLogoV2';
import { authApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { tx } from '@/i18n/tx';

const OTP_LENGTH      = 6;
const RESEND_COOLDOWN = 60;

/**
 * Email verification, the one screen where somebody types a code we sent.
 *
 * Rebuilt 2026-09-01 on the customer app's auth structure. Three things here
 * were not merely cosmetic:
 *
 *   1. The screen was a bare View with no KeyboardAvoidingView and no
 *      ScrollView, so the number pad opened straight over the Verify button
 *      and the resend link. On a short screen there was no way to reach
 *      either without dismissing the keyboard first.
 *   2. The error box was painted #FEF2F2 with a #FECACA border and #DC2626
 *      text, all hardcoded, so in dark mode it was a near-white panel. It now
 *      derives from theme.error like the other two apps.
 *   3. The address was printed in full. Customer masks it, which is the
 *      right call on a screen someone may hold up or screenshot.
 *
 * Auto-submit on the sixth digit is carried over from customer too: having
 * typed the whole code, being made to reach for a button is friction.
 */
export default function VerifyOtpScreen() {
  const router     = useRouter();
  const params     = useLocalSearchParams<{ email: string }>();
  const email      = params.email ?? '';
  const insets     = useSafeAreaInsets();
  const { isDark } = useTheme();
  const theme      = Colors[isDark ? 'dark' : 'light'];
  const { login }  = useAuth();

  const [otp,       setOtp]       = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading,   setLoading]   = useState(false);
  const [resending, setResending] = useState(false);
  const [error,     setError]     = useState('');
  const [cooldown,  setCooldown]  = useState(RESEND_COOLDOWN);
  const inputRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleChange = (text: string, index: number) => {
    const digit = text.replace(/\D/g, '').slice(-1);
    const next  = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
    // All six in: submit rather than making them reach for the button.
    if (next.every(d => d !== '') && digit) handleVerify(next.join(''));
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (code?: string) => {
    const finalCode = code ?? otp.join('');
    if (finalCode.length < OTP_LENGTH) { setError('Please enter the complete 6-digit code.'); return; }
    setError('');
    setLoading(true);
    try {
      const { token, user } = await authApi.verifyOtp(email, finalCode);
      await login({ ...user, token });
    } catch (e: any) {
      setError(e.message ?? 'Invalid or expired code. Please try again.');
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError('');
    setResending(true);
    try {
      await authApi.resendOtp(email);
      setCooldown(RESEND_COOLDOWN);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch (e: any) {
      setError(e.message ?? 'Failed to resend code.');
    } finally {
      setResending(false);
    }
  };

  const maskedEmail = email.replace(/(.{2}).+(@.+)/, '$1•••$2');

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
        {/* Back */}
        <Pressable
          style={styles.backBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
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

          <View style={[styles.iconWrap, { backgroundColor: theme.surfaceSecond }]}>
            <Icon name="Mail" size={36} color={theme.accent} />
          </View>

          <Text style={[styles.title, { color: theme.text }]}>{tx('auto.verifyOtp.verifyYourEmail', 'Verify your email')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            We sent a 6-digit code to{'\n'}
            <Text style={{ color: theme.text, fontWeight: FontWeight.semibold as any }}>{maskedEmail}</Text>
          </Text>
          <Text style={[styles.expiry, { color: theme.textThird }]}>{tx('auto.verifyOtp.codeExpiresIn15Minutes', 'Code expires in 15 minutes.')}</Text>
        </View>

        {/* OTP inputs */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          {!!error && (
            <View style={[styles.errorBox, { backgroundColor: theme.error + '18' }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          )}

          <View style={styles.otpRow}>
            {otp.map((digit, i) => (
              <TextInput
                key={i}
                ref={ref => { inputRefs.current[i] = ref; }}
                style={[
                  styles.otpBox,
                  {
                    color:           theme.text,
                    backgroundColor: theme.surfaceSecond,
                    borderColor:     digit ? theme.accent : theme.border,
                  },
                  Shadows.xs,
                ]}
                value={digit}
                onChangeText={(text) => handleChange(text, i)}
                onKeyPress={e => handleKeyPress(e, i)}
                onFocus={() => {
                  // Tapping straight into a later box let people type a code
                  // with holes in it: the founder produced "2 2 _ 6 6 _" on
                  // the business app, 2026-09-01. A forward tap now snaps
                  // back to the first empty box. Tapping BACK to correct a
                  // digit already entered is still allowed, which is why
                  // this compares against the gap rather than pinning focus.
                  const gap      = otp.findIndex(d => !d);
                  const furthest = gap === -1 ? otp.length - 1 : gap;
                  if (i > furthest) inputRefs.current[furthest]?.focus();
                }}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                caretHidden
              />
            ))}
          </View>

          <Pressable
            style={[styles.submitBtn, { backgroundColor: theme.primary }, (loading || otp.some(d => !d)) && { opacity: 0.5 }]}
            onPress={() => handleVerify()}
            disabled={loading || otp.some(d => !d)}
          >
            {loading
              ? <ActivityIndicator color={theme.textOnPrimary} />
              : <Text style={[styles.submitText, { color: theme.textOnPrimary }]}>{tx('auto.verifyOtp.verifyEmail', 'Verify Email')}</Text>}
          </Pressable>

          {/* Resend */}
          <View style={styles.resendRow}>
            <Text style={[styles.resendLabel, { color: theme.textSecond }]}>Didn&apos;t receive it?</Text>
            <Pressable
              style={styles.resendBtn}
              onPress={handleResend}
              disabled={cooldown > 0 || resending}
            >
              {resending ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                <View style={styles.resendInner}>
                  <Icon name="RotateCcw" size={13} color={cooldown > 0 ? theme.textThird : theme.accent} />
                  <Text style={[
                    styles.resendText,
                    { color: cooldown > 0 ? theme.textThird : theme.accent },
                  ]}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:   { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.xxl, paddingBottom: Spacing.xl },
  backBtn:     { marginBottom: Spacing.lg },
  backCircle:  { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  header:      { marginBottom: Spacing.xl, alignItems: 'center' },
  brandRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.lg, alignSelf: 'flex-start' },
  brand:       { fontSize: FontSize.sm, fontWeight: FontWeight.black as any, letterSpacing: 3 },
  brandSub:    { fontSize: 9, fontWeight: FontWeight.medium as any, letterSpacing: 1.5, marginTop: 1 },
  iconWrap:    { width: 80, height: 80, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.lg },
  title:       { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold as any, marginBottom: Spacing.sm, textAlign: 'center' },
  subtitle:    { fontSize: FontSize.base, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xs },
  expiry:      { fontSize: FontSize.xs, marginTop: Spacing.xs },
  card:        { borderRadius: Radius.xl, padding: Spacing.lg },
  errorBox:    { padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  errorText:   { fontSize: FontSize.sm, fontWeight: FontWeight.medium as any },
  otpRow:      { flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm, marginBottom: Spacing.xl },
  otpBox:      {
    width: 48, height: 58, borderRadius: Radius.md, borderWidth: 2,
    textAlign: 'center', fontSize: FontSize.xl, fontWeight: FontWeight.bold as any,
  },
  submitBtn:   { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.lg },
  submitText:  { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any },
  resendRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  resendLabel: { fontSize: FontSize.sm },
  resendBtn:   { padding: Spacing.xs },
  resendInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resendText:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
});
