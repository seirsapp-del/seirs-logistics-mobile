import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Switch, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { ArrowLeft, Users, Package, Clock, Percent } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// Spec V8 §1.15 — opt-in/out of corridor pooling. When pool acceptance
// is on, the dispatcher may add additional legs (other passengers or
// packages) to the same vehicle as long as it stays within +20% of
// your time and within 1km of your route. In exchange you get a
// pool discount applied automatically.
//
// Defaults: opt-in to mixed pool (most economical). User can opt out
// of pool entirely or restrict to packages-only (no strangers).

const STORAGE_KEY = 'seirs.poolPrefs.v1';

interface Prefs {
  poolEnabled:        boolean;
  acceptPassengers:   boolean;
  acceptPackages:     boolean;
  maxExtraTimePct:    number; // 0-20, capped by spec
}

const DEFAULTS: Prefs = {
  poolEnabled:      true,
  acceptPassengers: true,
  acceptPackages:   true,
  maxExtraTimePct:  20,
};

export default function PoolPreferencesScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const { t }  = useTranslation();

  const [prefs, setPrefs]   = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
      } catch { /* defaults */ }
      finally { setLoading(false); }
    })();
  }, []);

  const persist = async (next: Prefs) => {
    setPrefs(next);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* best-effort */ }
  };

  const togglePool = (next: boolean) => {
    if (!next) {
      Alert.alert(
        t('poolPrefs2.acceptPool'),
        t('poolPrefs2.title'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.ok'), onPress: () => persist({ ...prefs, poolEnabled: false }) },
        ],
      );
    } else {
      persist({ ...prefs, poolEnabled: true });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Pool Preferences</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Master toggle */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: theme.primary + '15' }]}>
              <Percent size={20} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Accept pool rides</Text>
              <Text style={[styles.cardSub, { color: theme.textSecond }]}>
                Get up to <Text style={{ fontWeight: '700' as any }}>20% off</Text> when the dispatcher bundles your trip with others along the same corridor.
              </Text>
            </View>
            <Switch
              value={prefs.poolEnabled}
              onValueChange={togglePool}
              trackColor={{ false: '#E5E7EB', true: theme.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {prefs.poolEnabled && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>WHAT TO ACCEPT</Text>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: '#3A7BD518' }]}>
                  <Users size={20} color="#3A7BD5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>Other passengers</Text>
                  <Text style={[styles.cardSub, { color: theme.textSecond }]}>
                    Allow another rider going the same direction to share your vehicle.
                  </Text>
                </View>
                <Switch
                  value={prefs.acceptPassengers}
                  onValueChange={v => persist({ ...prefs, acceptPassengers: v })}
                  trackColor={{ false: '#E5E7EB', true: theme.primary }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: '#16A34A18' }]}>
                  <Package size={20} color="#16A34A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>Packages</Text>
                  <Text style={[styles.cardSub, { color: theme.textSecond }]}>
                    Allow the driver to pick up / drop off packages along your route. Driver verifies trunk after each handoff.
                  </Text>
                </View>
                <Switch
                  value={prefs.acceptPackages}
                  onValueChange={v => persist({ ...prefs, acceptPackages: v })}
                  trackColor={{ false: '#E5E7EB', true: theme.primary }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: '#D9770618' }]}>
                  <Clock size={20} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>Max extra time</Text>
                  <Text style={[styles.cardSub, { color: theme.textSecond }]}>
                    Up to <Text style={{ fontWeight: '700' as any }}>{prefs.maxExtraTimePct}%</Text> longer than solo. Hard cap is 20% per spec.
                  </Text>
                </View>
              </View>
              <View style={styles.tabRow}>
                {[10, 15, 20].map(pct => {
                  const on = prefs.maxExtraTimePct === pct;
                  return (
                    <Pressable
                      key={pct}
                      onPress={() => persist({ ...prefs, maxExtraTimePct: pct })}
                      style={[styles.tab, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : theme.surface }]}
                    >
                      <Text style={{ color: on ? '#fff' : theme.textSecond, fontSize: FontSize.sm, fontWeight: FontWeight.bold }}>
                        +{pct}%
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        )}

        <View style={[styles.note, { backgroundColor: theme.primary + '08' }]}>
          <Text style={[styles.noteText, { color: theme.textSecond }]}>
            <Text style={{ fontWeight: '700' as any }}>How it works:</Text> The dispatcher silently pools rides when it would save you money without taking too much extra time. You don&apos;t have to do anything — just notice the discount in your fare breakdown.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },

  card:    { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap:{ width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  cardTitle:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },
  cardSub: { fontSize: FontSize.xs, lineHeight: 17, marginTop: 2 },

  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5 },

  tabRow:  { flexDirection: 'row', gap: 6, marginTop: 4 },
  tab:     { flex: 1, paddingVertical: 10, borderRadius: Radius.lg, borderWidth: 1.5, alignItems: 'center' },

  note:    { padding: Spacing.md, borderRadius: Radius.lg, marginTop: Spacing.sm },
  noteText:{ fontSize: FontSize.xs, lineHeight: 17 },
});
