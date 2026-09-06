import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator,
  Share, Modal, Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, FileText, Download, ChevronRight, Receipt, AlertCircle,
  FileSignature, Mail, ShieldCheck, File,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { savePdf } from '@seirs/shared/utils/dataExport';
import { documentToHtml } from '@seirs/shared/utils/documentPdf';
import { documentsApi, type UserDocumentDTO } from '@/services/api';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';

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

// Documents SEIRS has sent this rider: contracts, letters, notices. Their own
// earnings statements live in /(driver)/statement, split out on 2026-09-04.

export default function TaxDocsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const insets = useSafeAreaInsets();

  const [received,  setReceived]  = useState<UserDocumentDTO[]>([]);
  const [viewing,   setViewing]   = useState<UserDocumentDTO | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [loading,   setLoading]   = useState(true);

  /* taxSummary used to be fetched here and its years and months stored in
     state nothing rendered, left behind when the statements moved out. A
     round trip on every open for a result that was thrown away. */
  useEffect(() => {
    (async () => {
      try {
        const docs = await documentsApi.mine().catch(() => [] as UserDocumentDTO[]);
        setReceived(docs ?? []);
      } catch { setReceived([]); }
      finally { setLoading(false); }
    })();
  }, []);
  const openDoc = (d: UserDocumentDTO) => {
    if (d.fileUrl) { Linking.openURL(d.fileUrl); return; }
    setViewing(d);
  };

  // Share a statement: real PDF when the print module is native-present
  // (rebuild #2 APK onward), formatted text otherwise. Both routes open

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.documents.documents', 'Documents')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Official documents sent by SEIRS (contracts, letters, policies) */}
        {received.length > 0 && (
          <>
            <Text style={[styles.sectionHead, { color: theme.textSecond }]}>{tr('auto.documents.fromSeirs', 'FROM SEIRS')}</Text>
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
              <Text style={[styles.introTitle, { color: theme.text }]}>{tx('auto.documents.allYourDocumentsOnePlace', 'All your documents, one place')}</Text>
              <Text style={[styles.introSub, { color: theme.textSecond }]}>
                {tr('auto.documents.officialDocumentsFromSeirsContracts', 'Official documents from SEIRS (contracts, letters, policies) will appear here when sent to you, alongside your earnings statements below.')}
              </Text>
            </View>
          </View>
        )}

        {/* Earnings statements moved to /(driver)/statement on 3 September.
            This screen used to carry both: letters SEIRS sends the rider AND
            the rider's own monthly and yearly earnings. Its Profile row read
            "Documents - Statements, contracts, letters", which is two
            different things wearing one label. The customer app has had the
            split for a while and the driver app never got it. */}
        <View style={styles.footnote}>
          <AlertCircle size={12} color={theme.textThird} />
          <Text style={[styles.footnoteText, { color: theme.textThird }]}>
            {tr('auto.documents.contractsLettersAndNoticesSeirs', 'Contracts, letters and notices SEIRS has sent you. Your own earnings statements live under Statement, on your profile.')}
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
                disabled={pdfBusy}
                onPress={async () => {
                  if (!viewing) return;
                  setPdfBusy(true);
                  const html = documentToHtml(
                    {
                      title:      viewing.title,
                      category:   viewing.category,
                      sentByName: (viewing as any).sentByName ?? null,
                      createdAt:  viewing.createdAt,
                    },
                    viewing.body ?? '',
                  );
                  const out = await savePdf(html, viewing.title);
                  setPdfBusy(false);
                  // A text share beats a dead button: they still leave with it.
                  if (!out.ok) Share.share({ title: viewing.title, message: `${viewing.title}\n\n${viewing.body ?? ''}` }).catch(() => {});
                }}
              >
                {/* A document should BE a document. Built on the phone so it
                    covers every document SEIRS sends, not just the export. */}
                <Text style={{ color: theme.text, fontWeight: FontWeight.semibold }}>
                  {pdfBusy ? 'Making PDF...' : 'Save as PDF'}
                </Text>
              </Pressable>
              <Pressable style={[styles.docModalBtn, { backgroundColor: theme.primary }]} onPress={() => setViewing(null)}>
                <Text style={{ color: '#fff', fontWeight: FontWeight.bold }}>{tx('auto.documents.close', 'Close')}</Text>
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
  breakdown: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 10, marginTop: 4 },
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
