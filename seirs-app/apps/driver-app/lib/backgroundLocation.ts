/**
 * Position reporting while the rider's phone is locked or in a pocket.
 *
 * The app has always tracked in the FOREGROUND only: active.tsx opens a
 * watchPositionAsync and Android suspends it the moment the screen
 * locks. So a rider who pockets the phone, which is what every rider
 * does, froze the customer's map on their last known street. The
 * customer sees a pin that has stopped moving and believes it.
 *
 * expo-task-manager was added to package.json on 24 Aug and never
 * imported by anything, so the dependency made this look done while the
 * behaviour was unchanged.
 *
 * WHY THIS FILE DOES NOT USE services/api
 *
 * A TaskManager task runs in its own JavaScript context, woken by the OS
 * with no React tree and no app bootstrap. configureApi() has never been
 * called there, so the shared client's module-level base URL is
 * undefined and every request would go nowhere. The token is read
 * straight out of AsyncStorage for the same reason: there is no
 * AuthContext in that context to ask.
 *
 * SAMPLING (founder 2026-08-27: "Every 500m or 60s")
 *
 * Distance first, time as the floor. A rider stuck in Third Mainland
 * traffic costs nothing, because they have not moved 500m; a moving
 * rider reports about once a minute. On an okada 500m is a couple of
 * streets, so the customer's pin steps rather than glides, which is the
 * trade the founder chose: a rider whose battery dies stops earning,
 * and that cost lands on the person least able to absorb it.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '@/constants/config';

export const LOCATION_TASK = 'seirs-driver-location';

/** Matches configureSessionStorageKey's default; the driver app never overrides it. */
const SESSION_KEY = 'seirs_user';

/**
 * The last fix we failed to deliver.
 *
 * A rider crossing a dead patch, and Lagos has many, would otherwise
 * simply lose those minutes. Holding one pending fix means the next
 * successful call carries the freshest position rather than a stale
 * queue, which is what the customer actually wants to see.
 */
const PENDING_KEY = 'seirs_driver_pending_fix';

async function authToken(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw)?.token ?? null;
  } catch {
    return null;
  }
}

async function postFix(lat: number, lng: number): Promise<boolean> {
  const token = await authToken();
  // No session means the rider signed out while the task was still
  // registered. Report nothing and let stopBackgroundLocation clean up.
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE}/drivers/location`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ lat, lng }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Registered at module scope, not inside a component.
 *
 * The OS can wake this task when no screen is mounted, so the handler
 * has to exist the moment the JS bundle loads. That is why _layout.tsx
 * imports this file for its side effect rather than calling into it.
 */
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: any) => {
  if (error) return;
  const locations: Location.LocationObject[] = data?.locations ?? [];
  if (!locations.length) return;

  // Only the newest fix matters. Android batches these, and a customer
  // watching a map wants where the rider IS, not a trail of where they
  // were three minutes ago.
  const latest = locations[locations.length - 1];
  const lat = latest?.coords?.latitude;
  const lng = latest?.coords?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return;

  const sent = await postFix(lat, lng);
  if (sent) {
    // A delivered fix supersedes anything we were holding.
    try { await AsyncStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
  } else {
    try {
      await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ lat, lng, at: Date.now() }));
    } catch { /* ignore */ }
  }
});

/**
 * Start reporting. Safe to call repeatedly: Android throws if a task is
 * already running, so the started check comes first.
 *
 * Returns false when the rider has not granted background permission,
 * which on Android 10 is a SEPARATE grant from foreground and lives
 * behind "Allow all the time" in settings. The caller decides what to
 * say about that; this function does not put dialogs on screen.
 */
export async function startBackgroundLocation(): Promise<boolean> {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;

    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return false;

    const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (already) return true;

    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy:         Location.Accuracy.Balanced,
      distanceInterval: 500,    // metres moved before a new fix
      timeInterval:     60000,  // and never more often than once a minute
      // Android kills a background location service without a visible
      // notification, and hiding it from the rider would be wrong
      // anyway: they are entitled to see that they are being tracked
      // and to know it stops when the job does.
      foregroundService: {
        notificationTitle: 'SEIRS is sharing your location',
        notificationBody:  'Your customer can see where their delivery is. This stops when the job ends.',
        notificationColor: '#0F2B4C',
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });
    return true;
  } catch {
    return false;
  }
}

/** Stop reporting. Called when a job ends, and on sign-out. */
export async function stopBackgroundLocation(): Promise<void> {
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch { /* already stopped */ }
  try { await AsyncStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
}

/**
 * Ask for "Allow all the time".
 *
 * Android requires foreground to be granted first and will silently
 * refuse the background prompt otherwise, which reads as the dialog
 * simply not appearing. Requesting them in order is the whole trick.
 */
export async function requestBackgroundPermission(): Promise<boolean> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;
    const bg = await Location.requestBackgroundPermissionsAsync();
    return bg.status === 'granted';
  } catch {
    return false;
  }
}

/** Whether the rider has already granted the background grant. */
export async function hasBackgroundPermission(): Promise<boolean> {
  try {
    const bg = await Location.getBackgroundPermissionsAsync();
    return bg.status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Deliver a fix that failed to send earlier, if it is still recent.
 *
 * Called when the app comes back to the foreground. Anything older than
 * ten minutes is dropped rather than sent: a stale position is worse
 * than none, because the customer cannot tell the difference and will
 * believe the rider is somewhere they left long ago.
 */
export async function flushPendingFix(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return;
    const { lat, lng, at } = JSON.parse(raw);
    if (Date.now() - Number(at) > 10 * 60 * 1000) {
      await AsyncStorage.removeItem(PENDING_KEY);
      return;
    }
    if (await postFix(lat, lng)) await AsyncStorage.removeItem(PENDING_KEY);
  } catch { /* ignore */ }
}
