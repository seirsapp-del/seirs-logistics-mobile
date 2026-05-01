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

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={['#0F2B4C', '#1a3a5c']} style={{ paddingTop: insets.top + 24, paddingBottom: 24 }}>
        <View style={styles.logoRow}>
          <View style={styles.logoIcon}>
            <Icon name="Briefcase" size={22} color="#fff" strokeWidth={1.5} />
          </View>
          <View>
            <Text style={styles.logoText}>SEIRS</Text>
            <Text style={styles.logoSub}>Business & Partners</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Sign In</Text>

        {error !== '' && (
          <View style={styles.errorBox}>
            <Icon name="AlertCircle" size={16} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.label}>Email address</Text>
        <View style={styles.inputWrap}>
          <Icon name="Mail" size={16} color="#9CA3AF" />
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="business@company.ng"
            placeholderTextColor="#9CA3AF"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        </View>

        <Text style={styles.label}>Password</Text>
        <View style={styles.inputWrap}>
          <Icon name="Lock" size={16} color="#9CA3AF" />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Minimum 12 characters"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!showPass}
            autoComplete="password"
          />
          <Pressable onPress={() => setShowPass((v) => !v)}>
            <Icon name={showPass ? 'EyeOff' : 'Eye'} size={16} color="#9CA3AF" />
          </Pressable>
        </View>
        {password.length > 0 && !passwordValid && (
          <Text style={styles.fieldError}>Minimum 12 characters required</Text>
        )}

        <Pressable
          style={[styles.btn, !canSubmit && styles.btnDisabled]}
          onPress={handleLogin}
          disabled={!canSubmit}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Sign In</Text>
          }
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Pressable onPress={() => router.push('/(auth)/register' as any)}>
            <Text style={styles.footerLink}>Register</Text>
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
    backgroundColor: '#3A7BD5', alignItems: 'center', justifyContent: 'center',
  },
  logoText:   { fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: 3 },
  logoSub:    { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  body:       { padding: 24, backgroundColor: '#F5F5F0', flexGrow: 1 },
  heading:    { fontSize: 24, fontWeight: '800', color: '#0F2B4C', marginBottom: 20, marginTop: 8 },
  errorBox:   {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorText:  { color: '#DC2626', fontSize: 13, flex: 1 },
  label:      { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  inputWrap:  {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 14,
  },
  input:      { fontSize: 15, color: '#0F2B4C', flex: 1 },
  fieldError: { color: '#EF4444', fontSize: 12, marginTop: -10, marginBottom: 12, marginLeft: 4 },
  btn:        {
    backgroundColor: '#0F2B4C', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
  },
  btnDisabled: { opacity: 0.5 },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { color: '#6B7280', fontSize: 14 },
  footerLink: { color: '#3A7BD5', fontWeight: '600', fontSize: 14 },
});
