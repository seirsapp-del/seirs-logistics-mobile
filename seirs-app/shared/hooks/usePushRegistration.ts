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
 * **Safe to import even if `expo-notifications` isn't installed yet** -
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
 * @param enabled : only attempt registration when true (e.g. after login)
 */
export function usePushRegistration(enabled: boolean) {
  const registered = useRef(false);

  useEffect(() => {
    if (!enabled || registered.current) return;

    let cancelled = false;
    (async () => {
      try {
        // Native-module pre-check (2026-08-09): the JS package can be
        // bundled from hoisted node_modules while the NATIVE module is
        // absent from the APK (app built before expo-notifications was
        // added to its package.json). In that state expo-notifications
        // internally logs "Cannot find native module 'ExpoPushTokenManager'"
        // as a full-screen dev error before our catch runs. Probe with
        // expo-modules-core's optional lookup and bail silently instead.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const core = require('expo-modules-core');
        const probe = core?.requireOptionalNativeModule?.('ExpoPushTokenManager');
        if (!probe) return; // native side not built into this APK yet

        // Dynamic require: if expo-notifications isn't installed yet, the
        // require throws and we silently bail. No build-time dependency.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Notifications = require('expo-notifications');

        // Permission gate: iOS prompts the user, Android grants by default
        // until SDK 33+ where it also prompts.
        const settings = await Notifications.getPermissionsAsync();
        let status = settings.status;
        if (status !== 'granted') {
          const req = await Notifications.requestPermissionsAsync();
          status = req.status;
        }
        if (status !== 'granted' || cancelled) return;

        // Android needs a notification channel before tokens are issued.
        // 'seirs_default' is the channel the server names on every push;
        // a push aimed at a channel the phone never created is dropped.
        // MAX importance is what makes a heads-up banner over other apps,
        // the way WhatsApp does (founder 2026-09-06).
        if (Platform.OS === 'android') {
          const max = Notifications.AndroidImportance?.MAX ?? 5;
          await Notifications.setNotificationChannelAsync('seirs_default', {
            name: 'SEIRS',
            importance: max,
            sound: 'default',
            vibrationPattern: [0, 250, 250, 250],
            lockscreenVisibility: Notifications.AndroidNotificationVisibility?.PUBLIC ?? 1,
          });
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: max,
          });
        }

        /**
         * The NATIVE token first (2026-09-06). On Android that is the FCM
         * device token, which the server's Firebase Admin path delivers
         * directly with the credentials Railway already holds. The Expo
         * token needs the FCM key uploaded to Expo as well, a second set
         * of credentials to keep alive for no gain. Expo's token stays as
         * the fallback and the server relays those through Expo.
         */
        let token: string | undefined;
        try {
          const dev = await Notifications.getDevicePushTokenAsync();
          if (dev?.data && typeof dev.data === 'string') token = dev.data;
        } catch (e: any) {
          if (__DEV__) console.warn(`[push] device token unavailable: ${e?.message ?? e}`);
        }
        if (!token) {
          const tokenResp = await Notifications.getExpoPushTokenAsync();
          token = tokenResp?.data;
        }
        if (!token || cancelled) return;

        await notificationsApi.registerToken(token);
        registered.current = true;
        // Dev only: the token is how a push is traced end to end.
        if (__DEV__) console.log(`[push] registered ${String(token).slice(0, 40)}...`);
      } catch (e: any) {
        // expo-notifications not installed yet, or token fetch failed. Say
        // so in dev: a silent no-op here cost a day of "why is my phone
        // quiet" (2026-09-06).
        if (__DEV__) console.warn(`[push] registration skipped: ${e?.message ?? e}`);
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
