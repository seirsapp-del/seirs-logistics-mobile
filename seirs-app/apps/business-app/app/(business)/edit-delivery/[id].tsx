/**
 * Edit an order that has not been paid for.
 *
 * The endpoint behind this has existed for a while and nothing ever
 * called it: businessApi.editDelivery was wiring with no screen on the
 * end of it. Building the customer side on 2026-08-29 turned up two
 * defects in it that only a real caller would have found, both now
 * fixed on the server:
 *
 *   - it never re-priced, so moving the destination from Yaba to Abuja
 *     kept the twelve kilometre fare
 *   - it wrote recipientName and recipientPhone, which are DeliveryStop
 *     columns and not Delivery's, so every receiver edit threw
 *
 * What may change narrows as the order progresses, and the screen says
 * so rather than offering a field the server will refuse: everything
 * while unpaid, instructions only once it is paid, nothing after
 * pickup. The price is worked out again by the server on save and the
 * change is reported before anyone is charged.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Icon } from '@/components/Icon';
import { StreetAutocomplete } from '@/components/StreetAutocomplete';
import { businessApi } from '@/services/api';
import { useColors } from '@/context/ThemeContext';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';

const onlyDigits = (v: string) => v.replace(/[^0-9+]/g, '');
const onlyName   = (v: string) => v.replace(/[^\p{L} .'\-]/gu, '');

const money = (n: number) =>
  `NGN ${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function EditDelivery() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [row,     setRow]     = useState<any>(null);
  const [error,   setError]   = useState('');

  const [address,      setAddress]      = useState('');
  const [coords,       setCoords]       = useState<{ lat: number; lng: number } | null>(null);
  const [name,         setName]         = useState('');
  const [phone,        setPhone]        = useState('');
  const [instructions, setInstructions] = useState('');

  // Paid orders keep only their instructions open. The server enforces
  // this; the screen mirrors it so nobody types into a field that is
  // going to be refused.
  const paid = !!row?.paymentHeldAt;

  useEffect(() => {
    (async () => {
      try {
        const d = await businessApi.delivery(String(id));
        setRow(d);
        setAddress(d.dropoffAddress ?? '');
        setCoords(
          Number.isFinite(Number(d.dropoffLat)) && Number(d.dropoffLat) !== 0
            ? { lat: Number(d.dropoffLat), lng: Number(d.dropoffLng) }
            : null,
        );
        setName([d.receiverFirstName, d.receiverLastName].filter(Boolean).join(' '));
        setPhone(d.receiverPhone ?? '');
        setInstructions(d.deliveryInstructions ?? '');
      } catch (e: any) {
        setError(e?.message ?? 'Could not open this order.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const save = useCallback(async () => {
    setError('');
    const patch: Record<string, any> = {};

    if (!paid) {
      if (!address.trim()) {
        setError('A delivery address is needed.');
        return;
      }
      patch.dropoffAddress = address.trim();
      // Coordinates only when the address came from a real pick. A
      // freehand line with stale coordinates would price the old route.
      if (coords) {
        patch.dropoffLat = coords.lat;
        patch.dropoffLng = coords.lng;
      }
      patch.recipientName  = name.trim();
      patch.recipientPhone = phone.trim();
    }
    patch.deliveryInstructions = instructions.trim();

    setSaving(true);
    try {
      const res: any = await businessApi.editDelivery(String(id), patch);
      alertDialog(
        'Order updated',
        res?.priceChanged
          ? `The price changed from ${money(res.priceBeforeNgn)} to ${money(res.priceAfterNgn)}. Nothing has been charged yet.`
          : 'Your changes are saved.',
        [{ text: tr('auto.editDeliveryDetail.done', 'Done'), onPress: () => router.back() }],
      );
    } catch (e: any) {
      setError(e?.message ?? 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  }, [paid, address, coords, name, phone, instructions, id, router]);

  if (loading) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Icon name="ArrowLeft" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>{tx('auto.id.editOrder', 'Edit order')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

          <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.bannerTitle, { color: colors.text }]}>{row?.trackingCode}</Text>
            <Text style={[styles.bannerNote, { color: colors.textSecond }]}>
              {paid
                ? 'This order is paid, so the fare is fixed to this exact journey. You can still change the instructions the driver reads on arrival. To send somewhere else, cancel for a refund and book again.'
                : 'Nothing has been charged yet, so this can still change. We work the price out again when you save.'}
            </Text>
          </View>

          {!paid && (
            <>
              <StreetAutocomplete
                label={tx('auto.id.deliverTo', 'Deliver to')}
                value={address}
                onChangeText={(t: string) => { setAddress(t); setCoords(null); }}
                onCoordsResolved={(lat: number, lng: number) => setCoords({ lat, lng })}
                placeholder={tx('auto.id.searchTheDeliveryAddress', 'Search the delivery address')}
              />

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textSecond }]}>{tx('auto.id.receiverName', 'Receiver name')}</Text>
                <TextInput
                  value={name}
                  onChangeText={v => setName(onlyName(v))}
                  placeholder={tx('auto.id.eGChidinmaOkafor', 'e.g. Chidinma Okafor')}
                  placeholderTextColor={colors.textThird}
                  style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textSecond }]}>{tx('auto.id.receiverPhone', 'Receiver phone')}</Text>
                <TextInput
                  value={phone}
                  onChangeText={v => setPhone(onlyDigits(v))}
                  placeholder="08012345678"
                  placeholderTextColor={colors.textThird}
                  keyboardType="phone-pad"
                  style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                />
              </View>
            </>
          )}

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecond }]}>{tx('auto.id.instructionsForTheDriver', 'Instructions for the driver')}</Text>
            <TextInput
              value={instructions}
              onChangeText={setInstructions}
              placeholder={tx('auto.id.eGSecondGateAsk', 'e.g. Second gate, ask for the store manager')}
              placeholderTextColor={colors.textThird}
              multiline
              style={[styles.input, styles.multiline, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            />
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={save}
            disabled={saving}
            style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveText}>{tx('auto.id.saveChanges', 'Save changes')}</Text>}
          </Pressable>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title:  { fontSize: 17, fontWeight: '700' },
  body:   { padding: 16, gap: 16, paddingBottom: 48 },
  banner: { padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: 4 },
  bannerTitle: { fontSize: 13.5, fontWeight: '700' },
  bannerNote:  { fontSize: 12.5, lineHeight: 18 },
  field:  { gap: 6 },
  label:  { fontSize: 13, fontWeight: '600' },
  input:  {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15,
  },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
  error:  { color: '#DC2626', fontSize: 13.5 },
  saveBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 14 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
