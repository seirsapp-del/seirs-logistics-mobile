// Set USE_LOCAL_BACKEND=true to point at a local NestJS instance running
// on your dev machine. Otherwise the app talks to Railway, which is what
// you almost always want - including from `npx expo run:android` builds
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
 * The marketing site, and every public link the app hands to a stranger.
 *
 * WHY this is one constant and not a string typed at each call site: the
 * customer app had thirteen hardcoded https://seirs.co/... links, and that
 * host returns HTTP 402 on every path including the root. It is a parked
 * domain, not a site. So every tracking link, collect code and referral
 * link a customer shared with somebody landed on a payment-required page:
 * the receiver could not follow a parcel, a redirect fee could not be
 * settled, and a referral could not be claimed. Found 2026-09-01.
 *
 * Business already routed through a single WEB_BASE for exactly this
 * reason. Customer now does too, so moving back to seirs.co when the
 * domain is live is one line rather than thirteen.
 */
export const WEB_BASE    = 'https://seirs-website.vercel.app';
export const TERMS_URL   = `${WEB_BASE}/terms-of-service`;
export const PRIVACY_URL = `${WEB_BASE}/privacy-policy`;
export const FAQ_URL     = `${WEB_BASE}/faq`;
export const trackUrl    = (code: string) => `${WEB_BASE}/track/${code}`;
export const collectUrl  = (code: string) => `${WEB_BASE}/collect/${code}`;
export const referralUrl = (code: string) => `${WEB_BASE}/r/${code}`;
