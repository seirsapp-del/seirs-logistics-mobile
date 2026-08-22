/**
 * Business · Send a Package — the CUSTOMER-SEND pattern, exactly
 * (founder 2026-08-15/16, asked twice: full-screen steps, illustration
 * headers, package-first form, "Add another package" loop, itemized
 * total, one payment).
 *
 * Steps:
 *   0 PACKAGES  every package is a full customer-style form: photo
 *               (required), what it is, weight, category, receiver name
 *               + phone, delivery address. End of the list: "Add another
 *               package" (vehicle-capped) or Continue.
 *   1 PICKUP    one pickup address for the run + Send now / Schedule.
 *   2 VEHICLE   okada/keke/danfo picker, capacity-aware.
 *   3 REVIEW    per-package price lines (same attribution math the
 *               backend books with) + total, then one payment: credit
 *               drains first, otherwise Flutterwave checkout.
 *
 * This is the ONLY in-app booking flow. The old map-first wizard was
 * deleted with this rebuild: two booking screens meant two sets of
 * rules, and the divergence is exactly what the founder kept finding.
 * CSV upload still books through the same backend endpoint.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Image, Linking, KeyboardAvoidingView, Platform,
  Keyboard, Dimensions, Modal, Share, StatusBar as RNStatusBar,
  BackHandler,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useMultiStopDirections } from '@/components/useMultiStopDirections';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Illustration } from '@/components/Illustration';
import {
  businessApi, configApi, mapsApi, uploadApi, pricingApi, dropoffApi, feesApi,
  type ServiceCategory, type RateCard,
} from '@/services/api';
import { useBusinessStore, type StoreLite } from '@/store/businessStore';
import { type VehicleType } from '@seirs/shared';
import { useColors } from '@/context/ThemeContext';

const STEPS = ['Packages', 'Pickup', 'Vehicle', 'Review'] as const;
const STEP_SLOTS = ['send-package', 'send-address', 'send-vehicle', 'send-fare'] as const;
const STEP_CAPTIONS = [
  'Tell us about each package: photo, weight and who receives it.',
  'Where does the driver collect everything?',
  'Pick the ride that fits the load.',
  'Check every line, then pay once for the whole run.',
] as const;

const VEHICLE_LABEL: Record<string, string> = {
  bicycle: 'Bicycle / On-foot', motorcycle: 'Okada', tricycle: 'Keke',
  car: 'Car', van: 'Danfo / Van', truck_small: 'Small Truck', truck_large: 'Large Truck',
};
// Bicycle / On-foot: the inclusion tier (founder 2026-08-21). A person
// with no vehicle carries small drops short distances and gets paid.
const VEHICLE_ORDER = ['bicycle', 'motorcycle', 'tricycle', 'car', 'van', 'truck_small', 'truck_large'];
const DEFAULT_MAX_PACKAGES: Record<string, number> = {
  bicycle: 3, motorcycle: 5, tricycle: 15, car: 20,
  van: 40, truck_small: 80, truck_large: 150,
};

// Scheduled pickups run 5 AM to 9 PM (platform operating window).
// Send Now stays 24/7: this list is only for booking ahead.
const TIME_SLOTS = Array.from({ length: 17 }, (_, i) => {
  const hour = i + 5;
  return {
    hour,
    label: hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`,
  };
});

interface Prediction { place_id: string; main_text: string; secondary_text: string }

export default function SendPackageScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const {
    draft, setDraft, addStop, removeStop, updateStop, resetDraft,
  } = useBusinessStore();

  const mapRef = useRef<MapView>(null);
  /**
   * Founder 2026-08-16: the review map is a thumbnail, and a sender
   * checking where five parcels are going cannot read it. Tapping opens
   * the same pins full screen.
   */
  const fullMapRef = useRef<MapView>(null);
  const [mapFull, setMapFull] = useState(false);
  /**
   * useSafeAreaInsets returns 0 inside a React Native Modal on Android,
   * so the status-bar scrim rendered with no height at all. RNStatusBar
   * .currentHeight is the real measurement.
   */
  const statusBarH = Math.max(RNStatusBar.currentHeight ?? 0, insets.top ?? 0, 28);
  /**
   * Counter the sender tapped for details (founder 2026-08-16: "shouldn't
   * the user be able to see that as well, maybe tap to get more details
   * and copy address"). Everything shown comes from what the partner
   * entered at registration.
   */
  const [storeSheet, setStoreSheet] = useState<StoreLite | null>(null);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const cardRefs = useRef<Record<number, View | null>>({});

  /**
   * Two scrolling behaviours the founder asked for by name:
   *
   * 1. Focusing a field brings it near the top, so its address
   *    suggestions render in the space ABOVE the keyboard instead of
   *    underneath it. Reported twice; fixed here for real.
   * 2. A failed validation scrolls to the package that is incomplete,
   *    because naming it in an error line still leaves someone with ten
   *    packages hunting for the one at fault.
   */
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const h = e.endCoordinates.height;
      setKeyboardHeight(h);
      // The height is only trustworthy here, so this is where the lift
      // actually happens for a field focused while the keyboard was down.
      const f = focusedRef.current;
      if (f) setTimeout(() => ensureVisible(f.node, h, f.extra), 60);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  /**
   * Live scroll offset. measureInWindow gives SCREEN coordinates, so we
   * need to know where the list currently sits to turn a screen position
   * into a scroll target.
   */
  const scrollY = useRef(0);

  /**
   * Keep the focused field above the keyboard.
   *
   * This used to call node.measureLayout(findNodeHandle(scroll), ...),
   * which threw "ref.measureLayout must be called with a ref to a native
   * component" on EVERY focus: this React Native version wants a ref
   * there, not a node-handle number, and the red toast swallowed the
   * keystrokes that followed (found on device 2026-08-16).
   *
   * measureInWindow needs no ancestor at all, so there is nothing to get
   * wrong, and it answers the real question directly: is this field under
   * the keyboard, and by how much?
   */
  /**
   * How far, and whether you can actually walk in right now.
   *
   * "Closed now (08:00-18:00)" read as "come back later today" even when
   * the counter never opens on a Sunday at all (seen on device
   * 2026-08-16: a Mon-Sat shop at 13:50 Lagos). Say which kind of closed
   * it is, and never print "0km away".
   */
  const storeMetaLine = (store: any) => {
    const bits: string[] = [];
    if (store.distanceKm != null) {
      bits.push(store.distanceKm < 1 ? 'under 1km away' : `${store.distanceKm}km away`);
    }
    if (store.isOpenNow) {
      bits.push(`Open now${store.closeTime ? ` until ${store.closeTime}` : ''}`);
    } else {
      const days: string[] = Array.isArray(store.operatingDays) ? store.operatingDays : [];
      const today = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
        new Date(Date.now() + 60 * 60 * 1000).getUTCDay()   // Lagos, UTC+1
      ];
      const opensToday = days.length === 0 || days.some((d) => String(d).slice(0, 3) === today);
      bits.push(opensToday
        ? `Closed now${store.openTime ? ` · opens ${store.openTime}` : ''}`
        : `Closed today${days.length ? ` · ${days.map((d) => String(d).slice(0, 3)).join(' ')} ${store.openTime}-${store.closeTime}` : ''}`);
    }
    return bits.join(' · ');
  };

  /** Field waiting to be lifted clear, remembered until we know the height. */
  const focusedRef = useRef<{ node: any; extra: number } | null>(null);

  const ensureVisible = (node: any, kbH: number, extra = 0) => {
    if (!node || typeof node.measureInWindow !== 'function' || !kbH) return;
    node.measureInWindow((_x: number, y: number, _w: number, h: number) => {
      const kbTop   = Dimensions.get('window').height - kbH;
      const overlap = (y + h + 24 + extra) - kbTop;
      if (overlap > 0) {
        scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + overlap), animated: true });
      }
    });
  };

  /**
   * `extra` reserves space BELOW the field. Address inputs drop a
   * suggestion list underneath, and lifting only the input still left the
   * suggestions under the keyboard, which is the complaint that started
   * all of this.
   */
  const handleFieldFocus = (e: any, extra = 0) => {
    const node = e?.target;
    focusedRef.current = { node, extra };
    // On the FIRST focus the keyboard is still opening and its height is
    // unknown, so measuring now says "no overlap" and nothing scrolls
    // (found on device 2026-08-16: the field stayed under the keyboard and
    // you could not see what you typed). Only act here when the keyboard
    // is already up; otherwise keyboardDidShow below does it with the real
    // height.
    if (keyboardHeight > 0) setTimeout(() => ensureVisible(node, keyboardHeight, extra), 80);
  };

  /** Bring a package card to the top of the viewport (validation jumps). */
  const scrollToPackage = (idx: number) => {
    const node = cardRefs.current[idx] as any;
    if (!node || typeof node.measureInWindow !== 'function') return;
    setTimeout(() => {
      node.measureInWindow((_x: number, y: number) => {
        // 150 keeps the card clear of the sticky step header.
        scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + y - 150), animated: true });
      });
    }, 60);
  };
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  // ── Rate card + catalog (prices + caps + category chips) ─────────────
  const [catalog, setCatalog] = useState<ServiceCategory[]>([]);
  const [highValueNgn, setHighValueNgn] = useState(100000);
  const [rateCard, setRateCard] = useState<RateCard | null>(null);
  useEffect(() => {
    Promise.all([configApi.serviceCatalog(), configApi.rateCard()])
      .then(([cat, rc]) => { setCatalog(cat); setRateCard(rc); })
      .catch(() => {});
    feesApi.get('high_value_threshold_ngn')
      .then(r => { const v = Number(r?.value); if (v > 0) setHighValueNgn(v); })
      .catch(() => { /* keep the 100000 fallback, same as the backend's */ });
  }, []);

  /**
   * Packages come FIRST, vehicle comes after (founder 2026-08-16: the
   * add button used to say "1/5 for Okada" before anyone had picked a
   * vehicle, which both quoted a vehicle nobody chose and capped the
   * list at the smallest one). Step one is therefore bounded by the
   * LARGEST vehicle on the rate card; the vehicle step then narrows to
   * what can actually carry what was entered.
   */
  const vehicleCap = (v: string) =>
    Number((rateCard as any)?.vehicleRates?.[v]?.maxPackages) || DEFAULT_MAX_PACKAGES[v] || 5;
  const vehiclePayload = (v: string) =>
    Number((rateCard as any)?.vehicleRates?.[v]?.maxPayloadKg ?? 0);
  const absoluteMaxPackages = VEHICLE_ORDER.reduce((max, v) => Math.max(max, vehicleCap(v)), 0) || 150;
  const maxPackages = vehicleCap(draft.vehicleType);

  // ── Address autocomplete (pickup + per-package) ──────────────────────
  type Field = { kind: 'pickup' } | { kind: 'pkg'; idx: number } | null;
  const [activeField, setActiveField] = useState<Field>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pickupQuery, setPickupQuery] = useState(draft.pickupAddress);
  const [pkgQueries, setPkgQueries] = useState<string[]>(draft.stops.map(s => s.address));

  const fetchPredictions = async (text: string) => {
    if (text.trim().length < 3) { setPredictions([]); return; }
    setSearching(true);
    try {
      const json = await mapsApi.autocomplete({ input: text });
      setPredictions((json.predictions ?? []).map((p: any) => ({
        place_id: p.place_id,
        main_text: p.structured_formatting?.main_text ?? p.description,
        secondary_text: p.structured_formatting?.secondary_text ?? '',
      })));
    } catch { setPredictions([]); }
    finally { setSearching(false); }
  };

  const onChangePickup = (text: string) => {
    setPickupQuery(text);
    setDraft({ pickupAddress: text, pickupLat: undefined, pickupLng: undefined });
    setActiveField({ kind: 'pickup' });
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchPredictions(text), 300);
  };
  const onChangePkgAddress = (idx: number, text: string) => {
    setPkgQueries(prev => { const next = [...prev]; next[idx] = text; return next; });
    updateStop(idx, { address: text, lat: undefined, lng: undefined });
    setActiveField({ kind: 'pkg', idx });
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchPredictions(text), 300);
  };
  const selectPrediction = async (p: Prediction) => {
    setSearching(true);
    try {
      const json = await mapsApi.placeDetails(p.place_id, 'geometry,formatted_address');
      if (json.status !== 'OK' || !activeField) return;
      const loc = json.result.geometry.location;
      const address = json.result.formatted_address ?? `${p.main_text}, ${p.secondary_text}`;
      if (activeField.kind === 'pickup') {
        setPickupQuery(address);
        setDraft({ pickupAddress: address, pickupLat: loc.lat, pickupLng: loc.lng });
        // Counter mode: the typed place locates the AREA, then we show the
        // counters the sender can walk the packages to.
        if (draft.pickupMode === 'store') findStoresNear(-1, loc.lat, loc.lng);
      } else {
        const idx = activeField.idx;
        setPkgQueries(prev => { const next = [...prev]; next[idx] = address; return next; });
        updateStop(idx, { address, lat: loc.lat, lng: loc.lng });
        // Store mode: the typed place is the AREA, so immediately show
        // the counters around it rather than making them search again.
        if (draft.stops[idx]?.destinationMode === 'store') {
          findStoresNear(idx, loc.lat, loc.lng);
        }
      }
      setPredictions([]);
      setActiveField(null);
      // Close the keyboard once an address is chosen. Leaving it open
      // with focus still in the address box means the next thing typed
      // silently appends to the address, which is how "Lagos, Nigeria"
      // became "Lagos, NigeriaBello" during the walkthrough. A chosen
      // address is a finished field.
      Keyboard.dismiss();
    } catch { /* keep typing */ }
    finally { setSearching(false); }
  };

  const renderSuggestions = (forField: 'pickup' | 'pkg', idx?: number) => {
    const match =
      (forField === 'pickup' && activeField?.kind === 'pickup') ||
      (forField === 'pkg' && activeField?.kind === 'pkg' && activeField.idx === idx);
    if (!match || predictions.length === 0) return null;
    return (
      <View style={[styles.suggBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {searching && <ActivityIndicator style={{ padding: 8 }} color={colors.accent} />}
        {predictions.map((p) => (
          <Pressable key={p.place_id} style={[styles.suggRow, { borderTopColor: colors.border }]} onPress={() => selectPrediction(p)}>
            <Icon name="MapPin" size={14} color={colors.textThird} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.suggMain, { color: colors.text }]} numberOfLines={1}>{p.main_text}</Text>
              {!!p.secondary_text && (
                <Text style={[styles.suggSub, { color: colors.textThird }]} numberOfLines={1}>{p.secondary_text}</Text>
              )}
            </View>
          </Pressable>
        ))}
      </View>
    );
  };

  /**
   * Partner stores near where a package is going (founder 2026-08-16:
   * "it should show the partner stores closest to whatever location
   * they are trying to send to, with details about each"). The sender
   * locates the destination the normal way, then picks a counter near
   * it; no second form, no separate screen.
   */
  const [nearby, setNearby] = useState<Record<number, any[]>>({});
  const [nearbyBusy, setNearbyBusy] = useState<Record<number, boolean>>({});
  const findStoresNear = async (idx: number, lat: number, lng: number) => {
    setNearbyBusy((b) => ({ ...b, [idx]: true }));
    try {
      const rows = await dropoffApi.listCapacityNearby(lat, lng, 15);
      setNearby((n) => ({ ...n, [idx]: Array.isArray(rows) ? rows : [] }));
    } catch {
      setNearby((n) => ({ ...n, [idx]: [] }));
    } finally {
      setNearbyBusy((b) => ({ ...b, [idx]: false }));
    }
  };
  const choosePickupStore = (store: any) => {
    setDraft({
      pickupStoreId:   store.id,
      pickupStoreName: store.storeName,
      pickupAddress:   store.storeAddress,
      pickupLat:       store.lat ?? undefined,
      pickupLng:       store.lng ?? undefined,
      // Trading hours are copied into the draft, not read back off the
      // nearby list: that list is transient, and a guard that depends on
      // it silently stops guarding the moment the list is cleared.
      pickupStoreInfo: {
        id: store.id, storeName: store.storeName, storeAddress: store.storeAddress,
        phone: store.phone ?? null, photoUrl: store.photoUrl ?? null,
        openTime: store.openTime ?? null, closeTime: store.closeTime ?? null,
        operatingDays: store.operatingDays ?? [], isOpenNow: store.isOpenNow ?? null,
        distanceKm: store.distanceKm ?? null,
      },
    });
    setPickupQuery(store.storeAddress);
  };

  const chooseStore = (idx: number, store: any) => {
    updateStop(idx, {
      destinationStoreId:   store.id,
      destinationStoreName: store.storeName,
      destinationStoreInfo: {
        id: store.id, storeName: store.storeName, storeAddress: store.storeAddress,
        phone: store.phone ?? null, photoUrl: store.photoUrl ?? null,
        openTime: store.openTime ?? null, closeTime: store.closeTime ?? null,
        operatingDays: store.operatingDays ?? [], isOpenNow: store.isOpenNow ?? null,
        distanceKm: store.distanceKm ?? null,
      },
      address:              store.storeAddress,
      lat:                  store.lat ?? undefined,
      lng:                  store.lng ?? undefined,
    });
    setPkgQueries((q) => { const next = [...q]; next[idx] = store.storeAddress; return next; });
  };

  // ── Photos ───────────────────────────────────────────────────────────
  const pickPhoto = async (idx: number) => {
    const current = draft.stops[idx]?.photoUris ?? [];
    if (current.length >= 5) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo needed', 'Allow photo access: every package needs its picture for handoff proof.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets?.[0]?.uri) {
      updateStop(idx, { photoUris: [...current, result.assets[0].uri] });
    }
  };
  const removePhoto = (idx: number, photoIdx: number) => {
    const current = draft.stops[idx]?.photoUris ?? [];
    updateStop(idx, { photoUris: current.filter((_, j) => j !== photoIdx) });
  };

  // Use-my-location for pickup (customer parity). Nigeria bounding box
  // guard: a founder abroad should not geocode their hotel as pickup.
  const useMyLocation = async () => {
    try {
      const Location = await import('expo-location');
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      if (!(latitude >= 4 && latitude <= 14 && longitude >= 2.5 && longitude <= 15)) {
        Alert.alert('Outside Nigeria', 'Type the pickup address instead.');
        return;
      }
      const j = await mapsApi.geocode({ latlng: `${latitude},${longitude}` });
      const address = j?.results?.[0]?.formatted_address ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      setPickupQuery(address);
      setDraft({ pickupAddress: address, pickupLat: latitude, pickupLng: longitude });
      setPredictions([]);
      setActiveField(null);
    } catch { /* typing still works */ }
  };

  // ── Schedule ─────────────────────────────────────────────────────────
  const [scheduleNow, setScheduleNow] = useState(true);
  const [scheduledHour, setScheduledHour] = useState<number | null>(null);

  /**
   * A refusal should stop shouting once it has been answered. Picking the
   * hour the banner asked for left "Pick a pickup hour" on screen, which
   * reads as "still broken" (found on device 2026-08-16). Any edit clears
   * it; Continue re-validates and puts it back if the fix was not enough.
   */
  useEffect(() => { setError(null); }, [draft, scheduleNow, scheduledHour, step]);
  const [scheduledDayOffset, setScheduledDayOffset] = useState<0 | 1>(0);

  // ── Route distance (straight-line stand-in; server prices road km) ───
  const totalKm = useMemo(() => {
    const pts: Array<{ lat: number; lng: number }> = [];
    if (draft.pickupLat != null && draft.pickupLng != null) pts.push({ lat: draft.pickupLat, lng: draft.pickupLng });
    for (const s of draft.stops) if (s.lat != null && s.lng != null) pts.push({ lat: s.lat, lng: s.lng });
    let km = 0;
    for (let i = 1; i < pts.length; i++) {
      const R = 6371, dLat = ((pts[i].lat - pts[i-1].lat) * Math.PI) / 180, dLng = ((pts[i].lng - pts[i-1].lng) * Math.PI) / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos((pts[i-1].lat*Math.PI)/180) * Math.cos((pts[i].lat*Math.PI)/180) * Math.sin(dLng/2)**2;
      km += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    // Same circuity stand-in the backend defaults to (145%): the booked
    // price comes from the server's road distance either way.
    return Math.round(km * 1.45 * 10) / 10;
  }, [draft.pickupLat, draft.pickupLng, draft.stops]);

  /**
   * Route the driver will actually take (founder 2026-08-16: "not once
   * does the user see a map. imagine using Google Maps without seeing
   * where you are going"). Correct call: moving off the map-first wizard
   * dropped the map entirely. The review step now draws the real
   * road-following route with a numbered pin per package, so the sender
   * confirms WHERE everything goes before paying. Google's own distance
   * replaces the straight-line estimate the moment it resolves.
   */
  const pickupPoint = draft.pickupLat != null && draft.pickupLng != null
    ? { latitude: draft.pickupLat, longitude: draft.pickupLng }
    : null;
  const dropPoints = draft.stops
    .filter((st) => st.lat != null && st.lng != null)
    .map((st) => ({ latitude: st.lat as number, longitude: st.lng as number }));
  const route = useMultiStopDirections(step === 3 ? pickupPoint : null, step === 3 ? dropPoints : []);
  const routeKm = route.distanceMeters != null
    ? Math.round((route.distanceMeters / 1000) * 10) / 10
    : totalKm;

  // ── Quote (unified engine, per-package aware) ────────────────────────
  const [quote, setQuote] = useState<any>(null);
  // A price that never arrives must SAY so: an endless "..." is the same
  // class of silent failure as a blank screen.
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteReloadKey, setQuoteReloadKey] = useState(0);
  // Review: which package's summary is open, and the consent gate,
  // matching the customer app's hybrid review (founder 2026-08-21).
  const [expandedPkg, setExpandedPkg] = useState<number | null>(null);
  const [tcAgreed, setTcAgreed] = useState(false);
  useEffect(() => {
    if (step !== 3) return;
    const packages = draft.stops.map(s => ({
      categoryCode: s.categoryCode ?? draft.categoryCode ?? 'standard_parcel',
      weightKg: Number(s.weightKg ?? 0),
    }));
    const totalWeight = packages.reduce((sum, p) => sum + p.weightKg, 0);
    setQuote(null);
    setQuoteError(null);
    pricingApi.quote({
      vehicleType: draft.vehicleType,
      categoryCode: packages[0]?.categoryCode ?? 'standard_parcel',
      km: totalKm,
      stopCount: draft.stops.length,
      weightKg: totalWeight,
      estimatedDwellMinutes: draft.stops.length * 4,
      packages,
      declaredValueNgn: draft.stops.reduce((sum, s) => sum + (Number(s.declaredValueNgn) || 0), 0) || undefined,
      // Counters are paid per parcel they touch, so the quote has to know
      // about them or the review total would not match the charge.
      partnerStoreTouches:
        (draft.pickupStoreId ? draft.stops.length : 0) +
        draft.stops.filter((s) => s.destinationStoreId).length,
      pickupCoords: draft.pickupLat != null ? { latitude: draft.pickupLat, longitude: draft.pickupLng } : undefined,
    } as any)
      .then(setQuote)
      .catch((e: any) => setQuoteError(e?.message ?? 'Could not price this run.'));
  }, [step, routeKm, draft.stops, draft.vehicleType, quoteReloadKey]);

  // Per-package attribution preview: identical math to the backend
  // (surcharge-weighted equal shares, last line absorbs rounding).
  const packageLines = useMemo(() => {
    const total = Number(quote?.customer?.total ?? 0);
    const n = draft.stops.length;
    if (!total || !n) return null;
    const pctOf = (code?: string | null) =>
      Number(catalog.find(c => c.code === (code ?? draft.categoryCode))?.surchargePercent ?? 0);
    /**
     * Carriage only. Counter handling is a flat disbursement shown as its
     * own line, so folding it into the package prices as well made the
     * same money appear twice.
     *
     * Rounded to whole naira HERE, with the last line absorbing the
     * drift, because the receipt is read at whole-naira precision: shares
     * that summed exactly to the total still printed 5,302 + 5,802 next
     * to a total of 11,103 (seen on device 2026-08-16).
     */
    const handling = Number(quote?.customer?.partnerHandling ?? 0);
    const carriage = total - handling;
    const weights = draft.stops.map(s => 1 + pctOf(s.categoryCode) / 100);
    const wSum = weights.reduce((a, b) => a + b, 0);
    const shares = weights.map(w => Math.round(carriage * w / wSum));
    const drift = Math.round(carriage) - shares.reduce((a, b) => a + b, 0);
    shares[n - 1] += drift;
    return shares;
  }, [quote, draft.stops, catalog, draft.categoryCode, draft.pickupStoreId]);

  // ── Validation per step ──────────────────────────────────────────────
  const validateStep = (): { message: string; packageIndex?: number } | null => {
    if (step === 0) {
      for (let i = 0; i < draft.stops.length; i++) {
        const s = draft.stops[i];
        if (!(s.photoUris ?? []).length)    return { packageIndex: i, message: `Package ${i + 1} needs at least one photo.` };
        if (!(Number(s.weightKg) > 0))      return { packageIndex: i, message: `Package ${i + 1} needs a weight.` };
        if (!(s.categoryCode ?? draft.categoryCode)) return { packageIndex: i, message: `Package ${i + 1} needs a category.` };
        if (!s.receiverFirstName?.trim())   return { packageIndex: i, message: `Package ${i + 1} needs the receiver's first name.` };
        if (s.fallbackPref === 'neighbour' && !s.fallbackNeighbourName?.trim())
          return { packageIndex: i, message: `Package ${i + 1}: name the neighbour who may collect.` };
        if (!s.recipientPhone?.trim())      return { packageIndex: i, message: `Package ${i + 1} needs the receiver's phone.` };
        if (s.destinationMode === 'store' && !s.destinationStoreId)
          return { packageIndex: i, message: `Package ${i + 1}: choose the partner store it goes to.` };
        if (s.lat == null || s.lng == null) return { packageIndex: i, message: `Package ${i + 1} needs a delivery address picked from the suggestions.` };
      }
      return null;
    }
    if (step === 1) {
      if (draft.pickupMode === 'store' && !draft.pickupStoreId)
        return { message: 'Choose the counter you will drop the packages at.' };
      if (draft.pickupLat == null || draft.pickupLng == null) return { message: 'Pick the pickup address from the suggestions.' };
      if (!scheduleNow && scheduledHour == null) return { message: 'Pick a pickup hour, or switch to Send now.' };
      // You cannot walk packages into a counter that is shut. Sending a
      // driver there now would strand the run (found on device
      // 2026-08-16: a Mon-Sat counter offered "Send now" on a Sunday).
      /**
       * A parcel dropped at a counter and delivered to that SAME counter
       * never travels, but the run is still priced and dispatched (seen
       * on device 2026-08-16: the pickup pin and a drop pin sat on top of
       * each other and the sender was quoted 62km). If the receiver
       * really collects from the drop counter, that is a different
       * product, not a delivery.
       */
      if (draft.pickupMode === 'store' && draft.pickupStoreId) {
        const clash = draft.stops.findIndex((s) => s.destinationStoreId === draft.pickupStoreId);
        if (clash !== -1) {
          return {
            packageIndex: clash,
            message: `Package ${clash + 1} is going to the same counter you are dropping it at. Send it to an address or a different counter.`,
          };
        }
      }
      if (draft.pickupMode === 'store' && scheduleNow && draft.pickupStoreInfo?.isOpenNow === false) {
        return {
          message: `${draft.pickupStoreInfo.storeName} is closed right now${
            draft.pickupStoreInfo.openTime ? ` (opens ${draft.pickupStoreInfo.openTime})` : ''
          }. Schedule a time while it is open.`,
        };
      }
      return null;
    }
    if (step === 2) {
      if (!draft.vehicleType) return { message: 'Pick a vehicle.' };
      {
        // Belongs HERE, on the step where the ride can be changed. The
        // first cut sat in the pickup validation and deadlocked the
        // founder: blocked one step before the screen that could fix it
        // (seen live, 2026-08-21).
        const vMaxKm = Number((rateCard as any)?.vehicleRates?.[draft.vehicleType]?.maxRouteKm
          ?? (draft.vehicleType === 'bicycle' ? 3 : 0));
        if (vMaxKm > 0 && routeKm > vMaxKm) {
          return { message: `${VEHICLE_LABEL[draft.vehicleType]} only does trips under ${vMaxKm}km. This run is ${Math.round(routeKm)}km: pick another ride.` };
        }
      }
      if (draft.stops.length > maxPackages)
        return { message: `${draft.stops.length} packages exceed the ${VEHICLE_LABEL[draft.vehicleType]} limit of ${maxPackages}. Choose a larger vehicle or remove packages.` };
      return null;
    }
    return null;
  };

  /**
   * Smallest vehicle that actually fits the packages entered, the way
   * the customer app auto-recommends from weight and category. Runs when
   * the user reaches the vehicle step so the pre-selection is never a
   * vehicle that cannot carry the load.
   */
  const recommendVehicle = () => {
    const count = draft.stops.length;
    const kg = draft.stops.reduce((sum, st) => sum + Number(st.weightKg ?? 0), 0);
    const fits = VEHICLE_ORDER.find((v) => {
      const payload = vehiclePayload(v);
      return vehicleCap(v) >= count && (payload === 0 || payload >= kg);
    });
    if (fits && fits !== draft.vehicleType) setDraft({ vehicleType: fits });
  };

  const next = () => {
    const err = validateStep();
    if (err) {
      setError(err.message);
      if (err.packageIndex != null) scrollToPackage(err.packageIndex);
      return;
    }
    setError(null);
    if (step === 1) recommendVehicle();
    if (step < 3) setStep((s) => (s + 1) as any);
  };
  const back = () => {
    setError(null);
    if (step === 0) { router.back(); return; }
    setStep((s) => (s - 1) as any);
  };

  // Hardware back mirrors the header arrow: one step back, never a
  // silent pop out of a half-built run (same guard as the customer
  // Send, 2026-08-22).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 0) return false;
      back();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Submit: upload photos → book → pay ──────────────────────────────
  const handleSubmit = async () => {
    if (!quote) { Alert.alert('One moment', 'The price is still computing.'); return; }
    setLoading(true);
    try {
      // Every photo of every package uploads (customer parity: up to 5).
      const photoUrlsPerPackage: string[][] = [];
      for (const s of draft.stops) {
        const urls: string[] = [];
        for (const uri of (s.photoUris ?? [])) {
          const up = await uploadApi.file(uri, 'image/jpeg', 'packages');
          urls.push(up.url);
        }
        photoUrlsPerPackage.push(urls);
      }
      const scheduledAt = !scheduleNow && scheduledHour != null
        ? (() => {
            const d = new Date();
            d.setDate(d.getDate() + scheduledDayOffset);
            d.setHours(scheduledHour, 0, 0, 0);
            return d.toISOString();
          })()
        : undefined;

      const res = await businessApi.createDelivery({
        // Signed quote pin: the review's number is the charged number.
        quoteToken: (quote as any)?.quotePin?.token,
        pickupAddress: draft.pickupAddress,
        pickupLat: draft.pickupLat!,
        pickupLng: draft.pickupLng!,
        pickupStoreId: draft.pickupMode === 'store' ? draft.pickupStoreId : undefined,
        stops: draft.stops.map((s, idx) => ({
          address: s.address,
          lat: s.lat!,
          lng: s.lng!,
          recipientName: [s.receiverFirstName?.trim(), s.receiverLastName?.trim()].filter(Boolean).join(' ') || s.recipientName.trim(),
          recipientPhone: s.recipientPhone.trim(),
          notes: s.note?.trim() || undefined,
          sequenceOrder: idx + 1,
          packagePhotoUrls: photoUrlsPerPackage[idx],
          receiverFirstName: s.receiverFirstName?.trim() || undefined,
          receiverLastName: s.receiverLastName?.trim() || undefined,
          declaredValueNgn: s.declaredValueNgn ?? undefined,
          fallbackPref: s.fallbackPref ?? undefined,
          fallbackNeighbourName: s.fallbackPref === 'neighbour' ? (s.fallbackNeighbourName?.trim() || undefined) : undefined,
          destinationStoreId: s.destinationMode === 'store' ? s.destinationStoreId : undefined,
          packageDescription: s.packageDescription?.trim() || undefined,
          categoryCode: s.categoryCode ?? draft.categoryCode ?? undefined,
          weightKg: s.weightKg ?? undefined,
        })),
        vehicleType: draft.vehicleType,
        categoryCode: draft.stops[0]?.categoryCode ?? draft.categoryCode ?? 'standard_parcel',
        weightKg: draft.stops.reduce((sum, s) => sum + Number(s.weightKg ?? 0), 0),
        km: routeKm,
        estimatedDriveMinutes: route.durationSeconds != null ? Math.round(route.durationSeconds / 60) : Math.round(routeKm * 3),
        scheduledAt,
        isInterState: false,
        isLongDistance: routeKm > 100,
        isRecurring: false,
      });

      const trackingCode = res?.delivery?.trackingCode ?? '';
      resetDraft();
      if (res?.payment?.method === 'flutterwave' && res?.payment?.authorizationUrl) {
        /**
         * Straight to checkout, no interstitial.
         *
         * This popped an alert saying payment would finish "in the
         * browser" and made the sender tap Pay now a second time, having
         * already tapped Pay on the review screen (founder 2026-08-19).
         * A confirmation step that confirms nothing is just a step: the
         * sender has reviewed the order and chosen to pay, so open the
         * checkout.
         *
         * The booking is already reserved at this point, so landing on
         * Deliveries means an abandoned checkout is visibly waiting with
         * its own Pay now rather than disappearing.
         */
        try {
          await Linking.openURL(res.payment.authorizationUrl);
        } catch {
          Alert.alert(
            'Could not open checkout',
            `Booking ${trackingCode} is saved and unpaid. Open it from Deliveries and tap Pay now to try again.`,
          );
        }
        router.replace('/(business)/(tabs)/deliveries' as any);
      } else {
        Alert.alert(
          'Run booked',
          // No "remaining credit" line: senders do not hold a balance with
          // SEIRS. Only partner counters and drivers have wallets, and
          // those show EARNINGS (founder, restated 2026-08-16).
          `Tracking: ${trackingCode}\nEach package has its own code: receivers can track theirs on seirs.`,
          [{ text: 'Done', onPress: () => router.replace('/(business)/(tabs)/deliveries' as any) }],
        );
      }
    } catch (e: any) {
      // An expired pin means the price may have moved: re-quote so the
      // review shows the current number before they book again.
      if (/expired/i.test(String(e?.message ?? ''))) setQuoteReloadKey(k => k + 1);
      Alert.alert('Could not book', e?.message ?? 'Please try again.');
    } finally { setLoading(false); }
  };

  const totalWeight = draft.stops.reduce((sum, s) => sum + Number(s.weightKg ?? 0), 0);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header: back + title + step dots (customer pattern). */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={back} style={[styles.backBtn, { backgroundColor: colors.surfaceSecond }]} hitSlop={8}>
          <Icon name="ArrowLeft" size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>Send a Package</Text>
          <Text style={[styles.subtitle, { color: colors.textSecond }]}>
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </Text>
        </View>
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i <= step ? colors.primary : colors.border }]} />
          ))}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 24 + insets.bottom + keyboardHeight }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
        >

          {/* Illustration header, the customer pattern. */}
          <View style={styles.stepHero}>
            <Illustration name={STEP_SLOTS[step]} size={130} />
            <Text style={[styles.stepHeroCaption, { color: colors.textSecond }]}>{STEP_CAPTIONS[step]}</Text>
          </View>

          {/* ─── STEP 0: PACKAGES ──────────────────────────────────── */}
          {step === 0 && (
            <View style={{ gap: 18 }}>
              {/* The run-level "drop at a partner store" card was removed
                  here (founder 2026-08-16): store drop is a DESTINATION
                  choice and now lives on every package below. The other
                  half, a sender carrying packages to a counter instead of
                  a door pickup, is a different product (drop codes + QR at
                  the counter) and gets wired into the Pickup step properly
                  rather than as a link that throws away this form. */}
              {draft.stops.map((s, i) => (
                <View
                  key={i}
                  ref={(r) => { cardRefs.current[i] = r; }}
                  style={[styles.pkgCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={styles.pkgHead}>
                    <Text style={[styles.pkgTitle, { color: colors.text }]}>Package {i + 1}</Text>
                    {draft.stops.length > 1 && (
                      <Pressable onPress={() => { removeStop(i); setPkgQueries(q => q.filter((_, j) => j !== i)); }} hitSlop={8}>
                        <Icon name="Trash2" size={16} color="#DC2626" />
                      </Pressable>
                    )}
                  </View>

                  <Text style={[styles.label, { color: colors.textSecond }]}>
                    Photos <Text style={{ color: '#DC2626' }}>*</Text>
                    <Text style={{ color: colors.textThird }}>  at least 1, up to 5</Text>
                  </Text>
                  <View style={styles.photoRow}>
                    {(s.photoUris ?? []).map((uri, pi) => (
                      <View key={pi} style={styles.photoWrap}>
                        <Image source={{ uri }} style={styles.photoThumb} />
                        <Pressable style={styles.photoRemove} onPress={() => removePhoto(i, pi)} hitSlop={6}>
                          <Icon name="X" size={11} color="#fff" />
                        </Pressable>
                      </View>
                    ))}
                    {(s.photoUris ?? []).length < 5 && (
                      <Pressable
                        style={[styles.photoAdd, { borderColor: colors.border, backgroundColor: colors.surfaceSecond }]}
                        onPress={() => pickPhoto(i)}
                      >
                        <Icon name="Camera" size={20} color={colors.accent} />
                        <Text style={[styles.photoHint, { color: colors.textSecond }]}>Add</Text>
                      </Pressable>
                    )}
                  </View>

                  <Text style={[styles.label, { color: colors.textSecond }]}>What is it?</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                    value={s.packageDescription ?? ''}
                    onChangeText={(v) => updateStop(i, { packageDescription: v })}
                    onFocus={handleFieldFocus}
                    placeholder="e.g. Two cartons of shoes"
                    placeholderTextColor={colors.textThird}
                  />

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.label, { color: colors.textSecond }]}>
                        Weight (kg) <Text style={{ color: '#DC2626' }}>*</Text>
                      </Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                        value={s.weightKg != null ? String(s.weightKg) : ''}
                        onChangeText={(v) => {
                          const n = Number(v.replace(',', '.'));
                          updateStop(i, { weightKg: Number.isFinite(n) && v !== '' ? n : undefined });
                        }}
                        onFocus={handleFieldFocus}
                    placeholder="e.g. 3"
                        placeholderTextColor={colors.textThird}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <Text style={[styles.label, { color: colors.textSecond }]}>
                    Category <Text style={{ color: '#DC2626' }}>*</Text>
                  </Text>
                  <View style={styles.chipWrap}>
                    {catalog.map((cat) => {
                      const active = (s.categoryCode ?? draft.categoryCode) === cat.code;
                      return (
                        <Pressable
                          key={cat.code}
                          style={[styles.chip,
                            { backgroundColor: colors.surfaceSecond, borderColor: colors.border },
                            active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                          onPress={() => updateStop(i, { categoryCode: cat.code })}
                        >
                          <Text style={[styles.chipTxt, { color: colors.text }, active && { color: '#fff' }]}>{cat.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={[styles.label, { color: colors.textSecond }]}>
                    Who is receiving? <Text style={{ color: '#DC2626' }}>*</Text>
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      style={[styles.input, { flex: 1, backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                      value={s.receiverFirstName ?? ''}
                      onChangeText={(v) => updateStop(i, { receiverFirstName: v })}
                      onFocus={handleFieldFocus}
                    placeholder="First name"
                      placeholderTextColor={colors.textThird}
                    />
                    <TextInput
                      style={[styles.input, { flex: 1, backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                      value={s.receiverLastName ?? ''}
                      onChangeText={(v) => updateStop(i, { receiverLastName: v })}
                      onFocus={handleFieldFocus}
                    placeholder="Last name"
                      placeholderTextColor={colors.textThird}
                    />
                  </View>
                  <Text style={[styles.hint, { color: colors.textThird }]}>
                    The driver confirms this first name at handoff. Anyone the receiver trusts can collect.
                  </Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                    value={s.recipientPhone}
                    onChangeText={(v) => updateStop(i, { recipientPhone: v })}
                    onFocus={handleFieldFocus}
                    placeholder="08012345678"
                    placeholderTextColor={colors.textThird}
                    keyboardType="phone-pad"
                  />

                  <Text style={[styles.label, { color: colors.textSecond }]}>
                    Where is it going? <Text style={{ color: '#DC2626' }}>*</Text>
                  </Text>
                  <View style={styles.destRow}>
                    {([
                      { key: 'address', label: 'To an address', icon: 'MapPin' },
                      { key: 'store',   label: 'To a partner store', icon: 'Store' },
                    ] as const).map((opt) => {
                      const active = (s.destinationMode ?? 'address') === opt.key;
                      return (
                        <Pressable
                          key={opt.key}
                          style={[styles.destBtn,
                            { backgroundColor: colors.surfaceSecond, borderColor: colors.border },
                            active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                          onPress={() => {
                            updateStop(i, {
                              destinationMode: opt.key,
                              destinationStoreId: undefined,
                              destinationStoreName: undefined,
                            });
                            if (opt.key === 'store' && s.lat != null && s.lng != null) {
                              findStoresNear(i, s.lat, s.lng);
                            }
                          }}
                        >
                          <Icon name={opt.icon as any} size={14} color={active ? '#fff' : colors.textSecond} />
                          <Text style={[styles.destTxt, { color: colors.text }, active && { color: '#fff' }]}>{opt.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                    value={pkgQueries[i] ?? ''}
                    onChangeText={(v) => onChangePkgAddress(i, v)}
                    onFocus={(e) => { setActiveField({ kind: 'pkg', idx: i }); handleFieldFocus(e, 260); }}
                    placeholder={s.destinationMode === 'store'
                      ? 'Area the receiver is in, e.g. Yaba'
                      : 'Street, area, city'}
                    placeholderTextColor={colors.textThird}
                  />
                  {renderSuggestions('pkg', i)}

                  {s.destinationMode === 'store' && (
                    <View style={{ marginTop: 8 }}>
                      {s.destinationStoreId ? (
                        <View style={[styles.storePicked, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
                          <Icon name="Store" size={16} color={colors.primary} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.storeName, { color: colors.text }]} numberOfLines={1}>
                              {s.destinationStoreName}
                            </Text>
                            <Text style={[styles.storeMeta, { color: colors.textSecond }]} numberOfLines={1}>
                              {s.address}
                            </Text>
                          </View>
                          {/* Same as the pickup counter: re-fetch, or the
                              sender is stranded with an empty list. */}
                          <Pressable onPress={() => {
                            updateStop(i, { destinationStoreId: undefined, destinationStoreName: undefined, destinationStoreInfo: null });
                            if (s.lat != null && s.lng != null) findStoresNear(i, s.lat, s.lng);
                          }}>
                            <Text style={[styles.changeTxt, { color: colors.primary }]}>Change</Text>
                          </Pressable>
                        </View>
                      ) : nearbyBusy[i] ? (
                        <ActivityIndicator color={colors.accent} style={{ paddingVertical: 12 }} />
                      ) : (nearby[i]?.length ?? 0) > 0 ? (
                        <>
                          <Text style={[styles.hint, { color: colors.textThird }]}>
                            {nearby[i].length} counter{nearby[i].length === 1 ? '' : 's'} near there. Tap one to send this package to it.
                          </Text>
                          {nearby[i].map((store: any) => (
                            <Pressable
                              key={store.id}
                              style={[styles.storeCardRow, { backgroundColor: colors.surfaceSecond, borderColor: colors.border }]}
                              onPress={() => chooseStore(i, store)}
                            >
                              {store.photoUrl ? (
                                <Image source={{ uri: store.photoUrl }} style={styles.storeThumb} />
                              ) : (
                                <View style={[styles.storeThumb, { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
                                  <Icon name="Store" size={18} color={colors.textThird} />
                                </View>
                              )}
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.storeName, { color: colors.text }]} numberOfLines={1}>{store.storeName}</Text>
                                <Text style={[styles.storeMeta, { color: colors.textSecond }]} numberOfLines={1}>
                                  {store.storeAddress}
                                </Text>
                                <Text style={[styles.storeMeta, { color: colors.textThird }]} numberOfLines={1}>
                                  {storeMetaLine(store)}
                                  {store.bucket === 'full' ? ' · Full' : store.bucket === 'limited' ? ' · Nearly full' : ' · Space available'}
                                </Text>
                              </View>
                              <Icon name="ChevronRight" size={16} color={colors.textThird} />
                            </Pressable>
                          ))}
                        </>
                      ) : (
                        <Text style={[styles.hint, { color: colors.textThird }]}>
                          {(s.lat != null)
                            ? 'No partner counter near that area yet. Send to the address instead.'
                            : 'Type the area the receiver is in and we will show the counters around it.'}
                        </Text>
                      )}
                    </View>
                  )}

                  <Text style={[styles.label, { color: colors.textSecond }]}>If nobody is available</Text>
                  <View style={styles.chipWrap}>
                    {([
                      { key: 'hand_only', label: 'Hand to receiver only' },
                      { key: 'neighbour', label: 'Leave with neighbour' },
                      { key: 'gate',      label: 'Leave at gate' },
                      { key: 'store',     label: 'Drop at partner store' },
                    ] as const).map((opt) => {
                      const hv = Number(s.declaredValueNgn ?? 0) >= highValueNgn;
                      const blocked = hv && (opt.key === 'gate' || opt.key === 'neighbour');
                      const active = (s.fallbackPref ?? 'hand_only') === opt.key;
                      return (
                        <Pressable
                          key={opt.key}
                          disabled={blocked}
                          style={[styles.chip,
                            { backgroundColor: colors.surfaceSecond, borderColor: colors.border, opacity: blocked ? 0.4 : 1 },
                            active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                          onPress={() => updateStop(i, { fallbackPref: opt.key })}
                        >
                          <Text style={[styles.chipTxt, { color: colors.text }, active && { color: '#fff' }]}>{opt.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {Number(s.declaredValueNgn ?? 0) >= highValueNgn && (
                    <Text style={[styles.hint, { color: colors.textThird }]}>
                      High-value packages cannot be left at the gate or with a neighbour.
                    </Text>
                  )}
                  {s.fallbackPref === 'neighbour' && (
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                      value={s.fallbackNeighbourName ?? ''}
                      onChangeText={(v) => updateStop(i, { fallbackNeighbourName: v })}
                      onFocus={handleFieldFocus}
                    placeholder="Neighbour or security's name"
                      placeholderTextColor={colors.textThird}
                    />
                  )}

                  <Text style={[styles.label, { color: colors.textSecond }]}>Package value in NGN (optional)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                    value={s.declaredValueNgn != null ? String(s.declaredValueNgn) : ''}
                    onChangeText={(v) => {
                      const n = Number(v.replace(/[^0-9.]/g, ''));
                      updateStop(i, { declaredValueNgn: Number.isFinite(n) && v !== '' ? n : undefined });
                    }}
                    onFocus={handleFieldFocus}
                    placeholder="e.g. 150000"
                    placeholderTextColor={colors.textThird}
                    keyboardType="numeric"
                  />
                  <Text style={[styles.hint, { color: colors.textThird }]}>
                    High-value packages get ID-verified handoff.
                  </Text>

                  <Text style={[styles.label, { color: colors.textSecond }]}>Instructions for driver (optional)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                    value={s.note ?? ''}
                    onChangeText={(v) => updateStop(i, { note: v })}
                    onFocus={handleFieldFocus}
                    placeholder="e.g. Call when you reach the gate. Ask for security."
                    placeholderTextColor={colors.textThird}
                  />

                </View>
              ))}

              {draft.stops.length < absoluteMaxPackages ? (
                <>
                  <Pressable
                    style={[styles.addBtn, { borderColor: colors.accent, backgroundColor: colors.primaryLight }]}
                    onPress={() => { addStop({ address: '', recipientName: '', recipientPhone: '' }); setPkgQueries(q => [...q, '']); }}
                  >
                    <Icon name="Plus" size={16} color={colors.accent} />
                    <Text style={[styles.addBtnText, { color: colors.accent }]}>Add another package</Text>
                  </Pressable>
                  <Text style={[styles.capNote, { color: colors.textThird }]}>
                    {draft.stops.length} package{draft.stops.length === 1 ? '' : 's'} so far
                    {totalWeight > 0 ? ` · ${totalWeight}kg` : ''}. We suggest the right vehicle next.
                  </Text>
                </>
              ) : (
                <Text style={[styles.capNote, { color: colors.textSecond }]}>
                  {absoluteMaxPackages} packages is the most a single run can carry. Book the rest as a second run.
                </Text>
              )}
            </View>
          )}

          {/* ─── STEP 1: PICKUP ────────────────────────────────────── */}
          {step === 1 && (
            <View style={{ gap: 14 }}>
              {/* How the packages reach SEIRS (founder 2026-08-16). Dropping
                  at a counter removes the door-pickup leg: the sender walks
                  them in whenever the shop is open and a driver collects
                  there. Combined with a package's own "to a partner store"
                  choice, a run can go counter to counter. */}
              <Text style={[styles.label, { color: colors.textSecond, marginTop: 0 }]}>
                How do we get the packages? <Text style={{ color: '#DC2626' }}>*</Text>
              </Text>
              {([
                { key: 'door',  title: 'A driver collects from me', sub: 'Rider comes to your address', icon: 'Bike' },
                // Founder 2026-08-16: say what actually happens, not what
                // it costs. "Cheaper" is a claim; this is the instruction.
                { key: 'store', title: "I'll drop them at a counter", sub: 'You drop them off, a driver collects from the counter', icon: 'Store' },
              ] as const).map((opt) => {
                const active = (draft.pickupMode ?? 'door') === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    style={[styles.whenCard,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      active && { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
                    onPress={() => {
                      setDraft({ pickupMode: opt.key, pickupStoreId: undefined, pickupStoreName: undefined });
                      if (opt.key === 'store' && draft.pickupLat != null && draft.pickupLng != null) {
                        findStoresNear(-1, draft.pickupLat, draft.pickupLng);
                      }
                    }}
                  >
                    <View style={[styles.whenIcon, { backgroundColor: active ? colors.primary : colors.surfaceSecond }]}>
                      <Icon name={opt.icon as any} size={18} color={active ? '#fff' : colors.textSecond} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.whenTitle, { color: colors.text }]}>{opt.title}</Text>
                      <Text style={[styles.whenSub, { color: colors.textSecond }]}>{opt.sub}</Text>
                    </View>
                    {active && <Icon name="CheckCircle2" size={20} color={colors.primary} />}
                  </Pressable>
                );
              })}

              <Text style={[styles.label, { color: colors.textSecond }]}>
                {draft.pickupMode === 'store' ? 'Find a counter near' : 'Pickup address'} <Text style={{ color: '#DC2626' }}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                value={pickupQuery}
                onChangeText={onChangePickup}
                onFocus={(e) => { setActiveField({ kind: 'pickup' }); handleFieldFocus(e, 260); }}
                placeholder={draft.pickupMode === 'store'
                  ? 'Search a place, e.g. Yaba'
                  : 'Where the driver collects everything'}
                placeholderTextColor={colors.textThird}
              />
              {renderSuggestions('pickup')}

              {draft.pickupMode === 'store' && (
                <View style={{ marginTop: 8 }}>
                  {draft.pickupStoreId ? (
                    <Pressable
                      style={[styles.storePicked, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
                      onPress={() => draft.pickupStoreInfo && setStoreSheet(draft.pickupStoreInfo)}
                    >
                      <Icon name="Store" size={16} color={colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.storeName, { color: colors.text }]} numberOfLines={1}>
                          {draft.pickupStoreName}
                        </Text>
                        {/* Founder 2026-08-16: once a counter is chosen the
                            sender needs the practical details, WHERE to
                            carry the parcels and WHEN the shop is open,
                            not a restatement of the option they picked. */}
                        <Text style={[styles.storeMeta, { color: colors.textSecond }]} numberOfLines={2}>
                          {draft.pickupAddress}
                        </Text>
                        <Text style={[styles.storeMeta, { color: colors.textThird }]} numberOfLines={1}>
                          {draft.pickupStoreInfo ? storeMetaLine(draft.pickupStoreInfo) : ''}
                        </Text>
                        <Text style={[styles.detailsLink, { color: colors.primary }]}>
                          Hours, phone and directions
                        </Text>
                      </View>
                      {/* Clearing the pick has to bring the list back.
                          Without the re-fetch, Change left the sender on
                          "No counter near that area yet" with no way to
                          choose another (found on device 2026-08-16). */}
                      <Pressable onPress={() => {
                        setDraft({
                          pickupStoreId: undefined, pickupStoreName: undefined,
                          pickupStoreInfo: null,
                        });
                        if (draft.pickupLat != null && draft.pickupLng != null) {
                          findStoresNear(-1, draft.pickupLat, draft.pickupLng);
                        }
                      }}>
                        <Text style={[styles.changeTxt, { color: colors.primary }]}>Change</Text>
                      </Pressable>
                    </Pressable>
                  ) : nearbyBusy[-1] ? (
                    <ActivityIndicator color={colors.accent} style={{ paddingVertical: 12 }} />
                  ) : (nearby[-1]?.length ?? 0) > 0 ? (
                    <>
                      <Text style={[styles.hint, { color: colors.textThird }]}>
                        {nearby[-1].length} counter{nearby[-1].length === 1 ? '' : 's'} near you. Tap the one you will drop at.
                      </Text>
                      {nearby[-1].map((store: any) => (
                        <Pressable
                          key={store.id}
                          style={[styles.storeCardRow, { backgroundColor: colors.surfaceSecond, borderColor: colors.border }]}
                          onPress={() => choosePickupStore(store)}
                        >
                          {store.photoUrl ? (
                            <Image source={{ uri: store.photoUrl }} style={styles.storeThumb} />
                          ) : (
                            <View style={[styles.storeThumb, { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
                              <Icon name="Store" size={18} color={colors.textThird} />
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.storeName, { color: colors.text }]} numberOfLines={1}>{store.storeName}</Text>
                            <Text style={[styles.storeMeta, { color: colors.textSecond }]} numberOfLines={1}>{store.storeAddress}</Text>
                            <Text style={[styles.storeMeta, { color: colors.textThird }]} numberOfLines={1}>
                              {storeMetaLine(store)}
                            </Text>
                          </View>
                          <Icon name="ChevronRight" size={16} color={colors.textThird} />
                        </Pressable>
                      ))}
                    </>
                  ) : (
                    <Text style={[styles.hint, { color: colors.textThird }]}>
                      {draft.pickupLat != null
                        ? 'No counter near that area yet. A driver can collect from you instead.'
                        : 'Type a place nearby and we will show the counters you can drop at.'}
                    </Text>
                  )}
                </View>
              )}

              <Pressable style={styles.useLocRow} onPress={useMyLocation}>
                <Icon name="MapPin" size={16} color={colors.accent} />
                <Text style={[styles.useLocTxt, { color: colors.accent }]}>Use my current location</Text>
              </Pressable>

              {/* When: two real option cards, not two anonymous pills
                  (founder 2026-08-16: "it should be more visible and
                  properly designed so they can see it"). */}
              <Text style={[styles.label, { color: colors.textSecond, marginTop: 14 }]}>When should the driver come?</Text>
              {([
                { now: true,  title: 'Send now',      sub: 'We match a driver straight away', icon: 'Zap' },
                { now: false, title: 'Schedule it',   sub: 'Pick a pickup hour, today or tomorrow', icon: 'Clock' },
              ] as const).map((opt) => {
                const active = scheduleNow === opt.now;
                return (
                  <Pressable
                    key={opt.title}
                    style={[styles.whenCard,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      active && { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
                    onPress={() => setScheduleNow(opt.now)}
                  >
                    <View style={[styles.whenIcon, { backgroundColor: active ? colors.primary : colors.surfaceSecond }]}>
                      <Icon name={opt.icon as any} size={18} color={active ? '#fff' : colors.textSecond} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.whenTitle, { color: colors.text }]}>{opt.title}</Text>
                      <Text style={[styles.whenSub, { color: colors.textSecond }]}>{opt.sub}</Text>
                    </View>
                    {active && <Icon name="CheckCircle2" size={20} color={colors.primary} />}
                  </Pressable>
                );
              })}

              {!scheduleNow && (
                <View style={[styles.schedPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.label, { color: colors.textSecond, marginTop: 0 }]}>Day</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {([
                      { key: 0, label: 'Today' },
                      { key: 1, label: 'Tomorrow' },
                    ] as const).map((d) => {
                      const active = scheduledDayOffset === d.key;
                      return (
                        <Pressable
                          key={d.key}
                          style={[styles.dayChip,
                            { backgroundColor: colors.surfaceSecond, borderColor: colors.border },
                            active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                          onPress={() => { setScheduledDayOffset(d.key); setScheduledHour(null); }}
                        >
                          <Text style={[styles.chipTxt, { color: colors.text }, active && { color: '#fff' }]}>{d.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={[styles.label, { color: colors.textSecond }]}>Pickup hour</Text>
                  <View style={styles.chipWrap}>
                    {TIME_SLOTS.map(({ hour, label }) => {
                      // Scheduled pickups run 5 AM to 9 PM; past hours today
                      // are not offerable.
                      const tooLateToday = scheduledDayOffset === 0 && hour <= new Date().getHours();
                      const disabled = tooLateToday;
                      const active = scheduledHour === hour;
                      return (
                        <Pressable
                          key={hour}
                          disabled={disabled}
                          style={[styles.hourChip,
                            { backgroundColor: colors.surfaceSecond, borderColor: colors.border, opacity: disabled ? 0.35 : 1 },
                            active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                          onPress={() => setScheduledHour(hour)}
                        >
                          <Text style={[styles.chipTxt, { color: colors.text }, active && { color: '#fff' }]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={[styles.hint, { color: scheduledHour == null ? '#DC2626' : colors.textSecond }]}>
                    {scheduledHour == null
                      ? 'Pick an hour to continue.'
                      : `Driver arrives ${scheduledDayOffset === 0 ? 'today' : 'tomorrow'} around ${TIME_SLOTS.find(t => t.hour === scheduledHour)?.label}.`}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ─── STEP 2: VEHICLE ───────────────────────────────────── */}
          {step === 2 && (
            <View style={{ gap: 10 }}>
              {VEHICLE_ORDER.map((v) => {
                const cap = vehicleCap(v);
                const payload = vehiclePayload(v);
                const isRecommended = v === VEHICLE_ORDER.find((x) => {
                  const pl = vehiclePayload(x);
                  return vehicleCap(x) >= draft.stops.length && (pl === 0 || pl >= totalWeight);
                });
                const overCount = draft.stops.length > cap;
                const overWeight = payload > 0 && totalWeight > payload;
                // Same short-hop gate the customer app enforces. The route
                // is known by this step (addresses come first), and without
                // this a 30km bicycle run booked for 1,838 naira on the
                // founder's own screen (2026-08-21).
                const maxKm = Number((rateCard as any)?.vehicleRates?.[v]?.maxRouteKm
                  ?? (v === 'bicycle' ? 3 : 0));
                const overKm = maxKm > 0 && routeKm > maxKm;
                const disabled = overCount || overWeight || overKm;
                const active = draft.vehicleType === v;
                return (
                  <Pressable
                    key={v}
                    disabled={disabled}
                    style={[styles.vehRow,
                      { backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled ? 0.45 : 1 },
                      active && { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
                    onPress={() => setDraft({ vehicleType: v })}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.vehName, { color: colors.text }]}>{VEHICLE_LABEL[v]}</Text>
                        {isRecommended && !disabled && (
                          <View style={[styles.recBadge, { backgroundColor: colors.accent }]}>
                            <Text style={styles.recTxt}>Recommended</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.vehSub, { color: colors.textSecond }]}>
                        {disabled
                          ? overKm ? `Under ${maxKm}km trips only`
                          : overCount ? `Max ${cap} packages` : `Max ${payload}kg`
                          : `Up to ${cap} packages${payload > 0 ? ` · ${payload}kg payload` : ''}`}
                      </Text>
                    </View>
                    {active && <Icon name="CheckCircle2" size={20} color={colors.primary} />}
                  </Pressable>
                );
              })}
              <Text style={[styles.capNote, { color: colors.textSecond }]}>
                This run: {draft.stops.length} package{draft.stops.length === 1 ? '' : 's'}, {totalWeight}kg total.
              </Text>
            </View>
          )}

          {/* ─── STEP 3: REVIEW & PAY ──────────────────────────────── */}
          {step === 3 && (
            <View style={{ gap: 12 }}>
              {!!pickupPoint && dropPoints.length > 0 && (
                <View style={[styles.mapCard, { borderColor: colors.border }]}>
                  <MapView
                    provider={PROVIDER_GOOGLE}
                    style={styles.map}
                    initialRegion={{
                      latitude: pickupPoint.latitude,
                      longitude: pickupPoint.longitude,
                      latitudeDelta: 0.12,
                      longitudeDelta: 0.12,
                    }}
                    onLayout={() => {
                      mapRef.current?.fitToCoordinates([pickupPoint, ...dropPoints], {
                        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
                        animated: false,
                      });
                    }}
                    ref={mapRef}
                  >
                    {/* Pickup is one green pin; every package gets its own
                        NUMBERED red pin so a five-drop run reads at a glance
                        (founder 2026-08-16). */}
                    <Marker coordinate={pickupPoint} title="Pickup" anchor={{ x: 0.5, y: 0.5 }}>
                      <View style={[styles.pinBase, { backgroundColor: '#22C55E' }]}>
                        <Text style={styles.pinTxt}>P</Text>
                      </View>
                    </Marker>
                    {dropPoints.map((pt, i) => (
                      <Marker
                        key={i}
                        coordinate={pt}
                        title={`Package ${i + 1}`}
                        description={[draft.stops[i]?.receiverFirstName, draft.stops[i]?.packageDescription].filter(Boolean).join(' · ') || undefined}
                        anchor={{ x: 0.5, y: 0.5 }}
                      >
                        <View style={[styles.pinBase, { backgroundColor: '#EF4444' }]}>
                          <Text style={styles.pinTxt}>{i + 1}</Text>
                        </View>
                      </Marker>
                    ))}
                    {route.coords.length > 1 && (
                      <Polyline coordinates={route.coords} strokeWidth={4} strokeColor={colors.primary} />
                    )}
                  </MapView>
                  <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={() => setMapFull(true)}
                    accessibilityLabel="Open the map full screen"
                  />
                  <View style={[styles.expandChip, { backgroundColor: colors.surface }]}>
                    <Icon name="Maximize2" size={13} color={colors.text} />
                    <Text style={[styles.mapBadgeTxt, { color: colors.text }]}>Tap to expand</Text>
                  </View>
                  <View style={[styles.mapBadge, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.mapBadgeTxt, { color: colors.text }]}>
                      {/* Kilometres only: minutes are a promise this
                          platform does not make (founder rule). */}
                      {route.distanceText ?? `~${routeKm}km`}
                    </Text>
                  </View>
                </View>
              )}

              <View style={[styles.sumCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sumTitle, { color: colors.text }]}>Route</Text>
                <Text style={[styles.sumLine, { color: colors.textSecond }]} numberOfLines={2}>
                  {draft.pickupMode === 'store' && draft.pickupStoreName
                    ? `You drop at ${draft.pickupStoreName} · driver collects there`
                    : `From ${draft.pickupAddress || '…'}`}
                </Text>
                <Text style={[styles.sumLine, { color: colors.textSecond }]}>
                  {draft.stops.length} drop{draft.stops.length === 1 ? '' : 's'} · {route.distanceText ?? `~${routeKm}km`} · {VEHICLE_LABEL[draft.vehicleType]}
                  {scheduleNow ? ' · Send now' : ` · ${TIME_SLOTS.find(t => t.hour === scheduledHour)?.label ?? ''}`}
                </Text>
              </View>

              <View style={[styles.sumCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sumTitle, { color: colors.text }]}>Packages</Text>
                {draft.stops.map((s, i) => (
                  <View key={i}>
                    <Pressable style={styles.lineRow} onPress={() => setExpandedPkg(expandedPkg === i ? null : i)}>
                      {!!(s.photoUris ?? []).length && <Image source={{ uri: s.photoUris![0] }} style={styles.lineThumb} />}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.lineName, { color: colors.text }]} numberOfLines={1}>
                          {s.packageDescription?.trim() || `Package ${i + 1}`}
                        </Text>
                        <Text style={[styles.lineSub, { color: colors.textThird }]} numberOfLines={1}>
                          {[s.receiverFirstName, s.receiverLastName].filter(Boolean).join(' ') || s.recipientName} · {s.weightKg}kg · {catalog.find(c => c.code === (s.categoryCode ?? draft.categoryCode))?.name ?? ''}
                        </Text>
                      </View>
                      <Text style={[styles.linePrice, { color: colors.text }]}>
                        {packageLines ? `₦${Math.round(packageLines[i]).toLocaleString()}` : '…'}
                      </Text>
                      <Icon name={expandedPkg === i ? 'ChevronUp' : 'ChevronDown'} size={15} color={colors.textThird} />
                    </Pressable>
                    {expandedPkg === i && (
                      <View style={{ paddingLeft: 56, paddingBottom: 8, gap: 3 }}>
                        {([
                          ['Drop-off', s.address || '-'],
                          ['Receiver', `${[s.receiverFirstName, s.receiverLastName].filter(Boolean).join(' ') || s.recipientName || '-'} · ${s.recipientPhone || '-'}`],
                          ['Weight', `${s.weightKg || '-'}kg`],
                          ['Category', catalog.find(c => c.code === (s.categoryCode ?? draft.categoryCode))?.name ?? '-'],
                        ] as [string, string][]).map(([lbl, val]) => (
                          <View key={lbl} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                            {/* Labels one step down, VALUES full ink at 12px:
                                the founder could not read the first cut,
                                which set both to the faintest style. */}
                            <Text style={[styles.lineSub, { color: colors.textSecond, fontSize: 14 }]}>{lbl}</Text>
                            <Text style={[styles.lineSub, { color: colors.text, fontSize: 14, flex: 1, textAlign: 'right' }]} numberOfLines={2}>{val}</Text>
                          </View>
                        ))}
                        {draft.stops.length > 1 && (
                          <Pressable
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 }}
                            onPress={() => { setExpandedPkg(null); removeStop(i); setPkgQueries(q => q.filter((_, j) => j !== i)); }}
                          >
                            <Icon name="X" size={13} color="#DC2626" />
                            <Text style={[styles.lineSub, { color: '#DC2626', fontWeight: '600' }]}>Remove this package</Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                ))}
                {!!quoteError && (
                  <Pressable onPress={() => setQuoteReloadKey((k) => k + 1)} style={styles.quoteErrBox}>
                    <Text style={styles.quoteErrTxt}>{quoteError} Tap to try again.</Text>
                  </Pressable>
                )}
                {Number(quote?.customer?.partnerHandling ?? 0) > 0 && (
                  <View style={styles.lineRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.lineName, { color: colors.text }]} numberOfLines={1}>
                        Partner counter handling
                      </Text>
                      <Text style={[styles.lineSub, { color: colors.textThird }]} numberOfLines={2}>
                        Paid to the counter for every parcel it takes in or hands over.
                      </Text>
                    </View>
                    <Text style={[styles.linePrice, { color: colors.textSecond }]}>
                      ₦{Math.round(Number(quote.customer.partnerHandling)).toLocaleString()}
                    </Text>
                  </View>
                )}
                <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.totalLabel, { color: colors.text }]}>Total · one payment</Text>
                  <Text style={[styles.totalValue, { color: colors.primary }]}>
                    {quote?.customer?.total != null
                      ? `₦${Math.round(Number(quote.customer.total)).toLocaleString()}`
                      : '…'}
                  </Text>
                </View>
                <Text style={[styles.capNote, { color: colors.textThird }]}>
                  Final fare uses the road distance at booking. Every package gets its own tracking code for its receiver.
                </Text>
              </View>

              {/* Run-level Order Summary, ported from the customer's hybrid
                  review at the founder's request, payment row omitted. */}
              <View style={[styles.sumCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sumTitle, { color: colors.text }]}>Order Summary</Text>
                {([
                  ['Pickup', draft.pickupMode === 'store' && draft.pickupStoreName
                    ? `${draft.pickupStoreName} (counter)` : (draft.pickupAddress || '-')],
                  ['Packages', `${draft.stops.length} package${draft.stops.length === 1 ? '' : 's'}`],
                  ['Distance', route.distanceText ?? `~${routeKm}km`],
                  ['Vehicle', VEHICLE_LABEL[draft.vehicleType] ?? draft.vehicleType],
                  ['When', scheduleNow ? 'Send now' : (TIME_SLOTS.find(t => t.hour === scheduledHour)?.label ?? '-')],
                  ['Total', quote?.customer?.total != null ? `₦${Math.round(Number(quote.customer.total)).toLocaleString()}` : '…'],
                ] as [string, string][]).map(([lbl, val]) => (
                  <View key={lbl} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 5 }}>
                    <Text style={[styles.lineSub, { color: colors.textSecond, fontSize: 14 }]}>{lbl}</Text>
                    <Text style={[styles.lineSub, { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1, textAlign: 'right' }]} numberOfLines={2}>{val}</Text>
                  </View>
                ))}
              </View>

              {/* Consent gates the money, same as the customer review. */}
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 }}
                onPress={() => setTcAgreed(v => !v)}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, marginTop: 1,
                  alignItems: 'center', justifyContent: 'center',
                  borderColor: tcAgreed ? colors.primary : colors.textThird,
                  backgroundColor: tcAgreed ? colors.primary : 'transparent',
                }}>
                  {tcAgreed && <Icon name="Check" size={13} color="#fff" />}
                </View>
                <Text style={[styles.lineSub, { color: colors.textSecond, flex: 1, lineHeight: 18 }]}>
                  I agree to the SEIRS Terms of Service, including what happens if a delivery fails.{' '}
                  <Text
                    style={{ color: colors.primary, fontWeight: '600' }}
                    onPress={() => Linking.openURL('https://seirs.app/terms-of-service')}
                  >
                    Read them
                  </Text>
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>

        {/* Counter details. Hours, phone and address exactly as the
            partner registered them, with a copy so the sender can paste
            the address into their own maps app. */}
        <Modal visible={!!storeSheet} animationType="slide" transparent onRequestClose={() => setStoreSheet(null)}>
          {/* Dismiss area is a SIBLING of the sheet, not its parent. A
              Pressable wrapping another Pressable made the buttons inside
              stop responding (found on device 2026-08-16: Copy address
              did nothing). */}
          <View style={styles.sheetBackdrop}>
            <Pressable style={{ flex: 1 }} onPress={() => setStoreSheet(null)} />
            <View
              style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: 16 + insets.bottom }]}
            >
              <View style={styles.sheetGrip} />
              {!!storeSheet && (
                <>
                  {!!storeSheet.photoUrl && (
                    <Image source={{ uri: storeSheet.photoUrl }} style={styles.sheetPhoto} />
                  )}
                  <Text style={[styles.sheetTitle, { color: colors.text }]}>{storeSheet.storeName}</Text>
                  <Text style={[styles.sheetAddr, { color: colors.textSecond }]}>{storeSheet.storeAddress}</Text>

                  <View style={[styles.sheetRow, { borderTopColor: colors.border }]}>
                    <Icon name="Clock" size={16} color={colors.textThird} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sheetLabel, { color: colors.textThird }]}>Opening hours</Text>
                      <Text style={[styles.sheetValue, { color: colors.text }]}>
                        {storeSheet.openTime && storeSheet.closeTime
                          ? `${storeSheet.openTime} - ${storeSheet.closeTime}`
                          : 'Not provided'}
                      </Text>
                      <Text style={[styles.sheetValue, { color: colors.textSecond }]}>
                        {storeSheet.operatingDays?.length
                          ? storeSheet.operatingDays.map((d) => String(d).slice(0, 3)).join(', ')
                          : 'Days not provided'}
                      </Text>
                      <Text style={[styles.sheetValue, { color: storeSheet.isOpenNow ? '#16A34A' : '#DC2626' }]}>
                        {storeSheet.isOpenNow ? 'Open right now' : 'Closed right now'}
                      </Text>
                    </View>
                  </View>

                  {!!storeSheet.phone && (
                    <View style={[styles.sheetRow, { borderTopColor: colors.border }]}>
                      <Icon name="Phone" size={16} color={colors.textThird} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.sheetLabel, { color: colors.textThird }]}>Counter phone</Text>
                        <Text style={[styles.sheetValue, { color: colors.text }]}>{storeSheet.phone}</Text>
                      </View>
                      <Pressable
                        style={[styles.sheetBtn, { backgroundColor: colors.surfaceSecond }]}
                        onPress={() => Linking.openURL(`tel:${storeSheet.phone}`)}
                      >
                        <Text style={[styles.sheetBtnTxt, { color: colors.primary }]}>Call</Text>
                      </Pressable>
                    </View>
                  )}

                  {storeSheet.distanceKm != null && (
                    <View style={[styles.sheetRow, { borderTopColor: colors.border }]}>
                      <Icon name="MapPin" size={16} color={colors.textThird} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.sheetLabel, { color: colors.textThird }]}>Distance</Text>
                        <Text style={[styles.sheetValue, { color: colors.text }]}>
                          {storeSheet.distanceKm < 1 ? 'Under 1km away' : `${storeSheet.distanceKm}km away`}
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                    <Pressable
                      style={[styles.sheetAction, { backgroundColor: colors.surfaceSecond }]}
                      onPress={async () => {
                        const addr = storeSheet.storeAddress;
                        // Clipboard is a native module. When it is present
                        // this is a silent one-tap copy; when it is not,
                        // fall back to the system share sheet rather than
                        // failing quietly, which is what happened here on
                        // device (2026-08-16).
                        try {
                          if (typeof (Clipboard as any)?.setStringAsync === 'function') {
                            await Clipboard.setStringAsync(addr);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1800);
                            return;
                          }
                          throw new Error('clipboard unavailable');
                        } catch {
                          try { await Share.share({ message: addr }); } catch {}
                        }
                      }}
                    >
                      <Icon name={copied ? 'Check' : 'Copy'} size={15} color={colors.text} />
                      <Text style={[styles.sheetActionTxt, { color: colors.text }]}>
                        {copied ? 'Address copied' : 'Copy address'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.sheetAction, { backgroundColor: colors.primary }]}
                      onPress={() => setStoreSheet(null)}
                    >
                      <Text style={[styles.sheetActionTxt, { color: '#fff' }]}>Done</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* Full-screen route map (founder 2026-08-16). Same pins and
            polyline as the thumbnail, with room to actually read them. */}
        <Modal visible={mapFull} animationType="slide" onRequestClose={() => setMapFull(false)}>
          {/* paddingTop keeps the map out from under the status bar, so
              the clock, signal and battery stay readable on the app's own
              background instead of on pale map tiles. An absolutely
              positioned scrim did not survive over the native map view
              (founder 2026-08-16). */}
          <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: statusBarH }}>
            {!!pickupPoint && dropPoints.length > 0 && (
              <MapView
                provider={PROVIDER_GOOGLE}
                style={{ flex: 1 }}
                ref={fullMapRef}
                initialRegion={{
                  latitude: pickupPoint.latitude,
                  longitude: pickupPoint.longitude,
                  latitudeDelta: 0.12,
                  longitudeDelta: 0.12,
                }}
                onMapReady={() => {
                  fullMapRef.current?.fitToCoordinates([pickupPoint, ...dropPoints], {
                    edgePadding: { top: 90, right: 60, bottom: 140, left: 60 },
                    animated: false,
                  });
                }}
              >
                <Marker coordinate={pickupPoint} title={draft.pickupStoreName ?? 'Pickup'} description={draft.pickupAddress} anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={[styles.pinBase, { backgroundColor: '#22C55E' }]}>
                    <Text style={styles.pinTxt}>P</Text>
                  </View>
                </Marker>
                {dropPoints.map((pt, i) => (
                  <Marker
                    key={i}
                    coordinate={pt}
                    title={`Package ${i + 1}`}
                    description={[
                      draft.stops[i]?.receiverFirstName,
                      draft.stops[i]?.destinationStoreName ?? draft.stops[i]?.address,
                    ].filter(Boolean).join(' · ') || undefined}
                    anchor={{ x: 0.5, y: 0.5 }}
                  >
                    <View style={[styles.pinBase, { backgroundColor: '#EF4444' }]}>
                      <Text style={styles.pinTxt}>{i + 1}</Text>
                    </View>
                  </Marker>
                ))}
                {route.coords.length > 1 && (
                  <Polyline coordinates={route.coords} strokeWidth={5} strokeColor={colors.primary} />
                )}
              </MapView>
            )}
            {/* The map is drawn under the status bar, so the clock,
                signal and battery sat on pale map tiles and could not be
                read (founder 2026-08-16). A scrim gives them something to
                sit on without taking the map off the full screen. */}
            <Pressable
              style={[styles.mapCloseBtn, { backgroundColor: colors.surface, top: statusBarH + 12 }]}
              onPress={() => setMapFull(false)}
            >
              <Icon name="X" size={20} color={colors.text} />
            </Pressable>
            <View style={[styles.mapLegend, { backgroundColor: colors.surface, paddingBottom: 12 + insets.bottom }]}>
              <Text style={[styles.mapLegendTxt, { color: colors.text }]}>
                P {draft.pickupMode === 'store' ? `· drop at ${draft.pickupStoreName ?? 'counter'}` : '· pickup'}
                {'   '}
                {dropPoints.map((_, i) => `${i + 1}`).join('  ')} · {dropPoints.length} drop{dropPoints.length === 1 ? '' : 's'}
              </Text>
              <Text style={[styles.mapLegendSub, { color: colors.textThird }]}>
                {route.distanceText ?? `~${routeKm}km`}{route.durationText ? ` · ${route.durationText}` : ''}
              </Text>
            </View>
          </View>
        </Modal>

        {/* Footer CTA */}
        <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: 12 + insets.bottom, backgroundColor: colors.background }]}>
          {/* The reason lives WITH the button that was refused. The error
              box at the top of the scroll was useless the moment we
              started jumping to the offending package: the sender saw the
              right card and no explanation (found on device 2026-08-16).
              Here it is always on screen, whatever the scroll position. */}
          {!!error && (
            <View style={styles.footerError}>
              <Icon name="AlertCircle" size={15} color="#DC2626" />
              <Text style={styles.footerErrorText}>{error}</Text>
            </View>
          )}
          <Pressable
            style={[styles.cta, { backgroundColor: colors.primary },
              (loading || (step === 3 && !tcAgreed)) && { opacity: 0.6 }]}
            disabled={loading || (step === 3 && !tcAgreed)}
            onPress={step === 3 ? handleSubmit : next}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>
                {step === 3
                  ? (quote?.customer?.total != null
                      ? `Pay ₦${Math.round(Number(quote.customer.total)).toLocaleString()}`
                      : 'Book this run')
                  : 'Continue'}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  backBtn:  { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 1 },
  dots:     { flexDirection: 'row', gap: 4 },
  dot:      { width: 8, height: 8, borderRadius: 4 },
  errorBox:  { backgroundColor: '#EF444415', borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { color: '#DC2626', fontSize: 14, fontWeight: '600' },
  stepHero:        { alignItems: 'center', marginBottom: 18, gap: 8 },
  stepHeroCaption: { fontSize: 14, textAlign: 'center', maxWidth: 280, lineHeight: 18 },
  pkgCard:  { borderRadius: 16, borderWidth: 1, padding: 14, gap: 4 },
  pkgHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  pkgTitle: { fontSize: 15, fontWeight: '700' },
  label:    { fontSize: 13, fontWeight: '600', marginTop: 8, marginBottom: 6 },
  input:    { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 2 },
  photoRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoWrap:  { width: 72, height: 72 },
  photoThumb: { width: 72, height: 72, borderRadius: 10 },
  photoRemove: {
    position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center',
  },
  photoAdd: {
    width: 72, height: 72, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  photoHint: { fontSize: 12 },
  hint:      { fontSize: 12, lineHeight: 15, marginTop: 4, marginBottom: 2 },
  useLocRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  useLocTxt:  { fontSize: 14, fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:     { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipTxt:  { fontSize: 13.5, fontWeight: '600' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 14,
  },
  addBtnText: { fontSize: 15, fontWeight: '700' },
  capNote:    { fontSize: 13, lineHeight: 17 },
  destRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  destBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
  },
  destTxt: { fontSize: 13.5, fontWeight: '600' },
  storePicked: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: 12, padding: 12,
  },
  storeCardRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8,
  },
  storeThumb: { width: 46, height: 46, borderRadius: 10 },
  storeName:  { fontSize: 14, fontWeight: '700' },
  storeMeta:  { fontSize: 12, marginTop: 1 },
  changeTxt:  { fontSize: 13, fontWeight: '700' },
  suggBlock: { borderWidth: 1, borderRadius: 12, marginTop: 4, overflow: 'hidden' },
  suggRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: 1 },
  suggMain:  { fontSize: 14, fontWeight: '500' },
  suggSub:   { fontSize: 12, marginTop: 1 },
  whenCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 10,
  },
  whenIcon:  { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  whenTitle: { fontSize: 15, fontWeight: '700' },
  whenSub:   { fontSize: 13, marginTop: 2 },
  schedPanel: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 4 },
  dayChip:  { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  hourChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  vehRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 14 },
  vehName: { fontSize: 15, fontWeight: '700' },
  recBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  recTxt:   { color: '#fff', fontSize: 11, fontWeight: '700' },
  vehSub:  { fontSize: 13, marginTop: 2 },
  mapCard:  { height: 220, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  map:      { ...StyleSheet.absoluteFillObject },
  mapBadge: {
    position: 'absolute', left: 12, bottom: 12,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
  mapBadgeTxt: { fontSize: 13, fontWeight: '700' },
  pinBase: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  pinTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  sumCard:  { borderRadius: 16, borderWidth: 1, padding: 14 },
  sumTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  sumLine:  { fontSize: 14, marginBottom: 3 },
  lineRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  lineThumb: { width: 34, height: 34, borderRadius: 8 },
  lineName:  { fontSize: 15, fontWeight: '700' },
  lineSub:   { fontSize: 13, marginTop: 1 },
  linePrice: { fontSize: 14, fontWeight: '700' },
  quoteErrBox: { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, marginTop: 8 },
  quoteErrTxt: { color: '#DC2626', fontSize: 13, fontWeight: '600' },
  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 10, marginTop: 6 },
  totalLabel: { fontSize: 17, fontWeight: '700' },
  totalValue: { fontSize: 24, fontWeight: '700' },
  expandChip: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999,
  },
  mapCloseBtn: {
    position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  mapLegend: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 18, paddingTop: 12,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
  },
  mapLegendTxt: { fontSize: 14, fontWeight: '700' },
  mapLegendSub: { fontSize: 13, marginTop: 2 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10 },
  sheetGrip: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.4)',
    alignSelf: 'center', marginBottom: 14,
  },
  sheetPhoto: { width: '100%', height: 140, borderRadius: 12, marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  sheetAddr:  { fontSize: 14, marginTop: 3, marginBottom: 6 },
  sheetRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    borderTopWidth: 1, paddingVertical: 12,
  },
  sheetLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  sheetValue: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  sheetBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  sheetBtnTxt: { fontSize: 14, fontWeight: '700' },
  sheetAction: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 13, borderRadius: 12,
  },
  sheetActionTxt: { fontSize: 15, fontWeight: '700' },
  detailsLink: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },
  footerError: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EF444418', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10,
  },
  footerErrorText: { flex: 1, color: '#DC2626', fontSize: 14, fontWeight: '600' },
  cta:     { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
