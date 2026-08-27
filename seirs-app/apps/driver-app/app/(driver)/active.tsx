import {
  View, Text, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Image,
  Platform, Modal, TextInput, Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import {
  startBackgroundLocation,
  stopBackgroundLocation,
  requestBackgroundPermission,
  hasBackgroundPermission,
  flushPendingFix,
} from '@/lib/backgroundLocation';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { deliveriesApi, driversApi, uploadApi, earningsApi } from '@/services/api';
import { useDirectionsPolyline } from '@/components/useDirectionsPolyline';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';
import { Avatar } from '@/components/ui/Avatar';
import { naira } from '@/utils/money';
import { alertDialog } from '@/components/SeirsDialog';

const STATUS_STEPS: {
  key: string; label: string; icon: string;
  action: string | null; next: string | null;
  gradient: readonly [string, string];
}[] = [
  // Brand palette only (audit 2026-08-10: the old in_transit step was
  // purple, which is not a SEIRS colour).
  { key: 'assigned',   label: 'Head to Pickup',   icon: 'map-outline',            action: 'Mark Picked Up',    next: 'picked_up',  gradient: ['#3A7BD5', '#2A5FA8'] },
  { key: 'picked_up',  label: 'Package Collected', icon: 'cube-outline',           action: 'Start Delivery',    next: 'in_transit', gradient: ['#FFBE0B', '#D99E00'] },
  { key: 'in_transit', label: 'En Route',           icon: 'navigate-outline',       action: 'Confirm Delivered', next: 'delivered',  gradient: ['#0F2B4C', '#1A3A63'] },
  { key: 'delivered',  label: 'Delivered!',          icon: 'checkmark-circle-outline', action: null,             next: null,         gradient: ['#16A34A', '#15803D'] },
];

/**
 * A ride is the same state machine wearing human words (founder
 * 2026-08-23): no photos, no codes, no handoff ceremony. "I've arrived"
 * fires the picked_up transition, which is what pings the passenger.
 */
const RIDE_STEPS: typeof STATUS_STEPS = [
  { key: 'assigned',   label: 'Head to pickup',        icon: 'map-outline',              action: "I've arrived",  next: 'picked_up',  gradient: ['#3A7BD5', '#2A5FA8'] },
  { key: 'picked_up',  label: 'Waiting for passenger', icon: 'person-outline',           action: 'Start ride',    next: 'in_transit', gradient: ['#FFBE0B', '#D99E00'] },
  { key: 'in_transit', label: 'On the trip',           icon: 'navigate-outline',         action: 'End ride',      next: 'delivered',  gradient: ['#0F2B4C', '#1A3A63'] },
  { key: 'delivered',  label: 'Ride completed!',       icon: 'checkmark-circle-outline', action: null,            next: null,         gradient: ['#16A34A', '#15803D'] },
];

export default function ActiveDeliveryScreen() {
  const { id }      = useLocalSearchParams<{ id: string }>();
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];

  const [delivery,   setDelivery]   = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [updating,   setUpdating]   = useState(false);
  const [proofUri,   setProofUri]   = useState<string | null>(null);
  const [proofReady, setProofReady] = useState(false);
  // Whether locked-screen reporting is actually running, not merely permitted.
  const [bgTracking, setBgTracking] = useState(false);
  // Android has no Alert.prompt, so third-party acceptance collects the
  // name in a small modal instead.
  const [showReceiverPrompt, setShowReceiverPrompt] = useState(false);
  const [receiverName,       setReceiverName]       = useState('');
  const [myPos,      setMyPos]      = useState<{ lat: number; lng: number } | null>(null);

  /**
   * Every dialog on this screen, in one themed sheet.
   *
   * Android's AlertDialog renders only the first three buttons and drops
   * the rest without a word, which is how "Cancel this job?" lost half
   * its reasons including "I feel unsafe" (founder found the same class
   * of bug on Report a problem, 2026-08-24). It is also the one surface
   * the SEIRS design system could not reach. Holding a single spec in
   * state keeps every call site a setState rather than another dialog
   * API, and keeps this screen from mixing two dialog looks.
   */
  const [sheet, setSheet] = useState<SeirsSheetSpec | null>(null);
  /**
   * How long earnings take to clear, from the server.
   *
   * The completion dialog hardcoded "2 business days" while
   * GET /earnings/dashboard was reporting clearanceBusinessDays: 0, so a
   * rider got two different answers to the one number they care about
   * most (founder 2026-08-24). null means not loaded yet: the copy drops
   * the promise entirely rather than guessing.
   */
  const [clearanceDays, setClearanceDays] = useState<number | null>(null);

  // Holds the movement subscription and the stationary heartbeat.
  const locationWatch    = useRef<{ remove: () => void } | null>(null);
  const locationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentAt       = useRef<number>(0);
  const gpsFailures      = useRef<number>(0);
  /**
   * Bottom clearance for the floating footer. This screen never read
   * insets, so the last row sat under the system navigation bar. The
   * floor matters as much as the inset: on a 3-button Samsung the inset
   * reports 0 and the bar is still there.
   */
  const insets = useSafeAreaInsets();
  /**
   * Real footer height, measured. The ScrollView used a hardcoded
   * paddingBottom of 100 while the footer is absolutely positioned over
   * it, so once the footer grew the Progress card sat permanently
   * underneath and could not be read at all (founder, on device
   * 2026-08-24). Measuring means this cannot drift again.
   */
  const [footerH, setFooterH] = useState(0);
  // Full-screen map. The inline one has gestures disabled because it sits
  // in a ScrollView; this is where a rider can actually pan and zoom.
  const [mapExpanded, setMapExpanded] = useState(false);

  /**
   * What the status banner says besides the status. Facts only: the
   * distance still to cover and how long this job has been running.
   * Never a predicted arrival time.
   */
  const bannerWho = [delivery?.receiverFirstName, delivery?.receiverLastName]
    .filter(Boolean).join(' ') || null;
  const jobStartedAt = (delivery as any)?.pickedUpAt ?? (delivery as any)?.assignedAt ?? null;
  const elapsedLabel = (() => {
    if (!jobStartedAt) return null;
    const t = new Date(jobStartedAt);
    if (isNaN(t.getTime())) return null;
    const mins = Math.floor((Date.now() - t.getTime()) / 60000);
    if (mins < 1)  return 'Just started';
    if (mins < 60) return `On this job ${mins} min`;
    const h = Math.floor(mins / 60);
    return `On this job ${h}h ${mins % 60}m`;
  })();
  /**
   * Clear the system navigation bar with room to spare.
   *
   * 16 then 28 were both still too tight: the founder reported a rider
   * could hit Home reaching for the last button. The 3-button bar on
   * this Samsung is around 48px and insets.bottom reports 0, so this
   * floor is the only thing keeping the button off it. Missing a
   * delivery action and dropping to the home screen mid-job is a bad
   * enough outcome to spend the pixels on.
   */
  const footerPad = Math.max(insets.bottom + 24, 56);
  const mapRef           = useRef<MapView>(null);

  /**
   * The whole run in one tap, same as the job card. Pickup as origin,
   * dropoff as destination, so a rider mid-delivery gets turn-by-turn
   * without retyping an address at the roadside.
   *
   * This screen had no Google Maps affordance at all until the founder
   * found it on device (2026-08-24), even though the map comment below
   * already claimed the driver would "get real navigation by opening
   * Google Maps".
   */
  const openInGoogleMaps = () => {
    if (!delivery?.pickupLat || !delivery?.dropoffLat) return;
    const url =
      `https://www.google.com/maps/dir/?api=1` +
      `&origin=${Number(delivery.pickupLat)},${Number(delivery.pickupLng)}` +
      `&destination=${Number(delivery.dropoffLat)},${Number(delivery.dropoffLng)}` +
      `&travelmode=driving`;
    Linking.openURL(url).catch(() => {
      info(
        'Could not open Google Maps',
        'Google Maps did not open. Check that it is installed and enabled, then call the receiver for directions.',
      );
    });
  };

  // Real road-following route from Google Directions. Distance only:
  // durationText is deliberately not read, SEIRS shows no arrival times.
  const {
    coords:       routeCoords,
    distanceText: routeDistance,
  } = useDirectionsPolyline(
    delivery?.pickupLat  != null
      ? { latitude: Number(delivery.pickupLat),  longitude: Number(delivery.pickupLng)  }
      : null,
    delivery?.dropoffLat != null
      ? { latitude: Number(delivery.dropoffLat), longitude: Number(delivery.dropoffLng) }
      : null,
  );

  useEffect(() => {
    // No id means this screen was opened without a target delivery: flip
    // loading off so the empty-state renders instead of an infinite spinner.
    if (!id) {
      setLoading(false);
      return;
    }
    /**
     * This called deliveriesApi.track(id), which is
     * GET /deliveries/track/:code and matches on trackingCode only. The
     * id handed in here is the delivery UUID, so it could never match
     * and the screen showed "Delivery not found" on every single trip
     * (confirmed against production 2026-08-24, HTTP 404).
     *
     * .get() is the entitled fetch: the backend now serves the assigned
     * driver as well as the customer, and redacts a ride passenger down
     * to a first name on the way out. The tracking payload also lacked
     * distanceKm, driverEarnings and the package fields this screen
     * renders, which is where the "NaN km" would have come from.
     */
    deliveriesApi.get(id)
      .then(setDelivery)
      .catch(() => {})
      .finally(() => setLoading(false));
    // Read the clearance window instead of repeating a number from a
    // comment. Same source the withdrawal screen uses, so the two
    // screens cannot disagree about a rider's money again.
    earningsApi.dashboard()
      .then((d: any) => {
        const n = Number(d?.clearanceBusinessDays);
        setClearanceDays(Number.isFinite(n) && n >= 0 ? n : null);
      })
      .catch(() => setClearanceDays(null));
  }, [id]);

  useEffect(() => {
    startBroadcast();
    /**
     * Keep reporting when the screen locks.
     *
     * The foreground watcher above dies the moment Android suspends the
     * activity, which is every time the rider pockets the phone. Without
     * this the customer's pin freezes on whatever street the rider was
     * on when the screen went dark, and they have no way to tell that
     * from a rider who has stopped.
     *
     * Nothing is prompted here. A permission dialog thrown at someone
     * mid-delivery gets dismissed; the ask lives on the banner below,
     * where it can explain itself. If the grant is already there, this
     * simply starts.
     */
    void (async () => {
      if (await hasBackgroundPermission()) {
        const ok = await startBackgroundLocation();
        setBgTracking(ok);
      }
      // Anything the task could not deliver while offline.
      void flushPendingFix();
    })();
    return () => {
      stopBroadcast();
      void stopBackgroundLocation();
    };
  }, []);

  /**
   * Report a problem with this job.
   *
   * The rider is standing at the pickup and the parcel is not what the
   * sender described. Before this the only route was to leave the job,
   * find Profile -> Support, open a ticket with no photo, then attach one
   * inside the thread: five screens at a roadside with a sender watching.
   * In practice riders either accepted parcels they should not have, or
   * rang somebody personally, and no record survived either way.
   *
   * Camera first, because the photo is the evidence. The backend flags the
   * delivery and opens the ticket in one call.
   */
  const REPORT_REASONS = [
    { key: 'mismatch',   label: "Package doesn't match the description" },
    { key: 'overweight', label: 'Heavier than declared' },
    { key: 'absent',     label: 'Sender not present / wrong address' },
    { key: 'unsafe',     label: 'Unsafe or refused item' },
  ] as const;

  const [reporting, setReporting] = useState(false);

  /** Single-action informational sheet: the old alertDialog(title, body). */
  const info = (title: string, message?: string, onDone?: () => void) =>
    setSheet({
      title,
      message,
      options: [{ label: 'Got it', variant: 'primary', onPress: onDone }],
      cancelLabel: null,
      onCancel: onDone,
    });

  const reportProblem = () => setSheet({
    title: 'Report a problem',
    message: 'What is wrong with this job? You will be asked for a photo.',
    options: REPORT_REASONS.map(r => ({
      label: r.label,
      onPress: () => captureAndReport(r.key, r.label),
    })),
  });

  const captureAndReport = async (reason: string, label: string) => {
    try {
      setReporting(true);
      let photoUrl: string | undefined;

      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status === 'granted') {
        const shot = await ImagePicker.launchCameraAsync({ quality: 0.7 });
        if (!shot.canceled && shot.assets?.[0]?.uri) {
          const { url } = await uploadApi.file(shot.assets[0].uri, 'image/jpeg', 'chat');
          photoUrl = url;
        }
      }

      const res = await deliveriesApi.reportIssue(delivery.id, {
        reason: reason as any,
        photoUrl,
      });

      setSheet({
        title: 'Reported',
        message: photoUrl
          ? `Support has your photo and the job is flagged. ${label}.`
          : `Support has been notified and the job is flagged. ${label}.\n\nNo photo was attached, which makes it harder to settle.`,
        options: res?.ticketId
          ? [{
              label: 'Open the ticket',
              variant: 'primary' as const,
              onPress: () => router.push({
                pathname: '/(driver)/support/[ticketId]',
                params: { ticketId: res.ticketId },
              } as any),
            }]
          : [{ label: 'Got it', variant: 'primary' as const }],
        cancelLabel: res?.ticketId ? 'Not now' : null,
      });
    } catch (e: any) {
      info('Could not report', e?.message ?? 'Please try again.');
    } finally {
      setReporting(false);
    }
  };

  const startBroadcast = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    // Get an immediate fix so the map can centre right away
    try {
      const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setMyPos({ lat: first.coords.latitude, lng: first.coords.longitude });
    } catch { /* keep null */ }
    /**
     * Sample on movement, not on a clock.
     *
     * distanceInterval means a rider sitting in traffic or waiting at a
     * gate costs nothing at all, while a moving rider still gives the
     * customer a pin that tracks. 250m is roughly a street on an okada.
     * timeInterval is the floor between updates, so a fast rider cannot
     * flood the server either.
     */
    const push = async (lat: number, lng: number) => {
      setMyPos({ lat, lng });
      try {
        await driversApi.updateLocation(lat, lng);
        lastSentAt.current = Date.now();
        gpsFailures.current = 0;
      } catch {
        gpsFailures.current += 1;
        // Say something once, then stay quiet. A rider whose tracking
        // has gone dark needs to know: the customer is watching a pin
        // that has stopped moving and believes it.
        if (gpsFailures.current === 3) {
          info(
            'Location not reaching SEIRS',
            'Your position has not updated for a few minutes. Check your data connection: your customer is watching this.',
          );
        }
      }
    };

    locationWatch.current = await Location.watchPositionAsync(
      {
        accuracy:         Location.Accuracy.Balanced,
        distanceInterval: 250,    // metres moved before a new fix is sent
        timeInterval:     30000,  // never more often than every 30s
      },
      (pos) => { void push(pos.coords.latitude, pos.coords.longitude); },
    );

    /**
     * Heartbeat for a rider who is not moving. The founder's ten minutes
     * is the ceiling, not the sampling rate: it only fires when movement
     * has produced nothing in that window, so a stationary rider checks
     * in occasionally and a moving one is handled above.
     */
    locationInterval.current = setInterval(async () => {
      if (Date.now() - lastSentAt.current < 10 * 60 * 1000) return;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await push(pos.coords.latitude, pos.coords.longitude);
      } catch { /* no fix available, try again next tick */ }
    }, 60 * 1000);
  };

  /**
   * Turn on locked-screen reporting.
   *
   * Android 10 treats "Allow all the time" as a separate grant from
   * foreground, and refuses the background prompt outright unless
   * foreground was granted first, which reads to a rider as the dialog
   * simply never appearing. requestBackgroundPermission asks in that
   * order. If they decline, we say what it costs them and move on: the
   * job still works, the customer just sees a stale pin.
   */
  const enableBackgroundTracking = async () => {
    const granted = await requestBackgroundPermission();
    if (!granted) {
      info(
        'Location sharing stays on-screen only',
        'Without "Allow all the time", your customer\'s map stops updating whenever your screen locks. You can change it later in Settings, under Permissions.',
      );
      return;
    }
    const ok = await startBackgroundLocation();
    setBgTracking(ok);
    if (!ok) {
      info('Could not start', 'Location sharing could not start in the background. Your on-screen tracking is still working.');
    }
  };

  const stopBroadcast = () => {
    if (locationWatch.current) {
      locationWatch.current.remove();
      locationWatch.current = null;
    }
    if (locationInterval.current) {
      clearInterval(locationInterval.current);
      locationInterval.current = null;
    }
  };

  const takeProofPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      info('Permission needed', 'Camera access is needed to take a proof of delivery photo. Grant it in Settings, then try again.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setProofUri(result.assets[0].uri);
      setProofReady(true);
    }
  };

  const cancelJob = () => {
    if (!delivery || !['assigned', 'picked_up'].includes(String(delivery.status))) return;
    const isRideJob = (delivery as any).kind === 'ride';
    const reasons: Array<[string, string]> = [
      ['emergency',            'Emergency'],
      ['vehicle_problem',      'Vehicle problem'],
      ['unsafe',               'I feel unsafe'],
      ['wrong_booking_type',   isRideJob ? 'This is actually a package' : 'This is actually a person'],
      ['customer_unreachable', 'Customer unreachable'],
    ];
    /**
     * Six buttons went into Android's three slots (audit 2026-08-24).
     * React Native slices the array at three before the OS ever sees it,
     * so a rider was shown "Keep the job", "Emergency" and "Vehicle
     * problem" only. "I feel unsafe" was invisible, and it is the one
     * reason that never counts against a rider's daily allowance: the
     * cancellation a rider is most entitled to make was the one they
     * could not make. A list has no slot limit.
     */
    setSheet({
      title: 'Cancel this job?',
      message: 'The customer is refunded in full and the job goes to another driver. Pick the reason: it is recorded. "I feel unsafe" never counts against your daily allowance.',
      options: reasons.map(([key, label]) => ({
        label,
        variant: 'destructive' as const,
        onPress: async () => {
          try {
            await deliveriesApi.driverCancel(delivery.id, key);
            info('Cancelled', 'The job has been released. Thanks for telling us why.', () => router.back());
          } catch (e: any) {
            info('Could not cancel', e?.message ?? 'Try again.');
          }
        },
      })),
      cancelLabel: 'Keep the job',
    });
  };

  const advanceStatus = async () => {
    if (!delivery) return;
    const step = ((delivery as any).kind === 'ride' ? RIDE_STEPS : STATUS_STEPS).find(s => s.key === delivery.status);
    if (!step?.next) return;

    const nextStatus = step.next;

    const isRideJob = (delivery as any).kind === 'ride';

    if (nextStatus === 'delivered' && !isRideJob) {
      if (!proofReady) {
        setSheet({
          title: 'Proof of delivery needed',
          message: 'Take a photo of the package with the person who received it before confirming. It is what settles a dispute later.',
          options: [{ label: 'Take photo', variant: 'primary', icon: 'camera-outline', onPress: takeProofPhoto }],
        });
        return;
      }
      // High-value packages (founder policy 2026-08-10): recipient must
      // be identity-verified before DELIVERED. The backend refuses the
      // transition without a handoff record, so the "already verified"
      // path is safe to offer.
      if (delivery.requiresRecipientVerification) {
        setSheet({
          title: 'High-value package',
          message: 'This delivery requires recipient verification: physical ID plus email code, or SEIRS ID plus typed name.',
          options: [
            {
              label: 'Verify the recipient',
              sub: 'Opens the identity hand-off',
              variant: 'primary',
              icon: 'shield-checkmark-outline',
              onPress: () => router.push({
                pathname: '/(driver)/signature',
                params:   { deliveryId: delivery.id },
              } as any),
            },
            {
              label: 'Already verified: mark delivered',
              sub: 'The server refuses this without a hand-off record',
              onPress: () => doUpdate(nextStatus),
            },
          ],
        });
        return;
      }
      // Who took it? Recorded on the delivery so a later dispute has an
      // answer to "delivered to whom", not just "delivered" (founder
      // 2026-08-12). Handing to somebody other than the recipient needs
      // their name, and the backend refuses it outright for high-value
      // packages: those go back to a partner store instead.
      // A sheet, not Alert.alert: four options into Android's three slots
      // meant "The recipient" was never drawn (founder 2026-08-24).
      openHandoverSheet(nextStatus);
    } else {
      doUpdate(nextStatus);
    }
  };

  /**
   * Who took the parcel, ordered by evidential strength, strongest first
   * (founder 2026-08-24).
   *
   * The three options are not equally trustworthy and the sheet used to
   * pretend they were. "The recipient" and "Someone else" are both
   * self-attested: the rider asks and a person says yes, and a name
   * nobody checks is added to the second. Scanning the package QR is the
   * only option in this sheet with a chain of custody, because the
   * person at the door had to be holding a code the sender gave them.
   * So it leads, as the recommended path, and the self-attested pair
   * follow it. Nothing was removed: a rider at a dark gate with a
   * receiver on a cheap phone still needs the other two.
   */
  const openHandoverSheet = (nextStatus: string) => setSheet({
    title: 'Who received the package?',
    message: 'This is recorded on the delivery record.',
    options: [
      {
        label: 'Scan their package QR',
        sub: 'Strongest proof: they hold a code from the sender. Scan, then confirm here',
        variant: 'primary',
        icon: 'qr-code-outline',
        onPress: () => router.push({
          pathname: '/(driver)/scan-package',
          params:   { code: delivery.trackingCode ?? '', deliveryId: delivery.id },
        } as any),
      },
      {
        label: 'The recipient',
        sub: 'You asked and they said yes',
        onPress: () => doUpdate(nextStatus as any, { relation: 'recipient' }),
      },
      {
        label: 'Someone else',
        sub: 'A gateman, a neighbour, reception. Their name goes on the record',
        onPress: () => promptReceiverName(),
      },
    ],
  });

  /**
   * Someone other than the recipient accepted it: a gateman, a neighbour,
   * a colleague at reception. Extremely common here, and the case a
   * dispute is most likely to turn on, so the name goes on the record.
   * Alert.prompt is iOS-only, so Android gets a dedicated small screen.
   */
  const promptReceiverName = () => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Who accepted it?',
        'Their name, as they gave it to you.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm Delivered',
            onPress: (name?: string) => {
              const clean = (name ?? '').trim();
              if (!clean) {
                alertDialog('Name needed', 'Record who took the package. It is what settles a dispute later.');
                return;
              }
              doUpdate('delivered', { relation: 'other', name: clean });
            },
          },
        ],
        'plain-text',
      );
      return;
    }
    setReceiverName('');
    setShowReceiverPrompt(true);
  };

  const doUpdate = async (
    nextStatus: string,
    receivedBy?: { relation: string; name?: string },
  ) => {
    setUpdating(true);
    try {
      let photoUrl: string | undefined;
      if (nextStatus === 'delivered' && proofUri && (delivery as any).kind !== 'ride') {
        const uploaded = await uploadApi.file(proofUri);
        photoUrl = uploaded.url;
      }
      await deliveriesApi.updateStatus(delivery.id, nextStatus as any, photoUrl, receivedBy);
      if (nextStatus === 'delivered') {
        stopBroadcast();
        // Spec V8 anti-theft trunk check: if the driver still has OTHER
        // active packages on board (multi-leg run), photo-confirm the
        // remaining cargo before riding off. Best-effort check: if the
        // lookup fails we fall through to the normal completion alert.
        let remainingActive = 0;
        try {
          const mine = await driversApi.myDeliveries();
          remainingActive = (Array.isArray(mine) ? mine : []).filter((d: any) =>
            d.id !== delivery.id && ['assigned', 'picked_up', 'in_transit'].includes(d.status),
          ).length;
        } catch { /* fall through */ }
        if (remainingActive > 0) {
          setSheet({
            title: 'Trunk check',
            message: `Delivered ${delivery.trackingCode}. You still have ${remainingActive} package${remainingActive > 1 ? 's' : ''} on board: take a quick photo of the remaining cargo. It protects YOU in any dispute.`,
            options: [{
              label: 'Take the trunk photo',
              variant: 'primary',
              icon: 'camera-outline',
              onPress: () => router.replace({
                pathname: '/(driver)/trunk-check',
                params:   { deliveryId: delivery.id, remaining: String(remainingActive) },
              } as any),
            }],
            cancelLabel: 'Skip, not recommended',
            // Dismissing by backdrop has to land the rider somewhere.
            // Leaving them on a delivered job with no route out was the
            // old behaviour of the Cancel button anyway.
            onCancel: () => router.replace('/(driver)' as any),
          });
          return;
        }
        /**
         * D-6.7: earnings do not land "shortly" and there is no driver
         * wallet, so this states the real clearance.
         *
         * It stated the WRONG one until 2026-08-24: hardcoded "2 business
         * days" while GET /earnings/dashboard was reporting
         * clearanceBusinessDays: 0. Two different answers to the number a
         * rider cares about most, from the same app. The figure now comes
         * off the server, 0 gets its own sentence because "clear in 0
         * business days" is not English, and if the call failed the copy
         * points at the Earnings tab rather than inventing a number.
         */
        const clearanceLine =
          clearanceDays === null
            ? 'Your earnings for this trip are on the way to your ledger. The Earnings tab shows when they clear.'
            : clearanceDays === 0
              ? 'Your earnings for this trip are already cleared and ready to withdraw.'
              : `Your earnings for this trip clear in ${clearanceDays} business day${clearanceDays === 1 ? '' : 's'}, then you can withdraw them.`;
        setSheet({
          title: 'Delivery complete',
          message: `You've successfully delivered ${delivery.trackingCode}.\n\n${clearanceLine}`,
          options: [{
            label: 'Back to jobs',
            variant: 'primary',
            onPress: () => router.replace('/(driver)' as any),
          }],
          cancelLabel: null,
          onCancel: () => router.replace('/(driver)' as any),
        });
      } else {
        setDelivery((prev: any) => ({ ...prev, status: nextStatus }));
      }
    } catch (e: any) {
      info('Could not update this job', e.message ?? 'The status did not save. Check your connection and try again.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  if (!delivery) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={styles.empty}>
          <View style={[styles.emptyIconWrap, { backgroundColor: theme.surface }]}>
            <Ionicons name="cube-outline" size={52} color={theme.textThird} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Delivery not found</Text>
          <Pressable onPress={() => router.back()} style={[styles.actionBtn, { backgroundColor: theme.primary, marginTop: Spacing.md }]}>
            <Text style={styles.actionBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // D-6.8: one step source for the whole screen. The banner already
  // switched on kind but the Progress list was hardcoded to STATUS_STEPS,
  // so a ride driver read "Package Collected" halfway through a trip.
  const isRide      = (delivery as any).kind === 'ride';
  const steps       = isRide ? RIDE_STEPS : STATUS_STEPS;
  const stepConfig  = steps.find(s => s.key === delivery.status) ?? steps[0];
  const isDone      = delivery.status === 'delivered';
  const needsProof  = delivery.status === 'in_transit' && !isRide;
  const statusIndex = steps.findIndex(s => s.key === delivery.status);

  /**
   * Is a partner counter one of the two ends of THIS leg, and is the
   * rider at the end that still needs signing for?
   *
   * Collect: `pickupStoreId` is set, which means the sender dropped the
   * parcel at a counter instead of a door, so pickupAddress already holds
   * the store's address. Responsibility sits with the store until the
   * rider scans, so the card is live while the job is still 'assigned'.
   *
   * Drop: the failed-delivery flow rerouted this to a counter
   * (`arrivalResolution` is 'store' or 'auto_store'), and redirectToStore
   * rewrote dropoffAddress to the store. Responsibility stays with the
   * rider until the store scans, so the card is live right up to the
   * moment the delivery is marked delivered.
   *
   * A ride has no parcel and therefore no custody to transfer.
   */
  const counterHandoff: {
    direction: 'collect' | 'drop'; title: string; sub: string;
    storeName: string; storeAddress: string;
  } | null = (() => {
    if (isRide || isDone) return null;
    const resolution = (delivery as any).arrivalResolution;
    if (resolution === 'store' || resolution === 'auto_store') {
      return {
        direction: 'drop',
        title: 'Hand in at the partner counter',
        sub:   'Scan the parcel, then the counter signs for it. Until they sign it is still on you.',
        storeName:    'Partner counter',
        storeAddress: delivery.dropoffAddress ?? '',
      };
    }
    if ((delivery as any).pickupStoreId && delivery.status === 'assigned') {
      return {
        direction: 'collect',
        title: 'Collect from the partner counter',
        sub:   'Scan the parcel, then the counter signs it out. After that it is on you.',
        storeName:    'Partner counter',
        storeAddress: delivery.pickupAddress ?? '',
      };
    }
    return null;
  })();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.headerBar, { borderBottomColor: theme.border }]}>
        {!isDone && (
          <Pressable onPress={() => router.back()} style={[styles.backCircle, { backgroundColor: theme.surface }]}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
        )}
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Active Delivery</Text>
          <Text style={[styles.trackCode, { color: theme.textSecond }]}>{delivery.trackingCode}</Text>
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/(driver)/sos' as any, params: { deliveryId: id ?? '' } } as any)}
          style={[styles.backCircle, { backgroundColor: '#FEE2E2' }]}
          accessibilityLabel="SOS: emergency"
        >
          <Ionicons name="warning" size={20} color="#DC2626" />
        </Pressable>
        <Pressable
          onPress={() => router.push('/(driver)/status-broadcast' as any)}
          style={[styles.backCircle, { backgroundColor: theme.surface, marginLeft: 8 }]}
          accessibilityLabel="Broadcast status"
        >
          <Ionicons name="radio-outline" size={20} color={theme.text} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: (footerH || 120) + Spacing.lg }}
      >

        {/* Status banner */}
        <View style={[styles.bannerWrap, Shadows.md]}>
          <LinearGradient
            colors={stepConfig.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.statusBanner}
          >
            {/* Three facts, nothing else. The icon and the status word
                were removed (founder 2026-08-24): a rider on the bike
                does not need to be told they are riding. */}
            <Text style={styles.bannerHeadline}>
              {routeDistance ? `${routeDistance}${bannerWho ? ` to ${bannerWho}` : ''}` : (bannerWho ? `To ${bannerWho}` : stepConfig.label)}
            </Text>
            <View style={styles.bannerMetaRow}>
              {!!elapsedLabel && <Text style={styles.bannerSub}>{elapsedLabel}</Text>}
              <View style={styles.gpsPill}>
                <View style={styles.gpsDot} />
                <Text style={styles.gpsText}>{bgTracking ? 'GPS ALWAYS' : 'GPS'}</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Locked-screen tracking. Shown only while it is OFF, because a
            rider does not need a permanent banner telling them a thing
            is working. The wording says what the CUSTOMER loses, which
            is the part a rider can act on. */}
        {!bgTracking && (
          <Pressable onPress={enableBackgroundTracking} style={styles.bgPrompt}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bgPromptTitle}>Your map stops when your screen locks</Text>
              <Text style={styles.bgPromptBody}>
                Tap to keep sharing while your phone is in your pocket. Choose
                "Allow all the time". It stops on its own when the job ends.
              </Text>
            </View>
            <Text style={styles.bgPromptCta}>Turn on</Text>
          </Pressable>
        )}

        {/* Live map: pickup pin (green), dropoff pin (red), driver pin (blue) */}
        {delivery.pickupLat && delivery.dropoffLat && (
          <View style={[styles.card, { backgroundColor: theme.surface, padding: 0, overflow: 'hidden' }, Shadows.sm]}>
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              style={{ width: '100%', height: 220 }}
              /**
               * Gestures OFF. This map sits inside the page ScrollView,
               * so with them on it swallowed every vertical drag: a rider
               * trying to scroll down to Proof of Delivery panned the map
               * off their route instead, and could not reach Confirm
               * Delivered or the nobody-home link at all. Found on device
               * 2026-08-24. Same reason DeliveryTrackMap and the job
               * detail map disable them.
               *
               * The route is the point here, not free panning: the driver
               * gets real navigation by opening Google Maps.
               */
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              toolbarEnabled={false}
              showsTraffic
              showsUserLocation={false}
              initialRegion={{
                latitude:  Number(delivery.pickupLat),
                longitude: Number(delivery.pickupLng),
                latitudeDelta:  0.05,
                longitudeDelta: 0.05,
              }}
              onMapReady={() => {
                /**
                 * The rider's pin only steers the camera when it is
                 * plausibly on this trip. With the device in Berlin and
                 * the job in Ibadan the fit zoomed out to the North
                 * Atlantic and the route vanished (found on device
                 * 2026-08-24). A stale fix or GPS drift does the same
                 * thing, and the route is what this map is for.
                 *
                 * ~2 degrees is about 200km, far wider than any single
                 * delivery, so a real position is never dropped. The
                 * marker still draws wherever the device says it is.
                 */
                const pLat = Number(delivery.pickupLat);
                const pLng = Number(delivery.pickupLng);
                const nearTrip =
                  !!myPos &&
                  Math.abs(myPos.lat - pLat) < 2 &&
                  Math.abs(myPos.lng - pLng) < 2;
                const coords = [
                  { latitude: pLat,  longitude: pLng },
                  { latitude: Number(delivery.dropoffLat), longitude: Number(delivery.dropoffLng) },
                  ...(nearTrip && myPos ? [{ latitude: myPos.lat, longitude: myPos.lng }] : []),
                ];
                mapRef.current?.fitToCoordinates(coords, {
                  edgePadding: { top: 60, right: 50, bottom: 60, left: 50 },
                  animated: true,
                });
              }}
            >
              <Marker
                coordinate={{ latitude: Number(delivery.pickupLat), longitude: Number(delivery.pickupLng) }}
                title="Pickup"
                description={delivery.pickupAddress}
                pinColor="#22C55E"
              />
              <Marker
                coordinate={{ latitude: Number(delivery.dropoffLat), longitude: Number(delivery.dropoffLng) }}
                title="Dropoff"
                description={delivery.dropoffAddress}
                pinColor="#EF4444"
              />
              {myPos && (
                <Marker
                  coordinate={{ latitude: myPos.lat, longitude: myPos.lng }}
                  title="You"
                  pinColor="#3A7BD5"
                />
              )}
              {routeCoords.length > 1 && (
                <Polyline
                  coordinates={routeCoords}
                  strokeColor="#3A7BD5"
                  strokeWidth={4}
                />
              )}
            </MapView>
            {/* Distance only. The Directions duration used to sit beside it
                and read as an arrival promise, which SEIRS never makes. */}
            {!!routeDistance && (
              <View style={[styles.mapStatRow, { backgroundColor: theme.surfaceSecond, borderTopColor: theme.border }]}>
                <View style={styles.mapStatItem}>
                  <Ionicons name="navigate-outline" size={14} color={theme.textSecond} />
                  <Text style={[styles.mapStatValue, { color: theme.text }]}>{routeDistance}</Text>
                </View>
              </View>
            )}
            {/* Expand. Gestures are off on the inline map, so without
                this a rider cannot look around their route at all. */}
            <Pressable
              style={({ pressed }) => [styles.expandBtn, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}
              onPress={() => setMapExpanded(true)}
              accessibilityLabel="Expand map"
            >
              <Ionicons name="expand-outline" size={18} color={theme.text} />
            </Pressable>
            {/* Directions, on the screen the rider actually has open
                while driving. Gestures are off on the map above, so this
                is the only way out to real navigation from here. */}
            <Pressable
              style={({ pressed }) => [
                styles.mapsBtn,
                { borderTopColor: theme.border, opacity: pressed ? 0.6 : 1 },
              ]}
              onPress={openInGoogleMaps}
            >
              <Ionicons name="open-outline" size={16} color={theme.primary} />
              <Text style={[styles.mapsBtnText, { color: theme.primary }]}>Open directions in Google Maps</Text>
            </Pressable>
          </View>
        )}

        {/* Route card */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Delivery Route</Text>
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: '#22C55E' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.routeLabel, { color: theme.textSecond }]}>Pickup</Text>
              <Text style={[styles.routeAddr, { color: theme.text }]}>{delivery.pickupAddress}</Text>
            </View>
          </View>
          <View style={[styles.routeLine, { backgroundColor: theme.border }]} />
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.routeLabel, { color: theme.textSecond }]}>Dropoff</Text>
              <Text style={[styles.routeAddr, { color: theme.text }]}>{delivery.dropoffAddress}</Text>
            </View>
          </View>
        </View>

        {/* Partner counter hand-off.
            The liability matrix moves responsibility on a scan ("Partner
            store until driver scans", "Driver until store scans") and
            there was no way for a rider to record either one, which is
            why admin Liability Disputes showed "No handoff records yet"
            on completed deliveries (2026-08-25). This is the way in. */}
        {counterHandoff && (
          <Pressable
            style={({ pressed }) => [
              styles.counterCard,
              { backgroundColor: theme.surface, borderColor: theme.primary, opacity: pressed ? 0.75 : 1 },
              Shadows.sm,
            ]}
            onPress={() => router.push({
              pathname: '/(driver)/store-handoff',
              params: {
                deliveryId: delivery.id,
                code:       delivery.trackingCode ?? '',
                direction:  counterHandoff.direction,
                storeName:  counterHandoff.storeName,
                storeAddress: counterHandoff.storeAddress,
              },
            } as any)}
          >
            <View style={[styles.counterIcon, { backgroundColor: theme.primary + '15' }]}>
              <Ionicons name="storefront-outline" size={22} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.counterTitle, { color: theme.text }]}>{counterHandoff.title}</Text>
              <Text style={[styles.counterSub, { color: theme.textSecond }]}>{counterHandoff.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textThird} />
          </Pressable>
        )}

        {/* D-6.8: a ride is not a package. The Size / Fragile / Description
            rows are meaningless on a ride and the card title was telling the
            driver they were carrying cargo. Rides keep only the two rows that
            are true for them: distance and their own pay. Rows with a missing
            value are dropped rather than rendered as "NaN km" (D-10.5). */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{isRide ? 'Trip Details' : 'Package Details'}</Text>
          {[
            ...(isRide ? [] : [
              { label: 'Description', value: delivery.packageDescription,                        icon: 'cube-outline' },
              { label: 'Size',        value: delivery.packageSize,                               icon: 'resize-outline' },
              { label: 'Fragile',     value: delivery.isFragile ? 'Yes: handle carefully' : 'No', icon: 'warning-outline' },
            ]),
            {
              label: 'Distance',
              value: Number.isFinite(Number(delivery.distanceKm)) && delivery.distanceKm != null
                ? `${Number(delivery.distanceKm).toFixed(1)} km` : null,
              icon: 'map-outline',
            },
            {
              // Driver money is always the server number, never recomputed here.
              label: 'Your Earnings',
              value: Number.isFinite(Number(delivery.driverEarnings)) && delivery.driverEarnings != null
                ? naira(delivery.driverEarnings) : null,
              icon: 'cash-outline',
            },
          ].filter(r => r.value != null && r.value !== '').map(({ label, value, icon }) => (
            <View key={label} style={styles.infoRow}>
              <Ionicons name={icon as any} size={16} color={theme.textThird} />
              <Text style={[styles.infoLabel, { color: theme.textSecond }]}>{label}</Text>
              <Text style={[
                styles.infoValue,
                { color: label === 'Your Earnings' ? '#22C55E' : theme.text },
                label === 'Your Earnings' && { fontWeight: FontWeight.bold },
              ]}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Customer info. NOT for rides: the passenger card below is the
            ride surface (first name + chat, no phone). This card renders
            the full name and phone number, so on a ride it was handing
            the driver exactly what the privacy rule forbids, directly
            above the card that honours it (sweep 2026-08-23). */}
        {delivery.customer && (delivery as any).kind !== 'ride' && (
          <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
            <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 2 }]}>Customer</Text>
          {/* The split is deliberate and was invisible, so it read as a
              missing button (founder 2026-08-24). */}
          <Text style={[styles.contactHint, { color: theme.textThird }]}>Not at the drop-off. Message them.</Text>
            <View style={styles.customerRow}>
              <Avatar name={delivery.customer.name ?? 'Customer'} uri={delivery.customer.profilePhoto} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.customerName, { color: theme.text }]}>{delivery.customer.name}</Text>
                <Text style={[styles.customerPhone, { color: theme.textSecond }]}>{delivery.customer.phone}</Text>
              </View>
              {/* Message the customer without leaving the trip: the
                  active screen had NO chat entry point until the
                  production-readiness audit 2026-08-10. */}
              <Pressable
                style={[styles.chatBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push({
                  pathname: '/(driver)/messages/[chatId]',
                  params: { chatId: delivery.id, other: delivery.customer?.name ?? 'Customer' },
                } as any)}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
                <Text style={styles.chatBtnText}>Chat</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Receiver: who actually takes the package at the door. */}
        {(delivery as any).kind === 'ride' ? (
          /* Passenger card (founder 2026-08-23): first name only, no
             phone on the driver's screen: the chat button is the line.
             Admin keeps the full identity for emergencies. */
          <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Passenger</Text>
            <View style={styles.customerRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.customerName, { color: theme.text }]}>
                  {delivery.receiverFirstName || 'Passenger'}
                </Text>
                <Text style={[styles.customerPhone, { color: theme.textSecond }]}>
                  {delivery.packageDescription === 'Ride · large luggage' ? 'Travelling with large luggage'
                    : delivery.packageDescription === 'Ride · small bag' ? 'Travelling with a small bag'
                    : 'No luggage'}
                </Text>
              </View>
              <Pressable
                style={[styles.chatBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push({
                  pathname: '/(driver)/messages/[chatId]',
                  params: { chatId: delivery.id, other: delivery.receiverFirstName ?? 'Passenger' },
                } as any)}
              >
                <Ionicons name="chatbubble-outline" size={18} color="#fff" />
                <Text style={styles.chatBtnText}>Chat</Text>
              </Pressable>
            </View>
          </View>
        ) : (delivery.receiverFirstName || delivery.receiverPhone) && (
          <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
            <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 2 }]}>Receiver</Text>
            <Text style={[styles.contactHint, { color: theme.textThird }]}>Call them when you arrive.</Text>
            <View style={styles.customerRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.customerName, { color: theme.text }]}>
                  {[delivery.receiverFirstName, delivery.receiverLastName].filter(Boolean).join(' ') || 'Not named'}
                </Text>
                {!!delivery.receiverPhone && (
                  <Text style={[styles.customerPhone, { color: theme.textSecond }]}>{delivery.receiverPhone}</Text>
                )}
              </View>
              {!!delivery.receiverPhone && (
                <Pressable
                  style={[styles.chatBtn, { backgroundColor: '#16A34A' }]}
                  onPress={() => Linking.openURL(`tel:${delivery.receiverPhone}`)}
                >
                  <Ionicons name="call-outline" size={18} color="#fff" />
                  <Text style={styles.chatBtnText}>Call</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {['assigned', 'picked_up'].includes(String(delivery.status)) && (
          <Pressable onPress={cancelJob} style={{ alignSelf: 'center', paddingVertical: 10 }}>
            <Text style={{ color: '#DC2626', fontSize: FontSize.sm, fontWeight: '600' }}>
              Can't do this job? Cancel with a reason
            </Text>
          </Pressable>
        )}

        {/* Report a problem: available while the rider still has a choice,
            i.e. before the package is marked delivered. */}
        {delivery.status !== 'delivered' && (
          <Pressable
            onPress={reportProblem}
            disabled={reporting}
            style={[styles.reportBtn, { borderColor: '#DC2626' }]}
          >
            <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
            <Text style={styles.reportBtnText}>
              {reporting ? 'Reporting...' : 'Report a problem'}
            </Text>
          </Pressable>
        )}

        {/* Proof of delivery */}
        {needsProof && (
          <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Proof of Delivery</Text>
            <Text style={[styles.proofHint, { color: theme.textSecond }]}>
              Take a photo when you hand over the package. Required to confirm delivery.
            </Text>
            {proofUri ? (
              <View style={styles.proofPreview}>
                <Image source={{ uri: proofUri }} style={styles.proofImage} resizeMode="cover" />
                <Pressable onPress={takeProofPhoto} style={[styles.retakeBtn, { borderColor: theme.border }]}>
                  <Ionicons name="camera-outline" size={16} color={theme.primary} />
                  <Text style={[styles.retakeText, { color: theme.primary }]}>Retake Photo</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={takeProofPhoto} style={[styles.cameraBtn, { borderColor: theme.primary, backgroundColor: theme.primary + '08' }]}>
                <Ionicons name="camera-outline" size={36} color={theme.primary} />
                <Text style={[styles.cameraBtnText, { color: theme.primary }]}>Take Proof Photo</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Progress steps */}
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Progress</Text>
          {steps.filter(s => s.key !== 'delivered').map((s, i) => {
            const thisIndex = steps.findIndex(x => x.key === s.key);
            const done      = thisIndex < statusIndex || delivery.status === 'delivered';
            const active    = s.key === delivery.status;
            return (
              <View key={s.key}>
                <View style={styles.stepRow}>
                  <View style={[
                    styles.stepDot,
                    done   && { backgroundColor: '#22C55E' },
                    active && { backgroundColor: stepConfig.gradient[0] },
                    !done && !active && { backgroundColor: theme.border },
                  ]}>
                    {done
                      ? <Ionicons name="checkmark" size={14} color="#fff" />
                      : <Text style={styles.stepNum}>{i + 1}</Text>}
                  </View>
                  <Text style={[
                    styles.stepLabel,
                    { color: !done && !active ? theme.textSecond : theme.text },
                    active && { fontWeight: FontWeight.bold },
                  ]}>{s.label}</Text>
                  {/* When it happened, from the real column only.
                      assignedAt / pickedUpAt / deliveredAt exist;
                      in_transit has no column, so it shows nothing
                      rather than repeating the pickup time and
                      asserting something we did not record. */}
                  {(() => {
                    const raw =
                      s.key === 'assigned'   ? (delivery as any).assignedAt  :
                      s.key === 'picked_up'  ? (delivery as any).pickedUpAt  :
                      s.key === 'delivered'  ? (delivery as any).deliveredAt : null;
                    if (!raw) return null;
                    const t = new Date(raw);
                    if (isNaN(t.getTime())) return null;
                    return (
                      <Text style={[styles.stepTime, { color: theme.textSecond }]}>
                        {t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    );
                  })()}
                </View>
                {i < steps.length - 2 && (
                  <View style={[styles.stepLine, { backgroundColor: done ? '#22C55E' : theme.border }]} />
                )}
              </View>
            );
          })}
        </View>

      </ScrollView>

      {/* One themed sheet for every decision on this screen. The two
          hand-rolled modals that used to live here (the hand-off and
          Report a problem) were the first two Alert.alert calls
          converted on 2026-08-24; SeirsSheet is that pattern extracted
          so the rest of the screen could follow it instead of growing a
          third copy. */}
      <SeirsSheet spec={sheet} onClose={() => setSheet(null)} />

      {/* Full-screen map: gestures ON, because nothing here competes for
          the drag. Google Maps stays one tap away: reading a route and
          navigating one are different jobs. */}
      <Modal visible={mapExpanded} animationType="slide" onRequestClose={() => setMapExpanded(false)}>
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          {!!delivery?.pickupLat && !!delivery?.dropoffLat && (
            <MapView
              provider={PROVIDER_GOOGLE}
              style={{ flex: 1 }}
              showsTraffic
              showsUserLocation
              initialRegion={{
                latitude:  (Number(delivery.pickupLat) + Number(delivery.dropoffLat)) / 2,
                longitude: (Number(delivery.pickupLng) + Number(delivery.dropoffLng)) / 2,
                latitudeDelta:  Math.max(Math.abs(Number(delivery.pickupLat) - Number(delivery.dropoffLat)) * 2.5, 0.05),
                longitudeDelta: Math.max(Math.abs(Number(delivery.pickupLng) - Number(delivery.dropoffLng)) * 2.5, 0.05),
              }}
            >
              <Marker
                coordinate={{ latitude: Number(delivery.pickupLat), longitude: Number(delivery.pickupLng) }}
                title="Pickup" description={delivery.pickupAddress} pinColor="#22C55E"
              />
              <Marker
                coordinate={{ latitude: Number(delivery.dropoffLat), longitude: Number(delivery.dropoffLng) }}
                title="Dropoff" description={delivery.dropoffAddress} pinColor="#EF4444"
              />
              {routeCoords.length > 1 && (
                <Polyline coordinates={routeCoords} strokeColor="#3A7BD5" strokeWidth={5} />
              )}
            </MapView>
          )}
          <Pressable
            onPress={() => setMapExpanded(false)}
            style={[styles.mapCloseBtn, { top: insets.top + 12, backgroundColor: theme.surface }]}
            accessibilityLabel="Close map"
          >
            <Ionicons name="close" size={24} color={theme.text} />
          </Pressable>
          <View style={[styles.mapModalFooter, { backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: footerPad }]}>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, { backgroundColor: theme.primary, opacity: pressed ? 0.7 : 1 }]}
              onPress={openInGoogleMaps}
            >
              <Ionicons name="open-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Open directions in Google Maps</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Footer CTA */}
      {!isDone && stepConfig.action && (
        <View
          style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.surface, paddingBottom: footerPad }]}
          onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
        >
          {/* The prompt that used to sit here is gone (founder
              2026-08-24). It duplicated the large camera box in the Proof
              of Delivery card, and two controls for one action is worse
              than one obvious control. The disabled state of Confirm
              Delivered already says the photo is required. */}
          <Pressable
            style={[
              styles.actionBtn,
              { backgroundColor: stepConfig.gradient[0] },
              (updating || (needsProof && !proofReady)) && { opacity: 0.5 },
            ]}
            onPress={advanceStatus}
            disabled={updating}
          >
            {updating
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.actionBtnText}>{stepConfig.action}</Text>}
          </Pressable>
          {/* Failed-delivery flow (2026-08-11): opens the sender's
              5-minute window; instructions arrive as chat messages. */}
          {['picked_up', 'in_transit'].includes(String(delivery.status)) && (
            <Pressable
              style={({ pressed }) => [styles.nobodyBtn, { borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}
              onPress={() => setSheet({
                title: 'Nobody available to receive?',
                message: 'The sender gets 5 minutes to respond: wait, neighbour, gate, or partner store. Their answer arrives in this delivery\'s chat. If they stay silent, follow the fallback message.',
                options: [{
                  label: 'Notify the sender',
                  variant: 'primary',
                  icon: 'chatbubble-ellipses-outline',
                  onPress: async () => {
                    try {
                      await deliveriesApi.arrivalIssue(delivery.id);
                      info('Sender notified', 'Watch the chat: their answer or the fallback instruction lands there within 5 minutes.');
                    } catch (e: any) {
                      info('Could not notify', e?.message ?? 'Try again.');
                    }
                  },
                }],
              })}
            >
              <Ionicons name="alert-circle-outline" size={18} color={theme.text} />
              <Text style={{ color: theme.text, fontSize: FontSize.base, fontWeight: FontWeight.bold as any }}>
                Nobody available to receive?
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Third-party acceptance (Android). Someone other than the
          recipient took the package: gateman, neighbour, reception.
          Their name is what a dispute turns on later. */}
      <Modal
        visible={showReceiverPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReceiverPrompt(false)}
      >
        <View style={styles.receiverBackdrop}>
          <View style={[styles.receiverCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.receiverTitle, { color: theme.text }]}>Who accepted it?</Text>
            <Text style={[styles.receiverBody, { color: theme.textSecond }]}>
              Their name, as they gave it to you. This goes on the delivery record.
            </Text>
            <TextInput
              value={receiverName}
              onChangeText={setReceiverName}
              placeholder="e.g. Musa, the gateman"
              placeholderTextColor={theme.textThird}
              autoFocus
              style={[styles.receiverInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceSecond }]}
            />
            <View style={styles.receiverActions}>
              <Pressable
                style={styles.receiverBtn}
                onPress={() => setShowReceiverPrompt(false)}
              >
                <Text style={{ color: theme.textSecond, fontWeight: FontWeight.semibold as any }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.receiverBtn, { backgroundColor: theme.primary, borderRadius: Radius.md }]}
                onPress={() => {
                  const clean = receiverName.trim();
                  if (!clean) return;
                  setShowReceiverPrompt(false);
                  doUpdate('delivered', { relation: 'other', name: clean });
                }}
              >
                <Text style={{ color: '#fff', fontWeight: FontWeight.bold as any }}>Confirm Delivered</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  receiverBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  receiverCard:     { width: '100%', maxWidth: 380, borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.sm },
  receiverTitle:    { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any },
  receiverBody:     { fontSize: FontSize.sm, lineHeight: 19 },
  receiverInput:    { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: FontSize.base, marginTop: 4 },
  receiverActions:  { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  receiverBtn:      { paddingVertical: 10, paddingHorizontal: 16 },
  headerBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backCircle:   { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { alignItems: 'center', gap: 2 },
  headerTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  trackCode:    { fontSize: FontSize.xs, letterSpacing: 1 },

  expandBtn:      { position: 'absolute', top: Spacing.sm, right: Spacing.sm, width: 38, height: 38, borderRadius: 19, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  mapCloseBtn:    { position: 'absolute', left: Spacing.md, width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  mapModalFooter: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1 },
  bannerWrap:     { marginHorizontal: Spacing.md, marginTop: Spacing.md, marginBottom: Spacing.sm, borderRadius: Radius.xl, overflow: 'hidden' },
  statusBanner:   { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, alignItems: 'center', gap: 4 },
  bannerIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  statusLabel:    { color: '#fff', fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  bannerHeadline: { color: '#fff', fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, textAlign: 'center' },
  bannerMetaRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bannerSub:      { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.xs },
  bgPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: 12,
    backgroundColor: 'rgba(255,176,32,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,176,32,0.35)',
  },
  bgPromptTitle: { fontSize: 13, fontWeight: '700', color: '#B26A00', marginBottom: 2 },
  bgPromptBody:  { fontSize: 12, lineHeight: 17, color: '#8A5A08' },
  bgPromptCta:   { fontSize: 13, fontWeight: '800', color: '#B26A00' },
  gpsPill:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.full },
  gpsDot:         { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  gpsText:        { color: 'rgba(255,255,255,0.9)', fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 1 },

  card:         { marginHorizontal: Spacing.md, borderRadius: Radius.xl, padding: Spacing.md, marginBottom: Spacing.md },
  contactHint:  { fontSize: FontSize.xs, marginBottom: Spacing.md },
  cardTitle:    { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: Spacing.md },

  routeRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  routeDot:     { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  routeLine:    { width: 1.5, height: 18, marginLeft: 4, marginVertical: 3 },
  routeLabel:   { fontSize: FontSize.xs, marginBottom: 2 },
  routeAddr:    { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  // Bordered in brand colour rather than filled: it is an action, but it
  // must not out-shout the status footer that drives the job forward.
  counterCard:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  counterIcon:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  counterTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  counterSub:   { fontSize: FontSize.xs, lineHeight: 17, marginTop: 2 },

  infoRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
  infoLabel:    { flex: 1, fontSize: FontSize.sm },
  infoValue:    { fontSize: FontSize.sm, maxWidth: '55%', textAlign: 'right' },

  customerRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  chatBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  chatBtnText:   { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  customerName:  { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  reportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1, borderRadius: 999,
    paddingVertical: 14,
    // Lines up with the cards. Without this it was the only full-bleed
    // element on a screen of inset cards and its ends ran past them
    // (founder 2026-08-24).
    marginHorizontal: Spacing.md,
    marginTop: 4, marginBottom: Spacing.md,
  },
  reportBtnText: { color: '#DC2626', fontSize: 14, fontWeight: '700' },
  customerPhone: { fontSize: FontSize.sm, marginTop: 2 },

  proofHint:    { fontSize: FontSize.sm, lineHeight: 20, marginBottom: Spacing.md },
  proofPreview: { gap: Spacing.sm },
  proofImage:   { width: '100%', height: 180, borderRadius: Radius.lg },
  retakeBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.lg, height: 44 },
  retakeText:   { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  cameraBtn:    { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.lg, paddingVertical: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
  cameraBtnText:{ fontSize: FontSize.base, fontWeight: FontWeight.semibold },

  stepRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepDot:    { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  stepNum:    { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  stepLabel:  { flex: 1, fontSize: FontSize.base },
  stepTime:   { fontSize: FontSize.xs, fontVariant: ['tabular-nums'] },
  stepLine:   { width: 1.5, height: 16, marginLeft: 13, marginBottom: 4 },

  footer:          { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.md, borderTopWidth: 1 },
  nobodyBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: Spacing.sm, paddingVertical: 14, borderRadius: Radius.lg, borderWidth: 1 },
  proofWarningRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  proofWarning:    { fontSize: FontSize.xs, textAlign: 'center' },
  actionBtn:       { height: 56, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  actionBtnText:   { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },

  empty:        { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyIconWrap:{ width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center' },
  emptyTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.semibold },

  mapsBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderTopWidth: 1 },
  mapsBtnText:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  mapStatRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1 },
  mapStatItem:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  mapStatValue:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  mapStatDivider: { width: 1, height: 22, marginHorizontal: Spacing.sm },
});
