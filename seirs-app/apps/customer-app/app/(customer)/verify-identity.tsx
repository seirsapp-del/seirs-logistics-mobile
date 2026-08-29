import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, ShieldCheck, IdCard, CheckCircle2, XCircle, Clock,
  Upload, Camera, RefreshCw, ChevronRight,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { userVerificationApi, uploadApi, type IdentityDocType } from '@/services/api';
import { alertDialog } from '@/components/SeirsDialog';

/**
 * Customer identity verification. Optional trust-tier upgrade.
 *
 * Flow:
 *   1. Show current status (verified / pending / rejected / never submitted)
 *   2. If eligible to submit: pick doc type → upload doc → upload selfie → submit
 *   3. Post-submit: show "under review" state with SLA
 *
 * Design intent: never blocks the user, always encourages, always honest
 * about the wait. See policy at project_seirs_identity_policy.
 */

const DOC_OPTIONS: Array<{ value: IdentityDocType; label: string; note: string }> = [
  { value: 'nin',             label: 'NIN slip',                note: 'National Identification Number' },
  { value: 'drivers_licence', label: 'Driver’s licence',        note: 'Nigerian licence, not expired' },
  { value: 'passport',        label: 'International passport',  note: 'Bio-data page, not expired' },
  { value: 'pvc',             label: 'Voter’s card (PVC)',      note: 'Permanent Voter’s Card' },
];

const BENEFITS = [
  { icon: ShieldCheck, label: 'Trust badge on your profile' },
  { icon: CheckCircle2, label: 'Higher reward and delivery limits' },
  { icon: CheckCircle2, label: 'Access to insured deliveries' },
  { icon: CheckCircle2, label: 'Interstate delivery' },
  { icon: CheckCircle2, label: 'Priority support (front of the line)' },
];

export default function VerifyIdentityScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  const [loadingStatus, setLoadingStatus] = useState(true);
  // Kept loosely typed on purpose so this file bundles cleanly on older
  // Babel setups. The shape matches userVerificationApi.status() from
  // shared/services/api.ts.
  const [status, setStatus] = useState<{
    verifiedAt:      string | null;
    verifiedDocType: string | null;
    latest: null | {
      id:              string;
      documentType:    IdentityDocType;
      status:          'submitted' | 'approved' | 'rejected' | 'withdrawn' | 'revoked' | 'expired';
      submittedAt:     string;
      reviewedAt:      string | null;
      rejectionReason: string | null;
      revokedReason?:  string | null;
      submitterNote:   string | null;
    };
  } | null>(null);

  // Submit-flow state (only used when user is eligible to submit)
  const [step,         setStep]         = useState<'pick' | 'doc' | 'selfie' | 'review'>('pick');
  const [docType,      setDocType]      = useState<IdentityDocType | null>(null);
  const [docUrl,       setDocUrl]       = useState('');
  const [docBackUrl,   setDocBackUrl]   = useState('');
  const [selfieUrl,    setSelfieUrl]    = useState('');
  const [docExpiryDate, setDocExpiryDate] = useState('');   // YYYY-MM-DD, optional
  const [expiryError,   setExpiryError]   = useState<string | null>(null);
  const [uploadingDoc,     setUploadingDoc]     = useState(false);
  const [uploadingDocBack, setUploadingDocBack] = useState(false);
  const [uploadingSelfie,  setUploadingSelfie]  = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [note,         setNote]         = useState('');

  const loadStatus = () => {
    setLoadingStatus(true);
    userVerificationApi.status()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoadingStatus(false));
  };
  useEffect(() => { loadStatus(); }, []);

  const pickAndUpload = async (setter: (url: string) => void, setBusy: (b: boolean) => void, useCamera: boolean) => {
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      alertDialog('Permission required', 'Please allow access to your camera/photos in Settings.');
      return;
    }
    const r = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: false, exif: false })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsEditing: false });
    if (r.canceled) return;
    setBusy(true);
    try {
      const uploaded = await uploadApi.file(r.assets[0].uri);
      setter(uploaded.url);
    } catch (e: any) {
      alertDialog('Upload failed', e?.message ?? 'Please try again with a smaller photo.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!docType || !docUrl || !docBackUrl || !selfieUrl) return;

    // Validate optional expiry date before hitting the server.
    let expiryPayload: string | undefined;
    if (docExpiryDate.trim()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(docExpiryDate.trim())) {
        setExpiryError('Use YYYY-MM-DD format');
        return;
      }
      const d = new Date(docExpiryDate.trim());
      if (Number.isNaN(d.getTime())) {
        setExpiryError('Not a real date');
        return;
      }
      if (d.getTime() < Date.now()) {
        setExpiryError('This document has already expired');
        return;
      }
      setExpiryError(null);
      expiryPayload = docExpiryDate.trim();
    }

    setSubmitting(true);
    try {
      await userVerificationApi.submit({
        documentType:         docType,
        documentPhotoUrl:     docUrl,
        documentBackPhotoUrl: docBackUrl,
        selfiePhotoUrl:       selfieUrl,
        submitterNote:        note.trim() || undefined,
        documentExpiryDate:   expiryPayload,
      });
      alertDialog(
        'Submitted',
        'Thanks, your ID is with our review team. You will get a notification within 24 hours to 3 business days.',
        [{ text: 'OK', onPress: () => { setStep('pick'); setDocType(null); setDocUrl(''); setDocBackUrl(''); setSelfieUrl(''); setNote(''); setDocExpiryDate(''); setExpiryError(null); loadStatus(); } }],
      );
    } catch (e: any) {
      alertDialog('Submission failed', e?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const verified   = !!status?.verifiedAt;
  const pending    = status?.latest?.status === 'submitted';
  const rejected   = status?.latest?.status === 'rejected';
  const revoked    = status?.latest?.status === 'revoked';
  const expired    = status?.latest?.status === 'expired';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Verify Identity</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {loadingStatus ? (
            <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator color={theme.primary} />
              <Text style={{ color: theme.textSecond, marginTop: Spacing.sm }}>Loading your status…</Text>
            </View>
          ) : verified ? (
            <VerifiedCard theme={theme} verifiedAt={status!.verifiedAt!} docType={status!.verifiedDocType} />
          ) : pending ? (
            <PendingCard theme={theme} submittedAt={status!.latest!.submittedAt} />
          ) : (
            <>
              {/* Benefits card: always show */}
              <View style={[styles.benefitsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.benefitsTitle, { color: theme.text }]}>Why verify?</Text>
                <Text style={[styles.benefitsSub, { color: theme.textSecond }]}>
                  Verification is optional. You can keep using SEIRS with just your email. When you verify, you unlock:
                </Text>
                <View style={{ marginTop: Spacing.sm, gap: 8 }}>
                  {BENEFITS.map(({ icon: Icon, label }) => (
                    <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Icon size={16} color={theme.primary} />
                      <Text style={{ color: theme.text, fontSize: FontSize.sm }}>{label}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm }}>
                  <Clock size={13} color={theme.textThird} />
                  <Text style={{ color: theme.textThird, fontSize: FontSize.xs }}>
                    Manual review. Takes 24 hours to 3 business days.
                  </Text>
                </View>
              </View>

              {/* Rejected banner (if last submission was rejected) */}
              {rejected && status?.latest?.rejectionReason && (
                <View style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <XCircle size={16} color="#DC2626" />
                    <Text style={{ color: '#991B1B', fontWeight: FontWeight.bold, fontSize: FontSize.sm }}>Previous submission rejected</Text>
                  </View>
                  <Text style={{ color: '#991B1B', fontSize: FontSize.xs, lineHeight: 18 }}>{status.latest.rejectionReason}</Text>
                  <Text style={{ color: '#991B1B', fontSize: FontSize.xs, opacity: 0.7, marginTop: 2 }}>
                    Fix the issue and re-submit below.
                  </Text>
                </View>
              )}

              {/* Revoked banner: admin manually reversed a previously-approved verification. */}
              {revoked && (
                <View style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <XCircle size={16} color="#DC2626" />
                    <Text style={{ color: '#991B1B', fontWeight: FontWeight.bold, fontSize: FontSize.sm }}>Verification revoked</Text>
                  </View>
                  {status?.latest?.revokedReason ? (
                    <Text style={{ color: '#991B1B', fontSize: FontSize.xs, lineHeight: 18 }}>{status.latest.revokedReason}</Text>
                  ) : (
                    <Text style={{ color: '#991B1B', fontSize: FontSize.xs, lineHeight: 18 }}>
                      Your verified status was reversed by our compliance team.
                    </Text>
                  )}
                  <Text style={{ color: '#991B1B', fontSize: FontSize.xs, opacity: 0.7, marginTop: 2 }}>
                    You can re-submit below. Contact support if you believe this was in error.
                  </Text>
                </View>
              )}

              {/* Expired banner: document past its expiry date. */}
              {expired && (
                <View style={{ backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Clock size={16} color="#92400E" />
                    <Text style={{ color: '#92400E', fontWeight: FontWeight.bold, fontSize: FontSize.sm }}>Your ID has expired</Text>
                  </View>
                  <Text style={{ color: '#92400E', fontSize: FontSize.xs, lineHeight: 18 }}>
                    Verified status has been paused. Submit a current, unexpired ID below to restore it.
                  </Text>
                </View>
              )}

              {/* Step 1: pick doc type */}
              <Text style={[styles.stepLabel, { color: theme.textSecond }]}>1. Pick your ID</Text>
              <View style={{ gap: Spacing.sm }}>
                {DOC_OPTIONS.map(opt => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setDocType(opt.value)}
                    style={[
                      styles.docCard,
                      { backgroundColor: theme.surface, borderColor: docType === opt.value ? theme.primary : theme.border },
                    ]}
                  >
                    <View style={[styles.docIcon, { backgroundColor: docType === opt.value ? theme.primary + '20' : theme.surfaceSecond }]}>
                      <IdCard size={20} color={docType === opt.value ? theme.primary : theme.textSecond} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: FontWeight.semibold, fontSize: FontSize.base }}>{opt.label}</Text>
                      <Text style={{ color: theme.textSecond, fontSize: FontSize.xs, marginTop: 2 }}>{opt.note}</Text>
                    </View>
                    {docType === opt.value && <CheckCircle2 size={18} color={theme.primary} />}
                  </Pressable>
                ))}
              </View>

              {/* Steps 2, 3, 4: upload photos (unlocked once doc type is picked) */}
              {docType && (
                <>
                  <Text style={[styles.stepLabel, { color: theme.textSecond }]}>2. Front of your ID</Text>
                  <UploadRow
                    theme={theme}
                    url={docUrl}
                    busy={uploadingDoc}
                    hint="Well-lit, no glare, all four corners visible."
                    onCamera={() => pickAndUpload(setDocUrl, setUploadingDoc, true)}
                    onGallery={() => pickAndUpload(setDocUrl, setUploadingDoc, false)}
                  />

                  <Text style={[styles.stepLabel, { color: theme.textSecond }]}>3. Back of your ID</Text>
                  <UploadRow
                    theme={theme}
                    url={docBackUrl}
                    busy={uploadingDocBack}
                    hint={backOfIdHint(docType)}
                    onCamera={() => pickAndUpload(setDocBackUrl, setUploadingDocBack, true)}
                    onGallery={() => pickAndUpload(setDocBackUrl, setUploadingDocBack, false)}
                  />

                  <Text style={[styles.stepLabel, { color: theme.textSecond }]}>4. Selfie holding the ID next to your face</Text>
                  <UploadRow
                    theme={theme}
                    url={selfieUrl}
                    busy={uploadingSelfie}
                    hint="Your face + the ID both visible. This proves the ID is yours."
                    onCamera={() => pickAndUpload(setSelfieUrl, setUploadingSelfie, true)}
                    onGallery={() => pickAndUpload(setSelfieUrl, setUploadingSelfie, false)}
                  />

                  {/* Expiry date: only relevant for docs that actually expire.
                      NIN slip has no expiry, so skip the field entirely. */}
                  {docType !== 'nin' && (
                    <>
                      <Text style={[styles.stepLabel, { color: theme.textSecond }]}>5. Expiry date (optional)</Text>
                      <TextInput
                        value={docExpiryDate}
                        onChangeText={(v) => { setDocExpiryDate(v); if (expiryError) setExpiryError(null); }}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={theme.textThird}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="numbers-and-punctuation"
                        style={{
                          borderWidth: 1,
                          borderColor: expiryError ? '#DC2626' : theme.border,
                          backgroundColor: theme.surface,
                          color: theme.text,
                          borderRadius: Radius.lg,
                          paddingHorizontal: Spacing.md,
                          paddingVertical: 12,
                          fontSize: FontSize.base,
                        }}
                      />
                      {expiryError ? (
                        <Text style={{ color: '#DC2626', fontSize: FontSize.xs }}>{expiryError}</Text>
                      ) : (
                        <Text style={{ color: theme.textSecond, fontSize: FontSize.xs, lineHeight: 16 }}>
                          Helps us re-verify you before your ID expires. Leave blank if unsure.
                        </Text>
                      )}
                    </>
                  )}

                  {/* Submit */}
                  <Pressable
                    disabled={!docUrl || !docBackUrl || !selfieUrl || submitting}
                    onPress={submit}
                    style={[
                      styles.primaryBtn,
                      { backgroundColor: (!docUrl || !docBackUrl || !selfieUrl) ? theme.textThird : theme.primary },
                    ]}
                  >
                    {submitting ? <ActivityIndicator color="#fff" /> : (
                      <>
                        <ShieldCheck size={16} color="#fff" />
                        <Text style={styles.primaryBtnText}>Submit for review</Text>
                      </>
                    )}
                  </Pressable>
                </>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function VerifiedCard({ theme, verifiedAt, docType }: any) {
  const label =
    docType === 'nin'             ? 'NIN'
    : docType === 'drivers_licence' ? 'Driver’s Licence'
    : docType === 'passport'      ? 'Passport'
    : docType === 'pvc'           ? 'PVC'
    : 'Government ID';
  return (
    <View style={{ backgroundColor: '#ECFDF5', borderColor: '#BBF7D0', borderWidth: 1, borderRadius: Radius.xl, padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' }}>
        <ShieldCheck size={28} color="#fff" />
      </View>
      <Text style={{ color: '#14532D', fontWeight: FontWeight.bold, fontSize: FontSize.lg }}>You’re verified</Text>
      <Text style={{ color: '#14532D', fontSize: FontSize.sm, textAlign: 'center' }}>
        Verified on {new Date(verifiedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })} using your {label}.
      </Text>
      <Text style={{ color: '#14532D', fontSize: FontSize.xs, opacity: 0.7, textAlign: 'center', marginTop: 4 }}>
        Enjoy higher limits, insured deliveries, interstate access, and priority support.
      </Text>
    </View>
  );
}

function PendingCard({ theme, submittedAt }: any) {
  const hoursAgo = Math.floor((Date.now() - new Date(submittedAt).getTime()) / (60 * 60 * 1000));
  return (
    <View style={{ backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1, borderRadius: Radius.xl, padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center' }}>
        <Clock size={28} color="#fff" />
      </View>
      <Text style={{ color: '#92400E', fontWeight: FontWeight.bold, fontSize: FontSize.lg }}>Under review</Text>
      <Text style={{ color: '#92400E', fontSize: FontSize.sm, textAlign: 'center' }}>
        Submitted {hoursAgo === 0 ? 'just now' : `${hoursAgo} hour${hoursAgo === 1 ? '' : 's'} ago`}. Reviews take 24 hours to 3 business days.
      </Text>
      <Text style={{ color: '#92400E', fontSize: FontSize.xs, opacity: 0.7, textAlign: 'center', marginTop: 4 }}>
        You’ll get a notification when a decision is made. Meanwhile you can keep using the app normally.
      </Text>
    </View>
  );
}

function UploadRow({ theme, url, busy, hint, onCamera, onGallery }: any) {
  return (
    <View style={{ gap: 6 }}>
      {url ? (
        <View style={{ borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: theme.border, position: 'relative' }}>
          <Image source={{ uri: url }} style={{ width: '100%', height: 220 }} resizeMode="cover" />
          <Pressable
            onPress={onGallery}
            style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <RefreshCw size={12} color="#fff" />
            <Text style={{ color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold }}>Replace</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            disabled={busy}
            onPress={onCamera}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed', borderRadius: Radius.lg, paddingVertical: 22, backgroundColor: theme.surface }}
          >
            {busy ? <ActivityIndicator color={theme.primary} /> : <Camera size={18} color={theme.primary} />}
            <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold }}>Camera</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={onGallery}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed', borderRadius: Radius.lg, paddingVertical: 22, backgroundColor: theme.surface }}
          >
            {busy ? <ActivityIndicator color={theme.primary} /> : <Upload size={18} color={theme.primary} />}
            <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold }}>Gallery</Text>
          </Pressable>
        </View>
      )}
      <Text style={{ color: theme.textSecond, fontSize: FontSize.xs, lineHeight: 16 }}>{hint}</Text>
    </View>
  );
}

// Doc-type specific hint text for the "back of ID" upload step.
// Passport back is often the signature page or blank; NIN paper slip
// is usually blank too. Setting expectations reduces support tickets.
function backOfIdHint(docType: IdentityDocType): string {
  switch (docType) {
    case 'nin':
      return 'The back of the NIN slip. If it is blank, just photograph a plain sheet of paper next to the slip so reviewers know you did not skip this step.';
    case 'drivers_licence':
      return 'The back of your driver\'s licence. Categories, address, and issue/expiry dates should be readable.';
    case 'passport':
      return 'The signature page (or the last used data page). If truly blank, photograph the inside back cover.';
    case 'pvc':
      return 'The back of your PVC. The QR code and issue date should be readable.';
    default:
      return 'The back of your ID. Well-lit, no glare.';
  }
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  benefitsCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: 6 },
  benefitsTitle:{ fontSize: FontSize.md, fontWeight: FontWeight.bold },
  benefitsSub:  { fontSize: FontSize.sm, lineHeight: 20 },
  stepLabel:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: Spacing.sm },
  docCard:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderWidth: 1.5, borderRadius: Radius.lg },
  docIcon:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  primaryBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.lg, marginTop: Spacing.md },
  primaryBtnText:{ color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
