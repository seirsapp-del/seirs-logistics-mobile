import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StatusBar,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { authApi } from '@/services/api';
import { ArrowLeft, Mail, RotateCcw, Truck } from 'lucide-react-native';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyOtpScreen() {
  const router  = useRouter();
  const params  = useLocalSearchParams<{ email: string }>();
  const email   = params.email ?? '';
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { login } = useAuth();

  const [otp,        setOtp]        = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading,    setLoading]    = useState(false);
  const [resending,  setResending]  = useState(false);
  const [error,      setError]      = useState('');
  const [cooldown,   setCooldown]   = useState(RESEND_COOLDOWN);
  const inputRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));

  // Countdown timer
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
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    // Auto-submit when all digits filled
    if (next.every(d => d !== '') && digit) {
      handleVerify(next.join(''));
    }
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
      const res = await authApi.verifyOtp(email, finalCode);
      await login({ ...res.user, token: res.token });
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
        contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
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

          <View style={[styles.iconWrap, { backgroundColor: theme.surfaceSecond }]}>
            <Mail size={36} color={theme.accent} strokeWidth={1.5} />
          </View>

          <Text style={[styles.title, { color: theme.text }]}>Verify your email</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            We sent a 6-digit code to{'\n'}
            <Text style={{ color: theme.text, fontWeight: FontWeight.semibold }}>{maskedEmail}</Text>
          </Text>
          <Text style={[styles.expiry, { color: theme.textThird }]}>Code expires in 15 minutes.</Text>
        </View>

        {/* OTP inputs */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          {!!error && (
            <View style={[styles.errorBox, { backgroundColor: '#EF444415' }]}>
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
                onChangeText={t => handleChange(t, i)}
                onKeyPress={e => handleKeyPress(e, i)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                caretHidden
              />
            ))}
          </View>

          <Pressable
            style={[styles.submitBtn, { backgroundColor: theme.primary }, loading && { opacity: 0.7 }]}
            onPress={() => handleVerify()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Verify Email</Text>
            )}
          </Pressable>

          {/* Resend */}
          <View style={styles.resendRow}>
            <Text style={[styles.resendLabel, { color: theme.textSecond }]}>Didn't receive it?</Text>
            <Pressable
              style={styles.resendBtn}
              onPress={handleResend}
              disabled={cooldown > 0 || resending}
            >
              {resending ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                <View style={styles.resendInner}>
                  <RotateCcw size={13} color={cooldown > 0 ? theme.textThird : theme.accent} strokeWidth={2} />
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
  container:   { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.xl, paddingBottom: Spacing.xl },
  backBtn:     { marginBottom: Spacing.lg },
  backCircle:  { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  header:      { marginBottom: Spacing.xl, alignItems: 'center' },
  brandRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.lg, alignSelf: 'flex-start' },
  brand:       { fontSize: FontSize.sm, fontWeight: FontWeight.black, letterSpacing: 3 },
  iconWrap:    { width: 80, height: 80, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.lg },
  title:       { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, marginBottom: Spacing.sm, textAlign: 'center' },
  subtitle:    { fontSize: FontSize.base, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xs },
  expiry:      { fontSize: FontSize.xs, marginTop: Spacing.xs },
  card:        { borderRadius: Radius.xl, padding: Spacing.lg },
  errorBox:    { padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  errorText:   { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  otpRow:      { flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm, marginBottom: Spacing.xl },
  otpBox:      {
    width: 48, height: 58, borderRadius: Radius.md, borderWidth: 2,
    textAlign: 'center', fontSize: FontSize.xl, fontWeight: FontWeight.bold,
  },
  submitBtn:   { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.lg },
  submitText:  { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  resendRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  resendLabel: { fontSize: FontSize.sm },
  resendBtn:   { padding: Spacing.xs },
  resendInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resendText:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
});
