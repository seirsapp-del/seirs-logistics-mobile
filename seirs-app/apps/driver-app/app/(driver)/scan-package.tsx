/**
 * Gap 5: QR scan at hand-off.
 *
 * The customer's app shows a QR of the delivery's tracking code
 * (public code, zero PII). The driver scans it here before confirming
 * delivery, proving the right package is meeting the right recipient.
 * Wrong-recipient hand-offs are one of the four failure modes SEIRS
 * engineers out of the flow.
 *
 * Route params: code (expected trackingCode), optional label.
 * On match: green confirmation, auto-pops back after 1.6s.
 * On mismatch: red banner + the scanner re-arms after a cooldown.
 *
 * The comparison is local to this screen; the scan itself is logged
 * server-side as a delivery_events SCAN row. The signed chain-of-custody
 * record is a separate step: signature.tsx at a door, store-handoff.tsx
 * at a partner counter.
 *
 * --- Rebuilt 2026-08-24, after the founder walked this live and it dead
 * ended ---
 *
 * Two faults, both fixed:
 *
 * 1. Typing the code was a hidden fallback reachable only when the camera
 *    module was absent. The code travels over WhatsApp and on paper, a QR
 *    does not, and the receiver is usually NOT the sender: on SRS-9CJ7LJP2
 *    the sender was in Berlin and the receiver was at a gate in Akobo. A
 *    rider with a cracked lens, a dark doorway or a receiver holding a
 *    cheap phone still has to complete the hand-off, so manual entry is
 *    now a permanent control sitting beside the scanner in every state.
 *
 * 2. The fallback guard could never fire: the monorepo HOISTS expo-camera
 *    to the root node_modules, so the require() always resolves and the
 *    catch never runs even when the native module is genuinely missing.
 *
 * Both live in PackageCodeCapture now (2026-08-25), so the partner-counter
 * hand-off inherits the fix instead of re-earning the bug.
 */
import { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Vibration, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { deliveriesApi } from '@/services/api';
import { PackageCodeCapture } from '@/components/PackageCodeCapture';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';

export default function ScanPackageScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const params = useLocalSearchParams<{ code?: string; label?: string; deliveryId?: string }>();
  const expected = (params.code ?? '').trim().toUpperCase();
  const deliveryId = params.deliveryId ?? '';

  const [result,   setResult]   = useState<'idle' | 'match' | 'mismatch'>('idle');
  const [lastSeen, setLastSeen] = useState('');
  const cooldown = useRef(false);

  const verify = (raw: string) => {
    if (cooldown.current || result === 'match') return;
    cooldown.current = true;

    const scanned = (raw ?? '').trim().toUpperCase();
    setLastSeen(scanned);

    // Audit copy: log the check server-side (delivery_events SCAN type)
    // regardless of outcome or of how the code arrived. A typed code is
    // the same evidence as a scanned one: the receiver still had to hold
    // a code the sender gave them. Fire-and-forget; the local verdict
    // below never waits on the network.
    if (deliveryId && scanned) {
      deliveriesApi.scanVerify(deliveryId, scanned).catch(() => {});
    }

    if (expected && scanned === expected) {
      Vibration.vibrate([0, 60, 60, 60]);
      setResult('match');
      // Auto-pop back to the active-delivery screen after the driver
      // has seen the confirmation.
      setTimeout(() => router.back(), 1600);
    } else {
      Vibration.vibrate(200);
      setResult('mismatch');
      setTimeout(() => {
        setResult('idle');
        cooldown.current = false;
      }, 1800);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      {/* Header. Themed rather than floating over the preview, because
          the preview is no longer the whole screen. */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{tx('auto.scanPackage.verifyThePackage', 'Verify the package')}</Text>
          <Text style={[styles.headerSub, { color: theme.textSecond }]}>
            {tr('auto.scanPackage.scanTheirQrOrType', 'Scan their QR, or type the code they were sent. Either one proves it.')}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PackageCodeCapture
          expected={expected}
          onCode={verify}
          frozen={result === 'match'}
          frameState={result === 'match' ? 'ok' : result === 'mismatch' ? 'bad' : null}
        />

        {/* Verdict. Same wording whichever way the code arrived. */}
        {result === 'match' && (
          <View style={[styles.verdict, { backgroundColor: '#16A34A' }]}>
            <Ionicons name="checkmark-circle" size={36} color="#fff" />
            <Text style={styles.verdictTitle}>{tx('auto.scanPackage.packageVerified', 'Package verified')}</Text>
            <Text style={styles.verdictSub}>
              {expected}{'\n'}{tr('auto.scanPackage.handItOverAndConfirm', 'Hand it over and confirm delivery.')}
            </Text>
          </View>
        )}
        {result === 'mismatch' && (
          <View style={[styles.verdict, { backgroundColor: '#DC2626' }]}>
            <Ionicons name="alert-circle" size={36} color="#fff" />
            <Text style={styles.verdictTitle}>{tx('auto.scanPackage.wrongPackage', 'Wrong package')}</Text>
            <Text style={styles.verdictSub}>
              Got {lastSeen || 'nothing'}{'\n'}Expected {expected}{tr('auto.scanPackage.doNotHandOver', '. Do not hand over.')}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1,
  },
  backBtn:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  headerSub:   { fontSize: FontSize.xs, lineHeight: 17, marginTop: 2 },

  body: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },

  verdict:      { borderRadius: Radius.xl, padding: Spacing.md, alignItems: 'center', gap: 6 },
  verdictTitle: { color: '#fff', fontSize: FontSize.lg, fontWeight: FontWeight.bold as any },
  verdictSub:   { color: 'rgba(255,255,255,0.9)', fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
});
