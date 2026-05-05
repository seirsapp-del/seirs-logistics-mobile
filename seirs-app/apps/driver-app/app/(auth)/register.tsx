import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { authApi } from '@/services/api';
import { PasswordInput } from '@/components/PasswordInput';
import { validatePassword } from '@seirs/shared';

export default function RegisterScreen() {
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const isDark      = colorScheme === 'dark';
  const { login }   = useAuth();

  const [firstName,  setFirstName]  = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName,   setLastName]   = useState('');
  const [email,      setEmail]      = useState('');
  const [phone,      setPhone]      = useState('');
  const [password,   setPassword]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim() || !email || !phone || !password) {
      setError('Please fill in all required fields.');
      return;
    }
    const pwErr = validatePassword(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    const fullName = [firstName.trim(), middleName.trim(), lastName.trim()].filter(Boolean).join(' ');
    setError('');
    setLoading(true);
    try {
      const res = await authApi.register({ name: fullName, email, phone, password, role: 'customer' });
      await login({ ...res.user, token: res.token });
    } catch (e: any) {
      setError(e.message ?? 'Registration failed. Please try again.');
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
        {/* Back button */}
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <View style={[styles.backCircle, { backgroundColor: theme.surface }]}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </View>
        </Pressable>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Ionicons name="cube" size={24} color={theme.primary} />
            <Text style={[styles.brand, { color: theme.primary }]}>SEIRS</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Create account</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            Start sending packages today
          </Text>
        </View>

        {/* Form card */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: '#EF444418' }]}>
              <Ionicons name="alert-circle" size={16} color={theme.error} />
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          ) : null}

          {/* Name row */}
          <View style={styles.nameRow}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: theme.textSecond }]}>First name</Text>
              <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
                <Ionicons name="person-outline" size={16} color={theme.textThird} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Adebayo"
                  placeholderTextColor={theme.textThird}
                  autoComplete="given-name"
                  autoCapitalize="words"
                  value={firstName}
                  onChangeText={setFirstName}
                />
              </View>
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: theme.textSecond }]}>Last name</Text>
              <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.input, { color: theme.text, paddingLeft: Spacing.md }]}
                  placeholder="Yusuf"
                  placeholderTextColor={theme.textThird}
                  autoComplete="family-name"
                  autoCapitalize="words"
                  value={lastName}
                  onChangeText={setLastName}
                />
              </View>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>
              Middle name <Text style={{ fontWeight: FontWeight.regular }}>(optional)</Text>
            </Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <Ionicons name="person-outline" size={16} color={theme.textThird} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Chinedu"
                placeholderTextColor={theme.textThird}
                autoCapitalize="words"
                value={middleName}
                onChangeText={setMiddleName}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Email address</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <Ionicons name="mail-outline" size={16} color={theme.textThird} style={styles.inputIcon} />
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
            <Text style={[styles.label, { color: theme.textSecond }]}>Phone number</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <Ionicons name="call-outline" size={16} color={theme.textThird} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="+234 800 000 0000"
                placeholderTextColor={theme.textThird}
                keyboardType="phone-pad"
                autoComplete="tel"
                value={phone}
                onChangeText={setPhone}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Password</Text>
            <PasswordInput
              placeholder="Min. 8 characters"
              placeholderTextColor={theme.textThird}
              autoComplete="new-password"
              backgroundColor={theme.surfaceSecond}
              borderColor={theme.border}
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <Text style={[styles.terms, { color: theme.textSecond }]}>
            By creating an account you agree to our{' '}
            <Text style={{ color: theme.primary }}>Terms</Text>
            {' '}and{' '}
            <Text style={{ color: theme.primary }}>Privacy Policy</Text>.
          </Text>

          <Pressable
            style={[styles.submitBtn, { backgroundColor: theme.primary }, loading && { opacity: 0.7 }]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.submitRow}>
                <Text style={styles.submitText}>Create Account</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </View>
            )}
          </Pressable>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecond }]}>
            Already have an account?
          </Text>
          <Pressable onPress={() => router.push('/(auth)/login')}>
            <Text style={[styles.footerLink, { color: theme.primary }]}> Sign In</Text>
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
  errorBox:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  errorText:  { fontSize: FontSize.sm, fontWeight: FontWeight.medium, flex: 1 },
  nameRow:    { flexDirection: 'row', gap: Spacing.sm },
  field:      { marginBottom: Spacing.md, gap: Spacing.xs },
  label:      { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md },
  inputIcon:  { marginRight: Spacing.sm },
  input:      { flex: 1, fontSize: FontSize.base, height: '100%' },
  terms:      { fontSize: FontSize.xs, lineHeight: 18, marginBottom: Spacing.lg, marginTop: -Spacing.xs },
  submitBtn:  { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  submitRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  submitText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  footer:     { flexDirection: 'row', justifyContent: 'center' },
  footerText: { fontSize: FontSize.base },
  footerLink: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
