/**
 * A partner store's KYC documents, replaceable one at a time.
 *
 * Until 2026-09-02 a shop had no way to see what had been decided about
 * its files, and no way to answer a refusal except by submitting the
 * whole application again, which reset the store to pending review and
 * threw away the decisions already made on the other two documents.
 *
 * So the shop can now see each document's own state, read the exact
 * words a reviewer wrote about it, and send that one file again.
 *
 * The tone difference between the two refusal states is the point rather
 * than decoration. Rejected means something is wrong with what was sent.
 * Needs replacing means it was fine and has run out, which is time
 * passing, not a fault, and it is amber rather than red everywhere it
 * appears.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Icon } from '@/components/Icon';
import { uploadApi, partnerApi } from '@/services/api';
import { useColors } from '@/context/ThemeContext';
import { alertDialog } from '@/components/SeirsDialog';

type Doc = {
  id: string | null;
  docId: string;
  label: string;
  url: string | null;
  status: 'submitted' | 'approved' | 'rejected' | 'needs_replacing' | 'missing';
  rejectionReason: string | null;
  reviewedAt: string | null;
  expiresAt: string | null;
  canExpire: boolean;
  version: number;
};

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
    help: 'We do not have this one.',
  },
};

const dmy = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
};

export default function PartnerDocumentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();

  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [busy, setBusy]         = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await partnerApi.myDocuments().catch(() => null);
    setData(d);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const toneColor = (tone: string) =>
    tone === 'good' ? colors.success
    : tone === 'warn' ? colors.warning
    : tone === 'bad'  ? colors.error
    : colors.textThird;

  const replace = async (doc: Doc) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      alertDialog('Photos not allowed', 'SEIRS needs permission to open your photos so you can send the document.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (picked.canceled || !picked.assets?.[0]?.uri) return;

    setBusy(doc.docId);
    try {
      const up = await uploadApi.file(picked.assets[0].uri, 'image/jpeg', 'kyc');
      if (!up?.url) throw new Error('The file did not upload.');
      await partnerApi.uploadDocument(doc.docId, up.url);
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Documents</Text>
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
          <Text style={[styles.intro, { color: colors.textSecond }]}>
            Each document is checked on its own. If one needs sending again, only that one does:
            the rest keep their decisions and your application stays where it is.
          </Text>

          {(data.documents as Doc[]).map((d) => {
            const st = STATE[d.status] ?? STATE.missing;
            const expired = d.expiresAt && new Date(d.expiresAt) < new Date();
            const canSend = d.status !== 'submitted';
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
                    <Text style={[styles.docLabel, { color: colors.text }]}>{d.label}</Text>
                    <Text style={[styles.state, { color: toneColor(st.tone) }]}>{st.label}</Text>
                    <Text style={[styles.help, { color: colors.textThird }]}>{st.help}</Text>
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
                  <Text style={[styles.expiry, { color: expired ? colors.warning : colors.textThird }]}>
                    {expired ? 'Ran out on' : 'Valid until'} {dmy(d.expiresAt)}
                  </Text>
                ) : null}

                {canSend ? (
                  <Pressable
                    onPress={() => replace(d)}
                    disabled={busy === d.docId}
                    style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: busy === d.docId ? 0.6 : 1 }]}
                  >
                    <Icon name="Upload" size={15} color={colors.textOnPrimary} />
                    <Text style={[styles.sendBtnText, { color: colors.textOnPrimary }]}>
                      {busy === d.docId ? 'Sending...' : d.url ? 'Send a new one' : 'Send this one'}
                    </Text>
                  </Pressable>
                ) : null}
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

  intro:       { fontSize: 13, lineHeight: 18, marginBottom: 14, paddingHorizontal: 2 },
  card:        { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardTop:     { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb:       { width: 54, height: 54, borderRadius: 8 },
  thumbEmpty:  { alignItems: 'center', justifyContent: 'center' },
  docLabel:    { fontSize: 15, fontWeight: '700' },
  state:       { fontSize: 13, fontWeight: '700', marginTop: 2 },
  help:        { fontSize: 12, lineHeight: 16, marginTop: 3 },

  reason:      { borderRadius: 10, padding: 10, marginTop: 10 },
  reasonText:  { fontSize: 13, lineHeight: 18 },
  expiry:      { fontSize: 12, fontWeight: '600', marginTop: 8 },

  sendBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10, marginTop: 12 },
  sendBtnText: { fontSize: 14, fontWeight: '700' },

  footNote:    { fontSize: 12, lineHeight: 17, marginTop: 6, paddingHorizontal: 2 },
});
