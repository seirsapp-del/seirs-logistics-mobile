import {
  View, Text, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows, Palette } from '@/constants/theme';
import { deliveriesApi, driversApi, uploadApi } from '@/services/api';

const STATUS_STEPS = [
  { key: 'assigned',   label: 'Head to Pickup',    icon: '🗺️',  action: 'Mark Picked Up',    next: 'picked_up'  },
  { key: 'picked_up',  label: 'Package Collected',  icon: '📦',  action: 'Start Delivery',    next: 'in_transit' },
  { key: 'in_transit', label: 'En Route',            icon: '🚀',  action: 'Confirm Delivered', next: 'delivered'  },
  { key: 'delivered',  label: 'Delivered!',           icon: '✅',  action: null,                next: null         },
];

const STATUS_COLOR: Record<string, string> = {
  assigned:   Palette.info,
  picked_up:  Palette.orange500,
  in_transit: '#8B5CF6',
  delivered:  '#22C55E',
};

export default function ActiveDeliveryScreen() {
  const { id }      = useLocalSearchParams<{ id: string }>();
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];

  const [delivery,   setDelivery]   = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [updating,   setUpdating]   = useState(false);
  const [proofUri,   setProofUri]   = useState<string | null>(null);
  const [proofReady, setProofReady] = useState(false);

  const locationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!id) return;
    deliveriesApi.track(id)
      .then(setDelivery)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    startBroadcast();
    return () => stopBroadcast();
  }, []);

  const startBroadcast = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    locationInterval.current = setInterval(async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await driversApi.updateLocation(pos.coords.latitude, pos.coords.longitude);
      } catch { /* skip */ }
    }, 5000);
  };

  const stopBroadcast = () => {
    if (locationInterval.current) {
      clearInterval(locationInterval.current);
      locationInterval.current = null;
    }
  };

  // ── Proof of delivery photo ────────────────────────────────────────────────
  const takeProofPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is needed to take a proof of delivery photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setProofUri(result.assets[0].uri);
      setProofReady(true);
    }
  };

  // ── Advance status ─────────────────────────────────────────────────────────
  const advanceStatus = async () => {
    if (!delivery) return;
    const step = STATUS_STEPS.find(s => s.key === delivery.status);
    if (!step?.next) return;

    const nextStatus = step.next;

    if (nextStatus === 'delivered') {
      if (!proofReady) {
        Alert.alert(
          'Proof of Delivery Required',
          'Please take a photo of the delivered package before confirming.',
          [
            { text: 'Take Photo', onPress: takeProofPhoto },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
        return;
      }
      Alert.alert(
        'Confirm Delivery',
        'Has the package been handed to the recipient?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes, Delivered', onPress: () => doUpdate(nextStatus) },
        ],
      );
    } else {
      doUpdate(nextStatus);
    }
  };

  const doUpdate = async (nextStatus: string) => {
    setUpdating(true);
    try {
      let photoUrl: string | undefined;

      if (nextStatus === 'delivered' && proofUri) {
        const uploaded = await uploadApi.file(proofUri);
        photoUrl = uploaded.url;
      }

      await deliveriesApi.updateStatus(delivery.id, nextStatus as any, photoUrl);

      if (nextStatus === 'delivered') {
        stopBroadcast();
        Alert.alert(
          'Delivery Complete!',
          `You've successfully delivered ${delivery.trackingCode}.\n\nPayment will be credited to your wallet shortly.`,
          [{ text: 'Back to Jobs', onPress: () => router.replace('/(driver)') }],
        );
      } else {
        setDelivery((prev: any) => ({ ...prev, status: nextStatus }));
      }
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not update delivery status.');
    } finally {
      setUpdating(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  if (!delivery) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Delivery not found</Text>
          <Pressable onPress={() => router.back()} style={[styles.btn, { backgroundColor: theme.primary, marginTop: Spacing.lg }]}>
            <Text style={styles.btnText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const step        = STATUS_STEPS.find(s => s.key === delivery.status) ?? STATUS_STEPS[0];
  const statusColor = STATUS_COLOR[delivery.status] ?? theme.primary;
  const isDone      = delivery.status === 'delivered';
  const needsProof  = delivery.status === 'in_transit';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={[styles.headerBar, { borderBottomColor: theme.border }]}>
        {!isDone && (
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={[styles.backText, { color: theme.primary }]}>← Jobs</Text>
          </Pressable>
        )}
        <Text style={[styles.headerTitle, { color: theme.text }]}>Active Delivery</Text>
        <Text style={[styles.trackCode, { color: theme.textSecond }]}>{delivery.trackingCode}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Status banner */}
        <View style={[styles.statusBanner, { backgroundColor: statusColor }]}>
          <Text style={styles.statusIcon}>{step.icon}</Text>
          <Text style={styles.statusLabel}>{step.label}</Text>
          <View style={styles.liveDot}>
            <View style={styles.liveDotInner} />
            <Text style={styles.liveText}>GPS BROADCASTING</Text>
          </View>
        </View>

        {/* Route card */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Delivery Route</Text>
          <View style={styles.routeRow}>
            <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.routeLabel, { color: theme.textSecond }]}>Pickup</Text>
              <Text style={[styles.routeAddr, { color: theme.text }]}>{delivery.pickupAddress}</Text>
            </View>
          </View>
          <View style={[styles.routeLine, { backgroundColor: theme.border }]} />
          <View style={styles.routeRow}>
            <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.routeLabel, { color: theme.textSecond }]}>Dropoff</Text>
              <Text style={[styles.routeAddr, { color: theme.text }]}>{delivery.dropoffAddress}</Text>
            </View>
          </View>
        </View>

        {/* Package info */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Package Details</Text>
          <View style={styles.infoGrid}>
            {[
              ['Description',   delivery.packageDescription],
              ['Size',          delivery.packageSize],
              ['Fragile',       delivery.isFragile ? '⚠️ Yes — handle carefully' : 'No'],
              ['Distance',      `${Number(delivery.distanceKm).toFixed(1)} km`],
              ['Your Earnings', `₦${Number(delivery.driverEarnings).toLocaleString()}`],
            ].map(([label, value]) => (
              <View key={label} style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: theme.textSecond }]}>{label}</Text>
                <Text style={[
                  styles.infoValue,
                  { color: label === 'Your Earnings' ? '#22C55E' : theme.text },
                  label === 'Your Earnings' && styles.earnings,
                ]}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Customer info */}
        {delivery.customer && (
          <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Customer</Text>
            <View style={styles.customerRow}>
              <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                <Text style={styles.avatarText}>{delivery.customer.name?.[0] ?? '?'}</Text>
              </View>
              <View>
                <Text style={[styles.customerName, { color: theme.text }]}>{delivery.customer.name}</Text>
                <Text style={[styles.customerPhone, { color: theme.textSecond }]}>{delivery.customer.phone}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Proof of delivery section — shown when in_transit */}
        {needsProof && (
          <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Proof of Delivery</Text>
            <Text style={[styles.proofHint, { color: theme.textSecond }]}>
              Take a photo when you hand over the package. Required to confirm delivery.
            </Text>
            {proofUri ? (
              <View style={styles.proofPreview}>
                <Image source={{ uri: proofUri }} style={styles.proofImage} resizeMode="cover" />
                <Pressable onPress={takeProofPhoto} style={[styles.retakeBtn, { borderColor: theme.border }]}>
                  <Text style={[styles.retakeText, { color: theme.primary }]}>Retake Photo</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={takeProofPhoto} style={[styles.cameraBtn, { borderColor: theme.primary }]}>
                <Text style={styles.cameraIcon}>📸</Text>
                <Text style={[styles.cameraBtnText, { color: theme.primary }]}>Take Proof Photo</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Progress steps */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Progress</Text>
          {STATUS_STEPS.filter(s => s.key !== 'delivered').map((s, i) => {
            const statusIndex = STATUS_STEPS.findIndex(x => x.key === delivery.status);
            const stepIndex   = STATUS_STEPS.findIndex(x => x.key === s.key);
            const done   = stepIndex < statusIndex || delivery.status === 'delivered';
            const active = s.key === delivery.status;
            return (
              <View key={s.key} style={styles.stepRow}>
                <View style={[
                  styles.stepDot,
                  done   && { backgroundColor: '#22C55E' },
                  active && { backgroundColor: statusColor },
                  !done && !active && { backgroundColor: theme.border },
                ]}>
                  <Text style={styles.stepDotText}>{done ? '✓' : i + 1}</Text>
                </View>
                <Text style={[
                  styles.stepLabel,
                  { color: !done && !active ? theme.textSecond : theme.text },
                  active && { fontWeight: FontWeight.bold },
                ]}>{s.label}</Text>
              </View>
            );
          })}
        </View>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>

      {!isDone && step.action && (
        <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
          {needsProof && !proofReady && (
            <Text style={[styles.proofWarning, { color: theme.textSecond }]}>
              📸 Take a proof photo first
            </Text>
          )}
          <Pressable
            style={[
              styles.btn,
              { backgroundColor: statusColor },
              (updating || (needsProof && !proofReady)) && { opacity: 0.5 },
            ]}
            onPress={advanceStatus}
            disabled={updating}
          >
            {updating
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>{step.action}</Text>}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  backBtn:      { minWidth: 60 },
  backText:     { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  headerTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  trackCode:    { fontSize: FontSize.xs, letterSpacing: 1, minWidth: 60, textAlign: 'right' },
  statusBanner: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  statusIcon:   { fontSize: 48 },
  statusLabel:  { color: '#fff', fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  liveDot:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  liveDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  liveText:     { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 1 },
  card:         { marginHorizontal: Spacing.xl, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md },
  cardTitle:    { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: Spacing.md },
  routeRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  dot:          { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  routeLine:    { width: 2, height: 20, marginLeft: 5, marginVertical: 2 },
  routeLabel:   { fontSize: FontSize.xs, marginBottom: 2 },
  routeAddr:    { fontSize: FontSize.sm },
  infoGrid:     { gap: Spacing.sm },
  infoRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel:    { fontSize: FontSize.sm },
  infoValue:    { fontSize: FontSize.sm, maxWidth: '60%', textAlign: 'right' },
  earnings:     { fontWeight: FontWeight.bold, fontSize: FontSize.base },
  customerRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar:       { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText:   { color: '#fff', fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  customerName: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  customerPhone:{ fontSize: FontSize.sm, marginTop: 2 },
  proofHint:    { fontSize: FontSize.sm, lineHeight: 20, marginBottom: Spacing.md },
  proofPreview: { gap: Spacing.sm },
  proofImage:   { width: '100%', height: 180, borderRadius: Radius.md },
  retakeBtn:    { borderWidth: 1, borderRadius: Radius.md, paddingVertical: Spacing.sm, alignItems: 'center' },
  retakeText:   { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  cameraBtn:    { borderWidth: 2, borderStyle: 'dashed', borderRadius: Radius.md, paddingVertical: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
  cameraIcon:   { fontSize: 32 },
  cameraBtnText:{ fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  proofWarning: { fontSize: FontSize.xs, textAlign: 'center', marginBottom: Spacing.sm },
  stepRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  stepDot:      { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  stepDotText:  { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  stepLabel:    { fontSize: FontSize.base },
  footer:       { padding: Spacing.xl, borderTopWidth: 1 },
  btn:          { height: 56, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center' },
  btnText:      { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },
  empty:        { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyIcon:    { fontSize: 64 },
  emptyTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
});
