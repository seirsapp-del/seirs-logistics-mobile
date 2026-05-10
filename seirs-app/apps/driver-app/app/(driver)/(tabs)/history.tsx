import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { HamburgerButton } from '@/components/HamburgerButton';
import { MOCK_DRIVER_DELIVERIES } from '@/constants/driverMockData';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  delivered:  { label: 'Delivered',   color: '#22C55E', icon: 'checkmark-circle' },
  in_transit: { label: 'En Route',    color: '#8B5CF6', icon: 'navigate' },
  picked_up:  { label: 'Picked Up',   color: '#FF6B00', icon: 'cube-outline' },
  assigned:   { label: 'Assigned',    color: '#3A86FF', icon: 'navigate-outline' },
  cancelled:  { label: 'Cancelled',   color: '#6B7280', icon: 'close-circle-outline' },
};

const TABS = ['All', 'Delivered', 'Cancelled'] as const;
type Tab = typeof TABS[number];

export default function DriverHistoryScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [tab, setTab] = useState<Tab>('All');

  const filtered = MOCK_DRIVER_DELIVERIES.filter(d => {
    if (tab === 'All')       return true;
    if (tab === 'Delivered') return d.status === 'delivered';
    if (tab === 'Cancelled') return d.status === 'cancelled';
    return true;
  });

  const totalEarned = MOCK_DRIVER_DELIVERIES
    .filter(d => d.status === 'delivered')
    .reduce((s, d) => s + d.driverEarnings, 0);

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
          <Text style={[styles.earnBadgeText, { color: theme.primary }]}>₦{totalEarned.toLocaleString()} earned</Text>
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
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.surfaceSecond }]}>
              <Ionicons name="car-outline" size={44} color={theme.textThird} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No trips yet</Text>
            <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>Complete deliveries to see them here.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const sc = STATUS_CONFIG[item.status] ?? { label: item.status, color: '#A1A1AA', icon: 'ellipse-outline' };
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
                  {item.distanceKm > 0 && (
                    <Text style={[styles.distText, { color: theme.textThird }]}>{item.distanceKm} km · </Text>
                  )}
                  <Text style={[styles.earnText, { color: item.driverEarnings > 0 ? '#22C55E' : theme.textThird }]}>
                    {item.driverEarnings > 0 ? `+₦${item.driverEarnings.toLocaleString()}` : '—'}
                  </Text>
                </View>
              </View>

              {/* Rating received */}
              {item.rating && (
                <View style={[styles.ratingRow, { backgroundColor: isDark ? '#1A1400' : '#FFFBEB' }]}>
                  {[1, 2, 3, 4, 5].map(s => (
                    <Ionicons key={s} name={s <= item.rating! ? 'star' : 'star-outline'} size={13} color="#FFBE0B" />
                  ))}
                  {item.ratingComment && (
                    <Text style={[styles.ratingComment, { color: theme.textSecond }]} numberOfLines={1}>
                      "{item.ratingComment}"
                    </Text>
                  )}
                </View>
              )}
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

  ratingRow:    { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: Spacing.sm, padding: 6, borderRadius: Radius.md },
  ratingComment:{ flex: 1, fontSize: FontSize.xs, marginLeft: 4 },

  empty:     { paddingTop: Spacing.xl * 2, alignItems: 'center', gap: Spacing.md },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  emptyTitle:{ fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  emptyDesc: { fontSize: FontSize.base, textAlign: 'center' },
});
