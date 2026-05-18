import {
  View, Text, Pressable, StyleSheet, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { MOCK_VEHICLES, MOCK_DRIVERS, FARE_BREAKDOWN } from '@/constants/mockData';

export default function ConfirmRideScreen() {
  const router   = useRouter();
  const cs       = useColorScheme();
  const theme    = Colors[cs ?? 'light'];
  const isDark   = cs === 'dark';
  const { t }    = useTranslation();
  const params   = useLocalSearchParams<{ pickup: string; dropoff: string; vehicleId: string }>();

  const [payment,    setPayment]    = useState<'wallet' | 'card' | 'cash'>('wallet');
  const [confirming, setConfirming] = useState(false);

  const vehicle = MOCK_VEHICLES.find(v => v.id === params.vehicleId) ?? MOCK_VEHICLES[0];
  const driver  = MOCK_DRIVERS[0];
  const total   = FARE_BREAKDOWN.total;

  const PAYMENT_OPTS = [
    { id: 'wallet' as const, label: t('confirmRide.payWallet'),               icon: 'wallet-outline', sub: t('confirmRide.payWalletSub', { balance: '47,500' }) },
    { id: 'card'   as const, label: t('confirmRide.payCard', { last4: '4532' }), icon: 'card-outline',   sub: t('confirmRide.payCardSub') },
    { id: 'cash'   as const, label: t('confirmRide.payCash'),                 icon: 'cash-outline',   sub: t('confirmRide.payCashSub') },
  ];

  const handleConfirm = async () => {
    setConfirming(true);
    setTimeout(() => {
      setConfirming(false);
      router.replace({
        pathname: '/(customer)/trip-progress',
        params: { id: 't3', driverId: driver.id },
      });
    }, 1500);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t('confirmRide.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Driver preview */}
        <Card>
          <Text style={[styles.cardLabel, { color: theme.textSecond }]}>{t('confirmRide.yourDriver')}</Text>
          <View style={styles.driverRow}>
            <Avatar name={driver.name} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.driverName, { color: theme.text }]}>{driver.name}</Text>
              <View style={styles.driverMeta}>
                <Ionicons name="star" size={12} color="#FFBE0B" />
                <Text style={[styles.metaText, { color: theme.textSecond }]}>{driver.rating}</Text>
                <Text style={[styles.metaDot, { color: theme.textThird }]}>Â·</Text>
                <Text style={[styles.metaText, { color: theme.textSecond }]}>{t('confirmRide.trips', { count: driver.trips })}</Text>
              </View>
            </View>
            <View style={styles.vehiclePill}>
              <Ionicons name={vehicle.icon as any} size={14} color={theme.primary} />
              <Text style={[styles.vehiclePillText, { color: theme.primary }]}>{vehicle.label}</Text>
            </View>
          </View>
          <View style={[styles.plateBadge, { backgroundColor: isDark ? '#1A1A1A' : '#F1F5F9' }]}>
            <Ionicons name="car-outline" size={14} color={theme.textSecond} />
            <Text style={[styles.plateText, { color: theme.text }]}>{driver.vehicle}</Text>
            <Text style={[styles.plateNum, { color: theme.primary }]}>{driver.plate}</Text>
          </View>
        </Card>

        {/* Trip summary */}
        <Card>
          <Text style={[styles.cardLabel, { color: theme.textSecond }]}>{t('confirmRide.tripSummary')}</Text>
          <View style={styles.summaryRow}>
            <View style={[styles.summDot, { backgroundColor: '#22C55E' }]} />
            <Text style={[styles.summAddr, { color: theme.text }]} numberOfLines={2}>{params.pickup}</Text>
          </View>
          <View style={[styles.summConnector, { backgroundColor: theme.border }]} />
          <View style={styles.summaryRow}>
            <View style={[styles.summDot, { backgroundColor: '#EF4444' }]} />
            <Text style={[styles.summAddr, { color: theme.text }]} numberOfLines={2}>{params.dropoff}</Text>
          </View>
          <View style={[styles.summMeta, { borderTopColor: theme.border }]}>
            <View style={styles.summMetaItem}>
              <Ionicons name="navigate-outline" size={13} color={theme.textSecond} />
              <Text style={[styles.summMetaText, { color: theme.textSecond }]}>{t('confirmRide.kmAway', { km: '8.4' })}</Text>
            </View>
            <View style={styles.summMetaItem}>
              <Ionicons name="time-outline" size={13} color={theme.textSecond} />
              <Text style={[styles.summMetaText, { color: theme.textSecond }]}>{t('confirmRide.minAway', { min: 22 })}</Text>
            </View>
            <View style={styles.summMetaItem}>
              <Ionicons name="car-outline" size={13} color={theme.textSecond} />
              <Text style={[styles.summMetaText, { color: theme.textSecond }]}>{vehicle.label}</Text>
            </View>
          </View>
        </Card>

        {/* Payment method */}
        <Card>
          <View style={styles.payHeader}>
            <Text style={[styles.cardLabel, { color: theme.textSecond }]}>{t('confirmRide.paymentMethod')}</Text>
            <Pressable onPress={() => router.push('/(customer)/payment-methods')}>
              <Text style={[styles.changeText, { color: theme.primary }]}>{t('confirmRide.change')}</Text>
            </Pressable>
          </View>
          <View style={styles.payOptions}>
            {PAYMENT_OPTS.map((opt) => (
              <Pressable
                key={opt.id}
                style={[
                  styles.payOpt,
                  { borderColor: payment === opt.id ? theme.primary : theme.border },
                  payment === opt.id && { backgroundColor: isDark ? '#0A1A2A' : '#EFF6FF' },
                ]}
                onPress={() => setPayment(opt.id)}
              >
                <View style={[styles.payIcon, { backgroundColor: theme.surfaceSecond }]}>
                  <Ionicons name={opt.icon as any} size={18} color={payment === opt.id ? theme.primary : theme.textSecond} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.payLabel, { color: theme.text }]}>{opt.label}</Text>
                  <Text style={[styles.paySub, { color: theme.textSecond }]}>{opt.sub}</Text>
                </View>
                {payment === opt.id && <Ionicons name="checkmark-circle" size={20} color={theme.primary} />}
              </Pressable>
            ))}
          </View>
        </Card>

        {/* Promo code */}
        <Pressable
          style={[styles.promoRow, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
          onPress={() => router.push('/(customer)/promo')}
        >
          <Ionicons name="pricetag-outline" size={18} color={theme.primary} />
          <Text style={[styles.promoText, { color: theme.text }]}>{t('confirmRide.addPromo')}</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
        </Pressable>

      </ScrollView>

      {/* Fixed CTA */}
      <View style={[styles.cta, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <View style={styles.ctaTotal}>
          <Text style={[styles.ctaTotalLabel, { color: theme.textSecond }]}>{t('confirmRide.total')}</Text>
          <Text style={[styles.ctaTotalValue, { color: theme.primary }]}>â‚¦{total.toLocaleString()}</Text>
        </View>
        <Button
          label={t('confirmRide.confirmRide')}
          onPress={handleConfirm}
          loading={confirming}
          size="lg"
          style={{ flex: 1 }}
          leftIcon={<Ionicons name="car" size={18} color="#fff" />}
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

  cardLabel:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm },

  driverRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  driverName: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  driverMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText:   { fontSize: FontSize.sm },
  metaDot:    { fontSize: FontSize.sm },
  vehiclePill:{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  vehiclePillText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  plateBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md },
  plateText:  { flex: 1, fontSize: FontSize.sm },
  plateNum:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, letterSpacing: 1 },

  summaryRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  summDot:       { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  summAddr:      { flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.medium },
  summConnector: { width: 2, height: 12, marginLeft: 4, marginVertical: 3 },
  summMeta:      { flexDirection: 'row', gap: Spacing.lg, paddingTop: Spacing.sm, marginTop: Spacing.sm, borderTopWidth: 1 },
  summMetaItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summMetaText:  { fontSize: FontSize.xs },

  payHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  changeText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  payOptions: { gap: Spacing.sm },
  payOpt:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5 },
  payIcon:    { width: 36, height: 36, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  payLabel:   { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  paySub:     { fontSize: FontSize.xs },

  promoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  promoText:{ flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.medium },

  cta:           { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderTopWidth: 1 },
  ctaTotal:      {},
  ctaTotalLabel: { fontSize: FontSize.xs, color: '#6B7280' },
  ctaTotalValue: { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
});
