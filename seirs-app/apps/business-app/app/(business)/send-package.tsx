/**
 * Business · Send a Package: the CUSTOMER-SEND pattern, exactly
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
 * This is the ONLY booking flow in the app, with nothing beside it. The
 * old map-first wizard was deleted with this rebuild, and CSV bulk
 * upload was deleted on 2026-08-24 (commit 5e804b1): it booked without
 * the consent checkbox and without the quote pin, so bulk orders
 * captured no agreement to the failed-delivery terms and were charged
 * an unpinned number. Two booking screens meant two sets of rules, and
 * the divergence is exactly what the founder kept finding. The line
 * that used to sit here saying "CSV upload still books through the same
 * backend endpoint" outlived the screen it described.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, Image, Linking, KeyboardAvoidingView, Platform,
  Keyboard, Dimensions, Modal, Share, StatusBar as RNStatusBar,
  BackHandler,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useMultiStopDirections } from '@/components/useMultiStopDirections';
import { tint } from '@/constants/tint';
import { useSeirsDialog } from '@/components/SeirsDialog';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Illustration } from '@/components/Illustration';
import {
  businessApi, configApi, mapsApi, uploadApi, pricingApi, dropoffApi, feesApi,
  deliveriesApi,
  type ServiceCategory, type RateCard,
} from '@/services/api';
import { useBusinessStore, isDraftEmpty, type StoreLite } from '@/store/businessStore';
import { type VehicleType } from '@seirs/shared';
import { useColors, useTheme } from '@/context/ThemeContext';
import { VEHICLE_LABEL } from '@/constants/vehicles';
import { TERMS_URL } from '@/constants/config';
import { naira } from '@/utils/money';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

const STEPS = ['Packages', 'Pickup', 'Vehicle', 'Review'] as const;
const STEP_SLOTS = ['send-package', 'send-address', 'send-vehicle', 'send-fare'] as const;
const STEP_CAPTIONS = [
  'Tell us about each package: photo, weight and who receives it.',
  'Where does the driver collect everything?',
  'Pick the ride that fits the load.',
  'Check every line, then pay once for the whole run.',
] as const;

// VEHICLE_LABEL moved to @/constants/vehicles on 2026-08-23 (B-2.3). It
// lived here only, so the Deliveries list had no way to reach it and
// printed the raw enum: an Okada booked here came back a "motorcycle".
// Bicycle / On-foot: the inclusion tier (founder 2026-08-21). A person
// with no vehicle carries small drops short distances and gets paid.
const VEHICLE_ORDER = ['bicycle', 'motorcycle', 'tricycle', 'car', 'van', 'truck_small', 'truck_large'];
const DEFAULT_MAX_PACKAGES: Record<string, number> = {
  bicycle: 3, motorcycle: 5, tricycle: 15, car: 20,
  van: 40, truck_small: 80, truck_large: 150,
};

// Scheduled pickups run 5 AM to 9 PM (platform operating window).
// Send Now stays 24/7: this list is only for booking ahead.
/**
 * The engine's zone tiers in words a sender recognises. Same strings the
 * customer app uses: one company must not describe the same charge two
 * different ways. An unlisted tier renders nothing rather than a raw key.
 */
const ZONE_TIER_LABEL: Record<string, string> = {
  intraStateLongHaul: tx9('auto.sendPackage.longTripWithinOneState', 'Long trip within one state'),
  interStateAdjacent: tx9('auto.sendPackage.crossingIntoTheNextState', 'Crossing into the next state'),
  interStateDistant:  tx9('auto.sendPackage.crossingToAFurtherState', 'Crossing to a further state'),
  crossZone:          tx9('auto.sendPackage.crossingToAnotherPartOf', 'Crossing to another part of the country'),
  interState:         tx9('auto.sendPackage.crossingAStateLine', 'Crossing a state line'),
};

const TIME_SLOTS = Array.from({ length: 17 }, (_, i) => {
  const hour = i + 5;
  return {
    hour,
    label: hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`,
  };
});

interface Prediction { place_id: string; main_text: string; secondary_text: string }

export default function SendPackageScreen() {
  const { isDark } = useTheme();
  // Themed dialogs, not the Android system AlertDialog (work order
  // item 4, 2026-08-24). Same signature as Alert.alert, so these are
  // straight renames, but it renders every button instead of
  // silently discarding the fourth.
  const dialog = useSeirsDialog();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  /**
   * "Special Cargo" no longer lands here (founder 2026-09-06). It used to
   * arrive with preset=cargo and a truck preselected, which made it Send
   * with one chip moved. It is the quote-first lane now, special-request,
   * the same thing the customer app calls Special delivery.
   */
  const { tripId: tripIdParam, tripLabel: tripLabelParam } =
    useLocalSearchParams<{ tripId?: string; tripLabel?: string }>();
  /**
   * Sending this load on a rider's declared trip (2026-08-31).
   *
   * Arrives from Cargo Space. The parcel is offered to that one rider
   * first; they accept or decline, and an unanswered offer expires and
   * refunds without anyone chasing it. Priced exactly like any other
   * booking, so attaching a trip never changes the fare.
   */
  const postToTripId    = typeof tripIdParam === 'string' ? tripIdParam : undefined;
  const postToTripLabel = typeof tripLabelParam === 'string' ? tripLabelParam : undefined;
  const {
    draft, draftSavedAt, setDraft, addStop, removeStop, updateStop, resetDraft,
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

  /**
   * The saved draft, made visible and refusable (founder 2026-09-06:
   * "imagine a user having to delete their old input").
   *
   * Persisting the form was his own call on 16 August and it is still the
   * right one for a trader ten packages in when the app restarts. What
   * was wrong is that the leftover came back SILENTLY, as if it were a
   * blank form, and the only way out was deleting every field by hand.
   * So: a strip on the first step says an unfinished booking was found
   * and how old it is, with Start fresh beside Continue, and the header
   * carries Start over on every step. The store drops anything a day old
   * before it is ever shown.
   */
  const hasDraft = !isDraftEmpty(draft);
  /**
   * Decided ONCE, when the screen opens, and only after the persisted
   * store has actually loaded. On a cold start the first render sees the
   * empty default draft and AsyncStorage fills it a moment later; a plain
   * useState initialiser would have said "nothing saved" every time it
   * mattered. Not derived from hasDraft either, or the strip would greet
   * somebody with "unfinished booking" the moment they typed their first
   * word into a fresh form.
   */
  const [showResume, setShowResume] = useState(false);
  useEffect(() => {
    const check = () => { if (!isDraftEmpty(useBusinessStore.getState().draft)) setShowResume(true); };
    const p = (useBusinessStore as any).persist;
    if (!p || p.hasHydrated()) { check(); return; }
    const unsub = p.onFinishHydration(check);
    return () => { unsub?.(); };
  }, []);
  const draftAge = (() => {
    if (!draftSavedAt) return '';
    const min = Math.max(1, Math.round((Date.now() - draftSavedAt) / 60000));
    if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60);
    return h < 24 ? `${h} hour${h === 1 ? '' : 's'} ago` : 'yesterday';
  })();
  const clearBooking = () => {
    resetDraft();
    setPickupQuery('');
    setPkgQueries(['']);
    setPredictions([]);
    setActiveField(null);
    setScheduleNow(true);
    setScheduledHour(null);
    setError(null);
    setShowResume(false);
    setStep(0);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };
  const startOver = () => {
    dialog.alert(
      'Start over?',
      'This clears every package, address and photo in this booking.',
      [
        { text: tr('auto.sendPackage.keepEditing', 'Keep editing'), style: 'cancel' },
        { text: tr('auto.sendPackage.startOver', 'Start over'), style: 'destructive', onPress: clearBooking },
      ],
    );
  };


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
   * A package that BECOMES high-value has to lose its gate/neighbour
   * fallback (founder policy 2026-08-11: hand to receiver or partner
   * counter only, or the mandatory signature has a hole in it).
   *
   * The chips below are only `disabled` when the value is already over
   * the threshold, which blocks a new tap and does nothing to a choice
   * already made. Pick "Leave at gate", then type 500000 into the value
   * box, and the chip stayed selected and lit while the hint underneath
   * said the opposite (found 2026-08-25).
   *
   * The customer app resets it and has done since 2026-08-21. This app
   * did not, and unlike the customer path there is no server-side net:
   * deliveries.service.create throws BadRequest on this combination,
   * business.service.createDelivery writes fallbackPref straight onto
   * the stop with no check at all. So on THIS app it booked.
   */
  useEffect(() => {
    draft.stops.forEach((s, i) => {
      const hv = Number(s.declaredValueNgn ?? 0) >= highValueNgn;
      if (hv && (s.fallbackPref === 'gate' || s.fallbackPref === 'neighbour')) {
        updateStop(i, { fallbackPref: 'hand_only', fallbackNeighbourName: undefined });
      }
    });
  }, [draft.stops, highValueNgn]);

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
  /**
   * The control wears a Camera icon and only ever opened the gallery
   * (B-10.10), so a sender with the parcel in front of them had to leave
   * the app, use the camera, and come back. Ask which, then honour it.
   */
  const addPhotoFromLibrary = async (idx: number) => {
    const current = draft.stops[idx]?.photoUris ?? [];
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      dialog.alert('Photo needed', 'Allow photo access: every package needs its picture for handoff proof.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets?.[0]?.uri) {
      updateStop(idx, { photoUris: [...current, result.assets[0].uri] });
    }
  };

  const addPhotoFromCamera = async (idx: number) => {
    const current = draft.stops[idx]?.photoUris ?? [];
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      dialog.alert('Camera needed', 'Allow camera access to photograph the parcel, or pick an existing photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets?.[0]?.uri) {
      updateStop(idx, { photoUris: [...current, result.assets[0].uri] });
    }
  };

  const pickPhoto = (idx: number) => {
    if ((draft.stops[idx]?.photoUris ?? []).length >= 5) return;
    dialog.alert('Package photo', 'Photograph the parcel now, or pick one you already have.', [
      { text: tr('auto.sendPackage.takePhoto', 'Take photo'),      onPress: () => { addPhotoFromCamera(idx); } },
      { text: tr('auto.sendPackage.chooseExisting', 'Choose existing'), onPress: () => { addPhotoFromLibrary(idx); } },
      { text: tr('auto.payoutAccount.cancel', 'Cancel'), style: 'cancel' },
    ]);
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
        dialog.alert('Outside Nigeria', 'Type the pickup address instead.');
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

  /**
   * The chosen pickup slot as an ISO string, or undefined for Send now.
   *
   * Hoisted out of handleSubmit on 2026-08-25 because the QUOTE was not
   * sending it. The rate card prices night, peak and weekend surcharges
   * off scheduledAt, so a run booked at 22:40 for a 9 AM pickup was
   * quoted at tonight's NIGHT rate, and a Friday booking for a Saturday
   * slot missed the weekend one entirely. Worse, createDelivery DOES
   * pass scheduledAt to the engine, so the server's own breakdown was
   * priced on the slot while the pin the sender is charged from was
   * priced on the moment they were standing there: two different
   * numbers on one booking, with driverEarnings taken from the wrong
   * one. Quote and book now agree on when the run happens.
   */
  const scheduledAtIso = useMemo(() => {
    if (scheduleNow || scheduledHour == null) return undefined;
    const d = new Date();
    d.setDate(d.getDate() + scheduledDayOffset);
    d.setHours(scheduledHour, 0, 0, 0);
    return d.toISOString();
  }, [scheduleNow, scheduledHour, scheduledDayOffset]);

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
   * replaces the straight-line estimate the moment it resolves, for the
   * display, the QUOTE and the booking alike. It used to replace it for
   * display only while the quote stayed on crow-flies (B-10.4).
   */
  const pickupPoint = draft.pickupLat != null && draft.pickupLng != null
    ? { latitude: draft.pickupLat, longitude: draft.pickupLng }
    : null;
  /**
   * The drop furthest from pickup, which the server needs for two things
   * it could not do before (2026-08-27): detect the destination STATE,
   * and floor the priced distance.
   *
   * This app never sent dropoffCoords at all, so the engine's state-aware
   * zone tier was skipped on every business booking and it fell back to
   * the v1 branch, where the hardcoded isInterState: false below actively
   * suppressed the surcharge. A Lagos to Abuja run was priced as a local
   * one. Furthest rather than last, because on a multi-drop run it is the
   * leg that decides the zone and it gives the tightest honest floor.
   */
  const farthestDrop = useMemo(() => {
    if (draft.pickupLat == null || draft.pickupLng == null) return undefined;
    let best: { latitude: number; longitude: number } | undefined;
    let bestD = -1;
    for (const s of draft.stops) {
      if (s.lat == null || s.lng == null) continue;
      const dLat = ((s.lat - draft.pickupLat!) * Math.PI) / 180;
      const dLng = ((s.lng - draft.pickupLng!) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2
        + Math.cos((draft.pickupLat! * Math.PI) / 180) * Math.cos((s.lat * Math.PI) / 180)
        * Math.sin(dLng / 2) ** 2;
      const d = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (d > bestD) { bestD = d; best = { latitude: s.lat, longitude: s.lng }; }
    }
    return best;
  }, [draft.pickupLat, draft.pickupLng, draft.stops]);

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
  /**
   * The engine REFUSED to price this rather than failing to (2026-09-05).
   *
   * computePrice throws SPECIAL_REQUEST_REQUIRED for special, oversized,
   * heavy, hazardous, cold_chain, livestock and relocation. Uncaught it
   * reads as a broken app, which is the opposite of what happened, and it
   * hides the quote lane from the trader who most needs it: the one with
   * a generator on a pallet.
   */
  const [needsQuote, setNeedsQuote] = useState(false);
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
    setNeedsQuote(false);
    pricingApi.quote({
      vehicleType: draft.vehicleType,
      categoryCode: packages[0]?.categoryCode ?? 'standard_parcel',
      // routeKm, not totalKm (B-10.4). The effect already re-runs on routeKm,
      // but it re-quoted with the SAME straight-line number every time, so the
      // pin was burned for nothing and the run was quoted on crow-flies x 1.45
      // while the review displayed and handleSubmit booked the road distance.
      km: routeKm,
      stopCount: draft.stops.length,
      weightKg: totalWeight,
      // Deliberately not sent. The engine derives waiting from the run's
      // own shape (stops, weight, category setup, per-stop buffer), which
      // is the same figure the booking charges. Sending a flat four
      // minutes a stop from here made the quote disagree with the charge
      // and let the weight ladder on the card go unread (2026-08-27).
      packages,
      declaredValueNgn: draft.stops.reduce((sum, s) => sum + (Number(s.declaredValueNgn) || 0), 0) || undefined,
      // Counters are paid per parcel they touch, so the quote has to know
      // about them or the review total would not match the charge.
      partnerStoreTouches:
        (draft.pickupStoreId ? draft.stops.length : 0) +
        draft.stops.filter((s) => s.destinationStoreId).length,
      pickupCoords: draft.pickupLat != null ? { latitude: draft.pickupLat, longitude: draft.pickupLng } : undefined,
      dropoffCoords: farthestDrop,
      // Price the run for WHEN it happens, not for when the sender is
      // looking at the screen. Undefined means Send now, which the
      // engine already treats as this instant.
      scheduledAt: scheduledAtIso,
    } as any)
      .then(setQuote)
      .catch((e: any) => {
        // A refusal is not a failure. Offer the lane instead of apologising.
        const refused = /SPECIAL_REQUEST_REQUIRED/i.test(String(e?.message ?? e?.code ?? ''));
        setNeedsQuote(refused);
        setQuoteError(refused ? null : (e?.message ?? 'Could not price this run.'));
      });
  }, [step, routeKm, draft.stops, draft.vehicleType, scheduledAtIso, quoteReloadKey]);

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
     * Split in KOBO with the last line absorbing the drift, so the shares
     * add up to the carriage exactly. This used to round to whole naira,
     * for the same reason: shares that summed to the total still printed
     * 5,302 + 5,802 against a total of 11,103 (seen on device
     * 2026-08-16). The founder reversed the whole-naira rule on
     * 2026-08-24, so the drift is now absorbed at kobo precision instead
     * and the receipt reconciles at the precision Flutterwave reports.
     */
    const handling = Number(quote?.customer?.partnerHandling ?? 0);
    const carriage = total - handling;
    const weights = draft.stops.map(s => 1 + pctOf(s.categoryCode) / 100);
    const wSum = weights.reduce((a, b) => a + b, 0);
    const sharesKobo = weights.map(w => Math.round((carriage * w / wSum) * 100));
    const driftKobo = Math.round(carriage * 100) - sharesKobo.reduce((a, b) => a + b, 0);
    sharesKobo[n - 1] += driftKobo;
    return sharesKobo.map(k => k / 100);
  }, [quote, draft.stops, catalog, draft.categoryCode, draft.pickupStoreId]);

  // ── Validation per step ──────────────────────────────────────────────
  const validateStep = (): { message: string; packageIndex?: number } | null => {
    if (step === 0) {
      for (let i = 0; i < draft.stops.length; i++) {
        const s = draft.stops[i];
        if (!(s.photoUris ?? []).length)    return { packageIndex: i, message: tx9('auto.sendPackage.packageNeedsAtLeastOne', 'Package {{v0}} needs at least one photo.', { v0: i + 1 }) };
        if (!(Number(s.weightKg) > 0))      return { packageIndex: i, message: tx9('auto.sendPackage.packageNeedsAWeight', 'Package {{v0}} needs a weight.', { v0: i + 1 }) };
        if (!(s.categoryCode ?? draft.categoryCode)) return { packageIndex: i, message: tx9('auto.sendPackage.packageNeedsACategory', 'Package {{v0}} needs a category.', { v0: i + 1 }) };
        if (!s.receiverFirstName?.trim())   return { packageIndex: i, message: tx9('auto.sendPackage.packageNeedsTheReceiverS', 'Package {{v0}} needs the receiver\'s first name.', { v0: i + 1 }) };
        if (s.fallbackPref === 'neighbour' && !s.fallbackNeighbourName?.trim())
          return { packageIndex: i, message: tx9('auto.sendPackage.packageNameTheNeighbourWho', 'Package {{v0}}: name the neighbour who may collect.', { v0: i + 1 }) };
        if (!s.recipientPhone?.trim())      return { packageIndex: i, message: tx9('auto.sendPackage.packageNeedsTheReceiverS2', 'Package {{v0}} needs the receiver\'s phone.', { v0: i + 1 }) };
        if (s.destinationMode === 'store' && !s.destinationStoreId)
          return { packageIndex: i, message: tx9('auto.sendPackage.packageChooseThePartnerStore', 'Package {{v0}}: choose the partner store it goes to.', { v0: i + 1 }) };
        if (s.lat == null || s.lng == null) return { packageIndex: i, message: tx9('auto.sendPackage.packageNeedsADeliveryAddress', 'Package {{v0}} needs a delivery address picked from the suggestions.', { v0: i + 1 }) };
      }
      return null;
    }
    if (step === 1) {
      if (draft.pickupMode === 'store' && !draft.pickupStoreId)
        return { message: tr('auto.sendPackage.chooseTheCounterYouWill', 'Choose the counter you will drop the packages at.') };
      if (draft.pickupLat == null || draft.pickupLng == null) return { message: tr('auto.sendPackage.pickThePickupAddressFrom', 'Pick the pickup address from the suggestions.') };
      if (!scheduleNow && scheduledHour == null) return { message: tr('auto.sendPackage.pickAPickupHourOr', 'Pick a pickup hour, or switch to Send now.') };
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
            message: tx9('auto.sendPackage.packageIsGoingToThe', 'Package {{v0}} is going to the same counter you are dropping it at. Send it to an address or a different counter.', { v0: clash + 1 }),
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
      if (!draft.vehicleType) return { message: tr('auto.sendPackage.pickAVehicle', 'Pick a vehicle.') };
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
    if (!fits) return;
    if (fits !== draft.vehicleType) setDraft({ vehicleType: fits as VehicleType });
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
    // Two different states share `quote === null`, and telling a sender
    // the price "is still computing" when the quote actually FAILED is
    // an invitation to keep tapping forever (2026-08-25). quoteError
    // separates them, and the retry is the same one the review card
    // offers.
    if (!quote) {
      if (quoteError) {
        dialog.alert(
          'Price could not be worked out',
          `${quoteError} Nothing has been booked. Tap Try again to price this run.`,
          [
            { text: tr('auto.deliveryDetail.notNow', 'Not now'), style: 'cancel' },
            { text: tr('auto.sendPackage.tryAgain', 'Try again'), onPress: () => setQuoteReloadKey(k => k + 1) },
          ],
        );
      } else {
        dialog.alert('One moment', 'The price is still being worked out. Try again in a second.');
      }
      return;
    }
    setLoading(true);
    try {
      // Every photo of every package uploads (customer parity: up to 5).
      const photoUrlsPerPackage: string[][] = [];
      for (const s of draft.stops) {
        const urls: string[] = [];
        for (const uri of (s.photoUris ?? [])) {
          // "Send again" prefills a run with photos already on our CDN.
          // uploadApi.file treats its argument as a local file handle, so
          // an https URL rides through untouched and only fresh camera or
          // library picks are uploaded.
          if (/^https?:\/\//i.test(uri)) { urls.push(uri); continue; }
          const up = await uploadApi.file(uri, 'image/jpeg', 'packages');
          urls.push(up.url);
        }
        photoUrlsPerPackage.push(urls);
      }
      const scheduledAt = scheduledAtIso;

      /**
       * Posting to a rider's trip is a REQUEST, not a booking
       * (2026-08-31, founder). The customer app was converted first and
       * this was left on the old path for an hour, which meant a trader
       * using Cargo Space still paid up front and waited on a refund if
       * the rider said no: exactly the thing being fixed.
       *
       * A Flutterwave refund is a second transaction with its own cost,
       * not a reversal. Nothing is charged here. The rider accepts,
       * declines, or offers a different drop-off at a fresh price, and
       * only an agreement produces something to pay for.
       */
      if (postToTripId) {
        const first: any = draft.stops[0] ?? {};
        await deliveriesApi.requestParcelOnTrip(postToTripId, {
          pickupAddress:  draft.pickupAddress,
          pickupLat:      draft.pickupLat,
          pickupLng:      draft.pickupLng,
          dropoffAddress: first.address,
          dropoffLat:     first.lat,
          dropoffLng:     first.lng,
          weightKg:       draft.stops.reduce(
            (sum: number, st: any) => sum + (Number(st?.weightKg ?? 0) || 0), 0,
          ),
          categoryCode:   first.categoryCode ?? draft.categoryCode ?? undefined,
          packageDescription: first.packageDescription?.trim() || undefined,
          declaredValueNgn: first.declaredValueNgn ?? undefined,
          preferredStoreId: first.destinationStoreId ?? undefined,
          senderInstructions: first.note?.trim() || undefined,
        });
        resetDraft();
        dialog.alert(
          'Request sent',
          'The driver will accept, decline, or offer a different drop-off point. '
          + 'Nothing has been charged, and nothing will be until you both agree.',
        );
        router.replace('/(business)/trip-requests' as any);
        return;
      }

      const res = await businessApi.createDelivery({
        termsAccepted: tcAgreed,
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
        // isInterState was hardcoded false here. This payload already
        // carries pickupLat/Lng and every stop coordinate, so the server
        // derives the states itself; the flag was not merely redundant,
        // it was the thing suppressing the surcharge on the v1 fallback.
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
          dialog.alert(
            'Could not open checkout',
            `Booking ${trackingCode} is saved and unpaid. Open it from Deliveries and tap Pay now to try again.`,
          );
        }
        router.replace('/(business)/(tabs)/deliveries' as any);
      } else {
        dialog.alert(
          'Run booked',
          // No "remaining credit" line: senders do not hold a balance with
          // SEIRS. Only partner counters and drivers have wallets, and
          // those show EARNINGS (founder, restated 2026-08-16).
          `Tracking: ${trackingCode}\nEach package has its own code: receivers can track theirs on seirs.`,
          [{ text: tr('auto.editDeliveryDetail.done', 'Done'), onPress: () => router.replace('/(business)/(tabs)/deliveries' as any) }],
        );
      }
    } catch (e: any) {
      // An expired pin means the price may have moved: re-quote so the
      // review shows the current number before they book again.
      if (/expired/i.test(String(e?.message ?? ''))) setQuoteReloadKey(k => k + 1);
      dialog.alert('Could not book', e?.message ?? 'Please try again.');
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
          <Text style={[styles.title, { color: colors.text }]}>{tx('auto.sendPackage.sendAPackage', 'Send a Package')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecond }]}>
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </Text>
        </View>
        {/* One way out of a filled form, on every step, that is not
            deleting fields one by one. Hidden while the form is blank. */}
        {(hasDraft || step > 0) ? (
          <Pressable onPress={startOver} hitSlop={8} style={[styles.startOverBtn, { borderColor: colors.border }]}>
            <Icon name="RotateCcw" size={14} color={colors.textSecond} />
            <Text style={[styles.startOverText, { color: colors.textSecond }]}>{tx('auto.sendPackage.startOver', 'Start over')}</Text>
          </Pressable>
        ) : (
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, { backgroundColor: i <= step ? colors.primary : colors.border }]} />
            ))}
          </View>
        )}
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
              {/* The saved draft, named. Continue keeps it; Start fresh
                  clears it. Either way the sender knows the form is not
                  blank, which is the part that was missing. */}
              {showResume && hasDraft && (
                <View style={[styles.resumeStrip, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
                  <Icon name="Clock" size={18} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.resumeTitle, { color: colors.text }]}>
                      Unfinished booking{draftAge ? ` from ${draftAge}` : ''}
                    </Text>
                    <Text style={[styles.resumeSub, { color: colors.textSecond }]}>
                      {draft.stops.length} package{draft.stops.length === 1 ? '' : 's'} {tr('auto.sendPackage.savedOnThisPhoneContinue', 'saved on this phone. Continue where you stopped, or start fresh.')}
                    </Text>
                  </View>
                  <View style={{ gap: 6 }}>
                    <Pressable onPress={() => setShowResume(false)} style={[styles.resumeBtn, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.resumeBtnText, { color: '#fff' }]}>{tx('auto.sendPackage.continue', 'Continue')}</Text>
                    </Pressable>
                    <Pressable onPress={clearBooking} style={[styles.resumeBtn, { borderWidth: 1, borderColor: colors.primary }]}>
                      <Text style={[styles.resumeBtnText, { color: colors.primary }]}>{tx('auto.sendPackage.startFresh', 'Start fresh')}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
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
                    {tr('auto.sendPackage.photos', 'Photos')} <Text style={{ color: '#DC2626' }}>*</Text>
                    <Text style={{ color: colors.textThird }}>  {tr('auto.sendPackage.atLeast1UpTo', 'at least 1, up to 5')}</Text>
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
                        <Text style={[styles.photoHint, { color: colors.textSecond }]}>{tr('auto.sendPackage.add', 'Add')}</Text>
                      </Pressable>
                    )}
                  </View>

                  <Text style={[styles.label, { color: colors.textSecond }]}>{tx('auto.sendPackage.whatIsIt', 'What is it?')}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                    value={s.packageDescription ?? ''}
                    onChangeText={(v) => updateStop(i, { packageDescription: v })}
                    onFocus={handleFieldFocus}
                    placeholder={tx('auto.sendPackage.eGTwoCartonsOf', 'e.g. Two cartons of shoes')}
                    placeholderTextColor={colors.textThird}
                  />

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.label, { color: colors.textSecond }]}>
                        {tr('auto.sendPackage.weightKg', 'Weight (kg)')} <Text style={{ color: '#DC2626' }}>*</Text>
                      </Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                        value={s.weightKg != null ? String(s.weightKg) : ''}
                        onChangeText={(v) => {
                          const n = Number(v.replace(',', '.'));
                          updateStop(i, { weightKg: Number.isFinite(n) && v !== '' ? n : undefined });
                        }}
                        onFocus={handleFieldFocus}
                    placeholder={tx('auto.sendPackage.eG3', 'e.g. 3')}
                        placeholderTextColor={colors.textThird}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <Text style={[styles.label, { color: colors.textSecond }]}>
                    {tr('auto.sendPackage.category', 'Category')} <Text style={{ color: '#DC2626' }}>*</Text>
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
                    {tr('auto.sendPackage.whoIsReceiving', 'Who is receiving?')} <Text style={{ color: '#DC2626' }}>*</Text>
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      style={[styles.input, { flex: 1, backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                      value={s.receiverFirstName ?? ''}
                      onChangeText={(v) => updateStop(i, { receiverFirstName: v })}
                      onFocus={handleFieldFocus}
                    placeholder={tx('auto.sendPackage.firstName', 'First name')}
                      placeholderTextColor={colors.textThird}
                    />
                    <TextInput
                      style={[styles.input, { flex: 1, backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                      value={s.receiverLastName ?? ''}
                      onChangeText={(v) => updateStop(i, { receiverLastName: v })}
                      onFocus={handleFieldFocus}
                    placeholder={tx('auto.sendPackage.lastName', 'Last name')}
                      placeholderTextColor={colors.textThird}
                    />
                  </View>
                  <Text style={[styles.hint, { color: colors.textThird }]}>
                    {tr('auto.sendPackage.theDriverConfirmsThisFirst', 'The driver confirms this first name at handoff. Anyone the receiver trusts can collect.')}
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
                    {tr('auto.sendPackage.whereIsItGoing', 'Where is it going?')} <Text style={{ color: '#DC2626' }}>*</Text>
                  </Text>
                  <View style={styles.destRow}>
                    {([
                      { key: 'address', label: tr('auto.sendPackage.toAnAddress', 'To an address'), icon: 'MapPin' },
                      { key: 'store',   label: tr('auto.sendPackage.toAPartnerStore', 'To a partner store'), icon: 'Store' },
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
                      ? tx9('auto.sendPackage.areaTheReceiverIsIn', 'Area the receiver is in, e.g. Yaba')
                      : tx9('auto.sendPackage.streetAreaCity', 'Street, area, city')}
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
                            <Text style={[styles.changeTxt, { color: colors.primary }]}>{tx('auto.sendPackage.change', 'Change')}</Text>
                          </Pressable>
                        </View>
                      ) : nearbyBusy[i] ? (
                        <ActivityIndicator color={colors.accent} style={{ paddingVertical: 12 }} />
                      ) : (nearby[i]?.length ?? 0) > 0 ? (
                        <>
                          <Text style={[styles.hint, { color: colors.textThird }]}>
                            {nearby[i].length} counter{nearby[i].length === 1 ? '' : 's'} {tr('auto.sendPackage.nearThereTapOneTo', 'near there. Tap one to send this package to it.')}
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
                                  {store.bucket === 'full' ? tx9('auto.sendPackage.full', '· Full') : store.bucket === 'limited' ? tx9('auto.sendPackage.nearlyFull', '· Nearly full') : tx9('auto.sendPackage.spaceAvailable', '· Space available')}
                                </Text>
                              </View>
                              <Icon name="ChevronRight" size={16} color={colors.textThird} />
                            </Pressable>
                          ))}
                        </>
                      ) : (
                        <Text style={[styles.hint, { color: colors.textThird }]}>
                          {(s.lat != null)
                            ? tx9('auto.sendPackage.noPartnerCounterNearThat', 'No partner counter near that area yet. Send to the address instead.')
                            : tx9('auto.sendPackage.typeTheAreaTheReceiver', 'Type the area the receiver is in and we will show the counters around it.')}
                        </Text>
                      )}
                    </View>
                  )}

                  <Text style={[styles.label, { color: colors.textSecond }]}>{tx('auto.sendPackage.ifNobodyIsAvailable', 'If nobody is available')}</Text>
                  <View style={styles.chipWrap}>
                    {([
                      { key: 'hand_only', label: tr('auto.sendPackage.handToReceiverOnly', 'Hand to receiver only') },
                      { key: 'neighbour', label: tr('auto.sendPackage.leaveWithNeighbour', 'Leave with neighbour') },
                      { key: 'gate',      label: tr('auto.sendPackage.leaveAtGate', 'Leave at gate') },
                      { key: 'store',     label: tr('auto.sendPackage.dropAtPartnerStore', 'Drop at partner store') },
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
                      {tr('auto.sendPackage.highValuePackagesCannotBe', 'High-value packages cannot be left at the gate or with a neighbour.')}
                    </Text>
                  )}
                  {s.fallbackPref === 'neighbour' && (
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                      value={s.fallbackNeighbourName ?? ''}
                      onChangeText={(v) => updateStop(i, { fallbackNeighbourName: v })}
                      onFocus={handleFieldFocus}
                    placeholder={tx('auto.sendPackage.neighbourOrSecuritySName', 'Neighbour or security\'s name')}
                      placeholderTextColor={colors.textThird}
                    />
                  )}

                  <Text style={[styles.label, { color: colors.textSecond }]}>{tr('auto.sendPackage.packageValueInNgnOptional', 'Package value in NGN (optional)')}</Text>
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
                    {tr('auto.sendPackage.highValuePackagesGetId', 'High-value packages get ID-verified handoff.')}
                  </Text>

                  <Text style={[styles.label, { color: colors.textSecond }]}>{tr('auto.sendPackage.howToFindThisSpot', 'How to find this spot, and anything else the rider should know (optional)')}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                    value={s.note ?? ''}
                    onChangeText={(v) => updateStop(i, { note: v })}
                    onFocus={handleFieldFocus}
                    placeholder={tx('auto.sendPackage.eGBlueGateOpposite', 'e.g. Blue gate opposite Zenith Bank. Call when you reach.')}
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
                    <Text style={[styles.addBtnText, { color: colors.accent }]}>{tx('auto.sendPackage.addAnotherPackage', 'Add another package')}</Text>
                  </Pressable>
                  <Text style={[styles.capNote, { color: colors.textThird }]}>
                    {draft.stops.length} package{draft.stops.length === 1 ? '' : 's'} so far
                    {totalWeight > 0 ? ` · ${totalWeight}kg` : ''}{tr('auto.sendPackage.weSuggestTheRightVehicle', '. We suggest the right vehicle next.')}
                  </Text>
                </>
              ) : (
                <Text style={[styles.capNote, { color: colors.textSecond }]}>
                  {absoluteMaxPackages} {tr('auto.sendPackage.packagesIsTheMostA', 'packages is the most a single run can carry. Book the rest as a second run.')}
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
                {tr('auto.sendPackage.howDoWeGetThe', 'How do we get the packages?')} <Text style={{ color: '#DC2626' }}>*</Text>
              </Text>
              {([
                { key: 'door',  title: tr('auto.sendPackage.aDriverCollectsFromMe', 'A driver collects from me'), sub: tr('auto.sendPackage.driverComesToYourAddress', 'Driver comes to your address'), icon: 'Bike' },
                // Founder 2026-08-16: say what actually happens, not what
                // it costs. "Cheaper" is a claim; this is the instruction.
                { key: 'store', title: tr('auto.sendPackage.iLlDropThemAt', 'I\'ll drop them at a counter'), sub: tr('auto.sendPackage.youDropThemOffA', 'You drop them off, a driver collects from the counter'), icon: 'Store' },
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
                {draft.pickupMode === 'store' ? tx9('auto.sendPackage.findACounterNear', 'Find a counter near') : tx9('auto.sendPackage.pickupAddress', 'Pickup address')} <Text style={{ color: '#DC2626' }}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                value={pickupQuery}
                onChangeText={onChangePickup}
                onFocus={(e) => { setActiveField({ kind: 'pickup' }); handleFieldFocus(e, 260); }}
                placeholder={draft.pickupMode === 'store'
                  ? tx9('auto.sendPackage.searchAPlaceEG', 'Search a place, e.g. Yaba')
                  : tx9('auto.sendPackage.whereTheDriverCollectsEverything', 'Where the driver collects everything')}
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
                          {tr('auto.sendPackage.hoursPhoneAndDirections', 'Hours, phone and directions')}
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
                        <Text style={[styles.changeTxt, { color: colors.primary }]}>{tx('auto.sendPackage.change', 'Change')}</Text>
                      </Pressable>
                    </Pressable>
                  ) : nearbyBusy[-1] ? (
                    <ActivityIndicator color={colors.accent} style={{ paddingVertical: 12 }} />
                  ) : (nearby[-1]?.length ?? 0) > 0 ? (
                    <>
                      <Text style={[styles.hint, { color: colors.textThird }]}>
                        {nearby[-1].length} counter{nearby[-1].length === 1 ? '' : 's'} {tr('auto.sendPackage.nearYouTapTheOne', 'near you. Tap the one you will drop at.')}
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
                        ? tx9('auto.sendPackage.noCounterNearThatArea', 'No counter near that area yet. A driver can collect from you instead.')
                        : tx9('auto.sendPackage.typeAPlaceNearbyAnd', 'Type a place nearby and we will show the counters you can drop at.')}
                    </Text>
                  )}
                </View>
              )}

              <Pressable style={styles.useLocRow} onPress={useMyLocation}>
                <Icon name="MapPin" size={16} color={colors.accent} />
                <Text style={[styles.useLocTxt, { color: colors.accent }]}>{tx('auto.sendPackage.useMyCurrentLocation', 'Use my current location')}</Text>
              </Pressable>

              {/* When: two real option cards, not two anonymous pills
                  (founder 2026-08-16: "it should be more visible and
                  properly designed so they can see it"). */}
              <Text style={[styles.label, { color: colors.textSecond, marginTop: 14 }]}>{tx('auto.sendPackage.whenShouldTheDriverCome', 'When should the driver come?')}</Text>
              {([
                { now: true,  title: tr('auto.sendPackage.sendNow', 'Send now'),      sub: tr('auto.sendPackage.weMatchADriverStraight', 'We match a driver straight away'), icon: 'Zap' },
                { now: false, title: tr('auto.sendPackage.scheduleIt', 'Schedule it'),   sub: tr('auto.sendPackage.pickAPickupHourToday', 'Pick a pickup hour, today or tomorrow'), icon: 'Clock' },
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
                  <Text style={[styles.label, { color: colors.textSecond, marginTop: 0 }]}>{tr('auto.sendPackage.day', 'Day')}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {([
                      { key: 0, label: tr('auto.wallet.today', 'Today') },
                      { key: 1, label: tr('auto.sendPackage.tomorrow', 'Tomorrow') },
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

                  <Text style={[styles.label, { color: colors.textSecond }]}>{tx('auto.sendPackage.pickupHour', 'Pickup hour')}</Text>
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
                      ? tx9('auto.sendPackage.pickAnHourToContinue', 'Pick an hour to continue.')
                      /* The sender picked a PICKUP hour, not an arrival. Said
                         as "Driver arrives" it read as a delivery promise,
                         which Lagos traffic turns into a refund (B-6.2). */
                      : tx9('auto.sendPackage.pickupIsBookedForAround', 'Pickup is booked for {{v0}}, around {{v1}}.', { v0: scheduledDayOffset === 0 ? 'today' : 'tomorrow', v1: TIME_SLOTS.find(t => t.hour === scheduledHour)?.label })}
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
                            <Text style={styles.recTxt}>{tx('auto.sendPackage.recommended', 'Recommended')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.vehSub, { color: colors.textSecond }]}>
                        {disabled
                          ? overKm ? tx9('auto.sendPackage.underKmTripsOnly', 'Under {{maxKm}}km trips only', { maxKm })
                          : overCount ? tx9('auto.sendPackage.maxPackages', 'Max {{cap}} packages', { cap }) : tx9('auto.sendPackage.maxKg', 'Max {{payload}}kg', { payload })
                          : tx9('auto.sendPackage.upToPackages', 'Up to {{cap}} packages{{v1}}', { cap, v1: payload > 0 ? ` · ${payload}kg payload` : '' })}
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
                    <Marker coordinate={pickupPoint} title={tx('auto.sendPackage.pickup', 'Pickup')} anchor={{ x: 0.5, y: 0.5 }}>
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
                    accessibilityLabel={tx('auto.sendPackage.openTheMapFullScreen', 'Open the map full screen')}
                  />
                  <View style={[styles.expandChip, { backgroundColor: colors.surface }]}>
                    <Icon name="Maximize2" size={13} color={colors.text} />
                    <Text style={[styles.mapBadgeTxt, { color: colors.text }]}>{tx('auto.sendPackage.tapToExpand', 'Tap to expand')}</Text>
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
                <Text style={[styles.sumTitle, { color: colors.text }]}>{tx('auto.sendPackage.route', 'Route')}</Text>
                <Text style={[styles.sumLine, { color: colors.textSecond }]} numberOfLines={2}>
                  {draft.pickupMode === 'store' && draft.pickupStoreName
                    ? tx9('auto.sendPackage.youDropAtDriverCollects', 'You drop at {{pickupStoreName}} · driver collects there', { pickupStoreName: draft.pickupStoreName })
                    : `From ${draft.pickupAddress || '…'}`}
                </Text>
                <Text style={[styles.sumLine, { color: colors.textSecond }]}>
                  {draft.stops.length} drop{draft.stops.length === 1 ? '' : 's'} · {route.distanceText ?? `~${routeKm}km`} · {VEHICLE_LABEL[draft.vehicleType]}
                  {scheduleNow ? tx9('auto.sendPackage.sendNow2', '· Send now') : ` · ${TIME_SLOTS.find(t => t.hour === scheduledHour)?.label ?? ''}`}
                </Text>
              </View>

              <View style={[styles.sumCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sumTitle, { color: colors.text }]}>{tx('auto.sendPackage.packages', 'Packages')}</Text>
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
                        {packageLines ? naira(packageLines[i]) : '…'}
                      </Text>
                      <Icon name={expandedPkg === i ? 'ChevronUp' : 'ChevronDown'} size={15} color={colors.textThird} />
                    </Pressable>
                    {expandedPkg === i && (
                      <View style={{ paddingLeft: 56, paddingBottom: 8, gap: 3 }}>
                        {([
                          [tx9('auto.DeliveryTrackMap.dropOff', 'Drop-off'), s.address || '-'],
                          [tx9('auto.sendPackage.receiver', 'Receiver'), `${[s.receiverFirstName, s.receiverLastName].filter(Boolean).join(' ') || s.recipientName || '-'} · ${s.recipientPhone || '-'}`],
                          [tx9('auto.sendPackage.weight', 'Weight'), `${s.weightKg || '-'}kg`],
                          [tx9('auto.sendPackage.category', 'Category'), catalog.find(c => c.code === (s.categoryCode ?? draft.categoryCode))?.name ?? '-'],
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
                            <Text style={[styles.lineSub, { color: '#DC2626', fontWeight: '600' }]}>{tx('auto.sendPackage.removeThisPackage', 'Remove this package')}</Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                ))}
                {!!quoteError && (
                  <Pressable onPress={() => setQuoteReloadKey((k) => k + 1)} style={styles.quoteErrBox}>
                    <Text style={styles.quoteErrTxt}>{quoteError} {tr('auto.sendPackage.tapToTryAgain', 'Tap to try again.')}</Text>
                  </Pressable>
                )}
                {/* Refused, not failed. Shown where the price would be, so a
                    trader learns it while reviewing rather than at the pay
                    button, and lands in the lane built for exactly this. */}
                {needsQuote && (
                  <Pressable
                    onPress={() => router.push('/(business)/special-request' as any)}
                    style={[styles.needsQuote, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
                  >
                    <Icon name="Truck" size={20} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.needsQuoteTitle, { color: colors.text }]}>
                        {tr('auto.sendPackage.thisLoadNeedsAQuote', 'This load needs a quote from us')}
                      </Text>
                      <Text style={[styles.needsQuoteBody, { color: colors.textSecond }]}>
                        {tr('auto.sendPackage.aGeneratorATransformerAnything', 'A generator, a transformer, anything needing lifting hands: priced by a person, not automatically, so we do not guess at it. Tell us about it and we will call you with a full breakdown.')}
                      </Text>
                    </View>
                    <Icon name="ChevronRight" size={18} color={colors.primary} />
                  </Pressable>
                )}
                {Number(quote?.customer?.partnerHandling ?? 0) > 0 && (
                  <View style={styles.lineRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.lineName, { color: colors.text }]} numberOfLines={1}>
                        {tr('auto.sendPackage.partnerCounterHandling', 'Partner counter handling')}
                      </Text>
                      <Text style={[styles.lineSub, { color: colors.textThird }]} numberOfLines={2}>
                        {tr('auto.sendPackage.paidToTheCounterFor', 'Paid to the counter for every parcel it takes in or hands over.')}
                      </Text>
                    </View>
                    <Text style={[styles.linePrice, { color: colors.textSecond }]}>
                      {naira(quote.customer.partnerHandling)}
                    </Text>
                  </View>
                )}
                <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.totalLabel, { color: colors.text }]}>{tr('auto.sendPackage.totalOnePayment', 'Total · one payment')}</Text>
                  <Text style={[styles.totalValue, { color: colors.primary }]}>
                    {quote?.customer?.total != null
                      ? naira(quote.customer.total)
                      : '…'}
                  </Text>
                </View>
                <Text style={[styles.capNote, { color: colors.textThird }]}>
                  {tr('auto.sendPackage.finalFareUsesTheRoad', 'Final fare uses the road distance at booking. Every package gets its own tracking code for its receiver.')}
                </Text>
              </View>

              {/* Run-level Order Summary, ported from the customer's hybrid
                  review at the founder's request, payment row omitted. */}
              <View style={[styles.sumCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sumTitle, { color: colors.text }]}>{tx('auto.sendPackage.orderSummary', 'Order Summary')}</Text>
                {/* Who this load is going to, when it came from Cargo Space. */}
                {postToTripId && (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 8 }}>
                    <Icon name="Truck" size={15} color={colors.primary} />
                    <Text style={[styles.lineSub, { color: colors.textSecond, fontSize: 13, flex: 1 }]}>
                      {tr('auto.sendPackage.offeredFirstToThe', 'Offered first to the')} {postToTripLabel ?? 'selected'} {tr('auto.sendPackage.tripTheDriverCanAccept', 'trip. The driver can accept or decline, and you are refunded in full if nobody takes it.')}
                    </Text>
                  </View>
                )}
                {([
                  [tx9('auto.DeliveryTrackMap.pickup', 'Pickup'), draft.pickupMode === 'store' && draft.pickupStoreName
                    ? `${draft.pickupStoreName} (counter)` : (draft.pickupAddress || '-')],
                  [tx9('auto.sendPackage.packages', 'Packages'), `${draft.stops.length} package${draft.stops.length === 1 ? '' : 's'}`],
                  [tx9('auto.sendPackage.distance', 'Distance'), route.distanceText ?? `~${routeKm}km`],
                  [tx9('auto.sendPackage.vehicle', 'Vehicle'), VEHICLE_LABEL[draft.vehicleType] ?? draft.vehicleType],
                  [tx9('auto.sendPackage.when', 'When'), scheduleNow ? tx9('auto.sendPackage.sendNow', 'Send now') : (TIME_SLOTS.find(t => t.hour === scheduledHour)?.label ?? '-')],
                  ...(Number(quote?.customer?.serviceFee ?? 0) > 0
                    ? [[tx9('auto.sendPackage.serviceFee', 'Service fee'), naira(quote!.customer.serviceFee)] as [string, string]]
                    : []),
                  /**
                   * Name the geography, and what it cost (2026-08-31).
                   *
                   * This app showed NOTHING about the state tier: a
                   * Lagos to Abuja run came back up to 40% above a local
                   * one with no line explaining it, which for a business
                   * sender reconciling invoices is a support ticket
                   * waiting to happen. Both rows appear only when the
                   * engine actually charged a tier.
                   */
                  ...((quote as any)?.route?.zoneTier
                      && Number((quote as any)?.route?.tierSurchargeNgn) > 0
                    ? ([
                        [tx9('auto.sendPackage.route', 'Route'),
                         `${(quote as any).route.pickupStateName ?? (quote as any).route.pickupStateCode} to ${(quote as any).route.dropoffStateName ?? (quote as any).route.dropoffStateCode}`],
                        [ZONE_TIER_LABEL[(quote as any).route.zoneTier] ?? tx9('auto.sendPackage.distanceSurcharge', 'Distance surcharge'),
                         naira(Number((quote as any).route.tierSurchargeNgn))],
                      ] as [string, string][])
                    : []),
                  [tx9('auto.id.total', 'Total'), quote?.customer?.total != null ? naira(quote.customer.total) : '…'],
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
                  {tr('auto.sendPackage.iAgreeToTheSeirs', 'I agree to the SEIRS Terms of Service, including what happens if a delivery fails.')}{' '}
                  <Text
                    style={{ color: colors.primary, fontWeight: '600' }}
                    onPress={() => Linking.openURL(TERMS_URL)}
                  >
                    {tr('auto.recurring.readThem', 'Read them')}
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
                      <Text style={[styles.sheetLabel, { color: colors.textThird }]}>{tx('auto.sendPackage.openingHours', 'Opening hours')}</Text>
                      <Text style={[styles.sheetValue, { color: colors.text }]}>
                        {storeSheet.openTime && storeSheet.closeTime
                          ? `${storeSheet.openTime} - ${storeSheet.closeTime}`
                          : tx9('auto.sendPackage.notProvided', 'Not provided')}
                      </Text>
                      <Text style={[styles.sheetValue, { color: colors.textSecond }]}>
                        {storeSheet.operatingDays?.length
                          ? storeSheet.operatingDays.map((d) => String(d).slice(0, 3)).join(', ')
                          : tx9('auto.sendPackage.daysNotProvided', 'Days not provided')}
                      </Text>
                      <Text style={[styles.sheetValue, { color: storeSheet.isOpenNow ? '#16A34A' : '#DC2626' }]}>
                        {storeSheet.isOpenNow ? tx9('auto.sendPackage.openRightNow', 'Open right now') : tx9('auto.sendPackage.closedRightNow', 'Closed right now')}
                      </Text>
                    </View>
                  </View>

                  {!!storeSheet.phone && (
                    <View style={[styles.sheetRow, { borderTopColor: colors.border }]}>
                      <Icon name="Phone" size={16} color={colors.textThird} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.sheetLabel, { color: colors.textThird }]}>{tx('auto.sendPackage.counterPhone', 'Counter phone')}</Text>
                        <Text style={[styles.sheetValue, { color: colors.text }]}>{storeSheet.phone}</Text>
                      </View>
                      <Pressable
                        style={[styles.sheetBtn, { backgroundColor: colors.surfaceSecond }]}
                        onPress={() => Linking.openURL(`tel:${storeSheet.phone}`)}
                      >
                        <Text style={[styles.sheetBtnTxt, { color: colors.primary }]}>{tr('auto.sendPackage.call', 'Call')}</Text>
                      </Pressable>
                    </View>
                  )}

                  {storeSheet.distanceKm != null && (
                    <View style={[styles.sheetRow, { borderTopColor: colors.border }]}>
                      <Icon name="MapPin" size={16} color={colors.textThird} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.sheetLabel, { color: colors.textThird }]}>{tx('auto.sendPackage.distance', 'Distance')}</Text>
                        <Text style={[styles.sheetValue, { color: colors.text }]}>
                          {storeSheet.distanceKm < 1 ? tx9('auto.sendPackage.under1kmAway', 'Under 1km away') : `${storeSheet.distanceKm}km away`}
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
                        {copied ? tx9('auto.sendPackage.addressCopied', 'Address copied') : tx9('auto.sendPackage.copyAddress', 'Copy address')}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.sheetAction, { backgroundColor: colors.primary }]}
                      onPress={() => setStoreSheet(null)}
                    >
                      <Text style={[styles.sheetActionTxt, { color: '#fff' }]}>{tr('auto.editDeliveryDetail.done', 'Done')}</Text>
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
                <Marker coordinate={pickupPoint} title={draft.pickupStoreName ?? tx9('auto.DeliveryTrackMap.pickup', 'Pickup')} description={draft.pickupAddress} anchor={{ x: 0.5, y: 0.5 }}>
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
                P {draft.pickupMode === 'store' ? tx9('auto.sendPackage.dropAt', '· drop at {{v0}}', { v0: draft.pickupStoreName ?? 'counter' }) : tx9('auto.sendPackage.pickup2', '· pickup')}
                {'   '}
                {dropPoints.map((_, i) => `${i + 1}`).join('  ')} · {dropPoints.length} drop{dropPoints.length === 1 ? '' : 's'}
              </Text>
              <Text style={[styles.mapLegendSub, { color: colors.textThird }]}>
                {/* Kilometres only, same as the collapsed map above. The
                    expanded legend was still printing the Google ETA and
                    broke the rule the thumbnail states (B-6.1). */}
                {route.distanceText ?? `~${routeKm}km`}
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
          {/* Colour moved out of the StyleSheet because it has to know the
              theme. '#EF444418' is a 9% red that composites to a pinkish
              grey over the cream light background, and this is the banner
              that tells a sender WHY their booking was refused, on the
              last screen before payment (2026-08-24). */}
          {!!error && (
            <View style={[styles.footerError, { backgroundColor: tint('red', isDark).bg }]}>
              <Icon name="AlertCircle" size={15} color={tint('red', isDark).fg} />
              <Text style={[styles.footerErrorText, { color: tint('red', isDark).fg }]}>{error}</Text>
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
                      ? `Pay ${naira(quote.customer.total)}`
                      : tx9('auto.sendPackage.bookThisRun', 'Book this run'))
                  : tx9('auto.releasePickup.continue', 'Continue')}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Start over (header) and the saved-draft strip (step 1), 2026-09-06.
  startOverBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  startOverText: { fontSize: 12, fontWeight: '600' },
  resumeStrip:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  resumeTitle:   { fontSize: 14, fontWeight: '700' },
  resumeSub:     { fontSize: 12, lineHeight: 17, marginTop: 2 },
  resumeBtn:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  resumeBtnText: { fontSize: 12, fontWeight: '700' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  backBtn:  { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 1 },
  dots:     { flexDirection: 'row', gap: 4 },
  dot:      { width: 8, height: 8, borderRadius: 4 },
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
  // The pricing refusal, shown where the price would be.
  needsQuote:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1,
                     borderRadius: 14, padding: 14, marginTop: 10 },
  needsQuoteTitle: { fontSize: 15, fontWeight: '700' },
  needsQuoteBody:  { fontSize: 13, lineHeight: 18, marginTop: 3 },
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
    borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10,
  },
  footerErrorText: { flex: 1, fontSize: 14, fontWeight: '600' },
  cta:     { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
