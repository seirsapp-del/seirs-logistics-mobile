import { Image,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Share,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useDeliveryTracking } from '@/hooks/useDeliveryTracking';
import { deliveriesApi, dropoffApi } from '@/services/api';
import DeliveryTrackMap from '@/components/DeliveryTrackMap';
import { StreetAutocomplete } from '@/components/StreetAutocomplete';
import { naira } from '@/utils/money';
import { showDialog } from '@/components/SeirsDialog';
import { collectUrl, trackUrl } from '@/constants/config';
import { tx } from '@/i18n/tx';

// Labels looked up via t(`tracking.step${cap}`) at render so language
// switches reflect live.
const STATUS_CONFIG: Record<string, {
  labelKey: string; step: number;
  gradient: readonly [string, string];
  icon: string;
}> = {
  // Brand palette only (audit 2026-08-10: purple + off-brand blues removed).
  // Unpaid booking: dispatch only sees paid work, so nothing is
  // "finding a rider" yet and this screen must not pretend otherwise.
  awaiting_payment: { labelKey: 'tracking.stepAwaitingPayment', step: 0, gradient: ['#FFBE0B', '#E0A800'], icon: 'card' },
  pending:    { labelKey: 'tracking.stepPending',   step: 1, gradient: ['#3A7BD5', '#2A5FA8'], icon: 'search' },
  assigned:   { labelKey: 'tracking.stepAssigned',  step: 2, gradient: ['#3A7BD5', '#1E4F8C'], icon: 'navigate' },
  picked_up:  { labelKey: 'tracking.stepPickedUp',  step: 3, gradient: ['#FFBE0B', '#D99E00'], icon: 'cube' },
  in_transit: { labelKey: 'tracking.stepInTransit', step: 4, gradient: ['#0F2B4C', '#1A3A63'], icon: 'navigate' },
  delivered:  { labelKey: 'tracking.stepDelivered', step: 5, gradient: ['#16A34A', '#15803D'], icon: 'checkmark-circle' },
  failed:     { labelKey: 'tracking.stepFailed',    step: 0, gradient: ['#EF4444', '#B91C1C'], icon: 'alert-circle' },
  cancelled:  { labelKey: 'tracking.stepCancelled', step: 0, gradient: ['#6B7280', '#4B5563'], icon: 'close-circle' },
};

const RIDE_LABELS: Record<string, string> = {
  awaiting_payment: 'Waiting for payment',
  pending:          'Finding your driver',
  assigned:         'Driver on the way',
  picked_up:        'Arrived, meet them outside',
  in_transit:       'On the trip',
  delivered:        'Ride completed',
  failed:           'Ride failed',
  cancelled:        'Ride cancelled',
};

/**
 * A SEAT on a declared trip is a ride with a tripId. It is not dispatched:
 * the driver was chosen when the passenger asked, and the trip leaves at
 * its own time. The generic ride words (Finding your driver) and the
 * package words (Picked Up, Delivered) were both wrong for it, and the
 * founder saw the package set on a seat booking on 2026-09-05.
 */
const SEAT_LABELS: Record<string, string> = {
  awaiting_payment: 'Pay to hold your seat',
  pending:          'Seat held',
  assigned:         'Driver confirmed',
  picked_up:        'On board',
  in_transit:       'On the trip',
  delivered:        'Trip completed',
  failed:           'Trip did not happen',
  cancelled:        'Seat cancelled',
};

/** The states where a package is actually in motion. */
const IN_FLIGHT = ['assigned', 'picked_up', 'in_transit'];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** "11 Aug 13:47", or just "13:47" when the day is already on screen. */
function stamp(iso?: string | null, withDate = true): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return withDate ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${hh}:${mm}` : `${hh}:${mm}`;
}

const sameDay = (a?: string | null, b?: string | null) =>
  !!a && !!b && new Date(a).toDateString() === new Date(b).toDateString();

/**
 * When the package was booked.
 *
 * Deliberately the EARLIEST timestamp on the record rather than
 * createdAt. Seeded runs exist whose createdAt is a day after their
 * deliveredAt, and once steps carry times that reads "Booked 12 Aug,
 * Delivered 11 Aug" (device QA 2026-08-19). Taking the minimum is also
 * simply correct for real data, where createdAt already is the minimum.
 */
function bookedAt(d: any): string | null {
  const times = [d?.createdAt, d?.assignedAt, d?.pickedUpAt, d?.deliveredAt]
    .filter(Boolean)
    .map((t: string) => new Date(t).getTime())
    .filter((n: number) => !Number.isNaN(n));
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

/**
 * Who is holding the package right now, for the whole journey rather
 * than only at the end (founder 2026-08-19).
 *
 * Handoff records are the truth when they exist: the backend already
 * folds them into the event log with labels like "Driver dropped at
 * partner" and a signature name. Before any handoff is recorded we fall
 * back to the status, so an in-flight package can still answer "who has
 * my package" instead of going quiet until it lands.
 */
function custodyOf(d: any, driverName?: string | null) {
  if (!d) return null;
  const events: any[] = Array.isArray(d.events) ? d.events : [];
  const lastHandoff = [...events].reverse().find(e => e?.type === 'handoff');
  const status = String(d.status ?? '');

  if (lastHandoff) {
    const who = lastHandoff.meta?.signatureName;
    return {
      who:    lastHandoff.description ?? 'Hand-off recorded',
      detail: [who ? `Signed by ${who}` : null, stamp(lastHandoff.createdAt, false)]
        .filter(Boolean).join(' · '),
      where:  d.dropoffAddress ?? null,
    };
  }

  if (status === 'delivered') {
    return {
      who:    'Delivered',
      detail: d.deliveredAt ? stamp(d.deliveredAt) : null,
      where:  d.dropoffAddress ?? null,
    };
  }
  if (status === 'pending') {
    if (d?.awaitingPayment) {
      if (d?.tripId) {
        return {
          who:    'Pay to hold your seat',
          detail: 'The driver has accepted. The seat is yours once payment lands.',
          where:  null,
        };
      }
      return {
        who:    'Waiting for payment',
        detail: 'We start finding a driver the moment payment lands',
        where:  null,
      };
    }
    if (d?.tripId) {
      return { who: 'Seat held', detail: 'Your driver leaves at the declared time', where: null };
    }
    return { who: 'Looking for a driver', detail: 'Nobody is carrying it yet', where: null };
  }
  if (IN_FLIGHT.includes(status)) {
    const named = driverName ? `With ${driverName}` : 'With your driver';
    return {
      who:    status === 'assigned' ? `${named}, heading to pickup` : `${named}, on the way`,
      detail: null,
      where:  d.dropoffAddress ?? null,
    };
  }
  if (status === 'failed')    return { who: 'Delivery could not be completed', detail: null, where: d.dropoffAddress ?? null };
  if (status === 'cancelled') return { who: 'Cancelled before delivery', detail: null, where: null };
  return null;
}

const STEP_KEYS = ['tracking.shortFinding', 'tracking.shortAssigned', 'tracking.shortPickedUp', 'tracking.shortInTransit', 'tracking.shortDelivered'];

export default function TrackScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const params = useLocalSearchParams<{ code?: string }>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [code,         setCode]         = useState(params.code ?? '');
  const [deliveryId,   setDeliveryId]   = useState<string | null>(null);
  const [deliveryData, setDeliveryData] = useState<any>(null);
  const [searching,    setSearching]    = useState(false);
  const [notFound,     setNotFound]     = useState(false);
  const [redirectOpen,  setRedirectOpen]  = useState(false);
  const [redirectStores, setRedirectStores] = useState<any[]>([]);
  const [payingFee, setPayingFee] = useState(false);
  const [addrOpen,  setAddrOpen]  = useState(false);
  const [addrText,  setAddrText]  = useState('');
  const [addrCoords, setAddrCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [addrBusy,  setAddrBusy]  = useState(false);
  const [redirectBusy,  setRedirectBusy]  = useState(false);

  // Mid-flight rescue (founder 2026-08-10): when the RECIPIENT is not
  // available, the customer can redirect the drop-off to a partner
  // store NEAR THE ORIGINAL DROPOFF (not near the customer's phone).
  // One redirect per delivery: the backend rejects a second attempt.
  /**
   * Settle the redirect fee so the store address unmasks.
   *
   * The screen used to tell the sender to contact support for this,
   * while the endpoint behind this button already existed.
   */
  const payRedirectFee = async () => {
    if (!deliveryId) return;
    setPayingFee(true);
    try {
      const res = await deliveriesApi.payRedirectFee(deliveryId);
      if (res?.authorizationUrl) {
        await Linking.openURL(res.authorizationUrl);
      } else {
        showDialog({ title: 'Could not start payment', message: 'Please try again in a moment.' });
      }
    } catch (e: any) {
      showDialog({ title: 'Could not start payment', message: e?.message ?? 'Please try again.' });
    } finally {
      setPayingFee(false);
    }
  };

  /**
   * Hand the bill to the person collecting it.
   *
   * The receiver usually owes this and has no SEIRS account, so the
   * collection page takes payment from anyone holding the link. Sharing
   * it lets the two of them settle it without SEIRS in the middle.
   */
  const shareCollectLink = async () => {
    const code = deliveryData?.trackingCode;
    if (!code) return;
    const url = collectUrl(code);
    try {
      await Share.share({
        message:
          `Your package ${code} is waiting at a SEIRS partner store. ` +
          `Settle the collection fee and get the pickup address here: ${url}`,
      });
    } catch {
      /* the user dismissed the share sheet */
    }
  };

  /**
   * Ask for the package back.
   *
   * Quoted before anything is committed, because a return priced from
   * where the rider got to can cost more than the original delivery, and
   * a sender should never discover that after agreeing.
   */
  const requestReturn = async () => {
    if (!deliveryId) return;
    try {
      const q = await deliveriesApi.getReturnQuote(deliveryId);
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
                const r = await deliveriesApi.requestReturn(deliveryId);
                showDialog({
                  title: r.status === 'pending' ? 'Sent to support' : 'Return approved',
                  message: r.status === 'pending'
                    ? 'A driver is carrying this package, so support has to arrange it. We will let you know.'
                    : 'Pay in the app and we will bring it back to your pickup address.',
                });
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
    if (!deliveryId) return;
    try {
      const res = await deliveriesApi.payReturn(deliveryId);
      if (res?.authorizationUrl) await Linking.openURL(res.authorizationUrl);
    } catch (e: any) {
      showDialog({ title: 'Could not start payment', message: e?.message ?? 'Please try again.' });
    }
  };

  /**
   * Ask support to correct a wrong address.
   *
   * Not applied here: this only asks. Support decides, and the drop-off
   * moves once it is paid for.
   */
  const submitAddressChange = async () => {
    if (!deliveryId || addrText.trim().length < 6) return;
    setAddrBusy(true);
    try {
      const res = await deliveriesApi.requestAddressChange(deliveryId, {
        address: addrText.trim(),
        lat: addrCoords?.lat,
        lng: addrCoords?.lng,
      });
      setAddrOpen(false);
      setAddrText('');
      setAddrCoords(null);
      showDialog({
        title: 'Sent to support',
        message:
          `We quoted ${naira(res.quoteNgn)} for the ${Number(res.km).toFixed(1)} km ` +
          `from where your driver is now. Support will approve or decline, and you only pay if they approve.`,
      });
    } catch (e: any) {
      showDialog({ title: 'Could not send that', message: e?.message ?? 'Please try again.' });
    } finally {
      setAddrBusy(false);
    }
  };

  const openRedirect = async () => {
    setRedirectOpen(true);
    try {
      const res = await dropoffApi.directory(
        deliveryData?.dropoffLat ?? undefined,
        deliveryData?.dropoffLng ?? undefined,
      );
      setRedirectStores((res?.items ?? []).slice(0, 8));
    } catch {
      setRedirectStores([]);
    }
  };

  const confirmRedirect = (store: any) => {
    showDialog({
      title: 'Redirect to this store?',
      message:
        `${store.storeName}\n${store.storeAddress}\n\nUse this only when the recipient cannot receive the package. ` +
        `The driver will deliver to this store instead, and the recipient collects it with their code. ` +
        `You can only redirect once per delivery.`,
      actions: [
        {
          text: 'Redirect',
          style: 'primary',
          onPress: async () => {
            setRedirectBusy(true);
            try {
              await deliveriesApi.redirectToStore(deliveryData.id, store.id);
              setRedirectOpen(false);
              showDialog({ title: 'Redirected', message: `The driver now delivers to ${store.storeName}. The recipient collects with their code.` });
              handleSearch();
            } catch (e: any) {
              showDialog({ title: 'Could not redirect', message: e?.message ?? 'Please try again or contact support.' });
            } finally {
              setRedirectBusy(false);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  };

  const { driverLocation, deliveryStatus, assignedDriver, isConnected } =
    useDeliveryTracking(deliveryId);

  useEffect(() => {
    if (params.code) handleSearch();
  }, []);

  const rawStatus     = deliveryStatus ?? deliveryData?.status ?? null;
  const currentStatus = deliveryData?.awaitingPayment && rawStatus === 'pending'
    ? 'awaiting_payment'
    : rawStatus;
  const statusInfo    = currentStatus ? STATUS_CONFIG[currentStatus] : null;

  /** The state colour, taken from the status config's own gradient. */
  const statusAccent = statusInfo?.gradient?.[0] ?? theme.border;

  /**
   * The five steps with a time against each.
   *
   * Driven off the delivery's own timestamps rather than the event log,
   * because older runs come back with `events: []` and a timeline built
   * only on events renders blank on exactly the deliveries worth showing
   * (device QA 2026-08-19). Events refine the picture when present.
   */
  const journey = (() => {
    const d = deliveryData;
    if (!d) return [] as Array<{ key: string; when: string; done: boolean; current: boolean }>;
    const booked = bookedAt(d);
    const at: Array<string | null> = [
      booked,
      d.assignedAt  ?? null,
      d.pickedUpAt  ?? null,
      d.pickedUpAt  ?? null,   // in transit has no column of its own
      d.deliveredAt ?? null,
    ];
    const step = statusInfo?.step ?? 0;
    let lastShown: string | null = null;
    return STEP_KEYS.map((key, i) => {
      const iso  = at[i];
      const show = iso ? stamp(iso, !sameDay(iso, lastShown)) : '';
      if (iso) lastShown = iso;
      return {
        key,
        when:    step >= i + 1 ? show : '',
        done:    step >= i + 1,
        current: step === i + 1,
      };
    });
  })();

  /*
   * Read against the RESOLVED status. The header takes its status from
   * the live tracking stream, this card took it from the fetched record,
   * and on 2026-09-06 the two disagreed on the founder's phone: the
   * header said Cancelled while this card said Waiting for payment.
   */
  const custody = custodyOf(
    deliveryData ? { ...deliveryData, status: rawStatus ?? deliveryData.status } : deliveryData,
    assignedDriver?.name ?? deliveryData?.driver?.name ?? null,
  );

  /**
   * Whether the details card has anything to put under its rule. The
   * public tracking payload carries no price, distance or description,
   * so hiding the chips alone left a divider with dead space beneath it.
   */
  const hasMeta = !!deliveryData && (
    !!deliveryData.packageDescription ||
    deliveryData.distanceKm != null ||
    deliveryData.price != null
  );

  const handleSearch = async () => {
    if (!code.trim()) return;
    setSearching(true);
    setNotFound(false);
    try {
      const data = await deliveriesApi.track(code.trim().toUpperCase());
      setDeliveryData(data);
      setDeliveryId(data.id);
    } catch {
      setNotFound(true);
    } finally {
      setSearching(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.xl }}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>{tx('auto.track.trackPackage', 'Track Package')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            Enter your tracking code
          </Text>
        </View>

        {/* Search bar */}
        <View style={[styles.searchCard, { backgroundColor: theme.surface }, Shadows.sm]}>
          <View style={[styles.searchInputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Ionicons name="search-outline" size={18} color={theme.textThird} style={{ marginRight: Spacing.sm }} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="e.g. SRS-AB12CD34"
              placeholderTextColor={theme.textThird}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              autoCapitalize="characters"
            />
          </View>
          <Pressable
            style={[styles.searchBtn, { backgroundColor: theme.primary }]}
            onPress={handleSearch}
            disabled={searching}
          >
            {searching
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.searchBtnText}>{tx('auto.track.track', 'Track')}</Text>}
          </Pressable>
        </View>

        {notFound && (
          <View style={[styles.notFoundBox, { backgroundColor: theme.error + '15', borderColor: theme.error + '30' }]}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.error} />
            <Text style={[styles.notFoundText, { color: theme.error }]}>
              No delivery found with that code.
            </Text>
          </View>
        )}

        {/* Result */}
        {deliveryData && (
          <>
            {/* Status, as a bar rather than a wall of colour.
                The gradient hero took a quarter of the screen to say one
                word, and green was carrying a mood instead of a state
                (founder review 2026-08-19). The state now lives in a
                coloured edge and a chip, which is how the business app
                does it. */}
            <View style={[
              styles.statusBar,
              { backgroundColor: theme.surface, borderLeftColor: statusAccent },
              Shadows.sm,
            ]}>
              <Ionicons name={statusInfo?.icon as any ?? 'cube'} size={20} color={statusAccent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.statusBarLabel, { color: theme.text }]}>
                  {(deliveryData as any)?.kind === 'ride'
                    ? (((deliveryData as any)?.tripId ? SEAT_LABELS : RIDE_LABELS)[String(currentStatus)] ?? (statusInfo ? t(statusInfo.labelKey) : t('common.loading')))
                    : (statusInfo ? t(statusInfo.labelKey) : t('common.loading'))}
                </Text>
                <Text style={[styles.statusBarCode, { color: theme.textSecond }]}>
                  {deliveryData.trackingCode}
                </Text>
              </View>
              {/* LIVE means this package is moving right now, not that
                  our socket happens to be connected. */}
              {isConnected && IN_FLIGHT.includes(String(currentStatus)) && (
                <View style={[styles.liveChip, { backgroundColor: theme.success + '22' }]}>
                  <View style={[styles.liveDot, { backgroundColor: theme.success }]} />
                  <Text style={[styles.liveChipText, { color: theme.success }]}>LIVE</Text>
                </View>
              )}
            </View>

            {/* Show package QR.
                The driver app's scan screen has been telling riders to
                "ask the customer to open their tracking screen and tap
                Show package QR" while this button did not exist in the
                customer app at all, so the rider was sent to ask for
                something that could not be produced (found 2026-08-24).
                Placed high because it is the strongest handover option:
                the other two are self-attested, this one puts a code the
                sender issued in the hand of the person at the door.
                Rides carry no package, and a finished or cancelled run
                has nothing left to hand over. */}
            {(deliveryData as any)?.kind !== 'ride' && !!deliveryData.trackingCode &&
              !['delivered', 'failed', 'cancelled'].includes(String(currentStatus)) && (
              <Pressable
                onPress={() => router.push({
                  pathname: '/(customer)/package-qr',
                  params: {
                    code:        String(deliveryData.trackingCode),
                    description: String(deliveryData.packageDescription ?? ''),
                    receiver:    String(
                      [deliveryData.receiverFirstName, deliveryData.receiverLastName]
                        .filter(Boolean).join(' ') || deliveryData.recipientName || '',
                    ),
                  },
                } as any)}
                style={[styles.redirectBtn, { backgroundColor: theme.surface, borderColor: theme.primary }, Shadows.sm]}
              >
                <Ionicons name="qr-code-outline" size={18} color={theme.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.redirectTitle, { color: theme.text }]}>{tx('auto.track.showPackageQr', 'Show package QR')}</Text>
                  <Text style={[styles.redirectSub, { color: theme.textSecond }]}>
                    Screenshot it for whoever is receiving. The driver scans it at handover.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
              </Pressable>
            )}

            {/* The journey, one line per step, each carrying its own
                time. The old stepper was five tall rows with no times at
                all, and its final node showed a bare number where every
                other node showed a check. */}
            <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{tx('auto.track.journey', 'Journey')}</Text>
              {journey.map(step => (
                <View key={step.key} style={styles.tlRow}>
                  <View style={[
                    styles.tlDot,
                    { backgroundColor: step.done ? theme.success : theme.border },
                  ]} />
                  <Text style={[
                    styles.tlWhat,
                    { color: step.done ? theme.text : theme.textSecond },
                    step.current && { fontWeight: FontWeight.bold as any },
                  ]}>
                    {t(step.key)}
                  </Text>
                  <Text style={[styles.tlWhen, { color: theme.textThird }]}>{step.when}</Text>
                </View>
              ))}
            </View>

            {/* Who is holding it, at every stage rather than only at the
                end: a package that has been rerouted to a partner store
                or signed for by somebody else is exactly when a sender
                needs telling (founder 2026-08-19). */}
            {custody && (
              <View style={[
                styles.custodyCard,
                { backgroundColor: theme.surface, borderLeftColor: theme.primary },
                Shadows.sm,
              ]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>{tx('auto.track.whoHasIt', 'Who has it')}</Text>
                <Text style={[styles.custodyWho, { color: theme.text }]}>{custody.who}</Text>
                {!!custody.detail && (
                  <Text style={[styles.custodyLine, { color: theme.textSecond }]}>{custody.detail}</Text>
                )}
                {!!custody.where && (
                  <View style={styles.custodyWhereRow}>
                    <Ionicons name="location-outline" size={12} color={theme.textThird} />
                    <Text style={[styles.custodyLine, { color: theme.textSecond, flex: 1 }]}>
                      {custody.where}
                    </Text>
                  </View>
                )}
                {currentStatus === 'awaiting_payment' && !!deliveryData?.id && (
                  <Pressable
                    style={{ marginTop: 10, backgroundColor: '#FFBE0B', borderRadius: 12,
                             paddingVertical: 12, alignItems: 'center' }}
                    onPress={() => router.push({
                      pathname: '/(customer)/payment/[deliveryId]',
                      params: { deliveryId: deliveryData.id },
                    } as any)}
                  >
                    {/* Navy on brand yellow: white on #FFBE0B is unreadable. */}
                    <Text style={{ color: '#0F2B4C', fontSize: 14, fontWeight: '700' }}>
                      Complete payment
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* The map. Sits above the driver card because "where is it"
                is the question this screen exists to answer, and the
                socket was already delivering the answer with nowhere to
                put it. */}
            <View style={[styles.card, { backgroundColor: theme.surface, padding: 0, overflow: 'hidden' }, Shadows.sm]}>
              <Text style={[styles.cardTitle, { color: theme.text, paddingHorizontal: Spacing.md, paddingTop: Spacing.md }]}>
                {currentStatus === 'delivered' ? 'Where it went' : 'Where it is'}
              </Text>
              <DeliveryTrackMap
                pickup={{ lat: deliveryData.pickupLat, lng: deliveryData.pickupLng }}
                dropoff={{ lat: deliveryData.dropoffLat, lng: deliveryData.dropoffLng }}
                driver={driverLocation}
                isDark={isDark}
                theme={theme}
              />
            </View>

            {/* Driver card */}
            {(assignedDriver ?? deliveryData.driver) && (
              <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>{tx('auto.track.yourDriver', 'Your Driver')}</Text>
                <View style={styles.driverRow}>
                  <View style={[styles.driverAvatar, { backgroundColor: theme.primary }]}>
                    <Text style={styles.driverAvatarText}>
                      {(assignedDriver?.name ?? deliveryData.driver?.name ?? deliveryData.driver?.user?.name ?? 'D')[0]}
                    </Text>
                  </View>
                  <View style={styles.driverInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.driverName, { color: theme.text }]}>
                        {assignedDriver?.name ?? deliveryData.driver?.name ?? deliveryData.driver?.user?.name}
                      </Text>
                      {/* Verified Pro badge: the Premium perk customers
                          were promised (Spec V8 §2.13), now real. */}
                      {(deliveryData.driver?.verifiedPro || (assignedDriver as any)?.verifiedPro) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#0F2B4C', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Ionicons name="shield-checkmark" size={10} color="#FFBE0B" />
                          <Text style={{ color: '#FFBE0B', fontSize: 9, fontWeight: '800', letterSpacing: 0.3 }}>PRO</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.driverMeta}>
                      <Text style={[styles.driverMetaText, { color: theme.textSecond }]}>
                        {assignedDriver?.vehicleType ?? deliveryData.driver?.vehicleType}
                      </Text>
                      {/* Shown whenever there is one. The public
                          tracking payload carries name, rating, plate,
                          vehicle and verifiedPro, and no trip count, so
                          this screen cannot judge whether a rating was
                          earned and must not invent an answer. The
                          rider's own app is where that check belongs. */}
                      {Number(assignedDriver?.rating ?? deliveryData.driver?.rating ?? 0) > 0 && (
                        <View style={styles.ratingRow}>
                          <Ionicons name="star" size={12} color="#FFBE0B" />
                          <Text style={[styles.driverMetaText, { color: theme.textSecond }]}>
                            {Number(assignedDriver?.rating ?? deliveryData.driver?.rating ?? 0).toFixed(1)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                {/* Ride trust block (founder 2026-08-23): the plate and
                    the registered vehicle photo: "this is the okada
                    coming for you". Drivers are always fully identified. */}
                {(deliveryData as any)?.kind === 'ride' && (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    {!!(assignedDriver as any)?.vehiclePlate || !!deliveryData.driver?.vehiclePlate ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ borderWidth: 1.5, borderColor: theme.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                          <Text style={{ fontFamily: 'monospace', fontWeight: '700', color: theme.text, letterSpacing: 1 }}>
                            {(assignedDriver as any)?.vehiclePlate ?? deliveryData.driver?.vehiclePlate}
                          </Text>
                        </View>
                        <Text style={{ color: theme.textThird, fontSize: FontSize.xs }}>
                          Check the plate before you get in
                        </Text>
                      </View>
                    ) : null}
                    {!!((assignedDriver as any)?.vehiclePhotoUrl ?? deliveryData.driver?.vehiclePhotoUrl) && (
                      <Image
                        source={{ uri: (assignedDriver as any)?.vehiclePhotoUrl ?? deliveryData.driver?.vehiclePhotoUrl }}
                        style={{ width: '100%', height: 120, borderRadius: 10 }}
                        resizeMode="cover"
                      />
                    )}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#DC2626', borderRadius: 10, paddingVertical: 11 }}
                        onPress={() => router.push({ pathname: '/(customer)/sos', params: { deliveryId: deliveryData.id } } as any)}
                      >
                        <Ionicons name="alert-circle" size={16} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: FontSize.sm }}>SOS</Text>
                      </Pressable>
                      <Pressable
                        style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.surfaceSecond, borderRadius: 10, paddingVertical: 11 }}
                        onPress={() => Share.share({
                          message: `I'm on a SEIRS ride (${deliveryData.trackingCode}). Follow my trip live: ${trackUrl(deliveryData.trackingCode)}`,
                        }).catch(() => {})}
                      >
                        <Ionicons name="share-social-outline" size={16} color={theme.text} />
                        <Text style={{ color: theme.text, fontWeight: '600', fontSize: FontSize.sm }}>{tx('auto.track.shareThisTrip', 'Share this trip')}</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
                {driverLocation && (
                  <View style={[styles.liveLocationRow, { backgroundColor: theme.surfaceSecond }]}>
                    <Ionicons name="location" size={14} color={theme.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.liveLocationText, { color: theme.textSecond }]}>
                        Driver location updating live
                      </Text>
                      {/* The actual position, not just a promise that one
                          exists. A customer waiting at a gate can read
                          these to whoever is receiving, and open them on
                          a real map. Costs nothing: the position arrives
                          on the socket we already hold and the native
                          Maps SDK is not billed per view. */}
                      <Text style={[styles.liveCoords, { color: theme.text }]}>
                        {Number(driverLocation.lat).toFixed(5)}, {Number(driverLocation.lng).toFixed(5)}
                      </Text>
                    </View>
                    <View style={styles.liveDotSmall} />
                  </View>
                )}
                {driverLocation && (
                  <Pressable
                    style={({ pressed }) => [styles.liveMapsBtn, { opacity: pressed ? 0.6 : 1 }]}
                    onPress={() => {
                      Linking.openURL(
                        `https://www.google.com/maps?q=${Number(driverLocation.lat)},${Number(driverLocation.lng)}`,
                      ).catch(() => {});
                    }}
                  >
                    <Ionicons name="open-outline" size={14} color={theme.primary} />
                    <Text style={[styles.liveMapsText, { color: theme.primary }]}>
                      See where your driver is on Google Maps
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* URGENT: driver is at the door, nobody home. The sender's
                5-minute response window (failed-delivery flow 2026-08-11).
                Silence = the booked fallback applies automatically. */}
            {deliveryData?.arrivalIssueAt && !deliveryData?.arrivalResolution &&
              deliveryData?.senderResponseBy && new Date(deliveryData.senderResponseBy) > new Date() && (
              <View style={[styles.card, { backgroundColor: '#FEF3C7', borderWidth: 1.5, borderColor: '#F59E0B' }]}>
                <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.bold as any, color: '#92400E', marginBottom: 4 }}>
                  Driver is at the door: nobody to receive
                </Text>
                <Text style={{ fontSize: FontSize.sm, color: '#92400E', marginBottom: Spacing.md, lineHeight: 19 }}>
                  Choose within 5 minutes or your booked fallback applies automatically.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                  {([
                    { key: 'wait',      label: 'Receiver is coming: wait' },
                    { key: 'neighbour', label: 'Leave with neighbour' },
                    { key: 'gate',      label: 'Leave at gate' },
                    { key: 'store',     label: 'Send to partner store' },
                  ] as const)
                    .filter(o => !(deliveryData?.requiresRecipientVerification && (o.key === 'gate' || o.key === 'neighbour')))
                    .map(o => (
                      <Pressable
                        key={o.key}
                        style={{ backgroundColor: '#92400E', borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 10 }}
                        onPress={async () => {
                          try {
                            await deliveriesApi.arrivalResponse(deliveryData.id, o.key);
                            showDialog({ title: 'Driver notified', message: 'Your choice went straight to the driver\'s chat.' });
                            handleSearch();
                          } catch (e: any) {
                            showDialog({ title: 'Could not send', message: e?.message ?? 'Try again.' });
                          }
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold as any }}>{o.label}</Text>
                      </Pressable>
                    ))}
                </View>
              </View>
            )}

            {/* Redirect fee owed: the pay-to-release notice. */}
            {deliveryData?.redirectFeeOwedNgn > 0 && (
              <View style={[styles.card, { backgroundColor: theme.surface, borderWidth: 1.5, borderColor: '#F59E0B' }, Shadows.sm]}>
                <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.bold as any, color: theme.text, marginBottom: 4 }}>
                  Package waiting at a partner store
                </Text>
                <Text style={{ fontSize: FontSize.sm, color: theme.textSecond, lineHeight: 19 }}>
                  Nobody was available at the door, so your package is safe at a nearby SEIRS partner store.
                  A redirect fee of {naira(deliveryData.redirectFeeOwedNgn)} (plus any storage days)
                  applies. Settle it to reveal the pickup location and collection details.
                </Text>

                {/* This used to say "contact support to settle it" while a
                    pay endpoint already existed, which sent people to a
                    queue instead of a button. */}
                <Pressable
                  onPress={payRedirectFee}
                  disabled={payingFee}
                  style={{
                    marginTop: 12, borderRadius: Radius.lg, paddingVertical: 12,
                    alignItems: 'center', backgroundColor: '#F59E0B', opacity: payingFee ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: FontWeight.bold as any, fontSize: FontSize.sm }}>
                    {payingFee ? 'Opening payment...' : `Pay ${naira(deliveryData.redirectFeeOwedNgn)}`}
                  </Text>
                </Pressable>

                {/* The receiver is usually the one who should pay this, and
                    they have no SEIRS account. Sharing the collection link
                    lets them settle it themselves. */}
                <Pressable onPress={shareCollectLink} style={{ marginTop: 8, paddingVertical: 8, alignItems: 'center' }}>
                  <Text style={{ color: theme.primary, fontWeight: FontWeight.semibold as any, fontSize: FontSize.sm }}>
                    Send the collection link to the receiver instead
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Return in flight. */}
            {deliveryData?.returnStatus && deliveryData.returnStatus !== 'rejected' && (
              <View style={[styles.card, { backgroundColor: theme.surface, borderWidth: 1.5, borderColor: '#7C3AED' }, Shadows.sm]}>
                <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.bold as any, color: theme.text, marginBottom: 4 }}>
                  Return to sender: {String(deliveryData.returnStatus)}
                </Text>
                <Text style={{ fontSize: FontSize.sm, color: theme.textSecond, lineHeight: 19 }}>
                  Going back to {deliveryData.pickupAddress}.
                  {deliveryData.returnStatus === 'pending' ? ' Support is reviewing it.' : ''}
                  {deliveryData.returnStatus === 'applied' ? ' On its way back to you.' : ''}
                </Text>
                {deliveryData.returnStatus === 'approved' && !deliveryData.returnPaidAt && (
                  <Pressable
                    onPress={payReturn}
                    style={{ marginTop: 12, borderRadius: Radius.lg, paddingVertical: 12, alignItems: 'center', backgroundColor: '#7C3AED' }}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: FontWeight.bold as any, fontSize: FontSize.sm }}>
                      Pay {naira(deliveryData.returnQuoteNgn ?? 0)} to start the return
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Address correction + return, while the package is still ours
                to move. Both quote before they commit the sender. */}
            {['assigned', 'picked_up', 'in_transit'].includes(String(currentStatus)) && (
              <>
                {!deliveryData?.addressChangeStatus && (
                  <Pressable
                    onPress={() => setAddrOpen(true)}
                    style={[styles.redirectBtn, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}
                  >
                    <Ionicons name="location-outline" size={18} color={theme.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.redirectTitle, { color: theme.text }]}>{tx('auto.track.wrongAddress', 'Wrong address?')}</Text>
                      <Text style={{ fontSize: FontSize.xs, color: theme.textThird }}>
                        Support can move it, priced from where your driver is now
                      </Text>
                    </View>
                  </Pressable>
                )}

                {!deliveryData?.returnStatus && (
                  <Pressable
                    onPress={requestReturn}
                    style={[styles.redirectBtn, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}
                  >
                    <Ionicons name="arrow-undo-outline" size={18} color={theme.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.redirectTitle, { color: theme.text }]}>{tx('auto.track.needItBack', 'Need it back?')}</Text>
                      <Text style={{ fontSize: FontSize.xs, color: theme.textThird }}>
                        Priced from where it is now, back to your pickup address
                      </Text>
                    </View>
                  </Pressable>
                )}
              </>
            )}

            {/* Recipient-not-available rescue: redirect to a partner
                store near the dropoff. Mid-flight statuses only. */}
            {['assigned', 'picked_up', 'in_transit'].includes(String(currentStatus)) && (
              <Pressable
                onPress={openRedirect}
                style={[styles.redirectBtn, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}
              >
                <Ionicons name="storefront-outline" size={18} color={theme.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.redirectTitle, { color: theme.text }]}>{tx('auto.track.recipientNotAvailable', 'Recipient not available?')}</Text>
                  <Text style={[styles.redirectSub, { color: theme.textSecond }]}>
                    Redirect the drop-off to a partner store near the destination.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
              </Pressable>
            )}

            {/* Delivery details */}
            <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{tx('auto.track.deliveryDetails', 'Delivery Details')}</Text>
              <View style={styles.detailRow}>
                <View style={[styles.dot, { backgroundColor: theme.success }]} />
                <View style={styles.detailText}>
                  <Text style={[styles.detailLabel, { color: theme.textSecond }]}>{tx('auto.track.pickup', 'Pickup')}</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>{deliveryData.pickupAddress}</Text>
                </View>
              </View>
              <View style={[styles.routeConnector, { backgroundColor: theme.border }]} />
              <View style={styles.detailRow}>
                <View style={[styles.dot, { backgroundColor: theme.error }]} />
                <View style={styles.detailText}>
                  <Text style={[styles.detailLabel, { color: theme.textSecond }]}>{tx('auto.track.dropoff', 'Dropoff')}</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>{deliveryData.dropoffAddress}</Text>
                </View>
              </View>
              {hasMeta && <View style={[styles.divider, { backgroundColor: theme.divider }]} />}
              {/* Tracking is a PUBLIC endpoint and carries no price,
                  distance or description: a recipient tracking a parcel
                  has no business seeing what the sender paid. Each chip
                  renders only when its value actually arrived, because
                  the row used to print a bare "km" and a lone naira sign
                  on every delivery (device QA 2026-08-19). */}
              {hasMeta && (
              <View style={styles.metaRow}>
                {!!deliveryData.packageDescription && (
                  <View style={styles.metaChip}>
                    <Ionicons name="cube-outline" size={14} color={theme.textSecond} />
                    <Text style={[styles.metaItem, { color: theme.textSecond }]}>{deliveryData.packageDescription}</Text>
                  </View>
                )}
                {deliveryData.distanceKm != null && (
                  <View style={styles.metaChip}>
                    <Ionicons name="map-outline" size={14} color={theme.textSecond} />
                    <Text style={[styles.metaItem, { color: theme.textSecond }]}>{Number(deliveryData.distanceKm).toFixed(1)} km</Text>
                  </View>
                )}
                {deliveryData.price != null && (
                  <Text style={[styles.metaPrice, { color: theme.primary }]}>
                    {naira(deliveryData.price)}
                  </Text>
                )}
              </View>
              )}
            </View>
          </>
        )}

        {!deliveryData && !notFound && (
          <View style={styles.placeholder}>
            <View style={[styles.placeholderIconWrap, { backgroundColor: theme.surface }]}>
              <Ionicons name="cube-outline" size={52} color={theme.textThird} />
            </View>
            <Text style={[styles.placeholderTitle, { color: theme.text }]}>{tx('auto.track.trackYourDelivery', 'Track your delivery')}</Text>
            <Text style={[styles.placeholderDesc, { color: theme.textSecond }]}>
              Enter a tracking code above to see live status and driver location.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Store picker: nearest to the ORIGINAL dropoff first */}
      <Modal visible={redirectOpen} transparent animationType="slide" onRequestClose={() => setRedirectOpen(false)}>
        <View style={styles.redirectOverlay}>
          {/* Bottom padding clears the phone's navigation bar, same fix
              as send.tsx: this sheet's Cancel button sat right on top of
              it, so a tap could hit Back instead. insets.bottom is 0 on
              gesture navigation and ~48dp on the 3-button layout, so it
              adapts rather than hardcoding a gap. */}
          <View style={[
            styles.redirectCard,
            { backgroundColor: theme.surface, paddingBottom: Spacing.lg + insets.bottom },
          ]}>
            <View style={styles.redirectHandle} />
            <Text style={[styles.redirectModalTitle, { color: theme.text }]}>{tx('auto.track.redirectToAPartnerStore', 'Redirect to a partner store')}</Text>
            <Text style={[styles.redirectModalSub, { color: theme.textSecond }]}>
              For when the recipient cannot receive the package. Stores are sorted nearest to the delivery address.
              One redirect per delivery.
            </Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {redirectStores.length === 0 ? (
                <Text style={[styles.redirectModalSub, { color: theme.textThird, paddingVertical: 20, textAlign: 'center' }]}>
                  No partner stores available near the destination right now.
                </Text>
              ) : redirectStores.map(s => (
                <Pressable
                  key={s.id}
                  disabled={redirectBusy}
                  onPress={() => confirmRedirect(s)}
                  style={[styles.redirectStoreRow, { borderBottomColor: theme.border }]}
                >
                  <View style={[styles.redirectStoreIcon, { backgroundColor: theme.primary + '15' }]}>
                    <Ionicons name="storefront-outline" size={18} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.redirectStoreName, { color: theme.text }]}>{s.storeName}</Text>
                    <Text style={[styles.redirectStoreAddr, { color: theme.textSecond }]} numberOfLines={1}>{s.storeAddress}</Text>
                    <Text style={[styles.redirectStoreMeta, { color: theme.textThird }]}>
                      {s.distanceKm != null ? `${Number(s.distanceKm).toFixed(1)} km from drop-off` : ''}
                      {(s.openTime || s.closeTime) ? ` · Open ${s.openTime ?? '?'}–${s.closeTime ?? '?'}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={[styles.redirectClose, { backgroundColor: theme.surfaceSecond }]} onPress={() => setRedirectOpen(false)}>
              <Text style={{ color: theme.text, fontWeight: FontWeight.semibold }}>{tx('auto.track.cancel', 'Cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Address correction. Deliberately a picker, not a free-text box:
          a rider needs a real coordinate, not a description. */}
      <Modal visible={addrOpen} transparent animationType="slide" onRequestClose={() => setAddrOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 }}>
            <Text style={{ fontSize: FontSize.lg, fontWeight: FontWeight.bold as any, color: theme.text }}>
              Correct the delivery address
            </Text>
            <Text style={{ fontSize: FontSize.sm, color: theme.textSecond, marginTop: 6, lineHeight: 19 }}>
              Your driver is already carrying this package, so support has to approve
              the change. You will be quoted for the distance from where they are now,
              and you only pay if it is approved.
            </Text>

            <View style={{ marginTop: 16 }}>
              <StreetAutocomplete
                label="New delivery address"
                value={addrText}
                onChangeText={setAddrText}
                placeholder="Start typing the address"
                onCoordsResolved={(lat: number, lng: number) => setAddrCoords({ lat, lng })}
              />
            </View>

            <Pressable
              onPress={submitAddressChange}
              disabled={addrBusy || addrText.trim().length < 6}
              style={{
                marginTop: 18, borderRadius: Radius.lg, paddingVertical: 14, alignItems: 'center',
                backgroundColor: theme.primary,
                opacity: addrBusy || addrText.trim().length < 6 ? 0.5 : 1,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: FontWeight.bold as any, fontSize: FontSize.base }}>
                {addrBusy ? 'Sending...' : 'Ask support to change it'}
              </Text>
            </Pressable>

            <Pressable onPress={() => setAddrOpen(false)} style={{ marginTop: 10, paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: theme.textSecond, fontSize: FontSize.sm }}>{tx('auto.track.cancel', 'Cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:   { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  title:    { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  subtitle: { fontSize: FontSize.sm, marginTop: 2 },

  searchCard:      { marginHorizontal: Spacing.md, marginBottom: Spacing.md, borderRadius: Radius.xl, padding: Spacing.md, flexDirection: 'row', gap: Spacing.sm },
  searchInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md },
  searchInput:     { flex: 1, fontSize: FontSize.base, letterSpacing: 1 },
  searchBtn:       { height: 52, paddingHorizontal: Spacing.lg, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center' },
  searchBtnText:   { color: '#fff', fontWeight: FontWeight.semibold, fontSize: FontSize.base },

  notFoundBox:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, marginBottom: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  notFoundText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  cardWrap:      { marginHorizontal: Spacing.md, marginBottom: Spacing.md, borderRadius: Radius.xl, overflow: 'hidden' },
  statusCard:    { padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm },
  statusIconWrap:{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  statusLabel:   { color: '#fff', fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  trackingCode:  { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm, letterSpacing: 2 },
  livePill:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.full },
  liveDot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  liveText:      { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 1 },

  card:       { marginHorizontal: Spacing.md, borderRadius: Radius.xl, padding: Spacing.md, marginBottom: Spacing.md },

  // Direction A: status as a bar, journey with times, custody card.
  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.md, borderRadius: Radius.xl, borderLeftWidth: 3,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  statusBarLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold as any, textTransform: 'capitalize' },
  statusBarCode:  { fontSize: FontSize.xs, letterSpacing: 0.5, marginTop: 1 },
  liveChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full,
  },
  liveChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any, letterSpacing: 0.5 },

  tlRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 5 },
  tlDot:  { width: 8, height: 8, borderRadius: 4 },
  tlWhat: { fontSize: FontSize.sm, flex: 1 },
  tlWhen: { fontSize: FontSize.xs, fontVariant: ['tabular-nums'] },

  custodyCard: {
    marginHorizontal: Spacing.md, borderRadius: Radius.xl, borderLeftWidth: 3,
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  custodyWho:  { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any },
  custodyLine: { fontSize: FontSize.sm, marginTop: 2 },
  custodyWhereRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 2 },
  cardTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: Spacing.md },

  stepRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  stepDot:    { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: Spacing.sm },
  stepNum:    { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  stepLabel:  { flex: 1, fontSize: FontSize.base },
  stepLine:   { width: 2, height: 14, marginLeft: 13, marginBottom: 4 },

  driverRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  driverAvatar:    { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  driverAvatarText:{ color: '#fff', fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  driverInfo:      { flex: 1, gap: 4 },
  driverName:      { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  driverMeta:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  driverMetaText:  { fontSize: FontSize.sm },
  ratingRow:       { flexDirection: 'row', alignItems: 'center', gap: 3 },
  liveLocationRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md, padding: Spacing.sm, borderRadius: Radius.md },
  liveLocationText:{ flex: 1, fontSize: FontSize.xs },
  liveCoords:      { fontSize: FontSize.xs, fontWeight: FontWeight.bold, fontVariant: ['tabular-nums'], marginTop: 2 },
  liveMapsBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.sm, paddingVertical: 10 },
  liveMapsText:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  liveDotSmall:    { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },

  detailRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  dot:            { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  routeConnector: { width: 1.5, height: 14, marginLeft: 4, marginVertical: 2 },
  detailText:     { flex: 1, gap: 2 },
  detailLabel:    { fontSize: FontSize.xs },
  detailValue:    { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  divider:        { height: 1, marginVertical: Spacing.md },
  metaRow:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flexWrap: 'wrap' },
  metaChip:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaItem:       { fontSize: FontSize.sm },
  metaPrice:      { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginLeft: 'auto' },

  placeholder:        { paddingTop: Spacing.xl * 2, alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md },
  placeholderIconWrap:{ width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  placeholderTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  placeholderDesc:    { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 22 },

  redirectBtn:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, marginBottom: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  redirectTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  redirectSub:   { fontSize: FontSize.xs, marginTop: 2, lineHeight: 16 },

  redirectOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  redirectCard:       { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.sm },
  redirectHandle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D1D6', alignSelf: 'center', marginBottom: 4 },
  redirectModalTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  redirectModalSub:   { fontSize: FontSize.xs, lineHeight: 17 },
  redirectStoreRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderBottomWidth: 0.5 },
  redirectStoreIcon:  { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  redirectStoreName:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  redirectStoreAddr:  { fontSize: FontSize.xs, marginTop: 1 },
  redirectStoreMeta:  { fontSize: 10, marginTop: 2 },
  redirectClose:      { height: 46, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xs },
});
