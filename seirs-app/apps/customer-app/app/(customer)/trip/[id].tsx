/**
 * One trip, as the customer sees it: rebuilt 2026-08-22 to the business
 * app's delivery detail design (founder: "design the screen for the
 * customers app like i asked, for it to be like the business app").
 * Same header (code + count + status pill), same COLLECTED FROM card,
 * same exception cards for failed-delivery states, same per-package
 * cards with a Copy/Send tracking code per receiver.
 *
 * What business does not have stays, restyled into the same card
 * language: the driver card (chat entry), Track live, Rate driver,
 * View receipt, and the honest payment states (a never-paid trip must
 * never read as paid).
 *
 * Two mocks died in the port: the driver chat button pushed a
 * hardcoded 'chat1' (now the real deliveryId thread) and Track went to
 * the old trip-progress screen with the fabricated 'd1' driver (now
 * /track by code, same as history; that screen was deleted 2026-08-24).
 */
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Share,
  Linking, StatusBar, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { deliveriesApi } from '@/services/api';
import { naira } from '@/utils/money';
import { showDialog } from '@/components/SeirsDialog';
import { VEHICLE_LABEL } from '@seirs/shared/models/vehicles';

const STATUS_COLOR: Record<string, string> = {
  pending:    '#D97706',
  assigned:   '#3A7BD5',
  picked_up:  '#6366F1',
  in_transit: '#6366F1',
  delivered:  '#16A34A',
  completed:  '#16A34A',
  failed:     '#DC2626',
  cancelled:  '#6B7280',
};

const PAYMENT_LABELS: Record<string, string> = {
  card:          'Paid by card',
  bank_transfer: 'Paid by bank transfer',
  ussd:          'Paid by USSD',
};



// The names Nigerians use, not the backend enum.

export default function TripDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Bottom clearance for the system navigation bar. insets.bottom
  // reports 0 on a 3-button Samsung, so the floor carries it.
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cs     = useColorScheme();
  const isDark = cs === 'dark';
  const colors = Colors[cs ?? 'light'];
  const { t }  = useTranslation();

  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    deliveriesApi.get(String(id))
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
          <Text style={{ color: colors.textSecond }}>Could not load this trip.</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Multi-package runs carry stops; a classic single booking carries its
  // package at the top level. Synthesizing one stop keeps the render
  // identical either way, which is the whole point of the port.
  const realStops: any[] = Array.isArray(d.stops) && d.stops.length > 0 ? d.stops : [];
  const stops: any[] = realStops.length > 0 ? realStops : [{
    id: 'single',
    packageDescription: d.packageDescription,
    receiverFirstName:  d.receiverFirstName,
    receiverLastName:   d.receiverLastName,
    recipientName:      d.recipientName,
    weightKg:           d.weightKg,
    address:            d.dropoffAddress,
    status:             d.status,
    packageTrackingCode: d.trackingCode,
    // Without these a single-package delivery has no photo to show at
    // all, whatever the renderer does.
    packagePhotoUrls:    d.packagePhotos ?? null,
    proofPhotoUrls:      d.proofPhotoUrl ? [d.proofPhotoUrl] : null,
  }];

  const runColor  = STATUS_COLOR[String(d.status)] ?? colors.textThird;
  const status    = String(d.status ?? 'pending');
  const isActive  = ['pending', 'assigned', 'picked_up', 'in_transit', 'in_progress'].includes(status);
  const isDone    = status === 'completed' || status === 'delivered';
  const neverPaid = !d.paymentHeldAt;
  const isUnpaid  = status === 'pending' && neverPaid;
  const driver    = d.driver ? {
    id:     d.driver.id ?? d.driver.user?.id,
    name:   d.driver.user?.name ?? d.driver.name ?? 'Driver',
    plate:  d.driver.vehicleNumber ?? d.driver.plate ?? '',
    rating: Number(d.driver.rating ?? 0),
    trips:  Number(d.driver.totalDeliveries ?? d.driver.trips ?? 0),
    vehicle: [d.driver.vehicleColor, d.driver.vehicleModel ?? d.driver.vehicleType].filter(Boolean).join(' '),
  } : null;

  const fmtWhen = (iso: string) =>
    new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // Real fare lines only: absent values simply do not render.
  const fareLines: Array<[string, number]> = ([
    ['NIGHT PICKUP FEE',  d.nightFeeNgn],
    ['REDIRECT FEE',      d.redirectFeeNgn],
    ['COUNTER HANDLING',  d.partnerHandlingNgn],
  ] as Array<[string, any]>)
    .filter(([, v]) => Number(v ?? 0) > 0)
    .map(([l, v]) => [l, Number(v)]);

  const payRedirectFee = async () => {
    try {
      const res = await deliveriesApi.payRedirectFee(String(id));
      if (res?.authorizationUrl) await Linking.openURL(res.authorizationUrl);
      else showDialog({ title: 'Could not start payment', message: 'Please try again in a moment.' });
    } catch (e: any) {
      showDialog({ title: 'Could not start payment', message: e?.message ?? 'Please try again.' });
    }
  };

  const shareCollectLink = async () => {
    const code = d?.trackingCode;
    if (!code) return;
    try {
      await Share.share({
        message:
          `Package ${code} is waiting at a SEIRS partner store. ` +
          `Settle the collection fee and get the pickup address here: ` +
          `https://seirs.app/collect/${code}`,
      });
    } catch { /* share sheet dismissed */ }
  };

  const requestReturn = async () => {
    try {
      const q = await deliveriesApi.getReturnQuote(String(id));
      showDialog({
        title: 'Return this package?',
        message:
          `${q.note}\n\nBack to: ${q.returnTo}\n` +
          `${q.km} km by road\n` +
          `Transport: ${naira(q.transportNgn)}\n` +
          (q.counterOwedNgn > 0
            ? `Counter owed: ${naira(q.counterOwedNgn)}\n`
            : '') +
          `Total: ${naira(q.totalNgn)}` +
          (q.needsSupport ? '\n\nSupport has to approve this before you can pay.' : ''),
        actions: [
          {
            text: q.needsSupport ? 'Ask support' : 'Request return',
            style: 'primary',
            onPress: async () => {
              try {
                const r = await deliveriesApi.requestReturn(String(id));
                showDialog({
                  title: r.status === 'pending' ? 'Sent to support' : 'Return approved',
                  message: r.status === 'pending'
                    ? 'A rider is carrying this package, so support has to arrange it. We will let you know.'
                    : 'Pay in the app and we will bring it back to your pickup address.',
                });
                setD(await deliveriesApi.get(String(id)));
              } catch (e: any) {
                showDialog({ title: 'Could not request that', message: e?.message ?? 'Please try again.' });
              }
            },
          },
          { text: 'Not now', style: 'cancel' },
        ],
      });
    } catch (e: any) {
      showDialog({ title: 'Could not price a return', message: e?.message ?? 'Please try again.' });
    }
  };

  const payReturn = async () => {
    try {
      const res = await deliveriesApi.payReturn(String(id));
      if (res?.authorizationUrl) await Linking.openURL(res.authorizationUrl);
    } catch (e: any) {
      showDialog({ title: 'Could not start payment', message: e?.message ?? 'Please try again.' });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={[styles.backBtn, { backgroundColor: colors.surfaceSecond }]}>
          <Icon name="ArrowLeft" size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>{d.trackingCode ?? 'Trip'}</Text>
          <Text style={[styles.sub, { color: colors.textThird }]}>
            {d.kind === 'ride'
              ? 'Ride'
              : stops.length > 1 ? `${stops.length} packages · one payment` : 'Single package'}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: runColor + '20' }]}>
          <Text style={[styles.badgeText, { color: runColor }]}>{status.replace('_', ' ')}</Text>
        </View>
      </View>

      {/* 40 put the last row against the system navigation bar. This
          screen never read insets, and insets.bottom reports 0 on a
          3-button Samsung, so the floor does the work (founder
          2026-08-24). */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom + 24, 56) }}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.textThird }]}>COLLECTED FROM</Text>
          <Text style={[styles.cardValue, { color: colors.text }]}>{d.pickupAddress}</Text>
          {d.pickedUpAt && (
            <Text style={{ fontSize: 13, color: colors.textSecond }}>Collected {fmtWhen(d.pickedUpAt)}</Text>
          )}
          {(d.distanceKm || d.vehicleType) && (
            <Text style={{ fontSize: 13, color: colors.textThird }}>
              {[d.distanceKm ? `${Number(d.distanceKm).toFixed(1)} km by road` : null, VEHICLE_LABEL[d.vehicleType] ?? d.vehicleType]
                .filter(Boolean).join(' · ')}
            </Text>
          )}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.rowBetween}>
            <Text style={[styles.cardLabel, { color: colors.textThird }]}>
              {neverPaid ? 'TOTAL' : 'TOTAL PAID'}
            </Text>
            <Text style={[styles.cardValue, { color: colors.text }]}>{naira(d.price)}</Text>
          </View>
          {fareLines.map(([label, amount]) => (
            <View key={label} style={styles.rowBetween}>
              <Text style={[styles.cardLabel, { color: colors.textThird }]}>{label}</Text>
              <Text style={[styles.cardValue, { color: colors.textSecond }]}>{naira(amount)}</Text>
            </View>
          ))}
          {/* The payment truth line. A cancelled unpaid booking once read
              "Paid by card" here; never again. */}
          <Text style={{ fontSize: 13, color: isUnpaid ? '#DC2626' : colors.textThird }}>
            {isUnpaid
              ? 'Not paid yet'
              : neverPaid
                ? 'Nothing was charged for this trip'
                : (PAYMENT_LABELS[d.paymentMethod] ?? 'Paid on this account')}
          </Text>
        </View>

        {/* Unpaid booking: the money card, in the exception-card idiom. */}
        {isUnpaid && (
          /* SEIRS yellow, not the generic amber the exception cards below
             use: unpaid is a brand-coloured nudge, not a warning. */
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: '#FFBE0B', borderWidth: 1.5 }]}>
            <Text style={[styles.cardValue, { color: colors.text, marginBottom: 4 }]}>
              Waiting for payment
            </Text>
            <Text style={{ fontSize: 14, color: colors.textSecond, lineHeight: 19 }}>
              We match a rider the moment this is paid. Nothing has been charged yet.
            </Text>
            <Pressable
              onPress={() => router.push({ pathname: '/(customer)/payment/[deliveryId]', params: { deliveryId: String(d.id) } } as any)}
              style={{ marginTop: 12, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#FFBE0B' }}
            >
              {/* Navy on yellow: white on #FFBE0B is unreadable. */}
              <Text style={{ color: '#0F2B4C', fontWeight: '700', fontSize: 15 }}>
                Pay {naira(d.price)}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Rider at the door with nobody to receive. */}
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

        {/* Package at a counter behind an unpaid fee. */}
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
        {['assigned', 'picked_up', 'in_transit'].includes(status) && !d.returnStatus && (
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

        {/* Driver: not on the business screen (senders there never chat),
            kept here in the same card language because customers do. */}
        {driver && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.textThird }]}>DRIVER</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={driver.name} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardValue, { color: colors.text }]}>{driver.name}</Text>
                <Text style={{ fontSize: 13, color: colors.textSecond, marginTop: 1 }}>
                  {driver.trips > 0
                    ? `★ ${driver.rating.toFixed(1)} · ${driver.trips} trips`
                    : 'New driver'}
                </Text>
                {!!(driver.vehicle || driver.plate) && (
                  <Text style={{ fontSize: 13, color: colors.textThird, marginTop: 1 }} numberOfLines={1}>
                    {[driver.vehicle, driver.plate].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
              {isActive && (
                <Pressable
                  onPress={() => router.push({
                    pathname: '/(customer)/messages/[chatId]',
                    params: { chatId: String(d.id), other: driver.name },
                  } as any)}
                  hitSlop={8}
                  style={[styles.chatBtn, { borderColor: colors.primary }]}
                >
                  <Icon name="MessageSquare" size={17} color={colors.primary} />
                </Pressable>
              )}
            </View>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.textThird }]}>
          {d.kind === 'ride' ? 'PASSENGER' : stops.length > 1 ? `PACKAGES (${stops.length})` : 'PACKAGE'}
        </Text>

        {stops.map((st, i) => {
          const c = STATUS_COLOR[String(st.status ?? status)] ?? colors.textThird;
          const receiver = [st.receiverFirstName, st.receiverLastName].filter(Boolean).join(' ') || st.recipientName;
          const code = st.packageTrackingCode;
          return (
            <View key={st.id ?? i} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.rowBetween}>
                <Text style={[styles.pkgTitle, { color: colors.text }]} numberOfLines={1}>
                  {d.kind === 'ride'
                    ? (receiver || 'You')
                    : (st.packageDescription?.trim() || `Package ${st.sequenceOrder ?? i + 1}`)}
                </Text>
                <View style={[styles.badge, { backgroundColor: c + '20' }]}>
                  <Text style={[styles.badgeText, { color: c }]}>{String(st.status ?? 'pending').replace('_', ' ')}</Text>
                </View>
              </View>

              {!!receiver && d.kind !== 'ride' && (
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

              {d.deliveredAt && (isDone || String(st.status) === 'delivered') && (
                <Text style={[styles.pkgMeta, { color: colors.textSecond }]}>
                  Delivered {fmtWhen(d.deliveredAt)}
                  {d.receivedByRelation && d.receivedByRelation !== 'recipient' && d.receivedByName
                    ? ` · left with ${d.receivedByName}` : ''}
                </Text>
              )}

              {/* The parcel, as photographed at booking. The rider has
                  had this on their job card all along; the sender who
                  took it could not see it anywhere (founder
                  2026-08-24). */}
              {Array.isArray(st.packagePhotoUrls) && st.packagePhotoUrls.length > 0 && (
                <View style={styles.photoBlock}>
                  <Text style={[styles.photoLabel, { color: colors.textThird }]}>WHAT YOU SENT</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip} contentContainerStyle={{ gap: 8 }}>
                    {st.packagePhotoUrls.map((u: string, k: number) => (
                      <Image key={k} source={{ uri: u }} style={styles.photoThumb} resizeMode="cover" />
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Proof of delivery exists for the sender's benefit, and
                  the sender was the one person who could not see it. */}
              {Array.isArray(st.proofPhotoUrls) && st.proofPhotoUrls.length > 0 && (
                <View style={styles.photoBlock}>
                  <Text style={[styles.photoLabel, { color: colors.textThird }]}>PROOF OF DELIVERY</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip} contentContainerStyle={{ gap: 8 }}>
                    {st.proofPhotoUrls.map((u: string, k: number) => (
                      <Image key={k} source={{ uri: u }} style={styles.photoThumb} resizeMode="cover" />
                    ))}
                  </ScrollView>
                </View>
              )}

              {!!st.packagePriceNgn && (
                <Text style={[styles.pkgMeta, { color: colors.textThird }]}>{naira(st.packagePriceNgn)}</Text>
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

              {/* Show package QR, PER PACKAGE rather than per run.
                  Every package in a multi-package run carries its own
                  public tracking code, so one QR for the whole run would
                  hand every receiver the same code and let any of them
                  claim any parcel. Added 2026-08-24 alongside the
                  tracking-screen entry, because the driver's scan screen
                  had been telling riders to ask for a button nobody had
                  built. Rides have no package to hand over. */}
              {!!code && d.kind !== 'ride' && !['delivered', 'failed', 'cancelled'].includes(String(st.status ?? status)) && (
                <Pressable
                  onPress={() => router.push({
                    pathname: '/(customer)/package-qr',
                    params: {
                      code:        String(code),
                      description: String(st.packageDescription ?? ''),
                      receiver:    String(receiver ?? ''),
                    },
                  } as any)}
                  hitSlop={6}
                  style={[styles.qrRow, { borderColor: colors.primary }]}
                >
                  <Icon name="QrCode" size={16} color={colors.primary} />
                  <Text style={[styles.codeBtnText, { color: colors.primary }]}>Show package QR</Text>
                </Pressable>
              )}
            </View>
          );
        })}

        {/* Live actions, in the business centered-card idiom. */}
        {isActive && !isUnpaid && (
          <Pressable
            onPress={() => router.push({ pathname: '/(customer)/track', params: { code: String(d.trackingCode ?? '') } } as any)}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, alignItems: 'center' }]}
          >
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 15 }}>
              {t('tripDetail.trackPackage', { defaultValue: 'Track this delivery live' })}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textThird, marginTop: 2 }}>
              Live status, rider position and updates
            </Text>
          </Pressable>
        )}
        {isDone && !d.customerRating && driver && (
          <Pressable
            onPress={() => router.push({ pathname: '/(customer)/rate/[driverId]', params: { driverId: String(driver.id), tripId: String(d.id) } } as any)}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, alignItems: 'center' }]}
          >
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 15 }}>
              {t('rateDriver.title', { defaultValue: 'Rate your driver' })}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textThird, marginTop: 2 }}>
              How was {driver.name}?
            </Text>
          </Pressable>
        )}
        {isDone && (
          <Pressable
            onPress={() => router.push({ pathname: '/(customer)/receipt/[id]', params: { id: String(d.id) } } as any)}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, alignItems: 'center' }]}
          >
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 15 }}>
              {t('tripDetail.viewReceipt', { defaultValue: 'View receipt' })}
            </Text>
          </Pressable>
        )}

        {/* Same footer entry as the business screen. */}
        <Pressable
          onPress={() => router.push({ pathname: '/(customer)/report', params: { tripId: String(d.id) } } as any)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 }}
        >
          <Icon name="Flag" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>
            {t('tripDetail.reportIssue', { defaultValue: 'Report an issue' })}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// Style values verbatim from the business delivery detail.
const styles = StyleSheet.create({
  center:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
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
  photoBlock: { marginTop: 12 },
  photoLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6 },
  photoStrip: { flexGrow: 0 },
  photoThumb: { width: 96, height: 96, borderRadius: 10, backgroundColor: 'rgba(127,127,127,0.15)' },
  pkgRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  codeRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, paddingTop: 10, marginTop: 4 },
  code:     { flex: 1, fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  codeBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  codeBtnText:{ fontSize: 13, fontWeight: '700' },
  qrRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderRadius: 12, paddingVertical: 11, marginTop: 10 },
  chatBtn:  { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
