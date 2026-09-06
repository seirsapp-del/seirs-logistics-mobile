/**
 * The quote-first lane: jobs SEIRS must not price automatically.
 *
 * The founder's examples were a transformer and an organ between
 * hospitals. Neither has a fare that comes out of a rate card, and a
 * plausible wrong number on either is worse than no number at all, so
 * the server REFUSES to price these rather than guessing. Ops read what
 * is written here, ring the sender, and write an itemised quote.
 *
 * WHY THE FORM ASKS WHAT IT ASKS. Every field here exists because a
 * dispatcher would otherwise have to ring and ask it, and the founder was
 * clear that on these jobs the phone call is the product. Weight and
 * dimensions decide the vehicle. Hands decide whether two men can lift
 * it or it needs four. Access at BOTH ends is the one people forget and
 * the one that turns a two-hour job into a six-hour job: a third-floor
 * walk-up with no lift is a different price from a loading bay.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not show a price, an
 * estimate, or a range, because we do not have one and inventing one
 * here would be the same mistake in the interface that the pricing
 * refusal exists to prevent on the server. And "when do you need it" is
 * captured as a NOTE, never as a deadline: SEIRS does not promise
 * arrival times, and a field like that rendered beside a quote is one
 * careless decision away from becoming an SLA.
 */
import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  StatusBar, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { specialRequestsApi } from '@/services/api';
import { showDialog } from '@/components/SeirsDialog';
import InlineAddressPicker from '@/components/InlineAddressPicker';
import { type PickedAddress } from '@/components/AddressPicker';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';

/**
 * The kinds of job that actually turn up, in the sender's words rather
 * than ours. "Other" is first-class: a list that forces a wrong choice
 * is worse than a blank, because ops then plan around the wrong one.
 */
const CATEGORIES = [
  'Industrial equipment',
  'Generator or transformer',
  'Furniture or fittings',
  'Building materials',
  'Livestock',
  'Medical',
  'Something else',
];

interface Place { address: string; lat: number; lng: number; }

export default function SpecialRequestScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const [description, setDescription] = useState('');
  const [category,    setCategory]    = useState<string | null>(null);
  const [weightKg,    setWeightKg]    = useState('');
  const [lengthCm,    setLengthCm]    = useState('');
  const [widthCm,     setWidthCm]     = useState('');
  const [heightCm,    setHeightCm]    = useState('');
  const [hands,       setHands]       = useState('');

  const [fragile,     setFragile]     = useState(false);
  const [hazardous,   setHazardous]   = useState(false);
  const [tempControl, setTempControl] = useState(false);

  const [timing,      setTiming]      = useState('');
  const [accessUp,    setAccessUp]    = useState('');
  const [accessDown,  setAccessDown]  = useState('');

  const [pickup,  setPickup]  = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [upName,  setUpName]  = useState('');
  const [upPhone, setUpPhone] = useState('');
  const [dnName,  setDnName]  = useState('');
  const [dnPhone, setDnPhone] = useState('');

  const [busy, setBusy] = useState(false);

  const num = (v: string): number | null => {
    const n = Number(String(v).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const ready = description.trim().length >= 10 && !!pickup && !!dropoff;

  const submit = async () => {
    if (!ready || !pickup || !dropoff) return;
    setBusy(true);
    try {
      const res = await specialRequestsApi.create({
        description:           description.trim(),
        category,
        weightKg:              num(weightKg),
        lengthCm:              num(lengthCm),
        widthCm:               num(widthCm),
        heightCm:              num(heightCm),
        liftingHands:          num(hands),
        fragile,
        hazardous,
        temperatureControlled: tempControl,
        timeCriticality:       timing.trim() || null,
        accessPickup:          accessUp.trim() || null,
        accessDropoff:         accessDown.trim() || null,
        pickupAddress:         pickup.address,
        pickupLat:             pickup.lat,
        pickupLng:             pickup.lng,
        pickupContactName:     upName.trim() || null,
        pickupContactPhone:    upPhone.trim() || null,
        dropoffAddress:        dropoff.address,
        dropoffLat:            dropoff.lat,
        dropoffLng:            dropoff.lng,
        dropoffContactName:    dnName.trim() || null,
        dropoffContactPhone:   dnPhone.trim() || null,
        // Recorded here, where the sender is describing the load and knows
        // what is in it. See the legal line above the button.
        acceptedLiability:     true,
      });
      router.replace({ pathname: '/(customer)/special-request/[id]', params: { id: res.id } } as any);
    } catch (e: any) {
      showDialog({ title: tr('auto.specialRequest.couldNotSendThat', 'Could not send that'), message: e?.message ?? 'Try again in a moment.' });
    } finally {
      setBusy(false);
    }
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: theme.textSecond }]}>{label}</Text>
      {children}
    </View>
  );

  const input = [styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.specialRequest.getAQuote', 'Get a quote')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.intro, { backgroundColor: theme.primary + '12' }]}>
          <Ionicons name="construct-outline" size={20} color={theme.primary} />
          <Text style={[styles.introText, { color: theme.textSecond }]}>
            {tr('auto.specialRequest.forLoadsOurNormalPricing', 'For loads our normal pricing cannot cover: a transformer, a generator, anything that needs lifting hands or special handling. Tell us about it and we will call you and send a full breakdown. Nothing is charged until you accept the quote.')}
          </Text>
        </View>

        <Field label={tx('auto.specialRequest.whatAreWeMoving', 'WHAT ARE WE MOVING?')}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={tx('auto.specialRequest.describeItPlainlyWhatIt', 'Describe it plainly. What it is, roughly how big, anything unusual about it.')}
            placeholderTextColor={theme.textThird}
            multiline
            style={[...input, { minHeight: 96, textAlignVertical: 'top' }]}
          />
        </Field>

        <Field label={tx('auto.specialRequest.whatKindOfThingIs', 'WHAT KIND OF THING IS IT?')}>
          <View style={styles.chips}>
            {CATEGORIES.map(c => {
              const on = category === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCategory(on ? null : c)}
                  style={[styles.chip, {
                    borderColor:     on ? theme.primary : theme.border,
                    backgroundColor: on ? theme.primary : theme.surface,
                  }]}
                >
                  <Text style={[styles.chipText, { color: on ? '#fff' : theme.text }]}>{c}</Text>
                </Pressable>
              );
            })}
          </View>
          {category === 'Medical' && (
            /* Accepted into the queue for manual eligibility, never advertised
               as a service: the insurance position is not settled, and it
               collides with our rule against promising arrival times. */
            <Text style={[styles.note, { color: '#92400E' }]}>
              {tr('auto.specialRequest.medicalLoadsAreReviewedCase', 'Medical loads are reviewed case by case before we can accept them, and we will tell you either way. We do not promise arrival times.')}
            </Text>
          )}
        </Field>

        <Field label={tx('auto.specialRequest.weightAndSizeOptionalBut', 'WEIGHT AND SIZE (OPTIONAL, BUT IT DECIDES THE VEHICLE)')}>
          <View style={styles.row}>
            <TextInput value={weightKg} onChangeText={setWeightKg} keyboardType="numeric"
              placeholder={tx('auto.specialRequest.weightKg', 'Weight kg')} placeholderTextColor={theme.textThird} style={[...input, { flex: 1 }]} />
            <TextInput value={hands} onChangeText={setHands} keyboardType="numeric"
              placeholder={tx('auto.specialRequest.handsToLift', 'Hands to lift')} placeholderTextColor={theme.textThird} style={[...input, { flex: 1 }]} />
          </View>
          <View style={styles.row}>
            <TextInput value={lengthCm} onChangeText={setLengthCm} keyboardType="numeric"
              placeholder={tx('auto.specialRequest.lengthCm', 'Length cm')} placeholderTextColor={theme.textThird} style={[...input, { flex: 1 }]} />
            <TextInput value={widthCm} onChangeText={setWidthCm} keyboardType="numeric"
              placeholder={tx('auto.specialRequest.widthCm', 'Width cm')} placeholderTextColor={theme.textThird} style={[...input, { flex: 1 }]} />
            <TextInput value={heightCm} onChangeText={setHeightCm} keyboardType="numeric"
              placeholder={tx('auto.specialRequest.heightCm', 'Height cm')} placeholderTextColor={theme.textThird} style={[...input, { flex: 1 }]} />
          </View>
        </Field>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {([
            ['Fragile', fragile, setFragile, 'Needs careful handling or padding.'],
            ['Hazardous', hazardous, setHazardous, 'Fuel, chemicals, gas, anything flammable.'],
            ['Temperature controlled', tempControl, setTempControl, 'Must stay cold or must not freeze.'],
          ] as const).map(([label, value, set, hint], i) => (
            <View key={label} style={[styles.toggleRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.divider }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: theme.text }]}>{label}</Text>
                <Text style={[styles.toggleHint, { color: theme.textThird }]}>{hint}</Text>
              </View>
              <Switch value={value} onValueChange={set as any} />
            </View>
          ))}
        </View>

        <Field label={tx('auto.specialRequest.pickingUpFrom', 'PICKING UP FROM')}>
          <InlineAddressPicker
            label={tx('auto.specialRequest.pickup', 'Pickup')}
            dotColor="#16A34A"
            value={pickup?.address ?? ''}
            onSelect={(p: PickedAddress) => setPickup(p)}
            onClear={() => setPickup(null)}
          />
          <TextInput value={accessUp} onChangeText={setAccessUp}
            placeholder={tx('auto.specialRequest.gettingItOutStairsLift', 'Getting it out: stairs, lift, loading bay, gate width?')}
            placeholderTextColor={theme.textThird} style={input as any} />
          <View style={styles.row}>
            <TextInput value={upName} onChangeText={setUpName} placeholder={tx('auto.specialRequest.contactName', 'Contact name')}
              placeholderTextColor={theme.textThird} style={[...input, { flex: 1 }]} />
            <TextInput value={upPhone} onChangeText={setUpPhone} keyboardType="phone-pad"
              placeholder={tx('auto.specialRequest.phone', 'Phone')} placeholderTextColor={theme.textThird} style={[...input, { flex: 1 }]} />
          </View>
        </Field>

        <Field label={tx('auto.specialRequest.takingItTo', 'TAKING IT TO')}>
          <InlineAddressPicker
            label={tx('auto.specialRequest.dropOff', 'Drop-off')}
            dotColor="#DC2626"
            value={dropoff?.address ?? ''}
            onSelect={(p: PickedAddress) => setDropoff(p)}
            onClear={() => setDropoff(null)}
          />
          <TextInput value={accessDown} onChangeText={setAccessDown}
            placeholder={tx('auto.specialRequest.gettingItInStairsLift', 'Getting it in: stairs, lift, loading bay, gate width?')}
            placeholderTextColor={theme.textThird} style={input as any} />
          <View style={styles.row}>
            <TextInput value={dnName} onChangeText={setDnName} placeholder={tx('auto.specialRequest.contactName', 'Contact name')}
              placeholderTextColor={theme.textThird} style={[...input, { flex: 1 }]} />
            <TextInput value={dnPhone} onChangeText={setDnPhone} keyboardType="phone-pad"
              placeholder={tx('auto.specialRequest.phone', 'Phone')} placeholderTextColor={theme.textThird} style={[...input, { flex: 1 }]} />
          </View>
        </Field>

        <Field label={tx('auto.specialRequest.whenWouldYouLikeIt', 'WHEN WOULD YOU LIKE IT MOVED?')}>
          <TextInput
            value={timing}
            onChangeText={setTiming}
            placeholder={tx('auto.specialRequest.tellUsWhatSuitsYou', 'Tell us what suits you and we will say what is possible.')}
            placeholderTextColor={theme.textThird}
            style={input as any}
          />
          {/* Deliberately not a date picker. See the file header: we do not
              promise arrival times, and a deadline field beside a quote
              becomes one whether we meant it to or not. */}
          <Text style={[styles.note, { color: theme.textThird }]}>
            {tr('auto.specialRequest.weWillTellYouWhat', 'We will tell you what is realistic before you accept anything. We do not promise arrival times.')}
          </Text>
        </Field>

        <Text style={[styles.legal, { color: theme.textThird }]}>
          {tr('auto.specialRequest.bySendingThisYouConfirm', 'By sending this you confirm the load is legal to move and described honestly. Responsibility for anything illegal or misdeclared rests with whoever booked it.')}
        </Text>

        <Pressable
          onPress={submit}
          disabled={!ready || busy}
          style={[styles.submit, { backgroundColor: ready && !busy ? theme.primary : theme.border }]}
        >
          {busy
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitText}>{tx('auto.specialRequest.sendForAQuote', 'Send for a quote')}</Text>}
        </Pressable>
        <Text style={[styles.note, { color: theme.textThird, textAlign: 'center' }]}>
          {tr('auto.specialRequest.nothingIsChargedNowWe', 'Nothing is charged now. We will call you, then send a full breakdown.')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
               paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn:   { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  content:   { padding: Spacing.md, gap: Spacing.lg, paddingBottom: 48 },
  intro:     { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg },
  introText: { flex: 1, fontSize: FontSize.sm, lineHeight: 20 },
  label:     { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  input:     { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12,
               fontSize: FontSize.base },
  row:       { flexDirection: 'row', gap: Spacing.sm },
  chips:     { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip:      { paddingHorizontal: 12, paddingVertical: 9, borderRadius: Radius.full, borderWidth: 1 },
  chipText:  { fontSize: FontSize.sm, fontWeight: '600' },
  card:      { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 12 },
  toggleLabel:{ fontSize: FontSize.base, fontWeight: '600' },
  toggleHint:{ fontSize: FontSize.xs, marginTop: 2 },
  note:      { fontSize: FontSize.xs, lineHeight: 17 },
  legal:     { fontSize: FontSize.xs, lineHeight: 17 },
  submit:    { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  submitText:{ color: '#fff', fontSize: FontSize.base, fontWeight: '700' },
});
