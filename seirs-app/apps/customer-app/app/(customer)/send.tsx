import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet, StatusBar, TextInput,
  ActivityIndicator, Image, Keyboard, ScrollView, Linking, Modal, Dimensions,
  KeyboardAvoidingView, Platform,
  BackHandler,
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
import { deliveriesApi, uploadApi, mapsApi, feesApi, configApi, pricingApi, dropoffApi } from '@/services/api';
import type { ServiceCategory } from '@/services/api';
import { useSendDraftStore } from '@/store/useSendDraftStore';
import { type PickedAddress } from '@/components/AddressPicker';
import { useDirectionsPolyline } from '@/components/useDirectionsPolyline';
import { useMultiStopDirections } from '@/components/useMultiStopDirections';
import { DEFAULT_MAP_REGION } from '@/constants/mockData';
import { Illustration } from '@/components/Illustration';
import {
  ArrowLeft, ArrowRight, Truck, Calendar, CreditCard,
  Camera, X, CheckCircle, Zap, Moon, MapPin, Store, Bike, Clock, AlertCircle,
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

import { naira } from '@/utils/money';
import { showDialog } from '@/components/SeirsDialog';

const VEHICLES = PACKAGE_VEHICLES;
// Business Vehicle step, ported verbatim (founder 2026-08-21: exactly).
const VEHICLE_LABEL: Record<string, string> = {
  // Bicycle / On-foot is the inclusion tier (founder 2026-08-21): a
  // person with no vehicle at all can carry a schoolbook 2km and get
  // paid. It was wrongly dropped in the business-parity port; business
  // gets it too, not the other way round.
  bicycle: 'Bicycle / On-foot', motorcycle: 'Okada', tricycle: 'Keke',
  car: 'Car', van: 'Danfo / Van', truck_small: 'Small Truck', truck_large: 'Large Truck',
};
const VEHICLE_ORDER = ['bicycle', 'motorcycle', 'tricycle', 'car', 'van', 'truck_small', 'truck_large'];
// The customer card and pricing use LOCAL vehicle ids (keke, truck_sm);
// the canonical names above are display order only. Booking with a
// canonical id would silently break calcFare and the payload.
const LOCAL_VEHICLE_ID: Record<string, string> = {
  bicycle: 'bicycle', motorcycle: 'motorcycle', tricycle: 'keke',
  car: 'car', van: 'van', truck_small: 'truck_sm', truck_large: 'truck_lg',
};
// Short-hop ceiling for the human-powered tier. Read from the rate card
// when the admin adds vehicleRates.bicycle.maxRouteKm; 3km until then.
const BICYCLE_MAX_KM_FALLBACK = 3;
const DEFAULT_MAX_PACKAGES: Record<string, number> = {
  bicycle: 3, motorcycle: 5, tricycle: 15, car: 20,
  van: 40, truck_small: 80, truck_large: 150,
};
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
/**
 * One package in the run. The business app has booked runs as a list of
 * these since its rebuild; the customer app carried a single implicit
 * package spread across a dozen useState calls, which is why it could
 * never offer "add another".
 */
export interface PackageDraft {
  photos:        string[];
  description:   string;
  category:      CategoryId | null;
  weightKg:      string;
  receiverFirst: string;
  receiverLast:  string;
  receiverPhone: string;
  destMode:      'address' | 'store';
  dropoff:       PickedAddress | null;
  dropoffQuery:  string;
  /**
   * The counter this package is collected from (2026-08-31).
   *
   * "To a partner store" used to push the sender out into the separate
   * walk-in flow, which is a different product with its own drop code
   * and QR, so choosing it abandoned the run they were halfway through
   * building. The business app has picked a collection counter inline,
   * per package, since its rebuild. This is the same thing: the typed
   * address becomes the AREA to search, and the chosen counter becomes
   * the stop's destination.
   */
  destStoreId:   string | null;
  destStoreName: string | null;
  fallbackPref:  'hand_only' | 'neighbour' | 'gate' | 'store';
  neighbourName: string;
  declaredValue: string;
  instructions:  string;
}

export const emptyPackage = (): PackageDraft => ({
  photos: [], description: '', category: null, weightKg: '',
  receiverFirst: '', receiverLast: '', receiverPhone: '',
  destMode: 'address', dropoff: null, dropoffQuery: '',
  destStoreId: null, destStoreName: null,
  fallbackPref: 'hand_only', neighbourName: '', declaredValue: '',
  instructions: '',
});

/**
 * The engine's zone tiers, in words a sender recognises.
 *
 * Keys are the labels pricing.service returns. Anything not listed here
 * renders nothing rather than a raw camelCase key: a summary line the
 * customer cannot read is no better than the unnamed number this
 * replaces.
 */
const ZONE_TIER_LABEL: Record<string, string> = {
  intraStateLongHaul: 'Long trip within one state',
  interStateAdjacent: 'Crossing into the next state',
  interStateDistant:  'Crossing to a further state',
  crossZone:          'Crossing to another part of the country',
  interState:         'Crossing a state line',
};

// Hard ceiling on one run. Vehicle capacity is the real limit and is
// enforced server-side from the Fee Catalogue; this just stops a runaway
// form. Same number the backend DTO caps at.
const MAX_PACKAGES = 20;

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

/**
 * Today, and the hour, in Africa/Lagos. The only clock SEIRS runs on.
 *
 * This was two different clocks (found on device, 2026-08-29):
 *
 *   TODAY_ISO came from toISOString(), which is UTC.
 *   The past-hour check came from getHours(), which is device-local.
 *
 * They agree only for a user whose phone is set to UTC. For a Lagos
 * phone they disagree between midnight and 1am, and for the founder
 * testing from Berlin they disagreed by two hours all night.
 *
 * What that produced, reproduced on the device at 23:36 Lagos time: the
 * calendar preselected the WRONG DAY, every hour chip from 1am to 11pm
 * rendered as available because the local hour was 0, and selecting
 * "5 AM" on a day already 18 hours gone was accepted by Continue. A
 * pickup scheduled into the past.
 *
 * It also explains the one chip that was missing: 12 AM vanished,
 * because hour 0 was the only one the broken comparison caught.
 *
 * Lagos is UTC+1 with no daylight saving, so a fixed offset is exact.
 * Same idiom as isBusinessHoursNow() in support/new.tsx. Functions
 * rather than constants, so an app left open across midnight does not
 * keep yesterday's answer.
 */
/**
 * A keyboard hint is not validation (2026-08-29).
 *
 * keyboardType only suggests which keys to show. It is bypassed by voice
 * input, a swipe keyboard, a paste, an external keyboard, and by any
 * automation. Typed on the device: weight took "3Chidinma", the phone
 * field took ",2Adeola Odeku", and the surname took "08034567890".
 *
 * Weight matters most, because pricing reads it: parseFloat("3Chidinma")
 * is NaN, and NaN is how a fare quietly becomes nothing. This is the
 * same defect that produced "4Chidinma" in the business app.
 *
 * Filtered on the way in rather than rejected on submit, so the field
 * simply cannot hold a wrong value and nobody is told off after typing.
 */
const onlyDecimal = (v: string) => {
  const cleaned = v.replace(/[^0-9.]/g, '');
  const [head, ...rest] = cleaned.split('.');      // at most one point
  return rest.length ? `${head}.${rest.join('')}` : head;
};

/** Digits, plus a leading +, spaces and dashes people actually type. */
const onlyPhone = (v: string) => {
  const plus = v.trimStart().startsWith('+') ? '+' : '';
  return plus + v.replace(/[^0-9]/g, '');
};

/**
 * Names are not numbers. Letters, spaces, apostrophes and hyphens, so
 * N'Diaye and Obi-Chukwu both survive, and Yoruba, Igbo and Hausa
 * diacritics are kept by allowing anything that is not a digit.
 */
const onlyName = (v: string) => v.replace(/[0-9]/g, '');

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const lagosNow      = () => new Date(Date.now() + LAGOS_OFFSET_MS);
const todayIsoLagos = () => lagosNow().toISOString().slice(0, 10);
const lagosHourNow  = () => lagosNow().getUTCHours();
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

// 'pickup' is the run's single collection point. Each package has its
// own destination, so a focused destination field is identified by index:
// 'pkg:0', 'pkg:1'. Business encodes the same idea as { kind:'pkg', idx }.
type Field = 'pickup' | `pkg:${number}`;

const pkgIndexOf = (f: Field | null): number | null =>
  typeof f === 'string' && f.startsWith('pkg:') ? Number(f.slice(4)) : null;
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
  // The run is a list of packages. Index 0 is the first card; "add another
  // package" appends. Read-only aliases for index 0 are declared just below
  // so the validation, pricing and payload code keeps reading the same
  // names it always did.
  const [packages, setPackages] = useState<PackageDraft[]>([emptyPackage()]);
  const updatePkg = useCallback((i: number, patch: Partial<PackageDraft>) => {
    setPackages(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }, []);
  const addPackage = useCallback(() => {
    setPackages(ps => [...ps, emptyPackage()]);
  }, []);
  const removePackage = useCallback((i: number) => {
    setPackages(ps => (ps.length <= 1 ? ps : ps.filter((_, j) => j !== i)));
  }, []);
  // Free-text instructions for the driver ("call at gate", "security
  // code 4231"). Auto-posted into the chat as a system message when a
  // driver is assigned so it is impossible to miss.
  // Sender-declared package value (optional). At/above the catalogue
  // high-value threshold the driver must ID-verify the recipient.
  // Receiver system (founder 2026-08-11): who collects + fallback plan.
  // Above this declared value the recipient must show physical ID, and
  // gate/neighbour drop-off is refused. The number is policy, so it is
  // resolved the same way the server resolves it: the rate card's
  // highValue.thresholdNgn first, then the Fee Catalogue row, then this
  // compiled fallback. See the fetch below for why the order matters.
  const [highValueNgn,   setHighValueNgn]   = useState(100000);
  // Service catalogue drives the category chips. Business does the
  // same (configApi.serviceCatalog), which is why its chips carry
  // short admin-editable names instead of long baked-in labels.
  const [catalog,        setCatalog]        = useState<ServiceCategory[]>([]);

  // Draft persistence. Everything on this screen used to live in useState
  // alone, so backing out (or tapping "To a partner store", or taking a
  // call) threw the whole form away. The business app has persisted its
  // draft since its rebuild; this is the customer equivalent.
  const { draft, ready: draftReady, patchDraft, clearDraft, hasContent } = useSendDraftStore();
  const hydrated = useRef(false);
  // Where is it going? Business asks this per package on step 1
  // (destinationMode) instead of hiding store drop behind a banner.
  const [pickup,      setPickup]      = useState<PickedAddress | null>(null);
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

  /**
   * Keep the focused field above the keyboard (device sweep 2026-08-23).
   *
   * On the A30 the keyboard opened straight over "What is it?" and the
   * list never moved, so the sender could not see their own typing. The
   * business Send solved this on 2026-08-16; this is that solution.
   *
   * measureInWindow returns SCREEN coordinates and needs no ancestor
   * ref, so it answers the only question that matters directly: is this
   * field under the keyboard, and by how much?
   */
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollY     = useRef(0);
  const focusedRef  = useRef<{ node: any; extra: number } | null>(null);

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
   * `extra` reserves room BELOW the field: the address inputs drop a
   * suggestion list, and lifting only the input leaves the suggestions
   * under the keyboard.
   */
  const handleFieldFocus = (e: any, extra = 0) => {
    const node = e?.target;
    focusedRef.current = { node, extra };
    // On a first focus the keyboard is still opening and its height is
    // unknown, so measuring now reports no overlap. keyboardDidShow
    // below does it once the real height exists.
    if (keyboardHeight > 0) setTimeout(() => ensureVisible(node, keyboardHeight, extra), 80);
  };

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const h = e.endCoordinates.height;
      setKeyboardHeight(h);
      const f = focusedRef.current;
      if (f) setTimeout(() => ensureVisible(f.node, h, f.extra), 60);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

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
  /**
   * How the package reaches SEIRS, ported from the business app's Pickup
   * step (founder 2026-08-21: "exactly like the business app"). 'door' is
   * a rider at the sender's address; 'store' means the sender walks it
   * into a partner counter and the rider collects there, so the DELIVERY
   * pickup becomes the counter itself.
   */
  const [pickupMode, setPickupMode] = useState<'door' | 'store'>('door');
  const [nearStores, setNearStores] = useState<any[]>([]);
  const [storePicked, setStorePicked] = useState<any>(null);
  const [storesLoading, setStoresLoading] = useState(false);

  /** Nearby accepting counters, sorted by the directory around a point. */
  const findStoresNear = async (lat: number, lng: number) => {
    setStoresLoading(true);
    try {
      const res = await dropoffApi.directory(lat, lng);
      setNearStores((res?.items ?? []).slice(0, 6));
    } catch {
      setNearStores([]);
    } finally {
      setStoresLoading(false);
    }
  };

  /** Picking a counter makes it the delivery's pickup, like business. */
  const choosePickupStore = (st: any) => {
    setStorePicked(st);
    setNearStores([]);
    if (st?.storeLat != null && st?.storeLng != null) {
      setPickup({
        address: `${st.storeName}, ${st.storeAddress}`,
        lat: Number(st.storeLat),
        lng: Number(st.storeLng),
      } as any);
      setPickupQuery(`${st.storeName}, ${st.storeAddress}`);
    }
  };

  /**
   * Collection counters near each package's destination, keyed by package
   * index (2026-08-31).
   *
   * Per package rather than per run, because a two-package run can send
   * one parcel to a door in Yaba and the other to a counter in Ikeja, and
   * the business app has allowed exactly that since its rebuild.
   */
  const [destStores,     setDestStores]     = useState<Record<number, any[]>>({});
  const [destStoresBusy, setDestStoresBusy] = useState<Record<number, boolean>>({});

  const findDestStoresNear = async (idx: number, lat: number, lng: number) => {
    setDestStoresBusy(b => ({ ...b, [idx]: true }));
    try {
      const res = await dropoffApi.directory(lat, lng);
      setDestStores(s => ({ ...s, [idx]: (res?.items ?? []).slice(0, 6) }));
    } catch {
      setDestStores(s => ({ ...s, [idx]: [] }));
    } finally {
      setDestStoresBusy(b => ({ ...b, [idx]: false }));
    }
  };

  /**
   * The chosen counter becomes the package's destination, exactly as the
   * chosen pickup counter becomes the run's origin. Distance, price and
   * the driver's route all have to end at the shop rather than at the
   * area the sender typed to find it.
   */
  const chooseDestStore = (idx: number, st: any) => {
    const label = `${st.storeName}, ${st.storeAddress}`;
    updatePkg(idx, {
      destStoreId:   st.id,
      destStoreName: st.storeName,
      dropoff: st.storeLat != null && st.storeLng != null
        ? { address: label, lat: Number(st.storeLat), lng: Number(st.storeLng) } as any
        : null,
      dropoffQuery: label,
    });
    setDestStores(s => ({ ...s, [idx]: [] }));
  };

  /**
   * Counters follow the area the sender named.
   *
   * Keyed off the resolved coordinates rather than the autocomplete, so
   * it behaves the same whether they typed an address, tapped a
   * prediction or reused a recent one. Stops as soon as a counter is
   * chosen, since the coordinates then belong to that counter.
   */
  const destSearchKey = packages
    .map(p => `${p.destMode}|${p.destStoreId ?? ''}|${p.dropoff?.lat ?? ''},${p.dropoff?.lng ?? ''}`)
    .join('#');
  useEffect(() => {
    packages.forEach((p, i) => {
      if (p.destMode !== 'store' || p.destStoreId) return;
      if (p.dropoff?.lat == null || p.dropoff?.lng == null) return;
      void findDestStoresNear(i, p.dropoff.lat, p.dropoff.lng);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destSearchKey]);

  // Index-0 aliases. Everything outside the package cards (validation,
  // fare, review summary, booking payload) speaks about "the package",
  // and for a single-package run that is packages[0].
  const pkg0          = packages[0] ?? emptyPackage();
  const photos        = pkg0.photos;
  const description   = pkg0.description;
  const category      = pkg0.category;
  const weightKg      = pkg0.weightKg;
  const instructions  = pkg0.instructions;
  const declaredValue = pkg0.declaredValue;
  const receiverFirst = pkg0.receiverFirst;
  const receiverLast  = pkg0.receiverLast;
  const receiverPhone = pkg0.receiverPhone;
  const destMode      = pkg0.destMode;
  const fallbackPref  = pkg0.fallbackPref;
  const neighbourName = pkg0.neighbourName;
  const dropoff       = pkg0.dropoff;
  const dropoffQuery  = pkg0.dropoffQuery;
  const [activeField,  setActiveField]  = useState<Field | null>(null);
  const [predictions,  setPredictions]  = useState<Prediction[]>([]);
  const [searching,    setSearching]    = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // RECENT chips (founder 2026-08-23): senders repeat routes too. Last
  // 3 distinct pickups + dropoffs from package history, one tap refills.
  const [recentPickups, setRecentPickups] = useState<Array<{ address: string; lat: number; lng: number }>>([]);
  const [recentDrops,   setRecentDrops]   = useState<Array<{ address: string; lat: number; lng: number }>>([]);
  useEffect(() => {
    deliveriesApi.myDeliveries(1, 15)
      .then((r: any) => {
        const pick = (get: (d: any) => [string, number, number]) => {
          const seen = new Set<string>();
          const out: Array<{ address: string; lat: number; lng: number }> = [];
          for (const d of r?.items ?? []) {
            if ((d.kind ?? 'package') === 'ride') continue;
            const [a, lat, lng] = get(d);
            const addr = String(a ?? '').trim();
            if (!addr || seen.has(addr) || !Number(lat)) continue;
            seen.add(addr);
            out.push({ address: addr, lat: Number(lat), lng: Number(lng) });
            if (out.length >= 3) break;
          }
          return out;
        };
        setRecentPickups(pick((d) => [d.pickupAddress,  d.pickupLat,  d.pickupLng]));
        setRecentDrops(  pick((d) => [d.dropoffAddress, d.dropoffLat, d.dropoffLng]));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!draftReady || hydrated.current) return;
    hydrated.current = true;
    if (!hasContent()) return;
    setStep(draft.step ?? 0);
    // Drafts saved before multi-package shipped carry flat fields; fall
    // back to composing a single package from them so an in-flight draft
    // is not thrown away by the upgrade.
    const saved = Array.isArray((draft as any).packages) && (draft as any).packages.length
      ? ((draft as any).packages as PackageDraft[])
      : [{
          ...emptyPackage(),
          photos:        draft.photos ?? [],
          description:   draft.description ?? '',
          category:      (draft.category as CategoryId | null) ?? null,
          weightKg:      draft.weightKg ?? '',
          instructions:  draft.instructions ?? '',
          declaredValue: draft.declaredValue ?? '',
          receiverFirst: draft.receiverFirst ?? '',
          receiverLast:  draft.receiverLast ?? '',
          receiverPhone: (draft as any).receiverPhone ?? '',
          destMode:      draft.destMode ?? 'address',
          fallbackPref:  draft.fallbackPref ?? 'hand_only',
          neighbourName: draft.neighbourName ?? '',
          dropoff:       draft.dropoff ?? null,
          dropoffQuery:  draft.dropoffQuery ?? '',
        }];
    setPackages(saved);
    if (draft.pickup) { setPickup(draft.pickup); setPickupQuery(draft.pickupQuery ?? ''); }
    if (draft.vehicleId)     setVehicleId(draft.vehicleId as VehicleId);
    if (draft.scheduledDate) setScheduledDate(draft.scheduledDate);
    setScheduleNow(draft.scheduleNow ?? true);
    setScheduledHour(draft.scheduledHour ?? null);
    if (draft.paymentId) setPaymentId(draft.paymentId as PaymentId);
  // Runs once, when the stored draft is ready. Re-running would fight the
  // user's typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady]);

  // Mirror the form into the persisted draft. Only after hydration, or the
  // first render would immediately overwrite the saved draft with blanks.
  useEffect(() => {
    if (!hydrated.current) return;
    patchDraft({
      step, packages,
      pickup, pickupQuery,
      vehicleId, scheduleNow, scheduledDate, scheduledHour, paymentId,
    } as any);
  }, [
    step, packages, pickup, pickupQuery,
    vehicleId, scheduleNow, scheduledDate, scheduledHour, paymentId,
    patchDraft,
  ]);

  // Catalogue and policy values, fetched once on mount.
  useEffect(() => {
    configApi.serviceCatalog()
      .then(c => { if (Array.isArray(c) && c.length) setCatalog(c); })
      .catch(() => { /* fall back to PACKAGE_CATEGORIES below */ });
    /**
     * The RATE CARD decides what counts as high value, then the
     * catalogue row, then 100,000. Exactly the chain the server uses.
     *
     * This read the Fee Catalogue row on its own, and the server does
     * not: deliveries.service.ts and pricing.service.ts both take the
     * card's highValue.thresholdNgn first and fall back to the row only
     * when the card has none published (fixed 2026-08-28).
     *
     * The live card publishes 50,000 and the row holds 100,000, so the
     * two disagreed by the whole band between them. Found on the device
     * on 2026-08-29 by declaring 75,000: the app offered "Leave at gate"
     * and "Leave with neighbour", because 75,000 is under its 100,000,
     * while the server treats the same parcel as high value and refuses
     * exactly those two.
     *
     * That is the worst shape for this bug. The customer is not merely
     * shown the wrong rule, they are invited to choose an option the
     * booking will then be rejected for, after they have filled in
     * everything else.
     *
     * The threshold is public on /config/rate-card, redacted of nothing
     * that matters here, so the app can read the same number rather than
     * keeping its own opinion.
     */
    configApi.rateCard()
      .then((card: any) => {
        const fromCard = Number(card?.highValue?.thresholdNgn);
        if (Number.isFinite(fromCard) && fromCard > 0) {
          setHighValueNgn(fromCard);
          return null;
        }
        return feesApi.get('high_value_threshold_ngn');
      })
      .then((r: any) => {
        if (!r) return;
        const v = Number(r?.value);
        if (v > 0) setHighValueNgn(v);
      })
      .catch(() => {
        // Card unreachable: try the catalogue row, then keep 100,000.
        feesApi.get('high_value_threshold_ngn')
          .then(r => { const v = Number(r?.value); if (v > 0) setHighValueNgn(v); })
          .catch(() => { /* keep the compiled fallback, same as the server's */ });
      });
  }, []);

  const mapRef   = useRef<MapView>(null);

  // Real road-following polyline and km. durationText is deliberately
  // NOT read: SEIRS promises no arrival times (2026-08-23 sweep).
  const { coords: routeCoords, distanceText, distanceMeters } = useDirectionsPolyline(
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
  // A run's distance is pickup -> package 1 -> package 2 -> ..., which the
  // two-point hook above cannot express. Same hook the business app uses.
  const multi = useMultiStopDirections(
    packages.length > 1 && pickup ? { latitude: pickup.lat, longitude: pickup.lng } : null,
    packages.length > 1
      ? packages.filter(pk => pk.dropoff).map(pk => ({ latitude: pk.dropoff!.lat, longitude: pk.dropoff!.lng }))
      : [],
  );

  // The drop furthest from pickup. The server uses it to detect the
  // destination state and to floor the priced distance, neither of which
  // it could do when this was undefined on every multi-package run.
  const farthestDropCoords = useMemo(() => {
    if (!pickup) return undefined;
    let best: { latitude: number; longitude: number } | undefined;
    let bestD = -1;
    for (const pk of packages) {
      const dp = pk.dropoff;
      if (!dp) continue;
      const dLat = ((dp.lat - pickup.lat) * Math.PI) / 180;
      const dLng = ((dp.lng - pickup.lng) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2
        + Math.cos((pickup.lat * Math.PI) / 180) * Math.cos((dp.lat * Math.PI) / 180)
        * Math.sin(dLng / 2) ** 2;
      const d = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (d > bestD) { bestD = d; best = { latitude: dp.lat, longitude: dp.lng }; }
    }
    return best;
  }, [pickup, packages]);

  const distKmRoute = packages.length > 1
    ? (multi.distanceMeters != null ? multi.distanceMeters / 1000 : 0)
    : (distanceMeters != null ? distanceMeters / 1000 : 0);
  // Weight of the WHOLE run. This drives the vehicle recommendation, so
  // using package 1's weight alone would have suggested an okada for five
  // heavy parcels. For a single package the sum is that package, so this
  // is correct in both cases.
  const kg = packages.reduce((sum, pk) => sum + (parseFloat(pk.weightKg) || 0), 0);
  const codAmountNgn = codEnabled ? (Number(codAmount) || 0) : 0;
  const pickupCoords  = pickup  ? { latitude: pickup.lat,  longitude: pickup.lng  } : null;
  const dropoffCoords = dropoff ? { latitude: dropoff.lat, longitude: dropoff.lng } : null;
  // Safety hard-stops stay bundled in the rate card on purpose, so read
  // them from the active card rather than duplicating a list here.
  const forbiddenForCategory: string[] = category
    ? ((getActiveRateCard().categories as any)?.[category]?.forbiddenVehicles ?? [])
    : [];

  const localFare = calcFare(vehicleId, distKmRoute, kg, {
    categoryId: category, codAmountNgn,
    pickupCoords, dropoffCoords,
  });

  // calcFare prices a single package from the bundled rate card. A run of
  // several packages has to be priced by the server, which knows the live
  // card, the per-category surcharges and the multi-stop discount.
  const [runQuote, setRunQuote] = useState<any>(null);
  // Bumped when the server refuses an expired quote pin: re-prices and re-shows.
  const [quoteNonce, setQuoteNonce] = useState(0);
  const [runQuoteError, setRunQuoteError] = useState<string | null>(null);
  // Review: which package's own summary is open, and the consent gate.
  const [expandedPkg, setExpandedPkg] = useState<number | null>(null);
  const [tcAgreed, setTcAgreed] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  useEffect(() => {
    // Every booking is priced by the engine that will charge it. The
    // first live booking proved why: the local formula showed 2,144 and
    // the server charged 1,684, because the two disagreed about regional
    // rates and a deprecated service fee. No route yet means nothing to
    // quote, so the local estimate holds the screen until one resolves.
    if (!(distKmRoute > 0) || !vehicleId) { setRunQuote(null); setRunQuoteError(null); return; }
    const pkgs = packages.map(pk => ({
      categoryCode: pk.category ?? 'standard_parcel',
      weightKg:     parseFloat(pk.weightKg) || 0,
    }));
    let cancelled = false;
    setRunQuote(null);
    setRunQuoteError(null);
    pricingApi.quote({
      vehicleType:  vehicleId,
      categoryCode: pkgs[0]?.categoryCode ?? 'standard_parcel',
      km:           distKmRoute,
      stopCount:    packages.length,
      weightKg:     pkgs.reduce((a, b) => a + b.weightKg, 0),
      // Mirror create(): a single package books with zero dwell, so the
      // quote must price with zero dwell or the two drift again.
      // Deliberately not sent. The engine derives waiting from the run's
      // own shape (stops, weight, category setup, per-stop buffer), which
      // is the same figure the booking charges. Sending a flat four
      // minutes a stop from here made the quote disagree with the charge
      // and let the weight ladder on the card go unread (2026-08-27).
      declaredValueNgn: packages.reduce((sum, pk) => sum + (Number(pk.declaredValue) || 0), 0) || undefined,
      // The blended per-package path is for real runs only.
      packages:     packages.length > 1 ? pkgs : undefined,
      pickupCoords:  pickup  ? { latitude: pickup.lat,  longitude: pickup.lng  } : undefined,
      // Was single-package only, so a multi-package run sent no dropoff at
      // all and the engine could not detect the destination state: its
      // zone tier needs BOTH ends and silently charged nothing without
      // them (2026-08-27). Furthest drop, because that is the leg that
      // decides the zone on a multi-drop run.
      dropoffCoords: farthestDropCoords,
      // Price the booking for WHEN it happens, not for when the sender
      // is looking at the screen (2026-08-25). The rate card prices
      // night, peak and weekend surcharges off scheduledAt, and
      // create() below already sends scheduledFor, so the quote and the
      // booking were pricing two different moments: a run booked at
      // 22:40 for a 9 AM pickup carried tonight's NIGHT surcharge. The
      // pin means the sender is charged the reviewed number either way,
      // so the wrong one was simply the one they saw and paid.
      scheduledAt: !scheduleNow && scheduledHour != null
        ? buildScheduledFor(scheduledDate, scheduledHour).toISOString()
        : undefined,
    } as any)
      .then((q: any) => { if (!cancelled) setRunQuote(q); })
      .catch((e: any) => { if (!cancelled) setRunQuoteError(e?.message ?? 'Could not price this booking.'); });
    return () => { cancelled = true; };
  }, [packages, vehicleId, distKmRoute, pickup, scheduleNow, scheduledDate, scheduledHour, quoteNonce]);

  // Never silently fall back to the single-package number for a run: a
  // wrong total is worse than an honest "not priced yet".
  const runTotal = Number(runQuote?.customer?.total ?? 0);

  /**
   * For a run, take the WHOLE breakdown from the server, not just the
   * total.
   *
   * Spreading localFare and overriding only `total` looked harmless and
   * was not: every itemised line (base, distance, weight, VAT) would
   * still have been the single-package figure, so the breakdown on screen
   * would not add up to the total charged. A fare whose lines contradict
   * its total is exactly the kind of quiet untruth this whole sweep has
   * been removing.
   */
  const fare = runQuote?.customer
    ? (() => {
        const c = runQuote.customer;
        const time = c.timeSurcharges ?? {};
        const zone = c.zoneSurcharges ?? {};
        const timeLabels = Object.entries(time)
          .filter(([, v]) => Number(v) > 0)
          .map(([k]) => k);
        return {
          ...localFare,
          base:              Number(c.base ?? 0),
          dist:              Number(c.distanceLabour ?? 0),
          distFuel:          Number(c.distanceFuel ?? 0),
          // The server prices weight inside the per-package figures rather
          // than as its own line, so showing a separate weight surcharge
          // here would double-count it.
          weight:            0,
          handling:          Number(c.stopBonuses ?? 0) + Number(c.dwellOver ?? 0) + Number(c.partnerHandling ?? 0),
          // Service fee is now a REAL engine line (founder ruling
          // 2026-08-22): render exactly what the server charged, which
          // is 0 until the admin publishes a value. COD and insurance
          // remain engine-absent and stay zeroed.
          service:   Number(c.serviceFee ?? 0),
          // Declaring a value above the card's threshold adds a real
          // premium to what you pay (pricing.service computes it and
          // folds it into total). It was charged and never shown, which
          // is the "hidden non-zero fee" the summary below calls a lie
          // (found on device 2026-08-23 declaring N150,000).
          highValue: Number(c.highValuePremium ?? 0),
          codFee:    0,
          insurance: 0,
          discounts: {
            bulk:      Number(c.discounts?.bulk ?? 0),
            recurring: Number(c.discounts?.recurring ?? 0),
            welcome:   Number(c.discounts?.welcome ?? 0),
            loyalty:   Number(c.discounts?.loyalty ?? 0),
          },
          categorySurcharge: Number(c.categorySurcharge ?? 0),
          timeSurcharge:     Object.values(time).reduce((a: number, b: any) => a + Number(b || 0), 0),
          timeLabels,
          zoneSurcharge:     Number(zone.interState ?? 0) + Number(zone.longDistance ?? 0) + Number(zone.restricted ?? 0),
          zoneFlat:          Number(zone.overnight ?? 0),
          /**
           * Why the geography cost extra (2026-08-31).
           *
           * The engine has bucketed a 15 to 40 percent uplift into one
           * unnamed "zone surcharge" number since the state-aware tier
           * shipped, so a sender watching a Lagos to Abuja quote come
           * back far above a local one had nothing telling them it was
           * the distance between two states. An uplift whose cause the
           * payer cannot see is indistinguishable from a scam, which is
           * the standard the zone NOTICES were already held to.
           */
          route:             runQuote?.route ?? null,
          vat:               Number(c.vat ?? 0),
          total:             runTotal,
        };
      })()
    : localFare;

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
    const pi = pkgIndexOf(field);
    if (pi === null) setPickupQuery(text); else updatePkg(pi, { dropoffQuery: text });
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
      const pi = pkgIndexOf(activeField);
      if (pi === null) {
        if (pickupMode === 'store') {
          // In counter mode the typed place is only the SEARCH
          // CENTRE; the pickup becomes whichever counter they pick.
          setPickupQuery(picked.address);
          setStorePicked(null);
          findStoresNear(picked.lat, picked.lng);
        } else {
          setPickup(picked); setPickupQuery(picked.address);
        }
      }
      else             { updatePkg(pi, { dropoff: picked, dropoffQuery: picked.address }); }
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
      const pi = pkgIndexOf(field);
      if (pi === null) { setPickup(picked); setPickupQuery(address); }
      else             { updatePkg(pi, { dropoff: picked, dropoffQuery: address }); }
      setPredictions([]);
      setActiveField(null);
      Keyboard.dismiss();
    } finally { setSearching(false); }
  };

  const clearField = (field: Field) => {
    const pi = pkgIndexOf(field);
    if (pi === null) { setPickup(null); setPickupQuery(''); }
    else             { updatePkg(pi, { dropoff: null, dropoffQuery: '' }); }
    setPredictions([]);
  };

  // ── Photo picker ─────────────────────────────────────────────────────────
  /**
   * Camera first, library second (2026-08-29).
   *
   * This went straight to launchImageLibraryAsync, so the only way to add
   * the REQUIRED parcel photo was to browse the phone's whole media
   * library. For an app whose entire premise is a person standing over a
   * parcel with a phone in their hand, the camera was not offered at all.
   *
   * Two things were wrong with that, found by tapping Add on a real
   * device rather than reading the code:
   *
   *   The obvious one: the sender has to leave, open the camera, take a
   *   picture, come back and hunt for it. Nobody does that. They pick
   *   any old image, and the photo stops being evidence of the parcel.
   *
   *   The one that matters more: the picker opened into the sender's
   *   private photo library. On the founder's own device the first
   *   screen included a screenshot of card details and another of
   *   saved wifi passwords. SEIRS should not be routing anybody through
   *   that to send a package.
   *
   * The library stays as the second option, because a photo taken
   * earlier is legitimate, but it now asks for images only rather than
   * every file on the device.
   */
  const pickFromLibrary = async (pkgIndex: number) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      showDialog({ title: t('send.alertPermissionTitle'), message: t('send.alertPermissionBody') });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!result.canceled && result.assets[0]) {
      updatePkg(pkgIndex, {
        photos: [...(packages[pkgIndex]?.photos ?? []), result.assets[0].uri],
      });
    }
  };

  const takePhoto = async (pkgIndex: number) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      showDialog({
        title: t('send.alertCameraTitle', { defaultValue: 'Camera not allowed' }),
        message: t('send.alertCameraBody', {
          defaultValue: 'SEIRS needs the camera to photograph your parcel. You can turn it on in your phone settings, or choose a photo you already have.',
        }),
      });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      updatePkg(pkgIndex, {
        photos: [...(packages[pkgIndex]?.photos ?? []), result.assets[0].uri],
      });
    }
  };

  const addPhoto = async (pkgIndex = 0) => {
    if ((packages[pkgIndex]?.photos.length ?? 0) >= 5) return;
    showDialog({
      title: t('send.photoSourceTitle', { defaultValue: 'Add a photo of your parcel' }),
      message: t('send.photoSourceBody', {
        defaultValue: 'A clear photo of the parcel protects you if anything is disputed later.',
      }),
      actions: [
        {
          text: t('send.photoTake', { defaultValue: 'Take a photo' }),
          style: 'primary',
          onPress: () => { void takePhoto(pkgIndex); },
        },
        {
          text: t('send.photoChoose', { defaultValue: 'Choose an existing one' }),
          onPress: () => { void pickFromLibrary(pkgIndex); },
        },
      ],
    });
  };

  // ── Step navigation ──────────────────────────────────────────────────────
  const next = () => {
    if (step === 0) {
      const bad = packages.findIndex(pk =>
        pk.photos.length === 0 || !pk.category || !(parseFloat(pk.weightKg) > 0) ||
        !pk.receiverFirst.trim() || (pk.destMode === 'address' && !pk.dropoff));
      if (bad > 0) {
        failField('photos', t('send.errPackageIncomplete', {
          defaultValue: `Package ${bad + 1} is missing something: each package needs a photo, category, weight, receiver and destination.`,
        }));
        return;
      }
    }
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
    /**
     * Counter mode is not chosen until a counter is (2026-08-31).
     *
     * Without this the run falls through with destStoreId null and
     * quietly becomes an ordinary delivery to whatever area the sender
     * typed in order to FIND the shop, which is a street corner, not an
     * address anyone can hand a package to. Checked across every package
     * because each one picks its own counter.
     */
    if (step === 0 && packages.some(p => p.destMode === 'store' && !p.destStoreId)) {
      failField('dropoff', t('send.errDestCounterMissing', {
        defaultValue: 'Pick the counter the receiver will collect from.',
      }));
      return;
    }
    if (step === 1 && pickupMode === 'store' && !storePicked) {
      failField('pickup', t('send.errCounterMissing', { defaultValue: 'Pick the counter you will drop it at.' }));
      return;
    }
    if (step === 1 && !pickup)  { failField('pickup',  t('send.errPickupMissing'));  return; }

    /**
     * A scheduled pickup must be in the future (2026-08-29).
     *
     * The only guard was "an hour has been chosen", and the only thing
     * that cleared a stale hour was tapping the date again. So a draft
     * carrying yesterday's 5 AM, or a customer who picked 5 AM at 4 AM
     * and finished the form at 6, sailed through: the review screen
     * cheerfully read "Scheduled for Friday, 28 Aug, 05:00" at half past
     * eleven that night, and Pay was live.
     *
     * Reproduced on device. The date is now checked, not just its
     * presence, and the message says what to do rather than what is
     * wrong.
     */
    if (step === 1 && !scheduleNow && scheduledHour != null) {
      const when = buildScheduledFor(scheduledDate, scheduledHour);
      if (when.getTime() <= Date.now()) {
        failField('schedule', t('send.errSchedulePast', {
          defaultValue: 'That pickup time has already passed. Pick a later hour, or tomorrow.',
        }));
        return;
      }
    }
    if (step === 1 && !scheduleNow && scheduledHour == null) {
      failField('schedule', t('send.errScheduleTime'));
      return;
    }
    setInvalidField(null);
    setError('');
    if (step === 1 && category) setVehicleId(autoRecommend(category, kg));
    if (step === 2) {
      // Same race the business app had: pick the ride before the route
      // resolves and the muted card never fires. Re-check with the final
      // distance HERE, where changing the ride is one tap away, never on
      // a later step that cannot fix it (business deadlock, 2026-08-21).
      const card: any = getActiveRateCard();
      const rec = (card?.package?.vehicles ?? []).find((x: any) => x.id === vehicleId) ?? {};
      const vMaxKm = Number(rec?.maxRouteKm ?? (vehicleId === 'bicycle' ? BICYCLE_MAX_KM_FALLBACK : 0));
      if (vMaxKm > 0 && distKmRoute > vMaxKm) {
        setError(t('send.errVehicleKm', {
          defaultValue: `That ride only does trips under ${vMaxKm}km. This trip is ${Math.round(distKmRoute)}km: pick another.`,
        }));
        return;
      }
    }
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

  // Hardware back mirrors the header arrow: one step back, never a
  // silent pop to Home from the middle of a booking (overnight finding
  // 2026-08-22). The draft already survives; this keeps the CONTEXT.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 0) return false; // step 0: let the system pop normally
      back();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleBook = async () => {
    // Every booking is priced by the server. If that quote has not
    // arrived, or it failed, refuse to book rather than charge a total
    // the customer never saw. This is what "shown and charged can never
    // drift" costs: a moment of waiting instead of a silent lie.
    if (!(runTotal > 0)) {
      setError(runQuoteError ?? t('send.errRunNotPriced', {
        defaultValue: 'Still working out the price for this run. Give it a moment and try again.',
      }));
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Upload per package, so each DeliveryStop carries its own photos
      // rather than the whole run sharing package 1's.
      const uploaded: string[][] = [];
      for (const pk of packages) {
        const forThis: string[] = [];
        for (const uri of pk.photos) {
          // "Send again" prefills a package with the photos of the run it
          // was copied from, and those are already on our CDN. Passing an
          // https URL to uploadApi.file treats it as a local file handle
          // and fails, so an already-hosted photo rides through as-is and
          // only camera or library URIs are uploaded.
          if (/^https?:\/\//i.test(uri)) { forThis.push(uri); continue; }
          const { url } = await uploadApi.file(uri);
          forThis.push(url);
        }
        uploaded.push(forThis);
      }
      const urls = uploaded[0] ?? [];
      const created: any = await deliveriesApi.create({
        // The signed pin makes the review's number the charged number.
        quoteToken: runQuote?.quotePin?.token,
        termsAccepted: tcAgreed,
        // Promo code the customer saved on /promo. It is carried, never
        // redeemed early: POST /promotions/redeem burns the customer's one
        // allowed use, so redemption must happen here, once, against a real
        // subtotal. The backend delivery DTO does not read this field yet,
        // so it is stripped by the validation whitelist until it does.
        promoCode: draft.promoCode || undefined,
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
        // One run, one driver, one payment, one DeliveryStop per package,
        // each with its own public tracking code. Omitted for a lone
        // package so that path stays byte-identical to before, UNLESS it
        // names a collection counter: destinationStoreId is a stop
        // column, so a single package going to a counter has to carry a
        // stop row to hold it (2026-08-31).
        ...(packages.length > 1 || packages.some(p => p.destStoreId)
          ? {
              stops: packages.map((pk, i) => ({
                address:        pk.dropoff?.address ?? pk.dropoffQuery,
                lat:            pk.dropoff?.lat ?? 0,
                lng:            pk.dropoff?.lng ?? 0,
                recipientName:  [pk.receiverFirst, pk.receiverLast].filter(Boolean).join(' ').trim(),
                recipientPhone: pk.receiverPhone.trim(),
                receiverFirstName: pk.receiverFirst.trim() || undefined,
                receiverLastName:  pk.receiverLast.trim()  || undefined,
                packageDescription: pk.description.trim() || undefined,
                categoryCode:   pk.category ?? undefined,
                weightKg:       parseFloat(pk.weightKg) || undefined,
                declaredValueNgn: Number(pk.declaredValue) > 0 ? Number(pk.declaredValue) : undefined,
                fallbackPref:   pk.fallbackPref,
                fallbackNeighbourName: pk.fallbackPref === 'neighbour'
                  ? (pk.neighbourName.trim() || undefined) : undefined,
                packagePhotoUrls: uploaded[i]?.length ? uploaded[i] : undefined,
                notes:          pk.instructions.trim() || undefined,
                // The counter this package is collected from, when the
                // receiver is picking it up instead of taking it at a door.
                destinationStoreId: pk.destStoreId ?? undefined,
              })),
            }
          : {}),
      } as any);
      clearDraft();
      // The CTA said "Pay" so paying is what happens next: straight into
      // the payment screen for the booking just made. Landing on My
      // Trips with a Pending card made the button a small lie
      // (founder 2026-08-21). History remains the fallback if the id is
      // ever missing.
      if (created?.id) {
        router.replace({
          pathname: '/(customer)/payment/[deliveryId]',
          params: {
            deliveryId:   created.id,
            price:        String(Number(created.price ?? 0)),
            trackingCode: created.trackingCode ?? '',
          },
        } as any);
      } else {
        router.replace('/(customer)/(tabs)/history');
      }
    } catch (e: any) {
      // An expired pin means the price may have moved: re-quote so the
      // number on this screen is current before they tap Pay again.
      if (/expired/i.test(String(e?.message ?? ''))) setQuoteNonce(n => n + 1);
      setError(e.message ?? t('send.errBookingFailed'));
    } finally {
      setLoading(false);
    }
  };

  const highlight = (active: boolean) => ({
    borderColor:     active ? theme.accent : theme.border,
    backgroundColor: active ? (isDark ? '#163050' : '#EBF5FF') : theme.surface,
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
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xl + keyboardHeight }}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
        >
          {/* Banner only for errors with no single field to point at
              (booking failures, network). Missing-field messages now
              render under the field itself. */}
          {/* Errors render in the footer, business-style: on screen at
              every scroll position, next to the button that caused them. */}

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
                <Illustration name={slot.name} size={130} />
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
              {packages.map((pk, pkgIndex) => {
              // Shadow the index-0 aliases with THIS package's values, so the
              // card body below reads the same names whichever card it is.
              const { photos, description, category, weightKg, receiverFirst,
                      receiverLast, receiverPhone, destMode, dropoff,
                      dropoffQuery, destStoreId, destStoreName,
                      fallbackPref, neighbourName, declaredValue,
                      instructions } = pk;
              return (
              <View key={pkgIndex} style={[styles.pkgCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.pkgHead}>
                  <Text style={[styles.pkgTitle, { color: theme.text }]}>
                    {t('send.packageN', { n: pkgIndex + 1, defaultValue: `Package ${pkgIndex + 1}` })}
                  </Text>
                  {packages.length > 1 && (
                    <Pressable onPress={() => removePackage(pkgIndex)} hitSlop={8}>
                      <X size={16} color={theme.error} strokeWidth={2.5} />
                    </Pressable>
                  )}
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
                      onPress={() => updatePkg(pkgIndex, { photos: photos.filter((_, j) => j !== i) })}
                    >
                      <X size={12} color="#fff" strokeWidth={3} />
                    </Pressable>
                  </View>
                ))}
                {photos.length < 5 && (
                  <Pressable
                    style={[styles.photoAdd, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}
                    onPress={() => addPhoto(pkgIndex)}
                  >
                    <Camera size={24} color={theme.accent} strokeWidth={1.75} />
                    <Text style={[styles.photoAddText, { color: theme.textSecond }]}>{t('send.addPhoto')}</Text>
                  </Pressable>
                )}
              </View>
              {invalidField === 'photos' && (
                <Text style={[styles.fieldError, { color: theme.error }]}>{error}</Text>
              )}

              <Text style={[styles.label, { color: theme.textSecond }]}>{t('send.description')}</Text>
              <TextInput
                onFocus={handleFieldFocus}
                style={[styles.input, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, color: theme.text }]}
                placeholder={t('send.descPlaceholder')}
                placeholderTextColor={theme.textThird}
                value={description}
                onChangeText={v => updatePkg(pkgIndex, { description: v })}
              />

              <View onLayout={onFieldLayout('weight')}>
                <Text style={[styles.label, { color: theme.textSecond }]}>
                  {t('send.weightKg')} <Text style={{ color: theme.error }}>*</Text>
                </Text>
                <TextInput
                  onFocus={handleFieldFocus}
                  style={[styles.input, { backgroundColor: theme.surfaceSecond, borderColor: fieldBorder('weight'), borderWidth: invalidField === 'weight' ? 2 : 1, color: theme.text }]}
                  placeholder={t('send.weightPlaceholder')}
                  placeholderTextColor={theme.textThird}
                  keyboardType="decimal-pad"
                  value={weightKg}
                  onChangeText={v => { updatePkg(pkgIndex, { weightKg: onlyDecimal(v) }); if (invalidField === 'weight') { setInvalidField(null); setError(''); } }}
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
                    onPress={() => {
                      updatePkg(pkgIndex, { category: cat.id });
                      if (invalidField === 'category') { setInvalidField(null); setError(''); }
                    }}
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
                    onFocus={handleFieldFocus}
                    style={[styles.input, { flex: 1, backgroundColor: theme.surfaceSecond, borderColor: fieldBorder('receiver'), borderWidth: invalidField === 'receiver' ? 2 : 1, color: theme.text }]}
                    placeholder={t('send.receiverFirst', { defaultValue: 'First name' })}
                    placeholderTextColor={theme.textThird}
                    value={receiverFirst}
                    onChangeText={v => { updatePkg(pkgIndex, { receiverFirst: onlyName(v) }); if (invalidField === 'receiver') { setInvalidField(null); setError(''); } }}
                  />
                  <TextInput
                    onFocus={handleFieldFocus}
                    style={[styles.input, { flex: 1, backgroundColor: theme.surfaceSecond, borderColor: theme.border, color: theme.text }]}
                    placeholder={t('send.receiverLast', { defaultValue: 'Last name' })}
                    placeholderTextColor={theme.textThird}
                    value={receiverLast}
                    onChangeText={v => updatePkg(pkgIndex, { receiverLast: onlyName(v) })}
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
                onFocus={handleFieldFocus}
                style={[styles.input, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, color: theme.text }]}
                placeholder={t('send.receiverPhone', { defaultValue: '08012345678' })}
                placeholderTextColor={theme.textThird}
                keyboardType="phone-pad"
                value={receiverPhone}
                onChangeText={v => updatePkg(pkgIndex, { receiverPhone: onlyPhone(v) })}
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
                        /**
                         * Counter drop is chosen HERE now (2026-08-31).
                         *
                         * This used to push the sender into the separate
                         * walk-in flow, abandoning the run they were part
                         * way through building, because that flow is a
                         * different product with its own drop code and QR.
                         * A counter as the DESTINATION is not that product:
                         * it is this run, ending at a shop instead of a
                         * door, which is what the business app has done per
                         * package since its rebuild.
                         */
                        updatePkg(pkgIndex, {
                          destMode: opt.key,
                          destStoreId: null,
                          destStoreName: null,
                        });
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
              {/* One address box for both modes. In counter mode the place
                  typed here is only the AREA to search: the counter chosen
                  below becomes the actual destination, exactly as the
                  business app does it. */}
              {(
                <>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.surfaceSecond, borderColor: fieldBorder('dropoff'), borderWidth: invalidField === 'dropoff' ? 2 : 1, color: theme.text }]}
                    value={dropoffQuery}
                    onChangeText={(v) => { onChangeQuery(`pkg:${pkgIndex}`, v);
                      if (invalidField === 'dropoff') { setInvalidField(null); setError(''); } }}
                    onFocus={(e) => { setActiveField(`pkg:${pkgIndex}`); handleFieldFocus(e, 220); }}
                    placeholder={destMode === 'store'
                      ? t('send.destStoreAreaPlaceholder', { defaultValue: 'Area the receiver is in, e.g. Yaba' })
                      : t('send.destAddressPlaceholder',   { defaultValue: 'Street, area, city' })}
                    placeholderTextColor={theme.textThird}
                  />
                  {invalidField === 'dropoff' && (
                    <Text style={[styles.fieldError, { color: theme.error }]}>{error}</Text>
                  )}

                  {destMode === 'address' && !dropoff && !dropoffQuery && recentDrops.length > 0 && (
                    <View style={styles.recentRow}>
                      <Text style={[styles.recentLabel, { color: theme.textThird }]}>
                        {t('send.recent', { defaultValue: 'RECENT' })}
                      </Text>
                      {recentDrops.map((r) => (
                        <Pressable
                          key={r.address}
                          style={[styles.recentChip, { borderColor: theme.border, backgroundColor: theme.surfaceSecond }]}
                          onPress={() => { updatePkg(pkgIndex, { dropoff: { address: r.address, lat: r.lat, lng: r.lng }, dropoffQuery: r.address }); setPredictions([]); }}
                        >
                          <Ionicons name="time-outline" size={13} color={theme.textSecond} />
                          <Text style={[styles.recentTxt, { color: theme.text }]} numberOfLines={1}>{r.address}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {activeField === `pkg:${pkgIndex}` && predictions.length > 0 && (
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
                  {/* The counter this package is collected from. Same card
                      the pickup counter uses, so both ends of a run look
                      like one control rather than two designs. */}
                  {destMode === 'store' && destStoreId && (
                    <Pressable style={[styles.scheduleOpt, highlight(true)]}>
                      <Store size={20} color={theme.accent} strokeWidth={1.75} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.scheduleTitle, { color: theme.text }]} numberOfLines={1}>
                          {destStoreName}
                        </Text>
                        <Text style={[styles.scheduleDesc, { color: theme.textSecond }]} numberOfLines={2}>
                          {t('send.destStorePicked', { defaultValue: 'The receiver collects it here.' })}
                        </Text>
                      </View>
                      <Pressable
                        hitSlop={10}
                        onPress={() => {
                          updatePkg(pkgIndex, { destStoreId: null, destStoreName: null });
                          if (dropoff?.lat != null && dropoff?.lng != null) {
                            void findDestStoresNear(pkgIndex, dropoff.lat, dropoff.lng);
                          }
                        }}
                      >
                        <Ionicons name="close-circle" size={20} color={theme.textThird} />
                      </Pressable>
                    </Pressable>
                  )}

                  {destMode === 'store' && !destStoreId && (
                    <View>
                      {destStoresBusy[pkgIndex] && (
                        <View style={{ paddingVertical: Spacing.md, alignItems: 'center' }}>
                          <ActivityIndicator color={theme.primary} />
                        </View>
                      )}
                      {!destStoresBusy[pkgIndex] && !dropoff && (
                        <Text style={[styles.scheduleDesc, { color: theme.textThird, marginTop: Spacing.xs }]}>
                          {t('send.destStoreFindHint', { defaultValue: 'Type the area the receiver is in to see counters near them.' })}
                        </Text>
                      )}
                      {!destStoresBusy[pkgIndex] && !!dropoff && (destStores[pkgIndex]?.length ?? 0) === 0 && (
                        <Text style={[styles.scheduleDesc, { color: theme.textThird, marginTop: Spacing.xs }]}>
                          {t('send.destStoreNone', { defaultValue: 'No counter near there yet. Send to an address instead.' })}
                        </Text>
                      )}
                      {!destStoresBusy[pkgIndex] && (destStores[pkgIndex] ?? []).map((st: any) => (
                        <Pressable
                          key={st.id}
                          style={[styles.scheduleOpt, highlight(false), { marginBottom: Spacing.sm }]}
                          onPress={() => chooseDestStore(pkgIndex, st)}
                        >
                          <Store size={20} color={theme.textSecond} strokeWidth={1.75} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.scheduleTitle, { color: theme.text }]} numberOfLines={1}>{st.storeName}</Text>
                            <Text style={[styles.scheduleDesc, { color: theme.textSecond }]} numberOfLines={1}>{st.storeAddress}</Text>
                          </View>
                          {st.distanceKm != null && (
                            <Text style={[styles.scheduleDesc, { color: theme.textThird }]}>
                              {Number(st.distanceKm).toFixed(1)} km
                            </Text>
                          )}
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
                  if (blocked && active) setTimeout(() => updatePkg(pkgIndex, { fallbackPref: 'hand_only' }), 0);
                  return (
                    <Pressable
                      key={opt.key}
                      disabled={blocked}
                      style={[styles.timeChip, {
                        backgroundColor: active ? theme.accent : theme.surfaceSecond,
                        borderColor: active ? theme.accent : theme.border,
                        opacity: blocked ? 0.4 : 1,
                      }]}
                      onPress={() => updatePkg(pkgIndex, { fallbackPref: opt.key })}
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
                  onFocus={handleFieldFocus}
                  style={[styles.input, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, color: theme.text }]}
                  placeholder={t('send.neighbourName', { defaultValue: "Neighbour or security's name" })}
                  placeholderTextColor={theme.textThird}
                  value={neighbourName}
                  onChangeText={v => updatePkg(pkgIndex, { neighbourName: v })}
                />
              )}

              <Text style={[styles.label, { color: theme.textSecond }]}>
                {t('send.declaredValue', { defaultValue: 'Package value in NGN (optional)' })}
              </Text>
              <TextInput
                onFocus={handleFieldFocus}
                style={[styles.input, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, color: theme.text }]}
                placeholder={t('send.declaredValueHint', { defaultValue: 'e.g. 150000' })}
                placeholderTextColor={theme.textThird}
                keyboardType="number-pad"
                value={declaredValue}
                onChangeText={v => updatePkg(pkgIndex, { declaredValue: v })}
              />
              <Text style={{ fontSize: FontSize.xs, color: theme.textThird, marginTop: -Spacing.xs, marginBottom: Spacing.sm }}>
                {t('send.declaredValueNote', { defaultValue: 'High-value packages get ID-verified handoff.' })}
              </Text>

              <Text style={[styles.label, { color: theme.textSecond }]}>
                {t('send.instructions', { defaultValue: 'Instructions for driver (optional)' })}
              </Text>
              <TextInput
                onFocus={handleFieldFocus}
                style={[styles.input, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, color: theme.text, minHeight: 70, textAlignVertical: 'top' }]}
                placeholder={t('send.instructionsPlaceholder', { defaultValue: 'e.g. Call when you reach the gate. Ask for security.' })}
                placeholderTextColor={theme.textThird}
                value={instructions}
                onChangeText={v => updatePkg(pkgIndex, { instructions: v })}
                multiline
                maxLength={500}
              />
              </View>
              );
              })}

              {/* One run, one driver, one payment, a tracking code per
                  package. Business has booked this way since its rebuild;
                  the customer app could only ever send one thing. */}
              {packages.length < MAX_PACKAGES ? (
                <>
                  <Pressable
                    style={[styles.addPkgBtn, { borderColor: theme.accent, backgroundColor: theme.accent + '10' }]}
                    onPress={addPackage}
                  >
                    <Text style={[styles.addPkgText, { color: theme.accent }]}>
                      {t('send.addAnotherPackage', { defaultValue: '+  Add another package' })}
                    </Text>
                  </Pressable>
                  <Text style={{ fontSize: FontSize.xs, color: theme.textThird }}>
                    {t('send.packagesSoFar', {
                      count: packages.length,
                      defaultValue: `${packages.length} package${packages.length === 1 ? '' : 's'} so far. Each one gets its own tracking code, and you pay once.`,
                    })}
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: FontSize.xs, color: theme.textSecond }}>
                  {t('send.packagesCapped', {
                    n: MAX_PACKAGES,
                    defaultValue: `${MAX_PACKAGES} packages is the most one run can carry. Book the rest as a second run.`,
                  })}
                </Text>
              )}
            </View>
          )}

          {/* STEP 1: Address (inline autocomplete + map underneath) */}
          {step === 1 && (
            <View style={styles.stepGap}>
              {/* Ported from the business app's Pickup step, card for
                  card (founder 2026-08-21: exactly like the business
                  app). Dropping at a counter removes the door-pickup
                  leg: the sender walks the package in whenever the shop
                  is open and a rider collects there. */}
              <Text style={[styles.label, { color: theme.textSecond, marginTop: 0 }]}>
                {t('send.howGetPackages')} <Text style={{ color: theme.error }}>*</Text>
              </Text>
              {([
                { key: 'door',  icon: Bike,  titleKey: 'pickupModeDoor',  subKey: 'pickupModeDoorSub'  },
                { key: 'store', icon: Store, titleKey: 'pickupModeStore', subKey: 'pickupModeStoreSub' },
              ] as const).map(opt => {
                const active = pickupMode === opt.key;
                const ModeIcon = opt.icon;
                return (
                  <Pressable
                    key={opt.key}
                    style={[styles.scheduleOpt, highlight(active)]}
                    onPress={() => {
                      setPickupMode(opt.key);
                      if (opt.key === 'door') {
                        // Leaving store mode drops the counter as pickup.
                        if (storePicked) { setStorePicked(null); setPickup(null as any); setPickupQuery(''); }
                      } else if (pickup) {
                        findStoresNear(pickup.lat, pickup.lng);
                      }
                    }}
                  >
                    <View style={{
                      width: 38, height: 38, borderRadius: 12,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: active ? theme.accent : theme.surfaceSecond,
                    }}>
                      <ModeIcon size={18} color={active ? '#fff' : theme.textSecond} strokeWidth={1.75} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.scheduleTitle, { color: theme.text }]}>{t(`send.${opt.titleKey}`)}</Text>
                      <Text style={[styles.scheduleDesc, { color: theme.textSecond }]}>{t(`send.${opt.subKey}`)}</Text>
                    </View>
                    {active && <CheckCircle size={18} color={theme.accent} strokeWidth={2} />}
                  </Pressable>
                );
              })}

              <Text style={[styles.label, { color: theme.textSecond }]}>
                {pickupMode === 'store' ? t('send.findCounterNear') : t('send.pickupAddressLabel')} <Text style={{ color: theme.error }}>*</Text>
              </Text>
              <View style={[styles.inputBlock, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
                <View style={styles.inputRow}>
                  <TextInput
                    value={pickupQuery}
                    onChangeText={(t) => onChangeQuery('pickup', t)}
                    onFocus={(e) => { setActiveField('pickup'); handleFieldFocus(e, 220); }}
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

              {/* Always on screen, like business: finding yourself
                  should not require discovering that focusing the field
                  reveals the option. */}
              <Pressable style={styles.useLocBtn} onPress={() => useMyLocation('pickup')}>
                <Ionicons name="locate" size={16} color={theme.primary} />
                <Text style={[styles.useLocText, { color: theme.primary }]}>{t('send.useMyLocation')}</Text>
                {searching && <ActivityIndicator size="small" color={theme.primary} />}
              </Pressable>

              {pickupMode === 'door' && !pickup && !pickupQuery && recentPickups.length > 0 && (
                <View style={styles.recentRow}>
                  <Text style={[styles.recentLabel, { color: theme.textThird }]}>
                    {t('send.recent', { defaultValue: 'RECENT' })}
                  </Text>
                  {recentPickups.map((r) => (
                    <Pressable
                      key={r.address}
                      style={[styles.recentChip, { borderColor: theme.border, backgroundColor: theme.surfaceSecond }]}
                      onPress={() => { setPickup({ address: r.address, lat: r.lat, lng: r.lng }); setPickupQuery(r.address); setPredictions([]); }}
                    >
                      <Ionicons name="time-outline" size={13} color={theme.textSecond} />
                      <Text style={[styles.recentTxt, { color: theme.text }]} numberOfLines={1}>{r.address}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {pickupMode === 'store' && storePicked && (
                <Pressable
                  style={[styles.scheduleOpt, highlight(true)]}
                  onPress={() => {
                    const st = storePicked;
                    showDialog({
                      title: st.storeName,
                      message:
                        `${st.storeAddress}` +
                        (st.openingHours ? `\n\nHours: ${st.openingHours}` : '') +
                        (st.phone ? `\nPhone: ${st.phone}` : ''),
                    });
                  }}
                >
                  <Store size={20} color={theme.accent} strokeWidth={1.75} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.scheduleTitle, { color: theme.text }]} numberOfLines={1}>{storePicked.storeName}</Text>
                    <Text style={[styles.scheduleDesc, { color: theme.textSecond }]} numberOfLines={2}>{storePicked.storeAddress}</Text>
                    <Text style={[styles.scheduleDesc, { color: theme.accent }]}>{t('send.storeDetailsLink')}</Text>
                  </View>
                  <Pressable hitSlop={10} onPress={() => { setStorePicked(null); setPickup(null as any); setPickupQuery(''); }}>
                    <Ionicons name="close-circle" size={20} color={theme.textThird} />
                  </Pressable>
                </Pressable>
              )}

              {pickupMode === 'store' && !storePicked && (
                <View>
                  {storesLoading && (
                    <View style={{ paddingVertical: Spacing.md, alignItems: 'center' }}>
                      <ActivityIndicator color={theme.primary} />
                    </View>
                  )}
                  {!storesLoading && nearStores.map((st: any) => (
                    <Pressable
                      key={st.id}
                      style={[styles.scheduleOpt, highlight(false), { marginBottom: Spacing.sm }]}
                      onPress={() => choosePickupStore(st)}
                    >
                      <Store size={20} color={theme.textSecond} strokeWidth={1.75} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.scheduleTitle, { color: theme.text }]} numberOfLines={1}>{st.storeName}</Text>
                        <Text style={[styles.scheduleDesc, { color: theme.textSecond }]} numberOfLines={1}>{st.storeAddress}</Text>
                      </View>
                      {st.distanceKm != null && (
                        <Text style={[styles.scheduleDesc, { color: theme.textThird }]}>{Number(st.distanceKm).toFixed(1)} km</Text>
                      )}
                    </Pressable>
                  ))}
                  {!storesLoading && pickup && nearStores.length === 0 && (
                    <Text style={[styles.scheduleDesc, { color: theme.textThird, paddingVertical: Spacing.sm }]}>
                      {t('send.noCountersNearby')}
                    </Text>
                  )}

                  {/*
                    The way into the walk-in flow (2026-08-31).

                    Choosing a counter HERE books a run now: a rider comes
                    to collect from that counter on this booking. The
                    walk-in flow is the other thing, and the only place a
                    customer gets it: schedule a drop, carry it in whenever
                    suits, hand over a QR, and it can end at a second
                    counter for the receiver to collect.

                    It used to be reached from the destination picker,
                    which is now handled inline, so without this link the
                    screen would be orphaned and counter-to-counter would
                    become unreachable for customers.
                  */}
                  <Pressable
                    style={{ paddingVertical: Spacing.sm }}
                    onPress={() => router.push('/(customer)/drop-at-store' as any)}
                  >
                    <Text style={[styles.scheduleDesc, { color: theme.accent }]}>
                      {t('send.walkInLink', {
                        defaultValue: 'Rather drop it off in your own time? Schedule a counter drop-off instead.',
                      })}
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* No distance chip and no map on this step: the business
                  app's Pickup step shows neither, and business is the
                  design reference. The route still renders on Track. */}

              {showSuggestions && activeField !== null && (
                <View style={styles.suggestList}>
                  {pkgIndexOf(activeField) !== null && (
                  <Pressable style={styles.useLocBtn} onPress={() => useMyLocation(activeField)}>
                    <Ionicons name="locate" size={18} color={theme.primary} />
                    <Text style={[styles.useLocText, { color: theme.primary }]}>{t('send.useMyLocation')}</Text>
                    {searching && <ActivityIndicator size="small" color={theme.primary} />}
                  </Pressable>
                  )}
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

              {activeField !== null && pkgIndexOf(activeField) !== null && predictions.length === 0 && (
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
                  { now: true,  icon: Zap,   titleKey: 'sendNow',       descKey: 'sendNowDesc'       },
                  { now: false, icon: Clock, titleKey: 'scheduleLater', descKey: 'scheduleLaterDesc' },
                ].map(opt => {
                    const OptIcon = opt.icon;
                    return (
                      <Pressable
                        key={String(opt.now)}
                        style={[styles.scheduleOpt, highlight(scheduleNow === opt.now)]}
                        onPress={() => setScheduleNow(opt.now)}
                      >
                        {/* Filled icon square, matching the business card
                            anatomy exactly (full-page look, 2026-08-21). */}
                        <View style={{
                          width: 38, height: 38, borderRadius: 12,
                          alignItems: 'center', justifyContent: 'center',
                          backgroundColor: scheduleNow === opt.now ? theme.accent : theme.surfaceSecond,
                        }}>
                          <OptIcon size={18} color={scheduleNow === opt.now ? '#fff' : theme.textSecond} strokeWidth={1.75} />
                        </View>
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
                        minDate={todayIsoLagos()}
                        maxDate={MAX_BOOK_AHEAD}
                        current={scheduledDate}
                        onDayPress={(day) => {
                          setScheduledDate(day.dateString);
                          // Reset time if the previously chosen hour is now in the past for the new "today" pick.
                          if (day.dateString === todayIsoLagos() && scheduledHour != null && scheduledHour <= lagosHourNow()) {
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
                        {TIME_SLOTS.every(slot =>
                          scheduledDate === todayIsoLagos() && slot.hour <= lagosHourNow()) && (
                          /*
                            Late at night every hour of today's window has
                            gone, so the list renders empty and says
                            nothing. A blank space where the times should
                            be reads as broken rather than as "come back
                            tomorrow" (2026-08-29).
                          */
                          <Text style={[styles.hintText, { color: theme.textThird }]}>
                            {t('send.noSlotsToday', {
                              defaultValue: 'No pickup hours left today. Choose tomorrow on the calendar above, or go back and pick Send now.',
                            })}
                          </Text>
                        )}
                        {TIME_SLOTS.map(slot => {
                          const active = scheduledHour === slot.hour;
                          const isPast = scheduledDate === todayIsoLagos() && slot.hour <= lagosHourNow();
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
            <View style={{ gap: 10 }}>
              {VEHICLE_ORDER.map((v) => {
                const localId = LOCAL_VEHICLE_ID[v];
                // The customer card keeps vehicles under package.vehicles
                // with maxKg, not backend-style vehicleRates: reading the
                // wrong schema here rendered every card without a payload
                // (founder caught it on the step-3 side-by-side).
                const card: any = getActiveRateCard();
                const rec = (card?.package?.vehicles ?? []).find((x: any) => x.id === localId) ?? {};
                const cap = Number(rec?.maxPackages) || DEFAULT_MAX_PACKAGES[v] || 5;
                const payload = Number(rec?.maxKg ?? 0);
                const blocked = forbiddenForCategory.includes(localId) || forbiddenForCategory.includes(v);
                const overWeight = payload > 0 && kg > payload;
                const overCount = packages.length > cap;
                // Any vehicle the admin gives a maxRouteKm honours it;
                // bicycle simply has a sane fallback so the human-powered
                // tier is short-hop even before the card row exists
                // (founder 2026-08-21: the knob must be per-vehicle).
                const maxKm = Number(rec?.maxRouteKm
                  ?? (v === 'bicycle' ? BICYCLE_MAX_KM_FALLBACK : 0));
                const overKm = maxKm > 0 && distKmRoute > maxKm;
                const disabled = blocked || overWeight || overCount || overKm;
                const isRecommended = v === VEHICLE_ORDER.find((x) => {
                  const xl = LOCAL_VEHICLE_ID[x];
                  if (forbiddenForCategory.includes(xl) || forbiddenForCategory.includes(x)) return false;
                  const xr = (card?.package?.vehicles ?? []).find((q: any) => q.id === xl) ?? {};
                  const pl = Number(xr?.maxKg ?? 0);
                  const xc = Number(xr?.maxPackages) || DEFAULT_MAX_PACKAGES[x] || 5;
                  return xc >= packages.length && (pl === 0 || pl >= kg);
                });
                const active = vehicleId === localId;
                return (
                  <Pressable
                    key={v}
                    disabled={disabled}
                    style={[styles.vehRow,
                      { backgroundColor: theme.surface, borderColor: theme.border, opacity: disabled ? 0.45 : 1 },
                      active && { borderColor: theme.primary, backgroundColor: theme.primaryLight }]}
                    onPress={() => setVehicleId(localId as VehicleId)}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.vehName, { color: theme.text }]}>{VEHICLE_LABEL[v]}</Text>
                        {isRecommended && !disabled && (
                          <View style={[styles.recBadge, { backgroundColor: theme.accent }]}>
                            <Text style={styles.recText}>{t('send.recommended')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.vehSub, { color: theme.textSecond }]}>
                        {disabled
                          ? blocked
                            ? t('send.vehicleBlocked', { defaultValue: 'Not allowed for this package type' })
                            : overKm ? `Under ${maxKm}km trips only`
                            : overCount ? `Max ${cap} packages` : `Max ${payload}kg`
                          : `Up to ${cap} packages${payload > 0 ? ` · ${payload}kg payload` : ''}${maxKm > 0 ? ` · under ${maxKm}km` : ''}`}
                      </Text>
                    </View>
                    {active && <CheckCircle size={18} color={theme.primary} strokeWidth={2} />}
                  </Pressable>
                );
              })}
              <Text style={[styles.capNote, { color: theme.textSecond }]}>
                This run: {packages.length} package{packages.length === 1 ? '' : 's'}, {kg}kg total.
              </Text>
            </View>
          )}

          {/* STEP 3: Fare */}
          {step === 3 && (
            <View style={styles.stepGap}>
              {/* Route map, business-style. Kilometres only on the chip:
                  minutes are a promise this platform does not make. */}
              {pickup && (dropoff || packages.some(pk => pk.dropoff)) && (
                <Pressable style={[styles.mapCard, { borderColor: theme.border }]} onPress={() => setMapExpanded(true)}>
                  <MapView
                    provider={PROVIDER_GOOGLE}
                    style={styles.mapInline}
                    
                    customMapStyle={isDark ? DARK_MAP : []}
                    pointerEvents="none"
                    // Fit on BOTH events: layout can fire before the map is
                    // ready, and ready alone misses re-layouts. Without the
                    // second hook this card sat on the default region,
                    // which for a tester in Berlin meant German streets
                    // above a Lagos delivery.
                    initialRegion={{
                      latitude: pickup.lat, longitude: pickup.lng,
                      latitudeDelta: 0.1, longitudeDelta: 0.1,
                    }}
                    onMapReady={() => {
                      const pts = [
                        { latitude: pickup.lat, longitude: pickup.lng },
                        ...packages.filter(pk => pk.dropoff).map(pk => ({ latitude: pk.dropoff!.lat, longitude: pk.dropoff!.lng })),
                      ];
                      if (pts.length > 1) {
                        mapRef.current?.fitToCoordinates(pts, { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: false });
                      }
                    }}
                    onLayout={() => {
                      const pts = [
                        { latitude: pickup.lat, longitude: pickup.lng },
                        ...packages.filter(pk => pk.dropoff).map(pk => ({ latitude: pk.dropoff!.lat, longitude: pk.dropoff!.lng })),
                      ];
                      if (pts.length > 1) {
                        mapRef.current?.fitToCoordinates(pts, { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: false });
                      }
                    }}
                    ref={mapRef}
                  >
                    <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} pinColor="#22C55E" title="Pickup" />
                    {packages.filter(pk => pk.dropoff).map((pk, i) => (
                      <Marker key={i} coordinate={{ latitude: pk.dropoff!.lat, longitude: pk.dropoff!.lng }} pinColor="#EF4444" />
                    ))}
                    {routeCoords.length > 1 && (
                      <Polyline coordinates={routeCoords} strokeColor={theme.primary} strokeWidth={4} />
                    )}
                  </MapView>
                  <View style={styles.mapChip}>
                    <Text style={styles.mapChipText}>{distKmRoute > 0 ? `${distKmRoute.toFixed(1)} km` : '...'}</Text>
                  </View>
                  {/* Same affordance as the business review map. */}
                  <View style={[styles.mapChip, { left: undefined, right: 10, bottom: undefined, top: 10 }]}>
                    <Text style={styles.mapChipText}>{t('send.tapToExpand', { defaultValue: 'Tap to expand' })}</Text>
                  </View>
                </Pressable>
              )}

              {/* Full-screen route map, closed with the X. */}
              <Modal visible={mapExpanded} animationType="fade" onRequestClose={() => setMapExpanded(false)}>
                <View style={{ flex: 1, backgroundColor: theme.background }}>
                  {pickup && (
                    <MapView
                      provider={PROVIDER_GOOGLE}
                      style={{ flex: 1 }}
                      customMapStyle={isDark ? DARK_MAP : []}
                      initialRegion={{ latitude: pickup.lat, longitude: pickup.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
                      onMapReady={() => { /* pins declare the route; pinch to explore */ }}
                    >
                      <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} pinColor="#22C55E" title="Pickup" />
                      {packages.filter(pk => pk.dropoff).map((pk, i) => (
                        <Marker key={i} coordinate={{ latitude: pk.dropoff!.lat, longitude: pk.dropoff!.lng }} pinColor="#EF4444" />
                      ))}
                      {routeCoords.length > 1 && (
                        <Polyline coordinates={routeCoords} strokeColor={theme.primary} strokeWidth={4} />
                      )}
                    </MapView>
                  )}
                  <Pressable
                    onPress={() => setMapExpanded(false)}
                    style={{
                      position: 'absolute', top: insets.top + 12, right: 16,
                      width: 40, height: 40, borderRadius: 20,
                      backgroundColor: 'rgba(10,15,25,0.85)', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <X size={20} color="#fff" strokeWidth={2.5} />
                  </Pressable>
                </View>
              </Modal>

              {/* Packages, business-style rows; each opens ITS OWN order
                  summary, and a package the sender regrets can be removed
                  right here instead of restarting the form. */}
              <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
                <Text style={[styles.fareTitle, { color: theme.text }]}>
                  {t('send.packagesTitle', { defaultValue: 'Packages' })}
                </Text>
                {packages.map((pk, i) => {
                  const openNow = expandedPkg === i;
                  // An indicative per-package share, shown to the kobo like
                  // every other figure. The one number that is charged is
                  // the run total on the row below.
                  const share = packages.length > 1
                    ? Number(runQuote?.customer?.total ?? 0) / packages.length
                    : fare.total;
                  return (
                    <View key={i} style={[styles.pkgRevRow, { borderTopColor: theme.border, borderTopWidth: i === 0 ? 0 : 1 }]}>
                      <Pressable style={styles.pkgRevHead} onPress={() => setExpandedPkg(openNow ? null : i)}>
                        {pk.photos[0] ? (
                          <Image source={{ uri: pk.photos[0] }} style={styles.pkgRevThumb} />
                        ) : (
                          <View style={[styles.pkgRevThumb, { backgroundColor: theme.surfaceSecond, alignItems: 'center', justifyContent: 'center' }]}>
                            <Camera size={16} color={theme.textThird} />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            {packages.length > 1 && (() => {
                              // Which position this package is visited in.
                              // Google's optimized order when it reordered,
                              // entry order otherwise; the booking itself
                              // re-optimizes server-side, and the footnote
                              // already says the final fare follows it.
                              const visit = multi.waypointOrder
                                ? multi.waypointOrder.indexOf(i) + 1
                                : i + 1;
                              return (
                                <View style={[styles.recBadge, { backgroundColor: theme.surfaceSecond }]}>
                                  <Text style={[styles.recText, { color: theme.textSecond }]}>
                                    {visit === 1 ? '1st' : visit === 2 ? '2nd' : visit === 3 ? '3rd' : `${visit}th`}
                                  </Text>
                                </View>
                              );
                            })()}
                          <Text style={[styles.vehName, { color: theme.text, flexShrink: 1 }]} numberOfLines={1}>
                            {pk.description || t('send.packageN', { n: i + 1, defaultValue: `Package ${i + 1}` })}
                          </Text>
                          </View>
                          <Text style={[styles.vehSub, { color: theme.textSecond }]} numberOfLines={1}>
                            {(pk.receiverFirst || '-') + ' · ' + (pk.weightKg || '?') + 'kg'}
                          </Text>
                        </View>
                        <Text style={[styles.fareAmt, { color: theme.text }]}>{naira(share)}</Text>
                        <Ionicons name={openNow ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textThird} />
                      </Pressable>

                      {openNow && (
                        <View style={styles.pkgRevBody}>
                          {([
                            [t('send.dropoff'),  pk.dropoff?.address ?? pk.dropoffQuery ?? '-'],
                            [t('send.receiver', { defaultValue: 'Receiver' }), `${pk.receiverFirst || '-'} · ${pk.receiverPhone || '-'}`],
                            [t('send.category'), t(`send.${PACKAGE_CATEGORIES.find(c => c.id === pk.category)?.labelKey ?? 'category'}`)],
                            [t('send.weightLabel', { defaultValue: 'Weight' }), `${pk.weightKg || '-'}kg`],
                            ...(packages.length > 1 && multi.legMeters ? (() => {
                              const visit = multi.waypointOrder ? multi.waypointOrder.indexOf(i) : i;
                              const leg = multi.legMeters[visit];
                              return leg != null ? [[
                                t('send.legDistance', { defaultValue: 'Leg from previous stop' }),
                                `${(leg / 1000).toFixed(1)} km`,
                              ] as [string, string]] : [];
                            })() : []),
                          ] as [string, string][]).map(([lbl, val]) => (
                            <View key={lbl} style={[styles.fareRow, { borderBottomColor: theme.border }]}>
                              <Text style={[styles.fareLabel, { color: theme.textSecond }]}>{lbl}</Text>
                              <Text style={[styles.fareAmt, { color: theme.text }]} numberOfLines={2}>{val}</Text>
                            </View>
                          ))}
                          {packages.length > 1 && (
                            <Pressable
                              style={styles.pkgRevRemove}
                              onPress={() => { setExpandedPkg(null); removePackage(i); }}
                            >
                              <X size={14} color={theme.error} strokeWidth={2.5} />
                              <Text style={[styles.pkgRevRemoveText, { color: theme.error }]}>
                                {t('send.removePackage', { defaultValue: 'Remove this package' })}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
                <View style={styles.fareTotalRow}>
                  <Text style={[styles.fareTotalLabel, { color: theme.text }]}>
                    {t('send.totalOnePayment', { defaultValue: 'Total · one payment' })}
                  </Text>
                  <Text style={[styles.fareTotalAmt, { color: theme.accent }]}>{naira(fare.total)}</Text>
                </View>
                <Text style={[styles.capNote, { color: theme.textSecond }]}>
                  {t('send.reviewFootnote', { defaultValue: 'Final fare uses the road distance at booking. Every package gets its own tracking code for its receiver.' })}
                </Text>
              </View>

              {/* Run-level Order Summary, kept from the customer design at
                  the founder's request, minus the payment row. */}
              <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
                <Text style={[styles.fareTitle, { color: theme.text }]}>{t('send.orderSummary')}</Text>
                {([
                  [t('send.pickup'),         pickup?.address  ?? '-'],
                  [t('send.dropoff'), packages.length > 1
                    ? t('send.summaryDestinations', { n: packages.length, defaultValue: `${packages.length} destinations` })
                    : (dropoff?.address ?? '-')],
                  [t('send.summaryPackages', { defaultValue: 'Packages' }),
                    `${packages.length} package${packages.length === 1 ? '' : 's'}`],
                  [t('send.summaryDistance'), distKmRoute > 0 ? `${distKmRoute.toFixed(1)} km` : '-'],
                  [t('send.vehicle2'),       VEHICLE_LABEL[Object.keys(LOCAL_VEHICLE_ID).find(k => LOCAL_VEHICLE_ID[k] === vehicleId) ?? ''] ?? vehicleId],
                  [t('send.summaryWhen'),    scheduleNow
                                               ? t('send.summarySendNow')
                                               : (scheduledHour != null
                                                   ? buildScheduledFor(scheduledDate, scheduledHour).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                                                   : '-')],
                  // Only when the engine actually charges one: a 0-naira
                  // row is noise, a hidden non-zero fee is a lie.
                  ...(fare.service > 0
                    ? [[t('send.serviceFee', { defaultValue: 'Service fee' }),
                        naira(fare.service)] as [string, string]]
                    : []),
                  ...(Number((fare as any).highValue) > 0
                    ? [[t('send.highValueFee', { defaultValue: 'High-value cover' }),
                        naira((fare as any).highValue)] as [string, string]]
                    : []),
                  /**
                   * Name the geography, and what it cost (2026-08-31).
                   *
                   * Two rows, and both only when the engine actually
                   * charged a tier: which states this run connects, and
                   * the surcharge that crossing them added. A zero-naira
                   * row is noise; an unexplained one is the thing this
                   * screen calls a lie everywhere else.
                   */
                  ...((fare as any).route?.zoneTier
                      && Number((fare as any).route?.tierSurchargeNgn) > 0
                    ? ([
                        [t('send.summaryRoute', { defaultValue: 'Route' }),
                         `${(fare as any).route.pickupStateName ?? (fare as any).route.pickupStateCode} to ${(fare as any).route.dropoffStateName ?? (fare as any).route.dropoffStateCode}`],
                        [ZONE_TIER_LABEL[(fare as any).route.zoneTier]
                           ?? t('send.summaryZoneFee', { defaultValue: 'Distance surcharge' }),
                         naira(Number((fare as any).route.tierSurchargeNgn))],
                      ] as [string, string][])
                    : []),
                  [t('send.total'),          naira(fare.total)],
                ] as [string, string][]).map(([lbl, val]) => (
                  <View key={lbl} style={[styles.fareRow, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.fareLabel, { color: theme.textSecond }]}>{lbl}</Text>
                    <Text style={[styles.fareAmt,   { color: theme.text }]} numberOfLines={2}>{val}</Text>
                  </View>
                ))}
              </View>

              {/* Consent gates the money. The checkbox is the agreement;
                  the link is the full text; the Pay button stays dead
                  until the box is ticked (founder 2026-08-21). */}
              <Pressable style={styles.tcRow} onPress={() => setTcAgreed(v => !v)}>
                <View style={[styles.tcBox, { borderColor: tcAgreed ? theme.primary : theme.textThird, backgroundColor: tcAgreed ? theme.primary : 'transparent' }]}>
                  {tcAgreed && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={[styles.tcText, { color: theme.textSecond }]}>
                  {t('send.tcAgree', { defaultValue: 'I agree to the SEIRS Terms of Service, including what happens if a delivery fails.' })}
                  {' '}
                  <Text
                    style={{ color: theme.primary, fontWeight: '600' }}
                    onPress={() => Linking.openURL('https://seirs.co/terms-of-service')}
                  >
                    {t('send.tcRead', { defaultValue: 'Read them' })}
                  </Text>
                </Text>
              </Pressable>
            </View>
          )}

        </ScrollView>

        {/* CTA pinned to the bottom, as in the business flow, so Continue is
            reachable without scrolling to the end of a long step.
            insets.bottom REPORTS 0 on this A30's 3-button nav bar (measured
            on device, see request.tsx): the old comment here claimed ~48dp
            and the raw value left the button under the nav bar. Hard floor,
            same as request.tsx and vehicle-select.tsx (2026-08-23). */}
        <View style={[styles.ctaBar, {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          paddingBottom: Spacing.md + Math.max(insets.bottom, 24),
        }]}>
          {/* Every error surfaces here, business-style. Field-level
              errors ALSO flag their field inline, but the footer is the
              one place guaranteed on screen: a missing pickup used to
              set state that nothing anywhere rendered (found live,
              2026-08-21, when the founder asked to see the error).
              */}
          {!!error && (
            <View style={styles.footerError}>
              <AlertCircle size={15} color="#DC2626" />
              <Text style={styles.footerErrorText}>{error}</Text>
            </View>
          )}
          {/* Say WHY the button is dead. The consent box is the last thing
              on a long review, so someone landing at the top of step 4 saw
              a greyed-out "Pay N2,650" and no reason at all: they have to
              scroll to discover an unticked box (found on device
              2026-08-23). Tapping this jumps them to it. */}
          {step === 3 && !tcAgreed && !loading && (
            <Pressable
              style={styles.ctaHint}
              onPress={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              <AlertCircle size={15} color={theme.textSecond} />
              <Text style={[styles.ctaHintText, { color: theme.textSecond }]}>
                {t('send.tcBlocked', { defaultValue: 'Agree to the terms below to pay' })}
              </Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.cta, { backgroundColor: theme.primary },
              (loading || (step === 3 && !tcAgreed)) && { opacity: 0.5 }]}
            onPress={step < 3 ? next : handleBook}
            disabled={loading || (step === 3 && !tcAgreed)}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.ctaInner}>
                <Text style={styles.ctaText}>
                  {step === 3
                    ? `${t('send.payCta', { defaultValue: 'Pay' })} ${naira(fare.total)}`
                    : t('common.continue')}
                </Text>
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
  recentRow:   { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },
  recentLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  recentChip:  { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 220 },
  recentTxt:   { fontSize: 12 },
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
  footerError: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EF444418', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10,
  },
  footerErrorText: { flex: 1, color: '#DC2626', fontSize: 13, fontWeight: '600' },
  ctaHint:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingBottom: 8 },
  ctaHintText: { flex: 1, fontSize: 13, fontWeight: '600' },
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
  addPkgBtn:    { borderWidth: 1, borderStyle: 'dashed' as const, borderRadius: 14,
                  paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  addPkgText:   { fontSize: 14, fontWeight: '700' as const },
  stepHero:        { alignItems: 'center', gap: 8, marginBottom: Spacing.md },
  stepHeroCaption: { fontSize: 13, textAlign: 'center', maxWidth: 280, lineHeight: 18 },

  errorBox:     { padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.sm },
  errorText:    { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  // Inline message under the offending field, so the instruction sits
  // where the fix happens rather than in a banner further up.
  fieldError:   { fontSize: FontSize.xs, lineHeight: 17, marginTop: -Spacing.xs, marginBottom: Spacing.sm },
  label:        { fontSize: 12, fontWeight: '600', marginTop: 8, marginBottom: 6 },
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
  inputBlock:   { borderWidth: 1, borderRadius: 10, paddingVertical: 2 },
  inputRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, height: 48 },
  dot:          { width: 10, height: 10, borderRadius: 5 },
  inputField:   { flex: 1, fontSize: 14, paddingVertical: 0 },
  divider:      { height: 1, marginLeft: Spacing.md + 18 },

  routeStat:        { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  routeStatItem:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  routeStatValue:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  routeStatDivider: { width: 1, height: 22, marginHorizontal: Spacing.sm },

  suggestList:  { },
  useLocBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 4 },
  useLocText:   { fontSize: 13, fontWeight: '600', flex: 1 },
  suggRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, paddingHorizontal: 4, borderTopWidth: 1 },
  suggIcon:     { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  suggMain:     { fontSize: 13, fontWeight: '500' },
  suggSub:      { fontSize: 11, marginTop: 1 },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5 },
  categoryText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },

  vehicleCard:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  vehicleNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  vehicleName:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  vehicleNote:    { fontSize: FontSize.xs },
  vehicleFare:    { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  vehRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 14 },
  vehName: { fontSize: 15, fontWeight: '700' },
  vehSub:  { fontSize: 12, marginTop: 2 },
  capNote: { fontSize: 12, lineHeight: 17 },
  vehicleEta:     { fontSize: FontSize.xs, marginTop: 2 },
  recBadge:       { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  recText:        { color: '#fff', fontSize: 10, fontWeight: FontWeight.bold },

  scheduleOpt:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, marginBottom: 10 },
  scheduleTitle: { fontSize: 15, fontWeight: '700' },
  scheduleDesc:  { fontSize: 12, marginTop: 2 },
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
  mapChip: {
    position: 'absolute', left: 10, bottom: 10,
    backgroundColor: 'rgba(10,15,25,0.85)', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  mapChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pkgRevRow:  { paddingVertical: 4 },
  pkgRevHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  pkgRevThumb: { width: 40, height: 40, borderRadius: 10 },
  pkgRevBody: { paddingLeft: 50, paddingBottom: 8 },
  pkgRevRemove: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  pkgRevRemoveText: { fontSize: 13, fontWeight: '600' },
  tcRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  tcBox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  tcText: { flex: 1, fontSize: 12.5, lineHeight: 18 },

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
