import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { driversApi } from '@/services/api';
import { alertDialog } from '@/components/SeirsDialog';
import {
  VehicleOwnershipForm, ownershipProblems, EMPTY_OWNERSHIP, OwnershipValue,
} from '@/components/VehicleOwnershipForm';

/**
 * Vehicle ownership declaration, part of KYC.
 *
 * 2026-08-25. KYC had a "Vehicle Ownership Proof" upload and no question
 * attached to it, so a rider on a borrowed keke had nowhere to say so.
 * This screen is that question.
 *
 * Two modes, and the difference matters:
 *   not yet approved  -> the whole record is in front of an admin anyway,
 *                        so the answer saves straight away.
 *   already approved  -> frozen. Compliance approved the vehicle on the
 *                        strength of this claim, so changing it later goes
 *                        through the vehicle-change review like everything
 *                        else about the vehicle.
 */
export default function VehicleOwnershipScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [locked,  setLocked]  = useState(false);
  const [riderName, setRiderName] = useState<string | null>(null);
  const [value,   setValue]   = useState<OwnershipValue>(EMPTY_OWNERSHIP);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rec, me] = await Promise.all([
          driversApi.getVehicle(),
          driversApi.me().catch(() => null),
        ]);
        if (cancelled) return;
        setRiderName(me?.user?.name ?? null);
        setLocked(rec.status === 'approved');
        const o = rec.ownership;
        if (o?.declared) {
          setValue({
            ownership:          o.ownership ?? 'self',
            ownerName:          o.ownerName ?? '',
            ownerPhone:         o.ownerPhone ?? '',
            ownerRelationship:  o.ownerRelationship ?? '',
            ownerConsentUrl:    o.ownerConsentUrl ?? null,
            ownerIdUrl:         o.ownerIdUrl ?? null,
            ownerSignatureName: o.ownerSignatureName ?? '',
          });
        }
      } catch {
        // Offline: leave the defaults so the rider can still fill it in
        // and hit save when they have signal.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const problems = ownershipProblems(value, riderName);
  const canSave  = !locked && problems.length === 0;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await driversApi.declareVehicleOwnership({
        ownership:          value.ownership,
        ownerName:          value.ownerName || undefined,
        ownerPhone:         value.ownerPhone || undefined,
        ownerRelationship:  (value.ownerRelationship || undefined) as any,
        ownerConsentUrl:    value.ownerConsentUrl ?? undefined,
        ownerIdUrl:         value.ownerIdUrl ?? undefined,
        ownerSignatureName: value.ownerSignatureName || undefined,
      });
      setSavedOk(true);
      alertDialog(
        'Saved',
        value.ownership === 'self'
          ? 'Noted: the vehicle is yours.'
          : 'Noted. Our team may call the owner to confirm before your application is approved.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      if (msg.includes('VEHICLE_OWNERSHIP_LOCKED')) {
        setLocked(true);
        alertDialog(
          'Already approved',
          'Your vehicle is approved, so who owns it can only change through a vehicle change review.',
        );
        return;
      }
      alertDialog('Could not save', msg || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Vehicle Ownership</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {locked && (
              <View style={[styles.lockCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
                <Ionicons name="lock-closed-outline" size={20} color={theme.textThird} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.lockTitle, { color: theme.text }]}>This is on file</Text>
                  <Text style={[styles.lockText, { color: theme.textSecond }]}>
                    Your vehicle is approved, so this cannot be edited here. If you
                    changed vehicle, or the owner changed, submit a vehicle change
                    and our team will review it.
                  </Text>
                  <Pressable
                    onPress={() => router.push('/(driver)/vehicle')}
                    style={[styles.lockBtn, { backgroundColor: theme.primary }]}
                  >
                    <Text style={styles.lockBtnText}>Submit a vehicle change</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <VehicleOwnershipForm
              value={value}
              onChange={setValue}
              riderName={riderName}
              locked={locked}
            />

            <View style={{ height: 100 }} />
          </ScrollView>

          {!locked && (
            <View style={[styles.ctaBar, {
              backgroundColor: theme.navBackground,
              borderTopColor: theme.border,
              paddingBottom: Spacing.md + insets.bottom,
            }]}>
              <Pressable
                style={[styles.saveBtn, { backgroundColor: canSave ? theme.primary : theme.surfaceSecond }]}
                onPress={save}
                disabled={!canSave || saving}
              >
                <Text style={[styles.saveBtnText, { color: canSave ? '#fff' : theme.textThird }]}>
                  {saving ? 'Saving...' : savedOk ? 'Saved' : 'Save declaration'}
                </Text>
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  content: { padding: Spacing.md, gap: Spacing.md },

  lockCard:   { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  lockTitle:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold as any },
  lockText:   { fontSize: FontSize.xs, lineHeight: 18, marginTop: 2 },
  lockBtn:    { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 14, paddingVertical: 9, borderRadius: Radius.lg },
  lockBtnText:{ color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },

  ctaBar:      { padding: Spacing.md, borderTopWidth: 1 },
  saveBtn:     { height: 54, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
});
