import {
  View, Text, Pressable, StyleSheet, StatusBar, Animated, Easing, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { io, Socket } from 'socket.io-client';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { MOCK_TRIPS, MOCK_DRIVERS, dwellFee } from '@/constants/mockData';
import { getActiveRateCard } from '@/hooks/use-rate-card';
import { SOCKET_URL } from '@/constants/config';
import { useDirectionsPolyline } from '@/components/useDirectionsPolyline';
import QRCode from 'react-native-qrcode-svg';
import { deliveriesApi } from '@/services/api';

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
  const params  = useLocalSearchParams<{
    id: string; driverId?: string;
    pickup?: string; dropoff?: string;
    pickupLat?: string; pickupLng?: string; dropoffLat?: string; dropoffLng?: string;
    vehicleId?: string;
  }>();

  // Prefer real params from confirm-ride; fall back to MOCK_TRIPS only
  // when a developer opens this screen with a known mock id (e.g. from
  // /history). For real bookings, params.id is the backend delivery id
  // and params carry the actual pickup/dropoff coords + addresses.
  const mockTrip   = MOCK_TRIPS.find(tr => tr.id === params.id);
  const hasParams  = !!(params.pickupLat && params.dropoffLat);
  const trip = hasParams
    ? {
        id:             params.id,
        pickupAddress:  params.pickup  ?? '',
        dropoffAddress: params.dropoff ?? '',
        pickupLat:      Number(params.pickupLat),
        pickupLng:      Number(params.pickupLng),
        dropoffLat:     Number(params.dropoffLat),
        dropoffLng:     Number(params.dropoffLng),
      }
    : mockTrip ?? MOCK_TRIPS[2];

  const driver = MOCK_DRIVERS.find(d => d.id === params.driverId) ?? MOCK_DRIVERS[0];

  const [currentStep, setCurrentStep] = useState(0);
  const [eta,         setEta]         = useState(driver.eta);
  const pulse = useRef(new Animated.Value(1)).current;
  const mapRef = useRef<MapView>(null);

  // Gap 5 QR: the customer shows this at hand-off; the driver scans it
  // in scan-package.tsx to verify the right package meets the right
  // recipient. QR content is the trackingCode only (public code, zero
  // PII). Fetched lazily from the delivery record.
  const [trackingCode, setTrackingCode] = useState<string | null>((trip as any).trackingCode ?? null);
  const [qrVisible,    setQrVisible]    = useState(false);
  useEffect(() => {
    if (trackingCode || !trip.id) return;
    deliveriesApi.get(String(trip.id))
      .then((d: any) => { if (d?.trackingCode) setTrackingCode(d.trackingCode); })
      .catch(() => {});
  }, [trip.id, trackingCode]);

  // Wait-fee tracker: driver arrives at pickup (currentStep === 1) and the
  // meter starts. First `freeMinutes` are free per rate card; after that
  // the sender pays `perMinuteNgn` per minute up to `capMinutes`. Reads
  // the LIVE rate card so admin price changes propagate without redeploy.
  const [waitMinutes, setWaitMinutes] = useState(0);
  const waitArrivedAtRef = useRef<number | null>(null);
  const waitTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const rateCard         = getActiveRateCard();
  const currentWaitFee   = dwellFee(rateCard, waitMinutes);

  // Live driver position from WS: seeds to the pickup so the car icon
  // doesn't sit at (0,0) before the first ping arrives. No Lagos
  // fallback; if pickup is missing the marker simply renders at (0,0)
  // until the first WS ping (an obvious bug signal in dev).
  const [driverPos, setDriverPos] = useState({
    latitude:  trip.pickupLat  ?? 0,
    longitude: trip.pickupLng  ?? 0,
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
    // Auto-progress timers exist only in dev so the screen demos without a
    // running driver app. In prod the WS `delivery:status` event below is
    // the single source of truth: customers should never see a fake
    // "delivered" badge while the driver hasn't moved.
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (__DEV__ && !hasParams) {
      timers.push(setTimeout(() => setCurrentStep(1), 5000));
      timers.push(setTimeout(() => setCurrentStep(2), 12000));
      timers.push(setTimeout(() => { setCurrentStep(3); setEta(0); }, 20000));
    }
    const etaTimer = setInterval(() => setEta(e => Math.max(0, e - 1)), 60000);
    return () => { timers.forEach(clearTimeout); clearInterval(etaTimer); };
  }, [hasParams]);

  // Wait-fee timer: starts when driver arrives at pickup (step 1),
  // stops when they leave with the package (step 2+). Cap enforced by
  // rate card: after capMinutes the meter freezes.
  useEffect(() => {
    if (currentStep === 1 && !waitTimerRef.current) {
      waitArrivedAtRef.current = Date.now();
      waitTimerRef.current = setInterval(() => {
        const since = waitArrivedAtRef.current ?? Date.now();
        const mins  = Math.floor((Date.now() - since) / 60_000);
        setWaitMinutes(Math.min(mins, rateCard.dwell.capMinutes));
      }, 10_000);   // poll every 10 s: minute-accurate without burning battery
    }
    if (currentStep > 1 && waitTimerRef.current) {
      clearInterval(waitTimerRef.current);
      waitTimerRef.current = null;
    }
    return () => {
      if (waitTimerRef.current) clearInterval(waitTimerRef.current);
    };
  }, [currentStep, rateCard]);

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

  /**
   * Cancellation (audit 2026-08-14).
   *
   * This used to price the fee from the bundled client rate card and, on
   * confirm, navigate to the home tab. No request was ever sent: the
   * delivery stayed live, the driver kept riding to a pickup the customer
   * believed was called off, and the fee they had just agreed to was
   * never charged.
   *
   * The server is the only thing that knows what stage the delivery is
   * really at and what the active rate card says, so both the quote and
   * the cancel come from it. The link is hidden until the quote arrives
   * rather than guessing a price we might not honour.
   */
  const [cancelQuote, setCancelQuote] = useState<{
    cancellable: boolean; feeNgn: number; reason: string;
  } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!params.id || !hasParams) return;
    let alive = true;
    deliveriesApi.cancelQuote(params.id)
      .then(q => { if (alive) setCancelQuote(q); })
      .catch(() => { if (alive) setCancelQuote(null); });
    return () => { alive = false; };
  }, [params.id, hasParams, currentStep]);

  const cancelFee = cancelQuote?.feeNgn ?? 0;
  const canCancel = !!cancelQuote?.cancellable && !cancelling;

  const doCancel = async () => {
    setCancelling(true);
    try {
      const res = await deliveriesApi.cancel(params.id);
      Alert.alert(
        t('tripProgress2.cancelledTitle', { defaultValue: 'Trip cancelled' }),
        res.feeNgn > 0
          ? t('tripProgress2.cancelledWithFee', {
              defaultValue: 'Your trip is cancelled. A ₦{{fee}} cancellation fee was kept from your refund.',
              fee: res.feeNgn.toLocaleString(),
            })
          : t('tripProgress2.cancelledFree', {
              defaultValue: 'Your trip is cancelled and you have been refunded in full.',
            }),
        [{ text: t('common.ok'), onPress: () => router.replace('/(customer)/(tabs)' as any) }],
      );
    } catch (e: any) {
      Alert.alert(
        t('tripProgress2.cancelFailedTitle', { defaultValue: 'Could not cancel' }),
        e?.message ?? t('common.tryAgain', { defaultValue: 'Please try again.' }),
      );
    } finally {
      setCancelling(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      t('tripProgress2.cancelTitle'),
      cancelFee > 0
        ? t('tripProgress2.cancelConfirmWithFee', { fee: cancelFee.toLocaleString() })
        : t('tripProgress2.cancelConfirmFree'),
      [
        { text: t('common.no'), style: 'cancel' },
        { text: t('common.yes'), style: 'destructive', onPress: doCancel },
      ],
    );
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

        {/* ETA: driver ETA from simulator + real route distance from Directions API */}
        <View style={styles.etaRow}>
          <View style={[styles.etaBadge, { backgroundColor: isDark ? theme.surfaceSecond : '#EFF6FF' }]}>
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

        {/* Wait-fee chip: visible only while driver is parked at pickup. */}
        {currentStep === 1 && waitMinutes > 0 && (
          <View style={[styles.etaRow, { marginTop: Spacing.xs }]}>
            <View style={[styles.etaBadge, { backgroundColor: currentWaitFee > 0 ? '#FEE2E2' : (isDark ? '#1A1A1A' : '#F3F4F6') }]}>
              <Ionicons name="hourglass-outline" size={14} color={currentWaitFee > 0 ? '#DC2626' : theme.textSecond} />
              <Text style={[styles.etaText, { color: currentWaitFee > 0 ? '#DC2626' : theme.text, fontSize: FontSize.sm }]}>
                {currentWaitFee > 0
                  ? t('tripProgress2.waitFeeAccruing', { fee: currentWaitFee.toLocaleString(), min: waitMinutes })
                  : t('tripProgress2.waitFreeRemaining', { min: rateCard.dwell.freeMinutes - waitMinutes })}
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
            {/* Phone calls disabled per spec §1.12: chat only */}
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

          {/* Package QR: shown to the driver at hand-off so their scanner
              confirms the right package meets the right recipient. Only
              relevant while the trip is moving (before rating stage). */}
          {trackingCode && currentStep < 3 && (
            <Pressable
              style={[styles.sosBtn, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}
              onPress={() => setQrVisible(true)}
            >
              <Ionicons name="qr-code-outline" size={16} color={theme.text} />
              <Text style={[styles.sosBtnText, { color: theme.text }]}>
                {t('tripProgress2.packageQr', { defaultValue: 'Package QR' })}
              </Text>
            </Pressable>
          )}

          {currentStep >= 3 && (
            <Button
              label={t('rateDriver.title')}
              onPress={handleRate}
              style={{ flex: 1 }}
              leftIcon={<Ionicons name="star-outline" size={16} color="#fff" />}
            />
          )}
        </View>

        {/* Fullscreen package-QR modal for the driver to scan */}
        {qrVisible && trackingCode && (
          <Pressable style={styles.qrBackdrop} onPress={() => setQrVisible(false)}>
            <View style={[styles.qrCard, { backgroundColor: '#fff' }]}>
              <Text style={styles.qrTitle}>
                {t('tripProgress2.qrTitle', { defaultValue: 'Show this to your driver' })}
              </Text>
              <View style={styles.qrBox}>
                <QRCode value={trackingCode} size={220} />
              </View>
              <Text style={styles.qrCode}>{trackingCode}</Text>
              <Text style={styles.qrHint}>
                {t('tripProgress2.qrHint', { defaultValue: 'The driver scans this to confirm they are handing over the right package.' })}
              </Text>
              <Pressable onPress={() => setQrVisible(false)} style={styles.qrClose}>
                <Text style={styles.qrCloseText}>{t('common.done', { defaultValue: 'Done' })}</Text>
              </Pressable>
            </View>
          </Pressable>
        )}

        {/* Cancel link: shown only when the server says this delivery is
            still cancellable and at the price it quoted. Once the driver
            holds the package it stops being a cancellation and becomes a
            return, which support handles. */}
        {canCancel && (
          <Pressable onPress={handleCancel} style={styles.cancelLink}>
            <Text style={[styles.cancelLinkText, { color: theme.error ?? '#DC2626' }]}>
              {t('tripProgress2.cancelLink')}
              {cancelFee > 0 ? ` (₦${cancelFee.toLocaleString()})` : ''}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  qrBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', zIndex: 100,
  },
  qrCard: {
    width: '84%', borderRadius: 20, padding: 24, alignItems: 'center', gap: 12,
  },
  qrTitle:     { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: '#0F2B4C', textAlign: 'center' },
  qrBox:       { padding: 14, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  qrCode:      { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: '#3A7BD5', letterSpacing: 2 },
  qrHint:      { fontSize: FontSize.xs, color: '#6B7280', textAlign: 'center', lineHeight: 17 },
  qrClose:     { marginTop: 4, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 999, backgroundColor: '#0F2B4C' },
  qrCloseText: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },

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

  cancelLink:     { alignSelf: 'center', paddingVertical: Spacing.sm, marginTop: Spacing.xs },
  cancelLinkText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, textDecorationLine: 'underline' },
});

const DARK_MAP = [
  { elementType: 'geometry',           stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#444444' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#000000' }] },
  { featureType: 'road',               elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'water',              elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'poi',                stylers: [{ visibility: 'off' }] },
];
