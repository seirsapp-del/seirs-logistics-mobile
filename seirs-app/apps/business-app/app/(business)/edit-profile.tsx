import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { usersApi, businessApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/context/ThemeContext';

// Spec V8 §4 — business / partner profile editor. Edits both the User
// row (name, phone) AND the BusinessAccount row (companyName, RC,
// structured address). Business-side fields are owner-only — non-
// owner team members see them read-only with a hint about who to
// contact.
export default function BusinessEditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();
  const { user, refresh } = useAuth() as any;

  const [name,  setName]  = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Spec V8 — business account fields (owner-only edit)
  const [biz,           setBiz]           = useState<any>(null);
  const [companyName,   setCompanyName]   = useState('');
  const [rcNumber,      setRcNumber]      = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city,          setCity]          = useState('');
  const [state,         setState]         = useState('');
  const [bizLoading,    setBizLoading]    = useState(true);

  useEffect(() => {
    setName(user?.name ?? '');
    setPhone(user?.phone ?? '');
  }, [user]);

  useEffect(() => {
    (async () => {
      try {
        const account = await businessApi.account.get();
        setBiz(account);
        setCompanyName(account.companyName ?? '');
        setRcNumber(account.rcNumber ?? '');
        setStreetAddress(account.streetAddress ?? '');
        setCity(account.city ?? '');
        setState(account.state ?? '');
      } catch { /* non-fatal — partner-only users with no biz account */ }
      finally { setBizLoading(false); }
    })();
  }, []);

  const isOwner = biz?.myTeamRole === 'owner';
  const myRoleLabel = biz?.myTeamRole ? biz.myTeamRole.charAt(0).toUpperCase() + biz.myTeamRole.slice(1) : null;

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      // Always update user row
      await usersApi.updateProfile({ name: name.trim(), phone: phone.trim() });
      // Owner-only: persist business account changes if any
      if (biz && isOwner) {
        const bizUpdates: any = {};
        if (companyName.trim()   !== (biz.companyName    ?? '')) bizUpdates.companyName   = companyName.trim();
        if (rcNumber.trim()      !== (biz.rcNumber       ?? '')) bizUpdates.rcNumber      = rcNumber.trim();
        if (streetAddress.trim() !== (biz.streetAddress  ?? '')) bizUpdates.streetAddress = streetAddress.trim();
        if (city.trim()          !== (biz.city           ?? '')) bizUpdates.city          = city.trim();
        if (state.trim()         !== (biz.state          ?? '')) bizUpdates.state         = state.trim();
        if (Object.keys(bizUpdates).length > 0) {
          await businessApi.account.update(bizUpdates);
        }
      }
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

          {bizLoading ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, alignItems: 'center' }]}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : biz ? (
            <>
              <View style={[styles.sectionHeader]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Business Account</Text>
                {myRoleLabel && (
                  <View style={[styles.roleChip, { backgroundColor: colors.accent + '18' }]}>
                    <Text style={[styles.roleChipText, { color: colors.accent }]}>{myRoleLabel}</Text>
                  </View>
                )}
              </View>

              {!isOwner && (
                <View style={styles.note}>
                  <Icon name="Lock" size={12} color={colors.textThird} />
                  <Text style={[styles.noteText, { color: colors.textSecond }]}>
                    Business fields are owner-only. Contact your account owner to update them.
                  </Text>
                </View>
              )}

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.textSecond }]}>COMPANY NAME</Text>
                <TextInput
                  value={companyName} onChangeText={setCompanyName} editable={isOwner}
                  style={[styles.input, { borderColor: colors.border, color: colors.text, opacity: isOwner ? 1 : 0.6 }]}
                  placeholder="Acme Logistics Ltd" placeholderTextColor={colors.textThird} />
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.textSecond }]}>RC NUMBER</Text>
                <TextInput
                  value={rcNumber} onChangeText={setRcNumber} editable={isOwner}
                  style={[styles.input, { borderColor: colors.border, color: colors.text, opacity: isOwner ? 1 : 0.6 }]}
                  placeholder="RC1234567" placeholderTextColor={colors.textThird} />
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.textSecond }]}>STREET ADDRESS</Text>
                <TextInput
                  value={streetAddress} onChangeText={setStreetAddress} editable={isOwner}
                  style={[styles.input, { borderColor: colors.border, color: colors.text, opacity: isOwner ? 1 : 0.6 }]}
                  placeholder="15 Adeola Odeku" placeholderTextColor={colors.textThird} />
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, flex: 1 }]}>
                  <Text style={[styles.label, { color: colors.textSecond }]}>CITY</Text>
                  <TextInput
                    value={city} onChangeText={setCity} editable={isOwner}
                    style={[styles.input, { borderColor: colors.border, color: colors.text, opacity: isOwner ? 1 : 0.6 }]}
                    placeholder="Lekki" placeholderTextColor={colors.textThird} />
                </View>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, flex: 1 }]}>
                  <Text style={[styles.label, { color: colors.textSecond }]}>STATE</Text>
                  <TextInput
                    value={state} onChangeText={setState} editable={isOwner}
                    style={[styles.input, { borderColor: colors.border, color: colors.text, opacity: isOwner ? 1 : 0.6 }]}
                    placeholder="Lagos" placeholderTextColor={colors.textThird} />
                </View>
              </View>
            </>
          ) : null}

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

  sectionHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  sectionTitle:   { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  roleChip:       { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  roleChipText:   { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
