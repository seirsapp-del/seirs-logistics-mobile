/**
 * The quote-first lane, business side: loads SEIRS must not price
 * automatically.
 *
 * Same lane as the customer app and deliberately the same questions, but
 * this is where it will actually get used. A trader moving a generator, a
 * transformer, a lathe or a shop's worth of fittings is the case the
 * founder described, and none of it comes out of a rate card. The server
 * REFUSES to price these rather than guessing, because a plausible wrong
 * number on a transformer is worse than no number at all.
 *
 * WHY THE FORM ASKS WHAT IT ASKS. Every field is one a dispatcher would
 * otherwise have to ring and ask, and on these jobs the phone call IS the
 * product. Weight and dimensions decide the vehicle, which is the first
 * line of the quote. Hands decide whether two men can lift it or it needs
 * four. Access at BOTH ends is the one people forget and the one that
 * turns a two-hour job into a six-hour one: a third-floor walk-up with no
 * lift is not the same price as a loading bay.
 *
 * WHAT IT DELIBERATELY WILL NOT DO. No price, no estimate, no range. We
 * do not have one, and inventing a number here would be the same mistake
 * in the interface that the pricing refusal exists to prevent on the
 * server. Timing is captured as a NOTE, never a deadline: SEIRS does not
 * promise arrival times, and a field like that beside a quote becomes an
 * SLA whether anybody meant it to or not.
 */
import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  StatusBar, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { specialRequestsApi } from '@/services/api';
import { StreetAutocomplete } from '@/components/StreetAutocomplete';
import { tx } from '@/i18n/tx';

/**
 * The kinds of load that actually turn up on the business side. "Something
 * else" is first-class: a list that forces a wrong choice is worse than a
 * blank, because ops then plan around the wrong one.
 */
const CATEGORIES = [
  'Industrial equipment',
  'Generator or transformer',
  'Shop fittings',
  'Building materials',
  'Bulk stock',
  'Livestock',
  'Medical',
  'Something else',
];

export default function BusinessSpecialRequest() {
  const router = useRouter();
  const { isDark } = useTheme();
  const theme = Colors[isDark ? 'dark' : 'light'];

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

  const [timing,     setTiming]     = useState('');
  const [accessUp,   setAccessUp]   = useState('');
  const [accessDown, setAccessDown] = useState('');

  const [upAddr,  setUpAddr]  = useState('');
  const [upPin,   setUpPin]   = useState<{ lat: number; lng: number } | null>(null);
  const [dnAddr,  setDnAddr]  = useState('');
  const [dnPin,   setDnPin]   = useState<{ lat: number; lng: number } | null>(null);
  const [upName,  setUpName]  = useState('');
  const [upPhone, setUpPhone] = useState('');
  const [dnName,  setDnName]  = useState('');
  const [dnPhone, setDnPhone] = useState('');

  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState('');

  const num = (v: string): number | null => {
    const n = Number(String(v).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  /**
   * Both ends need a real PIN, not just typed text. A typed address is
   * words, and a quote for a job that needs a lorry and four men cannot
   * be built against words: ops have to see where it is.
   */
  const ready = description.trim().length >= 10 && !!upPin && !!dnPin;

  const submit = async () => {
    if (!ready || !upPin || !dnPin) return;
    setBusy(true);
    setError('');
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
        pickupAddress:         upAddr.trim(),
        pickupLat:             upPin.lat,
        pickupLng:             upPin.lng,
        pickupContactName:     upName.trim() || null,
        pickupContactPhone:    upPhone.trim() || null,
        dropoffAddress:        dnAddr.trim(),
        dropoffLat:            dnPin.lat,
        dropoffLng:            dnPin.lng,
        dropoffContactName:    dnName.trim() || null,
        dropoffContactPhone:   dnPhone.trim() || null,
        // Recorded here, while they are describing the load and know what
        // is in it. See the line above the button.
        acceptedLiability:     true,
      });
      router.replace({ pathname: '/(business)/special-request/[id]', params: { id: res.id } } as any);
    } catch (e: any) {
      setError(e?.message ?? 'Could not send that. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const input = [styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }];
  const Label = ({ children }: { children: React.ReactNode }) => (
    <Text style={[styles.label, { color: theme.textSecond }]}>{children}</Text>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Icon name="ArrowLeft" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.specialRequest.getAQuote', 'Get a quote')}</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: theme.textSecond }]}>
          For loads our normal pricing cannot cover: a generator, a transformer,
          shop fittings, anything needing lifting hands or special handling. Tell us
          about it, we will call you and send a full breakdown. Nothing is charged
          until you accept it.
        </Text>

        <View style={{ gap: 6 }}>
          <Label>WHAT ARE WE MOVING?</Label>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={tx('auto.specialRequest.describeItPlainlyWhatIt', 'Describe it plainly. What it is, roughly how big, anything unusual.')}
            placeholderTextColor={theme.textThird}
            multiline
            style={[...input, { minHeight: 96, textAlignVertical: 'top' }]}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Label>WHAT KIND OF THING IS IT?</Label>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => {
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
                  <Text style={[styles.chipTxt, { color: on ? '#fff' : theme.text }]}>{c}</Text>
                </Pressable>
              );
            })}
          </View>
          {category === 'Medical' && (
            /* Accepted into the queue for manual eligibility, never
               advertised: the insurance position is unsettled and it
               collides with our rule against promising arrival times. */
            <Text style={[styles.note, { color: '#92400E' }]}>
              Medical loads are reviewed case by case before we accept them, and we
              will tell you either way. We do not promise arrival times.
            </Text>
          )}
        </View>

        <View style={{ gap: 8 }}>
          <Label>WEIGHT AND SIZE (IT DECIDES THE VEHICLE)</Label>
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
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {([
            ['Fragile', fragile, setFragile, 'Needs careful handling or padding.'],
            ['Hazardous', hazardous, setHazardous, 'Fuel, chemicals, gas, anything flammable.'],
            ['Temperature controlled', tempControl, setTempControl, 'Must stay cold, or must not freeze.'],
          ] as const).map(([label, value, set, hint], i) => (
            <View key={label} style={[styles.toggleRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: theme.text }]}>{label}</Text>
                <Text style={[styles.toggleHint, { color: theme.textThird }]}>{hint}</Text>
              </View>
              <Switch value={value} onValueChange={set as any} />
            </View>
          ))}
        </View>

        <View style={{ gap: 8 }}>
          <Label>PICKING UP FROM</Label>
          <StreetAutocomplete
            value={upAddr}
            onChangeText={setUpAddr}
            placeholder={tx('auto.specialRequest.whereDoesItStart', 'Where does it start?')}
            onCoordsResolved={(lat: number, lng: number) => setUpPin({ lat, lng })}
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
        </View>

        <View style={{ gap: 8 }}>
          <Label>TAKING IT TO</Label>
          <StreetAutocomplete
            value={dnAddr}
            onChangeText={setDnAddr}
            placeholder={tx('auto.specialRequest.whereDoesItEndUp', 'Where does it end up?')}
            onCoordsResolved={(lat: number, lng: number) => setDnPin({ lat, lng })}
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
        </View>

        <View style={{ gap: 6 }}>
          <Label>WHEN WOULD YOU LIKE IT MOVED?</Label>
          <TextInput value={timing} onChangeText={setTiming}
            placeholder={tx('auto.specialRequest.tellUsWhatSuitsYou', 'Tell us what suits you and we will say what is possible.')}
            placeholderTextColor={theme.textThird} style={input as any} />
          {/* Deliberately not a date picker: see the file header. */}
          <Text style={[styles.note, { color: theme.textThird }]}>
            We will tell you what is realistic before you accept anything. We do not
            promise arrival times.
          </Text>
        </View>

        <Text style={[styles.note, { color: theme.textThird }]}>
          By sending this you confirm the load is legal to move and described honestly.
          Responsibility for anything illegal or misdeclared rests with whoever booked it.
        </Text>

        {!!error && <Text style={[styles.error, { color: '#DC2626' }]}>{error}</Text>}

        <Pressable
          onPress={submit}
          disabled={!ready || busy}
          style={[styles.submit, { backgroundColor: ready && !busy ? theme.primary : theme.border }]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitTxt}>{tx('auto.specialRequest.sendForAQuote', 'Send for a quote')}</Text>}
        </Pressable>
        <Text style={[styles.note, { color: theme.textThird, textAlign: 'center' }]}>
          Nothing is charged now. We will call you, then send a full breakdown.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                 paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  title:       { fontSize: 17, fontWeight: '700' },
  content:     { padding: 16, gap: 20, paddingBottom: 48 },
  intro:       { fontSize: 14, lineHeight: 20 },
  label:       { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  input:       { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  row:         { flexDirection: 'row', gap: 8 },
  chips:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:        { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
  chipTxt:     { fontSize: 13, fontWeight: '600' },
  card:        { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16 },
  toggleRow:   { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12 },
  toggleLabel: { fontSize: 15, fontWeight: '600' },
  toggleHint:  { fontSize: 12, marginTop: 2 },
  note:        { fontSize: 12, lineHeight: 17 },
  error:       { fontSize: 13, fontWeight: '600' },
  submit:      { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  submitTxt:   { color: '#fff', fontSize: 15, fontWeight: '700' },
});
