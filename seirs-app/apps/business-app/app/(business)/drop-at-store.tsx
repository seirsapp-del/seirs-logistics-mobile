/**
 * Business bulk drop-at-partner flow (gap 6, 2026-08-09).
 *
 * A business sender (market trader, online shop) schedules one or more
 * packages for drop-off at a nearby partner store instead of paying for
 * per-package door pickups. Each scheduled package gets its own
 * dropCode QR + 6-char backup code; the partner scans them one by one
 * at the counter (scan tab already live in partner mode).
 *
 * Flow: pick store (capacity-aware, full stores disabled) -> package
 * details + recipient -> receipt screen with QR + codes. "Add another"
 * loops back with the store kept so bulk sessions are fast.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  ActivityIndicator, Share, StatusBar, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { Icon } from '@/components/Icon';
import { useSeirsDialog } from '@/components/SeirsDialog';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { dropoffApi } from '@/services/api';

interface StoreOption {
  id: string; storeName: string; storeAddress: string;
  currentLoad: number; maxCapacity: number; percent: number;
  bucket: 'plenty' | 'limited' | 'full'; full: boolean;
}

interface Receipt {
  id: string; dropCode: string; backupCode: string;
}

const BUCKET_META: Record<string, { label: string; color: string }> = {
  plenty:  { label: 'Space available', color: '#16A34A' },
  limited: { label: 'Limited space',   color: '#D97706' },
  full:    { label: 'Full',            color: '#DC2626' },
};

export default function BusinessDropAtStoreScreen() {
  // Themed dialogs, not the Android system AlertDialog (work order
  // item 4, 2026-08-24). Same signature as Alert.alert, so these are
  // straight renames, but it renders every button instead of
  // silently discarding the fourth.
  const dialog = useSeirsDialog();
  const router = useRouter();
  const { isDark } = useTheme();
  const theme = Colors[isDark ? 'dark' : 'light'];

  const [step,  setStep]  = useState<'store' | 'details' | 'receipt'>('store');
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [store, setStore] = useState<StoreOption | null>(null);

  const [recipientName,    setRecipientName]    = useState('');
  const [recipientPhone,   setRecipientPhone]   = useState('');
  const [recipientEmail,   setRecipientEmail]   = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [weightKg,         setWeightKg]         = useState('');
  const [description,      setDescription]      = useState('');
  const [submitting,       setSubmitting]       = useState(false);
  const [receipt,          setReceipt]          = useState<Receipt | null>(null);
  const [sessionCount,     setSessionCount]     = useState(0);

  const loadStores = useCallback(async () => {
    setLoadingStores(true);
    try {
      const list = await dropoffApi.listCapacityNearby(undefined, undefined, 25);
      setStores(list ?? []);
    } catch {
      setStores([]);
    } finally {
      setLoadingStores(false);
    }
  }, []);
  useEffect(() => { loadStores(); }, [loadStores]);

  const detailsValid =
    recipientName.trim().length > 1 &&
    recipientPhone.trim().length > 5 &&
    recipientAddress.trim().length > 3 &&
    parseFloat(weightKg) > 0;

  const submit = async () => {
    if (!store || !detailsValid || submitting) return;
    setSubmitting(true);
    try {
      const res = await dropoffApi.schedule({
        pickupStoreId:      store.id,
        mode:               'store_to_door',
        recipientAddress:   recipientAddress.trim(),
        recipientName:      recipientName.trim(),
        recipientPhone:     recipientPhone.trim(),
        recipientEmail:     recipientEmail.trim() || undefined,
        weightKg:           parseFloat(weightKg),
        packageDescription: description.trim() || undefined,
      });
      setReceipt({ id: res.id, dropCode: res.dropCode, backupCode: res.backupCode });
      setSessionCount(c => c + 1);
      setStep('receipt');
    } catch (e: any) {
      dialog.alert('Could not schedule drop-off', e?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const addAnother = () => {
    // Keep the store; clear per-package fields for fast bulk sessions.
    setRecipientName('');
    setRecipientPhone('');
    setRecipientEmail('');
    setRecipientAddress('');
    setWeightKg('');
    setDescription('');
    setReceipt(null);
    setStep('details');
  };

  const shareReceipt = async () => {
    if (!receipt || !store) return;
    try {
      await Share.share({
        message:
          `SEIRS drop-off scheduled at ${store.storeName}.\n` +
          `Drop code: ${receipt.dropCode} (backup: ${receipt.backupCode}).\n` +
          `Show the QR or read out the code at the counter.`,
      });
    } catch { /* user dismissed */ }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable
          style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]}
          onPress={() => (step === 'details' ? setStep('store') : router.back())}
        >
          <Icon name="ArrowLeft" size={20} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {step === 'store'   ? 'Drop at a partner store'
              : step === 'details' ? 'Package details'
              : 'Drop-off scheduled'}
          </Text>
          {sessionCount > 0 && step !== 'receipt' && (
            <Text style={[styles.headerSub, { color: theme.textSecond }]}>
              {sessionCount} scheduled this session
            </Text>
          )}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {step === 'store' && (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
            <Text style={[styles.intro, { color: theme.textSecond }]}>
              Drop multiple packages at one partner counter instead of booking
              door pickups for each. Every package gets its own QR the store
              scans at the counter.
            </Text>
            {loadingStores ? (
              <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
            ) : stores.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Icon name="Store" size={44} color={theme.textSecond} />
                <Text style={[styles.emptyText, { color: theme.textSecond }]}>
                  No partner stores available right now.
                </Text>
              </View>
            ) : stores.map(s => {
              const bucket = BUCKET_META[s.bucket] ?? BUCKET_META.plenty;
              return (
                <Pressable
                  key={s.id}
                  disabled={s.full}
                  onPress={() => { setStore(s); setStep('details'); }}
                  style={[
                    styles.storeCard,
                    { backgroundColor: theme.surface, borderColor: theme.border, opacity: s.full ? 0.5 : 1 },
                  ]}
                >
                  <View style={[styles.storeIcon, { backgroundColor: `${theme.primary}15` }]}>
                    <Icon name="Store" size={20} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.storeName, { color: theme.text }]}>{s.storeName}</Text>
                    <Text style={[styles.storeAddr, { color: theme.textSecond }]} numberOfLines={1}>
                      {s.storeAddress}
                    </Text>
                    <Text style={[styles.bucket, { color: bucket.color }]}>{bucket.label}</Text>
                  </View>
                  {!s.full && <Icon name="ChevronRight" size={18} color={theme.textSecond} />}
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {step === 'details' && store && (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={[styles.storeRecap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Icon name="Store" size={16} color={theme.primary} />
              <Text style={[styles.storeRecapText, { color: theme.text }]} numberOfLines={1}>
                {store.storeName}
              </Text>
              <Pressable onPress={() => setStep('store')} hitSlop={8}>
                <Text style={[styles.changeLink, { color: theme.primary }]}>Change</Text>
              </Pressable>
            </View>

            <Field label="Recipient name" value={recipientName} onChange={setRecipientName}
              placeholder="Adaobi Nwosu" theme={theme} />
            <Field label="Recipient phone" value={recipientPhone} onChange={setRecipientPhone}
              placeholder="08012345678" keyboardType="phone-pad" theme={theme} />
            <Field label="Recipient email (optional)" value={recipientEmail} onChange={setRecipientEmail}
              placeholder="For collection OTP if they have no SEIRS account" keyboardType="email-address" theme={theme} />
            <Field label="Delivery address" value={recipientAddress} onChange={setRecipientAddress}
              placeholder="Street, area, city" theme={theme} />
            <Field label="Weight (kg)" value={weightKg} onChange={setWeightKg}
              placeholder="e.g. 2.5" keyboardType="decimal-pad" theme={theme} />
            <Field label="Package description (optional)" value={description} onChange={setDescription}
              placeholder="e.g. Ankara fabrics x3" theme={theme} />

            <Pressable
              onPress={submit}
              disabled={!detailsValid || submitting}
              style={[styles.submitBtn, { backgroundColor: detailsValid && !submitting ? theme.primary : theme.border }]}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitText}>Schedule drop-off</Text>}
            </Pressable>
          </ScrollView>
        )}

        {step === 'receipt' && receipt && store && (
          <ScrollView contentContainerStyle={{ padding: 16, alignItems: 'center', gap: 14 }}>
            <View style={[styles.receiptCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Icon name="CheckCircle2" size={36} color="#16A34A" />
              <Text style={[styles.receiptTitle, { color: theme.text }]}>Show this at the counter</Text>
              <View style={styles.qrBox}>
                <QRCode value={receipt.dropCode} size={190} />
              </View>
              <Text style={[styles.codeLabel, { color: theme.textSecond }]}>DROP CODE</Text>
              <Text style={[styles.codeBig, { color: theme.primary }]}>{receipt.dropCode}</Text>
              <Text style={[styles.codeLabel, { color: theme.textSecond }]}>BACKUP CODE</Text>
              <Text style={[styles.codeMid, { color: theme.text }]}>{receipt.backupCode}</Text>
              <Text style={[styles.receiptHint, { color: theme.textSecond }]}>
                {store.storeName} · staff scans the QR when you hand the package over.
              </Text>
            </View>

            <View style={styles.receiptActions}>
              <Pressable onPress={shareReceipt} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
                <Icon name="Share2" size={15} color={theme.text} />
                <Text style={[styles.secondaryText, { color: theme.text }]}>Share</Text>
              </Pressable>
              <Pressable onPress={addAnother} style={[styles.primaryBtn, { backgroundColor: theme.primary }]}>
                <Icon name="Plus" size={16} color="#fff" />
                <Text style={styles.primaryText}>Add another package</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={[styles.doneLink, { color: theme.textSecond }]}>Done for now</Text>
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType, theme }: any) {
  return (
    <View>
      <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecond}
        keyboardType={keyboardType}
        style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerSub:   { fontSize: 12, marginTop: 2 },

  intro:     { fontSize: 14, lineHeight: 19 },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 14 },

  storeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  storeIcon: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  storeName: { fontSize: 15, fontWeight: '700' },
  storeAddr: { fontSize: 13, marginTop: 2 },
  bucket:    { fontSize: 12, fontWeight: '700', marginTop: 4 },

  storeRecap:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  storeRecapText: { flex: 1, fontSize: 14, fontWeight: '600' },
  changeLink:     { fontSize: 13, fontWeight: '700' },

  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  input:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15 },

  submitBtn:  { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 6 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  receiptCard: { width: '100%', alignItems: 'center', gap: 8, padding: 22, borderRadius: 16, borderWidth: 1 },
  receiptTitle:{ fontSize: 16, fontWeight: '700' },
  qrBox:       { padding: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', marginVertical: 6 },
  codeLabel:   { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 4 },
  codeBig:     { fontSize: 20, fontWeight: '800', letterSpacing: 1.5 },
  codeMid:     { fontSize: 16, fontWeight: '700', letterSpacing: 2 },
  receiptHint: { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 17 },

  receiptActions: { flexDirection: 'row', gap: 10, width: '100%' },
  secondaryBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1 },
  secondaryText:  { fontSize: 14, fontWeight: '600' },
  primaryBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10 },
  primaryText:    { color: '#fff', fontSize: 14, fontWeight: '700' },
  doneLink:       { fontSize: 14, textDecorationLine: 'underline', marginTop: 4 },
});
