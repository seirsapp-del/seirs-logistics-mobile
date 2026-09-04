/**
 * The documents that prove WHO the rider is, as a section rather than a screen.
 *
 * WHY it exists. Identity and vehicle were asked on two different screens,
 * and the founder's objection was simple: a rider opening Profile saw "KYC
 * Verification" and "My Vehicle" and could not tell which one wanted what.
 * Worse, three documents were asked TWICE. KYC wanted a vehicle photo,
 * ownership papers and an insurance certificate; My Vehicle wanted the same
 * three again, with different wording and a different uploader.
 *
 * The two questions are now one screen. This half is the person: asked once
 * and never re-asked, because a NIN does not change when somebody buys a new
 * okada. The vehicle half sits below it and is asked again at every change.
 *
 * The three vehicle documents that used to live here are gone from this list.
 * They are asked once, downstairs, by the uploader that accepts a PDF.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Camera, Car, CheckCircle, Clock, CreditCard, UploadCloud, Users, XCircle,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { driversApi, uploadApi } from '@/services/api';
import { canAttachFiles, pickDocument } from '@/utils/documentPicker';
import { alertDialog } from '@/components/SeirsDialog';
import type { SeirsSheetSpec } from '@/components/SeirsSheet';

type DocStatus = 'not_uploaded' | 'uploaded' | 'verified' | 'rejected' | 'expired' | 'needs_replacing';

interface DocItem {
  id: string;
  label: string;
  desc: string;
  Icon: any;
  required: boolean;
  status: DocStatus;
  rejectionReason?: string | null;
  expiresAt?: string | null;
}

const STATUS_CONFIG: Record<DocStatus, { label: string; color: string; Icon: any }> = {
  not_uploaded: { label: 'Not uploaded', color: '#9CA3AF', Icon: UploadCloud },
  uploaded:     { label: 'Under review', color: '#D97706', Icon: Clock       },
  verified:     { label: 'Verified',     color: '#16A34A', Icon: CheckCircle },
  rejected:     { label: 'Rejected',     color: '#EF4444', Icon: XCircle     },
  /**
   * Approved, and no longer valid.
   *
   * The chip read "Verified" on a licence that expired yesterday, because
   * the screen mapped status 'approved' straight to verified and never
   * looked at expiresAt, which the server has always sent. A rider looking
   * at a green tick has no reason to replace anything.
   */
  expired:      { label: 'Expired',      color: '#EF4444', Icon: XCircle     },
  /**
   * Amber and worded as an instruction, deliberately.
   *
   * Ops asking for a fresh copy of a document that has run out is not the
   * same event as a document being turned down, and showing it in the same
   * red as "Rejected" tells a rider who did nothing wrong that they failed.
   */
  needs_replacing: { label: 'Needs replacing', color: '#D97706', Icon: UploadCloud },
};

/**
 * Five documents, all about the person. vehicle_photo, ownership_proof and
 * insurance_cert are deliberately absent: they were the duplicates.
 */
const IDENTITY_DOCS: DocItem[] = [
  { id: 'national_id_front', label: 'National ID: Front', desc: 'Government-issued ID or NIN slip, front side',           Icon: CreditCard, required: true,  status: 'not_uploaded' },
  { id: 'national_id_back',  label: 'National ID: Back',  desc: 'Back side of the same ID or NIN slip',                   Icon: CreditCard, required: true,  status: 'not_uploaded' },
  { id: 'selfie',            label: 'Selfie',             desc: 'A clear photo of your face, used on your rider profile', Icon: Camera,     required: true,  status: 'not_uploaded' },
  { id: 'drivers_license',   label: 'Driver licence',     desc: 'A valid Nigerian driver licence',                        Icon: Car,        required: true,  status: 'not_uploaded' },
  { id: 'guarantor',         label: 'Guarantor letter',   desc: 'A letter from a guarantor. Recommended, not required',   Icon: Users,      required: false, status: 'not_uploaded' },
];

/** The doc ids map 1:1 onto the has* flags on the driver record. */
/**
 * Presence flags, not links.
 *
 * These were 'nationalIdFrontUrl' and friends, read straight off
 * driversApi.me(). That payload no longer carries the URLs: /drivers/me was
 * returning five links to a person's identity documents on every refresh of
 * the home screen, to anyone holding the session.
 *
 * The tiles never rendered the images anyway. They draw an icon, a label and
 * a status chip, and used the URL only to decide whether a document exists.
 * A boolean does that, and hands nothing over.
 */
const DOC_HAS_FIELD: Record<string, string> = {
  national_id_front: 'hasNationalIdFront',
  national_id_back:  'hasNationalIdBack',
  drivers_license:   'hasDriversLicense',
  selfie:            'hasSelfie',
  guarantor:         'hasGuarantor',
};

export function IdentityDocuments({ onSheet }: { onSheet: (s: SeirsSheetSpec) => void }) {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];

  const [docs,      setDocs]      = useState<DocItem[]>(IDENTITY_DOCS);
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [me, reviewed]: any[] = await Promise.all([
        driversApi.me(),
        driversApi.myKycDocuments().catch(() => ({ documents: [] })),
      ]);
      if (!me) return;
      const byId: Record<string, any> = {};
      for (const r of (reviewed?.documents ?? [])) byId[r.docId] = r;

      setDocs(prev => prev.map(d => {
        const rec = byId[d.id];
        const has = Boolean(rec?.hasFile ?? me[DOC_HAS_FIELD[d.id]]);
        if (!has) return d;
        // An approved document whose date has passed is EXPIRED, not
        // verified. Compared date-only so "expires today" is still valid.
        const lapsed = rec?.status === 'approved' && rec?.expiresAt
          && String(rec.expiresAt).slice(0, 10) < new Date().toISOString().slice(0, 10);
        const status: DocStatus =
          rec?.status === 'needs_replacing' ? 'needs_replacing'
          : lapsed ? 'expired'
          : rec?.status === 'approved' ? 'verified'
          : rec?.status === 'rejected' ? 'rejected'
          : 'uploaded';
        return {
          ...d, status,
          rejectionReason: rec?.rejectionReason ?? null,
          expiresAt: rec?.expiresAt ?? null,
        };
      }));
    } catch {
      // Offline, or no profile yet. Leave the defaults: the rider can still
      // upload, and this section must never block the screen below it.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pickImage = async (source: 'camera' | 'library'): Promise<string | null> => {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        alertDialog('Camera needed', 'Allow camera access to photograph the document.');
        return null;
      }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: true });
      return r.canceled ? null : r.assets[0].uri;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      alertDialog('Photos needed', 'Allow photo access to choose a document you already have.');
      return null;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsEditing: true });
    return r.canceled ? null : r.assets[0].uri;
  };

  const doUpload = async (docId: string, source: 'camera' | 'library' | 'document') => {
    let uri: string | null;
    // The mime travels with the file. uploadFile defaults to image/jpeg,
    // which would store a PDF under a type nothing can open.
    let mime = 'image/jpeg';
    if (source === 'document') {
      const picked = await pickDocument(alertDialog);
      if (!picked) return;
      uri  = picked.uri;
      mime = picked.mimeType;
    } else {
      uri = await pickImage(source);
    }
    if (!uri) return;

    setUploading(docId);
    try {
      const uploaded = await uploadApi.uploadFile(uri, 'kyc', mime);
      await driversApi.updateKycDoc(docId, uploaded.url);
      setDocs(prev => prev.map(d =>
        d.id === docId
          ? { ...d, status: 'uploaded' as DocStatus, rejectionReason: null }
          : d,
      ));
    } catch (e: any) {
      alertDialog('Upload failed', e?.message ?? 'Check your connection and try again.');
    } finally {
      setUploading(null);
    }
  };

  const choose = (doc: DocItem) => onSheet({
    title:   doc.label,
    message: 'How do you want to add it?',
    options: [
      { label: 'Take a photo',        variant: 'primary', icon: 'camera-outline', onPress: () => doUpload(doc.id, 'camera') },
      { label: 'Choose from gallery', icon: 'images-outline',                     onPress: () => doUpload(doc.id, 'library') },
      ...(canAttachFiles()
        ? [{
            label: 'Attach a PDF',
            sub: 'A file from your email or a portal',
            icon: 'document-text-outline' as const,
            onPress: () => doUpload(doc.id, 'document'),
          }]
        : []),
    ],
    cancelLabel: 'Not now',
  });

  const row = (doc: DocItem) => {
    const cfg  = STATUS_CONFIG[doc.status];
    const busy = uploading === doc.id;
    return (
      <View key={doc.id}>
        <Pressable
          style={[styles.docCard, { backgroundColor: theme.background, borderColor: theme.border }, Shadows.xs]}
          onPress={() => doc.status !== 'verified' && choose(doc)}
          disabled={busy || doc.status === 'verified'}
          accessibilityLabel={doc.status === 'expired' ? `${doc.label}, expired, tap to replace` : doc.label}
        >
          <View style={[styles.docIconWrap, { backgroundColor: theme.primary + '15' }]}>
            <doc.Icon size={22} color={theme.primary} strokeWidth={1.5} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.docLabel, { color: theme.text }]}>{doc.label}</Text>
            <Text style={[styles.docDesc, { color: theme.textThird }]} numberOfLines={2}>{doc.desc}</Text>
          </View>
          {busy ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <View style={[styles.statusChip, { backgroundColor: cfg.color + '18' }]}>
              <cfg.Icon size={13} color={cfg.color} strokeWidth={1.75} />
              <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          )}
        </Pressable>
        {/* A rejection is only useful if it says what to change. */}
        {doc.status === 'rejected' && !!doc.rejectionReason && (
          <Text style={[styles.rejectNote, { color: theme.error }]}>{doc.rejectionReason}</Text>
        )}
        {doc.status === 'needs_replacing' && (
          <Text style={[styles.rejectNote, { color: theme.warning }]}>
            {doc.rejectionReason
              ? `${doc.rejectionReason} Nothing is wrong with what you sent. Tap to upload the current one.`
              : 'This is no longer current. Nothing is wrong with what you sent: tap to upload the current one.'}
          </Text>
        )}
        {doc.status === 'expired' && (
          <Text style={[styles.rejectNote, { color: theme.error }]}>
            This expired on {String((doc as any).expiresAt).slice(0, 10)}. Tap it and upload the current one.
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
      <Text style={[styles.cardTitle, { color: theme.text }]}>About you</Text>
      <Text style={[styles.cardHint, { color: theme.textSecond }]}>
        Asked once. These do not change when you change vehicle, so you will not be asked for them again.
      </Text>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.cardHint, { color: theme.textThird }]}>Checking what is on file...</Text>
        </View>
      ) : (
        <View style={{ gap: Spacing.sm }}>
          {docs.filter(d => d.required).map(row)}
          <Text style={[styles.subLabel, { color: theme.textThird }]}>Optional</Text>
          {docs.filter(d => !d.required).map(row)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card:        { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  cardTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  cardHint:    { fontSize: FontSize.xs, lineHeight: 18 },
  subLabel:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any, marginTop: Spacing.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  loadingRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  docCard:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1 },
  docIconWrap: { width: 42, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  docLabel:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold as any },
  docDesc:     { fontSize: FontSize.xs, marginTop: 1 },
  statusChip:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm },
  statusText:  { fontSize: 11, fontWeight: FontWeight.bold as any },
  rejectNote:  { fontSize: FontSize.xs, marginTop: 4, marginLeft: Spacing.sm },
});
