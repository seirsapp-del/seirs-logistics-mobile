import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { MOCK_PROMOS } from '@/constants/mockData';

export default function PromoScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [code,    setCode]    = useState('');
  const [applied, setApplied] = useState<string | null>(null);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleApply = () => {
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    setTimeout(() => {
      const match = MOCK_PROMOS.find(p => p.code.toUpperCase() === code.trim().toUpperCase());
      if (match) {
        setApplied(match.code);
        setError('');
      } else {
        setError('Invalid or expired promo code.');
      }
      setLoading(false);
    }, 900);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Promo Code</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

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
              onChangeText={t => { setCode(t.toUpperCase()); setError(''); setApplied(null); }}
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
              <Text style={styles.successText}>Promo applied! Discount will show at checkout.</Text>
            </View>
          ) : null}
          <Button
            label={applied ? 'Applied!' : 'Apply Code'}
            onPress={handleApply}
            loading={loading}
            disabled={!code.trim() || !!applied}
            fullWidth
          />
        </View>

        {/* Available promos */}
        <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>Available Promos</Text>

        {MOCK_PROMOS.map(promo => (
          <Pressable
            key={promo.id}
            style={[
              styles.promoCard,
              { backgroundColor: theme.surface, borderColor: applied === promo.code ? '#22C55E' : theme.border },
              Shadows.xs,
            ]}
            onPress={() => { setCode(promo.code); setApplied(null); setError(''); }}
          >
            <View style={[styles.promoIconWrap, { backgroundColor: isDark ? '#001020' : '#EFF6FF' }]}>
              <Ionicons name="ticket-outline" size={22} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.promoTop}>
                <Text style={[styles.promoLabel, { color: theme.text }]}>{promo.label}</Text>
                <View style={[styles.codePill, { backgroundColor: isDark ? '#111' : '#F1F5F9', borderColor: theme.border }]}>
                  <Text style={[styles.codePillText, { color: theme.primary }]}>{promo.code}</Text>
                </View>
              </View>
              <Text style={[styles.promoDesc, { color: theme.textSecond }]}>{promo.desc}</Text>
              <Text style={[styles.promoExpiry, { color: theme.textThird }]}>
                Expires {new Date(promo.expiry).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
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
