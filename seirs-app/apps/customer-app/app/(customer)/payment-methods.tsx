import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { paymentsApi, type SavedCard } from '@/services/api';

/**
 * Payment Methods — lists Flutterwave-tokenized cards saved during prior
 * checkouts. Cards are saved via the "Save this card for next time" toggle
 * on the checkout screen, NOT via a separate "Add Card" flow (cleaner UX,
 * matches Amazon's pattern, doesn't waste Flutterwave fees on micro-charges).
 *
 * Per docs/payments-spec.md §⑤ — SEIRS does NOT hold customer money. Each
 * delivery is a one-shot Flutterwave charge against the chosen saved card.
 */
export default function PaymentMethodsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { t }  = useTranslation();

  const [cards,     setCards]     = useState<SavedCard[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await paymentsApi.listSavedCards();
      setCards(list);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load saved cards');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleSetDefault = async (id: string) => {
    try {
      await paymentsApi.setDefaultCard(id);
      setCards(cards.map(c => ({ ...c, isDefault: c.id === id })));
    } catch (e: any) {
      Alert.alert(t('paymentMethods.couldNotSetDefault'), e?.message ?? t('editProfile.tryAgain'));
    }
  };

  const handleDelete = (card: SavedCard) => {
    Alert.alert(
      `${t('paymentMethods.remove')} ${card.brand.toUpperCase()} ****${card.last4}`,
      t('paymentMethods.emptyDesc'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('paymentMethods.remove'), style: 'destructive',
          onPress: async () => {
            try {
              await paymentsApi.deleteSavedCard(card.id);
              setCards(cards.filter(c => c.id !== card.id));
            } catch (e: any) {
              Alert.alert(t('paymentMethods.couldNotRemove'), e?.message ?? t('editProfile.tryAgain'));
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t('paymentMethods.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: theme.text }]}>{error}</Text>
          <Pressable style={[styles.retryBtn, { backgroundColor: theme.primary }]} onPress={load}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : cards.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyWrap}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={[styles.iconWrap, { backgroundColor: theme.surfaceSecond }]}>
            <Ionicons name="card-outline" size={36} color={theme.primary} />
          </View>
          <Text style={[styles.emptyHeading, { color: theme.text }]}>{t('paymentMethods.empty')}</Text>
          <Text style={[styles.emptyBody, { color: theme.textSecond }]}>
            {t('paymentMethods.emptyDesc')}
          </Text>
          <Text style={[styles.emptyFootnote, { color: theme.textThird }]}>
            We never store your card number. Flutterwave handles tokenization securely.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>Saved Cards</Text>

          {cards.map(card => (
            <View
              key={card.id}
              style={[styles.cardRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <View style={[styles.brandBadge, { backgroundColor: brandColor(card.brand) }]}>
                <Text style={styles.brandBadgeText}>{card.brand.toUpperCase()}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.cardLabel, { color: theme.text }]}>
                  •••• {card.last4}
                </Text>
                <Text style={[styles.cardSub, { color: theme.textSecond }]}>
                  Expires {String(card.expMonth).padStart(2, '0')}/{String(card.expYear).slice(-2)}
                  {card.cardHolder ? ` · ${card.cardHolder}` : ''}
                </Text>
              </View>

              {card.isDefault ? (
                <View style={[styles.defaultBadge, { backgroundColor: theme.primary }]}>
                  <Text style={styles.defaultBadgeText}>{t('paymentMethods.default')}</Text>
                </View>
              ) : (
                <Pressable onPress={() => handleSetDefault(card.id)} hitSlop={8}>
                  <Text style={[styles.actionLink, { color: theme.primary }]}>{t('paymentMethods.setDefault')}</Text>
                </Pressable>
              )}

              <Pressable onPress={() => handleDelete(card)} hitSlop={8} style={{ marginLeft: 8 }}>
                <Ionicons name="trash-outline" size={18} color="#DC2626" />
              </Pressable>
            </View>
          ))}

          <View style={[styles.infoBox, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Ionicons name="lock-closed" size={14} color={theme.textSecond} />
            <Text style={[styles.infoText, { color: theme.textSecond }]}>
              Cards are securely tokenized by Flutterwave. SEIRS never sees your full card number.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function brandColor(brand: string): string {
  switch (brand.toLowerCase()) {
    case 'visa':       return '#1A1F71';
    case 'mastercard': return '#EB001B';
    case 'verve':      return '#16A34A';
    case 'amex':       return '#2E77BC';
    default:           return '#6B7280';
  }
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    flex: 1, textAlign: 'center',
    fontSize: FontSize.lg, fontWeight: FontWeight.bold,
  },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl, gap: Spacing.md,
  },
  emptyWrap: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl, gap: Spacing.md,
  },
  iconWrap: {
    width: 84, height: 84, borderRadius: 42,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyHeading: {
    fontSize: 20, fontWeight: FontWeight.bold,
  },
  emptyBody: {
    fontSize: FontSize.base, textAlign: 'center', lineHeight: 22,
  },
  emptyFootnote: {
    fontSize: FontSize.sm, textAlign: 'center', marginTop: Spacing.sm,
  },
  errorText: { fontSize: FontSize.base, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, marginTop: Spacing.md,
  },
  retryBtnText: { color: '#fff', fontWeight: FontWeight.bold },
  content: { padding: Spacing.lg, gap: Spacing.sm },
  sectionLabel: {
    fontSize: FontSize.sm, fontWeight: FontWeight.semibold,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs,
  },
  cardRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1,
  },
  brandBadge: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
  },
  brandBadgeText: {
    color: '#fff', fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 0.5,
  },
  cardLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, fontFamily: 'monospace' },
  cardSub:   { fontSize: FontSize.sm, marginTop: 2 },
  defaultBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  defaultBadgeText: { color: '#fff', fontSize: 11, fontWeight: FontWeight.bold },
  actionLink: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1,
    marginTop: Spacing.lg,
  },
  infoText: { flex: 1, fontSize: FontSize.sm, lineHeight: 18 },
});
