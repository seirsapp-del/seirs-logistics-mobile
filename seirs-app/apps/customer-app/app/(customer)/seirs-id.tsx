import { View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { ArrowLeft, Copy, Shield, CheckCircle, AlertTriangle } from 'lucide-react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

// Spec V8 Â§1.9 + Â§1.17 â€” customer presents this screen when collecting
// at a partner store or as the recipient at the door. Partner staff /
// driver scans the QR (or types the 6-char backup code) to verify the
// holder is the booking owner; recipient then says their full name to
// match what's on the partner's screen.
export default function SeirsIdScreen() {
  const router   = useRouter();
  const cs       = useColorScheme();
  const theme    = Colors[cs ?? 'light'];
  const { user } = useAuth();

  const [copied, setCopied] = useState(false);

  const seirsId = user?.accountId ?? '';
  const name    = user?.name ?? 'Customer';

  if (!seirsId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl }}>
        <Text style={{ color: theme.text, fontSize: FontSize.base, textAlign: 'center' }}>
          Your SEIRS Verified ID is being provisioned. Try again in a few minutes.
        </Text>
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
      <StatusBar barStyle={cs === 'dark' ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>My SEIRS ID</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.intro, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          <Shield size={18} color={theme.primary} strokeWidth={1.75} />
          <Text style={[styles.introText, { color: theme.textSecond }]}>
            Show this code when collecting a package from a partner store, or at the door if you don&apos;t have a physical ID. It is your SEIRS Verified ID.
          </Text>
        </View>

        {/* QR card */}
        <View style={[styles.qrCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
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
              {copied
                ? <CheckCircle size={14} color="#fff" strokeWidth={2} />
                : <Copy        size={14} color="#fff" strokeWidth={2} />
              }
              <Text style={styles.copyBtnText}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
          </View>
        </View>

        {/* How it works */}
        <View style={[styles.howCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.howTitle, { color: theme.text }]}>How handoff verification works</Text>
          {[
            { step: '1', text: 'Partner staff (or your driver) scans this QR or types the 6-char code.' },
            { step: '2', text: 'They see your registered name on their screen.' },
            { step: '3', text: 'Say your full name out loud â€” they type it to confirm the match.' },
            { step: '4', text: 'The handoff is logged in your delivery audit trail.' },
          ].map(s => (
            <View key={s.step} style={styles.howRow}>
              <View style={[styles.howStep, { backgroundColor: theme.primary }]}>
                <Text style={styles.howStepText}>{s.step}</Text>
              </View>
              <Text style={[styles.howText, { color: theme.textSecond }]}>{s.text}</Text>
            </View>
          ))}
        </View>

        <Pressable
          style={[styles.alert, { backgroundColor: '#FEF9C3', borderColor: '#FDE68A' }]}
          onPress={() => Alert.alert(
            'Keep this code safe',
            'Anyone with your SEIRS ID plus your full name could collect a package in your name. Treat it like a debit-card PIN â€” only show it at the moment of pickup.',
          )}
        >
          <View style={styles.alertRow}>
            <AlertTriangle size={16} color="#92400E" strokeWidth={1.75} />
            <Text style={styles.alertText}>Keep this code private</Text>
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  intro:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  introText: { flex: 1, fontSize: FontSize.sm, lineHeight: 19 },

  qrCard:  { borderRadius: Radius.xxl, borderWidth: 1, padding: Spacing.lg, alignItems: 'center', gap: Spacing.md },
  qrWrap:  { padding: Spacing.md, borderRadius: Radius.lg },
  nameLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, letterSpacing: 0.8, marginTop: Spacing.sm },
  name:      { fontSize: FontSize.lg, fontWeight: FontWeight.bold },

  codeRow:    { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, paddingLeft: Spacing.md, overflow: 'hidden', alignSelf: 'stretch' },
  codeText:   { flex: 1, fontSize: FontSize.lg, fontWeight: FontWeight.bold, letterSpacing: 2 },
  copyBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: 12 },
  copyBtnText:{ color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  howCard:  { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  howTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  howRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  howStep:  { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  howStepText:{ color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  howText:  { flex: 1, fontSize: FontSize.sm, lineHeight: 19 },

  alert:    { padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center' },
  alertRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  alertText:{ color: '#92400E', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
});
