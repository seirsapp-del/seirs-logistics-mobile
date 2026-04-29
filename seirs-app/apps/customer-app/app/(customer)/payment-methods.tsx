import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { SAVED_CARDS } from '@/constants/mockData';

export default function PaymentMethodsScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [cards, setCards] = useState(SAVED_CARDS);
  const [defaultId, setDefaultId] = useState(SAVED_CARDS.find(c => c.isDefault)?.id ?? 'card1');

  const CARD_BRAND_ICON: Record<string, string> = {
    Visa:       'card',
    Mastercard: 'card',
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Payment Methods</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Wallet balance row */}
        <View style={[styles.walletRow, { backgroundColor: isDark ? '#001020' : '#EFF6FF', borderColor: theme.primary + '40' }]}>
          <View style={[styles.walletIcon, { backgroundColor: theme.primary + '20' }]}>
            <Ionicons name="wallet-outline" size={22} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.walletLabel, { color: theme.text }]}>SEIRS Wallet</Text>
            <Text style={[styles.walletBal, { color: theme.primary }]}>₦47,500.00 available</Text>
          </View>
          <View style={[styles.defaultBadge, { backgroundColor: theme.primary }]}>
            <Text style={styles.defaultBadgeText}>Default</Text>
          </View>
        </View>

        {/* Saved cards */}
        <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>Saved Cards</Text>

        {cards.map(card => (
          <Pressable
            key={card.id}
            style={[styles.cardRow, { backgroundColor: theme.surface, borderColor: defaultId === card.id ? theme.primary : theme.border }, Shadows.xs]}
            onPress={() => setDefaultId(card.id)}
          >
            <View style={[styles.cardBrand, { backgroundColor: isDark ? '#1A1A2E' : '#EFF6FF' }]}>
              <Ionicons name="card" size={22} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardLabel, { color: theme.text }]}>{card.brand} •••• {card.last4}</Text>
              <Text style={[styles.cardExpiry, { color: theme.textSecond }]}>Expires {card.expiry}</Text>
            </View>
            <View style={styles.cardRight}>
              {defaultId === card.id && (
                <View style={[styles.defaultBadge, { backgroundColor: theme.primary }]}>
                  <Text style={styles.defaultBadgeText}>Default</Text>
                </View>
              )}
              <Pressable
                style={[styles.removeBtn, { backgroundColor: '#FEF2F2' }]}
                onPress={() => setCards(prev => prev.filter(c => c.id !== card.id))}
              >
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </Pressable>
            </View>
          </Pressable>
        ))}

        {cards.length === 0 && (
          <View style={[styles.emptyCards, { backgroundColor: theme.surface }]}>
            <Ionicons name="card-outline" size={40} color={theme.textThird} />
            <Text style={[styles.emptyText, { color: theme.textSecond }]}>No saved cards</Text>
          </View>
        )}

        {/* Other methods */}
        <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>Other Methods</Text>
        {[
          { icon: 'phone-portrait-outline', label: 'Bank Transfer (USSD)', sub: 'Pay via mobile banking', color: '#8B5CF6' },
          { icon: 'business-outline',       label: 'Bank Transfer',        sub: 'Direct bank payment',   color: '#3A86FF' },
        ].map(m => (
          <View key={m.label} style={[styles.methodRow, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
            <View style={[styles.methodIcon, { backgroundColor: m.color + '15' }]}>
              <Ionicons name={m.icon as any} size={20} color={m.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.methodLabel, { color: theme.text }]}>{m.label}</Text>
              <Text style={[styles.methodSub, { color: theme.textSecond }]}>{m.sub}</Text>
            </View>
          </View>
        ))}

        {/* Add new card */}
        <Button
          label="Add New Card"
          variant="outline"
          onPress={() => router.push('/(customer)/add-payment')}
          leftIcon={<Ionicons name="add" size={18} color={theme.primary} />}
          fullWidth
        />

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn:{ width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:  { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content:  { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xl },

  walletRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5, marginBottom: Spacing.sm },
  walletIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  walletLabel:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },
  walletBal:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginTop: 2 },

  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.sm },

  cardRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  cardBrand: { width: 44, height: 44, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  cardLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  cardExpiry:{ fontSize: FontSize.xs, marginTop: 2 },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  removeBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },

  defaultBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  defaultBadgeText:{ color: '#fff', fontSize: 10, fontWeight: FontWeight.bold },

  emptyCards:{ alignItems: 'center', gap: Spacing.sm, padding: Spacing.xl, borderRadius: Radius.xl },
  emptyText: { fontSize: FontSize.sm },

  methodRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  methodIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  methodLabel:{ fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  methodSub:  { fontSize: FontSize.xs, marginTop: 2 },
});
