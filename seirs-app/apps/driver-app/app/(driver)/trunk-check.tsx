import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Camera, Check, AlertTriangle } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { uploadApi } from '@/services/api';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';

// Spec V8 §2.16: anti-theft trunk inventory check. Whenever a passenger
// or recipient exits the vehicle while there are still other packages
// in the trunk (multi-cargo pool ride), the driver MUST take a quick
// photo confirming everything else is still present. NOTE: the photo is
// not yet attached to the delivery record, see the comment in submit().
//
// Triggered from the active delivery screen mid-trip when:
//   - one of multiple legs completes (passenger drop or package drop)
//   - the remaining legs include any package
export default function TrunkCheckScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const params = useLocalSearchParams<{ deliveryId?: string; remaining?: string }>();
  const remaining = Number(params.remaining ?? '0');

  const [photoUri, setPhotoUri] = useState('');
  const [uploading, setUploading] = useState(false);
  /**
   * Themed dialogs (item 4, 2026-08-24). This screen is reached straight
   * off the delivery-complete sheet, so leaving it on Android's
   * AlertDialog put a designed sheet and a grey OS box back to back in
   * the same twenty seconds of a rider's job.
   */
  const [sheet, setSheet] = useState<SeirsSheetSpec | null>(null);
  const info = (title: string, message?: string, onDone?: () => void) =>
    setSheet({
      title,
      message,
      options: [{ label: tr('auto.active.gotIt', 'Got it'), variant: 'primary', onPress: onDone }],
      cancelLabel: null,
      onCancel: onDone,
    });

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { info('Camera access needed', 'SEIRS needs the camera for the trunk photo. Grant it in Settings, then try again.'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!r.canceled) setPhotoUri(r.assets[0].uri);
  };

  const submit = async () => {
    if (!photoUri) { info('Photo required', 'Take a quick trunk photo to confirm remaining packages.'); return; }
    setUploading(true);
    try {
      // uploadFile's second argument is a dead prefix that the backend
      // ignores, so this photo used to land unsegregated. 'proof' is the
      // folder it belongs in, same fix as the partner handover photos
      // (2026-08-23 sweep, B-10.6 class).
      await uploadApi.file(photoUri, 'image/jpeg', 'proof');
      /**
       * The uploaded URL used to be console.logged and nothing else,
       * under a footnote telling the rider "Photos here become evidence
       * in any dispute". It was evidence of nothing: no route attaches a
       * photo to a delivery outside a status transition, so the file
       * reached R2 and no record ever pointed at it (2026-08-23 sweep,
       * D-1.6). The photo still goes up, because an unlinked file in
       * cold storage beats no photo at all, and the copy no longer
       * claims a link that does not exist.
       *
       * Handed back to the backend: POST /deliveries/:id/driver-note
       * with { photoUrl }. DeliveryEventType.DRIVER_NOTE already exists
       * for exactly this and has no controller. The day it lands, pass
       * params.deliveryId and the URL here and restore the footnote.
       */
      info(
        'Trunk photo taken',
        'Keep going with the next leg. If anything looks wrong, stop and contact support before you drive on.',
        () => router.back(),
      );
    } catch (e: any) {
      info('Upload failed', e?.message ?? 'Try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.trunkCheck.trunkCheck', 'Trunk Check')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        <View style={styles.warnBanner}>
          <AlertTriangle size={20} color="#D97706" />
          <View style={{ flex: 1 }}>
            <Text style={styles.warnTitle}>{tx('auto.trunkCheck.confirmRemainingPackages', 'Confirm remaining packages')}</Text>
            <Text style={styles.warnSub}>
              {remaining > 0
                ? `${remaining} other package${remaining === 1 ? ' is' : 's are'} still in your trunk. Take a photo confirming everything is intact before continuing.`
                : 'Take a quick photo of the trunk so the chain of custody is documented.'}
            </Text>
          </View>
        </View>

        {photoUri ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Image source={{ uri: photoUri }} style={styles.preview} />
            <Pressable onPress={pickPhoto} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
              <Camera size={14} color={theme.text} />
              <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{tx('auto.trunkCheck.retake', 'Retake')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={pickPhoto} style={[styles.photoBox, { borderColor: theme.primary }]}>
            <Camera size={36} color={theme.primary} />
            <Text style={[styles.photoTitle, { color: theme.text }]}>{tx('auto.trunkCheck.tapToCaptureTrunk', 'Tap to capture trunk')}</Text>
            <Text style={[styles.photoHint, { color: theme.textSecond }]}>
              {tr('auto.trunkCheck.frameTheInsideOfThe', 'Frame the inside of the trunk so all remaining packages are visible.')}
            </Text>
          </Pressable>
        )}

        <Pressable
          disabled={!photoUri || uploading}
          onPress={submit}
          style={[styles.primaryBtn, { backgroundColor: photoUri ? theme.primary : theme.surfaceSecond }]}
        >
          {uploading
            ? <ActivityIndicator color="#fff" />
            : <>
                <Check size={16} color={photoUri ? '#fff' : theme.textThird} />
                <Text style={[styles.primaryBtnText, { color: photoUri ? '#fff' : theme.textThird }]}>
                  {tr('auto.trunkCheck.confirmAndContinue', 'Confirm and continue')}
                </Text>
              </>
          }
        </Pressable>

        {/* Dropped "Photos here become evidence in any dispute": nothing
            links the photo to this delivery yet, so it was a promise the
            platform could not keep at the exact moment a rider needs to
            trust it (2026-08-23 sweep, D-1.6). */}
        <Text style={[styles.footnote, { color: theme.textThird }]}>
          {tr('auto.trunkCheck.ifAnythingIsMissingDo', 'If anything is missing, do NOT continue. Pull over safely and contact support before driving further, and keep the photo on your phone.')}
        </Text>
      </ScrollView>

      <SeirsSheet spec={sheet} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },

  warnBanner:{ flexDirection: 'row', gap: 12, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'flex-start', backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  warnTitle: { color: '#92400E', fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: 4 },
  warnSub:   { color: '#92400E', fontSize: FontSize.sm, lineHeight: 19 },

  card:    { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 8 },
  preview: { width: '100%', height: 240, borderRadius: 12, backgroundColor: '#E5E7EB' },

  photoBox:  { borderWidth: 2, borderStyle: 'dashed', borderRadius: 16, paddingVertical: 56, alignItems: 'center', gap: 10 },
  photoTitle:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },
  photoHint: { fontSize: FontSize.xs, textAlign: 'center', paddingHorizontal: 24 },

  secondaryBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.lg, borderWidth: 1.5 },
  secondaryBtnText:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  primaryBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.lg, marginTop: Spacing.md },
  primaryBtnText:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },

  footnote: { fontSize: FontSize.xs, textAlign: 'center', lineHeight: 17, paddingHorizontal: 8 },
});
