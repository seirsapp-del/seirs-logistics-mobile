/**
 * Business Registration: single-step Sender signup.
 *
 * 2026-05-11 hybrid-account redesign: removed the upfront "Sender vs Partner
 * Store" picker. Everyone signs up as a Business Sender (instant access,
 * canSend=true). Operating as a Partner Store is now an *additive* role
 * applied for via Settings, "Apply to be a Partner Store": admin reviews KYC
 * docs, flips canPartner=true, and the user gets a context switcher at the
 * top of the app to swap between sending and partnering modes.
 *
 * This matches the real Nigerian SME pattern: a shop owner can simultaneously
 * ship their own goods (Sender) AND accept SEIRS drop-offs from neighbours
 * (Partner Store), under one account.
 *
 * Rebuilt 2026-09-01 on the customer app's register, style and field order
 * both, at the founder's direction. Two things here were not cosmetic:
 *
 *   1. Every colour on this screen was a hardcoded light-mode hex, and the
 *      old stylesheet said so out loud ("a full per-element theming pass can
 *      come later"). On a dark phone that meant #374151 labels and a #0F2B4C
 *      back arrow on a near-black background, and white input wells. This is
 *      the screen where someone hands over their name, company and password.
 *   2. The age and terms boxes were collected and never sent. They are sent
 *      now, matching customer's payload. Do NOT read that as consent being
 *      recorded: checking the server showed the User entity has no
 *      ageConfirmed or termsAcceptedAt column and neither register path
 *      writes one, so BOTH apps show a Terms checkbox and discard the
 *      answer. This makes the two clients identical so the backend has to
 *      be fixed in one place, and the gap is the founder's call.
 *
 * Field order follows customer where the two overlap (name row, middle name,
 * email, phone, address, passwords, consent). The company block is the one
 * business-only group and sits after the personal details, before the
 * address, which is where it already was.
 *
 * Kept from business deliberately: the submit stays tappable and names the
 * first missing field, rather than greying out and leaving someone to hunt
 * through thirteen inputs for the problem. Customer greys its button; on a
 * form this long that is worse, so this is the one place business does not
 * follow it.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Linking,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StatusBar,
} from 'react-native';

// Canonical legal docs live on the marketing site so they stay in sync
// across web + all 3 mobile apps without bundling text.
const TERMS_URL   = 'https://seirs-website.vercel.app/terms-of-service';
const PRIVACY_URL = 'https://seirs-website.vercel.app/privacy-policy';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { SeirsMarkBold } from '@seirs/shared/components/SeirsLogoV2';
import { authApi } from '@/services/api';
import { validatePassword, isPasswordValid } from '@seirs/shared';
import { toE164Ng, toNationalInput, isValidNationalNg, NG_PHONE_HINT } from '@seirs/shared/utils/ngPhone';
import { normaliseRc, isValidRc, canonicalRc, RC_HINT, RC_ERROR } from '@seirs/shared/utils/rcNumber';
import { StatePicker } from '@/components/StatePicker';
import { StreetAutocomplete } from '@/components/StreetAutocomplete';
import { PasswordInput } from '@/components/PasswordInput';
import { useTheme } from '@/context/ThemeContext';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';

export default function RegisterScreen() {
  const router     = useRouter();
  const insets     = useSafeAreaInsets();
  const { isDark } = useTheme();
  const theme      = Colors[isDark ? 'dark' : 'light'];

  // Captured from a deep link (seirsbusiness://register?ref=BIZ-XXXXX), the
  // same way customer does it, and still typeable by hand below for someone
  // who was given a code verbally.
  const { ref: refParam } = useLocalSearchParams<{ ref?: string }>();

  const [form, setForm] = useState({
    firstName: '', middleName: '', lastName: '',
    email: '', phone: '', password: '', confirmPassword: '',
    companyName: '', rcNumber: '',
    // Seeded from the deep link, still editable by hand.
    referralCode: (refParam ?? '').toString().trim().toUpperCase(),
    // Address is broken into 3 structured parts so dispatch can compute zone
    // pricing and filter deliveries by state. On submit they are joined into
    // one canonical businessAddress string.
    state: '', city: '', streetAddress: '',
  });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const [ageOk,   setAgeOk]   = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));


  // Nigerian mobile numbers are 11 digits total: 0 + 2-digit network code + 8
  // digits. Accept the +234 international prefix too by normalising to the
  // 0-prefixed form before testing.
  const phoneValid = isValidNationalNg(form.phone);
  const passValid  = isPasswordValid(form.password);
  const passError  = form.password.length > 0 ? validatePassword(form.password) : null;
  const passMatch  = form.password === form.confirmPassword;
  // Optional, but not a free-text box: see shared/utils/rcNumber.ts.
  const rcOk       = isValidRc(form.rcNumber);

  /** The first human-readable reason the form cannot submit, or null.
   *  Drives both the gate and the message shown on tap. */
  const whatIsMissing = (): string | null => {
    if (!form.firstName.trim())      return 'Please enter your first name.';
    if (!form.lastName.trim())       return 'Please enter your last name.';
    if (!form.email.trim())          return 'Please enter your email address.';
    if (!form.email.includes('@'))   return 'Please enter a valid email address.';
    if (!form.phone.trim())          return 'Please enter your phone number.';
    // 071 is in the regex above and was missing from this list, so a Glo 071
    // user who mistyped was told their prefix is invalid (B-6.6).
    if (!phoneValid)                 return NG_PHONE_HINT;
    if (!form.companyName.trim())    return 'Please enter your company name.';
    if (!rcOk)                       return RC_ERROR;
    if (!form.state)                 return 'Please pick your state.';
    if (!form.city.trim())           return 'Please enter your city or LGA (e.g. Ikeja, Surulere, Lekki).';
    if (!form.streetAddress.trim())  return 'Please enter your street address (street name + building number / landmark).';
    if (!passValid)                  return passError ?? 'Password does not meet the requirements above.';
    if (!passMatch)                  return 'Passwords do not match. Please re-type your confirm password.';
    if (!ageOk)                      return 'Please confirm you are 18 or older.';
    if (!termsOk)                    return 'Please accept the Terms of Service.';
    return null;
  };

  // Gated like the sign-in button (founder 2026-09-01): nothing to press
  // until every required field is filled and both boxes ticked. `missing`
  // is also rendered under the button, because a dead button on a form this
  // long is only fair if it says what it is still waiting for.
  const missing   = whatIsMissing();
  const canSubmit = missing === null && !loading;

  const handleRegister = async () => {
    // Always tappable: name the missing field rather than leaving someone
    // staring at a greyed-out button with no clue which of thirteen inputs
    // is at fault.
    const missing = whatIsMissing();
    if (missing) { setError(missing); return; }

    setError('');
    setLoading(true);
    try {
      const fullName = [form.firstName.trim(), form.middleName.trim(), form.lastName.trim()]
        .filter(Boolean)
        .join(' ');
      // Combine the 3 structured parts into the canonical businessAddress the
      // backend expects: "<street>, <city/LGA>, <state> State, Nigeria".
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
        // E.164, matching customer and driver. Business was the lone app
        // storing the raw 0-prefixed number, so the same person signing up
        // on two apps was recorded two different ways.
        phone:           toE164Ng(form.phone),
        password:        form.password,
        companyName:     form.companyName.trim(),
        rcNumber:        canonicalRc(form.rcNumber) || undefined,
        referralCode:    form.referralCode.trim().toUpperCase() || undefined,
        businessAddress,
        // Structured parts too, so the backend can index by state without
        // re-parsing the combined string.
        state:           form.state,
        city:            form.city.trim(),
        streetAddress:   form.streetAddress.trim(),
        // Consent. Sent from 2026-09-01 to match customer. Nothing on the
        // server persists these yet, on either register path, so this is
        // the client half of a fix that still needs its backend half.
        ageConfirmed:    true,
        termsAcceptedAt: new Date().toISOString(),
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
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={[styles.container, { backgroundColor: theme.background, paddingBottom: Spacing.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <Pressable
          style={styles.backBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
        >
          <View style={[styles.backCircle, { backgroundColor: theme.surface }, Shadows.xs]}>
            <Icon name="ArrowLeft" size={20} color={theme.text} />
          </View>
        </Pressable>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <SeirsMarkBold size={38} color={theme.primary} hubColor={theme.background} />
            <Text style={[styles.brand,    { color: theme.primary }]}>SEIRS</Text>
            <Text style={[styles.brandSub, { color: theme.textThird }]}>BUSINESS &amp; PARTNERS</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Create Business Account</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            Sign up as a Business Sender. You can apply to also become a Partner Store
            from your Settings after signup.
          </Text>
        </View>

        {/* Form */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          {!!error && (
            <View style={[styles.errorBox, { backgroundColor: theme.error + '18' }]}>
              <Icon name="AlertCircle" size={16} color={theme.error} />
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          )}

          {/* Names stacked, not side by side. Nigerian names are long and a
              half-width field scrolled the start of the name out of view:
              "Oluwaseyifunmi" showed as "luwaseyifunmi" and the user could
              not see what they had typed (founder, 2026-09-01). */}
          <Field theme={theme}
            label="First Name" required icon="User" placeholder="Adebayo"
            autoComplete="given-name" autoCapitalize="words"
            value={form.firstName} onChangeText={(v) => set('firstName', v)}
          />
          <Field theme={theme}
            label="Middle Name" optional icon="User" placeholder="Chinedu"
            autoCapitalize="words"
            value={form.middleName} onChangeText={(v) => set('middleName', v)}
          />
          <Field theme={theme}
            label="Last Name" required icon="User" placeholder="Yusuf"
            autoComplete="family-name" autoCapitalize="words"
            value={form.lastName} onChangeText={(v) => set('lastName', v)}
          />

          <Field theme={theme}
            label="Email Address" required icon="Mail" placeholder="adebayo@company.ng"
            keyboardType="email-address" autoCapitalize="none" autoComplete="email"
            value={form.email} onChangeText={(v) => set('email', v)}
          />

          {/* Phone with a locked +234, matching customer: type the number the
              way it is written on a card (08012345678) and the prefix is
              added for you on submit. */}
          <Field theme={theme} label="Phone Number" required icon="Phone" hint={NG_PHONE_HINT}>
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
              value={form.phone}
              onChangeText={(v) => set('phone', toNationalInput(v))}
            />
          </Field>

          {/* The one business-only group. */}
          <Field theme={theme}
            label="Company Name" required icon="Building2" placeholder="Okafor Trading Ltd"
            autoCapitalize="words"
            value={form.companyName} onChangeText={(v) => set('companyName', v)}
          />
          <Field theme={theme}
            label="RC Number" optional icon="Hash" placeholder="RC-123456"
            autoCapitalize="characters"
            value={form.rcNumber}
            onChangeText={(v) => set('rcNumber', normaliseRc(v))}
            hint={RC_HINT}
          />
          {form.rcNumber.length > 0 && !rcOk
            ? <Text style={[styles.fieldError, { color: theme.error, marginTop: -Spacing.sm, marginBottom: Spacing.md }]}>{RC_ERROR}</Text>
            : null}

          {/* Structured address: the state picker locks the canonical name so
              dispatch and zone pricing can filter reliably. City/LGA stays
              free text since exhaustive LGA lists are noisy, and the street
              is Places autocomplete pinned to the chosen state. Unlike
              customer, where the address is optional, business needs it:
              nothing can be priced or dispatched without a state. */}
          <View style={styles.field}>
            <StatePicker label="State *" value={form.state} onChange={(s) => set('state', s)} />
          </View>
          <Field theme={theme}
            label="City / LGA" required placeholder="e.g. Ikeja, Surulere, Lekki, Ikoyi"
            value={form.city} onChangeText={(v) => set('city', v)}
          />
          <View style={styles.field}>
            <StreetAutocomplete
              label="Street Address & Landmark *"
              value={form.streetAddress}
              onChangeText={(v) => set('streetAddress', v)}
              state={form.state}
              placeholder="15 Adeola Odeku Street, Victoria Island"
            />
          </View>

          {/* Password */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Password<Text style={{ color: theme.textThird }}> *</Text></Text>
            <PasswordInput
              placeholder="At least 8 characters"
              placeholderTextColor={theme.textThird}
              autoComplete="new-password"
              backgroundColor={theme.surfaceSecond}
              borderColor={theme.border}
              value={form.password}
              onChangeText={(v) => set('password', v)}
            />
            {passError ? <Text style={[styles.fieldError, { color: theme.error }]}>{passError}</Text> : null}
          </View>

          {/* Confirm password. Kept as its own toggleable field so somebody
              whose two entries disagree can actually look at what they
              typed instead of guessing. */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Confirm Password<Text style={{ color: theme.textThird }}> *</Text></Text>
            <PasswordInput
              placeholder="Repeat password"
              placeholderTextColor={theme.textThird}
              autoComplete="new-password"
              backgroundColor={theme.surfaceSecond}
              borderColor={theme.border}
              value={form.confirmPassword}
              onChangeText={(v) => set('confirmPassword', v)}
            />
            {form.confirmPassword.length > 0 && !passMatch
              ? <Text style={[styles.fieldError, { color: theme.error }]}>Passwords do not match</Text>
              : null}
          </View>

          <Field theme={theme}
            label="Referral Code" optional icon="Gift" placeholder="e.g. BIZ-4K2P9X"
            autoCapitalize="characters"
            value={form.referralCode} onChangeText={(v) => set('referralCode', v.toUpperCase())}
            hint="Someone shared SEIRS with you? Their code goes here."
          />

          {/* Age */}
          <View style={[styles.checkSection, { borderColor: theme.border }]}>
            <Checkbox theme={theme}
              checked={ageOk}
              onToggle={() => setAgeOk((v) => !v)}
              label="I confirm I am 18 years or older"
            />
          </View>

          {/* Terms + Privacy. The document names are tappable independently of
              the checkbox, so a user can read either before agreeing, and
              tapping a link will not accidentally consent for them. */}
          <View style={[styles.checkSection, { borderColor: theme.border }]}>
            <Checkbox theme={theme}
              checked={termsOk}
              onToggle={() => setTermsOk((v) => !v)}
              label={
                <Text style={[styles.checkLabel, { color: theme.text }]}>
                  I accept the{' '}
                  <Text style={[styles.linkText, { color: theme.accent }]} onPress={() => Linking.openURL(TERMS_URL)}>
                    Terms of Service
                  </Text>
                  {' '}and{' '}
                  <Text style={[styles.linkText, { color: theme.accent }]} onPress={() => Linking.openURL(PRIVACY_URL)}>
                    Privacy Policy
                  </Text>
                </Text>
              }
            />
          </View>

          <Pressable
            style={[styles.submitBtn, { backgroundColor: theme.primary }, !canSubmit && { opacity: 0.5 }]}
            onPress={handleRegister}
            disabled={!canSubmit}
          >
            {loading ? <ActivityIndicator color={theme.textOnPrimary} /> : (
              <View style={styles.submitRow}>
                <Text style={[styles.submitText, { color: theme.textOnPrimary }]}>Create Account</Text>
                <Icon name="ArrowRight" size={18} color={theme.textOnPrimary} />
              </View>
            )}
          </Pressable>

          {/* One line under the button, never two. While the form is
              incomplete it says what is still missing; once it is ready it
              says what happens next. The two used to stack, and two grey
              lines in a row read as one run-on sentence. */}
          <Text style={[styles.gateHint, { color: theme.textThird }]}>
            {missing && !loading
              ? missing
              : 'We will email you a 6-digit code to confirm your address.'}
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

type ThemeShape = typeof Colors.light;

/**
 * A labelled input in the customer app's field shape.
 *
 * Defined at module level ON PURPOSE. Declaring it inside RegisterScreen
 * makes a new component type on every render, so React unmounts and remounts
 * the TextInput and the keyboard drops focus after each character typed.
 */
function Field({ theme, label, optional, required, icon, hint, children, ...props }: {
  theme: ThemeShape; label: string; optional?: boolean; required?: boolean;
  icon?: string; hint?: string; children?: ReactNode;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textSecond }]}>
        {label}
        {required ? <Text style={{ color: theme.textThird }}> *</Text> : null}
        {optional ? <Text style={{ fontWeight: FontWeight.regular as any, color: theme.textThird }}> (optional)</Text> : null}
      </Text>
      <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
        {icon ? <Icon name={icon} size={15} color={theme.textThird} /> : null}
        {children ?? (
          <TextInput
            style={[styles.input, { color: theme.text }]}
            placeholderTextColor={theme.textThird}
            {...props}
          />
        )}
      </View>
      {hint ? <Text style={[styles.fieldHint, { color: theme.textThird }]}>{hint}</Text> : null}
    </View>
  );
}

function Checkbox({ theme, checked, onToggle, label }: {
  theme: ThemeShape; checked: boolean; onToggle: () => void; label: ReactNode;
}) {
  return (
    <Pressable style={styles.checkRow} onPress={onToggle}>
      <Icon name={checked ? 'CheckSquare' : 'Square'} size={22} color={checked ? theme.accent : theme.border} />
      <View style={styles.checkTextWrap}>
        {typeof label === 'string'
          ? <Text style={[styles.checkLabel, { color: theme.text }]}>{label}</Text>
          : label}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container:    { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.xxl, paddingBottom: Spacing.xl },
  backBtn:      { marginBottom: Spacing.lg },
  backCircle:   { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  header:       { marginBottom: Spacing.xl },
  brandRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.md },
  brand:        { fontSize: FontSize.sm, fontWeight: FontWeight.black as any, letterSpacing: 3 },
  brandSub:     { fontSize: 9, fontWeight: FontWeight.medium as any, letterSpacing: 1.5, marginTop: 1 },
  title:        { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold as any, marginBottom: Spacing.xs },
  subtitle:     { fontSize: FontSize.base, lineHeight: 22 },
  card:         { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  errorBox:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  errorText:    { fontSize: FontSize.sm, fontWeight: FontWeight.medium as any, flex: 1 },
  field:        { marginBottom: Spacing.md, gap: Spacing.xs },
  label:        { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  inputWrap:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md },
  input:        { flex: 1, fontSize: FontSize.base, height: '100%' },
  prefixWrap:   { paddingRight: Spacing.sm, borderRightWidth: 1 },
  prefix:       { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any },
  fieldHint:    { fontSize: FontSize.xs, marginTop: 2, lineHeight: 16 },
  fieldError:   { fontSize: FontSize.xs, marginTop: 2 },
  checkSection: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
  checkRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  checkTextWrap:{ flex: 1 },
  checkLabel:   { fontSize: FontSize.sm, fontWeight: FontWeight.medium as any, lineHeight: 20 },
  linkText:     { fontWeight: FontWeight.semibold as any, textDecorationLine: 'underline' },
  submitBtn:    { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center', marginTop: Spacing.sm },
  submitRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  submitText:   { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any },
  gateHint:     { fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.sm, marginBottom: Spacing.md, lineHeight: 18 },
  otpNote:      { fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.md, lineHeight: 18 },
  footer:       { flexDirection: 'row', justifyContent: 'center' },
  footerText:   { fontSize: FontSize.base },
  footerLink:   { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
});
