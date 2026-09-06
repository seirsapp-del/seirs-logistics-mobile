import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, AlertCircle, Clock, CheckCircle, MoonStar } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { driversApi } from '@/services/api';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

// Spec V8 §2.11: driver wind-down toggle. When enabled, the matching
// service stops auto-assigning new jobs while the driver finishes the
// ones already accepted.
//
// D-9.1: the backend IS wired (lastOrderMode column + matching filter);
// this comment used to claim it was still "planned".
// D-6.5: the "re-enabling within 30 minutes counts against next-day
// priority" bullet was removed. No code enforces it and it contradicted
// the one-way-toggle bullet directly above it.
// D-1.11 (still open): todayAcceptanceRate is hardcoded null server-side,
// so the 80% gate below is informational only.
export default function LastOrderScreen() {
  const [sheet, setSheet] = useState<SeirsSheetSpec | null>(null);
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

  /**
   * drivers.service.ts still returns todayAcceptanceRate: null, so this
   * card rendered a permanent dash under the sentence "Last Order
   * requires 80%" and the gate below it always passed. Stating a rule
   * nothing enforces is worse than not mentioning it, so the whole card
   * is hidden until the backend actually computes the rate (2026-08-23
   * sweep, D-1.11). Nothing else changes: the day the number arrives the
   * card and the gate come back on their own.
   */
  const rateKnown      = acceptanceRate != null;
  const meetsThreshold = !rateKnown || acceptanceRate >= 80;

  const commitToggle = async (next: boolean) => {
    try {
      const res = await driversApi.setLastOrderMode(next);
      setEnabled(!!res.lastOrderMode);
    } catch (e: any) {
      const raw = e?.message ?? 'Try again.';
      const locked = raw.includes('LAST_ORDER_LOCKED');
      alertDialog(
        locked ? 'Already winding down' : 'Could not update',
        locked ? 'Sign off completely before re-enabling job acceptance.' : raw.replace(/^[A-Z_]+:\s*/, ''),
      );
    }
  };

  const handleToggle = (next: boolean) => {
    if (next && !meetsThreshold) {
      alertDialog(
        'Threshold not met',
        `Last Order mode requires today's acceptance rate to be at least 80%. You're currently at ${acceptanceRate}%. Accept a few more jobs and try again.`,
      );
      return;
    }
    if (next) {
      // One-way switch, so the row spells out the part a rider will
      // otherwise discover only when they try to undo it.
      setSheet({
        title: tr('auto.lastOrder.windDownForToday', 'Wind down for today?'),
        message: tr('auto.lastOrder.noNewJobsWillBe', 'No new jobs will be assigned to you. You will still complete the ones you have already accepted.'),
        options: [{
          label: tr('auto.lastOrder.windDown', 'Wind down'),
          sub: tr('auto.lastOrder.cannotBeTurnedOffUntil', 'Cannot be turned off until you fully sign off'),
          variant: 'primary',
          icon: 'moon-outline',
          onPress: () => commitToggle(true),
        }],
        cancelLabel: tr('auto.lastOrder.keepTakingJobs', 'Keep taking jobs'),
      });
    } else {
      // No-op: Spec V8 says one-way until full sign-off
      alertDialog('Already winding down', 'You can\'t re-enable jobs without fully signing off first.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.lastOrder.lastOrderMode', 'Last Order Mode')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: theme.primary }]}>
          <MoonStar size={28} color="#fff" />
          <Text style={styles.heroTitle}>{tx('auto.lastOrder.windDownForTheDay', 'Wind down for the day')}</Text>
          <Text style={styles.heroSub}>
            {tr('auto.lastOrder.tellTheDispatcherYouRe', 'Tell the dispatcher you\'re done after your current jobs. Cleanly stop accepting new orders without going offline mid-trip.')}
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
                    {enabled ? tx9('auto.lastOrder.windingDown', 'Winding down') : tx9('auto.lastOrder.acceptingJobs', 'Accepting jobs')}
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
                  <Text style={[styles.cardLabel, { color: theme.textSecond }]}>{tr('auto.lastOrder.activeJobs', 'ACTIVE JOBS')}</Text>
                  <Text style={[styles.cardValue, { color: theme.text }]}>{activeJobs}</Text>
                  <Text style={[styles.cardSub, { color: theme.textSecond }]}>
                    {activeJobs === 0
                      ? tx9('auto.lastOrder.noActiveJobsYouCan', 'No active jobs: you can sign off normally.')
                      : tx9('auto.lastOrder.completeTheseBeforeFullySigning', 'Complete these {{activeJobs}} before fully signing off.', { activeJobs })}
                  </Text>
                </View>
              </View>
            </View>

            {/* Acceptance threshold. Only rendered once the server sends a
                real rate: see the rateKnown comment above (D-1.11). */}
            {rateKnown && (
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.row}>
                  <View style={[styles.iconWrap, { backgroundColor: meetsThreshold ? '#16A34A18' : '#FEE2E2' }]}>
                    {meetsThreshold
                      ? <CheckCircle size={18} color="#16A34A" />
                      : <AlertCircle size={18} color="#DC2626" />
                    }
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardLabel, { color: theme.textSecond }]}>{tr('auto.lastOrder.todaySAcceptanceRate', 'TODAY\'S ACCEPTANCE RATE')}</Text>
                    <Text style={[styles.cardValue, { color: meetsThreshold ? '#16A34A' : '#DC2626' }]}>
                      {acceptanceRate}%
                    </Text>
                    <Text style={[styles.cardSub, { color: theme.textSecond }]}>
                      {tr('auto.lastOrder.lastOrderRequires80This', 'Last Order requires ≥80%. This stops drivers from gaming the toggle to skip undesirable orders.')}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* How it works */}
            <View style={[styles.howCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.howTitle, { color: theme.text }]}>{tx('auto.lastOrder.whatHappensWhenYouWind', 'What happens when you wind down')}</Text>
              {[
                tx9('auto.lastOrder.dispatcherStopsSendingYouNew', 'Dispatcher stops sending you new job offers'),
                tx9('auto.lastOrder.activeJobsContinueNormallyComplete', 'Active jobs continue normally: complete them at your pace'),
                tx9('auto.lastOrder.youCanTReEnable', 'You can\'t re-enable jobs without fully signing off (one-way toggle)'),
              ].map(t => (
                <Text key={t} style={[styles.bullet, { color: theme.textSecond }]}>• {t}</Text>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <SeirsSheet spec={sheet} onClose={() => setSheet(null)} />
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
