import {
  View, Text, Pressable, StyleSheet,
  ScrollView, SafeAreaView, Switch, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { io, Socket } from 'socket.io-client';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows, Palette } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { driversApi } from '@/services/api';
import { NotificationBell } from '@/components/NotificationBell';
import { SOCKET_URL } from '@/constants/config';

const URGENCY_COLOR: Record<string, string> = {
  economy:  '#22C55E',
  standard: Palette.info,
  instant:  Palette.orange500,
};

export default function DriverJobsScreen() {
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const { user }    = useAuth();

  const [isOnline,    setIsOnline]    = useState(false);
  const [toggling,    setToggling]    = useState(false);
  const [deliveries,  setDeliveries]  = useState<any[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [driverData,  setDriverData]  = useState<any>(null);

  const locationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef        = useRef<Socket | null>(null);

  const firstName = user?.name?.split(' ')[0] ?? 'Driver';

  // ── Load driver profile once ───────────────────────────────────────────────
  useEffect(() => {
    driversApi.me().then(setDriverData).catch(() => {});
  }, []);

  // ── Fetch assigned deliveries ──────────────────────────────────────────────
  const fetchDeliveries = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await driversApi.myDeliveries();
      setDeliveries(data ?? []);
    } catch {
      // silently fail — driver may not be approved yet
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ── WebSocket: join driver room and react to job_assigned events ───────────
  useEffect(() => {
    if (!user) return;

    const socket = io(`${SOCKET_URL}/tracking`, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      // Join personal notification room (user-level events)
      socket.emit('join:user', { userId: user.id });
    });

    // Gateway emits this directly to the driver's room when auto-matched
    socket.on('job:request', () => {
      fetchDeliveries(true);
    });

    // Also triggered via the in-app notification system
    socket.on('notification', (notif: any) => {
      if (notif?.type === 'DELIVERY_ASSIGNED' || notif?.type === 'JOB_REQUEST') {
        fetchDeliveries(true);
      }
    });

    return () => { socket.disconnect(); };
  }, [user?.id]);

  // ── Start/stop GPS broadcast when online status changes ───────────────────
  useEffect(() => {
    if (isOnline) {
      startLocationBroadcast();
      fetchDeliveries();
    } else {
      stopLocationBroadcast();
      setDeliveries([]);
    }
    return () => {
      stopLocationBroadcast();
    };
  }, [isOnline]);

  const startLocationBroadcast = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    locationInterval.current = setInterval(async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await driversApi.updateLocation(pos.coords.latitude, pos.coords.longitude);
      } catch {
        // GPS unavailable — skip tick
      }
    }, 5000);
  };

  const stopLocationBroadcast = () => {
    if (locationInterval.current) {
      clearInterval(locationInterval.current);
      locationInterval.current = null;
    }
  };

  // ── Online toggle ──────────────────────────────────────────────────────────
  const handleToggle = async (val: boolean) => {
    setToggling(true);
    try {
      await driversApi.toggleOnline(val);
      setIsOnline(val);
    } catch {
      // revert on failure
    } finally {
      setToggling(false);
    }
  };

  // ── Derived stats ──────────────────────────────────────────────────────────
  const todayDeliveries = deliveries.filter(
    (d) => d.status === 'delivered' &&
           new Date(d.deliveredAt).toDateString() === new Date().toDateString()
  ).length;

  const assigned    = deliveries.filter(d => d.status === 'assigned');
  const inProgress  = deliveries.filter(d => ['picked_up', 'in_transit'].includes(d.status));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDeliveries(); }} />
        }
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: isOnline ? theme.primary : '#0D1B2A' }]}>
          <View>
            <Text style={styles.greeting}>Hey, {firstName} 👋</Text>
            <Text style={styles.headerSub}>
              {toggling ? 'Updating...' : isOnline ? 'You are online — receiving jobs' : 'You are offline'}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <NotificationBell />
              <View style={styles.onlineToggle}>
                <Text style={styles.onlineLabel}>{isOnline ? 'Online' : 'Offline'}</Text>
                <Switch
                  value={isOnline}
                  onValueChange={handleToggle}
                  disabled={toggling}
                  trackColor={{ false: 'rgba(255,255,255,0.3)', true: 'rgba(255,255,255,0.6)' }}
                  thumbColor="#fff"
                />
              </View>
            </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { label: "Today's trips",    value: String(todayDeliveries) },
            { label: 'Rating',           value: driverData ? `⭐ ${Number(driverData.rating).toFixed(1)}` : '—' },
            { label: 'KYC Status',       value: driverData?.status ?? '—' },
          ].map((stat) => (
            <View key={stat.label} style={[styles.statCard, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecond }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* In-progress deliveries */}
        {inProgress.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Active Delivery</Text>
            {inProgress.map((d) => (
              <Pressable
                key={d.id}
                style={[styles.jobCard, { backgroundColor: '#0D1B2A' }, Shadows.md]}
                onPress={() => router.push({ pathname: '/(driver)/active', params: { id: d.id } })}
              >
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>
                    {d.status === 'picked_up' ? '📦 Heading to Dropoff' : '🚀 Delivery In Progress'}
                  </Text>
                </View>
                <View style={styles.jobRoute}>
                  <View style={styles.routeRow}>
                    <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
                    <Text style={styles.routeTextLight} numberOfLines={1}>{d.pickupAddress}</Text>
                  </View>
                  <View style={[styles.routeLine, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
                  <View style={styles.routeRow}>
                    <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
                    <Text style={styles.routeTextLight} numberOfLines={1}>{d.dropoffAddress}</Text>
                  </View>
                </View>
                <Text style={styles.continueText}>Tap to continue →</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Incoming requests */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {isOnline ? `Incoming Requests${assigned.length ? ` (${assigned.length})` : ''}` : 'Go online to see jobs'}
          </Text>

          {!isOnline ? (
            <View style={[styles.offlineCard, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Text style={styles.offlineIcon}>💤</Text>
              <Text style={[styles.offlineTitle, { color: theme.text }]}>You're offline</Text>
              <Text style={[styles.offlineDesc, { color: theme.textSecond }]}>
                Toggle online above to start receiving delivery requests.
              </Text>
            </View>
          ) : loading ? (
            <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xl }} />
          ) : assigned.length === 0 ? (
            <View style={[styles.offlineCard, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Text style={styles.offlineIcon}>🔍</Text>
              <Text style={[styles.offlineTitle, { color: theme.text }]}>Looking for jobs</Text>
              <Text style={[styles.offlineDesc, { color: theme.textSecond }]}>
                You'll see delivery requests here. Pull down to refresh.
              </Text>
            </View>
          ) : (
            assigned.map((job) => (
              <View key={job.id} style={[styles.jobCard, { backgroundColor: theme.surface }, Shadows.md]}>
                <View style={styles.jobHeader}>
                  <View style={[styles.urgencyBadge, { backgroundColor: (URGENCY_COLOR[job.urgency] ?? Palette.info) + '18' }]}>
                    <Text style={[styles.urgencyText, { color: URGENCY_COLOR[job.urgency] ?? Palette.info }]}>
                      {job.urgency?.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.jobPrice, { color: theme.primary }]}>
                    ₦{Number(job.price).toLocaleString()}
                  </Text>
                </View>

                <View style={styles.jobRoute}>
                  <View style={styles.routeRow}>
                    <View style={[styles.dot, { backgroundColor: theme.success }]} />
                    <Text style={[styles.routeText, { color: theme.text }]} numberOfLines={1}>
                      {job.pickupAddress}
                    </Text>
                  </View>
                  <View style={[styles.routeLine, { backgroundColor: theme.border }]} />
                  <View style={styles.routeRow}>
                    <View style={[styles.dot, { backgroundColor: theme.error }]} />
                    <Text style={[styles.routeText, { color: theme.text }]} numberOfLines={1}>
                      {job.dropoffAddress}
                    </Text>
                  </View>
                </View>

                <View style={styles.jobMeta}>
                  <Text style={[styles.jobMetaText, { color: theme.textSecond }]}>
                    📦 {job.packageDescription}  ·  📏 {Number(job.distanceKm).toFixed(1)} km
                    {job.isFragile ? '  ·  🫙 Fragile' : ''}
                  </Text>
                </View>

                <View style={styles.jobActions}>
                  <Pressable
                    style={[styles.rejectBtn, { borderColor: theme.border }]}
                    onPress={() => setDeliveries(prev => prev.filter(d => d.id !== job.id))}
                  >
                    <Text style={[styles.rejectText, { color: theme.textSecond }]}>Skip</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.acceptBtn, { backgroundColor: theme.primary }]}
                    onPress={() => router.push({ pathname: '/(driver)/active', params: { id: job.id } })}
                  >
                    <Text style={styles.acceptText}>Accept Job</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.xxl,
  },
  greeting:    { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: '#fff', marginBottom: 4 },
  headerSub:   { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.75)' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  onlineToggle:{ alignItems: 'center', gap: 4 },
  onlineLabel: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  statsRow:    { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.xl, marginTop: -Spacing.md },
  statCard:    { flex: 1, padding: Spacing.md, borderRadius: Radius.md, alignItems: 'center', gap: 2 },
  statValue:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  statLabel:   { fontSize: FontSize.xs, textAlign: 'center' },
  section:     { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl },
  sectionTitle:{ fontSize: FontSize.md, fontWeight: FontWeight.bold, marginBottom: Spacing.md },
  offlineCard: { padding: Spacing.xl, borderRadius: Radius.lg, alignItems: 'center', gap: Spacing.sm },
  offlineIcon: { fontSize: 48 },
  offlineTitle:{ fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  offlineDesc: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  jobCard:     { borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md },
  activeBadge: { backgroundColor: Palette.orange500, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: Spacing.sm },
  activeBadgeText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  routeTextLight:  { flex: 1, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.9)' },
  continueText:    { color: Palette.orange500, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginTop: Spacing.sm, textAlign: 'right' },
  jobHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  urgencyBadge:{ paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  urgencyText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  jobPrice:    { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  jobRoute:    { gap: 2, marginBottom: Spacing.sm },
  routeRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot:         { width: 10, height: 10, borderRadius: 5 },
  routeLine:   { width: 2, height: 12, marginLeft: 4 },
  routeText:   { flex: 1, fontSize: FontSize.sm },
  jobMeta:     { marginBottom: Spacing.md },
  jobMetaText: { fontSize: FontSize.sm },
  jobActions:  { flexDirection: 'row', gap: Spacing.sm },
  rejectBtn:   { flex: 1, height: 44, borderRadius: Radius.md, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  rejectText:  { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  acceptBtn:   { flex: 2, height: 44, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  acceptText:  { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
