/**
 * Apply to be a Partner Store — KYC application form.
 *
 * Spec V8 hybrid-account redesign (2026-05-11). Reached from the business
 * drawer → "Apply to be a Partner Store" (only visible to Senders who
 * haven't been approved yet). On submit: uploads photos to R2 + posts the
 * application to /partner-store/apply. Admin reviews → approves → user's
 * `capabilities.canPartner` flips true → in-app context switcher appears.
 */
import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Image, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Icon } from '@/components/Icon';
import { uploadApi, partnerApi } from '@/services/api';
import { StatePicker } from '@/components/StatePicker';
import { StreetAutocomplete } from '@/components/StreetAutocomplete';
import { useColors, useTheme } from '@/context/ThemeContext';

interface ApplicationStatus {
  storeId:    string;
  storeName:  string;
  status:     string; // 'pending_review' | 'approved' | 'suspended' | 'rejected'
  reviewNote: string | null;
  reviewedAt: string | null;
  canPartner: boolean;
}

export default function ApplyPartnerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { isDark } = useTheme();

  const [existing, setExisting] = useState<ApplicationStatus | null>(null);
  const [loading,  setLoading]  = useState(true);
  // Structured address — mirrors the register form so dispatch + zone
  // surcharges can index by state without re-parsing free text. On submit
  // these are joined into the canonical `storeAddress` string the backend
  // expects (same contract as before).
  const [form, setForm] = useState({
    storeName: '', phone: '', maxCapacity: '50',
    state: '', city: '', streetAddress: '',
  });
  const [storefrontPhoto, setStorefrontPhoto] = useState<string | null>(null);
  const [cacReg,          setCacReg]          = useState<string | null>(null);
  const [ownerId,         setOwnerId]         = useState<string | null>(null);
  const [submitting,      setSubmitting]      = useState(false);

  useEffect(() => {
    partnerApi.myPartnerApplication()
      .then((res: ApplicationStatus | null) => setExisting(res))
      .catch(()                              => setExisting(null))
      .finally(() => setLoading(false));
  }, []);

  const pickImage = async (setter: (uri: string | null) => void) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to upload documents.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setter(result.assets[0].uri);
    }
  };

  const formValid =
    form.storeName.trim().length > 1 &&
    !!form.state &&
    form.city.trim().length > 1 &&
    form.streetAddress.trim().length > 3 &&
    form.phone.trim().length > 5 &&
    !!storefrontPhoto &&
    !!ownerId;

  const handleSubmit = async () => {
    if (!formValid) {
      Alert.alert('Incomplete', 'Please fill all required fields and upload required photos.');
      return;
    }
    setSubmitting(true);
    try {
      // Upload required photos in parallel
      const [storefront, owner, cac] = await Promise.all([
        uploadApi.file(storefrontPhoto!),
        uploadApi.file(ownerId!),
        cacReg ? uploadApi.file(cacReg) : Promise.resolve({ url: '' }),
      ]);
      // Combine structured parts into the canonical storeAddress string
      // the backend already stores. Same format as business register.
      const storeAddress = [
        form.streetAddress.trim(),
        form.city.trim(),
        `${form.state} State`,
        'Nigeria',
      ].filter(Boolean).join(', ');
      const res = await partnerApi.applyForPartnerStore({
        storeName:          form.storeName.trim(),
        storeAddress,
        phone:              form.phone.trim(),
        maxCapacity:        form.maxCapacity ? Number(form.maxCapacity) : 50,
        storefrontPhotoUrl: storefront.url,
        cacRegUrl:          cac.url || undefined,
        ownerIdUrl:         owner.url,
      });
      Alert.alert(
        'Application submitted',
        res.message,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Could not submit', e?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (existing && existing.status === 'pending_review') {
    return (
      <View style={[styles.container, {
        paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24,
        backgroundColor: colors.background,
      }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={20} color={colors.text} />
        </Pressable>
        <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.statusBadge, { backgroundColor: '#FFFBEB' }]}>
            <Icon name="Clock" size={20} color="#D97706" />
          </View>
          <Text style={[styles.statusTitle, { color: colors.text }]}>Application under review</Text>
          <Text style={[styles.statusBody, { color: colors.textSecond }]}>
            SEIRS is reviewing your KYC documents for <Text style={[styles.bold, { color: colors.text }]}>{existing.storeName}</Text>.
            Reviews typically complete within 24-48 hours. We&apos;ll send an email when you&apos;re approved.
          </Text>
        </View>
      </View>
    );
  }

  if (existing && existing.status === 'approved') {
    return (
      <View style={[styles.container, {
        paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24,
        backgroundColor: colors.background,
      }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={20} color={colors.text} />
        </Pressable>
        <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.statusBadge, { backgroundColor: '#ECFDF5' }]}>
            <Icon name="CheckCircle2" size={20} color="#10B981" />
          </View>
          <Text style={[styles.statusTitle, { color: colors.text }]}>You&apos;re approved!</Text>
          <Text style={[styles.statusBody, { color: colors.textSecond }]}>
            <Text style={[styles.bold, { color: colors.text }]}>{existing.storeName}</Text> can now accept SEIRS drop-offs.
            Use the mode switcher at the top of the app to toggle between sending and partner modes.
          </Text>
        </View>
      </View>
    );
  }

  // Rejected, suspended, or no application yet — show the form.
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.form, {
          paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24,
          backgroundColor: colors.background,
        }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={20} color={colors.text} />
        </Pressable>

        <Text style={[styles.heading, { color: colors.text }]}>Apply to be a Partner Store</Text>
        <Text style={[styles.sub, { color: colors.textSecond }]}>
          Operate a SEIRS collection point. Earn ₦500 per package, weekly payouts.
          We&apos;ll review your KYC docs within 24-48 hours.
        </Text>

        {existing?.status === 'rejected' && existing.reviewNote && (
          <View style={[styles.errorBox, {
            backgroundColor: isDark ? '#3F1F1F' : '#FEF2F2',
            borderColor:     isDark ? '#7F1D1D' : '#FECACA',
          }]}>
            <Icon name="AlertCircle" size={16} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>Previous application rejected</Text>
              <Text style={styles.errorText}>{existing.reviewNote}</Text>
            </View>
          </View>
        )}

        <Text style={[styles.label, { color: colors.textSecond }]}>Store Name</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={form.storeName}
            onChangeText={(v) => setForm({ ...form, storeName: v })}
            placeholder="Mama Ngozi Kiosk"
            placeholderTextColor={colors.textThird}
          />
        </View>

        {/* Structured address (state + city + street autocomplete) */}
        <StatePicker
          label="State"
          value={form.state}
          onChange={(s) => setForm({ ...form, state: s })}
        />
        <Text style={[styles.label, { color: colors.textSecond }]}>City / LGA</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={form.city}
            onChangeText={(v) => setForm({ ...form, city: v })}
            placeholder="e.g. Ikeja, Surulere, Lekki, Ikoyi"
            placeholderTextColor={colors.textThird}
          />
        </View>
        <View style={{ marginBottom: 14 }}>
          <StreetAutocomplete
            label="Street Address & Landmark"
            value={form.streetAddress}
            onChangeText={(v) => setForm({ ...form, streetAddress: v })}
            state={form.state}
            placeholder="Start typing a street or landmark…"
          />
        </View>

        <Text style={[styles.label, { color: colors.textSecond }]}>Phone Number</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={form.phone}
            onChangeText={(v) => setForm({ ...form, phone: v })}
            placeholder="08012345678"
            placeholderTextColor={colors.textThird}
            keyboardType="phone-pad"
          />
        </View>

        <Text style={[styles.label, { color: colors.textSecond }]}>Max Package Capacity</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={form.maxCapacity}
            onChangeText={(v) => setForm({ ...form, maxCapacity: v })}
            placeholder="50"
            placeholderTextColor={colors.textThird}
            keyboardType="numeric"
          />
        </View>

        <Text style={[styles.section, { color: colors.text }]}>KYC Documents</Text>

        <PhotoSlot
          label="Storefront photo (required)"
          uri={storefrontPhoto}
          onPick={() => pickImage(setStorefrontPhoto)}
          hint="Clear photo of your shop entrance from outside"
        />
        <PhotoSlot
          label="Owner ID (required)"
          uri={ownerId}
          onPick={() => pickImage(setOwnerId)}
          hint="National ID, driver's licence, or international passport"
        />
        <PhotoSlot
          label="CAC registration (optional)"
          uri={cacReg}
          onPick={() => pickImage(setCacReg)}
          hint="Speeds up review if you have a registered business"
        />

        <Pressable
          style={[
            styles.btn,
            { backgroundColor: colors.primary },
            (!formValid || submitting) && styles.btnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!formValid || submitting}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <>
                <Text style={styles.btnText}>Submit Application</Text>
                <Icon name="ArrowRight" size={18} color="#fff" />
              </>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PhotoSlot({ label, uri, onPick, hint }: {
  label: string; uri: string | null; onPick: () => void; hint: string;
}) {
  const colors = useColors();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.label, { color: colors.textSecond }]}>{label}</Text>
      <Pressable style={[styles.photoSlot, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={onPick}>
        {uri ? (
          <Image source={{ uri }} style={styles.photoPreview} />
        ) : (
          <View style={styles.photoEmpty}>
            <Icon name="Camera" size={28} color={colors.textThird} />
            <Text style={[styles.photoEmptyText, { color: colors.textSecond }]}>Tap to upload</Text>
          </View>
        )}
      </Pressable>
      <Text style={[styles.hint, { color: colors.textThird }]}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  form:      { paddingHorizontal: 24 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16, marginLeft: -8 },
  heading:   { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  sub:       { fontSize: 14, marginBottom: 24, lineHeight: 20 },
  section:   { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 12 },
  label:     { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  inputWrap: {
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, marginBottom: 14,
  },
  input:     { fontSize: 15 },
  hint:      { fontSize: 11, marginTop: 4, marginLeft: 4 },
  photoSlot: { height: 140, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', overflow: 'hidden' },
  photoEmpty:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoEmptyText: { fontSize: 13, fontWeight: '500' },
  photoPreview:   { width: '100%', height: '100%' },
  errorBox: {
    flexDirection: 'row', gap: 10, borderWidth: 1,
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorTitle: { color: '#991B1B', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  errorText:  { color: '#DC2626', fontSize: 12 },
  btn: {
    borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16,
  },
  btnDisabled: { opacity: 0.4 },
  btnText:     { color: '#fff', fontWeight: '700', fontSize: 16 },
  statusCard:  {
    borderRadius: 16, padding: 24, alignItems: 'center',
    borderWidth: 1, marginTop: 40,
  },
  statusBadge: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  statusTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  statusBody:  { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  bold:        { fontWeight: '700' },
});
