import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Camera, User, Phone, Mail, Save, Calendar, MapPin, LifeBuoy, Lock, Info,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { usersApi, uploadApi } from '@/services/api';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

// ─── Validation (must stay in sync with backend UpdateProfileDto) ───────────

const NAME_CHARS   = /^[\p{L}][\p{L} .'\-]*[\p{L}.]$/u;
const NAME_NO_SPAM = /^(?!.*\d{3,})(?!.*\s{2,})(?!.*(?:https?:|www\.|\.com|\.ng|\.co|@))/i;
const NG_PHONE     = /^(\+?234[789]\d{9}|0[789]\d{9}|[789]\d{9})$/;
const ISO_DATE     = /^\d{4}-\d{2}-\d{2}$/;

function validateName(v: string, min = 2, max = 40, label = 'This field'): string | null {
  const s = v.trim();
  if (s.length < min || s.length > max) return `${label} must be ${min}–${max} characters`;
  if (!NAME_CHARS.test(s))               return tx9('auto.editProfile.onlyLettersSpacesHyphensApostrophes', 'Only letters, spaces, hyphens, apostrophes, dots');
  if (!NAME_NO_SPAM.test(s))             return tx9('auto.editProfile.noPhoneNumbersUrlsOr', 'No phone numbers, URLs, or emails');
  return null;
}
function validatePhone(v: string): string | null {
  if (!v.trim()) return null;                          // optional in this form; server may require
  if (!NG_PHONE.test(v.trim())) return tx9('auto.editProfile.nigerianMobileOnly0234', 'Nigerian mobile only (0/234/+234 + 10 digits)');
  return null;
}
function validateDob(v: string): string | null {
  if (!v.trim()) return null;
  if (!ISO_DATE.test(v.trim())) return tx9('auto.editProfile.useYyyyMmDdFormat', 'Use YYYY-MM-DD format');
  const d = new Date(v.trim());
  if (Number.isNaN(d.getTime())) return tx9('auto.editProfile.notARealDate', 'Not a real date');
  const age = ageInYears(d);
  if (age < 13)  return tx9('auto.editProfile.mustBe13OrOlder', 'Must be 13 or older');
  if (age > 120) return tx9('auto.editProfile.pleaseEnterARealDate', 'Please enter a real date of birth');
  return null;
}
function ageInYears(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function EditProfileScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const { user, refresh } = useAuth() as any;
  const { t }  = useTranslation();

  // Split-name fields. If the user pre-dates the split, seed from `name`.
  const [firstName,  setFirstName]  = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName,   setLastName]   = useState('');

  const [dateOfBirth, setDateOfBirth] = useState('');   // YYYY-MM-DD
  const [phone,       setPhone]       = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');

  const [emergencyName,  setEmergencyName]  = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  const [homeStreet, setHomeStreet] = useState('');
  const [homeCity,   setHomeCity]   = useState('');
  const [homeState,  setHomeState]  = useState('');

  const [saving,    setSaving]    = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors,    setErrors]    = useState<Record<string, string | null>>({});

  const dobLocked = !!user?.dateOfBirth;

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? deriveFirst(user.name));
    setMiddleName(user.middleName ?? '');
    setLastName(user.lastName ?? deriveLast(user.name));
    setDateOfBirth(user.dateOfBirth ? String(user.dateOfBirth).slice(0, 10) : '');
    setPhone(user.phone ?? '');
    setProfilePhoto(user.profilePhoto ?? '');
    setEmergencyName(user.emergencyContactName ?? '');
    setEmergencyPhone(user.emergencyContactPhone ?? '');
    setHomeStreet(user.homeAddress?.street ?? '');
    setHomeCity(user.homeAddress?.city ?? '');
    setHomeState(user.homeAddress?.state ?? '');
  }, [user]);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { alertDialog(t('editProfile.permissionRequired')); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    if (r.canceled) return;
    setUploading(true);
    try {
      const uploaded = await uploadApi.file(r.assets[0].uri);
      setProfilePhoto(uploaded.url);
    } catch (e: any) {
      alertDialog(t('editProfile.uploadFailed'), e?.message ?? t('editProfile.tryAgain'));
    } finally { setUploading(false); }
  };

  const validate = (): boolean => {
    const e: Record<string, string | null> = {
      firstName:      validateName(firstName, 2, 40, 'First name'),
      middleName:     middleName.trim() ? validateName(middleName, 1, 40, 'Middle name') : null,
      lastName:       validateName(lastName, 2, 40, 'Last name'),
      dateOfBirth:    validateDob(dateOfBirth),
      phone:          validatePhone(phone),
      emergencyName:  emergencyName.trim() ? validateName(emergencyName, 2, 100, 'Emergency contact') : null,
      emergencyPhone: emergencyPhone.trim() ? validatePhone(emergencyPhone) : null,
    };
    setErrors(e);
    return Object.values(e).every(v => v === null);
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: any = {
        firstName:  firstName.trim(),
        lastName:   lastName.trim(),
        phone:      phone.trim(),
        profilePhoto,
      };
      if (middleName.trim())     payload.middleName            = middleName.trim();
      if (dateOfBirth.trim() && !dobLocked) payload.dateOfBirth = dateOfBirth.trim();
      if (emergencyName.trim())  payload.emergencyContactName  = emergencyName.trim();
      if (emergencyPhone.trim()) payload.emergencyContactPhone = emergencyPhone.trim();
      if (homeStreet.trim() || homeCity.trim() || homeState.trim()) {
        payload.homeAddress = {
          label:  tr('auto.register.home', 'Home'),
          street: homeStreet.trim(),
          city:   homeCity.trim(),
          state:  homeState.trim(),
          coords: user?.homeAddress?.coords ?? null,
        };
      }

      await usersApi.updateProfile(payload);
      try { await refresh?.(); } catch { /* refresh is best-effort */ }
      alertDialog('Saved', 'Your profile has been updated.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      alertDialog('Save failed', e?.message ?? 'Please try again.');
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t('editProfile.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Photo */}
          <View style={styles.photoWrap}>
            <Pressable onPress={pickPhoto} style={[styles.avatarRing, { borderColor: theme.primary }]}>
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: theme.primary + '20' }]}>
                  <User size={36} color={theme.primary} />
                </View>
              )}
              <View style={[styles.cameraBadge, { backgroundColor: theme.primary }]}>
                {uploading ? <ActivityIndicator color="#fff" size="small" /> : <Camera size={14} color="#fff" />}
              </View>
            </Pressable>
            <Text style={[styles.tapHint, { color: theme.textSecond }]}>{t('editProfile.changePhoto')}</Text>
          </View>

          {/* SEIRS ID: read-only identifier for support flows */}
          {user?.accountId && (
            <View style={[styles.idCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: theme.textSecond, letterSpacing: 0.5 }}>
                  {tr('auto.wallet.seirsId', 'SEIRS ID')}
                </Text>
                <Text style={{ fontSize: FontSize.md, fontWeight: FontWeight.bold, color: theme.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 2, letterSpacing: 1 }}>
                  {user.accountId}
                </Text>
                <Text style={{ fontSize: FontSize.xs, color: theme.textThird, marginTop: 4 }}>
                  {tr('auto.editProfile.giveThisToSupportInstead', 'Give this to support instead of your email or name. It identifies you uniquely and privately.')}
                </Text>
              </View>
            </View>
          )}

          {/* Email: read-only */}
          <Section title={tx('auto.editProfile.account', 'Account')}>
            <Field
              label={tx('auto.editProfile.email', 'Email')}
              value={user?.email ?? ''}
              editable={false}
              icon={<Mail size={15} color={theme.textThird} />}
              theme={theme}
            />
            <Field
              label={tx('auto.editProfile.phone', 'Phone')}
              value={phone}
              onChange={setPhone}
              keyboardType="phone-pad"
              icon={<Phone size={15} color={theme.textThird} />}
              theme={theme}
              error={errors.phone}
              hint={tr('auto.editProfile.90DayChangeLimit', '90-day change limit')}
            />
          </Section>

          {/* Legal name split for privacy */}
          <Section title={tx('auto.editProfile.legalName', 'Legal name')} subtitle={tx('auto.editProfile.shownOnYourIdDuring', 'Shown on your ID during verification. Only your first name is shown to drivers.')}>
            <Field
              label={tx('auto.editProfile.firstName', 'First name')}
              value={firstName}
              onChange={setFirstName}
              icon={<User size={15} color={theme.textThird} />}
              theme={theme}
              error={errors.firstName}
              hint={tr('auto.editProfile.30DayChangeLimit', '30-day change limit')}
            />
            <Field
              label={tx('auto.editProfile.middleNameOptional', 'Middle name (optional)')}
              value={middleName}
              onChange={setMiddleName}
              icon={<User size={15} color={theme.textThird} />}
              theme={theme}
              error={errors.middleName}
            />
            <Field
              label={tx('auto.editProfile.lastName', 'Last name')}
              value={lastName}
              onChange={setLastName}
              icon={<User size={15} color={theme.textThird} />}
              theme={theme}
              error={errors.lastName}
              hint={tr('auto.editProfile.30DayChangeLimit', '30-day change limit')}
            />
          </Section>

          {/* DOB */}
          <Section title={tx('auto.editProfile.dateOfBirth', 'Date of birth')} subtitle={dobLocked ? tx9('auto.editProfile.lockedOnceSetContactSupport', 'Locked once set. Contact support to correct a typo.') : tx9('auto.editProfile.usedForIdentityVerificationAnd', 'Used for identity verification and age-gated features. Locked once you save.')}>
            <Field
              label={tx('auto.editProfile.yyyyMmDd', 'YYYY-MM-DD')}
              value={dateOfBirth}
              onChange={setDateOfBirth}
              editable={!dobLocked}
              keyboardType="numbers-and-punctuation"
              placeholder="1995-08-14"
              icon={dobLocked
                ? <Lock size={15} color={theme.textThird} />
                : <Calendar size={15} color={theme.textThird} />}
              theme={theme}
              error={errors.dateOfBirth}
            />
          </Section>

          {/* Emergency contact */}
          <Section title={tx('auto.editProfile.emergencyContact', 'Emergency contact')} subtitle={tx('auto.editProfile.whoShouldWeCallIf', 'Who should we call if something goes wrong during a delivery? No limit on how often you can update this.')}>
            <Field
              label={tx('auto.editProfile.contactName', 'Contact name')}
              value={emergencyName}
              onChange={setEmergencyName}
              icon={<LifeBuoy size={15} color={theme.textThird} />}
              theme={theme}
              error={errors.emergencyName}
              placeholder={tx('auto.editProfile.eGAdaezeOkoro', 'e.g. Adaeze Okoro')}
            />
            <Field
              label={tx('auto.editProfile.contactPhone', 'Contact phone')}
              value={emergencyPhone}
              onChange={setEmergencyPhone}
              keyboardType="phone-pad"
              icon={<Phone size={15} color={theme.textThird} />}
              theme={theme}
              error={errors.emergencyPhone}
              placeholder="08012345678"
            />
          </Section>

          {/* Home address */}
          <Section title={tx('auto.editProfile.homeAddress', 'Home address')} subtitle={tx('auto.editProfile.defaultPickupForYourDeliveries', 'Default pickup for your deliveries. Tap \'Use my home\' in the send flow to skip typing.')}>
            <Field
              label={tx('auto.editProfile.street', 'Street')}
              value={homeStreet}
              onChange={setHomeStreet}
              icon={<MapPin size={15} color={theme.textThird} />}
              theme={theme}
              placeholder={tx('auto.editProfile.12AdeolaOdekuStreet', '12 Adeola Odeku Street')}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 2 }}>
                <Field label={tx('auto.editProfile.city', 'City')} value={homeCity} onChange={setHomeCity} theme={theme} placeholder={tx('auto.editProfile.lagos', 'Lagos')} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label={tx('auto.editProfile.state', 'State')} value={homeState} onChange={setHomeState} theme={theme} placeholder="LA" />
              </View>
            </View>
          </Section>

          <Pressable
            disabled={saving}
            onPress={handleSave}
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Save size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>{tx('auto.editProfile.saveChanges', 'Save changes')}</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.push('/(customer)/change-password')}
            style={[styles.primaryBtn, { backgroundColor: theme.surfaceSecond, marginTop: Spacing.sm }]}
          >
            <Lock size={16} color={theme.text} />
            <Text style={[styles.primaryBtnText, { color: theme.text }]}>{tx('auto.editProfile.changePassword', 'Change password')}</Text>
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: Spacing.md }}>
            <Info size={12} color={theme.textThird} style={{ marginTop: 3 }} />
            <Text style={{ flex: 1, fontSize: FontSize.xs, color: theme.textThird, lineHeight: 16 }}>
              {tr('auto.editProfile.someFieldsHaveChangeLimits', 'Some fields have change limits to prevent impersonation and abuse. Every change is logged for your safety. View your history under Profile then Privacy.')}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Small helpers ──────────────────────────────────────────────────────────

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

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10, marginTop: Spacing.sm }}>
      <View>
        <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#0F2B4C' }}>{title}</Text>
        {subtitle && <Text style={{ fontSize: FontSize.xs, color: '#6B7280', marginTop: 2, lineHeight: 16 }}>{subtitle}</Text>}
      </View>
      <View style={{ gap: 10 }}>
        {children}
      </View>
    </View>
  );
}

function Field({ label, value, onChange, editable = true, keyboardType, icon, theme, error, hint, placeholder }: any) {
  const bg = editable ? theme.surface : theme.surfaceSecond;
  const borderColor = error ? '#DC2626' : theme.border;
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: theme.textSecond, letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor, borderRadius: Radius.lg, paddingHorizontal: 12, backgroundColor: bg }}>
        {icon}
        <TextInput
          style={{ flex: 1, paddingVertical: 12, paddingLeft: icon ? 8 : 0, color: theme.text, fontSize: FontSize.base }}
          value={value}
          onChangeText={onChange}
          editable={editable}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={theme.textThird}
        />
      </View>
      {error && <Text style={{ fontSize: FontSize.xs, color: '#DC2626' }}>{error}</Text>}
      {!error && hint && <Text style={{ fontSize: FontSize.xs, color: theme.textThird }}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  photoWrap: { alignItems: 'center', gap: 8, marginVertical: Spacing.md },
  avatarRing:{ width: 100, height: 100, borderRadius: 50, borderWidth: 3, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  avatar:    { width: 92, height: 92, borderRadius: 46 },
  avatarFallback:{ width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' },
  cameraBadge:{ position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  tapHint:   { fontSize: FontSize.xs },
  idCard:    { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, gap: Spacing.md },
  primaryBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.lg, marginTop: Spacing.md },
  primaryBtnText:{ color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
