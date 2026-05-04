import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Camera, Mail, ScanLine, AlertCircle } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { identityApi, uploadApi } from '@/services/api';

// Spec V8 §1.17 — driver door-to-door handoff signature. Two methods:
// physical ID + email OTP, or SEIRS ID + typed-name signature. Mirrors
// the partner release-pickup flow but built into the driver app for
// the door-delivery scenario. Shares identityApi so the chain-of-
// custody record is identical.

type Method = 'physical_id' | 'seirs_id';

const ID_TYPES = [
  { key: 'national_id',     label: 'National ID' },
  { key: 'drivers_license', label: 'Driver Licence' },
  { key: 'voter_card',      label: 'Voter Card' },
  { key: 'nin_slip',        label: 'NIN Slip' },
  { key: 'passport',        label: 'Passport' },
];

export default function DriverSignatureScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const params = useLocalSearchParams<{ deliveryId: string; recipientUserId?: string }>();
  const deliveryId      = params.deliveryId ?? '';
  const recipientUserId = params.recipientUserId ?? '';

  const [method,        setMethod]        = useState<Method>('physical_id');
  const [idType,        setIdType]        = useState('national_id');
  const [idNumber,      setIdNumber]      = useState('');
  const [otp,           setOtp]           = useState('');
  const [otpSent,       setOtpSent]       = useState(false);
  const [seirsCode,     setSeirsCode]     = useState('');
  const [expectedName,  setExpectedName]  = useState('');
  const [typedName,     setTypedName]     = useState('');
  const [photoUri,      setPhotoUri]      = useState('');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');

  const requestOtp = async () => {
    if (!recipientUserId) {
      Alert.alert(
        'Cannot send OTP',
        'Recipient does not have a SEIRS account. Use the SEIRS-ID path with their typed signature instead.',
      );
      return;
    }
    setLoading(true);
    try {
      const res = await identityApi.issueHandoffOtp(deliveryId, recipientUserId);
      setOtpSent(true);
      Alert.alert('OTP sent', `Recipient will receive a 6-digit code by email. Expires in ${res.expiresInMinutes} minutes.`);
    } catch (e: any) {
      Alert.alert('Could not send OTP', e?.message ?? 'Try again.');
    } finally {
      setLoading(false);
    }
  };

  const lookupSeirsId = async () => {
    if (!seirsCode.trim()) return;
    setLoading(true);
    try {
      const lookup = await identityApi.lookupBySeirsId(seirsCode.trim());
      setExpectedName(lookup.name);
    } catch (e: any) {
      setError(e?.message ?? 'SEIRS ID not found');
      setExpectedName('');
    } finally {
      setLoading(false);
    }
  };

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera access required'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!r.canceled) setPhotoUri(r.assets[0].uri);
  };

  const submit = async () => {
    if (!photoUri) { Alert.alert('Photo required', 'Take a photo of the handoff before completing.'); return; }
    if (method === 'physical_id') {
      if (!idType || !idNumber.trim() || !otp.trim()) { Alert.alert('Missing fields', 'ID type, number, and OTP all required.'); return; }
    } else {
      if (!seirsCode.trim() || !typedName.trim()) { Alert.alert('Missing fields', 'SEIRS ID and typed name both required.'); return; }
    }

    setLoading(true);
    setError('');
    try {
      const photoUploaded = await uploadApi.uploadFile(photoUri, 'driver-handoff');
      // stage = DRIVER_TO_RECIPIENT — see HandoffStage enum in backend
      await identityApi.verifyHandoff(deliveryId, {
        stage:         'driver_to_recipient',
        method,
        proofPhotoUrl: photoUploaded.url,
        ...(method === 'physical_id'
          ? { idType, idNumber: idNumber.trim(), otp: otp.trim() }
          : { seirsCode: seirsCode.trim().toUpperCase(), typedName: typedName.trim() }),
      });
      Alert.alert(
        'Handoff complete',
        'Recipient verified — chain of custody record saved. You can mark the delivery as delivered.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      setError(e?.message ?? 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  if (!deliveryId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl }}>
        <Text style={{ color: theme.text, textAlign: 'center' }}>
          No delivery selected. Open a job first then tap &ldquo;Verify Recipient&rdquo;.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Verify Recipient</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Method picker */}
          <Text style={[styles.label, { color: theme.textSecond }]}>VERIFICATION METHOD</Text>
          <Pressable
            onPress={() => setMethod('physical_id')}
            style={[styles.methodCard, { backgroundColor: theme.surface, borderColor: method === 'physical_id' ? theme.primary : theme.border }]}
          >
            <View style={[styles.radioOuter, { borderColor: theme.primary }]}>
              {method === 'physical_id' && <View style={[styles.radioInner, { backgroundColor: theme.primary }]} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.methodTitle, { color: theme.text }]}>Physical ID + Email OTP</Text>
              <Text style={[styles.methodSub,   { color: theme.textSecond }]}>National ID, licence, voter card, NIN slip, or passport</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => setMethod('seirs_id')}
            style={[styles.methodCard, { backgroundColor: theme.surface, borderColor: method === 'seirs_id' ? theme.primary : theme.border }]}
          >
            <View style={[styles.radioOuter, { borderColor: theme.primary }]}>
              {method === 'seirs_id' && <View style={[styles.radioInner, { backgroundColor: theme.primary }]} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.methodTitle, { color: theme.text }]}>SEIRS ID + Typed Signature</Text>
              <Text style={[styles.methodSub,   { color: theme.textSecond }]}>Recipient shows app QR, speaks their name, you type to verify</Text>
            </View>
          </Pressable>

          {/* Method-specific fields */}
          {method === 'physical_id' ? (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>ID Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }} contentContainerStyle={{ gap: 6 }}>
                {ID_TYPES.map(t => (
                  <Pressable
                    key={t.key}
                    onPress={() => setIdType(t.key)}
                    style={[styles.chip, { borderColor: idType === t.key ? theme.primary : theme.border, backgroundColor: idType === t.key ? theme.primary : theme.surface }]}
                  >
                    <Text style={{ color: idType === t.key ? '#fff' : theme.textSecond, fontSize: FontSize.xs, fontWeight: FontWeight.semibold }}>{t.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 8 }]}>ID Number</Text>
              <TextInput
                value={idNumber}
                onChangeText={setIdNumber}
                placeholder="On document"
                placeholderTextColor={theme.textThird}
                autoCapitalize="characters"
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              />

              <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 8 }]}>Email OTP</Text>
              {!otpSent ? (
                <Pressable onPress={requestOtp} disabled={loading} style={[styles.secondaryBtn, { borderColor: theme.primary }]}>
                  <Mail size={14} color={theme.primary} />
                  <Text style={[styles.secondaryBtnText, { color: theme.primary }]}>
                    {loading ? 'Sending…' : 'Email recipient a 6-digit code'}
                  </Text>
                </Pressable>
              ) : (
                <>
                  <TextInput
                    value={otp}
                    onChangeText={setOtp}
                    placeholder="123456"
                    placeholderTextColor={theme.textThird}
                    keyboardType="number-pad"
                    maxLength={6}
                    style={[styles.input, { color: theme.text, borderColor: theme.border, fontSize: 22, textAlign: 'center', letterSpacing: 6, fontWeight: '700' as any }]}
                  />
                  <Pressable onPress={requestOtp}><Text style={{ color: theme.primary, fontSize: FontSize.xs, marginTop: 4 }}>Resend OTP</Text></Pressable>
                </>
              )}
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>Recipient&apos;s SEIRS ID</Text>
              <TextInput
                value={seirsCode}
                onChangeText={setSeirsCode}
                onBlur={lookupSeirsId}
                placeholder="CUST-A7K2P9"
                placeholderTextColor={theme.textThird}
                autoCapitalize="characters"
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              />

              {expectedName && (
                <>
                  <Text style={[styles.label, { color: theme.textSecond, marginTop: 8 }]}>EXPECTED NAME</Text>
                  <Text style={[styles.expected, { color: theme.text }]}>{expectedName}</Text>
                  <Text style={{ fontSize: FontSize.xs, color: theme.textSecond, marginTop: 4 }}>
                    Ask the recipient to speak their full name. Type EXACTLY what they say below.
                  </Text>
                  <TextInput
                    value={typedName}
                    onChangeText={setTypedName}
                    placeholder="As they speak it"
                    placeholderTextColor={theme.textThird}
                    autoCapitalize="words"
                    style={[styles.input, { color: theme.text, borderColor: theme.border, marginTop: 8 }]}
                  />
                </>
              )}
            </View>
          )}

          {/* Photo */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>Handoff photo</Text>
            {photoUri ? (
              <View style={{ gap: 8 }}>
                <Image source={{ uri: photoUri }} style={styles.preview} />
                <Pressable onPress={pickPhoto} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
                  <Camera size={14} color={theme.text} />
                  <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Retake</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={pickPhoto} style={[styles.photoBox, { borderColor: theme.primary }]}>
                <Camera size={28} color={theme.primary} />
                <Text style={{ fontSize: FontSize.xs, color: theme.textSecond, textAlign: 'center', paddingHorizontal: 16 }}>
                  Photo of recipient with package (with ID held up if high-value)
                </Text>
              </Pressable>
            )}
          </View>

          {error !== '' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, backgroundColor: '#FEE2E2', borderRadius: 8 }}>
              <AlertCircle size={14} color="#DC2626" />
              <Text style={{ color: '#991B1B', flex: 1, fontSize: FontSize.sm }}>{error}</Text>
            </View>
          )}

          <Pressable
            disabled={loading}
            onPress={submit}
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Complete handoff</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  label:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5 },

  methodCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: Radius.lg, borderWidth: 1.5 },
  methodTitle:{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, marginBottom: 2 },
  methodSub:  { fontSize: FontSize.xs, lineHeight: 17 },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioInner: { width: 10, height: 10, borderRadius: 5 },

  card:       { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 6, marginTop: 4 },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  chip:       { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },
  input:      { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 12, fontSize: FontSize.base },
  expected:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold },

  secondaryBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.lg, borderWidth: 1.5 },
  secondaryBtnText:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  photoBox: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 28, alignItems: 'center', gap: 6 },
  preview:  { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#E5E7EB' },

  primaryBtn:    { paddingVertical: 14, borderRadius: Radius.lg, alignItems: 'center', marginTop: Spacing.md },
  primaryBtnText:{ color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
