import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SeirsMarkBold } from '@/components/SeirsLogoV2';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows, Palette } from '@/constants/theme';
import { authApi } from '@/services/api';

export default function ForgotPasswordScreen() {
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const isDark      = colorScheme === 'dark';
  const { t }       = useTranslation();

  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * Nothing to send until the address could plausibly be one.
   *
   * The button was live on an empty field, so a stray tap round-tripped
   * to the server to be told the obvious. Business already gated this.
   * The regex is deliberately loose: the server decides what is real,
   * this only stops an obviously empty or malformed submit.
   */
  const canSubmit = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && !loading;
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async () => {
    /* Format, not just emptiness: "notanemail" was accepted and the
       confirmation told the user to check an inbox that cannot exist
       (found on the driver app, device QA 2026-08-30). */
    const addr = email.trim().toLowerCase();
    if (!addr) { setError(t('auth.enterEmail')); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr)) {
      setError(t('auth.invalidEmail', { defaultValue: 'That does not look like an email address. Check it and try again.' }));
      return;
    }
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
        <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.background, paddingBottom: Spacing.xl + insets.bottom }]} showsVerticalScrollIndicator={false}>
          {/* Holds the space the back arrow occupies on the form state.
              This screen does not need an arrow (the full-width "Back to
              Sign In" button is right there), but without reserving its
              height the logo jumps up the moment you submit. Founder spotted
              the drift comparing the two side by side, 2026-09-01. */}
          <View style={styles.backSpacer} />
          <View style={styles.brandRow}>
            <SeirsMarkBold size={38} color={theme.primary} hubColor={theme.background} />
            <Text style={[styles.brand, { color: theme.primary }]}>SEIRS</Text>
          </View>
          {/* Flat, not a raised card (founder 2026-09-01: the business
              app's version of this screen is the one to match). A shadowed
              card around a single message was doing nothing except adding
              furniture. Colour stays brand blue rather than success green:
              nothing succeeded, and we deliberately do not reveal whether
              the account exists. */}
          <View style={styles.sentWrap}>
            <View style={[styles.sentIconWrap, { backgroundColor: theme.primary + '18' }]}>
              <Ionicons name="mail-outline" size={40} color={theme.primary} />
            </View>
            <Text style={[styles.sentTitle, { color: theme.text }]}>{t('auth.checkInbox')}</Text>
            <Text style={[styles.sentDesc, { color: theme.textSecond }]}>
              {t('auth.checkInboxDesc')} {t('auth.checkSpam')}
            </Text>
          </View>
          <Pressable
            style={[styles.btn, { backgroundColor: theme.primary }]}
            onPress={() => router.back()}
          >
            {/* the same glyph already sits in the circle at the top */}
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
        contentContainerStyle={[styles.container, { backgroundColor: theme.background, paddingBottom: Spacing.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <View style={[styles.backCircle, { backgroundColor: theme.surface }]}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </View>
        </Pressable>
          <View style={styles.brandRow}>
            <SeirsMarkBold size={38} color={theme.primary} hubColor={theme.background} />
            <Text style={[styles.brand, { color: theme.primary }]}>SEIRS</Text>
          </View>

        {/* Header */}
        <View style={styles.header}>
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
            style={[styles.btn, { backgroundColor: theme.primary }, !canSubmit && { opacity: 0.5 }]}
            onPress={handleSubmit}
            disabled={!canSubmit}
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
  container:  { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.xxl, paddingBottom: Spacing.xl },
  backSpacer: { height: 40, marginBottom: Spacing.lg },
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
  sentWrap:     { alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 24 },
  sentIconWrap: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  sentTitle:    { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  sentDesc:     { fontSize: FontSize.base, lineHeight: 22, textAlign: 'center' },
});
