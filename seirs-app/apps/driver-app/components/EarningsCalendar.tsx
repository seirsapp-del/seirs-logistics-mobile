/**
 * Klarna-style earnings calendar (2026-08-09, founder request).
 *
 * Month grid where each day shows what the driver earned. Tapping a day
 * opens a per-trip breakdown below the grid with the day's total.
 *
 * D-9.1: the arrows do NOT scroll back through history indefinitely. This
 * component aggregates ONLY the history array it is handed (the earnings
 * screen fetches the last 50 ledger rows), so months older than that page
 * simply render empty. Paging the ledger by month needs a server endpoint.
 */
import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { naira, nairaAxis } from '@/utils/money';

interface EarningRow {
  id:            string;
  createdAt?:    string;
  earnedAt?:     string;
  deliveredAt?:  string;
  driverEarnings?: number | string;
  driverNet?:    number | string;
  amount?:       number | string;
  trackingCode?: string;
  label?:        string;
}

interface Props {
  history: EarningRow[];
  theme:   typeof Colors.light;
  /**
   * D-4.2: server-computed total for the CURRENT calendar month
   * (dashboard.month.earned). The grid can only sum the history page it was
   * handed, which disagreed with the Month tab on the same screen for any
   * busy driver. When this is provided it wins for the current month.
   */
  currentMonthTotal?: number | null;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function rowAmount(e: EarningRow): number {
  return Number(e.driverNet ?? e.driverEarnings ?? e.amount ?? 0);
}
function rowDate(e: EarningRow): Date | null {
  const raw = e.createdAt ?? e.earnedAt ?? e.deliveredAt;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
export function EarningsCalendar({ history, theme, currentMonthTotal }: Props) {
  const now = new Date();
  const [viewYear,  setViewYear]  = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selected,  setSelected]  = useState<string | null>(null);

  // Aggregate the full history once per data change: dayKey -> rows.
  const byDay = useMemo(() => {
    const map = new Map<string, EarningRow[]>();
    for (const e of history) {
      const d = rowDate(e);
      if (!d) continue;
      const k = dayKey(d);
      const arr = map.get(k) ?? [];
      arr.push(e);
      map.set(k, arr);
    }
    return map;
  }, [history]);

  const monthTotal = useMemo(() => {
    let sum = 0;
    for (const [k, rows] of byDay) {
      const [y, m] = k.split('-').map(Number);
      if (y === viewYear && m === viewMonth) {
        for (const r of rows) sum += rowAmount(r);
      }
    }
    return sum;
  }, [byDay, viewYear, viewMonth]);

  const atCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
  // Server number for this month, client sum for the months behind it.
  const headerTotal = atCurrentMonth && currentMonthTotal != null ? currentMonthTotal : monthTotal;

  const goPrev = () => {
    setSelected(null);
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const goNext = () => {
    if (atCurrentMonth) return;
    setSelected(null);
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  // Build the grid: leading blanks (Monday-first) + days of month.
  const firstOfMonth  = new Date(viewYear, viewMonth, 1);
  const daysInMonth   = new Date(viewYear, viewMonth + 1, 0).getDate();
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7; // Mon=0 ... Sun=6
  const cells: Array<{ day: number } | null> = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1 })),
  ];

  const selectedRows  = selected ? (byDay.get(selected) ?? []) : [];
  const selectedTotal = selectedRows.reduce((s, r) => s + rowAmount(r), 0);
  const selectedDay   = selected ? Number(selected.split('-')[2]) : null;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* Month header + navigation */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <CalendarDays size={16} color={theme.primary} strokeWidth={1.75} />
          <Text style={[styles.monthTitle, { color: theme.text }]}>
            {MONTHS[viewMonth]} {viewYear}
          </Text>
        </View>
        <View style={styles.navRow}>
          <Pressable onPress={goPrev} hitSlop={10} style={[styles.navBtn, { backgroundColor: theme.surfaceSecond }]}>
            <ChevronLeft size={16} color={theme.text} />
          </Pressable>
          <Pressable
            onPress={goNext}
            hitSlop={10}
            disabled={atCurrentMonth}
            style={[styles.navBtn, { backgroundColor: theme.surfaceSecond, opacity: atCurrentMonth ? 0.35 : 1 }]}
          >
            <ChevronRight size={16} color={theme.text} />
          </Pressable>
        </View>
      </View>

      <Text style={[styles.monthTotal, { color: '#16A34A' }]}>
        {naira(headerTotal)} {atCurrentMonth ? 'this month' : `in ${MONTHS[viewMonth]}`}
      </Text>

      {/* Weekday labels */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={`${w}-${i}`} style={[styles.weekday, { color: theme.textThird }]}>{w}</Text>
        ))}
      </View>

      {/* Day grid */}
      <View style={styles.grid}>
        {cells.map((cell, idx) => {
          if (!cell) return <View key={`b-${idx}`} style={styles.cellOuter} />;
          const key    = `${viewYear}-${viewMonth}-${cell.day}`;
          const rows   = byDay.get(key);
          const amount = rows ? rows.reduce((s, r) => s + rowAmount(r), 0) : 0;
          const isToday    = atCurrentMonth && cell.day === now.getDate();
          const isSelected = selected === key;
          const isFuture   = atCurrentMonth && cell.day > now.getDate();
          return (
            <View key={key} style={styles.cellOuter}>
              <Pressable
                disabled={isFuture}
                onPress={() => setSelected(isSelected ? null : key)}
                style={[
                  styles.cellBox,
                  { borderColor: theme.border, backgroundColor: theme.surfaceSecond },
                  amount > 0 && !isSelected && { backgroundColor: `${theme.primary}12`, borderColor: `${theme.primary}45` },
                  isToday && !isSelected && { borderColor: theme.primary, borderWidth: 1.5 },
                  isSelected && { backgroundColor: theme.primary, borderColor: theme.primary },
                  isFuture && { opacity: 0.3 },
                ]}
              >
                <Text style={[
                  styles.cellDay,
                  { color: isSelected ? '#fff' : theme.text },
                  isToday && !isSelected && { color: theme.primary, fontWeight: FontWeight.bold as any },
                ]}>
                  {cell.day}
                </Text>
                {/* nairaAxis, not a local rounder. The old compactNaira
                    rendered anything under a thousand as String(Math.round(n)),
                    so a day that earned 850.75 read 851 and the month total
                    above it did not add up from the squares (2026-08-23
                    sweep, kobo rule). Abbreviation above a thousand stays:
                    the exact figure is one tap away in the breakdown. */}
                {amount > 0 ? (
                  <Text style={[styles.cellAmt, { color: isSelected ? '#fff' : '#16A34A' }]} numberOfLines={1}>
                    {nairaAxis(amount)}
                  </Text>
                ) : (
                  <Text style={[styles.cellAmt, { color: 'transparent' }]}>·</Text>
                )}
              </Pressable>
            </View>
          );
        })}
      </View>

      {/* Selected-day breakdown */}
      {selected && (
        <View style={[styles.dayPanel, { borderTopColor: theme.border }]}>
          <View style={styles.dayPanelHeader}>
            <Text style={[styles.dayPanelTitle, { color: theme.text }]}>
              {selectedDay} {MONTHS[viewMonth]}
            </Text>
            <Text style={[styles.dayPanelTotal, { color: '#16A34A' }]}>
              {naira(selectedTotal)}
            </Text>
          </View>
          {selectedRows.length === 0 ? (
            <Text style={[styles.dayEmpty, { color: theme.textThird }]}>
              No earnings on this day.
            </Text>
          ) : selectedRows.map(r => (
            <View key={r.id} style={styles.dayRow}>
              <Text style={[styles.dayRowLabel, { color: theme.textSecond }]} numberOfLines={1}>
                {r.label ?? (`Trip ${r.trackingCode ?? ''}`.trim() || 'Delivery')}
              </Text>
              <Text style={[styles.dayRowAmt, { color: theme.text }]}>
                {naira(rowAmount(r))}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card:   { marginHorizontal: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  navRow:  { flexDirection: 'row', gap: 8 },
  navBtn:  { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },

  monthTotal: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any, marginTop: 4, marginBottom: Spacing.sm },

  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: FontWeight.bold as any, textTransform: 'uppercase', letterSpacing: 0.3 },

  grid:      { flexDirection: 'row', flexWrap: 'wrap' },
  cellOuter: { width: `${100 / 7}%`, padding: 2 },
  cellBox:   {
    aspectRatio: 0.82, borderWidth: 1, borderRadius: 9,
    justifyContent: 'center', alignItems: 'center', gap: 2, paddingVertical: 2,
  },
  cellDay: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  cellAmt: { fontSize: 8.5, fontWeight: FontWeight.bold as any },

  dayPanel:       { borderTopWidth: 1, marginTop: Spacing.sm, paddingTop: Spacing.sm, gap: 6 },
  dayPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  dayPanelTitle:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold as any },
  dayPanelTotal:  { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  dayEmpty:       { fontSize: FontSize.xs, paddingVertical: 4 },
  dayRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  dayRowLabel:    { flex: 1, fontSize: FontSize.xs, marginRight: 10 },
  dayRowAmt:      { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
});
