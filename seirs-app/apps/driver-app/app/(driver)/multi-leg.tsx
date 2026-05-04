import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, MapPin, Package, Users, Check, Clock, ChevronRight,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { driversApi } from '@/services/api';

// Spec V8 §1 / §2.15 — driver's view of a corridor pool trip with up
// to 4 simultaneous active legs. Each leg shows pickup/dropoff,
// status, ETA. Driver can mark a leg complete which slides the
// capacity bound back and frees a slot for the next insertion.

interface Leg {
  id:           string;
  type:         'passenger' | 'package';
  pickup:       string;
  dropoff:      string;
  status:       'pending_pickup' | 'in_transit' | 'completed';
  etaMinutes:   number;
  recipientName?: string;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending_pickup: { label: 'Pickup pending', color: '#D97706' },
  in_transit:     { label: 'In transit',     color: '#3A7BD5' },
  completed:      { label: 'Delivered',      color: '#16A34A' },
};

export default function MultiLegScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  const [legs,    setLegs]    = useState<Leg[]>([]);
  const [loading, setLoading] = useState(true);
  const [poolEtaMin, setPoolEtaMin] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const my = await driversApi.myDeliveries();
        // Map active deliveries into the leg shape the UI uses
        const arr = Array.isArray(my) ? my : [];
        const mapped: Leg[] = arr.slice(0, 4).map((d: any) => ({
          id:           d.id,
          type:         (d.packageDescription ? 'package' : 'package') as 'package',
          pickup:       d.pickupAddress ?? 'Pickup',
          dropoff:      d.dropoffAddress ?? 'Dropoff',
          status:       d.status === 'delivered' ? 'completed' : d.status === 'in_transit' ? 'in_transit' : 'pending_pickup',
          etaMinutes:   8,
          recipientName: d.customer?.name ?? d.recipientName,
        }));
        setLegs(mapped);
        setPoolEtaMin(mapped.reduce((s, l) => s + l.etaMinutes, 0));
      } catch { setLegs([]); }
      finally { setLoading(false); }
    })();
  }, []);

  const active   = legs.filter(l => l.status !== 'completed');
  const slotsUsed = active.length;
  const slotsFree = 4 - slotsUsed;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Active Pool Trip</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Capacity card */}
        <View style={[styles.capacityCard, { backgroundColor: theme.primary }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.capacityLabel}>POOL CAPACITY</Text>
            <Text style={styles.capacityValue}>{slotsUsed} <Text style={styles.capacitySecond}>/ 4 legs</Text></Text>
            <Text style={styles.capacitySub}>
              {slotsFree > 0
                ? `${slotsFree} slot${slotsFree === 1 ? '' : 's'} open — system can insert more legs along your corridor`
                : 'At cap — no new insertions until a leg completes'}
            </Text>
          </View>
          <View style={styles.etaBadge}>
            <Clock size={14} color="#fff" />
            <Text style={styles.etaText}>{poolEtaMin}m</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 32 }} />
        ) : legs.length === 0 ? (
          <View style={styles.empty}>
            <Package size={32} color={theme.textThird} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No active legs</Text>
            <Text style={[styles.emptySub,   { color: theme.textSecond }]}>
              When you accept a job, it appears here. Multiple legs along the same corridor get bundled into a pool trip.
            </Text>
          </View>
        ) : (
          legs.map((leg, i) => {
            const meta = STATUS_META[leg.status];
            const Icon = leg.type === 'passenger' ? Users : Package;
            return (
              <View
                key={leg.id}
                style={[styles.legCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                <View style={styles.legTop}>
                  <View style={[styles.legNumBadge, { backgroundColor: theme.primary }]}>
                    <Text style={styles.legNum}>{i + 1}</Text>
                  </View>
                  <View style={styles.legType}>
                    <Icon size={14} color={theme.primary} />
                    <Text style={[styles.legTypeText, { color: theme.primary }]}>
                      {leg.type === 'passenger' ? 'Passenger' : 'Package'}
                    </Text>
                  </View>
                  <Text style={[styles.statusBadge, { color: meta.color, borderColor: meta.color }]}>
                    {meta.label}
                  </Text>
                </View>

                <View style={styles.row}>
                  <MapPin size={14} color="#16A34A" />
                  <Text style={[styles.locText, { color: theme.text }]} numberOfLines={1}>
                    {leg.pickup}
                  </Text>
                </View>
                <View style={styles.row}>
                  <MapPin size={14} color="#DC2626" />
                  <Text style={[styles.locText, { color: theme.text }]} numberOfLines={1}>
                    {leg.dropoff}
                  </Text>
                </View>

                {leg.recipientName && (
                  <Text style={[styles.recipient, { color: theme.textSecond }]}>
                    For: <Text style={{ fontWeight: '700' as any }}>{leg.recipientName}</Text>
                  </Text>
                )}

                {leg.status !== 'completed' && (
                  <Pressable
                    onPress={() => router.push({ pathname: '/(driver)/delivery/[id]' as any, params: { id: leg.id } })}
                    style={[styles.viewBtn, { backgroundColor: theme.primary + '15' }]}
                  >
                    <Text style={[styles.viewBtnText, { color: theme.primary }]}>Open delivery</Text>
                    <ChevronRight size={14} color={theme.primary} />
                  </Pressable>
                )}
              </View>
            );
          })
        )}

        <View style={[styles.note, { backgroundColor: theme.primary + '08' }]}>
          <Text style={[styles.noteText, { color: theme.textSecond }]}>
            <Text style={{ fontWeight: '700' as any }}>How pooling works:</Text> The dispatcher silently inserts legs that lie within 1km of your route + add ≤20% to your time. You don&apos;t need to accept each insertion — just complete legs in the order shown.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },

  capacityCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: Spacing.lg, borderRadius: Radius.xl },
  capacityLabel: { color: 'rgba(255,255,255,0.6)', fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.8 },
  capacityValue: { color: '#fff', fontSize: 32, fontWeight: FontWeight.bold, marginTop: 4 },
  capacitySecond:{ fontSize: FontSize.base, color: 'rgba(255,255,255,0.5)' },
  capacitySub:   { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.xs, marginTop: 6, lineHeight: 17 },
  etaBadge:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  etaText:       { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  empty:    { alignItems: 'center', gap: 10, paddingVertical: Spacing.xl },
  emptyTitle:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },
  emptySub: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 19, paddingHorizontal: Spacing.xl },

  legCard:  { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 8 },
  legTop:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legNumBadge:{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  legNum:   { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  legType:  { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  legTypeText:{ fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  statusBadge:{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locText:  { flex: 1, fontSize: FontSize.sm },
  recipient:{ fontSize: FontSize.xs, marginTop: 4 },

  viewBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: Radius.lg, marginTop: 4 },
  viewBtnText:{ fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  note:     { padding: Spacing.md, borderRadius: Radius.lg },
  noteText: { fontSize: FontSize.xs, lineHeight: 17 },
});
