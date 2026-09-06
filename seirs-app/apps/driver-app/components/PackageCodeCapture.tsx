/**
 * The parcel-code control: QR preview plus a permanent "type it instead"
 * card, as one reusable block.
 *
 * WHY this is a component and not a second copy inside the store-handoff
 * screen: the manual-entry card is not decoration, it is the fix for a
 * dead end the founder hit live on 2026-08-24. Typing the code used to be
 * reachable only when the camera module was absent, and the monorepo
 * hoists expo-camera so that guard could never fire anyway. A rider with
 * a cracked lens, a dark doorway, or a receiver on a cheap phone still
 * has to finish the hand-off. Duplicating the block would mean the next
 * screen re-earns that bug, so both scanning surfaces render this one.
 *
 * The verdict (matched / wrong parcel / what happens next) deliberately
 * stays with the caller: verifying a recipient at a door and receipting
 * a counter are different jobs with different consequences.
 */
import { useState } from 'react';
import {
  ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';

// Guarded camera require (live find 2026-08-11): a top-level
// `import from 'expo-camera'` crashes the ENTIRE app bundle with
// "Cannot find native module 'ExpoCamera'" on any installed build that
// predates the camera dependency, because expo-router eagerly evaluates
// every route file in dev.
//
// Keep the guard, but do NOT treat it as the test for whether scanning
// works. Hoisting means CameraView is non-null on a build with no native
// camera compiled in, so manual entry below is never gated on it.
let CameraView: any = null;
let useCameraPermissions: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cam = require('expo-camera');
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
} catch { /* camera not compiled into this build */ }

export type CodeSource = 'scan' | 'typed';

interface Props {
  /** The code this screen is expecting, shown over the preview as a reminder. */
  expected?: string;
  onCode: (code: string, source: CodeSource) => void;
  /** Stop reading barcodes: the caller already has its answer. */
  frozen?: boolean;
  /** Tints the viewfinder frame after a verdict. */
  frameState?: 'ok' | 'bad' | null;
  /** Copy for the manual card, so each screen can say why typing is fine here. */
  manualTitle?: string;
  manualBody?: string;
  submitLabel?: string;
  /** Line under the viewfinder. Pass null to drop it. */
  scanHint?: string | null;
}

export function PackageCodeCapture({
  expected = '',
  onCode,
  frozen = false,
  frameState = null,
  manualTitle = 'Type the code instead',
  manualBody = 'The receiver is often not the sender and may not have SEIRS installed. The code travels by WhatsApp and on paper, so ask them to read it out. It starts with SRS.',
  submitLabel = 'Verify code',
  scanHint = 'The sender can show the QR from their tracking screen.',
}: Props) {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];

  // Module presence never changes at runtime, so this conditional hook
  // takes the same branch on every render.
  const [permission, requestPermission] = useCameraPermissions
    ? useCameraPermissions()
    : [null as any, () => {}];

  const [manualCode, setManualCode] = useState('');

  /**
   * Camera state, kept separate from "can the rider finish the job".
   * cameraReady is only about the preview. Nothing here is blocked by it
   * being false, which is the whole point.
   */
  const permissionPending = !!useCameraPermissions && !permission;
  const cameraReady = !!CameraView && !!permission?.granted;

  /** Why the preview is not showing, in words a rider can act on. */
  const cameraBlockedReason = !CameraView
    ? 'Scanning is not available in this app build.'
    : permission && !permission.granted
      ? 'SEIRS needs camera access to scan the package QR.'
      : null;

  const submitManual = () => {
    const clean = manualCode.trim();
    if (!clean) return;
    Keyboard.dismiss();
    onCode(clean, 'typed');
  };

  return (
    <>
      <View style={[styles.scanBox, { borderColor: theme.border }]}>
        {cameraReady ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={frozen ? undefined : ({ data }: { data: string }) => onCode(data, 'scan')}
            />
            <View style={styles.frameWrap} pointerEvents="none">
              <View style={[
                styles.frame,
                frameState === 'ok'  && { borderColor: '#22C55E' },
                frameState === 'bad' && { borderColor: '#EF4444' },
              ]} />
            </View>
            {expected !== '' && frameState == null && (
              <View style={styles.expectWrap} pointerEvents="none">
                <Text style={styles.expectText}>Expecting {expected}</Text>
              </View>
            )}
          </>
        ) : permissionPending ? (
          <View style={styles.scanFallback}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : (
          <View style={styles.scanFallback}>
            <Ionicons name="camera-outline" size={40} color="rgba(255,255,255,0.55)" />
            <Text style={styles.scanFallbackText}>{cameraBlockedReason}</Text>
            {!!CameraView && permission && !permission.granted && (
              <Pressable
                style={[styles.permBtn, { backgroundColor: theme.primary }]}
                onPress={requestPermission}
              >
                <Text style={styles.permBtnText}>{tx('auto.PackageCodeCapture.allowCamera', 'Allow camera')}</Text>
              </Pressable>
            )}
            <Text style={styles.scanFallbackHint}>
              {tr('auto.packagecodecapture.youCanStillFinishThis', 'You can still finish this hand-off: type the code below.')}
            </Text>
          </View>
        )}
      </View>

      {scanHint !== null && (
        <Text style={[styles.scanHint, { color: theme.textThird }]}>{scanHint}</Text>
      )}

      {/* Manual entry. A first-class control, not a fallback. */}
      <View style={[styles.manualCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.manualHead}>
          <Ionicons name="keypad-outline" size={18} color={theme.primary} />
          <Text style={[styles.manualTitle, { color: theme.text }]}>{manualTitle}</Text>
        </View>
        <Text style={[styles.manualBody, { color: theme.textSecond }]}>{manualBody}</Text>
        <TextInput
          style={[styles.manualInput, {
            borderColor: theme.border,
            backgroundColor: theme.surfaceSecond,
            color: theme.text,
          }]}
          placeholder="SRS-XXXXXXXX"
          placeholderTextColor={theme.textThird}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          value={manualCode}
          onChangeText={setManualCode}
          onSubmitEditing={submitManual}
        />
        <Pressable
          style={({ pressed }) => [
            styles.verifyBtn,
            { backgroundColor: theme.primary, opacity: pressed || !manualCode.trim() ? 0.55 : 1 },
          ]}
          onPress={submitManual}
          disabled={!manualCode.trim()}
        >
          <Text style={styles.verifyBtnText}>{submitLabel}</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  /**
   * Fixed aspect rather than flex:1. The manual card has to be on screen
   * at the same time as the preview, and a preview that takes whatever is
   * left pushes it below the fold on a short phone.
   */
  scanBox: {
    width: '100%', aspectRatio: 1, borderRadius: Radius.xl,
    overflow: 'hidden', backgroundColor: '#000', borderWidth: 1,
  },
  scanFallback:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.lg },
  scanFallbackText: { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  scanFallbackHint: { color: 'rgba(255,255,255,0.6)', fontSize: FontSize.xs, textAlign: 'center', lineHeight: 17 },
  permBtn:          { paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.lg, marginTop: 4 },
  permBtnText:      { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold as any },

  frameWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  frame:     { width: 200, height: 200, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', borderRadius: 24 },
  // Overlay on a camera preview, so a translucent black pill is correct
  // in both themes: it sits on the video, never on a themed surface.
  expectWrap: { position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center' },
  expectText: {
    color: 'rgba(255,255,255,0.85)', fontSize: FontSize.sm,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, overflow: 'hidden',
  },

  scanHint: { fontSize: FontSize.xs, textAlign: 'center', marginTop: -4 },

  manualCard:  { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  manualHead:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  manualTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  manualBody:  { fontSize: FontSize.xs, lineHeight: 18 },
  manualInput: {
    borderWidth: 1.5, borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: FontSize.md, letterSpacing: 2, fontWeight: FontWeight.bold as any,
  },
  verifyBtn:     { height: 52, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  verifyBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
});
