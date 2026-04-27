import {
  View, Text, Pressable, StyleSheet,
  ScrollView, Switch, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
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
  economy:  '#22C55E',
  standard: '#00C2FF',
  instant:  '#F4600C',
};

export default function DriverJobsScreen() {
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

  const locationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef        = useRef<Socket | null>(null);
  const firstName        = user?.name?.split(' ')[0] ?? 'Driver';

  useEffect(() => {
    driversApi.me().then(setDriverData).catch(() => {});
  }, []);

  const fetchDeliveries = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await driversApi.myDeliveries();
      setDeliveries(data ?? []);
    } catch { /* driver may not be approved */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    if (!user) return;
    const socket = io(`${SOCKET_URL}/tracking`, { transports: ['websocket'] });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('join:user', { userId: user.id }));
    socket.on('job:request',  () => fetchDeliveries(true));
    socket.on('notification', (n: any) => {
      if (n?.type === 'DELIVERY_ASSIGNED' || n?.type === 'JOB_REQUEST') fetchDeliveries(true);
    });
    return () => { socket.disconnect(); };
  }, [user?.id]);

  useEffect(() => {
    if (isOnline) { startLocationBroadcast(); fetchDeliveries(); }
    else          { stopLocationBroadcast(); setDeliveries([]); }
    return () => stopLocationBroadcast();
  }, [isOnline]);

  const startLocationBroadcast = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    locationInterval.current = setInterval(async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await driversApi.updateLocation(pos.coords.latitude, pos.coords.longitude);
      } catch { /* GPS unavailable */ }
    }, 5000);
  };

  const stopLocationBroadcast = () => {
    if (locationInterval.current) { clearInterval(locationInterval.current); locationInterval.current = null; }
  };

  const handleToggle = async (val: boolean) => {
    setToggling(true);
    try { await driversApi.toggleOnline(val); setIsOnline(val); }
    catch { /* revert on failure */ }
    finally { setToggling(false); }
  };

  const todayDeliveries = deliveries.filter(
    (d) => d.status === 'delivered' && new Date(d.deliveredAt).toDateString() === new Date().toDateString()
  ).length;

  const assigned   = deliveries.filter(d => d.status === 'assigned');
  const inProgress = deliveries.filter(d => ['picked_up', 'in_transit'].includes(d.status));

  const headerColors = isOnline
    ? (['#F4600C', '#D95209'] as const)
    : (['#0D1B2A', '#162D4A'] as const);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDeliveries(); }} />
        }
        contentContainerStyle={{ paddingBottom: Spacing.xl }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <LinearGradient colors={headerColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hey, {firstName} 👋</Text>
            <Text style={styles.headerSub}>
              {toggling ? 'Updating…' : isOnline ? 'Online — receiving jobs' : 'You are offline'}
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
                trackColor={{ false: 'rgba(255,255,255,0.25)', true: 'rgba(255,255,255,0.5)' }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </LinearGradient>

        {/* ── Stats ───────────────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          {[
            { label: "Today's Trips",  value: String(todayDeliveries), icon: 'cube-outline' },
            { label: 'Rating',         value: driverData ? `${Number(driverData.rating).toFixed(1)}` : '—', icon: 'star' },
            { label: 'KYC Status',     value: driverData?.status ?? '—', icon: 'shield-checkmark-outline' },
          ].map((stat) => (
            <View key={stat.label} style={[styles.statCard, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Ionicons name={stat.icon as any} size={18} color={theme.primary} />
              <Text style={[styles.statValue, { color: theme.text }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecond }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Active Delivery ─────────────────────────────────────────────── */}
        {inProgress.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Active Delivery</Text>
            {inProgress.map((d) => (
              <Pressable
                key={d.id}
                style={[styles.activeCard, Shadows.md]}
                onPress={() => router.push({ pathname: '/(driver)/active', params: { id: d.id } })}
              >
                <LinearGradient colors={['#0D1B2A', '#162D4A']} style={styles.activeCardGradient}>
                  <View style={styles.activeBadge}>
                    <Ionicons name="navigate" size={12} color="#fff" />
                    <Text style={styles.activeBadgeText}>
                      {d.status === 'picked_up' ? 'Heading to Dropoff' : 'In Progress'}
                    </Text>
                  </View>
                  <View style={styles.routeBlock}>
                    <View style={styles.routeRow}>
                      <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
                      <Text style={styles.routeText} numberOfLines={1}>{d.pickupAddress}</Text>
                    </View>
                    <View style={[styles.routeLine, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
                    <View style={styles.routeRow}>
                      <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
                      <Text style={styles.routeText} numberOfLines={1}>{d.dropoffAddress}</Text>
                    </View>
                  </View>
                  <Text style={styles.continueText}>Tap to continue →</Text>
                </LinearGradient>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Job Requests ────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {isOnline
                ? `Incoming Requests${assigned.length ? ` (${assigned.length})` : ''}`
                : 'Go online to see jobs'
              }
            </Text>
            {isOnline && assigned.length > 0 && (
              <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                <Text style={styles.badgeText}>{assigned.length}</Text>
              </View>
            )}
          </View>

          {!isOnline ? (
            <View style={[styles.stateCard, { backgroundColor: theme.surface }, Shadows.sm]}>
              <View style={[styles.stateIconWrap, { backgroundColor: theme.surfaceSecond }]}>
                <Ionicons name="moon" size={32} color={theme.textThird} />
              </View>
              <Text style={[styles.stateTitle, { color: theme.text }]}>You're offline</Text>
              <Text style={[styles.stateDesc, { color: theme.textSecond }]}>
                Toggle online above to start receiving delivery requests
              </Text>
            </View>
          ) : loading ? (
            <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xl }} />
          ) : assigned.length === 0 ? (
            <View style={[styles.stateCard, { backgroundColor: theme.surface }, Shadows.sm]}>
              <View style={[styles.stateIconWrap, { backgroundColor: '#FFF0E8' }]}>
                <Ionicons name="search" size={32} color={theme.primary} />
              </View>
              <Text style={[styles.stateTitle, { color: theme.text }]}>Looking for jobs</Text>
              <Text style={[styles.stateDesc, { color: theme.textSecond }]}>
                Delivery requests will appear here. Pull down to refresh.
              </Text>
            </View>
          ) : (
            assigned.map((job) => {
              const urgencyCol = URGENCY_COLOR[job.urgency] ?? '#00C2FF';
              return (
                <View key={job.id} style={[styles.jobCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
                  {/* Job header */}
                  <View style={styles.jobHeader}>
                    <View style={[styles.urgencyPill, { backgroundColor: urgencyCol + '20' }]}>
                      <Ionicons name="flash" size={12} color={urgencyCol} />
                      <Text style={[styles.urgencyText, { color: urgencyCol }]}>
                        {job.urgency?.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.jobPrice, { color: theme.primary }]}>
                      ₦{Number(job.price).toLocaleString()}
                    </Text>
                  </View>

                  {/* Route */}
                  <View style={styles.jobRoute}>
                    <View style={styles.routeRow}>
                      <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
                      <Text style={[styles.jobRouteText, { color: theme.text }]} numberOfLines={1}>
                        {job.pickupAddress}
                      </Text>
                    </View>
                    <View style={[styles.routeLine, { backgroundColor: theme.border }]} />
                    <View style={styles.routeRow}>
                      <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
                      <Text style={[styles.jobRouteText, { color: theme.text }]} numberOfLines={1}>
                        {job.dropoffAddress}
                      </Text>
                    </View>
                  </View>

                  {/* Meta */}
                  <View style={[styles.metaRow, { backgroundColor: theme.surfaceSecond }]}>
                    <View style={styles.metaItem}>
                      <Ionicons name="cube-outline" size={14} color={theme.textSecond} />
                      <Text style={[styles.metaText, { color: theme.textSecond }]}>{job.packageSize}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="navigate-outline" size={14} color={theme.textSecond} />
                      <Text style={[styles.metaText, { color: theme.textSecond }]}>
                        {Number(job.distanceKm).toFixed(1)} km
                      </Text>
                    </View>
                    {job.isFragile && (
                      <View style={styles.metaItem}>
                        <Ionicons name="warning-outline" size={14} color="#FFBE0B" />
                        <Text style={[styles.metaText, { color: '#FFBE0B' }]}>Fragile</Text>
                      </View>
                    )}
                  </View>

                  {/* Actions */}
                  <View style={styles.jobActions}>
                    <Pressable
                      style={[styles.skipBtn, { borderColor: theme.border }]}
                      onPress={() => setDeliveries(prev => prev.filter(d => d.id !== job.id))}
                    >
                      <Text style={[styles.skipText, { color: theme.textSecond }]}>Skip</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.acceptBtn, { backgroundColor: theme.primary }]}
                      onPress={() => router.push({ pathname: '/(driver)/active', params: { id: job.id } })}
                    >
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={styles.acceptText}>Accept Job</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.xl,
  },
  greeting:     { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: '#fff', marginBottom: 4 },
  headerSub:    { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.75)' },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  onlineToggle: { alignItems: 'center', gap: 2 },
  onlineLabel:  { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  statsRow: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, marginTop: -Spacing.lg, marginBottom: Spacing.md,
  },
  statCard:  { flex: 1, padding: Spacing.sm, borderRadius: Radius.lg, alignItems: 'center', gap: 3 },
  statValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, marginTop: 2 },
  statLabel: { fontSize: FontSize.xs, textAlign: 'center' },

  section:       { paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  sectionTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  badge:         { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  badgeText:     { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  activeCard:         { borderRadius: Radius.xl, overflow: 'hidden', marginBottom: Spacing.sm },
  activeCardGradient: { padding: Spacing.md },
  activeBadge:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F4600C', borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: Spacing.sm },
  activeBadgeText:    { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  continueText:       { color: '#F4600C', fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginTop: Spacing.sm, textAlign: 'right' },

  stateCard:     { padding: Spacing.xl, borderRadius: Radius.xl, alignItems: 'center', gap: Spacing.sm },
  stateIconWrap: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.sm },
  stateTitle:    { fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  stateDesc:     { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20, maxWidth: 240 },

  jobCard:    { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md, overflow: 'hidden' },
  jobHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  urgencyPill:{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
  urgencyText:{ fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  jobPrice:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold },

  jobRoute:    { gap: 3, marginBottom: Spacing.sm },
  routeBlock:  { gap: 3 },
  routeRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot:         { width: 10, height: 10, borderRadius: 5 },
  routeLine:   { width: 2, height: 14, marginLeft: 4 },
  routeText:   { flex: 1, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.9)' },
  jobRouteText:{ flex: 1, fontSize: FontSize.sm },

  metaRow:  { flexDirection: 'row', gap: Spacing.md, padding: Spacing.sm, borderRadius: Radius.md, marginBottom: Spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },

  jobActions: { flexDirection: 'row', gap: Spacing.sm },
  skipBtn:    { flex: 1, height: 48, borderRadius: Radius.lg, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  skipText:   { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  acceptBtn:  { flex: 2, height: 48, borderRadius: Radius.lg, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.xs },
  acceptText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
