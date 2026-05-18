import {
  View, Text, Pressable, StyleSheet, StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { useDirectionsPolyline } from '@/components/useDirectionsPolyline';
import { MOCK_VEHICLES, RIDE_VEHICLES, calcRideFare, FARE_BREAKDOWN, LAGOS_COORDS } from '@/constants/mockData';

export default function FareBreakdownScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { t }   = useTranslation();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{
    mode?: string; pickup: string; dropoff: string; vehicleId: string;
    pickupLat?: string; pickupLng?: string; dropoffLat?: string; dropoffLng?: string;
    shared?: string; distanceKm?: string; durationText?: string;
  }>();

  const isRide = params.mode === 'ride';
  const distKm = Number(params.distanceKm ?? '0') || 0;
  const shared = params.shared === '1';

  // Compute fare per-mode: rides use the live calcRideFare against the
  // actual route distance + share-ride discount; cargo falls back to
  // the legacy mock breakdown until the cargo rate-card lands.
  const vehicle = isRide
    ? RIDE_VEHICLES.find(v => v.id === params.vehicleId) ?? RIDE_VEHICLES[0]
    : MOCK_VEHICLES.find(v => v.id === params.vehicleId) ?? MOCK_VEHICLES[0];

  const fb = isRide
    ? (() => {
        const f = calcRideFare(params.vehicleId, distKm, shared);
        return {
          baseFare:    f.base,
          distanceFee: f.dist,
          timeFee:     0,
          serviceFee:  f.service,
          discount:    f.discount,
          total:       f.total,
        };
      })()
    : FARE_BREAKDOWN;

  const rows = [
    { label: t('fareBreakdown2.baseFare'),    value: fb.baseFare,    icon: 'flag-outline' },
    { label: t('fareBreakdown2.distanceFee'), value: fb.distanceFee, icon: 'map-outline'  },
    { label: t('fareBreakdown2.timeFee'),     value: fb.timeFee,     icon: 'time-outline' },
    { label: t('fareBreakdown2.serviceFee'),  value: fb.serviceFee,  icon: 'shield-outline' },
  ].filter(r => r.value > 0);

  // ── Map background ──────────────────────────────────────────────────────
  const pickupLat  = Number(params.pickupLat  ?? '0') || null;
  const pickupLng  = Number(params.pickupLng  ?? '0') || null;
  const dropoffLat = Number(params.dropoffLat ?? '0') || null;
  const dropoffLng = Number(params.dropoffLng ?? '0') || null;
  const mapRef     = useRef<MapView>(null);
  const { coords: routeCoords } = useDirectionsPolyline(
    pickupLat  ? { latitude: pickupLat,  longitude: pickupLng!  } : null,
    dropoffLat ? { latitude: dropoffLat, longitude: dropoffLng! } : null,
  );

  // ── Bottom sheet ─────────────────────────────────────────────────────────
  const sheetRef = useRef<BottomSheet>(null);
  const sheetTopInset = insets.top + 88;
  const snapPoints = useMemo(() => [220, '90%'] as const, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={pickupLat
          ? { latitude: pickupLat, longitude: pickupLng!, latitudeDelta: 0.05, longitudeDelta: 0.05 }
          : LAGOS_COORDS}
        customMapStyle={isDark ? DARK_MAP : []}
        onMapReady={() => {
          if (!pickupLat || !dropoffLat) return;
          mapRef.current?.fitToCoordinates(
            [{ latitude: pickupLat, longitude: pickupLng! }, { latitude: dropoffLat, longitude: dropoffLng! }],
            { edgePadding: { top: 120, right: 60, bottom: 360, left: 60 }, animated: true },
          );
        }}
      >
        {pickupLat  && <Marker coordinate={{ latitude: pickupLat,  longitude: pickupLng!  }} pinColor="#22C55E" title="Pickup"  description={params.pickup}  />}
        {dropoffLat && <Marker coordinate={{ latitude: dropoffLat, longitude: dropoffLng! }} pinColor="#EF4444" title="Dropoff" description={params.dropoff} />}
        {routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor={theme.primary} strokeWidth={4} />
        )}
      </MapView>

      <SafeAreaView edges={['top']} style={styles.topBar}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surface }, Shadows.sm]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={[styles.topTitle, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.topTitleText, { color: theme.text }]}>{t('fareBreakdown2.title')}</Text>
        </View>
      </SafeAreaView>

      <BottomSheet
        ref={sheetRef}
        index={1}
        snapPoints={snapPoints}
        topInset={sheetTopInset}
        backgroundStyle={{ backgroundColor: theme.surface }}
        handleIndicatorStyle={{ backgroundColor: theme.border }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>

          {/* Vehicle summary */}
          <View style={[styles.vehicleCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            <View style={styles.vehicleRow}>
              <View style={[styles.vehicleIconWrap, { backgroundColor: isDark ? '#1A0C00' : '#EFF6FF' }]}>
                <Ionicons name={vehicle.icon as any} size={28} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.vehicleName, { color: theme.text }]}>{vehicle.label}</Text>
                <Text style={[styles.vehicleDesc, { color: theme.textSecond }]}>{vehicle.description}</Text>
              </View>
              <View style={styles.vehicleEta}>
                <Ionicons name="time-outline" size={14} color={theme.primary} />
                <Text style={[styles.etaText, { color: theme.primary }]}>{vehicle.eta}</Text>
              </View>
            </View>
            {(distKm > 0 || params.durationText) && (
              <View style={[styles.routeMeta, { borderTopColor: theme.border }]}>
                {distKm > 0 && (
                  <View style={styles.metaItem}>
                    <Ionicons name="navigate-outline" size={14} color={theme.textSecond} />
                    <Text style={[styles.metaText, { color: theme.textSecond }]}>~{distKm.toFixed(1)} km</Text>
                  </View>
                )}
                {!!params.durationText && (
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={14} color={theme.textSecond} />
                    <Text style={[styles.metaText, { color: theme.textSecond }]}>~{params.durationText}</Text>
                  </View>
                )}
                {isRide && shared && (
                  <View style={styles.metaItem}>
                    <Ionicons name="people-outline" size={14} color={theme.primary} />
                    <Text style={[styles.metaText, { color: theme.primary }]}>{t('request2.shareTitle')}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Fare rows */}
          <View style={[styles.fareCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            <Text style={[styles.fareCardTitle, { color: theme.text }]}>{t('fareBreakdown2.priceDetails')}</Text>
            {rows.map(({ label, value, icon }, i) => (
              <View key={label} style={[
                styles.fareRow,
                i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
              ]}>
                <View style={styles.fareLeft}>
                  <View style={[styles.fareIcon, { backgroundColor: theme.surfaceSecond }]}>
                    <Ionicons name={icon as any} size={14} color={theme.textSecond} />
                  </View>
                  <Text style={[styles.fareLabel, { color: theme.textSecond }]}>{label}</Text>
                </View>
                <Text style={[styles.fareValue, { color: theme.text }]}>₦{value.toLocaleString()}</Text>
              </View>
            ))}

            {fb.discount > 0 && (
              <View style={[styles.fareRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                <View style={styles.fareLeft}>
                  <View style={[styles.fareIcon, { backgroundColor: '#DCFCE7' }]}>
                    <Ionicons name="pricetag-outline" size={14} color="#15803D" />
                  </View>
                  <Text style={[styles.fareLabel, { color: '#15803D' }]}>{t('fareBreakdown2.promoDiscount')}</Text>
                </View>
                <Text style={[styles.fareValue, { color: '#15803D' }]}>-₦{fb.discount.toLocaleString()}</Text>
              </View>
            )}

            <View style={[styles.fareTotal, { borderTopColor: theme.border }]}>
              <Text style={[styles.fareTotalLabel, { color: theme.text }]}>{t('fareBreakdown2.total')}</Text>
              <Text style={[styles.fareTotalValue, { color: theme.primary }]}>₦{fb.total.toLocaleString()}</Text>
            </View>
          </View>

          {/* Price notice */}
          <View style={[styles.notice, { backgroundColor: isDark ? '#001820' : '#F0FDFA', borderColor: '#2EC4B6' }]}>
            <Ionicons name="information-circle-outline" size={16} color="#2EC4B6" />
            <Text style={[styles.noticeText, { color: theme.textSecond }]}>
              {t('fareBreakdown2.priceNotice')}
            </Text>
          </View>

          <View style={styles.ctaWrap}>
            <Button
              label={t('common.continue')}
              onPress={() => router.push({
                pathname: '/(customer)/confirm-ride',
                params: {
                  mode:         params.mode ?? 'cargo',
                  pickup:       params.pickup,
                  dropoff:      params.dropoff,
                  pickupLat:    params.pickupLat ?? '',
                  pickupLng:    params.pickupLng ?? '',
                  dropoffLat:   params.dropoffLat ?? '',
                  dropoffLng:   params.dropoffLng ?? '',
                  vehicleId:    params.vehicleId,
                  shared:       params.shared ?? '0',
                  distanceKm:   String(distKm),
                  durationText: params.durationText ?? '',
                  fareTotal:    String(fb.total),
                },
              })}
              size="lg"
              fullWidth
              rightIcon={<Ionicons name="arrow-forward" size={18} color="#fff" />}
            />
          </View>
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

  vehicleCard:     { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  vehicleRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  vehicleIconWrap: { width: 52, height: 52, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center' },
  vehicleName:     { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  vehicleDesc:     { fontSize: FontSize.sm },
  vehicleEta:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  etaText:         { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  routeMeta: { flexDirection: 'row', gap: Spacing.lg, borderTopWidth: 1, paddingTop: Spacing.sm, marginTop: Spacing.sm },
  metaItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:  { fontSize: FontSize.sm },

  fareCard:       { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  fareCardTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: Spacing.sm },
  fareRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  fareLeft:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fareIcon:       { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  fareLabel:      { fontSize: FontSize.sm },
  fareValue:      { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  fareTotal:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Spacing.md, borderTopWidth: 1, marginTop: 4 },
  fareTotalLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  fareTotalValue: { fontSize: FontSize.xl, fontWeight: FontWeight.bold },

  notice:     { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  noticeText: { flex: 1, fontSize: FontSize.sm, lineHeight: 20 },

  ctaWrap: { paddingTop: Spacing.sm },
});

const DARK_MAP = [
  { elementType: 'geometry',           stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#444444' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#000000' }] },
  { featureType: 'road',               elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'water',              elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'poi',                stylers: [{ visibility: 'off' }] },
];
