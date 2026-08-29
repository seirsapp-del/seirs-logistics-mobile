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
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Share, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Icon } from '@/components/Icon';
import { useSeirsDialog } from '@/components/SeirsDialog';
import { businessApi } from '@/services/api';
import { deliveriesApi, paymentsApi } from '@/services/api';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { collectUrl } from '@/constants/config';
import { statusTint } from '@/constants/tint';
import { naira } from '@/utils/money';
import DeliveryTrackMap from '@/components/DeliveryTrackMap';
import { useDeliveryTracking } from '@/hooks/useDeliveryTracking';
import { Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

/**
 * Status colour now comes from constants/tint.ts (2026-08-24), shared
 * with the deliveries list so the two screens finally agree. The map
 * that was here backed each badge with `hue + '20'`, which composites to
 * roughly 3:1 against its own text over the light surface: legible in
 * dark, which is where it was designed, and weak in light.
 */



export default function DeliveryDetailScreen() {
  // Themed dialogs, not the Android system AlertDialog (work order
  // item 4, 2026-08-24). Same signature as Alert.alert, so these are
  // straight renames, but it renders every button instead of
  // silently discarding the fourth.
  const dialog = useSeirsDialog();
  const { id } = useLocalSearchParams<{ id: string }>();

  /**
   * Live rider position. The business app carried no tracking at all
   * until 2026-08-24: this screen listed packages and payment and never
   * said where the rider was, while consumers had a live map. Costs
   * nothing, so there is no reason to withhold it from the senders who
   * book the most.
   *
   * Declared above every early return: this screen returns early while
   * loading and when the delivery will not load, and a hook that only
   * runs on some renders breaks the order React relies on.
   */
  const { driverLocation } = useDeliveryTracking(String(id));
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = Colors[isDark ? 'dark' : 'light'];

  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  /**
   * Finish paying for a booking whose checkout never completed.
   *
   * Deliberately the hosted Flutterwave page and not the saved-card
   * one-tap the list tab offers: this screen does not load the card
   * list, and a Pay button that silently charges a card the sender
   * cannot see on the same screen is worse than one extra tap.
   */
  const openCheckout = async () => {
    if (!id) return;
    try {
      setPaying(true);
      const res = await paymentsApi.initiate(String(id), 'card', 'card');
      const url = res?.authorizationUrl;
      if (!url) {
        dialog.alert('Could not start payment', res?.error ?? 'Please try again in a moment.');
        return;
      }
      await Linking.openURL(url);
    } catch (e: any) {
      dialog.alert('Could not start payment', e?.message ?? 'Please try again in a moment.');
    } finally {
      setPaying(false);
    }
  };

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

  /**
   * Open the screenshottable ticket for ONE package (work order item 6,
   * 2026-08-24).
   *
   * The driver's scan screen has been telling riders to ask the sender
   * to "tap Show package QR" since before any such button existed, so
   * this label is deliberately word-for-word what the rider says out
   * loud at the door.
   *
   * Per package, never per run: each parcel on a business run has its
   * own public tracking code, and a receiver must get theirs and nobody
   * else's. The delivery id rides along so the QR screen can page
   * between the other packages in the same run.
   */
  const openPackageQr = (code: string, description?: string, receiver?: string) => {
    router.push({
      pathname: '/(business)/package-qr',
      params: {
        id: String(id),
        code,
        description: description ?? '',
        receiver: receiver ?? '',
      },
    } as any);
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
  const runTint = statusTint(d.status, isDark);

  /**
   * Where to aim the live map on a MULTI-PACKAGE run.
   *
   * business.service.createDelivery writes dropoffAddress/Lat/Lng only
   * when the run has exactly one stop and explicitly nulls them for
   * everything else, so the render guard below (pickupLat AND dropoffLat)
   * was false on every multi-package run. The one screen shape this app
   * exists for, several parcels out at once, was the only one that never
   * got a map, while a single-parcel run did (found 2026-08-25).
   *
   * Aim at the next package still to be delivered, since that is where
   * the rider is heading; on a finished run fall back to the last one.
   */
  const openStop =
    stops.find((s) => s?.status !== 'delivered' && s?.status !== 'failed')
    ?? stops[stops.length - 1];
  const dropPoint =
    d.dropoffLat != null && d.dropoffLng != null
      ? { lat: Number(d.dropoffLat), lng: Number(d.dropoffLng) }
      : openStop?.lat != null && openStop?.lng != null
        ? { lat: Number(openStop.lat), lng: Number(openStop.lng) }
        : null;
  const openStopIndex = openStop ? stops.indexOf(openStop) : -1;

  /**
   * The fare is charged at checkout, not at booking: business.service
   * creates the run UNPAID and opens Flutterwave, and paymentHeldAt is
   * stamped only once the webhook confirms escrow. This screen printed
   * "TOTAL PAID" against d.price regardless, so a sender who backed out
   * of the checkout was told their money had gone through, on the one
   * screen that offered no way to pay (found 2026-08-25). The list tab
   * had the correct rule all along.
   */
  const isUnpaid = String(d.status) === 'pending' && !d.paymentHeldAt;

  /**
   * Settle what is owed on a package that ended up at a counter.
   *
   * Business runs hit this more than single deliveries do: five stops
   * means five chances that nobody is in, and the run still reads as
   * successful while one parcel sits on a shelf.
   */
  const payRedirectFee = async () => {
    try {
      const res = await deliveriesApi.payRedirectFee(String(id));
      if (res?.authorizationUrl) await Linking.openURL(res.authorizationUrl);
      else dialog.alert('Could not start payment', 'Please try again in a moment.');
    } catch (e: any) {
      dialog.alert('Could not start payment', e?.message ?? 'Please try again.');
    }
  };

  /** Hand the bill to whoever is actually collecting it. */
  const shareCollectLink = async () => {
    const code = d?.trackingCode;
    if (!code) return;
    try {
      await Share.share({
        message:
          `Package ${code} is waiting at a SEIRS partner store. ` +
          `Settle the collection fee and get the pickup address here: ` +
          collectUrl(code),
      });
    } catch {
      /* share sheet dismissed */
    }
  };

  /** Ask for it back. Priced from wherever it is now, to the pickup. */
  const requestReturn = async () => {
    try {
      const q = await deliveriesApi.getReturnQuote(String(id));
      dialog.alert(
        'Return this package?',
        `${q.note}\n\nBack to: ${q.returnTo}\n` +
        `${q.km} km by road\n` +
        `Transport: ${naira(q.transportNgn)}\n` +
        (q.counterOwedNgn > 0
          ? `Counter owed: ${naira(q.counterOwedNgn)}\n`
          : '') +
        `Total: ${naira(q.totalNgn)}` +
        (q.needsSupport ? '\n\nSupport has to approve this before you can pay.' : ''),
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: q.needsSupport ? 'Ask support' : 'Request return',
            onPress: async () => {
              try {
                const r = await deliveriesApi.requestReturn(String(id));
                dialog.alert(
                  r.status === 'pending' ? 'Sent to support' : 'Return approved',
                  r.status === 'pending'
                    ? 'A rider is carrying this package, so support has to arrange it. We will let you know.'
                    : 'Pay in the app and we will bring it back to your pickup address.',
                );
                setD(await businessApi.delivery(String(id)));
              } catch (e: any) {
                dialog.alert('Could not request that', e?.message ?? 'Please try again.');
              }
            },
          },
        ],
      );
    } catch (e: any) {
      dialog.alert('Could not price a return', e?.message ?? 'Please try again.');
    }
  };

  /** Pay for a return support has approved. */
  const payReturn = async () => {
    try {
      const res = await deliveriesApi.payReturn(String(id));
      if (res?.authorizationUrl) await Linking.openURL(res.authorizationUrl);
    } catch (e: any) {
      dialog.alert('Could not start payment', e?.message ?? 'Please try again.');
    }
  };

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
        <View style={[styles.badge, { backgroundColor: runTint.bg }]}>
          <Text style={[styles.badgeText, { color: runTint.fg }]}>{String(d.status ?? '').replace('_', ' ')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {!!d.pickupLat && !!dropPoint && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 0, overflow: 'hidden', marginBottom: 12 }]}>
            <Text style={[styles.cardLabel, { color: colors.textThird, paddingHorizontal: 16, paddingTop: 16 }]}>
              {String(d.status) === 'delivered' ? 'WHERE IT WENT' : 'WHERE IT IS'}
            </Text>
            {/* Say WHICH parcel the pin belongs to. One drop pin on a
                five-package run would otherwise read as the whole run's
                destination, which it is not. No arrival time, ever. */}
            {stops.length > 1 && openStopIndex >= 0 && (
              <Text style={{ color: colors.textSecond, fontSize: FontSize.xs, paddingHorizontal: 16, paddingTop: 2 }}>
                {String(d.status) === 'delivered'
                  ? `Last drop · package ${openStopIndex + 1} of ${stops.length}`
                  : `Drop pin: package ${openStopIndex + 1} of ${stops.length}`}
              </Text>
            )}
            <DeliveryTrackMap
              pickup={{ lat: d.pickupLat, lng: d.pickupLng }}
              dropoff={dropPoint}
              driver={driverLocation}
              isDark={isDark}
              theme={colors}
            />
            {driverLocation && (
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={[styles.cardLabel, { color: colors.textThird }]}>RIDER RIGHT NOW</Text>
                {/* Numbers, not just a dot. Ops reads these to a
                    receiving branch down a phone line. */}
                <Text style={{ color: colors.text, fontSize: FontSize.sm, fontWeight: FontWeight.bold, fontVariant: ['tabular-nums'], marginTop: 2 }}>
                  {Number(driverLocation.lat).toFixed(5)}, {Number(driverLocation.lng).toFixed(5)}
                </Text>
                <Pressable
                  onPress={() => {
                    Linking.openURL(
                      `https://www.google.com/maps?q=${Number(driverLocation.lat)},${Number(driverLocation.lng)}`,
                    ).catch(() => {});
                  }}
                  style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, opacity: pressed ? 0.6 : 1 }]}
                >
                  <Icon name="ExternalLink" size={14} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: FontSize.xs, fontWeight: FontWeight.bold }}>
                    See where your rider is on Google Maps
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.textThird }]}>COLLECTED FROM</Text>
          <Text style={[styles.cardValue, { color: colors.text }]}>{d.pickupAddress}</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.rowBetween}>
            <Text style={[styles.cardLabel, { color: colors.textThird }]}>
              {isUnpaid ? 'TOTAL DUE' : 'TOTAL PAID'}
            </Text>
            <Text style={[styles.cardValue, { color: colors.text }]}>{naira(d.price)}</Text>
          </View>
          {Number(d.partnerHandlingNgn ?? 0) > 0 && (
            <View style={styles.rowBetween}>
              <Text style={[styles.cardLabel, { color: colors.textThird }]}>COUNTER HANDLING</Text>
              <Text style={[styles.cardValue, { color: colors.textSecond }]}>{naira(d.partnerHandlingNgn)}</Text>
            </View>
          )}
          {/* An abandoned checkout used to dead-end here: the list tab
              offered Pay now and this screen, which is where a sender
              lands after tapping the card, offered nothing at all. */}
          {isUnpaid && (
            <>
              <Text style={{ color: colors.textSecond, fontSize: FontSize.xs, marginTop: 6, lineHeight: 17 }}>
                This booking is saved but not paid for. A driver is matched once payment goes through.
              </Text>
              <Pressable
                onPress={openCheckout}
                disabled={paying}
                style={({ pressed }) => [
                  styles.payBtn,
                  { backgroundColor: colors.primary, opacity: paying ? 0.6 : pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.payBtnText}>
                  {paying ? 'Opening…' : `Pay ${naira(d.price)}`}
                </Text>
              </Pressable>
              {/* Same reasoning as the customer app: this screen is where
                  a sender lands from the card, so correcting the order
                  has to be possible from here and not only from the list
                  tab (founder 2026-08-29). */}
              <Pressable
                onPress={() => router.push(`/(business)/edit-delivery/${d.id}` as any)}
                style={{ marginTop: 10, paddingVertical: 6, alignItems: 'center' }}
                hitSlop={8}
              >
                <Text style={{ color: colors.textSecond, fontWeight: '600', fontSize: FontSize.sm }}>
                  Something wrong? Edit this order
                </Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Rider is at the door with nobody to receive. The sender's
            window is ticking, so this has to be the first thing seen. */}
        {d.arrivalIssueAt && !d.arrivalResolution && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: '#F59E0B', borderWidth: 1.5 }]}>
            <Text style={[styles.cardValue, { color: colors.text, marginBottom: 4 }]}>
              Nobody available to receive
            </Text>
            <Text style={{ fontSize: 14, color: colors.textSecond, lineHeight: 19 }}>
              The rider is at the drop-off and cannot hand the package over. If we do
              not hear from you it will follow your booked fallback.
            </Text>
          </View>
        )}

        {/* Package is at a counter behind an unpaid fee. */}
        {Number(d.redirectFeeOwedNgn ?? 0) > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: '#F59E0B', borderWidth: 1.5 }]}>
            <Text style={[styles.cardValue, { color: colors.text, marginBottom: 4 }]}>
              Waiting at a partner store
            </Text>
            <Text style={{ fontSize: 14, color: colors.textSecond, lineHeight: 19 }}>
              Nobody was available, so this is being kept safe at a SEIRS partner
              store. {naira(d.redirectFeeOwedNgn)} settles it and reveals the pickup
              location.
            </Text>
            <Pressable
              onPress={payRedirectFee}
              style={{ marginTop: 12, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#F59E0B' }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>
                Pay {naira(d.redirectFeeOwedNgn)}
              </Text>
            </Pressable>
            <Pressable onPress={shareCollectLink} style={{ marginTop: 8, paddingVertical: 8, alignItems: 'center' }}>
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>
                Send the collection link to the recipient
              </Text>
            </Pressable>
          </View>
        )}

        {/* Return in flight. */}
        {d.returnStatus && d.returnStatus !== 'rejected' && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: '#7C3AED', borderWidth: 1.5 }]}>
            <Text style={[styles.cardValue, { color: colors.text, marginBottom: 4 }]}>
              Return to sender: {String(d.returnStatus)}
            </Text>
            <Text style={{ fontSize: 14, color: colors.textSecond, lineHeight: 19 }}>
              Going back to {d.pickupAddress}.
              {d.returnStatus === 'pending' ? ' Support is reviewing it.' : ''}
              {d.returnStatus === 'applied' ? ' On its way back to you.' : ''}
            </Text>
            {d.returnStatus === 'approved' && !d.returnPaidAt && (
              <Pressable
                onPress={payReturn}
                style={{ marginTop: 12, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#7C3AED' }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>
                  Pay {naira(d.returnQuoteNgn)} to start the return
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Ask for it back, while it is still ours to move. */}
        {['assigned', 'picked_up', 'in_transit'].includes(String(d.status)) && !d.returnStatus && (
          <Pressable
            onPress={requestReturn}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, alignItems: 'center' }]}
          >
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 15 }}>
              Need this package back?
            </Text>
            <Text style={{ fontSize: 13, color: colors.textThird, marginTop: 2 }}>
              Priced from where it is now, back to your pickup address
            </Text>
          </Pressable>
        )}

        <Text style={[styles.sectionTitle, { color: colors.textThird }]}>
          {stops.length > 1 ? `PACKAGES (${stops.length})` : 'PACKAGE'}
        </Text>

        {stops.map((st, i) => {
          const pkgTint = statusTint(st.status, isDark);
          const receiver = [st.receiverFirstName, st.receiverLastName].filter(Boolean).join(' ') || st.recipientName;
          const code = st.packageTrackingCode;
          return (
            <View key={st.id ?? i} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.rowBetween}>
                <Text style={[styles.pkgTitle, { color: colors.text }]} numberOfLines={1}>
                  {st.packageDescription?.trim() || `Package ${st.sequenceOrder ?? i + 1}`}
                </Text>
                <View style={[styles.badge, { backgroundColor: pkgTint.bg }]}>
                  <Text style={[styles.badgeText, { color: pkgTint.fg }]}>{String(st.status ?? 'pending').replace('_', ' ')}</Text>
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
                <Text style={[styles.pkgMeta, { color: colors.textThird }]}>{naira(st.packagePriceNgn)}</Text>
              )}

              {/* The receiver's own code. Sharing this instead of the run
                  code keeps the other receivers' details private. */}
              {!!code && (
                <>
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

                  {/* Full width and its own row, not a third icon in the
                      line above. The QR is the only handover option with a
                      chain of custody behind it (the other two are
                      self-attested), so it should not read as the least
                      important of three cramped links. */}
                  <Pressable
                    onPress={() => openPackageQr(code, st.packageDescription, receiver)}
                    style={({ pressed }) => [
                      styles.qrBtn,
                      { borderColor: colors.border, backgroundColor: colors.surfaceSecond, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Icon name="QrCode" size={16} color={colors.primary} />
                    <Text style={[styles.qrBtnText, { color: colors.primary }]}>Show package QR</Text>
                  </Pressable>
                </>
              )}
            </View>
          );
        })}

        {stops.length === 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.textSecond, fontSize: 14 }}>
              {d.dropoffAddress ?? 'No package details recorded for this delivery.'}
            </Text>

            {/* Older bookings predate per-package codes and carry only the
                run code. The receiver still needs something to show at the
                door, so fall back to that rather than leaving this screen
                without a QR at all (2026-08-24). */}
            {!!d.trackingCode && (
              <Pressable
                onPress={() => openPackageQr(String(d.trackingCode), d.packageDescription, d.recipientName)}
                style={({ pressed }) => [
                  styles.qrBtn,
                  { borderColor: colors.border, backgroundColor: colors.surfaceSecond, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Icon name="QrCode" size={16} color={colors.primary} />
                <Text style={[styles.qrBtnText, { color: colors.primary }]}>Show package QR</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Same entry the customer Trip Details has (founder 2026-08-22:
            business gets Report an issue too). Prefilled with this order;
            the report screen still lets them switch to All orders. */}
        <Pressable
          onPress={() => router.push({ pathname: '/(business)/report', params: { deliveryId: d.id } } as any)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 }}
        >
          <Icon name="Flag" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>Report an issue</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // paddingTop matters: SafeAreaView clears the status bar itself, but
  // with none the back button and title sat flush against the
  // notification bar (founder 2026-08-17).
  header:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn:  { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 16, fontWeight: '800' },
  sub:      { fontSize: 13, marginTop: 2 },
  badge:    { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  badgeText:{ fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  card:     { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12, gap: 6 },
  cardLabel:{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  cardValue:{ fontSize: 15, fontWeight: '600' },
  divider:  { height: 1, marginVertical: 8 },
  rowBetween:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle:{ fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8, marginTop: 6 },
  pkgTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  pkgMeta:  { fontSize: 13 },
  pkgRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  codeRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, paddingTop: 10, marginTop: 4 },
  code:     { flex: 1, fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  codeBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  codeBtnText:{ fontSize: 13, fontWeight: '700' },
  payBtn:     { marginTop: 10, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', paddingVertical: 13 },
  payBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  // Solid theme surface, not a low-alpha tint of the primary. A
  // translucent fill reads as a subtle glow over near-black and as
  // sludge over the cream light background (work order item 5).
  qrBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  qrBtnText:{ fontSize: 14, fontWeight: '700' },
});
