/**
 * A person's own delivery and ride spend, as a statement.
 *
 * Approved in the 1 September spec alongside the other three apps, each
 * keeping its own meaning of the word. For a person the meaning is what
 * they spent.
 *
 * The objection to building this was that a payer's needs are already
 * met by a receipt. That does not survive one standing rule: a customer
 * account cannot become a business account. Customer to driver and
 * business to partner are the only conversions there are. So somebody
 * trading on a personal account has no route to a business statement,
 * ever, and a pile of per-delivery receipts is not a period a tax
 * office will accept.
 *
 * Same rules as the business and partner statements: presets before
 * pickers, the period always printed above the figure, no lifetime
 * total anywhere, settled charges only, and money to the kobo so it
 * reconciles against a bank statement.
 *
 * Copy is English, matching documents.tsx, the closest screen in this
 * app and likewise untranslated. The Profile row that reaches it IS
 * translated in all four locales.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { paymentsApi, statementsApi } from '@/services/api';
import type { CustomerStatement, StatementEntry } from '@/services/api';
import { naira } from '@/utils/money';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

type PresetKey = 'this_month' | 'last_month' | 'last_2_months' | 'last_90';

const PRESETS = (): Array<{ key: PresetKey; label: string }> => [
  { key: 'this_month',    label: tr('auto.statement.thisMonth', 'This month') },
  { key: 'last_month',    label: tr('auto.statement.lastMonth', 'Last month') },
  { key: 'last_2_months', label: tr('auto.statement.last2Months', 'Last 2 months') },
  { key: 'last_90',       label: tr('auto.statement.last90Days', 'Last 90 days') },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth   = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

function rangeFor(preset: PresetKey): { from: string; to: string } {
  const now = new Date();
  switch (preset) {
    case 'this_month':
      return { from: iso(startOfMonth(now)), to: iso(now) };
    case 'last_month': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: iso(startOfMonth(prev)), to: iso(endOfMonth(prev)) };
    }
    case 'last_2_months':
      return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(now) };
    case 'last_90':
      return { from: iso(new Date(now.getTime() - 90 * 24 * 3600 * 1000)), to: iso(now) };
  }
}

/**
 * Matches the PDF and the verification page exactly, month array
 * included. toLocaleString is avoided on all three for the same reason:
 * en-GB renders September with four letters and the result moves with
 * the runtime's ICU build, so a phone and a printed page could disagree
 * while somebody holds both.
 */
function periodLabel(fromIso?: string, toIso?: string): string {
  if (!fromIso || !toIso) return '';
  const f = new Date(fromIso), t = new Date(toIso);
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return '';
  const sameYear = f.getFullYear() === t.getFullYear();
  const left  = `${f.getDate()} ${MONTHS[f.getMonth()].toUpperCase()}${sameYear ? '' : ` ${f.getFullYear()}`}`;
  const right = `${t.getDate()} ${MONTHS[t.getMonth()].toUpperCase()} ${t.getFullYear()}`;
  return `${left} - ${right}`;
}

const dayMonth = (isoStr?: string) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

const fullDateTime = (isoStr?: string) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

export default function CustomerStatementScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  const [preset, setPreset]         = useState<PresetKey>('last_2_months');
  const [statement, setStatement]   = useState<CustomerStatement | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting]   = useState(false);

  const range = useMemo(() => rangeFor(preset), [preset]);

  const load = useCallback(async () => {
    const s = await paymentsApi.statement(range.from, range.to).catch(() => null);
    setStatement(s);
  }, [range.from, range.to]);

  useEffect(() => { setLoading(true); load().finally(() => setLoading(false)); }, [load]);

  const entries  = statement?.entries ?? [];
  const totalNgn = statement?.totals?.paidNgn ?? 0;
  const count    = statement?.totals?.entries ?? 0;

  const shareLine = (e: StatementEntry) => {
    const lines = [
      'SEIRS Logistics receipt',
      e.trackingCode ? `Delivery: ${e.trackingCode}` : '',
      `Description: ${e.narrative}`,
      `Amount: ${naira(e.amountNgn)}`,
      e.method ? `Paid by: ${e.method}` : '',
      e.reference ? `Reference: ${e.reference}` : '',
      `Date: ${fullDateTime(e.date)}`,
    ].filter(Boolean).join('\n');
    Share.share({ message: lines }).catch(() => {});
  };

  /**
   * Ask the server for the document. That version carries a reference
   * anybody can check and arrives as a link that can be emailed, which
   * a share sheet cannot do. Falls back to text rather than leaving a
   * dead button: this app has no filesystem module and so no local PDF.
   */
  const exportStatement = async () => {
    if (!statement || exporting) return;
    setExporting(true);
    try {
      const link = await statementsApi.customerLink(range.from, range.to).catch(() => null);
      if (link?.url) {
        const opened = await Linking.openURL(link.url).then(() => true).catch(() => false);
        if (opened) return;
      }
      const lines = [
        'SEIRS Logistics statement',
        `Period: ${periodLabel(statement.from, statement.to)}`,
        `Spent in this period: ${naira(totalNgn)}`,
        '',
        ...entries.map(e => `${dayMonth(e.date)}  ${e.narrative}  ${naira(e.amountNgn)}`),
      ].filter(Boolean);
      await Share.share({ message: lines.join('\n') });
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{tx('auto.statement.spendingStatement', 'Spending Statement')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }}
              tintColor={theme.primary}
            />
          }
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {PRESETS().map(p => {
              const on = preset === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => setPreset(p.key)}
                  style={[styles.chip, {
                    borderColor:     on ? theme.primary : theme.border,
                    backgroundColor: on ? theme.primary : theme.surface,
                  }]}
                >
                  <Text style={[styles.chipText, { color: on ? theme.textOnPrimary : theme.textSecond }]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {/* Period above the figure, always. A total with no dates
                over it is what these screens exist to stop. */}
            <Text style={[styles.period, { color: theme.textThird }]}>
              {periodLabel(statement?.from, statement?.to) || tx9('auto.statement.selectAPeriod', 'SELECT A PERIOD')}
            </Text>
            <Text style={[styles.heroValue, { color: theme.text }]}>{naira(totalNgn)}</Text>
            <Text style={[styles.heroSub, { color: theme.textSecond }]}>
              {tr('auto.statement.spentInThisPeriod', 'spent in this period ·')} {count} {count === 1 ? 'charge' : 'charges'}
            </Text>
          </View>

          {entries.length === 0 ? (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, padding: 20 }]}>
              <Text style={[styles.rowSub, { color: theme.textSecond }]}>
                {tr('auto.statement.nothingSettledInThisPeriod', 'Nothing settled in this period. Try a wider one.')}
              </Text>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {entries.map((e, i) => (
                <Pressable
                  key={e.id}
                  onPress={() => shareLine(e)}
                  style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}
                >
                  <Text style={[styles.date, { color: theme.textThird }]}>{dayMonth(e.date)}</Text>
                  <Text style={[styles.rowTitle, { color: theme.text, flex: 1 }]} numberOfLines={1}>
                    {e.narrative}
                  </Text>
                  <Text style={[styles.rowAmount, { color: theme.text }]}>{naira(e.amountNgn)}</Text>
                </Pressable>
              ))}
              <View style={[styles.runningRow, { borderTopColor: theme.border, backgroundColor: theme.surfaceSecond }]}>
                <Text style={[styles.runningLabel, { color: theme.textSecond }]}>{tx('auto.statement.runningTotal', 'Running total')}</Text>
                <Text style={[styles.runningValue, { color: theme.text }]}>
                  {naira(entries[entries.length - 1]?.runningTotalNgn ?? 0)}
                </Text>
              </View>
            </View>
          )}

          {entries.length > 0 && (
            <Pressable
              onPress={exportStatement}
              disabled={exporting}
              style={[styles.exportBtn, { backgroundColor: theme.primary, opacity: exporting ? 0.6 : 1 }]}
            >
              <Ionicons name="download-outline" size={16} color={theme.textOnPrimary} />
              <Text style={[styles.exportBtnText, { color: theme.textOnPrimary }]}>
                {exporting ? 'Preparing...' : tx9('auto.statement.exportThisStatement', 'Export this statement')}
              </Text>
            </Pressable>
          )}

          <Text style={[styles.footNote, { color: theme.textThird }]}>
            {tr('auto.statement.tapAnyLineForIts', 'Tap any line for its receipt. Every figure covers the period shown above it, never your whole history with SEIRS. Charges that have not settled are not counted here.')}
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1,
  },
  back:          { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { fontSize: 17, fontWeight: '700' },

  chipRow:       { gap: 8, paddingBottom: 14, paddingRight: 4 },
  chip:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipText:      { fontSize: 13, fontWeight: '600' },

  hero:          { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 14 },
  period:        { fontSize: 12, fontWeight: '700', letterSpacing: 1.1 },
  heroValue:     { fontSize: 32, fontWeight: '800', marginTop: 8, letterSpacing: -0.5 },
  heroSub:       { fontSize: 14, marginTop: 4 },

  card:          { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  row:           { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  date:          { fontSize: 12, fontWeight: '600', width: 46 },
  rowTitle:      { fontSize: 15, fontWeight: '600' },
  rowSub:        { fontSize: 13, marginTop: 2 },
  rowAmount:     { fontSize: 15, fontWeight: '700' },

  runningRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderTopWidth: 1 },
  runningLabel:  { fontSize: 13, fontWeight: '600' },
  runningValue:  { fontSize: 16, fontWeight: '800' },

  exportBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 14 },
  exportBtnText: { fontSize: 15, fontWeight: '700' },

  footNote:      { fontSize: 13, lineHeight: 17, marginTop: 14, paddingHorizontal: 4 },
});
