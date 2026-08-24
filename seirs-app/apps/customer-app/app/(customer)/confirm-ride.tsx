/**
 * Confirm ride, rebuilt 2026-08-22 (founder: rides were "our weakest
 * link"). The old screen showed a FABRICATED driver from MOCK_DRIVERS,
 * defaulted to cash (a method the platform does not support), priced
 * with a local formula the server ignored, and pushed into a mock
 * progress screen (since deleted).
 *
 * Now it is the ride's Review step, in the same language as Send step
 * 4: Order Summary from the PINNED server quote, the passenger named,
 * Terms gating the button, then the same payment screen every other
 * booking uses (saved-card one tap included), then honest tracking.
 * A driver is assigned by matching AFTER payment: nobody is promised
 * before they exist.
 */
import {
  View, Text, Pressable, StyleSheet, StatusBar, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useDirectionsPolyline } from '@/components/useDirectionsPolyline';
import { DEFAULT_MAP_REGION } from '@/constants/mockData';
import { deliveriesApi, paymentsApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

const VEHICLE_LABEL: Record<string, string> = {
  okada: 'Okada', keke: 'Keke', car: 'Car', danfo: 'Danfo',
};
const ID_TO_ENUM: Record<string, string> = {
  okada: 'motorcycle', keke: 'tricycle', car: 'car', danfo: 'van',
};

export default function ConfirmRideScreen() {
  const router   = useRouter();
  const cs       = useColorScheme();
  const theme    = Colors[cs ?? 'light'];
  const isDark   = cs === 'dark';
  const { t }    = useTranslation();
  const insets   = useSafeAreaInsets();
  const { user } = useAuth() as any;
  const params   = useLocalSearchParams<{
    pickup: string; dropoff: string; vehicleId: string;
    pickupLat?: string; pickupLng?: string; dropoffLat?: string; dropoffLng?: string;
    distanceKm?: string; fareTotal?: string; serviceFee?: string; quoteToken?: string;
    luggage?: string; luggageFee?: string; riderName?: string;
  }>();

  const distKm     = Number(params.distanceKm ?? '0') || 0;
  const total      = Math.round(Number(params.fareTotal ?? '0') || 0);
  const serviceFee = Math.round(Number(params.serviceFee ?? '0') || 0);
  const luggageFee = Math.round(Number(params.luggageFee ?? '0') || 0);
  const riderName  = (params.riderName ?? '').trim();

  // How they'll pay, previewed before the payment screen: a saved
  // card means the next screen is one tap (founder 2026-08-23).
  const [savedCard, setSavedCard] = useState<any | null>(null);
  useEffect(() => {
    paymentsApi.listSavedCards()
      .then((cards: any[]) => setSavedCard(cards?.find((c) => c.isDefault) ?? cards?.[0] ?? null))
      .catch(() => {});
  }, []);

  const [tcAgreed,   setTcAgreed]   = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    if (!tcAgreed || confirming) return;
    setConfirming(true);
    try {
      const created = await deliveriesApi.create({
        mode:           'ride',
        pickupAddress:  params.pickup,
        dropoffAddress: params.dropoff,
        pickupLat:      Number(params.pickupLat)  || undefined,
        pickupLng:      Number(params.pickupLng)  || undefined,
        dropoffLat:     Number(params.dropoffLat) || undefined,
        dropoffLng:     Number(params.dropoffLng) || undefined,
        vehicleType:    ID_TO_ENUM[params.vehicleId] ?? params.vehicleId,
        quoteToken:     params.quoteToken || undefined,
        termsAccepted:  tcAgreed,
        luggage:        params.luggage || undefined,
        riderFirstName: riderName ? riderName.split(/\s+/)[0] : undefined,
        paymentMethod:  'card',
      } as any);

      const deliveryId = created?.id ?? created?.deliveryId;
      if (!deliveryId) throw new Error(t('confirmRide.errBookingFailed', { defaultValue: 'Booking failed. Please try again.' }));

      // Same road every booking takes: the payment screen (one-tap
      // saved card or hosted checkout), then honest tracking.
      router.replace({
        pathname: '/(customer)/payment/[deliveryId]',
        params: {
          deliveryId,
          price:        String(Math.round(Number(created?.price ?? total))),
          trackingCode: created?.trackingCode ?? '',
        },
      } as any);
    } catch (e: any) {
      if (e?.code === 'QUOTE_EXPIRED' || /expired/i.test(String(e?.message ?? ''))) {
        Alert.alert(
          'Price refreshed',
          'You took a moment, so the price was re-checked. Pick your ride again to see the current number.',
          [{ text: 'OK', onPress: () => router.back() }],
        );
      } else {
        Alert.alert(
          t('confirmRide.errTitle', { defaultValue: 'Could not book' }),
          e?.message ?? t('confirmRide.errBookingFailed', { defaultValue: 'Booking failed. Please try again.' }),
        );
      }
    } finally {
      setConfirming(false);
    }
  };

  // ── Map background ──────────────────────────────────────────────────
  const pickupLat  = Number(params.pickupLat  ?? '0') || null;
  const pickupLng  = Number(params.pickupLng  ?? '0') || null;
  const dropoffLat = Number(params.dropoffLat ?? '0') || null;
  const dropoffLng = Number(params.dropoffLng ?? '0') || null;
  const mapRef     = useRef<MapView>(null);
  const { coords: routeCoords } = useDirectionsPolyline(
    pickupLat  ? { latitude: pickupLat,  longitude: pickupLng!  } : null,
    dropoffLat ? { latitude: dropoffLat, longitude: dropoffLng! } : null,
  );

  const sheetRef = useRef<BottomSheet>(null);
  // First snap fits the WHOLE review (summary + terms + CTA): the
  // 340px snap hid the consent below the fold (live walk 2026-08-23).
  const snapPoints = useMemo<(string | number)[]>(() => [560, '85%'], []);

  const summaryRows: Array<[string, string]> = [
    ['Pickup',      params.pickup ?? '-'],
    ['Destination', params.dropoff ?? '-'],
    ['Distance',    distKm > 0 ? `${distKm.toFixed(1)} km` : '-'],
    ['Vehicle',     VEHICLE_LABEL[params.vehicleId] ?? params.vehicleId],
    ['Passenger',   riderName || (user?.name ?? 'You')],
    ...(riderName ? [['Booked by', user?.name ?? 'You'] as [string, string]] : []),
    ...(params.luggage && params.luggage !== 'none'
      ? [['Luggage', params.luggage === 'large' ? `Large${luggageFee > 0 ? ` · ₦${luggageFee.toLocaleString()}` : ''}` : 'Small bag'] as [string, string]]
      : []),
    ...(serviceFee > 0 ? [['Service fee', `₦${serviceFee.toLocaleString()}`] as [string, string]] : []),
    ['Payment', savedCard
      ? `${String(savedCard.brand ?? 'Card').toUpperCase()} ···· ${savedCard.last4} · one tap`
      : 'Card or transfer at checkout'],
    ['Total',       `₦${total.toLocaleString()}`],
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        customMapStyle={isDark ? DARK_MAP : []}
        initialRegion={pickupLat
          ? { latitude: pickupLat, longitude: pickupLng!, latitudeDelta: 0.05, longitudeDelta: 0.05 }
          : DEFAULT_MAP_REGION}
        onMapReady={() => {
          if (!pickupLat || !dropoffLat) return;
          mapRef.current?.fitToCoordinates(
            [{ latitude: pickupLat, longitude: pickupLng! }, { latitude: dropoffLat, longitude: dropoffLng! }],
            { edgePadding: { top: 120, right: 60, bottom: 420, left: 60 }, animated: true },
          );
        }}
      >
        {pickupLat  && <Marker coordinate={{ latitude: pickupLat,  longitude: pickupLng!  }} pinColor="#22C55E" title="Pickup" />}
        {dropoffLat && <Marker coordinate={{ latitude: dropoffLat, longitude: dropoffLng! }} pinColor="#EF4444" title="Destination" />}
        {routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor={theme.primary} strokeWidth={4} />
        )}
      </MapView>

      <SafeAreaView edges={['top']} style={styles.topBar}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surface }, Shadows.sm]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={[styles.topTitle, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.topTitleText, { color: theme.text }]}>
            <Text style={{ color: theme.primary, fontWeight: '800' }}>3/3</Text>
            {'  '}{t('confirmRide.title', { defaultValue: 'Review & book' })}
          </Text>
        </View>
      </SafeAreaView>

      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        topInset={insets.top + 88}
        backgroundStyle={{ backgroundColor: theme.surface }}
        handleIndicatorStyle={{ backgroundColor: theme.border }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
          {/* Order Summary: the ride's Review card, business language. */}
          <View style={[styles.sumCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sumTitle, { color: theme.text }]}>Order Summary</Text>
            {summaryRows.map(([lbl, val]) => (
              <View key={lbl} style={[styles.sumRow, { borderBottomColor: theme.border }]}>
                <Text style={[styles.sumLabel, { color: theme.textSecond }]}>{lbl}</Text>
                <Text
                  style={[
                    styles.sumValue,
                    { color: theme.text },
                    lbl === 'Total' && { fontWeight: '800', color: theme.primary, fontSize: FontSize.md },
                  ]}
                  numberOfLines={2}
                >
                  {val}
                </Text>
              </View>
            ))}
            <Text style={[styles.sumNote, { color: theme.textThird }]}>
              A driver is matched the moment your payment lands. Your driver
              greets you by name; chat opens once they accept.
            </Text>
          </View>

          {/* Consent gates the money, exactly like Send. */}
          <Pressable
            style={styles.tcRow}
            onPress={() => setTcAgreed(v => !v)}
          >
            <View style={[
              styles.tcBox,
              { borderColor: tcAgreed ? theme.primary : theme.textThird, backgroundColor: tcAgreed ? theme.primary : 'transparent' },
            ]}>
              {tcAgreed && <Ionicons name="checkmark" size={13} color="#fff" />}
            </View>
            <Text style={[styles.tcText, { color: theme.textSecond }]}>
              I agree to the SEIRS Terms of Service, including the cancellation
              policy.{' '}
              <Text
                style={{ color: theme.primary, fontWeight: '600' }}
                onPress={() => Linking.openURL('https://seirs.app/terms-of-service')}
              >
                Read them
              </Text>
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.cta,
              { backgroundColor: theme.primary },
              (!tcAgreed || confirming) && { opacity: 0.55 },
            ]}
            disabled={!tcAgreed || confirming}
            onPress={handleConfirm}
          >
            {confirming
              ? <ActivityIndicator color="#fff" />
              : (
                <Text style={styles.ctaText}>
                  {t('confirmRide.bookCta', { defaultValue: `Book ride · ₦${total.toLocaleString()}` })}
                </Text>
              )}
          </Pressable>
          <Text style={[styles.footNote, { color: theme.textThird }]}>
            Nothing is charged until the payment screen. Cancelling an unpaid
            booking is free.
          </Text>
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  topBar:       { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.sm, zIndex: 10 },
  backBtn:      { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  topTitle:     { flex: 1, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  topTitleText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },

  sheetContent: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.md },

  sumCard:  { borderRadius: 14, borderWidth: 1, padding: 14 },
  sumTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  sumRow:   { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1 },
  sumLabel: { fontSize: FontSize.sm },
  sumValue: { flex: 1, fontSize: FontSize.sm, fontWeight: '600', textAlign: 'right' },
  sumNote:  { fontSize: FontSize.xs, lineHeight: 17, marginTop: 10 },

  tcRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 2 },
  tcBox:  { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, marginTop: 1, alignItems: 'center', justifyContent: 'center' },
  tcText: { flex: 1, fontSize: FontSize.sm, lineHeight: 19 },

  cta:     { height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#fff', fontSize: FontSize.base, fontWeight: '700' },
  footNote:{ fontSize: FontSize.xs, textAlign: 'center' },
});

const DARK_MAP = [
  { elementType: 'geometry',           stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#444444' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#000000' }] },
  { featureType: 'road',               elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'water',              elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'poi',                stylers: [{ visibility: 'off' }] },
];
