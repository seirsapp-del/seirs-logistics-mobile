import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
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

const PAYMENT_ICONS: Record<string, string> = {
  wallet: 'wallet-outline',
  card:   'card-outline',
  cash:   'cash-outline',
};

export default function TripDetailsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { id } = useLocalSearchParams<{ id: string }>();

  const trip = MOCK_TRIPS.find(t => t.id === id) ?? MOCK_TRIPS[0];
  const status = STATUS_CONFIG[trip.status] ?? { label: trip.status, color: '#A1A1AA', icon: 'ellipse-outline' };
  const isActive    = ['pending', 'assigned', 'picked_up', 'in_transit', 'in_progress'].includes(trip.status);
  const isCompleted = trip.status === 'completed';
  const isCancelled = trip.status === 'cancelled';

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-NG', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Trip Details</Text>
          <Pressable
            style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]}
            onPress={() => router.push({ pathname: '/(customer)/report', params: { tripId: trip.id } })}
          >
            <Ionicons name="flag-outline" size={20} color={theme.text} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

          {/* Status banner */}
          <View style={[styles.statusBanner, { backgroundColor: status.color + '15', borderColor: status.color + '30' }]}>
            <View style={[styles.statusIconWrap, { backgroundColor: status.color + '25' }]}>
              <Ionicons name={status.icon as any} size={22} color={status.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
              <Text style={[styles.statusDate, { color: theme.textSecond }]}>{formatDate(trip.date)}</Text>
            </View>
            <Text style={[styles.trackCode, { color: theme.textThird }]}>{trip.trackingCode}</Text>
          </View>

          {/* Route card */}
          <Card>
            <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>Route</Text>
            <View style={styles.routeRow}>
              <View style={styles.routeIcons}>
                <View style={[styles.routeDot, { backgroundColor: '#22C55E' }]} />
                <View style={[styles.routeLine, { backgroundColor: theme.border }]} />
                <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
              </View>
              <View style={styles.routeAddresses}>
                <View style={styles.addrBlock}>
                  <Text style={[styles.addrLabel, { color: theme.textThird }]}>Pickup</Text>
                  <Text style={[styles.addrText, { color: theme.text }]}>{trip.pickupAddress}</Text>
                </View>
                <View style={styles.addrBlock}>
                  <Text style={[styles.addrLabel, { color: theme.textThird }]}>Drop-off</Text>
                  <Text style={[styles.addrText, { color: theme.text }]}>{trip.dropoffAddress}</Text>
                </View>
              </View>
            </View>

            {/* Trip meta pills */}
            <View style={[styles.metaRow, { borderTopColor: theme.border }]}>
              <View style={styles.metaItem}>
                <Ionicons name="navigate-outline" size={14} color={theme.textSecond} />
                <Text style={[styles.metaText, { color: theme.textSecond }]}>{trip.distance}</Text>
              </View>
              <View style={[styles.metaDivider, { backgroundColor: theme.border }]} />
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={14} color={theme.textSecond} />
                <Text style={[styles.metaText, { color: theme.textSecond }]}>{trip.duration}</Text>
              </View>
              <View style={[styles.metaDivider, { backgroundColor: theme.border }]} />
              <View style={styles.metaItem}>
                <Ionicons name="car-outline" size={14} color={theme.textSecond} />
                <Text style={[styles.metaText, { color: theme.textSecond, textTransform: 'capitalize' }]}>{trip.vehicleType}</Text>
              </View>
            </View>
          </Card>

          {/* Driver card */}
          {trip.driver ? (
            <Card>
              <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>Driver</Text>
              <View style={styles.driverRow}>
                <Avatar name={trip.driver.name} size={52} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.driverName, { color: theme.text }]}>{trip.driver.name}</Text>
                  <View style={styles.driverMeta}>
                    <Ionicons name="star" size={12} color="#FFBE0B" />
                    <Text style={[styles.driverSub, { color: theme.textSecond }]}>{trip.driver.rating}</Text>
                    <Text style={[styles.driverSub, { color: theme.textThird }]}> · {trip.driver.trips} trips</Text>
                  </View>
                  <Text style={[styles.driverSub, { color: theme.textSecond, marginTop: 2 }]}>
                    {trip.driver.color} {trip.driver.vehicle} · {trip.driver.plate}
                  </Text>
                </View>
                {isActive && (
                  <View style={styles.driverActions}>
                    <Pressable
                      style={[styles.driverActionBtn, { backgroundColor: isDark ? '#001820' : '#F0FDFA', borderColor: '#2EC4B6' }]}
                      onPress={() => router.push({ pathname: '/(customer)/messages/[chatId]', params: { chatId: 'chat1' } })}
                    >
                      <Ionicons name="chatbubble-outline" size={18} color="#2EC4B6" />
                    </Pressable>
                    {/* Phone calls disabled per spec §1.12 — chat only */}
                  </View>
                )}
                {isCompleted && trip.rating && (
                  <View style={styles.ratingWrap}>
                    {[1, 2, 3, 4, 5].map(s => (
                      <Ionicons key={s} name={s <= trip.rating! ? 'star' : 'star-outline'} size={14} color="#FFBE0B" />
                    ))}
                  </View>
                )}
              </View>
            </Card>
          ) : null}

          {/* Fare breakdown */}
          <Card>
            <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>Fare Breakdown</Text>
            {[
              { label: 'Base fare',    amount: 500 },
              { label: 'Distance fee', amount: Math.round(trip.price * 0.45) },
              { label: 'Time fee',     amount: Math.round(trip.price * 0.12) },
              { label: 'Service fee',  amount: Math.round(trip.price * 0.09) },
            ].map(row => (
              <View key={row.label} style={styles.fareRow}>
                <Text style={[styles.fareLabel, { color: theme.textSecond }]}>{row.label}</Text>
                <Text style={[styles.fareAmt, { color: theme.text }]}>₦{row.amount.toLocaleString()}</Text>
              </View>
            ))}
            <View style={[styles.fareDivider, { backgroundColor: theme.border }]} />
            <View style={styles.fareRow}>
              <Text style={[styles.fareTotal, { color: theme.text }]}>Total</Text>
              <Text style={[styles.fareTotalAmt, { color: theme.primary }]}>₦{trip.price.toLocaleString()}</Text>
            </View>
            <View style={[styles.payMethod, { backgroundColor: theme.surfaceSecond }]}>
              <Ionicons name={PAYMENT_ICONS[trip.paymentMethod] as any ?? 'card-outline'} size={16} color={theme.textSecond} />
              <Text style={[styles.payMethodText, { color: theme.textSecond }]}>
                Paid via {trip.paymentMethod.charAt(0).toUpperCase() + trip.paymentMethod.slice(1)}
              </Text>
            </View>
          </Card>

          {/* Actions */}
          <View style={styles.actions}>
            {isActive && (
              <Button
                label="Track Live"
                onPress={() => router.push({ pathname: '/(customer)/trip-progress', params: { id: trip.id, driverId: trip.driver?.id ?? 'd1' } })}
                leftIcon={<Ionicons name="navigate" size={16} color="#fff" />}
                fullWidth
              />
            )}
            {isCompleted && !trip.rating && (
              <Button
                label="Rate Trip"
                onPress={() => router.push({ pathname: '/(customer)/rate/[driverId]', params: { driverId: trip.driver?.id ?? 'd1', tripId: trip.id } })}
                leftIcon={<Ionicons name="star-outline" size={16} color="#fff" />}
                fullWidth
              />
            )}
            {isCompleted && (
              <Button
                label="View Receipt"
                variant="outline"
                onPress={() => router.push({ pathname: '/(customer)/receipt/[id]', params: { id: trip.id } })}
                leftIcon={<Ionicons name="receipt-outline" size={16} color={theme.primary} />}
                fullWidth
              />
            )}
            <Button
              label="Report Issue"
              variant="ghost"
              onPress={() => router.push({ pathname: '/(customer)/report', params: { tripId: trip.id } })}
              leftIcon={<Ionicons name="flag-outline" size={16} color={theme.text} />}
              fullWidth
            />
          </View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1,
  },
  backBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  statusBanner:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  statusIconWrap:{ width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  statusLabel:   { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  statusDate:    { fontSize: FontSize.xs, marginTop: 2 },
  trackCode:     { fontSize: 10, letterSpacing: 0.5 },

  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.md },

  routeRow:       { flexDirection: 'row', gap: Spacing.md },
  routeIcons:     { alignItems: 'center', paddingTop: 18 },
  routeDot:       { width: 10, height: 10, borderRadius: 5 },
  routeLine:      { width: 2, flex: 1, marginVertical: 4 },
  routeAddresses: { flex: 1, gap: Spacing.md },
  addrBlock:      { gap: 2 },
  addrLabel:      { fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.4 },
  addrText:       { fontSize: FontSize.base, fontWeight: FontWeight.medium },

  metaRow:     { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing.md, marginTop: Spacing.md, borderTopWidth: 1 },
  metaItem:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  metaDivider: { width: 1, height: 18 },
  metaText:    { fontSize: FontSize.sm },

  driverRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  driverName:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  driverMeta:   { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  driverSub:    { fontSize: FontSize.sm },
  driverActions:{ flexDirection: 'row', gap: Spacing.sm },
  driverActionBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  ratingWrap:   { flexDirection: 'row', gap: 2 },

  fareRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs },
  fareLabel:    { fontSize: FontSize.sm },
  fareAmt:      { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  fareDivider:  { height: 1, marginVertical: Spacing.sm },
  fareTotal:    { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  fareTotalAmt: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  payMethod:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md, marginTop: Spacing.sm },
  payMethodText:{ fontSize: FontSize.sm },

  actions: { gap: Spacing.sm },
});
