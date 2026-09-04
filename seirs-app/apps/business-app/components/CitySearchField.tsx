/**
 * A city box that suggests instead of guessing.
 *
 * Travel Buddy asked for two cities as raw text and matched them against
 * what a driver's geocoder had filed the trip under. Those are different
 * vocabularies, and on 2026-09-04 a real declared trip out of Ile-Ife was
 * invisible to a passenger searching "Ife" because the trip had been
 * saved as "Kajola", the LGA.
 *
 * So the passenger picks from names we know, with the aliases people
 * actually say folded in. Free text still searches: the list is a
 * suggestion, never a gate, because a hardcoded list of Nigerian towns is
 * always missing somebody's.
 *
 * Takes its palette as a prop rather than reading a hook, so the customer
 * and business apps hold one identical copy instead of two that drift.
 */
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { searchCities, type NgCity } from '@seirs/shared/models/cities';

interface Props {
  label:        string;
  value:        string;
  onChange:     (v: string) => void;
  placeholder:  string;
  theme:        any;
  /** Lift the field clear of the keyboard, where the host screen scrolls. */
  onFocus?:     () => void;
  /** Right-hand adornment, used for the swap button on the FROM field. */
  accessory?:   React.ReactNode;
  /**
   * Offer "use my location" on THIS field (founder 2026-09-04).
   *
   * Per field rather than once per screen, because the two ends are
   * different questions: somebody standing at a park is filling in FROM,
   * and somebody sending a package to where they are now is filling in
   * TO. It also sidesteps the naming problem entirely, since a
   * coordinate cannot be spelled wrongly.
   */
  onLocate?:    () => void;
  locating?:    boolean;
}

export function CitySearchField({
  label, value, onChange, placeholder, theme, onFocus, accessory, onLocate, locating,
}: Props) {
  const [focused, setFocused] = useState(false);

  // Suggestions only while typing, and never for a name already chosen:
  // showing "Ibadan" under a box that says Ibadan is noise.
  const matches: NgCity[] = focused ? searchCities(value) : [];
  const exact   = matches.length === 1 && matches[0].name.toLowerCase() === value.trim().toLowerCase();
  const show    = matches.length > 0 && !exact;

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: theme.textSecond }]}>{label}</Text>
        {onLocate ? (
          <Pressable onPress={onLocate} hitSlop={8} disabled={locating}>
            <Text style={[styles.locate, { color: locating ? theme.textThird : theme.primary }]}>
              {locating ? 'Finding you...' : 'Use my location'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.textThird}
          autoCorrect={false}
          onFocus={() => { setFocused(true); onFocus?.(); }}
          // Late enough that a tap on a suggestion lands before the list
          // closes under the finger.
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          style={[styles.input, {
            backgroundColor: theme.surface,
            borderColor:     focused ? theme.primary : theme.border,
            color:           theme.text,
            paddingRight:    accessory ? 52 : 14,
          }]}
        />
        {value.length > 0 && !accessory && (
          <Pressable onPress={() => onChange('')} hitSlop={10} style={styles.clear}>
            <Text style={[styles.clearMark, { color: theme.textThird }]}>✕</Text>
          </Pressable>
        )}
        {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
      </View>

      {show && (
        <View style={[styles.list, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {matches.map((c, i) => (
            <Pressable
              key={`${c.name}-${c.state}`}
              onPress={() => { onChange(c.name); setFocused(false); }}
              style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.divider }]}
            >
              <Text style={[styles.rowCity, { color: theme.text }]}>{c.name}</Text>
              <Text style={[styles.rowState, { color: theme.textThird }]}>{c.state}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:      { gap: 6 },
  labelRow:  { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label:     { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  locate:    { fontSize: 12, fontWeight: '700' },
  inputRow:  { position: 'relative', justifyContent: 'center' },
  input:     { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  clear:     { position: 'absolute', right: 14 },
  clearMark: { fontSize: 13 },
  accessory: { position: 'absolute', right: 8 },
  list:      { borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginTop: 2 },
  row:       { paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row',
               alignItems: 'baseline', justifyContent: 'space-between' },
  rowCity:   { fontSize: 15, fontWeight: '600' },
  rowState:  { fontSize: 12 },
});
