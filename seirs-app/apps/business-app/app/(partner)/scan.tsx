import { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, Vibration } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Icon } from '@/components/Icon';
import { partnerApi } from '@/services/api';
import { useRouter } from 'expo-router';

type ScanResult = { trackingNumber: string; recipientName: string; status: string };

export default function ScanScreen() {
  const insets    = useSafeAreaInsets();
  const router    = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning,   setScanning]   = useState(true);
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<ScanResult | null>(null);
  const [error,      setError]      = useState('');
  const lastScan    = useRef<string | null>(null);
  const cooldown    = useRef(false);

  if (!permission) {
    return <View style={styles.centered}><ActivityIndicator color="#3A7BD5" /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Icon name="Camera" size={48} color="#D1D5DB" />
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permSub}>Seirs needs camera access to scan package QR codes</Text>
        <Pressable style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  const handleBarcode = async ({ data }: { data: string }) => {
    if (!scanning || loading || cooldown.current || data === lastScan.current) return;

    cooldown.current = true;
    lastScan.current = data;
    Vibration.vibrate(80);
    setScanning(false);
    setLoading(true);
    setError('');

    try {
      const res = await partnerApi.scanPackage(data);
      setResult(res);
    } catch (e: any) {
      setError(e.message ?? 'Package not found. Please check the QR code.');
      setScanning(true);
      setTimeout(() => { cooldown.current = false; lastScan.current = null; }, 2000);
    } finally {
      setLoading(false);
    }
  };

  const confirmCollect = async () => {
    if (!result) return;
    setLoading(true);
    try {
      await partnerApi.markCollected(result.trackingNumber);
      Alert.alert(
        'Collection Confirmed',
        `${result.recipientName}'s package has been marked as collected.`,
        [{ text: 'Scan Another', onPress: reset }, { text: 'Go to Inventory', onPress: () => router.push('/(partner)/inventory' as any) }],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not mark as collected.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError('');
    lastScan.current = null;
    cooldown.current = false;
    setScanning(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {scanning && (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39'] }}
          onBarcodeScanned={handleBarcode}
        />
      )}

      {/* Overlay */}
      <View style={[styles.overlay, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.closeBtn} onPress={() => router.back()}>
          <Icon name="X" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.overlayTitle}>Scan Package QR</Text>
      </View>

      {/* Finder */}
      {scanning && !loading && (
        <View style={styles.finderWrap}>
          <View style={styles.finder}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.finderHint}>Point camera at the package QR code</Text>
        </View>
      )}

      {/* Loading */}
      {loading && (
        <View style={styles.finderWrap}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.finderHint}>Looking up package…</Text>
        </View>
      )}

      {/* Error */}
      {error !== '' && (
        <View style={[styles.resultSheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.resultIcon}>
            <Icon name="AlertCircle" size={32} color="#DC2626" />
          </View>
          <Text style={styles.resultTitle}>Not Found</Text>
          <Text style={styles.resultSub}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={reset}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </Pressable>
        </View>
      )}

      {/* Success result */}
      {result && !loading && (
        <View style={[styles.resultSheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={[styles.resultIcon, { backgroundColor: '#DCFCE7' }]}>
            <Icon name="PackageCheck" size={32} color="#16A34A" />
          </View>
          <Text style={styles.resultTitle}>{result.recipientName}</Text>
          <Text style={styles.resultTrack}>{result.trackingNumber}</Text>
          <View style={[styles.statusBadge, { backgroundColor: '#DCFCE7' }]}>
            <Text style={[styles.statusText, { color: '#16A34A' }]}>
              {result.status.replace(/_/g, ' ')}
            </Text>
          </View>
          <Text style={styles.resultSub}>
            Confirm this customer has presented valid ID and is collecting their package.
          </Text>
          <View style={styles.resultBtns}>
            <Pressable style={styles.cancelBtn} onPress={reset}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.confirmBtn} onPress={confirmCollect} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.confirmBtnText}>Confirm Collection</Text>
              }
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const CORNER_SIZE = 24;
const CORNER_THICK = 3;

const styles = StyleSheet.create({
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#F5F5F0', gap: 16 },
  permTitle:   { fontSize: 18, fontWeight: '700', color: '#0F2B4C', textAlign: 'center' },
  permSub:     { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  permBtn:     { backgroundColor: '#0F2B4C', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14 },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  overlay:     { position: 'absolute', top: 0, left: 0, right: 0, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  closeBtn:    {
    width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  overlayTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  finderWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  finder:      { width: 220, height: 220, position: 'relative' },
  corner:      { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: '#fff' },
  cornerTL:    { top: 0, left: 0, borderTopWidth: CORNER_THICK, borderLeftWidth: CORNER_THICK, borderTopLeftRadius: 4 },
  cornerTR:    { top: 0, right: 0, borderTopWidth: CORNER_THICK, borderRightWidth: CORNER_THICK, borderTopRightRadius: 4 },
  cornerBL:    { bottom: 0, left: 0, borderBottomWidth: CORNER_THICK, borderLeftWidth: CORNER_THICK, borderBottomLeftRadius: 4 },
  cornerBR:    { bottom: 0, right: 0, borderBottomWidth: CORNER_THICK, borderRightWidth: CORNER_THICK, borderBottomRightRadius: 4 },
  finderHint:  { color: 'rgba(255,255,255,0.8)', fontSize: 13, textAlign: 'center' },
  resultSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24,
    alignItems: 'center',
  },
  resultIcon:  {
    width: 70, height: 70, borderRadius: 20, backgroundColor: '#FEF2F2',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  resultTitle: { fontSize: 20, fontWeight: '800', color: '#0F2B4C', marginBottom: 4 },
  resultTrack: { fontSize: 13, color: '#6B7280', fontFamily: 'monospace', marginBottom: 10 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 12 },
  statusText:  { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  resultSub:   { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  resultBtns:  { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn:   {
    flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#F5F5F0',
    alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB',
  },
  cancelBtnText: { color: '#374151', fontWeight: '600', fontSize: 15 },
  confirmBtn:  { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: '#0F2B4C', alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  retryBtn:    { backgroundColor: '#0F2B4C', borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14, marginTop: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
