import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Icon } from '@/components/Icon';
import { businessApi } from '@/services/api';

interface PreviewRow {
  recipientName:  string;
  recipientPhone: string;
  address:        string;
  weight?:        string;
  note?:          string;
}

const CSV_HEADERS = ['recipientName', 'recipientPhone', 'address', 'weight', 'note'];

const TEMPLATE_CSV =
  'recipientName,recipientPhone,address,weight,note\n' +
  'Adebayo Adesola,08011223344,"15 Adeola Odeku VI Lagos",2,Leave at reception\n' +
  'Aisha Mohammed,09022334455,"3 Allen Ave Ikeja Lagos",,,\n' +
  'Chinedu Okafor,07033445566,"7 Awolowo Rd Ikoyi Lagos",1,Call on arrival\n';

export default function CsvUploadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [file,      setFile]      = useState<{ name: string; uri: string } | null>(null);
  const [preview,   setPreview]   = useState<PreviewRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState('');

  const pickFile = async () => {
    setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setFile({ name: asset.name, uri: asset.uri });

      // Read and parse the CSV for preview
      const text = await fetch(asset.uri).then((r) => r.text());
      const lines = text.trim().split('\n').slice(1); // skip header
      const rows  = lines.slice(0, 10).map((line) => {
        const cols = parseCsvLine(line);
        return {
          recipientName:  cols[0] ?? '',
          recipientPhone: cols[1] ?? '',
          address:        cols[2] ?? '',
          weight:         cols[3] ?? '',
          note:           cols[4] ?? '',
        };
      });
      setPreview(rows);
    } catch {
      setError('Could not read the file. Please check it is a valid CSV.');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const res = await businessApi.uploadCsv(file.uri, file.name);
      Alert.alert(
        'Bulk Upload Queued',
        `${res.queued ?? preview.length} deliveries have been queued for dispatch.`,
        [{ text: 'View Deliveries', onPress: () => router.replace('/(business)/deliveries' as any) }],
      );
    } catch (e: any) {
      setError(e.message ?? 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    // In production this would use expo-sharing to share the template
    Alert.alert(
      'CSV Template',
      `Column headers:\n${CSV_HEADERS.join(', ')}\n\nExample:\n${TEMPLATE_CSV}`,
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F0' }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={22} color="#0F2B4C" />
        </Pressable>
        <Text style={styles.headerTitle}>CSV Bulk Upload</Text>
        <Pressable onPress={downloadTemplate}>
          <Icon name="Download" size={20} color="#3A7BD5" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>

        {/* Instructions */}
        <View style={styles.infoBox}>
          <Icon name="Info" size={16} color="#3A7BD5" />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>How to use</Text>
            <Text style={styles.infoText}>
              Prepare a CSV with columns: <Text style={styles.bold}>{CSV_HEADERS.join(', ')}</Text>.
              Tap the download icon above for a template. Maximum 500 rows per upload.
            </Text>
          </View>
        </View>

        {/* Upload zone */}
        <Pressable style={styles.dropzone} onPress={pickFile}>
          <View style={styles.dropIcon}>
            <Icon name="Upload" size={28} color={file ? '#16A34A' : '#3A7BD5'} />
          </View>
          {file ? (
            <>
              <Text style={styles.dropTitle}>{file.name}</Text>
              <Text style={styles.dropSub}>Tap to change file</Text>
            </>
          ) : (
            <>
              <Text style={styles.dropTitle}>Select CSV file</Text>
              <Text style={styles.dropSub}>Tap to browse your device</Text>
            </>
          )}
        </Pressable>

        {error !== '' && (
          <View style={styles.errorBox}>
            <Icon name="AlertCircle" size={16} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Preview table */}
        {preview.length > 0 && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>
              Preview — {preview.length} row{preview.length !== 1 ? 's' : ''} (first 10)
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                {/* Table header */}
                <View style={[styles.tableRow, styles.tableHead]}>
                  {['Name', 'Phone', 'Address', 'kg', 'Note'].map((h) => (
                    <Text key={h} style={styles.thCell}>{h}</Text>
                  ))}
                </View>
                {preview.map((row, i) => (
                  <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                    <Text style={styles.tdCell}>{row.recipientName || '—'}</Text>
                    <Text style={styles.tdCell}>{row.recipientPhone || '—'}</Text>
                    <Text style={[styles.tdCell, { maxWidth: 160 }]} numberOfLines={1}>{row.address || '—'}</Text>
                    <Text style={styles.tdCell}>{row.weight || '—'}</Text>
                    <Text style={[styles.tdCell, { maxWidth: 100 }]} numberOfLines={1}>{row.note || '—'}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Submit */}
      {file && (
        <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            style={[styles.ctaBtn, uploading && styles.ctaBtnDisabled]}
            onPress={handleUpload}
            disabled={uploading}
          >
            {uploading
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Icon name="Send" size={18} color="#fff" />
                  <Text style={styles.ctaBtnText}>Upload & Dispatch {preview.length} Deliveries</Text>
                </>
            }
          </Pressable>
        </View>
      )}
    </View>
  );
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

const styles = StyleSheet.create({
  header:       {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerTitle:  { fontSize: 16, fontWeight: '700', color: '#0F2B4C' },
  infoBox:      {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#EBF3FF', borderRadius: 12, padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  infoTitle:    { fontSize: 13, fontWeight: '700', color: '#0F2B4C', marginBottom: 4 },
  infoText:     { fontSize: 12, color: '#374151', lineHeight: 18 },
  bold:         { fontWeight: '700' },
  dropzone:     {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 40,
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, borderStyle: 'dashed',
    borderColor: '#D1D5DB', marginBottom: 20,
  },
  dropIcon:     {
    width: 64, height: 64, borderRadius: 18, backgroundColor: '#F0F5FF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  dropTitle:    { fontSize: 15, fontWeight: '700', color: '#0F2B4C', marginBottom: 4 },
  dropSub:      { fontSize: 13, color: '#6B7280' },
  errorBox:     {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorText:    { color: '#DC2626', fontSize: 13, flex: 1 },
  previewCard:  {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E5E7EB',
  },
  previewTitle: { fontSize: 13, fontWeight: '700', color: '#0F2B4C', marginBottom: 12 },
  tableRow:     { flexDirection: 'row' },
  tableHead:    { borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 4 },
  tableRowAlt:  { backgroundColor: '#F9FAFB' },
  thCell:       { width: 100, fontSize: 11, fontWeight: '700', color: '#6B7280', paddingVertical: 6, paddingHorizontal: 4 },
  tdCell:       { width: 100, fontSize: 12, color: '#0F2B4C', paddingVertical: 8, paddingHorizontal: 4 },
  cta:          {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 20, backgroundColor: '#F5F5F0',
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  ctaBtn:       {
    backgroundColor: '#0F2B4C', borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  ctaBtnDisabled: { opacity: 0.5 },
  ctaBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
});
