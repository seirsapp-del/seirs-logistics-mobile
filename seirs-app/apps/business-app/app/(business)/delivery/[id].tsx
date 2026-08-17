/**
 * One run, as the sender sees it.
 *
 * The deliveries list was a wall of cards that could not be opened
 * (founder 2026-08-17: "shouldnt they be able to see more details about
 * their packages in transit when they tap on it"). A multi-package run
 * showed "2 stops" and a total, and there was no way to learn which
 * parcel was where, or to get the code a receiver needs.
 *
 * Every package carries its own tracking code, so the sender can copy
 * one and hand it to that receiver without exposing the rest of the run.
 */
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Share, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Icon } from '@/components/Icon';
import { businessApi } from '@/services/api';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

const STATUS_COLOR: Record<string, string> = {
  pending:    '#D97706',
  assigned:   '#3A7BD5',
  picked_up:  '#6366F1',
  in_transit: '#6366F1',
  delivered:  '#16A34A',
  failed:     '#DC2626',
  cancelled:  '#6B7280',
};

const fmt = (n: any) => `₦${Math.round(Number(n ?? 0)).toLocaleString()}`;

export default function DeliveryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = Colors[isDark ? 'dark' : 'light'];

  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    businessApi.delivery(String(id))
      .then(setD)
      .catch(() => setD(null))
      .finally(() => setLoading(false));
  }, [id]);

  const copyCode = async (code: string) => {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      Share.share({ message: code }).catch(() => {});
    }
  };

  const shareCode = (code: string, receiver?: string) => {
    Share.share({
      message: `Hi${receiver ? ` ${receiver}` : ''}, track your package with SEIRS using code ${code}.`,
    }).catch(() => {});
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!d) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.center}>
          <Text style={{ color: colors.textSecond }}>Could not load this delivery.</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const stops: any[] = Array.isArray(d.stops) ? d.stops : [];
  const runColor = STATUS_COLOR[d.status] ?? colors.textThird;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={[styles.backBtn, { backgroundColor: colors.surfaceSecond }]}>
          <Icon name="ArrowLeft" size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>{d.trackingCode ?? 'Delivery'}</Text>
          <Text style={[styles.sub, { color: colors.textThird }]}>
            {stops.length > 1 ? `${stops.length} packages · one payment` : 'Single package'}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: runColor + '20' }]}>
          <Text style={[styles.badgeText, { color: runColor }]}>{String(d.status ?? '').replace('_', ' ')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.textThird }]}>COLLECTED FROM</Text>
          <Text style={[styles.cardValue, { color: colors.text }]}>{d.pickupAddress}</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.rowBetween}>
            <Text style={[styles.cardLabel, { color: colors.textThird }]}>TOTAL PAID</Text>
            <Text style={[styles.cardValue, { color: colors.text }]}>{fmt(d.price)}</Text>
          </View>
          {Number(d.partnerHandlingNgn ?? 0) > 0 && (
            <View style={styles.rowBetween}>
              <Text style={[styles.cardLabel, { color: colors.textThird }]}>COUNTER HANDLING</Text>
              <Text style={[styles.cardValue, { color: colors.textSecond }]}>{fmt(d.partnerHandlingNgn)}</Text>
            </View>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textThird }]}>
          {stops.length > 1 ? `PACKAGES (${stops.length})` : 'PACKAGE'}
        </Text>

        {stops.map((st, i) => {
          const c = STATUS_COLOR[st.status] ?? colors.textThird;
          const receiver = [st.receiverFirstName, st.receiverLastName].filter(Boolean).join(' ') || st.recipientName;
          const code = st.packageTrackingCode;
          return (
            <View key={st.id ?? i} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.rowBetween}>
                <Text style={[styles.pkgTitle, { color: colors.text }]} numberOfLines={1}>
                  {st.packageDescription?.trim() || `Package ${st.sequenceOrder ?? i + 1}`}
                </Text>
                <View style={[styles.badge, { backgroundColor: c + '20' }]}>
                  <Text style={[styles.badgeText, { color: c }]}>{String(st.status ?? 'pending').replace('_', ' ')}</Text>
                </View>
              </View>

              {!!receiver && (
                <Text style={[styles.pkgMeta, { color: colors.textSecond }]}>
                  For {receiver}{st.weightKg ? ` · ${Number(st.weightKg)}kg` : ''}
                </Text>
              )}

              <View style={styles.pkgRow}>
                <Icon name={st.destinationStoreId ? 'Store' : 'MapPin'} size={13} color={colors.textThird} />
                <Text style={[styles.pkgMeta, { color: colors.textThird, flex: 1 }]} numberOfLines={2}>
                  {st.destinationStoreName ? `Counter: ${st.destinationStoreName}` : st.address}
                </Text>
              </View>

              {!!st.packagePriceNgn && (
                <Text style={[styles.pkgMeta, { color: colors.textThird }]}>{fmt(st.packagePriceNgn)}</Text>
              )}

              {/* The receiver's own code. Sharing this instead of the run
                  code keeps the other receivers' details private. */}
              {!!code && (
                <View style={[styles.codeRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.code, { color: colors.text }]}>{code}</Text>
                  <Pressable onPress={() => copyCode(code)} hitSlop={8} style={styles.codeBtn}>
                    <Icon name={copied === code ? 'Check' : 'Copy'} size={14} color={colors.primary} />
                    <Text style={[styles.codeBtnText, { color: colors.primary }]}>
                      {copied === code ? 'Copied' : 'Copy'}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => shareCode(code, st.receiverFirstName)} hitSlop={8} style={styles.codeBtn}>
                    <Icon name="Share2" size={14} color={colors.primary} />
                    <Text style={[styles.codeBtnText, { color: colors.primary }]}>Send</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}

        {stops.length === 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.textSecond, fontSize: 13 }}>
              {d.dropoffAddress ?? 'No package details recorded for this delivery.'}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn:  { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 16, fontWeight: '800' },
  sub:      { fontSize: 12, marginTop: 2 },
  badge:    { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  badgeText:{ fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  card:     { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12, gap: 6 },
  cardLabel:{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  cardValue:{ fontSize: 14, fontWeight: '600' },
  divider:  { height: 1, marginVertical: 8 },
  rowBetween:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle:{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8, marginTop: 6 },
  pkgTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  pkgMeta:  { fontSize: 12 },
  pkgRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  codeRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, paddingTop: 10, marginTop: 4 },
  code:     { flex: 1, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  codeBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  codeBtnText:{ fontSize: 12, fontWeight: '700' },
});
