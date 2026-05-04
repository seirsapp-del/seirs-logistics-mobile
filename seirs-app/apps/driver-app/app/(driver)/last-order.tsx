import { useState, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Alert,
  ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, AlertCircle, Clock, CheckCircle, MoonStar } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { driversApi } from '@/services/api';

// Spec V8 §2.11 — driver wind-down toggle. When enabled, the matching
// service stops auto-assigning new jobs while the driver finishes the
// ones already accepted. Gating: only enable if today's acceptance
// rate ≥ 80% so drivers can't game it to skip undesirable orders.
//
// Backend wiring is planned (last-order column + matching service
// filter); this UI surface lets us ship the experience and bind it
// when the column lands. Acceptance-rate calc reads from delivery
// history once driversApi exposes it.
export default function LastOrderScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  const [enabled,         setEnabled]         = useState(false);
  const [acceptanceRate,  setAcceptanceRate]  = useState<number | null>(null);
  const [activeJobs,      setActiveJobs]      = useState(0);
  const [loading,         setLoading]         = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const me = await driversApi.me();
        setEnabled(!!me?.lastOrderMode);
        setAcceptanceRate(me?.todayAcceptanceRate ?? null);
        setActiveJobs(me?.activeJobsCount ?? 0);
      } catch { /* non-fatal */ }
      finally { setLoading(false); }
    })();
  }, []);

  const meetsThreshold = acceptanceRate == null || acceptanceRate >= 80;

  const handleToggle = (next: boolean) => {
    if (next && !meetsThreshold) {
      Alert.alert(
        'Threshold not met',
        `Last Order mode requires today's acceptance rate to be at least 80%. You're currently at ${acceptanceRate}%. Accept a few more jobs and try again.`,
      );
      return;
    }
    if (next) {
      Alert.alert(
        'Wind down for today?',
        'No new jobs will be assigned to you. You\'ll still complete the ones you\'ve already accepted. Once enabled you can\'t turn it off until you fully sign off.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Wind down', onPress: () => setEnabled(true) },
        ],
      );
    } else {
      // No-op — Spec V8 says one-way until full sign-off
      Alert.alert('Already winding down', 'You can\'t re-enable jobs without fully signing off first.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Last Order Mode</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: theme.primary }]}>
          <MoonStar size={28} color="#fff" />
          <Text style={styles.heroTitle}>Wind down for the day</Text>
          <Text style={styles.heroSub}>
            Tell the dispatcher you&apos;re done after your current jobs. Cleanly stop accepting new orders without going offline mid-trip.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginVertical: 32 }} />
        ) : (
          <>
            {/* Status card */}
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardLabel, { color: theme.textSecond }]}>STATUS</Text>
                  <Text style={[styles.cardValue, { color: enabled ? '#16A34A' : theme.text }]}>
                    {enabled ? 'Winding down' : 'Accepting jobs'}
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={handleToggle}
                  disabled={enabled}
                  trackColor={{ false: '#E5E7EB', true: '#16A34A' }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {/* Active jobs */}
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: theme.primary + '15' }]}>
                  <Clock size={18} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardLabel, { color: theme.textSecond }]}>ACTIVE JOBS</Text>
                  <Text style={[styles.cardValue, { color: theme.text }]}>{activeJobs}</Text>
                  <Text style={[styles.cardSub, { color: theme.textSecond }]}>
                    {activeJobs === 0
                      ? 'No active jobs — you can sign off normally.'
                      : `Complete these ${activeJobs} before fully signing off.`}
                  </Text>
                </View>
              </View>
            </View>

            {/* Acceptance threshold */}
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: meetsThreshold ? '#16A34A18' : '#FEE2E2' }]}>
                  {meetsThreshold
                    ? <CheckCircle size={18} color="#16A34A" />
                    : <AlertCircle size={18} color="#DC2626" />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardLabel, { color: theme.textSecond }]}>TODAY&apos;S ACCEPTANCE RATE</Text>
                  <Text style={[styles.cardValue, { color: meetsThreshold ? '#16A34A' : '#DC2626' }]}>
                    {acceptanceRate != null ? `${acceptanceRate}%` : '—'}
                  </Text>
                  <Text style={[styles.cardSub, { color: theme.textSecond }]}>
                    Last Order requires ≥80%. This stops drivers from gaming the toggle to skip undesirable orders.
                  </Text>
                </View>
              </View>
            </View>

            {/* How it works */}
            <View style={[styles.howCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.howTitle, { color: theme.text }]}>What happens when you wind down</Text>
              {[
                'Dispatcher stops sending you new job offers',
                'Active jobs continue normally — complete them at your pace',
                'You can\'t re-enable jobs without fully signing off (one-way toggle)',
                'Re-enabling within 30 minutes counts against next-day priority',
              ].map(t => (
                <Text key={t} style={[styles.bullet, { color: theme.textSecond }]}>• {t}</Text>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },

  hero:      { borderRadius: Radius.xl, padding: Spacing.lg, gap: 8, alignItems: 'flex-start' },
  heroTitle: { color: '#fff', fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  heroSub:   { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.sm, lineHeight: 19 },

  card:      { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  cardValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, marginTop: 2 },
  cardSub:   { fontSize: FontSize.xs, lineHeight: 17, marginTop: 4 },

  howCard:   { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 6 },
  howTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: 4 },
  bullet:    { fontSize: FontSize.sm, lineHeight: 21 },
});
