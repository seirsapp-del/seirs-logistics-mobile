import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/Icon';
import { authApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Colors, Palette } from '@/constants/theme';

export default function LoginScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { login } = useAuth();
  const { isDark } = useTheme();
  const theme   = Colors[isDark ? 'dark' : 'light'];

  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  const passwordValid = password.length >= 12;
  const canSubmit     = email.trim() && passwordValid && !loading;

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const { token, user } = await authApi.login(email.trim().toLowerCase(), password);
      await login({ ...user, token });
    } catch (e: any) {
      setError(e.message ?? 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  // Brand gradient — Navy → lighter Navy. These are the canonical brand stops.
  const headerGradient: [string, string] = [Palette.navy800, Palette.navy700];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={headerGradient} style={{ paddingTop: insets.top + 24, paddingBottom: 24 }}>
        <View style={styles.logoRow}>
          <View style={[styles.logoIcon, { backgroundColor: Palette.sky500 }]}>
            <Icon name="Briefcase" size={22} color={Palette.white} strokeWidth={1.5} />
          </View>
          <View>
            <Text style={[styles.logoText, { color: Palette.white }]}>SEIRS</Text>
            <Text style={[styles.logoSub, { color: 'rgba(255,255,255,0.5)' }]}>Business &amp; Partners</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24, backgroundColor: theme.background }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.heading, { color: theme.text }]}>Sign In</Text>

        {error !== '' && (
          <View style={[styles.errorBox, { backgroundColor: isDark ? '#3F1F1F' : '#FEF2F2', borderColor: isDark ? '#7F1D1D' : '#FECACA' }]}>
            <Icon name="AlertCircle" size={16} color={theme.error} />
            <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
          </View>
        )}

        <Text style={[styles.label, { color: theme.textSecond }]}>Email address</Text>
        <View style={[styles.inputWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Icon name="Mail" size={16} color={theme.textThird} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            value={email}
            onChangeText={setEmail}
            placeholder="business@company.ng"
            placeholderTextColor={theme.textThird}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        </View>

        <Text style={[styles.label, { color: theme.textSecond }]}>Password</Text>
        <View style={[styles.inputWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Icon name="Lock" size={16} color={theme.textThird} />
          <TextInput
            style={[styles.input, { flex: 1, color: theme.text }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Minimum 12 characters"
            placeholderTextColor={theme.textThird}
            secureTextEntry={!showPass}
            autoComplete="password"
          />
          <Pressable onPress={() => setShowPass((v) => !v)}>
            <Icon name={showPass ? 'EyeOff' : 'Eye'} size={16} color={theme.textThird} />
          </Pressable>
        </View>
        {password.length > 0 && !passwordValid && (
          <Text style={[styles.fieldError, { color: theme.error }]}>Minimum 12 characters required</Text>
        )}

        <Pressable
          style={[styles.btn, { backgroundColor: theme.primary }, !canSubmit && styles.btnDisabled]}
          onPress={handleLogin}
          disabled={!canSubmit}
        >
          {loading
            ? <ActivityIndicator color={theme.textOnPrimary} />
            : <Text style={[styles.btnText, { color: theme.textOnPrimary }]}>Sign In</Text>
          }
        </Pressable>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecond }]}>Don&apos;t have an account? </Text>
          <Pressable onPress={() => router.push('/(auth)/register' as any)}>
            <Text style={[styles.footerLink, { color: theme.accent }]}>Register</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  logoRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  logoIcon:   {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  logoText:   { fontSize: 20, fontWeight: '900', letterSpacing: 3 },
  logoSub:    { fontSize: 11, marginTop: 1 },
  body:       { padding: 24, flexGrow: 1 },
  heading:    { fontSize: 24, fontWeight: '800', marginBottom: 20, marginTop: 8 },
  errorBox:   {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorText:  { fontSize: 13, flex: 1 },
  label:      { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  inputWrap:  {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, marginBottom: 14,
  },
  input:      { fontSize: 15, flex: 1 },
  fieldError: { fontSize: 12, marginTop: -10, marginBottom: 12, marginLeft: 4 },
  btn:        { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnDisabled:{ opacity: 0.5 },
  btnText:    { fontWeight: '700', fontSize: 16 },
  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { fontSize: 14 },
  footerLink: { fontWeight: '600', fontSize: 14 },
});
