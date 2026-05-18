import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { authApi } from '@/services/api';

export default function ForgotPasswordScreen() {
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const isDark      = colorScheme === 'dark';
  const { t }       = useTranslation();

  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async () => {
    if (!email.trim()) { setError(t('auth.enterEmail')); return; }
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (e: any) {
      setError(e.message ?? t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <View style={[styles.backCircle, { backgroundColor: theme.surface }]}>
              <Ionicons name="arrow-back" size={20} color={theme.text} />
            </View>
          </Pressable>
          <View style={[styles.sentCard, { backgroundColor: theme.surface }, Shadows.sm]}>
            <View style={[styles.sentIconWrap, { backgroundColor: '#22C55E18' }]}>
              <Ionicons name="mail-open-outline" size={52} color="#22C55E" />
            </View>
            <Text style={[styles.sentTitle, { color: theme.text }]}>{t('auth.checkInbox')}</Text>
            <Text style={[styles.sentDesc, { color: theme.textSecond }]}>
              {t('auth.checkInboxDesc')}
            </Text>
            <Text style={[styles.sentHint, { color: theme.textThird }]}>
              {t('auth.checkSpam')}
            </Text>
          </View>
          <Pressable
            style={[styles.btn, { backgroundColor: theme.primary }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={18} color="#fff" />
            <Text style={styles.btnText}>{t('auth.backToSignIn')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <View style={[styles.backCircle, { backgroundColor: theme.surface }]}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </View>
        </Pressable>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Ionicons name="cube" size={24} color={theme.primary} />
            <Text style={[styles.brand, { color: theme.primary }]}>SEIRS</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{t('auth.forgotTitle')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            {t('auth.forgotDesc')}
          </Text>
        </View>

        {/* Form card */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: '#EF444418' }]}>
              <Ionicons name="alert-circle" size={16} color={theme.error} />
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>{t('auth.emailAddress')}</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <Ionicons name="mail-outline" size={18} color={theme.textThird} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="you@example.com"
                placeholderTextColor={theme.textThird}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </View>

          <Pressable
            style={[styles.btn, { backgroundColor: theme.primary }, loading && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <View style={styles.btnRow}>
                <Text style={styles.btnText}>{t('auth.sendResetLink')}</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </View>
            )}
          </Pressable>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecond }]}>{t('auth.rememberPassword')}</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={[styles.footerLink, { color: theme.primary }]}> {t('auth.signIn')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:  { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.xl, paddingBottom: Spacing.xl },
  backBtn:    { marginBottom: Spacing.lg },
  backCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  header:     { marginBottom: Spacing.xl },
  brandRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.md },
  brand:      { fontSize: FontSize.sm, fontWeight: FontWeight.black, letterSpacing: 3 },
  title:      { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, marginBottom: Spacing.xs },
  subtitle:   { fontSize: FontSize.base, lineHeight: 22 },
  card:       { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  errorBox:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  errorText:  { fontSize: FontSize.sm, fontWeight: FontWeight.medium, flex: 1 },
  field:      { marginBottom: Spacing.md, gap: Spacing.xs },
  label:      { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md },
  inputIcon:  { marginRight: Spacing.sm },
  input:      { flex: 1, fontSize: FontSize.base, height: '100%' },
  btn:        { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  btnRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  btnText:    { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  footer:     { flexDirection: 'row', justifyContent: 'center' },
  footerText: { fontSize: FontSize.base },
  footerLink: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  sentCard:     { borderRadius: Radius.xl, padding: Spacing.lg, alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg },
  sentIconWrap: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  sentTitle:    { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  sentDesc:     { fontSize: FontSize.base, lineHeight: 22, textAlign: 'center' },
  sentHint:     { fontSize: FontSize.sm, textAlign: 'center' },
});
