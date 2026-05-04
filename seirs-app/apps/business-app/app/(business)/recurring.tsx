import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';

// Spec V8 §4.2 — recurring delivery templates for business senders.
// E.g. "Every Monday at 9am, 5 packages from warehouse A to client B".
// Backend RecurringTemplate entity + scheduler ship in a follow-up
// commit; this UI surface establishes the IA so the backend has a
// clear consumer to design against.

interface Template {
  id:        string;
  name:      string;
  cadence:   'daily' | 'weekly' | 'monthly';
  nextRun:   string;
  isActive:  boolean;
}

const PLACEHOLDER: Template[] = [];

const CADENCE_LABEL: Record<string, string> = {
  daily:   'Every day',
  weekly:  'Every Monday',
  monthly: 'Monthly (1st)',
};

export default function RecurringScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [templates] = useState<Template[]>(PLACEHOLDER);

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F0' }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={20} color="#0F2B4C" />
        </Pressable>
        <Text style={styles.title}>Recurring Deliveries</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name="Repeat" size={20} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>Set it and forget it</Text>
          <Text style={styles.heroSub}>
            Schedule deliveries that auto-create on a daily, weekly, or monthly cadence. Perfect for warehouse-to-client routes, bulk Monday refills, or month-end runs.
          </Text>
        </View>

        {templates.length === 0 ? (
          <>
            <View style={styles.empty}>
              <Icon name="Calendar" size={36} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No recurring templates yet</Text>
              <Text style={styles.emptySub}>
                Create one from any past delivery: open the delivery → tap &ldquo;Make recurring&rdquo;.
              </Text>
            </View>

            <View style={styles.note}>
              <Icon name="Info" size={14} color="#D97706" />
              <Text style={styles.noteText}>
                Recurring template scheduler ships in the next batch. Until then templates can be defined here but won&apos;t auto-fire.
              </Text>
            </View>
          </>
        ) : (
          templates.map(t => (
            <View key={t.id} style={styles.templateCard}>
              <View style={styles.templateRow}>
                <View style={[styles.templateIcon, { backgroundColor: t.isActive ? '#16A34A18' : '#9CA3AF18' }]}>
                  <Icon name="Repeat" size={18} color={t.isActive ? '#16A34A' : '#9CA3AF'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.templateName}>{t.name}</Text>
                  <Text style={styles.templateMeta}>{CADENCE_LABEL[t.cadence]} · next: {t.nextRun}</Text>
                </View>
                <Text style={[styles.statusChip, { color: t.isActive ? '#16A34A' : '#9CA3AF', borderColor: t.isActive ? '#16A34A' : '#E5E7EB' }]}>
                  {t.isActive ? 'Active' : 'Paused'}
                </Text>
              </View>
            </View>
          ))
        )}

        <Pressable style={styles.addBtn}>
          <Icon name="Plus" size={16} color="#3A7BD5" />
          <Text style={styles.addBtnText}>Create new template</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn:   { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 18, fontWeight: '700', color: '#0F2B4C' },

  content:   { padding: 16, gap: 16 },

  hero:      { backgroundColor: '#0F2B4C', borderRadius: 16, padding: 20, gap: 8, alignItems: 'flex-start' },
  heroIcon:  { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  heroSub:   { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19 },

  empty:     { alignItems: 'center', gap: 10, paddingVertical: 32 },
  emptyTitle:{ fontSize: 16, fontWeight: '700', color: '#0F2B4C' },
  emptySub:  { fontSize: 13, color: '#6B7280', textAlign: 'center', paddingHorizontal: 32, lineHeight: 18 },

  note:      { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, backgroundColor: '#FEF9C3', borderColor: '#FDE68A', borderWidth: 1, borderRadius: 10 },
  noteText:  { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },

  templateCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  templateRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  templateIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  templateName: { fontSize: 14, fontWeight: '700', color: '#0F2B4C' },
  templateMeta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  statusChip:   { fontSize: 10, fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },

  addBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#3A7BD5', borderStyle: 'dashed' },
  addBtnText:{ color: '#3A7BD5', fontSize: 14, fontWeight: '700' },
});
