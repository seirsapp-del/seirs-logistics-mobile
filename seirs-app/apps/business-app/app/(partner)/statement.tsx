/**
 * Partner counter earnings, as a statement.
 *
 * The backend for this has existed since 10 August and the PDF since
 * 19 August. Neither was reachable: nothing in any app referenced
 * /partner/statement with a window, and nothing referenced /statements
 * at all, so a shop asking "which packages made up my NGN 46,000" could
 * not be answered from the app and a tax filing could not be supported.
 *
 * Same shape as the business Billing screen, per the founder's decision
 * on 1 September that the statement carries across all four apps with
 * each keeping its own meaning of the word. Here the word means money
 * received, so the hero reads "earned in this period".
 *
 * Paid lines only in the statement and its total. Counter earnings that
 * are owed but not yet released are real and are shown, but below the
 * statement rather than inside it: a statement shows money that moved.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Icon } from '@/components/Icon';
import { partnerApi, statementsApi } from '@/services/api';
import type { PartnerStatement } from '@/services/api';
import { useColors } from '@/context/ThemeContext';
import { naira as nairaFmt } from '@/utils/money';

type PresetKey = 'this_month' | 'last_month' | 'last_2_months' | 'last_90';

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: 'this_month',    label: 'This month' },
  { key: 'last_month',    label: 'Last month' },
  { key: 'last_2_months', label: 'Last 2 months' },
  { key: 'last_90',       label: 'Last 90 days' },
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

/** Matches the PDF and the verification page exactly, month array included. */
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

export default function PartnerStatementScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();

  const [preset, setPreset]         = useState<PresetKey>('last_2_months');
  const [statement, setStatement]   = useState<PartnerStatement | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting]   = useState(false);

  const range = useMemo(() => rangeFor(preset), [preset]);

  const load = useCallback(async () => {
    const s = await partnerApi.statement(range.from, range.to).catch(() => null);
    setStatement(s);
  }, [range.from, range.to]);

  useEffect(() => { setLoading(true); load().finally(() => setLoading(false)); }, [load]);

  const entries = statement?.entries ?? [];
  const paid    = useMemo(() => entries.filter(e => e.settled), [entries]);
  const owed    = useMemo(() => entries.filter(e => !e.settled), [entries]);
  const paidNgn = statement?.totals?.paidNgn ?? 0;

  /**
   * Ask the server for the document. That version carries a
   * verification code a bank can check and arrives as a link somebody
   * can be emailed, which a share sheet cannot do.
   */
  const exportStatement = async () => {
    if (!statement || exporting) return;
    setExporting(true);
    try {
      const link = await statementsApi.partnerLink(range.from, range.to).catch(() => null);
      if (link?.url) {
        const opened = await Linking.openURL(link.url).then(() => true).catch(() => false);
        if (opened) return;
      }
      // No filesystem module in this app, so there is no local PDF to
      // fall back to here. Text keeps the figures moving rather than
      // leaving the button dead.
      const lines = [
        'SEIRS Logistics statement',
        statement.storeName ? `Store: ${statement.storeName}` : '',
        `Period: ${periodLabel(statement.from, statement.to)}`,
        `Earned in this period: ${nairaFmt(paidNgn)}`,
        '',
        ...paid.map(e => `${dayMonth(e.date)}  ${e.narrative}  ${nairaFmt(e.amountNgn)}`),
      ].filter(Boolean);
      await Share.share({ message: lines.join('\n') });
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Statement</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }}
              tintColor={colors.primary}
            />
          }
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {PRESETS.map(p => {
              const on = preset === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => setPreset(p.key)}
                  style={[styles.chip, {
                    borderColor:     on ? colors.primary : colors.border,
                    backgroundColor: on ? colors.primary : colors.surface,
                  }]}
                >
                  <Text style={[styles.chipText, { color: on ? colors.textOnPrimary : colors.textSecond }]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Period above the figure, always. Same rule as the other
                statements: a total with no dates over it is the thing
                these screens exist to stop. */}
            <Text style={[styles.period, { color: colors.textThird }]}>
              {periodLabel(statement?.from, statement?.to) || 'SELECT A PERIOD'}
            </Text>
            <Text style={[styles.heroValue, { color: colors.text }]}>{nairaFmt(paidNgn)}</Text>
            <Text style={[styles.heroSub, { color: colors.textSecond }]}>
              earned in this period · {paid.length} {paid.length === 1 ? 'payout' : 'payouts'}
            </Text>
          </View>

          {paid.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 20 }]}>
              <Text style={[styles.rowSub, { color: colors.textSecond }]}>
                Nothing paid out in this period. Try a wider one, or check what is still owed below.
              </Text>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {paid.map((e, i) => (
                <View key={e.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <Text style={[styles.date, { color: colors.textThird }]}>{dayMonth(e.date)}</Text>
                  <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]} numberOfLines={1}>{e.narrative}</Text>
                  <Text style={[styles.rowAmount, { color: colors.text }]}>{nairaFmt(e.amountNgn)}</Text>
                </View>
              ))}
              <View style={[styles.runningRow, { borderTopColor: colors.border, backgroundColor: colors.surfaceSecond }]}>
                <Text style={[styles.runningLabel, { color: colors.textSecond }]}>Running total</Text>
                <Text style={[styles.runningValue, { color: colors.text }]}>
                  {nairaFmt(paid[paid.length - 1]?.runningPaidNgn ?? 0)}
                </Text>
              </View>
            </View>
          )}

          {paid.length > 0 && (
            <Pressable
              onPress={exportStatement}
              disabled={exporting}
              style={[styles.exportBtn, { backgroundColor: colors.primary, opacity: exporting ? 0.6 : 1 }]}
            >
              <Icon name="Download" size={16} color={colors.textOnPrimary} />
              <Text style={[styles.exportBtnText, { color: colors.textOnPrimary }]}>
                {exporting ? 'Preparing...' : 'Export this statement'}
              </Text>
            </Pressable>
          )}

          {owed.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textThird }]}>EARNED, NOT YET PAID OUT</Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {owed.map((e, i) => (
                  <View key={e.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                    <Text style={[styles.date, { color: colors.textThird }]}>{dayMonth(e.date)}</Text>
                    <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]} numberOfLines={1}>{e.narrative}</Text>
                    <Text style={[styles.rowAmount, { color: colors.warning }]}>{nairaFmt(e.amountNgn)}</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.footNote, { color: colors.textThird }]}>
                These are not in the statement above. A statement shows money that has moved,
                and these have not reached you yet.
              </Text>
            </>
          )}

          {statement?.openingNote ? (
            <Text style={[styles.footNote, { color: colors.textThird }]}>{statement.openingNote}</Text>
          ) : null}
          <Text style={[styles.footNote, { color: colors.textThird }]}>
            Every figure covers the period shown above it. An exported statement carries a
            reference anyone can check against our records.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1,
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

  sectionTitle:  { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginTop: 20, marginBottom: 8, marginLeft: 4 },
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
