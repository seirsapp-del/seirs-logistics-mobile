import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar, RefreshControl, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { HamburgerButton } from '@/components/HamburgerButton';
import { Illustration } from '@/components/Illustration';
import { deliveriesApi } from '@/services/api';

// Display config minus the label (label is looked up via t('status.<key>')).
const STATUS_CONFIG: Record<string, { color: string; icon: string }> = {
  pending:     { color: '#3A7BD5', icon: 'time-outline' },
  assigned:    { color: '#3A7BD5', icon: 'navigate-outline' },
  picked_up:   { color: '#FF6B00', icon: 'cube-outline' },
  in_transit:  { color: '#0F2B4C', icon: 'navigate' },
  in_progress: { color: '#FF6B00', icon: 'car-outline' },
  completed:   { color: '#16A34A', icon: 'checkmark-circle' },
  cancelled:   { color: '#6B7280', icon: 'close-circle-outline' },
  failed:      { color: '#EF4444', icon: 'alert-circle-outline' },
};

const FILTER_TABS = ['All', 'Active', 'Completed', 'Cancelled'] as const;
type FilterTab = typeof FILTER_TABS[number];

const ACTIVE_STATUSES   = new Set(['pending', 'assigned', 'picked_up', 'in_transit', 'in_progress']);
const COMPLETED_STATUSES = new Set(['completed', 'delivered']);
const CANCELLED_STATUSES = new Set(['cancelled', 'failed']);

type Trip = {
  id: string;
  status: string;
  date: string;
  pickupAddress: string;
  dropoffAddress: string;
  distance: string;
  price: number;
  driver: { id: string; name: string; profilePhoto?: string } | null;
  rating: number | null;
  trackingCode: string;
  /** Set once the fare is held. Absent on a booking never paid for. */
  paymentHeldAt: string | null;
};

function toTrip(d: any): Trip {
  const drv = d.driver
    ? {
        id:           d.driver.id ?? d.driver.user?.id ?? 'd',
        name:         d.driver.user?.name ?? d.driver.name ?? 'Driver',
        profilePhoto: d.driver.user?.profilePhoto ?? d.driver.profilePhoto,
      }
    : null;
  return {
    id:             d.id,
    status:         String(d.status ?? 'pending'),
    date:           d.deliveredAt ?? d.createdAt ?? new Date().toISOString(),
    pickupAddress:  d.pickupAddress ?? '-',
    dropoffAddress: d.dropoffAddress ?? '-',
    distance:       d.distanceKm ? `${Number(d.distanceKm).toFixed(1)} km` : '-',
    // Whole naira on the card: the rate card computes in kobo precision
    // and "N1,473.15" reads like an error to a customer (founder catch,
    // 2026-08-15). The receipt keeps the exact figure.
    price:          Math.round(Number(d.price ?? 0)),
    driver:         drv,
    rating:         d.customerRating ?? null,
    trackingCode:   d.trackingCode ?? d.id,
    paymentHeldAt:  d.paymentHeldAt ?? null,
  };
}

export default function HistoryScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { t }   = useTranslation();

  const [activeTab, setActiveTab] = useState<FilterTab>('All');
  const [trips, setTrips]         = useState<Trip[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page,        setPage]        = useState(1);
  const [hasMore,     setHasMore]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search,      setSearch]      = useState('');

  const PAGE_SIZE = 20;

  // The screen used to ask for one page of 50 and ignore the `pages` the API
  // already returns, so a customer with more than 50 bookings could not reach
  // the older ones at all. The business Deliveries tab has paged since its
  // rebuild; this is the same behaviour on this side.
  const load = useCallback(async (p = 1, append = false) => {
    try {
      const res = await deliveriesApi.myDeliveries(p, PAGE_SIZE, search);
      const rows = (res.items ?? []).map(toTrip);
      setTrips(prev => (append ? [...prev, ...rows] : rows));
      setPage(p);
      const pages = Number((res as any)?.pages ?? 0);
      // Fall back to a short-page check so a missing field cannot strand it.
      setHasMore(pages ? p < pages : rows.length === PAGE_SIZE);
    } catch {
      if (!append) setTrips([]);
      setHasMore(false);
    }
  }, [search]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await load(page + 1, true);
    setLoadingMore(false);
  }, [loadingMore, hasMore, page, load]);

  useEffect(() => {
    (async () => { await load(); setLoading(false); })();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => { load(1, false); }, 350);
    return () => clearTimeout(t);
  }, [search, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const [paying,     setPaying]     = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const handlePay = (trip: Trip) => {
    setPaying(trip.id);
    router.push({ pathname: '/(customer)/payment/[deliveryId]', params: { deliveryId: trip.id } } as any);
    setPaying(null);
  };

  const handleCancel = async (trip: Trip) => {
    // Never quote a cancellation fee from the bundled rate card: ask the
    // server what it costs right now, exactly as trip-progress does.
    setCancelling(trip.id);
    let feeNgn = 0;
    let cancellable = true;
    try {
      const q = await deliveriesApi.cancelQuote(trip.id);
      feeNgn = Number(q?.feeNgn ?? 0);
      cancellable = q?.cancellable !== false;
    } catch {
      // Fall through and let the server reject it if it must.
    }
    setCancelling(null);
    if (!cancellable) {
      Alert.alert('Too late to cancel', 'This delivery is already under way. Message your driver from the trip screen.');
      return;
    }
    Alert.alert(
      'Cancel this booking?',
      feeNgn > 0
        ? `Tracking ${trip.trackingCode}. A cancellation fee of NGN ${feeNgn.toLocaleString()} applies and the rest is refunded.`
        : `Tracking ${trip.trackingCode}. No cancellation fee applies.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel booking', style: 'destructive',
          onPress: async () => {
            try {
              await deliveriesApi.cancel(trip.id);
              await load(1, false);
            } catch (e: any) {
              Alert.alert('Could not cancel', e?.message ?? 'Please try again in a moment.');
            }
          },
        },
      ],
    );
  };

  const filtered = trips.filter(t => {
    if (activeTab === 'All')       return true;
    if (activeTab === 'Active')    return ACTIVE_STATUSES.has(t.status);
    if (activeTab === 'Completed') return COMPLETED_STATUSES.has(t.status);
    if (activeTab === 'Cancelled') return CANCELLED_STATUSES.has(t.status);
    return true;
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
        <HamburgerButton />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>{t('history.title')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            {filtered.length} trip{filtered.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="search" size={16} color={theme.textThird} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder={t('history.searchPlaceholder', { defaultValue: 'Search tracking code or address…' })}
          placeholderTextColor={theme.textThird}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={theme.textThird} />
          </Pressable>
        )}
      </View>

      {/* Filter tabs */}
      <View style={[styles.tabRow, { borderBottomColor: theme.border }]}>
        {FILTER_TABS.map(tab => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? theme.primary : theme.textSecond }]}>
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loadingMore ? (
          <View style={styles.empty}><ActivityIndicator color={theme.primary} /></View>
        ) : null}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}><ActivityIndicator color={theme.primary} /></View>
          ) : (
            <View style={styles.empty}>
              <Illustration name="empty-no-deliveries" size={140} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('history.empty')}</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>
                {activeTab === 'All' ? 'Request your first ride to see it here.' : `No ${activeTab.toLowerCase()} trips.`}
              </Text>
              {activeTab === 'All' && (
                <Pressable style={[styles.ctaBtn, { backgroundColor: theme.primary }]} onPress={() => router.push('/(customer)/request')}>
                  <Ionicons name="car" size={16} color="#fff" />
                  <Text style={styles.ctaBtnText}>Request a Ride</Text>
                </Pressable>
              )}
            </View>
          )
        }
        renderItem={({ item: trip }) => {
          const status = STATUS_CONFIG[trip.status] ?? { color: '#A1A1AA', icon: 'ellipse-outline' };
          const statusLabel = t(`status.${trip.status}`, { defaultValue: trip.status });
          const isActive = ACTIVE_STATUSES.has(trip.status);
          // Same test the business Deliveries card uses: pending AND the
          // fare was never held means the sender still owes for this one.
          const isUnpaid      = trip.status === 'pending' && !trip.paymentHeldAt;
          const isCancellable = trip.status === 'pending' || trip.status === 'assigned';
          return (
            <Pressable
              style={({ pressed }) => [styles.card, { backgroundColor: theme.surface }, Shadows.sm, pressed && { opacity: 0.85 }]}
              onPress={() => router.push({ pathname: '/(customer)/trip/[id]', params: { id: trip.id } })}
            >
              {/* Top row */}
              <View style={styles.cardTop}>
                <View style={[styles.statusBadge, { backgroundColor: status.color + '18' }]}>
                  <Ionicons name={status.icon as any} size={12} color={status.color} />
                  <Text style={[styles.statusText, { color: status.color }]}>{statusLabel}</Text>
                </View>
                <Text style={[styles.dateText, { color: theme.textThird }]}>{formatDate(trip.date)}</Text>
              </View>

              {/* Route */}
              <View style={styles.routeBlock}>
                <View style={styles.routeRow}>
                  <View style={[styles.routeDot, { backgroundColor: '#22C55E' }]} />
                  <Text style={[styles.routeAddr, { color: theme.text }]} numberOfLines={1}>{trip.pickupAddress}</Text>
                </View>
                <View style={[styles.connector, { backgroundColor: theme.border }]} />
                <View style={styles.routeRow}>
                  <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={[styles.routeAddr, { color: theme.text }]} numberOfLines={1}>{trip.dropoffAddress}</Text>
                </View>
              </View>

              {/* Divider */}
              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              {/* Footer */}
              <View style={styles.cardFooter}>
                {trip.driver ? (
                  <View style={styles.driverMini}>
                    <Avatar name={trip.driver.name} uri={trip.driver.profilePhoto} size={24} />
                    <Text style={[styles.driverName, { color: theme.textSecond }]}>{trip.driver.name}</Text>
                  </View>
                ) : (
                  <Text style={[styles.driverName, { color: theme.textThird }]}>No driver</Text>
                )}
                <View style={styles.footerRight}>
                  {trip.distance !== '-' && (
                    <Text style={[styles.distText, { color: theme.textThird }]}>{trip.distance} · </Text>
                  )}
                  <Text style={[styles.priceText, { color: theme.primary }]}>₦{trip.price.toLocaleString()}</Text>
                </View>
              </View>

              {/* Rate prompt */}
              {trip.status === 'completed' && !trip.rating && (
                <Pressable
                  style={[styles.rateBtn, { borderColor: '#FFBE0B', backgroundColor: isDark ? '#1A1400' : '#FFFBEB' }]}
                  onPress={() => router.push({ pathname: '/(customer)/rate/[driverId]', params: { driverId: trip.driver?.id ?? 'd1', tripId: trip.id } })}
                >
                  <Ionicons name="star-outline" size={14} color="#FFBE0B" />
                  <Text style={[styles.rateBtnText, { color: '#FFBE0B' }]}>Rate this trip</Text>
                </Pressable>
              )}

              {/* Unpaid or still cancellable: same actions row the business
                  Deliveries card uses. Until now the customer app offered
                  neither, so a booking whose payment never completed could
                  not be paid for OR cancelled from the app at all. */}
              {(isUnpaid || isCancellable) && (
                <View style={styles.cardActions}>
                  {isUnpaid && (
                    <Pressable
                      onPress={() => handlePay(trip)}
                      disabled={paying === trip.id}
                      hitSlop={8}
                      style={[styles.payLink, { borderColor: theme.primary }]}
                    >
                      <Text style={[styles.payLinkText, { color: theme.primary }]}>
                        {paying === trip.id ? 'Opening…' : 'Pay now'}
                      </Text>
                    </Pressable>
                  )}
                  {isCancellable && (
                    <Pressable
                      onPress={() => handleCancel(trip)}
                      disabled={cancelling === trip.id}
                      hitSlop={8}
                      style={styles.cancelBtn}
                    >
                      <Text style={styles.cancelBtnText}>
                        {cancelling === trip.id ? 'Checking…' : 'Cancel'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}

              {/* Active trip → live tracking */}
              {isActive && (
                <Pressable
                  style={[styles.rateBtn, { borderColor: theme.primary, backgroundColor: isDark ? '#001020' : '#EFF6FF' }]}
                  onPress={() => router.push({ pathname: '/(customer)/trip-progress', params: { id: trip.id, driverId: trip.driver?.id ?? 'd1' } })}
                >
                  <Ionicons name="navigate-outline" size={14} color={theme.primary} />
                  <Text style={[styles.rateBtnText, { color: theme.primary }]}>Track live</Text>
                </Pressable>
              )}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Search box values taken from the business Deliveries tab.
  searchWrap:    { flexDirection: 'row', alignItems: 'center', gap: 10,
                   marginHorizontal: 16, marginTop: 16, borderRadius: 12,
                   paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1 },
  searchInput:   { flex: 1, fontSize: 14 },
  // Values taken from the business Deliveries card so the two read alike.
  cardActions:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
                   gap: 10, marginTop: 12 },
  payLink:       { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  payLinkText:   { fontSize: 12.5, fontWeight: '700' },
  cancelBtn:     { borderWidth: 1, borderColor: '#DC2626', borderRadius: 999,
                   paddingHorizontal: 14, paddingVertical: 6 },
  cancelBtnText: { fontSize: 12.5, fontWeight: '700', color: '#DC2626' },
  header:    { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.xs },
  title:     { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  subtitle:  { fontSize: FontSize.sm, marginTop: 2 },

  tabRow:  { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: Spacing.sm },
  tab:     { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm },
  tabText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xl },

  card:     { borderRadius: Radius.xl, padding: Spacing.md },
  cardTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },

  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
  statusText:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  dateText:    { fontSize: FontSize.xs },

  routeBlock: { gap: 3, marginBottom: Spacing.sm },
  routeRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  routeDot:   { width: 9, height: 9, borderRadius: 5 },
  routeAddr:  { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  connector:  { width: 1.5, height: 10, marginLeft: 4 },

  divider: { height: 1, marginBottom: Spacing.sm },

  cardFooter:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  driverMini:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  driverName:  { fontSize: FontSize.sm },
  footerRight: { flexDirection: 'row', alignItems: 'center' },
  distText:    { fontSize: FontSize.sm },
  priceText:   { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  rateBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.sm, borderWidth: 1.5, borderRadius: Radius.lg, height: 40 },
  rateBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  empty:     { paddingTop: Spacing.xl * 2, alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  emptyTitle:{ fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  emptyDesc: { fontSize: FontSize.base, textAlign: 'center', lineHeight: 22 },
  ctaBtn:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: 14, borderRadius: Radius.full, marginTop: Spacing.xs },
  ctaBtnText:{ color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
