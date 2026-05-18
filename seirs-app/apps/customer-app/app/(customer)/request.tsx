import {
  View, Text, Pressable, StyleSheet, StatusBar, ActivityIndicator, Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, {
  BottomSheetTextInput,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { type PickedAddress } from '@/components/AddressPicker';
import { useDirectionsPolyline } from '@/components/useDirectionsPolyline';
import { LAGOS_COORDS, RIDE_VEHICLES, calcRideFare } from '@/constants/mockData';

const MAPS_KEY = 'AIzaSyCl-9atGvhkQb9acFyVkLv9HyDMPUgjIIM';

// Vehicle list comes from the shared RIDE_VEHICLES constant so /request,
// /vehicle-select, /fare-breakdown and /confirm-ride all show identical
// vehicles + prices. Per-vehicle price label on this screen is the
// "as-shown" estimate for a typical 8 km trip — the real fare is
// computed against the actual route distance on /fare-breakdown.
const TYPICAL_KM = 8;
type VehicleId = typeof RIDE_VEHICLES[number]['id'];

type Field = 'pickup' | 'dropoff';

interface Prediction {
  place_id:       string;
  main_text:      string;
  secondary_text: string;
}

export default function RequestDriverScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const insets = useSafeAreaInsets();
  const { t }  = useTranslation();
  // Hard ceiling: status bar (insets.top) + header height (~58) + visible
  // gap so the sheet never even brushes the header pill.
  const sheetTopInset = insets.top + 88;

  const [pickup,     setPickup]     = useState<PickedAddress | null>(null);
  const [dropoff,    setDropoff]    = useState<PickedAddress | null>(null);
  const [vehicle,    setVehicle]    = useState<VehicleId>('car');
  const [sharedRide, setSharedRide] = useState(false);
  const allowsSharing = (RIDE_VEHICLES.find(v => v.id === vehicle)?.shareable) ?? false;

  // Inline autocomplete state — replaces the old modal AddressPicker.
  const [pickupQuery,  setPickupQuery]  = useState('');
  const [dropoffQuery, setDropoffQuery] = useState('');
  const [activeField,  setActiveField]  = useState<Field | null>(null);
  const [predictions,  setPredictions]  = useState<Prediction[]>([]);
  const [searching,    setSearching]    = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mapRef   = useRef<MapView>(null);
  const sheetRef = useRef<BottomSheet>(null);
  // Pixel-based snap points — consistent across phone sizes:
  //   200 = just the two address inputs visible (peek)
  //   480 = inputs + vehicles + share + CTA (comfy default; height-of-content)
  // No "full screen" snap when not searching — that's where the empty
  // space came from. When the user focuses an input we use keyboardBehavior
  // "extend" to lift the sheet above the keyboard so suggestions are visible.
  const snapPoints = useMemo(() => [200, 480], []);

  // Center on user's GPS once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled || !mapRef.current) return;
        if (pickup || dropoff) return;
        mapRef.current.animateToRegion(
          { latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 },
          600,
        );
      } catch { /* keep default */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const {
    coords:       routeCoords,
    distanceText,
    durationText,
  } = useDirectionsPolyline(
    pickup  ? { latitude: pickup.lat,  longitude: pickup.lng  } : null,
    dropoff ? { latitude: dropoff.lat, longitude: dropoff.lng } : null,
  );

  // Animate camera as pins are placed.
  useEffect(() => {
    if (!mapRef.current) return;
    if (pickup && dropoff) {
      mapRef.current.fitToCoordinates(
        [
          { latitude: pickup.lat,  longitude: pickup.lng  },
          { latitude: dropoff.lat, longitude: dropoff.lng },
        ],
        { edgePadding: { top: 100, right: 60, bottom: 360, left: 60 }, animated: true },
      );
    } else if (pickup) {
      mapRef.current.animateToRegion({ latitude: pickup.lat,  longitude: pickup.lng,  latitudeDelta: 0.015, longitudeDelta: 0.015 }, 500);
    } else if (dropoff) {
      mapRef.current.animateToRegion({ latitude: dropoff.lat, longitude: dropoff.lng, latitudeDelta: 0.015, longitudeDelta: 0.015 }, 500);
    }
  }, [pickup, dropoff]);

  // ── Places autocomplete ──────────────────────────────────────────────────
  const fetchPredictions = useCallback(async (text: string) => {
    if (text.length < 3) { setPredictions([]); return; }
    setSearching(true);
    try {
      // Global autocomplete — Google biases by requesting IP region.
      const url =
        `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
        `?input=${encodeURIComponent(text)}` +
        `&language=en&key=${MAPS_KEY}`;
      const res  = await fetch(url);
      const json = await res.json();
      if (json.status === 'OK') {
        setPredictions((json.predictions ?? []).map((p: any) => ({
          place_id:       p.place_id,
          main_text:      p.structured_formatting?.main_text    ?? p.description,
          secondary_text: p.structured_formatting?.secondary_text ?? '',
        })));
      } else {
        setPredictions([]);
      }
    } catch {
      setPredictions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const onChangeQuery = (field: Field, text: string) => {
    if (field === 'pickup') setPickupQuery(text); else setDropoffQuery(text);
    setActiveField(field);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchPredictions(text), 300);
  };

  const selectPrediction = async (p: Prediction) => {
    setSearching(true);
    try {
      const url =
        `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${p.place_id}&fields=geometry,formatted_address&key=${MAPS_KEY}`;
      const res  = await fetch(url);
      const json = await res.json();
      if (json.status !== 'OK') return;
      const loc = json.result.geometry.location;
      const picked: PickedAddress = {
        address: json.result.formatted_address ?? `${p.main_text}, ${p.secondary_text}`,
        lat: loc.lat, lng: loc.lng,
      };
      if (activeField === 'pickup') {
        setPickup(picked);
        setPickupQuery(picked.address);
      } else {
        setDropoff(picked);
        setDropoffQuery(picked.address);
      }
      setPredictions([]);
      setActiveField(null);
      Keyboard.dismiss();
      sheetRef.current?.snapToIndex(1);
      // Dismiss keyboard so sheet drops back to its 480-px snap.
    } finally {
      setSearching(false);
    }
  };

  const useMyLocation = async (field: Field) => {
    setSearching(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude: lat, longitude: lng } = pos.coords;

      // Reverse geocode (Geocoding API may not be enabled — fall back to friendly label).
      let address = 'Current location';
      try {
        const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${MAPS_KEY}`);
        const j = await r.json();
        address = j.results?.[0]?.formatted_address ?? address;
      } catch { /* keep label */ }

      const picked: PickedAddress = { address, lat, lng };
      if (field === 'pickup') { setPickup(picked); setPickupQuery(address); }
      else                    { setDropoff(picked); setDropoffQuery(address); }
      setPredictions([]);
      setActiveField(null);
      Keyboard.dismiss();
      sheetRef.current?.snapToIndex(1);
    } finally {
      setSearching(false);
    }
  };

  const clearField = (field: Field) => {
    if (field === 'pickup')  { setPickup(null);  setPickupQuery('');  }
    else                     { setDropoff(null); setDropoffQuery(''); }
    setPredictions([]);
  };

  // Distance in km parsed from the Directions "1.2 km" string, fallback 0
  // so calcRideFare(...) still returns just the base fare if the route
  // hasn't resolved yet.
  const distKmParsed = distanceText
    ? Number(distanceText.match(/([\d.]+)/)?.[1] ?? '0')
    : 0;

  const handleNext = () => {
    if (!pickup || !dropoff) return;
    router.push({
      pathname: '/(customer)/vehicle-select',
      params: {
        mode:       'ride',
        pickup:     pickup.address,
        pickupLat:  String(pickup.lat),
        pickupLng:  String(pickup.lng),
        dropoff:    dropoff.address,
        dropoffLat: String(dropoff.lat),
        dropoffLng: String(dropoff.lng),
        preselect:  vehicle,
        shared:     sharedRide ? '1' : '0',
        distanceKm: String(distKmParsed),
        durationText: durationText ?? '',
      },
    });
  };

  const canProceed = !!pickup && !!dropoff;
  const showSuggestions = activeField !== null && predictions.length > 0;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={LAGOS_COORDS}
        customMapStyle={isDark ? DARK_MAP_STYLE : []}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {pickup  && <Marker coordinate={{ latitude: pickup.lat,  longitude: pickup.lng  }} pinColor="#22C55E" title="Pickup"  description={pickup.address}  />}
        {dropoff && <Marker coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }} pinColor="#EF4444" title="Dropoff" description={dropoff.address} />}
        {pickup && dropoff && routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor={theme.primary} strokeWidth={4} />
        )}
      </MapView>

      <SafeAreaView edges={['top']} style={styles.topBar}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surface }, Shadows.sm]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={[styles.topTitle, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.topTitleText, { color: theme.text }]}>{t('request2.title')}</Text>
        </View>
      </SafeAreaView>

      <BottomSheet
        ref={sheetRef}
        index={1}
        snapPoints={snapPoints}
        topInset={sheetTopInset}
        backgroundStyle={{ backgroundColor: theme.surface }}
        handleIndicatorStyle={{ backgroundColor: theme.border }}
        // "extend" = sheet rises to cover the keyboard so the input stays visible.
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetScrollView
          style={styles.sheetInner}
          contentContainerStyle={{ paddingBottom: Spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Address inputs — inline, no modal pop-up */}
          <View style={[styles.inputBlock, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <View style={styles.inputRow}>
              <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
              <BottomSheetTextInput
                value={pickupQuery}
                onChangeText={(t) => onChangeQuery('pickup', t)}
                onFocus={() => { setActiveField('pickup'); sheetRef.current?.snapToIndex(1); }}
                placeholder={t('request2.pickupAddress')}
                placeholderTextColor={theme.textThird}
                style={[styles.input, { color: theme.text }]}
              />
              {pickupQuery.length > 0 && (
                <Pressable onPress={() => clearField('pickup')} hitSlop={12}>
                  <Ionicons name="close-circle" size={18} color={theme.textThird} />
                </Pressable>
              )}
            </View>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <View style={styles.inputRow}>
              <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
              <BottomSheetTextInput
                value={dropoffQuery}
                onChangeText={(t) => onChangeQuery('dropoff', t)}
                onFocus={() => { setActiveField('dropoff'); sheetRef.current?.snapToIndex(1); }}
                placeholder={t('request2.whereTo')}
                placeholderTextColor={theme.textThird}
                style={[styles.input, { color: theme.text }]}
              />
              {dropoffQuery.length > 0 && (
                <Pressable onPress={() => clearField('dropoff')} hitSlop={12}>
                  <Ionicons name="close-circle" size={18} color={theme.textThird} />
                </Pressable>
              )}
            </View>
          </View>

          {/* Distance + ETA chip */}
          {pickup && dropoff && (distanceText || durationText) && (
            <View style={[styles.routeStatRow, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              {distanceText && (
                <View style={styles.routeStatItem}>
                  <Ionicons name="navigate-outline" size={14} color={theme.textSecond} />
                  <Text style={[styles.routeStatValue, { color: theme.text }]}>{distanceText}</Text>
                </View>
              )}
              {distanceText && durationText && <View style={[styles.routeStatDivider, { backgroundColor: theme.border }]} />}
              {durationText && (
                <View style={styles.routeStatItem}>
                  <Ionicons name="time-outline" size={14} color={theme.textSecond} />
                  <Text style={[styles.routeStatValue, { color: theme.text }]}>{durationText}</Text>
                </View>
              )}
            </View>
          )}

          {/* Inline suggestions list. Renders straight into the parent
              scroll view (no nested scrollables). */}
          {showSuggestions && activeField !== null && (
            <View style={styles.suggestList}>
              <Pressable style={styles.useLocBtn} onPress={() => useMyLocation(activeField)}>
                <Ionicons name="locate" size={18} color={theme.primary} />
                <Text style={[styles.useLocText, { color: theme.primary }]}>{t('request2.useMyLocation')}</Text>
                {searching && <ActivityIndicator size="small" color={theme.primary} />}
              </Pressable>
              {predictions.map((p) => (
                <Pressable
                  key={p.place_id}
                  style={[styles.suggRow, { borderTopColor: theme.border }]}
                  onPress={() => selectPrediction(p)}
                >
                  <View style={[styles.suggIcon, { backgroundColor: theme.surfaceSecond }]}>
                    <Ionicons name="location-outline" size={16} color={theme.textSecond} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.suggMain, { color: theme.text }]} numberOfLines={1}>{p.main_text}</Text>
                    {!!p.secondary_text && (
                      <Text style={[styles.suggSub, { color: theme.textSecond }]} numberOfLines={1}>{p.secondary_text}</Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {/* Empty-state "Use my location" shortcut when one field is focused
              but the user hasn't typed yet. */}
          {activeField !== null && predictions.length === 0 && (
            <Pressable style={[styles.useLocBtn, { borderTopColor: theme.border, borderTopWidth: 1 }]} onPress={() => useMyLocation(activeField)}>
              <Ionicons name="locate" size={18} color={theme.primary} />
              <Text style={[styles.useLocText, { color: theme.primary }]}>{t('request2.useMyLocation')}</Text>
              {searching && <ActivityIndicator size="small" color={theme.primary} />}
            </Pressable>
          )}

          {/* Vehicle picker — hidden while user is searching (sheet is full of suggestions). */}
          {!showSuggestions && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>{t('request2.pickYourRide')}</Text>
              <View style={styles.vehicleRow}>
                {RIDE_VEHICLES.map((v) => {
                  const typicalFare = calcRideFare(v.id, TYPICAL_KM, false).total;
                  return (
                    <Pressable
                      key={v.id}
                      style={[
                        styles.vehicleChip,
                        { backgroundColor: theme.surfaceSecond, borderColor: vehicle === v.id ? theme.primary : theme.border },
                        vehicle === v.id && { backgroundColor: isDark ? '#0A1A2E' : '#EFF6FF' },
                      ]}
                      onPress={() => {
                        setVehicle(v.id);
                        if (!v.shareable) setSharedRide(false);
                      }}
                    >
                      <Ionicons name={v.icon as any} size={20} color={vehicle === v.id ? theme.primary : theme.textSecond} />
                      <Text style={[styles.vehicleChipLabel, { color: vehicle === v.id ? theme.primary : theme.text }]}>{v.label}</Text>
                      <Text style={[styles.vehicleChipSub, { color: theme.textThird }]}>{t(`request2.${v.subKey}`)}</Text>
                      <Text style={[styles.vehicleChipPrice, { color: theme.textSecond }]}>₦{typicalFare.toLocaleString()}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={() => allowsSharing && setSharedRide((s) => !s)}
                style={[
                  styles.shareRow,
                  {
                    backgroundColor: sharedRide ? theme.primary + '15' : theme.surfaceSecond,
                    borderColor:     sharedRide ? theme.primary : theme.border,
                    opacity:         allowsSharing ? 1 : 0.5,
                  },
                ]}
              >
                <View style={[styles.shareIcon, { backgroundColor: sharedRide ? theme.primary : theme.surface }]}>
                  <Ionicons name="people-outline" size={18} color={sharedRide ? '#fff' : theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.shareTitle, { color: theme.text }]}>{t('request2.shareTitle')}</Text>
                  <Text style={[styles.shareSub, { color: theme.textSecond }]}>
                    {allowsSharing
                      ? t('request2.shareDescAvailable')
                      : t('request2.shareDescUnavailable')}
                  </Text>
                </View>
                <View style={[styles.shareCheck, { borderColor: sharedRide ? theme.primary : theme.border, backgroundColor: sharedRide ? theme.primary : 'transparent' }]}>
                  {sharedRide ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
              </Pressable>

              <View style={styles.cta}>
                <Button
                  label={canProceed ? t('request2.chooseVehicle') : t('request2.enterLocationsToContinue')}
                  onPress={handleNext}
                  disabled={!canProceed}
                  fullWidth
                  size="lg"
                  rightIcon={canProceed ? <Ionicons name="arrow-forward" size={18} color="#fff" /> : undefined}
                />
              </View>
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1 },
  topBar:      { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.sm, zIndex: 10 },
  backBtn:     { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  topTitle:    { flex: 1, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  topTitleText:{ fontSize: FontSize.base, fontWeight: FontWeight.semibold },

  sheetInner:  { paddingHorizontal: Spacing.md },

  inputBlock:  { borderWidth: 1.5, borderRadius: Radius.lg, paddingVertical: 4, marginBottom: Spacing.sm },
  inputRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, height: 48 },
  dot:         { width: 10, height: 10, borderRadius: 5 },
  input:       { flex: 1, fontSize: FontSize.base, paddingVertical: 0 },
  divider:     { height: 1, marginLeft: Spacing.md + 18 },

  routeStatRow:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginBottom: Spacing.sm },
  routeStatItem:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  routeStatValue:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  routeStatDivider:{ width: 1, height: 22, marginHorizontal: Spacing.sm },

  suggestList: { flexGrow: 0, marginBottom: Spacing.sm },
  useLocBtn:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, paddingHorizontal: 4 },
  useLocText:  { fontSize: FontSize.base, fontWeight: FontWeight.semibold, flex: 1 },
  suggRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, paddingHorizontal: 4, borderTopWidth: 1 },
  suggIcon:    { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  suggMain:    { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  suggSub:     { fontSize: FontSize.xs, marginTop: 2 },

  sectionLabel:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginBottom: Spacing.sm, marginTop: Spacing.sm },
  vehicleRow:      { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  vehicleChip:     { flex: 1, alignItems: 'center', gap: 2, padding: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1.5 },
  vehicleChipLabel:{ fontSize: FontSize.xs, fontWeight: FontWeight.semibold, marginTop: 4 },
  vehicleChipSub:  { fontSize: 9, fontWeight: FontWeight.medium },
  vehicleChipPrice:{ fontSize: FontSize.xs, marginTop: 2 },

  shareRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5, marginTop: Spacing.sm },
  shareIcon:   { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  shareTitle:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  shareSub:    { fontSize: FontSize.xs, marginTop: 2 },
  shareCheck:  { width: 22, height: 22, borderRadius: 11, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },

  cta:         { paddingTop: Spacing.md },
});

const DARK_MAP_STYLE = [
  { elementType: 'geometry',           stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#444444' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#000000' }] },
  { featureType: 'road',               elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'road.arterial',      elementType: 'geometry', stylers: [{ color: '#1e1e1e' }] },
  { featureType: 'water',              elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'poi',                stylers: [{ visibility: 'off' }] },
];
