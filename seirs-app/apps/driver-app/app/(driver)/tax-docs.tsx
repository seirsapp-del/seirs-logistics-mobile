import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, FileText, Download, ChevronRight, Calendar, Receipt, AlertCircle,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { driversApi } from '@/services/api';

// Spec V8 §2 — driver yearly earnings statements for FIRS tax filing.
// Once the backend tax-export endpoint ships, "Download" generates a
// signed PDF (R2) of the year's earnings + commission breakdown.
// Until then this surface lists yearly aggregates so drivers know the
// numbers they need to self-report.

interface YearSummary {
  year:           number;
  grossNgn:       number;
  commissionNgn:  number;
  netNgn:         number;
  trips:          number;
}

const fmtNgn = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

export default function TaxDocsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  const [summaries, setSummaries] = useState<YearSummary[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await driversApi.taxSummary();
        const items = res?.years ?? [];
        setSummaries(items.map(y => ({
          year:          y.year,
          grossNgn:      y.grossNgn,
          commissionNgn: y.commissionNgn,
          netNgn:        y.netNgn,
          trips:         y.tripCount,
        })));
      } catch { setSummaries([]); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleDownload = (year: number) => {
    Alert.alert(
      `Download ${year} statement`,
      'PDF export ships in a follow-up — for now the numbers shown are the canonical aggregates the backend will use to generate the PDF. Screenshot this page if you need to file before then.',
      [{ text: 'OK' }],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Tax Documents</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        <View style={[styles.intro, { backgroundColor: theme.primary + '12' }]}>
          <FileText size={20} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.introTitle, { color: theme.text }]}>For your FIRS tax filing</Text>
            <Text style={[styles.introSub, { color: theme.textSecond }]}>
              Yearly earnings + platform commission breakdown. Download the PDF to attach when filing.
            </Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 32 }} />
        ) : summaries.length === 0 ? (
          <View style={styles.empty}>
            <Receipt size={36} color={theme.textThird} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No earnings yet</Text>
            <Text style={[styles.emptySub, { color: theme.textSecond }]}>
              Once you complete deliveries and receive payouts, statements will be available here organised by year.
            </Text>
          </View>
        ) : (
          summaries.map(y => (
            <Pressable
              key={y.year}
              onPress={() => handleDownload(y.year)}
              style={[styles.yearCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <View style={styles.yearTop}>
                <View style={[styles.yearIcon, { backgroundColor: theme.primary + '15' }]}>
                  <Calendar size={18} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.yearLabel, { color: theme.text }]}>{y.year}</Text>
                  <Text style={[styles.yearSub, { color: theme.textSecond }]}>{y.trips} trip{y.trips === 1 ? '' : 's'}</Text>
                </View>
                <Download size={16} color={theme.primary} />
              </View>

              <View style={styles.breakdown}>
                <Stat label="Gross"      value={fmtNgn(y.grossNgn)}      theme={theme} />
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <Stat label="Commission" value={`-${fmtNgn(y.commissionNgn)}`} theme={theme} color="#DC2626" />
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <Stat label="Net"        value={fmtNgn(y.netNgn)}        theme={theme} color="#16A34A" />
              </View>
            </Pressable>
          ))
        )}

        <View style={styles.footnote}>
          <AlertCircle size={12} color={theme.textThird} />
          <Text style={[styles.footnoteText, { color: theme.textThird }]}>
            Numbers are derived from your payment history. Canonical tax-summary endpoint with PDF export is a follow-up.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, theme, color }: any) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: theme.textSecond, letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.bold, color: color ?? theme.text }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },

  intro:     { flexDirection: 'row', gap: 12, padding: Spacing.md, borderRadius: Radius.lg, alignItems: 'center' },
  introTitle:{ fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: 2 },
  introSub:  { fontSize: FontSize.xs, lineHeight: 17 },

  empty:    { alignItems: 'center', gap: 10, paddingVertical: Spacing.xl },
  emptyTitle:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },
  emptySub: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 19, paddingHorizontal: Spacing.lg },

  yearCard:  { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  yearTop:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  yearIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  yearLabel: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  yearSub:   { fontSize: FontSize.xs, marginTop: 2 },
  breakdown: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 10, paddingVertical: 10, marginTop: 4 },
  divider:   { width: 1, alignSelf: 'stretch' },

  footnote:  { flexDirection: 'row', gap: 6, alignItems: 'flex-start', paddingHorizontal: 4, marginTop: Spacing.sm },
  footnoteText: { flex: 1, fontSize: FontSize.xs, lineHeight: 17 },
});
