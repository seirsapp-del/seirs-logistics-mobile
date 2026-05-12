/**
 * Business Registration — single-step Sender signup.
 *
 * 2026-05-11 hybrid-account redesign: removed the upfront "Sender vs Partner
 * Store" picker. Everyone signs up as a Business Sender (instant access,
 * canSend=true). Operating as a Partner Store is now an *additive* role
 * applied for via Settings → "Apply to be a Partner Store" — admin reviews
 * KYC docs, flips canPartner=true, and the user gets a context switcher
 * at the top of the app to swap between sending and partnering modes.
 *
 * This matches real Nigerian SME pattern: a shop owner can simultaneously
 * ship their own goods (Sender) AND accept SEIRS drop-offs from neighbours
 * (Partner Store) — under one account.
 */
import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { authApi } from '@/services/api';
import { validatePassword, isPasswordValid, PASSWORD_HELP_TEXT } from '@seirs/shared';

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [form, setForm] = useState({
    firstName: '', middleName: '', lastName: '',
    email: '', phone: '', password: '', confirmPassword: '',
    companyName: '', rcNumber: '', businessAddress: '',
  });
  const [showPass,  setShowPass]  = useState(false);
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [termsOk,   setTermsOk]   = useState(false);
  const [ageOk,     setAgeOk]     = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const phoneValid = /^(080|081|070|090|091)\d{7}$/.test(form.phone.replace(/\s/g, ''));
  const passValid  = isPasswordValid(form.password);
  const passError  = form.password.length > 0 ? validatePassword(form.password) : null;
  const passMatch  = form.password === form.confirmPassword;

  const formValid =
    form.firstName && form.lastName && form.email &&
    phoneValid && passValid && passMatch &&
    form.companyName && form.businessAddress &&
    termsOk && ageOk;

  const handleRegister = async () => {
    setError('');
    setLoading(true);
    try {
      const fullName = [form.firstName.trim(), form.middleName.trim(), form.lastName.trim()]
        .filter(Boolean)
        .join(' ');
      await authApi.register({
        accountType:     'sender',
        name:            fullName,
        email:           form.email.trim().toLowerCase(),
        phone:           form.phone.trim().replace(/\s/g, ''),
        password:        form.password,
        companyName:     form.companyName.trim(),
        rcNumber:        form.rcNumber.trim() || undefined,
        businessAddress: form.businessAddress.trim(),
      });
      router.push({
        pathname: '/(auth)/verify-otp',
        params:   { email: form.email.trim().toLowerCase() },
      } as any);
    } catch (e: any) {
      setError(e.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.form, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={20} color="#0F2B4C" />
        </Pressable>

        <Text style={styles.heading}>Create Business Account</Text>
        <Text style={styles.sub}>
          Sign up as a Business Sender. You can apply to also become a Partner Store
          from your Settings after signup.
        </Text>

        {error !== '' && (
          <View style={styles.errorBox}>
            <Icon name="AlertCircle" size={16} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Personal info — Nigerian users commonly have 3 names; first +
            optional middle + last keeps the form readable and respects
            naming conventions instead of forcing a single Full Name field. */}
        <Field label="First Name" value={form.firstName} onChangeText={(v) => set('firstName', v)}
          placeholder="Adebayo" />
        <Field label="Middle Name (optional)" value={form.middleName} onChangeText={(v) => set('middleName', v)}
          placeholder="Chinedu" />
        <Field label="Last Name" value={form.lastName} onChangeText={(v) => set('lastName', v)}
          placeholder="Yusuf" />
        <Field label="Email Address" value={form.email} onChangeText={(v) => set('email', v)}
          placeholder="adebayo@company.ng" keyboardType="email-address" autoCapitalize="none" />
        <Field label="Phone Number (+234)" value={form.phone} onChangeText={(v) => set('phone', v)}
          placeholder="08012345678" keyboardType="phone-pad" />

        <Field label="Company Name" value={form.companyName} onChangeText={(v) => set('companyName', v)}
          placeholder="Okafor Trading Ltd" />
        <Field label="RC Number (optional)" value={form.rcNumber} onChangeText={(v) => set('rcNumber', v)}
          placeholder="RC-123456" />
        <Field label="Business Address" value={form.businessAddress} onChangeText={(v) => set('businessAddress', v)}
          placeholder="15 Adeola Odeku, Lagos" />

        {/* Password */}
        <Text style={styles.label}>Password</Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={form.password}
            onChangeText={(v) => set('password', v)}
            placeholder={PASSWORD_HELP_TEXT}
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!showPass}
          />
          <Pressable onPress={() => setShowPass((v) => !v)}>
            <Icon name={showPass ? 'EyeOff' : 'Eye'} size={16} color="#9CA3AF" />
          </Pressable>
        </View>
        {passError && (
          <Text style={styles.fieldError}>{passError}</Text>
        )}

        <Field label="Confirm Password" value={form.confirmPassword} onChangeText={(v) => set('confirmPassword', v)}
          placeholder="Repeat password" secureTextEntry />
        {form.confirmPassword.length > 0 && !passMatch && (
          <Text style={styles.fieldError}>Passwords do not match</Text>
        )}

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
          style={[styles.btn, !formValid && styles.btnDisabled]}
          onPress={handleRegister}
          disabled={!formValid || loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <>
                <Text style={styles.btnText}>Create Account</Text>
                <Icon name="ArrowRight" size={18} color="#fff" />
              </>
          }
        </Pressable>

        <View style={styles.signinRow}>
          <Text style={styles.signinText}>Already have an account? </Text>
          <Pressable onPress={() => router.push('/(auth)/login' as any)}>
            <Text style={styles.signinLink}>Sign In</Text>
          </Pressable>
        </View>
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
  form:       { backgroundColor: '#F5F5F0', paddingHorizontal: 24 },
  backBtn:    { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16, marginLeft: -8 },
  heading:    { fontSize: 24, fontWeight: '800', color: '#0F2B4C', marginBottom: 8 },
  sub:        { fontSize: 14, color: '#6B7280', marginBottom: 24, lineHeight: 20 },
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
