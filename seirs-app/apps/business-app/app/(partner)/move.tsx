/**
 * Moving the shop to a different building.
 *
 * Founder, 2026-09-04: "if a partner store is moving they have to put in a
 * request and they have to go through the whole process so we can update
 * their data, at least the most important things again, just like the driver
 * trying to change his car."
 *
 * So this screen is the partner equivalent of the rider's vehicle change, and
 * it keeps that flow's shape on purpose:
 *
 *   - the live address is NOT edited here, it is proposed and reviewed
 *   - the address itself does not change until a person approves
 *   - only the documents about the BUILDING are asked for again; the owner's
 *     ID and the company papers are not, because the person and the business
 *     have not moved
 *
 * One place it deliberately does NOT follow the rider flow, on the founder's
 * correction of 2026-09-04: filing this PAUSES new parcels immediately rather
 * than letting the shop keep taking them on its own say-so. "Imagine sending a
 * package to an old store where the partner already move out of under a short
 * notice." Pausing a shop that could have kept trading costs a few days of
 * drop-offs; routing a stranger's parcel to a building somebody left on Friday
 * costs them the parcel. They can still hand back what they already hold, and
 * they are told to.
 *
 * The one question the rider flow does not have to ask is the one that
 * matters most here: a shop that moves is holding other people's parcels.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable,
  ActivityIndicator, Switch, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Icon } from '@/components/Icon';
import { StreetAutocomplete } from '@/components/StreetAutocomplete';
import { partnerApi, uploadApi } from '@/services/api';
import { useColors } from '@/context/ThemeContext';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';

/** Matches the server. A reading looser than this is offered for a retry. */
const ACCURACY_LIMIT_M = 50;

const DOC_LABEL: Record<string, string> = {
  storefront_photo: 'The new shop front',
  storage_area:     'Where parcels will sit',
  street_view:      'The new shop from the road',
  shelf_or_lockup:  'The shelf or lock-up (optional)',
};

const DOC_HINT: Record<string, string> = {
  storefront_photo: 'Stand across the road and photograph the whole front, including any sign.',
  storage_area:     'The shelf, corner or room where customers’ parcels will actually be kept.',
  street_view:      'The street looking towards your shop, so a rider can recognise the turning.',
  shelf_or_lockup:  'If parcels go in a lock-up or cabinet, show it.',
};

export default function PartnerMoveScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [data,    setData]    = useState<any>(null);
  const [busy,    setBusy]    = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);

  // The form, used only when there is no request in flight.
  const [street, setStreet] = useState('');
  const [city,   setCity]   = useState('');
  const [state,  setState]  = useState('Lagos');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [reason, setReason] = useState('');
  const [stillTrading, setStillTrading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await partnerApi.move.mine());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const req     = data?.request ?? null;
  const pending = req?.status === 'pending';

  /**
   * Where the phone is, right now. Null rather than an error on refusal:
   * a shop under a zinc roof may never get a fix, and refusing the photo
   * over it would punish somebody for their building.
   */
  const currentPlace = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return null;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (!pos?.coords) return null;
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: Math.round(pos.coords.accuracy ?? 9999),
      };
    } catch { return null; }
  };

  const submit = async () => {
    if (!coords) {
      alertDialog(
        'Pick the address from the list',
        'Choose your new street from the suggestions as you type. That is what puts your shop on the map, '
        + 'and a typed address cannot be found by customers or riders.',
      );
      return;
    }
    const address = [street.trim(), city.trim(), `${state} State`, 'Nigeria']
      .filter(Boolean).join(', ');

    setSaving(true);
    try {
      const res = await partnerApi.move.request({
        newStoreAddress:   address,
        newStoreLat:       coords.lat,
        newStoreLng:       coords.lng,
        reason:            reason.trim() || undefined,
        stillTradingAtOld: stillTrading,
      });
      await load();
      alertDialog('Request sent', res?.message ?? 'Our team will look at it shortly.');
    } catch (e: any) {
      alertDialog('Not sent', e?.message ?? 'Something went wrong. Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * A photo of the new premises, taken at the new premises.
   *
   * Camera only, never the gallery, for exactly the reason the application
   * flow gives: the location is read at upload time, so a picture chosen
   * from the gallery would be stamped with wherever the phone is now rather
   * than where it was taken, which turns the check into theatre.
   */
  const sendPhoto = async (docId: string) => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      alertDialog('Camera needed', 'This photo has to be taken at the new shop, so SEIRS needs the camera.');
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (picked.canceled || !picked.assets?.[0]?.uri) return;

    setBusy(docId);
    try {
      const where = await currentPlace();
      if (where && where.accuracyM > ACCURACY_LIMIT_M) {
        alertDialog(
          'Weak location',
          `Your phone is only sure of its position to about ${where.accuracyM} m. `
          + 'We will still send the photo, but standing outside for a moment gives a better reading.',
        );
      }
      const up = await uploadApi.file(picked.assets[0].uri, 'image/jpeg', 'kyc');
      if (!up?.url) throw new Error('The file did not upload.');
      await partnerApi.move.uploadDoc(docId, { url: up.url, ...(where ?? {}) });
      await load();
    } catch (e: any) {
      alertDialog('Not sent', e?.message ?? 'Something went wrong. Try again in a moment.');
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async () => {
    alertDialog(
      'Cancel this move?',
      'Your shop stays at its current address. You can ask again at any time.',
      [
        { text: 'Keep it' },
        {
          text: 'Cancel move',
          style: 'destructive',
          onPress: async () => {
            try {
              await partnerApi.move.withdraw();
              await load();
            } catch (e: any) {
              alertDialog('Not cancelled', e?.message ?? 'Try again in a moment.');
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const sent = new Map<string, any>((data?.documents ?? []).map((d: any) => [d.docId, d]));
  const held = data?.parcelsHeldNow ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Icon name="ArrowLeft" size={22} color={colors.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[styles.heading, { color: colors.text }]}>{tx('auto.move.movingShop', 'Moving shop')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* Where they are now. Never editable here. */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.textSecond }]}>YOUR ADDRESS TODAY</Text>
          <Text style={[styles.address, { color: colors.text }]}>
            {data?.currentAddress || 'No address on file'}
          </Text>
          <Text style={[styles.note, { color: colors.textSecond }]}>
            This is where customers and riders are sent. It only changes once our team has
            approved your new shop.
          </Text>
        </View>

        {pending ? (
          <>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.rowBetween}>
                <Text style={[styles.cardLabel, { color: colors.textSecond }]}>UNDER REVIEW</Text>
                <View style={[styles.pill, { backgroundColor: colors.warning + '22' }]}>
                  <Text style={[styles.pillText, { color: colors.warning }]}>{tx('auto.move.waitingOnUs', 'Waiting on us')}</Text>
                </View>
              </View>
              <Text style={[styles.address, { color: colors.text }]}>{req.newStoreAddress}</Text>
              <Text style={[styles.note, { color: colors.textSecond }]}>
                New parcels have been paused until we confirm your new address. Please still
                hand back anything you are already holding: those customers were told to
                collect at your current shop.
              </Text>
            </View>

            {held > 0 && (
              <View style={[styles.card, styles.alert, { backgroundColor: colors.warning + '14', borderColor: colors.warning }]}>
                <Text style={[styles.alertTitle, { color: colors.text }]}>
                  You are holding {held} {held === 1 ? 'parcel' : 'parcels'}
                </Text>
                <Text style={[styles.note, { color: colors.textSecond }]}>
                  These belong to customers who were told to collect them at your old address.
                  Do not move them until our team has spoken to you.
                </Text>
              </View>
            )}

            {/* The premises photos, and only those. */}
            <Text style={[styles.sectionTitle, { color: colors.textSecond }]}>PHOTOS OF THE NEW SHOP</Text>
            <Text style={[styles.note, { color: colors.textSecond, marginBottom: 12 }]}>
              We do not ask for your ID or your CAC certificate again. Those are about you and
              your business, and neither has changed. Only the building has.
            </Text>

            {(data?.allPremisesDocs ?? []).map((docId: string) => {
              const doc = sent.get(docId);
              const required = (data?.requiredDocs ?? []).includes(docId);
              return (
                <View
                  key={docId}
                  style={[styles.docRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  {doc?.url ? (
                    <Image source={{ uri: doc.url }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Icon name="Camera" size={18} color={colors.textThird} strokeWidth={1.75} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.docLabel, { color: colors.text }]}>
                      {DOC_LABEL[docId] ?? docId}
                    </Text>
                    <Text style={[styles.docHint, { color: colors.textSecond }]}>
                      {doc ? 'Sent. Our team will look at it.' : DOC_HINT[docId] ?? ''}
                    </Text>
                    {!doc && required && (
                      <Text style={[styles.docHint, { color: colors.warning }]}>{tx('auto.move.neededBeforeWeCanApprove', 'Needed before we can approve')}</Text>
                    )}
                  </View>
                  <Pressable
                    style={[styles.smallBtn, { borderColor: colors.primary }]}
                    onPress={() => sendPhoto(docId)}
                    disabled={busy === docId}
                  >
                    {busy === docId
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : <Text style={[styles.smallBtnText, { color: colors.primary }]}>{doc ? 'Retake' : 'Take'}</Text>}
                  </Pressable>
                </View>
              );
            })}

            <Pressable style={styles.linkBtn} onPress={withdraw}>
              <Text style={[styles.linkBtnText, { color: colors.error }]}>{tx('auto.move.cancelThisMoveRequest', 'Cancel this move request')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            {req?.status === 'rejected' && (
              <View style={[styles.card, styles.alert, { backgroundColor: colors.error + '12', borderColor: colors.error }]}>
                <Text style={[styles.alertTitle, { color: colors.text }]}>{tx('auto.move.yourLastMoveWasNot', 'Your last move was not approved')}</Text>
                {!!req.decisionNote && (
                  <Text style={[styles.note, { color: colors.textSecond }]}>{req.decisionNote}</Text>
                )}
                {!!req.rejectedItems?.length && (
                  <Text style={[styles.note, { color: colors.textSecond }]}>
                    Please redo: {req.rejectedItems.map((d: string) => DOC_LABEL[d] ?? d).join(', ')}.
                  </Text>
                )}
              </View>
            )}

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.textSecond }]}>YOUR NEW SHOP</Text>

              <Text style={[styles.label, { color: colors.textSecond }]}>City / LGA</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={city}
                onChangeText={setCity}
                placeholder="e.g. Ikeja, Surulere, Lekki"
                placeholderTextColor={colors.textThird}
              />

              <View style={{ marginTop: 12 }}>
                <StreetAutocomplete
                  label="Street address & landmark"
                  value={street}
                  onChangeText={(v: string) => {
                    setStreet(v);
                    // Typing over a picked address invalidates the pin it
                    // resolved. No coordinates beats wrong ones, which is
                    // the same rule the application screen follows.
                    if (coords) setCoords(null);
                  }}
                  state={state}
                  placeholder="Start typing the new street…"
                  onCoordsResolved={(lat: number, lng: number) => setCoords({ lat, lng })}
                />
              </View>

              {!coords && street.length > 0 && (
                <Text style={[styles.note, { color: colors.warning }]}>
                  Pick the street from the suggestions so we can put your shop on the map.
                </Text>
              )}

              <Text style={[styles.label, { color: colors.textSecond, marginTop: 12 }]}>
                Why are you moving? (optional)
              </Text>
              <TextInput
                style={[styles.input, styles.multiline, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. the landlord sold the building"
                placeholderTextColor={colors.textThird}
                multiline
              />
            </View>

            {/* The question a vehicle change never has to ask. */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.docLabel, { color: colors.text }]}>
                    Can people still reach you at your current shop?
                  </Text>
                  <Text style={[styles.docHint, { color: colors.textSecond }]}>
                    {stillTrading
                      ? 'Yes. Customers holding a collection code can still come and get their parcel.'
                      : 'No, the shop is already shut. Tell us now so we can arrange to get those parcels back.'}
                  </Text>
                </View>
                <Switch
                  value={stillTrading}
                  onValueChange={setStillTrading}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>

              {held > 0 && (
                <Text style={[styles.note, { color: colors.warning, marginTop: 10 }]}>
                  You are holding {held} {held === 1 ? 'parcel' : 'parcels'} right now. Whatever you
                  answer, do not move them: our team will call you about them.
                </Text>
              )}
            </View>

            <Pressable
              style={[styles.primaryBtn, { backgroundColor: coords ? colors.primary : colors.surfaceSecond }]}
              onPress={submit}
              disabled={saving || !coords}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>{tx('auto.move.sendMoveRequest', 'Send move request')}</Text>}
            </Pressable>

            <Text style={[styles.note, { color: colors.textSecond, textAlign: 'center', marginTop: 10 }]}>
              After you send this we will ask for photos of the new shop. New parcels stop
              coming to you until the new address is approved, so send the photos quickly.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  back:      { padding: 2 },
  heading:   { fontSize: 20, fontFamily: 'Inter_600SemiBold' },

  card:      { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12 },
  alert:     { borderWidth: 1 },
  cardLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 6 },
  address:   { fontSize: 16, fontFamily: 'Inter_500Medium', lineHeight: 22 },
  note:      { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18, marginTop: 6 },
  alertTitle:{ fontSize: 15, fontFamily: 'Inter_600SemiBold' },

  sectionTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginTop: 6, marginBottom: 4 },

  label:     { fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 6 },
  input:     { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, fontFamily: 'Inter_400Regular' },
  multiline: { minHeight: 68, textAlignVertical: 'top' },

  rowBetween:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill:      { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  pillText:  { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  docRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  thumb:     { width: 52, height: 52, borderRadius: 8 },
  thumbEmpty:{ alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  docLabel:  { fontSize: 14.5, fontFamily: 'Inter_600SemiBold' },
  docHint:   { fontSize: 12.5, fontFamily: 'Inter_400Regular', lineHeight: 17, marginTop: 2 },

  smallBtn:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, minWidth: 68, alignItems: 'center' },
  smallBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  primaryBtn:     { borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 6 },
  primaryBtnText: { color: '#fff', fontSize: 15.5, fontFamily: 'Inter_600SemiBold' },

  linkBtn:     { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  linkBtnText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
});
