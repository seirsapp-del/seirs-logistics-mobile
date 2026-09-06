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
  Upload, Camera, RefreshCw, ChevronRight, FileText, Images,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { pickDocument, canAttachFiles } from '@/utils/documentPicker';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { userVerificationApi, uploadApi, type IdentityDocType } from '@/services/api';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';

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

const DOC_OPTIONS = (): Array<{ value: IdentityDocType; label: string; note: string }> => [
  { value: 'nin',             label: tr('auto.verifyIdentity.ninSlip', 'NIN slip'),                note: tr('auto.verifyIdentity.nationalIdentificationNumber', 'National Identification Number') },
  { value: 'drivers_licence', label: tr('auto.verifyIdentity.driverSLicence', 'Driver’s licence'),        note: tr('auto.verifyIdentity.nigerianLicenceStillInDate', 'Nigerian licence, still in date') },
  { value: 'passport',        label: tr('auto.verifyIdentity.internationalPassport', 'International passport'),  note: tr('auto.verifyIdentity.bioDataPageStillIn', 'Bio-data page, still in date') },
  { value: 'pvc',             label: tr('auto.verifyIdentity.voterSCardPvc', 'Voter’s card (PVC)'),      note: tr('auto.verifyIdentity.permanentVoterSCard', 'Permanent Voter’s Card') },
];


export default function VerifyIdentityScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  /* One tile per slot, tapped to open a sheet, rather than a Camera and a
     Gallery button side by side. The driver KYC screen already worked this
     way, so a person moving between the two apps meets one interaction.
     The PDF row is the reason it matters: a NIN slip is a PDF download from
     the NIMC portal, and there was no way to send one. */
  const [sheetSlot, setSheetSlot] = useState<null | {
    title:  string;
    setter: (url: string) => void;
    setBusy:(b: boolean) => void;
  }>(null);

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

  const pickAndUpload = async (
    setter: (url: string) => void,
    setBusy: (b: boolean) => void,
    source: 'camera' | 'library' | 'document',
  ) => {
    let uri:  string | null = null;
    // The upload helper defaults to image/jpeg, which would store a PDF
    // under a type nothing can open, so the real one travels with it.
    let mime = 'image/jpeg';

    if (source === 'document') {
      const picked = await pickDocument(alertDialog);
      if (!picked) return;
      uri = picked.uri;
      if (picked.mimeType) mime = picked.mimeType;
    } else {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        alertDialog('Permission required', 'Please allow access to your camera/photos in Settings.');
        return;
      }
      const r = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: false, exif: false })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsEditing: false });
      if (r.canceled) return;
      uri = r.assets[0].uri;
    }

    if (!uri) return;
    setBusy(true);
    try {
      const uploaded = await uploadApi.file(uri, mime);
      setter(uploaded.url);
    } catch (e: any) {
      alertDialog('Upload failed', e?.message ?? 'Please try again with a smaller file.');
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
        'Thanks, your ID is with our review team. You will get a notification within 3 business days.',
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
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.verifyIdentity.verifyIdentity', 'Verify Identity')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {loadingStatus ? (
            <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator color={theme.primary} />
              <Text style={{ color: theme.textSecond, marginTop: Spacing.sm }}>{tr('auto.verifyIdentity.loadingYourStatus', 'Loading your status…')}</Text>
            </View>
          ) : verified ? (
            <VerifiedCard theme={theme} verifiedAt={status!.verifiedAt!} docType={status!.verifiedDocType} />
          ) : pending ? (
            <PendingCard theme={theme} submittedAt={status!.latest!.submittedAt} />
          ) : (
            <>
              {/* Benefits card: always show */}
              <View style={[styles.benefitsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.benefitsTitle, { color: theme.text }]}>{tx('auto.verifyIdentity.whyVerify', 'Why verify?')}</Text>
                {/* Was a five-item tick list. Four of the five were not true:
                    nothing keyed higher limits, insurance or support priority
                    to identityVerifiedAt, and the interstate gate exists but
                    ships switched off (interstate_requires_verified_id = 0).
                    Asking for a NIN in exchange for things that do not exist
                    is the problem; the tick list was only how it looked. */}
                <Text style={[styles.benefitsSub, { color: theme.textSecond }]}>
                  {tr('auto.verifyIdentity.youDoNotHaveTo', 'You do not have to. SEIRS works fully on just your email.')}
                </Text>
                <Text style={[styles.benefitsSub, { color: theme.textSecond, marginTop: Spacing.sm }]}>
                  {tr('auto.verifyIdentity.verifyingPutsAVerifiedBadge', 'Verifying puts a Verified badge on your profile, so the people you send to know who you are. More unlocks are coming.')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm }}>
                  <Clock size={13} color={theme.textThird} />
                  <Text style={{ color: theme.textThird, fontSize: FontSize.xs }}>
                    {tr('auto.verifyIdentity.takesUpTo3Business', 'Takes up to 3 business days.')}
                  </Text>
                </View>
              </View>

              {/* Rejected banner (if last submission was rejected) */}
              {rejected && status?.latest?.rejectionReason && (
                <View style={{ backgroundColor: theme.error + (isDark ? '22' : '14'), borderColor: theme.error + '40', borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <XCircle size={16} color={theme.error} />
                    <Text style={{ color: theme.error, fontWeight: FontWeight.bold, fontSize: FontSize.sm }}>{tx('auto.verifyIdentity.previousSubmissionRejected', 'Previous submission rejected')}</Text>
                  </View>
                  <Text style={{ color: theme.text, fontSize: FontSize.xs, lineHeight: 18 }}>{status.latest.rejectionReason}</Text>
                  <Text style={{ color: theme.textSecond, fontSize: FontSize.xs, marginTop: 2 }}>
                    {tr('auto.verifyIdentity.fixTheIssueAndRe', 'Fix the issue and re-submit below.')}
                  </Text>
                </View>
              )}

              {/* Revoked banner: admin manually reversed a previously-approved verification. */}
              {revoked && (
                <View style={{ backgroundColor: theme.error + (isDark ? '22' : '14'), borderColor: theme.error + '40', borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <XCircle size={16} color={theme.error} />
                    <Text style={{ color: theme.error, fontWeight: FontWeight.bold, fontSize: FontSize.sm }}>{tx('auto.verifyIdentity.verificationRevoked', 'Verification revoked')}</Text>
                  </View>
                  {status?.latest?.revokedReason ? (
                    <Text style={{ color: theme.text, fontSize: FontSize.xs, lineHeight: 18 }}>{status.latest.revokedReason}</Text>
                  ) : (
                    <Text style={{ color: theme.text, fontSize: FontSize.xs, lineHeight: 18 }}>
                      {tr('auto.verifyIdentity.yourVerifiedStatusWasReversed', 'Your verified status was reversed by our compliance team.')}
                    </Text>
                  )}
                  <Text style={{ color: theme.textSecond, fontSize: FontSize.xs, marginTop: 2 }}>
                    {tr('auto.verifyIdentity.youCanReSubmitBelow', 'You can re-submit below. Contact support if you believe this was in error.')}
                  </Text>
                </View>
              )}

              {/* Expired banner: document past its expiry date. */}
              {expired && (
                <View style={{ backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Clock size={16} color="#92400E" />
                    <Text style={{ color: '#92400E', fontWeight: FontWeight.bold, fontSize: FontSize.sm }}>{tx('auto.verifyIdentity.yourIdHasExpired', 'Your ID has expired')}</Text>
                  </View>
                  <Text style={{ color: '#92400E', fontSize: FontSize.xs, lineHeight: 18 }}>
                    {tr('auto.verifyIdentity.verifiedStatusHasBeenPaused', 'Verified status has been paused. Submit a current, unexpired ID below to restore it.')}
                  </Text>
                </View>
              )}

              {/* Step 1: pick doc type */}
              <Text style={[styles.stepLabel, { color: theme.textSecond }]}>{tr('auto.verifyIdentity.1PickYourId', '1. Pick your ID')}</Text>
              <View style={{ gap: Spacing.sm }}>
                {DOC_OPTIONS().map(opt => (
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
                  <Text style={[styles.stepLabel, { color: theme.textSecond }]}>{tr('auto.verifyIdentity.2FrontOfYourId', '2. Front of your ID')}</Text>
                  <UploadRow
                    theme={theme}
                    url={docUrl}
                    busy={uploadingDoc}
                    hint={tr('auto.verifyIdentity.wellLitNoGlareAll', 'Well-lit, no glare, all four corners visible.')}
                    onPress={() => setSheetSlot({ title: tr('auto.verifyIdentity.frontOfYourId', 'Front of your ID'), setter: setDocUrl, setBusy: setUploadingDoc })}
                  />

                  <Text style={[styles.stepLabel, { color: theme.textSecond }]}>{tr('auto.verifyIdentity.3BackOfYourId', '3. Back of your ID')}</Text>
                  <UploadRow
                    theme={theme}
                    url={docBackUrl}
                    busy={uploadingDocBack}
                    hint={backOfIdHint(docType)}
                    onPress={() => setSheetSlot({ title: tr('auto.verifyIdentity.backOfYourId', 'Back of your ID'), setter: setDocBackUrl, setBusy: setUploadingDocBack })}
                  />

                  <Text style={[styles.stepLabel, { color: theme.textSecond }]}>{tr('auto.verifyIdentity.4SelfieHoldingTheId', '4. Selfie holding the ID next to your face')}</Text>
                  <UploadRow
                    theme={theme}
                    url={selfieUrl}
                    busy={uploadingSelfie}
                    hint={tr('auto.verifyIdentity.yourFaceTheIdBoth', 'Your face + the ID both visible. This proves the ID is yours.')}
                    onPress={() => setSheetSlot({ title: tr('auto.verifyIdentity.selfieWithYourId', 'Selfie with your ID'), setter: setSelfieUrl, setBusy: setUploadingSelfie })}
                  />

                  {/* Expiry date: only relevant for docs that actually expire.
                      NIN slip has no expiry, so skip the field entirely. */}
                  {docType !== 'nin' && (
                    <>
                      <Text style={[styles.stepLabel, { color: theme.textSecond }]}>{tr('auto.verifyIdentity.5ExpiryDateOptional', '5. Expiry date (optional)')}</Text>
                      <TextInput
                        value={docExpiryDate}
                        onChangeText={(v) => { setDocExpiryDate(v); if (expiryError) setExpiryError(null); }}
                        placeholder={tx('auto.verifyIdentity.yyyyMmDd', 'YYYY-MM-DD')}
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
                          {tr('auto.verifyIdentity.helpsUsReVerifyYou', 'Helps us re-verify you before your ID expires. Leave blank if unsure.')}
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
                        <Text style={styles.primaryBtnText}>{tx('auto.verifyIdentity.submitForReview', 'Submit for review')}</Text>
                      </>
                    )}
                  </Pressable>
                </>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomSheet
        visible={!!sheetSlot}
        onClose={() => setSheetSlot(null)}
        title={sheetSlot?.title}
        snapHeight="auto"
      >
        <Text style={{ color: theme.textSecond, fontSize: FontSize.sm, marginBottom: Spacing.md }}>
          {tr('auto.verifyIdentity.howDoYouWantTo', 'How do you want to add it?')}
        </Text>
        {([
          { label: tr('auto.verifyIdentity.takeAPhoto', 'Take a photo'),        sub: null,                                    Icon: Camera,   source: 'camera'   as const, primary: true  },
          { label: tr('auto.verifyIdentity.chooseFromGallery', 'Choose from gallery'), sub: null,                                    Icon: Images,   source: 'library'  as const, primary: false },
          // Only on a build that carries the native picker, so nobody taps a
          // row that ends in an apology. A NIN slip is a PDF from the NIMC
          // portal, which is why this row exists at all.
          ...(canAttachFiles()
            ? [{ label: tr('auto.verifyIdentity.attachAPdf', 'Attach a PDF'), sub: tr('auto.verifyIdentity.aFileYouDownloadedLike', 'A file you downloaded, like your NIN slip'), Icon: FileText, source: 'document' as const, primary: false }]
            : []),
        ]).map(({ label, sub, Icon, source, primary }) => (
          <Pressable
            key={label}
            onPress={() => {
              const slot = sheetSlot;
              setSheetSlot(null);
              if (slot) pickAndUpload(slot.setter, slot.setBusy, source);
            }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
              paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
              borderRadius: Radius.lg, marginBottom: Spacing.sm,
              backgroundColor: primary ? theme.primary : theme.surface,
              borderWidth: primary ? 0 : 1, borderColor: theme.border,
            }}
          >
            <Icon size={20} color={primary ? '#fff' : theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: primary ? '#fff' : theme.text, fontSize: FontSize.base, fontWeight: FontWeight.semibold }}>
                {label}
              </Text>
              {sub ? (
                <Text style={{ color: primary ? '#fff' : theme.textSecond, fontSize: FontSize.xs, marginTop: 2, opacity: primary ? 0.85 : 1 }}>
                  {sub}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))}
      </BottomSheet>
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
      <Text style={{ color: '#14532D', fontWeight: FontWeight.bold, fontSize: FontSize.lg }}>{tx('auto.verifyIdentity.youReVerified', 'You’re verified')}</Text>
      <Text style={{ color: '#14532D', fontSize: FontSize.sm, textAlign: 'center' }}>
        Verified on {new Date(verifiedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })} using your {label}.
      </Text>
      <Text style={{ color: '#14532D', fontSize: FontSize.xs, opacity: 0.7, textAlign: 'center', marginTop: 4 }}>
        {tr('auto.verifyIdentity.thePeopleYouSendTo', 'The people you send to can now see that SEIRS has checked who you are.')}
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
      <Text style={{ color: '#92400E', fontWeight: FontWeight.bold, fontSize: FontSize.lg }}>{tx('auto.verifyIdentity.underReview', 'Under review')}</Text>
      <Text style={{ color: '#92400E', fontSize: FontSize.sm, textAlign: 'center' }}>
        Submitted {hoursAgo === 0 ? 'just now' : `${hoursAgo} hour${hoursAgo === 1 ? '' : 's'} ago`}{tr('auto.verifyIdentity.reviewsTakeUpTo3', '. Reviews take up to 3 business days.')}
      </Text>
      <Text style={{ color: '#92400E', fontSize: FontSize.xs, opacity: 0.7, textAlign: 'center', marginTop: 4 }}>
        {tr('auto.verifyIdentity.youLlGetANotification', 'You’ll get a notification when a decision is made. Meanwhile you can keep using the app normally.')}
      </Text>
    </View>
  );
}

/* A PDF has no thumbnail. Rendering one through <Image> gives an empty grey
   box that reads as a failed upload, so the type is sniffed from the stored
   URL and shown as a file card instead. Same treatment the driver's
   DocUploadTile uses. */
const isPdfUrl = (u?: string | null) =>
  !!u && /\.pdf(\?|#|$)/i.test(String(u).split('?')[0]);

function UploadRow({ theme, url, busy, hint, onPress }: any) {
  const pdf = isPdfUrl(url);
  return (
    <View style={{ gap: 6 }}>
      {url ? (
        <View style={{ borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: theme.border, position: 'relative' }}>
          {pdf ? (
            <View style={{ width: '100%', height: 220, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.surface }}>
              <FileText size={38} color={theme.primary} />
              <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold }}>{tx('auto.verifyIdentity.pdfAttached', 'PDF attached')}</Text>
            </View>
          ) : (
            <Image source={{ uri: url }} style={{ width: '100%', height: 220 }} resizeMode="cover" />
          )}
          <Pressable
            onPress={onPress}
            style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <RefreshCw size={12} color="#fff" />
            <Text style={{ color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold }}>{tx('auto.verifyIdentity.replace', 'Replace')}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          disabled={busy}
          onPress={onPress}
          style={{ alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed', borderRadius: Radius.lg, paddingVertical: 34, backgroundColor: theme.surface }}
        >
          {busy ? <ActivityIndicator color={theme.primary} /> : <Camera size={22} color={theme.primary} />}
          <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold }}>
            {busy ? 'Uploading' : 'Tap to add'}
          </Text>
        </Pressable>
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
