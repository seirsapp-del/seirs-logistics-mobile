import {
  View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, Switch, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { deliveriesApi } from '@/services/api';
import AddressPicker from '@/components/AddressPicker';

type PackageSize = 'small' | 'medium' | 'large';
type Urgency     = 'economy' | 'standard' | 'instant';

const SIZES: { key: PackageSize; label: string; desc: string; icon: string }[] = [
  { key: 'small',  label: 'Small',  desc: 'Docs, phones, small items', icon: 'document-outline' },
  { key: 'medium', label: 'Medium', desc: 'Bags, small boxes',         icon: 'bag-handle-outline' },
  { key: 'large',  label: 'Large',  desc: 'Large boxes, appliances',   icon: 'cube-outline' },
];

const URGENCIES: { key: Urgency; label: string; eta: string; icon: string; color: string }[] = [
  { key: 'economy',  label: 'Economy',  eta: '2–3 days',  icon: 'leaf-outline',     color: '#22C55E' },
  { key: 'standard', label: 'Standard', eta: 'Next day',  icon: 'navigate-outline', color: '#3A86FF' },
  { key: 'instant',  label: 'Instant',  eta: '1–3 hours', icon: 'flash',            color: '#FF6B00' },
];

const PAYMENT_METHODS: { key: string; label: string; icon: string }[] = [
  { key: 'card',             label: 'Card',             icon: 'card-outline' },
  { key: 'bank_transfer',    label: 'Bank Transfer',    icon: 'business-outline' },
  { key: 'mobile_money',     label: 'Mobile Money',     icon: 'phone-portrait-outline' },
  { key: 'cash_on_delivery', label: 'Cash on Delivery', icon: 'cash-outline' },
  { key: 'wallet',           label: 'Wallet',           icon: 'wallet-outline' },
];

const STEP_LABELS = ['Locations', 'Package', 'Choose Plan', 'Confirm'];

export default function SendScreen() {
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [pickupAddress,  setPickupAddress]  = useState('');
  const [pickupLat,      setPickupLat]      = useState(0);
  const [pickupLng,      setPickupLng]      = useState(0);
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffLat,     setDropoffLat]     = useState(0);
  const [dropoffLng,     setDropoffLng]     = useState(0);

  const [description,   setDescription]   = useState('');
  const [size,          setSize]          = useState<PackageSize>('small');
  const [isFragile,     setIsFragile]     = useState(false);

  const [quotes,    setQuotes]    = useState<any>(null);
  const [urgency,   setUrgency]   = useState<Urgency>('standard');
  const [quoting,   setQuoting]   = useState(false);

  const [paymentMethod, setPaymentMethod] = useState('cash_on_delivery');
  const [confirming,    setConfirming]    = useState(false);

  const fetchQuote = async () => {
    setQuoting(true);
    try {
      const data = await deliveriesApi.quote({ pickupLat, pickupLng, dropoffLat, dropoffLng, packageSize: size, isFragile });
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
        pickupAddress, pickupLat, pickupLng,
        dropoffAddress, dropoffLat, dropoffLng,
        packageDescription: description, packageSize: size,
        isFragile, urgency, paymentMethod,
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
  const step1Valid    = !!(pickupAddress && dropoffAddress && pickupLat && dropoffLat);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      {/* Header */}
      <View style={[styles.headerBar, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <Pressable
          onPress={() => step > 1 ? setStep((step - 1) as any) : router.back()}
          style={[styles.backCircle, { backgroundColor: theme.surface }]}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{STEP_LABELS[step - 1]}</Text>
          <Text style={[styles.stepIndicator, { color: theme.textSecond }]}>Step {step} of 4</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
        <View style={[styles.progressFill, { backgroundColor: theme.primary, width: `${(step / 4) * 100}%` }]} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ── STEP 1: Locations ─────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Pickup location</Text>
            <AddressPicker
              label="Pickup Address"
              dotColor={theme.success}
              value={pickupAddress}
              onSelect={(p) => { setPickupAddress(p.address); setPickupLat(p.lat); setPickupLng(p.lng); }}
            />
            <View style={{ height: Spacing.lg }} />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Drop-off location</Text>
            <AddressPicker
              label="Drop-off Address"
              dotColor={theme.error}
              value={dropoffAddress}
              onSelect={(p) => { setDropoffAddress(p.address); setDropoffLat(p.lat); setDropoffLng(p.lng); }}
            />
            <Pressable
              style={[styles.btn, { backgroundColor: step1Valid ? theme.primary : theme.border, marginTop: Spacing.xl }]}
              onPress={() => setStep(2)}
              disabled={!step1Valid}
            >
              <Text style={styles.btnText}>Next: Package Details</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </Pressable>
          </>
        )}

        {/* ── STEP 2: Package ───────────────────────────────────────────── */}
        {step === 2 && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>What are you sending?</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
              <Ionicons name="cube-outline" size={18} color={theme.textThird} style={{ marginRight: Spacing.sm }} />
              <TextInput
                style={[styles.textInput, { color: theme.text }]}
                placeholder="e.g. Documents, birthday cake, laptop"
                placeholderTextColor={theme.textThird}
                value={description}
                onChangeText={setDescription}
              />
            </View>

            <Text style={[styles.sectionTitle, { color: theme.text, marginTop: Spacing.lg }]}>Package size</Text>
            <View style={styles.optionList}>
              {SIZES.map((s) => {
                const selected = size === s.key;
                return (
                  <Pressable
                    key={s.key}
                    style={[
                      styles.optionRow,
                      { backgroundColor: theme.surface, borderColor: selected ? theme.primary : theme.border },
                      Shadows.sm,
                    ]}
                    onPress={() => setSize(s.key)}
                  >
                    <View style={[styles.optionIconWrap, { backgroundColor: selected ? theme.primary + '18' : theme.surfaceSecond }]}>
                      <Ionicons name={s.icon as any} size={22} color={selected ? theme.primary : theme.textSecond} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionLabel, { color: theme.text }]}>{s.label}</Text>
                      <Text style={[styles.optionDesc, { color: theme.textSecond }]}>{s.desc}</Text>
                    </View>
                    {selected && <Ionicons name="checkmark-circle" size={22} color={theme.primary} />}
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.fragileRow, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
              <View style={[styles.optionIconWrap, { backgroundColor: '#FFF7E0' }]}>
                <Ionicons name="warning-outline" size={22} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { color: theme.text }]}>Fragile Item</Text>
                <Text style={[styles.optionDesc, { color: theme.textSecond }]}>Adds ₦150 handling fee</Text>
              </View>
              <Switch
                value={isFragile}
                onValueChange={setIsFragile}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor="#fff"
              />
            </View>

            <Pressable
              style={[styles.btn, { backgroundColor: description ? theme.primary : theme.border, marginTop: Spacing.lg }]}
              onPress={fetchQuote}
              disabled={!description || quoting}
            >
              {quoting ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Text style={styles.btnText}>Get Price Quote</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
              )}
            </Pressable>
          </>
        )}

        {/* ── STEP 3: Quotes ────────────────────────────────────────────── */}
        {step === 3 && quotes && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Choose delivery speed</Text>
            <View style={styles.optionList}>
              {URGENCIES.map((u) => {
                const q        = quotes[u.key];
                const selected = urgency === u.key;
                return (
                  <Pressable
                    key={u.key}
                    style={[
                      styles.optionRow,
                      { backgroundColor: theme.surface, borderColor: selected ? u.color : theme.border },
                      Shadows.sm,
                    ]}
                    onPress={() => setUrgency(u.key)}
                  >
                    <View style={[styles.optionIconWrap, { backgroundColor: u.color + '18' }]}>
                      <Ionicons name={u.icon as any} size={22} color={u.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionLabel, { color: theme.text }]}>{u.label}</Text>
                      <Text style={[styles.optionDesc, { color: theme.textSecond }]}>ETA: {u.eta}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      <Text style={[styles.price, { color: u.color }]}>₦{q?.price?.toLocaleString()}</Text>
                      {selected && <Ionicons name="checkmark-circle" size={16} color={u.color} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {selectedQuote && (
              <View style={[styles.breakdownCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
                <Text style={[styles.breakdownTitle, { color: theme.text }]}>Price Breakdown</Text>
                {[
                  ['Base fare',   `₦${selectedQuote.breakdown?.base}`],
                  ['Distance',    `₦${selectedQuote.breakdown?.distance}`],
                  ['Size fee',    `₦${selectedQuote.breakdown?.sizeFee}`],
                  ['Urgency fee', `₦${selectedQuote.breakdown?.urgencyFee}`],
                  ['Fragile fee', `₦${selectedQuote.breakdown?.fragileFee}`],
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
              <Text style={styles.btnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </Pressable>
          </>
        )}

        {/* ── STEP 4: Confirm ───────────────────────────────────────────── */}
        {step === 4 && (
          <>
            <View style={[styles.summaryCard, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: Spacing.md }]}>Order Summary</Text>
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
                  <Text style={[styles.summaryVal, {
                    color: k === 'Total' ? theme.primary : theme.text,
                    fontWeight: k === 'Total' ? FontWeight.bold : FontWeight.regular,
                  }]}>{v}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { color: theme.text, marginTop: Spacing.lg }]}>Payment method</Text>
            <View style={styles.optionList}>
              {PAYMENT_METHODS.map((m) => {
                const selected = paymentMethod === m.key;
                return (
                  <Pressable
                    key={m.key}
                    style={[
                      styles.optionRow,
                      { backgroundColor: theme.surface, borderColor: selected ? theme.primary : theme.border },
                      Shadows.sm,
                    ]}
                    onPress={() => setPaymentMethod(m.key)}
                  >
                    <View style={[styles.optionIconWrap, { backgroundColor: selected ? theme.primary + '18' : theme.surfaceSecond }]}>
                      <Ionicons name={m.icon as any} size={20} color={selected ? theme.primary : theme.textSecond} />
                    </View>
                    <Text style={[styles.optionLabel, { color: theme.text, flex: 1 }]}>{m.label}</Text>
                    {selected && <Ionicons name="checkmark-circle" size={22} color={theme.primary} />}
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={[styles.btn, { backgroundColor: confirming ? theme.border : theme.primary, marginTop: Spacing.lg }]}
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
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1,
  },
  backCircle:    { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerCenter:  { alignItems: 'center' },
  headerTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  stepIndicator: { fontSize: FontSize.xs, marginTop: 2 },

  progressTrack: { height: 3 },
  progressFill:  { height: 3 },

  scrollContent: { padding: Spacing.md },

  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, marginBottom: Spacing.md },

  inputWrap: { flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md, marginBottom: Spacing.lg },
  textInput: { flex: 1, fontSize: FontSize.base },

  optionList:    { gap: Spacing.sm, marginBottom: Spacing.md },
  optionRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  optionIconWrap:{ width: 48, height: 48, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  optionLabel:   { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  optionDesc:    { fontSize: FontSize.xs, marginTop: 2 },

  fragileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },

  price: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },

  breakdownCard:    { borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, gap: Spacing.xs },
  breakdownTitle:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, marginBottom: Spacing.xs },
  breakdownRow:     { flexDirection: 'row', justifyContent: 'space-between' },
  breakdownKey:     { fontSize: FontSize.sm },
  breakdownVal:     { fontSize: FontSize.sm },
  breakdownDivider: { height: 1, marginVertical: Spacing.xs },

  summaryCard: { borderRadius: Radius.xl, padding: Spacing.lg },
  summaryRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  summaryKey:  { fontSize: FontSize.sm },
  summaryVal:  { fontSize: FontSize.sm, maxWidth: '60%', textAlign: 'right' },

  btn:     { flexDirection: 'row', height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  btnText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },
});
