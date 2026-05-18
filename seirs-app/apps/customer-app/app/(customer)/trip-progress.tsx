import {
  View, Text, Pressable, StyleSheet, StatusBar, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { io, Socket } from 'socket.io-client';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { MOCK_TRIPS, MOCK_DRIVERS, dwellFee } from '@/constants/mockData';
import { DEFAULT_RATE_CARD } from '@/constants/rateCard';
import { SOCKET_URL } from '@/constants/config';
import { useDirectionsPolyline } from '@/components/useDirectionsPolyline';

const STATUS_STEPS = [
  { key: 'assigned',   labelKey: 'stepAssigned',  icon: 'navigate-outline' },
  { key: 'picked_up',  labelKey: 'stepPickedUp',  icon: 'cube-outline' },
  { key: 'in_transit', labelKey: 'stepInTransit', icon: 'car-outline' },
  { key: 'delivered',  labelKey: 'stepDelivered', icon: 'flag-outline' },
] as const;

export default function TripProgressScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { t }   = useTranslation();
  const params  = useLocalSearchParams<{ id: string; driverId?: string }>();

  const trip   = MOCK_TRIPS.find(tr => tr.id === params.id) ?? MOCK_TRIPS[2];
  const driver = MOCK_DRIVERS.find(d => d.id === params.driverId) ?? MOCK_DRIVERS[0];

  const [currentStep, setCurrentStep] = useState(0);
  const [eta,         setEta]         = useState(driver.eta);
  const pulse = useRef(new Animated.Value(1)).current;
  const mapRef = useRef<MapView>(null);

  // Wait-fee tracker — driver arrives at pickup (step 1) and the meter
  // starts. First `freeMinutes` are free per rate card; after that the
  // sender pays `perMinuteNgn` per minute up to `capMinutes`.
  const [waitMinutes, setWaitMinutes] = useState(0);
  const waitArrivedAtRef = useRef<number | null>(null);
  const waitTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentWaitFee   = dwellFee(DEFAULT_RATE_CARD, waitMinutes);

  // Live driver position from WS — defaults to a point near the pickup so
  // the car icon doesn't sit at (0,0) before the first ping arrives.
  const [driverPos, setDriverPos] = useState({
    latitude:  trip.pickupLat  ?? 6.5244,
    longitude: trip.pickupLng  ?? 3.3792,
  });
  const socketRef = useRef<Socket | null>(null);

  // Real road-following polyline + km + ETA from Google Directions.
  const {
    coords:       routeCoords,
    distanceText,
    durationText,
  } = useDirectionsPolyline(
    trip.pickupLat  != null ? { latitude: trip.pickupLat,  longitude: trip.pickupLng  } : null,
    trip.dropoffLat != null ? { latitude: trip.dropoffLat, longitude: trip.dropoffLng } : null,
  );

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulse, { toValue: 1,    duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
    // simulate progress
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setCurrentStep(1), 5000));
    timers.push(setTimeout(() => setCurrentStep(2), 12000));
    timers.push(setTimeout(() => { setCurrentStep(3); setEta(0); }, 20000));
    const etaTimer = setInterval(() => setEta(e => Math.max(0, e - 1)), 60000);
    return () => { timers.forEach(clearTimeout); clearInterval(etaTimer); };
  }, []);

  // Wait-fee timer: starts when driver arrives at pickup (step 1),
  // stops when they leave with the package (step 2+). Cap enforced by
  // rate card — after capMinutes the meter freezes.
  useEffect(() => {
    if (currentStep === 1 && !waitTimerRef.current) {
      waitArrivedAtRef.current = Date.now();
      waitTimerRef.current = setInterval(() => {
        const since = waitArrivedAtRef.current ?? Date.now();
        const mins  = Math.floor((Date.now() - since) / 60_000);
        setWaitMinutes(Math.min(mins, DEFAULT_RATE_CARD.dwell.capMinutes));
      }, 10_000);   // poll every 10 s — minute-accurate without burning battery
    }
    if (currentStep > 1 && waitTimerRef.current) {
      clearInterval(waitTimerRef.current);
      waitTimerRef.current = null;
    }
    return () => {
      if (waitTimerRef.current) clearInterval(waitTimerRef.current);
    };
  }, [currentStep]);

  // Subscribe to delivery room and update driver pin on live GPS pings.
  // Backend emits 'driver:location' (WsEvents.DRIVER_LOCATION) when the
  // assigned driver sends a position update via DRIVER_UPDATE_LOC.
  useEffect(() => {
    const deliveryId = trip.id;
    if (!deliveryId) return;

    const socket = io(`${SOCKET_URL}/tracking`, {
      transports: ['websocket'],
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join:delivery', { deliveryId });
    });

    socket.on('driver:location', (data: { driverId: string; lat: number; lng: number }) => {
      if (data?.lat != null && data?.lng != null) {
        setDriverPos({ latitude: Number(data.lat), longitude: Number(data.lng) });
      }
    });

    socket.on('delivery:status', (data: { status: string }) => {
      const idx = STATUS_STEPS.findIndex(s => s.key === data.status);
      if (idx >= 0) setCurrentStep(idx);
      if (data.status === 'delivered') setEta(0);
    });

    return () => {
      socket.emit('leave:delivery', { deliveryId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [trip.id]);

  const handleRate = () => {
    router.push({ pathname: '/(customer)/rate/[driverId]', params: { driverId: driver.id } });
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />

      {/* ── Map ─────────────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        customMapStyle={isDark ? DARK_MAP : []}
        initialRegion={{
          latitude:  trip.pickupLat  ?? 6.5244,
          longitude: trip.pickupLng  ?? 3.3792,
          latitudeDelta:  0.05,
          longitudeDelta: 0.05,
        }}
        onMapReady={() => {
          if (trip.pickupLat == null || trip.dropoffLat == null) return;
          mapRef.current?.fitToCoordinates(
            [
              { latitude: trip.pickupLat,  longitude: trip.pickupLng  },
              { latitude: trip.dropoffLat, longitude: trip.dropoffLng },
            ],
            { edgePadding: { top: 120, right: 60, bottom: 320, left: 60 }, animated: true },
          );
        }}
        showsUserLocation
      >
        {trip.pickupLat != null && (
          <Marker
            coordinate={{ latitude: trip.pickupLat, longitude: trip.pickupLng }}
            pinColor="#22C55E"
            title="Pickup"
            description={trip.pickupAddress}
          />
        )}
        {trip.dropoffLat != null && (
          <Marker
            coordinate={{ latitude: trip.dropoffLat, longitude: trip.dropoffLng }}
            pinColor="#EF4444"
            title="Dropoff"
            description={trip.dropoffAddress}
          />
        )}
        <Marker coordinate={driverPos} title={driver.name}>
          <View style={styles.driverMarker}>
            <Ionicons name="car" size={16} color="#fff" />
          </View>
        </Marker>
        {routeCoords.length > 1 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor={theme.primary}
            strokeWidth={4}
          />
        )}
      </MapView>

      {/* ── Back ──────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top', 'bottom']} style={styles.topBar}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surface }, Shadows.sm]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={[styles.livePill, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Animated.View style={[styles.liveDot, { transform: [{ scale: pulse }] }]} />
          <Text style={[styles.liveText, { color: theme.text }]}>{t('tripProgress2.liveTracking')}</Text>
        </View>
        <Pressable
          style={[styles.backBtn, { backgroundColor: theme.surface }, Shadows.sm]}
          onPress={() => router.push({ pathname: '/(customer)/share-trip', params: { id: trip.id } })}
        >
          <Ionicons name="share-social-outline" size={20} color={theme.text} />
        </Pressable>
      </SafeAreaView>

      {/* ── Bottom Card ───────────────────────────────────────────── */}
      <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.lg]}>
        {/* Progress steps */}
        <View style={styles.stepsRow}>
          {STATUS_STEPS.map((step, i) => {
            const done   = i < currentStep;
            const active = i === currentStep;
            return (
              <View key={step.key} style={styles.stepItem}>
                <View style={[
                  styles.stepDot,
                  done   && { backgroundColor: '#22C55E' },
                  active && { backgroundColor: theme.primary },
                  !done && !active && { backgroundColor: theme.border },
                ]}>
                  {done
                    ? <Ionicons name="checkmark" size={12} color="#fff" />
                    : <Ionicons name={step.icon as any} size={10} color={active ? '#fff' : theme.textThird} />
                  }
                </View>
                {i < STATUS_STEPS.length - 1 && (
                  <View style={[styles.stepLine, { backgroundColor: done ? '#22C55E' : theme.border }]} />
                )}
              </View>
            );
          })}
        </View>
        <Text style={[styles.stepLabel, { color: theme.textSecond }]}>
          {STATUS_STEPS[currentStep]
            ? t(`tripProgress2.${STATUS_STEPS[currentStep].labelKey}`)
            : t('tripProgress2.arrived')}
        </Text>

        {/* ETA — driver ETA from simulator + real route distance from Directions API */}
        <View style={styles.etaRow}>
          <View style={[styles.etaBadge, { backgroundColor: isDark ? '#1A0C00' : '#EFF6FF' }]}>
            <Ionicons name="time-outline" size={16} color={theme.primary} />
            <Text style={[styles.etaText, { color: theme.primary }]}>
              {eta === 0 ? t('tripProgress2.arrived') : t('tripProgress2.minAway', { n: eta })}
            </Text>
          </View>
          {(distanceText || durationText) && (
            <View style={[styles.etaBadge, { backgroundColor: theme.surfaceSecond, marginLeft: Spacing.sm }]}>
              <Ionicons name="navigate-outline" size={14} color={theme.textSecond} />
              <Text style={[styles.etaText, { color: theme.text, fontSize: FontSize.sm }]}>
                {distanceText}{distanceText && durationText ? ' · ' : ''}{durationText}
              </Text>
            </View>
          )}
        </View>

        {/* Wait-fee chip — visible only while driver is parked at pickup. */}
        {currentStep === 1 && waitMinutes > 0 && (
          <View style={[styles.etaRow, { marginTop: Spacing.xs }]}>
            <View style={[styles.etaBadge, { backgroundColor: currentWaitFee > 0 ? '#FEE2E2' : (isDark ? '#1A1A1A' : '#F3F4F6') }]}>
              <Ionicons name="hourglass-outline" size={14} color={currentWaitFee > 0 ? '#DC2626' : theme.textSecond} />
              <Text style={[styles.etaText, { color: currentWaitFee > 0 ? '#DC2626' : theme.text, fontSize: FontSize.sm }]}>
                {currentWaitFee > 0
                  ? t('tripProgress2.waitFeeAccruing', { fee: currentWaitFee.toLocaleString(), min: waitMinutes })
                  : t('tripProgress2.waitFreeRemaining', { min: DEFAULT_RATE_CARD.dwell.freeMinutes - waitMinutes })}
              </Text>
            </View>
          </View>
        )}

        {/* Driver info */}
        <View style={[styles.driverCard, { backgroundColor: theme.surfaceSecond, borderRadius: Radius.lg }]}>
          <Avatar name={driver.name} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.driverName, { color: theme.text }]}>{driver.name}</Text>
            <View style={styles.driverMeta}>
              <Ionicons name="star" size={12} color="#FFBE0B" />
              <Text style={[styles.metaText, { color: theme.textSecond }]}>{driver.rating}</Text>
              <Text style={[styles.metaDot, { color: theme.border }]}>·</Text>
              <Text style={[styles.metaText, { color: theme.textSecond }]}>{driver.plate}</Text>
            </View>
            <Text style={[styles.vehicleText, { color: theme.textSecond }]}>
              {driver.color} {driver.vehicle}
            </Text>
          </View>
          {/* Action buttons */}
          <View style={styles.actionBtns}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: isDark ? '#001820' : '#F0FDFA', borderColor: '#2EC4B6' }]}
              onPress={() => router.push({ pathname: '/(customer)/messages/[chatId]', params: { chatId: 'chat1' } })}
            >
              <Ionicons name="chatbubble-outline" size={18} color="#2EC4B6" />
            </Pressable>
            {/* Phone calls disabled per spec §1.12 — chat only */}
          </View>
        </View>

        {/* SOS + Share row */}
        <View style={styles.bottomRow}>
          <Pressable
            style={[styles.sosBtn, { backgroundColor: '#FEF2F2', borderColor: theme.error }]}
            onPress={() => router.push({ pathname: '/(customer)/sos', params: { deliveryId: trip.id } })}
          >
            <Ionicons name="warning-outline" size={16} color={theme.error} />
            <Text style={[styles.sosBtnText, { color: theme.error }]}>{t('tripProgress2.sosBtn')}</Text>
          </Pressable>

          {currentStep >= 3 && (
            <Button
              label={t('rateDriver.title')}
              onPress={handleRate}
              style={{ flex: 1 }}
              leftIcon={<Ionicons name="star-outline" size={16} color="#fff" />}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
    zIndex: 10,
  },
  backBtn:  { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.full },
  liveDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  liveText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  driverMarker: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#3A86FF',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },

  card: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl,
    padding: Spacing.md, paddingBottom: Spacing.xl,
  },

  stepsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xs },
  stepItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  stepDot:  { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  stepLine: { flex: 1, height: 2, marginHorizontal: 2 },
  stepLabel:{ fontSize: FontSize.sm, fontWeight: FontWeight.medium, marginBottom: Spacing.sm },

  etaRow:   { marginBottom: Spacing.md },
  etaBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  etaText:  { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  driverCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, marginBottom: Spacing.md },
  driverName: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  driverMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText:   { fontSize: FontSize.sm },
  metaDot:    { fontSize: FontSize.sm },
  vehicleText:{ fontSize: FontSize.xs, marginTop: 2 },
  actionBtns: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn:  { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },

  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sosBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, height: 52, borderRadius: Radius.lg, borderWidth: 1.5 },
  sosBtnText:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },
});

const DARK_MAP = [
  { elementType: 'geometry',           stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#444444' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#000000' }] },
  { featureType: 'road',               elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'water',              elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'poi',                stylers: [{ visibility: 'off' }] },
];
