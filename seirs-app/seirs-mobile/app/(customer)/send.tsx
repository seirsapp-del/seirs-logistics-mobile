import {
  View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, Switch, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { deliveriesApi } from '@/services/api';
import AddressPicker from '@/components/AddressPicker';

type PackageSize = 'small' | 'medium' | 'large';
type Urgency    = 'economy' | 'standard' | 'instant';

const SIZES: { key: PackageSize; label: string; desc: string; icon: string }[] = [
  { key: 'small',  label: 'Small',  desc: 'Docs, phones, small items', icon: '📄' },
  { key: 'medium', label: 'Medium', desc: 'Bags, small boxes',         icon: '🎒' },
  { key: 'large',  label: 'Large',  desc: 'Large boxes, appliances',   icon: '📦' },
];

const URGENCIES: { key: Urgency; label: string; eta: string; icon: string; color: string }[] = [
  { key: 'economy',  label: 'Economy',  eta: '2-3 days',  icon: '💚', color: '#22C55E' },
  { key: 'standard', label: 'Standard', eta: 'Next day',  icon: '🚀', color: '#3B82F6' },
  { key: 'instant',  label: 'Instant',  eta: '1-3 hours', icon: '⚡', color: '#F4600C' },
];

const PAYMENT_METHODS = [
  { key: 'card',             label: '💳 Card' },
  { key: 'bank_transfer',    label: '🏦 Bank Transfer' },
  { key: 'mobile_money',     label: '📱 Mobile Money' },
  { key: 'cash_on_delivery', label: '💵 Cash on Delivery' },
  { key: 'wallet',           label: '👛 Wallet' },
];

export default function SendScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 — locations
  const [pickupAddress,  setPickupAddress]  = useState('');
  const [pickupLat,      setPickupLat]      = useState(0);
  const [pickupLng,      setPickupLng]      = useState(0);
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffLat,     setDropoffLat]     = useState(0);
  const [dropoffLng,     setDropoffLng]     = useState(0);

  // Step 2 — package
  const [description, setDescription] = useState('');
  const [size,        setSize]        = useState<PackageSize>('small');
  const [isFragile,   setIsFragile]   = useState(false);

  // Step 3 — quotes
  const [quotes,    setQuotes]    = useState<any>(null);
  const [urgency,   setUrgency]   = useState<Urgency>('standard');
  const [quoting,   setQuoting]   = useState(false);

  // Step 4 — confirm
  const [paymentMethod, setPaymentMethod] = useState('cash_on_delivery');
  const [confirming,    setConfirming]    = useState(false);

  const fetchQuote = async () => {
    setQuoting(true);
    try {
      const data = await deliveriesApi.quote({
        pickupLat,
        pickupLng,
        dropoffLat,
        dropoffLng,
        packageSize: size,
        isFragile,
      });
      setQuotes(data);
      setStep(3);
    } catch (e: any) {
      Alert.alert('Quote Failed', e.message ?? 'Unable to get price. Check your inputs.');
    } finally {
      setQuoting(false);
    }
  };

  const confirmOrder = async () => {
    setConfirming(true);
    try {
      const delivery = await deliveriesApi.create({
        pickupAddress,
        pickupLat,
        pickupLng,
        dropoffAddress,
        dropoffLat,
        dropoffLng,
        packageDescription: description,
        packageSize:       size,
        isFragile,
        urgency,
        paymentMethod,
      });

      if (paymentMethod === 'cash_on_delivery' || paymentMethod === 'wallet') {
        Alert.alert('Order Placed!', `Tracking code: ${delivery.trackingCode}`, [
          { text: 'Track It', onPress: () => router.replace('/(customer)/track') },
          { text: 'Done',     onPress: () => router.replace('/(customer)') },
        ]);
      } else {
        router.push(`/(customer)/payment/${delivery.id}`);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to place order.');
    } finally {
      setConfirming(false);
    }
  };

  const selectedQuote = quotes?.[urgency];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => step > 1 ? setStep((step - 1) as any) : router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme.primary }]}>←</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {step === 1 ? 'Locations' : step === 2 ? 'Package Details' : step === 3 ? 'Choose Plan' : 'Confirm Order'}
        </Text>
        <Text style={[styles.stepLabel, { color: theme.textSecond }]}>{step}/4</Text>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
        <View style={[styles.progressFill, { backgroundColor: theme.primary, width: `${(step / 4) * 100}%` }]} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.xl }}>

        {/* ── STEP 1: Locations ─────────────────────────────────────── */}
        {step === 1 && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Where from?</Text>
            <AddressPicker
              label="Pickup Address"
              dotColor={theme.success}
              value={pickupAddress}
              onSelect={(p) => {
                setPickupAddress(p.address);
                setPickupLat(p.lat);
                setPickupLng(p.lng);
              }}
            />

            <View style={{ height: Spacing.md }} />

            <Text style={[styles.sectionTitle, { color: theme.text, marginTop: Spacing.md }]}>Where to?</Text>
            <AddressPicker
              label="Drop-off Address"
              dotColor={theme.error}
              value={dropoffAddress}
              onSelect={(p) => {
                setDropoffAddress(p.address);
                setDropoffLat(p.lat);
                setDropoffLng(p.lng);
              }}
            />

            <Pressable
              style={[styles.btn, { backgroundColor: pickupAddress && dropoffAddress && pickupLat && dropoffLat ? theme.primary : theme.border, marginTop: Spacing.xl }]}
              onPress={() => setStep(2)}
              disabled={!pickupAddress || !dropoffAddress || !pickupLat || !dropoffLat}
            >
              <Text style={styles.btnText}>Next: Package Details →</Text>
            </Pressable>
          </>
        )}

        {/* ── STEP 2: Package ───────────────────────────────────────── */}
        {step === 2 && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>What are you sending?</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface, marginBottom: Spacing.lg }, Shadows.sm]}
              placeholder="e.g. Documents, birthday cake, laptop"
              placeholderTextColor={theme.textSecond}
              value={description}
              onChangeText={setDescription}
            />

            <Text style={[styles.sectionTitle, { color: theme.text }]}>Package Size</Text>
            <View style={{ gap: Spacing.sm, marginBottom: Spacing.lg }}>
              {SIZES.map((s) => (
                <Pressable
                  key={s.key}
                  style={[
                    styles.optionRow,
                    { backgroundColor: theme.surface, borderColor: size === s.key ? theme.primary : theme.border },
                    Shadows.sm,
                  ]}
                  onPress={() => setSize(s.key)}
                >
                  <Text style={styles.optionIcon}>{s.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionLabel, { color: theme.text }]}>{s.label}</Text>
                    <Text style={[styles.optionDesc, { color: theme.textSecond }]}>{s.desc}</Text>
                  </View>
                  {size === s.key && <Text style={{ color: theme.primary, fontSize: 18 }}>✓</Text>}
                </Pressable>
              ))}
            </View>

            <View style={[styles.fragileRow, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { color: theme.text }]}>🫙 Fragile Item</Text>
                <Text style={[styles.optionDesc, { color: theme.textSecond }]}>Adds ₦150 handling fee</Text>
              </View>
              <Switch
                value={isFragile}
                onValueChange={setIsFragile}
                trackColor={{ true: theme.primary }}
                thumbColor="#fff"
              />
            </View>

            <Pressable
              style={[styles.btn, { backgroundColor: description ? theme.primary : theme.border, marginTop: Spacing.lg }]}
              onPress={fetchQuote}
              disabled={!description || quoting}
            >
              {quoting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Get Price Quote →</Text>}
            </Pressable>
          </>
        )}

        {/* ── STEP 3: Quotes ────────────────────────────────────────── */}
        {step === 3 && quotes && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Choose Delivery Speed</Text>
            <View style={{ gap: Spacing.sm, marginBottom: Spacing.lg }}>
              {URGENCIES.map((u) => {
                const q = quotes[u.key];
                return (
                  <Pressable
                    key={u.key}
                    style={[
                      styles.quoteCard,
                      { backgroundColor: theme.surface, borderColor: urgency === u.key ? u.color : theme.border },
                      Shadows.sm,
                    ]}
                    onPress={() => setUrgency(u.key)}
                  >
                    <View style={[styles.quoteIconWrap, { backgroundColor: u.color + '18' }]}>
                      <Text style={{ fontSize: 24 }}>{u.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionLabel, { color: theme.text }]}>{u.label}</Text>
                      <Text style={[styles.optionDesc, { color: theme.textSecond }]}>ETA: {u.eta}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.price, { color: u.color }]}>₦{q?.price?.toLocaleString()}</Text>
                      {urgency === u.key && <Text style={{ color: u.color, fontSize: FontSize.xs }}>Selected ✓</Text>}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {selectedQuote && (
              <View style={[styles.breakdownCard, { backgroundColor: theme.surfaceSecond }]}>
                <Text style={[styles.breakdownTitle, { color: theme.text }]}>Price Breakdown</Text>
                {[
                  ['Base fare',    `₦${selectedQuote.breakdown?.base}`],
                  ['Distance',     `₦${selectedQuote.breakdown?.distance}`],
                  ['Size fee',     `₦${selectedQuote.breakdown?.sizeFee}`],
                  ['Urgency fee',  `₦${selectedQuote.breakdown?.urgencyFee}`],
                  ['Fragile fee',  `₦${selectedQuote.breakdown?.fragileFee}`],
                ].map(([k, v]) => (
                  <View key={k} style={styles.breakdownRow}>
                    <Text style={[styles.breakdownKey, { color: theme.textSecond }]}>{k}</Text>
                    <Text style={[styles.breakdownVal, { color: theme.text }]}>{v}</Text>
                  </View>
                ))}
                <View style={[styles.breakdownDivider, { backgroundColor: theme.border }]} />
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownKey, { color: theme.text, fontWeight: FontWeight.bold }]}>Total</Text>
                  <Text style={[styles.breakdownVal, { color: theme.primary, fontWeight: FontWeight.bold }]}>
                    ₦{selectedQuote.price?.toLocaleString()}
                  </Text>
                </View>
              </View>
            )}

            <Pressable
              style={[styles.btn, { backgroundColor: theme.primary, marginTop: Spacing.lg }]}
              onPress={() => setStep(4)}
            >
              <Text style={styles.btnText}>Continue →</Text>
            </Pressable>
          </>
        )}

        {/* ── STEP 4: Confirm ───────────────────────────────────────── */}
        {step === 4 && (
          <>
            <View style={[styles.summaryCard, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Order Summary</Text>
              {[
                ['From',    pickupAddress],
                ['To',      dropoffAddress],
                ['Package', description],
                ['Size',    size],
                ['Speed',   URGENCIES.find(u => u.key === urgency)?.label ?? urgency],
                ['Fragile', isFragile ? 'Yes (+₦150)' : 'No'],
                ['Total',   `₦${selectedQuote?.price?.toLocaleString() ?? '—'}`],
              ].map(([k, v]) => (
                <View key={k} style={styles.summaryRow}>
                  <Text style={[styles.summaryKey, { color: theme.textSecond }]}>{k}</Text>
                  <Text style={[styles.summaryVal, { color: k === 'Total' ? theme.primary : theme.text, fontWeight: k === 'Total' ? FontWeight.bold : FontWeight.regular }]}>
                    {v}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { color: theme.text, marginTop: Spacing.lg }]}>Payment Method</Text>
            <View style={{ gap: Spacing.sm, marginBottom: Spacing.lg }}>
              {PAYMENT_METHODS.map((m) => (
                <Pressable
                  key={m.key}
                  style={[
                    styles.optionRow,
                    { backgroundColor: theme.surface, borderColor: paymentMethod === m.key ? theme.primary : theme.border },
                    Shadows.sm,
                  ]}
                  onPress={() => setPaymentMethod(m.key)}
                >
                  <Text style={[styles.optionLabel, { color: theme.text, flex: 1 }]}>{m.label}</Text>
                  {paymentMethod === m.key && <Text style={{ color: theme.primary }}>✓</Text>}
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[styles.btn, { backgroundColor: confirming ? theme.border : theme.primary }]}
              onPress={confirmOrder}
              disabled={confirming}
            >
              {confirming
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Place Order</Text>}
            </Pressable>
          </>
        )}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backText: { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  stepLabel: { fontSize: FontSize.sm },
  progressTrack: { height: 3 },
  progressFill: { height: 3 },
  input: {
    borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, height: 52,
    fontSize: FontSize.base,
  },
  btn: {
    height: 56, borderRadius: Radius.lg,
    justifyContent: 'center', alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, marginBottom: Spacing.md },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 2,
  },
  optionIcon: { fontSize: 28 },
  optionLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  optionDesc: { fontSize: FontSize.xs, marginTop: 2 },
  fragileRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5,
  },
  quoteCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 2,
  },
  quoteIconWrap: {
    width: 52, height: 52, borderRadius: Radius.md,
    justifyContent: 'center', alignItems: 'center',
  },
  price: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  breakdownCard: { borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.xs },
  breakdownTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, marginBottom: Spacing.xs },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between' },
  breakdownKey: { fontSize: FontSize.sm },
  breakdownVal: { fontSize: FontSize.sm },
  breakdownDivider: { height: 1, marginVertical: Spacing.xs },
  summaryCard: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryKey: { fontSize: FontSize.sm },
  summaryVal: { fontSize: FontSize.sm, maxWidth: '60%', textAlign: 'right' },
});
