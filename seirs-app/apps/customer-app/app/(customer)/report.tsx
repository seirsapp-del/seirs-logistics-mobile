import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput, StatusBar,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/Icon';
import { supportApi, deliveriesApi } from '@/services/api';
import { showDialog } from '@/components/SeirsDialog';

/**
 * Report an issue, rebuilt in the business design language (founder
 * 2026-08-22: the feature stays, the design follows business; both this
 * and the new business twin ask WHICH ORDER the report is about, a
 * specific one or the whole account).
 *
 * Submits into the real support system: one ticket, linkedDeliveryId
 * set when a specific order is chosen so the agent opens the right
 * delivery without asking.
 */

export default function ReportScreen() {
  const router   = useRouter();
  const cs       = useColorScheme();
  const theme    = Colors[cs ?? 'light'];
  const isDark   = cs === 'dark';
  const { t }    = useTranslation();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();

  // Translated each render so language switches reflect live.
  const CATEGORIES = [
    { id: 'lost_item',  icon: 'ShoppingBag',  label: t('report.lostItem'),        desc: 'Left something in the vehicle' },
    { id: 'driver',     icon: 'User',         label: t('report.driverBehaviour'), desc: 'Rude, dangerous or unprofessional' },
    { id: 'overcharge', icon: 'Banknote',     label: t('report.paymentIssue'),    desc: 'Charged more than the quoted fare' },
    { id: 'route',      icon: 'Navigation',   label: t('report.wrongAddress'),    desc: 'Driver took an unexpected route' },
    { id: 'vehicle',    icon: 'Car',          label: t('report.damagedPackage'),  desc: 'Dirty or unsafe vehicle' },
    { id: 'other',      icon: 'MoreHorizontal', label: t('report.other'),         desc: 'Something else happened' },
  ] as const;

  const [category, setCategory] = useState<string | null>(null);
  const [detail,   setDetail]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);

  // Which order is this about? "All orders" or one of the recent five.
  // A tripId arriving from Trip Details preselects that order.
  const [orders,      setOrders]      = useState<any[]>([]);
  const [ordersBusy,  setOrdersBusy]  = useState(true);
  const [orderId,     setOrderId]     = useState<string | 'all'>('all');

  useEffect(() => {
    deliveriesApi.myDeliveries(1, 5)
      .then((res: any) => {
        const items = res?.items ?? [];
        setOrders(items);
        const isUuid = typeof tripId === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tripId);
        if (isUuid && items.some((d: any) => d.id === tripId)) setOrderId(String(tripId));
      })
      .catch(() => setOrders([]))
      .finally(() => setOrdersBusy(false));
  }, [tripId]);

  const handleSubmit = async () => {
    if (!category) return;
    const cat = CATEGORIES.find(c => c.id === category)!;
    const order = orderId !== 'all' ? orders.find(d => d.id === orderId) : null;
    setLoading(true);
    try {
      const TOPIC_MAP: Record<string, 'billing' | 'driver' | 'account' | 'delivery' | 'other'> = {
        lost_item: 'delivery', driver: 'driver', overcharge: 'billing',
        route: 'delivery', vehicle: 'driver', other: 'other',
      };
      await supportApi.create({
        topic:        TOPIC_MAP[category] ?? 'other',
        subject:      `${cat.label} · ${order ? (order.trackingCode ?? order.id.slice(0, 8).toUpperCase()) : 'All orders'}`,
        firstMessage: detail.trim() || cat.desc,
        linkedDeliveryId: order ? order.id : undefined,
      });
      setDone(true);
    } catch (e: any) {
      showDialog({ title: t('rateDriver.couldNotSubmit'), message: e?.message ?? t('rateDriver.tryAgain') });
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.doneWrap}>
          <View style={[styles.doneIcon, { backgroundColor: '#16A34A20' }]}>
            <Icon name="Check" size={34} color="#16A34A" />
          </View>
          <Text style={[styles.doneTitle, { color: theme.text }]}>Report received</Text>
          <Text style={[styles.doneBody, { color: theme.textSecond }]}>
            Support has your report and will reply in Messages. You can add
            more detail there any time.
          </Text>
          <Pressable
            style={[styles.cta, { backgroundColor: theme.primary }]}
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.heading, { color: theme.text }]}>Report an issue</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>WHAT HAPPENED?</Text>
          <View style={styles.chipWrap}>
            {CATEGORIES.map(c => {
              const active = category === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCategory(c.id)}
                  style={[
                    styles.chip,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                    active && { borderColor: theme.primary },
                  ]}
                >
                  <Icon name={c.icon as any} size={15} color={active ? theme.primary : theme.textSecond} />
                  <Text style={[styles.chipText, { color: active ? theme.primary : theme.text }]}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>WHICH ORDER IS THIS ABOUT?</Text>
          <Pressable
            onPress={() => setOrderId('all')}
            style={[
              styles.orderRow,
              { backgroundColor: theme.surface, borderColor: orderId === 'all' ? theme.primary : theme.border },
            ]}
          >
            <View style={[styles.radio, { borderColor: orderId === 'all' ? theme.primary : theme.textThird },
              orderId === 'all' && { backgroundColor: theme.primary }]}>
              {orderId === 'all' && <Icon name="Check" size={11} color="#fff" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.orderTitle, { color: theme.text }]}>All orders</Text>
              <Text style={[styles.orderSub, { color: theme.textThird }]}>Not about one specific delivery</Text>
            </View>
          </Pressable>
          {ordersBusy ? (
            <ActivityIndicator color={theme.primary} style={{ marginVertical: 10 }} />
          ) : orders.map((d: any) => {
            const active = orderId === d.id;
            return (
              <Pressable
                key={d.id}
                onPress={() => setOrderId(d.id)}
                style={[
                  styles.orderRow,
                  { backgroundColor: theme.surface, borderColor: active ? theme.primary : theme.border },
                ]}
              >
                <View style={[styles.radio, { borderColor: active ? theme.primary : theme.textThird },
                  active && { backgroundColor: theme.primary }]}>
                  {active && <Icon name="Check" size={11} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.orderTitle, { color: theme.text }]} numberOfLines={1}>
                    {d.trackingCode ?? d.id.slice(0, 8).toUpperCase()}
                  </Text>
                  <Text style={[styles.orderSub, { color: theme.textThird }]} numberOfLines={1}>
                    {(d.dropoffAddress ?? '-')} · {new Date(d.createdAt ?? Date.now()).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              </Pressable>
            );
          })}

          <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>DESCRIBE THE ISSUE</Text>
          <TextInput
            style={[styles.detailInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
            value={detail}
            onChangeText={setDetail}
            placeholder="Include times, names, or anything that helps us sort it out."
            placeholderTextColor={theme.textThird}
            multiline
            textAlignVertical="top"
          />

          <Pressable
            style={[styles.cta, { backgroundColor: theme.primary }, !canSubmit && { opacity: 0.5 }]}
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

// Business design language: bordered surface header, uppercase section
// labels, outline chips, radio order rows, one big pill CTA.
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
