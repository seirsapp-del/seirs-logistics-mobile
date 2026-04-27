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

type VehicleType = 'bicycle' | 'motorcycle' | 'tricycle' | 'car' | 'van';

const VEHICLES: { id: VehicleType; label: string; icon: string; desc: string }[] = [
  { id: 'bicycle',    label: 'Bicycle',     icon: '🚲', desc: 'Short distances' },
  { id: 'motorcycle', label: 'Motorcycle',  icon: '🏍️', desc: 'Fast urban' },
  { id: 'tricycle',   label: 'Tricycle',    icon: '🛺', desc: 'Medium loads' },
  { id: 'car',        label: 'Car',         icon: '🚗', desc: 'Standard packages' },
  { id: 'van',        label: 'Van / Truck', icon: '🚐', desc: 'Large items' },
];

export default function DriverRegisterScreen() {
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
  const [vehicle,    setVehicle]    = useState<VehicleType | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim() || !email || !phone || !password || !vehicle) {
      setError('Please fill in all required fields and select a vehicle type.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[\d\W]/.test(password)) {
      setError('Password must include uppercase, lowercase, and a number or symbol.');
      return;
    }
    const fullName = [firstName.trim(), middleName.trim(), lastName.trim()].filter(Boolean).join(' ');
    setError('');
    setLoading(true);
    try {
      const res = await authApi.register({ name: fullName, email, phone, password, role: 'driver', vehicleType: vehicle! });
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
          <View style={[styles.driverBadge, { backgroundColor: theme.primary + '18' }]}>
            <Ionicons name="navigate-outline" size={13} color={theme.primary} />
            <Text style={[styles.driverBadgeText, { color: theme.primary }]}>Driver Account</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Join as a driver</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            Earn money delivering packages on your schedule
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
                  placeholder="Adeyemi"
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
                placeholder="Chukwu"
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

          {/* Vehicle selector */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Vehicle type</Text>
            <View style={styles.vehicleGrid}>
              {VEHICLES.map((v) => {
                const selected = vehicle === v.id;
                return (
                  <Pressable
                    key={v.id}
                    style={[
                      styles.vehicleCard,
                      {
                        backgroundColor: selected ? theme.primary + '15' : theme.surfaceSecond,
                        borderColor: selected ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => setVehicle(v.id)}
                  >
                    <Text style={styles.vehicleEmoji}>{v.icon}</Text>
                    <Text style={[styles.vehicleLabel, { color: selected ? theme.primary : theme.text }]}>
                      {v.label}
                    </Text>
                    <Text style={[styles.vehicleDesc, { color: theme.textSecond }]}>{v.desc}</Text>
                    {selected && (
                      <View style={[styles.vehicleCheck, { backgroundColor: theme.primary }]}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* KYC note */}
          <View style={[styles.kycNote, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Ionicons name="document-text-outline" size={16} color={theme.textSecond} />
            <Text style={[styles.kycNoteText, { color: theme.textSecond }]}>
              After registration, you'll need to upload your ID and vehicle documents for verification.
            </Text>
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
                <Text style={styles.submitText}>Start Earning</Text>
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
  container:  { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.xl, paddingBottom: Spacing.xl },
  backBtn:    { marginBottom: Spacing.lg },
  backCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  header:     { marginBottom: Spacing.xl },
  brandRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.md },
  brand:      { fontSize: FontSize.sm, fontWeight: FontWeight.black, letterSpacing: 3 },
  driverBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.full, marginBottom: Spacing.sm },
  driverBadgeText:{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 1 },
  title:      { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, marginBottom: Spacing.xs },
  subtitle:   { fontSize: FontSize.base, lineHeight: 22 },
  card:       { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  errorBox:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  errorText:  { fontSize: FontSize.sm, fontWeight: FontWeight.medium, flex: 1 },
  nameRow:    { flexDirection: 'row', gap: Spacing.sm },
  field:      { marginBottom: Spacing.md, gap: Spacing.xs },
  label:      { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md },
  inputIcon:  { marginRight: Spacing.sm },
  input:      { flex: 1, fontSize: FontSize.base, height: '100%' },
  vehicleGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  vehicleCard:  { width: '47%', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5, alignItems: 'center', gap: 4, position: 'relative' },
  vehicleEmoji: { fontSize: 28, marginBottom: 2 },
  vehicleLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  vehicleDesc:  { fontSize: FontSize.xs },
  vehicleCheck: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  kycNote:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, marginBottom: Spacing.lg },
  kycNoteText: { flex: 1, fontSize: FontSize.sm, lineHeight: 20 },
  submitBtn:   { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  submitRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  submitText:  { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  footer:     { flexDirection: 'row', justifyContent: 'center' },
  footerText: { fontSize: FontSize.base },
  footerLink: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
