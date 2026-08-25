import {
  View, Text, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft, CreditCard, Camera, FileText, Car, Shield,
  Users, CheckCircle, Clock, XCircle, UploadCloud, ChevronRight,
  ExternalLink, KeyRound,
} from 'lucide-react-native';
import { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { uploadApi, driversApi } from '@/services/api';

type DocStatus = 'not_uploaded' | 'uploaded' | 'verified' | 'rejected';

interface DocItem {
  id:       string;
  label:    string;
  desc:     string;
  Icon:     any;
  status:   DocStatus;
  required: boolean;
  url?:     string;
  sides?:   'front_back';
  urlBack?: string;
}

const STATUS_CONFIG: Record<DocStatus, { label: string; color: string; Icon: any }> = {
  not_uploaded: { label: 'Not Uploaded', color: '#A1A1AA', Icon: UploadCloud   },
  uploaded:     { label: 'Under Review', color: '#D97706', Icon: Clock         },
  verified:     { label: 'Verified',     color: '#16A34A', Icon: CheckCircle   },
  rejected:     { label: 'Rejected',     color: '#EF4444', Icon: XCircle       },
};

const INITIAL_DOCS: DocItem[] = [
  { id: 'national_id_front', label: 'National ID: Front',      Icon: CreditCard, desc: 'Government-issued ID or NIN slip (front side)',      status: 'not_uploaded', required: true  },
  { id: 'national_id_back',  label: 'National ID: Back',       Icon: CreditCard, desc: 'Back side of your National ID or NIN slip',           status: 'not_uploaded', required: true  },
  { id: 'selfie',            label: 'Selfie / Profile photo',   Icon: Camera,     desc: 'Clear photo of your face: used on your driver profile', status: 'not_uploaded', required: true  },
  { id: 'drivers_license',   label: "Driver's Licence",         Icon: Car,        desc: "Valid Nigerian driver's licence",                     status: 'not_uploaded', required: true  },
  { id: 'vehicle_photo',     label: 'Vehicle Photo',            Icon: Car,        desc: 'Full photo of your vehicle showing the plate',        status: 'not_uploaded', required: true  },
  { id: 'ownership_proof',   label: 'Vehicle Ownership Proof',  Icon: FileText,   desc: "Registration papers, even if they are in the owner's name", status: 'not_uploaded', required: true  },
  { id: 'insurance_cert',    label: 'Insurance Certificate',    Icon: Shield,     desc: 'Valid vehicle insurance certificate',                 status: 'not_uploaded', required: true  },
  { id: 'guarantor',         label: 'Guarantor Letter',         Icon: Users,      desc: 'Letter from a guarantor (recommended, not required)', status: 'not_uploaded', required: false },
];

// D-10.2: the doc ids above map 1:1 onto the *Url columns on the driver
// entity (mirrors KYC_DOC_FIELD_MAP in drivers.service.ts). Without this
// map the screen only ever knew about uploads made in the current session,
// so an already-approved driver reopened KYC at 0% and re-uploaded all eight.
const DOC_URL_FIELD: Record<string, string> = {
  national_id_front: 'nationalIdFrontUrl',
  national_id_back:  'nationalIdBackUrl',
  drivers_license:   'driversLicenseUrl',
  vehicle_photo:     'vehiclePhotoUrl',
  ownership_proof:   'ownershipProofUrl',
  insurance_cert:    'insuranceCertUrl',
  selfie:            'selfieUrl',
  guarantor:         'guarantorUrl',
};

const INSURANCE_PARTNERS = [
  { name: 'AXA Mansard', desc: 'Vehicle & third-party cover', url: 'https://axamansard.com' },
  { name: 'Leadway Assurance', desc: 'Motorcycle & auto insurance', url: 'https://leadway.com' },
  { name: 'Aiico Insurance', desc: 'Affordable driver policies', url: 'https://aiicoplc.com' },
  { name: 'Cornerstone Insurance', desc: 'Motor & liability cover', url: 'https://cornerstoneinsuranceplc.com' },
];

export default function KycScreen() {
  const [sheet, setSheet] = useState<SeirsSheetSpec | null>(null);
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const isDark      = colorScheme === 'dark';

  const [docs,      setDocs]      = useState<DocItem[]>(INITIAL_DOCS);
  const [uploading, setUploading] = useState<string | null>(null);
  const [showInsurance, setShowInsurance] = useState(false);
  // Spec V8 §"Camera policy": drivers MUST have a working phone
  // camera as a signup criterion. We probe permission upfront so
  // a denied/unavailable camera is surfaced before they try to
  // upload anything. 'unknown' = haven't checked yet (no banner).
  const [cameraStatus, setCameraStatus] = useState<'ok' | 'denied' | 'unknown'>('unknown');
  const [loadingDocs, setLoadingDocs] = useState(true);
  // 2026-08-25: KYC asked for a "Vehicle Ownership Proof" document and
  // never asked whose name was on it, so a rider on a borrowed keke had
  // nowhere to say so. This row is that question, and it counts towards
  // the progress bar like every other requirement.
  const [ownership, setOwnership] = useState<{ declared: boolean; kind: 'self' | 'third_party' } | null>(null);

  // D-10.2: hydrate from the driver record. /drivers/me spreads the whole
  // entity, so every uploaded document already has its URL there. A doc with
  // a URL is at minimum "Under Review"; once the driver record itself is
  // approved the whole document set has been reviewed, so show Verified.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me: any = await driversApi.me();
        if (cancelled || !me) return;
        const approved = me.status === 'approved';
        setDocs(prev => prev.map(d => {
          const url = me[DOC_URL_FIELD[d.id]];
          if (!url) return d;
          return { ...d, url, status: (approved ? 'verified' : 'uploaded') as DocStatus };
        }));
      } catch {
        // Offline or profile missing: leave the defaults, the driver can
        // still upload. Never block the screen on this.
      } finally {
        if (!cancelled) setLoadingDocs(false);
      }
      try {
        const rec: any = await driversApi.getVehicle();
        if (!cancelled) {
          setOwnership({
            declared: !!rec?.ownership?.declared,
            kind:     rec?.ownership?.ownership === 'third_party' ? 'third_party' : 'self',
          });
        }
      } catch {
        // Same rule: never block the screen on a failed read.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const current = await ImagePicker.getCameraPermissionsAsync();
        if (current.status === 'granted') { setCameraStatus('ok'); return; }
        // OS-blocked (user picked "never ask again"): no point reprompting
        if (!current.canAskAgain) { setCameraStatus('denied'); return; }
        const asked = await ImagePicker.requestCameraPermissionsAsync();
        setCameraStatus(asked.status === 'granted' ? 'ok' : 'denied');
      } catch {
        setCameraStatus('denied');
      }
    })();
  }, []);

  const requiredDocs = docs.filter(d => d.required);
  const verified     = requiredDocs.filter(d => d.status === 'verified').length;
  // The ownership declaration is a requirement, not a nice-to-have, so it
  // sits in both halves of the fraction. Otherwise a rider reads 100% and
  // then finds out their application is not actually complete.
  const totalRequired = requiredDocs.length + 1;
  const uploaded     = requiredDocs.filter(d => d.status === 'uploaded' || d.status === 'verified').length
                     + (ownership?.declared ? 1 : 0);
  const progress     = totalRequired > 0 ? (uploaded / totalRequired) * 100 : 0;

  const allSubmitted = requiredDocs.every(d => d.status !== 'not_uploaded') && !!ownership?.declared;

  const pickImage = async (source: 'camera' | 'library'): Promise<string | null> => {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission required', 'Camera access is needed.'); return null; }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: true });
      return r.canceled ? null : r.assets[0].uri;
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission required', 'Photo library access is needed.'); return null; }
      const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsEditing: true });
      return r.canceled ? null : r.assets[0].uri;
    }
  };

  const handleUpload = async (docId: string) => {
    // Sat at exactly Android's three-button ceiling, so a fourth source
    // (a PDF, a re-take) could never have been added without silently
    // dropping Cancel (2026-08-25 dialog sweep).
    setSheet({
      title: 'Upload document',
      message: 'Choose how to provide the document.',
      options: [
        { label: 'Take a photo',      sub: 'Use the camera now', variant: 'primary', icon: 'camera-outline', onPress: () => doUpload(docId, 'camera') },
        { label: 'Choose from phone', sub: 'Pick a photo you already have', icon: 'images-outline', onPress: () => doUpload(docId, 'library') },
      ],
      cancelLabel: 'Not now',
    });
  };

  const doUpload = async (docId: string, source: 'camera' | 'library') => {
    const uri = await pickImage(source);
    if (!uri) return;
    setUploading(docId);
    try {
      const uploaded = await uploadApi.uploadFile(uri, 'kyc');
      // Persist URL against driver record so admin KYC review sees it
      await driversApi.updateKycDoc(docId, uploaded.url);
      setDocs(prev => prev.map(d =>
        d.id === docId ? { ...d, status: 'uploaded' as DocStatus, url: uploaded.url } : d,
      ));
    } catch {
      Alert.alert('Upload failed', 'Please try again.');
    } finally {
      setUploading(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Identity Verification</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Spec V8: working phone camera is a signup criterion for
            drivers. Surface a hard banner if permission was denied so
            the user understands why the upload buttons will keep
            failing. App settings deep-link bumps them straight to the
            permission screen rather than making them hunt. */}
        {cameraStatus === 'denied' && (
          <View style={[styles.cameraBlocker]}>
            <Camera size={20} color="#DC2626" strokeWidth={1.75} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cameraBlockerTitle}>Camera access required</Text>
              <Text style={styles.cameraBlockerDesc}>
                A working phone camera is a requirement to drive on SEIRS. Enable camera permission in your phone settings to upload KYC documents and complete deliveries (proof photos at every pickup + dropoff).
              </Text>
            </View>
            <Pressable
              onPress={() => { import('react-native').then(({ Linking }) => Linking.openSettings().catch(() => {})); }}
              style={styles.cameraBlockerBtn}
            >
              <Text style={styles.cameraBlockerBtnText}>Open Settings</Text>
            </Pressable>
          </View>
        )}

        {/* Progress card */}
        <View style={[styles.progressCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <View style={styles.progressTop}>
            <View>
              <Text style={[styles.progressTitle, { color: theme.text }]}>Verification Progress</Text>
              <Text style={[styles.progressSub, { color: theme.textSecond }]}>
                {loadingDocs
                  ? 'Checking your submitted documents...'
                  : `${uploaded} of ${totalRequired} requirements submitted`}
              </Text>
            </View>
            {loadingDocs
              ? <ActivityIndicator size="small" color={theme.primary} />
              : <Text style={[styles.progressPct, { color: theme.primary }]}>{Math.round(progress)}%</Text>}
          </View>
          {!loadingDocs && allSubmitted && (
            <View style={[styles.submittedBanner, { backgroundColor: '#16A34A18' }]}>
              <CheckCircle size={16} color="#16A34A" strokeWidth={1.75} />
              <Text style={[styles.submittedText, { color: '#16A34A' }]}>
                All documents submitted: review takes 24 hours to 3 business days
              </Text>
            </View>
          )}
        </View>

        {/* Who owns the vehicle. Founder 2026-08-25: "this is Nigeria this
            happens" - hire purchase, a relative's keke, or an owner who
            fronts the bike for a daily return are all ordinary, and a KYC
            that assumes rider equals owner either locks those riders out
            or accepts a claim nobody checked. */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Vehicle Ownership</Text>
        <Pressable
          style={[styles.docCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
          onPress={() => router.push('/(driver)/vehicle-ownership')}
        >
          <View style={[styles.docIconWrap, { backgroundColor: theme.primary + '15' }]}>
            <KeyRound size={22} color={theme.primary} strokeWidth={1.5} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.docLabel, { color: theme.text }]}>Is this vehicle yours?</Text>
            <Text style={[styles.docDesc, { color: theme.textThird }]} numberOfLines={2}>
              {!ownership?.declared
                ? "If you ride someone else's vehicle, tell us here. It will not count against you."
                : ownership.kind === 'third_party'
                  ? 'Declared: owned by someone else, with their signed authorisation'
                  : 'Declared: you own this vehicle'}
            </Text>
          </View>
          {ownership?.declared ? (
            <View style={[styles.statusChip, { backgroundColor: '#16A34A18' }]}>
              <CheckCircle size={13} color="#16A34A" strokeWidth={1.75} />
              <Text style={[styles.statusText, { color: '#16A34A' }]}>Declared</Text>
            </View>
          ) : (
            <View style={[styles.statusChip, { backgroundColor: '#A1A1AA18' }]}>
              <ChevronRight size={13} color="#A1A1AA" strokeWidth={1.75} />
              <Text style={[styles.statusText, { color: '#A1A1AA' }]}>Answer</Text>
            </View>
          )}
        </Pressable>

        {/* Document list */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: Spacing.md }]}>Required Documents</Text>
        {docs.filter(d => d.required).map(doc => {
          const cfg        = STATUS_CONFIG[doc.status];
          const isUploading = uploading === doc.id;
          return (
            <Pressable
              key={doc.id}
              style={[styles.docCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
              onPress={() => doc.status !== 'verified' && handleUpload(doc.id)}
              disabled={isUploading || doc.status === 'verified'}
            >
              <View style={[styles.docIconWrap, { backgroundColor: theme.primary + '15' }]}>
                <doc.Icon size={22} color={theme.primary} strokeWidth={1.5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.docLabel, { color: theme.text }]}>{doc.label}</Text>
                <Text style={[styles.docDesc,  { color: theme.textThird }]} numberOfLines={1}>{doc.desc}</Text>
              </View>
              {isUploading ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <View style={[styles.statusChip, { backgroundColor: cfg.color + '18' }]}>
                  <cfg.Icon size={13} color={cfg.color} strokeWidth={1.75} />
                  <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              )}
            </Pressable>
          );
        })}

        {/* Optional documents */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: Spacing.md }]}>Optional</Text>
        {docs.filter(d => !d.required).map(doc => {
          const cfg        = STATUS_CONFIG[doc.status];
          const isUploading = uploading === doc.id;
          return (
            <Pressable
              key={doc.id}
              style={[styles.docCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
              onPress={() => doc.status !== 'verified' && handleUpload(doc.id)}
              disabled={isUploading || doc.status === 'verified'}
            >
              <View style={[styles.docIconWrap, { backgroundColor: theme.textThird + '18' }]}>
                <doc.Icon size={22} color={theme.textThird} strokeWidth={1.5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.docLabel, { color: theme.text }]}>{doc.label}</Text>
                <Text style={[styles.docDesc,  { color: theme.textThird }]} numberOfLines={1}>{doc.desc}</Text>
              </View>
              {isUploading ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <View style={[styles.statusChip, { backgroundColor: cfg.color + '18' }]}>
                  <cfg.Icon size={13} color={cfg.color} strokeWidth={1.75} />
                  <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              )}
            </Pressable>
          );
        })}

        {/* Insurance partners */}
        <Pressable
          style={[styles.insuranceHeader, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
          onPress={() => setShowInsurance(v => !v)}
        >
          <View style={[styles.docIconWrap, { backgroundColor: '#3A7BD518' }]}>
            <Shield size={22} color={theme.primary} strokeWidth={1.5} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.docLabel, { color: theme.text }]}>Need vehicle insurance?</Text>
            <Text style={[styles.docDesc, { color: theme.textThird }]}>View our partner insurance providers</Text>
          </View>
          <ChevronRight
            size={18}
            color={theme.textThird}
            strokeWidth={1.75}
            style={{ transform: [{ rotate: showInsurance ? '90deg' : '0deg' }] }}
          />
        </Pressable>

        {showInsurance && (
          <View style={[styles.insuranceList, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {INSURANCE_PARTNERS.map((p, i) => (
              <View
                key={p.name}
                style={[
                  styles.insuranceRow,
                  i < INSURANCE_PARTNERS.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.insName, { color: theme.text }]}>{p.name}</Text>
                  <Text style={[styles.insDesc, { color: theme.textThird }]}>{p.desc}</Text>
                </View>
                <ExternalLink size={16} color={theme.primary} strokeWidth={1.75} />
              </View>
            ))}
            <Text style={[styles.insNote, { color: theme.textThird }]}>
              Seirs earns a referral fee when you purchase through a partner. This does not affect your premium.
            </Text>
          </View>
        )}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
      <SeirsSheet spec={sheet} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  cameraBlocker:        { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', marginBottom: 16 },
  cameraBlockerTitle:   { fontSize: 14, fontWeight: '700', color: '#DC2626', marginBottom: 4 },
  cameraBlockerDesc:    { fontSize: 12, color: '#7F1D1D', lineHeight: 17 },
  cameraBlockerBtn:     { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#DC2626' },
  cameraBlockerBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn:       { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  content:       { padding: Spacing.md, gap: Spacing.sm },

  progressCard:  { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  progressTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  progressTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  progressSub:   { fontSize: FontSize.sm, marginTop: 2 },
  progressPct:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any },
  submittedBanner:{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md },
  submittedText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium as any, flex: 1 },

  sectionTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.bold as any, marginBottom: 4 },

  docCard:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  docIconWrap:   { width: 44, height: 44, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  docLabel:      { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any },
  docDesc:       { fontSize: FontSize.xs, marginTop: 2 },
  statusChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full },
  statusText:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },

  insuranceHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, marginTop: Spacing.sm },
  insuranceList:   { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden', marginTop: -Spacing.xs },
  insuranceRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  insName:         { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any },
  insDesc:         { fontSize: FontSize.xs, marginTop: 2 },
  insNote:         { fontSize: FontSize.xs, padding: Spacing.md, lineHeight: 18 },
});
