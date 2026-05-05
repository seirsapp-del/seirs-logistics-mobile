import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet,
  ActivityIndicator, Switch, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { businessApi } from '@/services/api';
import { useBusinessStore } from '@/store/businessStore';
import { VehicleIcon, type VehicleType } from '@seirs/shared';

const VEHICLES: { key: VehicleType; label: string; maxKg: number }[] = [
  { key: 'bicycle',     label: 'Bicycle',     maxKg: 5    },
  { key: 'motorcycle',  label: 'Motorcycle',  maxKg: 20   },
  { key: 'tricycle',    label: 'Tricycle',    maxKg: 100  },
  { key: 'car',         label: 'Car',         maxKg: 200  },
  { key: 'van',         label: 'Van',         maxKg: 800  },
  { key: 'truck_small', label: 'Small Truck', maxKg: 3000 },
  { key: 'truck_large', label: 'Large Truck', maxKg: 9999 },
];

const CATEGORIES = [
  'Documents', 'Electronics', 'Clothing', 'Food & Beverages', 'Furniture',
  'Building Materials', 'Farm Produce', 'Medical Supplies', 'Industrial Goods', 'Other',
];

const RECURRING = [
  { key: 'daily',   label: 'Daily' },
  { key: 'weekly',  label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

export default function NewDeliveryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft, setDraft, addStop, removeStop, updateStop, resetDraft } = useBusinessStore();

  const [loading, setLoading] = useState(false);
  const [step,    setStep]    = useState<1 | 2 | 3>(1);

  const canContinue1 = draft.pickupAddress.trim().length > 5
    && draft.stops.every((s) => s.address.trim().length > 5 && s.recipientName && s.recipientPhone);

  const canContinue2 = !!draft.vehicleType && !!draft.packageCategory;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await businessApi.createDelivery(draft);
      resetDraft();
      Alert.alert(
        'Delivery Created',
        `Tracking: ${res.trackingNumber ?? res.id?.slice(0, 8)}`,
        [{ text: 'OK', onPress: () => router.replace('/(business)/deliveries' as any) }],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to create delivery.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F0' }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => (step > 1 ? setStep((s) => (s - 1) as any) : router.back())}>
          <Icon name="ArrowLeft" size={22} color="#0F2B4C" />
        </Pressable>
        <Text style={styles.headerTitle}>New Delivery</Text>
        <Text style={styles.stepBadge}>Step {step}/3</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(step / 3) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">

        {step === 1 && (
          <>
            <Text style={styles.sectionTitle}>Pickup & Stops</Text>

            <Text style={styles.label}>Pickup Address</Text>
            <TextInput
              style={styles.input}
              value={draft.pickupAddress}
              onChangeText={(v) => setDraft({ pickupAddress: v })}
              placeholder="e.g. 15 Adeola Odeku, Victoria Island"
              placeholderTextColor="#9CA3AF"
            />

            {draft.stops.map((stop, idx) => (
              <View key={idx} style={styles.stopCard}>
                <View style={styles.stopHeader}>
                  <View style={styles.stopBadge}>
                    <Text style={styles.stopBadgeText}>Stop {idx + 1}</Text>
                  </View>
                  {draft.stops.length > 1 && (
                    <Pressable onPress={() => removeStop(idx)}>
                      <Icon name="Trash2" size={16} color="#DC2626" />
                    </Pressable>
                  )}
                </View>
                <Text style={styles.label}>Delivery Address</Text>
                <TextInput
                  style={styles.input}
                  value={stop.address}
                  onChangeText={(v) => updateStop(idx, { address: v })}
                  placeholder="Recipient address"
                  placeholderTextColor="#9CA3AF"
                />
                <Text style={styles.label}>Recipient Name</Text>
                <TextInput
                  style={styles.input}
                  value={stop.recipientName}
                  onChangeText={(v) => updateStop(idx, { recipientName: v })}
                  placeholder="Full name"
                  placeholderTextColor="#9CA3AF"
                />
                <Text style={styles.label}>Recipient Phone</Text>
                <TextInput
                  style={styles.input}
                  value={stop.recipientPhone}
                  onChangeText={(v) => updateStop(idx, { recipientPhone: v })}
                  placeholder="08012345678"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                />
                <Text style={styles.label}>Note (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={stop.note ?? ''}
                  onChangeText={(v) => updateStop(idx, { note: v })}
                  placeholder="Leave at gate, call before delivery, etc."
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            ))}

            {draft.stops.length < 5 && (
              <Pressable
                style={styles.addStopBtn}
                onPress={() => addStop({ address: '', recipientName: '', recipientPhone: '' })}
              >
                <Icon name="Plus" size={16} color="#3A7BD5" />
                <Text style={styles.addStopText}>Add Stop (max 5)</Text>
              </Pressable>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.sectionTitle}>Package & Vehicle</Text>

            <Text style={styles.label}>Package Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {CATEGORIES.map((c) => (
                  <Pressable
                    key={c}
                    style={[styles.chip, draft.packageCategory === c && styles.chipActive]}
                    onPress={() => setDraft({ packageCategory: c })}
                  >
                    <Text style={[styles.chipText, draft.packageCategory === c && styles.chipTextActive]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.label}>Vehicle Type</Text>
            <View style={styles.vehicleGrid}>
              {VEHICLES.map((v) => (
                <Pressable
                  key={v.key}
                  style={[styles.vehicleCard, draft.vehicleType === v.key && styles.vehicleCardActive]}
                  onPress={() => setDraft({ vehicleType: v.key })}
                >
                  <VehicleIcon type={v.key} size={28} color={draft.vehicleType === v.key ? '#3A7BD5' : '#0F2B4C'} />
                  <Text style={[styles.vehicleLabel, draft.vehicleType === v.key && styles.vehicleLabelActive]}>
                    {v.label}
                  </Text>
                  <Text style={styles.vehicleKg}>≤{v.maxKg < 9999 ? `${v.maxKg}kg` : '3t+'}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Approximate Weight (kg, optional)</Text>
            <TextInput
              style={styles.input}
              value={draft.packageWeight?.toString() ?? ''}
              onChangeText={(v) => setDraft({ packageWeight: v ? Number(v) : undefined })}
              placeholder="e.g. 5"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
            />

            <Text style={styles.label}>Special Instructions (optional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              value={draft.specialInstructions ?? ''}
              onChangeText={(v) => setDraft({ specialInstructions: v })}
              placeholder="Fragile, handle with care, etc."
              placeholderTextColor="#9CA3AF"
              multiline
            />
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.sectionTitle}>Schedule</Text>

            <Text style={styles.label}>Schedule for later? (leave off for immediate dispatch)</Text>
            <TextInput
              style={styles.input}
              value={draft.scheduledAt ?? ''}
              onChangeText={(v) => setDraft({ scheduledAt: v || undefined })}
              placeholder="YYYY-MM-DD HH:MM (optional)"
              placeholderTextColor="#9CA3AF"
            />

            <View style={styles.toggleRow}>
              <View>
                <Text style={styles.toggleLabel}>Recurring Delivery</Text>
                <Text style={styles.toggleSub}>Auto-schedule this route repeatedly</Text>
              </View>
              <Switch
                value={draft.isRecurring}
                onValueChange={(v) => setDraft({ isRecurring: v, recurringPattern: v ? 'weekly' : null })}
                trackColor={{ true: '#3A7BD5' }}
                thumbColor="#fff"
              />
            </View>

            {draft.isRecurring && (
              <>
                <Text style={styles.label}>Repeat Pattern</Text>
                <View style={styles.patternRow}>
                  {RECURRING.map((r) => (
                    <Pressable
                      key={r.key}
                      style={[styles.patternBtn, draft.recurringPattern === r.key && styles.patternBtnActive]}
                      onPress={() => setDraft({ recurringPattern: r.key as any })}
                    >
                      <Text style={[styles.patternText, draft.recurringPattern === r.key && styles.patternTextActive]}>
                        {r.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {/* Summary */}
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>Order Summary</Text>
              <SumRow label="Pickup" value={draft.pickupAddress} />
              <SumRow label="Stops" value={`${draft.stops.length} stop${draft.stops.length > 1 ? 's' : ''}`} />
              <SumRow label="Vehicle" value={VEHICLES.find((v) => v.key === draft.vehicleType)?.label ?? '—'} />
              <SumRow label="Category" value={draft.packageCategory ?? '—'} />
              {draft.scheduledAt && <SumRow label="Scheduled" value={draft.scheduledAt} />}
              {draft.isRecurring && <SumRow label="Recurring" value={draft.recurringPattern ?? ''} />}
            </View>
          </>
        )}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        {step < 3 ? (
          <Pressable
            style={[styles.ctaBtn, (!canContinue1 && step === 1) || (!canContinue2 && step === 2) ? styles.ctaBtnDisabled : null]}
            disabled={(step === 1 && !canContinue1) || (step === 2 && !canContinue2)}
            onPress={() => setStep((s) => (s + 1) as any)}
          >
            <Text style={styles.ctaBtnText}>Continue</Text>
            <Icon name="ArrowRight" size={18} color="#fff" />
          </Pressable>
        ) : (
          <Pressable style={styles.ctaBtn} onPress={handleSubmit} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Text style={styles.ctaBtnText}>Confirm & Dispatch</Text>
                  <Icon name="Send" size={18} color="#fff" />
                </>
            }
          </Pressable>
        )}
      </View>
    </View>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.sumRow}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={styles.sumValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header:        {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerTitle:   { fontSize: 16, fontWeight: '700', color: '#0F2B4C' },
  stepBadge:     { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  progressTrack: { height: 3, backgroundColor: '#E5E7EB' },
  progressFill:  { height: 3, backgroundColor: '#3A7BD5' },
  sectionTitle:  { fontSize: 18, fontWeight: '800', color: '#0F2B4C', marginBottom: 16 },
  label:         { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input:         {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: '#E5E7EB', fontSize: 15, color: '#0F2B4C', marginBottom: 14,
  },
  stopCard:      {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  stopHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  stopBadge:     {
    backgroundColor: '#3A7BD5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  stopBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  addStopBtn:    {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#3A7BD5', borderStyle: 'dashed',
    borderRadius: 12, paddingVertical: 14,
  },
  addStopText:   { color: '#3A7BD5', fontWeight: '600', fontSize: 14 },
  chip:          {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
  },
  chipActive:    { backgroundColor: '#0F2B4C', borderColor: '#0F2B4C' },
  chipText:      { fontSize: 13, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  vehicleGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  vehicleCard:   {
    width: '30%', backgroundColor: '#fff', borderRadius: 12,
    padding: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  vehicleCardActive: { borderColor: '#3A7BD5', backgroundColor: '#F0F5FF' },
  vehicleLabel:  { fontSize: 11, fontWeight: '600', color: '#374151', textAlign: 'center' },
  vehicleLabelActive: { color: '#0F2B4C' },
  vehicleKg:     { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  toggleRow:     {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 16,
  },
  toggleLabel:   { fontSize: 14, fontWeight: '600', color: '#0F2B4C' },
  toggleSub:     { fontSize: 12, color: '#6B7280', marginTop: 2 },
  patternRow:    { flexDirection: 'row', gap: 10, marginBottom: 20 },
  patternBtn:    {
    flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center',
  },
  patternBtnActive: { borderColor: '#0F2B4C', backgroundColor: '#0F2B4C' },
  patternText:   { fontSize: 14, fontWeight: '600', color: '#374151' },
  patternTextActive: { color: '#fff' },
  summary:       {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  summaryTitle:  { fontSize: 14, fontWeight: '700', color: '#0F2B4C', marginBottom: 14 },
  sumRow:        { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  sumLabel:      { fontSize: 13, color: '#6B7280' },
  sumValue:      { fontSize: 13, fontWeight: '600', color: '#0F2B4C', flex: 1, textAlign: 'right' },
  cta:           { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: '#F5F5F0', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  ctaBtn:        {
    backgroundColor: '#0F2B4C', borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  ctaBtnDisabled: { opacity: 0.4 },
  ctaBtnText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
});
