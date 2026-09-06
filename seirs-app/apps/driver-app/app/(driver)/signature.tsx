import { useState } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Camera, Mail, ScanLine, AlertCircle } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { identityApi, uploadApi } from '@/services/api';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

// Spec V8 §1.17: driver door-to-door handoff signature. Two methods:
// physical ID + email OTP, or SEIRS ID + typed-name signature. Mirrors
// the partner release-pickup flow but built into the driver app for
// the door-delivery scenario. Shares identityApi so the chain-of-
// custody record is identical.

type Method = 'physical_id' | 'seirs_id';

const ID_TYPES = () => [
  { key: 'national_id',     label: tr('auto.signature.nationalId', 'National ID') },
  { key: 'drivers_license', label: tr('auto.signature.driverLicence', 'Driver Licence') },
  { key: 'voter_card',      label: tr('auto.signature.voterCard', 'Voter Card') },
  { key: 'nin_slip',        label: tr('auto.signature.ninSlip', 'NIN Slip') },
  { key: 'passport',        label: tr('auto.signature.passport', 'Passport') },
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
    setLoading(true);
    try {
      // Without a recipient account the code emails the SENDER, who
      // forwards it to whoever is collecting (founder 2026-08-11:
      // neighbours and security collect packages all the time).
      const res = await identityApi.issueHandoffOtp(deliveryId, recipientUserId || undefined);
      setOtpSent(true);
      alertDialog(
        'Code sent',
        recipientUserId
          ? `Recipient will receive a 6-digit code by email. Expires in ${res.expiresInMinutes} minutes.`
          : `A 6-digit code was emailed to the SENDER: they forward it to whoever is collecting. Expires in ${res.expiresInMinutes} minutes.`,
      );
    } catch (e: any) {
      alertDialog('Could not send code', e?.message ?? 'Try again.');
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
    if (status !== 'granted') { alertDialog('Camera access required'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!r.canceled) setPhotoUri(r.assets[0].uri);
  };

  const submit = async () => {
    if (!photoUri) { alertDialog('Photo required', 'Take a photo of the handoff before completing.'); return; }
    if (method === 'physical_id') {
      if (!idType || !idNumber.trim() || !otp.trim()) { alertDialog('Missing fields', 'ID type, number, and OTP all required.'); return; }
    } else {
      if (!seirsCode.trim() || !typedName.trim()) { alertDialog('Missing fields', 'SEIRS ID and typed name both required.'); return; }
    }

    setLoading(true);
    setError('');
    try {
      const photoUploaded = await uploadApi.uploadFile(photoUri, 'driver-handoff');
      // stage = DRIVER_TO_RECIPIENT: see HandoffStage enum in backend
      await identityApi.verifyHandoff(deliveryId, {
        stage:         'driver_to_recipient',
        method,
        proofPhotoUrl: photoUploaded.url,
        ...(method === 'physical_id'
          ? { idType, idNumber: idNumber.trim(), otp: otp.trim() }
          : { seirsCode: seirsCode.trim().toUpperCase(), typedName: typedName.trim() }),
      });
      alertDialog(
        'Handoff complete',
        'Recipient verified: chain of custody record saved. You can mark the delivery as delivered.',
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
          {tr('auto.signature.noDeliverySelectedOpenA', 'No delivery selected. Open a job first then tap “Verify Recipient”.')}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.signature.verifyRecipient', 'Verify Recipient')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Method picker */}
          <Text style={[styles.label, { color: theme.textSecond }]}>{tr('auto.signature.verificationMethod', 'VERIFICATION METHOD')}</Text>
          <Pressable
            onPress={() => setMethod('physical_id')}
            style={[styles.methodCard, { backgroundColor: theme.surface, borderColor: method === 'physical_id' ? theme.primary : theme.border }]}
          >
            <View style={[styles.radioOuter, { borderColor: theme.primary }]}>
              {method === 'physical_id' && <View style={[styles.radioInner, { backgroundColor: theme.primary }]} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.methodTitle, { color: theme.text }]}>{tr('auto.signature.physicalIdEmailOtp', 'Physical ID + Email OTP')}</Text>
              <Text style={[styles.methodSub,   { color: theme.textSecond }]}>{tx('auto.signature.nationalIdLicenceVoterCard', 'National ID, licence, voter card, NIN slip, or passport')}</Text>
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
              <Text style={[styles.methodTitle, { color: theme.text }]}>{tr('auto.signature.seirsIdTypedSignature', 'SEIRS ID + Typed Signature')}</Text>
              <Text style={[styles.methodSub,   { color: theme.textSecond }]}>{tx('auto.signature.recipientShowsAppQrSpeaks', 'Recipient shows app QR, speaks their name, you type to verify')}</Text>
            </View>
          </Pressable>

          {/* Method-specific fields */}
          {method === 'physical_id' ? (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>{tx('auto.signature.idType', 'ID Type')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }} contentContainerStyle={{ gap: 6 }}>
                {ID_TYPES().map(t => (
                  <Pressable
                    key={t.key}
                    onPress={() => setIdType(t.key)}
                    style={[styles.chip, { borderColor: idType === t.key ? theme.primary : theme.border, backgroundColor: idType === t.key ? theme.primary : theme.surface }]}
                  >
                    <Text style={{ color: idType === t.key ? '#fff' : theme.textSecond, fontSize: FontSize.xs, fontWeight: FontWeight.semibold }}>{t.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 8 }]}>{tx('auto.signature.idNumber', 'ID Number')}</Text>
              <TextInput
                value={idNumber}
                onChangeText={setIdNumber}
                placeholder={tx('auto.signature.onDocument', 'On document')}
                placeholderTextColor={theme.textThird}
                autoCapitalize="characters"
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              />

              <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 8 }]}>{tx('auto.signature.emailOtp', 'Email OTP')}</Text>
              {!otpSent ? (
                <Pressable onPress={requestOtp} disabled={loading} style={[styles.secondaryBtn, { borderColor: theme.primary }]}>
                  <Mail size={14} color={theme.primary} />
                  <Text style={[styles.secondaryBtnText, { color: theme.primary }]}>
                    {loading ? tx9('auto.signature.sending', 'Sending…') : tx9('auto.signature.emailRecipientA6Digit', 'Email recipient a 6-digit code')}
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
                  <Pressable onPress={requestOtp}><Text style={{ color: theme.primary, fontSize: FontSize.xs, marginTop: 4 }}>{tx('auto.signature.resendOtp', 'Resend OTP')}</Text></Pressable>
                </>
              )}
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>{tr('auto.signature.recipientSSeirsId', 'Recipient\'s SEIRS ID')}</Text>
              <TextInput
                value={seirsCode}
                onChangeText={setSeirsCode}
                onBlur={lookupSeirsId}
                placeholder={tx('auto.signature.custA7k2p9', 'CUST-A7K2P9')}
                placeholderTextColor={theme.textThird}
                autoCapitalize="characters"
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              />

              {expectedName && (
                <>
                  <Text style={[styles.label, { color: theme.textSecond, marginTop: 8 }]}>{tr('auto.signature.expectedName', 'EXPECTED NAME')}</Text>
                  <Text style={[styles.expected, { color: theme.text }]}>{expectedName}</Text>
                  <Text style={{ fontSize: FontSize.xs, color: theme.textSecond, marginTop: 4 }}>
                    {tr('auto.signature.askTheRecipientToSpeak', 'Ask the recipient to speak their full name. Type EXACTLY what they say below.')}
                  </Text>
                  <TextInput
                    value={typedName}
                    onChangeText={setTypedName}
                    placeholder={tx('auto.signature.asTheySpeakIt', 'As they speak it')}
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
            <Text style={[styles.fieldLabel, { color: theme.text }]}>{tx('auto.signature.handoffPhoto', 'Handoff photo')}</Text>
            {photoUri ? (
              <View style={{ gap: 8 }}>
                <Image source={{ uri: photoUri }} style={styles.preview} />
                <Pressable onPress={pickPhoto} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
                  <Camera size={14} color={theme.text} />
                  <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{tx('auto.signature.retake', 'Retake')}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={pickPhoto} style={[styles.photoBox, { borderColor: theme.primary }]}>
                <Camera size={28} color={theme.primary} />
                <Text style={{ fontSize: FontSize.xs, color: theme.textSecond, textAlign: 'center', paddingHorizontal: 16 }}>
                  {tr('auto.signature.photoOfRecipientWithPackage', 'Photo of recipient with package (with ID held up if high-value)')}
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
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{tx('auto.signature.completeHandoff', 'Complete handoff')}</Text>}
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
