import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Share, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import * as Clipboard from 'expo-clipboard';
import { MOCK_TRIPS } from '@/constants/mockData';
import { deliveriesApi } from '@/services/api';
import { useEffect } from 'react';

// A delivery only has a live location worth sharing while it is running.
const LIVE_STATUSES = ['assigned', 'accepted', 'picked_up', 'in_transit', 'arrived'];

const SHARE_VIA = [
  { id: 'whatsapp', label: 'WhatsApp',    icon: 'logo-whatsapp', color: '#25D366' },
  { id: 'sms',      label: 'SMS',         icon: 'chatbubble',    color: '#3A7BD5' },
  { id: 'copy',     label: 'Copy Link',   icon: 'copy-outline',  color: '#6B7280' },
  { id: 'more',     label: 'More',        icon: 'share-outline', color: '#0F2B4C' },
];

export default function ShareTripScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { t }   = useTranslation();
  const { id, code } = useLocalSearchParams<{ id?: string; code?: string }>();

  const [copied, setCopied] = useState(false);

  /**
   * The route rendered on the share card MUST be the customer's own.
   *
   * This was `MOCK_TRIPS.find(tr => tr.id === id) ?? MOCK_TRIPS[2]`. Real
   * deliveries carry UUIDs so the find always missed, and every share card
   * printed the fictional Surulere to Ajah trip. The worst path was the
   * drawer SOS: it opens this screen with no deliveryId at all, so someone
   * sharing their location in an emergency shared an invented route
   * (sweep C-2.1, 2026-08-23).
   *
   * Exact match only now. No id, no match, no addresses: the screen says so
   * instead of inventing a journey.
   */
  const mockTrip = MOCK_TRIPS.find(tr => tr.id === id) ?? null;
  const [fetchedTrip, setFetchedTrip] = useState<any | null>(null);
  const [lookupDone,  setLookupDone]  = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (mockTrip) { setLookupDone(true); return; }

    if (id) {
      deliveriesApi.get(String(id))
        .then((d: any) => { if (!cancelled) setFetchedTrip(d ?? null); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLookupDone(true); });
      return () => { cancelled = true; };
    }

    // Opened from the drawer SOS with no id. Rather than share nothing (or
    // worse, a fabricated route) find the customer's own trip in progress.
    deliveriesApi.myDeliveries(1, 10)
      .then((res: any) => {
        if (cancelled) return;
        const live = (res?.items ?? []).find((d: any) =>
          LIVE_STATUSES.includes(String(d?.status)));
        if (live) setFetchedTrip(live);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLookupDone(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const trip = fetchedTrip ?? mockTrip;

  // Callers may hand us the tracking code directly; otherwise it comes off
  // the delivery we just fetched. Never off the mock table for a real id.
  const trackingCode: string | null = code ?? trip?.trackingCode ?? null;

  // Public tracking page lives on the marketing website: seirs.app/track/{code}.
  // Anyone with the code can open this in any browser without a login.
  const shareLink = trackingCode ? `https://seirs.app/track/${trackingCode}` : null;

  // "Live Tracking Active" was rendered unconditionally, including when the
  // screen was opened with no delivery at all (sweep C-5.11).
  const isLive = !!trip && LIVE_STATUSES.includes(String(trip.status));

  const handleShare = async (via: string) => {
    if (!shareLink) return; // code still loading: buttons are inert, not wrong
    if (via === 'copy') {
      // The label used to flip to "Copied!" while the clipboard was left
      // untouched, so the customer pasted whatever was there before
      // (sweep C-1.4).
      try {
        await Clipboard.setStringAsync(shareLink);
      } catch {
        return; // no false "Copied!" if the clipboard write failed
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    try {
      await Share.share({
        title:   'Track my SEIRS trip',
        message: `Hey! Track my live trip on SEIRS: ${shareLink}\n\nTracking code: ${trackingCode}`,
        url:     shareLink,
      });
    } catch {}
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t('shareTrip.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Live badge. Only when a real delivery is actually running. */}
        {isLive && (
          <View style={[styles.liveBanner, { backgroundColor: isDark ? '#001800' : '#F0FDF4', borderColor: '#BBF7D0' }]}>
            <View style={styles.liveDot} />
            <Text style={[styles.liveText, { color: '#16A34A' }]}>{t('shareTrip.liveActive')}</Text>
          </View>
        )}

        {!trip && lookupDone ? (
          /* No delivery to share. Reached from the drawer SOS when nothing
             is in progress. Says so rather than printing a made-up route. */
          <View style={[styles.tripCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            <Text style={[styles.infoTitle, { color: theme.text }]}>{t('shareTrip.noTripTitle')}</Text>
            <Text style={[styles.infoDesc, { color: theme.textSecond }]}>{t('shareTrip.noTripDesc')}</Text>
          </View>
        ) : (
          <>
            {/* Trip snapshot */}
            <View style={[styles.tripCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
              <View style={styles.tripRoute}>
                <View style={[styles.routeDot, { backgroundColor: '#22C55E' }]} />
                <Text style={[styles.routeAddr, { color: theme.text }]} numberOfLines={1}>
                  {trip?.pickupAddress ?? '…'}
                </Text>
              </View>
              <View style={[styles.routeLine, { backgroundColor: theme.border }]} />
              <View style={styles.tripRoute}>
                <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                <Text style={[styles.routeAddr, { color: theme.text }]} numberOfLines={1}>
                  {trip?.dropoffAddress ?? '…'}
                </Text>
              </View>
              <View style={[styles.trackingRow, { borderTopColor: theme.border }]}>
                <Ionicons name="barcode-outline" size={14} color={theme.textSecond} />
                <Text style={[styles.trackCode, { color: theme.textSecond }]}>{trackingCode ?? '…'}</Text>
              </View>
            </View>

            {/* Share link */}
            <View style={[styles.linkCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
              <Text style={[styles.linkLabel, { color: theme.textSecond }]}>Tracking Link</Text>
              <View style={[styles.linkRow, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
                <Ionicons name="link-outline" size={16} color={theme.textThird} />
                <Text style={[styles.linkText, { color: theme.text }]} numberOfLines={1}>{shareLink ?? '…'}</Text>
                <Pressable
                  style={[styles.copyBtn, { backgroundColor: copied ? '#22C55E' : theme.primary, opacity: shareLink ? 1 : 0.5 }]}
                  onPress={() => handleShare('copy')}
                  disabled={!shareLink}
                >
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color="#fff" />
                  <Text style={styles.copyBtnText}>{copied ? t('shareTrip.linkCopied') : t('shareTrip.copyLink')}</Text>
                </Pressable>
              </View>
            </View>

            {/* Share via */}
            <Text style={[styles.viaLabel, { color: theme.textSecond }]}>Share Via</Text>
            <View style={styles.viaRow}>
              {SHARE_VIA.map(opt => (
                <Pressable
                  key={opt.id}
                  style={[styles.viaItem, { opacity: shareLink ? 1 : 0.5 }]}
                  onPress={() => handleShare(opt.id)}
                  disabled={!shareLink}
                >
                  <View style={[styles.viaIcon, { backgroundColor: opt.color + '15' }]}>
                    <Ionicons name={opt.icon as any} size={24} color={opt.color} />
                  </View>
                  <Text style={[styles.viaText, { color: theme.textSecond }]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Access info */}
            <View style={[styles.infoCard, { backgroundColor: isDark ? '#001020' : '#EFF6FF', borderColor: theme.primary + '30' }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color={theme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoTitle, { color: theme.text }]}>Secure Sharing</Text>
                <Text style={[styles.infoDesc, { color: theme.textSecond }]}>
                  Only people with this link can view your live location. The link expires when your trip ends.
                </Text>
              </View>
            </View>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  liveBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  liveDot:    { width: 9, height: 9, borderRadius: 5, backgroundColor: '#22C55E' },
  liveText:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  tripCard:   { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.xs },
  tripRoute:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  routeDot:   { width: 9, height: 9, borderRadius: 5 },
  routeAddr:  { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  routeLine:  { width: 2, height: 14, marginLeft: 4 },
  trackingRow:{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingTop: Spacing.sm, marginTop: Spacing.sm, borderTopWidth: 1 },
  trackCode:  { fontSize: FontSize.sm, letterSpacing: 0.5 },

  linkCard:  { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  linkLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  linkRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, paddingLeft: Spacing.sm },
  linkText:  { flex: 1, fontSize: FontSize.sm },
  copyBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 10, borderRadius: Radius.md },
  copyBtnText:{ color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  viaLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  viaRow:   { flexDirection: 'row', justifyContent: 'space-around' },
  viaItem:  { alignItems: 'center', gap: Spacing.xs },
  viaIcon:  { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  viaText:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  infoCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  infoTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, marginBottom: 3 },
  infoDesc:  { fontSize: FontSize.xs, lineHeight: 18 },
});
