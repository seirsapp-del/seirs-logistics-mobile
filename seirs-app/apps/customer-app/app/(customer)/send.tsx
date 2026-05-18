import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, StatusBar, TextInput,
  ActivityIndicator, Image, Alert, Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import BottomSheet, {
  BottomSheetTextInput,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { Calendar as RNCalendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { deliveriesApi, uploadApi } from '@/services/api';
import { type PickedAddress } from '@/components/AddressPicker';
import { useDirectionsPolyline } from '@/components/useDirectionsPolyline';
import { LAGOS_COORDS } from '@/constants/mockData';
import {
  ArrowLeft, ArrowRight, Truck, Calendar, CreditCard,
  Camera, X, CheckCircle, Zap,
} from 'lucide-react-native';

const MAPS_KEY = 'AIzaSyCl-9atGvhkQb9acFyVkLv9HyDMPUgjIIM';

// ─── Data ─────────────────────────────────────────────────────────────────────
// Category labels are looked up at render via t(`send.${labelKey}`) so
// language switches reflect live without restarting the form.
const PACKAGE_CATEGORIES = [
  { id: 'documents',    labelKey: 'categoryDocuments'     },
  { id: 'small_parcel', labelKey: 'categorySmallParcel'   },
  { id: 'food',         labelKey: 'categoryFood'          },
  { id: 'fragile',      labelKey: 'categoryFragile'       },
  { id: 'agricultural', labelKey: 'categoryAgricultural'  },
  { id: 'building',     labelKey: 'categoryBuilding'      },
  { id: 'furniture',    labelKey: 'categoryFurniture'     },
  { id: 'moving',       labelKey: 'categoryMoving'        },
  { id: 'market_goods', labelKey: 'categoryMarketGoods'   },
  { id: 'heavy',        labelKey: 'categoryHeavy'         },
] as const;
type CategoryId = typeof PACKAGE_CATEGORIES[number]['id'];

const VEHICLES = [
  { id: 'bicycle',    label: 'Bicycle / Hand',         maxKg: 5,    base: 500,   perKm: 50,   note: 'Community only, <3km' },
  { id: 'motorcycle', label: 'Motorcycle (Okada)',      maxKg: 20,   base: 800,   perKm: 150,  note: 'Standard parcels, food' },
  { id: 'keke',       label: 'Tricycle (Keke)',         maxKg: 100,  base: 1200,  perKm: 200,  note: 'Medium packages, fragile' },
  { id: 'car',        label: 'Car (Sedan)',             maxKg: 200,  base: 2000,  perKm: 300,  note: 'Personal items, medium parcels' },
  { id: 'van',        label: 'Van / Pickup',            maxKg: 800,  base: 5000,  perKm: 500,  note: 'Large goods, business deliveries' },
  { id: 'truck_sm',   label: 'Truck (Small)',           maxKg: 3000, base: 15000, perKm: 1000, note: 'Bulk cargo, building materials' },
  { id: 'truck_lg',   label: 'Truck (Large / Moving)',  maxKg: 9999, base: 40000, perKm: 2000, note: 'Full relocation, industrial' },
] as const;
type VehicleId = typeof VEHICLES[number]['id'];

const PAYMENT_METHODS = [
  { id: 'card',          label: 'Debit Card (Flutterwave)' },
  { id: 'bank_transfer', label: 'Bank Transfer'            },
  { id: 'wallet',        label: 'Seirs Wallet'             },
] as const;
type PaymentId = typeof PAYMENT_METHODS[number]['id'];

// 5 steps total — Address + Schedule are combined ("when & where" in one screen).
// Labels resolved via t(`send.step${cap}`) at render.
const STEPS = ['Package', 'Address', 'Vehicle', 'Fare', 'Confirm'] as const;
const STEP_KEYS = ['stepPackage', 'stepAddress', 'stepVehicle', 'stepFare', 'stepConfirm'] as const;

function autoRecommend(cat: CategoryId, kg: number): VehicleId {
  if (cat === 'documents') return 'bicycle';
  if ((cat === 'food' || cat === 'small_parcel') && kg <= 20) return 'motorcycle';
  if ((cat === 'fragile' || cat === 'market_goods') && kg <= 100) return 'keke';
  if (cat === 'agricultural' || cat === 'building') return 'truck_sm';
  if (cat === 'furniture'   || cat === 'moving' || cat === 'heavy') return 'truck_lg';
  if (kg <= 5)    return 'bicycle';
  if (kg <= 20)   return 'motorcycle';
  if (kg <= 100)  return 'keke';
  if (kg <= 200)  return 'car';
  if (kg <= 800)  return 'van';
  return 'truck_sm';
}

// Build the actual scheduled timestamp from the calendar date + hour.
function buildScheduledFor(isoDate: string, hour: number): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d, hour, 0, 0, 0);
  return dt;
}

// Scheduled-pickup window: 5 AM – 9 PM, 1-hour slots (17 total).
// Drivers go online at 4 AM so they have ~1hr buffer to reach the
// pickup point by the earliest 5 AM slot. "Send Now" stays 24/7 —
// only this scheduled list is gated.
const TIME_SLOTS = Array.from({ length: 17 }, (_, i) => {
  const hour = 5 + i; // 5 → 21
  const label = hour < 12
    ? `${hour} AM`
    : hour === 12
      ? '12 PM'
      : `${hour - 12} PM`;
  return { hour, label };
});

const TODAY_ISO       = new Date().toISOString().slice(0, 10);
const MAX_BOOK_AHEAD  = (() => {
  const d = new Date(); d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
})();

function calcFare(vid: VehicleId, distKm: number, kg: number) {
  const v       = VEHICLES.find(x => x.id === vid)!;
  const base    = v.base;
  const dist    = distKm * v.perKm;
  const weight  = kg > 5 ? Math.floor(kg / 5) * 50 : 0;
  const subtotal= base + dist + weight;
  const service = Math.round(subtotal * 0.30);
  const total   = subtotal + service;
  return { base, dist, weight, service, total };
}

type Field = 'pickup' | 'dropoff';
interface Prediction { place_id: string; main_text: string; secondary_text: string }

// ─── Component ────────────────────────────────────────────────────────────────
export default function SendScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const insets = useSafeAreaInsets();
  const { t }  = useTranslation();
  // Hard ceiling: status bar (insets.top) + header height (~58) + visible
  // gap so the sheet never even brushes the header pill.
  const sheetTopInset = insets.top + 88;

  const [step,        setStep]        = useState(0);
  const [photos,      setPhotos]      = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [category,    setCategory]    = useState<CategoryId | null>(null);
  const [weightKg,    setWeightKg]    = useState('');
  const [pickup,      setPickup]      = useState<PickedAddress | null>(null);
  const [dropoff,     setDropoff]     = useState<PickedAddress | null>(null);
  const [vehicleId,   setVehicleId]   = useState<VehicleId>('motorcycle');
  const [scheduleNow,   setScheduleNow]   = useState(true);
  // ISO date string ('YYYY-MM-DD') — driven by the inline calendar.
  const [scheduledDate, setScheduledDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [scheduledHour, setScheduledHour] = useState<number | null>(null);
  const [paymentId,   setPaymentId]   = useState<PaymentId>('wallet');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  // Inline autocomplete state for the address step (BottomSheetTextInput).
  const [pickupQuery,  setPickupQuery]  = useState('');
  const [dropoffQuery, setDropoffQuery] = useState('');
  const [activeField,  setActiveField]  = useState<Field | null>(null);
  const [predictions,  setPredictions]  = useState<Prediction[]>([]);
  const [searching,    setSearching]    = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mapRef   = useRef<MapView>(null);
  const sheetRef = useRef<BottomSheet>(null);
  // Two snap points: peek (enough to see the form exists) and comfy
  // (sheet rises almost to the header — topInset stops it from covering
  // the title). The sheet's BottomSheetScrollView handles overflow
  // (long vehicle list, long suggestion lists) by scrolling internally.
  const snapPoints = useMemo(() => [180, '92%'], []);

  // Real road-following polyline + km + ETA
  const { coords: routeCoords, distanceText, durationText } = useDirectionsPolyline(
    pickup  ? { latitude: pickup.lat,  longitude: pickup.lng  } : null,
    dropoff ? { latitude: dropoff.lat, longitude: dropoff.lng } : null,
  );

  const distKmRoute = distanceText
    ? Number((distanceText.match(/([\d.]+)/)?.[1] ?? '7'))
    : 7;
  const kg   = parseFloat(weightKg) || 0;
  const fare = calcFare(vehicleId, distKmRoute, kg);

  // Center on user's GPS once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled || !mapRef.current || pickup || dropoff) return;
        mapRef.current.animateToRegion(
          { latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 },
          600,
        );
      } catch { /* keep default */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Animate camera as pins land
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

  // ── Places autocomplete ────────────────────────────────────────────────────
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
    } catch { setPredictions([]); } finally { setSearching(false); }
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
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${p.place_id}&fields=geometry,formatted_address&key=${MAPS_KEY}`;
      const res  = await fetch(url);
      const json = await res.json();
      if (json.status !== 'OK') return;
      const loc = json.result.geometry.location;
      const picked: PickedAddress = {
        address: json.result.formatted_address ?? `${p.main_text}, ${p.secondary_text}`,
        lat: loc.lat, lng: loc.lng,
      };
      if (activeField === 'pickup') { setPickup(picked); setPickupQuery(picked.address); }
      else                          { setDropoff(picked); setDropoffQuery(picked.address); }
      setPredictions([]);
      setActiveField(null);
      Keyboard.dismiss();
      sheetRef.current?.snapToIndex(1);
    } finally { setSearching(false); }
  };

  const useMyLocation = async (field: Field) => {
    setSearching(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude: lat, longitude: lng } = pos.coords;
      let address = 'Current location';
      try {
        const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${MAPS_KEY}`);
        const j = await r.json();
        address = j.results?.[0]?.formatted_address ?? address;
      } catch {}
      const picked: PickedAddress = { address, lat, lng };
      if (field === 'pickup') { setPickup(picked); setPickupQuery(address); }
      else                    { setDropoff(picked); setDropoffQuery(address); }
      setPredictions([]);
      setActiveField(null);
      Keyboard.dismiss();
      sheetRef.current?.snapToIndex(1);
    } finally { setSearching(false); }
  };

  const clearField = (field: Field) => {
    if (field === 'pickup') { setPickup(null);  setPickupQuery(''); }
    else                    { setDropoff(null); setDropoffQuery(''); }
    setPredictions([]);
  };

  // ── Photo picker ─────────────────────────────────────────────────────────
  const addPhoto = async () => {
    if (photos.length >= 5) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to upload package photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setPhotos(p => [...p, result.assets[0].uri]);
    }
  };

  // ── Step navigation ──────────────────────────────────────────────────────
  const next = () => {
    if (step === 0 && photos.length === 0) { setError('Please upload at least one photo.'); return; }
    if (step === 0 && !category)           { setError('Please select a package category.'); return; }
    if (step === 1 && !pickup)  { setError('Please enter a pickup address.'); return; }
    if (step === 1 && !dropoff) { setError('Please enter a dropoff address.'); return; }
    if (step === 1 && !scheduleNow && scheduledHour == null) {
      setError('Please pick a time for your scheduled delivery.');
      return;
    }
    setError('');
    if (step === 1 && category) setVehicleId(autoRecommend(category, kg));
    setStep(s => s + 1);
    sheetRef.current?.snapToIndex(1);
    Keyboard.dismiss();
  };

  const back = () => {
    if (step === 0) { router.back(); return; }
    setError('');
    setStep(s => s - 1);
  };

  const handleBook = async () => {
    setLoading(true);
    setError('');
    try {
      const urls: string[] = [];
      for (const uri of photos) {
        const { url } = await uploadApi.file(uri);
        urls.push(url);
      }
      await deliveriesApi.create({
        pickupAddress:   pickup?.address ?? '',
        dropoffAddress:  dropoff?.address ?? '',
        pickupLat:       pickup?.lat,
        pickupLng:       pickup?.lng,
        dropoffLat:      dropoff?.lat,
        dropoffLng:      dropoff?.lng,
        packageCategory: category,
        description,
        weightKg:        kg,
        vehicleType:     vehicleId,
        paymentMethod:   paymentId,
        packagePhotos:   urls,
        scheduledNow:    scheduleNow,
        scheduledFor:    !scheduleNow && scheduledHour != null
                           ? buildScheduledFor(scheduledDate, scheduledHour).toISOString()
                           : undefined,
      });
      router.replace('/(customer)/history' as any);
    } catch (e: any) {
      setError(e.message ?? 'Booking failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const highlight = (active: boolean) => ({
    borderColor:     active ? theme.accent : theme.border,
    backgroundColor: active ? (isDark ? '#1A2E44' : '#EBF5FF') : theme.surface,
  });

  const showSuggestions = step === 1 && activeField !== null && predictions.length > 0;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Full-screen map background */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={LAGOS_COORDS}
        customMapStyle={isDark ? DARK_MAP : []}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {pickup  && <Marker coordinate={{ latitude: pickup.lat,  longitude: pickup.lng  }} pinColor="#22C55E" title="Pickup"  description={pickup.address}  />}
        {dropoff && <Marker coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }} pinColor="#EF4444" title="Dropoff" description={dropoff.address} />}
        {pickup && dropoff && routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor={theme.primary} strokeWidth={4} />
        )}
      </MapView>

      {/* Floating header */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surface }, Shadows.sm]} onPress={back}>
          <ArrowLeft size={20} color={theme.text} strokeWidth={2} />
        </Pressable>
        <View style={[styles.topTitle, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.topTitleText, { color: theme.text }]}>Send a Package</Text>
          <Text style={[styles.topStep, { color: theme.textSecond }]}>
            {t('send.stepOf', { current: step + 1, total: STEPS.length })} — {t(`send.${STEP_KEYS[step]}`)}
          </Text>
        </View>
      </SafeAreaView>

      <BottomSheet
        ref={sheetRef}
        index={1}
        snapPoints={snapPoints}
        topInset={sheetTopInset}
        backgroundStyle={{ backgroundColor: theme.surface }}
        handleIndicatorStyle={{ backgroundColor: theme.border }}
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetScrollView
          style={styles.sheetInner}
          contentContainerStyle={{ paddingBottom: Spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {!!error && (
            <View style={[styles.errorBox, { backgroundColor: '#EF444415' }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          )}

          {/* STEP 0 — Package */}
          {step === 0 && (
            <View style={styles.stepGap}>
              <Pressable
                onPress={() => router.push('/(customer)/drop-at-store' as any)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
                  padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5,
                  borderColor: theme.accent + '40', backgroundColor: theme.accent + '10',
                }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <Truck size={18} color={theme.accent} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: theme.text }}>Drop at a store instead</Text>
                  <Text style={{ fontSize: FontSize.xs, color: theme.textSecond, marginTop: 2 }}>
                    No driver pickup — walk in, drop, done. Cheapest for non-urgent packages.
                  </Text>
                </View>
                <ArrowRight size={16} color={theme.accent} />
              </Pressable>

              <Text style={[styles.label, { color: theme.textSecond }]}>
                Package photos <Text style={{ color: theme.error }}>*</Text>
                <Text style={{ color: theme.textThird }}> (min 1, max 5)</Text>
              </Text>
              <View style={styles.photosRow}>
                {photos.map((uri, i) => (
                  <View key={i} style={styles.photoWrap}>
                    <Image source={{ uri }} style={styles.photo} />
                    <Pressable
                      style={[styles.photoRemove, { backgroundColor: theme.error }]}
                      onPress={() => setPhotos(p => p.filter((_, j) => j !== i))}
                    >
                      <X size={12} color="#fff" strokeWidth={3} />
                    </Pressable>
                  </View>
                ))}
                {photos.length < 5 && (
                  <Pressable
                    style={[styles.photoAdd, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}
                    onPress={addPhoto}
                  >
                    <Camera size={24} color={theme.accent} strokeWidth={1.75} />
                    <Text style={[styles.photoAddText, { color: theme.textSecond }]}>Add</Text>
                  </Pressable>
                )}
              </View>

              <Text style={[styles.label, { color: theme.textSecond }]}>{t('send.description')}</Text>
              <TextInput
                style={[styles.textarea, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, color: theme.text }]}
                placeholder="Describe the package contents..."
                placeholderTextColor={theme.textThird}
                multiline
                numberOfLines={3}
                value={description}
                onChangeText={setDescription}
              />

              <Text style={[styles.label, { color: theme.textSecond }]}>{t('send.category')} <Text style={{ color: theme.error }}>*</Text></Text>
              <View style={styles.categoryGrid}>
                {PACKAGE_CATEGORIES.map(cat => (
                  <Pressable
                    key={cat.id}
                    style={[styles.categoryChip, highlight(category === cat.id)]}
                    onPress={() => setCategory(cat.id)}
                  >
                    <Text style={[styles.categoryText, { color: category === cat.id ? theme.accent : theme.text }]}>{t(`send.${cat.labelKey}`)}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.label, { color: theme.textSecond }]}>{t('send.weightKg')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, color: theme.text }]}
                placeholder="e.g. 5"
                placeholderTextColor={theme.textThird}
                keyboardType="decimal-pad"
                value={weightKg}
                onChangeText={setWeightKg}
              />
            </View>
          )}

          {/* STEP 1 — Address (inline autocomplete + map underneath) */}
          {step === 1 && (
            <View style={styles.stepGap}>
              <View style={[styles.inputBlock, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
                <View style={styles.inputRow}>
                  <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
                  <BottomSheetTextInput
                    value={pickupQuery}
                    onChangeText={(t) => onChangeQuery('pickup', t)}
                    onFocus={() => { setActiveField('pickup'); sheetRef.current?.snapToIndex(1); }}
                    placeholder="Pickup address"
                    placeholderTextColor={theme.textThird}
                    style={[styles.inputField, { color: theme.text }]}
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
                    placeholder="Where to?"
                    placeholderTextColor={theme.textThird}
                    style={[styles.inputField, { color: theme.text }]}
                  />
                  {dropoffQuery.length > 0 && (
                    <Pressable onPress={() => clearField('dropoff')} hitSlop={12}>
                      <Ionicons name="close-circle" size={18} color={theme.textThird} />
                    </Pressable>
                  )}
                </View>
              </View>

              {pickup && dropoff && (distanceText || durationText) && (
                <View style={[styles.routeStat, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
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

              {showSuggestions && activeField !== null && (
                <View style={styles.suggestList}>
                  <Pressable style={styles.useLocBtn} onPress={() => useMyLocation(activeField)}>
                    <Ionicons name="locate" size={18} color={theme.primary} />
                    <Text style={[styles.useLocText, { color: theme.primary }]}>Use my current location</Text>
                    {searching && <ActivityIndicator size="small" color={theme.primary} />}
                  </Pressable>
                  {predictions.map(p => (
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
                        {!!p.secondary_text && <Text style={[styles.suggSub, { color: theme.textSecond }]} numberOfLines={1}>{p.secondary_text}</Text>}
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}

              {activeField !== null && predictions.length === 0 && (
                <Pressable style={[styles.useLocBtn, { borderTopColor: theme.border, borderTopWidth: 1 }]} onPress={() => useMyLocation(activeField)}>
                  <Ionicons name="locate" size={18} color={theme.primary} />
                  <Text style={[styles.useLocText, { color: theme.primary }]}>Use my current location</Text>
                  {searching && <ActivityIndicator size="small" color={theme.primary} />}
                </Pressable>
              )}

              {/* When? — merged from old Step 4 so address + timing live
                  together. Always visible on Step 2 — scroll to reach it
                  if the suggestions list is open above. */}
              <>
                <Text style={[styles.label, { color: theme.textSecond, marginTop: Spacing.md }]}>When?</Text>
                {[
                  { now: true,  icon: Zap,      title: 'Send Now',           desc: 'Driver assigned immediately' },
                  { now: false, icon: Calendar, title: 'Schedule for Later', desc: 'Pick a future date and time' },
                ].map(opt => {
                    const OptIcon = opt.icon;
                    return (
                      <Pressable
                        key={String(opt.now)}
                        style={[styles.scheduleOpt, highlight(scheduleNow === opt.now)]}
                        onPress={() => setScheduleNow(opt.now)}
                      >
                        <OptIcon size={20} color={scheduleNow === opt.now ? theme.accent : theme.textSecond} strokeWidth={1.75} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.scheduleTitle, { color: theme.text }]}>{opt.title}</Text>
                          <Text style={[styles.scheduleDesc, { color: theme.textSecond }]}>{opt.desc}</Text>
                        </View>
                        {scheduleNow === opt.now && <CheckCircle size={18} color={theme.accent} strokeWidth={2} />}
                      </Pressable>
                    );
                  })}

                  {!scheduleNow && (
                    <View style={[styles.scheduleCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <RNCalendar
                        minDate={TODAY_ISO}
                        maxDate={MAX_BOOK_AHEAD}
                        current={scheduledDate}
                        onDayPress={(day) => {
                          setScheduledDate(day.dateString);
                          // Reset time if the previously chosen hour is now in the past for the new "today" pick.
                          if (day.dateString === TODAY_ISO && scheduledHour != null && scheduledHour <= new Date().getHours()) {
                            setScheduledHour(null);
                          }
                        }}
                        markedDates={{
                          [scheduledDate]: { selected: true, selectedColor: theme.accent },
                        }}
                        theme={{
                          calendarBackground: theme.surface,
                          dayTextColor:       theme.text,
                          monthTextColor:     theme.text,
                          textSectionTitleColor: theme.textSecond,
                          textDisabledColor:  theme.textThird,
                          todayTextColor:     theme.accent,
                          arrowColor:         theme.accent,
                          selectedDayTextColor: '#fff',
                          textMonthFontWeight:  '600',
                          textDayHeaderFontWeight: '600',
                        }}
                        style={{ borderRadius: Radius.lg, marginBottom: Spacing.md }}
                      />

                      <Text style={[styles.label, { color: theme.textSecond, marginBottom: Spacing.sm }]}>
                        Time <Text style={{ color: theme.textThird, fontWeight: FontWeight.regular }}>(scheduled hours: 5 AM – 9 PM)</Text>
                      </Text>
                      <View style={styles.chipRow}>
                        {TIME_SLOTS.map(t => {
                          const active = scheduledHour === t.hour;
                          const isPast = scheduledDate === TODAY_ISO && t.hour <= new Date().getHours();
                          if (isPast) return null;
                          return (
                            <Pressable
                              key={t.hour}
                              style={[styles.timeChip, { backgroundColor: active ? theme.accent : theme.surfaceSecond, borderColor: active ? theme.accent : theme.border }]}
                              onPress={() => setScheduledHour(t.hour)}
                            >
                              <Text style={[styles.timeChipText, { color: active ? '#fff' : theme.text }]}>{t.label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {scheduledHour != null && (
                        <View style={[styles.scheduleSummary, { borderTopColor: theme.border }]}>
                          <Calendar size={16} color={theme.accent} strokeWidth={1.75} />
                          <Text style={[styles.scheduleSummaryText, { color: theme.text }]}>
                            Scheduled for {buildScheduledFor(scheduledDate, scheduledHour).toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
              </>
            </View>
          )}

          {/* STEP 2 — Vehicle */}
          {step === 2 && (
            <View style={styles.stepGap}>
              <Text style={[styles.hintText, { color: theme.textSecond }]}>
                We highlighted the recommended vehicle for your package.
              </Text>
              {VEHICLES.map(v => {
                const f      = calcFare(v.id, distKmRoute, kg);
                const active = vehicleId === v.id;
                const rec    = v.id === (category ? autoRecommend(category, kg) : 'motorcycle');
                return (
                  <Pressable
                    key={v.id}
                    style={[styles.vehicleCard, highlight(active), Shadows.xs]}
                    onPress={() => setVehicleId(v.id)}
                  >
                    <Truck size={26} color={active ? theme.accent : theme.textSecond} strokeWidth={1.5} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.vehicleNameRow}>
                        <Text style={[styles.vehicleName, { color: theme.text }]}>{v.label}</Text>
                        {rec && (
                          <View style={[styles.recBadge, { backgroundColor: theme.accent }]}>
                            <Text style={styles.recText}>Recommended</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.vehicleNote, { color: theme.textSecond }]}>
                        {v.note} · max {v.maxKg >= 9999 ? '3000+' : v.maxKg}kg
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.vehicleFare, { color: theme.text }]}>₦{f.total.toLocaleString()}</Text>
                      <Text style={[styles.vehicleEta, { color: theme.textSecond }]}>{durationText ?? '~20 min'}</Text>
                    </View>
                    {active && <CheckCircle size={18} color={theme.accent} strokeWidth={2} />}
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* STEP 3 — Fare */}
          {step === 3 && (
            <View style={styles.stepGap}>
              <View style={[styles.fareCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
                <Text style={[styles.fareTitle, { color: theme.text }]}>{t('send.fareBreakdown')}</Text>
                {([
                  ['Base fare',         fare.base   ],
                  ['Distance charge',   fare.dist   ],
                  ['Weight surcharge',  fare.weight ],
                  ['Service fee (30%)', fare.service],
                ] as [string, number][]).map(([lbl, amt]) => (
                  <View key={lbl} style={[styles.fareRow, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.fareLabel, { color: theme.textSecond }]}>{lbl}</Text>
                    <Text style={[styles.fareAmt,   { color: theme.text }]}>₦{amt.toLocaleString()}</Text>
                  </View>
                ))}
                <View style={styles.fareTotalRow}>
                  <Text style={[styles.fareTotalLabel, { color: theme.text }]}>{t('send.total')}</Text>
                  <Text style={[styles.fareTotalAmt,   { color: theme.accent }]}>₦{fare.total.toLocaleString()}</Text>
                </View>
              </View>

              <Text style={[styles.label, { color: theme.textSecond }]}>Payment method</Text>
              {PAYMENT_METHODS.map(pm => (
                <Pressable
                  key={pm.id}
                  style={[styles.payOption, highlight(paymentId === pm.id)]}
                  onPress={() => setPaymentId(pm.id)}
                >
                  <CreditCard size={18} color={paymentId === pm.id ? theme.accent : theme.textSecond} strokeWidth={1.75} />
                  <Text style={[styles.payLabel, { color: theme.text }]}>{pm.label}</Text>
                  {paymentId === pm.id && <CheckCircle size={18} color={theme.accent} strokeWidth={2} />}
                </Pressable>
              ))}
            </View>
          )}

          {/* STEP 4 — Confirm */}
          {step === 4 && (
            <View style={styles.stepGap}>
              <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
                <Text style={[styles.fareTitle, { color: theme.text }]}>{t('send.orderSummary')}</Text>
                {([
                  ['Pickup',   pickup?.address  ?? '—'],
                  ['Dropoff',  dropoff?.address ?? '—'],
                  ['Distance', distanceText ?? `${distKmRoute} km`],
                  ['Category', t(`send.${PACKAGE_CATEGORIES.find(c => c.id === category)?.labelKey ?? 'category'}`)],
                  ['Vehicle',  VEHICLES.find(v => v.id === vehicleId)?.label ?? '—'],
                  ['When',     scheduleNow
                                 ? 'Send now'
                                 : (scheduledHour != null
                                     ? buildScheduledFor(scheduledDate, scheduledHour).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                                     : '—')],
                  ['Payment',  PAYMENT_METHODS.find(p => p.id === paymentId)?.label ?? '—'],
                  ['Total',    `₦${fare.total.toLocaleString()}`],
                ] as [string, string][]).map(([lbl, val]) => (
                  <View key={lbl} style={[styles.fareRow, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.fareLabel, { color: theme.textSecond }]}>{lbl}</Text>
                    <Text style={[styles.fareAmt,   { color: theme.text }]} numberOfLines={2}>{val}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* CTA — back inside the scroll, at the bottom of step content. */}
          <Pressable
            style={[styles.cta, { backgroundColor: theme.primary, marginTop: Spacing.lg }, loading && { opacity: 0.7 }]}
            onPress={step < 4 ? next : handleBook}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.ctaInner}>
                <Text style={styles.ctaText}>{step === 4 ? 'Book Delivery' : 'Continue'}</Text>
                <ArrowRight size={18} color="#fff" strokeWidth={2.5} />
              </View>
            )}
          </Pressable>
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:    { flex: 1 },
  topBar:       { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.sm, zIndex: 10 },
  backBtn:      { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  topTitle:     { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: 22, alignItems: 'center' },
  topTitleText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  topStep:      { fontSize: FontSize.xs, marginTop: 2 },

  sheetInner:   { paddingHorizontal: Spacing.md },
  stepGap:      { gap: Spacing.md },

  errorBox:     { padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.sm },
  errorText:    { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  label:        { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  hintText:     { fontSize: FontSize.sm, lineHeight: 20 },

  // Photos
  photosRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  photoWrap:    { width: 72, height: 72, borderRadius: Radius.md, position: 'relative' },
  photo:        { width: '100%', height: '100%', borderRadius: Radius.md },
  photoRemove:  { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  photoAdd:     { width: 72, height: 72, borderRadius: Radius.md, borderWidth: 1.5, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: 4 },
  photoAddText: { fontSize: FontSize.xs },

  // Inputs
  textarea:     { borderRadius: Radius.lg, borderWidth: 1.5, padding: Spacing.md, fontSize: FontSize.base, minHeight: 80, textAlignVertical: 'top' },
  input:        { height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md, fontSize: FontSize.base },

  // Address picker block (matches Request screen)
  inputBlock:   { borderWidth: 1.5, borderRadius: Radius.lg, paddingVertical: 4 },
  inputRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, height: 48 },
  dot:          { width: 10, height: 10, borderRadius: 5 },
  inputField:   { flex: 1, fontSize: FontSize.base, paddingVertical: 0 },
  divider:      { height: 1, marginLeft: Spacing.md + 18 },

  routeStat:        { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  routeStatItem:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  routeStatValue:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  routeStatDivider: { width: 1, height: 22, marginHorizontal: Spacing.sm },

  suggestList:  { },
  useLocBtn:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, paddingHorizontal: 4 },
  useLocText:   { fontSize: FontSize.base, fontWeight: FontWeight.semibold, flex: 1 },
  suggRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, paddingHorizontal: 4, borderTopWidth: 1 },
  suggIcon:     { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  suggMain:     { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  suggSub:      { fontSize: FontSize.xs, marginTop: 2 },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5 },
  categoryText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },

  vehicleCard:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  vehicleNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  vehicleName:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  vehicleNote:    { fontSize: FontSize.xs },
  vehicleFare:    { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  vehicleEta:     { fontSize: FontSize.xs, marginTop: 2 },
  recBadge:       { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  recText:        { color: '#fff', fontSize: 10, fontWeight: FontWeight.bold },

  scheduleOpt:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1.5 },
  scheduleTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  scheduleDesc:  { fontSize: FontSize.sm, marginTop: 2 },
  scheduleCard:  { padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  timeChip:      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5 },
  timeChipText:  { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  scheduleSummary:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1 },
  scheduleSummaryText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, flex: 1 },

  fareCard:      { borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1 },
  fareTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.bold, marginBottom: Spacing.md },
  fareRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  fareLabel:     { fontSize: FontSize.sm },
  fareAmt:       { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, maxWidth: '55%', textAlign: 'right' },
  fareTotalRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.md },
  fareTotalLabel:{ fontSize: FontSize.md, fontWeight: FontWeight.bold },
  fareTotalAmt:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold },

  payOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  payLabel:  { flex: 1, fontSize: FontSize.base },

  summaryCard: { borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1 },

  cta:      { height: 46, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center' },
  ctaInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ctaText:  { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});

const DARK_MAP = [
  { elementType: 'geometry',           stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#444444' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#000000' }] },
  { featureType: 'road',               elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'water',              elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'poi',                stylers: [{ visibility: 'off' }] },
];
