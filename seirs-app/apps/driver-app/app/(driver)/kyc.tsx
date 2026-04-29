import {
  View, Text, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { uploadApi } from '@/services/api';

type DocStatus = 'not_uploaded' | 'uploaded' | 'verified' | 'rejected';

interface DocItem {
  id:       string;
  label:    string;
  desc:     string;
  icon:     string;
  status:   DocStatus;
  required: boolean;
  url?:     string;
}

const STATUS_CONFIG: Record<DocStatus, { label: string; color: string; icon: string }> = {
  not_uploaded: { label: 'Not Uploaded', color: '#A1A1AA', icon: 'ellipse-outline' },
  uploaded:     { label: 'Under Review', color: '#FACC15', icon: 'time-outline' },
  verified:     { label: 'Verified',     color: '#22C55E', icon: 'checkmark-circle' },
  rejected:     { label: 'Rejected',     color: '#EF4444', icon: 'close-circle' },
};

const INITIAL_DOCS: DocItem[] = [
  { id: 'national_id',     label: 'National ID / NIN',   icon: 'card-outline',          desc: 'Government-issued national ID or NIN slip',          status: 'not_uploaded', required: true  },
  { id: 'selfie',          label: 'Selfie with ID',       icon: 'camera-outline',        desc: 'Hold your ID next to your face',                     status: 'not_uploaded', required: true  },
  { id: 'vehicle_doc',     label: 'Vehicle Document',     icon: 'document-text-outline', desc: 'Vehicle registration / roadworthiness certificate',  status: 'not_uploaded', required: true  },
  { id: 'drivers_license', label: "Driver's Licence",     icon: 'car-outline',           desc: "Valid driver's licence",                             status: 'not_uploaded', required: true  },
  { id: 'guarantor',       label: 'Guarantor Letter',     icon: 'people-outline',        desc: 'Letter from a guarantor (optional but recommended)', status: 'not_uploaded', required: false },
];

export default function KycScreen() {
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];

  const [docs,      setDocs]      = useState<DocItem[]>(INITIAL_DOCS);
  const [uploading, setUploading] = useState<string | null>(null);

  const verified = docs.filter(d => d.status === 'verified').length;
  const total    = docs.filter(d => d.required).length;
  const progress = total > 0 ? (verified / total) * 100 : 0;

  const handleUpload = async (docId: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (cam.status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library or camera access is needed to upload documents.');
        return;
      }
    }
    Alert.alert('Upload Document', 'Choose how to provide the document', [
      { text: 'Camera',       onPress: () => pickAndUpload(docId, 'camera') },
      { text: 'Photo Library', onPress: () => pickAndUpload(docId, 'library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickAndUpload = async (docId: string, source: 'camera' | 'library') => {
    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: true });
    } else {
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: true });
    }
    if (result.canceled || !result.assets[0]) return;
    setUploading(docId);
    try {
      const { url } = await uploadApi.file(result.assets[0].uri);
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, status: 'uploaded', url } : d));
    } catch (e: any) {
      Alert.alert('Upload Failed', e.message ?? 'Could not upload document. Please try again.');
    } finally {
      setUploading(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.xl }}>

        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Verification (KYC)</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            Complete verification to start accepting jobs
          </Text>
        </View>

        {/* Progress card */}
        <View style={[styles.progressCard, { backgroundColor: theme.surface }, Shadows.sm]}>
          <View style={styles.progressRow}>
            <Text style={[styles.progressLabel, { color: theme.text }]}>{verified}/{total} documents verified</Text>
            <Text style={[styles.progressPct, { color: theme.primary }]}>{Math.round(progress)}%</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
            <View style={[styles.progressFill, { backgroundColor: theme.primary, width: `${progress}%` }]} />
          </View>
          {verified === total ? (
            <View style={styles.progressNoteRow}>
              <Ionicons name="checkmark-circle" size={15} color={theme.success} />
              <Text style={[styles.progressNote, { color: theme.success }]}>
                All documents verified! You can now accept deliveries.
              </Text>
            </View>
          ) : (
            <View style={styles.progressNoteRow}>
              <Ionicons name="time-outline" size={15} color={theme.textSecond} />
              <Text style={[styles.progressNote, { color: theme.textSecond }]}>
                Documents are reviewed within 24 hours.
              </Text>
            </View>
          )}
        </View>

        {/* Document list */}
        <View style={styles.docSection}>
          {docs.map((doc) => {
            const cfg = STATUS_CONFIG[doc.status];
            return (
              <View key={doc.id} style={[styles.docCard, { backgroundColor: theme.surface }, Shadows.sm]}>
                <View style={[styles.docIconWrap, { backgroundColor: theme.surfaceSecond }]}>
                  <Ionicons name={doc.icon as any} size={24} color={theme.textSecond} />
                </View>
                <View style={styles.docInfo}>
                  <View style={styles.docTitleRow}>
                    <Text style={[styles.docLabel, { color: theme.text }]}>{doc.label}</Text>
                    {!doc.required && (
                      <View style={[styles.optBadge, { backgroundColor: theme.border }]}>
                        <Text style={[styles.optText, { color: theme.textSecond }]}>Optional</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.docDesc, { color: theme.textSecond }]}>{doc.desc}</Text>
                  <View style={styles.statusRow}>
                    <Ionicons name={cfg.icon as any} size={13} color={cfg.color} />
                    <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                  {doc.url && doc.status === 'uploaded' && (
                    <Image source={{ uri: doc.url }} style={styles.thumb} resizeMode="cover" />
                  )}
                </View>
                {(doc.status === 'not_uploaded' || doc.status === 'rejected') && (
                  <Pressable
                    style={[styles.uploadBtn, { backgroundColor: doc.status === 'rejected' ? theme.error : theme.primary }]}
                    onPress={() => handleUpload(doc.id)}
                    disabled={uploading === doc.id}
                  >
                    {uploading === doc.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name={doc.status === 'rejected' ? 'reload-outline' : 'cloud-upload-outline'} size={14} color="#fff" />
                        <Text style={styles.uploadBtnText}>{doc.status === 'rejected' ? 'Re-upload' : 'Upload'}</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        {/* Security note */}
        <View style={[styles.infoBox, { backgroundColor: theme.surfaceSecond }]}>
          <View style={styles.infoTitleRow}>
            <Ionicons name="lock-closed-outline" size={16} color={theme.textSecond} />
            <Text style={[styles.infoTitle, { color: theme.text }]}>Your data is secure</Text>
          </View>
          <Text style={[styles.infoText, { color: theme.textSecond }]}>
            Documents are encrypted and used only for identity verification. They are not shared with third parties.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:   { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  title:    { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  subtitle: { fontSize: FontSize.sm, marginTop: 2, lineHeight: 20 },

  progressCard:     { marginHorizontal: Spacing.md, borderRadius: Radius.xl, padding: Spacing.md, marginBottom: Spacing.md, gap: Spacing.sm },
  progressRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel:    { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  progressPct:      { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  progressTrack:    { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill:     { height: '100%', borderRadius: 4 },
  progressNoteRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressNote:     { fontSize: FontSize.xs, flex: 1 },

  docSection: { paddingHorizontal: Spacing.md, gap: Spacing.sm },
  docCard:    { borderRadius: Radius.xl, padding: Spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  docIconWrap:{ width: 48, height: 48, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  docInfo:    { flex: 1, gap: 3 },
  docTitleRow:{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  docLabel:   { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  optBadge:   { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  optText:    { fontSize: 10, fontWeight: FontWeight.medium },
  docDesc:    { fontSize: FontSize.xs, lineHeight: 16 },
  statusRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusLabel:{ fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  thumb:      { width: '100%', height: 80, borderRadius: Radius.md, marginTop: Spacing.xs },
  uploadBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, borderRadius: Radius.lg, alignSelf: 'flex-start' },
  uploadBtnText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  infoBox:      { margin: Spacing.md, borderRadius: Radius.xl, padding: Spacing.md, gap: Spacing.xs },
  infoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  infoTitle:    { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  infoText:     { fontSize: FontSize.sm, lineHeight: 20 },
});
