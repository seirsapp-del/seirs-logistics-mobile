import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/Icon';
import { SeirsMarkBold } from '@seirs/shared/components/SeirsLogoV2';
import { authApi } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import { Colors, Palette } from '@/constants/theme';

// Audit 2026-08-10: customer + driver both had a forgot-password flow;
// business had NONE. A business owner who forgot their password was
// locked out permanently. Same backend endpoint, business styling.

export default function ForgotPasswordScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { isDark } = useTheme();
  const theme   = Colors[isDark ? 'dark' : 'light'];

  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  /* Was length > 3, so "notanemail" submitted happily and the next
     screen told them to check an inbox that cannot exist. */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
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

  const headerGradient: [string, string] = [Palette.navy800, Palette.navy700];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={headerGradient} style={{ paddingTop: insets.top + 24, paddingBottom: 24 }}>
        <View style={styles.logoRow}>
          <SeirsMarkBold size={52} color={Palette.white} hubColor={Palette.navy800} />
          <View>
            <Text style={[styles.logoText, { color: Palette.white }]}>SEIRS</Text>
            <Text style={[styles.logoSub, { color: 'rgba(255,255,255,0.5)' }]}>Business &amp; Partners</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24, backgroundColor: theme.background }]}
        keyboardShouldPersistTaps="handled"
      >
        {sent ? (
          <>
            <View style={styles.sentWrap}>
              <View style={[styles.sentIcon, { backgroundColor: theme.primary + (isDark ? '26' : '18') }]}>
                <Icon name="Mail" size={40} color={theme.primary} />
              </View>
              <Text style={[styles.heading, { textAlign: 'center', color: theme.text }]}>Check your inbox</Text>
              <Text style={[styles.sentDesc, { color: theme.textSecond }]}>
                If an account exists for {email.trim().toLowerCase()}, we sent a reset link.
                It expires in 15 minutes. Check spam if you do not see it.
              </Text>
            </View>
            <Pressable style={[styles.btn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
              <Text style={[styles.btnText, { color: theme.textOnPrimary }]}>Back to Sign In</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.heading, { color: theme.text }]}>Reset password</Text>
            <Text style={[styles.subheading, { color: theme.textSecond }]}>
              Enter the email you registered with and we will send you a reset link.
            </Text>

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

            <Pressable
              style={[styles.btn, { backgroundColor: theme.primary }, !canSubmit && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {loading
                ? <ActivityIndicator color={theme.textOnPrimary} />
                : <Text style={[styles.btnText, { color: theme.textOnPrimary }]}>Send Reset Link</Text>
              }
            </Pressable>

            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: theme.textSecond }]}>Remembered it? </Text>
              <Pressable onPress={() => router.back()}>
                <Text style={[styles.footerLink, { color: theme.accent }]}>Sign In</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  logoRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  logoText:   { fontSize: 20, fontWeight: '900', letterSpacing: 3 },
  logoSub:    { fontSize: 12, marginTop: 1 },
  body:       { padding: 24, flexGrow: 1 },
  heading:    { fontSize: 24, fontWeight: '800', marginBottom: 8, marginTop: 8 },
  subheading: { fontSize: 15, lineHeight: 20, marginBottom: 20 },
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
  btn:        { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnDisabled:{ opacity: 0.5 },
  btnText:    { fontWeight: '700', fontSize: 16 },
  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { fontSize: 15 },
  footerLink: { fontWeight: '600', fontSize: 15 },
  sentWrap:   { alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 24 },
  sentIcon:   {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  sentDesc:   { fontSize: 15, lineHeight: 21, textAlign: 'center', paddingHorizontal: 12 },
});
