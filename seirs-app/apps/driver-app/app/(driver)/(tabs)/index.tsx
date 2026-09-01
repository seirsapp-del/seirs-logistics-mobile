import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Switch,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell, MapPin, Star, TrendingUp, Truck, Zap, Users, CheckCircle2,
  ChevronRight, Wifi, WifiOff, Package,
  Navigation, Clock, AlignLeft,
} from 'lucide-react-native';
import MapView, { PROVIDER_GOOGLE, Circle, Marker } from 'react-native-maps';
import { Drawer } from '@/components/Drawer';
import { CorridorCard } from '@/components/CorridorCard';
import { SeirsMarkBold } from '@/components/SeirsLogoV2';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { io, Socket } from 'socket.io-client';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePoolCap } from '@/hooks/usePoolCap';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { driversApi, earningsApi } from '@/services/api';
import { NotificationBell } from '@/components/NotificationBell';
import { SOCKET_URL } from '@/constants/config';
import { naira } from '@/utils/money';
import { alertDialog } from '@/components/SeirsDialog';
import { vehicleLabel } from '@seirs/shared/models/vehicles';

const URGENCY_COLOR: Record<string, string> = {
  economy:  '#16A34A',
  standard: '#3A7BD5',
  instant:  '#EF4444',
};

export default function DriverHomeScreen() {
  const poolCap = usePoolCap();
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const isDark      = colorScheme === 'dark';
  const { user }    = useAuth();

  const [isOnline,   setIsOnline]   = useState(false);
  const [toggling,   setToggling]   = useState(false);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [activeDeliveries, setActiveDeliveries] = useState<any[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [driverData, setDriverData] = useState<any>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [demandZones, setDemandZones] = useState<Array<{ latitude: number; longitude: number; radiusM: number; intensity: number; orderCount: number }>>([]);
  // The ledger's withdrawable figure, same source as the Earnings tab:
  // the hub used to show drivers.me().balance, a different number.
  const [withdrawable, setWithdrawable] = useState<number | null>(null);
  /**
   * Did the ledger call fail? (founder 2026-08-24: "Withdrawable shows a
   * dash offline, NGN 0.00 online. Same card, same zero, two renderings.")
   *
   * A dash where money belongs reads as "your earnings vanished", and it
   * was standing in for two different things: still loading, and the
   * request failed. Money now always renders as money and the staleness
   * moves to the sub-line, which is the only honest place for it: a rider
   * with no signal sees their last known figure AND is told it is stale,
   * instead of being shown a dash and left to guess.
   */
  const [earningsStale, setEarningsStale] = useState(false);
  // D-4.3: "Today" must come from the SAME place the Earnings tab reads it,
  // the ledger dashboard. driverData.todayEarnings sums delivery.driverEarnings
  // (the booked share, counted even before a ledger row exists), so the two
  // screens showed different money for the same day.
  const [todayLedger, setTodayLedger] = useState<number | null>(null);

  const locationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef        = useRef<Socket | null>(null);
  const firstName        = user?.name?.split(' ')[0] ?? 'Driver';

  useEffect(() => {
    earningsApi.dashboard()
      .then((d: any) => {
        setWithdrawable(Number(d?.available ?? 0));
        setTodayLedger(d?.today?.earned != null ? Number(d.today.earned) : null);
        setEarningsStale(false);
      })
      // Deliberately does NOT clear the figures: a failed refresh should
      // leave the last known numbers on screen, flagged as not current.
      .catch(() => setEarningsStale(true));
    driversApi.me().then((d) => {
      setDriverData(d);
      // Hydrate the online switch from the server. Without this the toggle
      // resets to OFFLINE on every app restart/reload while the backend
      // (and the admin ops map) still has the driver online. Resume the
      // location heartbeat too, or the position goes stale within 5 min.
      if (d?.isOnline) {
        setIsOnline(true);
        startLocationUpdates();
        fetchDeliveries();
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch real demand zones whenever the driver's known location changes.
  // Falls back to empty array if backend has no clustered data yet.
  useEffect(() => {
    if (!driverData?.lastLat || !driverData?.lastLng) return;
    driversApi.demandZones()
      .then(res => setDemandZones(res?.zones ?? []))
      .catch(() => setDemandZones([]));
  }, [driverData?.lastLat, driverData?.lastLng]);

  const fetchDeliveries = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      // Two feeds (audit 2026-08-10): available jobs are UNASSIGNED, so
      // the active-job card could never appear when derived from them.
      // The driver's own active deliveries come from /deliveries/driver.
      const [res, mine] = await Promise.all([
        driversApi.getAvailableJobs(driverData?.lastLat, driverData?.lastLng).catch(() => []),
        driversApi.myDeliveries().catch(() => []),
      ]);
      setDeliveries(res ?? []);
      setActiveDeliveries(mine ?? []);
    } catch {
      setDeliveries([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [driverData?.lastLat, driverData?.lastLng]);

  useEffect(() => { fetchDeliveries(); }, [fetchDeliveries]);

  // Live job-request feed via Socket.io. Connects only while the driver
  // is online and joins the per-driver room so the backend can target
  // them with auto-matched jobs (`job:request` event).
  useEffect(() => {
    if (!isOnline || !driverData?.id) return;
    const socket = io(`${SOCKET_URL}/tracking`, {
      transports: ['websocket'],
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join:driver-pool', { driverId: driverData.id });
    });

    socket.on('job:request', () => {
      // A new job was assigned to this driver: refresh the list silently.
      fetchDeliveries(true);
    });

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [isOnline, driverData?.id, fetchDeliveries]);

  const startLocationUpdates = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    // Guard against double intervals (server hydration + manual toggle).
    if (locationInterval.current) clearInterval(locationInterval.current);
    locationInterval.current = setInterval(async () => {
      const loc = await Location.getCurrentPositionAsync({});
      driversApi.updateLocation(loc.coords.latitude, loc.coords.longitude).catch(() => {});
    }, 15000);
  };

  const stopLocationUpdates = () => {
    if (locationInterval.current) clearInterval(locationInterval.current);
    // D-10.6: the ref was never nulled, so a later start/stop pair could
    // clear an id that no longer belonged to a live timer.
    locationInterval.current = null;
  };

  // D-10.6: the 15s GPS poster had NO cleanup. It outlived the screen and
  // kept calling updateLocation after logout, from a component that was
  // already gone. active.tsx has always cleared its interval on unmount;
  // this one never did.
  useEffect(() => () => {
    if (locationInterval.current) {
      clearInterval(locationInterval.current);
      locationInterval.current = null;
    }
  }, []);

  const handleToggleOnline = async () => {
    setToggling(true);
    try {
      const next = !isOnline;
      await driversApi.toggleOnline(next);
      setIsOnline(next);
      if (next) {
        await startLocationUpdates();
        await fetchDeliveries();
      } else {
        stopLocationUpdates();
      }
    } catch (e: any) {
      // Backend codes the message; we strip the leading code prefix so
      // the user sees a clean sentence, and tailor the title for known cases.
      const raw = e?.message ?? 'Something went wrong. Please try again.';
      const isActiveJobs  = raw.includes('ACTIVE_JOBS_PRESENT');
      const isUnderReview = raw.includes('ACCOUNT_UNDER_REVIEW');
      const friendly = raw.replace(/^[A-Z_]+:\s*/, '');
      alertDialog(
        isUnderReview ? 'Account under review'
          : isActiveJobs ? 'Finish your active jobs first'
          : 'Could not change status',
        friendly,
      );
    } finally {
      setToggling(false);
    }
  };

  // Backend returns numeric columns (decimal) as strings via TypeORM, and
  // a brand-new driver may not have any rating/earnings recorded yet -
  // coerce everything to Number with a sane default so .toFixed/.formatting
  // calls don't crash on strings or null.
  // Ledger first, driver record only as a fallback while the dashboard loads.
  const todayEarnings = todayLedger ?? Number(driverData?.todayEarnings ?? 0);
  // No fake defaults: a new driver has no rating, not a pretend 4.8.
  const rating        = Number(driverData?.rating        ?? 0);
  /**
   * The driver record exposes totalDeliveries. This read totalTrips,
   * which does not exist on it, so tripCount was always 0 and every
   * rider was told they were New with no trips: the founder's own demo
   * rider shows 214 deliveries and a 4.87 rating on the API while their
   * own hub said "New, 0 trips" (found 2026-08-24 by holding the
   * customer app and the driver app side by side).
   *
   * totalTrips is kept as a fallback in case a future payload uses it.
   */
  const tripCount     = Number(driverData?.totalDeliveries ?? driverData?.totalTrips ?? 0);

  /**
   * The rating a customer would actually see, not the driver row's copy.
   * The stored column showed 4.9 while the profile computed 4.4 from the
   * real rows, and two numbers for one thing a tab apart is worse than
   * either (founder 2026-08-31).
   */
  const [ratingAvg,   setRatingAvg]   = useState<number | null>(null);
  const [ratingCount, setRatingCount] = useState(0);
  const [doneToday,   setDoneToday]   = useState(0);
  const [seatReqs,    setSeatReqs]    = useState(0);

  /**
   * Plain useEffect, not useFocusEffect.
   *
   * The focus variant never fired on this screen: neither the resolve nor
   * the reject branch ran, so the cards sat on their initial values while
   * /drivers/me/ratings was happily returning 4.43 from seven ratings.
   * Home is the tab a driver lands on, so a mount-time load is the right
   * shape anyway, and refreshDeliveries already covers coming back to it.
   */
  useEffect(() => {
    driversApi.myRatings()
      .then((r: any) => { setRatingAvg(Number(r?.average ?? 0)); setRatingCount(Number(r?.total ?? 0)); })
      .catch(() => {});
    earningsApi.dashboard()
      .then((d: any) => setDoneToday(Number(d?.today?.deliveries ?? 0)))
      .catch(() => {});
    // Seat requests waiting on an answer, across every trip the driver
    // declared. Counted here so the card can carry the badge.
    (async () => {
      try {
        const trips = await driversApi.myInterstateTrips().catch(() => []);
        let pending = 0;
        for (const t of (trips ?? []).filter((x: any) => x?.acceptsPassengers)) {
          const bs = await driversApi.tripBookings(t.id).catch(() => []);
          pending += (bs ?? []).filter((b: any) => String(b?.status) === 'requested').length;
        }
        setSeatReqs(pending);
      } catch { /* leave the badge off */ }
    })();
  }, []);

  const activeJobs = activeDeliveries.filter(d => d.status === 'assigned' || d.status === 'picked_up' || d.status === 'in_transit');
  const activeJob  = activeJobs[0];
  const isPooled   = activeJobs.length > 1;
  const pendingJobs = deliveries.filter(d => d.status === 'pending').slice(0, 3);


  // Demand map center: the demand itself when zones exist, else the
  // driver's fix if it is inside Nigeria, else Lagos. Raw GPS put the
  // founder's demand map in Berlin (device QA 2026-08-22).
  const inNigeria = (lat: number, lng: number) =>
    lat >= 4 && lat <= 14 && lng >= 2.5 && lng <= 15;
  const demandCenter = (() => {
    if (demandZones.length > 0) {
      const lat = demandZones.reduce((a, z) => a + z.latitude, 0) / demandZones.length;
      const lng = demandZones.reduce((a, z) => a + z.longitude, 0) / demandZones.length;
      return { latitude: lat, longitude: lng, latitudeDelta: 0.12, longitudeDelta: 0.12 };
    }
    const lat = Number(driverData?.lastLat);
    const lng = Number(driverData?.lastLng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && inNigeria(lat, lng)) {
      return { latitude: lat, longitude: lng, latitudeDelta: 0.05, longitudeDelta: 0.05 };
    }
    return { latitude: 6.5244, longitude: 3.3792, latitudeDelta: 0.12, longitudeDelta: 0.12 };
  })();

  const navGrad: [string, string] = isDark
    ? ['#0D1117', '#161B22']
    : ['#0F2B4C', '#1A3A63'];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDeliveries(); }} tintColor={theme.primary} />}
      >

        {/* ── Mission Control Header ─────────────────────────────────────── */}
        <LinearGradient colors={navGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerGrad}>
          <View style={styles.headerRow}>
            <Pressable style={styles.headerBtn} onPress={() => setDrawerVisible(true)}>
              <AlignLeft size={22} color="#fff" strokeWidth={2} />
            </Pressable>
            <View style={{ flex: 1, marginLeft: 12 }}>
              {/* Brand eyebrow: when drivers screenshot their hub, the
                  okada travels with it (founder 2026-08-22). */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <SeirsMarkBold size={34} color="#FFFFFF" hubColor="#0F2B4C" />
                <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800', letterSpacing: 1.8 }}>SEIRS</Text>
                <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>· DRIVER HUB</Text>
              </View>
              <Text style={styles.headerName}>Hi, {firstName}</Text>
            </View>
            <View style={styles.headerActions}>
              {/* D-1.13: NotificationBell is itself a Pressable that routes to
                  notifications. Wrapping it in a second Pressable meant the
                  outer handler never fired and the tap target was doubled up.
                  Plain View keeps the header button styling. */}
              <View style={styles.headerBtn}>
                <NotificationBell color="#fff" size={22} />
              </View>
              <Pressable style={styles.headerBtn} onPress={() => router.push('/(driver)/vehicle' as any)}>
                <Truck size={22} color="#fff" strokeWidth={1.5} />
              </Pressable>
            </View>
          </View>

          {/* Approval banner: pending drivers can browse the app but
              cannot go online (server enforces it too). Tapping opens
              KYC so they can finish their documents. */}
          {driverData?.status && driverData.status !== 'approved' && (
            <Pressable
              onPress={() => router.push('/(driver)/vehicle' as any)}
              style={styles.reviewBanner}
            >
              <Clock size={18} color="#FFBE0B" strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={styles.reviewTitle}>Account under review</Text>
                <Text style={styles.reviewText}>
                  Complete your KYC documents to get approved. You can explore the app, but going online unlocks after approval.
                </Text>
              </View>
              <ChevronRight size={16} color="rgba(255,255,255,0.7)" strokeWidth={2} />
            </Pressable>
          )}

          {/* Online/Offline toggle */}
          <View style={[styles.toggleCard, { backgroundColor: isOnline ? 'rgba(22,163,74,0.25)' : 'rgba(255,255,255,0.1)' }]}>
            <View style={styles.toggleLeft}>
              {isOnline
                ? <Wifi   size={24} color="#4ADE80" strokeWidth={1.75} />
                : <WifiOff size={24} color="rgba(255,255,255,0.6)" strokeWidth={1.75} />
              }
              <View>
                <Text style={styles.toggleStatus}>{isOnline ? 'You are ONLINE' : 'You are OFFLINE'}</Text>
                <Text style={styles.toggleSub}>
                  {isOnline ? 'Receiving new job requests' : 'Go online to start earning'}
                </Text>
              </View>
            </View>
            {toggling
              ? <ActivityIndicator color="#fff" />
              : (
                <Switch
                  value={isOnline}
                  onValueChange={handleToggleOnline}
                  trackColor={{ false: 'rgba(255,255,255,0.2)', true: '#16A34A' }}
                  thumbColor="#fff"
                />
              )
            }
          </View>
        </LinearGradient>

        {/* ── Pool banner: 2+ active legs → multi-leg view ─────────────── */}
        {isPooled && (
          <Pressable
            style={[styles.poolBanner, { backgroundColor: theme.surface, borderColor: '#3A7BD540' }, Shadows.sm]}
            onPress={() => router.push('/(driver)/multi-leg' as any)}
          >
            <View style={styles.poolBannerLeft}>
              <View style={[styles.poolBadge, { backgroundColor: '#3A7BD5' }]}>
                <Text style={styles.poolBadgeText}>{activeJobs.length}/{poolCap}</Text>
              </View>
              <View>
                <Text style={[styles.poolBannerTitle, { color: theme.text }]}>Pool trip active</Text>
                <Text style={[styles.poolBannerSub, { color: theme.textSecond }]}>
                  Tap to view all {activeJobs.length} legs
                </Text>
              </View>
            </View>
            <ChevronRight size={20} color={theme.textSecond} />
          </Pressable>
        )}

        {/* ── Active job card ───────────────────────────────────────────── */}
        {activeJob && (
          <Pressable
            /**
             * Theme-aware on purpose. '#16A34A15' is green at ~8% alpha:
             * a subtle glow over near-black, and grey-green sludge over
             * the cream light background. It also made the elevation
             * shadow show through the translucency as a second nested
             * box (founder 2026-08-24, light mode).
             *
             * Light gets an opaque surface with a solid green border, so
             * it stays obviously the active job while matching the other
             * cards. Dark keeps the treatment that already worked.
             */
            style={[
              styles.activeCard,
              isDark
                ? { backgroundColor: '#16A34A15', borderColor: '#16A34A40' }
                : { backgroundColor: theme.surface, borderColor: '#16A34A' },
              Shadows.md,
            ]}
            onPress={() => router.push({ pathname: '/(driver)/job/[id]', params: { id: activeJob.id } })}
          >
            <View style={styles.activeTop}>
              <View style={[styles.activeDot, { backgroundColor: '#16A34A' }]} />
              <Text style={[styles.activeLabel, { color: '#16A34A' }]}>ACTIVE JOB</Text>
              <ChevronRight size={16} color="#16A34A" strokeWidth={1.75} style={{ marginLeft: 'auto' }} />
            </View>
            {/* The job list below masks rides correctly; this card was
                missed and showed the passenger's full name (2026-08-23). */}
            <Text style={[styles.activeCustomer, { color: theme.text }]}>
              {(activeJob as any).kind === 'ride'
                ? String(activeJob.customer?.name ?? 'Passenger').trim().split(/\s+/)[0]
                : (activeJob.customer?.name ?? 'Customer')}
            </Text>
            <View style={styles.activeRow}>
              <Navigation size={14} color={theme.textThird} strokeWidth={1.75} />
              <Text style={[styles.activeAddr, { color: theme.textSecond }]} numberOfLines={1}>
                {activeJob.dropoffAddress}
              </Text>
            </View>
          </Pressable>
        )}

        {/* Corridor: bicycle/on-foot couriers carry what was going their
            way anyway (founder 2026-08-21, the inclusion tier). */}
        {driverData?.vehicleType === 'bicycle' && (
          <CorridorCard
            driver={driverData}
            onChanged={() => driversApi.me().then(setDriverData).catch(() => {})}
          />
        )}

        {/* ── Demand map: full-width, top of the fold (founder
            2026-08-10: it was buried as the 4th card in a horizontal
            scroll). Tap opens the Hotspots screen. */}
        <Pressable
          onPress={() => router.push('/(driver)/hotspots' as any)}
          style={[styles.bigMapCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}
        >
          <View style={styles.bigMapHead}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MapPin size={16} color="#EF4444" strokeWidth={1.75} />
              <Text style={[styles.bigMapTitle, { color: theme.text }]}>Demand Hotspots</Text>
            </View>
            <Text style={[styles.bigMapCta, { color: theme.primary }]}>Open map</Text>
          </View>
          <View style={[styles.bigMapBox, { backgroundColor: theme.surfaceSecond }]}>
            {driverData ? (
              <MapView
                provider={PROVIDER_GOOGLE}
                style={{ width: '100%', height: '100%' }}
                pointerEvents="none"
                liteMode={true}
                key={`${demandCenter.latitude.toFixed(3)},${demandCenter.longitude.toFixed(3)}`}
                initialRegion={demandCenter}
              >
                {driverData?.lastLat && driverData?.lastLng &&
                  inNigeria(Number(driverData.lastLat), Number(driverData.lastLng)) && (
                  <Marker
                    coordinate={{ latitude: Number(driverData.lastLat), longitude: Number(driverData.lastLng) }}
                    pinColor="#3A7BD5"
                  />
                )}
                {demandZones.map((z, i) => {
                  const fill = z.intensity > 0.66
                    ? 'rgba(239,68,68,0.35)'
                    : z.intensity > 0.33
                    ? 'rgba(217,119,6,0.30)'
                    : 'rgba(22,163,74,0.25)';
                  return (
                    <Circle
                      key={i}
                      center={{ latitude: z.latitude, longitude: z.longitude }}
                      radius={z.radiusM}
                      fillColor={fill}
                      strokeWidth={0}
                    />
                  );
                })}
              </MapView>
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={[styles.heatmapPlaceholder, { color: theme.textThird }]}>Go online to see demand around you</Text>
              </View>
            )}
          </View>
        </Pressable>

        {/* ── Widgets row ──────────────────────────────────────────────── */}
        <View style={styles.widgetRow}>

          {/* The withdrawable balance USED to sit here and no longer does.
              A driver's money should not be readable over their shoulder at
              a junction (founder 2026-08-31: "any threat actor can just look
              at their screen and see the money they have and try to rob
              them"). It lives on Earnings, which is opened deliberately. */}

          {/* Done today */}
          <Pressable style={[styles.widgetCard, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => router.push('/(driver)/(tabs)/history' as any)}>
            <View style={styles.widgetIcon}>
              <CheckCircle2 size={18} color={theme.primary} strokeWidth={1.75} />
            </View>
            <Text style={[styles.widgetLabel, { color: theme.textSecond }]}>Done today</Text>
            <Text style={[styles.widgetValue, { color: theme.text }]}>{doneToday}</Text>
            <Text style={[styles.widgetSub, { color: theme.textThird }]} numberOfLines={1}>
              {doneToday === 1 ? 'job completed' : 'jobs completed'}
            </Text>
          </Pressable>

          {/* Rating, the REAL one.
              This read the driver row's stored copy, which showed 4.9 while
              the profile computed 4.4 from the actual ratings. Two numbers
              for one thing, one tab apart. Now both come from the same
              place. */}
          <Pressable style={[styles.widgetCard, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => router.push('/(driver)/ratings' as any)}>
            <View style={styles.widgetIcon}>
              <Star size={18} color="#FFBE0B" strokeWidth={1.75} />
            </View>
            <Text style={[styles.widgetLabel, { color: theme.textSecond }]}>Rating</Text>
            {/* "New" rather than 0.0: a dash does not frighten a driver who
                simply has not been rated yet. */}
            <Text style={[styles.widgetValue, { color: ratingCount > 0 && (ratingAvg ?? 0) < 3.5 ? '#EF4444' : theme.text }]}>
              {ratingCount > 0 ? (ratingAvg ?? 0).toFixed(1) : 'New'}
            </Text>
            <Text style={[styles.widgetSub, { color: theme.textThird }]} numberOfLines={1}>
              {ratingCount > 0 ? `${ratingCount} rating${ratingCount === 1 ? '' : 's'}` : 'no ratings yet'}
            </Text>
          </Pressable>

          {/* Seat requests.
              The backend has had accept and decline since Travel Buddy
              shipped and nothing in this app called either, so a driver
              declared a trip and never learned that anybody wanted to
              ride. */}
          <Pressable style={[styles.widgetCard, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => router.push('/(driver)/seat-requests' as any)}>
            <View style={styles.widgetIcon}>
              <Users size={18} color={seatReqs > 0 ? theme.primary : theme.textThird} strokeWidth={1.75} />
            </View>
            <Text style={[styles.widgetLabel, { color: theme.textSecond }]}>Requests</Text>
            <Text style={[styles.widgetValue, { color: seatReqs > 0 ? theme.primary : theme.text }]}>{seatReqs}</Text>
            <Text style={[styles.widgetSub, { color: theme.textThird }]} numberOfLines={1}>
              {seatReqs > 0 ? 'waiting on you' : 'for your trips'}
            </Text>
          </Pressable>

        </View>

        {/* Interstate, full width under the pair.
            Founder 2026-08-31: declaring a long-haul trip was buried in the
            drawer, where a rider has no reason to look, and squeezed into
            the 130px widget row it clipped its own subtitle. It is one of
            the few things on this screen that MAKES money rather than
            reporting it, so it gets its own row: the same shape Travel
            Buddy took on the customer home. */}
        <Pressable
          style={[styles.interRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.push('/(driver)/interstate' as any)}
        >
          <View style={[styles.interIcon, { backgroundColor: theme.primary + '1A' }]}>
            <Navigation size={20} color={theme.primary} strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.interTitle, { color: theme.text }]}>Declare an intercity trip</Text>
            <Text style={[styles.interSub, { color: theme.textThird }]} numberOfLines={1}>
              Sell spare seats and boot space
            </Text>
          </View>
          <ChevronRight size={18} color={theme.textThird} />
        </Pressable>

        {/* ── Available jobs ────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Available Jobs</Text>
            {isOnline && (
              <View style={[styles.liveDot]}>
                <View style={[styles.livePulse, { backgroundColor: '#16A34A' }]} />
                <Text style={[styles.liveText, { color: '#16A34A' }]}>Live</Text>
              </View>
            )}
          </View>

          {!isOnline ? (
            <View style={[styles.offlineBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <WifiOff size={32} color={theme.textThird} strokeWidth={1.5} />
              <Text style={[styles.offlineTitle, { color: theme.text }]}>You're offline</Text>
              <Text style={[styles.offlineSub, { color: theme.textSecond }]}>Go online to start receiving job requests.</Text>
            </View>
          ) : loading ? (
            <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.lg }} />
          ) : pendingJobs.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Package size={32} color={theme.textThird} strokeWidth={1.5} />
              <Text style={[styles.emptyText, { color: theme.textSecond }]}>No jobs nearby. Stay online: new requests come in frequently.</Text>
            </View>
          ) : (
            pendingJobs.map(job => (
              <Pressable
                key={job.id}
                style={[styles.jobCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
                onPress={() => router.push({ pathname: '/(driver)/job/[id]', params: { id: job.id } })}
              >
                <View style={[styles.urgBadge, { backgroundColor: (URGENCY_COLOR[job.urgency] ?? theme.primary) + '18' }]}>
                  <Zap size={12} color={URGENCY_COLOR[job.urgency] ?? theme.primary} strokeWidth={2} />
                  <Text style={[styles.urgText, { color: URGENCY_COLOR[job.urgency] ?? theme.primary }]}>
                    {job.urgency ?? 'standard'}
                  </Text>
                </View>
                <View style={styles.jobInfo}>
                  {/* Audit 2026-08-10: package info instead of the
                      customer's name (privacy: identity reveals on
                      acceptance), and the DROPOFF is finally shown so
                      drivers can judge where the trip ends. */}
                  <Text style={[styles.jobCustomer, { color: job.kind === 'ride' ? '#6366F1' : theme.text }]}>
                    {job.kind === 'ride'
                      ? `RIDE · passenger (${vehicleLabel(job.vehicleType)})`
                      : [job.packageSize, vehicleLabel(job.vehicleType)].filter(Boolean).join(' · ') || 'Package delivery'}
                  </Text>
                  <View style={styles.addrRow}>
                    <MapPin size={12} color="#16A34A" strokeWidth={1.75} />
                    <Text style={[styles.jobAddr, { color: theme.textSecond }]} numberOfLines={1}>{job.pickupAddress}</Text>
                  </View>
                  <View style={styles.addrRow}>
                    <MapPin size={12} color="#EF4444" strokeWidth={1.75} />
                    <Text style={[styles.jobAddr, { color: theme.textSecond }]} numberOfLines={1}>{job.dropoffAddress}</Text>
                  </View>
                  {/*
                    Interstate marking (2026-08-31).

                    A Lagos to Kano parcel and a Lagos to Yaba parcel sat
                    in this list looking identical: two addresses and one
                    small number that was actually the distance to the
                    PICKUP. A rider could not tell an 800 km commitment
                    from an afternoon drop without opening it.

                    Shown only when the server actually knows both states.
                    isInterState is null, not false, on rows booked before
                    the columns existed, and saying nothing is correct
                    there: an unmeasured run must not be labelled local.
                  */}
                  {job.isInterState === true && (
                    <View style={[styles.interBadge, { backgroundColor: '#B4530920' }]}>
                      <Text style={[styles.interText, { color: '#B45309' }]} numberOfLines={1}>
                        INTERSTATE · {job.pickupStateName ?? job.pickupStateCode} to {job.dropoffStateName ?? job.dropoffStateCode}
                        {job.tripKm != null ? ` · ${job.tripKm} km` : ''}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.jobRight}>
                  <Text style={[styles.earnLabel, { color: theme.textThird }]}>You earn</Text>
                  <Text style={[styles.jobFare, { color: theme.primary }]}>{naira(job.youEarnNgn ?? job.driverEarnings ?? 0)}</Text>
                  {/*
                    Two distances, named. This showed one unlabelled number
                    beside a clock, which read as journey time or trip
                    length and was neither: it is how far the rider is from
                    the pickup. Both matter, so both are labelled.
                  */}
                  <View style={styles.distRow}>
                    <Navigation size={11} color={theme.textThird} strokeWidth={1.75} />
                    <Text style={[styles.jobDist, { color: theme.textThird }]}>
                      {job.distanceKm != null ? `${job.distanceKm} km away` : 'nearby'}
                    </Text>
                  </View>
                  {job.tripKm != null && (
                    <View style={styles.distRow}>
                      <Clock size={11} color={theme.textThird} strokeWidth={1.75} />
                      <Text style={[styles.jobDist, { color: theme.textThird }]}>{job.tripKm} km trip</Text>
                    </View>
                  )}
                </View>
                <ChevronRight size={16} color={theme.textThird} strokeWidth={1.75} />
              </Pressable>
            ))
          )}
        </View>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>

      {/* Hamburger Drawer */}
      <Drawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerGrad:    { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: Spacing.md },
  headerRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerName:    { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: '#fff' },
  headerActions: { flexDirection: 'row', gap: Spacing.sm },
  headerBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },

  reviewBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: 'rgba(255,190,11,0.14)', borderWidth: 1, borderColor: 'rgba(255,190,11,0.4)', borderRadius: Radius.xl, padding: Spacing.md, marginBottom: Spacing.sm },
  reviewTitle:  { color: '#FFBE0B', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  reviewText:   { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.xs, lineHeight: 16, marginTop: 2 },

  toggleCard:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, borderRadius: Radius.xl, gap: Spacing.md },
  toggleLeft:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  toggleStatus:  { fontSize: FontSize.base, fontWeight: FontWeight.bold as any, color: '#fff' },
  toggleSub:     { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.65)', marginTop: 2 },

  activeCard:    { marginHorizontal: Spacing.md, marginTop: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.xs },
  poolBanner:        { marginHorizontal: Spacing.md, marginTop: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  poolBannerLeft:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  poolBadge:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  poolBadgeText:     { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },
  poolBannerTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any },
  poolBannerSub:     { fontSize: FontSize.xs, marginTop: 2 },
  activeTop:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  activeDot:     { width: 8, height: 8, borderRadius: 4 },
  activeLabel:   { fontSize: FontSize.xs, fontWeight: FontWeight.black as any, letterSpacing: 1 },
  activeCustomer:{ fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  activeRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  activeAddr:    { fontSize: FontSize.sm, flex: 1 },

  widgetRow:     { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md,
                   paddingHorizontal: Spacing.md },

  bigMapCard:  { marginHorizontal: Spacing.md, marginTop: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  bigMapHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 10 },
  bigMapTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  bigMapCta:   { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  bigMapBox:   { height: 150 },
  widgetContent: { paddingHorizontal: Spacing.md, gap: Spacing.sm },
  widgetCard:    { flex: 1, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: 4 },
  walletWidget:  {},
  widgetIcon:    { width: 32, height: 32, borderRadius: Radius.md, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  widgetLabel:   { fontSize: FontSize.xs },
  widgetValue:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any },
  widgetSub:     { fontSize: FontSize.xs },
  ratingWarn:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },
  heatmapPlaceholder: { fontSize: FontSize.xs },

  section:       { paddingHorizontal: Spacing.md, paddingTop: Spacing.lg },
  sectionRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  sectionTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  interRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
                   marginHorizontal: Spacing.md, marginTop: Spacing.md,
                   padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  interIcon:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  interTitle:    { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any },
  interSub:      { fontSize: FontSize.sm, marginTop: 2 },
  liveDot:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  livePulse:     { width: 8, height: 8, borderRadius: 4 },
  liveText:      { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },

  offlineBox:    { alignItems: 'center', padding: Spacing.xl, borderRadius: Radius.xl, borderWidth: 1, gap: Spacing.sm },
  offlineTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  offlineSub:    { fontSize: FontSize.sm, textAlign: 'center' },
  emptyBox:      { alignItems: 'center', padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, gap: Spacing.sm },
  emptyText:     { fontSize: FontSize.sm, textAlign: 'center' },

  jobCard:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, marginBottom: Spacing.sm },
  urgBadge:      { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full },
  urgText:       { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any, textTransform: 'capitalize' },
  jobInfo:       { flex: 1, gap: 3 },
  addrRow:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  jobCustomer:   { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any },
  jobAddr:       { fontSize: FontSize.xs, flex: 1 },
  jobRight:      { alignItems: 'flex-end', gap: 4 },
  earnLabel:     { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: FontWeight.semibold as any },
  jobFare:       { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  distRow:       { flexDirection: 'row', alignItems: 'center', gap: 3 },
  jobDist:       { fontSize: FontSize.xs },
  interBadge:    { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
  interText:     { fontSize: 10, fontWeight: FontWeight.bold as any, letterSpacing: 0.3 },
});
