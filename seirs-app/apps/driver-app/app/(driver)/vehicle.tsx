/**
 * Vehicle change, self-serve, with an admin approving it.
 *
 * Founder decision 2026-08-25: "just like change bank account". A rider
 * who buys a vehicle submits it with the same proof KYC asked for, and an
 * admin approves. Not onerous for someone already approved: the identity
 * documents (NIN, licence, selfie) are NOT re-asked, because those belong
 * to the person and have not changed. Only the proofs about the machine.
 *
 * Nothing here ever changes the live vehicle. Matching and pricing read
 * vehicleType, so a silent okada-to-car switch would be a pricing hole,
 * and the rider keeps working on the current vehicle until an admin says
 * otherwise. Submission creates a pending request and nothing else.
 *
 * WHY this screen was rewritten: it was talking to the old model, where
 * the request lived in a `pendingChange` jsonb blob on the driver row.
 * That blob is handed to the customer app whole by
 * redactDriverForCustomer, so every proof photo URL in a pending request
 * was shipped to the sender's phone, and an approved change overwrote the
 * blob so there was no record of what was approved on what evidence. It
 * is a table now (driver_vehicle_changes) and this reads and writes that.
 *
 * Third-party ownership is first class, not an edge case. A large share
 * of okada and keke riders do not own the machine: hire purchase, a
 * relative's bike, an owner who fronts it for a daily return. See
 * VehicleOwnershipForm for how the owner signs without needing the app.
 */
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { driversApi, uploadApi } from '@/services/api';
import type { VehicleChangeDTO, VehicleRecordDTO } from '@/services/api';
import { DocUploadTile } from '@/components/DocUploadTile';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';
import {
  VehicleOwnershipForm, ownershipProblems, EMPTY_OWNERSHIP, type OwnershipValue,
} from '@/components/VehicleOwnershipForm';

/**
 * Canonical backend taxonomy, with the names Nigerians actually use.
 * Truck is cargo, never a ride, and the labels say so.
 */
const VEHICLE_TYPES = [
  { id: 'bicycle',     label: 'Bicycle',            icon: 'bicycle-outline'   },
  { id: 'motorcycle',  label: 'Okada (Motorcycle)', icon: 'bicycle'           },
  { id: 'tricycle',    label: 'Keke (Tricycle)',    icon: 'car-outline'       },
  { id: 'car',         label: 'Car',                icon: 'car-sport-outline' },
  { id: 'van',         label: 'Van / Danfo',        icon: 'bus-outline'       },
  { id: 'truck_small', label: 'Small Truck',        icon: 'cube-outline'      },
  { id: 'truck_large', label: 'Large Truck',        icon: 'construct-outline' },
];

type PhotoSlot = 'exterior' | 'interior' | 'plate' | 'ownershipProof' | 'insuranceCert';

const VEHICLE_PHOTOS: { key: PhotoSlot; label: string; hint: string }[] = [
  { key: 'exterior', label: 'Outside',      hint: 'Full side view' },
  { key: 'interior', label: 'Inside',       hint: 'Seat / cargo area' },
  { key: 'plate',    label: 'Plate Number', hint: 'Close-up, readable' },
];

const PAPERS: { key: PhotoSlot; label: string; hint: string }[] = [
  { key: 'ownershipProof', label: 'Vehicle ownership papers', hint: "Registration papers, even if they are in the owner's name" },
  { key: 'insuranceCert',  label: 'Insurance certificate',    hint: 'Must be valid and cover this vehicle' },
];

const EMPTY_PHOTOS: Record<PhotoSlot, string | null> = {
  exterior: null, interior: null, plate: null, ownershipProof: null, insuranceCert: null,
};

export default function VehicleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const [loading, setLoading] = useState(true);
  const [record,  setRecord]  = useState<VehicleRecordDTO | null>(null);
  const [pending, setPending] = useState<VehicleChangeDTO | null>(null);
  const [riderName, setRiderName] = useState<string | null>(null);

  const [type,   setType]   = useState('');
  const [make,   setMake]   = useState('');
  const [model,  setModel]  = useState('');
  const [year,   setYear]   = useState('');
  const [color,  setColor]  = useState('');
  const [plate,  setPlate]  = useState('');
  const [reason, setReason] = useState('');
  const [ownership, setOwnership] = useState<OwnershipValue>(EMPTY_OWNERSHIP);
  const [photos, setPhotos] = useState<Record<PhotoSlot, string | null>>(EMPTY_PHOTOS);

  const [uploadingSlot, setUploadingSlot] = useState<PhotoSlot | null>(null);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [sheet,  setSheet]  = useState<SeirsSheetSpec | null>(null);

  const load = async () => {
    try {
      const [rec, me] = await Promise.all([
        driversApi.getVehicle(),
        driversApi.me().catch(() => null),
      ]);
      setRecord(rec);
      setRiderName(me?.user?.name ?? me?.name ?? null);
      setPending(rec.pendingChange && rec.pendingChange.status === 'pending' ? rec.pendingChange : null);
      // Seed the form from the live vehicle: a rider changing one thing
      // about their machine should not retype the other five.
      setType(rec.vehicleType ?? '');
      setMake(rec.make ?? '');
      setModel(rec.model ?? '');
      setYear(rec.year ?? '');
      setColor(rec.color ?? '');
      setPlate(rec.vehiclePlate ?? '');
      const o = rec.ownership;
      if (o?.declared) {
        setOwnership({
          ownership:          o.ownership ?? 'self',
          ownerName:          o.ownerName ?? '',
          ownerPhone:         o.ownerPhone ?? '',
          ownerRelationship:  o.ownerRelationship ?? '',
          ownerConsentUrl:    o.ownerConsentUrl ?? null,
          ownerIdUrl:         o.ownerIdUrl ?? null,
          ownerSignatureName: o.ownerSignatureName ?? '',
        });
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not load your vehicle. Pull down or try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Photos ────────────────────────────────────────────────────────────
  const choosePhoto = (slot: PhotoSlot, label: string) => setSheet({
    title: label,
    message: 'How do you want to add it?',
    options: [
      { label: 'Take a photo',        variant: 'primary', icon: 'camera-outline', onPress: () => grab(slot, 'camera') },
      { label: 'Choose from gallery', icon: 'images-outline',                     onPress: () => grab(slot, 'library') },
    ],
  });

  const grab = async (slot: PhotoSlot, source: 'camera' | 'library') => {
    try {
      let uri: string | null = null;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== 'granted') { setError('Camera access is needed to photograph the vehicle.'); return; }
        const r = await ImagePicker.launchCameraAsync({ quality: 0.75, allowsEditing: false, exif: false });
        uri = r.canceled ? null : r.assets[0].uri;
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== 'granted') { setError('Photo library access is needed.'); return; }
        const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.75, allowsEditing: false });
        uri = r.canceled ? null : r.assets[0].uri;
      }
      if (!uri) return;
      setUploadingSlot(slot);
      setError(null);
      const up = await uploadApi.file(uri, 'image/jpeg', 'kyc');
      setPhotos(prev => ({ ...prev, [slot]: up.url }));
    } catch (e: any) {
      setError(e?.message ?? 'Upload failed. Check your connection and try again.');
    } finally {
      setUploadingSlot(null);
    }
  };

  // ── What is still missing, in the order a rider hits it ───────────────
  const problems: string[] = (() => {
    if (pending) return [];
    const out: string[] = [];
    if (!type) out.push('Which kind of vehicle it is.');
    if (!plate.trim() && type !== 'bicycle') out.push('The plate number.');
    const missingPhotos = VEHICLE_PHOTOS.filter(p => !photos[p.key]);
    if (missingPhotos.length) {
      out.push(`Photo of the ${missingPhotos.map(p => p.label.toLowerCase()).join(', ')}.`);
    }
    if (!photos.ownershipProof) out.push('The vehicle ownership papers.');
    if (!photos.insuranceCert)  out.push('A valid insurance certificate.');
    out.push(...ownershipProblems(ownership, riderName));
    return out;
  })();

  const canSubmit = !pending && problems.length === 0 && !saving;

  const confirmSubmit = () => setSheet({
    title: 'Submit this vehicle for review?',
    message: 'Our team checks it before it applies. You keep working with your current vehicle until they approve it, so nothing about your jobs changes today.',
    options: [
      { label: 'Submit for review', variant: 'primary', icon: 'send-outline', onPress: doSubmit },
    ],
    cancelLabel: 'Not yet',
  });

  const doSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await driversApi.submitVehicleChange({
        vehicleType:  type,
        vehiclePlate: plate.trim() || undefined,
        make:  make.trim()  || undefined,
        model: model.trim() || undefined,
        year:  year.trim()  || undefined,
        color: color.trim() || undefined,
        photoExteriorUrl:  photos.exterior ?? undefined,
        photoInteriorUrl:  photos.interior ?? undefined,
        photoPlateUrl:     photos.plate ?? undefined,
        ownershipProofUrl: photos.ownershipProof ?? undefined,
        insuranceCertUrl:  photos.insuranceCert ?? undefined,
        reason: reason.trim() || undefined,
        // Who owns it travels WITH the change. An approved rider cannot
        // edit the standing declaration any more (the server answers
        // VEHICLE_OWNERSHIP_LOCKED), so this submission is the only way a
        // new owner reaches compliance.
        ownership:          ownership.ownership,
        ownerName:          ownership.ownerName || undefined,
        ownerPhone:         ownership.ownerPhone || undefined,
        ownerRelationship:  (ownership.ownerRelationship || undefined) as any,
        ownerConsentUrl:    ownership.ownerConsentUrl ?? undefined,
        ownerIdUrl:         ownership.ownerIdUrl ?? undefined,
        ownerSignatureName: ownership.ownerSignatureName || undefined,
      });
      setPending(res.change);
      setPhotos(EMPTY_PHOTOS);
      setSheet({
        title: 'Sent for review',
        message: res.message
          || 'Our team has it. You will hear back through your support messages. Keep riding your current vehicle in the meantime.',
        options: [{ label: 'Got it', variant: 'primary' }],
        cancelLabel: null,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Could not submit. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmWithdraw = () => setSheet({
    title: 'Withdraw this request?',
    message: 'It stops the review. Nothing about your current vehicle changes, and you can submit again whenever you are ready.',
    options: [
      { label: 'Withdraw it', variant: 'destructive', icon: 'close-circle-outline', onPress: doWithdraw },
    ],
    cancelLabel: 'Keep it under review',
  });

  const doWithdraw = async () => {
    setSaving(true);
    setError(null);
    try {
      await driversApi.withdrawVehicleChange();
      setPending(null);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not withdraw the request. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const liveTitle = [record?.make, record?.model, record?.year].filter(Boolean).join(' ')
    || VEHICLE_TYPES.find(v => v.id === record?.vehicleType)?.label
    || 'Vehicle on file';
  const liveSub = [record?.color, record?.vehiclePlate].filter(Boolean).join(' · ');
  const lastDecision = record?.pendingChange && record.pendingChange.status === 'rejected'
    ? record.pendingChange : null;

  return (
    // 'bottom' is deliberately NOT in edges. The sticky CTA bar below
    // already adds insets.bottom, and with edgeToEdgeEnabled the two
    // paddings stacked and floated the button ~112dp up the screen on
    // 3-button navigation.
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SeirsSheet spec={sheet} onClose={() => setSheet(null)} />

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
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

            {/* The vehicle that is actually live. Always shown, because the
                whole point of the review is that this does not change. */}
            <View style={[styles.livePreview, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
              <View style={[styles.liveIcon, { backgroundColor: theme.primary + '15' }]}>
                <Ionicons name="car-sport-outline" size={32} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.liveLabel, { color: theme.textThird }]}>WHAT YOU RIDE TODAY</Text>
                <Text style={[styles.liveTitle, { color: theme.text }]}>{liveTitle}</Text>
                {!!liveSub && <Text style={[styles.liveSub, { color: theme.textSecond }]}>{liveSub}</Text>}
                {record?.ownership?.declared && record.ownership.ownership === 'third_party' && (
                  <Text style={[styles.liveOwner, { color: theme.textSecond }]}>
                    Owned by {record.ownership.ownerName ?? 'someone else'}, on file
                  </Text>
                )}
              </View>
            </View>

            {!!error && (
              <View style={[styles.errBox, { borderColor: theme.error, backgroundColor: isDark ? '#3F1F1F' : '#FEF2F2' }]}>
                <Ionicons name="alert-circle-outline" size={18} color={theme.error} />
                <Text style={[styles.errText, { color: theme.error }]}>{error}</Text>
              </View>
            )}

            {pending ? (
              /* One request at a time. Re-rendering the form under a
                 pending review invites a rider to fill it all in again and
                 then be told no. */
              <View style={[styles.pendingCard, { backgroundColor: isDark ? '#D9770622' : '#FFFBEB', borderColor: theme.warning }]}>
                <View style={styles.pendingHead}>
                  <Ionicons name="hourglass-outline" size={20} color={theme.warning} />
                  <Text style={[styles.pendingTitle, { color: theme.warning }]}>Change under review</Text>
                </View>
                <Text style={[styles.pendingText, { color: theme.textSecond }]}>
                  Our team has your submission. You keep working with your current vehicle
                  until it is approved, and you will hear back through your support messages.
                </Text>
                <View style={[styles.pendingRow, { borderTopColor: theme.border }]}>
                  <Text style={[styles.pendingKey, { color: theme.textThird }]}>Submitted</Text>
                  <Text style={[styles.pendingVal, { color: theme.text }]}>
                    {new Date(pending.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={[styles.pendingRow, { borderTopColor: theme.border }]}>
                  <Text style={[styles.pendingKey, { color: theme.textThird }]}>Vehicle</Text>
                  <Text style={[styles.pendingVal, { color: theme.text }]}>
                    {[
                      VEHICLE_TYPES.find(v => v.id === pending.vehicleType)?.label ?? pending.vehicleType,
                      pending.vehiclePlate,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={[styles.pendingRow, { borderTopColor: theme.border }]}>
                  <Text style={[styles.pendingKey, { color: theme.textThird }]}>Owner</Text>
                  <Text style={[styles.pendingVal, { color: theme.text }]}>
                    {pending.ownership === 'third_party' ? (pending.ownerName ?? 'Someone else') : 'You'}
                  </Text>
                </View>
                <Pressable
                  style={[styles.withdrawBtn, { borderColor: theme.error }]}
                  onPress={confirmWithdraw}
                  disabled={saving}
                >
                  <Text style={[styles.withdrawText, { color: theme.error }]}>
                    {saving ? 'Working...' : 'Withdraw this request'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                {/* A rejection is only useful if the rider can read WHY. */}
                {lastDecision && (
                  <View style={[styles.rejectCard, { backgroundColor: theme.surface, borderColor: theme.error }]}>
                    <View style={styles.pendingHead}>
                      <Ionicons name="close-circle-outline" size={20} color={theme.error} />
                      <Text style={[styles.pendingTitle, { color: theme.error }]}>Last request was not approved</Text>
                    </View>
                    <Text style={[styles.pendingText, { color: theme.textSecond }]}>
                      {lastDecision.decisionNote || 'No reason was recorded. Ask support what is missing before resubmitting.'}
                    </Text>
                  </View>
                )}

                <View style={[styles.note, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={theme.textThird} />
                  <Text style={[styles.noteText, { color: theme.textSecond }]}>
                    Same proof you gave for the vehicle at sign-up, nothing about you personally.
                    Your ID, licence and selfie stay as they are.
                  </Text>
                </View>

                {/* Vehicle type */}
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>Vehicle type</Text>
                  <View style={styles.typeGrid}>
                    {VEHICLE_TYPES.map(t => {
                      const active = type === t.id;
                      return (
                        <Pressable
                          key={t.id}
                          style={[
                            styles.typeChip,
                            { borderColor: active ? theme.primary : theme.border },
                            active && { backgroundColor: theme.primary + '12' },
                          ]}
                          onPress={() => setType(t.id)}
                        >
                          <Ionicons name={t.icon as any} size={18} color={active ? theme.primary : theme.textThird} />
                          <Text style={[styles.typeLabel, { color: active ? theme.primary : theme.textSecond }]}>{t.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {type !== '' && record?.vehicleType && type !== record.vehicleType && (
                    <Text style={[styles.typeWarn, { color: theme.warning }]}>
                      This changes what jobs you are offered and what they pay, which is why an
                      admin has to approve it.
                    </Text>
                  )}
                </View>

                {/* Vehicle information */}
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>Vehicle information</Text>
                  {([
                    { label: 'Plate number', value: plate,  set: setPlate,  placeholder: 'e.g. LND 423 GH', cap: 'characters' as const },
                    { label: 'Make',         value: make,   set: setMake,   placeholder: 'e.g. Bajaj',      cap: 'words' as const },
                    { label: 'Model',        value: model,  set: setModel,  placeholder: 'e.g. Boxer 100',  cap: 'words' as const },
                    { label: 'Year',         value: year,   set: setYear,   placeholder: 'e.g. 2022',       cap: 'none' as const, numeric: true },
                    { label: 'Colour',       value: color,  set: setColor,  placeholder: 'e.g. Red',        cap: 'words' as const },
                  ]).map(f => (
                    <View key={f.label} style={styles.fieldGroup}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>{f.label}</Text>
                      <TextInput
                        style={[styles.fieldInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
                        placeholder={f.placeholder}
                        placeholderTextColor={theme.textThird}
                        value={f.value}
                        onChangeText={f.set}
                        keyboardType={f.numeric ? 'numeric' : 'default'}
                        autoCapitalize={f.cap}
                      />
                    </View>
                  ))}
                </View>

                {/* Photos of the vehicle */}
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>Photos of the vehicle</Text>
                  <Text style={[styles.cardHint, { color: theme.textSecond }]}>
                    Fresh photos of the vehicle you are registering now, not the old one.
                  </Text>
                  <View style={styles.photoRow}>
                    {VEHICLE_PHOTOS.map(slot => (
                      <DocUploadTile
                        key={slot.key}
                        tall
                        label={slot.label}
                        hint={slot.hint}
                        url={photos[slot.key]}
                        busy={uploadingSlot === slot.key}
                        onPress={() => choosePhoto(slot.key, slot.label)}
                      />
                    ))}
                  </View>
                </View>

                {/* Papers */}
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>Papers</Text>
                  {PAPERS.map(p => (
                    <View key={p.key} style={{ gap: 6 }}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>{p.label}</Text>
                      <Text style={[styles.cardHint, { color: theme.textThird }]}>{p.hint}</Text>
                      <DocUploadTile
                        label={p.label}
                        url={photos[p.key]}
                        busy={uploadingSlot === p.key}
                        onPress={() => choosePhoto(p.key, p.label)}
                      />
                    </View>
                  ))}
                </View>

                {/* Who owns it. Same component KYC uses, so the two can
                    never drift into asking for different things. */}
                <VehicleOwnershipForm
                  value={ownership}
                  onChange={setOwnership}
                  riderName={riderName}
                />

                {/* Why, in the rider's own words. Optional: an admin
                    reading "bike was stolen last week" decides faster than
                    one reading a form with no story attached. */}
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    Why are you changing? <Text style={{ color: theme.textThird, fontWeight: FontWeight.medium as any }}>(optional)</Text>
                  </Text>
                  <TextInput
                    style={[styles.reasonInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
                    placeholder="e.g. Sold the keke and bought a Boxer"
                    placeholderTextColor={theme.textThird}
                    value={reason}
                    onChangeText={setReason}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>

                {problems.length > 0 && (
                  <View style={[styles.problems, { borderColor: theme.warning, backgroundColor: isDark ? '#D9770622' : '#FFFBEB' }]}>
                    <Text style={[styles.problemsTitle, { color: theme.warning }]}>Still needed</Text>
                    {problems.map(p => (
                      <Text key={p} style={[styles.problemLine, { color: theme.textSecond }]}>{'•'}  {p}</Text>
                    ))}
                  </View>
                )}
              </>
            )}

            <View style={{ height: 100 }} />
          </ScrollView>

          {!pending && (
            <View style={[styles.ctaBar, {
              backgroundColor: theme.navBackground,
              borderTopColor: theme.border,
              paddingBottom: Spacing.md + insets.bottom,
            }]}>
              <Pressable
                style={[styles.saveBtn, { backgroundColor: canSubmit ? theme.primary : theme.surfaceSecond }]}
                onPress={confirmSubmit}
                disabled={!canSubmit}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={[styles.saveBtnText, { color: canSubmit ? '#fff' : theme.textThird }]}>Submit for review</Text>}
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  content: { padding: Spacing.md, gap: Spacing.md },

  livePreview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  liveIcon:    { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  liveLabel:   { fontSize: 10, fontWeight: FontWeight.bold as any, letterSpacing: 0.8 },
  liveTitle:   { fontSize: FontSize.base, fontWeight: FontWeight.bold as any, marginTop: 2 },
  liveSub:     { fontSize: FontSize.sm, marginTop: 2 },
  liveOwner:   { fontSize: FontSize.xs, marginTop: 4, fontStyle: 'italic' },

  errBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  errText: { flex: 1, fontSize: FontSize.xs, lineHeight: 18 },

  pendingCard:  { padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5, gap: Spacing.sm },
  rejectCard:   { padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5, gap: Spacing.sm },
  pendingHead:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendingTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold as any },
  pendingText:  { fontSize: FontSize.xs, lineHeight: 18 },
  pendingRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 8, marginTop: 2 },
  pendingKey:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any, letterSpacing: 0.6 },
  pendingVal:   { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any, flexShrink: 1, textAlign: 'right' },
  withdrawBtn:  { height: 46, borderRadius: Radius.lg, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
  withdrawText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold as any },

  note:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  noteText: { flex: 1, fontSize: FontSize.xs, lineHeight: 18 },

  card:      { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  cardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  cardHint:  { fontSize: FontSize.xs, lineHeight: 17 },

  typeGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeChip:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.full, borderWidth: 1.5 },
  typeLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium as any },
  typeWarn:  { fontSize: FontSize.xs, lineHeight: 17 },

  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium as any },
  fieldInput: { height: 48, borderRadius: Radius.xl, borderWidth: 1, paddingHorizontal: Spacing.md, fontSize: FontSize.base },

  photoRow: { flexDirection: 'row', gap: Spacing.sm },

  reasonInput: { minHeight: 84, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, fontSize: FontSize.sm },

  problems:      { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 4 },
  problemsTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },
  problemLine:   { fontSize: FontSize.xs, lineHeight: 18 },

  ctaBar:      { padding: Spacing.md, borderTopWidth: 1 },
  saveBtn:     { height: 54, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
});
