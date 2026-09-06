import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput, StatusBar,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { promotionsApi, type PromoDTO } from '@/services/api';
import { useSendDraftStore } from '@/store/useSendDraftStore';
import { naira } from '@/utils/money';
import { tx } from '@/i18n/tx';

const describePromo = (p: PromoDTO) => {
  if (p.description) return p.description;
  if (p.type === 'free_delivery') return 'Free delivery on your next order';
  if (p.type === 'percent')       return `${p.value}% off your next order`;
  return `${naira(p.value)} off your next order`;
};

export default function PromoScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const { draft, ready: draftReady, patchDraft } = useSendDraftStore();

  const [code,        setCode]        = useState('');
  const [applied,     setApplied]     = useState<string | null>(null);
  const [error,       setError]       = useState('');
  const [promos,      setPromos]      = useState<PromoDTO[]>([]);
  const [listLoading, setListLoading] = useState(true);
  // Distinguishes "the list came back empty" from "the list never came
  // back": only the first is grounds for rejecting a typed code.
  const [listLoaded,  setListLoaded]  = useState(false);

  const loadPromos = () => {
    setListLoading(true);
    promotionsApi.listActive()
      .then(list => { setPromos(list); setListLoaded(true); })
      .catch(() => { setPromos([]); setListLoaded(false); })
      .finally(() => setListLoading(false));
  };

  useEffect(() => { loadPromos(); }, []);

  // Show the code the customer already accepted, so re-opening this screen
  // does not look like it forgot.
  useEffect(() => {
    if (!draftReady || !draft.promoCode) return;
    setCode(draft.promoCode);
    setApplied(draft.promoCode);
  }, [draftReady, draft.promoCode]);

  /**
   * Accept a code WITHOUT redeeming it.
   *
   * This screen used to call promotionsApi.redeem({ code, subtotalKobo: 0 }).
   * That is not a validation call: the backend redeem() persists a
   * redemption row, counts against perUserLimit and increments the
   * campaign-wide usageCount. With a subtotal of zero the discount landed
   * on nothing, so the customer spent their one allowed use to be told the
   * code was "applied", and anyone could drain a campaign's usageLimit from
   * this box without ever booking (sweep C-1.3, 2026-08-23).
   *
   * There is no validate-only endpoint and no dryRun flag today, so this
   * screen does NOT talk to the promotions API at all. It matches the code
   * against the already-fetched active list, stores it on the Send draft,
   * and send.tsx passes it to deliveriesApi.create. Redemption then happens
   * exactly once, at booking, against a real subtotal.
   *
   * BACKEND STILL REQUIRED: POST /deliveries currently has no promoCode
   * field, so the code is accepted, carried and ignored until the delivery
   * DTO reads it and calls redeem() server-side.
   */
  const handleApply = () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setError('');
    setApplied(null);

    // Only judge the code when we actually have the active list. If the
    // fetch failed we have nothing to check against, and refusing a valid
    // code because the device was offline is worse than carrying it.
    const known = promos.some(p => p.code?.toUpperCase() === trimmed);
    if (listLoaded && promos.length > 0 && !known) {
      setError('We could not find that code. Check the spelling, or pick one from the list below.');
      return;
    }

    patchDraft({ promoCode: trimmed });
    setApplied(trimmed);
  };

  const handleClear = () => {
    patchDraft({ promoCode: undefined });
    setApplied(null);
    setCode('');
    setError('');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.promo.promoCode', 'Promo Code')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={listLoading} onRefresh={loadPromos} tintColor={theme.primary} />}
      >

        {/* Input */}
        <View style={[styles.inputCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: error ? '#EF4444' : applied ? '#22C55E' : theme.border }]}>
            <Ionicons name="pricetag-outline" size={18} color={applied ? '#22C55E' : theme.textThird} />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Enter promo code"
              placeholderTextColor={theme.textThird}
              autoCapitalize="characters"
              value={code}
              onChangeText={next => {
                setCode(next.toUpperCase());
                setError('');
                // Editing an accepted code drops it from the draft too, so
                // the booking never carries a code the box no longer shows.
                if (applied) { setApplied(null); patchDraft({ promoCode: undefined }); }
              }}
            />
            {applied && <Ionicons name="checkmark-circle" size={20} color="#22C55E" />}
          </View>
          {error ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={14} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {applied ? (
            <View style={[styles.successRow, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
              <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
              {/* Deliberately does NOT say "redeemed" or name a discount
                  amount. The code is held on the draft and redeemed once,
                  at booking, against the real subtotal. */}
              <Text style={styles.successText}>{tx('auto.promo.codeSavedItGoesWith', 'Code saved. It goes with your next booking.')}</Text>
            </View>
          ) : null}
          {applied ? (
            <Button
              label="Remove code"
              variant="outline"
              onPress={handleClear}
              fullWidth
            />
          ) : (
            <Button
              label="Save Code"
              onPress={handleApply}
              disabled={!code.trim()}
              fullWidth
            />
          )}
        </View>

        {/* Available promos */}
        <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>{tx('auto.promo.availablePromos', 'Available Promos')}</Text>

        {listLoading && promos.length === 0 ? (
          <ActivityIndicator color={theme.primary} style={{ marginVertical: 24 }} />
        ) : promos.length === 0 ? (
          <View style={[styles.promoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.promoIconWrap, { backgroundColor: isDark ? '#001020' : '#EFF6FF' }]}>
              <Ionicons name="ticket-outline" size={22} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.promoLabel, { color: theme.text }]}>{tx('auto.promo.noActivePromos', 'No active promos')}</Text>
              <Text style={[styles.promoDesc, { color: theme.textSecond }]}>{tx('auto.promo.checkBackSoonNewOffers', 'Check back soon: new offers go live regularly.')}</Text>
            </View>
          </View>
        ) : promos.map(promo => (
          <Pressable
            key={promo.id}
            style={[
              styles.promoCard,
              { backgroundColor: theme.surface, borderColor: applied === promo.code ? '#22C55E' : theme.border },
              Shadows.xs,
            ]}
            onPress={() => {
              setCode(promo.code);
              setError('');
              if (applied) { setApplied(null); patchDraft({ promoCode: undefined }); }
            }}
          >
            <View style={[styles.promoIconWrap, { backgroundColor: isDark ? '#001020' : '#EFF6FF' }]}>
              <Ionicons name="ticket-outline" size={22} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.promoTop}>
                <Text style={[styles.promoLabel, { color: theme.text }]}>{describePromo(promo)}</Text>
                <View style={[styles.codePill, { backgroundColor: isDark ? '#161B22' : '#F1F5F9', borderColor: theme.border }]}>
                  <Text style={[styles.codePillText, { color: theme.primary }]}>{promo.code}</Text>
                </View>
              </View>
              {promo.description && promo.description !== describePromo(promo) && (
                <Text style={[styles.promoDesc, { color: theme.textSecond }]}>{promo.description}</Text>
              )}
              <Text style={[styles.promoExpiry, { color: theme.textThird }]}>
                Expires {new Date(promo.validTo).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            </View>
            {applied === promo.code && <Ionicons name="checkmark-circle" size={20} color="#22C55E" />}
          </Pressable>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  inputCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md, height: 52 },
  input:     { flex: 1, fontSize: FontSize.base, letterSpacing: 1, fontWeight: FontWeight.semibold },

  errorRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText:  { color: '#EF4444', fontSize: FontSize.sm },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1 },
  successText:{ color: '#22C55E', fontSize: FontSize.sm, flex: 1 },

  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },

  promoCard:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  promoIconWrap:{ width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  promoTop:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 3 },
  promoLabel:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  codePill:     { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.md, borderWidth: 1 },
  codePillText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  promoDesc:    { fontSize: FontSize.sm, marginBottom: 2 },
  promoExpiry:  { fontSize: FontSize.xs },
});
