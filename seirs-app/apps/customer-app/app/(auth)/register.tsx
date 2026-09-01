import { useState, type ReactNode } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Linking,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StatusBar,
} from 'react-native';

// Canonical legal docs live on the marketing site so they stay in sync
// across web + all 3 mobile apps without bundling text.
const TERMS_URL   = 'https://seirs-website.vercel.app/terms-of-service';
const PRIVACY_URL = 'https://seirs-website.vercel.app/privacy-policy';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SeirsMarkBold } from '@/components/SeirsLogoV2';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { authApi } from '@/services/api';
import { StatePicker } from '@/components/StatePicker';
import { StreetAutocomplete } from '@/components/StreetAutocomplete';
import { PasswordInput } from '@/components/PasswordInput';
import { validatePassword } from '@seirs/shared';
import { isValidNigerianMobile, toE164Ng, toNationalInput, NG_PHONE_HINT } from '@seirs/shared/utils/ngPhone';
import {
  ArrowLeft, ArrowRight, Truck, User, Mail, Phone, CheckSquare, Square,
} from 'lucide-react-native';

// Nigerian mobile validation lives in shared/utils/ngPhone.ts. This file
// used to carry its own fixed prefix list, which meant a network code the
// NCC issues tomorrow could not be registered.

function validate(
  firstName: string, lastName: string, email: string, phone: string,
  password: string, confirmPassword: string,
  ageConfirmed: boolean, termsAccepted: boolean,
): string | null {
  if (!firstName.trim()) return 'First name is required.';
  if (!lastName.trim())  return 'Last name is required.';
  if (!email.trim())     return 'Email address is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  if (!isValidNigerianMobile(phone)) return NG_PHONE_HINT;
  const pwErr = validatePassword(password);
  if (pwErr) return pwErr;
  if (password !== confirmPassword) return 'Passwords do not match.';
  if (!ageConfirmed) return 'You must confirm you are 18 years of age or older.';
  if (!termsAccepted) return 'You must agree to the Terms of Service and Privacy Policy.';
  return null;
}

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { t }  = useTranslation();

  // Captured from deep-link query (e.g. seirscustomer://(auth)/register?ref=CUST-XXXXX)
  const { ref: refParam } = useLocalSearchParams<{ ref?: string }>();
  const referralCode = (refParam ?? '').toString().trim().toUpperCase() || null;

  const [firstName,      setFirstName]      = useState('');
  const [middleName,     setMiddleName]      = useState('');
  const [lastName,       setLastName]        = useState('');
  const [email,          setEmail]           = useState('');
  const [phone,          setPhone]           = useState('');
  // Optional home address. Collecting it pre-fills the first booking's
  // pickup, but signup is where people drop out, so nothing here is
  // required and none of it can block account creation.
  const [addrState,      setAddrState]       = useState('');
  const [addrCity,       setAddrCity]        = useState('');
  const [addrStreet,     setAddrStreet]      = useState('');
  const [password,       setPassword]        = useState('');
  const [confirmPwd,     setConfirmPwd]      = useState('');
  const [ageConfirmed,   setAgeConfirmed]    = useState(false);
  const [termsAccepted,  setTermsAccepted]   = useState(false);
  const [loading,        setLoading]         = useState(false);
  const [error,          setError]           = useState('');

  // Gated like the sign-in button (founder 2026-09-01).
  const missing   = validate(firstName, lastName, email, phone, password, confirmPwd, ageConfirmed, termsAccepted);
  const canSubmit = missing === null && !loading;

  const handleRegister = async () => {
    const err = validate(firstName, lastName, email, phone, password, confirmPwd, ageConfirmed, termsAccepted);
    if (err) { setError(err); return; }

    setError('');
    setLoading(true);
    try {
      const fullName = [firstName.trim(), middleName.trim(), lastName.trim()].filter(Boolean).join(' ');

      await authApi.register({
        name:            fullName,
        email:           email.trim().toLowerCase(),
        phone:           toE164Ng(phone),
        password,
        role:            'customer',
        ageConfirmed:    true,
        termsAcceptedAt: new Date().toISOString(),
        ...(referralCode ? { referralCode } : {}),
        // Only sent when the sender actually filled it in.
        ...(addrState.trim() && addrCity.trim() && addrStreet.trim()
          ? { homeAddress: {
              label:  'Home',
              street: addrStreet.trim(),
              city:   addrCity.trim(),
              state:  addrState.trim(),
            } }
          : {}),
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
    checked: boolean; onToggle: () => void; label: ReactNode; sublabel?: string;
  }) => (
    <Pressable style={styles.checkRow} onPress={onToggle}>
      {checked
        ? <CheckSquare size={22} color={theme.accent} strokeWidth={2} />
        : <Square      size={22} color={theme.border}  strokeWidth={1.75} />
      }
      <View style={styles.checkTextWrap}>
        {typeof label === 'string'
          ? <Text style={[styles.checkLabel, { color: theme.text }]}>{label}</Text>
          : label}
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
        contentContainerStyle={[styles.container, { backgroundColor: theme.background, paddingBottom: Spacing.xl + insets.bottom }]}
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
            <SeirsMarkBold size={40} color={theme.primary} hubColor={theme.background} />
            <Text style={[styles.brand, { color: theme.primary }]}>SEIRS</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{t('auth.createAccount')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>{t('auth.startSending')}</Text>
        </View>

        {/* Form */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          {!!error && (
            <View style={[styles.errorBox, { backgroundColor: '#EF444415' }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          )}

          {/* Name row: First + Last */}

          {/* Names stacked, not side by side. Nigerian names are long and a
              half-width field scrolled the start of the name out of view:
              "Oluwaseyifunmi" showed as "luwaseyifunmi" and the user could
              not see what they had typed (founder, 2026-09-01). */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>{t('auth.firstName')}<Text style={{ color: theme.textThird }}> *</Text></Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <User size={15} color={theme.textThird} strokeWidth={1.75} style={styles.inputIcon as any} />
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

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>
              {t('auth.middleName')} <Text style={{ fontWeight: FontWeight.regular, color: theme.textThird }}>{t('auth.middleNameOptional')}</Text>
            </Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <User size={15} color={theme.textThird} strokeWidth={1.75} style={styles.inputIcon as any} />
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
            <Text style={[styles.label, { color: theme.textSecond }]}>{t('auth.lastName')}<Text style={{ color: theme.textThird }}> *</Text></Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Yusuf"
                placeholderTextColor={theme.textThird}
                autoComplete="family-name"
                autoCapitalize="words"
                value={lastName}
                onChangeText={setLastName}
              />
            </View>
          </View>

          {/* Email */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>{t('auth.emailAddress')}<Text style={{ color: theme.textThird }}> *</Text></Text>
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

          {/* Phone: +234 locked prefix */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>{t('auth.phone')}<Text style={{ color: theme.textThird }}> *</Text></Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <Phone size={15} color={theme.textThird} strokeWidth={1.75} style={styles.inputIcon as any} />
              <View style={[styles.prefixWrap, { borderRightColor: theme.border }]}>
                <Text style={[styles.prefix, { color: theme.text }]}>+234</Text>
              </View>
              <TextInput
                style={[styles.input, { color: theme.text, paddingLeft: Spacing.sm }]}
                placeholder="8012345678"
                placeholderTextColor={theme.textThird}
                keyboardType="phone-pad"
                autoComplete="tel"
                maxLength={10}
                value={phone}
                onChangeText={(v) => setPhone(toNationalInput(v))}
              />
            </View>
            <Text style={[styles.fieldHint, { color: theme.textThird }]}>
              {NG_PHONE_HINT}
            </Text>
          </View>

          {/* Home address, optional. State is a searchable modal rather than
              a native picker, which is wildly inconsistent across Android
              versions, and the street field is Places autocomplete pinned to
              Nigeria and scoped to the chosen state. Both ported from the
              business register, which has had them since its rebuild. */}
          <View style={styles.field}>
            <StatePicker
              label={t('auth.stateOptional', { defaultValue: 'State (optional)' })}
              value={addrState}
              onChange={setAddrState}
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>
              {t('auth.cityOptional', { defaultValue: 'City / LGA (optional)' })}
            </Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="e.g. Ikeja, Surulere, Lekki"
                placeholderTextColor={theme.textThird}
                value={addrCity}
                onChangeText={setAddrCity}
              />
            </View>
          </View>
          <View style={styles.field}>
            <StreetAutocomplete
              label={t('auth.streetOptional', { defaultValue: 'Street address (optional)' })}
              value={addrStreet}
              onChangeText={setAddrStreet}
              state={addrState}
              placeholder="15 Adeola Odeku Street, Victoria Island"
            />
            <Text style={[styles.fieldHint, { color: theme.textThird }]}>
              {t('auth.addressHint', { defaultValue: 'Saves you typing it on your first booking. You can add it later instead.' })}
            </Text>
          </View>

          {/* Password */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>{t('auth.password')}<Text style={{ color: theme.textThird }}> *</Text></Text>
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
            <Text style={[styles.label, { color: theme.textSecond }]}>{t('auth.confirmPassword')}<Text style={{ color: theme.textThird }}> *</Text></Text>
            <PasswordInput
              placeholder={t('auth.confirmPassword')}
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
              label={t('auth.ageConfirm')}
            />
          </View>

          {/* Terms & Privacy */}
          <View style={[styles.checkSection, { borderColor: theme.border }]}>
            <Checkbox
              checked={termsAccepted}
              onToggle={() => setTermsAccepted(v => !v)}
              label={
                <Text style={[styles.checkLabel, { color: theme.text }]}>
                  I agree to the{' '}
                  <Text
                    style={[styles.linkText, { color: theme.accent }]}
                    onPress={() => Linking.openURL(TERMS_URL)}
                  >Terms of Service</Text>
                  {' '}and{' '}
                  <Text
                    style={[styles.linkText, { color: theme.accent }]}
                    onPress={() => Linking.openURL(PRIVACY_URL)}
                  >Privacy Policy</Text>
                </Text>
              }
              sublabel={t('auth.termsNote')}
            />
          </View>

          <Pressable
            style={[styles.submitBtn, { backgroundColor: theme.primary }, !canSubmit && { opacity: 0.5 }]}
            onPress={handleRegister}
            disabled={!canSubmit}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.submitRow}>
                <Text style={styles.submitText}>{t('auth.createAccountBtn')}</Text>
                <ArrowRight size={18} color="#fff" strokeWidth={2.5} />
              </View>
            )}
          </Pressable>

          {!!missing && !loading && (
            <Text style={[styles.gateHint, { color: theme.textThird }]}>{missing}</Text>
          )}

          <Text style={[styles.otpNote, { color: theme.textThird }]}>
            {t('auth.otpNote')}
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecond }]}>{t('auth.alreadyAccount')}</Text>
          <Pressable onPress={() => router.push('/(auth)/login' as any)}>
            <Text style={[styles.footerLink, { color: theme.accent }]}> {t('auth.signIn')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:    { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.xxl, paddingBottom: Spacing.xl },
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
  linkText:     { fontWeight: FontWeight.semibold, textDecorationLine: 'underline' },
  submitBtn:    { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center', marginTop: Spacing.sm },
  submitRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  submitText:   { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  gateHint:     { fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 18 },
  otpNote:      { fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.md, lineHeight: 18 },
  footer:       { flexDirection: 'row', justifyContent: 'center' },
  footerText:   { fontSize: FontSize.base },
  footerLink:   { fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
