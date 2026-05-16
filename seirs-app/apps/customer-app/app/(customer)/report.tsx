import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput, StatusBar, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { ticketsApi } from '@/services/api';

const CATEGORIES = [
  { id: 'lost_item',     icon: 'bag-outline',       label: 'Lost Item',         desc: 'Left something in the vehicle' },
  { id: 'driver',        icon: 'person-outline',    label: 'Driver Behaviour',  desc: 'Rude, dangerous or unprofessional' },
  { id: 'overcharge',    icon: 'cash-outline',       label: 'Overcharged',       desc: 'Charged more than the quoted fare' },
  { id: 'route',         icon: 'navigate-outline',   label: 'Wrong Route',       desc: 'Driver took an unexpected route' },
  { id: 'vehicle',       icon: 'car-outline',        label: 'Vehicle Condition', desc: 'Dirty or unsafe vehicle' },
  { id: 'other',         icon: 'ellipsis-horizontal-outline', label: 'Other',   desc: 'Something else happened' },
];

export default function ReportScreen() {
  const router   = useRouter();
  const cs       = useColorScheme();
  const theme    = Colors[cs ?? 'light'];
  const isDark   = cs === 'dark';
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();

  const [category, setCategory] = useState<string | null>(null);
  const [detail,   setDetail]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);

  const handleSubmit = async () => {
    if (!category) return;
    const cat = CATEGORIES.find(c => c.id === category)!;
    setLoading(true);
    try {
      await ticketsApi.create({
        subject:     cat.label + (tripId ? ` — trip ${String(tripId).toUpperCase()}` : ''),
        description: detail.trim() || cat.desc,
        category,
        tripId:      tripId ?? undefined,
      });
      setDone(true);
    } catch (e: any) {
      Alert.alert('Could not submit', e?.message ?? 'Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }} edges={['top', 'bottom']}>
        <View style={[styles.successWrap, { backgroundColor: theme.surface, borderColor: '#BBF7D0' }, Shadows.md]}>
          <View style={[styles.successIcon, { backgroundColor: '#F0FDF4' }]}>
            <Ionicons name="checkmark-circle" size={56} color="#22C55E" />
          </View>
          <Text style={[styles.successTitle, { color: theme.text }]}>Report Submitted</Text>
          <Text style={[styles.successDesc, { color: theme.textSecond }]}>
            Our support team will review your report and get back to you within 24 hours.
          </Text>
          <Button label="Back to Home" onPress={() => router.replace('/(customer)/(tabs)' as any)} fullWidth />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>Report an Issue</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {tripId && (
            <View style={[styles.tripRef, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <Ionicons name="car-outline" size={16} color={theme.textSecond} />
              <Text style={[styles.tripRefText, { color: theme.textSecond }]}>Trip #{tripId.toUpperCase()}</Text>
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: theme.text }]}>What happened?</Text>

          {CATEGORIES.map(cat => (
            <Pressable
              key={cat.id}
              style={[
                styles.catRow,
                { backgroundColor: theme.surface, borderColor: category === cat.id ? theme.primary : theme.border },
                category === cat.id && { backgroundColor: isDark ? '#001020' : '#EFF6FF' },
                Shadows.xs,
              ]}
              onPress={() => setCategory(cat.id)}
            >
              <View style={[styles.catIcon, { backgroundColor: category === cat.id ? theme.primary + '20' : theme.surfaceSecond }]}>
                <Ionicons name={cat.icon as any} size={20} color={category === cat.id ? theme.primary : theme.textSecond} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.catLabel, { color: theme.text }]}>{cat.label}</Text>
                <Text style={[styles.catDesc,  { color: theme.textSecond }]}>{cat.desc}</Text>
              </View>
              {category === cat.id && <Ionicons name="checkmark-circle" size={20} color={theme.primary} />}
            </Pressable>
          ))}

          {category && (
            <View style={styles.detailSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Additional details</Text>
              <View style={[styles.textareaWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.textarea, { color: theme.text }]}
                  placeholder="Describe what happened in detail…"
                  placeholderTextColor={theme.textThird}
                  multiline
                  maxLength={500}
                  value={detail}
                  onChangeText={setDetail}
                />
              </View>
              <Text style={[styles.charCount, { color: theme.textThird }]}>{detail.length}/500</Text>
            </View>
          )}

        </ScrollView>

        <View style={[styles.cta, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
          <Button
            label="Submit Report"
            onPress={handleSubmit}
            loading={loading}
            disabled={!category}
            size="lg"
            fullWidth
            leftIcon={<Ionicons name="flag" size={18} color="#fff" />}
          />
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  tripRef:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, alignSelf: 'flex-start' },
  tripRefText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  catRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  catIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  catLabel:{ fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  catDesc: { fontSize: FontSize.xs, marginTop: 2 },

  detailSection:{ gap: Spacing.sm },
  textareaWrap: { borderRadius: Radius.xl, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minHeight: 120 },
  textarea:     { fontSize: FontSize.base, lineHeight: 22 },
  charCount:    { fontSize: FontSize.xs, textAlign: 'right' },

  cta: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderTopWidth: 1 },

  successWrap:  { margin: Spacing.xl, borderRadius: Radius.xxl, borderWidth: 1, padding: Spacing.xl, alignItems: 'center', gap: Spacing.md },
  successIcon:  { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  successTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  successDesc:  { fontSize: FontSize.base, textAlign: 'center', lineHeight: 22 },
});
