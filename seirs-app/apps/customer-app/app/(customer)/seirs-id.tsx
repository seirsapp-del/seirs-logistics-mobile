import { View, Text, Pressable, StyleSheet, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { ArrowLeft, Copy, Shield, CheckCircle, AlertTriangle, RefreshCw, Package, ChevronRight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';

// Spec V8 §1.9 + §1.17: customer presents this screen when collecting
// at a partner store or as the recipient at the door. Partner staff /
// driver scans the QR (or types the SEIRS ID as a backup) to verify the
// holder is the booking owner; recipient then says their full name to
// match what's on the partner's screen.
export default function SeirsIdScreen() {
  const router   = useRouter();
  const cs       = useColorScheme();
  const theme    = Colors[cs ?? 'light'];
  const { user, refresh } = useAuth() as any;

  const [copied,     setCopied]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [triedRefresh, setTriedRefresh] = useState(false);

  const seirsId = user?.accountId ?? '';
  const name    = user?.name ?? 'Customer';

  // If the auth session was cached before the account got a SEIRS ID
  // (backfill ran after login, or a legacy account), the JWT snapshot
  // is stale. Auto-refetch /users/me once on mount to pick up the
  // latest accountId before we tell the user to wait.
  useEffect(() => {
    if (!seirsId && !triedRefresh) {
      setTriedRefresh(true);
      refresh?.().catch(() => { /* best-effort */ });
    }
  }, [seirsId, triedRefresh, refresh]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await refresh?.(); } catch { /* best-effort */ }
    finally { setRefreshing(false); }
  };

  if (!seirsId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
            <ArrowLeft size={20} color={theme.text} strokeWidth={1.75} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>{tx('auto.seirsId.mySeirsId', 'My SEIRS ID')}</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, gap: Spacing.md }}>
          <Shield size={32} color={theme.primary} strokeWidth={1.5} />
          <Text style={{ color: theme.text, fontSize: FontSize.md, fontWeight: FontWeight.bold, textAlign: 'center' }}>
            {tr('auto.seirsId.settingUpYourSeirsId', 'Setting up your SEIRS ID')}
          </Text>
          <Text style={{ color: theme.textSecond, fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 }}>
            {tr('auto.seirsId.yourIdShouldBeReady', 'Your ID should be ready. If this message stays, signing out and back in usually clears it.')}
          </Text>
          <Pressable
            disabled={refreshing}
            onPress={handleRefresh}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.sm, backgroundColor: theme.primary, paddingHorizontal: Spacing.md, paddingVertical: 12, borderRadius: Radius.lg }}
          >
            {refreshing
              ? <ActivityIndicator color="#fff" size="small" />
              : <RefreshCw size={15} color="#fff" strokeWidth={2} />}
            <Text style={{ color: '#fff', fontWeight: FontWeight.bold, fontSize: FontSize.sm }}>
              {refreshing ? 'Refreshing…' : 'Try again'}
            </Text>
          </Pressable>
        </View>
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
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.seirsId.mySeirsId', 'My SEIRS ID')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.intro, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          <Shield size={18} color={theme.primary} strokeWidth={1.75} />
          <Text style={[styles.introText, { color: theme.textSecond }]}>
            {tr('auto.seirsId.showThisCodeWhenCollecting', 'Show this code when collecting a package from a partner store, or at the door if you don\'t have a physical ID. It is your SEIRS Verified ID.')}
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

          <Text style={[styles.nameLabel, { color: theme.textSecond }]}>{tr('auto.seirsId.registeredName', 'REGISTERED NAME')}</Text>
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
          <Text style={[styles.howTitle, { color: theme.text }]}>{tx('auto.seirsId.howHandoffVerificationWorks', 'How handoff verification works')}</Text>
          {[
            { step: '1', text: tr('auto.seirsId.partnerStaffOrYourDriver', 'Partner staff (or your driver) scans this QR, or types the SEIRS ID shown above.') },
            { step: '2', text: tr('auto.seirsId.theySeeYourRegisteredName', 'They see your registered name on their screen.') },
            { step: '3', text: tr('auto.seirsId.sayYourFullNameOut', 'Say your full name out loud: they type it to confirm the match.') },
            { step: '4', text: tr('auto.seirsId.theHandoffIsLoggedIn', 'The handoff is logged in your delivery audit trail.') },
          ].map(s => (
            <View key={s.step} style={styles.howRow}>
              <View style={[styles.howStep, { backgroundColor: theme.primary }]}>
                <Text style={styles.howStepText}>{s.step}</Text>
              </View>
              <Text style={[styles.howText, { color: theme.textSecond }]}>{s.text}</Text>
            </View>
          ))}
        </View>

        {/* Recipient handoff surface (audit 2026-08-10): the full
            collect-a-package identity screen existed but nothing
            navigated to it. SEIRS ID is the identity home, so the
            entry lives here. */}
        <Pressable
          style={[styles.receiveRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.push('/(customer)/recipient-id' as any)}
        >
          <View style={[styles.receiveIcon, { backgroundColor: theme.primary + '15' }]}>
            <Package size={18} color={theme.primary} strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.receiveTitle, { color: theme.text }]}>{tx('auto.seirsId.receivingAPackage', 'Receiving a package?')}</Text>
            <Text style={[styles.receiveSub, { color: theme.textSecond }]}>
              {tr('auto.seirsId.openYourCollectionPassId', 'Open your collection pass: ID + email code, or SEIRS ID + typed name.')}
            </Text>
          </View>
          <ChevronRight size={18} color={theme.textThird} />
        </Pressable>

        <Pressable
          style={[styles.alert, { backgroundColor: '#FEF9C3', borderColor: '#FDE68A' }]}
          onPress={() => alertDialog(
            'Keep this code safe',
            'Anyone with your SEIRS ID plus your full name could collect a package in your name. Treat it like a debit-card PIN: only show it at the moment of pickup.',
          )}
        >
          <View style={styles.alertRow}>
            <AlertTriangle size={16} color="#92400E" strokeWidth={1.75} />
            <Text style={styles.alertText}>{tx('auto.seirsId.keepThisCodePrivate', 'Keep this code private')}</Text>
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

  receiveRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  receiveIcon:  { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  receiveTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  receiveSub:   { fontSize: FontSize.xs, lineHeight: 17, marginTop: 1 },

  alert:    { padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center' },
  alertRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  alertText:{ color: '#92400E', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
});
