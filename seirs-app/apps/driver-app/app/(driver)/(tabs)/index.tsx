import {
  View, Text, Pressable, StyleSheet,
  ScrollView, Switch, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell, MapPin, Star, TrendingUp, Truck, Zap,
  ChevronRight, Target, Wifi, WifiOff, Package,
  Navigation, Clock, AlignLeft,
} from 'lucide-react-native';
import MapView, { PROVIDER_GOOGLE, Circle, Marker } from 'react-native-maps';
import { Drawer } from '@/components/Drawer';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { io, Socket } from 'socket.io-client';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { driversApi } from '@/services/api';
import { NotificationBell } from '@/components/NotificationBell';
import { SOCKET_URL } from '@/constants/config';

const URGENCY_COLOR: Record<string, string> = {
  economy:  '#16A34A',
  standard: '#3A7BD5',
  instant:  '#EF4444',
};

const GOAL_TARGET = 50000;

export default function DriverHomeScreen() {
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const isDark      = colorScheme === 'dark';
  const { user }    = useAuth();

  const [isOnline,   setIsOnline]   = useState(false);
  const [toggling,   setToggling]   = useState(false);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [driverData, setDriverData] = useState<any>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [demandZones, setDemandZones] = useState<Array<{ latitude: number; longitude: number; radiusM: number; intensity: number; orderCount: number }>>([]);

  const locationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef        = useRef<Socket | null>(null);
  const firstName        = user?.name?.split(' ')[0] ?? 'Driver';

  useEffect(() => {
    driversApi.me().then(setDriverData).catch(() => {});
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
      // Available jobs near this driver (sorted by distance). Backend
      // returns pending unassigned deliveries within 25 km of the
      // driver's last known position.
      const res = await driversApi.getAvailableJobs(driverData?.lastLat, driverData?.lastLng);
      setDeliveries(res ?? []);
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
      // A new job was assigned to this driver — refresh the list silently.
      fetchDeliveries(true);
    });

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [isOnline, driverData?.id, fetchDeliveries]);

  const startLocationUpdates = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    locationInterval.current = setInterval(async () => {
      const loc = await Location.getCurrentPositionAsync({});
      driversApi.updateLocation(loc.coords.latitude, loc.coords.longitude).catch(() => {});
    }, 15000);
  };

  const stopLocationUpdates = () => {
    if (locationInterval.current) clearInterval(locationInterval.current);
  };

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
      const isActiveJobs = raw.includes('ACTIVE_JOBS_PRESENT');
      const friendly = raw.replace(/^[A-Z_]+:\s*/, '');
      Alert.alert(
        isActiveJobs ? 'Finish your active jobs first' : 'Could not change status',
        friendly,
      );
    } finally {
      setToggling(false);
    }
  };

  // Backend returns numeric columns (decimal) as strings via TypeORM, and
  // a brand-new driver may not have any rating/earnings recorded yet —
  // coerce everything to Number with a sane default so .toFixed/.formatting
  // calls don't crash on strings or null.
  const weekEarnings  = Number(driverData?.weekEarnings  ?? 0);
  const todayEarnings = Number(driverData?.todayEarnings ?? 0);
  const rating        = Number(driverData?.rating        ?? 4.8);
  const tripCount     = Number(driverData?.totalTrips    ?? 0);
  const goalPct       = Math.min((weekEarnings / GOAL_TARGET) * 100, 100);
  const walletBal     = Number(driverData?.balance       ?? 0);

  const activeJobs = deliveries.filter(d => d.status === 'assigned' || d.status === 'picked_up');
  const activeJob  = activeJobs[0];
  const isPooled   = activeJobs.length > 1;
  const pendingJobs = deliveries.filter(d => d.status === 'pending').slice(0, 3);

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
              <Text style={styles.headerGreet}>Driver Hub</Text>
              <Text style={styles.headerName}>Hi, {firstName}</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable style={styles.headerBtn} onPress={() => router.push('/(driver)/notifications' as any)}>
                <NotificationBell color="#fff" size={22} />
              </Pressable>
              <Pressable style={styles.headerBtn} onPress={() => router.push('/(driver)/kyc' as any)}>
                <Truck size={22} color="#fff" strokeWidth={1.5} />
              </Pressable>
            </View>
          </View>

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
                <Text style={styles.poolBadgeText}>{activeJobs.length}/4</Text>
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
            style={[styles.activeCard, { backgroundColor: '#16A34A15', borderColor: '#16A34A40' }, Shadows.md]}
            onPress={() => router.push({ pathname: '/(driver)/job/[id]', params: { id: activeJob.id } })}
          >
            <View style={styles.activeTop}>
              <View style={[styles.activeDot, { backgroundColor: '#16A34A' }]} />
              <Text style={[styles.activeLabel, { color: '#16A34A' }]}>ACTIVE JOB</Text>
              <ChevronRight size={16} color="#16A34A" strokeWidth={1.75} style={{ marginLeft: 'auto' }} />
            </View>
            <Text style={[styles.activeCustomer, { color: theme.text }]}>{activeJob.customer?.name ?? 'Customer'}</Text>
            <View style={styles.activeRow}>
              <Navigation size={14} color={theme.textThird} strokeWidth={1.75} />
              <Text style={[styles.activeAddr, { color: theme.textSecond }]} numberOfLines={1}>
                {activeJob.dropoffAddress}
              </Text>
            </View>
          </Pressable>
        )}

        {/* ── Widgets row ──────────────────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.widgetRow} contentContainerStyle={styles.widgetContent}>

          {/* Wallet */}
          <Pressable style={[styles.widgetCard, styles.walletWidget, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => router.push('/(driver)/withdrawal' as any)}>
            <View style={styles.widgetIcon}>
              <TrendingUp size={18} color={theme.primary} strokeWidth={1.75} />
            </View>
            <Text style={[styles.widgetLabel, { color: theme.textSecond }]}>Wallet</Text>
            <Text style={[styles.widgetValue, { color: theme.text }]}>₦{walletBal.toLocaleString()}</Text>
            <Text style={[styles.widgetSub, { color: theme.textThird }]}>Today ₦{todayEarnings.toLocaleString()}</Text>
          </Pressable>

          {/* Goal tracker */}
          <View style={[styles.widgetCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.widgetIcon}>
              <Target size={18} color="#D97706" strokeWidth={1.75} />
            </View>
            <Text style={[styles.widgetLabel, { color: theme.textSecond }]}>Weekly Goal</Text>
            <Text style={[styles.widgetValue, { color: theme.text }]}>₦{(weekEarnings / 1000).toFixed(1)}k</Text>
            <View style={[styles.goalTrack, { backgroundColor: theme.surfaceSecond }]}>
              <View style={[styles.goalFill, { width: `${goalPct}%`, backgroundColor: goalPct >= 100 ? '#16A34A' : '#D97706' }]} />
            </View>
            <Text style={[styles.widgetSub, { color: theme.textThird }]}>{Math.round(goalPct)}% of ₦50k</Text>
          </View>

          {/* Rating */}
          <Pressable style={[styles.widgetCard, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => router.push('/(driver)/ratings' as any)}>
            <View style={styles.widgetIcon}>
              <Star size={18} color="#FFBE0B" strokeWidth={1.75} />
            </View>
            <Text style={[styles.widgetLabel, { color: theme.textSecond }]}>Rating</Text>
            <Text style={[styles.widgetValue, { color: rating < 3.5 ? '#EF4444' : theme.text }]}>{rating.toFixed(1)}</Text>
            {rating < 3.5 && <Text style={[styles.ratingWarn, { color: '#EF4444' }]}>Below threshold</Text>}
            <Text style={[styles.widgetSub, { color: theme.textThird }]}>{tripCount} trips</Text>
          </Pressable>

          {/* Demand heatmap mini-map. Used to navigate to /(driver)/active
              but that screen requires a delivery id — clicking it with no
              id left the spinner forever. The map below is the whole
              widget; no destination needed today. */}
          <View style={[styles.widgetCard, styles.heatmapWidget, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.widgetIcon}>
              <MapPin size={18} color="#EF4444" strokeWidth={1.75} />
            </View>
            <Text style={[styles.widgetLabel, { color: theme.textSecond }]}>Demand Map</Text>
            <View style={[styles.heatmapBox, { backgroundColor: theme.surfaceSecond, overflow: 'hidden' }]}>
              {driverData?.lastLat && driverData?.lastLng ? (
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={{ width: '100%', height: '100%' }}
                  pointerEvents="none"
                  liteMode={true}
                  initialRegion={{
                    latitude:  Number(driverData.lastLat),
                    longitude: Number(driverData.lastLng),
                    latitudeDelta:  0.04,
                    longitudeDelta: 0.04,
                  }}
                >
                  {/* Driver marker */}
                  <Marker
                    coordinate={{ latitude: Number(driverData.lastLat), longitude: Number(driverData.lastLng) }}
                    pinColor="#3A7BD5"
                  />
                  {/* Demand zones from backend GET /drivers/demand-zones —
                      colour ramps with intensity (red = hottest). */}
                  {demandZones.map((z, i) => {
                    const fill = z.intensity > 0.66
                      ? 'rgba(239,68,68,0.35)'   // hot — red
                      : z.intensity > 0.33
                      ? 'rgba(245,158,11,0.30)'  // warm — orange
                      : 'rgba(22,163,74,0.25)';  // cool — green
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
                <Text style={[styles.heatmapPlaceholder, { color: theme.textThird }]}>Go online to see demand</Text>
              )}
            </View>
          </View>
        </ScrollView>

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
              <Text style={[styles.emptyText, { color: theme.textSecond }]}>No jobs nearby. Stay online — new requests come in frequently.</Text>
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
                  <Text style={[styles.jobCustomer, { color: theme.text }]}>{job.customer?.name ?? 'Customer'}</Text>
                  <View style={styles.addrRow}>
                    <MapPin size={12} color={theme.textThird} strokeWidth={1.75} />
                    <Text style={[styles.jobAddr, { color: theme.textSecond }]} numberOfLines={1}>{job.pickupAddress}</Text>
                  </View>
                </View>
                <View style={styles.jobRight}>
                  <Text style={[styles.jobFare, { color: theme.primary }]}>₦{(job.driverEarnings ?? job.price ?? 0).toLocaleString()}</Text>
                  <View style={styles.distRow}>
                    <Clock size={12} color={theme.textThird} strokeWidth={1.75} />
                    <Text style={[styles.jobDist, { color: theme.textThird }]}>{job.distanceKm ?? '?'} km</Text>
                  </View>
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
  headerGreet:   { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)', letterSpacing: 1, textTransform: 'uppercase' },
  headerName:    { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: '#fff' },
  headerActions: { flexDirection: 'row', gap: Spacing.sm },
  headerBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },

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

  widgetRow:     { marginTop: Spacing.md },
  widgetContent: { paddingHorizontal: Spacing.md, gap: Spacing.sm },
  widgetCard:    { width: 130, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: 4 },
  walletWidget:  { width: 150 },
  heatmapWidget: { width: 160 },
  widgetIcon:    { width: 32, height: 32, borderRadius: Radius.md, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  widgetLabel:   { fontSize: FontSize.xs },
  widgetValue:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any },
  widgetSub:     { fontSize: FontSize.xs },
  ratingWarn:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },
  goalTrack:     { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  goalFill:      { height: 4, borderRadius: 2 },
  heatmapBox:    { height: 50, borderRadius: Radius.md, marginTop: 4, justifyContent: 'center', alignItems: 'center' },
  heatmapPlaceholder: { fontSize: FontSize.xs },

  section:       { paddingHorizontal: Spacing.md, paddingTop: Spacing.lg },
  sectionRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  sectionTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
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
  jobFare:       { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  distRow:       { flexDirection: 'row', alignItems: 'center', gap: 3 },
  jobDist:       { fontSize: FontSize.xs },
});
