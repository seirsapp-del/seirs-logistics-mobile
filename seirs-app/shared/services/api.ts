import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Configuration ────────────────────────────────────────────────────────────
// Each app calls configureApi() once in its root _layout.tsx
let _apiBase = '';
export function configureApi(baseUrl: string) {
  _apiBase = baseUrl;
}

/**
 * Each app stores its session under a different key:
 *   customer-app  → seirs_user            (default)
 *   driver-app    → seirs_user
 *   business-app  → seirs_business_user
 * Call this once in the app's root _layout.tsx if you need a non-default key.
 */
let _storageKey = 'seirs_user';
export function configureSessionStorageKey(key: string) {
  _storageKey = key;
}

// ─── Session expiry handler ───────────────────────────────────────────────────
export let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

// ─── Internals ────────────────────────────────────────────────────────────────
async function getToken(): Promise<string | null> {
  const stored = await AsyncStorage.getItem(_storageKey);
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
  const res = await fetch(`${_apiBase}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();

  if (res.status === 401 && auth) {
    await AsyncStorage.removeItem(_storageKey);
    onSessionExpired?.();
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) throw new Error(data.message ?? 'Request failed');
  return data as T;
}

// ─── Upload ───────────────────────────────────────────────────────────────────
export const uploadApi = {
  file: async (uri: string, mimeType = 'image/jpeg'): Promise<{ url: string }> => {
    const token = await getToken();
    const form  = new FormData();
    const ext   = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    form.append('file', { uri, name: `upload.${ext}`, type: mimeType } as any);

    const res = await fetch(`${_apiBase}/upload`, {
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
    ageConfirmed?: boolean; termsAcceptedAt?: string;
    referralCode?: string;
  }) => request<{ message: string; requiresOtp: boolean }>('POST', '/auth/register', body, false),

  verifyOtp: (email: string, otp: string) =>
    request<{ token: string; user: any }>('POST', '/auth/verify-otp', { email, otp }, false),

  resendOtp: (email: string) =>
    request<{ message: string }>('POST', '/auth/resend-otp', { email }, false),

  login: (email: string, password: string) =>
    request<{ token: string; user: any }>('POST', '/auth/login', { email, password }, false),

  googleLogin: () =>
    request<{ token: string; user: any }>('POST', '/auth/google', {}, false),

  appleLogin: () =>
    request<{ token: string; user: any }>('POST', '/auth/apple', {}, false),

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
      'POST', '/payments/initiate', { deliveryId, method },
    ),
  verify:   (reference: string) => request<any>('POST', `/payments/verify/${reference}`),
  wallet:   () => request<{ balanceKobo: number; balanceNaira: number; currency: string }>('GET', '/payments/wallet'),
  history:  () => request<any[]>('GET', '/payments/history'),
  withdraw: (amountNaira: number) =>
    request<{ message: string }>('POST', '/payments/withdraw', { amountNaira }),
  updateBankDetails: (data: { bankName: string; bankAccountNumber: string; bankAccountName: string }) =>
    request<any>('PATCH', '/payments/bank-details', data),
};

// ─── Drivers ─────────────────────────────────────────────────────────────────
export const driversApi = {
  me:             () => request<any>('GET', '/drivers/me'),
  toggleOnline:   (isOnline: boolean) => request<any>('PATCH', '/drivers/online', { isOnline }),
  updateLocation: (lat: number, lng: number) => request<any>('PATCH', '/drivers/location', { lat, lng }),
  myDeliveries:   () => request<any[]>('GET', '/deliveries/driver'),
  updateKycDoc:   (docId: string, url: string) =>
    request<{ docId: string; saved: boolean }>('PATCH', '/drivers/me/kyc', { docId, url }),
  demandZones:    () =>
    request<{ zones: Array<{ latitude: number; longitude: number; radiusM: number; intensity: number; orderCount: number }> }>(
      'GET', '/drivers/demand-zones',
    ),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsApi = {
  list:        (page = 1) =>
    request<{ items: any[]; total: number; pages: number }>('GET', `/notifications?page=${page}`),
  unreadCount: () => request<{ count: number }>('GET', '/notifications/unread-count'),
  markRead:    (id: string) => request<any>('PATCH', `/notifications/${id}/read`),
  markAllRead: () => request<any>('PATCH', '/notifications/read-all'),
};

// ─── Business Sender / Partner Auth ──────────────────────────────────────────
export const businessAuthApi = {
  login: (email: string, password: string) =>
    request<{ token: string; user: any }>('POST', '/auth/business-login', { email, password }, false),

  register: (data: {
    accountType: 'sender' | 'partner';
    email:    string;
    password: string;
    name:     string;
    phone:    string;
    companyName?:     string;
    rcNumber?:        string;
    businessAddress?: string;
    storeName?:       string;
    storeAddress?:    string;
    capacity?:        number;
  }) => request<{ requiresOtp: boolean; email: string }>(
    'POST', '/auth/business-register', data, false,
  ),

  verifyOtp: (email: string, otp: string) =>
    request<{ token: string; user: any }>('POST', '/auth/business-verify-otp', { email, otp }, false),
};

// ─── Business Sender ─────────────────────────────────────────────────────────
export const businessApi = {
  dashboard: () => request<any>('GET', '/business/dashboard'),

  deliveries: (page = 1, status?: string, search?: string) => {
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    return request<any>('GET', `/business/deliveries?${params.toString()}`);
  },

  delivery: (id: string) => request<any>('GET', `/business/deliveries/${id}`),

  createDelivery: (data: any) =>
    request<any>('POST', '/business/deliveries', data),

  uploadCsv: async (uri: string, fileName: string): Promise<any> => {
    const token = await getToken();
    const formData = new FormData();
    formData.append('file', { uri, name: fileName, type: 'text/csv' } as any);
    const res = await fetch(`${_apiBase}/business/deliveries/csv`, {
      method:  'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body:    formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? 'Upload failed');
    return data;
  },

  wallet:        () => request<any>('GET', '/business/wallet'),
  fundWallet:    (amount: number) => request<any>('POST', '/business/wallet/fund', { amount }),
  transactions:  (page = 1) => request<any>('GET', `/business/wallet/transactions?page=${page}`),
  team:          () => request<any>('GET', '/business/team'),
  inviteTeamMember: (data: { email: string; name: string; teamRole: string }) =>
    request<any>('POST', '/business/team/invite', data),
  removeTeamMember: (memberId: string) =>
    request<any>('DELETE', `/business/team/${memberId}`),
  loyalty:       () => request<any>('GET', '/business/loyalty'),
  specialists:   () => request<any>('GET', '/business/specialists'),
};

// ─── Partner Store ───────────────────────────────────────────────────────────
export const partnerApi = {
  dashboard: () => request<any>('GET', '/partner/dashboard'),

  inventory: (status?: string, page = 1) => {
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.append('status', status);
    return request<any>('GET', `/partner/inventory?${params.toString()}`);
  },

  scanPackage:    (qrCode: string) => request<any>('POST', '/partner/scan', { qrCode }),
  markCollected:  (packageId: string) => request<any>('PATCH', `/partner/packages/${packageId}/collect`),
  earnings:       (period: 'week' | 'month') => request<any>('GET', `/partner/earnings?period=${period}`),
  payouts:        (page = 1) => request<any>('GET', `/partner/payouts?page=${page}`),
  getSettings:    () => request<any>('GET', '/partner/settings'),
  updateSettings: (data: any) => request<any>('PATCH', '/partner/settings', data),

  // Spec V8 §3 — partner-store async drop-off flow (separate from the
  // BusinessPackage inventory above which is for partner-as-pickup-point).
  storeDropoffByCode: (code: string) =>
    request<any>('GET', `/partner-store/dropoff/${encodeURIComponent(code)}`),
  storeReceive: (body: { code: string; weightKg: number; receivedPhotoUrl: string; senderOtp: string }) =>
    request<any>('POST', '/partner-store/receive', body),
  storeRelease: (body: {
    code: string;
    method: 'physical_id' | 'seirs_id';
    collectedPhotoUrl: string;
    idType?: string;
    idNumber?: string;
    otp?: string;
    idPhotoUrl?: string;
    seirsCode?: string;
    typedName?: string;
  }) => request<any>('POST', '/partner-store/release', body),
  storeListAtStore: (storeId: string, onlyActive = true) =>
    request<any[]>('GET', `/partner-store/store/${storeId}/dropoffs?onlyActive=${onlyActive}`),
  storeCapacity: (storeId: string) =>
    request<any>('GET', `/partner-store/store/${storeId}/capacity`),
  storeSetStatus: (storeId: string, status: 'active' | 'paused') =>
    request<{ storeId: string; status: string }>(
      'PATCH', `/partner-store/store/${storeId}/status`, { status },
    ),
  storeOverstays: (storeId: string) =>
    request<Array<{
      id: string; dropCode: string; recipientName: string; recipientPhone: string;
      weightKg: number; status: string; arrivedAt: string | null;
      hoursInStore: number; storageFeesAccruedNgn: number;
      tier: 'free' | 'tier_1' | 'tier_2' | 'return_eligible';
    }>>('GET', `/partner-store/store/${storeId}/overstays`),
};

// ─── Customer-side store drop-off (Spec V8 §3 async flow) ──────────────────
export const dropoffApi = {
  // Browse partner stores near a location, with capacity bucket exposed
  // (Plenty / Limited / Full) so the customer doesn't see ops numbers.
  listCapacityNearby: (lat?: number, lng?: number, radiusKm = 10) => {
    const params = new URLSearchParams();
    if (lat != null)  params.append('lat',      String(lat));
    if (lng != null)  params.append('lng',      String(lng));
    if (radiusKm)     params.append('radiusKm', String(radiusKm));
    return request<Array<{
      id: string; storeName: string; storeAddress: string;
      currentLoad: number; maxCapacity: number; percent: number;
      bucket: 'plenty' | 'limited' | 'full'; full: boolean;
    }>>('GET', `/partner-store/capacity/nearby?${params.toString()}`);
  },

  // Schedule a drop-off — returns the printed dropCode + 6-char backup
  // the customer brings to the store.
  schedule: (body: {
    pickupStoreId:    string;
    mode:             'store_to_door' | 'store_to_store';
    dropoffStoreId?:  string;
    recipientAddress?: string;
    recipientUserId?: string;
    recipientName:    string;
    recipientPhone:   string;
    weightKg:         number;
    packageDescription?: string;
    declaredValueNgn?: number;
  }) => request<{
    id: string; dropCode: string; backupCode: string;
    pickupStoreId: string; status: string; mode: string;
  }>('POST', '/partner-store/dropoff', body),

  byCode: (code: string) =>
    request<any>('GET', `/partner-store/dropoff/${encodeURIComponent(code)}`),

  myDropoffs: () =>
    request<any[]>('GET', '/partner-store/my-dropoffs'),
};

// ─── Fees (Spec V8 §3.9 — public read of Fee Catalogue) ────────────────────
export const feesApi = {
  list: () => request<Array<{
    key: string; name: string; description: string; category: string;
    unit: string; value: number | string; active: boolean;
  }>>('GET', '/fees', undefined, false),
  get: (key: string) =>
    request<{ key: string; value: number }>('GET', `/fees/${encodeURIComponent(key)}`, undefined, false),
};

// ─── Identity (Spec V8 §1.17 — handoff verification) ────────────────────────
export const identityApi = {
  lookupBySeirsId: (code: string) =>
    request<{ seirsId: string; name: string; profilePhoto: string | null; verified: boolean }>(
      'GET', `/identity/lookup/${encodeURIComponent(code)}`,
    ),
  issueHandoffOtp: (deliveryId: string, recipientUserId: string) =>
    request<{ sent: boolean; expiresInMinutes: number }>(
      'POST', `/identity/handoff/${deliveryId}/issue-otp`, { recipientUserId },
    ),
  handoffChain: (deliveryId: string) =>
    request<any[]>('GET', `/identity/handoff/${deliveryId}/chain`),
};
