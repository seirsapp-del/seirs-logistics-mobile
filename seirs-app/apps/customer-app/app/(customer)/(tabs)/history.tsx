import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar, RefreshControl, ActivityIndicator, TextInput, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/Icon';
import { HamburgerButton } from '@/components/HamburgerButton';
import { deliveriesApi } from '@/services/api';
import { naira, nairaAmount } from '@/utils/money';

import { alertDialog } from '@/components/SeirsDialog';
import { vehicleLabel } from '@seirs/shared/models/vehicles';
// My Trips rebuilt as the business Deliveries screen, exactly (founder
// 2026-08-22: "the exact same as deliveries on the business app, that's
// what I wanted"). Layout, rail, card and style values are copied from
// business deliveries.tsx verbatim; only the data plumbing, the theme
// tokens and the customer-only actions (Track live, Rate) are local.

const STATUSES = ['all', 'pending', 'assigned', 'in_transit', 'delivered', 'cancelled'];

const STATUS_LABEL: Record<string, string> = {
  all:        'All',
  pending:    'Pending',
  assigned:   'Assigned',
  in_transit: 'In Transit',
  delivered:  'Delivered',
  cancelled:  'Cancelled',
};

const STATUS_COLOR: Record<string, string> = {
  pending:    '#D97706',
  assigned:   '#3A7BD5',
  in_transit: '#0F2B4C',
  delivered:  '#16A34A',
  cancelled:  '#DC2626',
};

// Customer statuses fold into the six business buckets so the rail and
// the badges read identically across the two apps.
const BUCKET: Record<string, string> = {
  pending:     'pending',
  assigned:    'assigned',
  picked_up:   'in_transit',
  in_transit:  'in_transit',
  in_progress: 'in_transit',
  completed:   'delivered',
  delivered:   'delivered',
  cancelled:   'cancelled',
  failed:      'cancelled',
};

const ACTIVE_STATUSES = new Set(['pending', 'assigned', 'picked_up', 'in_transit', 'in_progress']);



type Trip = {
  id: string;
  status: string;
  date: string;
  pickupAddress: string;
  dropoffAddress: string;
  distance: string;
  price: number;
  vehicleType: string;
  driver: { id: string; name: string; profilePhoto?: string } | null;
  rating: number | null;
  trackingCode: string;
  /** 'ride' when a passenger trip, 'package' otherwise. */
  kind: string;
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
    // Kobo on the card, same as the receipt (founder reversal
    // 2026-08-24). This used to round to whole naira because
    // "N1,473.15" was thought to read like an error; the founder's call
    // is that it reads like arithmetic, and rounding is what actually
    // breaks: the card and the receipt stopped agreeing.
    price:          Number(d.price ?? 0),
    vehicleType:    d.vehicleType ?? '',
    driver:         drv,
    rating:         d.customerRating ?? null,
    trackingCode:   d.trackingCode ?? d.id,
    paymentHeldAt:  d.paymentHeldAt ?? null,
    kind:           String(d.kind ?? 'package'),
  };
}

const PAGE_SIZE = 20;

export default function HistoryScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { t }   = useTranslation();

  const [status, setStatus]       = useState<string>('all');
  const [trips, setTrips]         = useState<Trip[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page,        setPage]        = useState(1);
  const [hasMore,     setHasMore]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search,      setSearch]      = useState('');

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
    const timer = setTimeout(() => { load(1, false); }, 350);
    return () => clearTimeout(timer);
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
    // server what it costs right now.
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
      alertDialog('Too late to cancel', 'This delivery is already under way. Message your driver from the trip screen.');
      return;
    }
    alertDialog(
      'Cancel this booking?',
      feeNgn > 0
        ? `Tracking ${trip.trackingCode}. A cancellation fee of NGN ${nairaAmount(feeNgn)} applies and the rest is refunded.`
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
              alertDialog('Could not cancel', e?.message ?? 'Please try again in a moment.');
            }
          },
        },
      ],
    );
  };

  const filtered = trips.filter(trip =>
    status === 'all' ? true : (BUCKET[trip.status] ?? trip.status) === status,
  );

  const renderItem = ({ item }: { item: Trip }) => {
    const bucket = BUCKET[item.status] ?? item.status;
    const c = STATUS_COLOR[bucket] ?? theme.textThird;
    const isCancellable = item.status === 'pending' || item.status === 'assigned';
    // Pending AND never collected: the sender still owes for this one.
    const isUnpaid  = item.status === 'pending' && !item.paymentHeldAt;
    const isActive  = ACTIVE_STATUSES.has(item.status);
    const canRate   = bucket === 'delivered' && !item.rating && !!item.driver?.id;
    return (
      <Pressable
        onPress={() => router.push({ pathname: '/(customer)/trip/[id]', params: { id: item.id } } as any)}
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            {item.kind === 'ride' && (
              <View style={{ alignSelf: 'flex-start', backgroundColor: '#6366F120', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginBottom: 3 }}>
                <Text style={{ color: '#6366F1', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>RIDE</Text>
              </View>
            )}
            <Text style={[styles.trackNum, { color: theme.text }]}>
              {item.trackingCode}
            </Text>
            <Text style={[styles.address, { color: theme.textSecond }]} numberOfLines={1}>
              {item.dropoffAddress}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: c + '20' }]}>
            <Text style={[styles.badgeText, { color: c }]}>{bucket.replace('_', ' ')}</Text>
          </View>
        </View>
        <View style={styles.cardBottom}>
          {!!item.vehicleType && (
            <View style={styles.meta}>
              <Icon name="Truck" size={12} color={theme.textThird} />
              <Text style={[styles.metaText, { color: theme.textThird }]}>{vehicleLabel(item.vehicleType)}</Text>
            </View>
          )}
          <View style={styles.meta}>
            <Icon name="Calendar" size={12} color={theme.textThird} />
            <Text style={[styles.metaText, { color: theme.textThird }]}>
              {new Date(item.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
            </Text>
          </View>
          <Text style={[styles.price, { color: theme.text }]}>{naira(item.price)}</Text>
        </View>

        {/* Actions get their own row, same as business: everything on one
            line ran the buttons into the screen edge. */}
        {(isUnpaid || isCancellable || isActive || canRate) && (
          <View style={styles.cardActions}>
            {isUnpaid && (
              <Pressable
                onPress={() => handlePay(item)}
                disabled={paying === item.id}
                hitSlop={8}
                style={[styles.payLink, { borderColor: theme.primary }]}
              >
                <Text style={[styles.payLinkText, { color: theme.primary }]}>
                  {paying === item.id ? 'Opening…' : 'Pay now'}
                </Text>
              </Pressable>
            )}
            {/*
              Edit sits between Pay and Cancel on purpose: it is the
              middle answer to "this is wrong". Before it existed the
              only way to fix a mistyped weight or a wrong flat number
              was to cancel and rebuild the whole booking, losing the
              tracking code the sender may already have passed on
              (founder 2026-08-29).
            */}
            {isUnpaid && (
              <Pressable
                onPress={() => router.push({ pathname: '/(customer)/edit-booking/[id]', params: { id: item.id } } as any)}
                hitSlop={8}
                style={[styles.payLink, { borderColor: theme.border }]}
              >
                <Text style={[styles.payLinkText, { color: theme.text }]}>Edit</Text>
              </Pressable>
            )}
            {isActive && (
              <Pressable
                onPress={() => router.push({ pathname: '/(customer)/track', params: { code: item.trackingCode } } as any)}
                hitSlop={8}
                style={[styles.payLink, { borderColor: theme.primary }]}
              >
                <Text style={[styles.payLinkText, { color: theme.primary }]}>Track live</Text>
              </Pressable>
            )}
            {canRate && (
              <Pressable
                onPress={() => router.push({ pathname: '/(customer)/rate/[driverId]', params: { driverId: item.driver!.id, tripId: item.id } } as any)}
                hitSlop={8}
                style={[styles.payLink, { borderColor: '#FFBE0B' }]}
              >
                <Text style={[styles.payLinkText, { color: '#FFBE0B' }]}>Rate this trip</Text>
              </Pressable>
            )}
            {isCancellable && (
              <Pressable
                onPress={() => handleCancel(item)}
                disabled={cancelling === item.id}
                style={styles.cancelBtn}
                hitSlop={8}
              >
                <Text style={styles.cancelBtnText}>
                  {cancelling === item.id ? 'Checking…' : 'Cancel'}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header: business Deliveries header, customer title. */}
      <View style={[styles.header, {
        backgroundColor: theme.surface,
        borderBottomColor: theme.border,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }]}>
        <HamburgerButton />
        <Text style={[styles.heading, { color: theme.text }]}>
          {t('history.title', { defaultValue: 'My Trips' })}
        </Text>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Icon name="Search" size={16} color={theme.textThird} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by tracking number…"
          placeholderTextColor={theme.textThird}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <Icon name="X" size={16} color={theme.textThird} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        style={{ flexGrow: 0 }}
      >
        {STATUSES.map((s) => {
          const active = status === s;
          const accent = s === 'all' ? theme.primary : STATUS_COLOR[s];
          return (
            <Pressable
              key={s}
              style={[
                styles.tab,
                { backgroundColor: theme.surface, borderColor: theme.border },
                active && { backgroundColor: accent, borderColor: accent },
              ]}
              onPress={() => setStatus(s)}
            >
              <View style={[
                styles.tabDot,
                { backgroundColor: active ? '#fff' : accent },
              ]} />
              <Text style={[
                styles.tabText,
                { color: theme.text },
                active && { color: '#fff' },
              ]}>
                {STATUS_LABEL[s]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(d) => d.id}
          renderItem={renderItem}
          contentContainerStyle={
            filtered.length === 0
              ? { flexGrow: 1, padding: 16 }
              : { padding: 16, paddingBottom: 24 }
          }
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} /> : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="Package" size={40} color={theme.textThird} />
              <Text style={[styles.emptyText, { color: theme.textThird }]}>
                {t('history.emptyTitle', { defaultValue: 'No trips found' })}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// Style values copied verbatim from business deliveries.tsx (founder:
// exact). The chip rail keeps the explicit pill height + lineHeight that
// fixed the Yoga 1px-label clip there.
const styles = StyleSheet.create({
  header:       { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1 },
  heading:      { fontSize: 20, fontWeight: '800' },
  searchWrap:   {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 16, marginBottom: 0,
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1,
  },
  searchInput:  { flex: 1, fontSize: 15 },
  tabs:         { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10, gap: 10, alignItems: 'center' },
  tab:          {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, height: 44, borderRadius: 22,
    borderWidth: 1,
  },
  tabDot:       { width: 8, height: 8, borderRadius: 4 },
  tabText:      { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  card:         { borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1 },
  cardTop:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  trackNum:     { fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },
  address:      { fontSize: 13, marginTop: 3 },
  badge:        { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText:    { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  cardBottom:   { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardActions:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
                  gap: 10, marginTop: 12, flexWrap: 'wrap' },
  cancelBtn:     { borderWidth: 1, borderColor: '#DC2626', borderRadius: 999,
                   paddingHorizontal: 14, paddingVertical: 6 },
  cancelBtnText: { fontSize: 13.5, fontWeight: '700', color: '#DC2626' },
  meta:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:     { fontSize: 12, textTransform: 'capitalize' },
  price:        { marginLeft: 'auto', fontSize: 14, fontWeight: '700' },
  payLink:      { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  payLinkText:  { fontSize: 13.5, fontWeight: '700' },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText:    { fontSize: 15 },
});
