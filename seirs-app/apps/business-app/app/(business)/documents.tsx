/**
 * Business/partner Documents hub (founder direction 2026-08-09):
 * official documents sent by SEIRS admin (contracts, partner agreements,
 * letters, policies). Restrained visual style per the business-app gold
 * standard. Inline body docs open in a sheet; file docs open in browser.
 */
import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar,
  RefreshControl, ActivityIndicator, Modal, ScrollView, Share, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { documentsApi, type UserDocumentDTO } from '@/services/api';

const DOC_ICON: Record<string, string> = {
  statement: 'Receipt',
  contract:  'FileSignature',
  letter:    'Mail',
  policy:    'ShieldCheck',
  other:     'File',
};

export default function BusinessDocumentsScreen() {
  const router     = useRouter();
  const { isDark } = useTheme();
  const theme      = Colors[isDark ? 'dark' : 'light'];

  const [docs,       setDocs]       = useState<UserDocumentDTO[]>([]);
  const [viewing,    setViewing]    = useState<UserDocumentDTO | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try { setDocs(await documentsApi.mine()); } catch { setDocs([]); }
  };

  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openDoc = (d: UserDocumentDTO) => {
    if (d.fileUrl) { Linking.openURL(d.fileUrl); return; }
    setViewing(d);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Back">
          <Icon name="ArrowLeft" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Documents</Text>
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
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Icon name="FileText" size={44} color={theme.textSecond} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No documents yet</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecond }]}>
                Contracts, statements, and official letters from SEIRS will appear here.
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
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
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
                onPress={() => { if (viewing) Share.share({ title: viewing.title, message: `${viewing.title}\n\n${viewing.body ?? ''}` }).catch(() => {}); }}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>Share</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: theme.primary }]} onPress={() => setViewing(null)}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1 },
  rowIcon:  { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowMeta:  { fontSize: 12, marginTop: 2, textTransform: 'capitalize' },

  emptyWrap:  { alignItems: 'center', paddingHorizontal: 40, paddingTop: 90, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptyBody:  { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard:    { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, gap: 8 },
  modalHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D1D6', alignSelf: 'center', marginBottom: 6 },
  modalTitle:   { fontSize: 17, fontWeight: '700' },
  modalMeta:    { fontSize: 11, textTransform: 'capitalize' },
  modalBody:    { fontSize: 13, lineHeight: 20, paddingVertical: 10 },
  modalBtns:    { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalBtn:     { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
