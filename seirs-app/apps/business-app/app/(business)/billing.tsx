/**
 * Billing: a statement, not a running tally.
 *
 * This screen led with "PAID TO SEIRS" and a lifetime figure, then
 * listed every payment ever made, flat, with no filter. Founder,
 * 2026-09-01: "from human psycology showing them how much they have
 * spend total would make they think they are spending too much, so they
 * should see the payment and be able to filter it incase the want to
 * print their invoice and a total, like a bank statement will work".
 *
 * So the hero is now the total for a period the trader picked, the
 * period is always printed above it, and there is no lifetime number on
 * the screen at all. The same figure stops reading as an accusation
 * once it is bounded by dates somebody chose.
 *
 * The old hero was also simply wrong: it counted only settled charges
 * while sitting above a list of every charge, so on the demo account it
 * read NGN 0.00 directly above NGN 75,000 of listed payments.
 *
 * Settled charges only, by founder decision the same day: "no pending
 * in statement at all". A statement shows what moved. Unsettled charges
 * keep their own section further down, which is where somebody chasing
 * a failed booking should be looking.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Share, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { paymentsApi, businessApi } from '@/services/api';
import type { BusinessStatement, StatementEntry } from '@/services/api';
import { useColors } from '@/context/ThemeContext';
import { naira as nairaFmt, nairaFromKobo } from '@/utils/money';

type Payment = {
  id: string;
  amountKobo: string | number;
  status: string;
  method?: string | null;
  purpose: string;
  providerReference?: string | null;
  createdAt?: string;
  delivery?: { trackingCode?: string } | null;
};

const naira = nairaFromKobo;

/**
 * Printing, when the native side has it.
 *
 * window.print() is a browser API and this is React Native, so the
 * printable statement goes through expo-print, which is already a
 * dependency and already used this way by the driver app's tax docs.
 *
 * Probed through requireOptionalNativeModule so an older installed APK
 * without ExpoPrint falls back to sharing the statement as text rather
 * than red-screening, which is the same guard tax-docs.tsx uses.
 */
let Print: any = null;
let Sharing: any = null;
try {
  const core = require('expo-modules-core');
  if (core?.requireOptionalNativeModule?.('ExpoPrint')) {
    Print   = require('expo-print');
    Sharing = require('expo-sharing');
  }
} catch { /* stay on the text-share fallback */ }

/**
 * Presets before pickers (spec, 2026-09-01). The founder's own example,
 * "the last two months", is a preset here rather than a date-picker
 * exercise. Custom exists for everything else.
 */
type PresetKey = 'this_month' | 'last_month' | 'last_2_months' | 'last_90' | 'custom';

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: 'this_month',    label: 'This month' },
  { key: 'last_month',    label: 'Last month' },
  { key: 'last_2_months', label: 'Last 2 months' },
  { key: 'last_90',       label: 'Last 90 days' },
  { key: 'custom',        label: 'Custom' },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth   = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

function rangeFor(preset: PresetKey, custom: { from: Date; to: Date }): { from: string; to: string } {
  const now = new Date();
  switch (preset) {
    case 'this_month':
      return { from: iso(startOfMonth(now)), to: iso(now) };
    case 'last_month': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: iso(startOfMonth(prev)), to: iso(endOfMonth(prev)) };
    }
    case 'last_2_months': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: iso(start), to: iso(now) };
    }
    case 'last_90':
      return { from: iso(new Date(now.getTime() - 90 * 24 * 3600 * 1000)), to: iso(now) };
    case 'custom':
      return { from: iso(startOfMonth(custom.from)), to: iso(endOfMonth(custom.to)) };
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "1 JUL - 31 AUG 2026". The line that must never be missing above a total. */
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

/**
 * The statement as a printable page.
 *
 * Colours here are fixed rather than themed on purpose: this renders
 * onto paper, which is white in both themes, and a dark-mode palette
 * would print as a black rectangle. Same reasoning as the driver tax
 * document.
 *
 * The period is in the heading AND above the total, because a printed
 * page outlives the screen that produced it and a bare figure on a
 * sheet of paper is exactly the lifetime-total problem again.
 *
 * Whole-month periods make this correct by construction: a page headed
 * "1 Jul to 31 Aug" cannot be a partial month somebody misreads as one.
 */
function buildStatementHtml(st: BusinessStatement): string {
  const generated = new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const rows = st.entries.map(e => `
    <tr>
      <td class="d">${dayMonth(e.date)}</td>
      <td>${escapeHtml(e.narrative)}${e.trackingCode ? `<span class="ref">${escapeHtml(e.trackingCode)}</span>` : ''}</td>
      <td class="m">${e.method ? escapeHtml(e.method) : ''}</td>
      <td class="a">${nairaFmt(e.amountNgn)}</td>
      <td class="a run">${nairaFmt(e.runningTotalNgn)}</td>
    </tr>`).join('');

  return `<html><head><meta charset="utf-8"><style>
    @page { margin: 18mm 14mm; }
    @media print { .nobreak { break-inside: avoid; } thead { display: table-header-group; } }
    body { font-family: -apple-system, Roboto, Helvetica, sans-serif; color: #111827; font-size: 12px; }
    h1 { font-size: 19px; margin: 0 0 2px; }
    .co { font-size: 13px; color: #374151; margin: 0 0 18px; }
    .period { font-size: 11px; letter-spacing: 1px; color: #6B7280; text-transform: uppercase; margin: 0 0 4px; }
    .total { font-size: 27px; font-weight: 800; margin: 0 0 2px; }
    .sub { font-size: 12px; color: #6B7280; margin: 0 0 22px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .6px;
         color: #6B7280; border-bottom: 1px solid #D1D5DB; padding: 0 0 6px; }
    td { padding: 8px 0; border-bottom: 1px solid #E5E7EB; vertical-align: top; }
    td.d { width: 62px; color: #6B7280; white-space: nowrap; }
    td.m { width: 90px; color: #6B7280; }
    td.a { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    td.a.run { color: #6B7280; width: 92px; }
    .ref { display: block; font-size: 10px; color: #9CA3AF; }
    .foot { margin-top: 22px; font-size: 10px; color: #6B7280; line-height: 1.6; }
  </style></head><body>
    <h1>Statement</h1>
    <p class="co">${escapeHtml(st.companyName ?? '')}</p>
    <p class="period">${periodLabel(st.from, st.to)}</p>
    <p class="total">${nairaFmt(st.totals.paidNgn)}</p>
    <p class="sub">paid in this period &middot; ${st.totals.entries} ${st.totals.entries === 1 ? 'charge' : 'charges'}</p>
    <table>
      <thead><tr><th>Date</th><th>Description</th><th>Paid by</th><th style="text-align:right">Amount</th><th style="text-align:right">Running</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="foot">
      Generated ${generated}. Every figure covers the period shown above and no other.
      Settled charges only: anything still unsettled is not money that has moved and is
      not counted here. Amounts include kobo so they reconcile against your bank statement.
    </p>
  </body></html>`;
}

/** A company name or address is free text and lands inside markup. */
function escapeHtml(v: string): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default function BillingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();

  const now = new Date();
  const [preset, setPreset] = useState<PresetKey>('last_2_months');
  const [custom, setCustom] = useState({
    from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    to:   new Date(now.getFullYear(), now.getMonth(), 1),
  });
  const [customOpen, setCustomOpen] = useState(false);

  const [statement, setStatement]   = useState<BusinessStatement | null>(null);
  const [payments, setPayments]     = useState<Payment[]>([]);
  const [openLine, setOpenLine]     = useState<StatementEntry | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting]   = useState(false);

  const range = useMemo(() => rangeFor(preset, custom), [preset, custom]);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([
      businessApi.statement(range.from, range.to).catch(() => null),
      paymentsApi.history().catch(() => []),
    ]);
    setStatement(s);
    setPayments(Array.isArray(p) ? p : []);
  }, [range.from, range.to]);

  useEffect(() => { setLoading(true); load().finally(() => setLoading(false)); }, [load]);

  const entries  = statement?.entries ?? [];
  const totalNgn = statement?.totals?.paidNgn ?? 0;
  const count    = statement?.totals?.entries ?? 0;

  // Unsettled charges never enter the statement, so they get their own
  // section rather than vanishing. This is the list the spec points at:
  // "where somebody chasing a failed booking should look".
  const unsettled = useMemo(
    () => payments.filter(p => p.status !== 'success' && p.purpose !== 'card_verify'),
    [payments],
  );

  const shareLine = (e: StatementEntry) => {
    const lines = [
      'SEIRS Logistics receipt',
      statement?.companyName ? `Business: ${statement.companyName}` : '',
      e.trackingCode ? `Run: ${e.trackingCode}` : '',
      `Description: ${e.narrative}`,
      `Amount: ${nairaFmt(e.amountNgn)}`,
      e.method ? `Paid by: ${e.method}` : '',
      e.reference ? `Reference: ${e.reference}` : '',
      `Date: ${fullDateTime(e.date)}`,
    ].filter(Boolean).join('\n');
    Share.share({ message: lines }).catch(() => {});
  };

  /**
   * "printable" was the other half of what the founder asked for and it
   * was nowhere: filterable landed, printable did not.
   *
   * Goes to a real print dialog and a real PDF through expo-print, so
   * he can print or save today without waiting on the server-side
   * generator. That one still lands in step 5 and is the version that
   * gets emailed, because a document generated on the server is
   * identical every time regardless of which phone asked for it.
   *
   * If the native module is missing on an older APK, the statement is
   * shared as text rather than failing: the same fallback the driver
   * tax document uses.
   */
  const exportStatement = async () => {
    if (!statement || exporting) return;
    setExporting(true);
    try {
      if (Print && Sharing) {
        try {
          const { uri } = await Print.printToFileAsync({ html: buildStatementHtml(statement) });
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `SEIRS statement ${periodLabel(statement.from, statement.to)}`,
          });
          return;
        } catch { /* fall through to the text share */ }
      }
      const lines = [
        'SEIRS Logistics statement',
        statement.companyName ? `Business: ${statement.companyName}` : '',
        `Period: ${periodLabel(statement.from, statement.to)}`,
        `Paid in this period: ${nairaFmt(statement.totals.paidNgn)}`,
        `Charges: ${statement.totals.entries}`,
        '',
        ...statement.entries.map(e =>
          `${dayMonth(e.date)}  ${e.narrative}  ${nairaFmt(e.amountNgn)}`),
        '',
        'Settled charges only. Amounts include kobo so they reconcile',
        'against your bank statement.',
      ].filter(Boolean);
      await Share.share({ message: lines.join('\n') });
    } finally {
      setExporting(false);
    }
  };

  const statusColor = (s: string) =>
    s === 'success'    ? colors.success
    : s === 'refunded' ? colors.warning
    : s === 'failed'   ? colors.error
    : colors.textThird;

  const shiftCustom = (which: 'from' | 'to', months: number) => {
    setCustom(prev => {
      const d = new Date(prev[which].getFullYear(), prev[which].getMonth() + months, 1);
      const next = { ...prev, [which]: d };
      // Keep the window the right way round without silently swallowing
      // the tap: nudge the other end rather than refusing to move.
      if (next.from > next.to) {
        if (which === 'from') next.to = new Date(d);
        else next.from = new Date(d);
      }
      return next;
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Billing &amp; Invoices</Text>
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
                  onPress={() => { setPreset(p.key); if (p.key === 'custom') setCustomOpen(true); }}
                  style={[
                    styles.chip,
                    {
                      borderColor:     on ? colors.primary : colors.border,
                      backgroundColor: on ? colors.primary : colors.surface,
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: on ? colors.textOnPrimary : colors.textSecond }]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* The period is printed ABOVE the figure, always. A total with
                no dates over it is the thing this screen exists to stop. */}
            <Text style={[styles.period, { color: colors.textThird }]}>
              {periodLabel(statement?.from, statement?.to) || 'SELECT A PERIOD'}
            </Text>
            <Text style={[styles.heroValue, { color: colors.text }]}>{nairaFmt(totalNgn)}</Text>
            <Text style={[styles.heroSub, { color: colors.textSecond }]}>
              paid in this period · {count} {count === 1 ? 'charge' : 'charges'}
            </Text>
            {preset === 'custom' && (
              <Pressable onPress={() => setCustomOpen(true)} style={styles.changeRange}>
                <Icon name="Calendar" size={14} color={colors.primary} />
                <Text style={[styles.changeRangeText, { color: colors.primary }]}>Change period</Text>
              </Pressable>
            )}
          </View>

          {entries.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 20 }]}>
              <Text style={[styles.rowSub, { color: colors.textSecond }]}>
                Nothing settled in this period. Try a wider one, or check unsettled charges below.
              </Text>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {entries.map((e, i) => (
                <Pressable
                  key={e.id}
                  onPress={() => setOpenLine(e)}
                  style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                >
                  <Text style={[styles.date, { color: colors.textThird }]}>{dayMonth(e.date)}</Text>
                  <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                    {e.narrative}
                  </Text>
                  <Text style={[styles.rowAmount, { color: colors.text }]}>{nairaFmt(e.amountNgn)}</Text>
                </Pressable>
              ))}
              <View style={[styles.runningRow, { borderTopColor: colors.border, backgroundColor: colors.surfaceSecond }]}>
                <Text style={[styles.runningLabel, { color: colors.textSecond }]}>Running total</Text>
                <Text style={[styles.runningValue, { color: colors.text }]}>
                  {nairaFmt(entries[entries.length - 1]?.runningTotalNgn ?? 0)}
                </Text>
              </View>
            </View>
          )}

          {entries.length > 0 && (
            <Pressable
              onPress={exportStatement}
              disabled={exporting}
              style={[styles.exportBtn, { backgroundColor: colors.primary, opacity: exporting ? 0.6 : 1 }]}
            >
              <Icon name="Download" size={16} color={colors.textOnPrimary} />
              <Text style={[styles.shareBtnText, { color: colors.textOnPrimary }]}>
                {exporting ? 'Preparing...' : 'Export this statement'}
              </Text>
            </Pressable>
          )}

          {unsettled.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textThird }]}>UNSETTLED CHARGES</Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {unsettled.map((p, i) => (
                  <View key={p.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                        {p.delivery?.trackingCode ?? p.providerReference ?? 'Charge'}
                      </Text>
                      <Text style={[styles.rowSub, { color: colors.textThird }]} numberOfLines={1}>
                        {dayMonth(p.createdAt)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.rowAmount, { color: colors.text }]}>{naira(p.amountKobo)}</Text>
                      <Text style={[styles.rowStatus, { color: statusColor(p.status) }]}>{p.status}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <Text style={[styles.footNote, { color: colors.textThird }]}>
                These are not in the statement above. A statement shows money that moved,
                and these have not. They stay here until they settle or are cancelled.
              </Text>
            </>
          )}

          <Text style={[styles.footNote, { color: colors.textThird }]}>
            Tap any line for its receipt. Every figure covers the period shown above it,
            never your whole history with SEIRS.
          </Text>
        </ScrollView>
      )}

      {/* One line, expanded. */}
      <Modal visible={!!openLine} transparent animationType="slide" onRequestClose={() => setOpenLine(null)}>
        <Pressable style={[styles.modalBack, { backgroundColor: colors.overlay }]} onPress={() => setOpenLine(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 20 }]}
            onPress={e => e.stopPropagation()}
          >
            {openLine && (
              <>
                <Text style={[styles.period, { color: colors.textThird }]}>
                  {openLine.reference ?? 'RECEIPT'}
                </Text>
                <Text style={[styles.heroValue, { color: colors.text }]}>{nairaFmt(openLine.amountNgn)}</Text>
                <Text style={[styles.heroSub, { color: colors.textSecond, marginBottom: 14 }]}>
                  {fullDateTime(openLine.date)}
                </Text>

                <Detail label="Status" value="Settled" valueColor={colors.success} colors={colors} />
                {/* Shown only once it is known. A row nobody told us about
                    says nothing rather than inventing a rail. */}
                {openLine.method && <Detail label="Paid by" value={openLine.method} colors={colors} />}
                {openLine.trackingCode && <Detail label="Delivery" value={openLine.trackingCode} colors={colors} />}
                <Detail label="Description" value={openLine.narrative} colors={colors} />
                {openLine.stops != null && openLine.stops > 1 && (
                  <Detail label="Stops" value={String(openLine.stops)} colors={colors} />
                )}

                <Pressable onPress={() => shareLine(openLine)} style={[styles.shareBtn, { backgroundColor: colors.primary }]}>
                  <Icon name="Share2" size={16} color={colors.textOnPrimary} />
                  <Text style={[styles.shareBtnText, { color: colors.textOnPrimary }]}>Share receipt</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Custom period. Whole months, so no date-picker dependency. */}
      <Modal visible={customOpen} transparent animationType="slide" onRequestClose={() => setCustomOpen(false)}>
        <Pressable style={[styles.modalBack, { backgroundColor: colors.overlay }]} onPress={() => setCustomOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 20 }]}
            onPress={e => e.stopPropagation()}
          >
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Choose a period</Text>
            <Text style={[styles.rowSub, { color: colors.textSecond, marginBottom: 16 }]}>
              Whole months, from the start of the first to the end of the last.
            </Text>

            <MonthStepper
              label="From" date={custom.from} colors={colors}
              onBack={() => shiftCustom('from', -1)} onNext={() => shiftCustom('from', 1)}
            />
            <MonthStepper
              label="To" date={custom.to} colors={colors}
              onBack={() => shiftCustom('to', -1)} onNext={() => shiftCustom('to', 1)}
            />

            <Pressable onPress={() => setCustomOpen(false)} style={[styles.shareBtn, { backgroundColor: colors.primary, marginTop: 18 }]}>
              <Text style={[styles.shareBtnText, { color: colors.textOnPrimary }]}>Show this period</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Detail({ label, value, valueColor, colors }: {
  label: string; value: string; valueColor?: string; colors: any;
}) {
  return (
    <View style={[styles.detailRow, { borderTopColor: colors.border }]}>
      <Text style={[styles.rowSub, { color: colors.textSecond }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: valueColor ?? colors.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function MonthStepper({ label, date, colors, onBack, onNext }: {
  label: string; date: Date; colors: any; onBack: () => void; onNext: () => void;
}) {
  return (
    <View style={[styles.stepper, { borderColor: colors.border }]}>
      <Text style={[styles.rowSub, { color: colors.textThird, width: 46 }]}>{label}</Text>
      <Pressable onPress={onBack} style={styles.stepBtn} hitSlop={8}>
        <Icon name="ChevronLeft" size={20} color={colors.primary} />
      </Pressable>
      <Text style={[styles.stepValue, { color: colors.text }]}>
        {MONTHS[date.getMonth()]} {date.getFullYear()}
      </Text>
      <Pressable onPress={onNext} style={styles.stepBtn} hitSlop={8}>
        <Icon name="ChevronRight" size={20} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1,
  },
  back:            { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle:     { fontSize: 17, fontWeight: '700' },

  chipRow:         { gap: 8, paddingBottom: 14, paddingRight: 4 },
  chip:            { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipText:        { fontSize: 13, fontWeight: '600' },

  hero:            { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 14 },
  period:          { fontSize: 12, fontWeight: '700', letterSpacing: 1.1 },
  heroValue:       { fontSize: 32, fontWeight: '800', marginTop: 8, letterSpacing: -0.5 },
  heroSub:         { fontSize: 14, marginTop: 4 },
  changeRange:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  changeRangeText: { fontSize: 13, fontWeight: '600' },

  sectionTitle:    { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginTop: 20, marginBottom: 8, marginLeft: 4 },
  card:            { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  row:             { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  date:            { fontSize: 12, fontWeight: '600', width: 46 },
  rowTitle:        { fontSize: 15, fontWeight: '600' },
  rowSub:          { fontSize: 13, marginTop: 2 },
  rowAmount:       { fontSize: 15, fontWeight: '700' },
  rowStatus:       { fontSize: 12, fontWeight: '700', marginTop: 2, textTransform: 'capitalize' },

  runningRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderTopWidth: 1 },
  runningLabel:    { fontSize: 13, fontWeight: '600' },
  runningValue:    { fontSize: 16, fontWeight: '800' },

  footNote:        { fontSize: 13, lineHeight: 17, marginTop: 14, paddingHorizontal: 4 },

  modalBack:       { flex: 1, justifyContent: 'flex-end' },
  sheet:           { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  sheetTitle:      { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  detailRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, gap: 16 },
  detailValue:     { fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  shareBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 18 },
  exportBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 14 },
  shareBtnText:    { fontSize: 15, fontWeight: '700' },

  stepper:         { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 10 },
  stepBtn:         { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepValue:       { flex: 1, fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
