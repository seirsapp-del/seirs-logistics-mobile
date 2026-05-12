import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { request } from '@seirs/shared/services/api';
import { useColors } from '@/context/ThemeContext';

interface Usage {
  totalKeys:  number;
  activeKeys: number;
  callsToday: number;
}

export default function ApiUsageScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();
  const [usage,   setUsage]   = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    request<Usage>('GET', '/dev-platform/usage')
      .then(setUsage)
      .catch(() => setUsage(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.surfaceSecond }]}>
          <Icon name="ArrowLeft" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>API Usage</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.statsRow}>
              <Stat label="Total Keys"   value={usage?.totalKeys  ?? 0} accent={colors.accent} />
              <Stat label="Active Keys"  value={usage?.activeKeys ?? 0} accent="#16A34A" />
            </View>

            {/* Brand navy stays in both modes — high-contrast feature card */}
            <View style={styles.bigCard}>
              <Text style={styles.bigLabel}>CALLS TODAY</Text>
              <Text style={styles.bigValue}>{(usage?.callsToday ?? 0).toLocaleString()}</Text>
              <Text style={styles.bigSub}>Across all your API keys</Text>
            </View>

            <View style={styles.note}>
              <Icon name="Info" size={14} color="#D97706" />
              <Text style={styles.noteText}>
                Detailed per-key call breakdown, latency p95, and error-rate charts ship in the next batch when the public /v1/* surface starts accepting traffic.
              </Text>
            </View>

            <View style={[styles.benefitsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.benefitsTitle, { color: colors.text }]}>What we&apos;ll track</Text>
              {[
                { icon: 'BarChart3',     text: 'Calls per endpoint per day' },
                { icon: 'Activity',      text: 'p50 / p95 / p99 latency'    },
                { icon: 'AlertCircle',   text: 'Error rate (4xx / 5xx)'     },
                { icon: 'TrendingUp',    text: 'Monthly bill estimate'      },
                { icon: 'Globe',         text: 'Geographic call distribution' },
              ].map(b => (
                <View key={b.text} style={styles.benefitRow}>
                  <View style={[styles.benefitIcon, { backgroundColor: colors.accent + '18' }]}>
                    <Icon name={b.icon as any} size={12} color={colors.accent} />
                  </View>
                  <Text style={[styles.benefitText, { color: colors.textSecond }]}>{b.text}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  const colors = useColors();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.statLabel, { color: colors.textSecond }]}>{label}</Text>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn:   { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 18, fontWeight: '700' },

  content:   { padding: 16, gap: 12 },

  statsRow:  { flexDirection: 'row', gap: 10 },
  statCard:  { flex: 1, borderRadius: 12, padding: 16, borderWidth: 1, alignItems: 'flex-start' },
  statLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  statValue: { fontSize: 28, fontWeight: '800', marginTop: 4 },

  bigCard:   { backgroundColor: '#0F2B4C', borderRadius: 16, padding: 24 },
  bigLabel:  { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  bigValue:  { color: '#fff', fontSize: 40, fontWeight: '800', marginTop: 8 },
  bigSub:    { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },

  note:      { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#FEF9C3', borderColor: '#FDE68A', borderWidth: 1, borderRadius: 10, alignItems: 'flex-start' },
  noteText:  { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },

  benefitsCard: { borderRadius: 12, padding: 16, gap: 8, borderWidth: 1 },
  benefitsTitle:{ fontSize: 13, fontWeight: '700' },
  benefitRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitIcon:  { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  benefitText:  { flex: 1, fontSize: 12 },
});
