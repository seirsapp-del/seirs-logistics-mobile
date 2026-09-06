/**
 * Chain of custody at a partner counter: scan, then a named human signs.
 *
 * WHY (founder, 2026-08-25): the deck opens with "every person who
 * touched the parcel signed for it", and the admin Liability Disputes
 * page said "No handoff records yet" on a delivery that completed
 * successfully. Between a rider and a partner store there was no way to
 * record anything at all.
 *
 * The liability matrix moves responsibility on a scan: "Partner store
 * until driver scans", "Driver until store scans". A scan on its own is
 * not enough evidence, because the answer to "we never received that
 * parcel" cannot be a store id. It has to be a person. So the counter
 * staff type their own name, which is a signature under Nigerian
 * Evidence Act section 84, the same standard the door hand-off and the
 * vehicle-owner consent already use.
 *
 * Three steps in that order, on one screen, because a rider is standing
 * at a counter and every extra navigation is a queue behind them:
 *   1. Scan the parcel   proves WHICH parcel is changing hands
 *   2. The counter signs proves WHO took it, by name
 *   3. Confirm           writes the record
 *
 * Direction decides the stage, and nothing else about the screen:
 *   collect -> store_to_driver   (rider picking up from the counter)
 *   drop    -> driver_to_store   (rider handing in at the counter)
 *
 * KNOWN BACKEND GAP at time of writing, see the comment on submit():
 * identity.service resolves the other party to the delivery's CUSTOMER
 * for both verification methods, so neither models a store. This screen
 * sends the payload the HandoffRecord entity implies and surfaces the
 * server's real error rather than pretending a record was written.
 */
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable,
  Linking, ScrollView, StatusBar, StyleSheet, Text, TextInput, Vibration, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, FontSize, FontWeight, Radius, Shadows, Spacing } from '@/constants/theme';
import { deliveriesApi, dropoffApi, identityApi, uploadApi } from '@/services/api';
import { PackageCodeCapture } from '@/components/PackageCodeCapture';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

type Direction = 'collect' | 'drop';
type Step      = 'scan' | 'sign' | 'done';

/**
 * Stages from HandoffRecord.HandoffStage. Kept as literal strings and not
 * imported: the backend enum lives in a Nest module the app does not
 * build against, and drifting silently is the risk a comment cannot fix,
 * so any change here has to be made against that file deliberately.
 */
const STAGE: Record<Direction, string> = {
  collect: 'store_to_driver',
  drop:    'driver_to_store',
};

const COPY = (): Record<Direction, {
  title: string; scanLead: string; signTitle: string; signBody: string;
  namePlaceholder: string; cta: string; doneTitle: string; doneBody: string;
}> => ({
  collect: {
    title:    tr('auto.storeHandoff.collectFromTheCounter', 'Collect from the counter'),
    scanLead: tx9('auto.storeHandoff.scanTheParcelBeforeYou', 'Scan the parcel before you take it. From this moment it is on you, not the store.'),
    signTitle: tx9('auto.storeHandoff.whoIsReleasingIt', 'Who is releasing it?'),
    signBody:  tx9('auto.storeHandoff.handYourPhoneToThe', 'Hand your phone to the person at the counter. They type their own full name. That name is what answers a question about this parcel later, and a store id cannot.'),
    namePlaceholder: tx9('auto.storeHandoff.counterStaffSFullName', 'Counter staff\'s full name'),
    cta:       tr('auto.storeHandoff.takeCustody', 'Take custody'),
    doneTitle: tx9('auto.storeHandoff.signedFor', 'Signed for'),
    doneBody:  tx9('auto.storeHandoff.theParcelIsOnYou', 'The parcel is on you now. The counter is on the record as having released it.'),
  },
  drop: {
    title:    tr('auto.storeHandoff.handInAtTheCounter', 'Hand in at the counter'),
    scanLead: tx9('auto.storeHandoff.scanTheParcelAsYou', 'Scan the parcel as you hand it over. Until the counter signs, it is still on you.'),
    signTitle: tx9('auto.storeHandoff.whoIsReceivingIt', 'Who is receiving it?'),
    signBody:  tx9('auto.storeHandoff.handYourPhoneToThe2', 'Hand your phone to the person at the counter. They type their own full name. This is what stops the store saying later that the parcel never arrived.'),
    namePlaceholder: tx9('auto.storeHandoff.counterStaffSFullName', 'Counter staff\'s full name'),
    cta:       tr('auto.storeHandoff.handOver', 'Hand over'),
    doneTitle: tx9('auto.storeHandoff.handedOver', 'Handed over'),
    doneBody:  tx9('auto.storeHandoff.theCounterHasSignedFor', 'The counter has signed for it. It is off you and on the store.'),
  },
});

export default function StoreHandoffScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const params = useLocalSearchParams<{
    deliveryId?: string; code?: string; direction?: string;
    storeName?: string; storeAddress?: string; storeId?: string;
  }>();

  const deliveryId   = params.deliveryId ?? '';
  const expected     = (params.code ?? '').trim().toUpperCase();
  const direction    = (params.direction === 'collect' ? 'collect' : 'drop') as Direction;
  const storeId      = (params.storeId ?? '').trim();
  const copy         = COPY()[direction];

  /**
   * Which counter is this, and is it even open?
   *
   * Until 2026-09-04 this screen was handed a name and an address as route
   * params, and the screen that pushed it hardcoded the name as "Partner
   * counter". So a rider could ride across Lagos to a shop whose name they
   * were never told, which may have shut an hour before they set off, with no
   * number to ring.
   *
   * Fetched rather than passed, so it is right at the moment the rider is
   * standing there rather than right when the job was opened. Fails quietly
   * to the params: a counter whose details cannot be loaded still shows the
   * address and the handover still works, because nothing here is worth
   * blocking a handover over.
   */
  const [counter, setCounter] = useState<{
    storeName: string; storeAddress: string; phone: string | null;
    workingHours: Record<string, { enabled: boolean; start: string; end: string }> | null;
    openTime: string | null; closeTime: string | null;
    isOpenNow: boolean; acceptingNew: boolean;
    /**
     * The shopfront, so a rider can recognise the place (2026-09-05).
     *
     * SEIRS makes every partner submit and re-submit this photo for
     * approval, and then showed it to nobody. A rider looking for a
     * counter on a busy street has a name and an address and no idea
     * what to look for. Optional here on purpose: counterDetails narrows
     * its select and does not return it yet, so this renders the moment
     * the field is added server-side and costs nothing until then.
     */
    storefrontPhotoUrl?: string | null;
  } | null>(null);

  useEffect(() => {
    if (!storeId) return;
    let alive = true;
    dropoffApi.counterDetails(storeId)
      .then(r => { if (alive && r) setCounter(r as any); })
      .catch(() => {});
    return () => { alive = false; };
  }, [storeId]);

  const storeName    = counter?.storeName    ?? params.storeName ?? 'Partner counter';
  const storeAddress = counter?.storeAddress ?? params.storeAddress ?? '';

  /** Today's hours, in the shop's own words. Empty when unknown. */
  const counterHours = (() => {
    const KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const day = counter?.workingHours?.[KEYS[new Date().getDay()]];
    if (day) return day.enabled === false ? '' : `${day.start} to ${day.end}`;
    if (counter?.openTime && counter?.closeTime) return `${counter.openTime} to ${counter.closeTime}`;
    return '';
  })();

  const [step,        setStep]        = useState<Step>('scan');
  const [scanned,     setScanned]     = useState('');
  const [scanState,   setScanState]   = useState<'idle' | 'bad'>('idle');
  const [staffName,   setStaffName]   = useState('');
  const [staffSeirsId, setStaffSeirsId] = useState('');
  const [photoUri,    setPhotoUri]    = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [sheet,       setSheet]       = useState<SeirsSheetSpec | null>(null);

  // ── Step 1: the parcel ────────────────────────────────────────────────
  /**
   * onBarcodeScanned fires on every frame the QR is in view, not once per
   * code. Without this the counter got a burst of scanVerify calls off a
   * single parcel, and a wrong-parcel buzz that never stopped vibrating.
   */
  const cooldown = useRef(false);

  const onCode = (raw: string) => {
    if (cooldown.current) return;
    const code = (raw ?? '').trim().toUpperCase();
    if (!code) return;
    cooldown.current = true;

    // Log the scan server-side the same way the door scanner does
    // (delivery_events SCAN). A typed code is the same evidence as a
    // scanned one: it still had to be read off the parcel. Fire and
    // forget; the verdict below never waits on the network, because a
    // counter with no signal still has to finish.
    if (deliveryId) deliveriesApi.scanVerify(deliveryId, code).catch(() => {});

    // When the caller told us what to expect, a wrong parcel stops here.
    // With no expected code the scan is still recorded, it just cannot be
    // checked against anything on the device.
    if (expected && code !== expected) {
      Vibration.vibrate(200);
      setScanned(code);
      setScanState('bad');
      setTimeout(() => { setScanState('idle'); cooldown.current = false; }, 1800);
      return;
    }

    Vibration.vibrate([0, 60, 60, 60]);
    setScanned(code);
    setScanState('idle');
    setStep('sign');
  };

  // ── Step 2: the counter photo (optional evidence) ─────────────────────
  const choosePhoto = () => setSheet({
    title:   tr('auto.storeHandoff.photoOfTheHandOver', 'Photo of the hand-over'),
    message: tr('auto.storeHandoff.optionalTheParcelOnThe', 'Optional. The parcel on the counter, or the counter book with the entry in it.'),
    options: [
      { label: tr('auto.storeHandoff.takeAPhoto', 'Take a photo'),        variant: 'primary', icon: 'camera-outline', onPress: () => grabPhoto('camera') },
      { label: tr('auto.storeHandoff.chooseFromGallery', 'Choose from gallery'), icon: 'images-outline',                     onPress: () => grabPhoto('library') },
    ],
  });

  const grabPhoto = async (source: 'camera' | 'library') => {
    try {
      let uri: string | null = null;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== 'granted') {
          setError('Camera access is needed to photograph the hand-over.');
          return;
        }
        const r = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false, exif: false });
        uri = r.canceled ? null : r.assets[0].uri;
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== 'granted') {
          setError('Photo library access is needed.');
          return;
        }
        const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: false });
        uri = r.canceled ? null : r.assets[0].uri;
      }
      if (uri) { setPhotoUri(uri); setError(null); }
    } catch (e: any) {
      setError(e?.message ?? 'Could not open the camera.');
    }
  };

  // ── Step 3: write the record ──────────────────────────────────────────
  const nameParts = staffName.trim().split(/\s+/).filter(Boolean);
  const canSubmit = nameParts.length >= 2 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      let proofPhotoUrl: string | undefined;
      if (photoUri) {
        // Best effort. A counter with bad signal must not be blocked from
        // signing because an optional photo would not upload.
        try {
          const up = await uploadApi.file(photoUri, 'image/jpeg', 'proof');
          proofPhotoUrl = up.url;
        } catch { /* the typed signature is the evidence that matters */ }
      }

      /**
       * `signatureName` is accepted by IdentityController.verify but is
       * NOT in the shared verifyHandoff payload type yet, and this app is
       * not allowed to edit shared. One cast, named, so it deletes itself
       * the day shared catches up: without the cast this does not compile,
       * and without the field the founder's whole requirement is dropped.
       *
       * method is seirs_id because of the two the entity models it is the
       * one that means "a code plus a typed-name signature". physical_id
       * needs an OTP emailed to the recipient, which a counter cannot
       * produce and which is the wrong party for this stage anyway.
       */
      const payload = {
        stage:         STAGE[direction],
        method:        'seirs_id' as const,
        seirsCode:     staffSeirsId.trim() || scanned,
        typedName:     staffName.trim(),
        signatureName: staffName.trim(),
        proofPhotoUrl,
      };
      await identityApi.verifyHandoff(deliveryId, payload as any);
      setStep('done');
    } catch (e: any) {
      setError(e?.message ?? 'Could not record the hand-over. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const stepIndex = step === 'scan' ? 0 : step === 'sign' ? 1 : 2;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SeirsSheet spec={sheet} onClose={() => setSheet(null)} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{copy.title}</Text>
          <Text style={[styles.headerSub, { color: theme.textSecond }]} numberOfLines={1}>
            {storeName}{storeAddress ? ` · ${storeAddress}` : ''}
          </Text>
          {/* What the shop looks like. See the type above for why this is
              optional and why it is worth drawing at all. */}
          {counter?.storefrontPhotoUrl ? (
            <Image
              source={{ uri: counter.storefrontPhotoUrl }}
              style={styles.shopfront}
              resizeMode="cover"
            />
          ) : null}
          {/* Shut, and a number to ring about it. Only drawn once the counter
              has actually been looked up, so it never guesses. */}
          {counter && (
            <Text style={[styles.headerSub, { color: theme.textSecond }]} numberOfLines={1}>
              <Text style={{
                color: counter.isOpenNow ? '#16A34A' : '#DC2626',
                fontWeight: FontWeight.bold,
              }}>
                {counter.isOpenNow ? tx9('auto.storeHandoff.openNow', 'Open now') : tx9('auto.storeHandoff.closedNow', 'Closed now')}
              </Text>
              {counterHours ? `  ·  ${counterHours}` : ''}
              {counter.phone ? '  ·  ' : ''}
              {counter.phone ? (
                <Text
                  style={{ color: theme.primary, fontWeight: FontWeight.semibold }}
                  onPress={() => Linking.openURL(`tel:${counter.phone}`).catch(() => {})}
                >
                  {tr('auto.storeHandoff.callTheCounter', 'Call the counter')}
                </Text>
              ) : null}
            </Text>
          )}
        </View>
      </View>

      {/* Three dots, not a percentage. A rider needs to know how many more
          things they are being asked for while someone waits. */}
      <View style={styles.steps}>
        {[tx9('auto.storeHandoff.scan', 'Scan'), tx9('auto.storeHandoff.sign', 'Sign'), tx9('auto.profile.done', 'Done')].map((label, i) => (
          <View key={label} style={styles.stepItem}>
            <View style={[
              styles.stepDot,
              { backgroundColor: i <= stepIndex ? theme.primary : theme.border },
            ]}>
              {i < stepIndex
                ? <Ionicons name="checkmark" size={12} color="#fff" />
                : <Text style={[styles.stepNum, { color: i <= stepIndex ? '#fff' : theme.textThird }]}>{i + 1}</Text>}
            </View>
            <Text style={[styles.stepLabel, { color: i <= stepIndex ? theme.text : theme.textThird }]}>{label}</Text>
            {i < 2 && <View style={[styles.stepBar, { backgroundColor: i < stepIndex ? theme.primary : theme.border }]} />}
          </View>
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 'scan' && (
            <>
              <View style={[styles.lead, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
                <Ionicons name="swap-horizontal-outline" size={18} color={theme.primary} />
                <Text style={[styles.leadText, { color: theme.textSecond }]}>{copy.scanLead}</Text>
              </View>

              <PackageCodeCapture
                expected={expected}
                onCode={onCode}
                frameState={scanState === 'bad' ? 'bad' : null}
                manualTitle="Type the parcel code instead"
                manualBody="Counters are dark and labels get scuffed. The code on the parcel is the same evidence typed as it is scanned. It starts with SRS."
                submitLabel="Use this code"
                scanHint="Point at the QR on the parcel label."
              />

              {scanState === 'bad' && (
                <View style={[styles.verdict, { backgroundColor: theme.error }]}>
                  <Ionicons name="alert-circle" size={30} color="#fff" />
                  <Text style={styles.verdictTitle}>{tx('auto.storeHandoff.wrongParcel', 'Wrong parcel')}</Text>
                  <Text style={styles.verdictSub}>
                    Got {scanned || 'nothing'}{'\n'}Expected {expected}{tr('auto.storeHandoff.doNotHandItOver', '. Do not hand it over.')}
                  </Text>
                </View>
              )}
            </>
          )}

          {step === 'sign' && (
            <>
              <View style={[styles.scannedCard, { backgroundColor: theme.surface, borderColor: theme.success }, Shadows.xs]}>
                <Ionicons name="checkmark-circle" size={22} color={theme.success} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.scannedLabel, { color: theme.textThird }]}>PARCEL</Text>
                  <Text style={[styles.scannedCode, { color: theme.text }]}>{scanned}</Text>
                </View>
                <Pressable onPress={() => { cooldown.current = false; setStep('scan'); setScanned(''); }} hitSlop={10}>
                  <Text style={[styles.rescan, { color: theme.primary }]}>{tx('auto.storeHandoff.rescan', 'Rescan')}</Text>
                </Pressable>
              </View>

              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>{copy.signTitle}</Text>
                <Text style={[styles.cardBody, { color: theme.textSecond }]}>{copy.signBody}</Text>

                <TextInput
                  style={[styles.nameInput, {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: isDark ? theme.background : '#fff',
                  }]}
                  placeholder={copy.namePlaceholder}
                  placeholderTextColor={theme.textThird}
                  value={staffName}
                  onChangeText={setStaffName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoFocus
                />
                {/* First and last, because one name is not an identification
                    in a dispute and "Emeka at the counter" is what a store
                    will offer if we let it. */}
                {staffName.trim().length > 0 && nameParts.length < 2 && (
                  <Text style={[styles.inlineErr, { color: theme.warning }]}>
                    {tr('auto.storeHandoff.theirFullNameFirstAnd', 'Their full name, first and last.')}
                  </Text>
                )}

                <Text style={[styles.legal, { color: theme.textThird }]}>
                  {tr('auto.storeHandoff.byTypingTheirNameThey', 'By typing their name they confirm they')}
                  {direction === 'drop' ? ' received ' : ' released '}
                  {tr('auto.storeHandoff.thisParcelNigerianEvidenceAct', 'this parcel. Nigerian Evidence Act, section 84.')}
                </Text>
              </View>

              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  {tr('auto.storeHandoff.storeSeirsId', 'Store SEIRS ID')} <Text style={{ color: theme.textThird, fontWeight: FontWeight.medium as any }}>{tr('auto.driverRegister.optional', '(optional)')}</Text>
                </Text>
                <Text style={[styles.cardBody, { color: theme.textSecond }]}>
                  {tr('auto.storeHandoff.ifTheCounterCanShow', 'If the counter can show their SEIRS ID, add it. It ties the name to a registered store.')}
                </Text>
                <TextInput
                  style={[styles.nameInput, {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: isDark ? theme.background : '#fff',
                    letterSpacing: 1.5,
                  }]}
                  placeholder={tx('auto.storeHandoff.seirsId', 'SEIRS ID')}
                  placeholderTextColor={theme.textThird}
                  value={staffSeirsId}
                  onChangeText={setStaffSeirsId}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>

              <Pressable
                style={[styles.photoRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={choosePhoto}
              >
                {photoUri
                  ? <Image source={{ uri: photoUri }} style={styles.photoThumb} />
                  : <View style={[styles.photoThumb, styles.photoEmpty, { borderColor: theme.border }]}>
                      <Ionicons name="camera-outline" size={20} color={theme.textThird} />
                    </View>}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.photoTitle, { color: theme.text }]}>
                    {photoUri ? tx9('auto.storeHandoff.photoAttached', 'Photo attached') : tx9('auto.storeHandoff.addAPhotoOfThe', 'Add a photo of the hand-over')}
                  </Text>
                  <Text style={[styles.photoSub, { color: theme.textSecond }]}>
                    {tr('auto.storeHandoff.optionalSkipItIfThe', 'Optional. Skip it if the queue is moving.')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textThird} />
              </Pressable>

              {!!error && (
                <View style={[styles.errBox, { borderColor: theme.error, backgroundColor: isDark ? '#3F1F1F' : '#FEF2F2' }]}>
                  <Ionicons name="alert-circle-outline" size={18} color={theme.error} />
                  <Text style={[styles.errText, { color: theme.error }]}>{error}</Text>
                </View>
              )}
            </>
          )}

          {step === 'done' && (
            <View style={[styles.doneCard, { backgroundColor: theme.surface, borderColor: theme.success }, Shadows.sm]}>
              <Ionicons name="shield-checkmark" size={44} color={theme.success} />
              <Text style={[styles.doneTitle, { color: theme.text }]}>{copy.doneTitle}</Text>
              <Text style={[styles.doneBody, { color: theme.textSecond }]}>{copy.doneBody}</Text>
              <View style={[styles.doneRow, { borderTopColor: theme.border }]}>
                <Text style={[styles.doneKey, { color: theme.textThird }]}>{tx('auto.storeHandoff.parcel', 'Parcel')}</Text>
                <Text style={[styles.doneVal, { color: theme.text }]}>{scanned}</Text>
              </View>
              <View style={[styles.doneRow, { borderTopColor: theme.border }]}>
                <Text style={[styles.doneKey, { color: theme.textThird }]}>{tx('auto.storeHandoff.signedBy', 'Signed by')}</Text>
                <Text style={[styles.doneVal, { color: theme.text }]}>{staffName.trim()}</Text>
              </View>
              <View style={[styles.doneRow, { borderTopColor: theme.border }]}>
                <Text style={[styles.doneKey, { color: theme.textThird }]}>At</Text>
                <Text style={[styles.doneVal, { color: theme.text }]}>{storeName}</Text>
              </View>
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {step !== 'scan' && (
          <View style={[styles.ctaBar, {
            backgroundColor: theme.navBackground,
            borderTopColor: theme.border,
            paddingBottom: Spacing.md + insets.bottom,
          }]}>
            {step === 'sign' ? (
              <Pressable
                style={[styles.cta, { backgroundColor: canSubmit ? theme.primary : theme.surfaceSecond }]}
                onPress={submit}
                disabled={!canSubmit}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={[styles.ctaText, { color: canSubmit ? '#fff' : theme.textThird }]}>{copy.cta}</Text>}
              </Pressable>
            ) : (
              <Pressable style={[styles.cta, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
                <Text style={[styles.ctaText, { color: '#fff' }]}>{tx('auto.storeHandoff.backToTheJob', 'Back to the job')}</Text>
              </Pressable>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
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

  steps:     { flexDirection: 'row', paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  stepItem:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot:   { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepNum:   { fontSize: 11, fontWeight: FontWeight.bold as any },
  stepLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold as any },
  stepBar:   { width: 28, height: 2, marginHorizontal: 6, borderRadius: 1 },

  body: { padding: Spacing.md, gap: Spacing.md },

  lead:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  leadText: { flex: 1, fontSize: FontSize.xs, lineHeight: 18 },

  scannedCard:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  scannedLabel: { fontSize: 10, fontWeight: FontWeight.bold as any, letterSpacing: 0.8 },
  scannedCode:  { fontSize: FontSize.base, fontWeight: FontWeight.bold as any, letterSpacing: 1.5, marginTop: 2 },
  rescan:       { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },

  card:      { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  cardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  cardBody:  { fontSize: FontSize.xs, lineHeight: 18 },
  nameInput: { height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md, fontSize: FontSize.base },
  inlineErr: { fontSize: FontSize.xs, marginTop: -2 },
  legal:     { fontSize: 10, lineHeight: 15 },

  photoRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.xl, borderWidth: 1 },
  // Wide rather than square: a shopfront is a strip of street, and a
  // square crop of one is mostly shutter.
  shopfront:  { width: '100%', height: 96, borderRadius: 10, marginTop: 10, marginBottom: 4 },
  photoThumb: { width: 52, height: 52, borderRadius: Radius.md },
  photoEmpty: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  photoTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  photoSub:   { fontSize: FontSize.xs, marginTop: 2 },

  errBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  errText: { flex: 1, fontSize: FontSize.xs, lineHeight: 18 },

  verdict:      { borderRadius: Radius.xl, padding: Spacing.md, alignItems: 'center', gap: 6 },
  verdictTitle: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  verdictSub:   { color: 'rgba(255,255,255,0.9)', fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },

  doneCard:  { borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.lg, alignItems: 'center', gap: 6 },
  doneTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any, marginTop: 4 },
  doneBody:  { fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center' },
  doneRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
  doneKey:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any, letterSpacing: 0.6 },
  doneVal:   { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any, flexShrink: 1, textAlign: 'right' },

  ctaBar:  { padding: Spacing.md, borderTopWidth: 1 },
  cta:     { height: 54, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
});
