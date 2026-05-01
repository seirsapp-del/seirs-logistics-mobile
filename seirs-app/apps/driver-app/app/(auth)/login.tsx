import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StatusBar,
} from 'react-native';
import { ArrowLeft, Mail, ArrowRight, Truck, AlertCircle } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { authApi } from '@/services/api';
import { PasswordInput } from '@/components/PasswordInput';

export default function LoginScreen() {
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const isDark      = colorScheme === 'dark';
  const { login }   = useAuth();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleLogin = async () => {
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      await login({ ...res.user, token: res.token });
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
        contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <View style={[styles.backCircle, { backgroundColor: theme.surface }]}>
            <ArrowLeft size={20} color={theme.text} />
          </View>
        </Pressable>

        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Truck size={24} color={theme.primary} strokeWidth={1.5} />
            <Text style={[styles.brand, { color: theme.primary }]}>SEIRS DRIVER</Text>
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

          <Pressable style={styles.forgotRow} onPress={() => router.push('/(auth)/forgot-password' as any)}>
            <Text style={[styles.forgotText, { color: theme.primary }]}>Forgot password?</Text>
          </Pressable>

          <Pressable
            style={[styles.submitBtn, { backgroundColor: theme.primary }, loading && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loading}
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
          <Pressable onPress={() => router.push('/(auth)/register')}>
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
  brand:      { fontSize: FontSize.sm, fontWeight: FontWeight.black as any, letterSpacing: 3 },
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
  forgotRow:  { alignItems: 'flex-end', marginBottom: Spacing.lg, marginTop: -Spacing.xs },
  forgotText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  submitBtn:  { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  submitRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  submitText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semibold as any },
  footer:     { flexDirection: 'row', justifyContent: 'center' },
  footerText: { fontSize: FontSize.base },
  footerLink: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
});
