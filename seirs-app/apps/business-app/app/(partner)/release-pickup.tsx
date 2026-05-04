import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, Vibration,
  TextInput, ScrollView, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { partnerApi, identityApi, uploadApi } from '@/services/api';

// Spec V8 §3 / §4.8 — partner staff releases a package to the recipient
// after identity verification. Two methods supported per Spec V8 §1.17:
//   - PHYSICAL_ID + email OTP (primary path for recipients with ID)
//   - SEIRS_ID + typed-name signature (backup for recipients without ID)
// Lifecycle: SCAN → CHOOSE METHOD → VERIFY → CAPTURE PHOTO → SUBMIT.

type Step   = 'scan' | 'method' | 'verify';
type Method = 'physical_id' | 'seirs_id';

interface Dropoff {
  id:             string;
  dropCode:       string;
  recipientName:  string;
  recipientPhone: string;
  recipientUserId: string | null;
  status:         string;
  weightKg:       number;
  declaredValueNgn: number;
}

const ID_TYPES = [
  { key: 'national_id',     label: 'National ID' },
  { key: 'drivers_license', label: 'Driver\'s Licence' },
  { key: 'voter_card',      label: 'Voter Card' },
  { key: 'nin_slip',        label: 'NIN Slip' },
  { key: 'passport',        label: 'International Passport' },
];

export default function ReleasePickupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  const [step,            setStep]            = useState<Step>('scan');
  const [scanning,        setScanning]        = useState(true);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [dropoff,         setDropoff]         = useState<Dropoff | null>(null);
  const [manualCode,      setManualCode]      = useState('');
  const [method,          setMethod]          = useState<Method>('physical_id');

  // Physical ID fields
  const [idType,          setIdType]          = useState<string>('national_id');
  const [idNumber,        setIdNumber]        = useState('');
  const [otp,             setOtp]             = useState('');
  const [otpSent,         setOtpSent]         = useState(false);
  const [otpExpiryMin,    setOtpExpiryMin]    = useState(10);

  // SEIRS ID fields
  const [seirsCode,       setSeirsCode]       = useState('');
  const [expectedName,    setExpectedName]    = useState('');
  const [typedName,       setTypedName]       = useState('');

  // Collection photo
  const [photoUri,        setPhotoUri]        = useState('');

  const lastScan = useRef<string | null>(null);
  const cooldown = useRef(false);

  const lookupCode = async (code: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await partnerApi.storeDropoffByCode(code);
      if (!['at_dropoff_store', 'awaiting_collection'].includes(res.status)) {
        setError(`This package is not ready for release (status: ${res.status}).`);
        setScanning(true);
        return;
      }
      setDropoff(res);
      setStep('method');
    } catch (e: any) {
      setError(e.message ?? 'Drop-off not found.');
      setScanning(true);
    } finally {
      setLoading(false);
      cooldown.current = false;
    }
  };

  const handleBarcode = async ({ data }: { data: string }) => {
    if (!scanning || loading || cooldown.current || data === lastScan.current) return;
    cooldown.current = true;
    lastScan.current = data;
    Vibration.vibrate(80);
    setScanning(false);
    await lookupCode(data);
  };

  // ── Physical ID flow ─────────────────────────────────────────────────────

  const requestOtp = async () => {
    if (!dropoff?.recipientUserId) {
      Alert.alert(
        'Cannot send OTP',
        'This recipient has no SEIRS account. Use the SEIRS-ID path with their typed signature instead.',
      );
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await identityApi.issueHandoffOtp(dropoff.id, dropoff.recipientUserId);
      setOtpSent(true);
      setOtpExpiryMin(res.expiresInMinutes);
      Alert.alert(
        'OTP sent',
        `A 6-digit code has been emailed to ${dropoff.recipientName}. It expires in ${res.expiresInMinutes} minutes.`,
      );
    } catch (e: any) {
      setError(e.message ?? 'Could not send OTP — try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  // ── SEIRS ID flow ────────────────────────────────────────────────────────

  const lookupSeirsId = async () => {
    if (!seirsCode.trim()) return;
    setLoading(true);
    setError('');
    try {
      const lookup = await identityApi.lookupBySeirsId(seirsCode.trim());
      setExpectedName(lookup.name);
    } catch (e: any) {
      setError(e.message ?? 'SEIRS ID not found.');
      setExpectedName('');
    } finally {
      setLoading(false);
    }
  };

  // ── Photo capture ────────────────────────────────────────────────────────

  const pickPhoto = async () => {
    Alert.alert('Collection photo', 'Capture a photo of the recipient with the package.', [
      { text: 'Camera', onPress: async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Camera access required'); return; }
        const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
        if (!r.canceled) setPhotoUri(r.assets[0].uri);
      }},
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Submit ───────────────────────────────────────────────────────────────

  const submit = async () => {
    if (!dropoff) return;
    if (!photoUri) { Alert.alert('Photo required', 'Take a collection photo before releasing the package.'); return; }

    if (method === 'physical_id') {
      if (!idType || !idNumber.trim() || !otp.trim()) {
        Alert.alert('Missing fields', 'ID type, ID number, and the OTP from the recipient are all required.');
        return;
      }
    } else {
      if (!seirsCode.trim() || !typedName.trim()) {
        Alert.alert('Missing fields', 'SEIRS ID code and typed full name are both required.');
        return;
      }
    }

    setLoading(true);
    setError('');
    try {
      const photoUploaded = await uploadApi.uploadFile(photoUri, 'partner-release');

      await partnerApi.storeRelease({
        code:               dropoff.dropCode,
        method,
        collectedPhotoUrl:  photoUploaded.url,
        ...(method === 'physical_id'
          ? { idType, idNumber: idNumber.trim(), otp: otp.trim() }
          : { seirsCode: seirsCode.trim().toUpperCase(), typedName: typedName.trim() }),
      });

      Alert.alert(
        'Released',
        `Package handed over to ${dropoff.recipientName}. Audit trail recorded.`,
        [
          { text: 'Release another', onPress: reset },
          { text: 'Done', onPress: () => router.back() },
        ],
      );
    } catch (e: any) {
      setError(e.message ?? 'Verification failed. Check the entered details and try again.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep('scan');
    setDropoff(null);
    setError('');
    setManualCode('');
    setMethod('physical_id');
    setIdType('national_id');
    setIdNumber('');
    setOtp('');
    setOtpSent(false);
    setSeirsCode('');
    setExpectedName('');
    setTypedName('');
    setPhotoUri('');
    setScanning(true);
    lastScan.current = null;
    cooldown.current = false;
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (!permission) return <View style={styles.centered}><ActivityIndicator color="#3A7BD5" /></View>;
  if (!permission.granted && step === 'scan') {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Icon name="Camera" size={48} color="#D1D5DB" />
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Pressable style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Grant Camera Permission</Text>
        </Pressable>
        <Pressable onPress={() => setScanning(false)}>
          <Text style={styles.linkText}>Use manual code entry instead</Text>
        </Pressable>
      </View>
    );
  }

  // SCAN step
  if (step === 'scan') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {scanning && (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarcode}
          />
        )}
        <View style={[styles.overlay, { paddingTop: insets.top + 12 }]}>
          <Pressable style={styles.closeBtn} onPress={() => router.back()}>
            <Icon name="X" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.overlayTitle}>Release Package</Text>
        </View>

        {scanning && !loading && (
          <View style={styles.finderWrap}>
            <View style={styles.finder}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <Text style={styles.finderHint}>Scan the package label</Text>
            <Pressable onPress={() => setScanning(false)} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Enter code manually</Text>
            </Pressable>
          </View>
        )}

        {!scanning && (
          <View style={[styles.manualSheet, { paddingBottom: insets.bottom + 24 }]}>
            <Text style={styles.sheetTitle}>Enter package code</Text>
            <TextInput
              autoCapitalize="characters"
              autoFocus
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="SDR-A7K2P9X3"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
            />
            {error !== '' && <Text style={styles.errorText}>{error}</Text>}
            <View style={styles.row}>
              <Pressable style={styles.cancelBtn} onPress={() => { setScanning(true); setError(''); }}>
                <Text style={styles.cancelBtnText}>Back to scan</Text>
              </Pressable>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => lookupCode(manualCode.trim().toUpperCase())}
                disabled={loading || !manualCode.trim()}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Look up</Text>}
              </Pressable>
            </View>
          </View>
        )}

        {loading && scanning && (
          <View style={styles.finderWrap}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.finderHint}>Looking up…</Text>
          </View>
        )}
      </View>
    );
  }

  // METHOD step — choose verification path
  if (step === 'method' && dropoff) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#F5F5F0' }} contentContainerStyle={[styles.formContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.formHeader}>
          <Pressable onPress={reset} style={styles.backBtn}>
            <Icon name="ArrowLeft" size={20} color="#0F2B4C" />
          </Pressable>
          <Text style={styles.formTitle}>Verify Recipient</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>RELEASING TO</Text>
          <Text style={styles.cardValue}>{dropoff.recipientName}</Text>
          <Text style={styles.cardSub}>{dropoff.recipientPhone}</Text>
          <View style={styles.divider} />
          <Text style={styles.cardLabel}>PACKAGE</Text>
          <Text style={styles.cardSubtle}>{dropoff.weightKg} kg</Text>
          <Text style={styles.codeChip}>{dropoff.dropCode}</Text>
          {dropoff.declaredValueNgn >= 50000 && (
            <View style={styles.warnBadge}>
              <Icon name="AlertCircle" size={14} color="#92400E" />
              <Text style={styles.warnText}>High-value package — ID photo required at handoff</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Verification method</Text>

          <Pressable
            style={[styles.methodCard, method === 'physical_id' && styles.methodCardActive]}
            onPress={() => setMethod('physical_id')}
          >
            <View style={styles.radioOuter}>
              {method === 'physical_id' && <View style={styles.radioInner} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.methodTitle}>Physical ID + Email OTP</Text>
              <Text style={styles.methodSub}>National ID, driver&apos;s licence, voter card, NIN slip, or passport</Text>
            </View>
          </Pressable>

          <Pressable
            style={[styles.methodCard, method === 'seirs_id' && styles.methodCardActive]}
            onPress={() => setMethod('seirs_id')}
          >
            <View style={styles.radioOuter}>
              {method === 'seirs_id' && <View style={styles.radioInner} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.methodTitle}>SEIRS Verified ID + Typed Signature</Text>
              <Text style={styles.methodSub}>Recipient shows app QR code (CUST-XXXX), speaks their name, you type to verify</Text>
            </View>
          </Pressable>
        </View>

        <Pressable style={styles.primaryBtnLarge} onPress={() => setStep('verify')}>
          <Text style={styles.primaryBtnText}>Continue</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // VERIFY step — method-specific fields + photo + submit
  if (step === 'verify' && dropoff) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#F5F5F0' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.formContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.formHeader}>
            <Pressable onPress={() => setStep('method')} style={styles.backBtn}>
              <Icon name="ArrowLeft" size={20} color="#0F2B4C" />
            </Pressable>
            <Text style={styles.formTitle}>Confirm Identity</Text>
            <View style={{ width: 32 }} />
          </View>

          {method === 'physical_id' ? (
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>ID Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }} contentContainerStyle={{ gap: 8 }}>
                {ID_TYPES.map(t => (
                  <Pressable
                    key={t.key}
                    onPress={() => setIdType(t.key)}
                    style={[styles.chipBtn, idType === t.key && styles.chipBtnActive]}
                  >
                    <Text style={[styles.chipText, idType === t.key && styles.chipTextActive]}>{t.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.fieldLabel}>ID Number</Text>
              <TextInput
                value={idNumber}
                onChangeText={setIdNumber}
                placeholder="Enter ID number shown on document"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                style={styles.input}
              />
              <Text style={styles.helperText}>Only the last 4 digits are stored for audit.</Text>

              <View style={styles.divider} />

              <Text style={styles.fieldLabel}>Email OTP</Text>
              {!otpSent ? (
                <Pressable style={styles.secondaryBtn} onPress={requestOtp} disabled={loading}>
                  {loading
                    ? <ActivityIndicator color="#3A7BD5" />
                    : <Text style={styles.secondaryBtnText}>Send 6-digit OTP to recipient&apos;s email</Text>
                  }
                </Pressable>
              ) : (
                <>
                  <Text style={styles.helperText}>Code emailed — expires in {otpExpiryMin} minutes.</Text>
                  <TextInput
                    keyboardType="number-pad"
                    value={otp}
                    onChangeText={setOtp}
                    placeholder="123456"
                    placeholderTextColor="#9CA3AF"
                    maxLength={6}
                    style={[styles.input, { fontSize: 24, textAlign: 'center', letterSpacing: 6, fontWeight: '700' }]}
                  />
                  <Pressable onPress={requestOtp}>
                    <Text style={styles.linkText}>Resend OTP</Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Recipient&apos;s SEIRS ID</Text>
              <TextInput
                value={seirsCode}
                onChangeText={setSeirsCode}
                onBlur={lookupSeirsId}
                placeholder="CUST-A7K2P9"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                style={styles.input}
              />
              <Text style={styles.helperText}>Scan their app QR or have them read the code aloud.</Text>

              {expectedName && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.cardLabel}>EXPECTED NAME ON FILE</Text>
                  <Text style={styles.cardValue}>{expectedName}</Text>
                  <Text style={styles.helperText}>Ask the recipient to speak their full name. Type EXACTLY what they say below.</Text>

                  <Text style={styles.fieldLabel}>Recipient&apos;s typed name (signature)</Text>
                  <TextInput
                    value={typedName}
                    onChangeText={setTypedName}
                    placeholder="As they speak it"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="words"
                    style={styles.input}
                  />
                </>
              )}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Collection photo</Text>
            {photoUri ? (
              <View style={{ gap: 12 }}>
                <Image source={{ uri: photoUri }} style={styles.preview} />
                <Pressable onPress={pickPhoto} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Retake photo</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={pickPhoto} style={styles.photoBox}>
                <Icon name="Camera" size={28} color="#3A7BD5" />
                <Text style={styles.photoHint}>Photo of recipient with package (with ID held up if high-value)</Text>
              </Pressable>
            )}
          </View>

          {error !== '' && <Text style={styles.errorText}>{error}</Text>}

          <Pressable style={styles.primaryBtnLarge} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Release package</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return null;
}

const CORNER_SIZE = 24;
const CORNER_THICK = 3;

const styles = StyleSheet.create({
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#F5F5F0', gap: 16 },
  permTitle:   { fontSize: 18, fontWeight: '700', color: '#0F2B4C', textAlign: 'center' },
  linkText:    { fontSize: 14, color: '#3A7BD5', fontWeight: '600', textAlign: 'center', marginTop: 8 },

  overlay:     { position: 'absolute', top: 0, left: 0, right: 0, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 10 },
  closeBtn:    { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  overlayTitle:{ fontSize: 16, fontWeight: '700', color: '#fff' },

  finderWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  finder:      { width: 220, height: 220, position: 'relative' },
  corner:      { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: '#fff' },
  cornerTL:    { top: 0, left: 0, borderTopWidth: CORNER_THICK, borderLeftWidth: CORNER_THICK },
  cornerTR:    { top: 0, right: 0, borderTopWidth: CORNER_THICK, borderRightWidth: CORNER_THICK },
  cornerBL:    { bottom: 0, left: 0, borderBottomWidth: CORNER_THICK, borderLeftWidth: CORNER_THICK },
  cornerBR:    { bottom: 0, right: 0, borderBottomWidth: CORNER_THICK, borderRightWidth: CORNER_THICK },
  finderHint:  { color: '#fff', fontSize: 14, opacity: 0.85, textAlign: 'center', paddingHorizontal: 24 },

  manualSheet:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 },
  sheetTitle:     { fontSize: 18, fontWeight: '700', color: '#0F2B4C' },

  formContent: { padding: 16, gap: 16 },
  formHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  backBtn:     { width: 32, height: 32, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  formTitle:   { fontSize: 18, fontWeight: '700', color: '#0F2B4C' },

  card:        { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  cardLabel:   { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.8 },
  cardValue:   { fontSize: 18, fontWeight: '700', color: '#0F2B4C' },
  cardSub:     { fontSize: 14, color: '#6B7280' },
  cardSubtle:  { fontSize: 14, color: '#374151', lineHeight: 20 },
  codeChip:    { fontSize: 16, fontWeight: '700', color: '#3A7BD5', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: 1 },
  divider:     { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
  warnBadge:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF9C3', borderColor: '#FDE68A', borderWidth: 1, padding: 8, borderRadius: 8, marginTop: 8 },
  warnText:    { color: '#92400E', fontSize: 12, fontWeight: '600', flex: 1 },

  fieldLabel:  { fontSize: 13, fontWeight: '700', color: '#0F2B4C' },
  helperText:  { fontSize: 12, color: '#6B7280', lineHeight: 17 },
  input:       { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#0F2B4C', backgroundColor: '#F9FAFB' },

  methodCard:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', marginTop: 8 },
  methodCardActive: { borderColor: '#3A7BD5', backgroundColor: '#3A7BD508' },
  methodTitle:      { fontSize: 14, fontWeight: '700', color: '#0F2B4C', marginBottom: 2 },
  methodSub:        { fontSize: 12, color: '#6B7280', lineHeight: 17 },
  radioOuter:       { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#3A7BD5', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioInner:       { width: 10, height: 10, borderRadius: 5, backgroundColor: '#3A7BD5' },

  chipBtn:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  chipBtnActive: { borderColor: '#3A7BD5', backgroundColor: '#3A7BD5' },
  chipText:      { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTextActive:{ color: '#fff' },

  photoBox:    { borderWidth: 2, borderColor: '#3A7BD5', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 32, alignItems: 'center', gap: 8, backgroundColor: '#3A7BD508' },
  photoHint:   { fontSize: 13, color: '#6B7280', textAlign: 'center', paddingHorizontal: 24 },
  preview:     { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#E5E7EB' },

  primaryBtn:      { backgroundColor: '#0F2B4C', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  primaryBtnLarge: { backgroundColor: '#0F2B4C', borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn:    { backgroundColor: '#3A7BD518', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText:{ color: '#3A7BD5', fontWeight: '600', fontSize: 14 },
  cancelBtn:       { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingVertical: 12, alignItems: 'center' },
  cancelBtnText:   { color: '#6B7280', fontWeight: '600', fontSize: 14 },
  row:             { flexDirection: 'row', gap: 12 },

  errorText:   { color: '#DC2626', fontSize: 13, textAlign: 'center' },
});
