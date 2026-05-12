import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/Icon';
import { Drawer } from '@/components/Drawer';
import { businessApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/context/ThemeContext';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

export default function BusinessDashboard() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const colors   = useColors();
  const { user } = useAuth();
  const [data,       setData]       = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    businessApi.dashboard()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: 'Today\'s Deliveries', value: data?.todayDeliveries ?? 0, icon: 'Package' as const, color: '#3A7BD5' },
    { label: 'Active',              value: data?.activeDeliveries ?? 0, icon: 'Zap'     as const, color: '#16A34A' },
    { label: 'Pending',             value: data?.pendingDeliveries ?? 0, icon: 'Clock'   as const, color: '#D97706' },
    { label: 'Loyalty Points',      value: data?.loyaltyPoints ?? 0,    icon: 'Star'    as const, color: '#7C3AED' },
  ];

  return (
    <>
      <Drawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} showsVerticalScrollIndicator={false}>
        {/* Header — keeps the brand navy gradient in both modes since it
            is intentionally dark-on-dark (text reads on either scheme). */}
        <LinearGradient
          colors={['#0F2B4C', '#1a3a5c']}
          style={[styles.header, { paddingTop: insets.top + 16 }]}
        >
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.greeting}>Good {getTimeOfDay()},</Text>
              <Text style={styles.companyName}>{user?.companyName ?? user?.name}</Text>
            </View>
            <Pressable style={styles.avatarBtn} onPress={() => setDrawerOpen(true)}>
              <Icon name="Menu" size={20} color="#fff" strokeWidth={1.5} />
            </Pressable>
          </View>

          <View style={styles.walletCard}>
            <Text style={styles.walletLabel}>Business Wallet</Text>
            <Text style={styles.walletBalance}>{fmt(data?.walletBalance ?? 0)}</Text>
            <Pressable
              style={styles.fundBtn}
              onPress={() => router.push('/(business)/wallet' as any)}
            >
              <Icon name="Plus" size={14} color="#0F2B4C" />
              <Text style={styles.fundBtnText}>Fund Wallet</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : (
            <>
              <View style={styles.statsGrid}>
                {stats.map((s) => (
                  <View
                    key={s.label}
                    style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <View style={[styles.statIcon, { backgroundColor: s.color + '18' }]}>
                      <Icon name={s.icon} size={18} color={s.color} />
                    </View>
                    <Text style={[styles.statValue, { color: colors.text }]}>{s.value.toLocaleString()}</Text>
                    <Text style={[styles.statLabel, { color: colors.textSecond }]}>{s.label}</Text>
                  </View>
                ))}
              </View>

              <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
              <View style={styles.actions}>
                <ActionCard icon="Package"         label="New Delivery" sub="Single or multi-stop"
                  onPress={() => router.push('/(business)/(tabs)/new-delivery' as any)} primary />
                <ActionCard icon="FileSpreadsheet" label="CSV Upload"   sub="Bulk import from file"
                  onPress={() => router.push('/(business)/csv-upload' as any)} />
                <ActionCard icon="RotateCcw"       label="Recurring"    sub="Schedule repeating jobs"
                  onPress={() => router.push('/(business)/(tabs)/new-delivery' as any)} />
                <ActionCard icon="Truck"           label="Specialists"  sub="Haulage, cold chain & more"
                  onPress={() => router.push('/(business)/(tabs)/new-delivery' as any)} />
              </View>

              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Deliveries</Text>
                <Pressable onPress={() => router.push('/(business)/(tabs)/deliveries' as any)}>
                  <Text style={[styles.viewAll, { color: colors.accent }]}>View all</Text>
                </Pressable>
              </View>

              {(data?.recentDeliveries ?? []).length === 0 ? (
                <View style={styles.emptyBox}>
                  <Icon name="Package" size={32} color={colors.textThird} />
                  <Text style={[styles.emptyText, { color: colors.textThird }]}>No deliveries yet</Text>
                  <Pressable
                    style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                    onPress={() => router.push('/(business)/(tabs)/new-delivery' as any)}
                  >
                    <Text style={styles.emptyBtnText}>Create your first delivery</Text>
                  </Pressable>
                </View>
              ) : (
                data.recentDeliveries.map((d: any) => (
                  <DeliveryRow key={d.id} delivery={d} />
                ))
              )}
            </>
          )}
        </View>
      </ScrollView>
    </>
  );
}

function ActionCard({ icon, label, sub, onPress, primary }: {
  icon: any; label: string; sub: string; onPress: () => void; primary?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={[
        styles.actionCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
        primary && { backgroundColor: colors.primary, borderColor: colors.primary },
      ]}
      onPress={onPress}
    >
      <View style={[
        styles.actionIcon,
        { backgroundColor: colors.primaryLight },
        primary && { backgroundColor: 'rgba(255,255,255,0.15)' },
      ]}>
        <Icon name={icon} size={20} color={primary ? '#fff' : colors.primary} />
      </View>
      <Text style={[
        styles.actionLabel,
        { color: colors.text },
        primary && { color: '#fff' },
      ]}>{label}</Text>
      <Text style={[
        styles.actionSub,
        { color: colors.textSecond },
        primary && { color: 'rgba(255,255,255,0.7)' },
      ]}>{sub}</Text>
    </Pressable>
  );
}

function DeliveryRow({ delivery }: { delivery: any }) {
  const colors = useColors();
  const STATUS_COLOR: Record<string, string> = {
    pending:   '#D97706', assigned: '#3A7BD5', in_transit: '#7C3AED',
    delivered: '#16A34A', cancelled: '#DC2626',
  };
  const c = STATUS_COLOR[delivery.status] ?? colors.textThird;
  return (
    <View style={[styles.deliveryRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.deliveryLeft}>
        <Text style={[styles.deliveryId, { color: colors.text }]}>{delivery.trackingNumber ?? delivery.trackingCode ?? delivery.id?.slice(0, 8)}</Text>
        <Text style={[styles.deliveryAddr, { color: colors.textSecond }]} numberOfLines={1}>
          {delivery.dropoffAddress ?? delivery.pickupAddress ?? '—'}
        </Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: c + '20' }]}>
        <Text style={[styles.statusText, { color: c }]}>{delivery.status}</Text>
      </View>
    </View>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

// Structural styles only — colors come from useColors() and override at use site.
const styles = StyleSheet.create({
  header:      { paddingHorizontal: 24, paddingBottom: 28 },
  headerRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  greeting:    { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  companyName: { fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 2 },
  avatarBtn:   {
    width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  walletCard:  {
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  walletLabel:   { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 },
  walletBalance: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 12 },
  fundBtn:       {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', alignSelf: 'flex-start',
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
  },
  fundBtnText:   { fontSize: 13, fontWeight: '700', color: '#0F2B4C' },
  body:          { padding: 20 },
  statsGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statCard:      {
    flex: 1, minWidth: '44%', borderRadius: 14,
    padding: 16, borderWidth: 1,
  },
  statIcon:      {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  statValue:     { fontSize: 22, fontWeight: '800' },
  statLabel:     { fontSize: 11, marginTop: 2 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  viewAll:       { fontSize: 13, fontWeight: '600' },
  actions:       { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  actionCard:    {
    flex: 1, minWidth: '44%', borderRadius: 14,
    padding: 16, borderWidth: 1,
  },
  actionIcon:    {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  actionLabel:   { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  actionSub:     { fontSize: 11 },
  emptyBox:      { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText:     { fontSize: 14 },
  emptyBtn:      { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  emptyBtnText:  { color: '#fff', fontWeight: '600', fontSize: 13 },
  deliveryRow:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1,
  },
  deliveryLeft:  { flex: 1 },
  deliveryId:    { fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  deliveryAddr:  { fontSize: 12, marginTop: 2 },
  statusBadge:   { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:    { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
});
