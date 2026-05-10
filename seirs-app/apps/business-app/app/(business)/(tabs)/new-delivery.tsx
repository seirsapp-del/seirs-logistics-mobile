/**
 * Business · New Delivery — full-map + draggable bottom-sheet redesign.
 *
 * Mirrors the customer-app Send a Package pattern (full-screen Google
 * Maps under a draggable @gorhom/bottom-sheet) but supports the
 * business-specific flows it had before:
 *   - Multi-stop deliveries (1-5 dropoffs, each with recipient + phone)
 *   - Recurring schedules (daily / weekly / monthly)
 *   - Same VehicleIcon + categories chips + special instructions
 *
 * Steps:
 *   1. Pickup + stops (inline autocomplete in the sheet)
 *   2. Vehicle + category + weight + instructions
 *   3. When (Send Now / Schedule for Later) + recurring + summary
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
import { businessApi } from '@/services/api';
import { useBusinessStore } from '@/store/businessStore';
import { VehicleIcon, type VehicleType } from '@seirs/shared';
import { useDirectionsPolyline } from '@/components/useDirectionsPolyline';

const MAPS_KEY = 'AIzaSyCl-9atGvhkQb9acFyVkLv9HyDMPUgjIIM';
const LAGOS = { latitude: 6.5244, longitude: 3.3792, latitudeDelta: 0.1, longitudeDelta: 0.1 };

const VEHICLES: { key: VehicleType; label: string; maxKg: number }[] = [
  { key: 'bicycle',     label: 'Bicycle',     maxKg: 5    },
  { key: 'motorcycle',  label: 'Motorcycle',  maxKg: 20   },
  { key: 'tricycle',    label: 'Tricycle',    maxKg: 100  },
  { key: 'car',         label: 'Car',         maxKg: 200  },
  { key: 'van',         label: 'Van',         maxKg: 800  },
  { key: 'truck_small', label: 'Small Truck', maxKg: 3000 },
  { key: 'truck_large', label: 'Large Truck', maxKg: 9999 },
];

const CATEGORIES = [
  'Documents', 'Electronics', 'Clothing', 'Food & Beverages', 'Furniture',
  'Building Materials', 'Farm Produce', 'Medical Supplies', 'Industrial Goods', 'Other',
];

const RECURRING = [
  { key: 'daily',   label: 'Daily' },
  { key: 'weekly',  label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

const STEPS = ['Pickup & Stops', 'Vehicle & Package', 'Schedule'] as const;

// 5 AM – 9 PM (matches customer Send + memory rule).
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

// "pickup" + "stop-{idx}" — the autocomplete state needs to know which
// field it's currently driving so taps fill the right address row.
type ActiveField = { kind: 'pickup' } | { kind: 'stop'; idx: number } | null;

interface Prediction { place_id: string; main_text: string; secondary_text: string }

export default function NewDeliveryScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { draft, setDraft, addStop, removeStop, updateStop, resetDraft } = useBusinessStore();

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [loading, setLoading] = useState(false);

  // Per-row text inputs. Synced to store on selection so the map and
  // submission see the chosen address.
  const [pickupQuery, setPickupQuery] = useState(draft.pickupAddress);
  const [stopQueries, setStopQueries] = useState<string[]>(draft.stops.map(s => s.address));

  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [searching,   setSearching]   = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Schedule — local state mirrors customer Send.
  const [scheduleNow,   setScheduleNow]   = useState(true);
  const [scheduledDate, setScheduledDate] = useState<string>(TODAY_ISO);
  const [scheduledHour, setScheduledHour] = useState<number | null>(null);

  const mapRef   = useRef<MapView>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => [180, '92%'], []);
  const sheetTopInset = insets.top + 88;

  // Real road-following polyline pickup → first stop. Multi-leg routing
  // (visit all stops in order) needs Google Distance Matrix; for now we
  // draw the leg between pickup and the *first* stop with a coordinate.
  const firstStopWithCoords = draft.stops.find(s => s.lat != null && s.lng != null);
  const { coords: routeCoords, distanceText, durationText } = useDirectionsPolyline(
    draft.pickupLat != null ? { latitude: draft.pickupLat, longitude: draft.pickupLng! } : null,
    firstStopWithCoords     ? { latitude: firstStopWithCoords.lat!, longitude: firstStopWithCoords.lng! } : null,
  );

  // Center the map on the user's GPS once.
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

  // Auto-fit when both pickup + at least one stop have coordinates.
  useEffect(() => {
    if (!mapRef.current || draft.pickupLat == null) return;
    const stopCoords = draft.stops
      .filter(s => s.lat != null && s.lng != null)
      .map(s => ({ latitude: s.lat!, longitude: s.lng! }));
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

  // ── Places autocomplete ──────────────────────────────────────────────────
  const fetchPredictions = useCallback(async (text: string) => {
    if (text.length < 3) { setPredictions([]); return; }
    setSearching(true);
    try {
      const url =
        `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
        `?input=${encodeURIComponent(text)}&language=en&key=${MAPS_KEY}`;
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

      if (activeField?.kind === 'pickup') {
        setDraft({ pickupAddress: address, pickupLat: loc.lat, pickupLng: loc.lng });
        setPickupQuery(address);
      } else if (activeField?.kind === 'stop') {
        updateStop(activeField.idx, { address, lat: loc.lat, lng: loc.lng });
        setStopQueries(prev => { const next = [...prev]; next[activeField.idx] = address; return next; });
      }
      setPredictions([]);
      setActiveField(null);
      Keyboard.dismiss();
    } finally { setSearching(false); }
  };

  const useMyLocation = async () => {
    if (!activeField) return;
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

  // ── Validation + nav ─────────────────────────────────────────────────────
  const canContinue0 =
    draft.pickupAddress.trim().length > 5 &&
    draft.stops.every(s => s.address.trim().length > 5 && s.recipientName && s.recipientPhone);
  const canContinue1 = !!draft.vehicleType && !!draft.packageCategory;
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

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const scheduledAt = !scheduleNow && scheduledHour != null
        ? buildScheduledFor(scheduledDate, scheduledHour).toISOString()
        : draft.scheduledAt;
      const res = await businessApi.createDelivery({ ...draft, scheduledAt });
      resetDraft();
      Alert.alert(
        'Delivery Created',
        `Tracking: ${res.trackingNumber ?? res.id?.slice(0, 8)}`,
        [{ text: 'OK', onPress: () => router.replace('/(business)/deliveries' as any) }],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to create delivery.');
    } finally { setLoading(false); }
  };

  const showSuggestions = step === 0 && activeField !== null && predictions.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={LAGOS}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {draft.pickupLat != null && (
          <Marker
            coordinate={{ latitude: draft.pickupLat, longitude: draft.pickupLng! }}
            pinColor="#22C55E"
            title="Pickup"
            description={draft.pickupAddress}
          />
        )}
        {draft.stops.map((s, i) =>
          s.lat != null ? (
            <Marker
              key={i}
              coordinate={{ latitude: s.lat, longitude: s.lng! }}
              pinColor="#EF4444"
              title={`Stop ${i + 1}: ${s.recipientName || 'Recipient'}`}
              description={s.address}
            />
          ) : null,
        )}
        {routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor="#0F2B4C" strokeWidth={4} />
        )}
      </MapView>

      {/* Floating header */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={back}>
          <Icon name="ArrowLeft" size={20} color="#0F2B4C" />
        </Pressable>
        <View style={styles.topTitle}>
          <Text style={styles.topTitleText}>New Delivery</Text>
          <Text style={styles.topStep}>Step {step + 1} / 3 — {STEPS[step]}</Text>
        </View>
      </SafeAreaView>

      <BottomSheet
        ref={sheetRef}
        index={1}
        snapPoints={snapPoints}
        topInset={sheetTopInset}
        backgroundStyle={{ backgroundColor: '#fff' }}
        handleIndicatorStyle={{ backgroundColor: '#E5E7EB' }}
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetScrollView
          style={styles.sheetInner}
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* STEP 0 — Pickup + Stops */}
          {step === 0 && (
            <View style={{ gap: 12 }}>
              {/* Pickup row */}
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

              {(distanceText || durationText) && (
                <View style={styles.routeStat}>
                  {distanceText && <Text style={styles.routeStatText}>📍 {distanceText}</Text>}
                  {distanceText && durationText && <Text style={styles.routeStatDivider}>·</Text>}
                  {durationText && <Text style={styles.routeStatText}>🕐 {durationText}</Text>}
                </View>
              )}

              {/* Inline suggestions list. */}
              {showSuggestions && (
                <View>
                  <Pressable style={styles.useLocBtn} onPress={useMyLocation}>
                    <Icon name="MapPin" size={18} color="#3A7BD5" />
                    <Text style={styles.useLocText}>Use my current location</Text>
                  </Pressable>
                  {predictions.map(p => (
                    <Pressable key={p.place_id} style={styles.suggRow} onPress={() => selectPrediction(p)}>
                      <View style={styles.suggIcon}>
                        <Icon name="MapPin" size={16} color="#6B7280" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggMain} numberOfLines={1}>{p.main_text}</Text>
                        {!!p.secondary_text && <Text style={styles.suggSub} numberOfLines={1}>{p.secondary_text}</Text>}
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* STEP 1 — Vehicle + Package */}
          {step === 1 && (
            <View style={{ gap: 12 }}>
              <Text style={styles.label}>Package Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {CATEGORIES.map(c => (
                    <Pressable
                      key={c}
                      style={[styles.chip, draft.packageCategory === c && styles.chipActive]}
                      onPress={() => setDraft({ packageCategory: c })}
                    >
                      <Text style={[styles.chipText, draft.packageCategory === c && styles.chipTextActive]}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>

              <Text style={styles.label}>Vehicle Type</Text>
              <View style={styles.vehicleGrid}>
                {VEHICLES.map(v => (
                  <Pressable
                    key={v.key}
                    style={[styles.vehicleCard, draft.vehicleType === v.key && styles.vehicleCardActive]}
                    onPress={() => setDraft({ vehicleType: v.key })}
                  >
                    <VehicleIcon type={v.key} size={28} color={draft.vehicleType === v.key ? '#3A7BD5' : '#0F2B4C'} />
                    <Text style={[styles.vehicleLabel, draft.vehicleType === v.key && styles.vehicleLabelActive]}>{v.label}</Text>
                    <Text style={styles.vehicleKg}>≤{v.maxKg < 9999 ? `${v.maxKg}kg` : '3t+'}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Approx. Weight (kg)</Text>
              <BottomSheetTextInput
                style={styles.miniInput}
                value={draft.packageWeight?.toString() ?? ''}
                onChangeText={(v) => setDraft({ packageWeight: v ? Number(v) : undefined })}
                placeholder="e.g. 5"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
              />

              <Text style={styles.label}>Special Instructions (optional)</Text>
              <BottomSheetTextInput
                style={[styles.miniInput, { minHeight: 80, textAlignVertical: 'top' }]}
                value={draft.specialInstructions ?? ''}
                onChangeText={(v) => setDraft({ specialInstructions: v })}
                placeholder="Fragile, handle with care..."
                placeholderTextColor="#9CA3AF"
                multiline
              />
            </View>
          )}

          {/* STEP 2 — Schedule + Recurring */}
          {step === 2 && (
            <View style={{ gap: 12 }}>
              <Text style={styles.label}>When?</Text>
              {[
                { now: true,  title: 'Send Now',           desc: 'Driver assigned immediately'  },
                { now: false, title: 'Schedule for Later', desc: 'Pick a date and time'         },
              ].map(opt => (
                <Pressable
                  key={String(opt.now)}
                  style={[styles.scheduleOpt, scheduleNow === opt.now && styles.scheduleOptActive]}
                  onPress={() => setScheduleNow(opt.now)}
                >
                  <Icon name={opt.now ? 'Zap' : 'Calendar'} size={20} color={scheduleNow === opt.now ? '#3A7BD5' : '#6B7280'} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.scheduleTitle}>{opt.title}</Text>
                    <Text style={styles.scheduleDesc}>{opt.desc}</Text>
                  </View>
                </Pressable>
              ))}

              {!scheduleNow && (
                <View style={styles.scheduleCard}>
                  <RNCalendar
                    minDate={TODAY_ISO}
                    maxDate={MAX_BOOK_AHEAD}
                    current={scheduledDate}
                    onDayPress={(day) => {
                      setScheduledDate(day.dateString);
                      if (day.dateString === TODAY_ISO && scheduledHour != null && scheduledHour <= new Date().getHours()) {
                        setScheduledHour(null);
                      }
                    }}
                    markedDates={{ [scheduledDate]: { selected: true, selectedColor: '#3A7BD5' } }}
                    theme={{
                      todayTextColor:        '#3A7BD5',
                      arrowColor:            '#3A7BD5',
                      selectedDayTextColor:  '#fff',
                      textMonthFontWeight:   '600',
                    }}
                    style={{ borderRadius: 12, marginBottom: 12 }}
                  />
                  <Text style={styles.label}>Time (5 AM – 9 PM)</Text>
                  <View style={styles.chipRow}>
                    {TIME_SLOTS.map(t => {
                      const active = scheduledHour === t.hour;
                      const isPast = scheduledDate === TODAY_ISO && t.hour <= new Date().getHours();
                      if (isPast) return null;
                      return (
                        <Pressable
                          key={t.hour}
                          style={[styles.timeChip, active && styles.timeChipActive]}
                          onPress={() => setScheduledHour(t.hour)}
                        >
                          <Text style={[styles.timeChipText, active && styles.timeChipTextActive]}>{t.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Recurring Delivery</Text>
                  <Text style={styles.toggleSub}>Auto-schedule this route repeatedly</Text>
                </View>
                <Switch
                  value={draft.isRecurring}
                  onValueChange={(v) => setDraft({ isRecurring: v, recurringPattern: v ? 'weekly' : null })}
                  trackColor={{ true: '#3A7BD5' }}
                  thumbColor="#fff"
                />
              </View>

              {draft.isRecurring && (
                <View style={styles.patternRow}>
                  {RECURRING.map(r => (
                    <Pressable
                      key={r.key}
                      style={[styles.patternBtn, draft.recurringPattern === r.key && styles.patternBtnActive]}
                      onPress={() => setDraft({ recurringPattern: r.key as any })}
                    >
                      <Text style={[styles.patternText, draft.recurringPattern === r.key && styles.patternTextActive]}>{r.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Summary */}
              <View style={styles.summary}>
                <Text style={styles.summaryTitle}>Order Summary</Text>
                <SumRow label="Pickup"   value={draft.pickupAddress} />
                <SumRow label="Stops"    value={`${draft.stops.length} stop${draft.stops.length > 1 ? 's' : ''}`} />
                <SumRow label="Vehicle"  value={VEHICLES.find(v => v.key === draft.vehicleType)?.label ?? '—'} />
                <SumRow label="Category" value={draft.packageCategory ?? '—'} />
                {distanceText && <SumRow label="Distance" value={distanceText} />}
                {!scheduleNow && scheduledHour != null && (
                  <SumRow label="When" value={buildScheduledFor(scheduledDate, scheduledHour).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} />
                )}
                {scheduleNow && <SumRow label="When" value="Send now" />}
                {draft.isRecurring && <SumRow label="Recurring" value={draft.recurringPattern ?? ''} />}
              </View>
            </View>
          )}

          {/* CTA */}
          <Pressable
            style={[
              styles.cta,
              { marginTop: 20 },
              loading && { opacity: 0.6 },
              ((step === 0 && !canContinue0) || (step === 1 && !canContinue1) || (step === 2 && !canContinue2)) && styles.ctaDisabled,
            ]}
            disabled={loading || (step === 0 && !canContinue0) || (step === 1 && !canContinue1) || (step === 2 && !canContinue2)}
            onPress={step < 2 ? next : handleSubmit}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : (
                <>
                  <Text style={styles.ctaText}>{step === 2 ? 'Confirm & Dispatch' : 'Continue'}</Text>
                  <Icon name={step === 2 ? 'Send' : 'ArrowRight'} size={18} color="#fff" />
                </>
              )}
          </Pressable>
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.sumRow}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={styles.sumValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  topBar:       { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, gap: 8, zIndex: 10 },
  backBtn:      { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  topTitle:     { flex: 1, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 22, alignItems: 'center', backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  topTitleText: { fontSize: 15, fontWeight: '700', color: '#0F2B4C' },
  topStep:      { fontSize: 11, color: '#6B7280', marginTop: 2 },

  sheetInner:   { paddingHorizontal: 16 },
  label:        { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 8, marginBottom: 4 },
  miniLabel:    { fontSize: 12, color: '#6B7280', marginTop: 8, marginBottom: 4 },

  inputBlock:   { borderWidth: 1.5, borderRadius: 12, paddingVertical: 4, backgroundColor: '#F9FAFB', borderColor: '#E5E7EB' },
  inputRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, height: 48 },
  dot:          { width: 10, height: 10, borderRadius: 5 },
  inputField:   { flex: 1, fontSize: 15, color: '#0F2B4C', paddingVertical: 0 },
  miniInput:    { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 14, color: '#0F2B4C' },

  stopCard:     { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  stopHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  stopBadge:    { backgroundColor: '#3A7BD5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  stopBadgeText:{ color: '#fff', fontSize: 12, fontWeight: '700' },
  addStopBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#3A7BD5', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12 },
  addStopText:  { color: '#3A7BD5', fontWeight: '600', fontSize: 14 },

  routeStat:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F0F5FF', borderColor: '#3A7BD540', borderWidth: 1, borderRadius: 10, paddingVertical: 8 },
  routeStatText:    { fontSize: 13, fontWeight: '600', color: '#0F2B4C' },
  routeStatDivider: { color: '#9CA3AF' },

  useLocBtn:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  useLocText:   { fontSize: 14, fontWeight: '600', color: '#3A7BD5' },
  suggRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  suggIcon:     { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  suggMain:     { fontSize: 14, fontWeight: '500', color: '#0F2B4C' },
  suggSub:      { fontSize: 12, color: '#6B7280', marginTop: 2 },

  chip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  chipActive:   { backgroundColor: '#0F2B4C', borderColor: '#0F2B4C' },
  chipText:     { fontSize: 13, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  vehicleGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vehicleCard:  { width: '30%', backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB' },
  vehicleCardActive: { borderColor: '#3A7BD5', backgroundColor: '#F0F5FF' },
  vehicleLabel: { fontSize: 11, fontWeight: '600', color: '#374151', textAlign: 'center' },
  vehicleLabelActive: { color: '#0F2B4C' },
  vehicleKg:    { fontSize: 10, color: '#9CA3AF', marginTop: 2 },

  scheduleOpt:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  scheduleOptActive: { borderColor: '#3A7BD5', backgroundColor: '#F0F5FF' },
  scheduleTitle: { fontSize: 14, fontWeight: '600', color: '#0F2B4C' },
  scheduleDesc:  { fontSize: 12, color: '#6B7280', marginTop: 2 },
  scheduleCard:  { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip:      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  timeChipActive:{ backgroundColor: '#3A7BD5', borderColor: '#3A7BD5' },
  timeChipText:  { fontSize: 13, fontWeight: '500', color: '#0F2B4C' },
  timeChipTextActive: { color: '#fff' },

  toggleRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  toggleLabel:  { fontSize: 14, fontWeight: '600', color: '#0F2B4C' },
  toggleSub:    { fontSize: 12, color: '#6B7280', marginTop: 2 },
  patternRow:   { flexDirection: 'row', gap: 8 },
  patternBtn:   { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  patternBtnActive: { borderColor: '#0F2B4C', backgroundColor: '#0F2B4C' },
  patternText:  { fontSize: 13, fontWeight: '600', color: '#374151' },
  patternTextActive: { color: '#fff' },

  summary:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: '#0F2B4C', marginBottom: 10 },
  sumRow:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, gap: 12 },
  sumLabel:     { fontSize: 13, color: '#6B7280' },
  sumValue:     { fontSize: 13, fontWeight: '600', color: '#0F2B4C', flex: 1, textAlign: 'right' },

  cta:          { backgroundColor: '#0F2B4C', borderRadius: 12, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaDisabled:  { opacity: 0.4 },
  ctaText:      { color: '#fff', fontWeight: '700', fontSize: 15 },
});
