import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { notificationsApi } from '../services/api';

/**
 * Push-notification registration hook.
 *
 * Run once after the user is authenticated. Asks for push permission,
 * gets the device push token, and registers it with the backend so
 * NotificationsService can target this device with FCM/Expo pushes.
 *
 * **Safe to import even if `expo-notifications` isn't installed yet** —
 * it dynamically requires the modules and silently no-ops if either is
 * missing. That lets the JS-side code ship before the native rebuild.
 *
 * To activate (once per app):
 *   1. `npx expo install expo-notifications expo-device`
 *   2. Add the expo-notifications plugin to app.json
 *   3. Native rebuild (npx expo run:android / run:ios)
 *
 * Pushes won't actually deliver until step 3 ships, but the hook will
 * start working automatically the moment the modules become available.
 *
 * @param enabled  — only attempt registration when true (e.g. after login)
 */
export function usePushRegistration(enabled: boolean) {
  const registered = useRef(false);

  useEffect(() => {
    if (!enabled || registered.current) return;

    let cancelled = false;
    (async () => {
      try {
        // Dynamic require — if expo-notifications isn't installed yet, the
        // require throws and we silently bail. No build-time dependency.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Notifications = require('expo-notifications');

        // Permission gate — iOS prompts the user, Android grants by default
        // until SDK 33+ where it also prompts.
        const settings = await Notifications.getPermissionsAsync();
        let status = settings.status;
        if (status !== 'granted') {
          const req = await Notifications.requestPermissionsAsync();
          status = req.status;
        }
        if (status !== 'granted' || cancelled) return;

        // Android needs a notification channel before tokens are issued.
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance?.DEFAULT ?? 3,
          });
        }

        // Expo push token (works in both Expo Go and dev builds, and is
        // accepted by backend FcmService alongside native FCM tokens).
        const tokenResp = await Notifications.getExpoPushTokenAsync();
        const token = tokenResp?.data;
        if (!token || cancelled) return;

        await notificationsApi.registerToken(token);
        registered.current = true;
      } catch {
        // expo-notifications not installed yet, or token fetch failed — no-op.
      }
    })();

    return () => { cancelled = true; };
  }, [enabled]);
}

/**
 * Call on logout to clear the device token from the backend so the user's
 * other accounts on the same device don't receive their pushes.
 */
export async function clearPushRegistration(): Promise<void> {
  try { await notificationsApi.registerToken(null); } catch { /* best-effort */ }
}
