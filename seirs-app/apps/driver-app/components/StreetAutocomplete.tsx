// Copied from the business app 2026-09-01. Drivers now give a home
// address at signup and it is required: a courier holding other
// people's goods has to have an address on file (founder's reason:
// "in case of theft"). Adapted only where driver reads its theme
// straight off the colour scheme instead of through a ThemeContext.
/**
 * StreetAutocomplete: Google Places autocomplete biased to a selected
 * Nigerian state. Drop into register / apply-partner forms next to the
 * StatePicker so users get the same Jumia/Uber-style address typing.
 *
 * - Pulls predictions from Places Autocomplete API as user types
 *   (300ms debounce, country:ng filter, scoped by state name in input)
 * - Shows results inline below the input
 * - On select, resolves to a full formatted address via Place Details
 *
 * Unlike the customer-app InlineAddressPicker, this one stays in-place
 * (no map preview, no GPS button): register forms don't need the
 * full bottom-sheet treatment.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Icon } from '@/components/Icon';
import { mapsApi } from '@/services/api';
import { derivePlace } from '@seirs/shared/models/cities';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

// Places lookups go through our backend (security review 2026-08-12):
// the Google key is no longer shipped inside the app.

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
  /**
   * Fired when the user picks a suggestion and Google Place Details
   * returns coordinates. Used by the partner-store apply form so
   * the new store lands on /find-a-partner immediately with a
   * distance chip instead of falling to the end of the list.
   * Silently no-op if omitted, so existing callers keep working.
   */
  onCoordsResolved?: (lat: number, lng: number) => void;
  /**
   * Let the host screen lift this field clear of the keyboard. Swapping a
   * plain TextInput for this component silently dropped the host's focus
   * handler, so the field went back to typing blind (2026-08-16).
   */
  onFocus?: (e: any) => void;
  /**
   * City and State sat next to this field as separate free-text boxes, so
   * a picked Lagos address could sit above a hand-typed "Abuja" (founder
   * 2026-08-16). Google already knows both, so the host can fill them.
   */
  onPlaceResolved?: (info: { city?: string; state?: string; lat?: number; lng?: number; confident?: boolean }) => void;
  /**
   * Fires when the suggestion list appears. The host lifts the field on
   * FOCUS, but the list only arrives ~300ms later after the fetch, so by
   * then nothing re-scrolls and the suggestions sit behind the keyboard:
   * present in the tree, invisible on the phone (founder 2026-08-16).
   */
  onSuggestionsShown?: () => void;
}

export function StreetAutocomplete({ label, value, onChangeText, state, placeholder, onCoordsResolved, onFocus, onPlaceResolved, onSuggestionsShown }: Props) {
  /**
   * Built for the light registration screen with hardcoded #fff, so on
   * the dark Edit Business Details form it rendered as a white box
   * amongst dark ones (founder spotted it 2026-08-16). Theme it.
   */
  const colorScheme = useColorScheme();
  const colors      = Colors[colorScheme ?? 'light'];
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [focused,     setFocused]     = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPredictions = useCallback(async (text: string) => {
    if (text.length < 3) { setPredictions([]); return; }
    setSearching(true);
    try {
      // Bias to the selected state by appending it to the query: Google's
      // autocomplete prioritises matches that contain the state's name. Also
      // restrict to Nigeria via `components=country:ng`.
      const query = state ? `${text}, ${state}, Nigeria` : `${text}, Nigeria`;
      let json = await mapsApi.autocomplete({ input: query, components: 'country:ng' });
      /**
       * The state is only a HINT. Appending it used to make an address in
       * any other state unfindable: typing "Wuse 2 Abuja" while the state
       * still said Lagos returned nothing at all, with no explanation
       * (found on device 2026-08-16). If the biased query finds nothing,
       * search Nigeria-wide, and let the picked place correct the state.
       */
      if (state && (json?.status !== 'OK' || !(json?.predictions ?? []).length)) {
        json = await mapsApi.autocomplete({ input: `${text}, Nigeria`, components: 'country:ng' });
      }
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

  const pick = async (p: Prediction) => {
    // Use main + secondary as the final address: Place Details would give
    // us coords too but for register-time text storage this is sufficient.
    const combined = p.secondary_text ? `${p.main_text}, ${p.secondary_text}` : p.main_text;
    onChangeText(combined);
    setPredictions([]);
    setFocused(false);

    // When the caller wants coordinates (e.g. partner-store apply form
    // for the /find-a-partner distance sort), fetch Place Details for
    // this place_id. Cheap: one extra HTTP call, only on pick, only
    // when onCoordsResolved is wired. Silent-fails so a network glitch
    // never blocks the address being saved.
    if (!onCoordsResolved && !onPlaceResolved) return;
    try {
      const json = await mapsApi.placeDetails(p.place_id, 'geometry,address_components');
      const loc  = json?.result?.geometry?.location;
      if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
        onCoordsResolved?.(loc.lat, loc.lng);
      }
      if (onPlaceResolved) {
        /**
         * One derivation for the whole platform (2026-09-04).
         *
         * This read `locality -> administrative_area_level_2 ->
         * sublocality` and filed Obafemi Awolowo University under
         * "Kajola", an LGA, and Olorunda Aba Market in Ibadan under
         * "Aba", a city in another state. Four files carried an
         * identical copy of that logic. derivePlace reads the address
         * text against the 774-LGA geography instead, and says when it
         * is unsure rather than inventing a confident wrong answer.
         */
        const place = derivePlace({
          components:       json?.result?.address_components ?? null,
          formattedAddress: json?.result?.formatted_address ?? null,
        });
        onPlaceResolved({
          city:  place.city || undefined,
          state: place.state || undefined,
          lat: loc?.lat, lng: loc?.lng,
          confident: place.confident,
        });
      }
    } catch { /* silent: extras are optional, the address save must not fail */ }
  };

  const showDropdown = focused && predictions.length > 0;
  useEffect(() => {
    if (showDropdown) onSuggestionsShown?.();
  }, [showDropdown]);

  return (
    <View>
      {!!label && <Text style={[styles.label, { color: colors.textSecond }]}>{label}</Text>}
      <View style={[styles.inputWrap, { backgroundColor: colors.surfaceSecond, borderColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={value}
          onChangeText={onChange}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder ?? 'Start typing a street or landmark…'}
          placeholderTextColor={colors.textThird}
        />
        {searching && <ActivityIndicator size="small" color={colors.accent} />}
      </View>

      {showDropdown && (
        <View style={[styles.dropdown, { backgroundColor: colors.surfaceSecond, borderColor: colors.border }]}>
          {predictions.map((p) => (
            <Pressable
              key={p.place_id}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => pick(p)}
            >
              <Icon name="MapPin" size={16} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowMain, { color: colors.text }]} numberOfLines={1}>{p.main_text}</Text>
                {!!p.secondary_text && (
                  <Text style={[styles.rowSub, { color: colors.textSecond }]} numberOfLines={1}>{p.secondary_text}</Text>
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
    backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, height: 52,
    borderWidth: 1.5, borderColor: '#E5E7EB',
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
