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
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { type PickedAddress } from '@/components/AddressPicker';
import { useDirectionsPolyline } from '@/components/useDirectionsPolyline';
import { LAGOS_COORDS, DEFAULT_MAP_REGION } from '@/constants/mockData';

import { mapsApi, deliveriesApi } from '@/services/api';
import { showDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';

// Places and geocoding go through our backend (security review
// 2026-08-12): the Google key is no longer shipped inside the app.

type Field = 'pickup' | 'dropoff';

interface Prediction {
  place_id:       string;
  main_text:      string;
  secondary_text: string;
}

export default function RequestDriverScreen() {
  const router = useRouter();
  const navigation = useNavigation();

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

  // Recent destinations (founder 23 Aug): riders repeat routes daily.
  // Last 3 distinct drop-offs from trip history; one tap refills.
  const [recents, setRecents] = useState<Array<{ address: string; lat: number; lng: number }>>([]);
  useEffect(() => {
    deliveriesApi.myDeliveries(1, 15)
      .then((r: any) => {
        const seen = new Set<string>();
        const out: Array<{ address: string; lat: number; lng: number }> = [];
        for (const d of r?.items ?? []) {
          const a = String(d.dropoffAddress ?? '').trim();
          if (!a || seen.has(a) || !Number(d.dropoffLat)) continue;
          seen.add(a);
          out.push({ address: a, lat: Number(d.dropoffLat), lng: Number(d.dropoffLng) });
          if (out.length >= 3) break;
        }
        setRecents(out);
      })
      .catch(() => {});
  }, []);

  // Who is this ride for? First name only travels to the driver
  // (privacy: no surname to look up, no phone: chat instead).
  const [riderIsMe,  setRiderIsMe]  = useState(true);
  const [riderName,  setRiderName]  = useState('');

  const useRecent = (r: { address: string; lat: number; lng: number }) => {
    setDropoff({ address: r.address, lat: r.lat, lng: r.lng });
    setDropoffQuery(r.address);
    setPredictions([]);
    Keyboard.dismiss();
  };

  const swapEnds = () => {
    const p = pickup, pq = pickupQuery;
    setPickup(dropoff); setPickupQuery(dropoffQuery);
    setDropoff(p);      setDropoffQuery(pq);
  };

  // QA 2026-08-15: hardware back silently discarded a typed pickup and
  // destination with no warning (it ate a whole entered route during the
  // capture session). If either field holds anything, leaving now asks
  // first; an empty form leaves instantly like before.
  useEffect(() => {
    const sub = (navigation as any).addListener?.('beforeRemove', (e: any) => {
      if (!pickup && !dropoff) return;
      e.preventDefault();
      showDialog({
        title: 'Discard this trip?',
        message: 'Your pickup and destination will be cleared.',
        actions: [
          { text: 'Discard', style: 'destructive',
            onPress: () => (navigation as any).dispatch(e.data.action) },
          { text: 'Keep editing', style: 'cancel' },
        ],
      });
    });
    return sub;
  }, [navigation, pickup, dropoff]);

  // Inline autocomplete state: replaces the old modal AddressPicker.
  /**
   * "Book again" on a finished ride routes here with the old route's
   * coordinates (founder 2026-08-30: a rider who takes the same trip every
   * morning should not retype both ends of it). Seeded once on mount so a
   * later edit is never clobbered; the fare is quoted fresh either way.
   */
  const repeat = useLocalSearchParams<{
    pickupAddress?: string; pickupLat?: string; pickupLng?: string;
    dropAddress?:   string; dropLat?:   string; dropLng?:   string;
  }>();

  const [pickupQuery,  setPickupQuery]  = useState('');
  const [dropoffQuery, setDropoffQuery] = useState('');
  const [activeField,  setActiveField]  = useState<Field | null>(null);

  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (repeat.pickupAddress && repeat.pickupLat && repeat.pickupLng) {
      const p = { address: String(repeat.pickupAddress), lat: Number(repeat.pickupLat), lng: Number(repeat.pickupLng) };
      setPickup(p); setPickupQuery(p.address);
    }
    if (repeat.dropAddress && repeat.dropLat && repeat.dropLng) {
      const dz = { address: String(repeat.dropAddress), lat: Number(repeat.dropLat), lng: Number(repeat.dropLng) };
      setDropoff(dz); setDropoffQuery(dz.address);
    }
  }, []);
  const [predictions,  setPredictions]  = useState<Prediction[]>([]);
  const [searching,    setSearching]    = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mapRef   = useRef<MapView>(null);
  const sheetRef = useRef<BottomSheet>(null);
  // Pixel-based snap points: consistent across phone sizes:
  //   200 = just the two address inputs visible (peek)
  //   480 = inputs + vehicles + share + CTA (comfy default; height-of-content)
  // No "full screen" snap when not searching: that's where the empty
  // space came from. When the user focuses an input we use keyboardBehavior
  // "extend" to lift the sheet above the keyboard so suggestions are visible.
  // Third snap exists only for search: 480 minus a ~300px keyboard left a
  // ~180px band, so the predictions list rendered entirely under the
  // keyboard: the user typed and saw nothing change (A30 field test,
  // 2026-08-15). Focus lifts the sheet to 88%; picking a result or
  // dismissing the keyboard drops it back to the comfy default.
  const snapPoints = useMemo(() => [200, 480, '88%'], []);

  // Whenever the keyboard goes away (result picked, back pressed, tap on
  // the map) the search snap has no reason to persist: return to the
  // default so the map stays the hero.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      sheetRef.current?.snapToIndex(1);
    });
    return () => sub.remove();
  }, []);

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
        // Only follow the GPS when it lands inside Nigeria (QA 2026-08-15:
        // the founder opened this screen in Berlin and got a Berlin map in a
        // Nigerian ride app). Outside the service area, the Lagos default
        // region already showing is the right answer: the user is about to
        // type a Nigerian address anyway.
        const inNigeria =
          loc.coords.latitude  >= 4.0 && loc.coords.latitude  <= 14.0 &&
          loc.coords.longitude >= 2.5 && loc.coords.longitude <= 15.0;
        if (!inNigeria) return;
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
    distanceMeters,
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
      const json = await mapsApi.autocomplete({ input: text });
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
      const json = await mapsApi.placeDetails(p.place_id, 'geometry,formatted_address');
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

      // Reverse geocode (Geocoding API may not be enabled: fall back to friendly label).
      let address = 'Current location';
      try {
        const j = await mapsApi.geocode({ latlng: `${lat},${lng}` });
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

  /**
   * Distance for the fare, from the numeric field the hook already
   * exposes for exactly this (audit 2026-08-14).
   *
   * This used to regex the first number out of the human-readable
   * distance string, which is a display format and mis-parses in both
   * directions:
   *   "850 m"    -> 850, so any sub-kilometre ride was priced as 850 km
   *   "1,234 km" -> 1, because the match stops at the thousands comma
   * The first is the common one: every short hop across a neighbourhood
   * formats in metres.
   *
   * 0 while the route resolves, so calcRideFare returns the base fare
   * rather than a guess.
   */
  const distKmParsed = distanceMeters != null ? distanceMeters / 1000 : 0;

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
        distanceKm: String(distKmParsed),
        riderName:  riderIsMe ? '' : riderName.trim(),
        // durationText was passed here and never read on the other side.
        // It is not passed at all now: no screen should be one line away
        // from printing a Google ETA (2026-08-23 sweep).
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
        initialRegion={DEFAULT_MAP_REGION}
        customMapStyle={isDark ? DARK_MAP_STYLE : []}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {pickup  && <Marker coordinate={{ latitude: pickup.lat,  longitude: pickup.lng  }} pinColor="#22C55E" title={tx('auto.request.pickup', 'Pickup')}  description={pickup.address}  />}
        {dropoff && <Marker coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }} pinColor="#EF4444" title={tx('auto.request.dropoff', 'Dropoff')} description={dropoff.address} />}
        {pickup && dropoff && routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor={theme.primary} strokeWidth={4} />
        )}
      </MapView>

      <SafeAreaView edges={['top', 'bottom']} style={styles.topBar}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surface }, Shadows.sm]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={[styles.topTitle, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.topTitleText, { color: theme.text }]}>
            <Text style={{ color: theme.primary, fontWeight: '800' }}>1/3</Text>
            {'  '}{t('request2.step1Title', { defaultValue: 'Where to?' })}
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
        // "extend" = sheet rises to cover the keyboard so the input stays visible.
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetScrollView
          style={styles.sheetInner}
          // The CTA sat under the A30's translucent 3-button nav bar
          // (insets.bottom lies as 0 there): hard floor, founder 23 Aug.
          contentContainerStyle={{ paddingBottom: Spacing.xl + Math.max(insets.bottom, 48) + 8 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Address inputs: inline, no modal pop-up */}
          <View style={[styles.inputBlock, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <View style={styles.inputRow}>
              <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
              <BottomSheetTextInput
                value={pickupQuery}
                onChangeText={(t) => onChangeQuery('pickup', t)}
                onFocus={() => { setActiveField('pickup'); sheetRef.current?.snapToIndex(2); }}
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
                onFocus={() => { setActiveField('dropoff'); sheetRef.current?.snapToIndex(2); }}
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

          {/* Swap: going home is the same trip reversed. */}
          {(pickup || dropoff) && (
            <Pressable onPress={swapEnds} style={{ alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 4 }}>
              <Ionicons name="swap-vertical" size={15} color={theme.primary} />
              <Text style={{ color: theme.primary, fontSize: FontSize.xs, fontWeight: FontWeight.semibold }}>
                {t('request2.swap', { defaultValue: 'Swap' })}
              </Text>
            </Pressable>
          )}

          {/* Recent destinations: one tap rebooks the daily route. */}
          {!dropoff && recents.length > 0 && (
            <View style={{ marginTop: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: theme.textThird, marginBottom: 6 }}>
                {t('request2.recent', { defaultValue: 'RECENT' })}
              </Text>
              {recents.map((r) => (
                <Pressable
                  key={r.address}
                  onPress={() => useRecent(r)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 }}
                >
                  <Ionicons name="time-outline" size={16} color={theme.textSecond} />
                  <Text style={{ flex: 1, color: theme.text, fontSize: FontSize.sm }} numberOfLines={1}>
                    {r.address}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Who rides? Booking for someone else is a first-class flow:
              put your mother in a keke home (founder 23 Aug). */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
            {[{ me: true, label: t('request2.forMe', { defaultValue: 'For me' }) },
              { me: false, label: t('request2.forSomeone', { defaultValue: 'Someone else' }) }].map(o => (
              <Pressable
                key={String(o.me)}
                onPress={() => setRiderIsMe(o.me)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5,
                  borderColor: riderIsMe === o.me ? theme.primary : theme.border,
                  backgroundColor: riderIsMe === o.me ? theme.primary + '15' : 'transparent',
                }}
              >
                <Text style={{ color: riderIsMe === o.me ? theme.primary : theme.textSecond, fontSize: FontSize.sm, fontWeight: '600' }}>
                  {o.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {!riderIsMe && (
            <View style={[styles.inputBlock, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, marginTop: 8 }]}>
              <View style={styles.inputRow}>
                <Ionicons name="person-outline" size={16} color={theme.textSecond} />
                <BottomSheetTextInput
                  value={riderName}
                  onChangeText={setRiderName}
                  placeholder={t('request2.riderFirstName', { defaultValue: "Driver's first name (what the driver calls them)" })}
                  placeholderTextColor={theme.textThird}
                  style={[styles.input, { color: theme.text }]}
                />
              </View>
            </View>
          )}

          {/* Distance + ETA chip */}
          {pickup && dropoff && (distanceText || durationText) && (
            <View style={[styles.routeStatRow, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              {distanceText && (
                <View style={styles.routeStatItem}>
                  <Ionicons name="navigate-outline" size={14} color={theme.textSecond} />
                  <Text style={[styles.routeStatValue, { color: theme.text }]}>{distanceText}</Text>
                </View>
              )}
              {/* Minutes removed 2026-08-23: SEIRS makes no time
                  promises. The route distance is the honest fact. */}
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

          {/* CTA: slim, addresses-only screen. Vehicle + share-ride
              live on /vehicle-select so the user picks once. */}
          {!showSuggestions && (
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
