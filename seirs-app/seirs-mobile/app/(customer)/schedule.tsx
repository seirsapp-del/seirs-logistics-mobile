import {
  View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { deliveriesApi } from '@/services/api';

const SIZES = [
  { key: 'small',  label: 'Small',  icon: '📄' },
  { key: 'medium', label: 'Medium', icon: '🎒' },
  { key: 'large',  label: 'Large',  icon: '📦' },
] as const;

type PackageSize = typeof SIZES[number]['key'];

export default function ScheduleScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [pickupAddress,  setPickupAddress]  = useState('');
  const [pickupLat,      setPickupLat]      = useState('6.4550');
  const [pickupLng,      setPickupLng]      = useState('3.3841');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffLat,     setDropoffLat]     = useState('6.5244');
  const [dropoffLng,     setDropoffLng]     = useState('3.3792');
  const [description,    setDescription]    = useState('');
  const [size,           setSize]           = useState<PackageSize>('small');
  const [scheduleDate,   setScheduleDate]   = useState('');
  const [scheduleTime,   setScheduleTime]   = useState('');
  const [submitting,     setSubmitting]     = useState(false);

  const today = new Date();
  const minDate = today.toISOString().split('T')[0];

  const isValid =
    pickupAddress && dropoffAddress && description && scheduleDate && scheduleTime;

  const submit = async () => {
    setSubmitting(true);
    try {
      const delivery = await deliveriesApi.create({
        pickupAddress,
        pickupLat:          parseFloat(pickupLat),
        pickupLng:          parseFloat(pickupLng),
        dropoffAddress,
        dropoffLat:         parseFloat(dropoffLat),
        dropoffLng:         parseFloat(dropoffLng),
        packageDescription: description,
        packageSize:        size,
        isFragile:          false,
        urgency:            'economy',
        paymentMethod:      'cash_on_delivery',
        scheduledFor:       `${scheduleDate}T${scheduleTime}:00`,
      });

      Alert.alert(
        'Scheduled!',
        `Your delivery is scheduled for ${scheduleDate} at ${scheduleTime}.\nTracking: ${delivery.trackingCode}`,
        [{ text: 'OK', onPress: () => router.replace('/(customer)') }],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to schedule delivery.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme.primary }]}>←</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Schedule Delivery</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.xl }}>

        {/* Date & Time */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>🗓️ When to pick up?</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceSecond }]}
                placeholder={minDate}
                placeholderTextColor={theme.textSecond}
                value={scheduleDate}
                onChangeText={setScheduleDate}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>Time (HH:MM)</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceSecond }]}
                placeholder="09:00"
                placeholderTextColor={theme.textSecond}
                value={scheduleTime}
                onChangeText={setScheduleTime}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
        </View>

        {/* Locations */}
        <View style={[styles.card, { backgroundColor: theme.surface, marginTop: Spacing.md }, Shadows.sm]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>📍 Locations</Text>
          <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>Pickup Address</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceSecond, marginBottom: Spacing.sm }]}
            placeholder="Pickup address"
            placeholderTextColor={theme.textSecond}
            value={pickupAddress}
            onChangeText={setPickupAddress}
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.coordInput, { flex: 1, borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceSecond }]}
              placeholder="Lat: 6.4550"
              placeholderTextColor={theme.textSecond}
              value={pickupLat}
              onChangeText={setPickupLat}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={[styles.coordInput, { flex: 1, borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceSecond }]}
              placeholder="Lng: 3.3841"
              placeholderTextColor={theme.textSecond}
              value={pickupLng}
              onChangeText={setPickupLng}
              keyboardType="decimal-pad"
            />
          </View>

          <Text style={[styles.fieldLabel, { color: theme.textSecond, marginTop: Spacing.md }]}>Drop-off Address</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceSecond, marginBottom: Spacing.sm }]}
            placeholder="Drop-off address"
            placeholderTextColor={theme.textSecond}
            value={dropoffAddress}
            onChangeText={setDropoffAddress}
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.coordInput, { flex: 1, borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceSecond }]}
              placeholder="Lat: 6.5244"
              placeholderTextColor={theme.textSecond}
              value={dropoffLat}
              onChangeText={setDropoffLat}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={[styles.coordInput, { flex: 1, borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceSecond }]}
              placeholder="Lng: 3.3792"
              placeholderTextColor={theme.textSecond}
              value={dropoffLng}
              onChangeText={setDropoffLng}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Package */}
        <View style={[styles.card, { backgroundColor: theme.surface, marginTop: Spacing.md }, Shadows.sm]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>📦 Package</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceSecond, marginBottom: Spacing.md }]}
            placeholder="Package description"
            placeholderTextColor={theme.textSecond}
            value={description}
            onChangeText={setDescription}
          />
          <View style={styles.sizeRow}>
            {SIZES.map((s) => (
              <Pressable
                key={s.key}
                style={[
                  styles.sizeBtn,
                  { backgroundColor: size === s.key ? theme.primary : theme.surfaceSecond,
                    borderColor: size === s.key ? theme.primary : theme.border },
                ]}
                onPress={() => setSize(s.key)}
              >
                <Text style={{ fontSize: 20 }}>{s.icon}</Text>
                <Text style={[styles.sizeBtnLabel, { color: size === s.key ? '#fff' : theme.text }]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable
          style={[styles.submitBtn, { backgroundColor: isValid && !submitting ? theme.primary : theme.border, marginTop: Spacing.xl }]}
          onPress={submit}
          disabled={!isValid || submitting}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitBtnText}>Schedule Delivery</Text>}
        </Pressable>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backText: { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  card: { borderRadius: Radius.lg, padding: Spacing.lg },
  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: Spacing.md },
  row: { flexDirection: 'row', gap: Spacing.sm },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, marginBottom: 4 },
  input: {
    borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, height: 48, fontSize: FontSize.base,
  },
  coordInput: {
    borderWidth: 1, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, height: 40, fontSize: FontSize.sm,
  },
  sizeRow: { flexDirection: 'row', gap: Spacing.sm },
  sizeBtn: {
    flex: 1, padding: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1.5, alignItems: 'center', gap: 4,
  },
  sizeBtnLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  submitBtn: {
    height: 56, borderRadius: Radius.lg,
    justifyContent: 'center', alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
