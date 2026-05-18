import {
  View, Text, Pressable, StyleSheet, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MOCK_VEHICLES, FARE_BREAKDOWN } from '@/constants/mockData';

export default function FareBreakdownScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { t }   = useTranslation();
  const params  = useLocalSearchParams<{ pickup: string; dropoff: string; vehicleId: string }>();

  const vehicle = MOCK_VEHICLES.find(v => v.id === params.vehicleId) ?? MOCK_VEHICLES[0];
  const fb      = FARE_BREAKDOWN;

  const rows = [
    { label: t('fareBreakdown2.baseFare'),    value: fb.baseFare,    icon: 'flag-outline' },
    { label: t('fareBreakdown2.distanceFee'), value: fb.distanceFee, icon: 'map-outline'  },
    { label: t('fareBreakdown2.timeFee'),     value: fb.timeFee,     icon: 'time-outline' },
    { label: t('fareBreakdown2.serviceFee'),  value: fb.serviceFee,  icon: 'shield-outline' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t('fareBreakdown2.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Vehicle summary */}
        <Card style={styles.vehicleCard}>
          <View style={styles.vehicleRow}>
            <View style={[styles.vehicleIconWrap, { backgroundColor: isDark ? '#1A0C00' : '#EFF6FF' }]}>
              <Ionicons name={vehicle.icon as any} size={28} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.vehicleName, { color: theme.text }]}>{vehicle.label}</Text>
              <Text style={[styles.vehicleDesc, { color: theme.textSecond }]}>{vehicle.description}</Text>
            </View>
            <View style={styles.vehicleEta}>
              <Ionicons name="time-outline" size={14} color={theme.primary} />
              <Text style={[styles.etaText, { color: theme.primary }]}>{vehicle.eta}</Text>
            </View>
          </View>
        </Card>

        {/* Route */}
        <Card style={styles.routeCard}>
          <View style={styles.routeRow}>
            <View style={styles.routeIcons}>
              <View style={[styles.routeDot, { backgroundColor: '#22C55E' }]} />
              <View style={[styles.routeConnector, { backgroundColor: theme.border }]} />
              <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
            </View>
            <View style={styles.routeAddresses}>
              <Text style={[styles.routeAddr, { color: theme.text }]} numberOfLines={2}>{params.pickup}</Text>
              <View style={{ height: 12 }} />
              <Text style={[styles.routeAddr, { color: theme.text }]} numberOfLines={2}>{params.dropoff}</Text>
            </View>
          </View>
          <View style={[styles.routeMeta, { borderTopColor: theme.border }]}>
            <View style={styles.metaItem}>
              <Ionicons name="navigate-outline" size={14} color={theme.textSecond} />
              <Text style={[styles.metaText, { color: theme.textSecond }]}>~8.4 km</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color={theme.textSecond} />
              <Text style={[styles.metaText, { color: theme.textSecond }]}>~22 min</Text>
            </View>
          </View>
        </Card>

        {/* Fare rows */}
        <Card style={styles.fareCard}>
          <Text style={[styles.fareCardTitle, { color: theme.text }]}>{t('fareBreakdown2.priceDetails')}</Text>
          {rows.map(({ label, value, icon }, i) => (
            <View key={label} style={[
              styles.fareRow,
              i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
            ]}>
              <View style={styles.fareLeft}>
                <View style={[styles.fareIcon, { backgroundColor: theme.surfaceSecond }]}>
                  <Ionicons name={icon as any} size={14} color={theme.textSecond} />
                </View>
                <Text style={[styles.fareLabel, { color: theme.textSecond }]}>{label}</Text>
              </View>
              <Text style={[styles.fareValue, { color: theme.text }]}>â‚¦{value.toLocaleString()}</Text>
            </View>
          ))}

          {/* Discount */}
          {fb.discount > 0 && (
            <View style={[styles.fareRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
              <View style={styles.fareLeft}>
                <View style={[styles.fareIcon, { backgroundColor: '#DCFCE7' }]}>
                  <Ionicons name="pricetag-outline" size={14} color="#15803D" />
                </View>
                <Text style={[styles.fareLabel, { color: '#15803D' }]}>{t('fareBreakdown2.promoDiscount')}</Text>
              </View>
              <Text style={[styles.fareValue, { color: '#15803D' }]}>-â‚¦{fb.discount.toLocaleString()}</Text>
            </View>
          )}

          {/* Total */}
          <View style={[styles.fareTotal, { borderTopColor: theme.border }]}>
            <Text style={[styles.fareTotalLabel, { color: theme.text }]}>{t('fareBreakdown2.total')}</Text>
            <Text style={[styles.fareTotalValue, { color: theme.primary }]}>
              â‚¦{fb.total.toLocaleString()}
            </Text>
          </View>
        </Card>

        {/* Price notice */}
        <View style={[styles.notice, { backgroundColor: isDark ? '#001820' : '#F0FDFA', borderColor: '#2EC4B6' }]}>
          <Ionicons name="information-circle-outline" size={16} color="#2EC4B6" />
          <Text style={[styles.noticeText, { color: theme.textSecond }]}>
            {t('fareBreakdown2.priceNotice')}
          </Text>
        </View>

      </ScrollView>

      {/* Fixed CTA */}
      <View style={[styles.cta, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <Button
          label={t('common.continue')}
          onPress={() => router.push({
            pathname: '/(customer)/confirm-ride',
            params: { pickup: params.pickup, dropoff: params.dropoff, vehicleId: params.vehicleId },
          })}
          size="lg"
          fullWidth
          rightIcon={<Ionicons name="arrow-forward" size={18} color="#fff" />}
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
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl * 2 },

  vehicleCard: {},
  vehicleRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  vehicleIconWrap: { width: 52, height: 52, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center' },
  vehicleName: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  vehicleDesc: { fontSize: FontSize.sm },
  vehicleEta:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  etaText:     { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  routeCard: { gap: Spacing.sm },
  routeRow:  { flexDirection: 'row', gap: Spacing.md },
  routeIcons:{ alignItems: 'center', paddingTop: 4 },
  routeDot:  { width: 10, height: 10, borderRadius: 5 },
  routeConnector: { width: 2, flex: 1, marginVertical: 3 },
  routeAddresses: { flex: 1, justifyContent: 'space-between' },
  routeAddr: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  routeMeta: { flexDirection: 'row', gap: Spacing.lg, borderTopWidth: 1, paddingTop: Spacing.sm, marginTop: Spacing.sm },
  metaItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:  { fontSize: FontSize.sm },

  fareCard:      {},
  fareCardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: Spacing.sm },
  fareRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  fareLeft:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fareIcon:      { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  fareLabel:     { fontSize: FontSize.sm },
  fareValue:     { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  fareTotal:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Spacing.md, borderTopWidth: 1, marginTop: 4 },
  fareTotalLabel:{ fontSize: FontSize.md, fontWeight: FontWeight.bold },
  fareTotalValue:{ fontSize: FontSize.xl, fontWeight: FontWeight.bold },

  notice:     { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  noticeText: { flex: 1, fontSize: FontSize.sm, lineHeight: 20 },

  cta: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderTopWidth: 1 },
});
