import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput,
  StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { MOCK_DRIVER } from '@/constants/driverMockData';

const VEHICLE_TYPES = [
  { id: 'bicycle',  label: 'Bicycle',    icon: 'bicycle-outline' },
  { id: 'motorcycle',label: 'Motorcycle', icon: 'bicycle' },
  { id: 'economy',  label: 'Economy Car', icon: 'car-outline' },
  { id: 'suv',      label: 'SUV',         icon: 'car-sport-outline' },
  { id: 'van',      label: 'Van',         icon: 'bus-outline' },
  { id: 'truck',    label: 'Truck',       icon: 'construct-outline' },
];

export default function VehicleScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const v = MOCK_DRIVER.vehicle;
  const [make,    setMake]    = useState(v.make);
  const [model,   setModel]   = useState(v.model);
  const [year,    setYear]    = useState(v.year);
  const [color,   setColor]   = useState(v.color);
  const [plate,   setPlate]   = useState(v.plate);
  const [type,    setType]    = useState(v.type);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  const hasChanges = make !== v.make || model !== v.model || year !== v.year ||
                     color !== v.color || plate !== v.plate || type !== v.type;

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => { setSaving(false); setSaved(true); }, 1000);
    setTimeout(() => setSaved(false), 3000);
  };

  const fields = [
    { label: 'Make', value: make, setter: setMake, placeholder: 'e.g. Toyota' },
    { label: 'Model', value: model, setter: setModel, placeholder: 'e.g. Corolla' },
    { label: 'Year', value: year, setter: setYear, placeholder: 'e.g. 2020', keyboardType: 'numeric' as const },
    { label: 'Color', value: color, setter: setColor, placeholder: 'e.g. Silver' },
    { label: 'Plate Number', value: plate, setter: setPlate, placeholder: 'e.g. LND 423 GH' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Vehicle Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Current vehicle preview */}
        <View style={[styles.vehiclePreview, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <View style={[styles.vehicleIconWrap, { backgroundColor: theme.primary + '15' }]}>
            <Ionicons name="car-sport-outline" size={36} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.vehicleTitle, { color: theme.text }]}>{make} {model} {year}</Text>
            <Text style={[styles.vehicleSub, { color: theme.textSecond }]}>{color} · {plate}</Text>
          </View>
          <View style={[styles.plateTag, { backgroundColor: isDark ? '#111' : '#F1F5F9', borderColor: theme.border }]}>
            <Text style={[styles.plateTagText, { color: theme.text }]}>{plate}</Text>
          </View>
        </View>

        {/* Vehicle type */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Vehicle Type</Text>
          <View style={styles.typeGrid}>
            {VEHICLE_TYPES.map(t => (
              <Pressable
                key={t.id}
                style={[
                  styles.typeChip,
                  { borderColor: type === t.id ? theme.primary : theme.border },
                  type === t.id && { backgroundColor: theme.primary + '12' },
                ]}
                onPress={() => setType(t.id)}
              >
                <Ionicons name={t.icon as any} size={18} color={type === t.id ? theme.primary : theme.textThird} />
                <Text style={[styles.typeLabel, { color: type === t.id ? theme.primary : theme.textSecond }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Fields */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Vehicle Information</Text>
          {fields.map(f => (
            <View key={f.label} style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>{f.label}</Text>
              <View style={[styles.fieldInput, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.fieldInputText, { color: theme.text }]}
                  placeholder={f.placeholder}
                  placeholderTextColor={theme.textThird}
                  value={f.value}
                  onChangeText={f.setter}
                  keyboardType={f.keyboardType}
                  autoCapitalize="words"
                />
              </View>
            </View>
          ))}
        </View>

        {/* Insurance note */}
        <View style={[styles.infoNote, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
          <Ionicons name="shield-checkmark-outline" size={16} color={theme.textThird} />
          <Text style={[styles.infoText, { color: theme.textSecond }]}>
            Vehicle changes are reviewed by our team within 24 hours. Upload updated insurance documents if your vehicle has changed.
          </Text>
        </View>

        {saved && (
          <View style={[styles.savedBanner, { backgroundColor: '#22C55E18', borderColor: '#22C55E30' }]}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#22C55E" />
            <Text style={[styles.savedText, { color: '#22C55E' }]}>Vehicle details saved for review.</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={[styles.ctaBar, { backgroundColor: theme.navBackground, borderTopColor: theme.border }]}>
        <Pressable
          style={[styles.saveBtn, { backgroundColor: hasChanges ? theme.primary : theme.surfaceSecond }]}
          onPress={handleSave}
          disabled={!hasChanges || saving}
        >
          <Text style={[styles.saveBtnText, { color: hasChanges ? '#fff' : theme.textThird }]}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md },

  vehiclePreview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  vehicleIconWrap:{ width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  vehicleTitle:   { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  vehicleSub:     { fontSize: FontSize.sm, marginTop: 2 },
  plateTag:       { paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: Radius.md, borderWidth: 1 },
  plateTagText:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, letterSpacing: 1 },

  card:      { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  cardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  typeGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeChip:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.full, borderWidth: 1.5 },
  typeLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  fieldGroup:     { gap: 6 },
  fieldLabel:     { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  fieldInput:     { flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: Radius.xl, borderWidth: 1, paddingHorizontal: Spacing.md },
  fieldInputText: { flex: 1, fontSize: FontSize.base },

  infoNote: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  infoText: { flex: 1, fontSize: FontSize.sm, lineHeight: 20 },

  savedBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  savedText:   { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  ctaBar:      { padding: Spacing.md, borderTopWidth: 1 },
  saveBtn:     { height: 54, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
