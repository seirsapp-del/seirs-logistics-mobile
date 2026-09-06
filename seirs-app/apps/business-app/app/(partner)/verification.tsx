/**
 * A partner store's KYC documents, replaceable one at a time.
 *
 * Until 2026-09-02 a shop had no way to see what had been decided about
 * its files, and no way to answer a refusal except by submitting the
 * whole application again, which reset the store to pending review and
 * threw away the decisions already made on the other documents.
 *
 * Grouped by what each document is ABOUT (2026-09-03), the way the driver
 * app groups a rider's: the owner is asked once, the premises are asked
 * again if the shop moves, and the business documents are optional
 * because most Nigerian counter shops are not registered. The grouping
 * comes from the server so the app never holds a second copy of a policy
 * that would drift from the first.
 *
 * The tone difference between the two refusal states is the point rather
 * than decoration. Rejected means something is wrong with what was sent.
 * Needs replacing means it was fine and has run out, which is time
 * passing, not a fault, and it is amber rather than red everywhere.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Icon } from '@/components/Icon';
import { uploadApi, partnerApi } from '@/services/api';
import type { PartnerDocument, PartnerDocGroup } from '@/services/api';
import { useColors } from '@/context/ThemeContext';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';

/**
 * Above this many metres of reported uncertainty the fix is too vague to
 * mean anything. Matches ACCURACY_LIMIT_M on the server; the shop is
 * warned and can retry, and the upload is still allowed either way.
 */
const ACCURACY_LIMIT_M = 50;

/** The order a shop works through them, and why each group exists. */
const GROUPS: Array<{ key: PartnerDocGroup; title: string; note: string }> = [
  { key: 'owner',    title: 'About you',      note: 'Asked once. These do not change if the shop moves.' },
  { key: 'premises', title: 'About the shop', note: 'Taken at the shop, so we can see it is really there.' },
  { key: 'business', title: 'Registration',   note: 'Only if your shop is registered. Not required.' },
  { key: 'trust',    title: 'Someone who vouches for you', note: 'Not required, but it helps.' },
];

/** What each state says to the shop, in its own words. */
const STATE: Record<string, { label: string; tone: 'good' | 'wait' | 'warn' | 'bad'; help: string }> = {
  approved: {
    label: 'Approved', tone: 'good',
    help: 'Checked and accepted. Nothing else is needed for this one.',
  },
  submitted: {
    label: 'Being checked', tone: 'wait',
    help: 'With our team. You do not need to do anything while it is here.',
  },
  needs_replacing: {
    label: 'Needs replacing', tone: 'warn',
    help: 'Nothing is wrong with what you sent. It has run out, so we need the current one.',
  },
  rejected: {
    label: 'Send it again', tone: 'bad',
    help: 'This one could not be accepted. The reason is below.',
  },
  missing: {
    label: 'Not sent yet', tone: 'wait',
    help: '',
  },
};

const dmy = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
};

/**
 * An approved document whose date has passed is EXPIRED, not approved.
 *
 * Derived rather than stored, the way the driver app does it. The server
 * has always sent expiresAt and the first version of this screen ignored
 * it, so a CAC certificate that ran out last month still showed green and
 * a shop had no reason to replace anything.
 */
function effectiveStatus(d: PartnerDocument): string {
  if (d.status === 'approved' && d.expiresAt
      && String(d.expiresAt).slice(0, 10) < new Date().toISOString().slice(0, 10)) {
    return 'needs_replacing';
  }
  return d.status;
}

export default function PartnerDocumentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();

  const [data, setData]          = useState<any>(null);
  const [loading, setLoading]    = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [busy, setBusy]          = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await partnerApi.myDocuments().catch(() => null);
    setData(d);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const docs: PartnerDocument[] = data?.documents ?? [];
  const outstanding = useMemo(
    () => docs.filter(d => d.required && ['missing', 'rejected'].includes(effectiveStatus(d))).length,
    [docs],
  );

  const toneColor = (tone: string) =>
    tone === 'good' ? colors.success
    : tone === 'warn' ? colors.warning
    : tone === 'bad'  ? colors.error
    : colors.textThird;

  /**
   * Where the phone is, right now.
   *
   * Returns null rather than throwing on a refusal or a failure. A shop
   * under a zinc roof may never get a fix, and refusing their application
   * for the building they work in would be the wrong trade entirely.
   */
  const currentPlace = async (): Promise<{ lat: number; lng: number; accuracyM: number } | null> => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return null;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      if (!pos?.coords) return null;
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: Math.round(pos.coords.accuracy ?? 9999),
      };
    } catch {
      return null;
    }
  };

  const send = async (doc: PartnerDocument) => {
    /**
     * A premises photograph must be TAKEN, not chosen.
     *
     * The location is read at the moment of the upload, so a picture
     * pulled from the gallery would be stamped with wherever the phone
     * happens to be now rather than where the picture was taken. That
     * turns the whole check into theatre. Camera only for these three;
     * everything else can come from the gallery, because a CAC
     * certificate photographed at a kitchen table is perfectly fine.
     */
    const mustBeLive = doc.needsLocation;

    if (mustBeLive) {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (!cam.granted) {
        alertDialog(
          'Camera needed',
          'This photo has to be taken at the shop, so SEIRS needs permission to use the camera.',
        );
        return;
      }
    } else {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!lib.granted) {
        alertDialog('Photos not allowed', 'SEIRS needs permission to open your photos.');
        return;
      }
    }

    const picked = mustBeLive
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (picked.canceled || !picked.assets?.[0]?.uri) return;

    setBusy(doc.docId);
    try {
      const where = mustBeLive ? await currentPlace() : null;

      // Said, but said badly. Offer the retry rather than silently
      // recording a fix nobody can argue from.
      if (mustBeLive && where && where.accuracyM > ACCURACY_LIMIT_M) {
        alertDialog(
          'Weak location',
          `Your phone is only sure of its position to about ${where.accuracyM} m. `
          + 'We will still send the photo, but standing outside for a moment gives a better reading.',
        );
      }

      const up = await uploadApi.file(picked.assets[0].uri, 'image/jpeg', 'kyc');
      if (!up?.url) throw new Error('The file did not upload.');
      await partnerApi.uploadDocument(doc.docId, up.url, where);
      await load();
      alertDialog(
        'Sent',
        `${doc.label} is with our team. We will tell you as soon as it has been looked at.`,
      );
    } catch (e: any) {
      alertDialog('Not sent', e?.message ?? 'Something went wrong. Try again in a moment.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{tx('auto.verification.documents', 'Documents')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : !data ? (
        <View style={{ padding: 20 }}>
          <Text style={[styles.help, { color: colors.textSecond }]}>
            We could not load your documents just now. Pull down to try again.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefresh(true); load().finally(() => setRefresh(false)); }}
              tintColor={colors.primary}
            />
          }
        >
          {/* What is actually left to do, before the list of everything. */}
          <View style={[styles.summary, {
            backgroundColor: outstanding > 0 ? colors.warning + '14' : colors.success + '14',
            borderColor:     outstanding > 0 ? colors.warning + '55' : colors.success + '55',
          }]}>
            <Icon
              name={outstanding > 0 ? 'AlertTriangle' : 'CheckCircle2'}
              size={16}
              color={outstanding > 0 ? colors.warning : colors.success}
            />
            <Text style={[styles.summaryText, { color: colors.text }]}>
              {outstanding > 0
                ? `${outstanding} ${outstanding === 1 ? 'document is' : 'documents are'} still needed before we can decide.`
                : 'Everything we need is in. Nothing is waiting on you.'}
            </Text>
          </View>

          <Text style={[styles.intro, { color: colors.textSecond }]}>
            Each one is checked on its own. If one needs sending again, only that one does: the rest
            keep their decisions and your application stays where it is.
          </Text>

          {GROUPS.map((g) => {
            const inGroup = docs.filter(d => d.group === g.key);
            if (inGroup.length === 0) return null;
            return (
              <View key={g.key} style={{ marginBottom: 8 }}>
                <Text style={[styles.groupTitle, { color: colors.text }]}>{g.title}</Text>
                <Text style={[styles.groupNote, { color: colors.textThird }]}>{g.note}</Text>

                {inGroup.map((d) => {
                  const status = effectiveStatus(d);
                  const st = STATE[status] ?? STATE.missing;
                  const canSend = status !== 'submitted';
                  return (
                    <View key={d.docId} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={styles.cardTop}>
                        {d.url ? (
                          <Image source={{ uri: d.url }} style={styles.thumb} resizeMode="cover" />
                        ) : (
                          <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: colors.surfaceSecond }]}>
                            <Icon name="FileText" size={20} color={colors.textThird} />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <View style={styles.labelRow}>
                            <Text style={[styles.docLabel, { color: colors.text }]}>{d.label}</Text>
                            {!d.required && (
                              <Text style={[styles.optional, { color: colors.textThird }]}>optional</Text>
                            )}
                          </View>
                          <Text style={[styles.state, { color: toneColor(st.tone) }]}>{st.label}</Text>
                          <Text style={[styles.help, { color: colors.textThird }]}>
                            {st.help || d.hint}
                          </Text>
                        </View>
                      </View>

                      {/* The reviewer's own words. Shown for a replacement too,
                          where it reads as an instruction rather than a fault. */}
                      {d.rejectionReason ? (
                        <View style={[styles.reason, { backgroundColor: colors.surfaceSecond }]}>
                          <Text style={[styles.reasonText, { color: colors.text }]}>{d.rejectionReason}</Text>
                        </View>
                      ) : null}

                      {d.canExpire && d.expiresAt ? (
                        <Text style={[styles.expiry, { color: status === 'needs_replacing' ? colors.warning : colors.textThird }]}>
                          {status === 'needs_replacing' ? 'Ran out on' : 'Valid until'} {dmy(d.expiresAt)}
                        </Text>
                      ) : null}

                      {canSend ? (
                        <Pressable
                          onPress={() => send(d)}
                          disabled={busy === d.docId}
                          style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: busy === d.docId ? 0.6 : 1 }]}
                        >
                          <Icon name={d.needsLocation ? 'Camera' : 'Upload'} size={15} color={colors.textOnPrimary} />
                          <Text style={[styles.sendBtnText, { color: colors.textOnPrimary }]}>
                            {busy === d.docId ? 'Sending...'
                              : d.needsLocation ? (d.url ? 'Take it again' : 'Take this photo')
                              : (d.url ? 'Send a new one' : 'Send this one')}
                          </Text>
                        </Pressable>
                      ) : null}

                      {d.needsLocation && canSend ? (
                        <Text style={[styles.liveNote, { color: colors.textThird }]}>
                          Taken with the camera, at the shop. We record where it was taken.
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            );
          })}

          <Text style={[styles.footNote, { color: colors.textThird }]}>
            Nothing stops because a document runs out. We will tell you, and our team decides what
            happens next. Your shop keeps taking packages while you sort it.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1,
  },
  back:        { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  summary:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1,
                 borderRadius: 12, padding: 12, marginBottom: 12 },
  summaryText: { flex: 1, fontSize: 13.5, lineHeight: 18, fontWeight: '600' },

  intro:       { fontSize: 13, lineHeight: 18, marginBottom: 18, paddingHorizontal: 2 },

  groupTitle:  { fontSize: 15, fontWeight: '700', marginBottom: 1, paddingHorizontal: 2 },
  groupNote:   { fontSize: 12, lineHeight: 16, marginBottom: 10, paddingHorizontal: 2 },

  card:        { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardTop:     { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb:       { width: 54, height: 54, borderRadius: 8 },
  thumbEmpty:  { alignItems: 'center', justifyContent: 'center' },
  labelRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  docLabel:    { fontSize: 15, fontWeight: '700' },
  optional:    { fontSize: 11, fontWeight: '600' },
  state:       { fontSize: 13, fontWeight: '700', marginTop: 2 },
  help:        { fontSize: 12, lineHeight: 16, marginTop: 3 },

  reason:      { borderRadius: 10, padding: 10, marginTop: 10 },
  reasonText:  { fontSize: 13, lineHeight: 18 },
  expiry:      { fontSize: 12, fontWeight: '600', marginTop: 8 },

  sendBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                 paddingVertical: 12, borderRadius: 10, marginTop: 12 },
  sendBtnText: { fontSize: 14, fontWeight: '700' },
  liveNote:    { fontSize: 11.5, lineHeight: 16, marginTop: 7, textAlign: 'center' },

  footNote:    { fontSize: 12, lineHeight: 17, marginTop: 6, paddingHorizontal: 2 },
});
