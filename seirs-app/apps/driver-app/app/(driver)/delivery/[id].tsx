import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { MOCK_DRIVER_DELIVERIES } from '@/constants/driverMockData';
import { Avatar } from '@/components/ui/Avatar';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  delivered:  { label: 'Delivered',  color: '#22C55E', icon: 'checkmark-circle' },
  in_transit: { label: 'En Route',   color: '#8B5CF6', icon: 'navigate' },
  picked_up:  { label: 'Picked Up',  color: '#FF6B00', icon: 'cube-outline' },
  assigned:   { label: 'Assigned',   color: '#3A86FF', icon: 'navigate-outline' },
  cancelled:  { label: 'Cancelled',  color: '#6B7280', icon: 'close-circle-outline' },
};

const PAYMENT_LABELS: Record<string, string> = {
  wallet: 'Wallet',
  card:   'Card',
  cash:   'Cash on Delivery',
};

export default function DeliveryDetailScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const delivery = MOCK_DRIVER_DELIVERIES.find(d => d.id === id);

  if (!delivery) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.textThird} />
        <Text style={[{ fontSize: FontSize.base, color: theme.textSecond, marginTop: Spacing.md }]}>Trip not found</Text>
      </SafeAreaView>
    );
  }

  const sc = STATUS_CONFIG[delivery.status] ?? { label: delivery.status, color: '#A1A1AA', icon: 'ellipse-outline' };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Trip Details</Text>
        <View style={[styles.statusBadge, { backgroundColor: sc.color + '18' }]}>
          <Ionicons name={sc.icon as any} size={12} color={sc.color} />
          <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Tracking code */}
        <View style={[styles.trackingRow, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
          <Ionicons name="qr-code-outline" size={16} color={theme.textThird} />
          <Text style={[styles.trackingCode, { color: theme.textSecond }]}>{delivery.trackingCode}</Text>
          <Text style={[styles.trackingDate, { color: theme.textThird }]}>{fmtDate(delivery.date)}</Text>
        </View>

        {/* Earnings card */}
        <View style={[styles.earningsCard, {
          backgroundColor: delivery.driverEarnings > 0 ? (isDark ? '#001800' : '#F0FDF4') : theme.surfaceSecond,
          borderColor: delivery.driverEarnings > 0 ? '#22C55E30' : theme.border,
        }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.earningsLabel, { color: theme.textSecond }]}>Your Earnings</Text>
            <Text style={[styles.earningsAmount, { color: delivery.driverEarnings > 0 ? '#22C55E' : theme.textThird }]}>
              {delivery.driverEarnings > 0 ? `+₦${delivery.driverEarnings.toLocaleString()}` : '—'}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.fareLabel, { color: theme.textThird }]}>Total fare</Text>
            <Text style={[styles.fareAmount, { color: theme.textSecond }]}>₦{delivery.price.toLocaleString()}</Text>
          </View>
        </View>

        {/* Route card */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Route</Text>
          <View style={styles.routeBlock}>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#22C55E' }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.routeLabel, { color: theme.textThird }]}>Pickup</Text>
                <Text style={[styles.routeAddr, { color: theme.text }]}>{delivery.pickupAddress}</Text>
              </View>
            </View>
            <View style={[styles.connector, { backgroundColor: theme.border }]} />
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.routeLabel, { color: theme.textThird }]}>Drop-off</Text>
                <Text style={[styles.routeAddr, { color: theme.text }]}>{delivery.dropoffAddress}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.metaRow, { borderTopColor: theme.border }]}>
            <View style={styles.metaPill}>
              <Ionicons name="navigate-outline" size={14} color={theme.textThird} />
              <Text style={[styles.metaText, { color: theme.textSecond }]}>{delivery.distanceKm} km</Text>
            </View>
            <View style={styles.metaPill}>
              <Ionicons name="time-outline" size={14} color={theme.textThird} />
              <Text style={[styles.metaText, { color: theme.textSecond }]}>{delivery.duration}</Text>
            </View>
            <View style={styles.metaPill}>
              <Ionicons name="card-outline" size={14} color={theme.textThird} />
              <Text style={[styles.metaText, { color: theme.textSecond }]}>{PAYMENT_LABELS[delivery.paymentMethod] ?? delivery.paymentMethod}</Text>
            </View>
          </View>
        </View>

        {/* Customer card */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Customer</Text>
          <View style={styles.customerRow}>
            <Avatar name={delivery.customer.name} size={46} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.customerName, { color: theme.text }]}>{delivery.customer.name}</Text>
              <Text style={[styles.customerPhone, { color: theme.textSecond }]}>{delivery.customer.phone}</Text>
            </View>
          </View>
        </View>

        {/* Rating received */}
        {delivery.rating && (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Rating Received</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(s => (
                <Ionicons
                  key={s}
                  name={s <= delivery.rating! ? 'star' : 'star-outline'}
                  size={24}
                  color="#FFBE0B"
                />
              ))}
              <Text style={[styles.ratingNum, { color: theme.text }]}>{delivery.rating}.0</Text>
            </View>
            {delivery.ratingComment && (
              <View style={[styles.commentBubble, { backgroundColor: theme.surfaceSecond }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={14} color={theme.textThird} />
                <Text style={[styles.commentText, { color: theme.textSecond }]}>"{delivery.ratingComment}"</Text>
              </View>
            )}
          </View>
        )}

        {/* No rating for cancelled */}
        {delivery.status === 'cancelled' && (
          <View style={[styles.cancelledNote, { backgroundColor: isDark ? '#1A0000' : '#FEF2F2', borderColor: '#FECACA' }]}>
            <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
            <Text style={[styles.cancelledText, { color: '#EF4444' }]}>This trip was cancelled. No earnings were credited.</Text>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:       { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: Radius.full },
  statusText:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  content: { padding: Spacing.md, gap: Spacing.md },

  trackingRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm + 2, paddingHorizontal: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  trackingCode: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  trackingDate: { fontSize: FontSize.xs },

  earningsCard:  { flexDirection: 'row', alignItems: 'center', padding: Spacing.md + 4, borderRadius: Radius.xl, borderWidth: 1 },
  earningsLabel: { fontSize: FontSize.sm, marginBottom: 4 },
  earningsAmount:{ fontSize: FontSize['2xl'], fontWeight: FontWeight.bold },
  fareLabel:     { fontSize: FontSize.xs, marginBottom: 4 },
  fareAmount:    { fontSize: FontSize.md, fontWeight: FontWeight.semibold },

  card:      { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  cardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  routeBlock: { gap: 4 },
  routeRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  routeDot:   { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
  routeLabel: { fontSize: FontSize.xs, marginBottom: 2 },
  routeAddr:  { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  connector:  { width: 1.5, height: 16, marginLeft: 4 },

  metaRow:  { flexDirection: 'row', gap: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 1, flexWrap: 'wrap' },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: FontSize.sm },

  customerRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  customerName:  { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  customerPhone: { fontSize: FontSize.sm, marginTop: 2 },

  starsRow:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingNum:    { fontSize: FontSize.lg, fontWeight: FontWeight.bold, marginLeft: 4 },
  commentBubble:{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md },
  commentText:  { flex: 1, fontSize: FontSize.sm, lineHeight: 20, fontStyle: 'italic' },

  cancelledNote: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  cancelledText: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
