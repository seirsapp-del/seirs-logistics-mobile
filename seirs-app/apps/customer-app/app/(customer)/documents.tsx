/**
 * Customer Documents hub, ported from the business app's (founder
 * 2026-08-22: "business has the best document design... decide if the
 * customers app needs it" - it does: admin can send any user a
 * contract or letter, and until now a customer had nowhere to open
 * it). Same restrained rows, same inline-body sheet; file docs open in
 * the browser.
 */
import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar,
  RefreshControl, ActivityIndicator, Modal, ScrollView, Share, Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { savePdf } from '@seirs/shared/utils/dataExport';
import { documentToHtml } from '@seirs/shared/utils/documentPdf';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { documentsApi, type UserDocumentDTO } from '@/services/api';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';

const DOC_ICON: Record<string, string> = {
  statement: 'Receipt',
  contract:  'FileSignature',
  letter:    'Mail',
  policy:    'ShieldCheck',
  other:     'File',
};

export default function CustomerDocumentsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const isDark = cs === 'dark';
  const theme  = Colors[cs ?? 'light'];
  const insets = useSafeAreaInsets();

  const [docs,       setDocs]       = useState<UserDocumentDTO[]>([]);
  const [viewing,    setViewing]    = useState<UserDocumentDTO | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const d = await documentsApi.mine().catch(() => [] as UserDocumentDTO[]);
    setDocs(d ?? []);
  };

  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openDoc = (d: UserDocumentDTO) => {
    if (d.fileUrl) { Linking.openURL(d.fileUrl); return; }
    setViewing(d);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel={tx('auto.documents.back', 'Back')}>
          <Icon name="ArrowLeft" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{tx('auto.documents.documents', 'Documents')}</Text>
        <View style={{ width: 20 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator color={theme.primary} /></View>
      ) : (
        <FlatList
          data={docs}
          keyExtractor={d => d.id}
          contentContainerStyle={{ paddingVertical: 4, flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
          }
          ListHeaderComponent={
            docs.length > 0
              ? <Text style={[styles.sectionHead, { color: theme.textSecond }]}>{tr('auto.documents.fromSeirs', 'FROM SEIRS')}</Text>
              : null
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Icon name="FileText" size={44} color={theme.textSecond} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{tx('auto.documents.noDocumentsYet', 'No documents yet')}</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecond }]}>
                {tr('auto.documents.officialLettersAndDocumentsFrom', 'Official letters and documents from SEIRS will appear here.')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openDoc(item)}
              style={[styles.row, { borderBottomColor: theme.border }]}
            >
              <View style={[styles.rowIcon, { backgroundColor: theme.surfaceSecond }]}>
                <Icon name={(DOC_ICON[item.category] ?? 'File') as any} size={18} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[styles.rowMeta, { color: theme.textSecond }]}>
                  {item.category} · {new Date(item.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              </View>
              <Icon name="ChevronRight" size={16} color={theme.textSecond} />
            </Pressable>
          )}
        />
      )}

      <Modal visible={!!viewing} transparent animationType="slide" onRequestClose={() => setViewing(null)}>
        <View style={styles.modalOverlay}>
          {/* insets.bottom measures 0 on this Android 3-button nav bar, so
              the raw value left the Share/Close row 20px off the physical
              edge with the nav bar over it. Same hard floor the Send CTA
              and onboarding use (2026-08-23 sweep, C-4.6). */}
          <View style={[
            styles.modalCard,
            { backgroundColor: theme.surface, paddingBottom: 20 + Math.max(insets.bottom, 24) },
          ]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>{viewing?.title}</Text>
            <Text style={[styles.modalMeta, { color: theme.textSecond }]}>
              {viewing?.category}{viewing?.sentByName ? ` · sent by ${viewing.sentByName}` : ''} ·{' '}
              {viewing ? new Date(viewing.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
            </Text>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalBody, { color: theme.textSecond }]}>{viewing?.body}</Text>
            </ScrollView>
            <View style={styles.modalBtns}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: theme.surfaceSecond }]}
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
                  if (!out.ok) {
                    // Falling back to a text share beats a dead button: the
                    // person still leaves with their document.
                    Share.share({ title: viewing.title, message: `${viewing.title}\n\n${viewing.body ?? ''}` }).catch(() => {});
                  }
                }}
              >
                {/*
                  A document should BE a document (founder 2026-09-05,
                  looking at his own data export rendered as text in a
                  modal). Built on the phone, not the server, so it covers
                  EVERY document on this shelf, which is where SEIRS sends
                  people things, and so a person's full record never
                  becomes a forwardable URL.
                */}
                <Text style={{ color: theme.text, fontWeight: '600' }}>
                  {pdfBusy ? 'Making PDF...' : 'Save as PDF'}
                </Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: theme.primary }]} onPress={() => setViewing(null)}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{tx('auto.documents.close', 'Close')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Style values verbatim from the business Documents hub.
const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  sectionHead: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1 },
  rowIcon:  { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowMeta:  { fontSize: 13, marginTop: 2, textTransform: 'capitalize' },

  emptyWrap:  { alignItems: 'center', paddingHorizontal: 40, paddingTop: 90, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptyBody:  { fontSize: 14, textAlign: 'center', lineHeight: 18 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard:    { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, gap: 8 },
  modalHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D1D6', alignSelf: 'center', marginBottom: 6 },
  modalTitle:   { fontSize: 17, fontWeight: '700' },
  modalMeta:    { fontSize: 12, textTransform: 'capitalize' },
  modalBody:    { fontSize: 14, lineHeight: 20, paddingVertical: 10 },
  modalBtns:    { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalBtn:     { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
