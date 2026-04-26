import {
  View, Text, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  not_uploaded: { label: 'Not Uploaded', color: '#9CA3AF', icon: '⬜' },
  uploaded:     { label: 'Under Review', color: '#FACC15', icon: '🕐' },
  verified:     { label: 'Verified',     color: '#22C55E', icon: '✅' },
  rejected:     { label: 'Rejected',     color: '#EF4444', icon: '❌' },
};

const INITIAL_DOCS: DocItem[] = [
  { id: 'national_id',     label: 'National ID / NIN',   icon: '🪪', desc: 'Government-issued national ID or NIN slip',          status: 'not_uploaded', required: true  },
  { id: 'selfie',          label: 'Selfie with ID',       icon: '🤳', desc: 'Hold your ID next to your face',                     status: 'not_uploaded', required: true  },
  { id: 'vehicle_doc',     label: 'Vehicle Document',     icon: '📋', desc: 'Vehicle registration / roadworthiness certificate',  status: 'not_uploaded', required: true  },
  { id: 'drivers_license', label: "Driver's Licence",     icon: '🚗', desc: "Valid driver's licence",                            status: 'not_uploaded', required: true  },
  { id: 'guarantor',       label: 'Guarantor Letter',     icon: '📝', desc: 'Letter from a guarantor (optional but recommended)', status: 'not_uploaded', required: false },
];

export default function KycScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const [docs,      setDocs]      = useState<DocItem[]>(INITIAL_DOCS);
  const [uploading, setUploading] = useState<string | null>(null);

  const verified = docs.filter(d => d.status === 'verified').length;
  const total    = docs.filter(d => d.required).length;
  const progress = (verified / total) * 100;

  const handleUpload = async (docId: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      // Try camera as fallback
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (cam.status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library or camera access is needed to upload documents.');
        return;
      }
    }

    Alert.alert(
      'Upload Document',
      'Choose how to provide the document',
      [
        {
          text: 'Camera',
          onPress: async () => pickAndUpload(docId, 'camera'),
        },
        {
          text: 'Photo Library',
          onPress: async () => pickAndUpload(docId, 'library'),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const pickAndUpload = async (docId: string, source: 'camera' | 'library') => {
    let result: ImagePicker.ImagePickerResult;

    if (source === 'camera') {
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
      });
    } else {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
      });
    }

    if (result.canceled || !result.assets[0]) return;

    setUploading(docId);
    try {
      const { url } = await uploadApi.file(result.assets[0].uri);
      setDocs(prev =>
        prev.map(d => d.id === docId ? { ...d, status: 'uploaded', url } : d)
      );
    } catch (e: any) {
      Alert.alert('Upload Failed', e.message ?? 'Could not upload document. Please try again.');
    } finally {
      setUploading(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Verification (KYC)</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            Complete verification to start accepting jobs
          </Text>
        </View>

        {/* Progress */}
        <View style={[styles.progressCard, { backgroundColor: theme.surface }, Shadows.sm]}>
          <View style={styles.progressRow}>
            <Text style={[styles.progressLabel, { color: theme.text }]}>{verified}/{total} documents verified</Text>
            <Text style={[styles.progressPct, { color: theme.primary }]}>{Math.round(progress)}%</Text>
          </View>
          <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
            <View style={[styles.progressFill, { backgroundColor: theme.primary, width: `${progress}%` }]} />
          </View>
          {verified === total ? (
            <Text style={[styles.progressNote, { color: theme.success }]}>
              ✅ All documents verified! You can now accept deliveries.
            </Text>
          ) : (
            <Text style={[styles.progressNote, { color: theme.textSecond }]}>
              Documents are reviewed within 24 hours.
            </Text>
          )}
        </View>

        {/* Document list */}
        <View style={styles.section}>
          {docs.map((doc) => {
            const cfg = STATUS_CONFIG[doc.status];
            return (
              <View key={doc.id} style={[styles.docCard, { backgroundColor: theme.surface }, Shadows.sm]}>
                <View style={styles.docLeft}>
                  <Text style={styles.docIcon}>{doc.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={styles.docTitleRow}>
                      <Text style={[styles.docLabel, { color: theme.text }]}>{doc.label}</Text>
                      {!doc.required && (
                        <View style={[styles.optBadge, { backgroundColor: theme.surfaceSecond }]}>
                          <Text style={[styles.optText, { color: theme.textSecond }]}>Optional</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.docDesc, { color: theme.textSecond }]}>{doc.desc}</Text>
                    <View style={styles.statusRow}>
                      <Text style={styles.statusIcon}>{cfg.icon}</Text>
                      <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                    {doc.url && doc.status === 'uploaded' && (
                      <Image source={{ uri: doc.url }} style={styles.thumb} resizeMode="cover" />
                    )}
                  </View>
                </View>

                {(doc.status === 'not_uploaded' || doc.status === 'rejected') && (
                  <Pressable
                    style={[styles.uploadBtn, { backgroundColor: theme.primary }]}
                    onPress={() => handleUpload(doc.id)}
                    disabled={uploading === doc.id}
                  >
                    {uploading === doc.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.uploadBtnText}>
                        {doc.status === 'rejected' ? 'Re-upload' : 'Upload'}
                      </Text>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        <View style={[styles.infoBox, { backgroundColor: theme.surfaceSecond }]}>
          <Text style={[styles.infoTitle, { color: theme.text }]}>🔒 Your data is secure</Text>
          <Text style={[styles.infoText, { color: theme.textSecond }]}>
            Documents are encrypted and used only for identity verification. They are not shared with third parties.
          </Text>
        </View>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:        { padding: Spacing.xl, paddingBottom: Spacing.md },
  title:         { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold },
  subtitle:      { fontSize: FontSize.sm, marginTop: 4, lineHeight: 20 },
  progressCard:  { marginHorizontal: Spacing.xl, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg },
  progressRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  progressLabel: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  progressPct:   { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  progressBar:   { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: Spacing.sm },
  progressFill:  { height: '100%', borderRadius: 4 },
  progressNote:  { fontSize: FontSize.xs },
  section:       { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  docCard:       { borderRadius: Radius.lg, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  docLeft:       { flex: 1, flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  docIcon:       { fontSize: 28, marginTop: 2 },
  docTitleRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  docLabel:      { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  optBadge:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  optText:       { fontSize: 10, fontWeight: FontWeight.medium },
  docDesc:       { fontSize: FontSize.xs, lineHeight: 16, marginBottom: Spacing.xs },
  statusRow:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusIcon:    { fontSize: 12 },
  statusLabel:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  thumb:         { width: '100%', height: 80, borderRadius: Radius.sm, marginTop: Spacing.xs },
  uploadBtn:     { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.md, minWidth: 80, alignItems: 'center' },
  uploadBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  infoBox:       { margin: Spacing.xl, borderRadius: Radius.md, padding: Spacing.md },
  infoTitle:     { fontSize: FontSize.base, fontWeight: FontWeight.semibold, marginBottom: Spacing.xs },
  infoText:      { fontSize: FontSize.sm, lineHeight: 20 },
});
