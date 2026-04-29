import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { MOCK_TRIPS } from '@/constants/mockData';

export default function ReceiptScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { id } = useLocalSearchParams<{ id: string }>();

  const trip = MOCK_TRIPS.find(t => t.id === id) ?? MOCK_TRIPS[0];

  const fareRows = [
    { label: 'Base fare',    amount: 500 },
    { label: 'Distance fee', amount: Math.round(trip.price * 0.45) },
    { label: 'Time fee',     amount: Math.round(trip.price * 0.12) },
    { label: 'Service fee',  amount: Math.round(trip.price * 0.09) },
  ];

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-NG', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
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
          <Text style={[styles.title, { color: theme.text }]}>Receipt</Text>
          <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]}>
            <Ionicons name="share-outline" size={20} color={theme.text} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

          {/* Success badge */}
          <View style={[styles.successBanner, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
            <View style={[styles.successIcon, { backgroundColor: '#22C55E20' }]}>
              <Ionicons name="checkmark-circle" size={36} color="#22C55E" />
            </View>
            <Text style={[styles.successTitle, { color: '#16A34A' }]}>Trip Completed</Text>
            <Text style={[styles.successDate,  { color: '#4ADE80' }]}>{formatDate(trip.date)}</Text>
          </View>

          {/* Receipt card */}
          <View style={[styles.receiptCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>

            {/* Tracking code */}
            <View style={[styles.trackRow, { backgroundColor: theme.surfaceSecond }]}>
              <Text style={[styles.trackLabel, { color: theme.textSecond }]}>Tracking Code</Text>
              <Text style={[styles.trackCode,  { color: theme.primary }]}>{trip.trackingCode}</Text>
            </View>

            {/* Driver */}
            {trip.driver && (
              <View style={[styles.driverRow, { borderTopColor: theme.border }]}>
                <Avatar name={trip.driver.name} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.driverName, { color: theme.text }]}>{trip.driver.name}</Text>
                  <Text style={[styles.driverSub,  { color: theme.textSecond }]}>{trip.driver.plate}</Text>
                </View>
                {trip.rating && (
                  <View style={styles.rating}>
                    {[1, 2, 3, 4, 5].map(s => (
                      <Ionicons key={s} name={s <= trip.rating! ? 'star' : 'star-outline'} size={13} color="#FFBE0B" />
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Route */}
            <View style={[styles.routeSection, { borderTopColor: theme.border }]}>
              <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>Route</Text>
              <View style={styles.routeRow}>
                <View style={styles.routeIcons}>
                  <View style={[styles.routeDot, { backgroundColor: '#22C55E' }]} />
                  <View style={[styles.routeLine, { backgroundColor: theme.border }]} />
                  <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                </View>
                <View style={styles.routeAddrs}>
                  <Text style={[styles.routeAddr, { color: theme.text }]}>{trip.pickupAddress}</Text>
                  <Text style={[styles.routeAddr, { color: theme.text, marginTop: Spacing.md }]}>{trip.dropoffAddress}</Text>
                </View>
              </View>
              <View style={styles.routeMeta}>
                <View style={styles.routeMetaItem}>
                  <Ionicons name="navigate-outline" size={13} color={theme.textSecond} />
                  <Text style={[styles.routeMetaText, { color: theme.textSecond }]}>{trip.distance}</Text>
                </View>
                <View style={styles.routeMetaItem}>
                  <Ionicons name="time-outline" size={13} color={theme.textSecond} />
                  <Text style={[styles.routeMetaText, { color: theme.textSecond }]}>{trip.duration}</Text>
                </View>
              </View>
            </View>

            {/* Dashed divider */}
            <View style={[styles.dashedDivider, { borderColor: theme.border }]} />

            {/* Fare */}
            <View style={styles.fareSection}>
              <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>Fare Breakdown</Text>
              {fareRows.map(row => (
                <View key={row.label} style={styles.fareRow}>
                  <Text style={[styles.fareLabel, { color: theme.textSecond }]}>{row.label}</Text>
                  <Text style={[styles.fareAmt,   { color: theme.text }]}>₦{row.amount.toLocaleString()}</Text>
                </View>
              ))}
              <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
                <Text style={[styles.totalLabel, { color: theme.text }]}>Total Paid</Text>
                <Text style={[styles.totalAmt,   { color: theme.primary }]}>₦{trip.price.toLocaleString()}</Text>
              </View>
              <View style={[styles.payBadge, { backgroundColor: theme.surfaceSecond }]}>
                <Ionicons name="wallet-outline" size={14} color={theme.textSecond} />
                <Text style={[styles.payBadgeText, { color: theme.textSecond }]}>
                  Paid via {trip.paymentMethod.charAt(0).toUpperCase() + trip.paymentMethod.slice(1)}
                </Text>
              </View>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable style={[styles.actionBtn, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
              <Ionicons name="download-outline" size={20} color={theme.text} />
              <Text style={[styles.actionBtnText, { color: theme.text }]}>Download PDF</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, { backgroundColor: isDark ? '#001020' : '#EFF6FF', borderColor: theme.primary + '40' }, Shadows.xs]}>
              <Ionicons name="mail-outline" size={20} color={theme.primary} />
              <Text style={[styles.actionBtnText, { color: theme.primary }]}>Email Receipt</Text>
            </Pressable>
          </View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  successBanner: { alignItems: 'center', gap: Spacing.sm, padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1 },
  successIcon:   { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  successTitle:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  successDate:   { fontSize: FontSize.sm },

  receiptCard:  { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },

  trackRow:   { flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.md },
  trackLabel: { fontSize: FontSize.sm },
  trackCode:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, letterSpacing: 0.5 },

  driverRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderTopWidth: 1 },
  driverName: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  driverSub:  { fontSize: FontSize.xs, marginTop: 2 },
  rating:     { flexDirection: 'row', gap: 2 },

  routeSection: { padding: Spacing.md, borderTopWidth: 1 },
  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm },
  routeRow:     { flexDirection: 'row', gap: Spacing.md },
  routeIcons:   { alignItems: 'center', paddingTop: 4 },
  routeDot:     { width: 9, height: 9, borderRadius: 5 },
  routeLine:    { width: 2, flex: 1, marginVertical: 3 },
  routeAddrs:   { flex: 1 },
  routeAddr:    { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  routeMeta:    { flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.sm },
  routeMetaItem:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
  routeMetaText:{ fontSize: FontSize.xs },

  dashedDivider:{ borderWidth: 1, borderStyle: 'dashed', marginHorizontal: Spacing.md },

  fareSection: { padding: Spacing.md },
  fareRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  fareLabel:   { fontSize: FontSize.sm },
  fareAmt:     { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.sm, marginTop: Spacing.sm, borderTopWidth: 1 },
  totalLabel:  { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  totalAmt:    { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  payBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.md, marginTop: Spacing.sm },
  payBadgeText:{ fontSize: FontSize.xs },

  actions:       { flexDirection: 'row', gap: Spacing.sm },
  actionBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
});
