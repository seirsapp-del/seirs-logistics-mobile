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

// Spec V8 §4 — business / partner profile editor. Edits the underlying
// User row (name, phone, photo). Business-specific fields like
// companyName / RC number / storeAddress live on a separate
// businessAccount entity and have their own editor (next batch).
export default function BusinessEditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F0' }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={20} color="#0F2B4C" />
        </Pressable>
        <Text style={styles.title}>Edit Profile</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <View style={styles.card}>
            <Text style={styles.label}>EMAIL (READ-ONLY)</Text>
            <Text style={styles.email}>{user?.email ?? '—'}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>NAME</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Your name" placeholderTextColor="#9CA3AF" />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>PHONE</Text>
            <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input} placeholder="08012345678" placeholderTextColor="#9CA3AF" />
          </View>

          <View style={styles.note}>
            <Icon name="Info" size={12} color="#9CA3AF" />
            <Text style={styles.noteText}>
              Business-specific fields (company name, RC number, store address) have their own editor coming in the next batch.
            </Text>
          </View>

          <Pressable
            disabled={saving}
            onPress={handleSave}
            style={styles.primaryBtn}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save changes</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn:    { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: 18, fontWeight: '700', color: '#0F2B4C' },

  content:    { padding: 16, gap: 12 },

  card:       { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 6, borderWidth: 1, borderColor: '#E5E7EB' },
  label:      { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5 },
  email:      { fontSize: 16, color: '#6B7280' },
  input:      { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#0F2B4C' },

  note:       { flexDirection: 'row', gap: 6, alignItems: 'flex-start', padding: 10 },
  noteText:   { flex: 1, fontSize: 11, color: '#6B7280', lineHeight: 16 },

  primaryBtn: { backgroundColor: '#0F2B4C', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
