import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput,
  StatusBar, Alert, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { driversApi, uploadApi } from '@/services/api';

/**
 * Vehicle management. One vehicle per driver (set at registration).
 * Changes NEVER apply silently: every edit is submitted for compliance
 * review with exterior / interior / plate photos, and the driver keeps
 * working with the current vehicle until an admin approves
 * (founder policy 2026-08-10, mirrors the bank-change flow).
 *
 * Vehicle types use the canonical backend taxonomy with the names
 * Nigerians actually use (okada / keke / danfo).
 */
const VEHICLE_TYPES = [
  { id: 'bicycle',     label: 'Bicycle',          icon: 'bicycle-outline' },
  { id: 'motorcycle',  label: 'Okada (Motorcycle)', icon: 'bicycle' },
  { id: 'tricycle',    label: 'Keke (Tricycle)',  icon: 'car-outline' },
  { id: 'car',         label: 'Car',              icon: 'car-sport-outline' },
  { id: 'van',         label: 'Van / Danfo',      icon: 'bus-outline' },
  { id: 'truck_small', label: 'Small Truck',      icon: 'cube-outline' },
  { id: 'truck_large', label: 'Large Truck',      icon: 'construct-outline' },
];

type PhotoSlot = 'exterior' | 'interior' | 'plate';

const PHOTO_SLOTS: { key: PhotoSlot; label: string; hint: string }[] = [
  { key: 'exterior', label: 'Outside',      hint: 'Full side view of the vehicle' },
  { key: 'interior', label: 'Inside',       hint: 'Seat / cargo area' },
  { key: 'plate',    label: 'Plate Number', hint: 'Close-up, clearly readable' },
];

export default function VehicleScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [original, setOriginal] = useState<any>(null);
  const [pendingChange, setPendingChange] = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [make,    setMake]    = useState('');
  const [model,   setModel]   = useState('');
  const [year,    setYear]    = useState('');
  const [color,   setColor]   = useState('');
  const [plate,   setPlate]   = useState('');
  const [type,    setType]    = useState('');
  const [photos,  setPhotos]  = useState<Record<PhotoSlot, string | null>>({ exterior: null, interior: null, plate: null });
  const [uploadingSlot, setUploadingSlot] = useState<PhotoSlot | null>(null);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await driversApi.me();
        const details = me?.vehicleDetails ?? {};
        const snap = {
          make:  details.make ?? '',
          model: details.model ?? '',
          year:  details.year ?? '',
          color: details.color ?? '',
          plate: me?.vehiclePlate ?? '',
          type:  me?.vehicleType  ?? '',
        };
        setOriginal(snap);
        setPendingChange(details.pendingChange ?? null);
        setMake(snap.make); setModel(snap.model); setYear(snap.year);
        setColor(snap.color); setPlate(snap.plate); setType(snap.type);
        setPhotos({
          exterior: details.photoExteriorUrl ?? null,
          interior: details.photoInteriorUrl ?? null,
          plate:    details.photoPlateUrl ?? null,
        });
      } catch {}
      setLoading(false);
    })();
  }, []);

  const hasChanges = !!original && (
    make !== original.make || model !== original.model || year !== original.year ||
    color !== original.color || plate !== original.plate || type !== original.type ||
    Object.values(photos).some(Boolean)
  );

  const pickPhoto = async (slot: PhotoSlot) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission required', 'Camera access is needed to photograph your vehicle.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.75, allowsEditing: false, exif: false });
    if (result.canceled || !result.assets[0]) return;
    setUploadingSlot(slot);
    try {
      const uploaded = await uploadApi.file(result.assets[0].uri, 'kyc');
      setPhotos(prev => ({ ...prev, [slot]: uploaded.url }));
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Check your connection and try again.');
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleSave = () => {
    const missing = PHOTO_SLOTS.filter(s => !photos[s.key]);
    if (missing.length > 0) {
      Alert.alert(
        'Photos required',
        `Add ${missing.map(m => m.label).join(', ')} photo${missing.length > 1 ? 's' : ''} so our team can verify the vehicle.`,
      );
      return;
    }
    Alert.alert(
      'Submit vehicle change?',
      'Our team reviews vehicle changes before they apply. You keep driving with your current vehicle until it is approved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit for review',
          onPress: async () => {
            setSaving(true);
            try {
              await driversApi.updateVehicle({
                vehicleType:  type || undefined,
                vehiclePlate: plate || undefined,
                make, model, year, color,
                photoExteriorUrl: photos.exterior ?? undefined,
                photoInteriorUrl: photos.interior ?? undefined,
                photoPlateUrl:    photos.plate ?? undefined,
              });
              setPendingChange({ requestedAt: new Date().toISOString() });
            } catch (e: any) {
              Alert.alert('Could not submit', e?.message ?? 'Please try again.');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>My Vehicle</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Pending review banner */}
        {pendingChange && (
          <View style={[styles.pendingCard, { backgroundColor: isDark ? '#1F1500' : '#FFFBEB', borderColor: '#D9770640' }]}>
            <Ionicons name="hourglass-outline" size={20} color="#D97706" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.pendingTitle, { color: '#D97706' }]}>Change under review</Text>
              <Text style={[styles.pendingText, { color: theme.textSecond }]}>
                Your vehicle change is with our team. You keep working with your current vehicle until it is approved.
              </Text>
            </View>
          </View>
        )}

        {/* Current registered vehicle */}
        <View style={[styles.vehiclePreview, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <View style={[styles.vehicleIconWrap, { backgroundColor: theme.primary + '15' }]}>
            <Ionicons name="car-sport-outline" size={36} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.vehicleLabel, { color: theme.textThird }]}>REGISTERED VEHICLE</Text>
            <Text style={[styles.vehicleTitle, { color: theme.text }]}>
              {[original?.make, original?.model, original?.year].filter(Boolean).join(' ') || 'Vehicle on file'}
            </Text>
            <Text style={[styles.vehicleSub, { color: theme.textSecond }]}>
              {[original?.color, original?.plate].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        {/* Vehicle type */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Vehicle Type</Text>
          <View style={styles.typeGrid}>
            {VEHICLE_TYPES.map(t => (
              <Pressable
                key={t.id}
                style={[
                  styles.typeChip,
                  { borderColor: type === t.id ? theme.primary : theme.border },
                  type === t.id && { backgroundColor: theme.primary + '12' },
                ]}
                onPress={() => setType(t.id)}
              >
                <Ionicons name={t.icon as any} size={18} color={type === t.id ? theme.primary : theme.textThird} />
                <Text style={[styles.typeLabel, { color: type === t.id ? theme.primary : theme.textSecond }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Fields */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Vehicle Information</Text>
          {[
            { label: 'Make', value: make, setter: setMake, placeholder: 'e.g. Bajaj' },
            { label: 'Model', value: model, setter: setModel, placeholder: 'e.g. Boxer 100' },
            { label: 'Year', value: year, setter: setYear, placeholder: 'e.g. 2022', keyboardType: 'numeric' as const },
            { label: 'Color', value: color, setter: setColor, placeholder: 'e.g. Red' },
            { label: 'Plate Number', value: plate, setter: setPlate, placeholder: 'e.g. LND 423 GH' },
          ].map(f => (
            <View key={f.label} style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>{f.label}</Text>
              <View style={[styles.fieldInput, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.fieldInputText, { color: theme.text }]}
                  placeholder={f.placeholder}
                  placeholderTextColor={theme.textThird}
                  value={f.value}
                  onChangeText={f.setter}
                  keyboardType={f.keyboardType}
                  autoCapitalize="words"
                />
              </View>
            </View>
          ))}
        </View>

        {/* Verification photos (founder 2026-08-10: outside, inside,
            plate close-up, required for the review) */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Verification Photos</Text>
          <Text style={[styles.photoHint, { color: theme.textSecond }]}>
            Three photos are required so our team can verify the vehicle: outside, inside, and the plate number.
          </Text>
          <View style={styles.photoRow}>
            {PHOTO_SLOTS.map(slot => (
              <Pressable
                key={slot.key}
                style={[styles.photoSlot, { borderColor: photos[slot.key] ? '#16A34A' : theme.border, backgroundColor: theme.background }]}
                onPress={() => pickPhoto(slot.key)}
                disabled={uploadingSlot !== null}
              >
                {uploadingSlot === slot.key ? (
                  <ActivityIndicator color={theme.primary} />
                ) : photos[slot.key] ? (
                  <>
                    <Image source={{ uri: photos[slot.key]! }} style={styles.photoImg} />
                    <View style={styles.photoCheck}>
                      <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                    </View>
                  </>
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={22} color={theme.textThird} />
                    <Text style={[styles.photoLabel, { color: theme.text }]}>{slot.label}</Text>
                    <Text style={[styles.photoSub, { color: theme.textThird }]}>{slot.hint}</Text>
                  </>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Review note */}
        <View style={[styles.infoNote, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
          <Ionicons name="shield-checkmark-outline" size={16} color={theme.textThird} />
          <Text style={[styles.infoText, { color: theme.textSecond }]}>
            Vehicle changes apply only after our team approves them. Keep your insurance documents current in KYC if the vehicle changed.
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
      )}

      {!loading && (
        <View style={[styles.ctaBar, { backgroundColor: theme.navBackground, borderTopColor: theme.border, paddingBottom: Spacing.md + insets.bottom }]}>
          <Pressable
            style={[styles.saveBtn, { backgroundColor: hasChanges ? theme.primary : theme.surfaceSecond }]}
            onPress={handleSave}
            disabled={!hasChanges || saving}
          >
            <Text style={[styles.saveBtnText, { color: hasChanges ? '#fff' : theme.textThird }]}>
              {saving ? 'Submitting…' : 'Submit for Review'}
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md },

  pendingCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  pendingTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  pendingText:  { fontSize: FontSize.xs, lineHeight: 17, marginTop: 2 },

  vehiclePreview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  vehicleIconWrap:{ width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  vehicleLabel:   { fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.8 },
  vehicleTitle:   { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginTop: 2 },
  vehicleSub:     { fontSize: FontSize.sm, marginTop: 2 },

  card:      { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  cardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  typeGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeChip:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.full, borderWidth: 1.5 },
  typeLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  fieldGroup:     { gap: 6 },
  fieldLabel:     { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  fieldInput:     { flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: Radius.xl, borderWidth: 1, paddingHorizontal: Spacing.md },
  fieldInputText: { flex: 1, fontSize: FontSize.base },

  photoHint: { fontSize: FontSize.sm, lineHeight: 19 },
  photoRow:  { flexDirection: 'row', gap: Spacing.sm },
  photoSlot: { flex: 1, aspectRatio: 0.85, borderRadius: Radius.lg, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6, overflow: 'hidden' },
  photoImg:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  photoCheck:{ position: 'absolute', top: 4, right: 4, backgroundColor: '#fff', borderRadius: 10 },
  photoLabel:{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, textAlign: 'center' },
  photoSub:  { fontSize: 9, textAlign: 'center', lineHeight: 12 },

  infoNote: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  infoText: { flex: 1, fontSize: FontSize.sm, lineHeight: 20 },

  ctaBar:      { padding: Spacing.md, borderTopWidth: 1 },
  saveBtn:     { height: 54, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
