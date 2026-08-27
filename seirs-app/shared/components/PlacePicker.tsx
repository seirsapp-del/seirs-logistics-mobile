/**
 * Pick a place and get its coordinates.
 *
 * Built for the driver's Declare Intercity Trip screen, which had FROM
 * and TO as plain text boxes. That is not a cosmetic problem: the trip
 * row stores a bare city STRING, and the server used to resolve it
 * through a hardcoded twelve-city lookup. So a rider typing "Jos" saved
 * a trip successfully that no passenger could ever book, and the error
 * they eventually saw blamed the pickup point (founder 2026-08-27:
 * "this business model you design will be limited and i dont want
 * that").
 *
 * With coordinates attached, any place in Nigeria works.
 *
 * WHY THIS LIVES IN shared/ AND NOT IN THE DRIVER APP
 *
 * StreetAutocomplete already exists TWICE, once in customer and once in
 * business, as separate copies that have already drifted: one carries
 * fixes the other does not, and both hardcode #fff because they were
 * written for a light registration form. Adding a third copy to the
 * driver app would have made it worse. This is the start of the
 * consolidation; the other two migrate onto it next.
 *
 * Theme comes in as props rather than from a context, because each app
 * has its own ThemeProvider and shared cannot import any of them.
 */
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet,
  Keyboard, Dimensions,
} from 'react-native';
import { mapsApi } from '../services/api';

export interface PickedPlace {
  /** What the rider sees and what gets stored as the city name. */
  description: string;
  /** Short name where Google gives one, e.g. "Jos" rather than "Jos, Plateau, Nigeria". */
  primary: string;
  lat: number;
  lng: number;
}

interface Props {
  label?:       string;
  value:        string;
  onChangeText: (text: string) => void;
  /** Fires only once coordinates are actually resolved, never on a keystroke. */
  onPicked:     (place: PickedPlace) => void;
  placeholder?: string;
  /**
   * '(cities)' for intercity trips, undefined for a street address.
   * Google's own bias; a city-level trip does not want house numbers.
   */
  types?:       string;
  theme: {
    text: string;
    textSecond: string;
    textThird: string;
    surface: string;
    border: string;
    primary: string;
    background?: string;
  };
  onFocus?: () => void;
  /**
   * Fires when the list appears, carrying how many pixels of it are
   * hidden behind the keyboard. Zero means it already fits.
   *
   * The first version of this reported nothing and the host scrolled to
   * a position measured with onLayout, which gives a y relative to the
   * PARENT rather than the scroll content. Fields near the top happened
   * to look right; the pickup point, deep in the form, scrolled to the
   * wrong place and stayed under the keyboard (founder, on the handset:
   * "when i try typing in the pickup point why is it under my
   * keyboard").
   *
   * Measuring the rendered list against the real keyboard is the only
   * version that works wherever the field happens to sit.
   */
  onSuggestionsShown?: (hiddenPx: number) => void;
}

export function PlacePicker({
  label, value, onChangeText, onPicked, placeholder, types, theme, onFocus,
  onSuggestionsShown,
}: Props) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading]         = useState(false);
  const [open, setOpen]               = useState(false);
  /**
   * The exact text last accepted from the list.
   *
   * A one-shot boolean was not enough: it guards the NEXT effect run,
   * but a re-render, a scroll or a re-focus fires another, and the list
   * reopened over the answer the rider had just chosen and covered the
   * rest of the form (seen on the handset, 2026-08-27).
   *
   * Comparing the value instead is stable: while the box still reads
   * exactly what was picked, there is nothing to search for.
   */
  const pickedValue = useRef<string | null>(null);
  const timer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The list's own view, so it can measure where it actually landed. */
  const listRef = useRef<View>(null);
  /** Live keyboard height; 0 when it is down. */
  const kbH = useRef(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      kbH.current = e?.endCoordinates?.height ?? 0;
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => { kbH.current = 0; });
    return () => { show.remove(); hide.remove(); };
  }, []);

  /**
   * How much of the list the keyboard is covering, measured after it
   * has actually rendered. A frame of delay is needed: measuring in the
   * same tick returns the position from before the list existed.
   */
  const reportOverlap = () => {
    if (!onSuggestionsShown) return;
    requestAnimationFrame(() => {
      listRef.current?.measureInWindow((_x, y, _w, h) => {
        const screenH  = Dimensions.get('window').height;
        const kbTop    = screenH - kbH.current;
        const listBase = y + h;
        // 12px so the last row is not flush against the keyboard.
        const hidden   = Math.max(0, listBase - kbTop + 12);
        onSuggestionsShown(hidden);
      });
    });
  };

  useEffect(() => {
    if (pickedValue.current !== null && value.trim() === pickedValue.current) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (timer.current) clearTimeout(timer.current);

    const q = value.trim();
    if (q.length < 3) { setSuggestions([]); setOpen(false); return; }

    // 350ms: long enough that a rider typing "Port Harcourt" costs one
    // call rather than thirteen, short enough not to feel stuck.
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await mapsApi.autocomplete({
          input: q,
          // Nigeria only. A driver declaring an intercity trip is not
          // going to Accra, and unrestricted results put Springfield,
          // Illinois above Suleja.
          components: 'country:ng',
          types,
        });
        const list = Array.isArray(res?.predictions) ? res.predictions : [];
        setSuggestions(list.slice(0, 5));
        setOpen(list.length > 0);
        if (list.length > 0) reportOverlap();
      } catch {
        // Offline or a refused key. Say nothing and let them keep
        // typing: the field still works, it just stops suggesting.
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, types, onSuggestionsShown]);

  const pick = async (p: any) => {
    const description = p?.description ?? '';
    const primary     = p?.structured_formatting?.main_text ?? description;
    pickedValue.current = primary.trim();
    onChangeText(primary);
    setOpen(false);
    setSuggestions([]);

    try {
      const json = await mapsApi.placeDetails(p.place_id, 'geometry');
      const loc  = json?.result?.geometry?.location;
      if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
        onPicked({ description, primary, lat: loc.lat, lng: loc.lng });
      }
    } catch {
      // Coordinates failed. The name is still set, and the caller can
      // decide whether that is enough. It refuses to submit without
      // coordinates rather than silently saving an unbookable trip.
    }
  };

  return (
    <View style={{ gap: 6 }}>
      {!!label && (
        <Text style={[styles.label, { color: theme.textSecond }]}>{label}</Text>
      )}

      <View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          placeholder={placeholder}
          placeholderTextColor={theme.textThird}
          autoCorrect={false}
          style={[styles.input, {
            color: theme.text,
            borderColor: theme.border,
            backgroundColor: theme.surface,
          }]}
        />
        {loading && (
          <ActivityIndicator
            size="small"
            color={theme.primary}
            style={styles.spinner}
          />
        )}
      </View>

      {open && suggestions.length > 0 && (
        <View ref={listRef} style={[styles.list, {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        }]}>
          {suggestions.map((s, i) => (
            <Pressable
              key={s.place_id ?? i}
              onPress={() => pick(s)}
              style={({ pressed }) => [
                styles.row,
                {
                  borderBottomColor: theme.border,
                  borderBottomWidth: i === suggestions.length - 1 ? 0 : 1,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <Text style={[styles.rowMain, { color: theme.text }]} numberOfLines={1}>
                {s?.structured_formatting?.main_text ?? s?.description}
              </Text>
              {!!s?.structured_formatting?.secondary_text && (
                <Text style={[styles.rowSub, { color: theme.textThird }]} numberOfLines={1}>
                  {s.structured_formatting.secondary_text}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  input:   { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  spinner: { position: 'absolute', right: 14, top: 14 },
  list:    { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  row:     { paddingHorizontal: 14, paddingVertical: 11 },
  rowMain: { fontSize: 14, fontWeight: '600' },
  rowSub:  { fontSize: 12, marginTop: 1 },
});
