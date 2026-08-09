/**
 * Gap 5: QR scan at hand-off.
 *
 * The customer's app shows a QR of the delivery's tracking code
 * (public code, zero PII). The driver scans it here before confirming
 * delivery, proving the right package is meeting the right recipient.
 * Wrong-recipient hand-offs are one of the four failure modes SEIRS
 * engineers out of the flow.
 *
 * Route params: code (expected trackingCode), optional label.
 * On match: full-screen green confirmation, auto-pops back after 1.6s.
 * On mismatch: red banner + scanner re-arms after a cooldown.
 *
 * Verification here is a trust aid for the driver; the authoritative
 * chain-of-custody record stays with the identity hand-off flow
 * (signature.tsx). Server-side scan logging lands post-launch via the
 * delivery_events SCAN type.
 */
import { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Vibration, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { deliveriesApi } from '@/services/api';

export default function ScanPackageScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const params = useLocalSearchParams<{ code?: string; label?: string; deliveryId?: string }>();
  const expected = (params.code ?? '').trim().toUpperCase();
  const deliveryId = params.deliveryId ?? '';

  const [permission, requestPermission] = useCameraPermissions();
  const [result,   setResult]   = useState<'idle' | 'match' | 'mismatch'>('idle');
  const [lastSeen, setLastSeen] = useState('');
  const cooldown = useRef(false);

  const onBarcode = ({ data }: { data: string }) => {
    if (cooldown.current || result === 'match') return;
    cooldown.current = true;

    const scanned = (data ?? '').trim().toUpperCase();
    setLastSeen(scanned);

    // Audit copy: log the scan server-side (delivery_events SCAN type)
    // regardless of outcome. Fire-and-forget; the local verdict below
    // never waits on the network.
    if (deliveryId) {
      deliveriesApi.scanVerify(deliveryId, scanned).catch(() => {});
    }

    if (expected && scanned === expected) {
      Vibration.vibrate([0, 60, 60, 60]);
      setResult('match');
      // Auto-pop back to the active-delivery screen after the driver
      // has seen the confirmation.
      setTimeout(() => router.back(), 1600);
    } else {
      Vibration.vibrate(200);
      setResult('mismatch');
      setTimeout(() => {
        setResult('idle');
        cooldown.current = false;
      }, 1800);
    }
  };

  if (!permission) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.background, gap: 14, paddingHorizontal: 40 }]}>
        <Ionicons name="camera-outline" size={48} color={theme.textThird} />
        <Text style={[styles.permTitle, { color: theme.text }]}>Camera access required</Text>
        <Text style={[styles.permBody, { color: theme.textSecond }]}>
          SEIRS needs the camera to scan the customer&apos;s package QR before hand-off.
        </Text>
        <Pressable style={[styles.permBtn, { backgroundColor: theme.primary }]} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant permission</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: theme.textSecond, fontSize: FontSize.sm }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['top', 'bottom']}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={result === 'match' ? undefined : onBarcode}
      />

      {/* Header overlay */}
      <View style={styles.headerOverlay}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10}>
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Scan package QR</Text>
          <Text style={styles.headerSub}>
            Ask the customer to open their tracking screen and tap &quot;Show package QR&quot;.
          </Text>
        </View>
      </View>

      {/* Scan frame */}
      <View style={styles.frameWrap} pointerEvents="none">
        <View style={[
          styles.frame,
          result === 'match'    && { borderColor: '#22C55E' },
          result === 'mismatch' && { borderColor: '#EF4444' },
        ]} />
      </View>

      {/* Result banners */}
      {result === 'match' && (
        <View style={[styles.resultBanner, { backgroundColor: '#16A34A' }]}>
          <Ionicons name="checkmark-circle" size={40} color="#fff" />
          <Text style={styles.resultTitle}>Package verified</Text>
          <Text style={styles.resultSub}>
            {expected}{'\n'}Hand it over and confirm delivery.
          </Text>
        </View>
      )}
      {result === 'mismatch' && (
        <View style={[styles.resultBanner, { backgroundColor: '#DC2626' }]}>
          <Ionicons name="alert-circle" size={40} color="#fff" />
          <Text style={styles.resultTitle}>Wrong package</Text>
          <Text style={styles.resultSub}>
            Scanned {lastSeen || 'an unknown code'}{'\n'}Expected {expected}. Do not hand over.
          </Text>
        </View>
      )}
      {result === 'idle' && expected !== '' && (
        <View style={styles.expectWrap} pointerEvents="none">
          <Text style={styles.expectText}>Expecting {expected}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  permTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold, textAlign: 'center' },
  permBody:    { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  permBtn:     { paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.lg, marginTop: 6 },
  permBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  headerOverlay: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md,
  },
  closeBtn:   { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  headerTitle:{ color: '#fff', fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  headerSub:  { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.xs, marginTop: 4, lineHeight: 17 },

  frameWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  frame:     { width: 240, height: 240, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', borderRadius: 24 },

  resultBanner: {
    position: 'absolute', left: 24, right: 24, bottom: 60,
    borderRadius: Radius.xl, padding: 20, alignItems: 'center', gap: 6,
  },
  resultTitle: { color: '#fff', fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  resultSub:   { color: 'rgba(255,255,255,0.9)', fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },

  expectWrap: { position: 'absolute', left: 0, right: 0, bottom: 70, alignItems: 'center' },
  expectText: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, overflow: 'hidden' },
});
