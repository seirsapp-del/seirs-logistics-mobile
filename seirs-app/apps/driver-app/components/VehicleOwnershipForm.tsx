import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { isValidNigerianMobile, NG_MOBILE_HINT } from '@/constants/phone';
import { uploadApi } from '@/services/api';
import { DocUploadTile } from '@/components/DocUploadTile';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';

/**
 * "Is this vehicle yours?" and, when it is not, the owner's recorded
 * sign-off.
 *
 * Founder, 2026-08-25: "do they have to submit proof of ownership in the
 * whole KYC, I never checked, or proof of ownership by someone else and
 * the person have to give their approval that they gave the sign off that
 * the driver can use their vehicle. this is Nigeria this happens."
 *
 * The answer was that KYC asked for a "Vehicle Ownership Proof" document
 * and never once asked whose name was on it. Plenty of okada and keke
 * riders do not own the machine: hire purchase, a relative's, or an owner
 * who fronts it for a daily return. Asking nothing meant riders either
 * handed in a document in someone else's name and were approved anyway,
 * or were turned down for being honest.
 *
 * The owner is assumed NOT to have a smartphone or the app. Requiring
 * them to register would exclude most of the people this is for. So the
 * consent is what a person with a biro and a phone can actually give: a
 * paper authorisation they sign, a number that reaches them, and their
 * own name typed here, which is a signature under Evidence Act section
 * 84, the same standard the handover records already use.
 *
 * Shared by the KYC declaration screen and the vehicle-change screen so
 * the two never drift into asking for different things.
 */

export type OwnershipKind = 'self' | 'third_party';

export interface OwnershipValue {
  ownership:          OwnershipKind;
  ownerName:          string;
  ownerPhone:         string;
  ownerRelationship:  string;
  ownerConsentUrl:    string | null;
  ownerIdUrl:         string | null;
  ownerSignatureName: string;
}

export const EMPTY_OWNERSHIP: OwnershipValue = {
  ownership:          'self',
  ownerName:          '',
  ownerPhone:         '',
  ownerRelationship:  '',
  ownerConsentUrl:    null,
  ownerIdUrl:         null,
  ownerSignatureName: '',
};

const RELATIONSHIPS: { id: string; label: string; hint: string }[] = [
  { id: 'hire_purchase', label: 'Hire purchase', hint: 'I am still paying for it' },
  { id: 'daily_return',  label: 'Daily return',  hint: 'Owner gives it out, I pay daily' },
  { id: 'family',        label: 'Family',        hint: 'Belongs to a relative' },
  { id: 'employer',      label: 'Employer',      hint: 'Company or fleet vehicle' },
  { id: 'friend',        label: 'Friend',        hint: 'Borrowed from a friend' },
  { id: 'other',         label: 'Other',         hint: 'Something else' },
];

/** Same key the backend compares with, so the two agree on what matches. */
const nameKey = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Everything wrong with the current answer, in the order a rider would
 * hit it. Empty array means it can be submitted.
 */
export function ownershipProblems(v: OwnershipValue, riderName?: string | null): string[] {
  if (v.ownership === 'self') return [];
  const out: string[] = [];
  if (v.ownerName.trim().split(/\s+/).filter(Boolean).length < 2) {
    out.push("The owner's full name, first and last.");
  }
  if (!isValidNigerianMobile(v.ownerPhone)) {
    out.push('A Nigerian mobile number that reaches the owner.');
  }
  if (!v.ownerRelationship) {
    out.push('How you came to be riding this vehicle.');
  }
  if (!v.ownerConsentUrl) {
    out.push('A photo of the authorisation the owner signed.');
  }
  if (!v.ownerSignatureName.trim()) {
    out.push('The owner has to type their own name to sign.');
  } else if (nameKey(v.ownerSignatureName) !== nameKey(v.ownerName)) {
    out.push("The typed signature has to match the owner's full name exactly.");
  } else if (riderName && nameKey(v.ownerSignatureName) === nameKey(riderName)) {
    out.push('The owner signs this themselves. If the vehicle is yours, choose "I own it".');
  }
  return out;
}

interface Props {
  value:     OwnershipValue;
  onChange:  (next: OwnershipValue) => void;
  riderName?: string | null;
  /** Read-only rendering, for an approved rider looking at what is on file. */
  locked?:   boolean;
}

export function VehicleOwnershipForm({ value, onChange, riderName, locked = false }: Props) {
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const [uploading, setUploading] = useState<'consent' | 'ownerId' | null>(null);
  const [sheet,     setSheet]     = useState<SeirsSheetSpec | null>(null);

  const set = (patch: Partial<OwnershipValue>) => onChange({ ...value, ...patch });

  const pick = (slot: 'consent' | 'ownerId') => {
    if (locked) return;
    setSheet({
      title: 'Add the photo',
      message: slot === 'consent'
        ? 'The whole page of the letter the owner signed.'
        : "The owner's ID.",
      options: [
        { label: 'Take a photo',        variant: 'primary', icon: 'camera-outline', onPress: () => doPick(slot, 'camera') },
        { label: 'Choose from gallery', icon: 'images-outline',                     onPress: () => doPick(slot, 'library') },
      ],
    });
  };

  const doPick = async (slot: 'consent' | 'ownerId', source: 'camera' | 'library') => {
    try {
      let uri: string | null = null;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== 'granted') {
          Alert.alert('Permission required', 'Camera access is needed to photograph the document.');
          return;
        }
        const r = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
        uri = r.canceled ? null : r.assets[0].uri;
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== 'granted') {
          Alert.alert('Permission required', 'Photo library access is needed.');
          return;
        }
        const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: false });
        uri = r.canceled ? null : r.assets[0].uri;
      }
      if (!uri) return;
      setUploading(slot);
      const up = await uploadApi.file(uri, 'image/jpeg', 'kyc');
      set(slot === 'consent' ? { ownerConsentUrl: up.url } : { ownerIdUrl: up.url });
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Check your connection and try again.');
    } finally {
      setUploading(null);
    }
  };

  const isThird = value.ownership === 'third_party';

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <SeirsSheet spec={sheet} onClose={() => setSheet(null)} />
      <Text style={[styles.cardTitle, { color: theme.text }]}>Who owns this vehicle?</Text>
      <Text style={[styles.cardHint, { color: theme.textSecond }]}>
        Plenty of riders work a vehicle that is not theirs. That is fine, and it is
        not a problem for your application. We only need the owner to confirm
        they are happy for you to use it.
      </Text>

      <View style={styles.choiceRow}>
        {([
          { id: 'self',        label: 'I own it',            icon: 'person-outline' },
          { id: 'third_party', label: 'Someone else owns it', icon: 'people-outline' },
        ] as const).map(opt => {
          const active = value.ownership === opt.id;
          return (
            <Pressable
              key={opt.id}
              disabled={locked}
              onPress={() => set(opt.id === 'self' ? { ...EMPTY_OWNERSHIP } : { ownership: 'third_party' })}
              style={[
                styles.choice,
                { borderColor: active ? theme.primary : theme.border },
                active && { backgroundColor: theme.primary + '12' },
                locked && { opacity: 0.6 },
              ]}
            >
              <Ionicons name={opt.icon as any} size={18} color={active ? theme.primary : theme.textThird} />
              <Text style={[styles.choiceLabel, { color: active ? theme.primary : theme.textSecond }]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!isThird && (
        <View style={[styles.note, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
          <Ionicons name="information-circle-outline" size={16} color={theme.textThird} />
          <Text style={[styles.noteText, { color: theme.textSecond }]}>
            The ownership document you upload should be in your own name.
          </Text>
        </View>
      )}

      {isThird && (
        <>
          <Field
            label="Owner's full name"
            placeholder="e.g. Chukwuemeka Nwosu"
            value={value.ownerName}
            onChangeText={t => set({ ownerName: t })}
            editable={!locked}
            theme={theme}
          />
          <Field
            label="Owner's phone number"
            placeholder="e.g. 08012345678"
            value={value.ownerPhone}
            onChangeText={t => set({ ownerPhone: t })}
            keyboardType="phone-pad"
            editable={!locked}
            theme={theme}
            error={value.ownerPhone.length > 0 && !isValidNigerianMobile(value.ownerPhone) ? NG_MOBILE_HINT : undefined}
            hint="Our team calls this number to confirm the owner agreed."
          />

          <Text style={[styles.fieldLabel, { color: theme.textSecond, marginTop: Spacing.sm }]}>
            How do you come to be riding it?
          </Text>
          <View style={styles.relGrid}>
            {RELATIONSHIPS.map(r => {
              const active = value.ownerRelationship === r.id;
              return (
                <Pressable
                  key={r.id}
                  disabled={locked}
                  onPress={() => set({ ownerRelationship: r.id })}
                  style={[
                    styles.relChip,
                    { borderColor: active ? theme.primary : theme.border },
                    active && { backgroundColor: theme.primary + '12' },
                    locked && { opacity: 0.6 },
                  ]}
                >
                  <Text style={[styles.relLabel, { color: active ? theme.primary : theme.text }]}>{r.label}</Text>
                  <Text style={[styles.relHint, { color: theme.textThird }]}>{r.hint}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* The paper authorisation. Deliberately a photo of something the
              owner signed by hand: the owner does not need this app, an
              email address, or a smartphone to produce it. */}
          <Text style={[styles.fieldLabel, { color: theme.textSecond, marginTop: Spacing.sm }]}>
            Signed authorisation from the owner
          </Text>
          <Text style={[styles.fieldHint, { color: theme.textThird }]}>
            A short letter is enough. It should say the owner's name, the vehicle
            and plate number, your name, that you have permission to use it for
            SEIRS work, and the date. The owner signs it by hand. Photograph the
            whole page.
          </Text>
          <DocUploadTile
            label="Authorisation letter"
            url={value.ownerConsentUrl}
            busy={uploading === 'consent'}
            onPress={() => pick('consent')}
            locked={locked}
          />

          <Text style={[styles.fieldLabel, { color: theme.textSecond, marginTop: Spacing.sm }]}>
            Owner's ID <Text style={{ color: theme.textThird }}>(optional, speeds up approval)</Text>
          </Text>
          <DocUploadTile
            label="Owner's ID photo"
            url={value.ownerIdUrl}
            busy={uploading === 'ownerId'}
            onPress={() => pick('ownerId')}
            locked={locked}
          />

          {/* Typed name as signature, Evidence Act section 84. Same standard
              the delivery handover records use, rather than a second one. */}
          <View style={[styles.sigBox, { borderColor: theme.border, backgroundColor: theme.surfaceSecond }]}>
            <Text style={[styles.sigTitle, { color: theme.text }]}>Owner signs here</Text>
            <Text style={[styles.sigHint, { color: theme.textSecond }]}>
              Hand your phone to the owner. Typing their full name here is a legal
              signature in Nigeria, exactly like signing the paper. It has to match
              the name above.
            </Text>
            <TextInput
              style={[styles.sigInput, {
                color: theme.text,
                borderColor: theme.border,
                backgroundColor: isDark ? theme.background : '#fff',
              }]}
              placeholder="Owner types their full name"
              placeholderTextColor={theme.textThird}
              value={value.ownerSignatureName}
              onChangeText={t => set({ ownerSignatureName: t })}
              editable={!locked}
              autoCapitalize="words"
            />
            <Text style={[styles.sigLegal, { color: theme.textThird }]}>
              By typing their name the owner confirms they own this vehicle and
              agree to you using it for SEIRS work. Nigerian Evidence Act, section 84.
            </Text>
          </View>

          {!locked && ownershipProblems(value, riderName).length > 0 && (
            <View style={[styles.problems, { borderColor: '#D9770640', backgroundColor: isDark ? '#1F1500' : '#FFFBEB' }]}>
              <Text style={[styles.problemsTitle, { color: '#D97706' }]}>Still needed</Text>
              {ownershipProblems(value, riderName).map(p => (
                <Text key={p} style={[styles.problemLine, { color: theme.textSecond }]}>{'•'}  {p}</Text>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'numeric';
  editable?: boolean;
  /** Colors[scheme]. Passed rather than re-read so one card cannot drift. */
  theme: typeof Colors['light'];
  error?: string;
  hint?: string;
}

function Field({
  label, value, onChangeText, placeholder, keyboardType, editable, theme, error, hint,
}: FieldProps) {
  return (
    <View style={{ gap: 6, marginTop: Spacing.sm }}>
      <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>{label}</Text>
      <TextInput
        style={[styles.input, {
          color: theme.text,
          borderColor: error ? '#DC2626' : theme.border,
          backgroundColor: theme.background,
        }]}
        placeholder={placeholder}
        placeholderTextColor={theme.textThird}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        editable={editable}
        autoCapitalize="words"
      />
      {!!error && <Text style={[styles.fieldHint, { color: '#DC2626' }]}>{error}</Text>}
      {!error && !!hint && <Text style={[styles.fieldHint, { color: theme.textThird }]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card:      { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  cardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  cardHint:  { fontSize: FontSize.sm, lineHeight: 19 },

  choiceRow:   { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  choice:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: Radius.lg, borderWidth: 1.5 },
  choiceLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },

  note:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1 },
  noteText: { flex: 1, fontSize: FontSize.xs, lineHeight: 17 },

  fieldLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium as any },
  fieldHint:  { fontSize: FontSize.xs, lineHeight: 16 },
  input:      { height: 48, borderRadius: Radius.xl, borderWidth: 1, paddingHorizontal: Spacing.md, fontSize: FontSize.base },

  relGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  relChip:  { borderWidth: 1.5, borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 8, minWidth: '47%' },
  relLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  relHint:  { fontSize: 10, marginTop: 2 },


  sigBox:   { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 8, marginTop: Spacing.sm },
  sigTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold as any },
  sigHint:  { fontSize: FontSize.xs, lineHeight: 17 },
  sigInput: { height: 48, borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.md, fontSize: FontSize.base },
  sigLegal: { fontSize: 10, lineHeight: 14 },

  problems:      { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 4, marginTop: Spacing.sm },
  problemsTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },
  problemLine:   { fontSize: FontSize.xs, lineHeight: 18 },
});
