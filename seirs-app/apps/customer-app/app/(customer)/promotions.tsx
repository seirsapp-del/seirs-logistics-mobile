import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { promotionsApi, type PromoDTO } from '@/services/api';

// Render the discount value as a chip label per promo type.
function promoLabel(p: PromoDTO): string {
  if (p.type === 'flat_discount') return `â‚¦${Number(p.value).toLocaleString()} off`;
  if (p.type === 'percent')       return `${Number(p.value)}% off`;
  return 'Free delivery';
}

const PROMO_GRADIENTS = [
  ['#3A86FF', '#1D6AE5'],
  ['#FF6B00', '#C2410C'],
  ['#2EC4B6', '#0D9488'],
  ['#8B5CF6', '#6D28D9'],
];

export default function PromotionsScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [copied,    setCopied]    = useState<string | null>(null);
  const [promos,    setPromos]    = useState<PromoDTO[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const items = await promotionsApi.listActive();
      setPromos(items ?? []);
    } catch {
      setPromos([]);
    }
  }, []);

  useEffect(() => {
    (async () => { await load(); setLoading(false); })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleCopy = async (code: string) => {
    try { await Clipboard.setStringAsync(code); } catch {}
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Promotions</Text>
        <Pressable onPress={() => router.push('/(customer)/promo')}>
          <Ionicons name="add" size={24} color={theme.primary} />
        </Pressable>
      </View>

      <FlatList
        data={promos}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        ListHeaderComponent={
          <View style={styles.bannerWrap}>
            <LinearGradient
              colors={['#3A86FF', '#2EC4B6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.banner}
            >
              <View style={styles.bannerContent}>
                <Text style={styles.bannerTitle}>Save on every ride</Text>
                <Text style={styles.bannerDesc}>Apply promo codes at checkout for instant discounts.</Text>
                <Pressable style={styles.bannerBtn} onPress={() => router.push('/(customer)/promo')}>
                  <Text style={styles.bannerBtnText}>Apply Code</Text>
                  <Ionicons name="arrow-forward" size={14} color="#3A86FF" />
                </Pressable>
              </View>
              <Ionicons name="ticket" size={80} color="rgba(255,255,255,0.15)" style={styles.bannerIcon} />
            </LinearGradient>
          </View>
        }
        renderItem={({ item: promo, index }) => {
          const grad = PROMO_GRADIENTS[index % PROMO_GRADIENTS.length];
          const isCopied = copied === promo.code;
          const daysLeft = Math.max(0, Math.ceil((new Date(promo.validTo).getTime() - Date.now()) / 86400000));
          return (
            <View style={[styles.promoCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
              <LinearGradient
                colors={grad as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.promoGradLeft}
              >
                <Ionicons name="ticket-outline" size={28} color="rgba(255,255,255,0.8)" />
                <Text style={styles.promoAmount}>{promoLabel(promo)}</Text>
              </LinearGradient>
              <View style={styles.promoInfo}>
                <Text style={[styles.promoDesc, { color: theme.text }]}>{promo.description ?? promo.code}</Text>
                <View style={styles.promoMeta}>
                  <View style={[styles.expiryBadge, { backgroundColor: daysLeft <= 3 ? '#FEF2F2' : isDark ? '#111' : '#F1F5F9', borderColor: daysLeft <= 3 ? '#FECACA' : theme.border }]}>
                    <Ionicons name="time-outline" size={11} color={daysLeft <= 3 ? '#EF4444' : theme.textThird} />
                    <Text style={[styles.expiryText, { color: daysLeft <= 3 ? '#EF4444' : theme.textThird }]}>
                      {daysLeft === 0 ? 'Expires today' : `${daysLeft}d left`}
                    </Text>
                  </View>
                </View>
                <Pressable
                  style={[styles.copyBtn, { borderColor: isCopied ? '#22C55E' : theme.border, backgroundColor: isCopied ? '#F0FDF4' : theme.surfaceSecond }]}
                  onPress={() => handleCopy(promo.code)}
                >
                  <Text style={[styles.codeText, { color: isCopied ? '#22C55E' : theme.primary }]}>{promo.code}</Text>
                  <Ionicons name={isCopied ? 'checkmark' : 'copy-outline'} size={13} color={isCopied ? '#22C55E' : theme.textSecond} />
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}><ActivityIndicator color={theme.primary} /></View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="ticket-outline" size={48} color={theme.textThird} />
              <Text style={[styles.emptyText, { color: theme.textSecond }]}>No active promotions</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  list: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  bannerWrap: { marginBottom: Spacing.sm },
  banner:     { borderRadius: Radius.xxl, padding: Spacing.lg, overflow: 'hidden' },
  bannerContent:{ gap: Spacing.sm, maxWidth: '75%' },
  bannerTitle:  { color: '#fff', fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  bannerDesc:   { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.sm, lineHeight: 20 },
  bannerBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full, marginTop: Spacing.xs },
  bannerBtnText:{ color: '#3A86FF', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  bannerIcon:   { position: 'absolute', right: -10, bottom: -10 },

  promoCard:    { flexDirection: 'row', borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  promoGradLeft:{ width: 80, alignItems: 'center', justifyContent: 'center', gap: 6, padding: Spacing.sm },
  promoAmount:  { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold, textAlign: 'center' },
  promoInfo:    { flex: 1, padding: Spacing.md, gap: 6 },
  promoDesc:    { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  promoMeta:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  expiryBadge:  { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: Radius.md, borderWidth: 1 },
  expiryText:   { fontSize: 10, fontWeight: FontWeight.semibold },
  copyBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: Radius.md, borderWidth: 1, alignSelf: 'flex-start' },
  codeText:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, letterSpacing: 0.5 },

  empty:     { alignItems: 'center', gap: Spacing.sm, paddingTop: Spacing.xl * 2 },
  emptyText: { fontSize: FontSize.base },
});
