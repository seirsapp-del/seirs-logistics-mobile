// Set USE_LOCAL_BACKEND=true to point at a local NestJS instance running
// on your dev machine. Otherwise the app talks to Railway, which is what
// you almost always want — including from `npx expo run:android` builds
// on a phone that can't reach your laptop's local IP.
const USE_LOCAL_BACKEND = false;
const LOCAL_IP = '192.168.2.113';
const RAILWAY_URL = 'https://seirs-logistics-mobile-production.up.railway.app';

export const API_BASE = __DEV__ && USE_LOCAL_BACKEND
  ? `http://${LOCAL_IP}:3000/api/v1`
  : `${RAILWAY_URL}/api/v1`;

export const SOCKET_URL = __DEV__ && USE_LOCAL_BACKEND
  ? `http://${LOCAL_IP}:3000`
  : RAILWAY_URL;
