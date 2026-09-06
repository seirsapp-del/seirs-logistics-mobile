import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { partnerApi } from '@/services/api';
import { tint } from '@/constants/tint';
import { useColors, useTheme } from '@/context/ThemeContext';
import { naira } from '@/utils/money';

import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';
// Spec V8 §4.11: partner sponsored-placement billing view. Live monthly
// fee is read from the Fee Catalogue (admin-editable, propagates within
// 60s) so the displayed price always matches what would actually be
// charged.
//
// Recurring billing is NOT wired yet: activating records an invoice and
// charges no card. The benefits list used to claim "Auto-billed monthly
// via Flutterwave" alongside the dialog saying nothing is charged, which
// is the kind of contradiction a partner discovers at invoice time
// (B-9.2). The list now describes what actually happens.


export default function PartnerBillingScreen() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();

  const [monthlyPrice, setMonthlyPrice] = useState<number | null>(null);
  const [sponsorship,  setSponsorship]  = useState<any>(null);
  const [loading,      setLoading]      = useState(true);
  const [busy,         setBusy]         = useState(false);

  const active = sponsorship?.status === 'active';
  // Kobo is the stored unit; the naira figure keeps its decimals so the
  // partner's invoice matches what actually left their account.
  const lastInvoicedNgn = sponsorship?.lastInvoicedFeeKobo != null
    ? Number(sponsorship.lastInvoicedFeeKobo) / 100
    : 0;

  const load = useCallback(async () => {
    try {
      const res = await partnerApi.sponsorship.me();
      setMonthlyPrice(res?.monthlyPriceNgn ?? null);
      setSponsorship(res?.sponsorship ?? null);
    } catch (e: any) {
      // Don't blow up if the partner store isn't fully provisioned;
      // the screen still renders with a "-" price.
      setMonthlyPrice(null);
      setSponsorship(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = (next: boolean) => {
    if (next) {
      alertDialog(
        'Activate Sponsored Placement',
        `Your store will appear pinned at the top of the customer map.\n\nMonthly fee: ${monthlyPrice != null ? naira(monthlyPrice) : '-'}.\n\nFlutterwave recurring billing is being wired in Phase 2 payments: for now the invoice is recorded but no card is charged. Pause anytime, no contract.`,
        [
          { text: tr('auto.payoutAccount.cancel', 'Cancel'), style: 'cancel' },
          { text: tr('auto.billing.activate', 'Activate'), onPress: async () => {
            setBusy(true);
            try { await partnerApi.sponsorship.activate(); await load(); }
            catch (e: any) { alertDialog('Could not activate', e?.message ?? 'Try again.'); }
            finally { setBusy(false); }
          } },
        ],
      );
    } else {
      alertDialog(
        'Pause Sponsored Placement',
        'Your store will return to standard map ranking. No further monthly invoices until you reactivate.',
        [
          { text: tr('auto.payoutAccount.cancel', 'Cancel'), style: 'cancel' },
          { text: tr('auto.billing.pause', 'Pause'), style: 'destructive', onPress: async () => {
            setBusy(true);
            try { await partnerApi.sponsorship.pause(); await load(); }
            catch (e: any) { alertDialog('Could not pause', e?.message ?? 'Try again.'); }
            finally { setBusy(false); }
          } },
        ],
      );
    }
  };

  // Spend is live (last invoiced amount). Impressions and click-throughs
  // are NOT: they were literal 0 in both branches while the page sold a
  // "live dashboard updated daily", so a paying partner read a permanent
  // 0/0 ROI panel with no explanation (B-2.1). They render as a dash with
  // a note until the placement_impressions table exists.
  const IMPRESSIONS_TRACKED = false;
  const stats = { monthSpend: active ? lastInvoicedNgn : 0 };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.surface }]}>
          <Icon name="ArrowLeft" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>{tx('auto.billing.sponsoredPlacement', 'Sponsored Placement')}</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Brand-navy hero stays constant */}
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Icon name="TrendingUp" size={20} color="#fff" />
        </View>
        <Text style={styles.heroTitle}>{tx('auto.billing.beTheFirstStoreCustomers', 'Be the first store customers see')}</Text>
        <Text style={styles.heroSub}>
          {tr('auto.billing.sponsoredStoresAppearPinnedAt', 'Sponsored stores appear pinned at the top of the customer map and in the drop-off picker: significantly more drop-offs and impressions per week.')}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.cardTopRow}>
          <Text style={[styles.cardLabel, { color: colors.textSecond }]}>{tr('auto.billing.yourPlan', 'YOUR PLAN')}</Text>
          {/* Active used a 9% green alpha while inactive used a theme
              token, so the two states were not even the same weight, and
              the active one read 2.96:1 in light mode (2026-08-24). */}
          <View style={[styles.statusChip, { backgroundColor: active ? tint('green', isDark).bg : colors.surfaceSecond }]}>
            <View style={[styles.statusDot, { backgroundColor: active ? tint('green', isDark).fg : colors.textThird }]} />
            <Text style={[styles.statusText, { color: active ? tint('green', isDark).fg : colors.textSecond }]}>
              {active ? tx9('auto.tabsIndex.active', 'Active') : tx9('auto.billing.inactive', 'Inactive')}
            </Text>
          </View>
        </View>

        <Text style={[styles.planName, { color: colors.text }]}>{tx('auto.billing.sponsoredPlacement', 'Sponsored Placement')}</Text>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
        ) : monthlyPrice != null ? (
          <Text style={[styles.planPrice, { color: colors.text }]}>
            {naira(monthlyPrice)}<Text style={[styles.planPriceSecond, { color: colors.textSecond }]}> /month</Text>
          </Text>
        ) : (
          <Text style={[styles.planPrice, { color: colors.text }]}>{tx('auto.billing.priceUnavailable', 'Price unavailable')}</Text>
        )}

        <Text style={[styles.planSub, { color: colors.textSecond }]}>
          {tr('auto.billing.pinnedAtTopOfCustomer', 'Pinned at top of customer map · Featured in drop-off picker · Priority in search results')}
        </Text>

        <View style={[styles.toggleRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.toggleLabel, { color: colors.text }]}>{active ? tx9('auto.tabsIndex.active', 'Active') : tx9('auto.billing.activatePlacement', 'Activate placement')}</Text>
          {busy ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Switch
              value={active}
              onValueChange={handleToggle}
              disabled={loading}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
          )}
        </View>
      </View>

      <View style={[styles.statsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.statsTitle, { color: colors.text }]}>{tx('auto.billing.thisMonth', 'This Month')}</Text>
        <View style={[styles.statsRow, { backgroundColor: colors.surfaceSecond }]}>
          <Stat label={tx('auto.billing.impressions', 'Impressions')}     value={IMPRESSIONS_TRACKED ? '0' : '-'} />
          <View style={[styles.statsDivider, { backgroundColor: colors.border }]} />
          <Stat label={tx('auto.billing.clickThroughs', 'Click-throughs')}  value={IMPRESSIONS_TRACKED ? '0' : '-'} />
          <View style={[styles.statsDivider, { backgroundColor: colors.border }]} />
          <Stat label={tx('auto.billing.spend', 'Spend')}           value={naira(stats.monthSpend)} />
        </View>
        {!IMPRESSIONS_TRACKED && (
          <Text style={[styles.statsHint, { color: colors.textThird }]}>
            {tr('auto.billing.impressionAndClickThroughTracking', 'Impression and click-through tracking ships with the placement metrics table. Spend is live.')}
          </Text>
        )}
        {!active && (
          <Text style={[styles.statsHint, { color: colors.textThird }]}>
            {tr('auto.billing.activateToStartCollectingPlacement', 'Activate to start collecting placement metrics.')}
          </Text>
        )}
      </View>

      <View style={[styles.benefitsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.benefitsTitle, { color: colors.text }]}>{tr('auto.billing.whatSIncluded', 'What\'s included')}</Text>
        {[
          { icon: 'MapPin',     text: tr('auto.billing.topPinnedSpotOnCustomer', 'Top-pinned spot on customer map within your service area') },
          { icon: 'Search',     text: tr('auto.billing.featuredFirstInStorePicker', 'Featured first in store-picker results when customers schedule drop-offs') },
          { icon: 'BarChart3',  text: tr('auto.billing.impressionAndClickThroughReporting', 'Impression and click-through reporting once metrics tracking ships') },
          { icon: 'CreditCard', text: tr('auto.billing.invoicedMonthlySettledThroughFlutterwave', 'Invoiced monthly, settled through Flutterwave: pause anytime, no contract') },
        ].map(b => (
          <View key={b.text} style={styles.benefitRow}>
            <View style={[styles.benefitIcon, { backgroundColor: colors.accent + '18' }]}>
              <Icon name={b.icon as any} size={14} color={colors.accent} />
            </View>
            <Text style={[styles.benefitText, { color: colors.textSecond }]}>{b.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footnote}>
        <Icon name="Info" size={12} color={colors.textThird} />
        <Text style={[styles.footnoteText, { color: colors.textThird }]}>
          {tr('auto.billing.pricingReadLiveFromThe', 'Pricing read live from the SEIRS Fee Catalogue. Changes propagate within 60s.')}
        </Text>
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecond }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content:    { padding: 16, gap: 16 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:    { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: 18, fontWeight: '700' },

  hero:       { backgroundColor: '#0F2B4C', borderRadius: 16, padding: 20, gap: 8, alignItems: 'flex-start' },
  heroIcon:   { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  heroTitle:  { color: '#fff', fontSize: 18, fontWeight: '700' },
  heroSub:    { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 18 },

  card:       { borderRadius: 16, padding: 16, gap: 8, borderWidth: 1 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel:  { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },

  planName:      { fontSize: 16, fontWeight: '700', marginTop: 4 },
  planPrice:     { fontSize: 28, fontWeight: '800' },
  planPriceSecond:{ fontSize: 15, fontWeight: '600' },
  planSub:       { fontSize: 13, lineHeight: 18 },

  toggleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 12, borderTopWidth: 1 },
  toggleLabel:{ fontSize: 15, fontWeight: '600' },

  statsCard:  { borderRadius: 16, padding: 16, gap: 12, borderWidth: 1 },
  statsTitle: { fontSize: 14, fontWeight: '700' },
  statsRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingVertical: 12 },
  statsDivider:{ width: 1, alignSelf: 'stretch' },
  statItem:   { flex: 1, alignItems: 'center', gap: 4 },
  statValue:  { fontSize: 16, fontWeight: '700' },
  statLabel:  { fontSize: 11, fontWeight: '600' },
  statsHint:  { fontSize: 12, textAlign: 'center' },

  benefitsCard: { borderRadius: 16, padding: 16, gap: 10, borderWidth: 1 },
  benefitsTitle:{ fontSize: 14, fontWeight: '700' },
  benefitRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon:  { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  benefitText:  { flex: 1, fontSize: 14, lineHeight: 18 },

  footnote:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  footnoteText:{ fontSize: 12, flex: 1, lineHeight: 15 },
});
