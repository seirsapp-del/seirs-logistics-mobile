import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { MOCK_DRIVER_JOBS } from '@/constants/driverMockData';

const URGENCY_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  instant:  { label: 'Instant',  color: '#EF4444', icon: 'flash' },
  standard: { label: 'Standard', color: '#3A86FF', icon: 'time-outline' },
  scheduled:{ label: 'Scheduled',color: '#8B5CF6', icon: 'calendar-outline' },
};

export default function JobDetailScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const cs       = useColorScheme();
  const theme    = Colors[cs ?? 'light'];
  const isDark   = cs === 'dark';

  const job = MOCK_DRIVER_JOBS.find(j => j.id === id);

  if (!job) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.textThird} />
        <Text style={[styles.notFoundText, { color: theme.textSecond }]}>Job not found</Text>
        <Pressable style={[styles.backLink, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const urg = URGENCY_CONFIG[job.urgency] ?? { label: job.urgency, color: '#6B7280', icon: 'ellipse-outline' };

  const handleAccept = () => {
    Alert.alert(
      'Accept Job?',
      `You are accepting a delivery for ${job.customer.name}. Head to pickup immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: () => router.replace({ pathname: '/(driver)/active', params: { id: job.id } }),
        },
      ],
    );
  };

  const handleDecline = () => {
    Alert.alert(
      'Decline Job?',
      'This job will be offered to another driver.',
      [
        { text: 'Keep Job', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: () => router.back() },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Job Details</Text>
        <View style={[styles.urgBadge, { backgroundColor: urg.color + '18' }]}>
          <Ionicons name={urg.icon as any} size={13} color={urg.color} />
          <Text style={[styles.urgText, { color: urg.color }]}>{urg.label}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Earnings hero */}
        <View style={[styles.earningsHero, { backgroundColor: isDark ? '#001A00' : '#F0FDF4', borderColor: '#22C55E30' }]}>
          <Text style={[styles.earningsLabel, { color: theme.textSecond }]}>Your Earnings</Text>
          <Text style={[styles.earningsAmount, { color: '#22C55E' }]}>₦{job.driverEarnings.toLocaleString()}</Text>
          <Text style={[styles.earningsSub, { color: theme.textThird }]}>of ₦{job.price.toLocaleString()} total fare</Text>
        </View>

        {/* Route card */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Route</Text>

          <View style={styles.routeBlock}>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#22C55E' }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.routeLabel, { color: theme.textThird }]}>Pickup</Text>
                <Text style={[styles.routeAddr, { color: theme.text }]}>{job.pickupAddress}</Text>
              </View>
            </View>
            <View style={[styles.connector, { backgroundColor: theme.border }]} />
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.routeLabel, { color: theme.textThird }]}>Drop-off</Text>
                <Text style={[styles.routeAddr, { color: theme.text }]}>{job.dropoffAddress}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.metaRow, { borderTopColor: theme.border }]}>
            <View style={styles.metaPill}>
              <Ionicons name="navigate-outline" size={14} color={theme.textThird} />
              <Text style={[styles.metaText, { color: theme.textSecond }]}>{job.distanceKm} km</Text>
            </View>
            <View style={styles.metaPill}>
              <Ionicons name="time-outline" size={14} color={theme.textThird} />
              <Text style={[styles.metaText, { color: theme.textSecond }]}>{job.estimatedDuration}</Text>
            </View>
            <View style={styles.metaPill}>
              <Ionicons name="receipt-outline" size={14} color={theme.textThird} />
              <Text style={[styles.metaText, { color: theme.textSecond }]}>{job.trackingCode}</Text>
            </View>
          </View>
        </View>

        {/* Package card */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Package</Text>
          <View style={styles.pkgGrid}>
            {[
              { icon: 'cube-outline',    label: 'Size',        value: job.packageSize },
              { icon: 'document-text-outline', label: 'Contents', value: job.packageDescription },
              { icon: 'alert-circle-outline', label: 'Fragile', value: job.isFragile ? 'Yes — handle with care' : 'No' },
            ].map(p => (
              <View key={p.label} style={styles.pkgRow}>
                <View style={[styles.pkgIconWrap, { backgroundColor: theme.surfaceSecond }]}>
                  <Ionicons name={p.icon as any} size={18} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pkgLabel, { color: theme.textThird }]}>{p.label}</Text>
                  <Text style={[styles.pkgValue, { color: theme.text }]}>{p.value}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Customer card */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Customer</Text>
          <View style={styles.customerRow}>
            <View style={[styles.customerAvatar, { backgroundColor: theme.primary + '20' }]}>
              <Text style={[styles.customerInitial, { color: theme.primary }]}>
                {job.customer.name.charAt(0)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.customerName, { color: theme.text }]}>{job.customer.name}</Text>
              <Text style={[styles.customerPhone, { color: theme.textSecond }]}>{job.customer.phone}</Text>
            </View>
            <Pressable style={[styles.callBtn, { backgroundColor: '#22C55E18' }]}>
              <Ionicons name="call-outline" size={20} color="#22C55E" />
            </Pressable>
          </View>
        </View>

        {/* Fragile warning */}
        {job.isFragile && (
          <View style={[styles.fragileWarn, { backgroundColor: isDark ? '#1A0A00' : '#FFF7ED', borderColor: '#FB923C40' }]}>
            <Ionicons name="warning-outline" size={18} color="#FB923C" />
            <Text style={[styles.fragileText, { color: '#FB923C' }]}>Handle with extra care — fragile package</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom CTAs */}
      <View style={[styles.ctaBar, { backgroundColor: theme.navBackground, borderTopColor: theme.border }]}>
        <Pressable
          style={[styles.declineBtn, { borderColor: '#EF4444' }]}
          onPress={handleDecline}
        >
          <Text style={styles.declineBtnText}>Decline</Text>
        </Pressable>
        <Pressable
          style={[styles.acceptBtn, { backgroundColor: '#22C55E' }]}
          onPress={handleAccept}
        >
          <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
          <Text style={styles.acceptBtnText}>Accept Job</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn:   { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:     { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  urgBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: Radius.full },
  urgText:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md },

  earningsHero:   { alignItems: 'center', padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, gap: 4 },
  earningsLabel:  { fontSize: FontSize.sm },
  earningsAmount: { fontSize: FontSize['3xl'], fontWeight: FontWeight.bold },
  earningsSub:    { fontSize: FontSize.xs },

  card:      { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  cardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  routeBlock: { gap: 4 },
  routeRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  routeDot:   { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
  routeLabel: { fontSize: FontSize.xs, marginBottom: 2 },
  routeAddr:  { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  connector:  { width: 1.5, height: 16, marginLeft: 4 },

  metaRow:   { flexDirection: 'row', gap: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, flexWrap: 'wrap' },
  metaPill:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:  { fontSize: FontSize.sm },

  pkgGrid: { gap: Spacing.sm },
  pkgRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  pkgIconWrap: { width: 40, height: 40, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  pkgLabel:{ fontSize: FontSize.xs },
  pkgValue:{ fontSize: FontSize.base, fontWeight: FontWeight.medium },

  customerRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  customerAvatar: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  customerInitial:{ fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  customerName:   { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  customerPhone:  { fontSize: FontSize.sm, marginTop: 2 },
  callBtn:        { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  fragileWarn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  fragileText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, flex: 1 },

  ctaBar:      { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, borderTopWidth: 1 },
  declineBtn:  { flex: 1, height: 54, borderRadius: Radius.xl, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  declineBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: '#EF4444' },
  acceptBtn:   { flex: 2, height: 54, borderRadius: Radius.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  acceptBtnText:  { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#fff' },

  notFoundText: { fontSize: FontSize.base, marginTop: Spacing.md, marginBottom: Spacing.lg },
  backLink:     { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  backLinkText: { color: '#fff', fontWeight: FontWeight.semibold },
});
