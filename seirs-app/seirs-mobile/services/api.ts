import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '@/constants/config';

// Called by AuthContext when a 401 is received — set from outside
export let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

async function getToken(): Promise<string | null> {
  const stored = await AsyncStorage.getItem('seirs_user');
  if (!stored) return null;
  return JSON.parse(stored).token ?? null;
}

async function request<T>(
  method: string,
  path: string,
  body?: object,
  auth = true,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();

  if (res.status === 401 && auth) {
    // Token expired or invalid — clear session
    await AsyncStorage.removeItem('seirs_user');
    onSessionExpired?.();
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) throw new Error(data.message ?? 'Request failed');
  return data as T;
}

// ─── Upload ──────────────────────────────────────────────────────────────────
export const uploadApi = {
  file: async (uri: string, mimeType = 'image/jpeg'): Promise<{ url: string }> => {
    const token = await getToken();
    const form  = new FormData();
    const ext   = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    form.append('file', { uri, name: `upload.${ext}`, type: mimeType } as any);

    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? 'Upload failed');
    return data as { url: string };
  },
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (body: {
    name: string; email: string; phone: string; password: string;
    role: 'customer' | 'driver'; vehicleType?: string;
  }) => request<{ token: string; user: any }>('POST', '/auth/register', body, false),

  login: (email: string, password: string) =>
    request<{ token: string; user: any }>('POST', '/auth/login', { email, password }, false),

  me: () => request<{ user: any; driver?: any }>('GET', '/auth/me'),

  forgotPassword: (email: string) =>
    request<{ message: string }>('POST', '/auth/forgot-password', { email }, false),

  resetPassword: (token: string, newPassword: string) =>
    request<{ message: string }>('POST', '/auth/reset-password', { token, newPassword }, false),
};

// ─── Deliveries ───────────────────────────────────────────────────────────────
export const deliveriesApi = {
  quote: (body: object) => request<any>('POST', '/deliveries/quote', body),
  create: (body: object) => request<any>('POST', '/deliveries', body),
  myDeliveries: (page = 1, limit = 20) =>
    request<{ items: any[]; total: number; pages: number }>('GET', `/deliveries?page=${page}&limit=${limit}`),
  track: (code: string) => request<any>('GET', `/deliveries/track/${code}`, undefined, false),
  updateStatus: (id: string, status: string, proofPhotoUrl?: string) =>
    request<any>('PATCH', `/deliveries/${id}/status`, { status, ...(proofPhotoUrl ? { proofPhotoUrl } : {}) }),
  rate: (id: string, rating: number, comment?: string) =>
    request<any>('POST', `/deliveries/${id}/rate`, { rating, comment }),
};

// ─── Payments ─────────────────────────────────────────────────────────────────
export const paymentsApi = {
  initiate: (deliveryId: string, method: string) =>
    request<{ authorizationUrl?: string; reference?: string; paymentId?: string; id?: string }>(
      'POST', '/payments/initiate', { deliveryId, method }
    ),
  verify: (reference: string) =>
    request<any>('POST', `/payments/verify/${reference}`),
  wallet: () =>
    request<{ balanceKobo: number; balanceNaira: number; currency: string }>('GET', '/payments/wallet'),
  history: () =>
    request<any[]>('GET', '/payments/history'),
  withdraw: (amountNaira: number) =>
    request<{ message: string }>('POST', '/payments/withdraw', { amountNaira }),
  updateBankDetails: (data: { bankName: string; bankAccountNumber: string; bankAccountName: string }) =>
    request<any>('PATCH', '/payments/bank-details', data),
};

// ─── Drivers ─────────────────────────────────────────────────────────────────
export const driversApi = {
  me: () => request<any>('GET', '/drivers/me'),
  toggleOnline: (isOnline: boolean) =>
    request<any>('PATCH', '/drivers/online', { isOnline }),
  updateLocation: (lat: number, lng: number) =>
    request<any>('PATCH', '/drivers/location', { lat, lng }),
  myDeliveries: () =>
    request<any[]>('GET', '/deliveries/driver'),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsApi = {
  list: (page = 1) =>
    request<{ items: any[]; total: number; pages: number }>('GET', `/notifications?page=${page}`),
  unreadCount: () =>
    request<{ count: number }>('GET', '/notifications/unread-count'),
  markRead: (id: string) =>
    request<any>('PATCH', `/notifications/${id}/read`),
  markAllRead: () =>
    request<any>('PATCH', '/notifications/read-all'),
};
