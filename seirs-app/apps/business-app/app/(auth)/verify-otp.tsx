import { useRef, useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { authApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/context/ThemeContext';

const OTP_LEN = 6;

export default function VerifyOtpScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const colors  = useColors();
  const { login } = useAuth();
  const { email } = useLocalSearchParams<{ email: string }>();

  const [code,    setCode]    = useState(Array(OTP_LEN).fill(''));
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(60);

  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (cooldown === 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleInput = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next  = [...code];
    next[idx]   = digit;
    setCode(next);
    if (digit && idx < OTP_LEN - 1) inputRefs.current[idx + 1]?.focus();
  };

  const handleKeyPress = (idx: number, key: string) => {
    if (key === 'Backspace' && !code[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const otp = code.join('');

  const verify = async () => {
    if (otp.length < OTP_LEN || !email) return;
    setError('');
    setLoading(true);
    try {
      const { token, user } = await authApi.verifyOtp(email, otp);
      await login({ ...user, token });
    } catch (e: any) {
      setError(e.message ?? 'Invalid or expired code.');
      setCode(Array(OTP_LEN).fill(''));
      inputRefs.current[0]?.focus();
    } finally { setLoading(false); }
  };

  const resend = async () => {
    if (cooldown > 0 || !email) return;
    try {
      await authApi.resendOtp(email);
      setCooldown(60);
    } catch (_) {}
  };

  return (
    <View style={[styles.container, {
      paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24,
      backgroundColor: colors.background,
    }]}>
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Icon name="ArrowLeft" size={20} color={colors.text} />
      </Pressable>

      <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight }]}>
        <Icon name="Mail" size={32} color={colors.accent} />
      </View>

      <Text style={[styles.heading, { color: colors.text }]}>Check your email</Text>
      <Text style={[styles.sub, { color: colors.textSecond }]}>
        We sent a 6-digit code to{'\n'}
        <Text style={[styles.emailText, { color: colors.text }]}>{email}</Text>
      </Text>

      {error !== '' && (
        <View style={styles.errorBox}>
          <Icon name="AlertCircle" size={16} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.boxes}>
        {code.map((digit, i) => (
          <TextInput
            key={i}
            ref={(r) => { inputRefs.current[i] = r; }}
            style={[
              styles.box,
              { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text },
              digit !== '' && { borderColor: colors.accent, backgroundColor: colors.primaryLight },
            ]}
            value={digit}
            onChangeText={(v) => handleInput(i, v)}
            onKeyPress={({ nativeEvent: { key } }) => handleKeyPress(i, key)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
            caretHidden
          />
        ))}
      </View>

      <Pressable
        style={[
          styles.btn,
          { backgroundColor: colors.primary },
          otp.length < OTP_LEN && styles.btnDisabled,
        ]}
        onPress={verify}
        disabled={otp.length < OTP_LEN || loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.btnText}>Verify & Continue</Text>}
      </Pressable>

      <Pressable style={styles.resend} onPress={resend} disabled={cooldown > 0}>
        <Text style={[
          styles.resendText,
          { color: colors.accent },
          cooldown > 0 && { color: colors.textThird },
        ]}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  back:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8, marginBottom: 32 },
  iconWrap:  { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  heading:   { fontSize: 26, fontWeight: '800', marginBottom: 10 },
  sub:       { fontSize: 14, lineHeight: 22, marginBottom: 28 },
  emailText: { fontWeight: '600' },
  errorBox:  {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 10, padding: 12, marginBottom: 20,
  },
  errorText: { color: '#DC2626', fontSize: 13, flex: 1 },
  boxes:     { flexDirection: 'row', gap: 10, marginBottom: 28, justifyContent: 'center' },
  box:       {
    width: 46, height: 54, borderRadius: 12, borderWidth: 1.5,
    textAlign: 'center', fontSize: 22, fontWeight: '700',
  },
  btn:        { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  btnDisabled:{ opacity: 0.4 },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
  resend:     { alignItems: 'center', marginTop: 20 },
  resendText: { fontWeight: '600', fontSize: 14 },
});
