import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { useColors } from '@/context/ThemeContext';

// Spec V8 §4.2 — recurring delivery templates for business senders.

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
  const colors = useColors();
  const [templates] = useState<Template[]>(PLACEHOLDER);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.surfaceSecond }]}>
          <Icon name="ArrowLeft" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Recurring Deliveries</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Brand-navy hero keeps consistent identity in both modes */}
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
              <Icon name="Calendar" size={36} color={colors.textThird} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No recurring templates yet</Text>
              <Text style={[styles.emptySub, { color: colors.textSecond }]}>
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
            <View key={t.id} style={[styles.templateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.templateRow}>
                <View style={[styles.templateIcon, { backgroundColor: t.isActive ? '#16A34A18' : '#9CA3AF18' }]}>
                  <Icon name="Repeat" size={18} color={t.isActive ? '#16A34A' : '#9CA3AF'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.templateName, { color: colors.text }]}>{t.name}</Text>
                  <Text style={[styles.templateMeta, { color: colors.textSecond }]}>{CADENCE_LABEL[t.cadence]} · next: {t.nextRun}</Text>
                </View>
                <Text style={[styles.statusChip, {
                  color: t.isActive ? '#16A34A' : colors.textThird,
                  borderColor: t.isActive ? '#16A34A' : colors.border,
                }]}>
                  {t.isActive ? 'Active' : 'Paused'}
                </Text>
              </View>
            </View>
          ))
        )}

        <Pressable
          style={[styles.addBtn, { borderColor: colors.accent }]}
          onPress={() => Alert.alert(
            'Coming soon',
            'Recurring template creation will go live with the next backend batch (RecurringTemplate entity + scheduler). For now you can plan templates by creating individual scheduled deliveries via the New Delivery flow.',
          )}
        >
          <Icon name="Plus" size={16} color={colors.accent} />
          <Text style={[styles.addBtnText, { color: colors.accent }]}>Create new template</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn:   { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 18, fontWeight: '700' },

  content:   { padding: 16, gap: 16 },

  // Hero stays brand navy in both modes — high-contrast feature card
  hero:      { backgroundColor: '#0F2B4C', borderRadius: 16, padding: 20, gap: 8, alignItems: 'flex-start' },
  heroIcon:  { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  heroSub:   { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19 },

  empty:     { alignItems: 'center', gap: 10, paddingVertical: 32 },
  emptyTitle:{ fontSize: 16, fontWeight: '700' },
  emptySub:  { fontSize: 13, textAlign: 'center', paddingHorizontal: 32, lineHeight: 18 },

  note:      { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, backgroundColor: '#FEF9C3', borderColor: '#FDE68A', borderWidth: 1, borderRadius: 10 },
  noteText:  { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },

  templateCard: { borderRadius: 12, padding: 14, borderWidth: 1 },
  templateRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  templateIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  templateName: { fontSize: 14, fontWeight: '700' },
  templateMeta: { fontSize: 11, marginTop: 2 },
  statusChip:   { fontSize: 10, fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },

  addBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed' },
  addBtnText:{ fontSize: 14, fontWeight: '700' },
});
