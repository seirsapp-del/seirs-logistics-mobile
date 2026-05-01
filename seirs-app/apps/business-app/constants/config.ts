const LOCAL_IP    = '192.168.2.113';
const RAILWAY_URL = 'https://seirs-logistics-mobile-production.up.railway.app';

export const API_BASE = __DEV__
  ? `http://${LOCAL_IP}:3000/api/v1`
  : `${RAILWAY_URL}/api/v1`;

export const SOCKET_URL = __DEV__
  ? `http://${LOCAL_IP}:3000`
  : RAILWAY_URL;
