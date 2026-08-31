import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput, StatusBar,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Icon } from '@/components/Icon';
import { tint } from '@/constants/tint';
import { useSeirsDialog } from '@/components/SeirsDialog';
import { useColors, useTheme } from '@/context/ThemeContext';
import { businessApi, supportApi } from '@/services/api';

/**
 * Report an issue for business senders (founder 2026-08-22: the
 * customer app had this and business should too; same design both
 * sides, and the report asks WHICH ORDER it is about, one specific
 * delivery or all orders).
 *
 * Same support system as everything else: one ticket, linkedDeliveryId
 * set when a specific order is chosen.
 */

const CATEGORIES = [
  { id: 'delivery', icon: 'Package',        label: 'Delivery issue', desc: 'A delivery went wrong or is stuck',   topic: 'delivery' },
  { id: 'billing',  icon: 'Banknote',       label: 'Billing',        desc: 'Charged wrongly or a refund question', topic: 'billing' },
  { id: 'driver',   icon: 'Bike',           label: 'Driver',         desc: 'A problem with a driver on a job',      topic: 'driver' },
  { id: 'account',  icon: 'User',           label: 'Account',        desc: 'Access, team or business details',     topic: 'account' },
  { id: 'other',    icon: 'MoreHorizontal', label: 'Other',          desc: 'Something else happened',              topic: 'other' },
] as const;

export default function BusinessReportScreen() {
  // Themed dialogs, not the Android system AlertDialog (work order
  // item 4, 2026-08-24). Same signature as Alert.alert, so these are
  // straight renames, but it renders every button instead of
  // silently discarding the fourth.
  const dialog = useSeirsDialog();
  const router  = useRouter();
  const colors  = useColors();
  const { isDark } = useTheme();
  const { deliveryId } = useLocalSearchParams<{ deliveryId?: string }>();

  const [category, setCategory] = useState<string | null>(null);
  const [detail,   setDetail]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);

  const [orders,     setOrders]     = useState<any[]>([]);
  const [ordersBusy, setOrdersBusy] = useState(true);
  const [orderId,    setOrderId]    = useState<string | 'all'>('all');

  useEffect(() => {
    businessApi.deliveries(1)
      .then((res: any) => {
        const items = (Array.isArray(res) ? res : res?.items ?? []).slice(0, 5);
        setOrders(items);
        if (typeof deliveryId === 'string' && items.some((d: any) => d.id === deliveryId)) {
          setOrderId(deliveryId);
        }
      })
      .catch(() => setOrders([]))
      .finally(() => setOrdersBusy(false));
  }, [deliveryId]);

  const handleSubmit = async () => {
    if (!category) return;
    const cat = CATEGORIES.find(c => c.id === category)!;
    const order = orderId !== 'all' ? orders.find(d => d.id === orderId) : null;
    setLoading(true);
    try {
      await supportApi.create({
        topic:        cat.topic,
        subject:      `${cat.label} · ${order ? (order.trackingNumber ?? order.trackingCode ?? order.id.slice(0, 8).toUpperCase()) : 'All orders'}`,
        firstMessage: detail.trim() || cat.desc,
        linkedDeliveryId: order ? order.id : undefined,
      });
      setDone(true);
    } catch (e: any) {
      dialog.alert('Could not send', e?.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.doneWrap}>
          {/* '#16A34A20' composited to #D9EBDB over the cream light
              background: the exact grey-green sludge the founder flagged on
              the driver ACTIVE JOB card, 2.65:1 against its own tick
              (2026-08-24). Opaque token, correct in both themes. */}
          <View style={[styles.doneIcon, { backgroundColor: tint('green', isDark).bg }]}>
            <Icon name="Check" size={34} color={tint('green', isDark).fg} />
          </View>
          <Text style={[styles.doneTitle, { color: colors.text }]}>Report received</Text>
          <Text style={[styles.doneBody, { color: colors.textSecond }]}>
            Support has your report and will reply in Messages. You can add
            more detail there any time.
          </Text>
          <Pressable
            style={[styles.cta, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.ctaText}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const canSubmit = !!category && !loading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.heading, { color: colors.text }]}>Report an issue</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={[styles.sectionLabel, { color: colors.textSecond }]}>WHAT HAPPENED?</Text>
          <View style={styles.chipWrap}>
            {CATEGORIES.map(c => {
              const active = category === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCategory(c.id)}
                  style={[
                    styles.chip,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    active && { borderColor: colors.primary },
                  ]}
                >
                  <Icon name={c.icon as any} size={15} color={active ? colors.primary : colors.textSecond} />
                  <Text style={[styles.chipText, { color: active ? colors.primary : colors.text }]}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textSecond }]}>WHICH ORDER IS THIS ABOUT?</Text>
          <Pressable
            onPress={() => setOrderId('all')}
            style={[
              styles.orderRow,
              { backgroundColor: colors.surface, borderColor: orderId === 'all' ? colors.primary : colors.border },
            ]}
          >
            <View style={[styles.radio, { borderColor: orderId === 'all' ? colors.primary : colors.textThird },
              orderId === 'all' && { backgroundColor: colors.primary }]}>
              {orderId === 'all' && <Icon name="Check" size={11} color="#fff" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.orderTitle, { color: colors.text }]}>All orders</Text>
              <Text style={[styles.orderSub, { color: colors.textThird }]}>Not about one specific delivery</Text>
            </View>
          </Pressable>
          {ordersBusy ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 10 }} />
          ) : orders.map((d: any) => {
            const active = orderId === d.id;
            return (
              <Pressable
                key={d.id}
                onPress={() => setOrderId(d.id)}
                style={[
                  styles.orderRow,
                  { backgroundColor: colors.surface, borderColor: active ? colors.primary : colors.border },
                ]}
              >
                <View style={[styles.radio, { borderColor: active ? colors.primary : colors.textThird },
                  active && { backgroundColor: colors.primary }]}>
                  {active && <Icon name="Check" size={11} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.orderTitle, { color: colors.text }]} numberOfLines={1}>
                    {d.trackingNumber ?? d.trackingCode ?? d.id.slice(0, 8).toUpperCase()}
                  </Text>
                  <Text style={[styles.orderSub, { color: colors.textThird }]} numberOfLines={1}>
                    {(d.dropoffAddress ?? d.pickupAddress ?? '-')} · {new Date(d.createdAt ?? Date.now()).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              </Pressable>
            );
          })}

          <Text style={[styles.sectionLabel, { color: colors.textSecond }]}>DESCRIBE THE ISSUE</Text>
          <TextInput
            style={[styles.detailInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            value={detail}
            onChangeText={setDetail}
            placeholder="Include tracking codes, times, or delivery IDs when relevant."
            placeholderTextColor={colors.textThird}
            multiline
            textAlignVertical="top"
          />

          <Pressable
            style={[styles.cta, { backgroundColor: colors.primary }, !canSubmit && { opacity: 0.5 }]}
            disabled={!canSubmit}
            onPress={handleSubmit}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.ctaText}>Send report</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Same design language and values as the customer report screen: the
// two must read as siblings (founder 2026-08-22).
const styles = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  backBtn:      { justifyContent: 'center', alignItems: 'center' },
  heading:      { fontSize: 18, fontWeight: '700' },
  scroll:       { padding: 16, paddingBottom: 32 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 18, marginBottom: 10 },
  chipWrap:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip:         { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, height: 40, borderRadius: 20, borderWidth: 1 },
  chipText:     { fontSize: 13, fontWeight: '600' },
  orderRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  radio:        { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  orderTitle:   { fontSize: 14, fontWeight: '600', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as any },
  orderSub:     { fontSize: 12, marginTop: 1 },
  detailInput:  { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 110, fontSize: 14 },
  cta:          { marginTop: 22, height: 52, borderRadius: 999, justifyContent: 'center', alignItems: 'center' },
  ctaText:      { color: '#fff', fontSize: 15, fontWeight: '700' },
  doneWrap:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 12 },
  doneIcon:     { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center' },
  doneTitle:    { fontSize: 18, fontWeight: '700' },
  doneBody:     { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
