import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { authApi } from '@/services/api';

type AccountType = 'sender' | 'partner';

const ACCOUNT_TYPES: { key: AccountType; label: string; sub: string; icon: 'Briefcase' | 'Store' }[] = [
  { key: 'sender',  label: 'Business Sender', sub: 'Bulk deliveries, multi-stop, CSV upload', icon: 'Briefcase' },
  { key: 'partner', label: 'Partner Store',   sub: 'Collection point, package management, payouts', icon: 'Store' },
];

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step,        setStep]        = useState<1 | 2>(1);
  const [accountType, setAccountType] = useState<AccountType>('sender');
  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '', confirmPassword: '',
    companyName: '', rcNumber: '', businessAddress: '',
    storeName: '', storeAddress: '', capacity: '',
  });
  const [showPass,  setShowPass]  = useState(false);
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [termsOk,   setTermsOk]   = useState(false);
  const [ageOk,     setAgeOk]     = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const phoneValid = /^(080|081|070|090|091)\d{7}$/.test(form.phone.replace(/\s/g, ''));
  const passValid  = form.password.length >= 12;
  const passMatch  = form.password === form.confirmPassword;

  const step2Valid = form.name && form.email && phoneValid && passValid && passMatch && termsOk && ageOk
    && (accountType === 'sender'
      ? form.companyName && form.businessAddress
      : form.storeName && form.storeAddress);

  const handleRegister = async () => {
    setError('');
    setLoading(true);
    try {
      await authApi.register({
        accountType,
        name:  form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim().replace(/\s/g, ''),
        password: form.password,
        ...(accountType === 'sender' ? {
          companyName:     form.companyName.trim(),
          rcNumber:        form.rcNumber.trim() || undefined,
          businessAddress: form.businessAddress.trim(),
        } : {
          storeName:    form.storeName.trim(),
          storeAddress: form.storeAddress.trim(),
          capacity:     form.capacity ? Number(form.capacity) : undefined,
        }),
      });
      router.push({ pathname: '/(auth)/verify-otp', params: { email: form.email.trim().toLowerCase() } } as any);
    } catch (e: any) {
      setError(e.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 1) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={20} color="#0F2B4C" />
        </Pressable>

        <Text style={styles.heading}>Choose Account Type</Text>
        <Text style={styles.sub}>Select how you'll use Seirs Business</Text>

        <View style={styles.typeGrid}>
          {ACCOUNT_TYPES.map((t) => (
            <Pressable
              key={t.key}
              style={[styles.typeCard, accountType === t.key && styles.typeCardActive]}
              onPress={() => setAccountType(t.key)}
            >
              <View style={[styles.typeIcon, accountType === t.key && styles.typeIconActive]}>
                <Icon name={t.icon} size={24} color={accountType === t.key ? '#fff' : '#0F2B4C'} />
              </View>
              <Text style={[styles.typeLabel, accountType === t.key && styles.typeLabelActive]}>
                {t.label}
              </Text>
              <Text style={[styles.typeSub, accountType === t.key && styles.typeSubActive]}>
                {t.sub}
              </Text>
              {accountType === t.key && (
                <View style={styles.check}>
                  <Icon name="CheckCircle2" size={20} color="#3A7BD5" />
                </View>
              )}
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.btn} onPress={() => setStep(2)}>
          <Text style={styles.btnText}>Continue</Text>
          <Icon name="ArrowRight" size={18} color="#fff" />
        </Pressable>

        <View style={styles.signinRow}>
          <Text style={styles.signinText}>Already have an account? </Text>
          <Pressable onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.signinLink}>Sign In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.form, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.backBtn} onPress={() => setStep(1)}>
          <Icon name="ArrowLeft" size={20} color="#0F2B4C" />
        </Pressable>

        <View style={styles.typeBadge}>
          <Icon name={accountType === 'sender' ? 'Briefcase' : 'Store'} size={16} color="#3A7BD5" />
          <Text style={styles.typeBadgeText}>
            {accountType === 'sender' ? 'Business Sender' : 'Partner Store'}
          </Text>
        </View>

        <Text style={styles.heading}>Your Details</Text>

        {error !== '' && (
          <View style={styles.errorBox}>
            <Icon name="AlertCircle" size={16} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Personal info */}
        <Field label="Full Name" value={form.name} onChangeText={(v) => set('name', v)} placeholder="John Okafor" />
        <Field label="Email Address" value={form.email} onChangeText={(v) => set('email', v)}
          placeholder="john@company.ng" keyboardType="email-address" autoCapitalize="none" />
        <Field label="Phone Number (+234)" value={form.phone} onChangeText={(v) => set('phone', v)}
          placeholder="08012345678" keyboardType="phone-pad" />

        {/* Business / Store info */}
        {accountType === 'sender' ? (
          <>
            <Field label="Company Name" value={form.companyName} onChangeText={(v) => set('companyName', v)}
              placeholder="Okafor Trading Ltd" />
            <Field label="RC Number (optional)" value={form.rcNumber} onChangeText={(v) => set('rcNumber', v)}
              placeholder="RC-123456" />
            <Field label="Business Address" value={form.businessAddress} onChangeText={(v) => set('businessAddress', v)}
              placeholder="15 Adeola Odeku, Lagos" />
          </>
        ) : (
          <>
            <Field label="Store Name" value={form.storeName} onChangeText={(v) => set('storeName', v)}
              placeholder="Mama Ngozi Kiosk" />
            <Field label="Store Address" value={form.storeAddress} onChangeText={(v) => set('storeAddress', v)}
              placeholder="10 Femi Okunnu, Lekki" />
            <Field label="Package Capacity (optional)" value={form.capacity} onChangeText={(v) => set('capacity', v)}
              placeholder="Max packages e.g. 50" keyboardType="numeric" />
          </>
        )}

        {/* Password */}
        <Text style={styles.label}>Password</Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={form.password}
            onChangeText={(v) => set('password', v)}
            placeholder="Minimum 12 characters"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!showPass}
          />
          <Pressable onPress={() => setShowPass((v) => !v)}>
            <Icon name={showPass ? 'EyeOff' : 'Eye'} size={16} color="#9CA3AF" />
          </Pressable>
        </View>
        {form.password.length > 0 && !passValid && (
          <Text style={styles.fieldError}>Minimum 12 characters</Text>
        )}

        <Field label="Confirm Password" value={form.confirmPassword} onChangeText={(v) => set('confirmPassword', v)}
          placeholder="Repeat password" secureTextEntry />
        {form.confirmPassword.length > 0 && !passMatch && (
          <Text style={styles.fieldError}>Passwords do not match</Text>
        )}

        {/* Checkboxes */}
        <CheckRow
          value={ageOk}
          onToggle={() => setAgeOk((v) => !v)}
          label="I confirm I am 18 years or older"
        />
        <CheckRow
          value={termsOk}
          onToggle={() => setTermsOk((v) => !v)}
          label="I accept the Terms of Service and Privacy Policy"
        />

        <Pressable
          style={[styles.btn, !step2Valid && styles.btnDisabled]}
          onPress={handleRegister}
          disabled={!step2Valid || loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <>
                <Text style={styles.btnText}>Create Account</Text>
                <Icon name="ArrowRight" size={18} color="#fff" />
              </>
          }
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput style={[styles.input, { flex: 1 }]} placeholderTextColor="#9CA3AF" {...props} />
      </View>
    </>
  );
}

function CheckRow({ value, onToggle, label }: { value: boolean; onToggle: () => void; label: string }) {
  return (
    <Pressable style={styles.checkRow} onPress={onToggle}>
      <View style={[styles.checkbox, value && styles.checkboxActive]}>
        {value && <Icon name="Check" size={12} color="#fff" strokeWidth={2.5} />}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#F5F5F0', paddingHorizontal: 24 },
  form:       { backgroundColor: '#F5F5F0', paddingHorizontal: 24 },
  backBtn:    { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16, marginLeft: -8 },
  typeBadge:  {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#3A7BD5/10', borderWidth: 1, borderColor: '#3A7BD5',
    alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 12,
  },
  typeBadgeText: { fontSize: 12, color: '#3A7BD5', fontWeight: '600' },
  heading:    { fontSize: 24, fontWeight: '800', color: '#0F2B4C', marginBottom: 20 },
  sub:        { fontSize: 14, color: '#6B7280', marginBottom: 32 },
  typeGrid:   { gap: 14, marginBottom: 32 },
  typeCard:   {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    borderWidth: 2, borderColor: '#E5E7EB',
  },
  typeCardActive: { borderColor: '#3A7BD5', backgroundColor: '#F0F5FF' },
  typeIcon:   {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#F0F5FF', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  typeIconActive: { backgroundColor: '#3A7BD5' },
  typeLabel:  { fontSize: 16, fontWeight: '700', color: '#0F2B4C', marginBottom: 4 },
  typeLabelActive: { color: '#0F2B4C' },
  typeSub:    { fontSize: 13, color: '#6B7280' },
  typeSubActive: { color: '#3A7BD5' },
  check:      { position: 'absolute', top: 16, right: 16 },
  errorBox:   {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorText:  { color: '#DC2626', fontSize: 13, flex: 1 },
  label:      { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  inputWrap:  {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 14,
  },
  input:      { fontSize: 15, color: '#0F2B4C' },
  fieldError: { color: '#EF4444', fontSize: 12, marginTop: -10, marginBottom: 12, marginLeft: 4 },
  checkRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  checkbox:   {
    width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkboxActive: { backgroundColor: '#0F2B4C', borderColor: '#0F2B4C' },
  checkLabel: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 20 },
  btn:        {
    backgroundColor: '#0F2B4C', borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8,
  },
  btnDisabled: { opacity: 0.4 },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
  signinRow:  { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  signinText: { color: '#6B7280', fontSize: 14 },
  signinLink: { color: '#3A7BD5', fontWeight: '600', fontSize: 14 },
});
