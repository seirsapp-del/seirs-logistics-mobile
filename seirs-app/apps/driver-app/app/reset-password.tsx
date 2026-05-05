import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { authApi } from '@/services/api';
import { PasswordInput } from '@/components/PasswordInput';
import { validatePassword, PASSWORD_HELP_TEXT } from '@seirs/shared';

// This screen handles the deep link: seirsmobile://reset-password?token=xxx

export default function ResetPasswordScreen() {
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];

  const { token } = useLocalSearchParams<{ token: string }>();

  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading,         setLoading]         = useState(false);
  const [done,            setDone]            = useState(false);
  const [error,           setError]           = useState('');

  const handleReset = async () => {
    if (!newPassword || !confirmPassword) {
      setError('Please fill in both fields.');
      return;
    }
    const pwErr = validatePassword(newPassword);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!token) {
      setError('Invalid reset link. Please request a new one.');
      return;
    }

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

  if (!token) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}>
          <View style={styles.header}>
            <Text style={styles.emoji}>⚠️</Text>
            <Text style={[styles.title, { color: theme.text }]}>Invalid Link</Text>
            <Text style={[styles.subtitle, { color: theme.textSecond }]}>
              This reset link is missing or invalid. Please request a new password reset from the login screen.
            </Text>
          </View>
          <Pressable style={[styles.btn, { backgroundColor: theme.primary }]} onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.btnText}>Back to Sign In</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (done) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}>
          <View style={styles.header}>
            <Text style={styles.emoji}>🎉</Text>
            <Text style={[styles.title, { color: theme.text }]}>Password Reset!</Text>
            <Text style={[styles.subtitle, { color: theme.textSecond }]}>
              Your password has been updated successfully. You can now sign in with your new password.
            </Text>
          </View>
          <Pressable style={[styles.btn, { backgroundColor: theme.primary }]} onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.btnText}>Sign In</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.brand, { color: theme.primary }]}>SEIRS</Text>
          <Text style={[styles.title, { color: theme.text }]}>Set new password</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            {PASSWORD_HELP_TEXT}
          </Text>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: theme.error + '18' }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>New Password</Text>
            <PasswordInput
              placeholder="At least 8 characters"
              placeholderTextColor={theme.textSecond}
              backgroundColor={theme.surface}
              borderColor={theme.border}
              value={newPassword}
              onChangeText={setNewPassword}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Confirm Password</Text>
            <PasswordInput
              placeholder="Repeat your password"
              placeholderTextColor={theme.textSecond}
              backgroundColor={theme.surface}
              borderColor={theme.border}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </View>

          <Pressable
            style={[styles.btn, { backgroundColor: theme.primary }, loading && { opacity: 0.7 }]}
            onPress={handleReset}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Reset Password</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: Spacing.xl, paddingTop: Spacing['3xl'], paddingBottom: Spacing.xl },
  header:    { marginBottom: Spacing.xl },
  brand:     { fontSize: FontSize.sm, fontWeight: FontWeight.black, letterSpacing: 4, marginBottom: Spacing.lg },
  emoji:     { fontSize: 56, textAlign: 'center', marginBottom: Spacing.lg },
  title:     { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, marginBottom: Spacing.sm },
  subtitle:  { fontSize: FontSize.base, lineHeight: 22 },
  form:      { gap: Spacing.xs },
  errorBox:  { padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.sm },
  errorText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  field:     { gap: Spacing.xs, marginBottom: Spacing.sm },
  label:     { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  input:     { height: 52, borderRadius: Radius.md, borderWidth: 1.5, paddingHorizontal: Spacing.md, fontSize: FontSize.base },
  btn:       { height: 54, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  btnText:   { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semibold },
});
