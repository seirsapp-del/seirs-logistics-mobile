import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Copy, Shield, CheckCircle, Mail, Package, Clock,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { deliveriesApi, dropoffApi, identityApi } from '@/services/api';

// Spec V8 Â§1.17 â€” recipient-side handoff identity surface. Used when the
// customer is collecting a package (door delivery from driver, or pickup
// from a partner store). Two methods supported per spec â€” the recipient
// can either show their physical ID + email OTP, or their SEIRS ID +
// typed-name signature. This screen presents both.

interface IncomingItem {
  kind:    'delivery' | 'dropoff';
  id:      string;
  label:   string;
  status:  string;
  source:  string; // store or driver name
  ref:     string;
}

export default function RecipientIdScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { user } = useAuth();
  const { t }   = useTranslation();

  const [copied,  setCopied]  = useState(false);
  const [items,   setItems]   = useState<IncomingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState<string | null>(null);

  const seirsId = user?.accountId ?? '';
  const name    = user?.name ?? 'Customer';

  useEffect(() => {
    (async () => {
      setLoading(true);
      const merged: IncomingItem[] = [];

      // Active deliveries where this user is the customer (= recipient for
      // door delivery flow). Filter to ones not yet delivered/cancelled.
      try {
        const res = await deliveriesApi.myDeliveries(1, 20);
        const arr = res?.items ?? [];
        for (const d of arr) {
          if (['assigned', 'picked_up', 'in_transit'].includes(d.status)) {
            merged.push({
              kind:   'delivery',
              id:     d.id,
              label:  d.packageDescription ?? 'Package',
              status: d.status,
              source: d.driver?.user?.name ?? 'Driver',
              ref:    d.trackingCode,
            });
          }
        }
      } catch { /* non-fatal */ }

      // Active store drop-offs where this user is the recipient (collection)
      try {
        const list = await dropoffApi.myDropoffs();
        for (const d of list) {
          if (['at_dropoff_store', 'awaiting_collection'].includes(d.status)) {
            merged.push({
              kind:   'dropoff',
              id:     d.id,
              label:  d.packageDescription ?? 'Package',
              status: d.status,
              source: 'Partner store',
              ref:    d.dropCode,
            });
          }
        }
      } catch { /* non-fatal */ }

      setItems(merged);
      setLoading(false);
    })();
  }, []);

  const handleCopy = async () => {
    if (!seirsId) return;
    await Clipboard.setStringAsync(seirsId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const requestOtp = async (deliveryId: string) => {
    if (!user?.id) return;
    setIssuing(deliveryId);
    try {
      const res = await identityApi.issueHandoffOtp(deliveryId, user.id);
      Alert.alert(
        'Code sent',
        `A 6-digit verification code has been emailed to you. It expires in ${res.expiresInMinutes} minutes. Check your inbox and read it aloud to the staff or driver at handoff.`,
      );
    } catch (e: any) {
      Alert.alert('Could not send code', e?.message ?? 'Try again in a moment.');
    } finally {
      setIssuing(null);
    }
  };

  if (!seirsId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl }}>
        <Text style={{ color: theme.text, fontSize: FontSize.base, textAlign: 'center' }}>
          Your SEIRS Verified ID is being provisioned. Try again shortly.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t('recipientId.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        <View style={[styles.intro, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          <Shield size={18} color={theme.primary} strokeWidth={1.75} />
          <Text style={[styles.introText, { color: theme.textSecond }]}>
            Show this ID at any handoff so the driver or partner staff can verify it&apos;s really you.
          </Text>
        </View>

        {/* QR card */}
        <View style={[styles.qrCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <View style={styles.qrWrap}>
            <QRCode
              value={seirsId}
              size={180}
              color={theme.text as string}
              backgroundColor={theme.surface as string}
            />
          </View>

          <Text style={[styles.nameLabel, { color: theme.textSecond }]}>{t('recipientId.registeredName')}</Text>
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

        {/* Active items needing OTP */}
        <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>READY FOR COLLECTION</Text>
        {loading ? (
          <Text style={[styles.helperCenter, { color: theme.textThird }]}>Loadingâ€¦</Text>
        ) : items.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Package size={28} color={theme.textThird} strokeWidth={1.5} />
            <Text style={[styles.emptyText, { color: theme.textSecond }]}>
              No incoming packages. When something is on its way to you, request a verification code from here.
            </Text>
          </View>
        ) : (
          items.map(it => (
            <View key={it.id} style={[styles.itemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.itemTopRow}>
                <View style={[styles.itemIcon, { backgroundColor: theme.primary + '15' }]}>
                  <Package size={18} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemLabel, { color: theme.text }]}>{it.label}</Text>
                  <Text style={[styles.itemSub, { color: theme.textSecond }]}>From {it.source}</Text>
                  <Text style={[styles.itemRef, { color: theme.textThird }]}>{it.ref}</Text>
                </View>
              </View>

              <Pressable
                onPress={() => requestOtp(it.id)}
                disabled={issuing === it.id}
                style={[styles.otpBtn, { backgroundColor: theme.primary + '15', borderColor: theme.primary + '40' }]}
              >
                <Mail size={14} color={theme.primary} />
                <Text style={[styles.otpBtnText, { color: theme.primary }]}>
                  {issuing === it.id ? 'Sendingâ€¦' : 'Email me a verification code'}
                </Text>
              </Pressable>
            </View>
          ))
        )}

        {/* How it works */}
        <View style={[styles.howCard, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: Spacing.md }]}>
          <Text style={[styles.howTitle, { color: theme.text }]}>Two ways to verify</Text>

          <View style={styles.howSection}>
            <Text style={[styles.howMethod, { color: theme.primary }]}>1. Physical ID + Email Code</Text>
            <Text style={[styles.howText, { color: theme.textSecond }]}>
              Show staff your National ID, driver&apos;s licence, voter card, NIN slip, or passport â€” plus the 6-digit code we email when you tap above.
            </Text>
          </View>

          <View style={styles.howSection}>
            <Text style={[styles.howMethod, { color: theme.primary }]}>2. SEIRS ID + Spoken Name</Text>
            <Text style={[styles.howText, { color: theme.textSecond }]}>
              Show staff your QR code above, then say your full name. They&apos;ll see your registered name and type what you say to confirm a match.
            </Text>
          </View>
        </View>
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

  qrCard:    { borderRadius: Radius.xxl, borderWidth: 1, padding: Spacing.lg, alignItems: 'center', gap: Spacing.md },
  qrWrap:    { padding: Spacing.md, borderRadius: Radius.lg },
  nameLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, letterSpacing: 0.8, marginTop: Spacing.sm },
  name:      { fontSize: FontSize.lg, fontWeight: FontWeight.bold },

  codeRow:    { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, paddingLeft: Spacing.md, overflow: 'hidden', alignSelf: 'stretch' },
  codeText:   { flex: 1, fontSize: FontSize.lg, fontWeight: FontWeight.bold, letterSpacing: 2 },
  copyBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: 12 },
  copyBtnText:{ color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.8, marginTop: Spacing.sm },
  helperCenter: { fontSize: FontSize.sm, textAlign: 'center', paddingVertical: Spacing.md },

  empty:     { alignItems: 'center', gap: Spacing.sm, padding: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1 },
  emptyText: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 19, paddingHorizontal: Spacing.sm },

  itemCard:  { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  itemTopRow:{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  itemIcon:  { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  itemSub:   { fontSize: FontSize.xs, marginTop: 2 },
  itemRef:   { fontSize: FontSize.xs, fontFamily: 'monospace', marginTop: 2 },

  otpBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: Radius.lg, borderWidth: 1 },
  otpBtnText:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  howCard:   { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  howTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  howSection:{ gap: 4 },
  howMethod: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  howText:   { fontSize: FontSize.sm, lineHeight: 19 },
});
