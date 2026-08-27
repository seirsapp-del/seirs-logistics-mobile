/**
 * Business SEIRS ID screen (founder 2026-08-22: the compact profile row
 * + bare QR modal explained nothing; the customer app's screen is the
 * reference). One identity page, explained for the two hats a business
 * account can wear: sending, and running a partner counter.
 */
import { View, Text, Pressable, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { alertDialog } from '@/components/SeirsDialog';

export default function BusinessSeirsIdScreen() {
  const router     = useRouter();
  const { isDark } = useTheme();
  const theme      = Colors[isDark ? 'dark' : 'light'];
  const { user }   = useAuth() as any;

  const [copied, setCopied] = useState(false);

  const seirsId = user?.accountId ?? '';
  const name    = user?.companyName ?? user?.name ?? 'Business';

  if (!seirsId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ color: theme.text, fontSize: 15, textAlign: 'center' }}>
          Your SEIRS ID is being provisioned. Signing out and back in usually clears this.
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: theme.primary, fontWeight: '700' }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const handleCopy = async () => {
    await Clipboard.setStringAsync(seirsId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>My SEIRS ID</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.intro, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Icon name="ShieldCheck" size={18} color={theme.primary} />
          <Text style={[styles.introText, { color: theme.textSecond }]}>
            This is your business&apos;s verified identity on SEIRS. One code
            for everything: handoffs, counter work and support.
          </Text>
        </View>

        {/* QR card */}
        <View style={[styles.qrCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.qrWrap}>
            <QRCode
              value={seirsId}
              size={200}
              color={theme.text as string}
              backgroundColor={theme.surface as string}
            />
          </View>

          <Text style={[styles.nameLabel, { color: theme.textSecond }]}>REGISTERED NAME</Text>
          <Text style={[styles.name, { color: theme.text }]}>{name}</Text>

          <View style={[styles.codeRow, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Text style={[styles.codeText, { color: theme.primary }]}>{seirsId}</Text>
            <Pressable
              style={[styles.copyBtn, { backgroundColor: copied ? '#22C55E' : theme.primary }]}
              onPress={handleCopy}
            >
              <Icon name={copied ? 'CheckCircle2' : 'Copy'} size={14} color="#fff" />
              <Text style={styles.copyBtnText}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
          </View>
        </View>

        {/* What it's for: the sender hat */}
        <View style={[styles.howCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.howTitle, { color: theme.text }]}>When you send packages</Text>
          {[
            'Dropping a run at a partner counter: staff scan this to book the packages against your account.',
            'A rider collecting from your premises can confirm they are at the right business.',
            'Read the code to SEIRS support and they find your account instantly, no email spelling.',
          ].map((text, i) => (
            <View key={i} style={styles.howRow}>
              <View style={[styles.howStep, { backgroundColor: theme.primary }]}>
                <Text style={styles.howStepText}>{i + 1}</Text>
              </View>
              <Text style={[styles.howText, { color: theme.textSecond }]}>{text}</Text>
            </View>
          ))}
        </View>

        {/* What it's for: the partner-counter hat */}
        <View style={[styles.howCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.howTitle, { color: theme.text }]}>If you run a partner counter</Text>
          {[
            'SEIRS riders collecting from your counter verify they are dealing with the registered store keeper.',
            'Payout questions: this ID ties your counter’s earnings ledger to you and nobody else.',
            'Your store also has its own STORE CODE for customers; this ID is YOURS, the store code is the shop’s.',
          ].map((text, i) => (
            <View key={i} style={styles.howRow}>
              <View style={[styles.howStep, { backgroundColor: theme.primary }]}>
                <Text style={styles.howStepText}>{i + 1}</Text>
              </View>
              <Text style={[styles.howText, { color: theme.textSecond }]}>{text}</Text>
            </View>
          ))}
        </View>

        {/* Fixed cream #FEF9C3 panel with #92400E text (B-10.8). This is
            the warning that the SEIRS ID can be used to impersonate the
            business, so it has to read in both themes. */}
        <Pressable
          style={[styles.alert, {
            backgroundColor: isDark ? '#D9770622' : '#FEF9C3',
            borderColor:     isDark ? '#D9770655' : '#FDE68A',
          }]}
          onPress={() => alertDialog(
            'Keep this code private',
            'Anyone with your SEIRS ID and your registered name could pass themselves off as your business at a handoff. Show it at the moment of use, never post it publicly.',
          )}
        >
          <View style={styles.alertRow}>
            <Icon name="AlertTriangle" size={16} color={isDark ? '#FCD34D' : '#92400E'} />
            <Text style={[styles.alertText, { color: isDark ? '#FCD34D' : '#92400E' }]}>Keep this code private</Text>
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// Layout values mirror the customer seirs-id screen so the two read as
// the same document wearing each app's theme.
const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: 17, fontWeight: '700' },

  content: { padding: 16, gap: 14, paddingBottom: 32 },

  intro:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  introText: { flex: 1, fontSize: 13, lineHeight: 19 },

  qrCard:    { alignItems: 'center', padding: 20, borderRadius: 14, borderWidth: 1, gap: 8 },
  qrWrap:    { padding: 12, backgroundColor: '#fff', borderRadius: 12 },
  nameLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 8 },
  name:      { fontSize: 17, fontWeight: '700' },
  codeRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingLeft: 14, paddingRight: 6, paddingVertical: 6, marginTop: 6 },
  codeText:  { fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  copyBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  copyBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  howCard:  { padding: 14, borderRadius: 14, borderWidth: 1, gap: 10 },
  howTitle: { fontSize: 15, fontWeight: '700' },
  howRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  howStep:  { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  howStepText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  howText:  { flex: 1, fontSize: 13, lineHeight: 19 },

  // Colours overridden per theme at the use site: see B-10.8.
  alert:    { borderWidth: 1, borderRadius: 12, padding: 12 },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertText:{ fontSize: 13, fontWeight: '600' },
});
