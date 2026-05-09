import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { ArrowLeft, Camera, User, Phone, Mail, Save } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { usersApi, uploadApi } from '@/services/api';

// Spec V8 — standalone profile editor. Read-only view lives on the
// existing profile screen; this is the form for actually changing
// values. Email is intentionally not editable here — that requires a
// re-verification flow (deferred).
export default function EditProfileScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const { user, refresh } = useAuth() as any;

  const [name,         setName]         = useState('');
  const [phone,        setPhone]        = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [saving,       setSaving]       = useState(false);
  const [uploading,    setUploading]    = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
    setPhone(user?.phone ?? '');
    setProfilePhoto(user?.profilePhoto ?? '');
  }, [user]);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    if (r.canceled) return;
    setUploading(true);
    try {
      const uploaded = await uploadApi.file(r.assets[0].uri);
      setProfilePhoto(uploaded.url);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      await usersApi.updateProfile({ name: name.trim(), phone: phone.trim(), profilePhoto });
      try { await refresh?.(); } catch { /* refresh is best-effort */ }
      Alert.alert('Saved', 'Profile updated.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Edit Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Photo */}
          <View style={styles.photoWrap}>
            <Pressable onPress={pickPhoto} style={[styles.avatarRing, { borderColor: theme.primary }]}>
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: theme.primary + '20' }]}>
                  <User size={36} color={theme.primary} />
                </View>
              )}
              <View style={[styles.cameraBadge, { backgroundColor: theme.primary }]}>
                {uploading ? <ActivityIndicator color="#fff" size="small" /> : <Camera size={14} color="#fff" />}
              </View>
            </Pressable>
            <Text style={[styles.tapHint, { color: theme.textSecond }]}>Tap to change photo</Text>
          </View>

          {/* Email read-only */}
          <Field label="Email" value={user?.email ?? ''} editable={false} icon={<Mail size={15} color={theme.textThird} />} theme={theme} />

          {/* Name */}
          <Field label="Full name" value={name} onChange={setName} icon={<User size={15} color={theme.textThird} />} theme={theme} />

          {/* Phone */}
          <Field label="Phone" value={phone} onChange={setPhone} keyboardType="phone-pad" icon={<Phone size={15} color={theme.textThird} />} theme={theme} />

          <Pressable
            disabled={saving}
            onPress={handleSave}
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Save size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Save changes</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, editable = true, keyboardType, icon, theme }: any) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: theme.textSecond, letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.border, borderRadius: Radius.lg, paddingHorizontal: 12, backgroundColor: editable ? theme.surface : theme.surfaceSecond }}>
        {icon}
        <TextInput
          style={{ flex: 1, paddingVertical: 12, paddingLeft: 8, color: theme.text, fontSize: FontSize.base }}
          value={value}
          onChangeText={onChange}
          editable={editable}
          keyboardType={keyboardType}
          placeholderTextColor={theme.textThird}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  photoWrap: { alignItems: 'center', gap: 8, marginVertical: Spacing.md },
  avatarRing:{ width: 100, height: 100, borderRadius: 50, borderWidth: 3, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  avatar:    { width: 92, height: 92, borderRadius: 46 },
  avatarFallback:{ width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' },
  cameraBadge:{ position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  tapHint:   { fontSize: FontSize.xs },
  primaryBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.lg, marginTop: Spacing.md },
  primaryBtnText:{ color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
