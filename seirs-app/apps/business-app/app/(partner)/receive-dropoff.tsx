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
import { partnerApi, uploadApi } from '@/services/api';
import { useColors } from '@/context/ThemeContext';

// Spec V8 §3 / §4.7 — partner staff scans incoming sender drop-off,
// confirms details + photo + sender OTP, transitions to RECEIVED_AT_STORE.
// Three steps: SCAN → DETAILS → CONFIRM.

type Step = 'scan' | 'details' | 'confirm';

interface Dropoff {
  id:             string;
  dropCode:       string;
  backupCode:     string;
  recipientName:  string;
  recipientPhone: string;
  weightKg:       number;
  packageDescription?: string;
  declaredValueNgn?: number;
  status:         string;
  mode:           string;
}

export default function ReceiveDropoffScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();

  const [step,            setStep]            = useState<Step>('scan');
  const [scanning,        setScanning]        = useState(true);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [dropoff,         setDropoff]         = useState<Dropoff | null>(null);
  const [manualCode,      setManualCode]      = useState('');
  const [weightKg,        setWeightKg]        = useState('');
  const [photoUri,        setPhotoUri]        = useState('');
  const [photoUploadedUrl, setPhotoUploadedUrl] = useState('');
  const [senderOtp,       setSenderOtp]       = useState('');

  const lastScan = useRef<string | null>(null);
  const cooldown = useRef(false);

  // ── Scan ─────────────────────────────────────────────────────────────────

  const lookupCode = async (code: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await partnerApi.storeDropoffByCode(code);
      if (res.status !== 'scheduled') {
        setError(`This drop-off is already in status: ${res.status}. Cannot receive again.`);
        setScanning(true);
        return;
      }
      setDropoff(res);
      setWeightKg(String(res.weightKg ?? ''));
      setStep('details');
    } catch (e: any) {
      setError(e.message ?? 'Drop-off not found. Check the code.');
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

  const handleManualLookup = async () => {
    if (!manualCode.trim()) return;
    await lookupCode(manualCode.trim().toUpperCase());
  };

  // ── Details — weight + photo ─────────────────────────────────────────────

  const pickPhoto = async () => {
    Alert.alert('Package photo', 'How would you like to capture the package?', [
      { text: 'Camera', onPress: () => launchPicker('camera') },
      { text: 'Library', onPress: () => launchPicker('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const launchPicker = async (source: 'camera' | 'library') => {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Camera access required'); return; }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
      if (!r.canceled) setPhotoUri(r.assets[0].uri);
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Library access required'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.85 });
      if (!r.canceled) setPhotoUri(r.assets[0].uri);
    }
  };

  const submitDetails = async () => {
    if (!photoUri) { Alert.alert('Photo required', 'Take a picture of the package on your counter.'); return; }
    if (!weightKg || Number.isNaN(Number(weightKg))) { Alert.alert('Weight required', 'Enter the measured weight in kg.'); return; }
    setLoading(true);
    setError('');
    try {
      const uploaded = await uploadApi.uploadFile(photoUri, 'partner-receive');
      setPhotoUploadedUrl(uploaded.url);
      setStep('confirm');
    } catch (e: any) {
      setError(e.message ?? 'Photo upload failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Confirm — sender OTP, finalize ───────────────────────────────────────

  const submitFinal = async () => {
    if (!senderOtp.trim()) { Alert.alert('Sender OTP required', 'Ask sender to read the 6-digit code from their email.'); return; }
    if (!dropoff) return;
    setLoading(true);
    setError('');
    try {
      await partnerApi.storeReceive({
        code:             dropoff.dropCode,
        weightKg:         Number(weightKg),
        receivedPhotoUrl: photoUploadedUrl,
        senderOtp:        senderOtp.trim(),
      });
      Alert.alert(
        'Drop-off received',
        `Package from ${dropoff.recipientName} is now in your inventory and a driver will be dispatched within the SLA window.`,
        [
          { text: 'Receive another', onPress: reset },
          { text: 'Back to home', onPress: () => router.back() },
        ],
      );
    } catch (e: any) {
      setError(e.message ?? 'Could not complete handoff. Check the OTP and try again.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep('scan');
    setDropoff(null);
    setError('');
    setWeightKg('');
    setPhotoUri('');
    setPhotoUploadedUrl('');
    setSenderOtp('');
    setManualCode('');
    setScanning(true);
    lastScan.current = null;
    cooldown.current = false;
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (!permission) return <View style={[styles.centered, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;
  if (!permission.granted && step === 'scan') {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <Icon name="Camera" size={48} color={colors.textThird} />
        <Text style={[styles.permTitle, { color: colors.text }]}>Camera Access Required</Text>
        <Text style={[styles.permSub, { color: colors.textSecond }]}>Needed to scan drop-off QR codes. You can also enter the code manually below.</Text>
        <Pressable style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Grant Camera Permission</Text>
        </Pressable>
        <Pressable onPress={() => setScanning(false)}>
          <Text style={[styles.linkText, { color: colors.accent }]}>Use manual code entry instead</Text>
        </Pressable>
      </View>
    );
  }

  // Scan step
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
          <Text style={styles.overlayTitle}>Receive Drop-off</Text>
        </View>

        {scanning && !loading && (
          <View style={styles.finderWrap}>
            <View style={styles.finder}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <Text style={styles.finderHint}>Scan the SDR-XXXX code on the package</Text>
            <Pressable onPress={() => setScanning(false)} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Enter code manually</Text>
            </Pressable>
          </View>
        )}

        {!scanning && (
          <View style={[styles.manualSheet, { paddingBottom: insets.bottom + 24, backgroundColor: colors.surface }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Enter drop-off code</Text>
            <Text style={[styles.sheetSub, { color: colors.textSecond }]}>SDR-XXXXXXXX or 6-character backup</Text>
            <TextInput
              autoCapitalize="characters"
              autoFocus
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="SDR-A7K2P9X3"
              placeholderTextColor={colors.textThird}
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            />
            {error !== '' && <Text style={styles.errorText}>{error}</Text>}
            <View style={styles.row}>
              <Pressable style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => { setScanning(true); setError(''); }}>
                <Text style={[styles.cancelBtnText, { color: colors.textSecond }]}>Back to scan</Text>
              </Pressable>
              <Pressable style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleManualLookup} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Look up</Text>}
              </Pressable>
            </View>
          </View>
        )}

        {loading && scanning && (
          <View style={styles.finderWrap}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.finderHint}>Looking up drop-off…</Text>
          </View>
        )}
      </View>
    );
  }

  if (step === 'details' && dropoff) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.formContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.formHeader}>
            <Pressable onPress={reset} style={[styles.backBtn, { backgroundColor: colors.surface }]}>
              <Icon name="ArrowLeft" size={20} color={colors.text} />
            </Pressable>
            <Text style={[styles.formTitle, { color: colors.text }]}>Confirm Package</Text>
            <View style={{ width: 32 }} />
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.textSecond }]}>FOR DELIVERY TO</Text>
            <Text style={[styles.cardValue, { color: colors.text }]}>{dropoff.recipientName}</Text>
            <Text style={[styles.cardSub, { color: colors.textSecond }]}>{dropoff.recipientPhone}</Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.cardLabel, { color: colors.textSecond }]}>DROP-OFF CODE</Text>
            <Text style={[styles.codeChip, { color: colors.accent }]}>{dropoff.dropCode}</Text>
            {dropoff.packageDescription && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <Text style={[styles.cardLabel, { color: colors.textSecond }]}>DESCRIPTION</Text>
                <Text style={[styles.cardSubtle, { color: colors.textSecond }]}>{dropoff.packageDescription}</Text>
              </>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Measured weight (kg)</Text>
            <TextInput
              keyboardType="decimal-pad"
              value={weightKg}
              onChangeText={setWeightKg}
              placeholder={`Sender said ${dropoff.weightKg} kg`}
              placeholderTextColor={colors.textThird}
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            />
            <Text style={[styles.helperText, { color: colors.textSecond }]}>If the actual weight differs, the system will recalculate any weight-based fees.</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Package photo</Text>
            {photoUri ? (
              <View style={{ gap: 12 }}>
                <Image source={{ uri: photoUri }} style={[styles.preview, { backgroundColor: colors.surfaceSecond }]} />
                <Pressable onPress={pickPhoto} style={[styles.secondaryBtn, { backgroundColor: colors.accent + '18' }]}>
                  <Text style={[styles.secondaryBtnText, { color: colors.accent }]}>Retake photo</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={pickPhoto} style={[styles.photoBox, { borderColor: colors.accent, backgroundColor: colors.accent + '08' }]}>
                <Icon name="Camera" size={28} color={colors.accent} />
                <Text style={[styles.photoHint, { color: colors.textSecond }]}>Tap to take a photo of the package on your counter</Text>
              </Pressable>
            )}
          </View>

          {error !== '' && <Text style={styles.errorText}>{error}</Text>}

          <Pressable style={[styles.primaryBtnLarge, { backgroundColor: colors.primary }]} onPress={submitDetails} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Continue</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (step === 'confirm' && dropoff) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.formContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.formHeader}>
            <Pressable onPress={() => setStep('details')} style={[styles.backBtn, { backgroundColor: colors.surface }]}>
              <Icon name="ArrowLeft" size={20} color={colors.text} />
            </Pressable>
            <Text style={[styles.formTitle, { color: colors.text }]}>Verify Sender</Text>
            <View style={{ width: 32 }} />
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.textSecond }]}>SENDER VERIFICATION</Text>
            <Text style={[styles.cardSubtle, { color: colors.textSecond }]}>
              Ask the sender to read the 6-digit code from the verification email they received when they scheduled this drop-off.
            </Text>
            <TextInput
              keyboardType="number-pad"
              value={senderOtp}
              onChangeText={setSenderOtp}
              placeholder="123456"
              placeholderTextColor={colors.textThird}
              maxLength={6}
              style={[
                styles.input,
                { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, fontSize: 28, textAlign: 'center', letterSpacing: 8, fontWeight: '700' },
              ]}
            />
            <Text style={[styles.helperText, { color: colors.textSecond }]}>If they didn&apos;t receive an email, ask them to request a new code from their app.</Text>
          </View>

          {error !== '' && <Text style={styles.errorText}>{error}</Text>}

          <Pressable style={[styles.primaryBtnLarge, { backgroundColor: colors.primary }]} onPress={submitFinal} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Confirm receipt</Text>}
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
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  permTitle:   { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  permSub:     { fontSize: 14, textAlign: 'center' },
  linkText:    { fontSize: 14, fontWeight: '600' },

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

  manualSheet:    { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 },
  sheetTitle:     { fontSize: 18, fontWeight: '700' },
  sheetSub:       { fontSize: 13 },

  formContent: { padding: 16, gap: 16 },
  formHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  backBtn:     { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  formTitle:   { fontSize: 18, fontWeight: '700' },

  card:        { borderRadius: 16, padding: 16, gap: 8, borderWidth: 1 },
  cardLabel:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  cardValue:   { fontSize: 18, fontWeight: '700' },
  cardSub:     { fontSize: 14 },
  cardSubtle:  { fontSize: 14, lineHeight: 20 },
  codeChip:    { fontSize: 16, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: 1 },
  divider:     { height: 1, marginVertical: 8 },

  fieldLabel:  { fontSize: 13, fontWeight: '700' },
  helperText:  { fontSize: 12, lineHeight: 17 },

  input:       { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },

  photoBox:    { borderWidth: 2, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 32, alignItems: 'center', gap: 8 },
  photoHint:   { fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  preview:     { width: '100%', height: 200, borderRadius: 12 },

  primaryBtn:      { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  primaryBtnLarge: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn:    { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  secondaryBtnText:{ fontWeight: '600', fontSize: 14 },
  cancelBtn:       { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText:   { fontWeight: '600', fontSize: 14 },
  row:             { flexDirection: 'row', gap: 12 },

  errorText:   { color: '#DC2626', fontSize: 13, textAlign: 'center' },
});
