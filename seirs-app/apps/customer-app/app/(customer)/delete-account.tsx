import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, AlertTriangle, Trash2, Download } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { usersApi } from '@/services/api';
import { PasswordInput } from '@/components/PasswordInput';

const CONFIRM_PHRASE = 'delete my account';

// Spec V8 — NDPR right to erasure. Soft-deletes (isActive=false) with
// a 30-day grace window. Logging back in within the window restores;
// after 30 days a backend cron hard-deletes.
export default function DeleteAccountScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const { logout } = useAuth() as any;
  const { t } = useTranslation();

  const [password,    setPassword]    = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [exporting,   setExporting]   = useState(false);

  // Spec V8 NDPR Article 24 — right to data portability. Surfaced on
  // delete-account so users see + can take a copy before erasing.
  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await usersApi.exportData();
      const json = JSON.stringify(data, null, 2);
      await Clipboard.setStringAsync(json);
      Alert.alert(
        'Copied to clipboard',
        `Your data export (${(json.length / 1024).toFixed(1)} KB) has been copied. Paste it into a notes app or email to yourself, then save the file somewhere safe.`,
      );
    } catch (e: any) {
      Alert.alert(t('deleteAccount.exportFailed'), e?.message ?? t('deleteAccount.tryAgain'));
    } finally {
      setExporting(false);
    }
  };

  const canSubmit =
    password.length > 0 &&
    confirmText.trim().toLowerCase() === CONFIRM_PHRASE;

  const handleSubmit = () => {
    Alert.alert(
      t('deleteAccount.title'),
      t('deleteAccount.warning'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await usersApi.deleteAccount(password);
              Alert.alert(
                t('deleteAccount.title'),
                t('deleteAccount.warning'),
                [{ text: t('common.ok'), onPress: async () => {
                  try { await logout?.(); } catch { /* best-effort */ }
                  router.replace('/(auth)/login' as any);
                }}],
              );
            } catch (e: any) {
              Alert.alert(t('deleteAccount.couldNotDelete'), e?.message ?? t('deleteAccount.tryAgain'));
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Delete Account</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <View style={styles.warnBanner}>
            <AlertTriangle size={20} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.warnTitle}>Permanent after 30 days</Text>
              <Text style={styles.warnSub}>
                Soft-deleted now; sign in within 30 days to cancel. After that, all your data is permanently removed.
              </Text>
            </View>
          </View>

          <Text style={[styles.what, { color: theme.text }]}>What gets deleted</Text>
          {[
            'Your profile, name, phone, photo',
            'Your delivery history (after the 30-day grace window)',
            'Your wallet balance — withdraw before deleting if there are funds',
            'Your saved payment + bank details',
          ].map(t => (
            <Text key={t} style={[styles.bullet, { color: theme.textSecond }]}>• {t}</Text>
          ))}

          <Text style={[styles.what, { color: theme.text, marginTop: Spacing.md }]}>What stays</Text>
          {[
            'Audit trails for any open disputes against your account',
            'Tax records we are legally required to retain (FIRS / NDPR)',
            'Anonymised analytics — you are not personally identifiable',
          ].map(t => (
            <Text key={t} style={[styles.bullet, { color: theme.textSecond }]}>• {t}</Text>
          ))}

          {/* NDPR data portability — let user take a copy before deleting */}
          <Pressable
            onPress={handleExport}
            disabled={exporting}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: Spacing.md, borderRadius: Radius.lg,
              borderWidth: 1.5, borderColor: theme.primary,
              backgroundColor: theme.primary + '08', marginTop: Spacing.md,
            }}
          >
            {exporting
              ? <ActivityIndicator color={theme.primary} />
              : <>
                  <Download size={16} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontWeight: FontWeight.semibold, fontSize: FontSize.sm }}>
                    Download my data first (recommended)
                  </Text>
                </>}
          </Pressable>

          {/* Password confirm */}
          <View style={{ marginTop: Spacing.lg, gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>CONFIRM YOUR PASSWORD</Text>
            <PasswordInput value={password} onChangeText={setPassword} placeholder="Enter current password" />
          </View>

          {/* Type-to-confirm */}
          <View style={{ marginTop: Spacing.md, gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>
              TYPE &ldquo;{CONFIRM_PHRASE}&rdquo; TO ENABLE
            </Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder={CONFIRM_PHRASE}
              placeholderTextColor={theme.textThird}
              style={{
                borderWidth: 1, borderColor: theme.border, borderRadius: Radius.lg,
                paddingHorizontal: 12, paddingVertical: 12, backgroundColor: theme.surface,
                color: theme.text, fontSize: FontSize.base,
              }}
            />
          </View>

          <Pressable
            disabled={!canSubmit || loading}
            onPress={handleSubmit}
            style={[
              styles.dangerBtn,
              { backgroundColor: canSubmit ? '#DC2626' : theme.surfaceSecond },
            ]}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Trash2 size={16} color={canSubmit ? '#fff' : theme.textThird} />
                  <Text style={[styles.dangerBtnText, { color: canSubmit ? '#fff' : theme.textThird }]}>
                    Delete my account
                  </Text>
                </>
            }
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  content: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  warnBanner:{ flexDirection: 'row', gap: 12, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'flex-start', backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
  warnTitle: { color: '#991B1B', fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: 4 },
  warnSub:   { color: '#991B1B', fontSize: FontSize.sm, lineHeight: 19 },
  what:      { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginTop: Spacing.sm },
  bullet:    { fontSize: FontSize.sm, lineHeight: 21, paddingLeft: Spacing.xs },
  fieldLabel:{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.lg, marginTop: Spacing.lg },
  dangerBtnText:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
