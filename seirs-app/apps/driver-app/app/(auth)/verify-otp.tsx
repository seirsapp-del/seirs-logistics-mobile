import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StatusBar,
} from 'react-native';
import { ArrowLeft, Mail, RefreshCw, CheckCircle } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { authApi } from '@/services/api';

const RESEND_COOLDOWN = 60;

export default function VerifyOtpScreen() {
  const router      = useRouter();
  const params      = useLocalSearchParams<{ email: string }>();
  const email       = params.email ?? '';
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const isDark      = colorScheme === 'dark';
  const { login }   = useAuth();

  const [otp,      setOtp]      = useState(['', '', '', '', '', '']);
  const [loading,  setLoading]  = useState(false);
  const [resending, setResending] = useState(false);
  const [error,    setError]    = useState('');
  const [cooldown, setCooldown] = useState(0);

  const inputRefs = useRef<(TextInput | null)[]>([]);

  const maskedEmail = email.replace(/(.{2}).+(@.+)/, '$1•••$2');

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleVerify = useCallback(async (code: string) => {
    if (code.length !== 6) return;
    setError('');
    setLoading(true);
    try {
      const res = await authApi.verifyOtp(email, code);
      await login({ ...res.user, token: res.token });
    } catch (e: any) {
      setError(e.message ?? 'Invalid code. Please try again.');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }, [email, login]);

  const handleChange = (text: string, index: number) => {
    const digit = text.replace(/\D/g, '').slice(-1);
    const next  = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
    if (next.every(d => d !== '')) handleVerify(next.join(''));
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setResending(true);
    try {
      await authApi.resendOtp(email);
      setCooldown(RESEND_COOLDOWN);
      setError('');
    } catch (e: any) {
      setError(e.message ?? 'Could not resend code.');
    } finally {
      setResending(false);
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
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <View style={[styles.backCircle, { backgroundColor: theme.surface }]}>
            <ArrowLeft size={20} color={theme.text} />
          </View>
        </Pressable>

        <View style={styles.heroSection}>
          <View style={[styles.iconWrap, { backgroundColor: theme.primary + '18' }]}>
            <Mail size={32} color={theme.primary} strokeWidth={1.5} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Check your email</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            We sent a 6-digit code to{'\n'}
            <Text style={{ color: theme.primary, fontWeight: FontWeight.semibold as any }}>{maskedEmail}</Text>
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: '#EF444418' }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.otpRow}>
            {otp.map((digit, i) => (
              <TextInput
                key={i}
                ref={r => { inputRefs.current[i] = r; }}
                style={[
                  styles.otpBox,
                  {
                    backgroundColor: theme.surfaceSecond,
                    borderColor: digit ? theme.primary : theme.border,
                    color: theme.text,
                  },
                ]}
                value={digit}
                onChangeText={t => handleChange(t, i)}
                onKeyPress={e => handleKeyPress(e, i)}
                keyboardType="number-pad"
                maxLength={1}
                textAlign="center"
                selectTextOnFocus
              />
            ))}
          </View>

          <Pressable
            style={[styles.verifyBtn, { backgroundColor: theme.primary }, loading && { opacity: 0.7 }]}
            onPress={() => handleVerify(otp.join(''))}
            disabled={loading || otp.some(d => !d)}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <View style={styles.btnRow}>
                <CheckCircle size={20} color="#fff" strokeWidth={1.5} />
                <Text style={styles.verifyText}>Verify Email</Text>
              </View>
            )}
          </Pressable>
        </View>

        <Pressable
          style={[styles.resendBtn, cooldown > 0 && { opacity: 0.5 }]}
          onPress={handleResend}
          disabled={cooldown > 0 || resending}
        >
          {resending ? <ActivityIndicator size="small" color={theme.primary} /> : (
            <View style={styles.btnRow}>
              <RefreshCw size={16} color={theme.primary} strokeWidth={1.5} />
              <Text style={[styles.resendText, { color: theme.primary }]}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </Text>
            </View>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:   { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.xl, paddingBottom: Spacing.xl },
  backBtn:     { marginBottom: Spacing.lg },
  backCircle:  { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  heroSection: { alignItems: 'center', marginBottom: Spacing.xl, gap: Spacing.md },
  iconWrap:    { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center' },
  title:       { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold as any, textAlign: 'center' },
  subtitle:    { fontSize: FontSize.base, textAlign: 'center', lineHeight: 24 },
  card:        { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.md },
  errorBox:    { padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  errorText:   { fontSize: FontSize.sm, fontWeight: FontWeight.medium as any, textAlign: 'center' },
  otpRow:      { flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
  otpBox:      { width: 48, height: 56, borderRadius: Radius.lg, borderWidth: 2, fontSize: FontSize.xl, fontWeight: FontWeight.bold as any },
  verifyBtn:   { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  btnRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  verifyText:  { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semibold as any },
  resendBtn:   { alignItems: 'center', paddingVertical: Spacing.md },
  resendText:  { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any },
});
