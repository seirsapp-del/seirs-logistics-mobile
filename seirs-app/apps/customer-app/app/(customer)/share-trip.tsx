import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Share, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { MOCK_TRIPS, MOCK_USER } from '@/constants/mockData';

const SHARE_VIA = [
  { id: 'whatsapp', label: 'WhatsApp',    icon: 'logo-whatsapp', color: '#25D366' },
  { id: 'sms',      label: 'SMS',         icon: 'chatbubble',    color: '#3A86FF' },
  { id: 'copy',     label: 'Copy Link',   icon: 'copy-outline',  color: '#6B7280' },
  { id: 'more',     label: 'More',        icon: 'share-outline', color: '#8B5CF6' },
];

export default function ShareTripScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { id }  = useLocalSearchParams<{ id?: string }>();

  const trip = MOCK_TRIPS.find(t => t.id === id) ?? MOCK_TRIPS[2];
  const [copied, setCopied] = useState(false);

  const shareLink = `https://track.seirs.app/${trip.trackingCode}`;

  const handleShare = async (via: string) => {
    if (via === 'copy') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    try {
      await Share.share({
        title:   'Track my SEIRS trip',
        message: `Hey! Track my live trip on SEIRS: ${shareLink}\n\nTracking code: ${trip.trackingCode}`,
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
        <Text style={[styles.title, { color: theme.text }]}>Share Trip</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Live badge */}
        <View style={[styles.liveBanner, { backgroundColor: isDark ? '#001800' : '#F0FDF4', borderColor: '#BBF7D0' }]}>
          <View style={styles.liveDot} />
          <Text style={[styles.liveText, { color: '#16A34A' }]}>Live Tracking Active</Text>
        </View>

        {/* Trip snapshot */}
        <View style={[styles.tripCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <View style={styles.tripRoute}>
            <View style={[styles.routeDot, { backgroundColor: '#22C55E' }]} />
            <Text style={[styles.routeAddr, { color: theme.text }]} numberOfLines={1}>{trip.pickupAddress}</Text>
          </View>
          <View style={[styles.routeLine, { backgroundColor: theme.border }]} />
          <View style={styles.tripRoute}>
            <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
            <Text style={[styles.routeAddr, { color: theme.text }]} numberOfLines={1}>{trip.dropoffAddress}</Text>
          </View>
          <View style={[styles.trackingRow, { borderTopColor: theme.border }]}>
            <Ionicons name="barcode-outline" size={14} color={theme.textSecond} />
            <Text style={[styles.trackCode, { color: theme.textSecond }]}>{trip.trackingCode}</Text>
          </View>
        </View>

        {/* Share link */}
        <View style={[styles.linkCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.linkLabel, { color: theme.textSecond }]}>Tracking Link</Text>
          <View style={[styles.linkRow, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Ionicons name="link-outline" size={16} color={theme.textThird} />
            <Text style={[styles.linkText, { color: theme.text }]} numberOfLines={1}>{shareLink}</Text>
            <Pressable
              style={[styles.copyBtn, { backgroundColor: copied ? '#22C55E' : theme.primary }]}
              onPress={() => handleShare('copy')}
            >
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color="#fff" />
              <Text style={styles.copyBtnText}>{copied ? 'Copied!' : 'Copy'}</Text>
            </Pressable>
          </View>
        </View>

        {/* Share via */}
        <Text style={[styles.viaLabel, { color: theme.textSecond }]}>Share Via</Text>
        <View style={styles.viaRow}>
          {SHARE_VIA.map(opt => (
            <Pressable
              key={opt.id}
              style={styles.viaItem}
              onPress={() => handleShare(opt.id)}
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
