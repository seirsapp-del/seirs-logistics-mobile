import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Palette } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { authApi } from '@/services/api';
import { PasswordInput } from '@/components/PasswordInput';

type VehicleType = 'bicycle' | 'motorcycle' | 'tricycle' | 'car' | 'van';

const VEHICLES: { id: VehicleType; label: string; icon: string; desc: string }[] = [
  { id: 'bicycle',    label: 'Bicycle',    icon: '🚲', desc: 'Short distances' },
  { id: 'motorcycle', label: 'Motorcycle', icon: '🏍️', desc: 'Fast urban delivery' },
  { id: 'tricycle',   label: 'Tricycle',   icon: '🛺', desc: 'Medium loads' },
  { id: 'car',        label: 'Car',        icon: '🚗', desc: 'Standard packages' },
  { id: 'van',        label: 'Van / Truck',icon: '🚐', desc: 'Large/bulk items' },
];

export default function DriverRegisterScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const { login } = useAuth();

  const [firstName,  setFirstName]  = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName,   setLastName]   = useState('');
  const [email,    setEmail]    = useState('');
  const [phone,    setPhone]    = useState('');
  const [password, setPassword] = useState('');
  const [vehicle, setVehicle] = useState<VehicleType | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

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
      const res = await authApi.register({
        name: fullName, email, phone, password,
        role: 'driver',
        vehicleType: vehicle!,
      });
      await login({ ...res.user, token: res.token });
    } catch (e: any) {
      setError(e.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={[styles.backText, { color: theme.primary }]}>← Back</Text>
          </Pressable>
          <View style={[styles.badge, { backgroundColor: theme.primary + '18' }]}>
            <Text style={[styles.badgeText, { color: theme.primary }]}>Driver Account</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Join as a driver</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            Earn money delivering packages on your schedule
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: theme.error + '18' }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>First name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. Chukwuemeka"
              placeholderTextColor={theme.textSecond}
              autoComplete="given-name"
              autoCapitalize="words"
              value={firstName}
              onChangeText={setFirstName}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Middle name <Text style={{ fontWeight: '400' }}>(optional)</Text></Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. Tunde"
              placeholderTextColor={theme.textSecond}
              autoCapitalize="words"
              value={middleName}
              onChangeText={setMiddleName}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Last name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. Adeyemi"
              placeholderTextColor={theme.textSecond}
              autoComplete="family-name"
              autoCapitalize="words"
              value={lastName}
              onChangeText={setLastName}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Email address</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
              placeholder="you@example.com"
              placeholderTextColor={theme.textSecond}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Phone number</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
              placeholder="+234 800 000 0000"
              placeholderTextColor={theme.textSecond}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Password</Text>
            <PasswordInput
              placeholder="Min. 8 characters"
              placeholderTextColor={theme.textSecond}
              autoComplete="new-password"
              backgroundColor={theme.surface}
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
                        backgroundColor: selected ? theme.primary + '18' : theme.surface,
                        borderColor: selected ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => setVehicle(v.id)}
                  >
                    <Text style={styles.vehicleIcon}>{v.icon}</Text>
                    <Text style={[styles.vehicleLabel, { color: selected ? theme.primary : theme.text }]}>
                      {v.label}
                    </Text>
                    <Text style={[styles.vehicleDesc, { color: theme.textSecond }]}>
                      {v.desc}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.kycNote, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Text style={[styles.kycNoteText, { color: theme.textSecond }]}>
              📋 After registration, you'll need to upload your ID and vehicle documents for verification.
            </Text>
          </View>

          <Pressable
            style={[styles.submitBtn, { backgroundColor: theme.primary }, loading && styles.disabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Start Earning</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecond }]}>
            Already have an account?{' '}
          </Text>
          <Pressable onPress={() => router.push('/(auth)/login')}>
            <Text style={[styles.footerLink, { color: theme.primary }]}>Sign In</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  backBtn: {
    marginBottom: Spacing.lg,
  },
  backText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    marginBottom: Spacing.sm,
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.base,
    lineHeight: 22,
  },
  form: {
    gap: Spacing.xs,
  },
  errorBox: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  errorText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  field: {
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  input: {
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.base,
  },
  vehicleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  vehicleCard: {
    width: '47%',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 4,
  },
  vehicleIcon: {
    fontSize: 28,
    marginBottom: 2,
  },
  vehicleLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  vehicleDesc: {
    fontSize: FontSize.xs,
  },
  kycNote: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.lg,
    marginTop: Spacing.xs,
  },
  kycNoteText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  submitBtn: {
    height: 54,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  disabled: {
    opacity: 0.7,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.xl,
  },
  footerText: {
    fontSize: FontSize.base,
  },
  footerLink: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
});
