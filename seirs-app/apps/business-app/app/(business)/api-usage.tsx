import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { request } from '@/services/api';
import { useColors, useTheme } from '@/context/ThemeContext';

interface Usage {
  totalKeys:  number;
  activeKeys: number;
  callsToday: number;
}

export default function ApiUsageScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();
  const { isDark } = useTheme();
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

            {/* Brand navy stays in both modes: high-contrast feature card */}
            <View style={styles.bigCard}>
              <Text style={styles.bigLabel}>CALLS TODAY</Text>
              <Text style={styles.bigValue}>{(usage?.callsToday ?? 0).toLocaleString()}</Text>
              <Text style={styles.bigSub}>Across all your API keys</Text>
            </View>

            {/* Fixed cream #FEF9C3 with #92400E text: unreadable-pale on a
                dark screen (B-10.8). Amber still marks the note, tinted. */}
            <View style={[styles.note, {
              backgroundColor: isDark ? '#D9770622' : '#FEF9C3',
              borderColor:     isDark ? '#D9770655' : '#FDE68A',
            }]}>
              <Icon name="Info" size={14} color="#D97706" />
              <Text style={[styles.noteText, { color: isDark ? '#FCD34D' : '#92400E' }]}>
                Detailed per-key call breakdown, latency p95, and error-rate charts ship in the next batch when the public /v1/* surface starts accepting traffic.
              </Text>
            </View>

            {/* The "What we'll track" card listing five unbuilt features came
                out (B-9.3): a roadmap rendered as a product surface reads as
                a promise, and the app is meant to read as live. Put it back
                as real numbers when the tracking exists. */}
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
  statLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  statValue: { fontSize: 28, fontWeight: '800', marginTop: 4 },

  bigCard:   { backgroundColor: '#0F2B4C', borderRadius: 16, padding: 24 },
  bigLabel:  { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  bigValue:  { color: '#fff', fontSize: 40, fontWeight: '800', marginTop: 8 },
  bigSub:    { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 },

  // Colours overridden per theme at the use site: see B-10.8.
  note:      { flexDirection: 'row', gap: 8, padding: 12, borderWidth: 1, borderRadius: 10, alignItems: 'flex-start' },
  noteText:  { flex: 1, fontSize: 13, lineHeight: 17 },

});
