import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Keyboard,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { StreetAutocomplete } from '@/components/StreetAutocomplete';
import { StatePicker } from '@/components/StatePicker';
import { usersApi, businessApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/context/ThemeContext';
import { alertDialog } from '@/components/SeirsDialog';
import { normaliseRc, isValidRc, canonicalRc, RC_ERROR } from '@seirs/shared/utils/rcNumber';

// Spec V8 §4. business / partner profile editor. Edits both the User
// row (name, phone) AND the BusinessAccount row (companyName, RC,
// structured address). Business-side fields are owner-only. non-
// owner team members see them read-only with a hint about who to
// contact.
// Validation shared with backend UpdateProfileDto.
const NAME_CHARS   = /^[\p{L}][\p{L} .'\-]*[\p{L}.]$/u;
const NAME_NO_SPAM = /^(?!.*\d{3,})(?!.*\s{2,})(?!.*(?:https?:|www\.|\.com|\.ng|\.co|@))/i;
const NG_PHONE     = /^(\+?234[789]\d{9}|0[789]\d{9}|[789]\d{9})$/;

function validateName(v: string, min = 2, max = 40): string | null {
  const s = v.trim();
  if (!s) return null;
  if (s.length < min || s.length > max) return `Must be ${min} to ${max} characters`;
  if (!NAME_CHARS.test(s))               return 'Only letters, spaces, hyphens, apostrophes, dots';
  if (!NAME_NO_SPAM.test(s))             return 'No phone numbers, URLs, or emails';
  return null;
}
function validatePhone(v: string): string | null {
  if (!v.trim()) return null;
  if (!NG_PHONE.test(v.trim())) return 'Nigerian mobile only';
  return null;
}

export default function BusinessEditProfileScreen() {
  const insets = useSafeAreaInsets();

  /**
   * Keep the focused field above the keyboard. Android resizes the window
   * (adjustResize) but React Native does not scroll the focused input
   * into view, so the street address sat at y=1585 under a keyboard
   * topping out near y=1340 and you could not see what you typed
   * (founder, on device 2026-08-16). Same approach as the Send flow:
   * measureInWindow needs no ancestor ref, and the lift runs from
   * keyboardDidShow because the height is unknown at focus time.
   */
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const focusedRef = useRef<any>(null);
  const [kbH, setKbH] = useState(0);
  const ensureVisible = (node: any, height: number, extra = 0) => {
    if (!node || typeof node.measureInWindow !== 'function' || !height) return;
    node.measureInWindow((_x: number, y: number, _w: number, h: number) => {
      const overlap = (y + h + 24 + extra) - (Dimensions.get('window').height - height);
      if (overlap > 0) scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + overlap), animated: true });
    });
  };
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const h = e.endCoordinates.height;
      setKbH(h);
      const f = focusedRef.current;
      if (f) setTimeout(() => ensureVisible(f.node ?? f, h, f.extra ?? 0), 60);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  /**
   * `extra` reserves space BELOW the field. The address input drops a
   * suggestion list underneath it, and lifting only the input left every
   * suggestion under the keyboard: they existed in the view tree, so a
   * dump looked fine, but nothing was visible to type against (founder
   * 2026-08-16: "i typed a random location and it didnt pick nothing
   * up").
   */
  const onFieldFocus = (e: any, extra = 0) => {
    focusedRef.current = { node: e?.target, extra };
    if (kbH > 0) setTimeout(() => ensureVisible(e?.target, kbH, extra), 60);
  };
  const router = useRouter();
  const colors = useColors();
  const { user, refresh } = useAuth() as any;

  // Split-name for the account owner (Spec V8 privacy pass 2026-08-08)
  const [firstName,  setFirstName]  = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName,   setLastName]   = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [emergencyName,  setEmergencyName]  = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const dobLocked = !!user?.dateOfBirth;

  // Spec V8. business account fields (owner-only edit)
  const [biz,           setBiz]           = useState<any>(null);
  const [companyName,   setCompanyName]   = useState('');
  const [rcNumber,      setRcNumber]      = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city,          setCity]          = useState('');
  const [state,         setState]         = useState('');
  const [bizLoading,    setBizLoading]    = useState(true);

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? deriveFirst(user.name));
    setMiddleName(user.middleName ?? '');
    setLastName(user.lastName ?? deriveLast(user.name));
    setDateOfBirth(user.dateOfBirth ? String(user.dateOfBirth).slice(0, 10) : '');
    setPhone(user.phone ?? '');
    setEmergencyName(user.emergencyContactName ?? '');
    setEmergencyPhone(user.emergencyContactPhone ?? '');
  }, [user]);

  useEffect(() => {
    (async () => {
      try {
        const account = await businessApi.account.get();
        setBiz(account);
        setCompanyName(account.companyName ?? '');
        setRcNumber(account.rcNumber ?? '');
        setStreetAddress(account.streetAddress ?? '');
        setCity(account.city ?? '');
        setState(account.state ?? '');
      } catch { /* non-fatal. partner-only users with no biz account */ }
      finally { setBizLoading(false); }
    })();
  }, []);

  const isOwner = biz?.myTeamRole === 'owner';
  const myRoleLabel = biz?.myTeamRole ? biz.myTeamRole.charAt(0).toUpperCase() + biz.myTeamRole.slice(1) : null;

  const validate = (): boolean => {
    const e: Record<string, string | null> = {
      firstName:      validateName(firstName, 2, 40),
      middleName:     validateName(middleName, 1, 40),
      lastName:       validateName(lastName, 2, 40),
      phone:          validatePhone(phone),
      emergencyName:  validateName(emergencyName, 2, 100),
      emergencyPhone: validatePhone(emergencyPhone),
    };
    if (!firstName.trim()) e.firstName = 'First name required';
    if (!lastName.trim())  e.lastName  = 'Last name required';
    setErrors(e);
    return Object.values(e).every(v => v === null);
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // Always update user row (split-name + related fields)
      const userPayload: any = {
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        phone:     phone.trim(),
      };
      if (middleName.trim())     userPayload.middleName            = middleName.trim();
      if (dateOfBirth.trim() && !dobLocked) userPayload.dateOfBirth = dateOfBirth.trim();
      if (emergencyName.trim())  userPayload.emergencyContactName  = emergencyName.trim();
      if (emergencyPhone.trim()) userPayload.emergencyContactPhone = emergencyPhone.trim();
      await usersApi.updateProfile(userPayload);
      // Owner-only: persist business account changes if any
      if (biz && isOwner) {
        const bizUpdates: any = {};
        if (companyName.trim()   !== (biz.companyName    ?? '')) bizUpdates.companyName   = companyName.trim();
        if (!isValidRc(rcNumber)) { alertDialog('Check the RC number', RC_ERROR); return; }
        if (canonicalRc(rcNumber) !== (biz.rcNumber      ?? '')) bizUpdates.rcNumber      = canonicalRc(rcNumber);
        if (streetAddress.trim() !== (biz.streetAddress  ?? '')) bizUpdates.streetAddress = streetAddress.trim();
        if (city.trim()          !== (biz.city           ?? '')) bizUpdates.city          = city.trim();
        if (state.trim()         !== (biz.state          ?? '')) bizUpdates.state         = state.trim();
        if (Object.keys(bizUpdates).length > 0) {
          await businessApi.account.update(bizUpdates);
        }
      }
      try { await refresh?.(); } catch { /* best-effort */ }
      alertDialog('Saved', 'Profile updated.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      alertDialog('Save failed', e?.message ?? 'Try again.');
    } finally { setSaving(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.surfaceSecond }]}>
          <Icon name="ArrowLeft" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Edit Business Details</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* The Save button sat UNDER the Android navigation bar: the
            scroll content had a flat 16pt bottom padding and no safe-area
            inset, so the last control was permanently half-covered
            (founder spotted it on device 2026-08-16). */}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 + kbH }]}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={(ev) => { scrollY.current = ev.nativeEvent.contentOffset.y; }}
        >

          {/* SEIRS ID: shown for support flows. Copy button optional here
              (business owners typically use the dashboard, not phone). */}
          {(user as any)?.accountId && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.textSecond }]}>SEIRS ID</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, letterSpacing: 1, marginTop: 2 }}>
                {(user as any).accountId}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textThird, marginTop: 4 }}>
                Use this when contacting support. Identifies your account without needing to share your email.
              </Text>
            </View>
          )}

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textSecond }]}>EMAIL (READ-ONLY)</Text>
            <Text style={[styles.email, { color: colors.textSecond }]}>{user?.email ?? '-'}</Text>
          </View>

          {/* Legal name: split for privacy and identity cross-check.
              Owner's legal name is separate from the company name below. */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textSecond }]}>FIRST NAME</Text>
            <TextInput
              onFocus={onFieldFocus}
              value={firstName} onChangeText={setFirstName}
              style={[styles.input, { borderColor: errors.firstName ? '#DC2626' : colors.border, color: colors.text }]}
              placeholder="Adebayo" placeholderTextColor={colors.textThird} />
            {errors.firstName && <Text style={{ fontSize: 12, color: '#DC2626' }}>{errors.firstName}</Text>}
            <Text style={{ fontSize: 12, color: colors.textThird }}>30-day change limit</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textSecond }]}>MIDDLE NAME (OPTIONAL)</Text>
            <TextInput
              onFocus={onFieldFocus}
              value={middleName} onChangeText={setMiddleName}
              style={[styles.input, { borderColor: errors.middleName ? '#DC2626' : colors.border, color: colors.text }]}
              placeholder="" placeholderTextColor={colors.textThird} />
            {errors.middleName && <Text style={{ fontSize: 12, color: '#DC2626' }}>{errors.middleName}</Text>}
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textSecond }]}>LAST NAME</Text>
            <TextInput
              onFocus={onFieldFocus}
              value={lastName} onChangeText={setLastName}
              style={[styles.input, { borderColor: errors.lastName ? '#DC2626' : colors.border, color: colors.text }]}
              placeholder="Ogunlana" placeholderTextColor={colors.textThird} />
            {errors.lastName && <Text style={{ fontSize: 12, color: '#DC2626' }}>{errors.lastName}</Text>}
            <Text style={{ fontSize: 12, color: colors.textThird }}>30-day change limit</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textSecond }]}>DATE OF BIRTH {dobLocked ? '(LOCKED)' : ''}</Text>
            <TextInput
              onFocus={onFieldFocus}
              value={dateOfBirth} onChangeText={setDateOfBirth} editable={!dobLocked}
              keyboardType="numbers-and-punctuation"
              style={[styles.input, { borderColor: colors.border, color: colors.text, opacity: dobLocked ? 0.6 : 1 }]}
              placeholder="1985-04-22" placeholderTextColor={colors.textThird} />
            <Text style={{ fontSize: 12, color: colors.textThird }}>
              {dobLocked ? 'Contact support to correct a typo.' : 'Locked once you save. Format: YYYY-MM-DD'}
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textSecond }]}>PHONE</Text>
            <TextInput
              onFocus={onFieldFocus}
              value={phone} onChangeText={setPhone} keyboardType="phone-pad"
              style={[styles.input, { borderColor: errors.phone ? '#DC2626' : colors.border, color: colors.text }]}
              placeholder="08012345678" placeholderTextColor={colors.textThird} />
            {errors.phone && <Text style={{ fontSize: 12, color: '#DC2626' }}>{errors.phone}</Text>}
            <Text style={{ fontSize: 12, color: colors.textThird }}>90-day change limit</Text>
          </View>

          {/* Emergency contact: escalation contact for the account. */}
          <View style={[styles.sectionHeader]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Emergency contact</Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.textThird, marginTop: -4 }}>
            Who should we call if there is a critical issue with your account (unauthorised access, urgent dispute)? Update any time.
          </Text>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textSecond }]}>CONTACT NAME</Text>
            <TextInput
              onFocus={onFieldFocus}
              value={emergencyName} onChangeText={setEmergencyName}
              style={[styles.input, { borderColor: errors.emergencyName ? '#DC2626' : colors.border, color: colors.text }]}
              placeholder="e.g. Chinyere Okafor" placeholderTextColor={colors.textThird} />
            {errors.emergencyName && <Text style={{ fontSize: 12, color: '#DC2626' }}>{errors.emergencyName}</Text>}
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textSecond }]}>CONTACT PHONE</Text>
            <TextInput
              onFocus={onFieldFocus}
              value={emergencyPhone} onChangeText={setEmergencyPhone} keyboardType="phone-pad"
              style={[styles.input, { borderColor: errors.emergencyPhone ? '#DC2626' : colors.border, color: colors.text }]}
              placeholder="08012345678" placeholderTextColor={colors.textThird} />
            {errors.emergencyPhone && <Text style={{ fontSize: 12, color: '#DC2626' }}>{errors.emergencyPhone}</Text>}
          </View>

          {bizLoading ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, alignItems: 'center' }]}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : biz ? (
            <>
              <View style={[styles.sectionHeader]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Business Account</Text>
                {myRoleLabel && (
                  <View style={[styles.roleChip, { backgroundColor: colors.accent + '18' }]}>
                    <Text style={[styles.roleChipText, { color: colors.accent }]}>{myRoleLabel}</Text>
                  </View>
                )}
              </View>

              {!isOwner && (
                <View style={styles.note}>
                  <Icon name="Lock" size={12} color={colors.textThird} />
                  <Text style={[styles.noteText, { color: colors.textSecond }]}>
                    Business fields are owner-only. Contact your account owner to update them.
                  </Text>
                </View>
              )}

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.textSecond }]}>COMPANY NAME</Text>
                <TextInput
              onFocus={onFieldFocus}
                  value={companyName} onChangeText={setCompanyName} editable={isOwner}
                  style={[styles.input, { borderColor: colors.border, color: colors.text, opacity: isOwner ? 1 : 0.6 }]}
                  placeholder="Acme Logistics Ltd" placeholderTextColor={colors.textThird} />
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.textSecond }]}>RC NUMBER</Text>
                <TextInput
              onFocus={onFieldFocus}
                  value={rcNumber} onChangeText={(v) => setRcNumber(normaliseRc(v))} editable={isOwner}
                  style={[styles.input, { borderColor: colors.border, color: colors.text, opacity: isOwner ? 1 : 0.6 }]}
                  placeholder="RC-1234567" placeholderTextColor={colors.textThird} />
                {rcNumber.length > 0 && !isValidRc(rcNumber)
                  ? <Text style={{ color: colors.error, fontSize: 12, marginTop: 6 }}>{RC_ERROR}</Text>
                  : null}
              </View>

              {/* Was a plain text box, so a business could save an address
                  that never geocodes, and this address is what a rider is
                  sent to (founder 2026-08-16). Same Nigeria-scoped
                  autocomplete the registration form uses, biased to the
                  state chosen below. */}
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <StreetAutocomplete
                  label="STREET ADDRESS"
                  value={streetAddress}
                  onChangeText={setStreetAddress}
                  state={state}
                  onFocus={(ev: any) => onFieldFocus(ev, 300)}
                  onSuggestionsShown={() => {
                    // Re-lift once the list actually exists, so it lands
                    // above the keyboard instead of behind it.
                    const f = focusedRef.current;
                    if (f && kbH > 0) ensureVisible(f.node ?? f, kbH, 300);
                  }}
                  onPlaceResolved={(info) => {
                    // Fill City and State from the address the owner
                    // actually picked, instead of leaving three fields to
                    // disagree with each other.
                    if (info.city)  setCity(info.city);
                    if (info.state) setState(info.state);
                  }}
                  placeholder="15 Adeola Odeku"
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, flex: 1 }]}>
                  <Text style={[styles.label, { color: colors.textSecond }]}>CITY</Text>
                  <TextInput
              onFocus={onFieldFocus}
                    value={city} onChangeText={setCity} editable={isOwner}
                    style={[styles.input, { borderColor: colors.border, color: colors.text, opacity: isOwner ? 1 : 0.6 }]}
                    placeholder="Lekki" placeholderTextColor={colors.textThird} />
                </View>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, flex: 1 }]}>
                  {/* Free text let a business save "Lagoss" and it is what
                      biases the street search below (founder 2026-08-16).
                      Same 36-states-plus-FCT picker the registration form
                      uses. */}
                  <StatePicker
                    label="STATE"
                    value={state}
                    onChange={setState}
                    placeholder="Select state"
                  />
                </View>
              </View>
            </>
          ) : null}

          <Pressable
            disabled={saving}
            onPress={handleSave}
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save changes</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function deriveFirst(name?: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  return parts[0] ?? '';
}
function deriveLast(name?: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

const styles = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn:    { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: 18, fontWeight: '700' },

  content:    { padding: 16, gap: 12 },

  card:       { borderRadius: 12, padding: 14, gap: 6, borderWidth: 1 },
  label:      { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  email:      { fontSize: 16 },
  input:      { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },

  note:       { flexDirection: 'row', gap: 6, alignItems: 'flex-start', padding: 10 },
  noteText:   { flex: 1, fontSize: 12, lineHeight: 16 },

  primaryBtn:     { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  sectionHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  sectionTitle:   { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  roleChip:       { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  roleChipText:   { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
