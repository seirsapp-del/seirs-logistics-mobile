import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { driversApi } from '@/services/api';

// Spec V8 §2.13 — Driver Premium (D35). Weekly flat fee in exchange
// for priority matching + "Verified Pro" badge + (future) commission
// swap. Charged from the SEIRS wallet on a 7-day rolling cycle.

const PERKS = [
  {
    icon:  'rocket-outline',
    title: 'Priority matching',
    body:  'You get matched first when multiple drivers qualify. Outranks a half-star rating gap.',
  },
  {
    icon:  'shield-checkmark-outline',
    title: 'Verified Pro badge',
    body:  'Customers see a badge next to your name on the rating screen.',
  },
  {
    icon:  'wallet-outline',
    title: 'Weekly billing — no surprises',
    body:  'Cancel any time before the next charge. Skipped weeks are free.',
  },
];

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:    { label: 'Active',         color: '#16A34A' },
  past_due:  { label: 'Past due',       color: '#D97706' },
  paused:    { label: 'Paused',         color: '#6B7280' },
  cancelled: { label: 'Cancelled',      color: '#6B7280' },
};

export default function SubscriptionScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const [data, setData]       = useState<{ subscription: any | null; weeklyPriceNgn: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await driversApi.getSubscription();
      setData(res);
    } catch {
      setData(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sub          = data?.subscription;
  const weeklyNgn    = data?.weeklyPriceNgn ?? 5000;
  const status       = sub?.status ?? 'none';
  const statusMeta   = STATUS_LABEL[status] ?? { label: '—', color: theme.textSecond };
  const isOn         = status === 'active' || status === 'past_due';

  const handleActivate = async () => {
    setBusy(true);
    try {
      await driversApi.activateSubscription();
      Alert.alert('Premium activated', `Your wallet will be charged ₦${weeklyNgn.toLocaleString()} every 7 days.`);
      await load();
    } catch (e: any) {
      Alert.alert('Could not activate', e?.message ?? 'Please try again.');
    } finally { setBusy(false); }
  };

  const handlePause = () => {
    Alert.alert(
      'Pause Premium?',
      'Benefits turn off immediately. No charges while paused. Re-activate any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pause', style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await driversApi.pauseSubscription();
              await load();
            } catch (e: any) {
              Alert.alert('Could not pause', e?.message ?? 'Please try again.');
            } finally { setBusy(false); }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center' }}>
        <ActivityIndicator color={theme.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>SEIRS Premium</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: '#0F2B4C' }]}>
          <View style={styles.heroIcon}>
            <Ionicons name="rocket" size={32} color="#FFBE0B" />
          </View>
          <Text style={styles.heroTitle}>SEIRS Premium</Text>
          <Text style={styles.heroSub}>For drivers who want priority + a verified badge.</Text>
          <Text style={styles.heroPrice}>₦{weeklyNgn.toLocaleString()}<Text style={styles.heroPriceSuffix}>/week</Text></Text>
        </View>

        {/* Status (only if a sub exists) */}
        {sub && (
          <View style={[styles.statusCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
            <View style={styles.statusRow}>
              <View>
                <Text style={[styles.statusLabel, { color: theme.textSecond }]}>Subscription status</Text>
                <Text style={[styles.statusValue, { color: statusMeta.color }]}>{statusMeta.label}</Text>
              </View>
              {sub.nextInvoiceAt && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.statusLabel, { color: theme.textSecond }]}>
                    {isOn ? 'Next charge' : 'Ended'}
                  </Text>
                  <Text style={[styles.statusSmall, { color: theme.text }]}>
                    {new Date(isOn ? sub.nextInvoiceAt : sub.endedAt ?? sub.nextInvoiceAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              )}
            </View>
            {sub.lastFailureReason && (
              <View style={[styles.warnRow, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                <Ionicons name="alert-circle-outline" size={14} color="#92400E" />
                <Text style={[styles.warnText, { color: '#92400E' }]}>{sub.lastFailureReason} — top up your wallet to avoid pause.</Text>
              </View>
            )}
            <Text style={[styles.statusMeta, { color: theme.textThird }]}>
              {sub.invoiceCount > 0 ? `${sub.invoiceCount} weekly charge${sub.invoiceCount === 1 ? '' : 's'} so far` : 'No charges yet'}
            </Text>
          </View>
        )}

        {/* Perks */}
        <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>What you get</Text>
        <View style={[styles.perksCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          {PERKS.map((p, i, arr) => (
            <View
              key={p.title}
              style={[
                styles.perkRow,
                i < arr.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 0.5 },
              ]}
            >
              <View style={[styles.perkIcon, { backgroundColor: theme.primary + '15' }]}>
                <Ionicons name={p.icon as any} size={18} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.perkTitle, { color: theme.text }]}>{p.title}</Text>
                <Text style={[styles.perkBody, { color: theme.textSecond }]}>{p.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Fine print */}
        <View style={[styles.fineCard, { backgroundColor: theme.surfaceSecond }]}>
          <Text style={[styles.fineText, { color: theme.textSecond }]}>
            Charged from your SEIRS wallet on a 7-day cycle. If your balance is short, we retry the next day for 3 days then auto-pause. Pause or cancel any time — you keep benefits until the current period ends.
          </Text>
        </View>

        {/* CTAs */}
        {!isOn ? (
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: theme.primary }, busy && { opacity: 0.6 }]}
            onPress={handleActivate}
            disabled={busy}
          >
            <Text style={styles.primaryBtnText}>{busy ? 'Activating…' : `Activate — ₦${weeklyNgn.toLocaleString()}/week`}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.secondaryBtn, { borderColor: '#DC2626' }, busy && { opacity: 0.6 }]}
            onPress={handlePause}
            disabled={busy}
          >
            <Text style={[styles.secondaryBtnText, { color: '#DC2626' }]}>{busy ? 'Working…' : 'Pause subscription'}</Text>
          </Pressable>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  hero:           { padding: Spacing.lg, borderRadius: Radius.xl, alignItems: 'center', gap: 4 },
  heroIcon:       { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,190,11,0.18)', justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.sm },
  heroTitle:      { color: '#fff', fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  heroSub:        { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.sm, textAlign: 'center' },
  heroPrice:      { color: '#fff', fontSize: 28, fontWeight: FontWeight.bold, marginTop: Spacing.sm },
  heroPriceSuffix:{ color: 'rgba(255,255,255,0.7)', fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  statusCard:  { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  statusRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  statusLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  statusValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, marginTop: 2 },
  statusSmall: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginTop: 2 },
  statusMeta:  { fontSize: FontSize.xs },

  warnRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1 },
  warnText: { flex: 1, fontSize: FontSize.xs, lineHeight: 18 },

  sectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, paddingLeft: Spacing.xs },
  perksCard:    { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  perkRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.md },
  perkIcon:     { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  perkTitle:    { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  perkBody:     { fontSize: FontSize.xs, lineHeight: 18, marginTop: 2 },

  fineCard: { padding: Spacing.md, borderRadius: Radius.lg },
  fineText: { fontSize: FontSize.xs, lineHeight: 18 },

  primaryBtn:     { height: 54, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  secondaryBtn:   { height: 54, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5 },
  secondaryBtnText:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
