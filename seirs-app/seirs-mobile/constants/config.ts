const LOCAL_IP = '192.168.2.113';

export const API_BASE = __DEV__
  ? `http://${LOCAL_IP}:3000/api/v1`
  : 'https://api.seirs.co/api/v1';

export const SOCKET_URL = __DEV__
  ? `http://${LOCAL_IP}:3000`
  : 'https://api.seirs.co';
