/**
 * Apply to be a Partner Store: KYC application form.
 *
 * Spec V8 hybrid-account redesign (2026-05-11). Reached from the business
 * drawer → "Apply to be a Partner Store" (only visible to Senders who
 * haven't been approved yet). On submit: uploads photos to R2 + posts the
 * application to /partner-store/apply. Admin reviews → approves → user's
 * `capabilities.canPartner` flips true → in-app context switcher appears.
 */
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Icon } from '@/components/Icon';
import { uploadApi, partnerApi } from '@/services/api';
import { StatePicker } from '@/components/StatePicker';
import { StreetAutocomplete } from '@/components/StreetAutocomplete';
import { useColors, useTheme } from '@/context/ThemeContext';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';

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
  // Structured address: mirrors the register form so dispatch + zone
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
  // Coordinates from the Places autocomplete pick. Optional: the
  // backend accepts submissions without them (existing behaviour) and
  // simply skips the /find-a-partner distance sort for such stores.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  /** Where the shopfront photo was actually taken. */
  const [storefrontWhere, setStorefrontWhere] =
    useState<{ lat: number; lng: number; accuracyM: number } | null>(null);

  useEffect(() => {
    partnerApi.myPartnerApplication()
      .then((res: ApplicationStatus | null) => setExisting(res))
      .catch(()                              => setExisting(null))
      .finally(() => setLoading(false));
  }, []);

  /** Where the phone is now. Null on refusal or a failed fix, never an error. */
  const currentPlace = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return null;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (!pos?.coords) return null;
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: Math.round(pos.coords.accuracy ?? 9999),
      };
    } catch { return null; }
  };

  /**
   * The shopfront is PHOTOGRAPHED AT THE SHOP, not chosen from the gallery.
   *
   * Every other photo on this form can come from the gallery, because a
   * CAC certificate photographed at a kitchen table is perfectly fine. The
   * shopfront cannot, and it is the one that decides where the shop is.
   *
   * The pin this application carries comes from an address picker, which
   * can be operated from a sofa in another city. Every distance check SEIRS
   * runs afterwards is measured against that pin, so the check looked
   * rigorous while its reference point was a guess. A reading taken at the
   * moment the shopfront is photographed is real evidence, and a reviewer
   * can promote it to be the pin.
   *
   * Reading the position at upload time is also why the gallery is refused:
   * a picture chosen from the gallery would be stamped with wherever the
   * phone happens to be now rather than where the picture was taken, which
   * turns the whole check into theatre.
   */
  const captureStorefront = async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      alertDialog(
        'Camera needed',
        'The shopfront photo has to be taken at the shop, so SEIRS needs permission to use the camera.',
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setStorefrontPhoto(result.assets[0].uri);
    setStorefrontWhere(await currentPlace());
  };

  const pickImage = async (setter: (uri: string | null) => void) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      alertDialog('Permission needed', 'Allow photo access to upload documents.');
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
      alertDialog('Incomplete', 'Please fill all required fields and upload required photos.');
      return;
    }
    setSubmitting(true);
    try {
      // Upload required photos in parallel, all into 'kyc' (B-10.5).
      // These three are the owner's government ID, the CAC certificate and
      // the storefront photo: folder is optional and was omitted, so they
      // landed unsegregated while UploadFolder defines 'kyc' for exactly
      // this. Every other upload in the app passes a folder.
      const [storefront, owner, cac] = await Promise.all([
        uploadApi.file(storefrontPhoto!, 'image/jpeg', 'kyc'),
        uploadApi.file(ownerId!, 'image/jpeg', 'kyc'),
        cacReg ? uploadApi.file(cacReg, 'image/jpeg', 'kyc') : Promise.resolve({ url: '' }),
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
        // Only send when the user picked from the autocomplete. Freehand
        // addresses stay coord-less and gracefully fall to the end of
        // the /find-a-partner list until an admin backfills.
        storeLat:           coords?.lat,
        storeLng:           coords?.lng,
        // The reading taken at the shopfront, when the phone could give one.
        storefrontLat:       storefrontWhere?.lat,
        storefrontLng:       storefrontWhere?.lng,
        storefrontAccuracyM: storefrontWhere?.accuracyM,
      });
      alertDialog(
        'Application submitted',
        res.message,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      alertDialog('Could not submit', e?.message ?? 'Please try again.');
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
          <Text style={[styles.statusTitle, { color: colors.text }]}>{tx('auto.applyPartner.applicationUnderReview', 'Application under review')}</Text>
          <Text style={[styles.statusBody, { color: colors.textSecond }]}>
            SEIRS is reviewing your KYC documents for <Text style={[styles.bold, { color: colors.text }]}>{existing.storeName}</Text>.
            Reviews take up to 3 business days. We&apos;ll send an email when you&apos;re approved.
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

  // Rejected, suspended, or no application yet: show the form.
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

        <Text style={[styles.heading, { color: colors.text }]}>{tx('auto.applyPartner.applyToBeAPartner', 'Apply to be a Partner Store')}</Text>
        <Text style={[styles.sub, { color: colors.textSecond }]}>
          Operate a SEIRS collection point. Earn a fee on every package, weekly payouts.
          We&apos;ll review your KYC docs within 3 business days.
        </Text>

        {existing?.status === 'rejected' && existing.reviewNote && (
          <View style={[styles.errorBox, {
            backgroundColor: isDark ? '#3F1F1F' : '#FEF2F2',
            borderColor:     isDark ? '#7F1D1D' : '#FECACA',
          }]}>
            <Icon name="AlertCircle" size={16} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>{tx('auto.applyPartner.previousApplicationRejected', 'Previous application rejected')}</Text>
              <Text style={styles.errorText}>{existing.reviewNote}</Text>
            </View>
          </View>
        )}

        <Text style={[styles.label, { color: colors.textSecond }]}>{tx('auto.applyPartner.storeName', 'Store Name')}</Text>
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
            onChangeText={(v) => {
              setForm({ ...form, streetAddress: v });
              // Freehand edit after a pick invalidates the previously-
              // resolved coordinates. Better to have no coords than
              // stale ones pointing at the wrong storefront.
              if (coords) setCoords(null);
            }}
            state={form.state}
            placeholder="Start typing a street or landmark…"
            onCoordsResolved={(lat, lng) => setCoords({ lat, lng })}
          />
        </View>

        <Text style={[styles.label, { color: colors.textSecond }]}>{tx('auto.applyPartner.phoneNumber', 'Phone Number')}</Text>
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

        <Text style={[styles.label, { color: colors.textSecond }]}>{tx('auto.applyPartner.maxPackageCapacity', 'Max Package Capacity')}</Text>
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

        <Text style={[styles.section, { color: colors.text }]}>{tx('auto.applyPartner.kycDocuments', 'KYC Documents')}</Text>

        {/* Camera only. See captureStorefront for why the gallery is
            refused here and allowed for everything below it. */}
        <PhotoSlot
          label="Storefront photo (required)"
          uri={storefrontPhoto}
          onPick={captureStorefront}
          hint={
            storefrontWhere
              ? `Taken at your shop, accurate to about ${storefrontWhere.accuracyM} m`
              : 'Stand outside your shop and take this one now. It is how we put your shop on the map.'
          }
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
                <Text style={styles.btnText}>{tx('auto.applyPartner.submitApplication', 'Submit Application')}</Text>
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
            <Text style={[styles.photoEmptyText, { color: colors.textSecond }]}>{tx('auto.applyPartner.tapToUpload', 'Tap to upload')}</Text>
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
  sub:       { fontSize: 15, marginBottom: 24, lineHeight: 20 },
  section:   { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 12 },
  label:     { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  inputWrap: {
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, marginBottom: 14,
  },
  input:     { fontSize: 15 },
  hint:      { fontSize: 12, marginTop: 4, marginLeft: 4 },
  photoSlot: { height: 140, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', overflow: 'hidden' },
  photoEmpty:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoEmptyText: { fontSize: 14, fontWeight: '500' },
  photoPreview:   { width: '100%', height: '100%' },
  errorBox: {
    flexDirection: 'row', gap: 10, borderWidth: 1,
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorTitle: { color: '#991B1B', fontSize: 14, fontWeight: '700', marginBottom: 2 },
  errorText:  { color: '#DC2626', fontSize: 13 },
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
  statusBody:  { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  bold:        { fontWeight: '700' },
});
