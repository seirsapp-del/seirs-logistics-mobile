import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { MOCK_VEHICLES } from '@/constants/mockData';

export default function VehicleSelectScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { t }   = useTranslation();
  const params  = useLocalSearchParams<{ pickup: string; dropoff: string; preselect?: string }>();

  const [selected, setSelected] = useState(params.preselect ?? 'economy');

  const selectedVehicle = MOCK_VEHICLES.find(v => v.id === selected) ?? MOCK_VEHICLES[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t('vehicleSelect2.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Route summary */}
      <View style={[styles.routeCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
        <View style={styles.routeRow}>
          <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
          <Text style={[styles.routeText, { color: theme.text }]} numberOfLines={1}>{params.pickup}</Text>
        </View>
        <View style={[styles.routeLine, { backgroundColor: theme.border }]} />
        <View style={styles.routeRow}>
          <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
          <Text style={[styles.routeText, { color: theme.text }]} numberOfLines={1}>{params.dropoff}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>{t('vehicleSelect2.availableVehicles')}</Text>

        {MOCK_VEHICLES.map((v) => {
          const isSelected = selected === v.id;
          return (
            <Pressable
              key={v.id}
              style={[
                styles.card,
                {
                  backgroundColor: theme.surface,
                  borderColor: isSelected ? theme.primary : theme.border,
                },
                isSelected && { backgroundColor: isDark ? '#0A0A0A' : '#F0F7FF' },
                Shadows.sm,
              ]}
              onPress={() => setSelected(v.id)}
            >
              {/* Left — icon */}
              <View style={[styles.iconWrap, {
                backgroundColor: isSelected
                  ? (isDark ? '#1A0C00' : '#DBEAFE')
                  : theme.surfaceSecond,
              }]}>
                <Ionicons name={v.icon as any} size={28} color={isSelected ? theme.primary : theme.textSecond} />
              </View>

              {/* Middle — info */}
              <View style={styles.cardInfo}>
                <Text style={[styles.cardLabel, { color: theme.text }]}>{v.label}</Text>
                <Text style={[styles.cardDesc, { color: theme.textSecond }]}>{v.description}</Text>
                <View style={styles.featuresRow}>
                  {v.features.map((f) => (
                    <View key={f} style={[styles.featurePill, { backgroundColor: theme.surfaceSecond }]}>
                      <Text style={[styles.featureText, { color: theme.textSecond }]}>{f}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Right — price + ETA */}
              <View style={styles.cardRight}>
                <Text style={[styles.price, { color: isSelected ? theme.primary : theme.text }]}>
                  {v.priceLabel}
                </Text>
                <View style={styles.etaRow}>
                  <Ionicons name="time-outline" size={12} color={theme.textSecond} />
                  <Text style={[styles.eta, { color: theme.textSecond }]}>{v.eta}</Text>
                </View>
                {isSelected && (
                  <View style={[styles.checkWrap, { backgroundColor: theme.primary }]}>
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Fixed CTA */}
      <View style={[styles.cta, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <View style={styles.ctaSummary}>
          <Text style={[styles.ctaLabel, { color: theme.textSecond }]}>{t('vehicleSelect2.selected')}</Text>
          <Text style={[styles.ctaValue, { color: theme.text }]}>{selectedVehicle.label} · {selectedVehicle.priceLabel}</Text>
        </View>
        <Button
          label={t('fareBreakdown2.title')}
          onPress={() => router.push({
            pathname: '/(customer)/fare-breakdown',
            params: { pickup: params.pickup, dropoff: params.dropoff, vehicleId: selected },
          })}
          size="lg"
          rightIcon={<Ionicons name="arrow-forward" size={18} color="#fff" />}
          style={{ flex: 1 }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.semibold },

  routeCard: {
    marginHorizontal: Spacing.md, marginVertical: Spacing.sm,
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
  },
  routeRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot:       { width: 10, height: 10, borderRadius: 5 },
  routeText: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  routeLine: { width: 1.5, height: 12, marginLeft: 4, marginVertical: 3 },

  list:         { padding: Spacing.md },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginBottom: Spacing.md },

  card:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5, marginBottom: Spacing.md },
  iconWrap:   { width: 60, height: 60, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center' },
  cardInfo:   { flex: 1, gap: 3 },
  cardLabel:  { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  cardDesc:   { fontSize: FontSize.xs },
  featuresRow:{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  featurePill:{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  featureText:{ fontSize: 10, fontWeight: FontWeight.medium },
  cardRight:  { alignItems: 'flex-end', gap: 4 },
  price:      { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  etaRow:     { flexDirection: 'row', alignItems: 'center', gap: 3 },
  eta:        { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  checkWrap:  { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 2 },

  cta: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
  ctaSummary: { flex: 0 },
  ctaLabel:   { fontSize: FontSize.xs },
  ctaValue:   { fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
