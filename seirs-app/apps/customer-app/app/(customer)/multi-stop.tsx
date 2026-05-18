import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui/Button';

type Stop = { id: string; address: string; label: string };

const INITIAL_STOPS: Stop[] = [
  { id: 's1', address: '', label: 'Pickup' },
  { id: 's2', address: '', label: 'Stop 1' },
  { id: 's3', address: '', label: 'Drop-off' },
];

export default function MultiStopScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { t }   = useTranslation();

  const [stops, setStops] = useState<Stop[]>(INITIAL_STOPS);

  const updateStop = (id: string, address: string) =>
    setStops(prev => prev.map(s => s.id === id ? { ...s, address } : s));

  const addStop = () => {
    const idx = stops.length - 1;
    const newStop: Stop = {
      id:      `s${Date.now()}`,
      address: '',
      label:   `Stop ${idx}`,
    };
    setStops(prev => {
      const copy = [...prev];
      copy.splice(idx, 0, newStop);
      return copy.map((s, i) => {
        if (i === 0) return { ...s, label: 'Pickup' };
        if (i === copy.length - 1) return { ...s, label: 'Drop-off' };
        return { ...s, label: `Stop ${i}` };
      });
    });
  };

  const removeStop = (id: string) => {
    setStops(prev => {
      const filtered = prev.filter(s => s.id !== id);
      return filtered.map((s, i) => ({
        ...s,
        label: i === 0 ? 'Pickup' : i === filtered.length - 1 ? 'Drop-off' : `Stop ${i}`,
      }));
    });
  };

  const DOT_COLORS = ['#22C55E', '#3A86FF', '#FF6B00', '#8B5CF6', '#FFBE0B', '#EF4444'];

  const canContinue = stops[0].address.trim() && stops[stops.length - 1].address.trim();

  const handleContinue = () => {
    router.push({
      pathname: '/(customer)/vehicle-select',
      params: {
        pickup:  stops[0].address,
        dropoff: stops[stops.length - 1].address,
        stops:   JSON.stringify(stops.slice(1, -1).map(s => s.address)),
      },
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Multi-Stop Trip</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: isDark ? '#001020' : '#EFF6FF', borderColor: theme.primary + '30' }]}>
          <Ionicons name="information-circle-outline" size={18} color={theme.primary} />
          <Text style={[styles.infoText, { color: theme.textSecond }]}>
            Add up to 5 stops. Price is calculated for the total route.
          </Text>
        </View>

        {/* Stops list */}
        <View style={[styles.stopsCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          {stops.map((stop, index) => {
            const dotColor = DOT_COLORS[Math.min(index, DOT_COLORS.length - 1)];
            const isFirst  = index === 0;
            const isLast   = index === stops.length - 1;
            return (
              <View key={stop.id}>
                {index > 0 && (
                  <View style={[styles.connector, { backgroundColor: theme.border }]} />
                )}
                <View style={styles.stopRow}>
                  <View style={[styles.stopDot, { backgroundColor: dotColor }]} />
                  <View style={styles.stopInputWrap}>
                    <Text style={[styles.stopLabel, { color: theme.textThird }]}>{stop.label}</Text>
                    <TextInput
                      style={[styles.stopInput, { color: theme.text }]}
                      placeholder={isFirst ? 'Enter pickup location' : isLast ? 'Enter drop-off location' : 'Enter stop address'}
                      placeholderTextColor={theme.textThird}
                      value={stop.address}
                      onChangeText={v => updateStop(stop.id, v)}
                    />
                  </View>
                  {!isFirst && !isLast && (
                    <Pressable style={styles.removeStop} onPress={() => removeStop(stop.id)}>
                      <Ionicons name="close" size={18} color={theme.textThird} />
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Add stop */}
        {stops.length < 6 && (
          <Pressable
            style={[styles.addStopBtn, { borderColor: theme.primary, backgroundColor: isDark ? '#001020' : '#EFF6FF' }]}
            onPress={addStop}
          >
            <Ionicons name="add-circle-outline" size={18} color={theme.primary} />
            <Text style={[styles.addStopText, { color: theme.primary }]}>Add another stop</Text>
          </Pressable>
        )}

        {/* Estimate note */}
        <View style={[styles.estimateCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.estimateTitle, { color: theme.text }]}>Estimated totals</Text>
          <View style={styles.estimateRow}>
            <View style={styles.estimateItem}>
              <Ionicons name="navigate-outline" size={14} color={theme.textSecond} />
              <Text style={[styles.estimateText, { color: theme.textSecond }]}>~{stops.length * 3}–{stops.length * 5} km</Text>
            </View>
            <View style={styles.estimateItem}>
              <Ionicons name="time-outline" size={14} color={theme.textSecond} />
              <Text style={[styles.estimateText, { color: theme.textSecond }]}>~{stops.length * 8}–{stops.length * 12} min</Text>
            </View>
            <View style={styles.estimateItem}>
              <Ionicons name="cash-outline" size={14} color={theme.textSecond} />
              <Text style={[styles.estimateText, { color: theme.textSecond }]}>From ₦{(stops.length * 900).toLocaleString()}</Text>
            </View>
          </View>
        </View>

      </ScrollView>

      {/* CTA */}
      <View style={[styles.cta, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
        <Button
          label={t('vehicleSelect2.title')}
          onPress={handleContinue}
          disabled={!canContinue}
          size="lg"
          fullWidth
          leftIcon={<Ionicons name="car-outline" size={18} color="#fff" />}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  infoBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  infoText:   { flex: 1, fontSize: FontSize.sm, lineHeight: 18 },

  stopsCard:   { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  connector:   { width: 2, height: 16, marginLeft: 27 },
  stopRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  stopDot:     { width: 14, height: 14, borderRadius: 7 },
  stopInputWrap:{ flex: 1 },
  stopLabel:   { fontSize: 10, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  stopInput:   { fontSize: FontSize.base, paddingVertical: 4 },
  removeStop:  { width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },

  addStopBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5, borderStyle: 'dashed' },
  addStopText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },

  estimateCard:  { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  estimateTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  estimateRow:   { flexDirection: 'row', gap: Spacing.lg },
  estimateItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  estimateText:  { fontSize: FontSize.xs },

  cta: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderTopWidth: 1 },
});
