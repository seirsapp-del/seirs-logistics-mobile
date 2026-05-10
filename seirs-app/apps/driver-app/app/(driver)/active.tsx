import {
  View, Text, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { deliveriesApi, driversApi, uploadApi } from '@/services/api';
import { useDirectionsPolyline } from '@/components/useDirectionsPolyline';
import { Avatar } from '@/components/ui/Avatar';

const STATUS_STEPS: {
  key: string; label: string; icon: string;
  action: string | null; next: string | null;
  gradient: readonly [string, string];
}[] = [
  { key: 'assigned',   label: 'Head to Pickup',   icon: 'map-outline',            action: 'Mark Picked Up',    next: 'picked_up',  gradient: ['#00C2FF', '#0095CC'] },
  { key: 'picked_up',  label: 'Package Collected', icon: 'cube-outline',           action: 'Start Delivery',    next: 'in_transit', gradient: ['#FF6B00', '#C2410C'] },
  { key: 'in_transit', label: 'En Route',           icon: 'navigate-outline',       action: 'Confirm Delivered', next: 'delivered',  gradient: ['#8B5CF6', '#6D28D9'] },
  { key: 'delivered',  label: 'Delivered!',          icon: 'checkmark-circle-outline', action: null,             next: null,         gradient: ['#22C55E', '#15803D'] },
];

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
  const [myPos,      setMyPos]      = useState<{ lat: number; lng: number } | null>(null);

  const locationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapRef           = useRef<MapView>(null);

  // Real road-following route from Google Directions, with km + ETA.
  const {
    coords:       routeCoords,
    distanceText: routeDistance,
    durationText: routeDuration,
  } = useDirectionsPolyline(
    delivery?.pickupLat  != null
      ? { latitude: Number(delivery.pickupLat),  longitude: Number(delivery.pickupLng)  }
      : null,
    delivery?.dropoffLat != null
      ? { latitude: Number(delivery.dropoffLat), longitude: Number(delivery.dropoffLng) }
      : null,
  );

  useEffect(() => {
    // No id means this screen was opened without a target delivery — flip
    // loading off so the empty-state renders instead of an infinite spinner.
    if (!id) {
      setLoading(false);
      return;
    }
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
    // Get an immediate fix so the map can centre right away
    try {
      const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setMyPos({ lat: first.coords.latitude, lng: first.coords.longitude });
    } catch { /* keep null */ }
    locationInterval.current = setInterval(async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
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

  const advanceStatus = async () => {
    if (!delivery) return;
    const step = STATUS_STEPS.find(s => s.key === delivery.status);
    if (!step?.next) return;

    const nextStatus = step.next;

    if (nextStatus === 'delivered') {
      if (!proofReady) {
        Alert.alert('Proof Required', 'Please take a photo before confirming delivery.', [
          { text: 'Take Photo', onPress: takeProofPhoto },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }
      Alert.alert('Confirm Delivery', 'Has the package been handed to the recipient?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Delivered', onPress: () => doUpdate(nextStatus) },
      ]);
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
          <View style={[styles.emptyIconWrap, { backgroundColor: theme.surface }]}>
            <Ionicons name="cube-outline" size={52} color={theme.textThird} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Delivery not found</Text>
          <Pressable onPress={() => router.back()} style={[styles.actionBtn, { backgroundColor: theme.primary, marginTop: Spacing.md }]}>
            <Text style={styles.actionBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const stepConfig  = STATUS_STEPS.find(s => s.key === delivery.status) ?? STATUS_STEPS[0];
  const isDone      = delivery.status === 'delivered';
  const needsProof  = delivery.status === 'in_transit';
  const statusIndex = STATUS_STEPS.findIndex(s => s.key === delivery.status);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      {/* Header */}
      <View style={[styles.headerBar, { borderBottomColor: theme.border }]}>
        {!isDone && (
          <Pressable onPress={() => router.back()} style={[styles.backCircle, { backgroundColor: theme.surface }]}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
        )}
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Active Delivery</Text>
          <Text style={[styles.trackCode, { color: theme.textSecond }]}>{delivery.trackingCode}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Status banner */}
        <View style={[styles.bannerWrap, Shadows.md]}>
          <LinearGradient
            colors={stepConfig.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.statusBanner}
          >
            <View style={styles.bannerIconWrap}>
              <Ionicons name={stepConfig.icon as any} size={36} color="#fff" />
            </View>
            <Text style={styles.statusLabel}>{stepConfig.label}</Text>
            <View style={styles.gpsPill}>
              <View style={styles.gpsDot} />
              <Text style={styles.gpsText}>GPS BROADCASTING</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Live map — pickup pin (green), dropoff pin (red), driver pin (blue) */}
        {delivery.pickupLat && delivery.dropoffLat && (
          <View style={[styles.card, { backgroundColor: theme.surface, padding: 0, overflow: 'hidden' }, Shadows.sm]}>
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              style={{ width: '100%', height: 220 }}
              showsTraffic
              showsUserLocation={false}
              initialRegion={{
                latitude:  Number(delivery.pickupLat),
                longitude: Number(delivery.pickupLng),
                latitudeDelta:  0.05,
                longitudeDelta: 0.05,
              }}
              onMapReady={() => {
                const coords = [
                  { latitude: Number(delivery.pickupLat),  longitude: Number(delivery.pickupLng) },
                  { latitude: Number(delivery.dropoffLat), longitude: Number(delivery.dropoffLng) },
                  ...(myPos ? [{ latitude: myPos.lat, longitude: myPos.lng }] : []),
                ];
                mapRef.current?.fitToCoordinates(coords, {
                  edgePadding: { top: 60, right: 50, bottom: 60, left: 50 },
                  animated: true,
                });
              }}
            >
              <Marker
                coordinate={{ latitude: Number(delivery.pickupLat), longitude: Number(delivery.pickupLng) }}
                title="Pickup"
                description={delivery.pickupAddress}
                pinColor="#22C55E"
              />
              <Marker
                coordinate={{ latitude: Number(delivery.dropoffLat), longitude: Number(delivery.dropoffLng) }}
                title="Dropoff"
                description={delivery.dropoffAddress}
                pinColor="#EF4444"
              />
              {myPos && (
                <Marker
                  coordinate={{ latitude: myPos.lat, longitude: myPos.lng }}
                  title="You"
                  pinColor="#3A7BD5"
                />
              )}
              {routeCoords.length > 1 && (
                <Polyline
                  coordinates={routeCoords}
                  strokeColor="#3A7BD5"
                  strokeWidth={4}
                />
              )}
            </MapView>
            {(routeDistance || routeDuration) && (
              <View style={[styles.mapStatRow, { backgroundColor: theme.surfaceSecond, borderTopColor: theme.border }]}>
                {routeDistance && (
                  <View style={styles.mapStatItem}>
                    <Ionicons name="navigate-outline" size={14} color={theme.textSecond} />
                    <Text style={[styles.mapStatValue, { color: theme.text }]}>{routeDistance}</Text>
                  </View>
                )}
                {routeDistance && routeDuration && <View style={[styles.mapStatDivider, { backgroundColor: theme.border }]} />}
                {routeDuration && (
                  <View style={styles.mapStatItem}>
                    <Ionicons name="time-outline" size={14} color={theme.textSecond} />
                    <Text style={[styles.mapStatValue, { color: theme.text }]}>{routeDuration}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Route card */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Delivery Route</Text>
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: '#22C55E' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.routeLabel, { color: theme.textSecond }]}>Pickup</Text>
              <Text style={[styles.routeAddr, { color: theme.text }]}>{delivery.pickupAddress}</Text>
            </View>
          </View>
          <View style={[styles.routeLine, { backgroundColor: theme.border }]} />
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.routeLabel, { color: theme.textSecond }]}>Dropoff</Text>
              <Text style={[styles.routeAddr, { color: theme.text }]}>{delivery.dropoffAddress}</Text>
            </View>
          </View>
        </View>

        {/* Package info */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Package Details</Text>
          {[
            { label: 'Description',   value: delivery.packageDescription,                          icon: 'cube-outline' },
            { label: 'Size',          value: delivery.packageSize,                                  icon: 'resize-outline' },
            { label: 'Fragile',       value: delivery.isFragile ? 'Yes — handle carefully' : 'No', icon: 'warning-outline' },
            { label: 'Distance',      value: `${Number(delivery.distanceKm).toFixed(1)} km`,       icon: 'map-outline' },
            { label: 'Your Earnings', value: `₦${Number(delivery.driverEarnings).toLocaleString()}`, icon: 'cash-outline' },
          ].map(({ label, value, icon }) => (
            <View key={label} style={styles.infoRow}>
              <Ionicons name={icon as any} size={16} color={theme.textThird} />
              <Text style={[styles.infoLabel, { color: theme.textSecond }]}>{label}</Text>
              <Text style={[
                styles.infoValue,
                { color: label === 'Your Earnings' ? '#22C55E' : theme.text },
                label === 'Your Earnings' && { fontWeight: FontWeight.bold },
              ]}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Customer info */}
        {delivery.customer && (
          <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Customer</Text>
            <View style={styles.customerRow}>
              <Avatar name={delivery.customer.name ?? 'Customer'} uri={delivery.customer.profilePhoto} size={44} />
              <View>
                <Text style={[styles.customerName, { color: theme.text }]}>{delivery.customer.name}</Text>
                <Text style={[styles.customerPhone, { color: theme.textSecond }]}>{delivery.customer.phone}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Proof of delivery */}
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
                  <Ionicons name="camera-outline" size={16} color={theme.primary} />
                  <Text style={[styles.retakeText, { color: theme.primary }]}>Retake Photo</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={takeProofPhoto} style={[styles.cameraBtn, { borderColor: theme.primary, backgroundColor: theme.primary + '08' }]}>
                <Ionicons name="camera-outline" size={36} color={theme.primary} />
                <Text style={[styles.cameraBtnText, { color: theme.primary }]}>Take Proof Photo</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Progress steps */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Progress</Text>
          {STATUS_STEPS.filter(s => s.key !== 'delivered').map((s, i) => {
            const thisIndex = STATUS_STEPS.findIndex(x => x.key === s.key);
            const done      = thisIndex < statusIndex || delivery.status === 'delivered';
            const active    = s.key === delivery.status;
            return (
              <View key={s.key}>
                <View style={styles.stepRow}>
                  <View style={[
                    styles.stepDot,
                    done   && { backgroundColor: '#22C55E' },
                    active && { backgroundColor: stepConfig.gradient[0] },
                    !done && !active && { backgroundColor: theme.border },
                  ]}>
                    {done
                      ? <Ionicons name="checkmark" size={14} color="#fff" />
                      : <Text style={styles.stepNum}>{i + 1}</Text>}
                  </View>
                  <Text style={[
                    styles.stepLabel,
                    { color: !done && !active ? theme.textSecond : theme.text },
                    active && { fontWeight: FontWeight.bold },
                  ]}>{s.label}</Text>
                </View>
                {i < STATUS_STEPS.length - 2 && (
                  <View style={[styles.stepLine, { backgroundColor: done ? '#22C55E' : theme.border }]} />
                )}
              </View>
            );
          })}
        </View>

      </ScrollView>

      {/* Footer CTA */}
      {!isDone && stepConfig.action && (
        <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
          {needsProof && !proofReady && (
            <View style={styles.proofWarningRow}>
              <Ionicons name="camera-outline" size={15} color={theme.textSecond} />
              <Text style={[styles.proofWarning, { color: theme.textSecond }]}>Take a proof photo first</Text>
            </View>
          )}
          <Pressable
            style={[
              styles.actionBtn,
              { backgroundColor: stepConfig.gradient[0] },
              (updating || (needsProof && !proofReady)) && { opacity: 0.5 },
            ]}
            onPress={advanceStatus}
            disabled={updating}
          >
            {updating
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.actionBtnText}>{stepConfig.action}</Text>}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backCircle:   { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { alignItems: 'center', gap: 2 },
  headerTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  trackCode:    { fontSize: FontSize.xs, letterSpacing: 1 },

  bannerWrap:     { marginHorizontal: Spacing.md, marginVertical: Spacing.md, borderRadius: Radius.xl, overflow: 'hidden' },
  statusBanner:   { padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm },
  bannerIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  statusLabel:    { color: '#fff', fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  gpsPill:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.full },
  gpsDot:         { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  gpsText:        { color: 'rgba(255,255,255,0.9)', fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 1 },

  card:         { marginHorizontal: Spacing.md, borderRadius: Radius.xl, padding: Spacing.md, marginBottom: Spacing.md },
  cardTitle:    { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: Spacing.md },

  routeRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  routeDot:     { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  routeLine:    { width: 1.5, height: 18, marginLeft: 4, marginVertical: 3 },
  routeLabel:   { fontSize: FontSize.xs, marginBottom: 2 },
  routeAddr:    { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  infoRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
  infoLabel:    { flex: 1, fontSize: FontSize.sm },
  infoValue:    { fontSize: FontSize.sm, maxWidth: '55%', textAlign: 'right' },

  customerRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar:        { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText:    { color: '#fff', fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  customerName:  { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  customerPhone: { fontSize: FontSize.sm, marginTop: 2 },

  proofHint:    { fontSize: FontSize.sm, lineHeight: 20, marginBottom: Spacing.md },
  proofPreview: { gap: Spacing.sm },
  proofImage:   { width: '100%', height: 180, borderRadius: Radius.lg },
  retakeBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.lg, height: 44 },
  retakeText:   { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  cameraBtn:    { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.lg, paddingVertical: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
  cameraBtnText:{ fontSize: FontSize.base, fontWeight: FontWeight.semibold },

  stepRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepDot:    { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  stepNum:    { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  stepLabel:  { flex: 1, fontSize: FontSize.base },
  stepLine:   { width: 1.5, height: 16, marginLeft: 13, marginBottom: 4 },

  footer:          { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.md, borderTopWidth: 1 },
  proofWarningRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  proofWarning:    { fontSize: FontSize.xs, textAlign: 'center' },
  actionBtn:       { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  actionBtnText:   { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },

  empty:        { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyIconWrap:{ width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center' },
  emptyTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.semibold },

  mapStatRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1 },
  mapStatItem:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  mapStatValue:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  mapStatDivider: { width: 1, height: 22, marginHorizontal: Spacing.sm },
});
