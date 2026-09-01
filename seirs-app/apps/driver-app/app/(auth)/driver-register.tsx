import { useState, type ReactNode } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Linking,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StatusBar,
} from 'react-native';

// Canonical legal docs live on the marketing site so they stay in sync
// across web + all 3 mobile apps without bundling text. Driver Code of
// Conduct is contained within the Terms of Service for now.
const TERMS_URL   = 'https://seirs-website.vercel.app/terms-of-service';
const PRIVACY_URL = 'https://seirs-website.vercel.app/privacy-policy';
import {
  ArrowLeft, User, Mail, Phone, Truck, Bike, Car, Van,
  CheckSquare, Square, AlertCircle,
} from 'lucide-react-native';
import { SeirsMarkBold } from '@seirs/shared/components/SeirsLogoV2';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { authApi } from '@/services/api';
import { PasswordInput } from '@/components/PasswordInput';
import { validatePassword } from '@seirs/shared';
import { isValidNigerianMobile, toE164Ng, NG_MOBILE_HINT } from '@/constants/phone';

type VehicleType = 'bicycle' | 'motorcycle' | 'tricycle' | 'car' | 'van' | 'truck_small' | 'truck_large';

// D-6.3: labels must match app/(driver)/vehicle.tsx. Same app, one vocabulary,
// and it is the Nigerian one: okada, keke, danfo.
const VEHICLES: { id: VehicleType; label: string; desc: string; Icon: any }[] = [
  { id: 'bicycle',     label: 'Bicycle',              desc: 'Up to 5 kg',      Icon: Bike  },
  { id: 'motorcycle',  label: 'Okada (Motorcycle)',   desc: 'Up to 20 kg',     Icon: Bike  },
  { id: 'tricycle',    label: 'Keke (Tricycle)',      desc: 'Up to 100 kg',    Icon: Truck },
  { id: 'car',         label: 'Car',                  desc: 'Up to 200 kg',    Icon: Car   },
  { id: 'van',         label: 'Van / Danfo',          desc: 'Up to 800 kg',    Icon: Van   },
  { id: 'truck_small', label: 'Small Truck',          desc: 'Up to 3,000 kg',  Icon: Truck },
  { id: 'truck_large', label: 'Large Truck',          desc: '3,000 kg+',       Icon: Truck },
];


export default function DriverRegisterScreen() {
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const isDark      = colorScheme === 'dark';

  const [firstName,    setFirstName]    = useState('');
  const [middleName,   setMiddleName]   = useState('');
  const [lastName,     setLastName]     = useState('');
  const [email,        setEmail]        = useState('');
  const [phone,        setPhone]        = useState('');
  const [password,     setPassword]     = useState('');
  const [confirmPass,  setConfirmPass]  = useState('');
  const [vehicle,      setVehicle]      = useState<VehicleType | null>(null);
  const [referralCode, setReferralCode] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsConfirmed, setTermsConfirmed] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim() || !email || !phone || !password || !confirmPass || !vehicle) {
      setError('Please fill in all required fields and select a vehicle type.');
      return;
    }
    if (!isValidNigerianMobile(phone)) {
      setError(NG_MOBILE_HINT);
      return;
    }
    const pwErr = validatePassword(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (password !== confirmPass) {
      setError('Passwords do not match.');
      return;
    }
    if (!ageConfirmed) {
      setError('You must confirm you are 18 years or older.');
      return;
    }
    if (!termsConfirmed) {
      setError('You must accept the Terms of Service and Privacy Policy.');
      return;
    }

    const fullName = [firstName.trim(), middleName.trim(), lastName.trim()].filter(Boolean).join(' ');
    setError('');
    setLoading(true);
    try {
      const trimmedRef = referralCode.trim().toUpperCase();
      await authApi.register({
        name: fullName,
        email,
        // D-10.3: normalise before building E.164. Posting the raw field
        // registered "+2348012345678" as "+234+2348012345678".
        phone: toE164Ng(phone),
        password,
        role: 'driver',
        vehicleType: vehicle!,
        ageConfirmed: true,
        termsAcceptedAt: new Date().toISOString(),
        ...(trimmedRef ? { referralCode: trimmedRef } : {}),
      });
      router.replace({ pathname: '/(auth)/verify-otp' as any, params: { email } });
    } catch (e: any) {
      setError(e.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const Checkbox = ({ value, onToggle, label }: { value: boolean; onToggle: () => void; label: ReactNode }) => (
    <Pressable style={styles.checkRow} onPress={onToggle}>
      {value
        ? <CheckSquare size={20} color={theme.primary} strokeWidth={1.5} />
        : <Square size={20} color={theme.textThird} strokeWidth={1.5} />
      }
      {typeof label === 'string'
        ? <Text style={[styles.checkLabel, { color: theme.textSecond }]}>{label}</Text>
        : <View style={{ flex: 1 }}>{label}</View>}
    </Pressable>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          // Keep the footer clear of the Android navigation bar
          // (live test 2026-08-10: "Sign In" sat under the nav buttons).
          { backgroundColor: theme.background, paddingBottom: Spacing.xl + insets.bottom },
        ]}
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
            {/* Same lockup as onboarding (founder 2026-08-10): okada mark
                + spaced SEIRS wordmark + small DRIVER tag. */}
            <SeirsMarkBold size={40} color={theme.primary} hubColor={theme.background} />
            <Text style={[styles.brand, { color: theme.primary }]}>SEIRS</Text>
            <Text style={[styles.brandSub, { color: theme.textThird }]}>DRIVER</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Create driver account</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>Start delivering with Seirs today</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: '#EF444418' }]}>
              <AlertCircle size={16} color={theme.error} strokeWidth={1.5} />
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          ) : null}

          {/* Name row */}
          <View style={styles.nameRow}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: theme.textSecond }]}>First name *</Text>
              <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
                <User size={16} color={theme.textThird} strokeWidth={1.5} style={styles.inputIcon as any} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="First"
                  placeholderTextColor={theme.textThird}
                  autoCapitalize="words"
                  value={firstName}
                  onChangeText={setFirstName}
                />
              </View>
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: theme.textSecond }]}>Last name *</Text>
              <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.input, { color: theme.text, paddingLeft: Spacing.sm }]}
                  placeholder="Last"
                  placeholderTextColor={theme.textThird}
                  autoCapitalize="words"
                  value={lastName}
                  onChangeText={setLastName}
                />
              </View>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>
              Middle name <Text style={[styles.optLabel, { color: theme.textThird }]}>(optional)</Text>
            </Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <TextInput
                style={[styles.input, { color: theme.text, paddingLeft: Spacing.sm }]}
                placeholder="Middle name"
                placeholderTextColor={theme.textThird}
                autoCapitalize="words"
                value={middleName}
                onChangeText={setMiddleName}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Email address *</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <Mail size={16} color={theme.textThird} strokeWidth={1.5} style={styles.inputIcon as any} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="you@example.com"
                placeholderTextColor={theme.textThird}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Phone number *</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <View style={[styles.prefixWrap, { borderRightColor: theme.border }]}>
                <Phone size={14} color={theme.textThird} strokeWidth={1.5} />
                <Text style={[styles.prefix, { color: theme.textSecond }]}>+234</Text>
              </View>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="08012345678"
                placeholderTextColor={theme.textThird}
                keyboardType="phone-pad"
                maxLength={11}
                value={phone}
                onChangeText={setPhone}
              />
            </View>
            <Text style={[styles.hint, { color: theme.textThird }]}>Nigerian numbers only: 080x / 081x / 070x / 090x / 091x</Text>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Password *</Text>
            <PasswordInput
              placeholder="Min 8 chars, upper + lower + number/symbol"
              placeholderTextColor={theme.textThird}
              backgroundColor={theme.surfaceSecond}
              borderColor={theme.border}
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Confirm password *</Text>
            <PasswordInput
              placeholder="Re-enter password"
              placeholderTextColor={theme.textThird}
              backgroundColor={theme.surfaceSecond}
              borderColor={theme.border}
              value={confirmPass}
              onChangeText={setConfirmPass}
            />
          </View>
        </View>

        {/* Vehicle selector */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Vehicle type *</Text>
        </View>
        <View style={styles.vehicleGrid}>
          {VEHICLES.map(v => {
            const selected = vehicle === v.id;
            return (
              <Pressable
                key={v.id}
                style={[
                  styles.vehicleCard,
                  {
                    backgroundColor: selected ? theme.primary + '15' : theme.surface,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                  Shadows.xs,
                ]}
                onPress={() => setVehicle(v.id)}
              >
                <v.Icon size={22} color={selected ? theme.primary : theme.textThird} strokeWidth={1.5} />
                <Text style={[styles.vehicleLabel, { color: selected ? theme.primary : theme.text }]}>{v.label}</Text>
                <Text style={[styles.vehicleDesc,  { color: theme.textThird }]}>{v.desc}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Checkboxes */}
        <View style={[styles.checkCard, { backgroundColor: theme.surface }, Shadows.xs]}>
          <Checkbox
            value={ageConfirmed}
            onToggle={() => setAgeConfirmed(v => !v)}
            label="I confirm I am 18 years of age or older"
          />
          <Checkbox
            value={termsConfirmed}
            onToggle={() => setTermsConfirmed(v => !v)}
            label={
              <Text style={[styles.checkLabel, { color: theme.textSecond }]}>
                I agree to the{' '}
                <Text
                  style={[styles.linkText, { color: theme.primary }]}
                  onPress={() => Linking.openURL(TERMS_URL)}
                >Terms of Service</Text>
                {' '}(including the Driver Code of Conduct) and{' '}
                <Text
                  style={[styles.linkText, { color: theme.primary }]}
                  onPress={() => Linking.openURL(PRIVACY_URL)}
                >Privacy Policy</Text>
              </Text>
            }
          />
        </View>

        <Pressable
          style={[styles.submitBtn, { backgroundColor: theme.primary }, loading && { opacity: 0.7 }]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.submitText}>Create Driver Account</Text>
          )}
        </Pressable>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecond }]}>Already have an account?</Text>
          <Pressable onPress={() => router.push('/(auth)/login')}>
            <Text style={[styles.footerLink, { color: theme.primary }]}> Sign In</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:     { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.xxl, paddingBottom: Spacing.xl },
  backBtn:       { marginBottom: Spacing.lg },
  backCircle:    { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  header:        { marginBottom: Spacing.lg },
  brandRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.md },
  brand:         { fontSize: FontSize.sm, fontWeight: FontWeight.black as any, letterSpacing: 4 },
  brandSub:      { fontSize: 9, fontWeight: FontWeight.medium as any, letterSpacing: 3, marginTop: 1 },
  title:         { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold as any, marginBottom: Spacing.xs },
  subtitle:      { fontSize: FontSize.base },
  card:          { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.md },
  errorBox:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  errorText:     { fontSize: FontSize.sm, fontWeight: FontWeight.medium as any, flex: 1 },
  nameRow:       { flexDirection: 'row', gap: Spacing.sm },
  field:         { marginBottom: Spacing.md, gap: Spacing.xs },
  label:         { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  optLabel:      { fontWeight: '400' as any },
  inputWrap:     { flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md },
  inputIcon:     { marginRight: Spacing.sm },
  input:         { flex: 1, fontSize: FontSize.base, height: '100%' },
  prefixWrap:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: Spacing.sm, marginRight: Spacing.sm, borderRightWidth: 1 },
  prefix:        { fontSize: FontSize.sm, fontWeight: FontWeight.medium as any },
  hint:          { fontSize: FontSize.xs, marginTop: 2 },
  sectionHeader: { marginBottom: Spacing.sm },
  sectionTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  vehicleGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  vehicleCard:   { width: '47%', padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5, alignItems: 'center', gap: 6 },
  vehicleLabel:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold as any, textAlign: 'center' },
  vehicleDesc:   { fontSize: FontSize.xs, textAlign: 'center' },
  checkCard:     { borderRadius: Radius.xl, padding: Spacing.md, marginBottom: Spacing.md, gap: Spacing.md },
  checkRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  checkLabel:    { flex: 1, fontSize: FontSize.sm, lineHeight: 20 },
  linkText:      { fontWeight: FontWeight.semibold, textDecorationLine: 'underline' },
  submitBtn:     { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.lg },
  submitText:    { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semibold as any },
  footer:        { flexDirection: 'row', justifyContent: 'center' },
  footerText:    { fontSize: FontSize.base },
  footerLink:    { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
});
