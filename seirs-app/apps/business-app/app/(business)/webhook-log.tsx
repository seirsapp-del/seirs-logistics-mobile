import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { request } from '@seirs/shared/services/api';

interface Delivery {
  id:           string;
  endpointId:   string;
  event:        string;
  payload:      any;
  responseCode: number | null;
  attempts:     number;
  status:       'pending' | 'delivered' | 'failed';
  deliveredAt:  string | null;
  createdAt:    string;
}

const STATUS_META: Record<string, { color: string; label: string }> = {
  pending:   { color: '#D97706', label: 'Pending'   },
  delivered: { color: '#16A34A', label: 'Delivered' },
  failed:    { color: '#DC2626', label: 'Failed'    },
};

export default function WebhookLogScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items,      setItems]      = useState<Delivery[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded,   setExpanded]   = useState<string | null>(null);

  const load = async () => {
    try {
      const list = await request<Delivery[]>('GET', '/dev-platform/webhook-deliveries');
      setItems(Array.isArray(list) ? list : []);
    } catch { setItems([]); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F0' }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={20} color="#0F2B4C" />
        </Pressable>
        <Text style={styles.title}>Webhook Deliveries</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >

        <View style={styles.intro}>
          <Icon name="Activity" size={16} color="#3A7BD5" />
          <Text style={styles.introText}>
            Every webhook attempt is logged here for debugging. Tap to expand the payload + response.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#3A7BD5" style={{ marginTop: 32 }} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="Activity" size={32} color="#D1D5DB" />
            <Text style={styles.emptyText}>No webhook attempts yet.</Text>
            <Text style={styles.emptySub}>
              Subscribe to events from the API Keys page; events fire when orders update.
            </Text>
          </View>
        ) : (
          items.map(d => {
            const meta = STATUS_META[d.status];
            const isOpen = expanded === d.id;
            return (
              <Pressable
                key={d.id}
                onPress={() => setExpanded(isOpen ? null : d.id)}
                style={[styles.card, { borderColor: isOpen ? '#3A7BD5' : '#E5E7EB' }]}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
                  <Text style={styles.eventName}>{d.event}</Text>
                  <Text style={styles.timestamp}>
                    {new Date(d.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={[styles.statusBadge, { color: meta.color, borderColor: meta.color }]}>
                    {meta.label}
                  </Text>
                  <Text style={styles.metaText}>
                    {d.responseCode ? `HTTP ${d.responseCode}` : 'No response'} · {d.attempts} attempt{d.attempts === 1 ? '' : 's'}
                  </Text>
                </View>

                {isOpen && (
                  <View style={styles.payloadBox}>
                    <Text style={styles.payloadLabel}>PAYLOAD</Text>
                    <Text style={styles.payloadText}>{JSON.stringify(d.payload, null, 2)}</Text>
                  </View>
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn:   { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 18, fontWeight: '700', color: '#0F2B4C' },

  content:   { padding: 16, gap: 10 },

  intro:     { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#3A7BD512', borderRadius: 10, alignItems: 'center' },
  introText: { flex: 1, fontSize: 12, color: '#374151', lineHeight: 17 },

  empty:     { alignItems: 'center', gap: 8, paddingVertical: 40 },
  emptyText: { fontSize: 14, fontWeight: '700', color: '#0F2B4C' },
  emptySub:  { fontSize: 12, color: '#6B7280', textAlign: 'center', paddingHorizontal: 32 },

  card:      { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 6, borderWidth: 1.5 },
  cardTop:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  eventName: { flex: 1, fontSize: 13, fontWeight: '700', color: '#0F2B4C' },
  timestamp: { fontSize: 11, color: '#9CA3AF' },
  cardMeta:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  statusBadge:{ fontSize: 10, fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  metaText:  { fontSize: 11, color: '#6B7280' },

  payloadBox:  { backgroundColor: '#F9FAFB', padding: 10, borderRadius: 8, marginTop: 6 },
  payloadLabel:{ fontSize: 10, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5, marginBottom: 4 },
  payloadText: { fontSize: 11, color: '#0F2B4C', fontFamily: 'monospace' },
});
