/**
 * Google sign-in, client side.
 *
 * The native module is linked in all three apps so a single rebuild covers
 * them, but the OAuth client id is read at runtime from expoConfig.extra.
 * That means dropping the real value in is a `.env` edit and a reload, not
 * another native build (founder, 2026-08-30).
 *
 * Until GOOGLE_WEB_CLIENT_ID is set, `isGoogleConfigured()` returns false
 * and callers hide the button rather than showing one that cannot work.
 * The whole reason the old buttons were removed is that they were dead on
 * the first screen a new user meets; a button that appears only once it
 * works is the point of this file.
 *
 * The backend verifies the idToken against GOOGLE_CLIENT_ID and mints a
 * CUSTOMER account for anyone new, which is why this lives in the customer
 * app only. Driver and business signup create a Driver row and a
 * BusinessAccount respectively, and a bare social login cannot populate
 * either, so their buttons need a decision about the follow-up profile step
 * before they can go live.
 */
import Constants from 'expo-constants';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

function webClientId(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
  return extra.googleWebClientId ?? '';
}

/** True once the founder has put a real client id in .env. */
export function isGoogleConfigured(): boolean {
  return webClientId().length > 0;
}

let configured = false;

function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: webClientId(),
    // The idToken is the only thing the backend wants; we are not calling
    // Google APIs on the user's behalf, so no scopes beyond the defaults.
    offlineAccess: false,
  });
  configured = true;
}

export class GoogleCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'GoogleCancelled';
  }
}

/**
 * Runs the native flow and returns a Google idToken.
 *
 * Throws GoogleCancelled when the user backs out, so callers can stay
 * silent rather than showing an error for a deliberate action.
 */
export async function getGoogleIdToken(): Promise<string> {
  if (!isGoogleConfigured()) {
    throw new Error('Google sign-in is not configured on this build.');
  }
  ensureConfigured();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res: any = await GoogleSignin.signIn();

    // v13 wraps the payload in { type, data }; older shapes put it at the
    // top level. Read both so a library bump does not silently break login.
    const idToken: string | undefined =
      res?.data?.idToken ?? res?.idToken ?? res?.user?.idToken;

    if (!idToken) throw new Error('Google did not return a token. Try again.');
    return idToken;
  } catch (e: any) {
    const code = e?.code;
    if (code === statusCodes.SIGN_IN_CANCELLED) throw new GoogleCancelled();
    if (code === statusCodes.IN_PROGRESS) throw new GoogleCancelled();
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error('Google Play services is not available on this phone.');
    }
    throw e;
  }
}

/** Sign the Google session out too, so the next tap offers the chooser. */
export async function googleSignOut(): Promise<void> {
  try {
    if (isGoogleConfigured()) await GoogleSignin.signOut();
  } catch {
    /* best effort: never block SEIRS logout on Google */
  }
}
