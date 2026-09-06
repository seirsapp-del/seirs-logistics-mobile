/**
 * InlineAddressPicker: Google Places autocomplete that lives inline in a
 * form (no modal). For the bottom-sheet variant used in Request a Ride, the
 * autocomplete logic is duplicated locally in that screen so it can wire
 * into BottomSheetTextInput / BottomSheetScrollView.
 *
 * Behaviour:
 *  - Type into the input  → Places autocomplete dropdown appears below.
 *  - Tap a suggestion     → fires onSelect with { address, lat, lng }.
 *  - Tap "Use my location"→ uses GPS + reverse geocode (or friendly fallback).
 */
import {
  View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useState, useRef, useCallback } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import type { PickedAddress } from '@/components/AddressPicker';
import { mapsApi } from '@/services/api';

import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
// Places and geocoding go through our backend (security review
// 2026-08-12): the Google key is no longer shipped inside the app.

interface Prediction {
  place_id:       string;
  main_text:      string;
  secondary_text: string;
}

interface Props {
  label:    string;
  dotColor: string;
  value:    string;
  onSelect: (picked: PickedAddress) => void;
  /** Called whenever the user clears the field via the × button. */
  onClear?: () => void;
}

export default function InlineAddressPicker({ label, dotColor, value, onSelect, onClear }: Props) {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];

  const [query,       setQuery]       = useState(value);
  const [focused,     setFocused]     = useState(false);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [searching,   setSearching]   = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPredictions = useCallback(async (text: string) => {
    if (text.length < 3) { setPredictions([]); return; }
    setSearching(true);
    try {
      // No country filter: autocomplete works globally and Google biases
      // results by the requesting IP region. Add `&location=lat,lng
      // &radius=50000` later if we want explicit Lagos bias.
      const json = await mapsApi.autocomplete({ input: text });
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
  }, []);

  const onChange = (text: string) => {
    setQuery(text);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchPredictions(text), 300);
  };

  const pick = async (p: Prediction) => {
    setSearching(true);
    try {
      const json = await mapsApi.placeDetails(p.place_id, 'geometry,formatted_address');
      if (json.status !== 'OK') return;
      const loc = json.result.geometry.location;
      const picked: PickedAddress = {
        address: json.result.formatted_address ?? `${p.main_text}, ${p.secondary_text}`,
        lat: loc.lat, lng: loc.lng,
      };
      setQuery(picked.address);
      setPredictions([]);
      setFocused(false);
      onSelect(picked);
    } finally { setSearching(false); }
  };

  const useMyLocation = async () => {
    setSearching(true);
    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!canAskAgain) {
          alertDialog(
            'Location permission denied',
            'Location is off for SEIRS in your phone Settings. Turn it on to auto-fill your address.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
        } else {
          alertDialog(
            'Location needed',
            'We need your location to auto-fill your current address. Tap the button again and allow.',
          );
        }
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude: lat, longitude: lng } = pos.coords;

      let address = 'Current location';
      try {
        const j = await mapsApi.geocode({ latlng: `${lat},${lng}` });
        address = j.results?.[0]?.formatted_address ?? address;
      } catch { /* keep label */ }

      const picked: PickedAddress = { address, lat, lng };
      setQuery(address);
      setPredictions([]);
      setFocused(false);
      onSelect(picked);
    } finally { setSearching(false); }
  };

  const clear = () => {
    setQuery('');
    setPredictions([]);
    onClear?.();
  };

  // Sync local query when parent resets (e.g. user navigated back).
  if (value !== query && !focused) {
    setTimeout(() => setQuery(value), 0);
  }

  const showDropdown = focused && (predictions.length > 0 || query.length === 0);

  return (
    <View>
      <View style={[styles.field, { backgroundColor: theme.surface, borderColor: focused ? theme.primary : theme.border }]}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.textSecond }]}>{label}</Text>
          <TextInput
            value={query}
            onChangeText={onChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={tx('auto.InlineAddressPicker.tapToSearchAddress', 'Tap to search address…')}
            placeholderTextColor={theme.textThird}
            style={[styles.input, { color: theme.text }]}
          />
        </View>
        {searching && <ActivityIndicator size="small" color={theme.primary} />}
        {!!query && !searching && (
          <Pressable onPress={clear} hitSlop={12}>
            <Ionicons name="close-circle" size={18} color={theme.textThird} />
          </Pressable>
        )}
      </View>

      {showDropdown && (
        <View style={[styles.dropdown, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Pressable style={styles.useLocBtn} onPress={useMyLocation}>
            <Ionicons name="locate" size={18} color={theme.primary} />
            <Text style={[styles.useLocText, { color: theme.primary }]}>{tx('auto.InlineAddressPicker.useMyCurrentLocation', 'Use my current location')}</Text>
          </Pressable>
          {predictions.map((p) => (
            <Pressable
              key={p.place_id}
              style={[styles.suggRow, { borderTopColor: theme.border }]}
              onPress={() => pick(p)}
            >
              <View style={[styles.suggIcon, { backgroundColor: theme.surfaceSecond }]}>
                <Ionicons name="location-outline" size={16} color={theme.textSecond} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.suggMain, { color: theme.text }]} numberOfLines={1}>{p.main_text}</Text>
                {!!p.secondary_text && (
                  <Text style={[styles.suggSub, { color: theme.textSecond }]} numberOfLines={1}>{p.secondary_text}</Text>
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
  field:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.lg, borderWidth: 1.5 },
  dot:         { width: 10, height: 10, borderRadius: 5 },
  label:       { fontSize: FontSize.xs, marginBottom: 2 },
  input:       { fontSize: FontSize.base, paddingVertical: 0 },

  dropdown:    { marginTop: Spacing.xs, borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  useLocBtn:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md },
  useLocText:  { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  suggRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, borderTopWidth: 1 },
  suggIcon:    { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  suggMain:    { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  suggSub:     { fontSize: FontSize.xs, marginTop: 2 },
});
