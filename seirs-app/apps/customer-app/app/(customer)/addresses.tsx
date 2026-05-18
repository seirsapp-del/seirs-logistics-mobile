import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, MapPin, Plus, Home, Briefcase, Trash2, Check } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { addressesApi, type SavedAddressDTO } from '@/services/api';

// Spec V8 — saved address book synced to backend so the data follows
// the user across devices + can pre-fill driver routing. AsyncStorage
// is kept as a warm cache so the list renders before the network round
// trip on cold starts.

type SavedAddress = SavedAddressDTO;

const CACHE_KEY = 'seirs.savedAddresses.cache.v2';

export default function AddressesScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const { t }  = useTranslation();

  const [items, setItems]     = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]   = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftText,  setDraftText]  = useState('');
  const [draftType,  setDraftType]  = useState<SavedAddress['type']>('home');

  // Render the cached list immediately, then reconcile with the backend
  // so the list never appears empty on a flaky connection.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) setItems(JSON.parse(raw));
      } catch {}
      try {
        const fresh = await addressesApi.list();
        setItems(fresh);
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
      } catch {}
      setLoading(false);
    })();
  }, []);

  const cache = async (next: SavedAddress[]) => {
    setItems(next);
    try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch {}
  };

  const addAddress = async () => {
    if (!draftLabel.trim() || !draftText.trim()) {
      Alert.alert(t('addresses.labelAndAddressRequired'));
      return;
    }
    try {
      const created = await addressesApi.create({
        label: draftLabel.trim(),
        text:  draftText.trim(),
        type:  draftType,
      });
      await cache([...items, created]);
      setDraftLabel(''); setDraftText(''); setDraftType('home');
      setAdding(false);
    } catch (e: any) {
      Alert.alert(t('addresses.couldNotSave'), e?.message ?? t('editProfile.tryAgain'));
    }
  };

  const removeAddress = (id: string) => {
    Alert.alert(t('addresses.removeTitle'), t('addresses.removeMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          try { await addressesApi.remove(id); } catch {}
          await cache(items.filter(a => a.id !== id));
        },
      },
    ]);
  };

  const Icon = (type: SavedAddress['type']) =>
    type === 'home' ? Home : type === 'work' ? Briefcase : MapPin;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t('addresses.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {loading ? (
            <ActivityIndicator color={theme.primary} style={{ marginTop: 32 }} />
          ) : items.length === 0 && !adding ? (
            <View style={styles.empty}>
              <MapPin size={36} color={theme.textThird} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('addresses.empty')}</Text>
              <Text style={[styles.emptySub, { color: theme.textSecond }]}>
                {t('addresses.label')}
              </Text>
            </View>
          ) : (
            items.map(a => {
              const I = Icon(a.type);
              return (
                <View key={a.id} style={[styles.addressCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={[styles.iconWrap, { backgroundColor: theme.primary + '15' }]}>
                    <I size={20} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: theme.text }]}>{a.label}</Text>
                    <Text style={[styles.address, { color: theme.textSecond }]}>{a.text}</Text>
                  </View>
                  <Pressable onPress={() => removeAddress(a.id)} style={styles.deleteBtn}>
                    <Trash2 size={16} color="#DC2626" />
                  </Pressable>
                </View>
              );
            })
          )}

          {adding && (
            <View style={[styles.addressCard, { backgroundColor: theme.surface, borderColor: theme.primary, flexDirection: 'column', alignItems: 'stretch', padding: Spacing.md, gap: Spacing.sm }]}>
              <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>TYPE</Text>
              <View style={styles.row}>
                {(['home','work','other'] as const).map(type => {
                  const I = Icon(type);
                  return (
                    <Pressable
                      key={type}
                      onPress={() => setDraftType(type)}
                      style={[styles.typeChip, { borderColor: draftType === type ? theme.primary : theme.border, backgroundColor: draftType === type ? theme.primary + '15' : theme.surface }]}
                    >
                      <I size={14} color={draftType === type ? theme.primary : theme.textSecond} />
                      <Text style={{ color: draftType === type ? theme.primary : theme.textSecond, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'capitalize' }}>{type}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>{t('addresses.label').toUpperCase()}</Text>
              <TextInput
                value={draftLabel}
                onChangeText={setDraftLabel}
                placeholder={t('addresses.label')}
                placeholderTextColor={theme.textThird}
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              />

              <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>{t('addresses.address').toUpperCase()}</Text>
              <TextInput
                value={draftText}
                onChangeText={setDraftText}
                placeholder={t('addresses.address')}
                placeholderTextColor={theme.textThird}
                multiline
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background, minHeight: 60, textAlignVertical: 'top' }]}
              />

              <View style={styles.row}>
                <Pressable
                  onPress={() => { setAdding(false); setDraftLabel(''); setDraftText(''); }}
                  style={[styles.cancelBtn, { borderColor: theme.border }]}
                >
                  <Text style={[styles.cancelBtnText, { color: theme.textSecond }]}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable onPress={addAddress} style={[styles.saveBtn, { backgroundColor: theme.primary }]}>
                  <Check size={14} color="#fff" />
                  <Text style={styles.saveBtnText}>{t('common.save')}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {!adding && (
            <Pressable onPress={() => setAdding(true)} style={[styles.addBtn, { borderColor: theme.primary }]}>
              <Plus size={16} color={theme.primary} />
              <Text style={[styles.addBtnText, { color: theme.primary }]}>{t('addresses.addNew')}</Text>
            </Pressable>
          )}

          <Text style={[styles.footnote, { color: theme.textThird }]}>
            Saved on this device only. Backend sync across devices is coming soon.
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

  empty:    { alignItems: 'center', gap: 10, paddingVertical: Spacing.xl, paddingHorizontal: Spacing.lg },
  emptyTitle:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },
  emptySub: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 19 },

  addressCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  iconWrap:    { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  label:       { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  address:     { fontSize: FontSize.xs, marginTop: 2 },
  deleteBtn:   { padding: 8 },

  fieldLabel:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  input:       { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 10, fontSize: FontSize.base },
  row:         { flexDirection: 'row', gap: 8 },
  typeChip:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.lg, borderWidth: 1.5 },

  cancelBtn:    { flex: 1, paddingVertical: 12, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center' },
  cancelBtnText:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  saveBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: Radius.lg },
  saveBtnText:  { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  addBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.lg, borderWidth: 1.5, borderStyle: 'dashed', marginTop: Spacing.sm },
  addBtnText:{ fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  footnote:  { fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.lg, paddingHorizontal: Spacing.lg, lineHeight: 17 },
});
