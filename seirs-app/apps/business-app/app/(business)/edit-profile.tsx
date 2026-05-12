import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { usersApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/context/ThemeContext';

// Spec V8 §4 — business / partner profile editor. Edits the underlying
// User row (name, phone, photo). Business-specific fields like
// companyName / RC number / storeAddress live on a separate
// businessAccount entity and have their own editor (next batch).
export default function BusinessEditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();
  const { user, refresh } = useAuth() as any;

  const [name,  setName]  = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
    setPhone(user?.phone ?? '');
  }, [user]);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      await usersApi.updateProfile({ name: name.trim(), phone: phone.trim() });
      try { await refresh?.(); } catch { /* best-effort */ }
      Alert.alert('Saved', 'Profile updated.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Try again.');
    } finally { setSaving(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.surfaceSecond }]}>
          <Icon name="ArrowLeft" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Edit Profile</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textSecond }]}>EMAIL (READ-ONLY)</Text>
            <Text style={[styles.email, { color: colors.textSecond }]}>{user?.email ?? '—'}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textSecond }]}>NAME</Text>
            <TextInput
              value={name} onChangeText={setName}
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              placeholder="Your name" placeholderTextColor={colors.textThird} />
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textSecond }]}>PHONE</Text>
            <TextInput
              value={phone} onChangeText={setPhone} keyboardType="phone-pad"
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              placeholder="08012345678" placeholderTextColor={colors.textThird} />
          </View>

          <View style={styles.note}>
            <Icon name="Info" size={12} color={colors.textThird} />
            <Text style={[styles.noteText, { color: colors.textSecond }]}>
              Business-specific fields (company name, RC number, store address) have their own editor coming in the next batch.
            </Text>
          </View>

          <Pressable
            disabled={saving}
            onPress={handleSave}
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save changes</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn:    { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: 18, fontWeight: '700' },

  content:    { padding: 16, gap: 12 },

  card:       { borderRadius: 12, padding: 14, gap: 6, borderWidth: 1 },
  label:      { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  email:      { fontSize: 16 },
  input:      { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },

  note:       { flexDirection: 'row', gap: 6, alignItems: 'flex-start', padding: 10 },
  noteText:   { flex: 1, fontSize: 11, lineHeight: 16 },

  primaryBtn:     { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
