import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { authApi } from '@/services/api';

export default function ForgotPasswordScreen() {
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];

  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async () => {
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}>
          <View style={styles.header}>
            <Text style={styles.checkmark}>📬</Text>
            <Text style={[styles.title, { color: theme.text }]}>Check your inbox</Text>
            <Text style={[styles.subtitle, { color: theme.textSecond }]}>
              If <Text style={{ fontWeight: FontWeight.semibold }}>{email}</Text> is registered, you'll receive a reset link within a few minutes.
            </Text>
            <Text style={[styles.hint, { color: theme.textSecond }]}>
              Check your spam folder if you don't see it.
            </Text>
          </View>
          <Pressable style={[styles.btn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
            <Text style={styles.btnText}>Back to Sign In</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.brand, { color: theme.primary }]}>SEIRS</Text>
          <Text style={[styles.title, { color: theme.text }]}>Forgot password?</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            Enter your email and we'll send you a link to reset your password.
          </Text>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: theme.error + '18' }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Email address</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
              placeholder="you@example.com"
              placeholderTextColor={theme.textSecond}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <Pressable
            style={[styles.btn, { backgroundColor: theme.primary }, loading && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send Reset Link</Text>}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecond }]}>Remember your password? </Text>
          <Pressable onPress={() => router.back()}>
            <Text style={[styles.footerLink, { color: theme.primary }]}>Sign In</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:  { flexGrow: 1, paddingHorizontal: Spacing.xl, paddingTop: Spacing['3xl'], paddingBottom: Spacing.xl },
  header:     { marginBottom: Spacing.xl },
  brand:      { fontSize: FontSize.sm, fontWeight: FontWeight.black, letterSpacing: 4, marginBottom: Spacing.lg },
  checkmark:  { fontSize: 56, textAlign: 'center', marginBottom: Spacing.lg },
  title:      { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, marginBottom: Spacing.sm },
  subtitle:   { fontSize: FontSize.base, lineHeight: 22 },
  hint:       { fontSize: FontSize.sm, marginTop: Spacing.sm },
  form:       { gap: Spacing.xs },
  errorBox:   { padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.sm },
  errorText:  { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  field:      { gap: Spacing.xs, marginBottom: Spacing.sm },
  label:      { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  input:      { height: 52, borderRadius: Radius.md, borderWidth: 1.5, paddingHorizontal: Spacing.md, fontSize: FontSize.base },
  btn:        { height: 54, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  btnText:    { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.xl },
  footerText: { fontSize: FontSize.base },
  footerLink: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
