import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator,
  Share, Modal, Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, FileText, Download, ChevronRight, Calendar, Receipt, AlertCircle,
  FileSignature, Mail, ShieldCheck, File,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { driversApi, documentsApi, statementsApi, type UserDocumentDTO } from '@/services/api';
import { naira } from '@/utils/money';

// Icon per document category (admin-sent official docs).
const DOC_ICON: Record<string, any> = {
  statement: Receipt,
  contract:  FileSignature,
  letter:    Mail,
  policy:    ShieldCheck,
  other:     File,
};

// Real PDF export when the native modules are present (rebuild #2 APK
// onward). Probed via requireOptionalNativeModule so the OLD installed
// APK, whose native side lacks ExpoPrint, falls back to text sharing
// instead of red-screening (same pattern as usePushRegistration).
let Print: any = null;
let Sharing: any = null;
try {
  const core = require('expo-modules-core');
  if (core?.requireOptionalNativeModule?.('ExpoPrint')) {
    Print   = require('expo-print');
    Sharing = require('expo-sharing');
  }
} catch { /* stay on the text-share fallback */ }

// Spec V8 §2: driver yearly earnings statements for FIRS tax filing.
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


export default function TaxDocsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const insets = useSafeAreaInsets();

  const [summaries, setSummaries] = useState<YearSummary[]>([]);
  const [months,    setMonths]    = useState<any[]>([]);
  const [received,  setReceived]  = useState<UserDocumentDTO[]>([]);
  const [viewing,   setViewing]   = useState<UserDocumentDTO | null>(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [res, docs] = await Promise.all([
          driversApi.taxSummary().catch(() => null),
          documentsApi.mine().catch(() => [] as UserDocumentDTO[]),
        ]);
        const items = res?.years ?? [];
        setSummaries(items.map((y: any) => ({
          year:          y.year,
          grossNgn:      y.grossNgn,
          commissionNgn: y.commissionNgn,
          netNgn:        y.netNgn,
          trips:         y.tripCount,
        })));
        setMonths(res?.months ?? []);
        setReceived(docs ?? []);
      } catch { setSummaries([]); }
      finally { setLoading(false); }
    })();
  }, []);

  const openDoc = (d: UserDocumentDTO) => {
    if (d.fileUrl) { Linking.openURL(d.fileUrl); return; }
    setViewing(d);
  };

  // Share a statement: real PDF when the print module is native-present
  // (rebuild #2 APK onward), formatted text otherwise. Both routes open
  // the system share sheet (email, WhatsApp, save to Drive).
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // A month shares exactly like a year: same three lines, same math.
  const handleDownloadMonth = async (m: any) => {
    const label = `${MONTH_NAMES[m.month - 1]} ${m.year}`;
    const generated = new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
    const lines = [
      `SEIRS Logistics - Driver Earnings Statement ${label}`,
      `Generated: ${generated}`,
      '',
      `Trips completed:      ${Number(m.tripCount).toLocaleString()}`,
      `Gross earnings:       ${naira(m.grossNgn)}`,
      `SEIRS commission:     ${naira(m.commissionNgn)}`,
      `Net earnings (yours): ${naira(m.netNgn)}`,
      '',
      'Figures are the canonical aggregates from the SEIRS earnings ledger.',
      'Monthly statements are for your own records; FIRS filing uses the',
      'yearly statement.',
    ];
    try {
      await Share.share({ title: `SEIRS earnings statement ${label}`, message: lines.join('\n') });
    } catch { /* dismissed */ }
  };

  const handleDownload = async (year: number) => {
    const y = summaries.find(s => s.year === year);
    if (!y) return;
    const generated = new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });

    /**
     * The SERVER document first, because it is the one that can be checked.
     *
     * A statement printed on this phone is a page of figures and nothing
     * else: a bank has no way to tell it from one somebody typed. The
     * server issues a document with a reference that anybody can verify at
     * /verify/<code> without a SEIRS account, which is the whole reason it
     * is worth having.
     *
     * The local print below stays as the fallback, unchanged, so an older
     * build or an unreachable server still produces something rather than
     * dead-ending. Same shape the business app uses.
     */
    try {
      const r: any = await statementsApi.driverLink(`${year}-01-01`, `${year}-12-31`);
      if (r?.url) {
        await Linking.openURL(r.url);
        return;
      }
    } catch {
      // Offline, an older server, or nothing to state. Fall through to the
      // on-device version rather than telling them it failed.
    }

    if (Print && Sharing) {
      try {
        const html = `
          <html><body style="font-family: -apple-system, Roboto, sans-serif; padding: 32px; color: #0E2540;">
            <h1 style="margin: 0; font-size: 22px; letter-spacing: 2px;">SEIRS</h1>
            <p style="margin: 2px 0 24px; font-size: 11px; color: #667;">SEIRS Logistics · Driver Earnings Statement</p>
            <h2 style="font-size: 16px; margin: 0 0 4px;">Statement for ${year}</h2>
            <p style="font-size: 11px; color: #667; margin: 0 0 20px;">Generated ${generated}</p>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">Trips completed</td><td style="text-align: right; border-bottom: 1px solid #e5e7eb;">${y.trips.toLocaleString()}</td></tr>
              <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">Gross earnings</td><td style="text-align: right; border-bottom: 1px solid #e5e7eb;">${naira(y.grossNgn)}</td></tr>
              <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">SEIRS commission</td><td style="text-align: right; border-bottom: 1px solid #e5e7eb;">-${naira(y.commissionNgn)}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: 700;">Net earnings</td><td style="text-align: right; font-weight: 700;">${naira(y.netNgn)}</td></tr>
            </table>
            <p style="font-size: 10px; color: #889; margin-top: 28px; line-height: 1.5;">
              Figures are the canonical aggregates from the SEIRS earnings ledger, suitable for FIRS
              self-assessment filing. Questions? Contact support in the SEIRS Driver app.
            </p>
          </body></html>`;
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `SEIRS earnings statement ${year}` });
        return;
      } catch { /* fall through to text share */ }
    }

    const lines = [
      `SEIRS Logistics - Driver Earnings Statement ${year}`,
      `Generated: ${generated}`,
      '',
      `Trips completed:      ${y.trips.toLocaleString()}`,
      `Gross earnings:       ${naira(y.grossNgn)}`,
      `SEIRS commission:     ${naira(y.commissionNgn)}`,
      `Net earnings (yours): ${naira(y.netNgn)}`,
      '',
      'Figures are the canonical aggregates from the SEIRS earnings ledger,',
      'suitable for FIRS self-assessment filing. Questions? Contact support',
      'in the SEIRS Driver app.',
    ];
    try {
      await Share.share({ title: `SEIRS earnings statement ${year}`, message: lines.join('\n') });
    } catch { /* user dismissed the share sheet */ }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Documents</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Official documents sent by SEIRS (contracts, letters, policies) */}
        {received.length > 0 && (
          <>
            <Text style={[styles.sectionHead, { color: theme.textSecond }]}>FROM SEIRS</Text>
            {received.map(d => {
              const DIcon = DOC_ICON[d.category] ?? File;
              return (
                <Pressable
                  key={d.id}
                  onPress={() => openDoc(d)}
                  style={[styles.docRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                  <View style={[styles.yearIcon, { backgroundColor: theme.primary + '15' }]}>
                    <DIcon size={18} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.yearLabel, { color: theme.text }]} numberOfLines={1}>{d.title}</Text>
                    <Text style={[styles.yearSub, { color: theme.textSecond }]}>
                      {d.category} · {new Date(d.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={theme.textThird} />
                </Pressable>
              );
            })}
          </>
        )}

        {/* No FIRS banner here (founder 2026-08-10): this hub holds ALL
            documents, not just tax ones. When nothing has been sent yet,
            say so; otherwise the hub looks statements-only. */}
        {received.length === 0 && (
          <View style={[styles.intro, { backgroundColor: theme.primary + '12' }]}>
            <FileText size={20} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.introTitle, { color: theme.text }]}>All your documents, one place</Text>
              <Text style={[styles.introSub, { color: theme.textSecond }]}>
                Official documents from SEIRS (contracts, letters, policies) will appear here when sent to you,
                alongside your earnings statements below.
              </Text>
            </View>
          </View>
        )}

        {months.length > 0 && (
          <>
            <Text style={[styles.sectionHead, { color: theme.textSecond }]}>LAST 12 MONTHS</Text>
            {months.map((m: any) => (
              <Pressable
                key={`${m.year}-${m.month}`}
                onPress={() => handleDownloadMonth(m)}
                style={[styles.docRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                <View style={[styles.yearIcon, { backgroundColor: theme.primary + '15' }]}>
                  <Receipt size={18} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.yearLabel, { color: theme.text }]}>
                    {MONTH_NAMES[m.month - 1]} {m.year}
                  </Text>
                  <Text style={[styles.yearSub, { color: theme.textSecond }]}>
                    {m.tripCount} trip{m.tripCount === 1 ? '' : 's'} · net {naira(m.netNgn)}
                  </Text>
                </View>
                <View style={[styles.shareBtn, { backgroundColor: theme.primary }]}>
                  <Download size={14} color="#fff" />
                  <Text style={styles.shareBtnText}>Share</Text>
                </View>
              </Pressable>
            ))}
          </>
        )}

        <Text style={[styles.sectionHead, { color: theme.textSecond }]}>YEARLY (FOR FIRS)</Text>

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
                {/* Explicit labeled button: the bare icon was invisible to
                    the founder in live testing 2026-08-09 */}
                <View style={[styles.shareBtn, { backgroundColor: theme.primary }]}>
                  <Download size={14} color="#fff" />
                  <Text style={styles.shareBtnText}>Share</Text>
                </View>
              </View>

              <View style={styles.breakdown}>
                <Stat label="Gross"      value={naira(y.grossNgn)}      theme={theme} />
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <Stat label="Commission" value={`-${naira(y.commissionNgn)}`} theme={theme} color="#DC2626" />
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <Stat label="Net"        value={naira(y.netNgn)}        theme={theme} color="#16A34A" />
              </View>
            </Pressable>
          ))
        )}

        <View style={styles.footnote}>
          <AlertCircle size={12} color={theme.textThird} />
          <Text style={[styles.footnoteText, { color: theme.textThird }]}>
            Statements come from your SEIRS earnings ledger and are suitable for FIRS self-assessment filing.
            Tap a year to share or save as PDF.
          </Text>
        </View>
      </ScrollView>

      {/* Inline document viewer (body-text documents) */}
      <Modal visible={!!viewing} transparent animationType="slide" onRequestClose={() => setViewing(null)}>
        <View style={styles.docModalOverlay}>
          {/* A Modal renders outside the screen's SafeAreaView, so the
              bottom inset has to be applied here or the sheet's last
              control sits under the phone's navigation bar. */}
          <View style={[
            styles.docModalCard,
            { backgroundColor: theme.surface, paddingBottom: Spacing.lg + insets.bottom },
          ]}>
            <View style={styles.docModalHandle} />
            <Text style={[styles.docModalTitle, { color: theme.text }]}>{viewing?.title}</Text>
            <Text style={[styles.docModalMeta, { color: theme.textThird }]}>
              {viewing?.category}{viewing?.sentByName ? ` · sent by ${viewing.sentByName}` : ''} ·{' '}
              {viewing ? new Date(viewing.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
            </Text>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.docModalBody, { color: theme.textSecond }]}>{viewing?.body}</Text>
            </ScrollView>
            <View style={styles.docModalBtns}>
              <Pressable
                style={[styles.docModalBtn, { backgroundColor: theme.surfaceSecond }]}
                onPress={() => { if (viewing) Share.share({ title: viewing.title, message: `${viewing.title}\n\n${viewing.body ?? ''}` }).catch(() => {}); }}
              >
                <Text style={{ color: theme.text, fontWeight: FontWeight.semibold }}>Share</Text>
              </Pressable>
              <Pressable style={[styles.docModalBtn, { backgroundColor: theme.primary }]} onPress={() => setViewing(null)}>
                <Text style={{ color: '#fff', fontWeight: FontWeight.bold }}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  shareBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  shareBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  yearLabel: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  yearSub:   { fontSize: FontSize.xs, marginTop: 2 },
  breakdown: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 10, paddingVertical: 10, marginTop: 4 },
  divider:   { width: 1, alignSelf: 'stretch' },

  footnote:  { flexDirection: 'row', gap: 6, alignItems: 'flex-start', paddingHorizontal: 4, marginTop: Spacing.sm },

  sectionHead: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.8, marginTop: Spacing.xs },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },

  docModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  docModalCard:    { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.sm },
  docModalHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D1D6', alignSelf: 'center', marginBottom: Spacing.xs },
  docModalTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  docModalMeta:    { fontSize: FontSize.xs },
  docModalBody:    { fontSize: FontSize.sm, lineHeight: 21, paddingVertical: Spacing.sm },
  docModalBtns:    { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  docModalBtn:     { flex: 1, height: 46, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  footnoteText: { flex: 1, fontSize: FontSize.xs, lineHeight: 17 },
});
