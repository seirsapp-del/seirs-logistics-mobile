/**
 * Business · New Delivery — category-first multi-stop booking flow.
 *
 * Spec V8 redesign (2026-05-12). Three-step wizard inside a draggable
 * @gorhom/bottom-sheet over a full-screen Google Map. Connects directly
 * to the backend pricing system (RateCard + ServiceCategory) so prices,
 * dwell estimates, and vehicle safety rules update without a redeploy
 * when the admin tunes the rate card.
 *
 * Steps:
 *   0. WHAT — category picker, weight (required), quantity, vehicle
 *      (auto-suggested with safety hard-stops + soft warnings)
 *   1. WHERE — pickup + 1–5 stops with Google Places autocomplete +
 *      auto-optimize toggle (default ON, shows reordered visit order)
 *   2. WHEN — Send Now / Schedule for Later + price breakdown + ETA
 *
 * Submit creates one Delivery + N DeliveryStop rows on the backend.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, StatusBar,
  ActivityIndicator, Switch, Alert, Keyboard, ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import BottomSheet, {
  BottomSheetTextInput,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { Calendar as RNCalendar } from 'react-native-calendars';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import {
  businessApi, configApi, pricingApi,
  type ServiceCategory, type RateCard, type PriceBreakdown,
} from '@/services/api';
import { useBusinessStore, type DeliveryStop } from '@/store/businessStore';
import { VehicleIcon, type VehicleType } from '@seirs/shared';
import { useMultiStopDirections } from '@/components/useMultiStopDirections';
import { useColors, useTheme } from '@/context/ThemeContext';

const MAPS_KEY = 'AIzaSyCl-9atGvhkQb9acFyVkLv9HyDMPUgjIIM';
const LAGOS = { latitude: 6.5244, longitude: 3.3792, latitudeDelta: 0.1, longitudeDelta: 0.1 };

// Visit order: pickup → stop1 → stop2 → ... → stopN.
const STEPS = ['What & Vehicle', 'Pickup & Stops', 'Schedule & Summary'] as const;

// 5 AM – 9 PM scheduling window per Spec V8 operating hours.
const TIME_SLOTS = Array.from({ length: 17 }, (_, i) => {
  const hour = 5 + i;
  const label = hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
  return { hour, label };
});
const TODAY_ISO     = new Date().toISOString().slice(0, 10);
const MAX_BOOK_AHEAD = (() => {
  const d = new Date(); d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
})();

function buildScheduledFor(isoDate: string, hour: number): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0, 0);
}

const VEHICLE_ORDER: VehicleType[] = [
  'bicycle', 'motorcycle', 'tricycle', 'car', 'van', 'truck_small', 'truck_large',
];
const VEHICLE_LABEL: Record<VehicleType, string> = {
  bicycle: 'Bicycle', motorcycle: 'Motorcycle', tricycle: 'Tricycle',
  car: 'Car', van: 'Van', truck_small: 'Small Truck', truck_large: 'Large Truck',
};

type ActiveField = { kind: 'pickup' } | { kind: 'stop'; idx: number } | null;
interface Prediction { place_id: string; main_text: string; secondary_text: string }

export default function NewDeliveryScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const colors  = useColors();
  const { isDark } = useTheme();
  const {
    draft, setDraft, addStop, removeStop, updateStop, resetDraft, reorderStops,
  } = useBusinessStore();

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [loading, setLoading] = useState(false);

  // ── Backend config (rate card + service catalog) ─────────────────────
  const [catalog,  setCatalog]  = useState<ServiceCategory[]>([]);
  const [rateCard, setRateCard] = useState<RateCard | null>(null);
  const [configErr, setConfigErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([configApi.serviceCatalog(), configApi.rateCard()])
      .then(([cat, rc]) => { setCatalog(cat); setRateCard(rc); })
      .catch((e) => setConfigErr(e?.message ?? 'Could not load pricing config'));
  }, []);

  const selectedCategory: ServiceCategory | undefined =
    catalog.find(c => c.code === draft.categoryCode);

  // ── Address autocomplete (per-row) ───────────────────────────────────
  const [pickupQuery, setPickupQuery] = useState(draft.pickupAddress);
  const [stopQueries, setStopQueries] = useState<string[]>(draft.stops.map(s => s.address));
  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [searching,   setSearching]   = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Schedule ─────────────────────────────────────────────────────────
  const [scheduleNow,   setScheduleNow]   = useState(true);
  const [scheduledDate, setScheduledDate] = useState<string>(TODAY_ISO);
  const [scheduledHour, setScheduledHour] = useState<number | null>(null);

  // ── Map + bottom sheet refs ──────────────────────────────────────────
  const mapRef   = useRef<MapView>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => [180, '92%'], []);
  const sheetTopInset = insets.top + 88;

  // ── Route polyline + distance + ETA (auto-optimize when toggle ON) ──
  const stopCoords = draft.stops
    .filter(s => s.lat != null && s.lng != null)
    .map(s => ({ latitude: s.lat as number, longitude: s.lng as number }));
  const directions = useMultiStopDirections(
    draft.pickupLat != null ? { latitude: draft.pickupLat, longitude: draft.pickupLng! } : null,
    stopCoords,
    { optimizeWaypoints: draft.autoOptimizeRoute },
  );
  const { coords: routeCoords, distanceText, durationText, distanceMeters, durationSeconds, waypointOrder, wasReordered } = directions;

  // When Google's auto-optimize returns a NEW order, reorder our local
  // stops so the UI shows the visit sequence the driver will use.
  // Persist the order on the store so submit ships it to the backend.
  useEffect(() => {
    if (!draft.autoOptimizeRoute || !waypointOrder || !wasReordered) return;
    if (stopCoords.length !== draft.stops.length) return; // some still being typed
    // waypointOrder gives original-indices in new visit order
    const reordered = waypointOrder
      .map(origIdx => draft.stops[origIdx])
      .filter(Boolean);
    if (reordered.length !== draft.stops.length) return;
    // Only reorder if it actually changed (avoid render loop)
    const sameOrder = reordered.every((s, i) => s === draft.stops[i]);
    if (sameOrder) return;
    reorderStops(reordered as DeliveryStop[]);
    setStopQueries(reordered.map(s => s.address));
    setDraft({
      optimizedWaypointOrder: waypointOrder,
      routeWasAutoOptimized:  true,
    });
  }, [waypointOrder, wasReordered, draft.autoOptimizeRoute, stopCoords.length]);

  // ── Map: center on user's GPS once ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled || !mapRef.current || draft.pickupLat) return;
        mapRef.current.animateToRegion(
          { latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 },
          600,
        );
      } catch { /* keep default */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-fit map when both pickup + at least one stop have coordinates.
  useEffect(() => {
    if (!mapRef.current || draft.pickupLat == null) return;
    if (stopCoords.length === 0) {
      mapRef.current.animateToRegion(
        { latitude: draft.pickupLat, longitude: draft.pickupLng!, latitudeDelta: 0.015, longitudeDelta: 0.015 },
        500,
      );
      return;
    }
    mapRef.current.fitToCoordinates(
      [{ latitude: draft.pickupLat, longitude: draft.pickupLng! }, ...stopCoords],
      { edgePadding: { top: 100, right: 60, bottom: 360, left: 60 }, animated: true },
    );
  }, [draft.pickupLat, draft.pickupLng, draft.stops]);

  // ── Auto-suggest vehicle from category + weight ──────────────────────
  // Picks the lightest suggested vehicle that can carry the weight.
  // User can still override afterwards (with safety check).
  useEffect(() => {
    if (!selectedCategory || !rateCard || draft.weightKg == null) return;
    // Don't override if user already explicitly chose a non-default
    // vehicle (track via hasUserOverriddenVehicleRef).
    if (hasUserOverriddenVehicleRef.current) return;

    const candidates = selectedCategory.suggestedVehicles
      .filter((v: string) => {
        const r = rateCard.vehicleRates[v];
        return r && draft.weightKg! <= r.maxPayloadKg;
      });
    const next = candidates[0] ?? selectedCategory.suggestedVehicles[0];
    if (next && next !== draft.vehicleType) {
      setDraft({ vehicleType: next });
    }
  }, [selectedCategory, draft.weightKg, rateCard]);
  // Track whether the user has manually picked a vehicle since the last
  // category change. Reset on category change.
  const hasUserOverriddenVehicleRef = useRef(false);
  useEffect(() => { hasUserOverriddenVehicleRef.current = false; }, [draft.categoryCode]);

  // ── Live price quote ─────────────────────────────────────────────────
  // Refetch when key inputs change. Debounced 400ms so typing doesn't
  // spam the backend.
  const [quote, setQuote] = useState<PriceBreakdown | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalKm = (distanceMeters ?? 0) / 1000;
  const totalDriveMin = Math.round((durationSeconds ?? 0) / 60);

  useEffect(() => {
    if (!draft.categoryCode || !draft.vehicleType || !draft.weightKg || stopCoords.length === 0) {
      setQuote(null); return;
    }
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        // Compute estimated total dwell from rate card formula:
        // (category setup + weight tier) × stops + cultural buffer × stops
        const dwellPerStop = computePerStopDwell(rateCard, selectedCategory, draft.weightKg!);
        const result = await pricingApi.quote({
          vehicleType:  draft.vehicleType,
          categoryCode: draft.categoryCode!,
          km:           totalKm,
          stopCount:    draft.stops.length,
          weightKg:     draft.weightKg!,
          estimatedDwellMinutes: dwellPerStop * draft.stops.length,
          scheduledAt:  !scheduleNow && scheduledHour != null
                          ? buildScheduledFor(scheduledDate, scheduledHour).toISOString()
                          : undefined,
          isInterState:   false,   // TODO: detect from pickup vs stop states
          isLongDistance: totalKm > 100,
          isRecurring:    draft.isRecurring,
        });
        setQuote(result);
        setQuoteErr(null);
      } catch (e: any) {
        setQuote(null);
        setQuoteErr(e?.message ?? 'Could not compute price');
      } finally { setQuoteLoading(false); }
    }, 400);
    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current); };
  }, [
    draft.categoryCode, draft.vehicleType, draft.weightKg, draft.stops.length,
    totalKm, draft.isRecurring, scheduleNow, scheduledHour, scheduledDate,
    rateCard, selectedCategory,
  ]);

  // ── Places autocomplete ──────────────────────────────────────────────
  const fetchPredictions = useCallback(async (text: string) => {
    if (text.length < 3) { setPredictions([]); return; }
    setSearching(true);
    try {
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
      } else { setPredictions([]); }
    } catch { setPredictions([]); } finally { setSearching(false); }
  }, []);

  const onChangePickup = (text: string) => {
    setPickupQuery(text);
    setDraft({ pickupAddress: text, pickupLat: undefined, pickupLng: undefined });
    setActiveField({ kind: 'pickup' });
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchPredictions(text), 300);
  };

  const onChangeStop = (idx: number, text: string) => {
    setStopQueries(prev => { const next = [...prev]; next[idx] = text; return next; });
    updateStop(idx, { address: text, lat: undefined, lng: undefined });
    setActiveField({ kind: 'stop', idx });
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
      const address = json.result.formatted_address ?? `${p.main_text}, ${p.secondary_text}`;
      if (!activeField) return;
      if (activeField.kind === 'pickup') {
        setPickupQuery(address);
        setDraft({ pickupAddress: address, pickupLat: loc.lat, pickupLng: loc.lng });
      } else {
        setStopQueries(prev => { const next = [...prev]; next[activeField.idx] = address; return next; });
        updateStop(activeField.idx, { address, lat: loc.lat, lng: loc.lng });
      }
      setPredictions([]);
      setActiveField(null);
      Keyboard.dismiss();
      sheetRef.current?.snapToIndex(1);
    } finally { setSearching(false); }
  };

  const useMyLocation = async () => {
    if (!activeField) return;
    setSearching(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow location to use your current address.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude: lat, longitude: lng } = pos.coords;
      let address = 'Current location';
      try {
        const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${MAPS_KEY}`);
        const j = await r.json();
        address = j.results?.[0]?.formatted_address ?? address;
      } catch { /* keep label */ }

      if (activeField.kind === 'pickup') {
        setDraft({ pickupAddress: address, pickupLat: lat, pickupLng: lng });
        setPickupQuery(address);
      } else {
        updateStop(activeField.idx, { address, lat, lng });
        setStopQueries(prev => { const next = [...prev]; next[activeField.idx] = address; return next; });
      }
      setPredictions([]);
      setActiveField(null);
      Keyboard.dismiss();
    } finally { setSearching(false); }
  };

  // Sync stopQueries length to draft.stops length (when add/remove happens).
  useEffect(() => {
    if (stopQueries.length !== draft.stops.length) {
      setStopQueries(draft.stops.map(s => s.address));
    }
  }, [draft.stops.length]);

  // ── Vehicle safety check ─────────────────────────────────────────────
  // Block hard-stops, soft-warn warningVehicles. Returns true if safe to
  // pick. Called from the vehicle picker tap handler.
  const handlePickVehicle = (v: VehicleType) => {
    if (!selectedCategory || !rateCard) {
      setDraft({ vehicleType: v });
      hasUserOverriddenVehicleRef.current = true;
      return;
    }
    const r = rateCard.vehicleRates[v];
    if (r && draft.weightKg && draft.weightKg > r.maxPayloadKg) {
      Alert.alert(
        'Weight too high',
        `${VEHICLE_LABEL[v]} can carry up to ${r.maxPayloadKg} kg. Your shipment is ${draft.weightKg} kg. Pick a larger vehicle.`,
      );
      return;
    }
    const blocked = selectedCategory.safetyRules?.blockedVehicles ?? [];
    if (blocked.includes(v)) {
      Alert.alert(
        'Not allowed',
        selectedCategory.safetyRules?.warningCopy
          ?? `${selectedCategory.name} can't be transported by ${VEHICLE_LABEL[v]}.`,
      );
      return;
    }
    const warn = selectedCategory.safetyRules?.warningVehicles ?? [];
    const thresholdKg = selectedCategory.safetyRules?.weightThresholdKg;
    const triggersWarning = warn.includes(v) &&
      (thresholdKg == null || (draft.weightKg ?? 0) >= thresholdKg);
    if (triggersWarning) {
      Alert.alert(
        'Heads up',
        selectedCategory.safetyRules?.warningCopy ??
          `${selectedCategory.name} on ${VEHICLE_LABEL[v]} isn't ideal. SEIRS isn't liable for damage in this case.`,
        [
          { text: 'Pick safer vehicle', style: 'cancel' },
          {
            text: 'Continue anyway',
            style: 'destructive',
            onPress: () => {
              setDraft({ vehicleType: v });
              hasUserOverriddenVehicleRef.current = true;
            },
          },
        ],
      );
      return;
    }
    setDraft({ vehicleType: v });
    hasUserOverriddenVehicleRef.current = true;
  };

  // ── Validation per step ──────────────────────────────────────────────
  const canContinue0 = !!draft.categoryCode && !!draft.vehicleType && (draft.weightKg ?? 0) > 0;
  const canContinue1 =
    draft.pickupAddress.trim().length > 5 &&
    draft.pickupLat != null &&
    draft.stops.length > 0 &&
    draft.stops.every(s => s.address.trim().length > 5 && s.lat != null
      && s.recipientName.trim().length > 0 && s.recipientPhone.trim().length > 0);
  const canContinue2 = scheduleNow || scheduledHour != null;

  const next = () => {
    if (step === 0 && !canContinue0) return;
    if (step === 1 && !canContinue1) return;
    setStep(s => (s + 1) as 0 | 1 | 2);
    sheetRef.current?.snapToIndex(1);
    Keyboard.dismiss();
  };
  const back = () => {
    if (step === 0) { router.back(); return; }
    setStep(s => (s - 1) as 0 | 1 | 2);
  };

  // ── Submit ───────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canContinue0 || !canContinue1 || !canContinue2) return;
    if (!quote) {
      Alert.alert('Pricing not ready', 'Wait a moment for the price to compute, then try again.');
      return;
    }
    setLoading(true);
    try {
      const scheduledAt = !scheduleNow && scheduledHour != null
        ? buildScheduledFor(scheduledDate, scheduledHour).toISOString()
        : undefined;

      const res = await businessApi.createDelivery({
        pickupAddress: draft.pickupAddress,
        pickupLat:     draft.pickupLat!,
        pickupLng:     draft.pickupLng!,
        stops: draft.stops.map((s, idx) => ({
          address:        s.address,
          lat:            s.lat!,
          lng:            s.lng!,
          recipientName:  s.recipientName.trim(),
          recipientPhone: s.recipientPhone.trim(),
          notes:          s.note?.trim() || undefined,
          sequenceOrder:  idx + 1,
        })),
        vehicleType:           draft.vehicleType,
        categoryCode:          draft.categoryCode!,
        weightKg:              draft.weightKg!,
        packageDescription:    draft.packageDescription?.trim() || selectedCategory?.name,
        km:                    totalKm,
        estimatedDriveMinutes: totalDriveMin,
        scheduledAt,
        optimizedWaypointOrder: draft.optimizedWaypointOrder ?? undefined,
        routeWasAutoOptimized:  draft.routeWasAutoOptimized,
        isInterState:          false,
        isLongDistance:        totalKm > 100,
        isRecurring:           draft.isRecurring,
      });

      const trackingCode = res?.delivery?.trackingCode ?? res?.trackingCode ?? res?.id?.slice(0, 8);
      resetDraft();
      Alert.alert(
        'Delivery Created',
        `Tracking: ${trackingCode}\nWallet balance: ₦${(res?.wallet?.balanceAfter ?? 0).toLocaleString()}`,
        [{ text: 'OK', onPress: () => router.replace('/(business)/(tabs)/deliveries' as any) }],
      );
    } catch (e: any) {
      Alert.alert('Could not create delivery', e?.message ?? 'Please try again.');
    } finally { setLoading(false); }
  };

  // ── Suggestions panel renderer (Map / Uber pattern) ─────────────────
  const showSuggestions = step === 1 && activeField !== null;
  const activeQueryText = activeField?.kind === 'pickup'
    ? pickupQuery
    : activeField?.kind === 'stop' ? (stopQueries[activeField.idx] ?? '') : '';
  const showNoMatchesHint = showSuggestions && !searching
    && activeQueryText.trim().length >= 3 && predictions.length === 0;

  const renderSuggestions = (forField: 'pickup' | 'stop', stopIdx?: number) => {
    if (!showSuggestions) return null;
    const fieldMatches =
      (forField === 'pickup' && activeField?.kind === 'pickup') ||
      (forField === 'stop'   && activeField?.kind === 'stop' && activeField.idx === stopIdx);
    if (!fieldMatches) return null;
    return (
      <View style={styles.suggBlock}>
        <Pressable style={styles.useLocBtn} onPress={useMyLocation}>
          <Icon name="MapPin" size={18} color="#3A7BD5" />
          <Text style={styles.useLocText}>Use my current location</Text>
        </Pressable>
        {searching && (
          <View style={styles.suggRow}>
            <ActivityIndicator size="small" color="#3A7BD5" />
            <Text style={[styles.suggSub, { marginLeft: 8 }]}>Searching addresses…</Text>
          </View>
        )}
        {predictions.map(p => (
          <Pressable key={p.place_id} style={styles.suggRow} onPress={() => selectPrediction(p)}>
            <View style={styles.suggIcon}><Icon name="MapPin" size={16} color="#6B7280" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.suggMain} numberOfLines={1}>{p.main_text}</Text>
              {!!p.secondary_text && <Text style={styles.suggSub} numberOfLines={1}>{p.secondary_text}</Text>}
            </View>
          </Pressable>
        ))}
        {showNoMatchesHint && (
          <View style={styles.suggRow}>
            <Text style={styles.suggSub}>
              No matches for &quot;{activeQueryText}&quot;. Try a more specific name, or tap &quot;Use my current location&quot; above.
            </Text>
          </View>
        )}
      </View>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        initialRegion={LAGOS}
        showsUserLocation
      >
        {draft.pickupLat != null && (
          <Marker coordinate={{ latitude: draft.pickupLat, longitude: draft.pickupLng! }} pinColor="#22C55E" />
        )}
        {draft.stops.map((s, i) =>
          s.lat != null
            ? <Marker key={i} coordinate={{ latitude: s.lat, longitude: s.lng! }} pinColor="#EF4444" title={`Stop ${i + 1}`} />
            : null,
        )}
        {routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor="#0F2B4C" strokeWidth={4} />
        )}
      </MapView>

      {/* Floating header */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <Pressable style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={back}>
          <Icon name="ArrowLeft" size={20} color={colors.text} />
        </Pressable>
        <View style={[styles.topTitle, { backgroundColor: colors.surface }]}>
          <Text style={[styles.topTitleText, { color: colors.text }]}>New Delivery</Text>
          <Text style={[styles.topStep, { color: colors.textSecond }]}>Step {step + 1} / 3 — {STEPS[step]}</Text>
        </View>
      </SafeAreaView>

      <BottomSheet
        ref={sheetRef}
        index={1}
        snapPoints={snapPoints}
        topInset={sheetTopInset}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetScrollView
          style={styles.sheetInner}
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Config error banner */}
          {configErr && (
            <View style={styles.errorBanner}>
              <Icon name="AlertCircle" size={16} color="#DC2626" />
              <Text style={styles.errorBannerText}>
                Couldn't load pricing config: {configErr}. Pull down to retry.
              </Text>
            </View>
          )}

          {/* ─── STEP 0: WHAT ────────────────────────────────────────── */}
          {step === 0 && (
            <View style={{ gap: 14 }}>
              <Text style={styles.sectionTitle}>What are you sending?</Text>
              <Text style={styles.sectionHint}>
                Pick the closest match — this drives suggested vehicle, dwell time, and any safety rules.
              </Text>

              {catalog.length === 0 ? (
                <ActivityIndicator color="#3A7BD5" />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
                    {catalog.map(cat => {
                      const active = draft.categoryCode === cat.code;
                      return (
                        <Pressable
                          key={cat.code}
                          style={[styles.catCard, active && styles.catCardActive]}
                          onPress={() => setDraft({ categoryCode: cat.code })}
                        >
                          <Text style={[styles.catName, active && { color: '#fff' }]}>{cat.name}</Text>
                          <Text style={[styles.catEx, active && { color: '#DBEAFE' }]} numberOfLines={2}>
                            {cat.examples}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              )}

              <Text style={styles.label}>Total weight (kg)</Text>
              <View style={styles.inputBlock}>
                <BottomSheetTextInput
                  style={styles.miniInput}
                  value={draft.weightKg != null ? String(draft.weightKg) : ''}
                  onChangeText={(v) => {
                    const n = Number(v.replace(/[^\d.]/g, ''));
                    setDraft({ weightKg: isNaN(n) ? undefined : n });
                  }}
                  placeholder="e.g. 5"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                />
              </View>
              <Text style={styles.fieldHint}>
                Required. Drives the suggested vehicle and dwell time per stop.
              </Text>

              <Text style={styles.label}>Quantity (optional)</Text>
              <View style={styles.inputBlock}>
                <BottomSheetTextInput
                  style={styles.miniInput}
                  value={String(draft.quantity)}
                  onChangeText={(v) => {
                    const n = Number(v.replace(/\D/g, ''));
                    setDraft({ quantity: isNaN(n) || n < 1 ? 1 : n });
                  }}
                  placeholder="1"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                />
              </View>

              <Text style={styles.label}>Description (optional)</Text>
              <View style={styles.inputBlock}>
                <BottomSheetTextInput
                  style={styles.miniInput}
                  value={draft.packageDescription ?? ''}
                  onChangeText={(v) => setDraft({ packageDescription: v })}
                  placeholder="e.g. Adebayo's birthday gift, two boxes"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <Text style={styles.label}>Vehicle</Text>
              {selectedCategory?.safetyRules?.warningCopy && (
                <View style={styles.tipBox}>
                  <Icon name="AlertCircle" size={14} color="#D97706" />
                  <Text style={styles.tipText}>{selectedCategory.safetyRules.warningCopy}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {VEHICLE_ORDER.map(v => {
                  const isActive = draft.vehicleType === v;
                  const suggested = selectedCategory?.suggestedVehicles?.includes(v);
                  const blocked = selectedCategory?.safetyRules?.blockedVehicles?.includes(v) ?? false;
                  return (
                    <Pressable
                      key={v}
                      onPress={() => handlePickVehicle(v)}
                      style={[
                        styles.vehChip,
                        isActive  && styles.vehChipActive,
                        suggested && !isActive && styles.vehChipSuggested,
                        blocked   && styles.vehChipBlocked,
                      ]}
                    >
                      <VehicleIcon
                        type={v}
                        size={20}
                        color={isActive ? '#fff' : blocked ? '#9CA3AF' : '#0F2B4C'}
                      />
                      <Text style={[
                        styles.vehChipText,
                        isActive  && { color: '#fff' },
                        blocked   && { color: '#9CA3AF' },
                      ]}>{VEHICLE_LABEL[v]}</Text>
                      {suggested && !isActive && (
                        <View style={styles.suggBadge}><Text style={styles.suggBadgeText}>Suggested</Text></View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* ─── STEP 1: WHERE ──────────────────────────────────────── */}
          {step === 1 && (
            <View style={{ gap: 12 }}>
              <Text style={styles.sectionTitle}>Pickup &amp; Stops</Text>
              <Text style={styles.sectionHint}>
                Up to 5 stops per booking. We'll find the shortest route automatically — turn off below if you want a specific order.
              </Text>

              {/* Pickup */}
              <View style={styles.inputBlock}>
                <View style={styles.inputRow}>
                  <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
                  <BottomSheetTextInput
                    value={pickupQuery}
                    onChangeText={onChangePickup}
                    onFocus={() => { setActiveField({ kind: 'pickup' }); sheetRef.current?.snapToIndex(1); }}
                    placeholder="Pickup address"
                    placeholderTextColor="#9CA3AF"
                    style={styles.inputField}
                  />
                </View>
              </View>
              {renderSuggestions('pickup')}

              {/* Stops */}
              {draft.stops.map((stop, i) => (
                <View key={i} style={styles.stopCard}>
                  <View style={styles.stopHeader}>
                    <View style={styles.stopBadge}>
                      <Text style={styles.stopBadgeText}>Stop {i + 1}</Text>
                    </View>
                    {draft.stops.length > 1 && (
                      <Pressable onPress={() => removeStop(i)} hitSlop={8}>
                        <Icon name="Trash2" size={16} color="#DC2626" />
                      </Pressable>
                    )}
                  </View>

                  <View style={styles.inputBlock}>
                    <View style={styles.inputRow}>
                      <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
                      <BottomSheetTextInput
                        value={stopQueries[i] ?? ''}
                        onChangeText={(t) => onChangeStop(i, t)}
                        onFocus={() => { setActiveField({ kind: 'stop', idx: i }); sheetRef.current?.snapToIndex(1); }}
                        placeholder="Delivery address"
                        placeholderTextColor="#9CA3AF"
                        style={styles.inputField}
                      />
                    </View>
                  </View>

                  {renderSuggestions('stop', i)}

                  <Text style={styles.miniLabel}>Recipient name</Text>
                  <BottomSheetTextInput
                    style={styles.miniInput}
                    value={stop.recipientName}
                    onChangeText={(v) => updateStop(i, { recipientName: v })}
                    placeholder="Full name"
                    placeholderTextColor="#9CA3AF"
                  />
                  <Text style={styles.miniLabel}>Phone</Text>
                  <BottomSheetTextInput
                    style={styles.miniInput}
                    value={stop.recipientPhone}
                    onChangeText={(v) => updateStop(i, { recipientPhone: v })}
                    placeholder="08012345678"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="phone-pad"
                  />
                  <Text style={styles.miniLabel}>Note (optional)</Text>
                  <BottomSheetTextInput
                    style={styles.miniInput}
                    value={stop.note ?? ''}
                    onChangeText={(v) => updateStop(i, { note: v })}
                    placeholder="Leave at gate, call before delivery..."
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              ))}

              {draft.stops.length < 5 && (
                <Pressable style={styles.addStopBtn} onPress={() => addStop({ address: '', recipientName: '', recipientPhone: '' })}>
                  <Icon name="Plus" size={16} color="#3A7BD5" />
                  <Text style={styles.addStopText}>Add Stop (max 5)</Text>
                </Pressable>
              )}

              {/* Auto-optimize toggle */}
              {draft.stops.length >= 2 && (
                <View style={styles.optimizeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optimizeTitle}>Auto-optimise route</Text>
                    <Text style={styles.optimizeSub}>
                      {draft.autoOptimizeRoute
                        ? (wasReordered ? 'Stops have been re-ordered for shortest route.' : 'Will pick shortest route automatically.')
                        : 'Driver visits stops in the order shown above.'}
                    </Text>
                  </View>
                  <Switch
                    value={draft.autoOptimizeRoute}
                    onValueChange={(v) => setDraft({ autoOptimizeRoute: v, routeWasAutoOptimized: v ? true : false })}
                    trackColor={{ true: '#3A7BD5' }}
                  />
                </View>
              )}

              {/* Route stat chip */}
              {(distanceText || durationText) && (
                <View style={styles.routeStat}>
                  {distanceText && <Text style={styles.routeStatText}>📍 {distanceText}</Text>}
                  {distanceText && durationText && <Text style={styles.routeStatDivider}>·</Text>}
                  {durationText && <Text style={styles.routeStatText}>🕐 {durationText} drive</Text>}
                </View>
              )}
            </View>
          )}

          {/* ─── STEP 2: WHEN + SUMMARY ─────────────────────────────── */}
          {step === 2 && (
            <View style={{ gap: 14 }}>
              <Text style={styles.sectionTitle}>Schedule</Text>
              <View style={styles.scheduleRow}>
                <Pressable
                  style={[styles.scheduleChip, scheduleNow && styles.scheduleChipActive]}
                  onPress={() => setScheduleNow(true)}
                >
                  <Text style={[styles.scheduleChipText, scheduleNow && { color: '#fff' }]}>Send Now</Text>
                </Pressable>
                <Pressable
                  style={[styles.scheduleChip, !scheduleNow && styles.scheduleChipActive]}
                  onPress={() => setScheduleNow(false)}
                >
                  <Text style={[styles.scheduleChipText, !scheduleNow && { color: '#fff' }]}>Schedule for Later</Text>
                </Pressable>
              </View>

              {!scheduleNow && (
                <View style={{ gap: 10 }}>
                  <RNCalendar
                    current={scheduledDate}
                    minDate={TODAY_ISO}
                    maxDate={MAX_BOOK_AHEAD}
                    onDayPress={(d: any) => setScheduledDate(d.dateString)}
                    markedDates={{ [scheduledDate]: { selected: true, selectedColor: '#0F2B4C' } }}
                    theme={{ todayTextColor: '#3A7BD5', arrowColor: '#0F2B4C' }}
                  />
                  <Text style={styles.label}>Pickup time (5 AM – 9 PM)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {TIME_SLOTS.map(slot => {
                      const active = scheduledHour === slot.hour;
                      return (
                        <Pressable
                          key={slot.hour}
                          style={[styles.timeChip, active && styles.timeChipActive]}
                          onPress={() => setScheduledHour(slot.hour)}
                        >
                          <Text style={[styles.timeChipText, active && { color: '#fff' }]}>{slot.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Price breakdown card */}
              <Text style={styles.sectionTitle}>Price breakdown</Text>
              {quoteLoading && <ActivityIndicator color="#3A7BD5" />}
              {quoteErr && (
                <View style={styles.errorBanner}>
                  <Icon name="AlertCircle" size={14} color="#DC2626" />
                  <Text style={styles.errorBannerText}>{quoteErr}</Text>
                </View>
              )}
              {quote && <PriceCard quote={quote} />}

              {/* ETA card */}
              {quote && (
                <View style={styles.etaCard}>
                  <Text style={styles.etaTitle}>Estimated time</Text>
                  <Text style={styles.etaLine}>Drive: {totalDriveMin} min</Text>
                  <Text style={styles.etaLine}>Stops dwell: {quote.estimatedDwellMinutes} min ({draft.stops.length} stop{draft.stops.length === 1 ? '' : 's'})</Text>
                  <Text style={styles.etaTotal}>Total: ~{totalDriveMin + quote.estimatedDwellMinutes} min</Text>
                </View>
              )}
            </View>
          )}

          {/* ── Step navigation ─────────────────────────────────────── */}
          <View style={styles.navRow}>
            {step > 0 && (
              <Pressable style={styles.backStepBtn} onPress={back}>
                <Icon name="ChevronDown" size={16} color="#0F2B4C" />
                <Text style={styles.backStepText}>Back</Text>
              </Pressable>
            )}
            {step < 2 ? (
              <Pressable
                style={[
                  styles.nextBtn,
                  !((step === 0 && canContinue0) || (step === 1 && canContinue1)) && styles.nextBtnDisabled,
                ]}
                onPress={next}
              >
                <Text style={styles.nextText}>Continue</Text>
                <Icon name="ArrowRight" size={16} color="#fff" />
              </Pressable>
            ) : (
              <Pressable
                style={[styles.nextBtn, (loading || !quote) && styles.nextBtnDisabled]}
                onPress={handleSubmit}
                disabled={loading || !quote}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Text style={styles.nextText}>
                        Confirm — ₦{quote ? Math.round(quote.customer.total).toLocaleString() : '—'}
                      </Text>
                      <Icon name="Check" size={16} color="#fff" />
                    </>}
              </Pressable>
            )}
          </View>
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Mirror of PricingService.computeStopDwellMinutes — used client-side
 * to compute estimated dwell BEFORE the quote endpoint returns, so the
 * quote payload includes a sensible value. Server is authoritative.
 */
function computePerStopDwell(
  card: RateCard | null,
  category: ServiceCategory | undefined,
  weightKg: number,
): number {
  if (!card || !category) return 5;
  const tier = card.weightTiers.find((t: { minKg: number; maxKg: number | null; extraMinutes: number }) =>
    weightKg >= t.minKg && (t.maxKg === null || weightKg < t.maxKg)
  );
  return category.setupDwellMinutes
       + (tier?.extraMinutes ?? 0)
       + card.dwellBuffers.baselineMinutes;
}

// ── Price breakdown sub-component ───────────────────────────────────────
function PriceCard({ quote }: { quote: PriceBreakdown }) {
  const c = quote.customer;
  const surchargeTotal = c.categorySurcharge + c.timeSurcharges.night + c.timeSurcharges.peak
                       + c.timeSurcharges.weekend + c.zoneSurcharges.interState
                       + c.zoneSurcharges.longDistance + c.zoneSurcharges.overnight + c.zoneSurcharges.restricted;
  const discountTotal  = c.discounts.bulk + c.discounts.recurring + c.discounts.loyalty + c.discounts.welcome;
  return (
    <View style={styles.priceCard}>
      <PriceLine label="Base fare"                           value={c.base} />
      <PriceLine label={`Distance (${quote.km.toFixed(1)} km labour)`} value={c.distanceLabour} />
      <PriceLine label={`Distance (${quote.km.toFixed(1)} km fuel)`}   value={c.distanceFuel} />
      {c.stopBonuses    > 0 && <PriceLine label={`Stops bonus (${quote.stops - 1})`} value={c.stopBonuses} />}
      {surchargeTotal   > 0 && <PriceLine label="Surcharges"           value={surchargeTotal} />}
      {discountTotal    > 0 && <PriceLine label="Discounts"            value={-discountTotal} negative />}
      <View style={styles.priceDivider} />
      <PriceLine label="Subtotal"                                       value={c.vatBase} />
      <PriceLine label={`VAT 7.5%`}                                     value={c.vat} />
      <View style={styles.priceDivider} />
      <PriceLine label="Total" value={c.total} bold />
      <Text style={styles.priceWho}>
        Driver earns ₦{Math.round(quote.driver.total).toLocaleString()}. SEIRS keeps ₦{Math.round(quote.seirsNet).toLocaleString()}.
      </Text>
    </View>
  );
}

function PriceLine({ label, value, bold, negative }: { label: string; value: number; bold?: boolean; negative?: boolean }) {
  const sign = negative ? '−' : '';
  return (
    <View style={styles.priceRow}>
      <Text style={[styles.priceLabel, bold && { fontWeight: '700' }]}>{label}</Text>
      <Text style={[styles.priceValue, bold && { fontWeight: '700' }, negative && { color: '#16A34A' }]}>
        {sign}₦{Math.abs(Math.round(value)).toLocaleString()}
      </Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  topTitle: { flex: 1, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff', borderRadius: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  topTitleText: { fontSize: 14, fontWeight: '700', color: '#0F2B4C' },
  topStep: { fontSize: 11, color: '#6B7280', marginTop: 2 },

  sheetInner: { paddingHorizontal: 18, paddingTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0F2B4C', marginTop: 4 },
  sectionHint: { fontSize: 12, color: '#6B7280' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 6 },
  miniLabel: { fontSize: 11, fontWeight: '600', color: '#6B7280', marginTop: 8, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldHint: { fontSize: 11, color: '#9CA3AF', marginTop: -8 },

  inputBlock: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  inputField: { flex: 1, fontSize: 14, color: '#0F2B4C' },
  dot: { width: 10, height: 10, borderRadius: 5 },

  miniInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F2B4C' },

  // Suggestions
  suggBlock: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, marginTop: -4 },
  useLocBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  useLocText: { fontSize: 14, fontWeight: '600', color: '#3A7BD5' },
  suggRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  suggIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  suggMain: { fontSize: 14, fontWeight: '500', color: '#0F2B4C' },
  suggSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },

  // Category cards
  catCard: { width: 140, padding: 12, borderRadius: 12, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' },
  catCardActive: { backgroundColor: '#0F2B4C', borderColor: '#0F2B4C' },
  catName: { fontSize: 13, fontWeight: '700', color: '#0F2B4C' },
  catEx: { fontSize: 11, color: '#6B7280', marginTop: 4 },

  // Vehicle chips
  vehChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 22, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  vehChipActive: { backgroundColor: '#0F2B4C', borderColor: '#0F2B4C' },
  vehChipSuggested: { borderColor: '#3A7BD5', backgroundColor: '#EFF6FF' },
  vehChipBlocked: { backgroundColor: '#F9FAFB', borderColor: '#F3F4F6', opacity: 0.5 },
  vehChipText: { fontSize: 13, fontWeight: '600', color: '#0F2B4C' },
  suggBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: '#3A7BD5' },
  suggBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 0.4, textTransform: 'uppercase' },

  // Tip / safety banner
  tipBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, backgroundColor: '#FFFBEB', borderColor: '#FCD34D', borderWidth: 1, borderRadius: 10 },
  tipText: { flex: 1, fontSize: 12, color: '#92400E' },

  // Stops
  stopCard: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  stopHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  stopBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#0F2B4C' },
  stopBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  addStopBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderStyle: 'dashed', borderWidth: 1.5, borderColor: '#3A7BD5', backgroundColor: '#EFF6FF' },
  addStopText: { fontSize: 13, fontWeight: '600', color: '#3A7BD5' },

  // Optimize toggle
  optimizeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  optimizeTitle: { fontSize: 13, fontWeight: '700', color: '#0F2B4C' },
  optimizeSub: { fontSize: 11, color: '#6B7280', marginTop: 2 },

  // Route stat
  routeStat: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F0F5FF', borderColor: '#3A7BD540', borderWidth: 1, borderRadius: 10, paddingVertical: 8 },
  routeStatText: { fontSize: 13, fontWeight: '600', color: '#0F2B4C' },
  routeStatDivider: { color: '#9CA3AF' },

  // Schedule
  scheduleRow: { flexDirection: 'row', gap: 8 },
  scheduleChip: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff', alignItems: 'center' },
  scheduleChipActive: { backgroundColor: '#0F2B4C', borderColor: '#0F2B4C' },
  scheduleChipText: { fontSize: 13, fontWeight: '700', color: '#0F2B4C' },
  timeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  timeChipActive: { backgroundColor: '#3A7BD5', borderColor: '#3A7BD5' },
  timeChipText: { fontSize: 12, fontWeight: '600', color: '#0F2B4C' },

  // Price card
  priceCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', padding: 14 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  priceLabel: { fontSize: 12, color: '#374151' },
  priceValue: { fontSize: 13, color: '#0F2B4C', fontVariant: ['tabular-nums'] },
  priceDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 6 },
  priceWho: { fontSize: 11, color: '#9CA3AF', marginTop: 8, fontStyle: 'italic' },

  // ETA
  etaCard: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  etaTitle: { fontSize: 13, fontWeight: '700', color: '#0F2B4C', marginBottom: 6 },
  etaLine: { fontSize: 12, color: '#6B7280' },
  etaTotal: { fontSize: 14, fontWeight: '700', color: '#0F2B4C', marginTop: 6 },

  // Errors
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 10 },
  errorBannerText: { flex: 1, fontSize: 12, color: '#991B1B' },

  // Nav row
  navRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
  backStepBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  backStepText: { fontSize: 13, fontWeight: '600', color: '#0F2B4C' },
  nextBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14, borderRadius: 12, backgroundColor: '#0F2B4C' },
  nextBtnDisabled: { opacity: 0.4 },
  nextText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
