import {
  View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows, Palette } from '@/constants/theme';

const BASE_URL = __DEV__
  ? 'http://192.168.2.113:3000/api/v1'
  : 'https://api.seirs.app/api/v1';

interface DeliveryRow {
  pickupAddress:   string;
  pickupLat:       string;
  pickupLng:       string;
  dropoffAddress:  string;
  dropoffLat:      string;
  dropoffLng:      string;
  packageDescription: string;
}

const emptyRow = (): DeliveryRow => ({
  pickupAddress: '', pickupLat: '6.4550', pickupLng: '3.3841',
  dropoffAddress: '', dropoffLat: '6.5244', dropoffLng: '3.3792',
  packageDescription: '',
});

export default function BusinessScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [rows,       setRows]       = useState<DeliveryRow[]>([emptyRow()]);
  const [poRef,      setPoRef]      = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result,     setResult]     = useState<any>(null);

  const addRow = () => {
    if (rows.length >= 20) return;
    setRows([...rows, emptyRow()]);
  };

  const removeRow = (i: number) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, idx) => idx !== i));
  };

  const updateRow = (i: number, field: keyof DeliveryRow, value: string) => {
    setRows(rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };

  const submit = async () => {
    const incomplete = rows.some(r => !r.pickupAddress || !r.dropoffAddress || !r.packageDescription);
    if (incomplete) {
      Alert.alert('Missing Info', 'Please fill in all address and description fields.');
      return;
    }

    setSubmitting(true);
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const stored = await AsyncStorage.getItem('seirs_user');
      const token = stored ? JSON.parse(stored).token : null;

      const res = await fetch(`${BASE_URL}/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          poReference:   poRef || undefined,
          paymentMethod: 'cash_on_delivery',
          deliveries: rows.map(r => ({
            pickupAddress:      r.pickupAddress,
            pickupLat:          parseFloat(r.pickupLat),
            pickupLng:          parseFloat(r.pickupLng),
            dropoffAddress:     r.dropoffAddress,
            dropoffLat:         parseFloat(r.dropoffLat),
            dropoffLng:         parseFloat(r.dropoffLng),
            packageDescription: r.packageDescription,
            packageSize:        'small',
            isFragile:          false,
            urgency:            'standard',
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Failed');
      setResult(data);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to submit bulk order.');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl }}>
          <View style={styles.successIcon}>
            <CheckCircle2 size={56} color={theme.success ?? '#16A34A'} strokeWidth={1.5} />
          </View>
          <Text style={[styles.successTitle, { color: theme.text }]}>Bulk Order Placed!</Text>
          <Text style={[styles.successSub, { color: theme.textSecond }]}>
            {result.orderCount} deliveries created
            {result.discountApplied ? ` · ${result.discountRate} B2B discount applied` : ''}
          </Text>

          <View style={[styles.totalCard, { backgroundColor: theme.primary }]}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalAmount}>₦{result.totalPrice?.toLocaleString()}</Text>
          </View>

          <View style={{ gap: Spacing.sm, marginBottom: Spacing.xl }}>
            {result.deliveries?.map((d: any) => (
              <View key={d.index} style={[styles.resultRow, { backgroundColor: theme.surface }, Shadows.sm]}>
                <Text style={[styles.resultIdx, { color: theme.textSecond }]}>#{d.index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resultCode, { color: theme.text }]}>{d.trackingCode}</Text>
                </View>
                <Text style={[styles.resultPrice, { color: theme.primary }]}>₦{d.price?.toLocaleString()}</Text>
              </View>
            ))}
          </View>

          <Pressable
            style={[styles.btn, { backgroundColor: theme.primary }]}
            onPress={() => router.replace('/(customer)')}
          >
            <Text style={styles.btnText}>Back to Home</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme.primary }]}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Bulk Delivery</Text>
          <Text style={[styles.headerSub, { color: theme.textSecond }]}>5+ orders get 10% off</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: rows.length >= 5 ? Palette.success : theme.primary }]}>
          <Text style={styles.badgeText}>{rows.length} orders</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.xl }}>

        {/* PO Reference */}
        <TextInput
          style={[styles.poInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
          placeholder="PO Reference (optional)"
          placeholderTextColor={theme.textSecond}
          value={poRef}
          onChangeText={setPoRef}
        />

        {/* Discount banner */}
        {rows.length >= 5 && (
          <View style={[styles.discountBanner, { backgroundColor: Palette.success + '18' }]}>
            <Text style={{ color: Palette.success, fontWeight: FontWeight.bold, fontSize: FontSize.sm }}>
              ✓ 10% B2B discount applied — {rows.length} orders
            </Text>
          </View>
        )}
        {rows.length < 5 && (
          <View style={[styles.discountBanner, { backgroundColor: theme.surfaceSecond }]}>
            <Text style={{ color: theme.textSecond, fontSize: FontSize.sm }}>
              Add {5 - rows.length} more order{5 - rows.length !== 1 ? 's' : ''} to unlock 10% discount
            </Text>
          </View>
        )}

        {/* Delivery rows */}
        {rows.map((row, i) => (
          <View key={i} style={[styles.deliveryCard, { backgroundColor: theme.surface }, Shadows.sm]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardNum, { color: theme.primary }]}>Delivery #{i + 1}</Text>
              {rows.length > 1 && (
                <Pressable onPress={() => removeRow(i)}>
                  <Text style={{ color: theme.error, fontSize: FontSize.sm }}>Remove</Text>
                </Pressable>
              )}
            </View>

            <TextInput
              style={[styles.field, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceSecond }]}
              placeholder="Pickup address"
              placeholderTextColor={theme.textSecond}
              value={row.pickupAddress}
              onChangeText={(v) => updateRow(i, 'pickupAddress', v)}
            />
            <View style={styles.coordRow}>
              <TextInput
                style={[styles.coordField, { flex: 1, borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceSecond }]}
                placeholder="Pickup Lat"
                value={row.pickupLat}
                onChangeText={(v) => updateRow(i, 'pickupLat', v)}
                keyboardType="decimal-pad"
                placeholderTextColor={theme.textSecond}
              />
              <TextInput
                style={[styles.coordField, { flex: 1, borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceSecond }]}
                placeholder="Pickup Lng"
                value={row.pickupLng}
                onChangeText={(v) => updateRow(i, 'pickupLng', v)}
                keyboardType="decimal-pad"
                placeholderTextColor={theme.textSecond}
              />
            </View>

            <TextInput
              style={[styles.field, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceSecond }]}
              placeholder="Drop-off address"
              placeholderTextColor={theme.textSecond}
              value={row.dropoffAddress}
              onChangeText={(v) => updateRow(i, 'dropoffAddress', v)}
            />
            <View style={styles.coordRow}>
              <TextInput
                style={[styles.coordField, { flex: 1, borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceSecond }]}
                placeholder="Dropoff Lat"
                value={row.dropoffLat}
                onChangeText={(v) => updateRow(i, 'dropoffLat', v)}
                keyboardType="decimal-pad"
                placeholderTextColor={theme.textSecond}
              />
              <TextInput
                style={[styles.coordField, { flex: 1, borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceSecond }]}
                placeholder="Dropoff Lng"
                value={row.dropoffLng}
                onChangeText={(v) => updateRow(i, 'dropoffLng', v)}
                keyboardType="decimal-pad"
                placeholderTextColor={theme.textSecond}
              />
            </View>

            <TextInput
              style={[styles.field, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceSecond }]}
              placeholder="Package description"
              placeholderTextColor={theme.textSecond}
              value={row.packageDescription}
              onChangeText={(v) => updateRow(i, 'packageDescription', v)}
            />
          </View>
        ))}

        {/* Add row */}
        {rows.length < 20 && (
          <Pressable style={[styles.addBtn, { borderColor: theme.primary }]} onPress={addRow}>
            <Text style={[styles.addBtnText, { color: theme.primary }]}>+ Add Another Delivery</Text>
          </Pressable>
        )}

        {/* Submit */}
        <Pressable
          style={[styles.btn, { backgroundColor: submitting ? theme.border : theme.primary, marginTop: Spacing.lg }]}
          onPress={submit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Submit {rows.length} Deliver{rows.length !== 1 ? 'ies' : 'y'}</Text>}
        </Pressable>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backText: { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  headerSub: { fontSize: FontSize.xs },
  badge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full,
  },
  badgeText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  poInput: {
    borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, height: 48,
    fontSize: FontSize.base, marginBottom: Spacing.sm,
  },
  discountBanner: {
    padding: Spacing.sm, borderRadius: Radius.md,
    marginBottom: Spacing.md, alignItems: 'center',
  },
  deliveryCard: {
    borderRadius: Radius.lg, padding: Spacing.md,
    marginBottom: Spacing.md, gap: Spacing.xs,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  cardNum: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  field: {
    borderWidth: 1, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, height: 44, fontSize: FontSize.sm,
  },
  coordRow: { flexDirection: 'row', gap: Spacing.xs },
  coordField: {
    borderWidth: 1, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, height: 36, fontSize: FontSize.xs,
  },
  addBtn: {
    height: 48, borderRadius: Radius.md, borderWidth: 1.5, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', marginTop: Spacing.sm,
  },
  addBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  btn: {
    height: 56, borderRadius: Radius.lg,
    justifyContent: 'center', alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  successIcon: { alignItems: 'center', marginBottom: Spacing.md },
  successTitle: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, textAlign: 'center', marginBottom: Spacing.sm },
  successSub: { fontSize: FontSize.sm, textAlign: 'center', marginBottom: Spacing.xl },
  totalCard: {
    borderRadius: Radius.lg, padding: Spacing.xl,
    alignItems: 'center', marginBottom: Spacing.xl,
  },
  totalLabel: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm, marginBottom: Spacing.xs },
  totalAmount: { color: '#fff', fontSize: FontSize['3xl'], fontWeight: FontWeight.bold },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.md,
  },
  resultIdx: { fontSize: FontSize.sm, width: 28 },
  resultCode: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  resultPrice: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
