import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { authApi } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import { Colors } from '@/constants/theme';
import { validatePassword } from '@seirs/shared';
import { tx } from '@/i18n/tx';

// Handles the deep link seirsbusiness://reset-password?token=xxx from
// the password-reset email. Root-level (outside the auth group) so the
// link works whether or not a session exists; NavigationGuard in
// _layout.tsx explicitly allows this segment while signed out.

export default function ResetPasswordScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { isDark } = useTheme();
  const theme   = Colors[isDark ? 'dark' : 'light'];

  const { token } = useLocalSearchParams<{ token: string }>();

  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass,        setShowPass]        = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [done,            setDone]            = useState(false);
  const [error,           setError]           = useState('');

  const handleReset = async () => {
    if (!newPassword || !confirmPassword) { setError('Please fill in both fields.'); return; }
    const pwErr = validatePassword(newPassword);
    if (pwErr) { setError(pwErr); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!token) { setError('Invalid reset link. Please request a new one.'); return; }

    setError('');
    setLoading(true);
    try {
      await authApi.resetPassword(token, newPassword);
      setDone(true);
    } catch (e: any) {
      setError(e.message ?? 'Could not reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  const body = (children: React.ReactNode) => (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (!token) {
    return body(
      <>
        <View style={styles.centerWrap}>
          <Icon name="AlertCircle" size={56} color={theme.warning ?? '#D97706'} />
          <Text style={[styles.heading, { color: theme.text, textAlign: 'center' }]}>{tx('auto.resetPassword.invalidLink', 'Invalid Link')}</Text>
          <Text style={[styles.desc, { color: theme.textSecond }]}>
            This reset link is missing or invalid. Please request a new password reset from the sign-in screen.
          </Text>
        </View>
        <Pressable style={[styles.btn, { backgroundColor: theme.primary }]} onPress={() => router.replace('/(auth)/login')}>
          <Text style={[styles.btnText, { color: theme.textOnPrimary }]}>{tx('auto.resetPassword.backToSignIn', 'Back to Sign In')}</Text>
        </Pressable>
      </>,
    );
  }

  if (done) {
    return body(
      <>
        <View style={styles.centerWrap}>
          <Icon name="CheckCircle2" size={56} color="#16A34A" />
          <Text style={[styles.heading, { color: theme.text, textAlign: 'center' }]}>{tx('auto.resetPassword.passwordUpdated', 'Password Updated')}</Text>
          <Text style={[styles.desc, { color: theme.textSecond }]}>
            Your password has been changed. Sign in with the new password to continue.
          </Text>
        </View>
        <Pressable style={[styles.btn, { backgroundColor: theme.primary }]} onPress={() => router.replace('/(auth)/login')}>
          <Text style={[styles.btnText, { color: theme.textOnPrimary }]}>{tx('auto.resetPassword.signIn', 'Sign In')}</Text>
        </Pressable>
      </>,
    );
  }

  return body(
    <>
      <Text style={[styles.heading, { color: theme.text }]}>{tx('auto.resetPassword.chooseANewPassword', 'Choose a new password')}</Text>
      <Text style={[styles.desc, { color: theme.textSecond, textAlign: 'left', marginBottom: 20 }]}>
        Minimum 8 characters with at least one letter and one number.
      </Text>

      {error !== '' && (
        <View style={[styles.errorBox, { backgroundColor: isDark ? '#3F1F1F' : '#FEF2F2', borderColor: isDark ? '#7F1D1D' : '#FECACA' }]}>
          <Icon name="AlertCircle" size={16} color={theme.error} />
          <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
        </View>
      )}

      <Text style={[styles.label, { color: theme.textSecond }]}>{tx('auto.resetPassword.newPassword', 'New password')}</Text>
      <View style={[styles.inputWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Icon name="Lock" size={16} color={theme.textThird} />
        <TextInput
          style={[styles.input, { color: theme.text }]}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="New password"
          placeholderTextColor={theme.textThird}
          secureTextEntry={!showPass}
          autoComplete="new-password"
        />
        <Pressable onPress={() => setShowPass((v) => !v)}>
          <Icon name={showPass ? 'EyeOff' : 'Eye'} size={16} color={theme.textThird} />
        </Pressable>
      </View>

      <Text style={[styles.label, { color: theme.textSecond }]}>{tx('auto.resetPassword.confirmPassword', 'Confirm password')}</Text>
      <View style={[styles.inputWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Icon name="Lock" size={16} color={theme.textThird} />
        <TextInput
          style={[styles.input, { color: theme.text }]}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Repeat new password"
          placeholderTextColor={theme.textThird}
          secureTextEntry={!showPass}
          autoComplete="new-password"
        />
      </View>

      <Pressable
        style={[styles.btn, { backgroundColor: theme.primary }, loading && styles.btnDisabled]}
        onPress={handleReset}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color={theme.textOnPrimary} />
          : <Text style={[styles.btnText, { color: theme.textOnPrimary }]}>{tx('auto.resetPassword.updatePassword', 'Update Password')}</Text>
        }
      </Pressable>
    </>,
  );
}

const styles = StyleSheet.create({
  body:       { padding: 24, flexGrow: 1 },
  centerWrap: { alignItems: 'center', gap: 10, marginBottom: 24, marginTop: 24 },
  heading:    { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  desc:       { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  errorBox:   {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorText:  { fontSize: 14, flex: 1 },
  label:      { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  inputWrap:  {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, marginBottom: 14,
  },
  input:      { fontSize: 15, flex: 1 },
  btn:        { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnDisabled:{ opacity: 0.5 },
  btnText:    { fontWeight: '700', fontSize: 16 },
});
