import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, StatusBar, TextInput,
  ActivityIndicator, Image, Alert, Keyboard, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Calendar as RNCalendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { deliveriesApi, uploadApi, mapsApi, feesApi, configApi } from '@/services/api';
import type { ServiceCategory } from '@/services/api';
import { useSendDraftStore } from '@/store/useSendDraftStore';
import { type PickedAddress } from '@/components/AddressPicker';
import { useDirectionsPolyline } from '@/components/useDirectionsPolyline';
import { DEFAULT_MAP_REGION } from '@/constants/mockData';
import { Illustration } from '@/components/Illustration';
import {
  ArrowLeft, ArrowRight, Truck, Calendar, CreditCard,
  Camera, X, CheckCircle, Zap, Moon, MapPin, Store,
} from 'lucide-react-native';

// Places and geocoding go through our backend (security review
// 2026-08-12): the Google key is no longer shipped inside the app.

// ─── Data ─────────────────────────────────────────────────────────────────────
// Category labels are looked up at render via t(`send.${labelKey}`) so
// language switches reflect live without restarting the form.
// 16 categories matching seirs-pricing-spec.html. Each maps to a
// rateCard.categories entry that controls % surcharge + forbidden vehicles.
const PACKAGE_CATEGORIES = [
  { id: 'documents',         labelKey: 'categoryDocuments'       },
  { id: 'small_parcel',      labelKey: 'categorySmallParcel'     },
  { id: 'standard_parcel',   labelKey: 'categoryStandardParcel'  },
  { id: 'fragile',           labelKey: 'categoryFragile'         },
  { id: 'food_hot',          labelKey: 'categoryFoodHot'         },
  { id: 'food_cold',         labelKey: 'categoryFoodCold'        },
  { id: 'medical',           labelKey: 'categoryMedical'         },
  { id: 'bulk_goods',        labelKey: 'categoryBulkGoods'       },
  { id: 'farm_produce',      labelKey: 'categoryAgricultural'    },
  { id: 'building',          labelKey: 'categoryBuilding'        },
  { id: 'lumber',            labelKey: 'categoryLumber'          },
  { id: 'house_move_single', labelKey: 'categoryHouseMoveSingle' },
  { id: 'house_move_full',   labelKey: 'categoryHouseMoveFull'   },
  { id: 'live_animals',      labelKey: 'categoryLiveAnimals'     },
  { id: 'industrial',        labelKey: 'categoryIndustrial'      },
  { id: 'other',             labelKey: 'categoryOther'           },
] as const;
type CategoryId = typeof PACKAGE_CATEGORIES[number]['id'];

import { PACKAGE_VEHICLES, calcPackageFare } from '@/constants/mockData';
import { getActiveRateCard } from '@/hooks/use-rate-card';

const VEHICLES = PACKAGE_VEHICLES;
type VehicleId = typeof PACKAGE_VEHICLES[number]['id'];

/**
 * Customers pay by card or bank transfer. Nothing else.
 *
 * "SEIRS Wallet" was listed here and must not be (founder 2026-08-13):
 * customers do not hold a naira balance with us. Holding customer funds
 * is a licensed activity under CBN rules and we are not licensed for it.
 * What customers have is Rewards, which is points, and points never pay
 * a fare. The driver and partner ledgers are a different thing entirely,
 * and are real money owed for work done.
 *
 * Cash on delivery is also gone: we are not running COD at launch.
 */
const PAYMENT_METHODS = [
  { id: 'card',          labelKey: 'payCard'         },
  { id: 'bank_transfer', labelKey: 'payBankTransfer' },
] as const;
type PaymentId = typeof PAYMENT_METHODS[number]['id'];

// 5 steps total: Address + Schedule are combined ("when & where" in one screen).
// Labels resolved via t(`send.step${cap}`) at render.
const STEPS = ['Package', 'Pickup', 'Vehicle', 'Review'] as const;
const STEP_KEYS = ['stepPackage', 'stepAddress', 'stepVehicle', 'stepReview'] as const;

function autoRecommend(cat: CategoryId, kg: number): VehicleId {
  if (cat === 'documents') return 'bicycle';
  if ((cat === 'food_hot' || cat === 'small_parcel') && kg <= 20) return 'motorcycle';
  if (cat === 'food_cold' && kg <= 800)               return 'van';      // cold chain: van only
  if (cat === 'medical')                              return kg <= 200 ? 'car' : 'van';
  if (cat === 'fragile' && kg <= 100)                 return 'keke';
  if (cat === 'standard_parcel' && kg <= 100)         return 'keke';
  if (cat === 'farm_produce' || cat === 'building')   return 'truck_sm';
  if (cat === 'bulk_goods')                           return kg <= 800 ? 'van' : 'truck_sm';
  if (cat === 'industrial')                           return kg <= 800 ? 'van' : 'truck_sm';
  if (cat === 'lumber')                               return 'truck_lg';
  if (cat === 'live_animals')                         return kg <= 800 ? 'van' : 'truck_sm';
  if (cat === 'house_move_single')                    return kg <= 800 ? 'van' : 'truck_sm';
  if (cat === 'house_move_full')                      return 'truck_lg';
  if (cat === 'other') { /* fall through to weight-based */ }
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

// Scheduled pickups run 24/7 (founder 2026-08-11: Lagos and Kano never
// sleep; drivers self-select via the online toggle). Slots in the
// night window carry a surcharge that goes to the driver in full; the
// percentage and window hours are admin-editable Fee Catalogue rows
// (night_fee_pct, night_window_start_hour, night_window_end_hour).
const NIGHT_START = 21; // display fallback; server reads the catalogue
const NIGHT_END   = 5;
const TIME_SLOTS = Array.from({ length: 24 }, (_, hour) => {
  const label = hour === 0
    ? '12 AM'
    : hour < 12
      ? `${hour} AM`
      : hour === 12
        ? '12 PM'
        : `${hour - 12} PM`;
  const night = hour >= NIGHT_START || hour < NIGHT_END;
  return { hour, label, night };
});

const TODAY_ISO       = new Date().toISOString().slice(0, 10);
// Matches the server cap (create() rejects anything past 7 days).
const MAX_BOOK_AHEAD  = (() => {
  const d = new Date(); d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
})();

function calcFare(
  vid: VehicleId,
  distKm: number,
  kg: number,
  opts: Parameters<typeof calcPackageFare>[3] = {},
) {
  // Delegates to the rate-card calculator so admin can edit prices
  // without touching screen code. Returns base + dist + weight + handling
  // + categorySurcharge + timeSurcharge + zoneSurcharge + codFee + service + VAT.
  return calcPackageFare(vid, distKm, kg, opts);
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
  const [step,        setStep]        = useState(0);
  const [photos,      setPhotos]      = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [category,    setCategory]    = useState<CategoryId | null>(null);
  const [weightKg,    setWeightKg]    = useState('');
  // Free-text instructions for the driver ("call at gate", "security
  // code 4231"). Auto-posted into the chat as a system message when a
  // driver is assigned so it is impossible to miss.
  const [instructions, setInstructions] = useState('');
  // Sender-declared package value (optional). At/above the catalogue
  // high-value threshold the driver must ID-verify the recipient.
  const [declaredValue, setDeclaredValue] = useState('');
  // Receiver system (founder 2026-08-11): who collects + fallback plan.
  const [receiverFirst,  setReceiverFirst]  = useState('');
  const [receiverLast,   setReceiverLast]   = useState('');
  const [receiverPhone,  setReceiverPhone]  = useState('');
  // Above this declared value the recipient must show physical ID, and
  // gate/neighbour drop-off is refused. The number is policy, so it
  // comes from the Fee Catalogue (high_value_threshold_ngn) rather
  // than a constant that silently drifts when admin edits it.
  const [highValueNgn,   setHighValueNgn]   = useState(100000);
  // Service catalogue drives the category chips. Business does the
  // same (configApi.serviceCatalog), which is why its chips carry
  // short admin-editable names instead of long baked-in labels.
  const [catalog,        setCatalog]        = useState<ServiceCategory[]>([]);

  // Draft persistence. Everything on this screen used to live in useState
  // alone, so backing out (or tapping "To a partner store", or taking a
  // call) threw the whole form away. The business app has persisted its
  // draft since its rebuild; this is the customer equivalent.
  const { draft, patchDraft, clearDraft, hasContent } = useSendDraftStore();
  const hydrated = useRef(false);
  // Where is it going? Business asks this per package on step 1
  // (destinationMode) instead of hiding store drop behind a banner.
  const [destMode,       setDestMode]       = useState<'address' | 'store'>('address');
  const [fallbackPref,   setFallbackPref]   = useState<'hand_only' | 'neighbour' | 'gate' | 'store'>('hand_only');
  const [neighbourName,  setNeighbourName]  = useState('');
  const [pickup,      setPickup]      = useState<PickedAddress | null>(null);
  const [dropoff,     setDropoff]     = useState<PickedAddress | null>(null);
  const [vehicleId,   setVehicleId]   = useState<VehicleId>('motorcycle');
  const [scheduleNow,   setScheduleNow]   = useState(true);
  // ISO date string ('YYYY-MM-DD'): driven by the inline calendar.
  const [scheduledDate, setScheduledDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [scheduledHour, setScheduledHour] = useState<number | null>(null);
  // Card is the default. This was 'wallet', which is why the confirm
  // step showed "SEIRS Wallet" as the chosen method on every booking.
  const [paymentId,   setPaymentId]   = useState<PaymentId>('card');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  /**
   * Field-level validation (founder 2026-08-13: "when a field is missing
   * it should auto scroll to the field and mark as red with the
   * instruction there").
   *
   * A red banner at the top of a long scrolling sheet tells you
   * something is wrong but not where, which on a phone means hunting.
   * We now mark the offending field, put the instruction directly under
   * it, and scroll it into view.
   *
   * fieldY records each field's offset inside the scroll view via
   * onLayout, so scrolling does not depend on measuring native handles.
   */
  const [invalidField, setInvalidField] = useState<string | null>(null);
  const scrollRef = useRef<any>(null);
  const fieldY    = useRef<Record<string, number>>({});

  const onFieldLayout = (key: string) => (e: any) => {
    fieldY.current[key] = e.nativeEvent.layout.y;
  };

  // Flag the field, say why, and bring it on screen. Offset lifts the
  // field clear of the sheet's rounded top edge.
  const failField = (key: string, message: string) => {
    setInvalidField(key);
    setError(message);
    const y = fieldY.current[key];
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
    }
  };

  // Border + inline message for whichever field is currently flagged.
  const fieldBorder = (key: string) =>
    invalidField === key ? theme.error : theme.border;

  // Cash on delivery is OFF at launch (founder 2026-08-13). Kept as a
  // constant rather than deleted so the fare breakdown and the booking
  // payload keep their shape; flip to state if COD is ever switched on.
  const codEnabled = false;
  const codAmount  = '';

  // Inline autocomplete state for the address step.
  const [pickupQuery,  setPickupQuery]  = useState('');
  const [dropoffQuery, setDropoffQuery] = useState('');
  const [activeField,  setActiveField]  = useState<Field | null>(null);
  const [predictions,  setPredictions]  = useState<Prediction[]>([]);
  const [searching,    setSearching]    = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    if (!hasContent()) return;
    setStep(draft.step ?? 0);
    setPhotos(draft.photos ?? []);
    setDescription(draft.description ?? '');
    setCategory((draft.category as CategoryId | null) ?? null);
    setWeightKg(draft.weightKg ?? '');
    setInstructions(draft.instructions ?? '');
    setDeclaredValue(draft.declaredValue ?? '');
    setReceiverFirst(draft.receiverFirst ?? '');
    setReceiverLast(draft.receiverLast ?? '');
    setReceiverPhone(draft.receiverPhone ?? '');
    setDestMode(draft.destMode ?? 'address');
    setFallbackPref(draft.fallbackPref ?? 'hand_only');
    setNeighbourName(draft.neighbourName ?? '');
    if (draft.pickup)  { setPickup(draft.pickup);   setPickupQuery(draft.pickupQuery ?? ''); }
    if (draft.dropoff) { setDropoff(draft.dropoff); setDropoffQuery(draft.dropoffQuery ?? ''); }
    if (draft.vehicleId)     setVehicleId(draft.vehicleId as VehicleId);
    if (draft.scheduledDate) setScheduledDate(draft.scheduledDate);
    setScheduleNow(draft.scheduleNow ?? true);
    setScheduledHour(draft.scheduledHour ?? null);
    if (draft.paymentId) setPaymentId(draft.paymentId as PaymentId);
  // Intentionally mount-only: re-running would fight the user's typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the form into the persisted draft. Only after hydration, or the
  // first render would immediately overwrite the saved draft with blanks.
  useEffect(() => {
    if (!hydrated.current) return;
    patchDraft({
      step, photos, description, category, weightKg, instructions,
      declaredValue, receiverFirst, receiverLast, receiverPhone,
      destMode, fallbackPref, neighbourName,
      pickup, dropoff, pickupQuery, dropoffQuery,
      vehicleId, scheduleNow, scheduledDate, scheduledHour, paymentId,
    });
  }, [
    step, photos, description, category, weightKg, instructions,
    declaredValue, receiverFirst, receiverLast, receiverPhone,
    destMode, fallbackPref, neighbourName,
    pickup, dropoff, pickupQuery, dropoffQuery,
    vehicleId, scheduleNow, scheduledDate, scheduledHour, paymentId,
    patchDraft,
  ]);

    configApi.serviceCatalog()
      .then(c => { if (Array.isArray(c) && c.length) setCatalog(c); })
      .catch(() => { /* fall back to PACKAGE_CATEGORIES below */ });
    feesApi.get('high_value_threshold_ngn')
      .then(r => { const v = Number(r?.value); if (v > 0) setHighValueNgn(v); })
      .catch(() => { /* keep the 100000 fallback, same as the backend's */ });
  }, []);

  const mapRef   = useRef<MapView>(null);

  // Real road-following polyline + km + ETA
  const { coords: routeCoords, distanceText, durationText, distanceMeters } = useDirectionsPolyline(
    pickup  ? { latitude: pickup.lat,  longitude: pickup.lng  } : null,
    dropoff ? { latitude: dropoff.lat, longitude: dropoff.lng } : null,
  );

  /**
   * Distance for the quote, from the hook's numeric field (audit
   * 2026-08-14).
   *
   * This regexed the first number out of the human-readable distance
   * string, which is a display format and mis-parses both ways:
   *   "850 m"    -> 850, so any sub-kilometre drop was quoted as 850 km
   *   "1,234 km" -> 1, because the match stops at the thousands comma
   * The metres case is the common one: short hops format that way.
   *
   * The old fallback of 7 was worse than the parse bug. Before a route
   * resolves there is no distance, and inventing an average-looking one
   * quotes a price for a trip nobody described. 0 means the quote shows
   * the base fare until the route arrives.
   */
  const distKmRoute = distanceMeters != null ? distanceMeters / 1000 : 0;
  const kg   = parseFloat(weightKg) || 0;
  const codAmountNgn = codEnabled ? (Number(codAmount) || 0) : 0;
  const pickupCoords  = pickup  ? { latitude: pickup.lat,  longitude: pickup.lng  } : null;
  const dropoffCoords = dropoff ? { latitude: dropoff.lat, longitude: dropoff.lng } : null;
  // Safety hard-stops stay bundled in the rate card on purpose, so read
  // them from the active card rather than duplicating a list here.
  const forbiddenForCategory: string[] = category
    ? ((getActiveRateCard().categories as any)?.[category]?.forbiddenVehicles ?? [])
    : [];

  const fare = calcFare(vehicleId, distKmRoute, kg, {
    categoryId: category, codAmountNgn,
    pickupCoords, dropoffCoords,
  });

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
      const json = await mapsApi.placeDetails(p.place_id, 'geometry,formatted_address');
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
        const j = await mapsApi.geocode({ latlng: `${lat},${lng}` });
        address = j.results?.[0]?.formatted_address ?? address;
      } catch {}
      const picked: PickedAddress = { address, lat, lng };
      if (field === 'pickup') { setPickup(picked); setPickupQuery(address); }
      else                    { setDropoff(picked); setDropoffQuery(address); }
      setPredictions([]);
      setActiveField(null);
      Keyboard.dismiss();
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
      Alert.alert(t('send.alertPermissionTitle'), t('send.alertPermissionBody'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setPhotos(p => [...p, result.assets[0].uri]);
    }
  };

  // ── Step navigation ──────────────────────────────────────────────────────
  const next = () => {
    if (step === 0 && photos.length === 0) { failField('photos',   t('send.errPhotoMissing'));    return; }
    if (step === 0 && !category)           { failField('category', t('send.errCategoryMissing')); return; }
    // Weight is REQUIRED (founder 2026-08-12): the driver picks a
    // vehicle from it, so a blank weight means a rider turning up to a
    // load their okada cannot carry. An estimate is fine, silence is not.
    if (step === 0 && !(parseFloat(weightKg) > 0)) {
      failField('weight', t('send.errWeightMissing', { defaultValue: 'Enter the weight in kg. An estimate is fine: your driver picks the right vehicle from it.' }));
      return;
    }
    // Receiver's first name is REQUIRED (founder 2026-08-13). The driver
    // confirms a name at handoff, so "optional" meant a driver arriving
    // with nobody to ask for, and a package that can be claimed by
    // whoever answers the door. Surname stays optional: one name is
    // enough to confirm against, and many people give only one.
    if (step === 0 && !receiverFirst.trim()) {
      failField('receiver', t('send.errReceiverMissing', { defaultValue: "Enter the receiver's first name. The driver asks for this person by name at handoff." }));
      return;
    }
    if (step === 0 && destMode === 'address' && !dropoff) { failField('dropoff', t('send.errDropoffMissing')); return; }
    if (step === 1 && !pickup)  { failField('pickup',  t('send.errPickupMissing'));  return; }

    if (step === 1 && !scheduleNow && scheduledHour == null) {
      failField('schedule', t('send.errScheduleTime'));
      return;
    }
    setInvalidField(null);
    setError('');
    if (step === 1 && category) setVehicleId(autoRecommend(category, kg));
    setStep(s => s + 1);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    Keyboard.dismiss();
  };

  const back = () => {
    if (step === 0) { router.back(); return; }
    setInvalidField(null);
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
        codAmountNgn:    codAmountNgn || undefined,
        deliveryInstructions: instructions.trim() || undefined,
        declaredValueNgn: Number(declaredValue) > 0 ? Number(declaredValue) : undefined,
        receiverFirstName: receiverFirst.trim() || undefined,
        receiverLastName:  receiverLast.trim() || undefined,
        receiverPhone:     receiverPhone.trim() || undefined,
        fallbackPref,
        fallbackNeighbourName: fallbackPref === 'neighbour' ? (neighbourName.trim() || undefined) : undefined,
      } as any);
      clearDraft();
      router.replace('/(customer)/history' as any);
    } catch (e: any) {
      setError(e.message ?? t('send.errBookingFailed'));
    } finally {
      setLoading(false);
    }
  };

  const highlight = (active: boolean) => ({
    borderColor:     active ? theme.accent : theme.border,
    backgroundColor: active ? (isDark ? '#1A2E44' : '#EBF5FF') : theme.surface,
  });

  const showSuggestions = activeField !== null && predictions.length > 0;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header, matched to the business app's Send a Package flow
          (apps/business-app/app/(business)/send-package.tsx): back button,
          left-aligned title with the step caption beneath it, and progress
          dots on the right. This screen used to float a centred pill over a
          full-screen map, which made the two apps read as different products
          at the same step of the same job. The map is not gone, it moved to
          an inline card on the Address step, which is where the business
          flow puts it too. */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={back} style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} hitSlop={8}>
          <ArrowLeft size={20} color={theme.text} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{t('send.sendPackage')}</Text>
          <Text style={[styles.headerStep, { color: theme.textSecond }]}>
            {t('send.stepOf', { current: step + 1, total: STEPS.length })}: {t(`send.${STEP_KEYS[step]}`)}
          </Text>
        </View>
        <View style={styles.stepDots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[styles.stepDot, { backgroundColor: i <= step ? theme.primary : theme.border }]}
            />
          ))}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xl }}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          {/* Banner only for errors with no single field to point at
              (booking failures, network). Missing-field messages now
              render under the field itself. */}
          {!!error && !invalidField && (
            <View style={[styles.errorBox, { backgroundColor: '#EF444415' }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          )}

          {/* Per-step illustration + caption: the DHL pattern. Anchors
              each step with a visual cue so the user knows what they're
              about to do before they read the form. Illustration auto-
              falls back to a branded placeholder until the SVG is
              dropped in assets/illustrations/. */}
          {(() => {
            const SLOTS = [
              { name: 'send-package',  captionKey: 'step1Caption' },
              { name: 'send-address',  captionKey: 'step2Caption' },
              { name: 'send-vehicle',  captionKey: 'step3Caption' },
              { name: 'send-fare',     captionKey: 'step4Caption' },
            ];
            const slot = SLOTS[step];
            if (!slot) return null;
            return (
              <View style={styles.stepHero}>
                <Illustration name={slot.name} size={140} />
                <Text style={[styles.stepHeroCaption, { color: theme.textSecond }]}>
                  {t(`send.${slot.captionKey}`)}
                </Text>
              </View>
            );
          })()}

          {/* STEP 0: Package */}
          {step === 0 && (
            <View style={styles.stepGap}>
              {/* The run-level "drop at a store instead" banner was removed
                  here to match the business flow (founder 2026-08-16 in
                  send-package.tsx): store drop is a DESTINATION choice, and
                  it now lives in "Where is it going?" below. Keeping both
                  meant two controls for one decision, and the banner threw
                  away whatever the sender had already typed into this form. */}

              {/* Everything about the package sits inside one bordered card,
                  the same container the business app's Send a Package uses
                  (styles.pkgCard there). Before this the fields floated
                  loose on the page, which is the single biggest reason the
                  two flows did not read as the same product. */}
              <View style={[styles.pkgCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.pkgHead}>
                  <Text style={[styles.pkgTitle, { color: theme.text }]}>
                    {t('send.packageCardTitle', { defaultValue: 'Package 1' })}
                  </Text>
                </View>

              <Text style={[styles.label, { color: theme.textSecond }]}>
                {t('send.packagePhotos')} <Text style={{ color: theme.error }}>*</Text>
                <Text style={{ color: theme.textThird }}> {t('send.minOnePhoto')}</Text>
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
                    <Text style={[styles.photoAddText, { color: theme.textSecond }]}>{t('send.addPhoto')}</Text>
                  </Pressable>
                )}
              </View>

              <Text style={[styles.label, { color: theme.textSecond }]}>{t('send.description')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, color: theme.text }]}
                placeholder={t('send.descPlaceholder')}
                placeholderTextColor={theme.textThird}
                value={description}
                onChangeText={setDescription}
              />

              <View onLayout={onFieldLayout('weight')}>
                <Text style={[styles.label, { color: theme.textSecond }]}>
                  {t('send.weightKg')} <Text style={{ color: theme.error }}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.surfaceSecond, borderColor: fieldBorder('weight'), borderWidth: invalidField === 'weight' ? 2 : 1, color: theme.text }]}
                  placeholder={t('send.weightPlaceholder')}
                  placeholderTextColor={theme.textThird}
                  keyboardType="decimal-pad"
                  value={weightKg}
                  onChangeText={v => { setWeightKg(v); if (invalidField === 'weight') { setInvalidField(null); setError(''); } }}
                />
                {invalidField === 'weight' && (
                  <Text style={[styles.fieldError, { color: theme.error }]}>{error}</Text>
                )}
              </View>

              <Text
                onLayout={onFieldLayout('category')}
                style={[styles.label, { color: theme.textSecond }]}
              >
                {t('send.category')} <Text style={{ color: theme.error }}>*</Text>
              </Text>
              {invalidField === 'category' && (
                <Text style={[styles.fieldError, { color: theme.error }]}>{error}</Text>
              )}
              <View style={styles.categoryGrid}>
                {(catalog.length
                  ? catalog.map(c => ({ id: c.code as CategoryId, label: c.name }))
                  : PACKAGE_CATEGORIES.map(c => ({ id: c.id, label: t(`send.${c.labelKey}`) }))
                ).map(cat => (
                  <Pressable
                    key={cat.id}
                    style={[styles.categoryChip, highlight(category === cat.id)]}
                    onPress={() => setCategory(cat.id)}
                  >
                    <Text style={[styles.categoryText, { color: category === cat.id ? theme.accent : theme.text }]}>{cat.label}</Text>
                  </Pressable>
                ))}
              </View>

              <View onLayout={onFieldLayout('receiver')}>
                <Text style={[styles.label, { color: theme.textSecond }]}>
                  {t('send.receiverName', { defaultValue: 'Who is receiving?' })} <Text style={{ color: theme.error }}>*</Text>
                </Text>
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <TextInput
                    style={[styles.input, { flex: 1, backgroundColor: theme.surfaceSecond, borderColor: fieldBorder('receiver'), borderWidth: invalidField === 'receiver' ? 2 : 1, color: theme.text }]}
                    placeholder={t('send.receiverFirst', { defaultValue: 'First name' })}
                    placeholderTextColor={theme.textThird}
                    value={receiverFirst}
                    onChangeText={v => { setReceiverFirst(v); if (invalidField === 'receiver') { setInvalidField(null); setError(''); } }}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1, backgroundColor: theme.surfaceSecond, borderColor: theme.border, color: theme.text }]}
                    placeholder={t('send.receiverLast', { defaultValue: 'Last name' })}
                    placeholderTextColor={theme.textThird}
                    value={receiverLast}
                    onChangeText={setReceiverLast}
                  />
                </View>
                {invalidField === 'receiver' && (
                  <Text style={[styles.fieldError, { color: theme.error }]}>{error}</Text>
                )}
              </View>
              <Text style={{ fontSize: FontSize.xs, color: theme.textThird, marginTop: -Spacing.xs, marginBottom: Spacing.sm }}>
                {t('send.receiverHint', { defaultValue: 'The driver confirms this first name at handoff. Anyone the receiver trusts can collect.' })}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, color: theme.text }]}
                placeholder={t('send.receiverPhone', { defaultValue: '08012345678' })}
                placeholderTextColor={theme.textThird}
                keyboardType="phone-pad"
                value={receiverPhone}
                onChangeText={setReceiverPhone}
              />

              <Text style={[styles.label, { color: theme.textSecond }]}>
                {t('send.destinationLabel', { defaultValue: 'Where is it going?' })} <Text style={{ color: theme.error }}>*</Text>
              </Text>
              <View style={styles.destRow}>
                {([
                  { key: 'address', label: t('send.destAddress', { defaultValue: 'To an address' }) },
                  { key: 'store',   label: t('send.destStore',   { defaultValue: 'To a partner store' }) },
                ] as const).map(opt => {
                  const active = destMode === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      style={[styles.destBtn, {
                        backgroundColor: active ? theme.primary : theme.surfaceSecond,
                        borderColor:     active ? theme.primary : theme.border,
                      }]}
                      onPress={() => {
                        setDestMode(opt.key);
                        // Store drop is a different product (drop code + QR at
                        // the counter), so it hands off to that flow rather
                        // than pretending to handle it here.
                        if (opt.key === 'store') router.push('/(customer)/drop-at-store' as any);
                      }}
                    >
                      {opt.key === 'address'
                        ? <MapPin size={14} color={active ? '#fff' : theme.textSecond} strokeWidth={2} />
                        : <Store  size={14} color={active ? '#fff' : theme.textSecond} strokeWidth={2} />}
                      <Text style={[styles.destTxt, { color: active ? '#fff' : theme.text }]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {destMode === 'address' && (
                <>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.surfaceSecond, borderColor: fieldBorder('dropoff'), borderWidth: invalidField === 'dropoff' ? 2 : 1, color: theme.text }]}
                    value={dropoffQuery}
                    onChangeText={(v) => onChangeQuery('dropoff', v)}
                    onFocus={() => setActiveField('dropoff')}
                    placeholder={t('send.destAddressPlaceholder', { defaultValue: 'Street, area, city' })}
                    placeholderTextColor={theme.textThird}
                  />
                  {invalidField === 'dropoff' && (
                    <Text style={[styles.fieldError, { color: theme.error }]}>{error}</Text>
                  )}
                  {activeField === 'dropoff' && predictions.length > 0 && (
                    <View style={styles.suggestList}>
                      {predictions.map(pr => (
                        <Pressable
                          key={pr.place_id}
                          style={[styles.suggRow, { borderTopColor: theme.border }]}
                          onPress={() => selectPrediction(pr)}
                        >
                          <View style={[styles.suggIcon, { backgroundColor: theme.surfaceSecond }]}>
                            <Ionicons name="location-outline" size={16} color={theme.textSecond} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.suggMain, { color: theme.text }]} numberOfLines={1}>{pr.main_text}</Text>
                            {!!pr.secondary_text && <Text style={[styles.suggSub, { color: theme.textSecond }]} numberOfLines={1}>{pr.secondary_text}</Text>}
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </>
              )}

              <Text style={[styles.label, { color: theme.textSecond }]}>
                {t('send.fallbackLabel', { defaultValue: 'If nobody is available' })}
              </Text>
              <View style={styles.chipRow}>
                {([
                  { key: 'hand_only', label: t('send.fbHand',      { defaultValue: 'Hand to receiver only' }) },
                  { key: 'neighbour', label: t('send.fbNeighbour', { defaultValue: 'Leave with neighbour' }) },
                  { key: 'gate',      label: t('send.fbGate',      { defaultValue: 'Leave at gate' }) },
                  { key: 'store',     label: t('send.fbStore',     { defaultValue: 'Drop at partner store' }) },
                ] as const).map(opt => {
                  const active = fallbackPref === opt.key;
                  const hv = Number(declaredValue) > 0 && Number(declaredValue) >= highValueNgn;
                  const blocked = hv && (opt.key === 'gate' || opt.key === 'neighbour');
                  if (blocked && active) setTimeout(() => setFallbackPref('hand_only'), 0);
                  return (
                    <Pressable
                      key={opt.key}
                      disabled={blocked}
                      style={[styles.timeChip, {
                        backgroundColor: active ? theme.accent : theme.surfaceSecond,
                        borderColor: active ? theme.accent : theme.border,
                        opacity: blocked ? 0.4 : 1,
                      }]}
                      onPress={() => setFallbackPref(opt.key)}
                    >
                      <Text style={[styles.timeChipText, { color: active ? '#fff' : theme.text }]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {Number(declaredValue) >= highValueNgn && (
                <Text style={{ fontSize: FontSize.xs, color: theme.textThird, marginBottom: Spacing.sm }}>
                  {t('send.hvFallbackNote', { defaultValue: 'High-value packages cannot be left at the gate or with a neighbour.' })}
                </Text>
              )}
              {fallbackPref === 'neighbour' && (
                <TextInput
                  style={[styles.input, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, color: theme.text }]}
                  placeholder={t('send.neighbourName', { defaultValue: "Neighbour or security's name" })}
                  placeholderTextColor={theme.textThird}
                  value={neighbourName}
                  onChangeText={setNeighbourName}
                />
              )}

              <Text style={[styles.label, { color: theme.textSecond }]}>
                {t('send.declaredValue', { defaultValue: 'Package value in NGN (optional)' })}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, color: theme.text }]}
                placeholder={t('send.declaredValueHint', { defaultValue: 'e.g. 150000' })}
                placeholderTextColor={theme.textThird}
                keyboardType="number-pad"
                value={declaredValue}
                onChangeText={setDeclaredValue}
              />
              <Text style={{ fontSize: FontSize.xs, color: theme.textThird, marginTop: -Spacing.xs, marginBottom: Spacing.sm }}>
                {t('send.declaredValueNote', { defaultValue: 'High-value packages get ID-verified handoff.' })}
              </Text>

              <Text style={[styles.label, { color: theme.textSecond }]}>
                {t('send.instructions', { defaultValue: 'Instructions for driver (optional)' })}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, color: theme.text, minHeight: 70, textAlignVertical: 'top' }]}
                placeholder={t('send.instructionsPlaceholder', { defaultValue: 'e.g. Call when you reach the gate. Ask for security.' })}
                placeholderTextColor={theme.textThird}
                value={instructions}
                onChangeText={setInstructions}
                multiline
                maxLength={500}
              />
              </View>
            </View>
          )}

          {/* STEP 1: Address (inline autocomplete + map underneath) */}
          {step === 1 && (
            <View style={styles.stepGap}>
              <View style={[styles.inputBlock, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
                <View style={styles.inputRow}>
                  <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
                  <TextInput
                    value={pickupQuery}
                    onChangeText={(t) => onChangeQuery('pickup', t)}
                    onFocus={() => setActiveField('pickup')}
                    placeholder={t('send.pickupAddress')}
                    placeholderTextColor={theme.textThird}
                    style={[styles.inputField, { color: theme.text }]}
                  />
                  {pickupQuery.length > 0 && (
                    <Pressable onPress={() => clearField('pickup')} hitSlop={12}>
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

              {pickup && dropoff && (
                <View style={[styles.mapCard, { borderColor: theme.border }]}>
                  <MapView
                    ref={mapRef}
                    provider={PROVIDER_GOOGLE}
                    style={styles.mapInline}
                    initialRegion={DEFAULT_MAP_REGION}
                    customMapStyle={isDark ? DARK_MAP : []}
                    pointerEvents="none"
                    onLayout={() => {
                      mapRef.current?.fitToCoordinates(
                        [
                          { latitude: pickup.lat,  longitude: pickup.lng  },
                          { latitude: dropoff.lat, longitude: dropoff.lng },
                        ],
                        { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: false },
                      );
                    }}
                  >
                    <Marker coordinate={{ latitude: pickup.lat,  longitude: pickup.lng  }} pinColor="#22C55E" title="Pickup"  description={pickup.address}  />
                    <Marker coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }} pinColor="#EF4444" title="Dropoff" description={dropoff.address} />
                    {routeCoords.length > 1 && (
                      <Polyline coordinates={routeCoords} strokeColor={theme.primary} strokeWidth={4} />
                    )}
                  </MapView>
                </View>
              )}

              {showSuggestions && activeField !== null && (
                <View style={styles.suggestList}>
                  <Pressable style={styles.useLocBtn} onPress={() => useMyLocation(activeField)}>
                    <Ionicons name="locate" size={18} color={theme.primary} />
                    <Text style={[styles.useLocText, { color: theme.primary }]}>{t('send.useMyLocation')}</Text>
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
                  <Text style={[styles.useLocText, { color: theme.primary }]}>{t('send.useMyLocation')}</Text>
                  {searching && <ActivityIndicator size="small" color={theme.primary} />}
                </Pressable>
              )}

              {/* When?: merged from old Step 4 so address + timing live
                  together. Always visible on Step 2: scroll to reach it
                  if the suggestions list is open above. */}
              <>
                <Text style={[styles.label, { color: theme.textSecond, marginTop: Spacing.md }]}>{t('send.whenLabel')}</Text>
                {[
                  { now: true,  icon: Zap,      titleKey: 'sendNow',       descKey: 'sendNowDesc'       },
                  { now: false, icon: Calendar, titleKey: 'scheduleLater', descKey: 'scheduleLaterDesc' },
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
                          <Text style={[styles.scheduleTitle, { color: theme.text }]}>{t(`send.${opt.titleKey}`)}</Text>
                          <Text style={[styles.scheduleDesc, { color: theme.textSecond }]}>{t(`send.${opt.descKey}`)}</Text>
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
                        {t('send.timeLabel')} <Text style={{ color: theme.textThird, fontWeight: FontWeight.regular }}>{t('send.scheduledHoursHint')}</Text>
                      </Text>
                      <View style={styles.chipRow}>
                        {TIME_SLOTS.map(slot => {
                          const active = scheduledHour === slot.hour;
                          const isPast = scheduledDate === TODAY_ISO && slot.hour <= new Date().getHours();
                          if (isPast) return null;
                          return (
                            <Pressable
                              key={slot.hour}
                              style={[styles.timeChip, { backgroundColor: active ? theme.accent : theme.surfaceSecond, borderColor: active ? theme.accent : theme.border }]}
                              onPress={() => setScheduledHour(slot.hour)}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <Text style={[styles.timeChipText, { color: active ? '#fff' : theme.text }]}>{slot.label}</Text>
                                {slot.night && <Moon size={10} color={active ? '#fff' : theme.textThird} strokeWidth={2} />}
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>

                      {scheduledHour != null && (
                        <View style={[styles.scheduleSummary, { borderTopColor: theme.border }]}>
                          <Calendar size={16} color={theme.accent} strokeWidth={1.75} />
                          <Text style={[styles.scheduleSummaryText, { color: theme.text }]}>
                            {t('send.scheduledForPrefix')} {buildScheduledFor(scheduledDate, scheduledHour).toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </Text>
                        </View>
                      )}
                      {scheduledHour != null && (scheduledHour >= NIGHT_START || scheduledHour < NIGHT_END) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.xs }}>
                          <Moon size={13} color={theme.textThird} strokeWidth={1.75} />
                          <Text style={{ fontSize: FontSize.xs, color: theme.textThird, flex: 1 }}>
                            {t('send.nightFeeNote', { defaultValue: 'Night pickup: a night fee applies and goes to your driver in full.' })}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
              </>
            </View>
          )}

          {/* STEP 2: Vehicle */}
          {step === 2 && (
            <View style={styles.stepGap}>
              <Text style={[styles.hintText, { color: theme.textSecond }]}>
                {t('send.vehicleRecommended')}
              </Text>
              {VEHICLES.map(v => {
                // Same options the Fare step uses. Quoting the bare
                // base here meant the vehicle card advertised a price
                // that omitted the category surcharge, the zone
                // surcharge and any COD fee, so the number you chose a
                // vehicle on was never the number you paid.
                const f      = calcFare(v.id, distKmRoute, kg, {
                  categoryId: category, codAmountNgn,
                  pickupCoords, dropoffCoords,
                });
                const active = vehicleId === v.id;
                const rec    = v.id === (category ? autoRecommend(category, kg) : 'motorcycle');
                // The rate card marks some vehicle/category pairs unsafe
                // (frozen food on an okada has no cold chain). Nothing
                // enforced it: the backend has no such rule at all and
                // this list offered every vehicle, so the combination the
                // card forbids was bookable in two taps.
                const blocked = forbiddenForCategory.includes(v.id);
                return (
                  <Pressable
                    key={v.id}
                    disabled={blocked}
                    style={[styles.vehicleCard, highlight(active), Shadows.xs,
                            blocked && { opacity: 0.45 }]}
                    onPress={() => setVehicleId(v.id)}
                  >
                    <Truck size={26} color={active ? theme.accent : theme.textSecond} strokeWidth={1.5} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.vehicleNameRow}>
                        <Text style={[styles.vehicleName, { color: theme.text }]}>{t(`send.${v.labelKey}`)}</Text>
                        {rec && (
                          <View style={[styles.recBadge, { backgroundColor: theme.accent }]}>
                            <Text style={styles.recText}>{t('send.recommended')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.vehicleNote, { color: theme.textSecond }]}>
                        {t(`send.${v.noteKey}`)} · max {v.maxKg >= 9999 ? '3000+' : v.maxKg}kg
                      </Text>
                      {blocked && (
                        <Text style={[styles.vehicleNote, { color: theme.error }]}>
                          {t('send.vehicleBlocked', {
                            defaultValue: 'Not allowed for this package type',
                          })}
                        </Text>
                      )}
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

          {/* STEP 3: Fare */}
          {step === 3 && (
            <View style={styles.stepGap}>
              <View style={[styles.fareCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
                <Text style={[styles.fareTitle, { color: theme.text }]}>{t('send.fareBreakdown')}</Text>
                {([
                  [t('send.baseFare'),                                       fare.base             ],
                  [t('send.distanceLabour'),                                 fare.dist             ],
                  [t('send.distanceFuel'),                                   fare.distFuel         ],
                  [t('send.weightSurcharge'),                                fare.weight           ],
                  [t('send.handlingFee'),                                    fare.handling         ],
                  [t('send.categorySurcharge'),                              fare.categorySurcharge],
                  [t('send.timeSurcharge', { labels: fare.timeLabels.join(', ') || '-' }),
                                                                              fare.timeSurcharge   ],
                  [t('send.zoneSurcharge'),                                  fare.zoneSurcharge    ],
                  [t('send.overnightFee'),                                   fare.zoneFlat         ],
                  [t('send.codFee'),                                         fare.codFee           ],
                  [t('send.insurancePremium'),                               fare.insurance        ],
                  [t('send.serviceFee'),                                     fare.service          ],
                  [t('send.discountBulk'),                                  -fare.discounts.bulk   ],
                  [t('send.discountRecurring'),                             -fare.discounts.recurring],
                  [t('send.discountWelcome'),                               -fare.discounts.welcome],
                  [t('send.discountLoyalty'),                               -fare.discounts.loyalty],
                  [t('send.vat'),                                            fare.vat              ],
                ] as [string, number][]).filter(([, amt]) => amt !== 0).map(([lbl, amt]) => (
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

              <Text style={[styles.label, { color: theme.textSecond }]}>{t('send.paymentMethod')}</Text>
              {PAYMENT_METHODS.map(pm => (
                <Pressable
                  key={pm.id}
                  style={[styles.payOption, highlight(paymentId === pm.id)]}
                  onPress={() => setPaymentId(pm.id)}
                >
                  <CreditCard size={18} color={paymentId === pm.id ? theme.accent : theme.textSecond} strokeWidth={1.75} />
                  <Text style={[styles.payLabel, { color: theme.text }]}>{t(`send.${pm.labelKey}`)}</Text>
                  {paymentId === pm.id && <CheckCircle size={18} color={theme.accent} strokeWidth={2} />}
                </Pressable>
              ))}

              {/* Cash on delivery removed (founder 2026-08-13): we are
                  not running COD at launch. Handing drivers cash to
                  reconcile is a theft and float problem we have no
                  process for yet. The pricing engine still knows how to
                  charge a COD fee, so this is a UI removal, not a
                  teardown, if we ever turn it on deliberately. */}

              <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
                <Text style={[styles.fareTitle, { color: theme.text }]}>{t('send.orderSummary')}</Text>
                {([
                  [t('send.pickup'),         pickup?.address  ?? '-'],
                  [t('send.dropoff'),        dropoff?.address ?? '-'],
                  [t('send.summaryDistance'), distanceText ?? `${distKmRoute} km`],
                  [t('send.category'),       t(`send.${PACKAGE_CATEGORIES.find(c => c.id === category)?.labelKey ?? 'category'}`)],
                  [t('send.vehicle2'),       (() => { const v = VEHICLES.find(v => v.id === vehicleId); return v ? t(`send.${v.labelKey}`) : '-'; })()],
                  [t('send.summaryWhen'),    scheduleNow
                                               ? t('send.summarySendNow')
                                               : (scheduledHour != null
                                                   ? buildScheduledFor(scheduledDate, scheduledHour).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                                                   : '-')],
                  [t('send.payment'),        (() => { const p = PAYMENT_METHODS.find(p => p.id === paymentId); return p ? t(`send.${p.labelKey}`) : '-'; })()],
                  [t('send.total'),          `₦${fare.total.toLocaleString()}`],
                ] as [string, string][]).map(([lbl, val]) => (
                  <View key={lbl} style={[styles.fareRow, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.fareLabel, { color: theme.textSecond }]}>{lbl}</Text>
                    <Text style={[styles.fareAmt,   { color: theme.text }]} numberOfLines={2}>{val}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

        </ScrollView>

        {/* CTA pinned to the bottom, as in the business flow, so Continue is
            reachable without scrolling to the end of a long step. The inset
            padding clears the phone's navigation bar: insets.bottom is 0 on
            gesture navigation and ~48dp on the 3-button layout, so a tap
            cannot land on Back instead of Continue. */}
        <View style={[styles.ctaBar, {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          paddingBottom: Spacing.md + insets.bottom,
        }]}>
          <Pressable
            style={[styles.cta, { backgroundColor: theme.primary }, loading && { opacity: 0.7 }]}
            onPress={step < 3 ? next : handleBook}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.ctaInner}>
                <Text style={styles.ctaText}>{step === 3 ? t('send.bookDelivery') : t('common.continue')}</Text>
                <ArrowRight size={18} color="#fff" strokeWidth={2.5} />
              </View>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:    { flex: 1 },
  // Header values are the business app's, so the two flows line up exactly.
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:      { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '700' },
  headerStep:   { fontSize: 12, marginTop: 1 },
  // Named stepDot, not dot: styles.dot is already the pickup/dropoff
  // marker on the Address step and reusing the name would collide.
  stepDots:     { flexDirection: 'row', gap: 4 },
  stepDot:      { width: 8, height: 8, borderRadius: 4 },
  ctaBar:       { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: 1 },
  mapCard:      { height: 220, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  mapInline:    { ...StyleSheet.absoluteFillObject },
  stepGap:      { gap: Spacing.md },
  // Business app's pkgCard / pkgHead / pkgTitle, verbatim.
  pkgCard:      { borderRadius: 16, borderWidth: 1, padding: 14, gap: 4 },
  pkgHead:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  pkgTitle:     { fontSize: 15, fontWeight: '700' as const },
  destRow:      { flexDirection: 'row', gap: 8, marginBottom: 8 },
  destBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  destTxt:      { fontSize: 12.5, fontWeight: '600' as const },
  stepHero:        { alignItems: 'center', gap: 8, marginBottom: Spacing.md },
  stepHeroCaption: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, textAlign: 'center' },

  errorBox:     { padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.sm },
  errorText:    { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  // Inline message under the offending field, so the instruction sits
  // where the fix happens rather than in a banner further up.
  fieldError:   { fontSize: FontSize.xs, lineHeight: 17, marginTop: -Spacing.xs, marginBottom: Spacing.sm },
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
  // Metrics match the business app's send-package input exactly.
  // The old `height: 52` with fontSize 15 left vertical room for a
  // second line, so long placeholders ("Last name (optional)" in a
  // half-width field, and the declared-value hint) wrapped and then
  // got clipped mid-word. Growing from padding instead keeps every
  // placeholder on one line, which is why the business form never
  // showed this.
  input:        { minHeight: 48, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: 14 },

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
