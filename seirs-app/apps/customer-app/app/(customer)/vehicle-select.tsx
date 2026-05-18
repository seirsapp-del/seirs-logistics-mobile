import {
  View, Text, Pressable, StyleSheet, StatusBar, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { useDirectionsPolyline } from '@/components/useDirectionsPolyline';
import { MOCK_VEHICLES, RIDE_VEHICLES, calcRideFare, LAGOS_COORDS, DEFAULT_MAP_REGION } from '@/constants/mockData';

export default function VehicleSelectScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { t }   = useTranslation();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{
    mode?: string; pickup: string; dropoff: string; preselect?: string;
    pickupLat?: string; pickupLng?: string; dropoffLat?: string; dropoffLng?: string;
    distanceKm?: string; durationText?: string;
  }>();

  // 'ride' mode comes from /request (Okada/Keke/Car/Danfo, fare scales with km).
  // 'cargo' mode comes from /multi-stop (the legacy Economy/Premium/Truck list).
  const isRide = params.mode === 'ride';
  const distKm = Number(params.distanceKm ?? '0') || 0;

  // Share-ride lives on this screen now (used to live on /request).
  // Only applies to car / danfo; the toggle row is hidden otherwise.
  const [shared, setShared] = useState(false);

  // List of vehicles, with a uniform shape both modes can render.
  // Ride mode prices come from calcRideFare against the actual route
  // distance + current share-ride toggle.
  const list = isRide
    ? RIDE_VEHICLES.map(v => ({
        id:          v.id,
        label:       v.label,
        icon:        v.icon,
        photoUrl:    v.photoUrl,
        description: v.description,
        eta:         v.eta,
        features:    [...v.features],
        priceLabel:  `₦${calcRideFare(v.id, distKm, shared).total.toLocaleString()}`,
        shareable:   v.shareable,
      }))
    : MOCK_VEHICLES.map(v => ({
        id:          v.id,
        label:       v.label,
        icon:        v.icon,
        photoUrl:    undefined as string | undefined,
        description: v.description,
        eta:         v.eta,
        features:    [...v.features],
        priceLabel:  v.priceLabel,
        shareable:   false,
      }));

  const initial = list.find(v => v.id === params.preselect)?.id ?? list[0].id;
  const [selected, setSelected] = useState(initial);
  const selectedVehicle = list.find(v => v.id === selected) ?? list[0];
  const selectedShareable = selectedVehicle.shareable;

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
  const snapPoints = useMemo(() => [220, '88%'] as const, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={pickupLat
          ? { latitude: pickupLat, longitude: pickupLng!, latitudeDelta: 0.05, longitudeDelta: 0.05 }
          : DEFAULT_MAP_REGION}
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

      {/* Floating header (matches /request) */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surface }, Shadows.sm]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={[styles.topTitle, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.topTitleText, { color: theme.text }]}>{t('vehicleSelect2.title')}</Text>
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
        <BottomSheetScrollView
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>{t('vehicleSelect2.availableVehicles')}</Text>

          {list.map((v) => {
            const isSelected = selected === v.id;
            return (
              <Pressable
                key={v.id}
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: isSelected ? theme.primary : theme.border },
                  isSelected && { backgroundColor: isDark ? '#0A0A0A' : '#F0F7FF' },
                  Shadows.sm,
                ]}
                onPress={() => setSelected(v.id)}
              >
                <View style={[styles.iconWrap, { backgroundColor: isSelected ? (isDark ? '#1A0C00' : '#DBEAFE') : theme.surfaceSecond, overflow: 'hidden' }]}>
                  {v.photoUrl ? (
                    <Image source={{ uri: v.photoUrl }} style={styles.iconImage} />
                  ) : (
                    <Ionicons name={v.icon as any} size={28} color={isSelected ? theme.primary : theme.textSecond} />
                  )}
                </View>

                <View style={styles.cardInfo}>
                  <Text style={[styles.cardLabel, { color: theme.text }]}>{v.label}</Text>
                  <Text style={[styles.cardDesc, { color: theme.textSecond }]}>{v.description}</Text>
                  <View style={styles.featuresRow}>
                    {v.features.map((f) => (
                      <View key={f} style={[styles.featurePill, { backgroundColor: theme.surfaceSecond }]}>
                        <Text style={[styles.featureText, { color: theme.textSecond }]}>{f}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={styles.cardRight}>
                  <Text style={[styles.price, { color: isSelected ? theme.primary : theme.text }]}>{v.priceLabel}</Text>
                  <View style={styles.etaRow}>
                    <Ionicons name="time-outline" size={12} color={theme.textSecond} />
                    <Text style={[styles.eta, { color: theme.textSecond }]}>{v.eta}</Text>
                  </View>
                  {isSelected && (
                    <View style={[styles.checkWrap, { backgroundColor: theme.primary }]}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}

          {/* Share-ride toggle — only shown for shareable vehicles (car/danfo). */}
          {isRide && selectedShareable && (
            <Pressable
              onPress={() => setShared(s => !s)}
              style={[
                styles.shareRow,
                { backgroundColor: shared ? theme.primary + '15' : theme.surfaceSecond, borderColor: shared ? theme.primary : theme.border },
              ]}
            >
              <View style={[styles.shareIcon, { backgroundColor: shared ? theme.primary : theme.surface }]}>
                <Ionicons name="people-outline" size={18} color={shared ? '#fff' : theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.shareTitle, { color: theme.text }]}>{t('request2.shareTitle')}</Text>
                <Text style={[styles.shareSub, { color: theme.textSecond }]}>{t('request2.shareDescAvailable')}</Text>
              </View>
              <View style={[styles.shareCheck, { borderColor: shared ? theme.primary : theme.border, backgroundColor: shared ? theme.primary : 'transparent' }]}>
                {shared ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
              </View>
            </Pressable>
          )}

          <View style={styles.ctaWrap}>
            <View style={styles.ctaSummary}>
              <Text style={[styles.ctaLabel, { color: theme.textSecond }]}>{t('vehicleSelect2.selected')}</Text>
              <Text style={[styles.ctaValue, { color: theme.text }]}>{selectedVehicle.label} · {selectedVehicle.priceLabel}</Text>
            </View>
            <Button
              label={t('fareBreakdown2.title')}
              onPress={() => router.push({
                pathname: '/(customer)/fare-breakdown',
                params: {
                  mode:         params.mode ?? 'cargo',
                  pickup:       params.pickup,
                  dropoff:      params.dropoff,
                  pickupLat:    params.pickupLat ?? '',
                  pickupLng:    params.pickupLng ?? '',
                  dropoffLat:   params.dropoffLat ?? '',
                  dropoffLng:   params.dropoffLng ?? '',
                  vehicleId:    selected,
                  shared:       shared ? '1' : '0',
                  distanceKm:   params.distanceKm ?? '0',
                  durationText: params.durationText ?? '',
                },
              })}
              size="lg"
              rightIcon={<Ionicons name="arrow-forward" size={18} color="#fff" />}
              style={{ flex: 1 }}
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

  sheetContent: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.sm },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginBottom: Spacing.xs },

  card:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  iconWrap:    { width: 60, height: 60, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center' },
  iconImage:   { width: 60, height: 60 },
  cardInfo:    { flex: 1, gap: 3 },
  cardLabel:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  cardDesc:    { fontSize: FontSize.xs },
  featuresRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  featurePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  featureText: { fontSize: 10, fontWeight: FontWeight.medium },
  cardRight:   { alignItems: 'flex-end', gap: 4 },
  price:       { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  etaRow:      { flexDirection: 'row', alignItems: 'center', gap: 3 },
  eta:         { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  checkWrap:   { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 2 },

  shareRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5, marginTop: Spacing.sm },
  shareIcon:   { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  shareTitle:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  shareSub:    { fontSize: FontSize.xs, marginTop: 2 },
  shareCheck:  { width: 22, height: 22, borderRadius: 11, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },

  ctaWrap:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: 'transparent' },
  ctaSummary:  { flex: 0 },
  ctaLabel:    { fontSize: FontSize.xs },
  ctaValue:    { fontSize: FontSize.base, fontWeight: FontWeight.bold },
});

const DARK_MAP = [
  { elementType: 'geometry',           stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#444444' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#000000' }] },
  { featureType: 'road',               elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'water',              elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'poi',                stylers: [{ visibility: 'off' }] },
];
