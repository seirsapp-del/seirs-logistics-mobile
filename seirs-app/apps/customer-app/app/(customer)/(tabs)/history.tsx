import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { HamburgerButton } from '@/components/HamburgerButton';
import { MOCK_TRIPS } from '@/constants/mockData';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending:     { label: 'Pending',     color: '#3A86FF', icon: 'time-outline' },
  assigned:    { label: 'Assigned',    color: '#3A86FF', icon: 'navigate-outline' },
  picked_up:   { label: 'Picked Up',   color: '#FF6B00', icon: 'cube-outline' },
  in_transit:  { label: 'In Transit',  color: '#8B5CF6', icon: 'navigate' },
  in_progress: { label: 'In Progress', color: '#FF6B00', icon: 'car-outline' },
  completed:   { label: 'Completed',   color: '#22C55E', icon: 'checkmark-circle' },
  cancelled:   { label: 'Cancelled',   color: '#6B7280', icon: 'close-circle-outline' },
  failed:      { label: 'Failed',      color: '#EF4444', icon: 'alert-circle-outline' },
};

const FILTER_TABS = ['All', 'Active', 'Completed', 'Cancelled'] as const;
type FilterTab = typeof FILTER_TABS[number];

const ACTIVE_STATUSES   = new Set(['pending', 'assigned', 'picked_up', 'in_transit', 'in_progress']);
const COMPLETED_STATUSES = new Set(['completed', 'delivered']);
const CANCELLED_STATUSES = new Set(['cancelled', 'failed']);

export default function HistoryScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [activeTab, setActiveTab] = useState<FilterTab>('All');

  const filtered = MOCK_TRIPS.filter(t => {
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
          <Text style={[styles.title, { color: theme.text }]}>My Trips</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            {filtered.length} trip{filtered.length !== 1 ? 's' : ''}
          </Text>
        </View>
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
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.surfaceSecond }]}>
              <Ionicons name="car-outline" size={48} color={theme.textThird} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No trips here</Text>
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
        }
        renderItem={({ item: trip }) => {
          const status = STATUS_CONFIG[trip.status] ?? { label: trip.status, color: '#A1A1AA', icon: 'ellipse-outline' };
          const isActive = ACTIVE_STATUSES.has(trip.status);
          return (
            <Pressable
              style={({ pressed }) => [styles.card, { backgroundColor: theme.surface }, Shadows.sm, pressed && { opacity: 0.85 }]}
              onPress={() => router.push({ pathname: '/(customer)/trip/[id]', params: { id: trip.id } })}
            >
              {/* Top row */}
              <View style={styles.cardTop}>
                <View style={[styles.statusBadge, { backgroundColor: status.color + '18' }]}>
                  <Ionicons name={status.icon as any} size={12} color={status.color} />
                  <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
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
                    <Avatar name={trip.driver.name} size={24} />
                    <Text style={[styles.driverName, { color: theme.textSecond }]}>{trip.driver.name}</Text>
                  </View>
                ) : (
                  <Text style={[styles.driverName, { color: theme.textThird }]}>No driver</Text>
                )}
                <View style={styles.footerRight}>
                  {trip.distance !== '—' && (
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
