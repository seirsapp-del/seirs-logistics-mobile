/**
 * StreetAutocomplete — Google Places autocomplete biased to a selected
 * Nigerian state. Drop into register / apply-partner forms next to the
 * StatePicker so users get the same Jumia/Uber-style address typing.
 *
 * - Pulls predictions from Places Autocomplete API as user types
 *   (300ms debounce, country:ng filter, scoped by state name in input)
 * - Shows results inline below the input
 * - On select, resolves to a full formatted address via Place Details
 *
 * Unlike the customer-app InlineAddressPicker, this one stays in-place
 * (no map preview, no GPS button) — register forms don't need the
 * full bottom-sheet treatment.
 */
import { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Icon } from '@/components/Icon';

const MAPS_KEY = 'AIzaSyCl-9atGvhkQb9acFyVkLv9HyDMPUgjIIM';

interface Prediction {
  place_id:       string;
  main_text:      string;
  secondary_text: string;
}

interface Props {
  label?:        string;
  value:         string;
  onChangeText:  (text: string) => void;
  /** Optional state name to bias search results (e.g. "Lagos"). */
  state?:        string;
  placeholder?:  string;
}

export function StreetAutocomplete({ label, value, onChangeText, state, placeholder }: Props) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [focused,     setFocused]     = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPredictions = useCallback(async (text: string) => {
    if (text.length < 3) { setPredictions([]); return; }
    setSearching(true);
    try {
      // Bias to the selected state by appending it to the query — Google's
      // autocomplete prioritises matches that contain the state's name. Also
      // restrict to Nigeria via `components=country:ng`.
      const query = state ? `${text}, ${state}, Nigeria` : `${text}, Nigeria`;
      const url =
        `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
        `?input=${encodeURIComponent(query)}` +
        `&components=country:ng` +
        `&language=en&key=${MAPS_KEY}`;
      const res  = await fetch(url);
      const json = await res.json();
      if (json.status === 'OK') {
        setPredictions((json.predictions ?? []).map((p: any) => ({
          place_id:       p.place_id,
          main_text:      p.structured_formatting?.main_text    ?? p.description,
          secondary_text: p.structured_formatting?.secondary_text ?? '',
        })));
      } else {
        setPredictions([]);
      }
    } catch { setPredictions([]); } finally { setSearching(false); }
  }, [state]);

  const onChange = (text: string) => {
    onChangeText(text);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchPredictions(text), 300);
  };

  const pick = (p: Prediction) => {
    // Use main + secondary as the final address — Place Details would give
    // us coords too but for register-time text storage this is sufficient.
    const combined = p.secondary_text ? `${p.main_text}, ${p.secondary_text}` : p.main_text;
    onChangeText(combined);
    setPredictions([]);
    setFocused(false);
  };

  const showDropdown = focused && predictions.length > 0;

  return (
    <View>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder ?? 'Start typing a street or landmark…'}
          placeholderTextColor="#9CA3AF"
        />
        {searching && <ActivityIndicator size="small" color="#3A7BD5" />}
      </View>

      {showDropdown && (
        <View style={styles.dropdown}>
          {predictions.map((p) => (
            <Pressable
              key={p.place_id}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => pick(p)}
            >
              <Icon name="MapPin" size={16} color="#3A7BD5" />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowMain} numberOfLines={1}>{p.main_text}</Text>
                {!!p.secondary_text && (
                  <Text style={styles.rowSub} numberOfLines={1}>{p.secondary_text}</Text>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  input: { flex: 1, fontSize: 15, color: '#0F2B4C' },

  dropdown: {
    backgroundColor: '#fff', borderRadius: 12, marginTop: 6, marginBottom: 14,
    borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  rowPressed: { backgroundColor: '#F9FAFB' },
  rowMain: { fontSize: 14, color: '#0F2B4C', fontWeight: '500' },
  rowSub:  { fontSize: 12, color: '#6B7280', marginTop: 2 },
});
