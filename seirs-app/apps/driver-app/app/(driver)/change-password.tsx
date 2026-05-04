import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Lock } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { authApi } from '@/services/api';
import { PasswordInput } from '@/components/PasswordInput';

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[\d\W]).{8,}$/;

export default function ChangePasswordScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  const [current, setCurrent] = useState('');
  const [next,    setNext]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!current) { Alert.alert('Current password required'); return; }
    if (!PASSWORD_RE.test(next)) {
      Alert.alert('Weak password', 'New password needs 8+ chars with mixed case and a number or symbol.');
      return;
    }
    if (next !== confirm) { Alert.alert('Passwords do not match'); return; }
    setLoading(true);
    try {
      await authApi.changePassword(current, next);
      Alert.alert('Password changed', 'Use your new password next time you sign in.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Could not change password', e?.message ?? 'Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Change Password</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <View style={[styles.banner, { backgroundColor: theme.primary + '15' }]}>
            <Lock size={16} color={theme.primary} />
            <Text style={[styles.bannerText, { color: theme.textSecond }]}>
              You&apos;ll need your current password to confirm. Forgot it? Sign out and use the &ldquo;Forgot password&rdquo; link instead.
            </Text>
          </View>

          <Field label="Current password" theme={theme}>
            <PasswordInput value={current} onChangeText={setCurrent} placeholder="Enter current" />
          </Field>

          <Field label="New password" theme={theme}>
            <PasswordInput value={next} onChangeText={setNext} placeholder="At least 8 chars, mixed case, digit/symbol" />
          </Field>

          <Field label="Confirm new password" theme={theme}>
            <PasswordInput value={confirm} onChangeText={setConfirm} placeholder="Re-enter new password" />
          </Field>

          <Pressable
            disabled={loading || !current || !next || !confirm}
            onPress={handleSubmit}
            style={[styles.primaryBtn, { backgroundColor: (current && next && confirm) ? theme.primary : theme.surfaceSecond }]}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Change password</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, theme, children }: any) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: theme.textSecond, letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  banner:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: Spacing.md, borderRadius: Radius.lg },
  bannerText: { flex: 1, fontSize: FontSize.sm, lineHeight: 19 },
  primaryBtn:{ paddingVertical: 14, borderRadius: Radius.lg, alignItems: 'center', marginTop: Spacing.md },
  primaryBtnText:{ color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
