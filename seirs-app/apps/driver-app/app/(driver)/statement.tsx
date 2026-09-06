/**
 * Driver earnings statement.
 *
 * WHY THIS EXISTS SEPARATELY. The driver app had one screen, tax-docs, doing
 * two unrelated jobs: letters SEIRS sends the rider, and the rider's own
 * earnings statements. Its Profile row said "Documents · Statements,
 * contracts, letters", which is two different things wearing one label. The
 * customer app has had the split for a while (documents.tsx and
 * statement.tsx, two Profile rows); the driver app never got it.
 *
 * Modelled deliberately on the customer's statement.tsx, which the founder
 * picked as the pattern: preset chips, a hero with the period ABOVE the
 * figure, a ruled list, a running total, one export button. Same shapes and
 * the same sizes, so a rider and a sender who compare notes see one product.
 *
 * WHAT IS DIFFERENT. A sender's statement counts money going out; a rider's
 * counts money coming in. It shows what the rider earned, and nothing about
 * our cut: the rate is disclosed once in the Driver Code of Conduct, not
 * itemised on a document the rider hands to a landlord or a bank.
 *
 * The export fetches the SERVER document. That is the whole point of it: it
 * carries a /verify code anyone can check without a SEIRS account, which is
 * what makes it usable as proof of income for a landlord or a bank. The
 * shared text below is only a fallback for an unreachable server.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator,
  RefreshControl, Share, Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Download } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { earningsApi, statementsApi, type DriverEarning } from '@/services/api';
import { naira } from '@/utils/money';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';

type PresetKey = 'this_month' | 'last_month' | 'last_2_months' | 'last_90' | 'this_year' | 'last_year';

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: 'this_month',    label: 'This month' },
  { key: 'last_month',    label: 'Last month' },
  { key: 'last_2_months', label: 'Last 2 months' },
  { key: 'last_90',       label: 'Last 90 days' },
  // FIRS self-assessment is filed on a calendar year, so the year presets
  // are not a nicety: they are the reason a rider opens this screen in
  // January. The old tax-docs screen had a YEARLY (FOR FIRS) section and
  // this replaces it.
  { key: 'this_year',     label: 'This year' },
  { key: 'last_year',     label: 'Last year' },
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
    case 'this_year':
      return { from: `${now.getFullYear()}-01-01`, to: iso(now) };
    case 'last_year': {
      const y = now.getFullYear() - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
  }
}

/**
 * Matches the PDF and the verification page exactly, month array included.
 * toLocaleString is avoided on all three for the same reason the customer
 * screen avoids it: en-GB renders September with four letters and the result
 * moves with the runtime's ICU build, so a phone and a printed page could
 * disagree while somebody is holding both.
 */
function periodLabel(fromIso?: string, toIso?: string): string {
  if (!fromIso || !toIso) return '';
  const f = new Date(fromIso), t = new Date(toIso);
  const sameYear = f.getFullYear() === t.getFullYear();
  const left  = `${f.getDate()} ${MONTHS[f.getMonth()].toUpperCase()}${sameYear ? '' : ` ${f.getFullYear()}`}`;
  const right = `${t.getDate()} ${MONTHS[t.getMonth()].toUpperCase()} ${t.getFullYear()}`;
  return `${left} TO ${right}`;
}

function dayMonth(isoStr: string): string {
  const d = new Date(isoStr);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * A row that is NOT a trip.
 *
 * The clearest case is the new-rider holdback: when a payout hits the daily
 * cap, earnings.service writes the withheld remainder as a fresh row with
 * grossAmount '0' and a holdReason, because the gross was already counted on
 * the trips being paid out. Counting it again would double the gross.
 *
 * So these rows carry net and no gross, which is correct, and it is why the
 * first version of this screen showed gross minus commission failing to equal
 * net. Nothing was wrong with the arithmetic; the screen was calling a carry
 * forward a trip.
 */
function isCarryForward(e: DriverEarning): boolean {
  // Cast rather than reading a declared field: holdReason belongs on
  // DriverEarning in shared/services/api.ts, but that file currently also
  // carries another session's in-progress partner types, so committing it
  // here would take their work up under this change. GET /earnings/history
  // returns the column regardless (repo.find with no select).
  if ((e as any).holdReason) return true;
  return (Number(e.grossAmount ?? 0) || 0) === 0 && (Number(e.driverNet ?? 0) || 0) !== 0;
}

/** What a rider will recognise a line by: where it went, else the trip id. */
function narrativeFor(e: DriverEarning): string {
  if (isCarryForward(e)) return 'Carried forward';
  /* A trip that did not complete. The rider rode; somebody else ended it. */
  const st = (e as any).delivery?.status;
  if (st === 'cancelled' || st === 'failed') return 'Cancelled after you set off';
  const d = (e as any).delivery;
  const to = d?.dropoffAddress ?? d?.deliveryAddress ?? d?.destinationAddress;
  if (to) return String(to).split(',')[0];
  const code = d?.trackingCode ?? e.deliveryId;
  return code ? `Trip ${String(code).slice(-6).toUpperCase()}` : 'Trip';
}

export default function DriverStatementScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  const [preset, setPreset]         = useState<PresetKey>('last_2_months');
  const [all, setAll]               = useState<DriverEarning[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting]   = useState(false);

  const range = useMemo(() => rangeFor(preset), [preset]);

  const load = useCallback(async () => {
    const rows = await earningsApi.history().catch(() => [] as DriverEarning[]);
    setAll(Array.isArray(rows) ? rows : []);
  }, []);

  useEffect(() => { setLoading(true); load().finally(() => setLoading(false)); }, [load]);

  /* Filtered here rather than server-side because /earnings/history takes no
     range. A rider's ledger is small enough that this is honest; if it ever
     is not, the endpoint should learn from and to rather than this growing a
     pagination story. */
  const entries = useMemo(() => {
    const from = new Date(`${range.from}T00:00:00`).getTime();
    const to   = new Date(`${range.to}T23:59:59`).getTime();
    return all
      .filter(e => {
        const t = new Date(e.createdAt).getTime();
        return t >= from && t <= to;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [all, range.from, range.to]);

  const num = (v: any) => Number(v ?? 0) || 0;
  const netNgn        = entries.reduce((s, e) => s + num(e.driverNet), 0);

  const carried    = entries.filter(isCarryForward);
  const tripCount  = entries.length - carried.length;
  const carriedNgn = carried.reduce((s, e) => s + num(e.driverNet), 0);

  const exportStatement = async () => {
    if (!entries.length || exporting) return;
    setExporting(true);
    try {
      /* Do NOT swallow this. The first version caught the error and fell
         silently to sharing text, so a failed download looked like a
         deliberate choice to share a few lines: the founder tapped Export,
         got a share sheet, and no PDF ever reached the phone. If the
         document cannot be issued, say so. */
      let link: any = null;
      let why = '';
      try {
        link = await statementsApi.driverLink(range.from, range.to);
      } catch (e: any) {
        why = e?.message ?? String(e);
        console.error('[SEIRS-STATEMENT] driverLink failed:', why, JSON.stringify(e ?? {}));
      }
      if (link?.url) {
        const opened = await Linking.openURL(link.url).then(() => true).catch(() => false);
        if (opened) return;
        why = 'The link would not open on this phone.';
      }
      if (why) {
        alertDialog('Could not prepare the document',
          `${why}

Sharing the figures as text instead.`);
      }
      const lines = [
        'SEIRS Logistics - driver earnings statement',
        `Period: ${periodLabel(range.from, range.to)}`,
        `Trips: ${entries.length}`,
        `Net (yours): ${naira(netNgn)}`,
        '',
        ...entries.map(e => `${dayMonth(e.createdAt)}  ${narrativeFor(e)}  ${naira(num(e.driverNet))}`),
      ];
      await Share.share({ message: lines.join('\n') });
    } finally {
      setExporting(false);
    }
  };

  let running = 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{tx('auto.statement.earningsStatement', 'Earnings Statement')}</Text>
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
            {PRESETS.map(p => {
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
                  <Text style={[styles.chipText, { color: on ? '#fff' : theme.textSecond }]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {/* Period above the figure, always. A total with no dates over it
                is what these screens exist to stop. */}
            <Text style={[styles.period, { color: theme.textThird }]}>
              {periodLabel(range.from, range.to) || 'SELECT A PERIOD'}
            </Text>
            <Text style={[styles.heroValue, { color: theme.text }]}>{naira(netNgn)}</Text>
            <Text style={[styles.heroSub, { color: theme.textSecond }]}>
              yours in this period · {tripCount} {tripCount === 1 ? 'trip' : 'trips'}
              {carried.length > 0 ? ` · ${naira(carriedNgn)} carried forward` : ''}
            </Text>
          </View>

          {entries.length === 0 ? (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, padding: 20 }]}>
              <Text style={[styles.rowSub, { color: theme.textSecond }]}>
                Nothing settled in this period. Try a wider one.
              </Text>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {entries.map((e, i) => {
                running += num(e.driverNet);
                return (
                  <View
                    key={e.id}
                    style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}
                  >
                    <Text style={[styles.date, { color: theme.textThird }]}>{dayMonth(e.createdAt)}</Text>
                    <Text style={[styles.rowTitle, { color: theme.text, flex: 1 }]} numberOfLines={1}>
                      {narrativeFor(e)}
                    </Text>
                    <Text style={[styles.rowAmount, { color: theme.text }]}>{naira(num(e.driverNet))}</Text>
                  </View>
                );
              })}
              <View style={[styles.runningRow, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
                <Text style={[styles.runningLabel, { color: theme.textSecond }]}>{tx('auto.statement.runningTotal', 'Running total')}</Text>
                <Text style={[styles.runningValue, { color: theme.text }]}>{naira(running)}</Text>
              </View>
            </View>
          )}

          {entries.length > 0 && (
            <Pressable
              onPress={exportStatement}
              disabled={exporting}
              style={[styles.exportBtn, { backgroundColor: theme.primary, opacity: exporting ? 0.6 : 1 }]}
            >
              <Download size={16} color="#fff" />
              <Text style={styles.exportBtnText}>
                {exporting ? 'Preparing...' : 'Export this statement'}
              </Text>
            </Pressable>
          )}

          <Text style={[styles.footNote, { color: theme.textThird }]}>
            Every figure covers the period shown above it, never your whole history
            with SEIRS. Earnings still clearing are not counted here. The exported
            copy carries a code anyone can check, so it works as proof of income.
            {carried.length > 0
              ? ' Money carried forward from an earlier payout is already yours and is counted in the total above.'
              : ''}
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
  exportBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  footNote:      { fontSize: 13, lineHeight: 17, marginTop: 14, paddingHorizontal: 4 },
});
