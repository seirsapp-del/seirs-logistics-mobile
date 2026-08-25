import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Linking,
  ActivityIndicator, Image, Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import {
  ArrowLeft, Zap, Clock, MapPin, Navigation, Package,
  User, Phone, ExternalLink, CheckCircle, XCircle, AlertTriangle, X,
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { deliveriesApi, feesApi } from '@/services/api';
import { naira } from '@/utils/money';
import { useAuth } from '@/context/AuthContext';

const URGENCY_CONFIG: Record<string, { label: string; color: string; Icon: any }> = {
  instant:   { label: 'Instant',   color: '#EF4444', Icon: Zap  },
  standard:  { label: 'Standard',  color: '#3A7BD5', Icon: Clock },
  scheduled: { label: 'Scheduled', color: '#D97706', Icon: Clock },
};

const ACCEPT_TIMEOUT_SEC = 45;

// Human words for the category the sender picked. The driver saw NOTHING
// here before: the Package card printed the free-text description alone,
// so "Lasagna" could be a boxed book or a cold-chain load, and the rider
// accepted blind (founder, on device 2026-08-24). Strings mirror the
// customer app's category list (customer-app/i18n/locales/en.json).
const CATEGORY_LABEL: Record<string, string> = {
  documents:         'Documents / Envelope',
  small_parcel:      'Small Parcel',
  standard_parcel:   'Standard Parcel',
  fragile:           'Fragile / Electronics',
  food_hot:          'Hot Food',
  food_cold:         'Cold / Frozen Food',
  medical:           'Medical Supplies',
  bulk_goods:        'Bulk Goods',
  farm_produce:      'Farm Produce',
  building:          'Building Materials',
  lumber:            'Lumber / Sawmill',
  house_move_single: 'House Move, single item',
  house_move_full:   'House Move, full unit',
  live_animals:      'Live Animals',
  industrial:        'Industrial Parts',
  other:             'Other / Special',
};

// Loads that punish a slow run. Flagged so the rider can judge the job
// BEFORE accepting. Deliberately worded as a handling warning and never
// as a deadline: SEIRS promises no arrival times anywhere (founder rule,
// Lagos traffic plus NEPA plus checkpoints make any ETA a refund magnet).
const TIME_CRITICAL: Record<string, string> = {
  food_hot:     'Keep it hot, deliver without detours',
  food_cold:    'Cold chain, do not let it sit in the sun',
  medical:      'Medical load, handle with priority',
  live_animals: 'Live animals, air and water matter',
};

/** A coordinate pair is only usable when BOTH halves are real numbers. */
const toCoord = (lat: any, lng: any) => {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la === 0 && ln === 0) return null;
  return { latitude: la, longitude: ln };
};

export default function JobDetailScreen() {
  const { id }    = useLocalSearchParams<{ id: string }>();
  const router    = useRouter();
  /**
   * Every decision on this screen, in one themed sheet (item 4,
   * 2026-08-24). Accept, skip and Navigate are the three dialogs a rider
   * meets on literally every job, so they were the first ones outside
   * the active-delivery screen worth taking off Android's AlertDialog.
   */
  const [sheet, setSheet] = useState<SeirsSheetSpec | null>(null);
  const info = (title: string, message?: string, onDone?: () => void) =>
    setSheet({
      title,
      message,
      options: [{ label: 'Got it', variant: 'primary', onPress: onDone }],
      cancelLabel: null,
      onCancel: onDone,
    });
  const cs        = useColorScheme();
  const theme     = Colors[cs ?? 'light'];
  const isDark    = cs === 'dark';
  const insets    = useSafeAreaInsets();
  const { user } = useAuth();

  // ?offered=1 → auto-match pushed this to the driver (countdown applies).
  // No flag = driver tapped the job from the browse list (no countdown).
  const { offered } = useLocalSearchParams<{ offered?: string }>();
  const isOffered = offered === '1';

  const [countdown, setCountdown] = useState(ACCEPT_TIMEOUT_SEC);
  const [job,       setJob]       = useState<any | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [claiming,  setClaiming]  = useState(false);
  /**
   * How long a Travel Buddy seat booking is really held, in minutes.
   *
   * The screen ran the same 45-second pool countdown on a seat booking
   * and told the rider "Answer this seat booking in 45s". The server
   * holds it for travel_buddy_offer_timeout_min, seeded at 30 MINUTES,
   * and only releases it on a 5-minute cron. So the bar emptied, the
   * screen bounced the rider out with router.back(), and the offer sat
   * there live and answerable for another twenty-nine minutes with the
   * passenger's money already taken. A rider who saw that concluded they
   * had lost the job (2026-08-25 interstate walk).
   *
   * Read from the catalogue so an admin moving the knob moves this too,
   * with the seeded value as the code fallback.
   */
  const [tripOfferMin, setTripOfferMin] = useState<number>(30);

  /**
   * Which job is this, from this driver's point of view?
   *
   * `unclaimed` is the only state where Accept is meaningful. `mine`
   * means continue it. `taken` means somebody else got there first, and
   * saying so is kinder than a button that will fail.
   */
  const myUserId = user?.id ?? null;
  const jobState: 'unclaimed' | 'mine' | 'taken' | 'closed' = (() => {
    if (!job) return 'unclaimed';
    const st = String(job.status ?? 'pending');
    if (st === 'delivered' || st === 'cancelled') return 'closed';
    if (job.driverUserId) return job.driverUserId === myUserId ? 'mine' : 'taken';
    return 'unclaimed';
  })();
  const [photoOpen, setPhotoOpen] = useState<string | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapRef     = useRef<MapView>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const d = await deliveriesApi.get(id);
        const kind = d.kind ?? 'package';
        setJob({
          id:                d.id,
          urgency:           d.urgency ?? 'standard',
          pickupAddress:     d.pickupAddress ?? '-',
          dropoffAddress:    d.dropoffAddress ?? '-',
          // Coordinates feed the route map. They were fetched and thrown
          // away before, which is why this screen had no map at all.
          pickupLat:         d.pickupLat,
          pickupLng:         d.pickupLng,
          dropoffLat:        d.dropoffLat,
          dropoffLng:        d.dropoffLng,
          distanceKm:        d.distanceKm ? Number(d.distanceKm).toFixed(1) : null,
          price:             Number(d.price ?? 0),
          driverEarnings:    Number(d.driverEarnings ?? 0),
          packageDescription: d.packageDescription,
          // Cargo facts a rider needs to price the effort in their head.
          categoryCode:      d.categoryCode ?? null,
          weightKg:          d.weightKg != null ? Number(d.weightKg) : null,
          isFragile:         !!d.isFragile,
          packagePhotos:     Array.isArray(d.packagePhotos) ? d.packagePhotos : [],
          kind,
          // Status and ownership drive which actions are legal. Reading
          // neither is why this screen offered "Accept Job" on a job that
          // was already in transit (founder caught it 2026-08-24 by
          // comparing the customer app and the admin dashboard, which
          // both showed the truth).
          status:      String(d.status ?? 'pending'),
          driverUserId: (d as any).driver?.user?.id ?? null,
          tripId: (d as any).tripId ?? null,
          // When the seat booking was actually offered. The real deadline
          // is this plus travel_buddy_offer_timeout_min, not 45 seconds.
          tripOfferedAt: (d as any).tripOfferedAt ?? null,
          customer: {
            // A ride passenger never gets a surname or a phone shown to a
            // driver. The server redacts already; this second cut means a
            // future server change cannot leak a surname through this
            // screen by accident.
            name: kind === 'ride'
              ? String(d.customer?.firstName ?? d.customer?.name ?? 'Passenger').trim().split(/\s+/)[0] || 'Passenger'
              : (d.customer?.name ?? 'Customer'),
          },
        });
      } catch {
        setJob(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // The seat-booking hold window, from the Fee Catalogue. Failure keeps
  // the seeded 30 so the screen never invents a shorter deadline than
  // the server enforces.
  useEffect(() => {
    feesApi.get('travel_buddy_offer_timeout_min')
      .then((r: any) => {
        const n = Number(r?.value);
        if (Number.isFinite(n) && n > 0) setTripOfferMin(n);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!job || !isOffered) return;
    /**
     * Two different clocks, and they must not be confused again.
     *
     * A pool offer has no server deadline at all: the 45 seconds is a
     * local nudge and the job simply stays in the pool.
     *
     * A seat booking has a REAL one, tripOfferedAt + tripOfferMin, after
     * which a cron refunds the passenger in full. Counting it down from
     * the true offer time means reopening the screen shows the time that
     * is genuinely left rather than restarting the clock.
     */
    const offeredAtMs = job.tripId && job.tripOfferedAt
      ? new Date(job.tripOfferedAt).getTime()
      : null;
    const deadlineMs = offeredAtMs != null && Number.isFinite(offeredAtMs)
      ? offeredAtMs + tripOfferMin * 60_000
      : null;

    if (deadlineMs != null) {
      const tick = () => {
        const left = Math.max(0, Math.round((deadlineMs - Date.now()) / 1000));
        setCountdown(left);
        if (left <= 0 && timerRef.current) { clearInterval(timerRef.current); router.back(); }
      };
      tick();
      timerRef.current = setInterval(tick, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }

    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          router.back();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [job, isOffered, tripOfferMin]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center' }}>
        <ActivityIndicator color={theme.primary} />
      </SafeAreaView>
    );
  }

  if (!job) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <Package size={48} color={theme.textThird} strokeWidth={1.5} />
        <Text style={[styles.notFoundText, { color: theme.textSecond }]}>Job not found</Text>
        <Pressable style={[styles.backLink, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const urg = URGENCY_CONFIG[job.urgency] ?? { label: job.urgency, color: '#6B7280', Icon: Clock };

  const isRide = job.kind === 'ride';

  /**
   * A Travel Buddy seat booking is a PERSONAL offer: declining it refunds
   * the passenger in full and the server has to be told. Everything else
   * on this screen is an open pool job, and there is no decline endpoint
   * for one, so saying no is really just walking away (2026-08-23 sweep,
   * D-1.5). The two cases are worded differently below for that reason.
   */
  const isTripOffer = !!(job as any)?.tripId;

  const pick = toCoord(job.pickupLat,  job.pickupLng);
  const drop = toCoord(job.dropoffLat, job.dropoffLng);
  const pins = [pick, drop].filter(Boolean) as Array<{ latitude: number; longitude: number }>;

  const categoryLabel = job.categoryCode
    ? (CATEGORY_LABEL[job.categoryCode] ?? String(job.categoryCode).replace(/_/g, ' '))
    : null;
  const criticalNote = job.categoryCode ? TIME_CRITICAL[job.categoryCode] : undefined;
  // Remote photos only. A relative path would render as a silent grey box.
  const photo: string | null = (job.packagePhotos ?? [])
    .find((u: any) => typeof u === 'string' && /^https?:\/\//i.test(u)) ?? null;
  const hasCargoDetail = !!(job.packageDescription || categoryLabel || job.weightKg || job.isFragile || photo);

  // The bar has to be scaled to whichever clock is running, or a 30
  // minute hold renders permanently pegged full then snaps to empty.
  const countdownSpan  = isTripOffer && (job as any)?.tripOfferedAt
    ? tripOfferMin * 60
    : ACCEPT_TIMEOUT_SEC;
  const countdownPct   = Math.max(0, Math.min(100, (countdown / countdownSpan) * 100));
  // Thresholds proportional to the window: 10s of warning is meaningless
  // on a 45s clock and invisible on a 30 minute one.
  const countdownColor = countdown <= countdownSpan * 0.22 ? '#EF4444'
    : countdown <= countdownSpan * 0.45 ? '#D97706'
    : '#16A34A';
  // "9m 40s" reads; "580s" does not.
  const countdownLabel = countdown >= 60
    ? `${Math.floor(countdown / 60)}m ${String(countdown % 60).padStart(2, '0')}s`
    : `${countdown}s`;

  const openMaps = (address: string) => {
    const query = encodeURIComponent(address);
    setSheet({
      title: 'Navigate there',
      message: 'Which app should take you?',
      options: [
        { label: 'Google Maps', variant: 'primary', icon: 'navigate-outline', onPress: () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${query}`) },
        { label: 'Waze',        icon: 'car-outline',      onPress: () => Linking.openURL(`https://waze.com/ul?q=${query}`) },
      ],
    });
  };

  // The whole run in one tap: pickup as origin, dropoff as destination.
  // This is the primary map affordance on the card; the per-address
  // arrows stay for the single leg a rider is actually driving.
  const openFullRoute = () => {
    if (!pick || !drop) return;
    const url =
      `https://www.google.com/maps/dir/?api=1` +
      `&origin=${pick.latitude},${pick.longitude}` +
      `&destination=${drop.latitude},${drop.longitude}` +
      `&travelmode=driving`;
    Linking.openURL(url).catch(() => {
      info(
        'Could not open Google Maps',
        'Google Maps did not open. Check that it is installed and enabled, then use the arrow beside an address instead.',
      );
    });
  };

  const restartCountdown = () => {
    if (!isOffered) return;
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(timerRef.current!); router.back(); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const handleAccept = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSheet({
      title: isRide ? 'Accept this ride?' : 'Accept this job?',
      message: isRide
        ? `You are accepting a ride for ${job.customer.name}. Head to the pickup point now.`
        : `You are accepting a delivery for ${job.customer.name}. Head to pickup immediately.`,
      options: [{
        label: isRide ? 'Accept the ride' : 'Accept the job',
        variant: 'primary',
        icon: 'checkmark-circle-outline',
        onPress: async () => {
          setClaiming(true);
          try {
            await deliveriesApi.claim(job.id);
            router.replace({ pathname: '/(driver)/active', params: { id: job.id } });
            const q = encodeURIComponent(job.pickupAddress);
            Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`).catch(() => {});
          } catch (e: any) {
            info('Could not accept', e?.message ?? 'Another driver may have claimed this job.', restartCountdown);
          } finally {
            setClaiming(false);
          }
        },
      }],
      // The offer clock stops while the sheet is open and restarts if the
      // rider backs out, whichever way they dismiss it.
      onCancel: restartCountdown,
    });
  };

  /**
   * The pool branch used to say "This job will be offered to another
   * driver" and then call router.back() and nothing else. There is no
   * decline endpoint, so dispatch never learned the rider said no and
   * the job simply stayed in Available Jobs (2026-08-23 sweep, D-1.5).
   * The copy now says what actually happens. Restoring the promise means
   * a real POST /deliveries/:id/decline first.
   */
  const handleDecline = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSheet({
      title: isTripOffer ? 'Decline this seat booking?' : 'Skip this job?',
      message: isTripOffer
        ? 'The passenger is refunded in full immediately and the seat reopens on your trip.'
        : 'It stays in Available Jobs. Another rider can take it before you come back.',
      options: [{
        label: isTripOffer ? 'Decline the booking' : 'Skip this job',
        variant: 'destructive',
        onPress: async () => {
          if (isTripOffer) {
            try { await deliveriesApi.declineTripOffer((job as any).id); }
            catch (e: any) { info('Could not decline', e?.message ?? 'Try again.'); return; }
          }
          router.back();
        },
      }],
      cancelLabel: isTripOffer ? 'Keep the booking' : 'Keep looking',
      onCancel: restartCountdown,
    });
  };

  return (
    // Only the TOP edge is claimed here. The action bar below applies its
    // own bottom padding, and letting SafeAreaView add the bottom inset as
    // well double-counted it and floated the bar off the screen edge.
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Job Details</Text>
        <View style={[styles.urgBadge, { backgroundColor: urg.color + '18' }]}>
          <urg.Icon size={13} color={urg.color} strokeWidth={1.75} />
          <Text style={[styles.urgText, { color: urg.color }]}>{urg.label}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Countdown: only when this was auto-offered (not when the driver
            tapped through from the browse list). */}
        {isOffered && (
          <View style={[styles.countdownCard, { backgroundColor: countdownColor + '15', borderColor: countdownColor + '40' }]}>
            <View style={styles.countdownTop}>
              <Clock size={18} color={countdownColor} strokeWidth={1.75} />
              {/* Said "or it auto-declines". It does not: the timer only
                  calls router.back() and the job stays in the pool, since
                  no decline endpoint exists (2026-08-23 sweep, D-1.5).
                  The seat-booking branch now counts the SERVER's window
                  rather than the local 45s nudge (2026-08-25). */}
              <Text style={[styles.countdownLabel, { color: countdownColor }]}>
                {isTripOffer
                  ? `Seat booking held for you: ${countdownLabel} left`
                  : `This offer closes in ${countdownLabel}`}
              </Text>
            </View>
            <View style={[styles.countdownTrack, { backgroundColor: theme.surfaceSecond }]}>
              <View style={[styles.countdownFill, { width: `${countdownPct}%`, backgroundColor: countdownColor }]} />
            </View>
          </View>
        )}

        {/* Fare card. Stays the single biggest thing on the screen: a rider
            decides on money first, then distance, then where from. */}
        <View style={[styles.fareCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.fareLabel, { color: theme.textSecond }]}>Estimated Earnings</Text>
          <Text style={[styles.fareAmount, { color: theme.primary }]}>{naira(job.driverEarnings ?? job.price ?? 0)}</Text>
          {/* D-4.5: the rate used to be hardcoded as "After 30% Seirs
              commission" and would go stale the day the rate moves. The
              exact fee is already itemised per trip in earnings history. */}
          <Text style={[styles.fareNote, { color: theme.textThird }]}>Your share after the SEIRS service fee</Text>
        </View>

        {/* A ride is a person: say so before the driver accepts. */}
        {isRide && (
          <View style={[
            styles.rideBanner,
            isDark
              ? { backgroundColor: '#6366F118' }
              : { backgroundColor: theme.surface, borderWidth: 1.5, borderColor: '#6366F1' },
          ]}>
            <Zap size={16} color="#6366F1" strokeWidth={1.75} />
            <Text style={styles.rideBannerText}>
              This is a RIDE: you are picking up a passenger, not a package.
            </Text>
          </View>
        )}

        {/* Route. The map leads the card because the founder's call is that
            a rider must SEE where the job goes before accepting it. */}
        <View style={[styles.routeCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>

          {pins.length > 0 && (
            <View style={styles.mapBox}>
              <MapView
                ref={mapRef}
                provider={PROVIDER_GOOGLE}
                style={StyleSheet.absoluteFill}
                customMapStyle={isDark ? DARK_MAP : []}
                initialRegion={{
                  latitude:       pins[0].latitude,
                  longitude:      pins[0].longitude,
                  latitudeDelta:  0.06,
                  longitudeDelta: 0.06,
                }}
                // Gestures off on purpose: this map sits inside a
                // ScrollView and a pannable map there swallows the page
                // scroll (the customer app hit exactly this).
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                toolbarEnabled={false}
                onMapReady={() => {
                  if (pins.length < 2) return;
                  mapRef.current?.fitToCoordinates(pins, {
                    edgePadding: { top: 56, right: 48, bottom: 56, left: 48 },
                    animated: false,
                  });
                }}
              >
                {pick && <Marker coordinate={pick} title="Pickup"  description={job.pickupAddress}  pinColor="#22C55E" />}
                {drop && <Marker coordinate={drop} title="Dropoff" description={job.dropoffAddress} pinColor="#EF4444" />}
                {pick && drop && (
                  <Polyline
                    coordinates={[pick, drop]}
                    strokeColor={theme.primary}
                    strokeWidth={3}
                    lineDashPattern={[6, 6]}
                  />
                )}
              </MapView>

              {job.distanceKm && (
                <View style={styles.kmPill}>
                  <MapPin size={12} color="#fff" strokeWidth={2} />
                  {/* Distance ONLY. The minutes segment used to render as a
                      literal "~? min" to the driver: the estimate was pulled
                      to honour the no-time-promise rule and the placeholder
                      was left behind. Never print an ETA in this app. */}
                  <Text style={styles.kmPillText}>~{job.distanceKm} km</Text>
                </View>
              )}
            </View>
          )}

          {pick && drop && (
            <Pressable
              style={({ pressed }) => [
                styles.mapsBtn,
                { borderTopColor: theme.border, opacity: pressed ? 0.6 : 1 },
              ]}
              onPress={openFullRoute}
            >
              <ExternalLink size={16} color={theme.primary} strokeWidth={2} />
              <Text style={[styles.mapsBtnText, { color: theme.primary }]}>Open full route in Google Maps</Text>
            </Pressable>
          )}

          <View style={styles.routeBody}>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#16A34A' }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.routeLabel, { color: theme.textThird }]}>PICKUP</Text>
                <Text style={[styles.routeAddr, { color: theme.text }]}>{job.pickupAddress}</Text>
              </View>
              <Pressable style={[styles.navBtn, { backgroundColor: theme.primary + '15' }]} onPress={() => openMaps(job.pickupAddress)}>
                <Navigation size={16} color={theme.primary} strokeWidth={1.75} />
              </Pressable>
            </View>

            <View style={[styles.routeLine, { backgroundColor: theme.border }]} />

            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.routeLabel, { color: theme.textThird }]}>DROPOFF</Text>
                <Text style={[styles.routeAddr, { color: theme.text }]}>{job.dropoffAddress}</Text>
              </View>
              <Pressable style={[styles.navBtn, { backgroundColor: theme.primary + '15' }]} onPress={() => openMaps(job.dropoffAddress)}>
                <Navigation size={16} color={theme.primary} strokeWidth={1.75} />
              </Pressable>
            </View>

            {/* No map to carry the distance pill, so print it here instead. */}
            {pins.length === 0 && job.distanceKm && (
              <View style={[styles.distRow, { borderTopColor: theme.border }]}>
                <MapPin size={14} color={theme.textThird} strokeWidth={1.75} />
                <Text style={[styles.distText, { color: theme.textSecond }]}>~{job.distanceKm} km</Text>
              </View>
            )}
          </View>
        </View>

        {/* Cargo. A package job is judged on what is in it, so the photo,
            the category, the weight and the fragile flag all show here. */}
        {!isRide && hasCargoDetail && (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
            <View style={styles.cardTitleRow}>
              <Package size={14} color={theme.textSecond} strokeWidth={2} />
              <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>CARGO</Text>
            </View>

            <View style={styles.cargoRow}>
              {photo && (
                <Pressable onPress={() => setPhotoOpen(photo)}>
                  <Image
                    source={{ uri: photo }}
                    style={[styles.cargoPhoto, { borderColor: theme.border }]}
                    resizeMode="cover"
                  />
                </Pressable>
              )}
              <View style={{ flex: 1, gap: 4 }}>
                {!!job.packageDescription && (
                  <Text style={[styles.cargoDesc, { color: theme.text }]}>{job.packageDescription}</Text>
                )}
                {!!categoryLabel && (
                  <Text style={[styles.cargoMeta, { color: theme.textSecond }]}>{categoryLabel}</Text>
                )}
                <View style={styles.chipRow}>
                  {job.weightKg != null && job.weightKg > 0 && (
                    <View style={[styles.chip, { backgroundColor: theme.surfaceSecond }]}>
                      <Text style={[styles.chipText, { color: theme.textSecond }]}>{job.weightKg} kg</Text>
                    </View>
                  )}
                  {job.isFragile && (
                    <View style={[styles.chip, { backgroundColor: '#EF444418' }]}>
                      <AlertTriangle size={11} color="#EF4444" strokeWidth={2} />
                      <Text style={[styles.chipText, { color: '#EF4444' }]}>Fragile</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Handling warning, never a deadline. */}
            {!!criticalNote && (
              <View style={styles.criticalRow}>
                <Zap size={13} color="#D97706" strokeWidth={2} />
                <Text style={styles.criticalText}>{criticalNote}</Text>
              </View>
            )}
          </View>
        )}

        {/* Who the job is for. Last, because a rider decides on money,
            distance and cargo long before they read a name. */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          <View style={styles.customerRow}>
            <View style={[styles.avatar, { backgroundColor: theme.primary + '20' }]}>
              <Text style={[styles.avatarText, { color: theme.primary }]}>{job.customer.name.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionLabel, { color: theme.textThird }]}>{isRide ? 'PASSENGER' : 'SENDER'}</Text>
              <Text style={[styles.customerName, { color: theme.text }]}>{job.customer.name}</Text>
              {/* A ride passenger is reachable through in-app chat only: no
                  surname, no phone number, ever. A package sender's phone
                  is expected, but it still unlocks on acceptance. */}
              <Text style={[styles.customerNote, { color: theme.textThird }]}>
                {isRide ? 'In-app chat only. No phone number is shared.' : 'Phone shared after acceptance'}
              </Text>
            </View>
            {isRide
              ? <User  size={18} color={theme.textThird} strokeWidth={1.75} />
              : <Phone size={18} color={theme.textThird} strokeWidth={1.75} />}
          </View>
        </View>

      </ScrollView>

      {/* Action bar. This is now a normal sibling below the ScrollView
          instead of an absolute overlay, which also closes the dead
          vertical gap the old 100dp spacer left under the last card.

          insets.bottom REPORTS 0 on this A30's 3-button nav bar, so a bar
          padded with the raw inset sat UNDER the Home button and a rider
          reaching for Accept could hit Home. Hard floor, the same fix as
          customer-app send.tsx. SafeAreaView above deliberately does not
          claim the bottom edge, so this is counted exactly once. */}
      <View style={[styles.actionBar, {
        backgroundColor: theme.surface,
        borderTopColor: theme.border,
        paddingBottom: Spacing.md + Math.max(insets.bottom, 24),
      }]}>
        {jobState === 'unclaimed' ? (
          <>
            <Pressable style={[styles.declineBtn, { borderColor: '#EF4444' }]} onPress={handleDecline} disabled={claiming}>
              <XCircle size={20} color="#EF4444" strokeWidth={1.75} />
              {/* "Skip" on a pool job: nothing is sent, so the button must
                  not read like a decision dispatch acts on (D-1.5). */}
              <Text style={[styles.declineText, { color: '#EF4444' }]}>{isTripOffer ? 'Decline' : 'Skip'}</Text>
            </Pressable>
            <Pressable
              style={[styles.acceptBtn, { backgroundColor: theme.primary, opacity: claiming ? 0.6 : 1 }]}
              onPress={handleAccept}
              disabled={claiming}
            >
              {claiming
                ? <ActivityIndicator color="#fff" />
                : <CheckCircle size={20} color="#fff" strokeWidth={1.75} />}
              {/* A seat booking and a ride are not a "Job" in a rider's
                  words, and the sheet behind this button already says
                  "ride" (2026-08-25). */}
              <Text style={styles.acceptText}>
                {claiming ? 'Accepting...' : isTripOffer ? 'Accept Booking' : isRide ? 'Accept Ride' : 'Accept Job'}
              </Text>
            </Pressable>
          </>
        ) : jobState === 'mine' ? (
          <Pressable
            style={[styles.acceptBtn, { backgroundColor: theme.primary, flex: 1 }]}
            onPress={() => router.replace({ pathname: '/(driver)/active', params: { id: job.id } } as any)}
          >
            <Navigation size={20} color="#fff" strokeWidth={1.75} />
            <Text style={styles.acceptText}>Continue this job</Text>
          </Pressable>
        ) : jobState === 'closed' ? (
          <View style={[styles.stateNote, { backgroundColor: theme.surfaceSecond }]}>
            <CheckCircle size={18} color="#16A34A" strokeWidth={1.75} />
            <Text style={[styles.stateNoteText, { color: theme.textSecond }]}>
              This job is finished. Nothing left to do here.
            </Text>
          </View>
        ) : (
          <View style={[styles.stateNote, { backgroundColor: theme.surfaceSecond }]}>
            <XCircle size={18} color={theme.textThird} strokeWidth={1.75} />
            <Text style={[styles.stateNoteText, { color: theme.textSecond }]}>
              Another driver took this one. It is off your list.
            </Text>
          </View>
        )}
      </View>

      {/* Package photo, full size. A 64dp thumbnail is not enough to tell a
          crate from a cooler box. */}
      <Modal visible={!!photoOpen} transparent animationType="fade" onRequestClose={() => setPhotoOpen(null)}>
        <Pressable style={styles.photoBackdrop} onPress={() => setPhotoOpen(null)}>
          {!!photoOpen && (
            <Image source={{ uri: photoOpen }} style={styles.photoFull} resizeMode="contain" />
          )}
          <View style={styles.photoClose}>
            <X size={22} color="#fff" strokeWidth={2} />
          </View>
        </Pressable>
      </Modal>

      {/* Accept, skip and Navigate, themed. Android's AlertDialog was the
          one surface the SEIRS design system could not reach, and this is
          the screen a rider decides on. */}
      <SeirsSheet spec={sheet} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  urgBadge:{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  urgText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },
  // Tighter than the old Spacing.md gutter so the cards read as one
  // stack of facts rather than four equal-weight slabs.
  content: { padding: Spacing.md, paddingBottom: Spacing.md, gap: 10 },

  countdownCard:  { borderRadius: Radius.lg, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.sm },
  countdownTop:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  countdownLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any },
  countdownTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  countdownFill:  { height: 6, borderRadius: 3 },

  fareCard:   { alignItems: 'center', paddingVertical: Spacing.lg, paddingHorizontal: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, gap: 2 },
  fareLabel:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold as any, letterSpacing: 0.6, textTransform: 'uppercase' },
  fareAmount: { fontSize: 40, fontWeight: FontWeight.bold as any, letterSpacing: -1 },
  fareNote:   { fontSize: FontSize.xs },

  // Light-mode audit 2026-08-24: the background moved to the call site.
  // '#6366F118' is indigo at ~9%, a readable glow over near-black and a
  // grey-lavender smear over the cream light background. This is the one
  // low-alpha colour in the app sitting straight on theme.background with
  // no border and no shadow to give it an edge, and it carries the "this
  // is a passenger, not a package" warning, so it cannot be the faintest
  // thing on the screen.
  rideBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.md, padding: 12 },
  rideBannerText: { color: '#6366F1', fontWeight: FontWeight.bold as any, fontSize: FontSize.sm, flex: 1 },

  card:         { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Card headings are demoted to a quiet eyebrow so the addresses and the
  // cargo line are the loudest things inside their own cards.
  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any, letterSpacing: 0.6 },

  // Route card holds a full-bleed map, so its padding lives on the body.
  routeCard: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  routeBody: { padding: Spacing.md, gap: Spacing.sm },
  // 180dp: tall enough to read two pins and the shape of the run on a
  // 720p phone, short enough that Earnings still leads the screen.
  mapBox:    { height: 180, width: '100%' },
  kmPill:    {
    position: 'absolute', bottom: Spacing.sm, left: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(15,43,76,0.88)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full,
  },
  kmPillText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },

  mapsBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderTopWidth: 1 },
  mapsBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold as any },

  customerRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar:       { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  avatarText:   { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  customerName: { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any, marginTop: 2 },
  customerNote: { fontSize: FontSize.xs, marginTop: 2 },

  routeRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  routeDot:   { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  routeLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any, letterSpacing: 0.6, marginBottom: 1 },
  routeAddr:  { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any, lineHeight: 20 },
  routeLine:  { height: 18, width: 1, marginLeft: 4, marginVertical: -2 },
  navBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  distRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingTop: Spacing.sm, marginTop: 2, borderTopWidth: 1 },
  distText:   { fontSize: FontSize.sm },

  cargoRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  cargoPhoto:  { width: 64, height: 64, borderRadius: Radius.md, borderWidth: 1 },
  cargoDesc:   { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any, lineHeight: 20 },
  cargoMeta:   { fontSize: FontSize.sm },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full },
  chipText:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },
  criticalRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D9770618', borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 7 },
  criticalText:{ color: '#D97706', fontSize: FontSize.xs, fontWeight: FontWeight.semibold as any, flex: 1 },

  notFoundText: { fontSize: FontSize.base, marginTop: Spacing.md, marginBottom: Spacing.lg },
  backLink:     { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.xl },
  backLinkText: { color: '#fff', fontWeight: FontWeight.semibold as any },

  actionBar:   { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1 },
  stateNote:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: Radius.lg },
  stateNoteText: { flex: 1, fontSize: FontSize.sm },
  declineBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 56, borderRadius: Radius.xl, borderWidth: 2 },
  declineText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any },
  acceptBtn:   { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 56, borderRadius: Radius.xl },
  acceptText:  { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold as any },

  photoBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  photoFull:     { width: '92%', height: '80%' },
  photoClose:    { position: 'absolute', top: 48, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});

// Matches the dark map styling the customer tracking map already uses.
// Defined locally because every screen with a map keeps its own copy;
// pulling all of them onto one shared constant is a separate tidy-up.
const DARK_MAP = [
  { elementType: 'geometry',           stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#444444' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#000000' }] },
  { featureType: 'road',               elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'water',              elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'poi',                stylers: [{ visibility: 'off' }] },
];
