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
import { documentsApi, businessApi, partnerApi, type UserDocumentDTO } from '@/services/api';

const fmtNgn = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

interface SpendYear   { year: number; spentNgn: number; payments: number; toppedUpNgn: number }
interface PayoutYear  { year: number; paidNgn: number; payouts: number }

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
  const [spend,      setSpend]      = useState<{ companyName: string; years: SpendYear[] } | null>(null);
  const [payoutStmt, setPayoutStmt] = useState<{ storeName: string; years: PayoutYear[] } | null>(null);
  const [viewing,    setViewing]    = useState<UserDocumentDTO | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    // Statements fetched best-effort: sender-only accounts have no
    // partner statement and vice versa; a 403 just hides that section.
    const [d, s, p] = await Promise.all([
      documentsApi.mine().catch(() => [] as UserDocumentDTO[]),
      businessApi.statement().catch(() => null),
      partnerApi.statement().catch(() => null),
    ]);
    setDocs(d ?? []);
    setSpend(s);
    setPayoutStmt(p);
  };

  const shareSpendYear = (y: SpendYear) => {
    const lines = [
      `SEIRS Logistics - Business Spend Statement ${y.year}`,
      `Company: ${spend?.companyName ?? ''}`,
      `Generated: ${new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      '',
      `Delivery payments: ${y.payments.toLocaleString()}`,
      `Total spent:       ${fmtNgn(y.spentNgn)}`,
      `Wallet top-ups:    ${fmtNgn(y.toppedUpNgn)}`,
      '',
      'Figures aggregate your SEIRS business wallet transactions,',
      'suitable for company accounting and FIRS expense records.',
    ];
    Share.share({ title: `SEIRS spend statement ${y.year}`, message: lines.join('\n') }).catch(() => {});
  };

  const sharePayoutYear = (y: PayoutYear) => {
    const lines = [
      `SEIRS Logistics - Partner Store Payout Statement ${y.year}`,
      `Store: ${payoutStmt?.storeName ?? ''}`,
      `Generated: ${new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      '',
      `Payouts received: ${y.payouts.toLocaleString()}`,
      `Total paid out:   ${fmtNgn(y.paidNgn)}`,
      '',
      'Figures cover payouts marked paid in the SEIRS partner ledger,',
      'suitable for your business records and tax filing.',
    ];
    Share.share({ title: `SEIRS payout statement ${y.year}`, message: lines.join('\n') }).catch(() => {});
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
          ListHeaderComponent={
            <>
              {(spend?.years?.length ?? 0) > 0 && (
                <>
                  <Text style={[styles.sectionHead, { color: theme.textSecond }]}>SPEND STATEMENTS</Text>
                  {spend!.years.map(y => (
                    <Pressable key={`spend-${y.year}`} onPress={() => shareSpendYear(y)} style={[styles.row, { borderBottomColor: theme.border }]}>
                      <View style={[styles.rowIcon, { backgroundColor: theme.surfaceSecond }]}>
                        <Icon name="Receipt" size={18} color={theme.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: theme.text }]}>{y.year} spend statement</Text>
                        <Text style={[styles.rowMeta, { color: theme.textSecond }]}>
                          {y.payments} payments · {fmtNgn(y.spentNgn)} spent
                        </Text>
                      </View>
                      <Icon name="Share2" size={16} color={theme.primary} />
                    </Pressable>
                  ))}
                </>
              )}
              {(payoutStmt?.years?.length ?? 0) > 0 && (
                <>
                  <Text style={[styles.sectionHead, { color: theme.textSecond }]}>PAYOUT STATEMENTS</Text>
                  {payoutStmt!.years.map(y => (
                    <Pressable key={`payout-${y.year}`} onPress={() => sharePayoutYear(y)} style={[styles.row, { borderBottomColor: theme.border }]}>
                      <View style={[styles.rowIcon, { backgroundColor: theme.surfaceSecond }]}>
                        <Icon name="Banknote" size={18} color="#16A34A" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: theme.text }]}>{y.year} payout statement</Text>
                        <Text style={[styles.rowMeta, { color: theme.textSecond }]}>
                          {y.payouts} payouts · {fmtNgn(y.paidNgn)} received
                        </Text>
                      </View>
                      <Icon name="Share2" size={16} color="#16A34A" />
                    </Pressable>
                  ))}
                </>
              )}
              {docs.length > 0 && (
                <Text style={[styles.sectionHead, { color: theme.textSecond }]}>FROM SEIRS</Text>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Icon name="FileText" size={44} color={theme.textSecond} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No documents yet</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecond }]}>
                Contracts, official letters from SEIRS, and your statements will appear here.
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

  sectionHead: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
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
