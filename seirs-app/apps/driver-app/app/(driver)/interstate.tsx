import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, MapPin, Calendar, Truck, ArrowRight,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { driversApi } from '@/services/api';

// Spec V8 §2.18 — driver declares an upcoming intercity trip
// (Lagos → Ibadan, etc.). System surfaces matching packages along
// that corridor. Customer chose at booking whether to drop at
// destination address or destination partner store.

const POPULAR_ROUTES = [
  { from: 'Lagos',   to: 'Ibadan',  km: 145 },
  { from: 'Lagos',   to: 'Abuja',   km: 760 },
  { from: 'Ibadan',  to: 'Abuja',   km: 605 },
  { from: 'Lagos',   to: 'Benin',   km: 320 },
  { from: 'Abuja',   to: 'Kano',    km: 350 },
  { from: 'Lagos',   to: 'Port Harcourt', km: 620 },
];

export default function InterstateScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  const [from,        setFrom]        = useState('');
  const [to,          setTo]          = useState('');
  const [departAt,    setDepartAt]    = useState('');
  const [vehicleSpace,setVehicleSpace]= useState('1');
  const [submitting,  setSubmitting]  = useState(false);

  const submit = async () => {
    if (!from.trim() || !to.trim()) { Alert.alert('Both cities required'); return; }
    if (!departAt) { Alert.alert('Departure time required'); return; }
    // Accept "YYYY-MM-DD HH:mm" form by normalizing to ISO before sending.
    const depart = departAt.includes('T') ? departAt : departAt.replace(' ', 'T');
    if (Number.isNaN(new Date(depart).getTime())) {
      Alert.alert('Invalid departure', 'Use the format YYYY-MM-DD HH:mm.');
      return;
    }
    setSubmitting(true);
    try {
      await driversApi.declareInterstateTrip({
        fromCity:        from.trim(),
        toCity:          to.trim(),
        departAt:        new Date(depart).toISOString(),
        spareCapacityKg: Number(vehicleSpace) || 0,
      });
      Alert.alert(
        'Trip declared',
        `You're listed for ${from} → ${to} on ${new Date(depart).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Matching packages will appear in your available jobs.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Could not declare trip', e?.message ?? 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Declare Intercity Trip</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <View style={[styles.intro, { backgroundColor: theme.primary + '12' }]}>
            <Truck size={20} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.introTitle, { color: theme.text }]}>Earn extra on long-haul trips</Text>
              <Text style={[styles.introSub, { color: theme.textSecond }]}>
                Tell us you&apos;re going intercity and matching packages along your route will be auto-offered.
              </Text>
            </View>
          </View>

          {/* Popular routes */}
          <Text style={[styles.label, { color: theme.textSecond }]}>POPULAR ROUTES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {POPULAR_ROUTES.map(r => (
              <Pressable
                key={`${r.from}-${r.to}`}
                onPress={() => { setFrom(r.from); setTo(r.to); }}
                style={[styles.routeChip, { borderColor: theme.border, backgroundColor: theme.surface }]}
              >
                <Text style={{ color: theme.text, fontSize: FontSize.xs, fontWeight: FontWeight.bold }}>{r.from} → {r.to}</Text>
                <Text style={{ color: theme.textSecond, fontSize: FontSize.xs }}>~{r.km}km</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Fields */}
          <View style={{ gap: 6, marginTop: Spacing.md }}>
            <Text style={[styles.label, { color: theme.textSecond }]}>FROM</Text>
            <TextInput value={from} onChangeText={setFrom} placeholder="e.g. Lagos" placeholderTextColor={theme.textThird} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]} />
          </View>

          <View style={{ alignItems: 'center', marginVertical: -8 }}>
            <ArrowRight size={20} color={theme.textThird} />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={[styles.label, { color: theme.textSecond }]}>TO</Text>
            <TextInput value={to} onChangeText={setTo} placeholder="e.g. Ibadan" placeholderTextColor={theme.textThird} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]} />
          </View>

          <View style={{ gap: 6, marginTop: Spacing.sm }}>
            <Text style={[styles.label, { color: theme.textSecond }]}>DEPARTURE</Text>
            <TextInput
              value={departAt}
              onChangeText={setDepartAt}
              placeholder="YYYY-MM-DD HH:mm"
              placeholderTextColor={theme.textThird}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
            />
            <Text style={[styles.helper, { color: theme.textThird }]}>Use 24-hour time. e.g. 2026-05-12 09:00</Text>
          </View>

          <View style={{ gap: 6, marginTop: Spacing.sm }}>
            <Text style={[styles.label, { color: theme.textSecond }]}>SPARE PACKAGE CAPACITY (kg)</Text>
            <TextInput
              value={vehicleSpace}
              onChangeText={setVehicleSpace}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={theme.textThird}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
            />
            <Text style={[styles.helper, { color: theme.textThird }]}>How much weight can you take above your existing load.</Text>
          </View>

          <Pressable
            disabled={submitting}
            onPress={submit}
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Declare trip</Text>}
          </Pressable>

          <Text style={[styles.footnote, { color: theme.textThird }]}>
            You can decline any individual offer. Backend matching engine + admin board ship next.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xxl },

  intro:     { flexDirection: 'row', gap: 12, padding: Spacing.md, borderRadius: Radius.lg, alignItems: 'center', marginBottom: Spacing.md },
  introTitle:{ fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: 2 },
  introSub:  { fontSize: FontSize.xs, lineHeight: 17 },

  label:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  input:     { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 12, fontSize: FontSize.base },
  helper:    { fontSize: FontSize.xs },

  routeChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, alignItems: 'center', gap: 2 },

  primaryBtn:    { paddingVertical: 14, borderRadius: Radius.lg, alignItems: 'center', marginTop: Spacing.lg },
  primaryBtnText:{ color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },

  footnote:  { fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.md, paddingHorizontal: Spacing.md, lineHeight: 17 },
});
