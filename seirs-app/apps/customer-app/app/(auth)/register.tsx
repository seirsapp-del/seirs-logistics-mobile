import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { authApi } from '@/services/api';
import { PasswordInput } from '@/components/PasswordInput';
import {
  ArrowLeft, ArrowRight, Truck, User, Mail, Phone, CheckSquare, Square,
} from 'lucide-react-native';

const NIGERIAN_PHONE_RE = /^(080|081|070|090|091)\d{7}$/;

function validate(
  firstName: string, lastName: string, email: string, phone: string,
  password: string, confirmPassword: string,
  ageConfirmed: boolean, termsAccepted: boolean,
): string | null {
  if (!firstName.trim()) return 'First name is required.';
  if (!lastName.trim())  return 'Last name is required.';
  if (!email.trim())     return 'Email address is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  const digits = phone.replace(/\s/g, '');
  if (!NIGERIAN_PHONE_RE.test(digits)) return 'Enter a valid Nigerian number (080x / 081x / 070x / 090x / 091x).';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.';
  if (!/[\d\W]/.test(password)) return 'Password must include a number or symbol.';
  if (password !== confirmPassword) return 'Passwords do not match.';
  if (!ageConfirmed) return 'You must confirm you are 18 years of age or older.';
  if (!termsAccepted) return 'You must agree to the Terms of Service and Privacy Policy.';
  return null;
}

export default function RegisterScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const [firstName,      setFirstName]      = useState('');
  const [middleName,     setMiddleName]      = useState('');
  const [lastName,       setLastName]        = useState('');
  const [email,          setEmail]           = useState('');
  const [phone,          setPhone]           = useState('');
  const [password,       setPassword]        = useState('');
  const [confirmPwd,     setConfirmPwd]      = useState('');
  const [ageConfirmed,   setAgeConfirmed]    = useState(false);
  const [termsAccepted,  setTermsAccepted]   = useState(false);
  const [loading,        setLoading]         = useState(false);
  const [error,          setError]           = useState('');

  const handleRegister = async () => {
    const err = validate(firstName, lastName, email, phone, password, confirmPwd, ageConfirmed, termsAccepted);
    if (err) { setError(err); return; }

    setError('');
    setLoading(true);
    try {
      const fullName = [firstName.trim(), middleName.trim(), lastName.trim()].filter(Boolean).join(' ');
      const digits   = phone.replace(/\s/g, '');

      await authApi.register({
        name:            fullName,
        email:           email.trim().toLowerCase(),
        phone:           `+234${digits.substring(1)}`,
        password,
        role:            'customer',
        ageConfirmed:    true,
        termsAcceptedAt: new Date().toISOString(),
      });

      // Navigate to OTP screen with email param
      router.push({ pathname: '/(auth)/verify-otp', params: { email: email.trim().toLowerCase() } } as any);
    } catch (e: any) {
      setError(e.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const Checkbox = ({ checked, onToggle, label, sublabel }: {
    checked: boolean; onToggle: () => void; label: string; sublabel?: string;
  }) => (
    <Pressable style={styles.checkRow} onPress={onToggle}>
      {checked
        ? <CheckSquare size={22} color={theme.accent} strokeWidth={2} />
        : <Square      size={22} color={theme.border}  strokeWidth={1.75} />
      }
      <View style={styles.checkTextWrap}>
        <Text style={[styles.checkLabel, { color: theme.text }]}>{label}</Text>
        {sublabel ? <Text style={[styles.checkSub, { color: theme.textSecond }]}>{sublabel}</Text> : null}
      </View>
    </Pressable>
  );

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
          <Text style={[styles.title, { color: theme.text }]}>Create account</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>Start sending packages today</Text>
        </View>

        {/* Form */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          {!!error && (
            <View style={[styles.errorBox, { backgroundColor: '#EF444415' }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          )}

          {/* Name row: First + Last */}
          <View style={styles.nameRow}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: theme.textSecond }]}>First name</Text>
              <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
                <User size={15} color={theme.textThird} strokeWidth={1.75} style={styles.inputIcon as any} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Emeka"
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
                  placeholder="Okonkwo"
                  placeholderTextColor={theme.textThird}
                  autoComplete="family-name"
                  autoCapitalize="words"
                  value={lastName}
                  onChangeText={setLastName}
                />
              </View>
            </View>
          </View>

          {/* Middle name */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>
              Middle name <Text style={{ fontWeight: FontWeight.regular, color: theme.textThird }}>(optional)</Text>
            </Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <User size={15} color={theme.textThird} strokeWidth={1.75} style={styles.inputIcon as any} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Chukwu"
                placeholderTextColor={theme.textThird}
                autoCapitalize="words"
                value={middleName}
                onChangeText={setMiddleName}
              />
            </View>
          </View>

          {/* Email */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Email address</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <Mail size={15} color={theme.textThird} strokeWidth={1.75} style={styles.inputIcon as any} />
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

          {/* Phone — +234 locked prefix */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Phone number</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <Phone size={15} color={theme.textThird} strokeWidth={1.75} style={styles.inputIcon as any} />
              <View style={[styles.prefixWrap, { borderRightColor: theme.border }]}>
                <Text style={[styles.prefix, { color: theme.text }]}>+234</Text>
              </View>
              <TextInput
                style={[styles.input, { color: theme.text, paddingLeft: Spacing.sm }]}
                placeholder="080 1234 5678"
                placeholderTextColor={theme.textThird}
                keyboardType="phone-pad"
                autoComplete="tel"
                maxLength={11}
                value={phone}
                onChangeText={setPhone}
              />
            </View>
            <Text style={[styles.fieldHint, { color: theme.textThird }]}>
              Nigerian numbers only: 080x / 081x / 070x / 090x / 091x
            </Text>
          </View>

          {/* Password */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Password</Text>
            <PasswordInput
              placeholder="Min. 8 chars, upper + lower + number/symbol"
              placeholderTextColor={theme.textThird}
              autoComplete="new-password"
              backgroundColor={theme.surfaceSecond}
              borderColor={theme.border}
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {/* Confirm Password */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Confirm password</Text>
            <PasswordInput
              placeholder="Repeat your password"
              placeholderTextColor={theme.textThird}
              autoComplete="new-password"
              backgroundColor={theme.surfaceSecond}
              borderColor={theme.border}
              value={confirmPwd}
              onChangeText={setConfirmPwd}
            />
          </View>

          {/* Age confirmation */}
          <View style={[styles.checkSection, { borderColor: theme.border }]}>
            <Checkbox
              checked={ageConfirmed}
              onToggle={() => setAgeConfirmed(v => !v)}
              label="I confirm I am 18 years of age or older"
            />
          </View>

          {/* Terms & Privacy */}
          <View style={[styles.checkSection, { borderColor: theme.border }]}>
            <Checkbox
              checked={termsAccepted}
              onToggle={() => setTermsAccepted(v => !v)}
              label="I agree to the Terms of Service and Privacy Policy"
              sublabel="Your acceptance will be recorded with a timestamp."
            />
          </View>

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
                <ArrowRight size={18} color="#fff" strokeWidth={2.5} />
              </View>
            )}
          </Pressable>

          <Text style={[styles.otpNote, { color: theme.textThird }]}>
            A 6-digit verification code will be sent to your email address.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecond }]}>Already have an account?</Text>
          <Pressable onPress={() => router.push('/(auth)/login' as any)}>
            <Text style={[styles.footerLink, { color: theme.accent }]}> Sign In</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:    { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.xl, paddingBottom: Spacing.xl },
  backBtn:      { marginBottom: Spacing.lg },
  backCircle:   { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  header:       { marginBottom: Spacing.xl },
  brandRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.md },
  brand:        { fontSize: FontSize.sm, fontWeight: FontWeight.black, letterSpacing: 3 },
  title:        { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, marginBottom: Spacing.xs },
  subtitle:     { fontSize: FontSize.base },
  card:         { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  errorBox:     { padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  errorText:    { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  nameRow:      { flexDirection: 'row', gap: Spacing.sm },
  field:        { marginBottom: Spacing.md, gap: Spacing.xs },
  label:        { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  inputWrap:    { flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md },
  inputIcon:    { marginRight: Spacing.sm },
  input:        { flex: 1, fontSize: FontSize.base, height: '100%' },
  prefixWrap:   { paddingRight: Spacing.sm, marginRight: Spacing.sm, borderRightWidth: 1 },
  prefix:       { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  fieldHint:    { fontSize: FontSize.xs, marginTop: 2 },
  checkSection: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
  checkRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  checkTextWrap:{ flex: 1 },
  checkLabel:   { fontSize: FontSize.sm, fontWeight: FontWeight.medium, lineHeight: 20 },
  checkSub:     { fontSize: FontSize.xs, marginTop: 2, lineHeight: 16 },
  submitBtn:    { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center', marginTop: Spacing.sm },
  submitRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  submitText:   { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  otpNote:      { fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.md, lineHeight: 18 },
  footer:       { flexDirection: 'row', justifyContent: 'center' },
  footerText:   { fontSize: FontSize.base },
  footerLink:   { fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
