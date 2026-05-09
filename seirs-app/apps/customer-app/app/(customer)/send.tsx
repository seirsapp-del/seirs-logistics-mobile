import { useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
  TextInput, ActivityIndicator, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { deliveriesApi, uploadApi } from '@/services/api';
import AddressPicker, { type PickedAddress } from '@/components/AddressPicker';
import { LAGOS_COORDS } from '@/constants/mockData';
import {
  ArrowLeft, ArrowRight, Package, MapPin, Truck,
  Calendar, CreditCard, Camera, X, CheckCircle, Zap, Bike, Car,
} from 'lucide-react-native';

// ─── Data ─────────────────────────────────────────────────────────────────────

const PACKAGE_CATEGORIES = [
  { id: 'documents',    label: 'Documents / Envelope'                       },
  { id: 'small_parcel', label: 'Small Parcel (electronics, clothing)'        },
  { id: 'food',         label: 'Food / Perishables'                          },
  { id: 'fragile',      label: 'Fragile Items'                               },
  { id: 'agricultural', label: 'Agricultural Produce (crops, yam, maize)'   },
  { id: 'building',     label: 'Building Materials (wood, roofing, pipes)'   },
  { id: 'furniture',    label: 'Furniture / Large Items'                     },
  { id: 'moving',       label: 'Moving / Relocation'                         },
  { id: 'market_goods', label: 'Market Goods (bulk market purchases)'        },
  { id: 'heavy',        label: 'Heavy / Industrial'                          },
] as const;
type CategoryId = typeof PACKAGE_CATEGORIES[number]['id'];

const VEHICLES = [
  { id: 'bicycle',    label: 'Bicycle / Hand',         maxKg: 5,    base: 500,   perKm: 50,   note: 'Community only, <3km' },
  { id: 'motorcycle', label: 'Motorcycle (Okada)',      maxKg: 20,   base: 800,   perKm: 150,  note: 'Standard parcels, food' },
  { id: 'keke',       label: 'Tricycle (Keke)',         maxKg: 100,  base: 1200,  perKm: 200,  note: 'Medium packages, fragile' },
  { id: 'car',        label: 'Car (Sedan)',             maxKg: 200,  base: 2000,  perKm: 300,  note: 'Personal items, medium parcels' },
  { id: 'van',        label: 'Van / Pickup',            maxKg: 800,  base: 5000,  perKm: 500,  note: 'Large goods, business deliveries' },
  { id: 'truck_sm',   label: 'Truck (Small)',           maxKg: 3000, base: 15000, perKm: 1000, note: 'Bulk cargo, building materials' },
  { id: 'truck_lg',   label: 'Truck (Large / Moving)',  maxKg: 9999, base: 40000, perKm: 2000, note: 'Full relocation, industrial' },
] as const;
type VehicleId = typeof VEHICLES[number]['id'];

const PAYMENT_METHODS = [
  { id: 'card',          label: 'Debit Card (Flutterwave)' },
  { id: 'bank_transfer', label: 'Bank Transfer'            },
  { id: 'wallet',        label: 'Seirs Wallet'             },
] as const;
type PaymentId = typeof PAYMENT_METHODS[number]['id'];

const STEPS = ['Package', 'Address', 'Vehicle', 'Schedule', 'Fare', 'Confirm'] as const;

function autoRecommend(cat: CategoryId, kg: number): VehicleId {
  if (cat === 'documents') return 'bicycle';
  if ((cat === 'food' || cat === 'small_parcel') && kg <= 20) return 'motorcycle';
  if ((cat === 'fragile' || cat === 'market_goods') && kg <= 100) return 'keke';
  if (cat === 'agricultural' || cat === 'building') return 'truck_sm';
  if (cat === 'furniture'   || cat === 'moving' || cat === 'heavy') return 'truck_lg';
  if (kg <= 5)    return 'bicycle';
  if (kg <= 20)   return 'motorcycle';
  if (kg <= 100)  return 'keke';
  if (kg <= 200)  return 'car';
  if (kg <= 800)  return 'van';
  return 'truck_sm';
}

function calcFare(vid: VehicleId, distKm: number, kg: number) {
  const v       = VEHICLES.find(x => x.id === vid)!;
  const base    = v.base;
  const dist    = distKm * v.perKm;
  const weight  = kg > 5 ? Math.floor(kg / 5) * 50 : 0;
  const subtotal= base + dist + weight;
  const service = Math.round(subtotal * 0.30);
  const total   = subtotal + service;
  return { base, dist, weight, service, total };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SendScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const [step,        setStep]        = useState(0);
  const [photos,      setPhotos]      = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [category,    setCategory]    = useState<CategoryId | null>(null);
  const [weightKg,    setWeightKg]    = useState('');
  const [pickup,      setPickup]      = useState<PickedAddress | null>(null);
  const [dropoff,     setDropoff]     = useState<PickedAddress | null>(null);
  const stepMapRef = useRef<MapView>(null);
  useEffect(() => {
    if (pickup && dropoff && stepMapRef.current) {
      stepMapRef.current.fitToCoordinates(
        [
          { latitude: pickup.lat,  longitude: pickup.lng  },
          { latitude: dropoff.lat, longitude: dropoff.lng },
        ],
        { edgePadding: { top: 30, right: 30, bottom: 30, left: 30 }, animated: true },
      );
    }
  }, [pickup, dropoff]);
  const [vehicleId,   setVehicleId]   = useState<VehicleId>('motorcycle');
  const [scheduleNow, setScheduleNow] = useState(true);
  const [paymentId,   setPaymentId]   = useState<PaymentId>('wallet');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const kg   = parseFloat(weightKg) || 0;
  const dist = 7; // placeholder; real app uses Google Distance Matrix
  const fare = calcFare(vehicleId, dist, kg);

  const addPhoto = async () => {
    if (photos.length >= 5) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to upload package photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setPhotos(p => [...p, result.assets[0].uri]);
    }
  };

  const next = () => {
    if (step === 0 && photos.length === 0) { setError('Please upload at least one photo.'); return; }
    if (step === 0 && !category)           { setError('Please select a package category.'); return; }
    if (step === 1 && !pickup)  { setError('Please enter a pickup address.'); return; }
    if (step === 1 && !dropoff) { setError('Please enter a dropoff address.'); return; }
    setError('');
    if (step === 1 && category) setVehicleId(autoRecommend(category, kg));
    setStep(s => s + 1);
  };

  const handleBook = async () => {
    setLoading(true);
    setError('');
    try {
      const urls: string[] = [];
      for (const uri of photos) {
        const { url } = await uploadApi.file(uri);
        urls.push(url);
      }
      await deliveriesApi.create({
        pickupAddress:   pickup?.address ?? '',
        dropoffAddress:  dropoff?.address ?? '',
        pickupLat:       pickup?.lat,
        pickupLng:       pickup?.lng,
        dropoffLat:      dropoff?.lat,
        dropoffLng:      dropoff?.lng,
        packageCategory: category,
        description,
        weightKg:        kg,
        vehicleType:     vehicleId,
        paymentMethod:   paymentId,
        packagePhotos:   urls,
        scheduledNow:    scheduleNow,
      });
      router.replace('/(customer)/history' as any);
    } catch (e: any) {
      setError(e.message ?? 'Booking failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const highlight = (active: boolean) => ({
    borderColor:     active ? theme.accent : theme.border,
    backgroundColor: active ? (isDark ? '#1A2E44' : '#EBF5FF') : theme.surface,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => (step === 0 ? router.back() : setStep(s => s - 1))}>
          <ArrowLeft size={22} color={theme.text} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Send a Package</Text>
          <Text style={[styles.headerStep, { color: theme.textSecond }]}>
            Step {step + 1} / {STEPS.length} — {STEPS[step]}
          </Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
        <View style={[styles.progressFill, { backgroundColor: theme.accent, width: `${((step + 1) / STEPS.length) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!!error && (
          <View style={[styles.errorBox, { backgroundColor: '#EF444415' }]}>
            <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
          </View>
        )}

        {/* STEP 0 — Package */}
        {step === 0 && (
          <View style={styles.stepGap}>
            {/* Spec V8 §3 — drop-at-store alternative entry point */}
            <Pressable
              onPress={() => router.push('/(customer)/drop-at-store' as any)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
                padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5,
                borderColor: theme.accent + '40', backgroundColor: theme.accent + '10',
                marginBottom: Spacing.sm,
              }}
            >
              <View style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: theme.surface,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Truck size={18} color={theme.accent} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: theme.text }}>
                  Drop at a store instead
                </Text>
                <Text style={{ fontSize: FontSize.xs, color: theme.textSecond, marginTop: 2 }}>
                  No driver pickup needed — walk in, drop, done. Cheapest option for non-urgent packages.
                </Text>
              </View>
              <ArrowRight size={16} color={theme.accent} />
            </Pressable>

            <Text style={[styles.label, { color: theme.textSecond }]}>
              Package photos <Text style={{ color: theme.error }}>*</Text>
              <Text style={{ color: theme.textThird }}> (min 1, max 5)</Text>
            </Text>
            <View style={styles.photosRow}>
              {photos.map((uri, i) => (
                <View key={i} style={styles.photoWrap}>
                  <Image source={{ uri }} style={styles.photo} />
                  <Pressable
                    style={[styles.photoRemove, { backgroundColor: theme.error }]}
                    onPress={() => setPhotos(p => p.filter((_, j) => j !== i))}
                  >
                    <X size={12} color="#fff" strokeWidth={3} />
                  </Pressable>
                </View>
              ))}
              {photos.length < 5 && (
                <Pressable
                  style={[styles.photoAdd, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}
                  onPress={addPhoto}
                >
                  <Camera size={24} color={theme.accent} strokeWidth={1.75} />
                  <Text style={[styles.photoAddText, { color: theme.textSecond }]}>Add</Text>
                </Pressable>
              )}
            </View>

            <Text style={[styles.label, { color: theme.textSecond }]}>Description</Text>
            <TextInput
              style={[styles.textarea, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, color: theme.text }]}
              placeholder="Describe the package contents..."
              placeholderTextColor={theme.textThird}
              multiline
              numberOfLines={3}
              value={description}
              onChangeText={setDescription}
            />

            <Text style={[styles.label, { color: theme.textSecond }]}>
              Category <Text style={{ color: theme.error }}>*</Text>
            </Text>
            <View style={styles.categoryGrid}>
              {PACKAGE_CATEGORIES.map(cat => (
                <Pressable
                  key={cat.id}
                  style={[styles.categoryChip, highlight(category === cat.id)]}
                  onPress={() => setCategory(cat.id)}
                >
                  <Text style={[styles.categoryText, { color: category === cat.id ? theme.accent : theme.text }]}>
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: theme.textSecond }]}>Weight (kg) — optional</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. 5"
              placeholderTextColor={theme.textThird}
              keyboardType="decimal-pad"
              value={weightKg}
              onChangeText={setWeightKg}
            />
          </View>
        )}

        {/* STEP 1 — Address: real Google Places autocomplete + map preview
            instead of plain TextInputs and a placeholder grey box. */}
        {step === 1 && (
          <View style={styles.stepGap}>
            <AddressPicker
              label="Pickup address"
              dotColor="#22C55E"
              value={pickup?.address ?? ''}
              onSelect={setPickup}
            />
            <View style={{ height: Spacing.sm }} />
            <AddressPicker
              label="Dropoff address"
              dotColor="#EF4444"
              value={dropoff?.address ?? ''}
              onSelect={setDropoff}
            />

            <View style={[styles.mapBox, { borderColor: theme.border, overflow: 'hidden' }]}>
              {pickup || dropoff ? (
                <MapView
                  ref={stepMapRef}
                  provider={PROVIDER_GOOGLE}
                  style={StyleSheet.absoluteFill}
                  initialRegion={
                    pickup
                      ? { latitude: pickup.lat, longitude: pickup.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }
                      : LAGOS_COORDS
                  }
                  pointerEvents="none"
                >
                  {pickup && (
                    <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} pinColor="#22C55E" />
                  )}
                  {dropoff && (
                    <Marker coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }} pinColor="#EF4444" />
                  )}
                  {pickup && dropoff && (
                    <Polyline
                      coordinates={[
                        { latitude: pickup.lat,  longitude: pickup.lng  },
                        { latitude: dropoff.lat, longitude: dropoff.lng },
                      ]}
                      strokeColor={theme.primary}
                      strokeWidth={3}
                    />
                  )}
                </MapView>
              ) : (
                <>
                  <MapPin size={30} color={theme.textThird} strokeWidth={1.5} />
                  <Text style={[styles.mapBoxText, { color: theme.textThird }]}>
                    Pick a pickup address to see the map
                  </Text>
                </>
              )}
            </View>
          </View>
        )}

        {/* STEP 2 — Vehicle */}
        {step === 2 && (
          <View style={styles.stepGap}>
            <Text style={[styles.hintText, { color: theme.textSecond }]}>
              We highlighted the recommended vehicle for your package.
            </Text>
            {VEHICLES.map(v => {
              const f        = calcFare(v.id, dist, kg);
              const active   = vehicleId === v.id;
              const rec      = v.id === (category ? autoRecommend(category, kg) : 'motorcycle');
              return (
                <Pressable
                  key={v.id}
                  style={[styles.vehicleCard, highlight(active), Shadows.xs]}
                  onPress={() => setVehicleId(v.id)}
                >
                  <Truck size={26} color={active ? theme.accent : theme.textSecond} strokeWidth={1.5} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.vehicleNameRow}>
                      <Text style={[styles.vehicleName, { color: theme.text }]}>{v.label}</Text>
                      {rec && (
                        <View style={[styles.recBadge, { backgroundColor: theme.accent }]}>
                          <Text style={styles.recText}>Recommended</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.vehicleNote, { color: theme.textSecond }]}>
                      {v.note} · max {v.maxKg >= 9999 ? '3000+' : v.maxKg}kg
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.vehicleFare, { color: theme.text }]}>₦{f.total.toLocaleString()}</Text>
                    <Text style={[styles.vehicleEta, { color: theme.textSecond }]}>~20 min</Text>
                  </View>
                  {active && <CheckCircle size={18} color={theme.accent} strokeWidth={2} />}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* STEP 3 — Schedule */}
        {step === 3 && (
          <View style={styles.stepGap}>
            {[
              { now: true,  icon: Zap,      title: 'Send Now',            desc: 'Driver assigned immediately'  },
              { now: false, icon: Calendar, title: 'Schedule for Later',  desc: 'Pick a future date and time' },
            ].map(opt => {
              const OptIcon = opt.icon;
              return (
                <Pressable
                  key={String(opt.now)}
                  style={[styles.scheduleOpt, highlight(scheduleNow === opt.now)]}
                  onPress={() => setScheduleNow(opt.now)}
                >
                  <OptIcon size={22} color={scheduleNow === opt.now ? theme.accent : theme.textSecond} strokeWidth={1.75} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.scheduleTitle, { color: theme.text }]}>{opt.title}</Text>
                    <Text style={[styles.scheduleDesc, { color: theme.textSecond }]}>{opt.desc}</Text>
                  </View>
                  {scheduleNow === opt.now && <CheckCircle size={20} color={theme.accent} strokeWidth={2} />}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* STEP 4 — Fare */}
        {step === 4 && (
          <View style={styles.stepGap}>
            <View style={[styles.fareCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
              <Text style={[styles.fareTitle, { color: theme.text }]}>Fare Breakdown</Text>
              {([
                ['Base fare',         fare.base   ],
                ['Distance charge',   fare.dist   ],
                ['Weight surcharge',  fare.weight ],
                ['Service fee (30%)', fare.service],
              ] as [string, number][]).map(([lbl, amt]) => (
                <View key={lbl} style={[styles.fareRow, { borderBottomColor: theme.border }]}>
                  <Text style={[styles.fareLabel, { color: theme.textSecond }]}>{lbl}</Text>
                  <Text style={[styles.fareAmt,   { color: theme.text }]}>₦{amt.toLocaleString()}</Text>
                </View>
              ))}
              <View style={styles.fareTotalRow}>
                <Text style={[styles.fareTotalLabel, { color: theme.text }]}>Total</Text>
                <Text style={[styles.fareTotalAmt,   { color: theme.accent }]}>₦{fare.total.toLocaleString()}</Text>
              </View>
            </View>

            <Text style={[styles.label, { color: theme.textSecond }]}>Payment method</Text>
            {PAYMENT_METHODS.map(pm => (
              <Pressable
                key={pm.id}
                style={[styles.payOption, highlight(paymentId === pm.id)]}
                onPress={() => setPaymentId(pm.id)}
              >
                <CreditCard size={18} color={paymentId === pm.id ? theme.accent : theme.textSecond} strokeWidth={1.75} />
                <Text style={[styles.payLabel, { color: theme.text }]}>{pm.label}</Text>
                {paymentId === pm.id && <CheckCircle size={18} color={theme.accent} strokeWidth={2} />}
              </Pressable>
            ))}
          </View>
        )}

        {/* STEP 5 — Confirm */}
        {step === 5 && (
          <View style={styles.stepGap}>
            <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
              <Text style={[styles.fareTitle, { color: theme.text }]}>Order Summary</Text>
              {([
                ['Pickup',   pickup  || '—'],
                ['Dropoff',  dropoff || '—'],
                ['Category', PACKAGE_CATEGORIES.find(c => c.id === category)?.label ?? '—'],
                ['Vehicle',  VEHICLES.find(v => v.id === vehicleId)?.label ?? '—'],
                ['Payment',  PAYMENT_METHODS.find(p => p.id === paymentId)?.label ?? '—'],
                ['Total',    `₦${fare.total.toLocaleString()}`],
              ] as [string, string][]).map(([lbl, val]) => (
                <View key={lbl} style={[styles.fareRow, { borderBottomColor: theme.border }]}>
                  <Text style={[styles.fareLabel, { color: theme.textSecond }]}>{lbl}</Text>
                  <Text style={[styles.fareAmt,   { color: theme.text }]} numberOfLines={1}>{val}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* CTA */}
      <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
        <Pressable
          style={[styles.cta, { backgroundColor: theme.primary }, loading && { opacity: 0.7 }]}
          onPress={step < 5 ? next : handleBook}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.ctaInner}>
              <Text style={styles.ctaText}>{step === 5 ? 'Book Delivery' : 'Continue'}</Text>
              <ArrowRight size={18} color="#fff" strokeWidth={2.5} />
            </View>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  headerTitle:   { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  headerStep:    { fontSize: FontSize.xs, marginTop: 2 },
  progressTrack: { height: 3 },
  progressFill:  { height: 3 },
  body:          { padding: Spacing.md, paddingBottom: 100 },
  stepGap:       { gap: Spacing.md },
  errorBox:      { padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  errorText:     { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  label:         { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  hintText:      { fontSize: FontSize.sm, lineHeight: 20 },

  photosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  photoWrap: { width: 72, height: 72, borderRadius: Radius.md, position: 'relative' },
  photo:     { width: '100%', height: '100%', borderRadius: Radius.md },
  photoRemove: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  photoAdd:    { width: 72, height: 72, borderRadius: Radius.md, borderWidth: 1.5, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: 4 },
  photoAddText:{ fontSize: FontSize.xs },

  textarea: { borderRadius: Radius.lg, borderWidth: 1.5, padding: Spacing.md, fontSize: FontSize.base, minHeight: 80, textAlignVertical: 'top' },
  input:    { height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md, fontSize: FontSize.base },
  inputRow: { flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md },
  inputIcon:{ marginRight: Spacing.sm },
  inputFlex:{ flex: 1, fontSize: FontSize.base, height: '100%' },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5 },
  categoryText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },

  mapBox:     { height: 200, borderRadius: Radius.xl, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  mapBoxText: { fontSize: FontSize.sm },

  vehicleCard:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  vehicleNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  vehicleName:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  vehicleNote:    { fontSize: FontSize.xs },
  vehicleFare:    { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  vehicleEta:     { fontSize: FontSize.xs, marginTop: 2 },
  recBadge:       { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  recText:        { color: '#fff', fontSize: 10, fontWeight: FontWeight.bold },

  scheduleOpt:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1.5 },
  scheduleTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  scheduleDesc:  { fontSize: FontSize.sm, marginTop: 2 },

  fareCard:      { borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1 },
  fareTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.bold, marginBottom: Spacing.md },
  fareRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  fareLabel:     { fontSize: FontSize.sm },
  fareAmt:       { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, maxWidth: '55%', textAlign: 'right' },
  fareTotalRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.md },
  fareTotalLabel:{ fontSize: FontSize.md, fontWeight: FontWeight.bold },
  fareTotalAmt:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold },

  payOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  payLabel:  { flex: 1, fontSize: FontSize.base },

  summaryCard: { borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1 },

  footer:   { padding: Spacing.md, paddingBottom: 32, borderTopWidth: 1 },
  cta:      { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  ctaInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ctaText:  { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semibold },
});
