// Set USE_LOCAL_BACKEND=true to point at a local NestJS instance running
// on your dev machine. Otherwise the app talks to Railway, which is what
// you almost always want, including from `npx expo run:android` builds
// on a phone that can't reach your laptop's local IP.
const USE_LOCAL_BACKEND = false;
const LOCAL_IP = 'localhost'; // relies on `adb reverse tcp:3000 tcp:3000` for phone→laptop
const RAILWAY_URL = 'https://seirs-logistics-mobile-production.up.railway.app';

export const API_BASE = __DEV__ && USE_LOCAL_BACKEND
  ? `http://${LOCAL_IP}:3000/api/v1`
  : `${RAILWAY_URL}/api/v1`;

export const SOCKET_URL = __DEV__ && USE_LOCAL_BACKEND
  ? `http://${LOCAL_IP}:3000`
  : RAILWAY_URL;

/**
 * Public marketing site. Every legal, FAQ and recipient-facing link goes
 * through here so there is ONE place to change when the seirs.app domain
 * lands (B-6.3, B-6.4).
 *
 * Two links were pointing at https://seirs.app, which the app uses nowhere
 * else and which does not resolve: the Terms of Service link inside the
 * checkbox that legally gates payment, and the collection link shared out
 * to a RECIPIENT to settle a redirect fee and reveal the pickup address.
 * An unresolved host there means the fee is never settled and the parcel
 * sits on a partner shelf accruing storage. Both routes exist on the live
 * host: /terms-of-service and /collect/[code].
 */
export const WEB_BASE = 'https://seirs-website.vercel.app';
export const TERMS_URL   = `${WEB_BASE}/terms-of-service`;
export const PRIVACY_URL = `${WEB_BASE}/privacy-policy`;
export const FAQ_URL     = `${WEB_BASE}/faq`;
export const collectUrl  = (code: string) => `${WEB_BASE}/collect/${code}`;
/**
 * Public tracking page for one package code. Needs no SEIRS account and
 * no app, which is the whole point: a business run's receivers are
 * usually strangers to us, holding a code a sender sent them over
 * WhatsApp (founder 2026-08-24, package QR).
 *
 * Routed through WEB_BASE for the same reason as the rest of this file.
 * Some older strings elsewhere hardcode https://seirs.app/track/..., and
 * that host does not resolve today.
 */
export const trackUrl    = (code: string) => `${WEB_BASE}/track/${code}`;
