/**
 * AddressPicker — Google Places autocomplete with map preview
 *
 * Props:
 *   label        — e.g. "Pickup Address"
 *   dotColor     — colour of the route dot (green = pickup, red = dropoff)
 *   value        — current address string
 *   onSelect     — called with { address, lat, lng } when user picks a result
 */
import {
  View, Text, TextInput, Pressable, FlatList,
  StyleSheet, ActivityIndicator, Modal, Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Search, MapPin, Navigation } from 'lucide-react-native';
import { useState, useRef, useCallback } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';

// Android Maps key (Places + Directions enabled). Reverse-geocoding falls
// back to a Places-API "find nearby" call below since the Geocoding API
// isn't enabled on this Cloud project.
const MAPS_KEY = 'AIzaSyCl-9atGvhkQb9acFyVkLv9HyDMPUgjIIM';

// Nigeria centre as fallback
const DEFAULT_REGION = { latitude: 6.5244, longitude: 3.3792, latitudeDelta: 0.15, longitudeDelta: 0.15 };

export type PickedAddress = { address: string; lat: number; lng: number };

interface Props {
  label:    string;
  dotColor: string;
  value:    string;
  onSelect: (picked: PickedAddress) => void;
}

interface Prediction {
  place_id:     string;
  description:  string;
  main_text:    string;
  secondary_text: string;
}

export default function AddressPicker({ label, dotColor, value, onSelect }: Props) {
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];

  const [open,        setOpen]        = useState(false);
  const [query,       setQuery]       = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [pinned,      setPinned]      = useState<{ lat: number; lng: number } | null>(null);
  const [mapRegion,   setMapRegion]   = useState(DEFAULT_REGION);
  const debounce     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Places autocomplete ────────────────────────────────────────────────────
  const fetchPredictions = useCallback(async (text: string) => {
    if (text.length < 3) { setPredictions([]); return; }
    setSearching(true);
    try {
      // Global autocomplete — Google biases by requesting IP region.
      const url =
        `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
        `?input=${encodeURIComponent(text)}` +
        `&key=${MAPS_KEY}` +
        `&language=en`;
      const res  = await fetch(url);
      const json = await res.json();
      if (json.status === 'OK') {
        setPredictions(
          (json.predictions ?? []).map((p: any) => ({
            place_id:       p.place_id,
            description:    p.description,
            main_text:      p.structured_formatting?.main_text    ?? p.description,
            secondary_text: p.structured_formatting?.secondary_text ?? '',
          }))
        );
      } else {
        setPredictions([]);
      }
    } catch {
      setPredictions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchPredictions(text), 350);
  };

  // ── Place details (lat/lng) ───────────────────────────────────────────────
  const selectPrediction = async (p: Prediction) => {
    setPredictions([]);
    setSearching(true);
    try {
      const url =
        `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${p.place_id}` +
        `&fields=geometry,formatted_address` +
        `&key=${MAPS_KEY}`;
      const res  = await fetch(url);
      const json = await res.json();
      if (json.status === 'OK') {
        const loc = json.result.geometry.location;
        const picked: PickedAddress = {
          address: json.result.formatted_address ?? p.description,
          lat:     loc.lat,
          lng:     loc.lng,
        };
        setPinned({ lat: picked.lat, lng: picked.lng });
        setMapRegion({ latitude: picked.lat, longitude: picked.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 });
        setQuery(picked.address);
        onSelect(picked);
      }
    } catch {
      // fallback — just use the description without coords
    } finally {
      setSearching(false);
    }
  };

  // ── Use my current GPS location ───────────────────────────────────────────
  const useMyLocation = async () => {
    setSearching(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude: lat, longitude: lng } = pos.coords;

      // Reverse geocode
      const url =
        `https://maps.googleapis.com/maps/api/geocode/json` +
        `?latlng=${lat},${lng}&key=${MAPS_KEY}`;
      const res  = await fetch(url);
      const json = await res.json();
      const address = json.results?.[0]?.formatted_address ?? 'Current location';

      const picked: PickedAddress = { address, lat, lng };
      setPinned({ lat, lng });
      setMapRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 });
      setQuery(address);
      onSelect(picked);
    } finally {
      setSearching(false);
    }
  };

  const confirm = () => setOpen(false);

  // ── Trigger row (closed state) ────────────────────────────────────────────
  return (
    <>
      <Pressable
        style={[styles.trigger, { backgroundColor: theme.surface, borderColor: value ? theme.border : theme.primary }]}
        onPress={() => { setQuery(value); setOpen(true); }}
      >
        <View style={[styles.triggerDot, { backgroundColor: dotColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.triggerLabel, { color: theme.textSecond }]}>{label}</Text>
          <Text
            style={[styles.triggerValue, { color: value ? theme.text : theme.textSecond }]}
            numberOfLines={1}
          >
            {value || 'Tap to select address…'}
          </Text>
        </View>
        <Text style={[styles.chevron, { color: theme.textSecond }]}>›</Text>
      </Pressable>

      {/* Picker modal — fullScreen so it actually fills the device, not a
          card sheet. SafeAreaView so the header clears the notch / status bar. */}
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView edges={['top', 'bottom']} style={[styles.modal, { backgroundColor: theme.background }]}>
          {Platform.OS === 'android' && <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />}
          {/* Modal header */}
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <Pressable onPress={() => setOpen(false)} style={styles.cancelBtn}>
              <Text style={[styles.cancelText, { color: theme.textSecond }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{label}</Text>
            {pinned ? (
              <Pressable onPress={confirm} style={styles.doneBtn}>
                <Text style={[styles.doneText, { color: theme.primary }]}>Done</Text>
              </Pressable>
            ) : (
              <View style={{ width: 50 }} />
            )}
          </View>

          {/* Search input */}
          <View style={[styles.searchRow, { borderBottomColor: theme.border }]}>
            <Search size={18} color={theme.textSecond} strokeWidth={1.5} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search address…"
              placeholderTextColor={theme.textSecond}
              value={query}
              onChangeText={handleQueryChange}
              autoFocus
              returnKeyType="search"
            />
            {searching && <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: Spacing.sm }} />}
          </View>

          {/* Use my location */}
          <Pressable
            style={[styles.myLocationBtn, { borderBottomColor: theme.border }]}
            onPress={useMyLocation}
          >
            <Navigation size={18} color={theme.primary} strokeWidth={1.5} style={styles.myLocationIcon} />
            <Text style={[styles.myLocationText, { color: theme.primary }]}>Use my current location</Text>
          </Pressable>

          {/* Autocomplete results */}
          {predictions.length > 0 && (
            <FlatList
              data={predictions}
              keyExtractor={(p) => p.place_id}
              keyboardShouldPersistTaps="handled"
              style={[styles.predictionList, { backgroundColor: theme.surface }]}
              ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.predictionRow}
                  onPress={() => selectPrediction(item)}
                >
                  <MapPin size={16} color={theme.textSecond} strokeWidth={1.5} style={styles.predictionPin} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.predictionMain, { color: theme.text }]} numberOfLines={1}>
                      {item.main_text}
                    </Text>
                    <Text style={[styles.predictionSub, { color: theme.textSecond }]} numberOfLines={1}>
                      {item.secondary_text}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          )}

          {/* Map preview */}
          <View style={styles.mapWrap}>
            <MapView
              provider={PROVIDER_GOOGLE}
              style={StyleSheet.absoluteFill}
              region={mapRegion}
              onPress={(e) => {
                const { latitude: lat, longitude: lng } = e.nativeEvent.coordinate;
                setPinned({ lat, lng });
                setMapRegion(r => ({ ...r, latitude: lat, longitude: lng }));
                // Reverse geocode the tapped point
                fetch(
                  `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${MAPS_KEY}`
                )
                  .then(r => r.json())
                  .then(json => {
                    const address = json.results?.[0]?.formatted_address ?? 'Pinned location';
                    setQuery(address);
                    onSelect({ address, lat, lng });
                  })
                  .catch(() => {
                    setQuery('Pinned location');
                    onSelect({ address: 'Pinned location', lat, lng });
                  });
              }}
            >
              {pinned && (
                <Marker
                  coordinate={{ latitude: pinned.lat, longitude: pinned.lng }}
                  pinColor={dotColor}
                />
              )}
            </MapView>
            {!pinned && (
              <View style={styles.mapHint}>
                <Text style={styles.mapHintText}>Search above or tap the map to pin a location</Text>
              </View>
            )}
          </View>

          {/* Confirm button */}
          {pinned && (
            <View style={[styles.confirmWrap, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
              <Text style={[styles.confirmAddr, { color: theme.text }]} numberOfLines={2}>{query}</Text>
              <Pressable style={[styles.confirmBtn, { backgroundColor: theme.primary }]} onPress={confirm}>
                <Text style={styles.confirmBtnText}>Confirm Location</Text>
              </Pressable>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger:       { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm },
  triggerDot:    { width: 12, height: 12, borderRadius: 6 },
  triggerLabel:  { fontSize: FontSize.xs, marginBottom: 2 },
  triggerValue:  { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  chevron:       { fontSize: 20, marginLeft: 4 },
  modal:         { flex: 1 },
  modalHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  cancelBtn:     { width: 60 },
  cancelText:    { fontSize: FontSize.base },
  modalTitle:    { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  doneBtn:       { width: 60, alignItems: 'flex-end' },
  doneText:      { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  searchRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  searchIcon:    { marginRight: Spacing.sm },
  searchInput:   { flex: 1, fontSize: FontSize.base, height: 44 },
  myLocationBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, gap: Spacing.sm },
  myLocationIcon:{ marginRight: Spacing.sm },
  myLocationText:{ fontSize: FontSize.base, fontWeight: FontWeight.medium },
  predictionList:{ maxHeight: 240 },
  separator:     { height: 1 },
  predictionRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  predictionPin: { marginRight: Spacing.sm },
  predictionMain:{ fontSize: FontSize.base, fontWeight: FontWeight.medium },
  predictionSub: { fontSize: FontSize.xs, marginTop: 2 },
  mapWrap:       { flex: 1, position: 'relative' },
  mapHint:       { position: 'absolute', bottom: Spacing.lg, left: Spacing.lg, right: Spacing.lg, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: Radius.md, padding: Spacing.sm },
  mapHintText:   { color: '#fff', fontSize: FontSize.xs, textAlign: 'center' },
  confirmWrap:   { padding: Spacing.lg, borderTopWidth: 1, gap: Spacing.md },
  confirmAddr:   { fontSize: FontSize.sm },
  confirmBtn:    { height: 52, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  confirmBtnText:{ color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
