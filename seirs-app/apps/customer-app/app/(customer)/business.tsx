/**
 * Send Multiple — single pickup, up to 5 recipients in one go.
 *
 * Designed for retail customers with a clustered need (moving day,
 * holiday shipping, sending gifts to several friends at once).
 *
 * Not the same as the Business app's CSV bulk upload — that's for
 * sustained N-per-day operators. This is a one-off "I have 3 things
 * to send right now" surface.
 *
 * Architecture: spawns N independent deliveries in parallel rather
 * than one multi-stop trip, so each recipient gets their own driver
 * + tracking code. Faster for the last recipient, costs N delivery
 * fees instead of one shared fee — which retail customers prefer
 * for irreplaceable items.
 */
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import InlineAddressPicker from '@/components/InlineAddressPicker';
import { deliveriesApi } from '@/services/api';

const MAX_RECIPIENTS = 5;

interface Recipient {
  id:          string;            // local React key
  name:        string;
  address:     string;
  lat:         number | null;
  lng:         number | null;
  description: string;
}

function makeRecipient(): Recipient {
  return {
    id:          `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name:        '',
    address:     '',
    lat:         null,
    lng:         null,
    description: '',
  };
}

export default function SendMultipleScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { t }  = useTranslation();

  // Single pickup shared by all recipients
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupLat,     setPickupLat]     = useState<number | null>(null);
  const [pickupLng,     setPickupLng]     = useState<number | null>(null);

  const [recipients, setRecipients] = useState<Recipient[]>([makeRecipient(), makeRecipient()]);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState<{ tracking: string[]; failed: number } | null>(null);

  const update = (id: string, patch: Partial<Recipient>) =>
    setRecipients(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const remove = (id: string) => {
    if (recipients.length <= 1) return;
    setRecipients(prev => prev.filter(r => r.id !== id));
  };

  const add = () => {
    if (recipients.length >= MAX_RECIPIENTS) return;
    setRecipients(prev => [...prev, makeRecipient()]);
  };

  const canSubmit =
    pickupLat != null && pickupLng != null && pickupAddress.length > 0 &&
    recipients.every(r => r.name && r.address && r.lat != null && r.lng != null && r.description);

  const submit = async () => {
    if (!canSubmit) {
      Alert.alert(t('common.error'), t('sendMultiple.pickupHint'));
      return;
    }
    setSubmitting(true);
    setResult(null);
    // Fire each delivery in parallel; the matching service handles them
    // independently so multi-driver dispatch is implicit.
    const results = await Promise.allSettled(
      recipients.map(r =>
        deliveriesApi.create({
          pickupAddress,
          pickupLat:        pickupLat!,
          pickupLng:        pickupLng!,
          dropoffAddress:   r.address,
          dropoffLat:       r.lat!,
          dropoffLng:       r.lng!,
          packageDescription: `${r.description} (for ${r.name})`,
          packageSize:      'medium',
          isFragile:        false,
          urgency:          'standard',
        }),
      ),
    );
    const tracking = results
      .filter(r => r.status === 'fulfilled')
      .map((r: any) => r.value?.trackingCode ?? r.value?.delivery?.trackingCode ?? '—');
    const failed = results.filter(r => r.status === 'rejected').length;
    setResult({ tracking, failed });
    setSubmitting(false);
  };

  if (result) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.successWrap}>
          <View style={[styles.successIcon, { backgroundColor: '#F0FDF4' }]}>
            <Ionicons name="checkmark-circle" size={56} color="#16A34A" />
          </View>
          <Text style={[styles.successTitle, { color: theme.text }]}>
            {t('sendMultiple.success')}
          </Text>
          {result.failed > 0 && (
            <Text style={[styles.successFail, { color: '#DC2626' }]}>
              {t('sendMultiple.successMsg', { count: result.tracking.length })}
            </Text>
          )}
          <View style={[styles.codesCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.codesLabel, { color: theme.textSecond }]}>{t('home.recentTrips')}</Text>
            {result.tracking.map(code => (
              <Text key={code} style={[styles.codeRow, { color: theme.text }]}>{code}</Text>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg }}>
            <Pressable
              style={[styles.secondaryBtn, { borderColor: theme.border }]}
              onPress={() => { setResult(null); setRecipients([makeRecipient(), makeRecipient()]); }}
            >
              <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t('sendMultiple.bookAll')}</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
              onPress={() => router.replace('/(customer)/(tabs)' as any)}
            >
              <Text style={styles.primaryBtnText}>{t('tabs.home')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>

        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>{t('sendMultiple.title')}</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >

          {/* Hero */}
          <View style={[styles.heroCard, { backgroundColor: isDark ? '#001020' : '#EFF6FF', borderColor: theme.primary + '30' }]}>
            <Ionicons name="git-branch-outline" size={24} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroTitle, { color: theme.text }]}>{t('sendMultiple.subtitle')}</Text>
              <Text style={[styles.heroBody, { color: theme.textSecond }]}>
                {t('sendMultiple.pickupHint')}
              </Text>
            </View>
          </View>

          {/* Pickup */}
          <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>{t('sendMultiple.pickup')}</Text>
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
            <InlineAddressPicker
              label={t('sendMultiple.pickup')}
              dotColor="#22C55E"
              value={pickupAddress}
              onSelect={(p) => { setPickupAddress(p.address); setPickupLat(p.lat); setPickupLng(p.lng); }}
              onClear={() => { setPickupAddress(''); setPickupLat(null); setPickupLng(null); }}
            />
          </View>

          {/* Recipients */}
          <View style={styles.recipientsHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>
              {t('sendMultiple.recipients')} ({recipients.length}/{MAX_RECIPIENTS})
            </Text>
            {recipients.length < MAX_RECIPIENTS && (
              <Pressable onPress={add} style={styles.addBtn}>
                <Ionicons name="add" size={16} color={theme.primary} />
                <Text style={[styles.addBtnText, { color: theme.primary }]}>{t('sendMultiple.addRecipient')}</Text>
              </Pressable>
            )}
          </View>

          {recipients.map((r, idx) => (
            <View
              key={r.id}
              style={[styles.recipientCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
            >
              <View style={styles.recipientHeader}>
                <Text style={[styles.recipientNum, { color: theme.text }]}>{t('sendMultiple.recipientName')} {idx + 1}</Text>
                {recipients.length > 1 && (
                  <Pressable onPress={() => remove(r.id)} hitSlop={10}>
                    <Ionicons name="close-circle" size={20} color={theme.textThird} />
                  </Pressable>
                )}
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>{t('sendMultiple.recipientName')}</Text>
                <TextInput
                  value={r.name}
                  onChangeText={(v) => update(r.id, { name: v })}
                  placeholder="e.g. Aunt Funke"
                  placeholderTextColor={theme.textThird}
                  style={[styles.fieldInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
                />
              </View>

              <InlineAddressPicker
                label={t('sendMultiple.recipientAddress')}
                dotColor="#EF4444"
                value={r.address}
                onSelect={(p) => update(r.id, { address: p.address, lat: p.lat, lng: p.lng })}
                onClear={() => update(r.id, { address: '', lat: null, lng: null })}
              />

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>{t('sendMultiple.packageDesc')}</Text>
                <TextInput
                  value={r.description}
                  onChangeText={(v) => update(r.id, { description: v })}
                  placeholder="e.g. Birthday gift, documents, food parcel"
                  placeholderTextColor={theme.textThird}
                  style={[styles.fieldInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
                />
              </View>
            </View>
          ))}

          {/* Submit */}
          <Pressable
            style={[styles.submitBtn, { backgroundColor: canSubmit ? theme.primary : theme.surfaceSecond }, submitting && { opacity: 0.6 }]}
            disabled={!canSubmit || submitting}
            onPress={submit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.submitBtnText, { color: canSubmit ? '#fff' : theme.textThird }]}>
                {t('sendMultiple.bookAll')}
              </Text>
            )}
          </Pressable>

          <Text style={[styles.note, { color: theme.textThird }]}>
            {t('sendMultiple.pickupHint')}
          </Text>

        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  heroCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  heroTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: 4 },
  heroBody:  { fontSize: FontSize.sm, lineHeight: 20 },

  sectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, paddingLeft: Spacing.xs },

  card: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },

  recipientsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn:           { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  addBtnText:       { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  recipientCard:   { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  recipientHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recipientNum:    { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  field:       { gap: 6 },
  fieldLabel:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  fieldInput:  { height: 46, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: Spacing.md, fontSize: FontSize.base },

  submitBtn:     { height: 54, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center', marginTop: Spacing.sm },
  submitBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  note: { fontSize: FontSize.xs, lineHeight: 18, textAlign: 'center', paddingHorizontal: Spacing.md },

  // Success state
  successWrap:  { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, gap: Spacing.md },
  successIcon:  { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md },
  successTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, textAlign: 'center' },
  successFail:  { fontSize: FontSize.sm, textAlign: 'center', marginTop: -4 },
  codesCard:    { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: 6, minWidth: 240, alignItems: 'center', marginTop: Spacing.sm },
  codesLabel:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  codeRow:      { fontSize: FontSize.base, fontWeight: FontWeight.bold, letterSpacing: 0.5, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  primaryBtn:     { flex: 1, height: 50, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  secondaryBtn:   { flex: 1, height: 50, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5 },
  secondaryBtnText:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
});
