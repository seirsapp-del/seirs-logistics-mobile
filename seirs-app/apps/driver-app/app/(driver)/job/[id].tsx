import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft, Zap, Clock, MapPin, Navigation, Package,
  User, Phone, ExternalLink, CheckCircle, XCircle,
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { MOCK_DRIVER_JOBS } from '@/constants/driverMockData';

const URGENCY_CONFIG: Record<string, { label: string; color: string; Icon: any }> = {
  instant:   { label: 'Instant',   color: '#EF4444', Icon: Zap  },
  standard:  { label: 'Standard',  color: '#3A7BD5', Icon: Clock },
  scheduled: { label: 'Scheduled', color: '#8B5CF6', Icon: Clock },
};

const ACCEPT_TIMEOUT_SEC = 45;

export default function JobDetailScreen() {
  const { id }    = useLocalSearchParams<{ id: string }>();
  const router    = useRouter();
  const cs        = useColorScheme();
  const theme     = Colors[cs ?? 'light'];
  const isDark    = cs === 'dark';

  const [countdown, setCountdown] = useState(ACCEPT_TIMEOUT_SEC);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const job = MOCK_DRIVER_JOBS.find(j => j.id === id);

  useEffect(() => {
    if (!job) return;
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          router.back();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [job]);

  if (!job) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <Package size={48} color={theme.textThird} strokeWidth={1.5} />
        <Text style={[styles.notFoundText, { color: theme.textSecond }]}>Job not found</Text>
        <Pressable style={[styles.backLink, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const urg = URGENCY_CONFIG[job.urgency] ?? { label: job.urgency, color: '#6B7280', Icon: Clock };

  const countdownPct = (countdown / ACCEPT_TIMEOUT_SEC) * 100;
  const countdownColor = countdown <= 10 ? '#EF4444' : countdown <= 20 ? '#D97706' : '#16A34A';

  const openMaps = (address: string) => {
    const query = encodeURIComponent(address);
    Alert.alert('Navigate', 'Open with:', [
      { text: 'Google Maps', onPress: () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${query}`) },
      { text: 'Waze',        onPress: () => Linking.openURL(`https://waze.com/ul?q=${query}`) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleAccept = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    Alert.alert(
      'Accept Job?',
      `You are accepting a delivery for ${job.customer.name}. Head to pickup immediately.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => {
          // restart timer
          timerRef.current = setInterval(() => {
            setCountdown(c => { if (c <= 1) { clearInterval(timerRef.current!); router.back(); return 0; } return c - 1; });
          }, 1000);
        }},
        {
          text: 'Accept',
          onPress: () => {
            router.replace({ pathname: '/(driver)/active', params: { id: job.id } });
            // Deep-link to navigation with pickup address
            const q = encodeURIComponent(job.pickupAddress);
            Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`).catch(() => {});
          },
        },
      ],
    );
  };

  const handleDecline = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    Alert.alert(
      'Decline Job?',
      'This job will be offered to another driver.',
      [
        { text: 'Keep Job', style: 'cancel', onPress: () => {
          timerRef.current = setInterval(() => {
            setCountdown(c => { if (c <= 1) { clearInterval(timerRef.current!); router.back(); return 0; } return c - 1; });
          }, 1000);
        }},
        { text: 'Decline', style: 'destructive', onPress: () => router.back() },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Job Details</Text>
        <View style={[styles.urgBadge, { backgroundColor: urg.color + '18' }]}>
          <urg.Icon size={13} color={urg.color} strokeWidth={1.75} />
          <Text style={[styles.urgText, { color: urg.color }]}>{urg.label}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Countdown */}
        <View style={[styles.countdownCard, { backgroundColor: countdownColor + '15', borderColor: countdownColor + '40' }]}>
          <View style={styles.countdownTop}>
            <Clock size={18} color={countdownColor} strokeWidth={1.75} />
            <Text style={[styles.countdownLabel, { color: countdownColor }]}>
              Accept in {countdown}s or it auto-declines
            </Text>
          </View>
          <View style={[styles.countdownTrack, { backgroundColor: theme.surfaceSecond }]}>
            <View style={[styles.countdownFill, { width: `${countdownPct}%`, backgroundColor: countdownColor }]} />
          </View>
        </View>

        {/* Fare card */}
        <View style={[styles.fareCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.fareLabel, { color: theme.textSecond }]}>Estimated Earnings</Text>
          <Text style={[styles.fareAmount, { color: theme.primary }]}>₦{(job.driverEarnings ?? job.price ?? 0).toLocaleString()}</Text>
          <Text style={[styles.fareNote, { color: theme.textThird }]}>After 30% Seirs commission</Text>
        </View>

        {/* Customer */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Customer</Text>
          <View style={styles.customerRow}>
            <View style={[styles.avatar, { backgroundColor: theme.primary + '20' }]}>
              <Text style={[styles.avatarText, { color: theme.primary }]}>{job.customer.name.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.customerName, { color: theme.text }]}>{job.customer.name}</Text>
              <Text style={[styles.customerNote,  { color: theme.textThird }]}>Phone shared after acceptance</Text>
            </View>
            <User size={18} color={theme.textThird} strokeWidth={1.75} />
          </View>
        </View>

        {/* Route */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Route</Text>

          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: '#16A34A' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.routeLabel, { color: theme.textThird }]}>Pickup</Text>
              <Text style={[styles.routeAddr, { color: theme.text }]}>{job.pickupAddress}</Text>
            </View>
            <Pressable style={[styles.navBtn, { backgroundColor: theme.primary + '15' }]} onPress={() => openMaps(job.pickupAddress)}>
              <Navigation size={16} color={theme.primary} strokeWidth={1.75} />
            </Pressable>
          </View>

          <View style={[styles.routeLine, { backgroundColor: theme.border }]} />

          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.routeLabel, { color: theme.textThird }]}>Dropoff</Text>
              <Text style={[styles.routeAddr, { color: theme.text }]}>{job.dropoffAddress}</Text>
            </View>
            <Pressable style={[styles.navBtn, { backgroundColor: theme.primary + '15' }]} onPress={() => openMaps(job.dropoffAddress)}>
              <Navigation size={16} color={theme.primary} strokeWidth={1.75} />
            </Pressable>
          </View>

          <View style={[styles.distRow, { borderTopColor: theme.border }]}>
            <MapPin size={14} color={theme.textThird} strokeWidth={1.75} />
            <Text style={[styles.distText, { color: theme.textSecond }]}>
              ~{job.distanceKm ?? '?'} km · ~{job.estimatedDuration ?? '?'} min
            </Text>
          </View>
        </View>

        {/* Package info */}
        {job.packageDescription && (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
            <View style={styles.cardTitleRow}>
              <Package size={16} color={theme.primary} strokeWidth={1.75} />
              <Text style={[styles.cardTitle, { color: theme.text }]}>Package</Text>
            </View>
            <Text style={[styles.packageDesc, { color: theme.textSecond }]}>{job.packageDescription}</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Action buttons */}
      <View style={[styles.actionBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <Pressable style={[styles.declineBtn, { borderColor: '#EF4444' }]} onPress={handleDecline}>
          <XCircle size={20} color="#EF4444" strokeWidth={1.75} />
          <Text style={[styles.declineText, { color: '#EF4444' }]}>Decline</Text>
        </Pressable>
        <Pressable style={[styles.acceptBtn, { backgroundColor: theme.primary }]} onPress={handleAccept}>
          <CheckCircle size={20} color="#fff" strokeWidth={1.75} />
          <Text style={styles.acceptText}>Accept Job</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  urgBadge:{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  urgText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },
  content: { padding: Spacing.md, gap: Spacing.md },

  countdownCard:  { borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.sm },
  countdownTop:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  countdownLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any },
  countdownTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  countdownFill:  { height: 6, borderRadius: 3 },

  fareCard:   { alignItems: 'center', padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, gap: 4 },
  fareLabel:  { fontSize: FontSize.sm },
  fareAmount: { fontSize: 40, fontWeight: FontWeight.bold as any, letterSpacing: -1 },
  fareNote:   { fontSize: FontSize.xs },

  card:        { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  cardTitle:   { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  cardTitleRow:{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },

  customerRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar:       { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any },
  customerName: { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any },
  customerNote: { fontSize: FontSize.xs, marginTop: 2 },

  routeRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  routeDot:   { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  routeLabel: { fontSize: FontSize.xs, marginBottom: 2 },
  routeAddr:  { fontSize: FontSize.base },
  routeLine:  { height: 20, width: 1, marginLeft: 4, marginVertical: -4 },
  navBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  distRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingTop: Spacing.sm, marginTop: Spacing.sm, borderTopWidth: 1 },
  distText:   { fontSize: FontSize.sm },

  packageDesc: { fontSize: FontSize.sm, lineHeight: 20 },

  notFoundText: { fontSize: FontSize.base, marginTop: Spacing.md, marginBottom: Spacing.lg },
  backLink:     { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.xl },
  backLinkText: { color: '#fff', fontWeight: FontWeight.semibold as any },

  actionBar:   { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: Spacing.md, padding: Spacing.md, paddingBottom: Spacing.lg, borderTopWidth: 1 },
  declineBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 56, borderRadius: Radius.xl, borderWidth: 2 },
  declineText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any },
  acceptBtn:   { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 56, borderRadius: Radius.xl },
  acceptText:  { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
});
