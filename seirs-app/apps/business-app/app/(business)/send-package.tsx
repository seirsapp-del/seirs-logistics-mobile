/**
 * Business · Send a Package — the CUSTOMER-SEND pattern, exactly
 * (founder 2026-08-15/16, asked twice: full-screen steps, illustration
 * headers, package-first form, "Add another package" loop, itemized
 * total, one payment).
 *
 * Steps:
 *   0 PACKAGES  every package is a full customer-style form: photo
 *               (required), what it is, weight, category, receiver name
 *               + phone, delivery address. End of the list: "Add another
 *               package" (vehicle-capped) or Continue.
 *   1 PICKUP    one pickup address for the run + Send now / Schedule.
 *   2 VEHICLE   okada/keke/danfo picker, capacity-aware.
 *   3 REVIEW    per-package price lines (same attribution math the
 *               backend books with) + total, then one payment: credit
 *               drains first, otherwise Flutterwave checkout.
 *
 * This is the ONLY in-app booking flow. The old map-first wizard was
 * deleted with this rebuild: two booking screens meant two sets of
 * rules, and the divergence is exactly what the founder kept finding.
 * CSV upload still books through the same backend endpoint.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Image, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Illustration } from '@/components/Illustration';
import {
  businessApi, configApi, mapsApi, uploadApi,
  type ServiceCategory, type RateCard,
} from '@/services/api';
import { useBusinessStore } from '@/store/businessStore';
import { type VehicleType } from '@seirs/shared';
import { useColors } from '@/context/ThemeContext';

const STEPS = ['Packages', 'Pickup', 'Vehicle', 'Review'] as const;
const STEP_SLOTS = ['send-package', 'send-address', 'send-vehicle', 'send-fare'] as const;
const STEP_CAPTIONS = [
  'Tell us about each package: photo, weight and who receives it.',
  'Where does the driver collect everything?',
  'Pick the ride that fits the load.',
  'Check every line, then pay once for the whole run.',
] as const;

const VEHICLE_LABEL: Record<string, string> = {
  bicycle: 'Bicycle', motorcycle: 'Okada', tricycle: 'Keke',
  car: 'Car', van: 'Danfo / Van', truck_small: 'Small Truck', truck_large: 'Large Truck',
};
const VEHICLE_ORDER = ['motorcycle', 'tricycle', 'car', 'van', 'truck_small', 'truck_large'];
const DEFAULT_MAX_PACKAGES: Record<string, number> = {
  bicycle: 3, motorcycle: 5, tricycle: 15, car: 20,
  van: 40, truck_small: 80, truck_large: 150,
};

const TIME_SLOTS = Array.from({ length: 24 }, (_, hour) => ({
  hour,
  label: hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`,
}));

interface Prediction { place_id: string; main_text: string; secondary_text: string }

export default function SendPackageScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const {
    draft, setDraft, addStop, removeStop, updateStop, resetDraft,
  } = useBusinessStore();

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Rate card + catalog (prices + caps + category chips) ─────────────
  const [catalog, setCatalog] = useState<ServiceCategory[]>([]);
  const [rateCard, setRateCard] = useState<RateCard | null>(null);
  useEffect(() => {
    Promise.all([configApi.serviceCatalog(), configApi.rateCard()])
      .then(([cat, rc]) => { setCatalog(cat); setRateCard(rc); })
      .catch(() => {});
  }, []);

  const maxPackages =
    Number((rateCard as any)?.vehicleRates?.[draft.vehicleType]?.maxPackages)
    || DEFAULT_MAX_PACKAGES[draft.vehicleType] || 5;

  // ── Address autocomplete (pickup + per-package) ──────────────────────
  type Field = { kind: 'pickup' } | { kind: 'pkg'; idx: number } | null;
  const [activeField, setActiveField] = useState<Field>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pickupQuery, setPickupQuery] = useState(draft.pickupAddress);
  const [pkgQueries, setPkgQueries] = useState<string[]>(draft.stops.map(s => s.address));

  const fetchPredictions = async (text: string) => {
    if (text.trim().length < 3) { setPredictions([]); return; }
    setSearching(true);
    try {
      const json = await mapsApi.autocomplete({ input: text });
      setPredictions((json.predictions ?? []).map((p: any) => ({
        place_id: p.place_id,
        main_text: p.structured_formatting?.main_text ?? p.description,
        secondary_text: p.structured_formatting?.secondary_text ?? '',
      })));
    } catch { setPredictions([]); }
    finally { setSearching(false); }
  };

  const onChangePickup = (text: string) => {
    setPickupQuery(text);
    setDraft({ pickupAddress: text, pickupLat: undefined, pickupLng: undefined });
    setActiveField({ kind: 'pickup' });
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchPredictions(text), 300);
  };
  const onChangePkgAddress = (idx: number, text: string) => {
    setPkgQueries(prev => { const next = [...prev]; next[idx] = text; return next; });
    updateStop(idx, { address: text, lat: undefined, lng: undefined });
    setActiveField({ kind: 'pkg', idx });
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchPredictions(text), 300);
  };
  const selectPrediction = async (p: Prediction) => {
    setSearching(true);
    try {
      const json = await mapsApi.placeDetails(p.place_id, 'geometry,formatted_address');
      if (json.status !== 'OK' || !activeField) return;
      const loc = json.result.geometry.location;
      const address = json.result.formatted_address ?? `${p.main_text}, ${p.secondary_text}`;
      if (activeField.kind === 'pickup') {
        setPickupQuery(address);
        setDraft({ pickupAddress: address, pickupLat: loc.lat, pickupLng: loc.lng });
      } else {
        const idx = activeField.idx;
        setPkgQueries(prev => { const next = [...prev]; next[idx] = address; return next; });
        updateStop(idx, { address, lat: loc.lat, lng: loc.lng });
      }
      setPredictions([]);
      setActiveField(null);
    } catch { /* keep typing */ }
    finally { setSearching(false); }
  };

  const renderSuggestions = (forField: 'pickup' | 'pkg', idx?: number) => {
    const match =
      (forField === 'pickup' && activeField?.kind === 'pickup') ||
      (forField === 'pkg' && activeField?.kind === 'pkg' && activeField.idx === idx);
    if (!match || predictions.length === 0) return null;
    return (
      <View style={[styles.suggBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {searching && <ActivityIndicator style={{ padding: 8 }} color={colors.accent} />}
        {predictions.map((p) => (
          <Pressable key={p.place_id} style={[styles.suggRow, { borderTopColor: colors.border }]} onPress={() => selectPrediction(p)}>
            <Icon name="MapPin" size={14} color={colors.textThird} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.suggMain, { color: colors.text }]} numberOfLines={1}>{p.main_text}</Text>
              {!!p.secondary_text && (
                <Text style={[styles.suggSub, { color: colors.textThird }]} numberOfLines={1}>{p.secondary_text}</Text>
              )}
            </View>
          </Pressable>
        ))}
      </View>
    );
  };

  // ── Photos ───────────────────────────────────────────────────────────
  const pickPhoto = async (idx: number) => {
    const current = draft.stops[idx]?.photoUris ?? [];
    if (current.length >= 5) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo needed', 'Allow photo access: every package needs its picture for handoff proof.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (!result.canceled && result.assets?.[0]?.uri) {
      updateStop(idx, { photoUris: [...current, result.assets[0].uri] });
    }
  };
  const removePhoto = (idx: number, photoIdx: number) => {
    const current = draft.stops[idx]?.photoUris ?? [];
    updateStop(idx, { photoUris: current.filter((_, j) => j !== photoIdx) });
  };

  // Use-my-location for pickup (customer parity). Nigeria bounding box
  // guard: a founder abroad should not geocode their hotel as pickup.
  const useMyLocation = async () => {
    try {
      const Location = await import('expo-location');
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      if (!(latitude >= 4 && latitude <= 14 && longitude >= 2.5 && longitude <= 15)) {
        Alert.alert('Outside Nigeria', 'Type the pickup address instead.');
        return;
      }
      const j = await mapsApi.geocode({ latlng: `${latitude},${longitude}` });
      const address = j?.results?.[0]?.formatted_address ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      setPickupQuery(address);
      setDraft({ pickupAddress: address, pickupLat: latitude, pickupLng: longitude });
      setPredictions([]);
      setActiveField(null);
    } catch { /* typing still works */ }
  };

  // ── Schedule ─────────────────────────────────────────────────────────
  const [scheduleNow, setScheduleNow] = useState(true);
  const [scheduledHour, setScheduledHour] = useState<number | null>(null);

  // ── Route distance (straight-line stand-in; server prices road km) ───
  const totalKm = useMemo(() => {
    const pts: Array<{ lat: number; lng: number }> = [];
    if (draft.pickupLat != null && draft.pickupLng != null) pts.push({ lat: draft.pickupLat, lng: draft.pickupLng });
    for (const s of draft.stops) if (s.lat != null && s.lng != null) pts.push({ lat: s.lat, lng: s.lng });
    let km = 0;
    for (let i = 1; i < pts.length; i++) {
      const R = 6371, dLat = ((pts[i].lat - pts[i-1].lat) * Math.PI) / 180, dLng = ((pts[i].lng - pts[i-1].lng) * Math.PI) / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos((pts[i-1].lat*Math.PI)/180) * Math.cos((pts[i].lat*Math.PI)/180) * Math.sin(dLng/2)**2;
      km += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    // Same circuity stand-in the backend defaults to (145%): the booked
    // price comes from the server's road distance either way.
    return Math.round(km * 1.45 * 10) / 10;
  }, [draft.pickupLat, draft.pickupLng, draft.stops]);

  // ── Quote (unified engine, per-package aware) ────────────────────────
  const [quote, setQuote] = useState<any>(null);
  useEffect(() => {
    if (step !== 3) return;
    const packages = draft.stops.map(s => ({
      categoryCode: s.categoryCode ?? draft.categoryCode ?? 'standard_parcel',
      weightKg: Number(s.weightKg ?? 0),
    }));
    const totalWeight = packages.reduce((sum, p) => sum + p.weightKg, 0);
    setQuote(null);
    import('@/services/api').then(({ pricingApi }) =>
      pricingApi.quote({
        vehicleType: draft.vehicleType,
        categoryCode: packages[0]?.categoryCode ?? 'standard_parcel',
        km: totalKm,
        stopCount: draft.stops.length,
        weightKg: totalWeight,
        estimatedDwellMinutes: draft.stops.length * 4,
        packages,
        pickupCoords: draft.pickupLat != null ? { latitude: draft.pickupLat, longitude: draft.pickupLng } : undefined,
      } as any),
    ).then(setQuote).catch(() => setQuote(null));
  }, [step, totalKm, draft.stops, draft.vehicleType]);

  // Per-package attribution preview: identical math to the backend
  // (surcharge-weighted equal shares, last line absorbs rounding).
  const packageLines = useMemo(() => {
    const total = Number(quote?.customer?.total ?? 0);
    const n = draft.stops.length;
    if (!total || !n) return null;
    const pctOf = (code?: string | null) =>
      Number(catalog.find(c => c.code === (code ?? draft.categoryCode))?.surchargePercent ?? 0);
    const weights = draft.stops.map(s => 1 + pctOf(s.categoryCode) / 100);
    const wSum = weights.reduce((a, b) => a + b, 0);
    const shares = weights.map(w => Math.round((total * w / wSum) * 100) / 100);
    const drift = Math.round((total - shares.reduce((a, b) => a + b, 0)) * 100) / 100;
    shares[n - 1] = Math.round((shares[n - 1] + drift) * 100) / 100;
    return shares;
  }, [quote, draft.stops, catalog, draft.categoryCode]);

  // ── Validation per step ──────────────────────────────────────────────
  const validateStep = (): string | null => {
    if (step === 0) {
      for (let i = 0; i < draft.stops.length; i++) {
        const s = draft.stops[i];
        if (!(s.photoUris ?? []).length)    return `Package ${i + 1} needs at least one photo.`;
        if (!(Number(s.weightKg) > 0))      return `Package ${i + 1} needs a weight.`;
        if (!(s.categoryCode ?? draft.categoryCode)) return `Package ${i + 1} needs a category.`;
        if (!s.receiverFirstName?.trim())   return `Package ${i + 1} needs the receiver's first name.`;
        if (s.fallbackPref === 'neighbour' && !s.fallbackNeighbourName?.trim())
          return `Package ${i + 1}: name the neighbour who may collect.`;
        if (!s.recipientPhone?.trim())      return `Package ${i + 1} needs the receiver's phone.`;
        if (s.lat == null || s.lng == null) return `Package ${i + 1} needs a delivery address picked from the suggestions.`;
      }
      return null;
    }
    if (step === 1) {
      if (draft.pickupLat == null || draft.pickupLng == null) return 'Pick the pickup address from the suggestions.';
      if (!scheduleNow && scheduledHour == null) return 'Pick a pickup hour, or switch to Send now.';
      return null;
    }
    if (step === 2) {
      if (!draft.vehicleType) return 'Pick a vehicle.';
      if (draft.stops.length > maxPackages)
        return `${draft.stops.length} packages exceed the ${VEHICLE_LABEL[draft.vehicleType]} limit of ${maxPackages}. Choose a larger vehicle or remove packages.`;
      return null;
    }
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError(null);
    if (step < 3) setStep((s) => (s + 1) as any);
  };
  const back = () => {
    setError(null);
    if (step === 0) { router.back(); return; }
    setStep((s) => (s - 1) as any);
  };

  // ── Submit: upload photos → book → pay ──────────────────────────────
  const handleSubmit = async () => {
    if (!quote) { Alert.alert('One moment', 'The price is still computing.'); return; }
    setLoading(true);
    try {
      // Every photo of every package uploads (customer parity: up to 5).
      const photoUrlsPerPackage: string[][] = [];
      for (const s of draft.stops) {
        const urls: string[] = [];
        for (const uri of (s.photoUris ?? [])) {
          const up = await uploadApi.file(uri, 'image/jpeg', 'packages');
          urls.push(up.url);
        }
        photoUrlsPerPackage.push(urls);
      }
      const scheduledAt = !scheduleNow && scheduledHour != null
        ? (() => { const d = new Date(); d.setHours(scheduledHour, 0, 0, 0); if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); return d.toISOString(); })()
        : undefined;

      const res = await businessApi.createDelivery({
        pickupAddress: draft.pickupAddress,
        pickupLat: draft.pickupLat!,
        pickupLng: draft.pickupLng!,
        stops: draft.stops.map((s, idx) => ({
          address: s.address,
          lat: s.lat!,
          lng: s.lng!,
          recipientName: [s.receiverFirstName?.trim(), s.receiverLastName?.trim()].filter(Boolean).join(' ') || s.recipientName.trim(),
          recipientPhone: s.recipientPhone.trim(),
          notes: s.note?.trim() || undefined,
          sequenceOrder: idx + 1,
          packagePhotoUrls: photoUrlsPerPackage[idx],
          receiverFirstName: s.receiverFirstName?.trim() || undefined,
          receiverLastName: s.receiverLastName?.trim() || undefined,
          declaredValueNgn: s.declaredValueNgn ?? undefined,
          fallbackPref: s.fallbackPref ?? undefined,
          fallbackNeighbourName: s.fallbackPref === 'neighbour' ? (s.fallbackNeighbourName?.trim() || undefined) : undefined,
          packageDescription: s.packageDescription?.trim() || undefined,
          categoryCode: s.categoryCode ?? draft.categoryCode ?? undefined,
          weightKg: s.weightKg ?? undefined,
        })),
        vehicleType: draft.vehicleType,
        categoryCode: draft.stops[0]?.categoryCode ?? draft.categoryCode ?? 'standard_parcel',
        weightKg: draft.stops.reduce((sum, s) => sum + Number(s.weightKg ?? 0), 0),
        km: totalKm,
        estimatedDriveMinutes: Math.round(totalKm * 3),
        scheduledAt,
        isInterState: false,
        isLongDistance: totalKm > 100,
        isRecurring: false,
      });

      const trackingCode = res?.delivery?.trackingCode ?? '';
      resetDraft();
      if (res?.payment?.method === 'flutterwave' && res?.payment?.authorizationUrl) {
        Alert.alert(
          'Complete payment',
          `Booking ${trackingCode} is reserved. Finish payment in the browser: drivers see the job the moment your payment confirms.`,
          [{
            text: 'Pay now',
            onPress: async () => {
              try { await Linking.openURL(res.payment.authorizationUrl); } catch {}
              router.replace('/(business)/(tabs)/deliveries' as any);
            },
          }],
        );
      } else {
        Alert.alert(
          'Run booked',
          `Tracking: ${trackingCode}\nEach package has its own code: receivers can track theirs on seirs.` +
          (res?.wallet ? `\nRemaining credit: ₦${(res.wallet.balanceAfter ?? 0).toLocaleString()}` : ''),
          [{ text: 'Done', onPress: () => router.replace('/(business)/(tabs)/deliveries' as any) }],
        );
      }
    } catch (e: any) {
      Alert.alert('Could not book', e?.message ?? 'Please try again.');
    } finally { setLoading(false); }
  };

  const totalWeight = draft.stops.reduce((sum, s) => sum + Number(s.weightKg ?? 0), 0);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header: back + title + step dots (customer pattern). */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={back} style={[styles.backBtn, { backgroundColor: colors.surfaceSecond }]} hitSlop={8}>
          <Icon name="ArrowLeft" size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>Send a Package</Text>
          <Text style={[styles.subtitle, { color: colors.textSecond }]}>
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </Text>
        </View>
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i <= step ? colors.primary : colors.border }]} />
          ))}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 24 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Illustration header, the customer pattern. */}
          <View style={styles.stepHero}>
            <Illustration name={STEP_SLOTS[step]} size={130} />
            <Text style={[styles.stepHeroCaption, { color: colors.textSecond }]}>{STEP_CAPTIONS[step]}</Text>
          </View>

          {/* ─── STEP 0: PACKAGES ──────────────────────────────────── */}
          {step === 0 && (
            <View style={{ gap: 18 }}>
              {/* Store drop, the customer app's first card: for business
                  runs it is the cheaper alternative to a door pickup. */}
              <Pressable
                style={[styles.storeCard, { borderColor: colors.accent + '55', backgroundColor: colors.accent + '12' }]}
                onPress={() => router.push('/(business)/drop-at-store' as any)}
              >
                <View style={[styles.storeIcon, { backgroundColor: colors.surface }]}>
                  <Icon name="Store" size={18} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.storeTitle, { color: colors.text }]}>Drop at a partner store instead</Text>
                  <Text style={[styles.storeSub, { color: colors.textSecond }]}>
                    Take them to a counter near you, skip the pickup leg.
                  </Text>
                </View>
                <Icon name="ChevronRight" size={16} color={colors.accent} />
              </Pressable>

              {draft.stops.map((s, i) => (
                <View key={i} style={[styles.pkgCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.pkgHead}>
                    <Text style={[styles.pkgTitle, { color: colors.text }]}>Package {i + 1}</Text>
                    {draft.stops.length > 1 && (
                      <Pressable onPress={() => { removeStop(i); setPkgQueries(q => q.filter((_, j) => j !== i)); }} hitSlop={8}>
                        <Icon name="Trash2" size={16} color="#DC2626" />
                      </Pressable>
                    )}
                  </View>

                  <Text style={[styles.label, { color: colors.textSecond }]}>
                    Photos <Text style={{ color: '#DC2626' }}>*</Text>
                    <Text style={{ color: colors.textThird }}>  at least 1, up to 5</Text>
                  </Text>
                  <View style={styles.photoRow}>
                    {(s.photoUris ?? []).map((uri, pi) => (
                      <View key={pi} style={styles.photoWrap}>
                        <Image source={{ uri }} style={styles.photoThumb} />
                        <Pressable style={styles.photoRemove} onPress={() => removePhoto(i, pi)} hitSlop={6}>
                          <Icon name="X" size={11} color="#fff" />
                        </Pressable>
                      </View>
                    ))}
                    {(s.photoUris ?? []).length < 5 && (
                      <Pressable
                        style={[styles.photoAdd, { borderColor: colors.border, backgroundColor: colors.surfaceSecond }]}
                        onPress={() => pickPhoto(i)}
                      >
                        <Icon name="Camera" size={20} color={colors.accent} />
                        <Text style={[styles.photoHint, { color: colors.textSecond }]}>Add</Text>
                      </Pressable>
                    )}
                  </View>

                  <Text style={[styles.label, { color: colors.textSecond }]}>What is it?</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                    value={s.packageDescription ?? ''}
                    onChangeText={(v) => updateStop(i, { packageDescription: v })}
                    placeholder="e.g. Two cartons of shoes"
                    placeholderTextColor={colors.textThird}
                  />

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.label, { color: colors.textSecond }]}>
                        Weight (kg) <Text style={{ color: '#DC2626' }}>*</Text>
                      </Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                        value={s.weightKg != null ? String(s.weightKg) : ''}
                        onChangeText={(v) => {
                          const n = Number(v.replace(',', '.'));
                          updateStop(i, { weightKg: Number.isFinite(n) && v !== '' ? n : undefined });
                        }}
                        placeholder="e.g. 3"
                        placeholderTextColor={colors.textThird}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <Text style={[styles.label, { color: colors.textSecond }]}>
                    Category <Text style={{ color: '#DC2626' }}>*</Text>
                  </Text>
                  <View style={styles.chipWrap}>
                    {catalog.map((cat) => {
                      const active = (s.categoryCode ?? draft.categoryCode) === cat.code;
                      return (
                        <Pressable
                          key={cat.code}
                          style={[styles.chip,
                            { backgroundColor: colors.surfaceSecond, borderColor: colors.border },
                            active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                          onPress={() => updateStop(i, { categoryCode: cat.code })}
                        >
                          <Text style={[styles.chipTxt, { color: colors.text }, active && { color: '#fff' }]}>{cat.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={[styles.label, { color: colors.textSecond }]}>
                    Who is receiving? <Text style={{ color: '#DC2626' }}>*</Text>
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      style={[styles.input, { flex: 1, backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                      value={s.receiverFirstName ?? ''}
                      onChangeText={(v) => updateStop(i, { receiverFirstName: v })}
                      placeholder="First name"
                      placeholderTextColor={colors.textThird}
                    />
                    <TextInput
                      style={[styles.input, { flex: 1, backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                      value={s.receiverLastName ?? ''}
                      onChangeText={(v) => updateStop(i, { receiverLastName: v })}
                      placeholder="Last name (optional)"
                      placeholderTextColor={colors.textThird}
                    />
                  </View>
                  <Text style={[styles.hint, { color: colors.textThird }]}>
                    The driver confirms this first name at handoff. Anyone the receiver trusts can collect.
                  </Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                    value={s.recipientPhone}
                    onChangeText={(v) => updateStop(i, { recipientPhone: v })}
                    placeholder="08012345678"
                    placeholderTextColor={colors.textThird}
                    keyboardType="phone-pad"
                  />

                  <Text style={[styles.label, { color: colors.textSecond }]}>If nobody is available</Text>
                  <View style={styles.chipWrap}>
                    {([
                      { key: 'hand_only', label: 'Hand to receiver only' },
                      { key: 'neighbour', label: 'Leave with neighbour' },
                      { key: 'gate',      label: 'Leave at gate' },
                      { key: 'store',     label: 'Drop at partner store' },
                    ] as const).map((opt) => {
                      const hv = Number(s.declaredValueNgn ?? 0) >= 100000;
                      const blocked = hv && (opt.key === 'gate' || opt.key === 'neighbour');
                      const active = (s.fallbackPref ?? 'hand_only') === opt.key;
                      return (
                        <Pressable
                          key={opt.key}
                          disabled={blocked}
                          style={[styles.chip,
                            { backgroundColor: colors.surfaceSecond, borderColor: colors.border, opacity: blocked ? 0.4 : 1 },
                            active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                          onPress={() => updateStop(i, { fallbackPref: opt.key })}
                        >
                          <Text style={[styles.chipTxt, { color: colors.text }, active && { color: '#fff' }]}>{opt.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {Number(s.declaredValueNgn ?? 0) >= 100000 && (
                    <Text style={[styles.hint, { color: colors.textThird }]}>
                      High-value packages cannot be left at the gate or with a neighbour.
                    </Text>
                  )}
                  {s.fallbackPref === 'neighbour' && (
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                      value={s.fallbackNeighbourName ?? ''}
                      onChangeText={(v) => updateStop(i, { fallbackNeighbourName: v })}
                      placeholder="Neighbour or security's name"
                      placeholderTextColor={colors.textThird}
                    />
                  )}

                  <Text style={[styles.label, { color: colors.textSecond }]}>Package value in NGN (optional)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                    value={s.declaredValueNgn != null ? String(s.declaredValueNgn) : ''}
                    onChangeText={(v) => {
                      const n = Number(v.replace(/[^0-9.]/g, ''));
                      updateStop(i, { declaredValueNgn: Number.isFinite(n) && v !== '' ? n : undefined });
                    }}
                    placeholder="e.g. 150000. High-value packages get ID-verified handoff."
                    placeholderTextColor={colors.textThird}
                    keyboardType="numeric"
                  />

                  <Text style={[styles.label, { color: colors.textSecond }]}>Instructions for driver (optional)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                    value={s.note ?? ''}
                    onChangeText={(v) => updateStop(i, { note: v })}
                    placeholder="e.g. Call when you reach the gate. Ask for security."
                    placeholderTextColor={colors.textThird}
                  />

                  <Text style={[styles.label, { color: colors.textSecond }]}>
                    Delivery address <Text style={{ color: '#DC2626' }}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                    value={pkgQueries[i] ?? ''}
                    onChangeText={(v) => onChangePkgAddress(i, v)}
                    onFocus={() => setActiveField({ kind: 'pkg', idx: i })}
                    placeholder="Street, area, city"
                    placeholderTextColor={colors.textThird}
                  />
                  {renderSuggestions('pkg', i)}
                </View>
              ))}

              {draft.stops.length < maxPackages ? (
                <Pressable
                  style={[styles.addBtn, { borderColor: colors.accent, backgroundColor: colors.primaryLight }]}
                  onPress={() => { addStop({ address: '', recipientName: '', recipientPhone: '' }); setPkgQueries(q => [...q, '']); }}
                >
                  <Icon name="Plus" size={16} color={colors.accent} />
                  <Text style={[styles.addBtnText, { color: colors.accent }]}>
                    Add another package ({draft.stops.length}/{maxPackages} for {VEHICLE_LABEL[draft.vehicleType] ?? 'this vehicle'})
                  </Text>
                </Pressable>
              ) : (
                <Text style={[styles.capNote, { color: colors.textSecond }]}>
                  {VEHICLE_LABEL[draft.vehicleType]} carries up to {maxPackages} packages: pick a bigger vehicle in step 3 for more.
                </Text>
              )}
            </View>
          )}

          {/* ─── STEP 1: PICKUP ────────────────────────────────────── */}
          {step === 1 && (
            <View style={{ gap: 14 }}>
              <Text style={[styles.label, { color: colors.textSecond }]}>
                Pickup address <Text style={{ color: '#DC2626' }}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecond, borderColor: colors.border, color: colors.text }]}
                value={pickupQuery}
                onChangeText={onChangePickup}
                onFocus={() => setActiveField({ kind: 'pickup' })}
                placeholder="Where the driver collects everything"
                placeholderTextColor={colors.textThird}
              />
              {renderSuggestions('pickup')}
              <Pressable style={styles.useLocRow} onPress={useMyLocation}>
                <Icon name="MapPin" size={16} color={colors.accent} />
                <Text style={[styles.useLocTxt, { color: colors.accent }]}>Use my current location</Text>
              </Pressable>

              <Text style={[styles.label, { color: colors.textSecond, marginTop: 8 }]}>When?</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {[{ k: true, label: 'Send now' }, { k: false, label: 'Schedule' }].map(({ k, label }) => (
                  <Pressable
                    key={label}
                    style={[styles.schedBtn,
                      { backgroundColor: colors.surfaceSecond, borderColor: colors.border },
                      scheduleNow === k && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => setScheduleNow(k)}
                  >
                    <Text style={[styles.schedTxt, { color: colors.text }, scheduleNow === k && { color: '#fff' }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              {!scheduleNow && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {TIME_SLOTS.map(({ hour, label }) => (
                    <Pressable
                      key={hour}
                      style={[styles.hourChip,
                        { backgroundColor: colors.surfaceSecond, borderColor: colors.border },
                        scheduledHour === hour && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => setScheduledHour(hour)}
                    >
                      <Text style={[styles.chipTxt, { color: colors.text }, scheduledHour === hour && { color: '#fff' }]}>{label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {/* ─── STEP 2: VEHICLE ───────────────────────────────────── */}
          {step === 2 && (
            <View style={{ gap: 10 }}>
              {VEHICLE_ORDER.map((v) => {
                const cap = Number((rateCard as any)?.vehicleRates?.[v]?.maxPackages) || DEFAULT_MAX_PACKAGES[v] || 5;
                const payload = Number((rateCard as any)?.vehicleRates?.[v]?.maxPayloadKg ?? 0);
                const overCount = draft.stops.length > cap;
                const overWeight = payload > 0 && totalWeight > payload;
                const disabled = overCount || overWeight;
                const active = draft.vehicleType === v;
                return (
                  <Pressable
                    key={v}
                    disabled={disabled}
                    style={[styles.vehRow,
                      { backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled ? 0.45 : 1 },
                      active && { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
                    onPress={() => setDraft({ vehicleType: v })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.vehName, { color: colors.text }]}>{VEHICLE_LABEL[v]}</Text>
                      <Text style={[styles.vehSub, { color: colors.textSecond }]}>
                        {disabled
                          ? overCount ? `Max ${cap} packages` : `Max ${payload}kg`
                          : `Up to ${cap} packages · ${payload > 0 ? `${payload}kg` : 'no'} payload`}
                      </Text>
                    </View>
                    {active && <Icon name="CheckCircle2" size={20} color={colors.primary} />}
                  </Pressable>
                );
              })}
              <Text style={[styles.capNote, { color: colors.textSecond }]}>
                This run: {draft.stops.length} package{draft.stops.length === 1 ? '' : 's'}, {totalWeight}kg total.
              </Text>
            </View>
          )}

          {/* ─── STEP 3: REVIEW & PAY ──────────────────────────────── */}
          {step === 3 && (
            <View style={{ gap: 12 }}>
              <View style={[styles.sumCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sumTitle, { color: colors.text }]}>Route</Text>
                <Text style={[styles.sumLine, { color: colors.textSecond }]} numberOfLines={1}>
                  From {draft.pickupAddress || '…'}
                </Text>
                <Text style={[styles.sumLine, { color: colors.textSecond }]}>
                  {draft.stops.length} drop{draft.stops.length === 1 ? '' : 's'} · ~{totalKm}km · {VEHICLE_LABEL[draft.vehicleType]}
                  {scheduleNow ? ' · Send now' : ` · ${TIME_SLOTS.find(t => t.hour === scheduledHour)?.label ?? ''}`}
                </Text>
              </View>

              <View style={[styles.sumCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sumTitle, { color: colors.text }]}>Packages</Text>
                {draft.stops.map((s, i) => (
                  <View key={i} style={styles.lineRow}>
                    {!!(s.photoUris ?? []).length && <Image source={{ uri: s.photoUris![0] }} style={styles.lineThumb} />}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.lineName, { color: colors.text }]} numberOfLines={1}>
                        {s.packageDescription?.trim() || `Package ${i + 1}`}
                      </Text>
                      <Text style={[styles.lineSub, { color: colors.textThird }]} numberOfLines={1}>
                        {[s.receiverFirstName, s.receiverLastName].filter(Boolean).join(' ') || s.recipientName} · {s.weightKg}kg · {catalog.find(c => c.code === (s.categoryCode ?? draft.categoryCode))?.name ?? ''}
                      </Text>
                    </View>
                    <Text style={[styles.linePrice, { color: colors.text }]}>
                      {packageLines ? `₦${Math.round(packageLines[i]).toLocaleString()}` : '…'}
                    </Text>
                  </View>
                ))}
                <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.totalLabel, { color: colors.text }]}>Total · one payment</Text>
                  <Text style={[styles.totalValue, { color: colors.primary }]}>
                    {quote?.customer?.total != null
                      ? `₦${Math.round(Number(quote.customer.total)).toLocaleString()}`
                      : '…'}
                  </Text>
                </View>
                <Text style={[styles.capNote, { color: colors.textThird }]}>
                  Final fare uses the road distance at booking. Every package gets its own tracking code for its receiver.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Footer CTA */}
        <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: 12 + insets.bottom, backgroundColor: colors.background }]}>
          <Pressable
            style={[styles.cta, { backgroundColor: colors.primary }, loading && { opacity: 0.6 }]}
            disabled={loading}
            onPress={step === 3 ? handleSubmit : next}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>
                {step === 3
                  ? (quote?.customer?.total != null
                      ? `Pay ₦${Math.round(Number(quote.customer.total)).toLocaleString()}`
                      : 'Book this run')
                  : 'Continue'}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  backBtn:  { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 1 },
  dots:     { flexDirection: 'row', gap: 4 },
  dot:      { width: 8, height: 8, borderRadius: 4 },
  errorBox:  { backgroundColor: '#EF444415', borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { color: '#DC2626', fontSize: 13, fontWeight: '600' },
  stepHero:        { alignItems: 'center', marginBottom: 18, gap: 8 },
  stepHeroCaption: { fontSize: 13, textAlign: 'center', maxWidth: 280, lineHeight: 18 },
  pkgCard:  { borderRadius: 16, borderWidth: 1, padding: 14, gap: 4 },
  pkgHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  pkgTitle: { fontSize: 15, fontWeight: '700' },
  label:    { fontSize: 12, fontWeight: '600', marginTop: 8, marginBottom: 6 },
  input:    { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 2 },
  photoRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoWrap:  { width: 72, height: 72 },
  photoThumb: { width: 72, height: 72, borderRadius: 10 },
  photoRemove: {
    position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center',
  },
  photoAdd: {
    width: 72, height: 72, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  photoHint: { fontSize: 11 },
  hint:      { fontSize: 11, lineHeight: 15, marginTop: 4, marginBottom: 2 },
  storeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderRadius: 14, padding: 14,
  },
  storeIcon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  storeTitle: { fontSize: 14, fontWeight: '700' },
  storeSub:   { fontSize: 12, marginTop: 2 },
  useLocRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  useLocTxt:  { fontSize: 13, fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:     { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipTxt:  { fontSize: 12.5, fontWeight: '600' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 14,
  },
  addBtnText: { fontSize: 14, fontWeight: '700' },
  capNote:    { fontSize: 12, lineHeight: 17 },
  suggBlock: { borderWidth: 1, borderRadius: 12, marginTop: 4, overflow: 'hidden' },
  suggRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: 1 },
  suggMain:  { fontSize: 13, fontWeight: '500' },
  suggSub:   { fontSize: 11, marginTop: 1 },
  schedBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  schedTxt: { fontSize: 14, fontWeight: '600' },
  hourChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  vehRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 14 },
  vehName: { fontSize: 15, fontWeight: '700' },
  vehSub:  { fontSize: 12, marginTop: 2 },
  sumCard:  { borderRadius: 16, borderWidth: 1, padding: 14 },
  sumTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  sumLine:  { fontSize: 13, marginBottom: 3 },
  lineRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  lineThumb: { width: 34, height: 34, borderRadius: 8 },
  lineName:  { fontSize: 13, fontWeight: '600' },
  lineSub:   { fontSize: 11, marginTop: 1 },
  linePrice: { fontSize: 13, fontWeight: '700' },
  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 10, marginTop: 6 },
  totalLabel: { fontSize: 14, fontWeight: '700' },
  totalValue: { fontSize: 18, fontWeight: '900' },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },
  cta:     { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
