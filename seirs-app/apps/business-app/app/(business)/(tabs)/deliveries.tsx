import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, Pressable, StyleSheet, FlatList, TextInput, ActivityIndicator, Alert, Linking, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Drawer } from '@/components/Drawer';
import { businessApi, paymentsApi } from '@/services/api';
import { useColors } from '@/context/ThemeContext';
import { vehicleLabel } from '@/constants/vehicles';
import { naira } from '@/utils/money';

const STATUSES = ['all', 'pending', 'assigned', 'in_transit', 'delivered', 'cancelled'];

const STATUS_LABEL: Record<string, string> = {
  all:        'All',
  pending:    'Pending',
  assigned:   'Assigned',
  in_transit: 'In Transit',
  delivered:  'Delivered',
  cancelled:  'Cancelled',
};

const STATUS_COLOR: Record<string, string> = {
  pending:    '#D97706',
  assigned:   '#3A7BD5',
  in_transit: '#0F2B4C',
  delivered:  '#16A34A',
  cancelled:  '#DC2626',
};


interface Delivery {
  id:              string;
  trackingNumber?: string;
  trackingCode?:   string;
  dropoffAddress?: string;
  pickupAddress?:  string;
  status:          string;
  price:           number;
  vehicleType:     string;
  createdAt:       string;
  stops?:          any[];
  isMultiStop?:    boolean;
  /** Set when the fare has actually been collected and escrowed. */
  paymentHeldAt?:  string | null;
}

export default function DeliveriesScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [paying, setPaying] = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status,     setStatus]     = useState('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();
  const [search,     setSearch]     = useState('');
  // One-tap: the default saved card (tokenized on an earlier payment).
  const [savedCard, setSavedCard] = useState<any | null>(null);
  useEffect(() => {
    paymentsApi.listSavedCards()
      .then((cards: any[]) => {
        if (Array.isArray(cards) && cards.length > 0) {
          setSavedCard(cards.find((c) => c.isDefault) ?? cards[0]);
        }
      })
      .catch(() => { /* hosted checkout only */ });
  }, []);
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(false);
  const [loadError,  setLoadError]  = useState(false);

  const load = useCallback(async (p = 1, reset = false) => {
    if (p === 1) setLoading(true);
    try {
      const data = await businessApi.deliveries(p, status !== 'all' ? status : undefined, search || undefined);
      const items = Array.isArray(data) ? data : data?.items ?? [];
      setDeliveries((prev) => (reset || p === 1 ? items : [...prev, ...items]));
      setHasMore(data?.hasMore ?? false);
      setPage(p);
      setLoadError(false);
    } catch {
      // try/finally with no catch made this an unhandled rejection and the
      // list silently kept its previous contents, so a dead network looked
      // like "nothing changed" (B-10.9).
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status, search]);

  useEffect(() => { load(1, true); }, [status, search]);

  const onRefresh = () => { setRefreshing(true); load(1, true); };

  const handleCancel = (item: Delivery) => {
    Alert.alert(
      'Cancel delivery?',
      `Tracking: ${item.trackingNumber ?? item.trackingCode ?? item.id.slice(0, 8)}. The driver will be notified. If you already paid and the fare is still held, it is refunded to the card you paid with. This cannot be undone.`,
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Cancel delivery', style: 'destructive', onPress: async () => {
          try {
            await businessApi.cancelDelivery(item.id);
            load();
          } catch (e: any) {
            Alert.alert('Could not cancel', e?.message ?? 'Try again.');
          }
        } },
      ],
    );
  };

  /**
   * Let an unpaid booking be paid for.
   *
   * A booking whose payment did not go through sat as Pending with
   * Cancel as its ONLY action: the sender could not retry, could not
   * open a checkout, and could do nothing but throw the order away
   * (founder, on device 2026-08-19). A dead-end order is a lost sale and
   * a support ticket.
   */
  /** The hosted Flutterwave page: full checkout, any card or method. */
  const openCheckout = async (item: Delivery) => {
    try {
      setPaying(item.id);
      const res = await paymentsApi.initiate(item.id, 'card', 'card');
      const url = res?.authorizationUrl;
      if (!url) {
        Alert.alert('Could not start payment', res?.error ?? 'Please try again in a moment.');
        return;
      }
      const opened = await Linking.canOpenURL(url);
      if (!opened) {
        Alert.alert('Could not open checkout', 'Your device blocked the payment page.');
        return;
      }
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert('Could not start payment', e?.message ?? 'Please try again in a moment.');
    } finally {
      setPaying(null);
    }
  };

  /**
   * Pay now: one tap on the saved card when there is one (founder
   * 2026-08-22: nobody re-types 16 digits to finish an order), with the
   * full checkout one button away. No saved card = straight to checkout.
   */
  const handlePay = (item: Delivery) => {
    if (!savedCard) { openCheckout(item); return; }
    Alert.alert(
      `Pay ${naira(item.price)}`,
      `Charge ${String(savedCard.brand ?? 'card').toUpperCase()} •••• ${savedCard.last4}, or open the full checkout for another method?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Full checkout', onPress: () => openCheckout(item) },
        {
          text: `Pay with •••• ${savedCard.last4}`,
          onPress: async () => {
            try {
              setPaying(item.id);
              const res = await paymentsApi.payWithSavedCard(item.id, savedCard.id);
              if (res.success) {
                Alert.alert('Paid', `${naira(item.price)} charged to •••• ${res.last4 ?? savedCard.last4}. A driver is being matched.`);
                load(1, true);
              } else {
                Alert.alert('Card declined', res.error ?? 'Try the full checkout instead.', [
                  { text: 'Not now', style: 'cancel' },
                  { text: 'Open checkout', onPress: () => openCheckout(item) },
                ]);
              }
            } catch (e: any) {
              Alert.alert('Could not charge the card', e?.message ?? 'Try the full checkout instead.');
            } finally {
              setPaying(null);
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: Delivery }) => {
    const c = STATUS_COLOR[item.status] ?? colors.textThird;
    const stopCount = item.stops?.length ?? (item.isMultiStop ? 0 : 1);
    const address = item.dropoffAddress
      ?? (item.stops?.[item.stops.length - 1] as any)?.address
      ?? item.pickupAddress
      ?? '-';
    const isCancellable = item.status === 'pending' || item.status === 'assigned';
    // Pending AND never collected: the sender still owes for this one.
    const isUnpaid = item.status === 'pending' && !item.paymentHeldAt;
    // The card could not be opened at all, so a sender could see "2
    // stops" and never learn which parcel was where, or get the code
    // their receiver needs (founder 2026-08-17).
    return (
      <Pressable
        onPress={() => router.push(`/(business)/delivery/${item.id}` as any)}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.trackNum, { color: colors.text }]}>
              {item.trackingNumber ?? item.trackingCode ?? item.id.slice(0, 8).toUpperCase()}
            </Text>
            <Text style={[styles.address, { color: colors.textSecond }]} numberOfLines={1}>{address}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: c + '20' }]}>
            <Text style={[styles.badgeText, { color: c }]}>{item.status.replace('_', ' ')}</Text>
          </View>
        </View>
        <View style={styles.cardBottom}>
          <View style={styles.meta}>
            <Icon name="Truck" size={12} color={colors.textThird} />
            {/* Was the raw backend enum: "motorcycle", "tricycle", "truck small"
                (B-2.3). The wizard calls the same vehicle an Okada. */}
            <Text style={[styles.metaText, { color: colors.textThird }]}>{vehicleLabel(item.vehicleType)}</Text>
          </View>
          {stopCount > 1 && (
            <View style={styles.meta}>
              <Icon name="MapPin" size={12} color={colors.textThird} />
              <Text style={[styles.metaText, { color: colors.textThird }]}>{stopCount} stops</Text>
            </View>
          )}
          <View style={styles.meta}>
            <Icon name="Calendar" size={12} color={colors.textThird} />
            <Text style={[styles.metaText, { color: colors.textThird }]}>
              {new Date(item.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
            </Text>
          </View>
          <Text style={[styles.price, { color: colors.text }]}>{naira(item.price)}</Text>
        </View>

        {/* Actions get their own row. Vehicle, stops, date, price, Pay now
            and Cancel on ONE line ran Cancel into the screen edge and left
            the two buttons touching (founder 2026-08-19). */}
        {(isUnpaid || isCancellable) && (
        <View style={styles.cardActions}>
          {isUnpaid && (
            <Pressable
              onPress={() => handlePay(item)}
              disabled={paying === item.id}
              hitSlop={8}
              style={[styles.payLink, { borderColor: colors.primary }]}
            >
              <Text style={[styles.payLinkText, { color: colors.primary }]}>
                {paying === item.id ? 'Opening…' : 'Pay now'}
              </Text>
            </Pressable>
          )}
          {isCancellable && (
            <Pressable
              onPress={() => handleCancel(item)}
              style={styles.cancelBtn}
              hitSlop={8}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          )}
        </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Drawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }]}>
        <Pressable onPress={() => setDrawerOpen(true)} hitSlop={10}>
          <Icon name="AlignLeft" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.heading, { color: colors.text }]}>Deliveries</Text>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name="Search" size={16} color={colors.textThird} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by tracking number…"
          placeholderTextColor={colors.textThird}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <Icon name="X" size={16} color={colors.textThird} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        style={{ flexGrow: 0 }}
      >
        {STATUSES.map((s) => {
          const active = status === s;
          // 'All' has no status color of its own: uses the brand primary.
          const accent = s === 'all' ? colors.primary : STATUS_COLOR[s];
          return (
            <Pressable
              key={s}
              style={[
                styles.tab,
                { backgroundColor: colors.surface, borderColor: colors.border },
                active && { backgroundColor: accent, borderColor: accent },
              ]}
              onPress={() => setStatus(s)}
            >
              <View style={[
                styles.tabDot,
                { backgroundColor: active ? '#fff' : accent },
              ]} />
              <Text style={[
                styles.tabText,
                { color: colors.text },
                active && { color: '#fff' },
              ]}>
                {STATUS_LABEL[s]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={deliveries}
          keyExtractor={(d) => d.id}
          renderItem={renderItem}
          contentContainerStyle={
            deliveries.length === 0
              ? { flexGrow: 1, padding: 16 }
              : { padding: 16, paddingBottom: 24 }
          }
          refreshing={refreshing}
          onRefresh={onRefresh}
          onEndReached={() => hasMore && load(page + 1)}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name={loadError ? 'AlertCircle' : 'Package'} size={40} color={loadError ? '#DC2626' : colors.textThird} />
              <Text style={[styles.emptyText, { color: loadError ? '#DC2626' : colors.textThird }]}>
                {loadError ? 'Could not load your deliveries. Pull down to try again.' : 'No deliveries found'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:       { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  heading:      { fontSize: 20, fontWeight: '800' },
  searchWrap:   {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 16, marginBottom: 0,
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1,
  },
  searchInput:  { flex: 1, fontSize: 15 },
  tabs:         { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10, gap: 10, alignItems: 'center' },
  tab:          {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, height: 44, borderRadius: 22,
    borderWidth: 1,
  },
  tabDot:       { width: 8, height: 8, borderRadius: 4 },
  tabText:      { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  card:         { borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1 },
  cardTop:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  trackNum:     { fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },
  address:      { fontSize: 13, marginTop: 3 },
  badge:        { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText:    { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  cardBottom:   { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardActions:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
                  gap: 10, marginTop: 12 },
  // Cancel reads as a button beside Pay now rather than a bare red link
  // with an X, which looked like a dismiss control rather than an action
  // (founder 2026-08-19).
  cancelBtn:     { borderWidth: 1, borderColor: '#DC2626', borderRadius: 999,
                   paddingHorizontal: 14, paddingVertical: 6 },
  cancelBtnText: { fontSize: 13.5, fontWeight: '700', color: '#DC2626' },
  meta:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:     { fontSize: 12, textTransform: 'capitalize' },
  price:        { marginLeft: 'auto', fontSize: 14, fontWeight: '700' },
  payLink:      { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  payLinkText:  { fontSize: 13.5, fontWeight: '700' },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText:    { fontSize: 15 },
});
