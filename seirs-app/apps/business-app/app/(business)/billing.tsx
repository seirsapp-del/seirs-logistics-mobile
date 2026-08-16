/**
 * Billing and invoices.
 *
 * The Profile row of this name opened the Rewards screen, and there was
 * no invoices screen in the app at all: a business could not get its
 * receipts out for an accountant (founder QA 2026-08-16). Payments were
 * already recorded; nothing showed them.
 *
 * Reads /payments/history, which is the money that actually moved,
 * rather than the retired wallet ledger. Refunded charges are shown but
 * marked, because an accountant needs to see that a charge was reversed,
 * not have it quietly disappear.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { paymentsApi, businessApi } from '@/services/api';
import { useColors } from '@/context/ThemeContext';

type Payment = {
  id: string;
  amountKobo: string | number;
  status: string;
  method: string;
  purpose: string;
  providerReference?: string | null;
  createdAt?: string;
  delivery?: { trackingCode?: string } | null;
};

const naira = (kobo: string | number) =>
  `₦${Math.round(Number(kobo || 0) / 100).toLocaleString()}`;

const when = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function BillingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [statement, setStatement] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      paymentsApi.history().catch(() => []),
      businessApi.statement().catch(() => null),
    ]);
    setPayments(Array.isArray(p) ? p : []);
    setStatement(s);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  // Only settled delivery charges count as spend. Pending checkouts are
  // money that has not moved, and refunds came back.
  const paid = useMemo(
    () => payments.filter(p => p.status === 'success' && p.purpose === 'delivery'),
    [payments],
  );
  const totalPaid = useMemo(
    () => paid.reduce((sum, p) => sum + Number(p.amountKobo || 0), 0),
    [paid],
  );

  const shareReceipt = (p: Payment) => {
    const lines = [
      'SEIRS Logistics receipt',
      statement?.companyName ? `Business: ${statement.companyName}` : '',
      p.delivery?.trackingCode ? `Run: ${p.delivery.trackingCode}` : '',
      `Amount: ${naira(p.amountKobo)}`,
      `Status: ${p.status}`,
      `Method: ${p.method}`,
      p.providerReference ? `Reference: ${p.providerReference}` : '',
      p.createdAt ? `Date: ${when(p.createdAt)}` : '',
    ].filter(Boolean).join('\n');
    Share.share({ message: lines }).catch(() => {});
  };

  const statusColor = (s: string) =>
    s === 'success'  ? '#16A34A'
    : s === 'refunded' ? '#F59E0B'
    : s === 'failed'   ? '#DC2626'
    : colors.textThird;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Billing & Invoices</Text>
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
          <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.heroLabel, { color: colors.textThird }]}>PAID TO SEIRS</Text>
            <Text style={[styles.heroValue, { color: colors.text }]}>{naira(totalPaid)}</Text>
            <Text style={[styles.heroSub, { color: colors.textSecond }]}>
              {paid.length} settled {paid.length === 1 ? 'charge' : 'charges'}
              {statement?.companyName ? ` · ${statement.companyName}` : ''}
            </Text>
          </View>

          {(statement?.years ?? []).length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textThird }]}>BY YEAR</Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {statement.years.map((y: any, i: number) => (
                  <View key={y.year} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>{y.year}</Text>
                      <Text style={[styles.rowSub, { color: colors.textThird }]}>
                        {y.payments} {y.payments === 1 ? 'payment' : 'payments'}
                      </Text>
                    </View>
                    <Text style={[styles.rowAmount, { color: colors.text }]}>
                      ₦{Math.round(Number(y.spentNgn || 0)).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={[styles.sectionTitle, { color: colors.textThird }]}>PAYMENTS</Text>
          {payments.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 20 }]}>
              <Text style={[styles.rowSub, { color: colors.textSecond }]}>
                No payments yet. Every booking you pay for appears here with its receipt.
              </Text>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {payments.map((p, i) => (
                <Pressable
                  key={p.id}
                  onPress={() => shareReceipt(p)}
                  style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                      {p.delivery?.trackingCode ?? p.providerReference ?? 'Payment'}
                    </Text>
                    <Text style={[styles.rowSub, { color: colors.textThird }]} numberOfLines={1}>
                      {when(p.createdAt)}{p.method ? ` · ${p.method}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.rowAmount, { color: colors.text }]}>{naira(p.amountKobo)}</Text>
                    <Text style={[styles.rowStatus, { color: statusColor(p.status) }]}>{p.status}</Text>
                  </View>
                  <Icon name="Share2" size={15} color={colors.textThird} />
                </Pressable>
              ))}
            </View>
          )}

          <Text style={[styles.footNote, { color: colors.textThird }]}>
            Tap a payment to share its receipt. Refunded charges stay listed and
            marked, so your records show the reversal instead of a gap.
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
  back:         { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '700' },
  hero:         { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 6 },
  heroLabel:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  heroValue:    { fontSize: 30, fontWeight: '800', marginTop: 6 },
  heroSub:      { fontSize: 13, marginTop: 4 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 18, marginBottom: 8, marginLeft: 4 },
  card:         { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  row:          { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowTitle:     { fontSize: 14, fontWeight: '600' },
  rowSub:       { fontSize: 12, marginTop: 2 },
  rowAmount:    { fontSize: 14, fontWeight: '700' },
  rowStatus:    { fontSize: 11, fontWeight: '700', marginTop: 2, textTransform: 'capitalize' },
  footNote:     { fontSize: 12, lineHeight: 17, marginTop: 16, paddingHorizontal: 4 },
});
