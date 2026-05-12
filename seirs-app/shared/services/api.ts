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

// ─── Vehicle taxonomy ─────────────────────────────────────────────────────────
/**
 * Canonical vehicle taxonomy (matches backend `VehicleType` enum).
 * UI screens may use Nigerian aliases (okada/keke/danfo) or the older
 * truck_sm/truck_lg shortcuts — those get normalised here before the
 * payload is sent. Anything else passes through unchanged.
 */
export type CanonicalVehicleType =
  | 'bicycle' | 'motorcycle' | 'tricycle' | 'car' | 'van'
  | 'truck_small' | 'truck_large';

export const VEHICLE_ALIASES: Record<string, CanonicalVehicleType> = {
  okada:    'motorcycle',
  keke:     'tricycle',
  danfo:    'van',           // passenger bus, treated as van for cargo
  truck_sm: 'truck_small',
  truck_lg: 'truck_large',
};

export function normalizeVehicleType(v: string | undefined | null): string | undefined {
  if (!v) return undefined;
  return VEHICLE_ALIASES[v] ?? v;
}

function normalizeBodyVehicle<T extends Record<string, any>>(body: T): T {
  if (!body) return body;
  const out: any = { ...body };
  if (out.vehicleType) out.vehicleType = normalizeVehicleType(out.vehicleType);
  return out as T;
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
  }) => request<{ message: string; requiresOtp: boolean }>('POST', '/auth/register', {
    ...body,
    // Driver registers with okada/keke etc on the UI — normalize before
    // hitting the backend's @IsEnum(VehicleType) validation.
    ...(body.vehicleType ? { vehicleType: VEHICLE_ALIASES[body.vehicleType] ?? body.vehicleType } : {}),
  }, false),

  verifyOtp: (email: string, otp: string) =>
    request<{ token: string; user: any }>('POST', '/auth/verify-otp', { email, otp }, false),

  resendOtp: (email: string) =>
    request<{ message: string }>('POST', '/auth/resend-otp', { email }, false),

  // Spec V8 — logged-in password change (requires current password)
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>(
      'POST', '/auth/change-password', { currentPassword, newPassword },
    ),

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
// ─── Users (profile + account management) ──────────────────────────────────
export const usersApi = {
  me: () => request<any>('GET', '/users/me'),
  updateProfile: (data: { name?: string; phone?: string; profilePhoto?: string }) =>
    request<any>('PATCH', '/users/me', data),
  // NDPR right to erasure — soft-delete + 30-day grace
  deleteAccount: (password: string, reason?: string) =>
    request<{ message: string }>('DELETE', '/users/me', { password, reason }),
  // NDPR Article 24 — right to data portability. Returns a JSON dump.
  exportData: () => request<any>('GET', '/users/me/export'),
};

export const deliveriesApi = {
  quote: (body: object) => request<any>('POST', '/deliveries/quote', normalizeBodyVehicle(body as any)),
  create: (body: object) => request<any>('POST', '/deliveries', normalizeBodyVehicle(body as any)),
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
  // Fetch a single delivery WITH stops eager-loaded. Returns the full
  // multi-stop payload the driver app uses to render the trip.
  getDelivery:    (id: string) =>
    request<any>('GET', `/business/deliveries/${id}`),
  // Stop-level transitions — driver taps these as they walk the route.
  markStopArrived:   (deliveryId: string, stopId: string) =>
    request<any>('POST', `/business/deliveries/${deliveryId}/stops/${stopId}/arrived`),
  markStopDelivered: (deliveryId: string, stopId: string, body?: {
    proofPhotoUrls?: string[]; recipientSignatureUrl?: string;
  }) => request<any>('POST', `/business/deliveries/${deliveryId}/stops/${stopId}/delivered`, body ?? {}),
  // Pending unassigned jobs the driver can claim. Sorted by distance from
  // (lat,lng) when supplied, newest-first otherwise. Backend route:
  // GET /deliveries/available?lat=&lng=&radiusKm=
  getAvailableJobs: (lat?: number, lng?: number, radiusKm = 25) => {
    const params = new URLSearchParams();
    if (lat != null) params.set('lat', String(lat));
    if (lng != null) params.set('lng', String(lng));
    if (radiusKm)    params.set('radiusKm', String(radiusKm));
    const qs = params.toString();
    return request<any[]>('GET', `/deliveries/available${qs ? `?${qs}` : ''}`);
  },
  updateKycDoc:   (docId: string, url: string) =>
    request<{ docId: string; saved: boolean }>('PATCH', '/drivers/me/kyc', { docId, url }),
  demandZones:    () =>
    request<{ zones: Array<{ latitude: number; longitude: number; radiusM: number; intensity: number; orderCount: number }> }>(
      'GET', '/drivers/demand-zones',
    ),
  // Spec V8 — pre-deletion readiness. Driver app calls this on the
  // delete-account screen to surface blockers (active deliveries,
  // wallet balance) before the user can attempt deletion.
  deletionReadiness: () =>
    request<{
      isDriver: boolean;
      ready:    boolean;
      blockers: Array<{ type: string; count: number; action: string }>;
      driverId?: string;
    }>('GET', '/drivers/me/deletion-readiness'),
};

// ─── Offline GPS sync (Spec V8 §2.13) ────────────────────────────────────────
// Driver app should queue location pings to AsyncStorage when REST fails
// (network drop) and drain via this batch endpoint on reconnect. Server
// flags pings older than 90s as wasOffline=true automatically.
export interface OfflineGpsPing {
  recordedAt: string;     // ISO timestamp from device clock at capture
  lat:        number;
  lng:        number;
  deliveryId?: string;
}

export const offlineSyncApi = {
  uploadGpsBatch: (pings: OfflineGpsPing[]) =>
    request<{ accepted: number; rejected: number }>('POST', '/offline-sync/gps-batch', { pings }),
};

// ─── SOS / Safety ─────────────────────────────────────────────────────────────
export interface SosAlertDTO {
  id:         string;
  status:     'active' | 'resolved' | 'cancelled';
  deliveryId: string | null;
  lat:        number | null;
  lng:        number | null;
  note:       string | null;
  createdAt:  string;
}

export const sosApi = {
  // Customer or driver presses SOS. Backend persists + WS-fans to admins
  // and the other party in the trip.
  trigger: (body: { deliveryId?: string; lat?: number; lng?: number; note?: string }) =>
    request<SosAlertDTO>('POST', '/sos/trigger', body),

  // User cancels their own active alert (false alarm).
  cancel: (id: string) => request<SosAlertDTO>('PATCH', `/sos/${id}/cancel`),
};

// ─── Chat ─────────────────────────────────────────────────────────────────────
export interface ChatMessageDTO {
  id:        string;
  body:      string;
  senderId:  string;
  createdAt: string;
  readAt?:   string | null;
}

export interface ChatConversationDTO {
  deliveryId:    string;
  trackingCode:  string;
  otherParty: {
    id:    string | null;
    name:  string;
    role:  'driver' | 'customer';
  };
  lastMessage:   string;
  lastMessageAt: string;
  unread:        number;
}

export const chatApi = {
  // List most-recent messages for a delivery thread (oldest first).
  list: (deliveryId: string, limit = 100) =>
    request<ChatMessageDTO[]>('GET', `/chats/${deliveryId}/messages?limit=${limit}`),

  // Send a new message — backend broadcasts via WS room `chat:<deliveryId>`.
  send: (deliveryId: string, body: string) =>
    request<ChatMessageDTO>('POST', `/chats/${deliveryId}/messages`, { body }),

  // Total unread across all of the user's chats — drives the Messages tab badge.
  unreadCount: () => request<{ count: number }>('GET', '/chats/unread-count'),

  // List the user's conversations (one per delivery they're part of, with
  // the last message + unread count + the other party's display info).
  // Drives the Messages tab list on both customer and driver apps.
  conversations: () => request<ChatConversationDTO[]>('GET', '/chats'),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsApi = {
  list:        (page = 1) =>
    request<{ items: any[]; total: number; pages: number }>('GET', `/notifications?page=${page}`),
  unreadCount: () => request<{ count: number }>('GET', '/notifications/unread-count'),
  markRead:    (id: string) => request<any>('PATCH', `/notifications/${id}/read`),
  markAllRead: () => request<any>('PATCH', '/notifications/read-all'),
  // Register the device's push token (FCM or Expo). Pass null to clear
  // (e.g. on logout). Backend stores it on user.fcmToken.
  registerToken: (token: string | null) =>
    request<{ ok: boolean }>('POST', '/notifications/register-token', { token }),
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
    // Structured address parts — backend stores both the combined string
    // (above) and these so dispatch can index by state without re-parsing.
    state?:           string;
    city?:            string;
    streetAddress?:   string;
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

  // Multi-stop booking. Backend creates one Delivery + N DeliveryStop
  // rows in a transaction, snapshots the active rate card, debits the
  // wallet for the real total. See seirs-backend/business.service
  // CreateMultiStopDeliveryDto for the full payload shape.
  createDelivery: (data: {
    pickupAddress:    string;
    pickupLat:        number;
    pickupLng:        number;
    stops: Array<{
      address:        string;
      lat:            number;
      lng:            number;
      recipientName:  string;
      recipientPhone: string;
      notes?:         string;
      sequenceOrder?: number;
    }>;
    vehicleType:      string;
    categoryCode:     string;
    weightKg:         number;
    packageDescription?: string;
    km:               number;
    estimatedDriveMinutes: number;
    scheduledAt?:     string;
    optimizedWaypointOrder?: number[];
    routeWasAutoOptimized?: boolean;
    isInterState?:    boolean;
    isLongDistance?:  boolean;
    isRecurring?:     boolean;
  }) => request<any>('POST', '/business/deliveries', data),

  // Stop-level transitions (called by driver app when working a multi-
  // stop booking).
  markStopArrived: (deliveryId: string, stopId: string) =>
    request<any>('POST', `/business/deliveries/${deliveryId}/stops/${stopId}/arrived`),
  markStopDelivered: (deliveryId: string, stopId: string, body?: {
    proofPhotoUrls?: string[]; recipientSignatureUrl?: string;
  }) => request<any>('POST', `/business/deliveries/${deliveryId}/stops/${stopId}/delivered`, body ?? {}),

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

  // Hybrid-account (Spec V8 2026-05-11) — Business Sender users can apply
  // to additionally operate as a Partner Store. Admin reviews KYC docs.
  applyForPartnerStore: (body: {
    storeName:          string;
    storeAddress:       string;
    phone:              string;
    maxCapacity?:       number;
    storefrontPhotoUrl: string;
    cacRegUrl?:         string;
    ownerIdUrl:         string;
  }) =>
    request<{ storeId: string; status: string; submittedAt: string; message: string }>(
      'POST', '/partner-store/apply', body,
    ),

  myPartnerApplication: () =>
    request<{
      storeId: string; storeName: string; status: string;
      reviewNote: string | null; reviewedAt: string | null; canPartner: boolean;
    } | null>('GET', '/partner-store/my-application'),
  storeOverstays: (storeId: string) =>
    request<Array<{
      id: string; dropCode: string; recipientName: string; recipientPhone: string;
      weightKg: number; status: string; arrivedAt: string | null;
      hoursInStore: number; storageFeesAccruedNgn: number;
      tier: 'free' | 'tier_1' | 'tier_2' | 'return_eligible';
    }>>('GET', `/partner-store/store/${storeId}/overstays`),
  // Spec V8 — partner store closing readiness check
  storeDeletionReadiness: (storeId: string) =>
    request<{
      ready:    boolean;
      blockers: Array<{ type: string; count: number; action: string }>;
      partnerStoreId: string;
    }>('GET', `/partner-store/store/${storeId}/deletion-readiness`),
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
  verifyHandoff: (deliveryId: string, payload: {
    stage:        string;
    method:       'physical_id' | 'seirs_id';
    fromUserId?:  string;
    idType?:      string;
    idNumber?:    string;
    otp?:         string;
    idPhotoUrl?:  string;
    seirsCode?:   string;
    typedName?:   string;
    proofPhotoUrl?: string;
  }) =>
    request<{ recordId: string; recipientUserId: string }>(
      'POST', `/identity/handoff/${deliveryId}/verify`, payload,
    ),
  handoffChain: (deliveryId: string) =>
    request<any[]>('GET', `/identity/handoff/${deliveryId}/chain`),
};

// ─── Pricing & Configuration ──────────────────────────────────────────────────
// Public reads (rate card + service catalog) cached client-side for 5 min
// to avoid hammering the backend on every keystroke. Quote endpoint is
// auth'd and called when key inputs (vehicle, category, weight, stops,
// time) change so the price preview stays live.

export interface ServiceCategory {
  id:                 string;
  code:               string;
  name:               string;
  examples:           string;
  suggestedVehicles:  string[];
  setupDwellMinutes:  number;
  surchargePercent:   number;
  safetyRules: {
    blockedVehicles?:   string[];
    warningVehicles?:   string[];
    weightThresholdKg?: number;
    warningCopy?:       string;
  } | null;
  active:    boolean;
  sortOrder: number;
}

export interface RateCard {
  id:           string;
  version:      number;
  isActive:     boolean;
  fuelPrices: { petrolPerLitreNgn: number; dieselPerLitreNgn: number };
  vehicleRates: Record<string, {
    baseFareCustomer:    number;
    baseFareDriver:      number;
    labourPerKmCustomer: number;
    labourPerKmDriver:   number;
    kmPerLitre:          number;
    fuelType:            'petrol' | 'diesel' | 'none';
    maxPayloadKg:        number;
  }>;
  stopAndDwell: {
    perStopBonusCustomer:      number;
    perStopBonusDriver:        number;
    perDwellMinuteCustomer:    number;
    perDwellMinuteDriver:      number;
    freeDwellThresholdMinutes: number;
    dwellCapMinutes:           number;
  };
  weightTiers:    Array<{ minKg: number; maxKg: number | null; extraMinutes: number; why?: string }>;
  dwellBuffers:   { baselineMinutes: number; estateMinutes: number; marketMinutes: number; govtMinutes: number };
  timeSurcharges: any;
  zoneSurcharges: any;
  discounts:      any;
  feeRules:       any;
  partnerStore:   any;
  vatRate:        number;
}

export interface PriceBreakdown {
  vehicleType:           string;
  categoryCode:          string;
  km:                    number;
  stops:                 number;
  estimatedDwellMinutes: number;
  customer: {
    base:              number;
    distanceLabour:    number;
    distanceFuel:      number;
    stopBonuses:       number;
    dwellOver:         number;
    categorySurcharge: number;
    timeSurcharges:    { night: number; peak: number; weekend: number };
    zoneSurcharges:    { interState: number; longDistance: number; overnight: number; restricted: number };
    discounts:         { bulk: number; recurring: number; loyalty: number; welcome: number };
    vatBase:           number;
    vat:               number;
    total:             number;
  };
  driver: {
    base:           number;
    distanceLabour: number;
    distanceFuel:   number;
    stopBonuses:    number;
    dwellOver:      number;
    surchargeShare: number;
    total:          number;
  };
  seirsNet:           number;
  rateCardSnapshotId: string;
}

// Module-scope 5-min cache so multiple screens (new-delivery, vehicle
// picker, driver job-detail) don't all hit /config endpoints on every
// mount. Bust manually with `configApi.invalidateCache()` after admin
// publishes a new rate card.
const CONFIG_TTL_MS = 5 * 60 * 1000;
let _rateCardCache:     { data: RateCard; at: number }                | null = null;
let _serviceCatCache:   { data: ServiceCategory[]; at: number }       | null = null;

export const configApi = {
  rateCard: async (force = false): Promise<RateCard> => {
    if (!force && _rateCardCache && Date.now() - _rateCardCache.at < CONFIG_TTL_MS) {
      return _rateCardCache.data;
    }
    const data = await request<RateCard>('GET', '/config/rate-card');
    _rateCardCache = { data, at: Date.now() };
    return data;
  },
  serviceCatalog: async (force = false): Promise<ServiceCategory[]> => {
    if (!force && _serviceCatCache && Date.now() - _serviceCatCache.at < CONFIG_TTL_MS) {
      return _serviceCatCache.data;
    }
    const data = await request<ServiceCategory[]>('GET', '/config/service-catalog');
    _serviceCatCache = { data, at: Date.now() };
    return data;
  },
  invalidateCache: () => {
    _rateCardCache = null;
    _serviceCatCache = null;
  },
};

export interface QuoteInput {
  vehicleType:           string;
  categoryCode:          string;
  km:                    number;
  stopCount:             number;
  weightKg:              number;
  estimatedDwellMinutes: number;
  scheduledAt?:          string;
  isInterState?:         boolean;
  isLongDistance?:       boolean;
  isRecurring?:          boolean;
  isBulk?:               boolean;
  loyaltyPointsToRedeem?: number;
  isWelcome?:            boolean;
}

export const pricingApi = {
  /** Live price quote — call when key inputs change in the booking form. */
  quote: (body: QuoteInput) => request<PriceBreakdown>('POST', '/pricing/quote', body),
};
