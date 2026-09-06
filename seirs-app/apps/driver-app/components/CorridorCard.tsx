/**
 * "Heading somewhere?": the corridor card for bicycle/on-foot couriers
 * (founder 2026-08-21: the inclusion tier's engine. A student walking to
 * campus can carry a school book that was going there anyway).
 *
 * Declare a destination and a window; matching then boosts jobs whose
 * pickup AND drop both hug the line you're already walking. Expires on
 * its own; ending it early is one tap.
 */
import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Navigation, X } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { driversApi, mapsApi } from '@/services/api';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

interface Props {
  driver: any;
  /** Called after set/clear so the hub can refresh driversApi.me(). */
  onChanged?: () => void;
}

export function CorridorCard({ driver, onChanged }: Props) {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];

  const [query,   setQuery]   = useState('');
  const [options, setOptions] = useState<any[]>([]);
  const [busy,    setBusy]    = useState(false);
  const [hours,   setHours]   = useState(2);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active =
    driver?.corridorExpiresAt && new Date(driver.corridorExpiresAt) > new Date();

  // Address suggestions through the backend Places proxy (same source
  // as the booking flows; no client-side Google key involved).
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 3) { setOptions([]); return; }
    debounce.current = setTimeout(() => {
      mapsApi.autocomplete({ input: query.trim() })
        .then((res: any) => setOptions((res?.predictions ?? res ?? []).slice(0, 4)))
        .catch(() => setOptions([]));
    }, 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  const choose = async (opt: any) => {
    const label = opt?.description ?? opt?.structured_formatting?.main_text ?? query;
    setBusy(true);
    setOptions([]);
    try {
      const geo = await mapsApi.geocode({ address: label });
      const loc = geo?.results?.[0]?.geometry?.location;
      if (!loc) throw new Error('Could not place that address on the map.');
      await driversApi.setCorridor(Number(loc.lat), Number(loc.lng), label, hours);
      setQuery('');
      onChanged?.();
    } catch (e: any) {
      alertDialog('Could not set your route', e?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    setBusy(true);
    try {
      await driversApi.clearCorridor();
      onChanged?.();
    } catch (e: any) {
      alertDialog('Could not end the route', e?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (active) {
    const until = new Date(driver.corridorExpiresAt).toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit',
    });
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.primary }, Shadows.sm]}>
        <View style={styles.headRow}>
          <Navigation size={16} color={theme.primary} strokeWidth={1.75} />
          <Text style={[styles.title, { color: theme.text }]}>{tx('auto.CorridorCard.onYourWay', 'On your way')}</Text>
          <Pressable onPress={end} hitSlop={8} disabled={busy} style={styles.endBtn}>
            {busy
              ? <ActivityIndicator size="small" color={theme.textSecond} />
              : (
                <>
                  <X size={13} color="#DC2626" />
                  <Text style={styles.endText}>{tr('auto.corridorcard.end', 'End')}</Text>
                </>
              )}
          </Pressable>
        </View>
        <Text style={[styles.sub, { color: theme.textSecond }]} numberOfLines={2}>
          Heading to {driver.corridorLabel || tx9('auto.parcelRequests.yourDestination', 'your destination')} until {until}{tr('auto.corridorcard.jobsAlongYourLineReach', '. Jobs along your line reach you first.')}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
      <View style={styles.headRow}>
        <Navigation size={16} color={theme.primary} strokeWidth={1.75} />
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.CorridorCard.headingSomewhere', 'Heading somewhere?')}</Text>
      </View>
      <Text style={[styles.sub, { color: theme.textSecond }]}>
        {tr('auto.corridorcard.tellUsWhereYouRe', 'Tell us where you\'re going and packages along your way find you. Get paid for a trip you were making anyway.')}
      </Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.surfaceSecond, color: theme.text, borderColor: theme.border }]}
        value={query}
        onChangeText={setQuery}
        placeholder={tx('auto.CorridorCard.whereAreYouHeadingE', 'Where are you heading? e.g. Yaba Market')}
        placeholderTextColor={theme.textThird}
      />
      {options.map((opt, i) => (
        <Pressable
          key={opt.place_id ?? i}
          onPress={() => choose(opt)}
          style={[styles.option, { borderBottomColor: theme.border }]}
        >
          <Text style={[styles.optionText, { color: theme.text }]} numberOfLines={1}>
            {opt.description ?? opt.structured_formatting?.main_text ?? '-'}
          </Text>
        </Pressable>
      ))}
      <View style={styles.hoursRow}>
        {[1, 2].map(h => (
          <Pressable
            key={h}
            onPress={() => setHours(h)}
            style={[
              styles.hourChip,
              { borderColor: hours === h ? theme.primary : theme.border },
              hours === h && { backgroundColor: theme.primary + '15' },
            ]}
          >
            <Text style={{ color: hours === h ? theme.primary : theme.textSecond, fontSize: FontSize.sm, fontWeight: '600' }}>
              {h} hour{h > 1 ? 's' : ''}
            </Text>
          </Pressable>
        ))}
        {busy && <ActivityIndicator size="small" color={theme.primary} style={{ marginLeft: 8 }} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card:      { borderRadius: Radius.lg, borderWidth: 1, padding: 14, marginBottom: 14, gap: 8 },
  headRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title:     { fontSize: FontSize.base, fontWeight: FontWeight.bold, flex: 1 },
  sub:       { fontSize: FontSize.sm, lineHeight: 19 },
  input:     { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: FontSize.sm },
  option:    { paddingVertical: 10, borderBottomWidth: 1 },
  optionText:{ fontSize: FontSize.sm },
  hoursRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hourChip:  { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  endBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  endText:   { color: '#DC2626', fontSize: FontSize.sm, fontWeight: '700' },
});
