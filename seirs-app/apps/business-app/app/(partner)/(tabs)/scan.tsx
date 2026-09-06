import { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Vibration } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Icon } from '@/components/Icon';
import { partnerApi } from '@/services/api';
import { useRouter } from 'expo-router';
import { useColors } from '@/context/ThemeContext';

import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
type ScanResult = { trackingNumber: string; recipientName: string; status: string };

export default function ScanScreen() {
  const insets    = useSafeAreaInsets();
  const router    = useRouter();
  const colors    = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning,   setScanning]   = useState(true);
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<ScanResult | null>(null);
  const [error,      setError]      = useState('');
  const lastScan    = useRef<string | null>(null);
  const cooldown    = useRef(false);

  if (!permission) {
    return <View style={[styles.centered, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <Icon name="Camera" size={48} color={colors.textThird} />
        <Text style={[styles.permTitle, { color: colors.text }]}>{tx('auto.scan.cameraAccessRequired', 'Camera Access Required')}</Text>
        <Text style={[styles.permSub, { color: colors.textSecond }]}>{tx('auto.scan.seirsNeedsCameraAccessTo', 'Seirs needs camera access to scan package QR codes')}</Text>
        <Pressable style={[styles.permBtn, { backgroundColor: colors.primary }]} onPress={requestPermission}>
          <Text style={styles.permBtnText}>{tx('auto.scan.grantPermission', 'Grant Permission')}</Text>
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
      alertDialog(
        'Collection Confirmed',
        `${result.recipientName}'s package has been marked as collected.`,
        [{ text: tr('auto.scan.scanAnother', 'Scan Another'), onPress: reset }, { text: tr('auto.scan.goToInventory', 'Go to Inventory'), onPress: () => router.push('/(partner)/inventory' as any) }],
      );
    } catch (e: any) {
      alertDialog('Error', e.message ?? 'Could not mark as collected.');
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
        <Text style={styles.overlayTitle}>{tx('auto.scan.scanPackageQr', 'Scan Package QR')}</Text>
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
          <Text style={styles.finderHint}>{tx('auto.scan.pointCameraAtThePackage', 'Point camera at the package QR code')}</Text>
        </View>
      )}

      {/* Loading */}
      {loading && (
        <View style={styles.finderWrap}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.finderHint}>{tr('auto.scan.lookingUpPackage', 'Looking up package…')}</Text>
        </View>
      )}

      {error !== '' && (
        <View style={[styles.resultSheet, { paddingBottom: insets.bottom + 24, backgroundColor: colors.surface }]}>
          <View style={styles.resultIcon}>
            <Icon name="AlertCircle" size={32} color="#DC2626" />
          </View>
          <Text style={[styles.resultTitle, { color: colors.text }]}>{tx('auto.scan.notFound', 'Not Found')}</Text>
          <Text style={[styles.resultSub, { color: colors.textSecond }]}>{error}</Text>
          <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={reset}>
            <Text style={styles.retryBtnText}>{tx('auto.scan.tryAgain', 'Try Again')}</Text>
          </Pressable>
        </View>
      )}

      {result && !loading && (
        <View style={[styles.resultSheet, { paddingBottom: insets.bottom + 24, backgroundColor: colors.surface }]}>
          <View style={[styles.resultIcon, { backgroundColor: '#DCFCE7' }]}>
            <Icon name="PackageCheck" size={32} color="#16A34A" />
          </View>
          <Text style={[styles.resultTitle, { color: colors.text }]}>{result.recipientName}</Text>
          <Text style={[styles.resultTrack, { color: colors.textSecond }]}>{result.trackingNumber}</Text>
          <View style={[styles.statusBadge, { backgroundColor: '#DCFCE7' }]}>
            <Text style={[styles.statusText, { color: '#16A34A' }]}>
              {result.status.replace(/_/g, ' ')}
            </Text>
          </View>
          <Text style={[styles.resultSub, { color: colors.textSecond }]}>
            {tr('auto.scan.confirmThisCustomerHasPresented', 'Confirm this customer has presented valid ID and is collecting their package.')}
          </Text>
          <View style={styles.resultBtns}>
            <Pressable style={[styles.cancelBtn, { backgroundColor: colors.background, borderColor: colors.border }]} onPress={reset}>
              <Text style={[styles.cancelBtnText, { color: colors.textSecond }]}>{tx('auto.scan.cancel', 'Cancel')}</Text>
            </Pressable>
            <Pressable style={[styles.confirmBtn, { backgroundColor: colors.primary }]} onPress={confirmCollect} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.confirmBtnText}>{tx('auto.scan.confirmCollection', 'Confirm Collection')}</Text>}
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
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  permTitle:   { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  permSub:     { fontSize: 15, textAlign: 'center' },
  permBtn:     { borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14 },
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
  finderHint:  { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center' },
  resultSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24,
    alignItems: 'center',
  },
  // Error variant defaults to red-tinted; success overrides to green inline
  resultIcon:  {
    width: 70, height: 70, borderRadius: 20, backgroundColor: '#FEF2F2',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  resultTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  resultTrack: { fontSize: 14, fontFamily: 'monospace', marginBottom: 10 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 12 },
  statusText:  { fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  resultSub:   { fontSize: 14, textAlign: 'center', marginBottom: 24 },
  resultBtns:  { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn:   { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  cancelBtnText: { fontWeight: '600', fontSize: 15 },
  confirmBtn:  { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  retryBtn:    { borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14, marginTop: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
