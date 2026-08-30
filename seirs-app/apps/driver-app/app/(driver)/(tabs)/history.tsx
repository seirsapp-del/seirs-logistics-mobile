import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { HamburgerButton } from '@/components/HamburgerButton';
import { driversApi, earningsApi } from '@/services/api';
import { naira } from '@/utils/money';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  delivered:  { label: 'Delivered',   color: '#16A34A', icon: 'checkmark-circle' },
  in_transit: { label: 'En Route',    color: '#0F2B4C', icon: 'navigate' },
  picked_up:  { label: 'Picked Up',   color: '#FF6B00', icon: 'cube-outline' },
  assigned:   { label: 'Assigned',    color: '#3A7BD5', icon: 'navigate-outline' },
  cancelled:  { label: 'Cancelled',   color: '#6B7280', icon: 'close-circle-outline' },
};

/**
 * There was a "Cancelled" tab here and it could never hold anything.
 * A cancelled delivery is not returned by /deliveries/driver (active
 * statuses only) and never reaches the earnings ledger, so no
 * driver-facing endpoint lists one. It is replaced by "Active", which
 * both feeds below can actually fill (2026-08-23 sweep, D-10.1).
 */
const TABS = ['All', 'Delivered', 'Active'] as const;
type Tab = typeof TABS[number];

const ACTIVE_STATUSES = ['assigned', 'picked_up', 'in_transit'];

type TripRow = {
  id:             string;
  status:         string;
  date:           string;
  pickupAddress:  string;
  dropoffAddress: string;
  distance:       string;
  driverEarnings: number;
  customer:       { name: string };
};

export default function DriverHistoryScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [tab, setTab]               = useState<Tab>('All');
  const [items, setItems]           = useState<TripRow[]>([]);
  const [lifetime, setLifetime]     = useState<number | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * This screen used to load ONLY driversApi.myDeliveries(), which is
   * GET /deliveries/driver and filters to ASSIGNED | PICKED_UP |
   * IN_TRANSIT. A finished trip therefore fell straight out of the list
   * the moment it was delivered: the Delivered tab was permanently
   * empty and the header badge summed nothing, so a working driver read
   * "N0.00 earned" forever (2026-08-23 sweep, D-10.1).
   *
   * Finished trips now come from the earnings ledger, which is the same
   * table the Earnings tab reads, so the two screens cannot disagree.
   * The ledger row is also the only honest source for what a trip PAID:
   * delivery.driverEarnings is the booked share, driverNet is what was
   * actually released.
   *
   * The badge reads allTime.earned off the dashboard rather than summing
   * the rows, because /earnings/history is capped at 50 and a busy
   * driver would otherwise see an understated lifetime total.
   */
  const load = useCallback(async () => {
    const [active, ledger, dash] = await Promise.all([
      driversApi.myDeliveries().catch(() => [] as any[]),
      earningsApi.history().catch(() => []),
      earningsApi.dashboard().catch(() => null),
    ]);

    // Rides keep a first name only, packages keep the sender's name.
    const partyName = (d: any): string => {
      if (!d?.customer) return 'Customer';
      return String(d.kind) === 'ride'
        ? (String(d.customer.name ?? 'Passenger').trim().split(/\s+/)[0] || 'Passenger')
        : String(d.customer.name ?? 'Customer');
    };
    const km = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? `${Number(v).toFixed(1)} km` : '');

    const activeRows: TripRow[] = (active ?? []).map((d: any) => ({
      id:             String(d.id),
      status:         String(d.status ?? 'assigned'),
      date:           d.assignedAt ?? d.createdAt ?? new Date().toISOString(),
      pickupAddress:  d.pickupAddress  ?? '-',
      dropoffAddress: d.dropoffAddress ?? '-',
      distance:       km(d.distanceKm),
      // An active trip has not paid yet. Showing the booked share as if
      // it were banked is what the Earnings tab already refuses to do.
      driverEarnings: 0,
      customer:       { name: partyName(d) },
    }));

    // The ledger carries no customer relation, and it should not: a
    // finished trip does not need the other party's identity attached to
    // a money row.
    const ledgerRows: TripRow[] = (ledger ?? []).map(e => ({
      id:             String(e.delivery?.id ?? e.deliveryId),
      status:         String(e.delivery?.status ?? 'delivered'),
      date:           e.delivery?.deliveredAt ?? e.createdAt,
      pickupAddress:  e.delivery?.pickupAddress  ?? '-',
      dropoffAddress: e.delivery?.dropoffAddress ?? '-',
      distance:       km(e.delivery?.distanceKm),
      driverEarnings: Number(e.driverNet ?? 0),
      customer:       { name: String(e.delivery?.kind) === 'ride' ? 'Passenger' : 'Customer' },
    }));

    // An active trip can also have a ledger row already (delivered this
    // second, escrow released, still in the active window): keep one.
    const seen = new Set<string>();
    const merged = [...activeRows, ...ledgerRows].filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
    merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setItems(merged);
    setLifetime(dash ? Number(dash.allTime?.earned ?? 0) : null);
  }, []);

  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  }, [load]);

  const filtered = items.filter(d => {
    if (tab === 'Delivered') return d.status === 'delivered';
    if (tab === 'Active')    return ACTIVE_STATUSES.includes(d.status);
    return true;
  });

  // Server-computed over the whole ledger, so it does not go stale past
  // the 50-row history cap. Falls back to the loaded rows only while the
  // dashboard call is in flight or has failed.
  // driverEarnings is a Postgres `decimal`, which crosses the wire as a
  // STRING despite the entity typing it number. Unguarded, 0 + "150.00"
  // concatenates to "0150.00" and the driver's lifetime total renders as
  // nonsense. Same class of bug that killed the tracking page 2026-08-30.
  const totalEarned = lifetime ?? items.reduce((s, d) => s + Number(d.driverEarnings ?? 0), 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <HamburgerButton />
          <Text style={[styles.title, { color: theme.text }]}>My Trips</Text>
        </View>
        <View style={[styles.earnBadge, { backgroundColor: isDark ? '#001020' : '#EFF6FF', borderColor: theme.primary + '40' }]}>
          <Ionicons name="trending-up" size={13} color={theme.primary} />
          <Text style={[styles.earnBadgeText, { color: theme.primary }]}>{naira(totalEarned)} earned</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={[styles.tabRow, { borderBottomColor: theme.border }]}>
        {TABS.map(t => (
          <Pressable
            key={t}
            style={[styles.tabItem, tab === t && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, { color: tab === t ? theme.primary : theme.textSecond }]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}><ActivityIndicator color={theme.primary} /></View>
          ) : (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.surfaceSecond }]}>
                <Ionicons name="car-outline" size={44} color={theme.textThird} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No trips yet</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>Complete deliveries to see them here.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const sc = STATUS_CONFIG[item.status] ?? { label: item.status, color: '#9CA3AF', icon: 'ellipse-outline' };
          return (
            <Pressable
              style={({ pressed }) => [styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm, pressed && { opacity: 0.85 }]}
              onPress={() => router.push({ pathname: '/(driver)/delivery/[id]', params: { id: item.id } })}
            >
              {/* Top row */}
              <View style={styles.cardTop}>
                <View style={[styles.statusBadge, { backgroundColor: sc.color + '18' }]}>
                  <Ionicons name={sc.icon as any} size={12} color={sc.color} />
                  <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
                </View>
                <Text style={[styles.dateText, { color: theme.textThird }]}>
                  {new Date(item.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                </Text>
              </View>

              {/* Route */}
              <View style={styles.routeBlock}>
                <View style={styles.routeRow}>
                  <View style={[styles.routeDot, { backgroundColor: '#22C55E' }]} />
                  <Text style={[styles.routeAddr, { color: theme.text }]} numberOfLines={1}>{item.pickupAddress}</Text>
                </View>
                <View style={[styles.connector, { backgroundColor: theme.border }]} />
                <View style={styles.routeRow}>
                  <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={[styles.routeAddr, { color: theme.text }]} numberOfLines={1}>{item.dropoffAddress}</Text>
                </View>
              </View>

              {/* Footer */}
              <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
                <View style={styles.customerMini}>
                  <Avatar name={item.customer.name} size={22} />
                  <Text style={[styles.customerName, { color: theme.textSecond }]}>{item.customer.name}</Text>
                </View>
                <View style={styles.footerRight}>
                  {!!item.distance && (
                    <Text style={[styles.distText, { color: theme.textThird }]}>{item.distance} · </Text>
                  )}
                  <Text style={[styles.earnText, { color: item.driverEarnings > 0 ? '#22C55E' : theme.textThird }]}>
                    {item.driverEarnings > 0 ? `+${naira(item.driverEarnings)}` : '-'}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.xs },
  title:       { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  earnBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
  earnBadgeText:{ fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  tabRow:   { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: Spacing.sm },
  tabItem:  { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm },
  tabText:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xl },

  card:        { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
  statusText:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  dateText:    { fontSize: FontSize.xs },

  routeBlock: { gap: 3, marginBottom: Spacing.sm },
  routeRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  routeDot:   { width: 9, height: 9, borderRadius: 5 },
  routeAddr:  { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  connector:  { width: 1.5, height: 10, marginLeft: 4 },

  cardFooter:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Spacing.sm, borderTopWidth: 1 },
  customerMini: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  customerName: { fontSize: FontSize.sm },
  footerRight:  { flexDirection: 'row', alignItems: 'center' },
  distText:     { fontSize: FontSize.sm },
  earnText:     { fontSize: FontSize.base, fontWeight: FontWeight.bold },


  empty:     { paddingTop: Spacing.xl * 2, alignItems: 'center', gap: Spacing.md },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  emptyTitle:{ fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  emptyDesc: { fontSize: FontSize.base, textAlign: 'center' },
});
