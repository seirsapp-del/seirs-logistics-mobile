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
 * truck_sm/truck_lg shortcuts. those get normalised here before the
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

export async function request<T>(
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

  if (!res.ok) {
    /**
     * Carry the HTTP status on the error.
     *
     * Callers could only see a message string, so nothing could tell a
     * 404 apart from a 500. That matters wherever the two mean opposite
     * things: the SOS screen was reporting "we could not load the
     * emergency directory" as an outage when the endpoint simply does
     * not exist, which is a permanent red warning on the one screen
     * where a warning has to mean something.
     */
    const err = new Error(data.message ?? 'Request failed') as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

// ─── Upload ───────────────────────────────────────────────────────────────────
export type UploadFolder = 'kyc' | 'proof' | 'avatars' | 'cms' | 'chat' | 'documents' | 'packages';

async function _uploadCore(uri: string, mimeType = 'image/jpeg', folder?: UploadFolder): Promise<{ url: string }> {
  const token = await getToken();
  const form  = new FormData();
  const ext   = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  form.append('file', { uri, name: `upload.${ext}`, type: mimeType } as any);

  const qs = folder ? `?folder=${encodeURIComponent(folder)}` : '';
  const res = await fetch(`${_apiBase}/upload${qs}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Upload failed');
  return data as { url: string };
}

export const uploadApi = {
  file: _uploadCore,
  // Backward-compat alias. older driver screens (edit-profile, kyc,
  // signature, trunk-check) call `uploadApi.uploadFile(uri, prefix?)`.
  // The `prefix` second arg was for an R2 key-prefix that the backend
  // no longer expects; safely ignored. New code should call `.file()`.
  uploadFile: (uri: string, _prefix?: string, mimeType = 'image/jpeg') =>
    _uploadCore(uri, mimeType),
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (body: {
    name: string; email: string; phone: string; password: string;
    role: 'customer' | 'driver'; vehicleType?: string;
    ageConfirmed?: boolean; termsAcceptedAt?: string;
    referralCode?: string;
    /** Optional at signup. Pre-fills the first booking's pickup. */
    homeAddress?: {
      label: string; street: string; city: string; state: string;
      coords?: { lat: number; lng: number } | null;
    };
  }) => request<{ message: string; requiresOtp: boolean }>('POST', '/auth/register', {
    ...body,
    // Driver registers with okada/keke etc on the UI. normalize before
    // hitting the backend's @IsEnum(VehicleType) validation.
    ...(body.vehicleType ? { vehicleType: VEHICLE_ALIASES[body.vehicleType] ?? body.vehicleType } : {}),
  }, false),

  verifyOtp: (email: string, otp: string) =>
    request<{ token: string; user: any }>('POST', '/auth/verify-otp', { email, otp }, false),

  resendOtp: (email: string) =>
    request<{ message: string }>('POST', '/auth/resend-otp', { email }, false),

  // Spec V8. logged-in password change (requires current password)
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>(
      'POST', '/auth/change-password', { currentPassword, newPassword },
    ),

  login: (email: string, password: string) =>
    request<{ token: string; user: any }>('POST', '/auth/login', { email, password }, false),

  /**
   * Both of these posted an EMPTY body until 2026-08-30, so every call hit
   * SocialLoginDto's `idToken` requirement and came back 400, then 401.
   * The token now travels; the caller gets it from the native SDK.
   */
  googleLogin: (idToken: string) =>
    request<{ token: string; user: any }>('POST', '/auth/google', { idToken }, false),

  appleLogin: (idToken: string) =>
    request<{ token: string; user: any }>('POST', '/auth/apple', { idToken }, false),

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
  // NDPR right to erasure. Schedules a soft-delete 30 days out; cancel
  // anytime before then via cancelDeletion(). Daily cron hard-deletes
  // once the scheduled time passes.
  deleteAccount: (password: string, reason?: string) =>
    request<{ message: string; scheduledAt?: string; graceDays?: number }>('DELETE', '/users/me', { password, reason }),
  // Cancel a pending self-scheduled deletion. Called from the banner
  // that appears on every screen when the account has pendingDeletion.
  cancelDeletion: () =>
    request<{ message: string }>('POST', '/users/me/cancel-deletion'),
  // NDPR Article 24. right to data portability. Returns a JSON dump.
  exportData: () => request<any>('GET', '/users/me/export'),
  // Notification opt-in toggles. Keys mirror what the apps render.
  getNotificationPrefs: () =>
    request<{ prefs: Record<string, boolean> }>('GET', '/users/me/notification-prefs'),
  updateNotificationPrefs: (prefs: Record<string, boolean>) =>
    request<{ prefs: Record<string, boolean> }>('PATCH', '/users/me/notification-prefs', { prefs }),
  // Profile edit history. NDPR + user reassurance ("was that name change me?")
  profileChanges: () => request<any[]>('GET', '/users/me/profile-changes'),
};

// ─── User identity verification (optional trust-tier upgrade) ──────────────
// Named userVerificationApi (not identityApi) to avoid the collision with the
// existing identityApi below (handoff-OTP verification, Spec V8 §1.17).
//
// See policy: multi-doc (NIN / driver's licence / passport / PVC), manual
// admin approval within 24hrs–3 business days, unverified users retain
// full app access. Verified users unlock higher wallet + reward limits,
// insured deliveries, interstate delivery, priority support.
export type IdentityDocType = 'nin' | 'drivers_licence' | 'passport' | 'pvc';

export const userVerificationApi = {
  status: () => request<{
    verifiedAt:      string | null;
    verifiedDocType: string | null;
    latest: null | {
      id:                 string;
      documentType:       IdentityDocType;
      status:             'submitted' | 'approved' | 'rejected' | 'withdrawn' | 'revoked' | 'expired';
      submittedAt:        string;
      reviewedAt:         string | null;
      rejectionReason:    string | null;
      revokedReason:      string | null;
      revokedAt:          string | null;
      documentExpiryDate: string | null;
      submitterNote:      string | null;
    };
  }>('GET', '/users/me/identity-verification'),
  submit: (payload: {
    documentType:         IdentityDocType;
    documentPhotoUrl:     string;
    documentBackPhotoUrl: string;
    selfiePhotoUrl:       string;
    submitterNote?:       string;
    /** Optional ISO date (YYYY-MM-DD). Only meaningful for licence,
     *  passport, and PVC. NIN slip has no formal expiry. */
    documentExpiryDate?:  string;
  }) => request<any>('POST', '/users/me/identity-verification', payload),
  withdraw: (id: string) => request<any>('DELETE', `/users/me/identity-verification/${id}`),
};

export const deliveriesApi = {
  quote: (body: object) => request<any>('POST', '/deliveries/quote', normalizeBodyVehicle(body as any)),
  create: (body: object) => request<any>('POST', '/deliveries', normalizeBodyVehicle(body as any)),
  myDeliveries: (page = 1, limit = 20, search?: string) =>
    request<{ items: any[]; total: number; pages: number }>(
      'GET',
      `/deliveries?page=${page}&limit=${limit}` +
        (search && search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''),
    ),
  // Suggested addresses based on the current user's delivery history
  // (last 90 days). Ranked by frequency then recency.
  frequentAddresses: () =>
    request<{
      pickups:  Array<{ address: string; lat: number | null; lng: number | null; count: number; lastUsed: string }>;
      dropoffs: Array<{ address: string; lat: number | null; lng: number | null; count: number; lastUsed: string }>;
    }>('GET', '/deliveries/frequent-addresses'),
  // Community pulse aggregated across all customers. Powers the social
  // proof card on the Rewards tab. Cached in-memory by the backend for
  // 5 minutes.
  communityPulse: () =>
    request<{
      deliveriesThisWeek:     number;
      deliveriesThisMonth:    number;
      activeCustomersThisWeek: number;
      generatedAt:            string;
    }>('GET', '/deliveries/pulse'),
  // Admin-set featured promotion for the Rewards tab. Returns null when
  // no promotion is active.
  featuredPromotion: () =>
    request<null | { type: string; label: string; desc: string; expiresAt: string | null }>(
      'GET', '/deliveries/featured-promotion',
    ),
  get: (id: string) => request<any>('GET', `/deliveries/${id}`),
  track: (code: string) => request<any>('GET', `/deliveries/track/${code}`, undefined, false),
  // Failed-delivery flow (2026-08-11): driver opens the 5-minute sender
  // window; sender answers wait | neighbour | gate | store.
  arrivalIssue: (id: string) =>
    request<{ senderResponseBy: string; windowMinutes?: number; alreadyOpen?: boolean }>(
      'POST', `/deliveries/${id}/arrival-issue`,
    ),
  arrivalResponse: (id: string, action: 'wait' | 'neighbour' | 'gate' | 'store') =>
    request<{ resolved: string }>('POST', `/deliveries/${id}/arrival-response`, { action }),
  // receivedBy records WHO took the package (founder 2026-08-12): the
  // proof photo shows it was delivered, this answers delivered to whom,
  // which is the question a dispute actually turns on.
  updateStatus: (
    id: string,
    status: string,
    proofPhotoUrl?: string,
    receivedBy?: { relation: string; name?: string },
  ) =>
    request<any>('PATCH', `/deliveries/${id}/status`, {
      status,
      ...(proofPhotoUrl ? { proofPhotoUrl } : {}),
      ...(receivedBy?.relation ? { receivedByRelation: receivedBy.relation } : {}),
      ...(receivedBy?.name     ? { receivedByName:     receivedBy.name }     : {}),
    }),
  rate: (id: string, rating: number, comment?: string) =>
    request<any>('POST', `/deliveries/${id}/rate`, { rating, comment }),
  emailReceipt: (id: string) =>
    request<{ sent: boolean }>('POST', `/deliveries/${id}/email-receipt`),
  // What cancelling costs right now. The fee is priced server-side off
  // the active rate card: never quote a cancellation fee from the
  // bundled client rate card, which can be months out of date.
  /**
   * The assigned rider raises a problem with the job in front of them and
   * attaches a photo. Flags the delivery AND opens a support ticket in one
   * call, so a half-failure cannot leave a dispute with no ticket.
   */
  reportIssue: (id: string, body: {
    reason: 'mismatch' | 'overweight' | 'absent' | 'unsafe';
    note?: string;
    photoUrl?: string;
  }) =>
    request<{ ok: true; disputedAt: string; reason: string; ticketId: string | null }>(
      'POST', `/deliveries/${id}/report-issue`, body,
    ),
  /**
   * Change a booking before paying for it.
   *
   * The server re-prices every edit through the active rate card and
   * never trusts a total from the app, so the response carries the
   * before and after for the screen to show.
   */
  editUnpaid: (id: string, body: Record<string, any> & {
    /** Travel Buddy: ride a different leg of the same trip. */
    boardStopId?: string; alightStopId?: string;
  }) =>
    request<{
      ok: true;
      delivery: any;
      priceBeforeNgn: number;
      priceAfterNgn:  number;
      priceChanged:   boolean;
    }>('PATCH', `/deliveries/${id}`, body),
  cancelQuote: (id: string) =>
    request<{
      cancellable: boolean;
      stage:       'pre_assign' | 'post_assign' | 'too_late';
      feeNgn:      number;
      reason:      string;
    }>('GET', `/deliveries/${id}/cancel-quote`),
  // Customer cancels their own booking. Withholds the quoted fee from
  // the escrow refund and releases the driver.
  cancel: (id: string, reason?: string) =>
    request<{ ok: true; status: string; feeNgn: number; driverShareNgn: number }>(
      'POST', `/deliveries/${id}/cancel`, { reason },
    ),
  // ── Travel Buddy: browse declared intercity trips, book seats ─────────
  travelBuddyTrips: (from: string, to: string) =>
    request<any[]>('GET', `/deliveries/travel-buddy/trips?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  /**
   * The same declared trips, narrowed to riders actually carrying
   * freight (2026-08-31). Powers the business app's Cargo Space screen,
   * which must never show a trader a car with two seats free.
   */
  /**
   * Negotiating a parcel onto a declared trip, before any card is
   * touched (2026-08-31). A request holds nothing and charges nothing;
   * a decline costs the sender nothing and leaves no refund to chase.
   */
  requestParcelOnTrip: (tripId: string, body: object) =>
    request<any>('POST', `/parcel-requests/trips/${tripId}`, body),
  myParcelRequests: () => request<any[]>('GET', '/parcel-requests/mine'),
  withdrawParcelRequest: (id: string) =>
    request<any>('DELETE', `/parcel-requests/${id}`),
  acceptParcelCounter: (id: string) =>
    request<any>('POST', `/parcel-requests/${id}/accept-counter`, {}),
  /** Driver side: the queue on one of their own trips, and the answers. */
  parcelRequestInbox: (tripId: string) =>
    request<any[]>('GET', `/parcel-requests/trips/${tripId}/inbox`),
  acceptParcelRequest: (id: string) =>
    request<any>('POST', `/parcel-requests/${id}/accept`, {}),
  declineParcelRequest: (id: string, reason?: string) =>
    request<any>('POST', `/parcel-requests/${id}/decline`, reason ? { reason } : {}),
  counterParcelRequest: (id: string, body: {
    dropAddress: string; dropLat: number; dropLng: number; note?: string;
  }) => request<any>('POST', `/parcel-requests/${id}/counter`, body),

  cargoTrips: (from: string, to: string) =>
    request<any[]>('GET', `/deliveries/travel-buddy/trips?forPackages=1&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  /**
   * Book seats. `segment` is the pair of stops the passenger is riding
   * when they are not taking the whole trip: without it the server
   * prices the entire route and boards them at its origin, which on a
   * Jos to Ibadan to Lagos trip meant quoting 943.6 km to somebody
   * getting on at Ibadan.
   */
  bookTripSeats: (
    tripId: string,
    seats: number,
    luggage?: string,
    segment?: { boardStopId: string; alightStopId: string } | null,
  ) =>
    request<any>('POST', `/deliveries/travel-buddy/trips/${tripId}/book`, {
      seats, luggage,
      boardStopId:  segment?.boardStopId,
      alightStopId: segment?.alightStopId,
    }),

  /** Declared driver declines a seat booking: customer refunded 100%. */
  declineTripOffer: (id: string) =>
    request<{ ok: boolean }>('POST', `/deliveries/${id}/decline-trip-offer`),
  /** Driver backs out of an accepted job. Customer never pays; booking re-dispatches. */
  driverCancel: (id: string, reason: string, note?: string) =>
    request<{ ok: boolean; redispatched: boolean }>('POST', `/deliveries/${id}/driver-cancel`, { reason, note }),
  // Driver-initiated claim of an unassigned pending job.
  claim: (id: string) =>
    request<any>('POST', `/deliveries/${id}/claim`),
  // Gap 5 audit copy: log the driver's package-QR scan server-side
  // (delivery_events SCAN type). Assigned driver only. Both match and
  // mismatch results are logged for the dispute trail.
  scanVerify: (id: string, scannedCode: string) =>
    request<{ match: boolean }>('POST', `/deliveries/${id}/scan-verify`, { scannedCode }),
  // Mid-flight rescue: move the drop-off to a partner store while the
  // package is en route. Customer of the delivery only.
  redirectToStore: (id: string, storeId: string) =>
    request<{ deliveryId: string; newDropoffAddress: string; storeId: string }>(
      'POST', `/deliveries/${id}/redirect-to-store`, { storeId },
    ),
  // Settle the failed-delivery redirect fee. Returns a Flutterwave
  // hosted-page URL; paying it unmasks the store on tracking and lets
  // the counter release the package.
  payRedirectFee: (id: string) =>
    request<{ authorizationUrl: string; reference: string; amountNgn: number }>(
      'POST', `/deliveries/${id}/redirect-fee/pay`,
    ),
  // Mid-delivery address correction. Support decides; approval only
  // unlocks payment, and the drop-off moves when the money lands.
  requestAddressChange: (id: string, body: { address: string; lat?: number; lng?: number }) =>
    request<any>('POST', `/deliveries/${id}/address-change`, body),
  getAddressChange: (id: string) =>
    request<any>('GET', `/deliveries/${id}/address-change`),
  payAddressChange: (id: string) =>
    request<{ authorizationUrl: string; reference: string; amountNgn: number }>(
      'POST', `/deliveries/${id}/address-change/pay`,
    ),
  // Return to sender. The destination is always the delivery's own
  // pickup address; there is deliberately no parameter to change it.
  getReturnQuote: (id: string) =>
    request<any>('GET', `/deliveries/${id}/return-quote`),
  requestReturn: (id: string) =>
    request<any>('POST', `/deliveries/${id}/return`),
  payReturn: (id: string) =>
    request<{ authorizationUrl: string; reference: string; amountNgn: number }>(
      'POST', `/deliveries/${id}/return/pay`,
    ),
};

// ─── Payments ─────────────────────────────────────────────────────────────────
// Flutterwave widget tab hint. when set, the hosted page opens
// straight on that tab. Maps from the customer-facing picker (card /
// bank transfer / USSD) to Flutterwave's internal option names.
export type FlutterwavePaymentOption = 'card' | 'banktransfer' | 'ussd' | 'mobilemoney';

export const paymentsApi = {
  initiate: (deliveryId: string, method: string, paymentOption?: FlutterwavePaymentOption) =>
    request<{ authorizationUrl?: string; reference?: string; paymentId?: string; id?: string; error?: string }>(
      'POST', '/payments/initiate', { deliveryId, method, paymentOption },
    ),
  verify:   (reference: string) => request<any>('POST', `/payments/verify/${reference}`),
  wallet:   () => request<{ balanceKobo: number; balanceNaira: number; currency: string }>('GET', '/payments/wallet'),
  history:  () => request<any[]>('GET', '/payments/history'),
  withdraw: (amountNaira: number) =>
    request<{ message: string }>('POST', '/payments/withdraw', { amountNaira }),
  updateBankDetails: (data: { bankName: string; bankCode: string; bankAccountNumber: string; bankAccountName: string }) =>
    request<any>('PATCH', '/payments/bank-details', data),
  getBankDetails: () =>
    request<{
      bankName: string | null; bankCode: string | null;
      bankAccountNumber: string | null; bankAccountName: string | null;
      pendingBankName?: string | null; pendingBankAccountNumber?: string | null;
      pendingBankAccountName?: string | null; pendingBankRequestedAt?: string | null;
    }>('GET', '/payments/bank-details'),
  banks: () => request<Array<{ id: string; name: string; code: string }>>('GET', '/payments/banks'),

  // ── Saved cards (Flutterwave-tokenized, one-tap reuse) ──
  listSavedCards: () => request<SavedCard[]>('GET', '/payments/saved-cards'),
  /** One-tap fare payment with a saved card; falls back to initiate() when success is false. */
  payWithSavedCard: (deliveryId: string, cardId: string) =>
    request<{ success: boolean; alreadyPaid?: boolean; paymentId?: string; last4?: string; error?: string }>(
      'POST', '/payments/pay-with-saved-card', { deliveryId, cardId },
    ),
  setDefaultCard: (id: string) => request<{ ok: boolean }>('PATCH', `/payments/saved-cards/${id}/default`),
  deleteSavedCard: (id: string) => request<{ ok: boolean }>('DELETE', `/payments/saved-cards/${id}`),

  // ── Proactive add card (Bolt/Uber pattern) ──
  // ₦100 verification charge → immediate refund → card token saved.
  // Two-step: start returns the Flutterwave hosted URL, verify runs
  // after the user returns to the app.
  addCardStart:  () =>
    request<{ authorizationUrl: string; reference: string }>('POST', '/payments/add-card'),
  addCardVerify: (txRef: string) =>
    request<{ saved: boolean; refunded: boolean; last4?: string; brand?: string }>(
      'POST', `/payments/add-card/verify/${txRef}`,
    ),

  // ── Bank account verify (driver onboarding) ──
  verifyBank: (bankCode: string, accountNumber: string) =>
    request<{ verified: boolean; accountName?: string; message?: string }>(
      'POST', '/payments/verify-bank', { bankCode, accountNumber },
    ),
};

// ─── Loyalty Points (customer-facing) ────────────────────────────────────────
export interface LoyaltyEntry {
  id:                string;
  delta:             number;
  reason:            string;
  relatedDeliveryId: string | null;
  expiresAt:         string;
  note:              string | null;
  createdAt:         string;
}

export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface ReferralHistoryItem {
  id:          string;
  name:        string;
  accountId:   string | null;
  joinedAt:    string;
  bonusPaid:   boolean;
  bonusPoints: number | null;
  paidAt:      string | null;
}

export const loyaltyApi = {
  balance: () => request<{ balance: number; tier: LoyaltyTier; history: LoyaltyEntry[] }>('GET', '/loyalty/balance'),
  redeem: (type: 'discount_500' | 'free_delivery' | 'priority' | 'insurance', deliveryId?: string) =>
    request<{ redeemedPoints: number; newBalance: number; entryId: string }>(
      'POST', '/loyalty/redeem', { type, deliveryId },
    ),
  myReferrals: () => request<ReferralHistoryItem[]>('GET', '/loyalty/my-referrals'),
};

// ─── Driver Earnings (driver-facing) ─────────────────────────────────────────
export interface EarningsDashboard {
  today:     { earned: number; deliveries: number };
  week:      { earned: number; deliveries: number };
  month?:    { earned: number; deliveries: number };
  allTime:   { earned: number; deliveries: number };
  pending:   number;
  available: number;
  // Instant withdrawal: pending earnings 24h+ old, unlockable for a fee.
  /**
   * New-rider holdback, so the withdraw screen can disclose it before
   * the rider confirms rather than after the money lands short.
   */
  holdbackPct?:      number;
  holdbackNgn?:      number;
  payoutPreviewNgn?: number;
  holdbackEndsAt?:   string | null;
  clearanceBusinessDays?: number;
  nextPayoutEta: string;
}

export interface DriverEarning {
  id:         string;
  deliveryId: string;
  grossAmount: string;
  seirsCut:    string;
  driverNet:   string;
  status:      'pending' | 'available' | 'paid' | 'held';
  availableAt: string;
  paidAt:      string | null;
  createdAt:   string;
  /**
   * GET /earnings/history eager-loads the parent delivery, and it always
   * has: the type simply never said so, so the driver app could not read
   * the addresses off a paid trip without an any-cast. Declared during
   * the 2026-08-23 sweep so "My Trips" can render finished trips from
   * the ledger (D-10.1). Optional because payout responses reuse this
   * shape without the relation.
   */
  delivery?: {
    id:              string;
    status?:         string;
    kind?:           string;
    pickupAddress?:  string | null;
    dropoffAddress?: string | null;
    distanceKm?:     number | string | null;
    deliveredAt?:    string | null;
    createdAt?:      string;
  } | null;
}

// ─── Documents hub (official docs: statements, contracts, letters) ──────────
export interface UserDocumentDTO {
  id:         string;
  title:      string;
  category:   'statement' | 'contract' | 'letter' | 'policy' | 'other';
  body:       string | null;
  fileUrl:    string | null;
  sentByName: string | null;
  createdAt:  string;
}

export const documentsApi = {
  mine: () => request<UserDocumentDTO[]>('GET', '/documents/mine'),
};

export const earningsApi = {
  dashboard: () => request<EarningsDashboard>('GET', '/earnings/dashboard'),
  history:   () => request<DriverEarning[]>('GET', '/earnings/history'),
  // amountNaira (optional) caps the withdrawal; earnings rows are matched
  // FIFO so the actual paid amount can be slightly below the request.
  // instant=true unlocks 24h+ old earnings still inside the business-day
  // clearance window (fee applies to that portion only).
  payout:    (amountNaira?: number, instant?: boolean) =>
    request<{ paidAmount: number; feeNgn?: number; transferId?: string; payoutEarningIds: string[] }>(
      'POST', '/earnings/payout',
      amountNaira !== undefined || instant ? { amountNaira, instant: !!instant } : undefined,
    ),
};

// ─── Saved Card type (used by paymentsApi above) ─────────────────────────────
export interface SavedCard {
  id:         string;
  last4:      string;
  brand:      string;
  expMonth:   number;
  expYear:    number;
  cardHolder: string | null;
  isDefault:  boolean;
  createdAt:  string;
}

// ─── Drivers ─────────────────────────────────────────────────────────────────
/**
 * A vehicle owned by someone other than the rider.
 *
 * Founder, 2026-08-25: "this is Nigeria this happens." Hire purchase, a
 * relative's keke, or an owner who fronts the bike for a daily return are
 * all ordinary. The owner is assumed not to have the app: what is asked
 * for is what someone without a smartphone can produce, which is their
 * name, a number that reaches them, a photo of the paper authorisation
 * they signed, and their name typed on the rider's phone as the Evidence
 * Act section 84 signature.
 */
export type OwnerRelationship =
  | 'family' | 'employer' | 'hire_purchase' | 'daily_return' | 'friend' | 'other';

export interface VehicleOwnershipInput {
  ownership:           'self' | 'third_party';
  ownerName?:          string;
  ownerPhone?:         string;
  ownerRelationship?:  OwnerRelationship;
  ownerConsentUrl?:    string;
  ownerIdUrl?:         string;
  /** Typed by the OWNER, and must match ownerName exactly. */
  ownerSignatureName?: string;
}

export interface VehicleChangeRequest extends VehicleOwnershipInput {
  vehicleType:   string;
  vehiclePlate?: string;
  make?:  string;
  model?: string;
  year?:  string;
  color?: string;
  photoExteriorUrl?:  string;
  photoInteriorUrl?:  string;
  photoPlateUrl?:     string;
  ownershipProofUrl?: string;
  insuranceCertUrl?:  string;
  reason?: string;
}

export interface VehicleChangeDTO extends VehicleChangeRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  createdAt: string;
  decidedAt?: string | null;
  decisionNote?: string | null;
}

export interface VehicleRecordDTO {
  status:       string;
  vehicleType:  string;
  vehiclePlate: string | null;
  make:  string | null;
  model: string | null;
  year:  string | null;
  color: string | null;
  vehiclePhotoUrl:   string | null;
  ownershipProofUrl: string | null;
  insuranceCertUrl:  string | null;
  ownership: {
    /** false means nobody ever asked this rider, not that they said no. */
    declared:           boolean;
    ownership:          'self' | 'third_party';
    ownerName:          string | null;
    ownerPhone:         string | null;
    ownerRelationship:  OwnerRelationship | null;
    ownerConsentUrl:    string | null;
    ownerIdUrl:         string | null;
    ownerSignatureName: string | null;
    ownerConsentAt:     string | null;
  };
  pendingChange: VehicleChangeDTO | null;
}

export const driversApi = {
  me:             () => request<any>('GET', '/drivers/me'),
  toggleOnline:   (isOnline: boolean) => request<any>('PATCH', '/drivers/online', { isOnline }),
  // Corridor ("I'm heading somewhere"): jobs along the way find this courier.
  setCorridor: (destLat: number, destLng: number, label?: string, hours?: number) =>
    request<any>('POST', '/drivers/me/corridor', { destLat, destLng, label, hours }),
  clearCorridor: () => request<any>('DELETE', '/drivers/me/corridor'),
  /**
   * Standing work limits, as opposed to the per-trip switches on a
   * declared intercity trip (2026-08-31). Send only what changed: an
   * omitted field is left alone, and maxTripKm: null clears the cap
   * rather than setting it to zero.
   */
  setWorkPreferences: (body: { acceptsInterstate?: boolean; maxTripKm?: number | null }) =>
    request<any>('PATCH', '/drivers/me/work-preferences', body),
  updateLocation: (lat: number, lng: number) => request<any>('PATCH', '/drivers/location', { lat, lng }),
  myDeliveries:   () => request<any[]>('GET', '/deliveries/driver'),
  // Fetch a single delivery WITH stops eager-loaded. Returns the full
  // multi-stop payload the driver app uses to render the trip.
  getDelivery:    (id: string) =>
    request<any>('GET', `/business/deliveries/${id}`),
  // Stop-level transitions. driver taps these as they walk the route.
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
    request<{ docId: string; saved: boolean; status?: string }>('PATCH', '/drivers/me/kyc', { docId, url }),

  /**
   * Real per-document review state. The KYC screen used to derive "Verified"
   * from the DRIVER's account status, so a replacement licence on an
   * approved account read as verified without anyone reviewing it.
   */
  myKycDocuments: () =>
    request<{ documents: Array<{
      docId: string; url: string; status: 'submitted' | 'approved' | 'rejected';
      rejectionReason: string | null; reviewedAt: string | null; version: number;
    }> }>('GET', '/drivers/me/kyc-documents'),
  // ── Vehicle: live record, ownership, change requests (2026-08-25) ──────
  //
  // Shaped like the payout-bank calls on purpose (founder: "just like
  // change bank account"). Nothing here changes the live vehicle: a
  // submission only ever creates a pending request, because matching and
  // pricing read vehicleType and a silent okada-to-car switch would be a
  // pricing hole.

  /** Live vehicle + ownership declaration + the pending change, if any. */
  getVehicle: () => request<VehicleRecordDTO>('GET', '/drivers/me/vehicle'),

  /** Submit a new vehicle for review. Live vehicle is untouched. */
  submitVehicleChange: (body: VehicleChangeRequest) =>
    request<{ pending: boolean; message: string; change: VehicleChangeDTO }>(
      'POST', '/drivers/me/vehicle-change', body,
    ),

  /** Pull a request back before an admin decides. */
  withdrawVehicleChange: () =>
    request<{ withdrawn: boolean }>('DELETE', '/drivers/me/vehicle-change'),

  /**
   * Declare who owns the vehicle, during initial KYC. Rejected with
   * VEHICLE_OWNERSHIP_LOCKED once the rider is approved: from then on it
   * moves through submitVehicleChange like the rest of the vehicle.
   */
  declareVehicleOwnership: (body: VehicleOwnershipInput) =>
    request<{ saved: boolean; ownership: 'self' | 'third_party' }>(
      'PATCH', '/drivers/me/vehicle-ownership', body,
    ),

  /** Older shape, kept so nothing that still calls it breaks. */
  updateVehicle: (body: VehicleChangeRequest) =>
    request<any>('PATCH', '/drivers/me/vehicle', body),
  demandZones:    () =>
    request<{ zones: Array<{ latitude: number; longitude: number; radiusM: number; intensity: number; orderCount: number }> }>(
      'GET', '/drivers/demand-zones',
    ),
  // Spec V8. pre-deletion readiness. Driver app calls this on the
  // delete-account screen to surface blockers (active deliveries,
  // wallet balance) before the user can attempt deletion.
  deletionReadiness: () =>
    request<{
      isDriver: boolean;
      ready:    boolean;
      blockers: Array<{ type: string; count: number; action: string }>;
      driverId?: string;
    }>('GET', '/drivers/me/deletion-readiness'),

  // Spec V8 §2.11. Last Order (wind-down) toggle. One-way until
  // full sign-off; backend throws LAST_ORDER_LOCKED on disable attempt.
  setLastOrderMode: (enabled: boolean) =>
    request<{ lastOrderMode: boolean }>('PATCH', '/drivers/last-order-mode', { enabled }),

  // Spec V8 §2.18. Interstate trip declarations.
  declareInterstateTrip: (body: {
    fromCity: string; toCity: string; departAt: string; spareCapacityKg: number;
  
    acceptsPassengers?: boolean; seatsTotal?: number; acceptsPackages?: boolean;
    pickupMode?: 'fixed' | 'along_route'; pickupAddress?: string;
    pickupLat?: number; pickupLng?: number; routeKm?: number;
    /**
     * Where the trip actually ends. Without these the server falls back
     * to a hardcoded twelve-city lookup, so a trip anywhere else saved
     * successfully and no passenger could ever book it (2026-08-27).
     */
    destLat?: number; destLng?: number; destAddress?: string;
    /**
     * The route as a LINE, origin first and destination last, with every
     * intermediate stop already on it.
     *
     * Two city names put every distance between city centres, so a
     * passenger boarding 20km outside Ibadan paid from the middle of
     * Ibadan. And "pick up along my route" told them nothing about where
     * to stand, which the founder called out directly: a rider can wait
     * somewhere else and blame the passenger, and nobody can settle it
     * because no exact place was ever agreed.
     *
     * kmFromOrigin is deliberately NOT sent. The server measures it off
     * these coordinates and stores it, so a seat quoted today cannot
     * reprice tomorrow because the app rounded differently.
     *
     * Optional, so an older server that ignores the field still accepts
     * the declaration on the two-city fields above and the screen keeps
     * working.
     */
    stops?: Array<{
      city: string;
      address: string;
      latitude: number;
      longitude: number;
      description?: string;
    }>;
  }) => request<any>('POST', '/drivers/interstate-trips', body),
  myInterstateTrips: () => request<any[]>('GET', '/drivers/interstate-trips/me'),

  /**
   * Seat requests on a declared trip, and the driver's answer.
   *
   * The backend has had accept and decline since Travel Buddy shipped, and
   * the driver app never called either: a driver declared a trip and then
   * had no way to see who wanted a seat (founder 2026-08-31). A request
   * holds no seat and charges nothing until the driver says yes.
   */
  tripBookings:   (tripId: string) =>
    request<any[]>('GET', `/travel-buddy/trips/${tripId}/bookings`),
  acceptSeat:     (bookingId: string, note?: string) =>
    request<any>('POST', `/travel-buddy/bookings/${bookingId}/accept`, note ? { note } : {}),
  declineSeat:    (bookingId: string, reason?: string) =>
    request<any>('POST', `/travel-buddy/bookings/${bookingId}/decline`, reason ? { reason } : {}),
  /**
   * Change a declared trip. What the server allows narrows once a seat
   * is booked: more seats and more capacity yes, a new departure time
   * no, because a passenger arranged their day around the old one.
   */
  /**
   * The declared route as an ordered line of stops. A passenger picks
   * their board and alight points from this, which is the only way the
   * two ends of a seat booking can be changed: the rider is not going
   * to an address the passenger types.
   */
  interstateTripStops: (id: string) =>
    request<Array<{
      id: string; sequence: number; city: string; address: string;
      latitude: number; longitude: number; kmFromOrigin: number;
    }>>('GET', `/drivers/interstate-trips/${id}/stops`),
  editInterstateTrip: (id: string, body: {
    departAt?: string; seatsTotal?: number; spareCapacityKg?: number;
    acceptsPassengers?: boolean; acceptsPackages?: boolean;
  }) => request<any>('PATCH', `/drivers/interstate-trips/${id}`, body),
  cancelInterstateTrip: (id: string) =>
    request<any>('PATCH', `/drivers/interstate-trips/${id}/cancel`),

  // Spec V8 §2.14. three-tap driver status broadcast.
  sendStatusBroadcast: (body: {
    type: 'network_bad' | 'traffic' | 'need_help';
    deliveryId?: string;
    lat?: number;
    lng?: number;
  }) => request<any>('POST', '/drivers/status-broadcasts', body),

  // Spec V8 §2.13. Driver Premium (D35) subscription.
  getSubscription: () =>
    request<{
      subscription: any | null;
      weeklyPriceKobo: number;
      weeklyPriceNgn:  number;
    }>('GET', '/drivers/me/subscription'),
  activateSubscription: () =>
    request<any>('POST', '/drivers/me/subscription/activate'),
  pauseSubscription: () =>
    request<any>('POST', '/drivers/me/subscription/pause'),
  cancelSubscription: () =>
    request<any>('POST', '/drivers/me/subscription/cancel'),

  // Spec V8 §2.9. yearly earnings aggregate for FIRS filing.
  taxSummary: (year?: number) =>
    request<{
      driverId: string; generatedAt: string;
      months?: Array<{ year: number; month: number; tripCount: number; grossNgn: number; commissionNgn: number; netNgn: number }>;
      years: Array<{ year: number; tripCount: number; grossNgn: number; commissionNgn: number; netNgn: number }>;
      note: string;
    }>('GET', `/drivers/me/tax-summary${year ? `?year=${year}` : ''}`),

  // Real customer ratings on this driver's deliveries.
  myRatings: () =>
    request<{
      average: number; total: number;
      breakdown: Record<number, number>;
      recent: Array<{ id: string; trackingCode: string; rating: number; comment: string | null; deliveredAt: string }>;
    }>('GET', '/drivers/me/ratings'),
};

// ─── Promotions (Spec V8 §3.13) ──────────────────────────────────────────────
// Customer-facing promo code list + redeem.
export interface PromoDTO {
  id:           string;
  code:         string;
  type:         'flat_discount' | 'percent' | 'free_delivery';
  value:        number;
  description?: string;
  validFrom:    string;
  validTo:      string;
  minSubtotalKobo: number;
  status:       'active' | 'scheduled';
}

export const promotionsApi = {
  listActive: () => request<PromoDTO[]>('GET', '/promotions/active'),
  redeem:     (body: { code: string; subtotalKobo: number; deliveryId?: string }) =>
    request<{
      id: string; promoId: string; code: string;
      discountAppliedKobo: number; finalSubtotalKobo: number;
    }>('POST', '/promotions/redeem', body),
};

// ─── Saved addresses ──────────────────────────────────────────────────────────
export type SavedAddressDTO = {
  id:    string;
  label: string;
  text:  string;
  type:  'home' | 'work' | 'other';
  lat?:  number;
  lng?:  number;
};

export const addressesApi = {
  list:   () => request<SavedAddressDTO[]>('GET', '/addresses'),
  create: (body: Omit<SavedAddressDTO, 'id'>) =>
    request<SavedAddressDTO>('POST', '/addresses', body),
  update: (id: string, body: Partial<Omit<SavedAddressDTO, 'id'>>) =>
    request<SavedAddressDTO>('PATCH', `/addresses/${id}`, body),
  remove: (id: string) =>
    request<{ deleted: true }>('DELETE', `/addresses/${id}`),
};

// ─── Suggestions (Spec V8 §3.13) ─────────────────────────────────────────────
export const suggestionsApi = {
  submit: (body: { subject: string; body: string; category?: string }) =>
    request<any>('POST', '/suggestions', body),
  list:   (page = 1, status?: string) =>
    request<{ items: any[]; total: number; page: number }>('GET', `/suggestions?page=${page}${status ? `&status=${status}` : ''}`),
  vote:   (id: string) => request<{ voted: boolean; voteCount: number }>('POST', `/suggestions/${id}/vote`),
  unvote: (id: string) => request<{ voted: boolean; voteCount: number }>('POST', `/suggestions/${id}/unvote`),
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
  // What support did about it, written by the admin at the moment of
  // closing. Null until an admin resolves the alert with a note.
  resolutionNote?: string | null;
}

export const sosApi = {
  // Customer or driver presses SOS. Backend persists + WS-fans to admins
  // and the other party in the trip.
  trigger: (body: { deliveryId?: string; lat?: number; lng?: number; note?: string }) =>
    request<SosAlertDTO>('POST', '/sos/trigger', body),

  // User cancels their own active alert (false alarm).
  cancel: (id: string) => request<SosAlertDTO>('PATCH', `/sos/${id}/cancel`),

  /**
   * The raiser says what is happening, on an alert that has ALREADY been
   * sent (founder 2026-08-24: "the driver can't leave a quick message to
   * know the issue").
   *
   * Deliberately a second call rather than a field on trigger(): an SOS
   * must never become a form. The button fires help first, and this is
   * how the detail catches up. Backend caps the note at 500 chars and
   * only accepts it from the account that raised the alert.
   */
  addNote: (id: string, note: string) =>
    request<SosAlertDTO>('PATCH', `/sos/${id}/note`, { note }),
};

// ─── Chat ─────────────────────────────────────────────────────────────────────
export interface ChatMessageDTO {
  id:        string;
  body:      string;
  // Null for system messages (driver assigned, picked up, delivered).
  // Client renders sender-less messages as centered status pills.
  senderId:  string | null;
  createdAt: string;
  readAt?:   string | null;
  // Stable enum-like slug that the client maps to an i18n key:
  //   assigned | picked_up | in_transit | delivered | cancelled | failed
  systemType?: string | null;
  // Optional image attachment (public R2 CDN URL). When set, the body
  // acts as an optional caption and may be an empty string.
  imageUrl?:   string | null;
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

  // Send a new message. backend broadcasts via WS room `chat:<deliveryId>`.
  // Either `body` or `imageUrl` must be non-empty. Image-only messages
  // are allowed (body may be empty when imageUrl is set).
  send: (deliveryId: string, body: string, imageUrl?: string | null) =>
    request<ChatMessageDTO>('POST', `/chats/${deliveryId}/messages`, { body, imageUrl: imageUrl ?? undefined }),

  // Total unread across all of the user's chats. drives the Messages tab badge.
  unreadCount: () => request<{ count: number }>('GET', '/chats/unread-count'),

  // List the user's conversations (one per delivery they're part of, with
  // the last message + unread count + the other party's display info).
  // Drives the Messages tab list on both customer and driver apps.
  conversations: () => request<ChatConversationDTO[]>('GET', '/chats'),

  // Explicit mark-as-read. Called by clients when the chat screen gains
  // focus so read receipts flip without needing to paginate the message
  // list. Idempotent.
  markRead: (deliveryId: string) =>
    request<void>('POST', `/chats/${deliveryId}/read`),
};

// ─── Support tickets (Chat 5) ────────────────────────────────────────────
// Users can open a support conversation with SEIRS ops any time. Kept
// deliberately separate from delivery chats so admins do not snoop
// customer<->driver threads. Backend enforces rate limits (3 open + 10
// per 24h) and inserts an auto-response system message outside 6am-10pm
// WAT so the user knows when to expect a reply.

export type TicketTopic  = 'billing' | 'driver' | 'account' | 'delivery' | 'other';
export type TicketStatus = 'open' | 'awaiting_agent' | 'awaiting_user' | 'resolved' | 'closed';

export interface SupportTicketDTO {
  id:                  string;
  userAccountType:     string;
  topic:               TicketTopic;
  status:              TicketStatus;
  subject:             string;
  linkedDeliveryId:    string | null;
  assignedAgentId:     string | null;
  firstAgentReplyAt:   string | null;
  resolvedAt:          string | null;
  autoClosedAt:        string | null;
  lastMessageAt:       string;
  createdAt:           string;
  /**
   * Messages on this ticket the viewer has not read. Server-computed
   * from readAt, the same column the Messages tab badge counts, so the
   * row and the tab can no longer disagree. Optional because an older
   * server build does not send it.
   */
  unread?:             number;
}

export interface SupportThreadDTO {
  ticket:   SupportTicketDTO;
  messages: ChatMessageDTO[];
}

export const supportApi = {
  // User endpoints
  create: (body: {
    topic:            TicketTopic;
    subject:          string;
    firstMessage:     string;
    linkedDeliveryId?: string | null;
  }) => request<SupportTicketDTO>('POST', '/support/tickets', body),

  listMine: (status?: TicketStatus, limit = 30) => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    qs.set('limit', String(limit));
    return request<SupportTicketDTO[]>('GET', `/support/tickets?${qs.toString()}`);
  },

  thread: (ticketId: string) =>
    request<SupportThreadDTO>('GET', `/support/tickets/${ticketId}`),

  reply: (ticketId: string, body: string) =>
    request<ChatMessageDTO>('POST', `/support/tickets/${ticketId}/messages`, { body }),

  // Agent endpoints (admin dashboard). Rejected server-side if the
  // caller is not super_admin or support_agent.
  queue: (params: { status?: TicketStatus; topic?: TicketTopic; accountType?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status)      qs.set('status',      params.status);
    if (params.topic)       qs.set('topic',       params.topic);
    if (params.accountType) qs.set('accountType', params.accountType);
    qs.set('limit', String(params.limit ?? 30));
    return request<SupportTicketDTO[]>('GET', `/support/queue?${qs.toString()}`);
  },

  agentReply: (ticketId: string, body: string) =>
    request<ChatMessageDTO>('POST', `/support/tickets/${ticketId}/agent-reply`, { body }),

  setStatus: (ticketId: string, status: TicketStatus) =>
    request<SupportTicketDTO>('PATCH', `/support/tickets/${ticketId}/status`, { status }),
};

// ─── Maintenance status (public. apps poll to show banner) ────────────────
export const maintenanceApi = {
  status: () =>
    request<{ maintenanceMode: boolean; message: string | null }>(
      'GET', '/maintenance/status', undefined, false,
    ),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsApi = {
  list:        (page = 1) =>
    request<{ items: any[]; total: number; pages: number }>('GET', `/notifications?page=${page}`),
  unreadCount: () => request<{ count: number }>('GET', '/notifications/unread-count'),
  markRead:    (id: string) => request<any>('PATCH', `/notifications/${id}/read`),
  markAllRead: () => request<any>('PATCH', '/notifications/read-all'),
  remove:      (id: string) => request<any>('DELETE', `/notifications/${id}`),
  // Mass clear: onlyRead=true keeps unread ones.
  removeAll:   (onlyRead = false) =>
    request<{ success: boolean; deleted: number }>('DELETE', `/notifications${onlyRead ? '?read=true' : ''}`),
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
    // Structured address parts. backend stores both the combined string
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
    /** Sender drops the run at this counter; a driver collects there. */
    pickupStoreId?:   string;
    stops: Array<{
      address:        string;
      lat:            number;
      lng:            number;
      recipientName:  string;
      recipientPhone: string;
      notes?:         string;
      sequenceOrder?: number;
      /** Multi-package rebuild: each stop IS one package. */
      packagePhotoUrls?:      string[];
      packageDescription?:    string;
      categoryCode?:          string;
      weightKg?:              number;
      receiverFirstName?:     string;
      receiverLastName?:      string;
      receiverPhone?:         string;
      declaredValueNgn?:      number;
      fallbackPref?:          string;
      fallbackNeighbourName?: string;
      /** Deliver this package to a counter near the receiver. */
      destinationStoreId?:    string;
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
    /** Consent to the failed-delivery terms, stamped as termsAcceptedAt. */
    termsAccepted?:   boolean;
    /** Signed quote pin, so the reviewed number is the charged number. */
    quoteToken?:      string;
  }) => request<any>('POST', '/business/deliveries', data),

  // Stop-level transitions (called by driver app when working a multi-
  // stop booking).
  markStopArrived: (deliveryId: string, stopId: string) =>
    request<any>('POST', `/business/deliveries/${deliveryId}/stops/${stopId}/arrived`),
  markStopDelivered: (deliveryId: string, stopId: string, body?: {
    proofPhotoUrls?: string[]; recipientSignatureUrl?: string;
  }) => request<any>('POST', `/business/deliveries/${deliveryId}/stops/${stopId}/delivered`, body ?? {}),

  // Bulk CSV upload removed 2026-08-24 (founder decision): the
  // multi-package Send flow covers the same need and works. The CSV
  // path never did: its parser read columns by position while the
  // service read them by name, so the app's own template failed
  // every row.

  wallet:        () => request<any>('GET', '/business/wallet'),
  transactions:  (page = 1) => request<any>('GET', `/business/wallet/transactions?page=${page}`),
  loyalty:       () => request<any>('GET', '/business/loyalty'),
  specialists:   () => request<any>('GET', '/business/specialists'),

  // Spec V8. B13 Cancel scheduled/pending delivery
  /**
   * Change an order after booking. What the server accepts narrows as
   * the order progresses; it returns `editableNow` so the UI can say
   * what is still changeable rather than guessing.
   */
  editDelivery: (id: string, patch: {
    dropoffAddress?: string; dropoffLat?: number; dropoffLng?: number;
    recipientName?: string; recipientPhone?: string; deliveryInstructions?: string;
  }) => request<{ updated: string[]; rejected: string[]; editableNow: string[] }>(
    'PATCH', `/business/deliveries/${id}`, patch,
  ),
  cancelDelivery: (id: string, reason?: string) =>
    request<{ ok: true; status: string }>('POST', `/business/deliveries/${id}/cancel`, { reason }),

  // Spec V8. B21 Business profile (companyName, RC, structured address)
  account: {
    get:    () => request<{
      id: string; companyName: string; rcNumber: string;
      businessAddress: string; state: string; city: string; streetAddress: string;
      status: string; walletBalance: number;
      myTeamRole: 'owner' | 'manager' | 'dispatcher' | 'viewer';
      createdAt: string;
    }>('GET', '/business/account'),
    update: (body: {
      companyName?: string; rcNumber?: string;
      businessAddress?: string; state?: string; city?: string; streetAddress?: string;
    }) => request<any>('PATCH', '/business/account', body),
  },

  // Spec V8 §4.2. recurring delivery templates
  recurringTemplates: {
    list:   () => request<any[]>('GET', '/business/recurring-templates'),
    create: (body: {
      name: string;
      cadence: 'daily' | 'weekly' | 'monthly';
      dayOfWeek?: number;
      dayOfMonth?: number;
      hour?: number;
      minute?: number;
      payload: any;
    }) => request<any>('POST', '/business/recurring-templates', body),
    toggle: (id: string, isActive: boolean) =>
      request<any>('PATCH', `/business/recurring-templates/${id}`, { isActive }),
    remove: (id: string) =>
      request<any>('DELETE', `/business/recurring-templates/${id}`),
  },

  // Yearly spend statement for company accounting / FIRS expense records.
  statement: () =>
    request<{ companyName: string; years: Array<{ year: number; spentNgn: number; payments: number; toppedUpNgn: number }> }>(
      'GET', '/business/statement',
    ),
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
  // Yearly PAID-payout statement for the partner's records/taxes.
  statement:      () =>
    request<{ storeName: string; years: Array<{ year: number; paidNgn: number; payouts: number }> }>(
      'GET', '/partner/statement',
    ),
  getSettings:    () => request<any>('GET', '/partner/settings'),
  updateSettings: (data: any) => request<any>('PATCH', '/partner/settings', data),

  // Spec V8 §3. partner-store async drop-off flow (separate from the
  // BusinessPackage inventory above which is for partner-as-pickup-point).
  storeDropoffByCode: (code: string) =>
    request<any>('GET', `/partner-store/dropoff/${encodeURIComponent(code)}`),
  /**
   * Ask the system to mail a fresh handoff code to the person at the
   * counter. Booking a drop-off never issued one, so the code the
   * Verify screen asked for did not exist and nothing could be received
   * (found on device 2026-08-18).
   */
  storeIssueOtp: (code: string, purpose: 'receive' | 'release' = 'receive') =>
    request<{ sent: boolean; sentTo: string; expiresInMinutes: number }>(
      'POST', '/partner-store/issue-otp', { code, purpose }),
  // staffName (2026-08-25): the counter types their own name, so a store
  // that later denies ever receiving the package is answered by a human.
  // The server refuses the handoff without it.
  storeReceive: (body: { code: string; weightKg: number; receivedPhotoUrl: string; senderOtp: string; staffName: string }) =>
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

  // Hybrid-account (Spec V8 2026-05-11). Business Sender users can apply
  // to additionally operate as a Partner Store. Admin reviews KYC docs.
  applyForPartnerStore: (body: {
    storeName:          string;
    storeAddress:       string;
    phone:              string;
    maxCapacity?:       number;
    storefrontPhotoUrl: string;
    cacRegUrl?:         string;
    ownerIdUrl:         string;
    // Optional coordinates from the address autocomplete. When present,
    // the store appears distance-sorted on /find-a-partner immediately
    // instead of falling to the end of the list.
    storeLat?:          number;
    storeLng?:          number;
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
  // Spec V8. partner store closing readiness check
  storeDeletionReadiness: (storeId: string) =>
    request<{
      ready:    boolean;
      blockers: Array<{ type: string; count: number; action: string }>;
      partnerStoreId: string;
    }>('GET', `/partner-store/store/${storeId}/deletion-readiness`),

  // Spec V8 §4.11. sponsored placement subscription
  sponsorship: {
    me:       () => request<{
      store: { id: string; businessName: string };
      monthlyPriceNgn: number;
      sponsorship: {
        id: string; status: 'active' | 'paused' | 'cancelled';
        startedAt: string; endedAt: string | null;
        lastInvoicedFeeKobo: number; lastInvoicedAt: string | null;
        nextInvoiceAt: string; invoiceCount: number;
        consecutiveFailures: number; lastFailureReason: string | null;
      } | null;
    }>('GET', '/partner-store/sponsorship/me'),
    activate: () => request<any>('POST', '/partner-store/sponsorship/activate'),
    pause:    () => request<any>('POST', '/partner-store/sponsorship/pause'),
  },
};

// ─── Customer-side store drop-off (Spec V8 §3 async flow) ──────────────────
export const dropoffApi = {
  // Public partner-store directory (approved + accepting stores, safe
  // fields only). lat/lng adds Haversine distanceKm + nearest-first sort.
  directory: (lat?: number, lng?: number, q?: string) => {
    const params = new URLSearchParams();
    if (lat != null) params.append('lat', String(lat));
    if (lng != null) params.append('lng', String(lng));
    if (q)           params.append('q', q);
    const qs = params.toString();
    return request<{ total: number; items: Array<{
      id: string; storeName: string; storeAddress: string; phone: string | null;
      operatingDays: string | null; openTime: string | null; closeTime: string | null;
      lat: number | null; lng: number | null; distanceKm: number | null;
    }> }>('GET', `/partner-store/directory${qs ? `?${qs}` : ''}`);
  },

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

  // Schedule a drop-off. returns the printed dropCode + 6-char backup
  // the customer brings to the store.
  schedule: (body: {
    pickupStoreId:    string;
    mode:             'store_to_door' | 'store_to_store';
    dropoffStoreId?:  string;
    recipientAddress?: string;
    recipientUserId?: string;
    recipientName:    string;
    recipientPhone:   string;
    // Optional: no-account recipients receive the collection OTP by
    // email (email + in-app only, no SMS per launch policy).
    recipientEmail?:  string;
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

// ─── Fees (Spec V8 §3.9. public read of Fee Catalogue) ────────────────────
/**
 * SEIRS stories + offers (founder 2026-08-12). The same admin-published
 * content the marketing site shows, read inside the app: news, offers,
 * and promotions, with a link out to the full page on the website.
 * Public endpoint, so it works before sign-in too.
 */
export interface StoryDTO {
  id:             string;
  slug:           string;
  title:          string;
  excerpt:        string | null;
  body:           string;
  coverImageUrl:  string | null;
  category:       string | null;
  publishedAt:    string | null;
}

/**
 * A story an admin ticked "feature in app": becomes a slide on the
 * customer home carousel. Trimmed down from StoryDTO because a card
 * never renders the body.
 */
export interface FeaturedCardDTO {
  id:            string;
  slug:          string;
  title:         string;
  excerpt:       string | null;
  coverImageUrl: string | null;
  category:      string | null;
  badge:         string | null;
  publishedAt:   string | null;
}

export const storiesApi = {
  featured: (limit = 4) =>
    request<{ items: FeaturedCardDTO[] }>(
      'GET', `/website/featured-cards?limit=${limit}`, undefined, false,
    ),
  list: (pageSize = 20) =>
    request<{ items: StoryDTO[]; total: number }>(
      'GET', `/website/content?type=article&pageSize=${pageSize}`, undefined, false,
    ),
  bySlug: (slug: string) =>
    request<StoryDTO>('GET', `/website/content/${encodeURIComponent(slug)}`, undefined, false),
};

/**
 * Google Maps lookups, proxied through our backend (security review
 * 2026-08-12). The apps previously called Google directly with a key
 * compiled into their source, which anyone could extract from the
 * installed app and spend on our account. The key now lives only in
 * server configuration.
 *
 * Responses come back in Google's own shape, so callers that used to
 * fetch Google directly only had to change the URL.
 *
 * Unrelated to the Maps SDK key in app.json, which draws the map itself
 * and is restricted by package name plus signing certificate.
 */
export const mapsApi = {
  directions: (params: { origin: string; destination: string; mode?: string; waypoints?: string }) => {
    const qs = new URLSearchParams({ origin: params.origin, destination: params.destination });
    if (params.mode)      qs.set('mode', params.mode);
    if (params.waypoints) qs.set('waypoints', params.waypoints);
    return request<any>('GET', `/maps/directions?${qs.toString()}`);
  },

  autocomplete: (params: {
    input: string; components?: string; location?: string; radius?: string; types?: string;
  }) => {
    const qs = new URLSearchParams({ input: params.input });
    if (params.components) qs.set('components', params.components);
    if (params.location)   qs.set('location',   params.location);
    if (params.radius)     qs.set('radius',     params.radius);
    if (params.types)      qs.set('types',      params.types);
    return request<any>('GET', `/maps/places/autocomplete?${qs.toString()}`);
  },

  placeDetails: (placeId: string, fields?: string) => {
    const qs = new URLSearchParams({ placeId });
    if (fields) qs.set('fields', fields);
    return request<any>('GET', `/maps/places/details?${qs.toString()}`);
  },

  geocode: (params: { address?: string; latlng?: string }) => {
    const qs = new URLSearchParams();
    if (params.address) qs.set('address', params.address);
    if (params.latlng)  qs.set('latlng',  params.latlng);
    return request<any>('GET', `/maps/geocode?${qs.toString()}`);
  },
};

export const feesApi = {
  list: () => request<Array<{
    key: string; name: string; description: string; category: string;
    unit: string; value: number | string; active: boolean;
  }>>('GET', '/fees', undefined, false),
  get: (key: string) =>
    request<{ key: string; value: number }>('GET', `/fees/${encodeURIComponent(key)}`, undefined, false),
};

// ─── Identity (Spec V8 §1.17. handoff verification) ────────────────────────
export const identityApi = {
  lookupBySeirsId: (code: string) =>
    request<{ seirsId: string; name: string; profilePhoto: string | null; verified: boolean }>(
      'GET', `/identity/lookup/${encodeURIComponent(code)}`,
    ),
  // recipientUserId optional: without it the code emails the SENDER,
  // who forwards it to whoever is collecting (no-account receivers).
  issueHandoffOtp: (deliveryId: string, recipientUserId?: string) =>
    request<{ sent: boolean; expiresInMinutes: number }>(
      'POST', `/identity/handoff/${deliveryId}/issue-otp`,
      recipientUserId ? { recipientUserId } : {},
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
    // The human who signed for it. A store can deny receiving a
    // parcel, so the scan alone cannot settle a dispute: a named
    // person at the counter types their name and it goes on the
    // record (founder 2026-08-25). The controller has always
    // accepted this; the type just never said so.
    signatureName?: string;
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
  /**
   * Customer side only. GET /config/rate-card is public and stopped
   * carrying driver economics on 2026-08-27; declaring them here invited
   * a client to read a field the server no longer sends.
   */
  vehicleRates: Record<string, {
    baseFareCustomer:    number;
    labourPerKmCustomer: number;
    kmPerLitre:          number;
    fuelType:            'petrol' | 'diesel' | 'none';
    maxPayloadKg:        number;
    maxPackages?:        number;
  }>;
  stopAndDwell: {
    perStopBonusCustomer:      number;
    perDwellMinuteCustomer:    number;
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
  /**
   * Price every ride vehicle for a route in one call; each carries its
   * own quote pin so confirm books exactly the number shown.
   */
  rideQuote: (body: {
    km: number;
    pickupCoords?:  { latitude: number; longitude: number };
    dropoffCoords?: { latitude: number; longitude: number };
    luggage?: string;
  }) =>
    request<{
      pricedAt: string;
      vehicles: Record<string, {
        total: number; driverEarnings: number; serviceFee: number;
        quotePin: { token: string; pricedAt: string; expiresAt: string };
      }>;
    }>('POST', '/pricing/ride-quote', body),
  /**
   * Live price quote. call when key inputs change in the booking form.
   *
   * normalizeBodyVehicle is NOT optional here (found on device
   * 2026-08-23). The customer Send screen holds the UI alias as its
   * vehicle id (keke, truck_sm, truck_lg), and this call passed it
   * straight through, so the engine answered "Unknown vehicle type:
   * keke" for three of the seven classes. The screen caught that
   * silently and fell back to the bundled client formula, which prices
   * the service fee as 18% while the live card charges a flat 0: the
   * review showed N2,650 where the server would charge N2,588.96. Worse,
   * booking refuses outright without a server quote, so Keke, Small
   * Truck and Large Truck package bookings could not be completed at
   * all. deliveriesApi.quote/create normalised all along; this one did
   * not, which is exactly why the mismatch stayed invisible.
   */
  quote: (body: QuoteInput) =>
    request<PriceBreakdown>('POST', '/pricing/quote', normalizeBodyVehicle(body as any)),
};
