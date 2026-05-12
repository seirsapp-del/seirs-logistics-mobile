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
import { StatePicker } from '@/components/StatePicker';

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [form, setForm] = useState({
    firstName: '', middleName: '', lastName: '',
    email: '', phone: '', password: '', confirmPassword: '',
    companyName: '', rcNumber: '',
    // Address now broken into 3 structured parts so the dispatch system
    // can compute zone pricing + filter deliveries by state. On submit
    // they're joined into one canonical businessAddress string.
    state: '', city: '', streetAddress: '',
  });
  const [showPass,        setShowPass]        = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [error,           setError]           = useState('');
  const [loading,   setLoading]   = useState(false);
  const [termsOk,   setTermsOk]   = useState(false);
  const [ageOk,     setAgeOk]     = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Nigerian mobile numbers are 11 digits total: 0 + 2-digit network code + 8 digits.
  // Accept the `+234` international prefix too — normalise to 0-prefixed before
  // testing. (Earlier regex only allowed \d{7} = 10 digits total, rejecting
  // every valid Nigerian number.)
  const normalisedPhone = form.phone.replace(/[\s-]/g, '').replace(/^\+234/, '0');
  const phoneValid = /^0(70|71|80|81|90|91)\d{8}$/.test(normalisedPhone);
  const passValid  = isPasswordValid(form.password);
  const passError  = form.password.length > 0 ? validatePassword(form.password) : null;
  const passMatch  = form.password === form.confirmPassword;

  /** Returns the first human-readable reason the form can't submit,
   *  or null if everything's fine. Used both to gate the submit and
   *  to show the user exactly what needs fixing on tap. */
  const whatIsMissing = (): string | null => {
    if (!form.firstName.trim())                  return 'Please enter your first name.';
    if (!form.lastName.trim())                   return 'Please enter your last name.';
    if (!form.email.trim())                      return 'Please enter your email address.';
    if (!form.email.includes('@'))               return 'Please enter a valid email address.';
    if (!form.phone.trim())                      return 'Please enter your phone number.';
    if (!phoneValid)                             return 'Phone must be a Nigerian number starting with 080, 081, 070, 090, or 091 (11 digits total — e.g. 08012345678).';
    if (!form.companyName.trim())                return 'Please enter your company name.';
    if (!form.state)                              return 'Please pick your state.';
    if (!form.city.trim())                        return 'Please enter your city or LGA (e.g. Ikeja, Surulere, Lekki).';
    if (!form.streetAddress.trim())               return 'Please enter your street address (street name + building number / landmark).';
    if (!passValid)                              return passError ?? 'Password does not meet the requirements above.';
    if (!passMatch)                              return 'Passwords do not match. Please re-type your confirm password.';
    if (!ageOk)                                  return 'Please confirm you are 18 or older.';
    if (!termsOk)                                return 'Please accept the Terms of Service.';
    return null;
  };

  const formValid = whatIsMissing() === null;

  const handleRegister = async () => {
    // Always-tappable submit: show the specific missing field instead
    // of leaving the user staring at a greyed-out button with no clue.
    const missing = whatIsMissing();
    if (missing) {
      setError(missing);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const fullName = [form.firstName.trim(), form.middleName.trim(), form.lastName.trim()]
        .filter(Boolean)
        .join(' ');
      // Combine the 3 structured address parts into the canonical
      // `businessAddress` field the backend expects. Format:
      // "<street>, <city/LGA>, <state> State, Nigeria"
      const businessAddress = [
        form.streetAddress.trim(),
        form.city.trim(),
        `${form.state} State`,
        'Nigeria',
      ].filter(Boolean).join(', ');
      await authApi.register({
        accountType:     'sender',
        name:            fullName,
        email:           form.email.trim().toLowerCase(),
        phone:           form.phone.trim().replace(/\s/g, ''),
        password:        form.password,
        companyName:     form.companyName.trim(),
        rcNumber:        form.rcNumber.trim() || undefined,
        businessAddress,
        // Send structured parts too so backend can index by state
        // without re-parsing the combined string.
        state:           form.state,
        city:            form.city.trim(),
        streetAddress:   form.streetAddress.trim(),
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      // 'padding' on iOS, 'height' on Android — together they ensure the
      // ScrollView resizes above the keyboard so focused inputs aren't
      // hidden. Android also benefits from adjustResize in AndroidManifest
      // which Expo sets by default.
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <ScrollView
        contentContainerStyle={[styles.form, {
          paddingTop:    insets.top + 16,
          // Bigger bottom pad so the last field sits well above the soft
          // keyboard even on shorter phones.
          paddingBottom: insets.bottom + 120,
        }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
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

        {/* Structured address — state picker locks the canonical name so
            dispatch + zone pricing can filter reliably. City/LGA and the
            street remain free-text since exhaustive LGA lists are noisy. */}
        <StatePicker
          label="State"
          value={form.state}
          onChange={(s) => set('state', s)}
        />
        <Field label="City / LGA" value={form.city} onChangeText={(v) => set('city', v)}
          placeholder="e.g. Ikeja, Surulere, Lekki, Ikoyi" />
        <Field label="Street Address & Landmark" value={form.streetAddress} onChangeText={(v) => set('streetAddress', v)}
          placeholder="15 Adeola Odeku Street, opposite Pinnacle Mall" />

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

        {/* Confirm Password — mirror of the Password field with its own
            eye toggle so the user can verify what they typed if the two
            don't match. Without the toggle they're stuck guessing. */}
        <Text style={styles.label}>Confirm Password</Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={form.confirmPassword}
            onChangeText={(v) => set('confirmPassword', v)}
            placeholder="Repeat password"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!showConfirmPass}
          />
          <Pressable onPress={() => setShowConfirmPass((v) => !v)}>
            <Icon name={showConfirmPass ? 'EyeOff' : 'Eye'} size={16} color="#9CA3AF" />
          </Pressable>
        </View>
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

        {/* Button is always tappable — if the form is incomplete, tapping
            shows the user exactly what's missing in the error box above.
            Better than a greyed-out button they can't diagnose. */}
        <Pressable
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleRegister}
          disabled={loading}
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
