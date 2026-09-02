import { getToken, touchActivity } from './auth';
import type { LaunchResetReport } from './launch-reset-types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  touchActivity();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // The admin cookie lasts 8 hours; the JWT inside it lasts 30 minutes.
    // A tab left closed for 40 minutes therefore sails through the
    // middleware and then 401s on every single request. Because almost
    // every page catches quietly, the admin just saw empty boards and no
    // hint they had been signed out. Bounce them once, with a reason.
    // Auth routes are excluded: a wrong password on /login is a 401 too,
    // and that must show as "invalid credentials", not a redirect.
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
      const { clearSession } = await import('./auth');
      clearSession();
      if (!window.location.pathname.startsWith('/login')) {
        const from = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`/login?reason=expired&from=${from}`);
      }
    }
    throw new Error((err as any).message ?? 'Request failed');
  }
  return res.json();
}

// Spec V8 §3.6. sliding 30-min admin session. Backend issues admin
// JWTs with 30m TTL. This helper extends the token while the admin is
// active by calling /auth/refresh. Called from NavWrapper every 10
// minutes (REFRESH_EVERY_MS); no-op when no admin token is in storage.
export async function refreshAdminTokenIfPresent(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    const r = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${token}`,
      },
    });
    if (!r.ok) return false;
    const data = await r.json() as { token?: string; user?: any };
    if (data?.token) {
      // Hot-swap the token + user record in localStorage. The next
      // req() call picks up the fresh token from getToken().
      const { saveSession } = await import('./auth');
      saveSession(data.token, data.user);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export const adminApi = {
  /**
   * Riders who agreed to carry a specific load and then did not
   * (2026-08-31). A queue for a person: nothing in this feature takes an
   * automatic action, by founder instruction and because a seized bike
   * and a shrug produce the same row.
   */
  agreementBreaches: {
    list: (reviewed = false, limit = 50) =>
      req<{ items: any[] }>(`/admin/agreement-breaches?reviewed=${reviewed ? 1 : 0}&limit=${limit}`),
    review: (id: string, action: string, note?: string) =>
      req<any>(`/admin/agreement-breaches/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action, note }),
      }),
  },

  login: (email: string, password: string) =>
    req<{ token: string; user: any; requiresTOTP?: boolean; tempToken?: string }>(
      '/auth/admin-login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
    ),

  /**
   * Enrolment. setup() stores a secret and returns the otpauth:// URI to
   * scan; it does NOT switch two-factor on. enable() requires a working
   * code first, so nobody locks themselves out by scanning badly and
   * closing the tab. disable() also requires a code: a stolen session must
   * not be able to remove the thing protecting the account.
   */
  totp: {
    setup:   () => req<{ secret: string; otpauth: string; message: string }>(
      '/auth/admin-totp-setup', { method: 'POST', body: '{}' }),
    enable:  (code: string) => req<{ enabled: boolean }>(
      '/auth/admin-totp-enable', { method: 'POST', body: JSON.stringify({ code }) }),
    disable: (code: string) => req<{ enabled: boolean }>(
      '/auth/admin-totp-disable', { method: 'POST', body: JSON.stringify({ code }) }),
  },

  verifyTOTP: (tempToken: string, code: string) =>
    req<{ token: string; user: any }>(
      '/auth/admin-totp-verify',
      { method: 'POST', body: JSON.stringify({ tempToken, code }) },
    ),

  // Spec V8. admin password recovery (uses the same shared /auth endpoints
  // as customer/driver; backend branches the email link by user role).
  forgotPassword: (email: string) =>
    req<{ message: string }>(
      '/auth/forgot-password',
      { method: 'POST', body: JSON.stringify({ email }) },
    ),
  resetPassword: (token: string, newPassword: string) =>
    req<{ message: string }>(
      '/auth/reset-password',
      { method: 'POST', body: JSON.stringify({ token, newPassword }) },
    ),

  stats: () => req<any>('/admin/stats'),

  /**
   * Every admin sign-in attempt, and a per-staff summary derived from it.
   *
   * Built 2026-09-02 after the founder asked three times: "i cant tell if
   * she signed in or not as a super admin, thats not good." Nothing existed;
   * adminLogin recorded absolutely nothing.
   */
  /**
   * Statements SEIRS has issued. Routes existed with no page: two documents
   * were in production with no way to enumerate them.
   */
  statements: {
    list: (page = 1, subjectType?: string, q?: string) =>
      req<{ items: any[]; total?: number }>(
        `/admin/statements?page=${page}${subjectType ? `&subjectType=${subjectType}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    revoke:  (code: string) => req<any>(`/admin/statements/${code}/revoke`,  { method: 'POST', body: '{}' }),
    reissue: (code: string) => req<any>(`/admin/statements/${code}/reissue`, { method: 'POST', body: '{}' }),
  },

  signIns: {
    list:  (page = 1, outcome?: string, userId?: string) =>
      req<{ items: any[]; total: number; page: number; take: number }>(
        `/admin/sign-ins?page=${page}${outcome ? `&outcome=${outcome}` : ''}${userId ? `&userId=${userId}` : ''}`),
    hours: (days = 30) => req<any[]>(`/admin/sign-ins/hours?days=${days}`),
  },

  /**
   * Every queue with the age of its oldest item. A bare count cannot be
   * triaged: two KYC reviews from this morning and two from three weeks
   * ago are the same number and opposite problems.
   */
  queues: () => req<any[]>('/admin/queues'),

  /**
   * Published zones shaped for the operations map. A closure could be
   * declared and the screen ops actually watches showed nothing.
   */
  zonesMap: () => req<any[]>('/admin/zones/map'),

  /** What SEIRS has already promised, day by day for the week ahead. */
  forwardBook: (days = 7) => req<any[]>(`/admin/forward-book?days=${days}`),

  /**
   * Hour of day against day of week, in Lagos time. demo=1 includes the
   * seeded cohort, which is off by default because a batch of test rows
   * created at whatever hour the seeder ran draws a spike at a time
   * nobody ordered anything.
   */
  demandByHour: (days = 60, demo = false) =>
    req<any>(`/admin/demand-by-hour?days=${days}${demo ? '&demo=1' : ''}`),

  /** Busiest state pairs, derived from coordinates rather than address text. */
  topCorridors: (limit = 8, days = 90, demo = false) =>
    req<any[]>(`/admin/top-corridors?limit=${limit}&days=${days}${demo ? '&demo=1' : ''}`),

  // GET /auth/me. Used by the Health page so the Auth row is a genuinely
  // separate probe from the Backend API row.
  me: () => req<any>('/auth/me'),

  // Live ops dashboard: aggregated real-time pulse. Client should poll on
  // ~30s interval when the dashboard is visible.
  liveDashboard: () => req<any>('/admin/dashboard/live'),
  setDashboardTargets: (body: { revenueNgn?: number; deliveries?: number }) =>
    req<any>('/admin/dashboard/targets', { method: 'PATCH', body: JSON.stringify(body) }),

  // Driver value levels 1-10 (two-person rule). Caps are Fee Catalogue
  // rows; these endpoints drive the driver-page level widget.
  // SOS desk (founder 2026-08-23): alerts used to land in a table
  // nobody saw. Banner + queue + ops flare all read from here.
  sos: {
    active:  ()          => req<any[]>('/sos/active'),
    /**
     * Resolved alerts and what was done about them. The desk only ever
     * listed OPEN alerts, so a resolved incident left the product
     * entirely and the resolution note nobody could read was written for
     * nothing.
     */
    history: (status = 'resolved', limit = 100, opts: { userId?: string; deliveryId?: string } = {}) =>
      req<any[]>(`/sos/history?status=${status}&limit=${limit}`
        + (opts.userId ? `&userId=${opts.userId}` : '')
        + (opts.deliveryId ? `&deliveryId=${opts.deliveryId}` : '')),
    /**
     * Closing an alert now records what was done about it (founder
     * 2026-08-24). Without it the queue is unreviewable: a month later
     * nobody can tell a false alarm from a real incident that was handled.
     * The body is optional so an emergency queue can still be cleared
     * fast; the backend caps the note at 1000 chars.
     */
    resolve: (id: string, resolutionNote?: string) =>
      req<any>(`/sos/${id}/resolve`, {
        method: 'PATCH',
        body:   JSON.stringify({ resolutionNote: resolutionNote ?? undefined }),
      }),
  },
  driverLevels: {
    config: () => req<{ caps: number[] }>('/admin/driver-levels/config'),
    request: (driverId: string, toLevel: number, reason: string) =>
      req<any>(`/admin/drivers/${driverId}/level-change`, { method: 'POST', body: JSON.stringify({ toLevel, reason }) }),
    list: (status?: string, driverId?: string) => {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      if (driverId) qs.set('driverId', driverId);
      return req<any[]>(`/admin/driver-level-changes?${qs.toString()}`);
    },
    approve: (id: string, note?: string) =>
      req<any>(`/admin/driver-level-changes/${id}/approve`, { method: 'POST', body: JSON.stringify({ note }) }),
    reject: (id: string, note?: string) =>
      req<any>(`/admin/driver-level-changes/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
  },
  partnerStores: {
    get: (id: string) => req<any>(`/admin/partner-stores/${id}`),
    list: (status?: string) =>
      req<any[]>(`/admin/partner-stores${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  },

  pendingDeletions: {
    /**
     * These four now return { items, total, page, limit } instead of a bare
     * array (2026-08-28). They were capped server-side at 50 to 200 rows
     * with no total, so anything past the cap was unreachable and no screen
     * could say it existed. Each caller keeps an Array.isArray fallback so a
     * stale deploy of either side degrades to a list rather than an empty
     * board, which on a queue reads as "nothing to do".
     */
    list:   (page = 1, limit = 50) =>
      req<{ items: any[]; total: number; page: number; limit: number }>(
        `/admin/users/pending-deletion?page=${page}&limit=${limit}`),
    cancel: (userId: string) =>
      req<any>(`/admin/users/${userId}/cancel-deletion`, { method: 'POST' }),
    softDelete: (userId: string, reason: string) =>
      req<any>(`/admin/users/${userId}/soft-delete`, {
        method: 'POST', body: JSON.stringify({ reason }),
      }),
  },

  users:      (page = 1, role?: string, search?: string) =>
    req<any>(`/admin/users?page=${page}${role ? `&role=${role}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  user:       (id: string) => req<any>(`/admin/users/${id}`),
  updateUser: (id: string, data: any) =>
    req<any>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  changeRole: (id: string, role: string) =>
    req<any>(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  /**
   * The reason is now stored. suspendUser has always written one to the
   * audit log and the route never read one from the body, so every
   * suspension was recorded as anonymous and the fraud desk was told to
   * write the reason on a support ticket instead.
   */
  /**
   * How many a push broadcast would actually reach, from the same
   * resolver the send uses, so the count and the send cannot disagree.
   * The composer previously derived this from stats(), which was wrong
   * in both directions: it excluded business accounts the broadcast
   * includes and counted suspended ones it excludes.
   */
  broadcastAudienceSize: (audience: string) =>
    req<{
      audience: string; recipients: number;
      withPush: number; withoutPush: number; pushEnabled: boolean;
    }>(`/notifications/audience-size?audience=${encodeURIComponent(audience)}`),

  suspendUser: (id: string, reason?: string) =>
    req<any>(`/admin/users/${id}/suspend`, {
      method: 'PATCH', body: JSON.stringify({ reason }),
    }),

  admins: {
    list:          ()                          => req<any[]>('/admin/admins'),
    create:        (data: any)                 => req<any>('/admin/admins', { method: 'POST', body: JSON.stringify(data) }),
    updateRole:    (id: string, adminRole: string) =>
      req<any>(`/admin/admins/${id}/role`, { method: 'PATCH', body: JSON.stringify({ adminRole }) }),
    resetPassword: (id: string)                => req<any>(`/admin/admins/${id}/reset-password`, { method: 'POST' }),
    // Sends the INVITATION again, not a password reset. The reset copy
    // asks a new hire about a request they never made and omits their
    // staff ID, so it reads as phishing to the one person who most
    // needs to trust it.
    resendInvite:  (id: string)                => req<any>(`/admin/admins/${id}/resend-invite`, { method: 'POST' }),
    // deactivate was removed 2026-08-28. It called a route that never
    // existed, nothing in the UI used it, and building it would have
    // been the wrong shape: a plain deactivate leaves adminRole intact,
    // which is precisely the dormant-super-admin vector offboardAdmin
    // wipes the role to prevent. Offboarding is the supported path.
    reactivate:    (id: string)                => req<any>(`/admin/admins/${id}/reactivate`, { method: 'PATCH' }),
    setupTOTP:     (id: string)                => req<any>(`/admin/admins/${id}/totp/setup`, { method: 'POST' }),
    confirmTOTP:   (id: string, code: string)  =>
      req<any>(`/admin/admins/${id}/totp/confirm`, { method: 'POST', body: JSON.stringify({ code }) }),
    // Spec V8. offboarding wizard
    footprint:     (id: string) => req<{
      adminUserId: string;
      ready: boolean;
      blockers: Array<{ type: string; count: number; action: string }>;
      auditEntries: number;
    }>(`/admin/admins/${id}/footprint`),
    offboard:      (id: string, body: { reason?: string; force?: boolean }) =>
      req<{ message: string }>(`/admin/admins/${id}/offboard`, {
        method: 'POST', body: JSON.stringify(body),
      }),
  },

  drivers:       (page = 1, status?: string, search?: string) =>
    req<any>(`/admin/drivers?page=${page}${status ? `&status=${status}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  driver:        (id: string) => req<any>(`/admin/drivers/${id}`),
  approveDriver: (id: string) => req<any>(`/admin/drivers/${id}/approve`, { method: 'PATCH' }),
  rejectDriver:  (id: string, reason?: string) =>
    req<any>(`/admin/drivers/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ reason }) }),
  suspendDriver: (id: string) => req<any>(`/admin/drivers/${id}/suspend`, { method: 'PATCH' }),

  // Hybrid-account (Spec V8 2026-05-11). partner store applications
  partnerApplications: () =>
    req<Array<{
      id: string; userId: string; storeName: string; storeAddress: string;
      phone: string; maxCapacity: number; status: string;
      storefrontPhotoUrl: string | null; cacRegUrl: string | null;
      ownerIdUrl: string | null; reviewNote: string | null;
      reviewedAt: string | null; reviewedBy: string | null;
      createdAt: string;
    }>>(`/admin/partner-stores/applications`),
  approvePartnerStore: (id: string, note?: string) =>
    req<any>(`/admin/partner-stores/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ note }),
    }),
  // Reverses the partner capability: store stops taking packages, the
  // owner's partner UI disappears. Re-approve to restore.
  suspendPartnerStore: (id: string, note: string) =>
    req<any>(`/admin/partner-stores/${id}/suspend`, {
      method: 'PATCH', body: JSON.stringify({ note }),
    }),
  rejectPartnerStore: (id: string, note: string) =>
    req<any>(`/admin/partner-stores/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ note }),
    }),

  deliveries:     (page = 1, status?: string, search?: string, kind?: string) =>
    req<any>(`/admin/deliveries?page=${page}${status ? `&status=${status}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}${kind ? `&kind=${kind}` : ''}`),
  delivery:       (id: string) => req<any>(`/admin/deliveries/${id}`),
  /** Pickup, ordered stops, live driver position and GPS trail, for the map. */
  deliveryRoute:  (id: string) => req<any>(`/admin/deliveries/${id}/route`),
  cancelDelivery: (id: string) => req<any>(`/admin/deliveries/${id}/cancel`, { method: 'PATCH' }),
  /**
   * Approve or reject a mid-delivery address change.
   *
   * Not under /admin: the logic lives on DeliveriesService, so the route
   * sits on the deliveries controller behind AdminGuard.
   */
  /** Approve or reject a return to sender. Same guard as the address change. */
  decideReturn: (
    id: string,
    body: { approve: boolean; note?: string; overrideQuoteNgn?: number },
  ) =>
    req<any>(`/deliveries/${id}/return/decide`, {
      method: 'POST',
      body:   JSON.stringify(body),
    }),

  /** Which pocket a refund comes out of. Read-only. */
  refundPreview: (id: string, percent: number) =>
    req<any>(`/deliveries/${id}/refund-preview?percent=${percent}`),

  /** Issue the refund support settled on. Money actually moves. */
  issueRefund: (id: string, body: { percent: number; note?: string }) =>
    req<any>(`/deliveries/${id}/refund`, {
      method: 'POST',
      body:   JSON.stringify(body),
    }),

  decideAddressChange: (
    id: string,
    body: { approve: boolean; note?: string; overrideQuoteNgn?: number },
  ) =>
    req<any>(`/deliveries/${id}/address-change/decide`, {
      method: 'POST',
      body:   JSON.stringify(body),
    }),

  reassignDelivery: (id: string, driverId: string) =>
    req<any>(`/admin/deliveries/${id}/reassign`, { method: 'PATCH', body: JSON.stringify({ driverId }) }),

  pricing: {
    get:    ()           => req<any>('/admin/pricing'),
    /**
     * How far the pump price has drifted from the active rate card.
     * Fuel is corrected from the Fee Catalogue so drivers are always
     * reimbursed properly, but the card's own customer rates go stale
     * behind it and somebody has to be told to republish.
     */
    fuelDrift: ()        => req<{
      petrol: { card: number; live: number; driftPct: number };
      diesel: { card: number; live: number; driftPct: number };
      thresholdPct: number;
      stale: boolean;
    }>('/pricing/fuel-drift'),
    /**
     * Copy today's pump prices into a new rate card version in one
     * action. Correcting fuel was always possible by editing the form
     * and publishing; it was never done because that is friction, and
     * the card drifted 45% behind while drivers absorbed the gap.
     */
    syncFuel: ()         => req<{
      published: boolean; version?: number; message?: string;
      from?: { petrol: number; diesel: number };
      to?:   { petrol: number; diesel: number };
    }>('/admin/rate-card/sync-fuel', { method: 'POST', body: '{}' }),
    update: (data: any)  => req<any>('/admin/pricing', { method: 'PATCH', body: JSON.stringify(data) }),
  },

  /**
   * SEIRS Zones. One model for "inside this area, pricing behaves
   * differently", including the case none of the three old half-forms
   * could express: the area is CLOSED.
   */
  zones: {
    list:        ()            => req<any[]>('/admin/zones'),
    options:     ()            => req<any>('/admin/zones/options'),
    permissions: ()            => req<{ canClose: boolean; canPrice: boolean }>('/admin/zones/permissions'),
    getOne:      (id: string)  => req<any>('/admin/zones/' + id),
    create:      (body: any)   => req<any>('/admin/zones', { method: 'POST', body: JSON.stringify(body) }),
    update:      (id: string, body: any) =>
      req<any>('/admin/zones/' + id, { method: 'PATCH', body: JSON.stringify(body) }),
    setPublished: (id: string, published: boolean) =>
      req<any>('/admin/zones/' + id + '/publish', { method: 'POST', body: JSON.stringify({ published }) }),
    deleteOne:   (id: string)  => req<any>('/admin/zones/' + id, { method: 'DELETE' }),
    preview:     (body: any)   => req<any>('/admin/zones/preview', { method: 'POST', body: JSON.stringify(body) }),
  },

  // Spec V8 §3.9. Fee Catalogue (single source of truth for all fees)
  fees: {
    list:    ()                                  => req<any[]>('/admin/fees'),
    grouped: ()                                  => req<Record<string, any[]>>('/admin/fees?grouped=true'),
    get:     (key: string)                       => req<any>(`/admin/fees/${key}`),
    history: (key: string, limit = 50)           => req<any[]>(`/admin/fees/${key}/history?limit=${limit}`),
    update:  (key: string, body: { value?: number; active?: boolean; currentNote?: string }) =>
      req<any>(`/admin/fees/${key}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },

  // Spec V8 §3.10. chain of custody for disputes view (reuses public
  // identity endpoint; admin can read any delivery's handoff chain).
  identity: {
    // Spec V8 §3.10 chain of custody for disputes.
    handoffChain: (deliveryId: string) => req<any[]>(`/identity/handoff/${deliveryId}/chain`),
    // PII reveal for a user's identity documents. Role-gated (403 for
    // non-authorized roles) and audit-logged server-side. Client should
    // treat returned URLs as short-lived and re-blur after 60s.
    reveal: (userId: string) =>
      req<{
        documentPhotoUrl:     string | null;
        documentBackPhotoUrl: string | null;
        selfiePhotoUrl:       string | null;
        documentExpiryDate:   string | null;
        revealedAt:           string;
      }>(`/admin/users/${userId}/reveal-identity-docs`, { method: 'POST' }),
  },

  // Spec V8 §3.12. Interstate trip board.
  interstateTrips: {
    list: (status?: 'active' | 'completed' | 'cancelled') =>
      req<any[]>(`/admin/interstate-trips${status ? `?status=${status}` : ''}`),
  },

  // Spec V8 §3.13. ops broadcast composer.
  notifications: {
    broadcast: (body: {
      audience: 'all_customers' | 'all_drivers' | 'all_partners' | 'specific_zone';
      zone?: string;
      title: string;
      body: string;
    }) => req<{ recipients: number; pushed: number }>('/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    // One message to one person, for support work.
    sendToUser: (body: { userId: string; title: string; body: string }) =>
      req<{ delivered: boolean; hasPushToken: boolean; recipientName: string }>(
        '/notifications/send-to-user',
        { method: 'POST', body: JSON.stringify(body) },
      ),
  },

  // Spec V8 §3.13. email template catalogue + override layer.
  emailTemplates: {
    /**
     * Every template now arrives with `renderedHtml`: the finished email
     * as baseTemplate() will actually send it, so the gallery draws a
     * true thumbnail instead of a list of slugs.
     */
    list: () => req<Array<{
      key:      string;
      name:     string;
      vars:     string[];
      category: 'transactional' | 'security' | 'seasonal' | 'campaign';
      isCustom: boolean;
      defaults: { subject: string; bodyHtml: string };
      renderedSubject: string;
      renderedHtml:    string;
      previewText:     string | null;
      override: {
        subject: string; bodyHtml: string; active: boolean; updatedAt: string;
        bannerImageUrl?: string | null; accentColor?: string | null;
        previewText?: string | null;
      } | null;
    }>>('/admin/email-templates'),

    /** The email as it will arrive, for unsaved edits. */
    preview: (body: { bodyHtml?: string; bannerImageUrl?: string | null; accentColor?: string | null }) =>
      req<{ html: string }>('/admin/email-templates/preview', {
        method: 'POST', body: JSON.stringify(body),
      }),

    create: (body: {
      name: string; subject?: string; bodyHtml?: string; category?: string;
      bannerImageUrl?: string | null; accentColor?: string | null; previewText?: string | null;
    }) => req<any>('/admin/email-templates', { method: 'POST', body: JSON.stringify(body) }),

    remove: (key: string) =>
      req<any>(`/admin/email-templates/${encodeURIComponent(key)}`, { method: 'DELETE' }),

    /**
     * Scheduled sends. A campaign is its own record rather than a field
     * on the template, because one template goes out many times and the
     * record of who was mailed has to survive the template being
     * reworded afterwards.
     */
    campaigns: {
      list: () => req<Array<{
        id: string; templateKey: string; templateName: string; templateMissing: boolean;
        subjectAtSend: string; audience: string; scheduledAt: string;
        status: 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed';
        recipients: number; delivered: number; failed: number;
        note: string | null; finishedAt: string | null;
      }>>('/admin/email-templates/campaigns'),

      /** Counts the same people the send will actually reach. */
      audienceSize: (audience: string) =>
        req<{ audience: string; count: number }>(
          `/admin/email-templates/campaigns/audience-size?audience=${encodeURIComponent(audience)}`),

      schedule: (body: { templateKey: string; audience: string; scheduledAt: string }) =>
        req<any>('/admin/email-templates/campaigns', { method: 'POST', body: JSON.stringify(body) }),

      cancel: (id: string, note?: string) =>
        req<any>(`/admin/email-templates/campaigns/${id}/cancel`, {
          method: 'POST', body: JSON.stringify({ note }),
        }),
    },
    testSend: (key: string, to?: string) =>
      req<{ delivered: boolean; usedOverride: boolean; subject: string }>(
        `/admin/email-templates/${key}/test-send`,
        { method: 'POST', body: JSON.stringify({ to }) },
      ),
    update: (key: string, body: {
      subject?: string; bodyHtml?: string; active?: boolean;
      bannerImageUrl?: string | null; accentColor?: string | null;
      previewText?: string | null; name?: string; category?: string;
    }) =>
      req<any>(`/admin/email-templates/${key}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },

  // Spec V8 §3.13. promotions CRUD.
  promotions: {
    list:   (status?: string, page = 1, limit = 50) =>
      req<{ items: any[]; total: number; page: number; limit: number }>(
        `/admin/promotions?page=${page}&limit=${limit}${status ? `&status=${status}` : ''}`),
    create: (body: any)       => req<any>('/admin/promotions', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: any) => req<any>(`/admin/promotions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string)      => req<any>(`/admin/promotions/${id}`, { method: 'DELETE' }),
  },

  /**
   * Website contact form inbox.
   *
   * The endpoint has existed since the form shipped, but nothing in this
   * dashboard ever called it and there was no page, so every message
   * anyone sent through seirs.co/contact landed in the table and was
   * invisible. The founder sent one on 2026-08-30 and could not find it;
   * it was in the database the whole time. No email fans out either, so
   * this page is currently the ONLY way to see them.
   */
  /**
   * Driver KYC review queue.
   *
   * There was no queue at all until 2026-08-31: documents were written to
   * columns on the driver row and nothing listed them. The founder uploaded
   * documents, the app said "Verified", and there was nothing here to open.
   */
  driverDocuments: {
    list:    (status?: string, page = 1, driverId?: string) =>
      req<{ items: any[]; total: number; page: number; take: number }>(
        `/admin/driver-documents?page=${page}${status ? `&status=${status}` : ''}${driverId ? `&driverId=${driverId}` : ''}`),
    /**
     * Waiting, expired, and expiring within 30 days.
     *
     * The route has existed since 2026-08-31 and nothing called it, so the
     * counts were computed and shown to nobody.
     */
    /**
     * One row per rider waiting on ANY decision. Replaces the three lists a
     * reviewer had to reconcile: pending accounts, submitted documents, and
     * pending vehicle changes.
     */
    queue: () => req<{ count: number; items: any[] }>('/admin/driver-documents/queue'),

    /**
     * Every vehicle change ever decided for a rider, with all five photos.
     * Approval copies only the OUTSIDE photo onto the driver record, so the
     * inside shot, the plate close-up and the rider's own reason are
     * otherwise unreachable once a change is approved.
     */
    vehicleHistory: (driverId: string) =>
      req<{ items: any[] }>(`/admin/driver-documents/vehicle-history/${driverId}`),

    /**
     * The documents lapsing or already lapsed, as a list to work through.
     * counts() returns numbers, and numbers are not work.
     */
    expiring: (days = 30) => req<{ items: any[] }>(`/admin/driver-documents/expiring?days=${days}`),

    /**
     * Set or change an expiry on an already-approved document. Separate
     * from approve(), which would fire a fresh "approved" notice at the
     * rider for a decision made days ago. Null clears it.
     */
    /**
     * For a document that was fine and has run out. Not the same as reject,
     * which tells the rider they did something wrong.
     */
    needsReplacing: (id: string, reason?: string) =>
      req<any>(`/admin/driver-documents/${id}/needs-replacing`, {
        method: 'POST', body: JSON.stringify({ reason }),
      }),

    setExpiry: (id: string, expiresAt: string | null) =>
      req<any>(`/admin/driver-documents/${id}/expiry`, {
        method: 'PATCH', body: JSON.stringify({ expiresAt }),
      }),

    counts: () =>
      req<{ waiting: number; expired: number; expiringSoon: number; driversWaiting: number }>(
        '/admin/driver-documents/counts'),

    /**
     * `expiresAt` (YYYY-MM-DD) is what makes the expiry queries work at all.
     * This used to send no body, so every approval stored null, so the
     * expired and expiringSoon counts filtered on `expiresAt IS NOT NULL`
     * and could only ever return zero. A licence or an insurance
     * certificate approved without a date silently never lapses.
     */
    approve: (id: string, expiresAt?: string | null) =>
      req<any>(`/admin/driver-documents/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ expiresAt: expiresAt ?? null }),
      }),
    reject:  (id: string, reason: string) =>
      req<any>(`/admin/driver-documents/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  },

  contactSubmissions: {
    list:   (status?: string, page = 1) =>
      req<{ items: any[]; total: number; page: number; take: number }>(
        `/admin/contact-submissions?page=${page}${status ? `&status=${status}` : ''}`),
    update: (id: string, body: { status?: string; internalNote?: string }) =>
      req<any>(`/admin/contact-submissions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },

  // Spec V8 §3.13. suggestions inbox.
  suggestions: {
    /* The server has always paged this at 30 and the client never sent a
       page, so pages 2+ were unreachable through the dashboard even
       though the endpoint supported them. */
    list:   (status?: string, page = 1) =>
      req<{ items: any[]; total: number; page: number }>(
        `/admin/suggestions?page=${page}${status ? `&status=${status}` : ''}`),
    update: (id: string, body: { status?: string; adminReply?: string }) =>
      req<any>(`/admin/suggestions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },

  // Spec V8 §3.13. manual refund (closes A23).
  payments: {
    refund: (deliveryId: string, reason: string) =>
      req<{ ok: true; refundedAtIso: string }>(`/admin/payments/${deliveryId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
  },

  /**
   * Travel Buddy ops.
   *
   * Seats are the one product where SEIRS is not holding a parcel but a
   * person, and where a fare can be forfeited on one party's word. That
   * makes it the product most likely to produce an argument, and an
   * argument support cannot see into is an argument SEIRS loses.
   */
  travelBuddy: {
    trips:           (limit = 50)    => req<any[]>(`/travel-buddy/admin/trips?limit=${limit}`),
    bookings:        (status?: string, limit = 100) =>
      req<any[]>(`/travel-buddy/admin/bookings?limit=${limit}${status ? `&status=${status}` : ''}`),
    noShows:         (limit = 50)    => req<any[]>(`/travel-buddy/admin/no-shows?limit=${limit}`),
    pendingPayments: (limit = 50)    => req<any[]>(`/travel-buddy/admin/pending-payments?limit=${limit}`),
    dropReview:      (limit = 50)    => req<any[]>(`/travel-buddy/admin/drop-review?limit=${limit}`),
  },

  // Spec V8 §3.13. NDPR admin tools (A32 + A33)
  ndpr: {
    exportUser:      (id: string)                 => req<any>(`/admin/users/${id}/export`),

    hardDeleteUser:  (id: string, reason: string) =>
      req<{ ok: true; archivedAt: string }>(`/admin/users/${id}/hard-delete`, {
        method: 'POST', body: JSON.stringify({ reason }),
      }),
  },

  // Spec V8 §3.13. duplicate accounts (A21)
  duplicates: {
    list:    (status?: string, page = 1, limit = 50) =>
      req<{ items: any[]; total: number; page: number; limit: number }>(
        `/admin/duplicates?page=${page}&limit=${limit}${status ? `&status=${status}` : ''}`),
    scan:    ()                => req<{ scanned: number; newCandidates: number }>('/admin/duplicates/scan', { method: 'POST' }),
    merge:   (id: string)      => req<any>(`/admin/duplicates/${id}/merge`,   { method: 'POST' }),
    dismiss: (id: string)      => req<any>(`/admin/duplicates/${id}/dismiss`, { method: 'POST' }),
  },

  // Spec V8 §3.13. external partners directory (A40 + A41)
  externalPartners: {
    list:   (type?: 'insurance' | 'specialist') =>
      req<any[]>(`/admin/external-partners${type ? `?type=${type}` : ''}`),
    create: (body: any)             => req<any>('/admin/external-partners', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: any) => req<any>(`/admin/external-partners/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string)            => req<any>(`/admin/external-partners/${id}`, { method: 'DELETE' }),
  },

  // Spec V8. public website CMS (articles + FAQ + changelog + page blocks)
  websiteContent: {
    list:   (type?: string, status?: string, page = 1, limit = 50) => {
      const params = new URLSearchParams();
      if (type)   params.set('type', type);
      if (status) params.set('status', status);
      params.set('page',  String(page));
      params.set('limit', String(limit));
      return req<{ items: any[]; total: number; page: number; limit: number }>(
        `/admin/website/content?${params.toString()}`);
    },
    get:    (id: string)             => req<any>(`/admin/website/content/${id}`),
    create: (body: any)              => req<any>('/admin/website/content', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: any)  => req<any>(`/admin/website/content/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string)             => req<any>(`/admin/website/content/${id}`, { method: 'DELETE' }),
    // Super-admin approval of a submitted page. Reject returns it to
    // draft rather than deleting the editor's work.
    review: (id: string, approve: boolean) =>
      req<any>(`/admin/website/content/${id}/review`, {
        method: 'POST',
        body:   JSON.stringify({ approve }),
      }),
    // Unused-media sweep, super admin only. dryRun=true (the default on
    // the backend too) only counts; pass false to actually delete.
    cleanupMedia: (dryRun: boolean) =>
      req<{ dryRun: boolean; totalObjects: number; referenced: number; unused: number; skippedRecent: number; freedBytes: number; deleted: number }>(
        '/admin/website/media/cleanup',
        { method: 'POST', body: JSON.stringify({ dryRun }) },
      ),
  },

  // Direct R2 upload helper (re-uses the existing /upload endpoint).
  // folder=cms for marketing images, folder=documents for PDFs/files
  // delivered through the Documents hub.
  //
  // Fixed 2026-08-15 after "Upload failed (404)" in production. This helper
  // was the only call in the file not using BASE: it read
  // NEXT_PUBLIC_API_BASE_URL (the WEBSITE's env var, never set on the admin
  // project), fell back to '', and POSTed to the admin's own Vercel domain,
  // which has no /upload. It also read localStorage 'admin_token' while the
  // real key is 'seirs_admin_token', so after fixing the URL it would have
  // 401'd next. Every upload from the deployed admin (cover images included)
  // has been broken since this helper landed; it worked in local dev because
  // BASE's localhost fallback and the misnamed var pointed at the same
  // place. Uses BASE and getToken() like every other call now.
  upload: {
    image: async (file: File, folder: 'cms' | 'documents' = 'cms'): Promise<{ url: string }> => {
      const form = new FormData();
      form.append('file', file);
      const token = getToken();
      const r = await fetch(`${BASE}/upload?folder=${folder}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!r.ok) throw new Error(`Upload failed (${r.status})`);
      return r.json();
    },
  },

  // Spec V8 Tier 3. Developer Platform admin oversight
  devPlatform: {
    listAccounts:    () => req<any[]>('/dev-platform/admin/keys'),  // all keys, all owners
    listAllUsage:    () => req<any>('/dev-platform/usage'),

    // A48. suspend / resume an entire developer account
    suspendOwner: (ownerUserId: string, reason: string) =>
      req<{ suspended: number }>(`/dev-platform/admin/owners/${ownerUserId}/suspend`, {
        method: 'POST', body: JSON.stringify({ reason }),
      }),
    resumeOwner: (ownerUserId: string) =>
      req<{ resumed: number }>(`/dev-platform/admin/owners/${ownerUserId}/resume`, { method: 'POST' }),

    // A49. set per-key rate-limit override (null = revert to default)
    setKeyRateLimit: (keyId: string, limitPerMin: number | null) =>
      req<{ keyId: string; rateLimitOverridePerMin: number | null }>(
        `/dev-platform/admin/keys/${keyId}/rate-limit`,
        { method: 'PATCH', body: JSON.stringify({ limitPerMin }) },
      ),
  },

  // Spec V8. dynamic role management
  roles: {
    list:      ()                        => req<any[]>('/admin/roles'),
    catalogue: ()                        => req<Array<{ section: string; items: Array<{ slug: string; label: string }> }>>('/admin/roles/catalogue'),
    get:       (id: string)              => req<any>(`/admin/roles/${id}`),
    create:    (body: { name: string; description?: string; permissions: string[]; badgeColor?: string }) =>
      req<any>('/admin/roles', { method: 'POST', body: JSON.stringify(body) }),
    update:    (id: string, body: any) =>
      req<any>(`/admin/roles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteOne: (id: string)              =>
      req<any>(`/admin/roles/${id}`, { method: 'DELETE' }),
    assign:    (roleId: string, userId: string) =>
      req<any>(`/admin/roles/${roleId}/assign/${userId}`, { method: 'POST' }),
  },

  // Universal top-bar search. Matches users by name/email/phone/SEIRS-ID,
  // drivers by name/plate, deliveries by tracking code. Returns a flat
  // list of typed hits so the UI can render mixed results.
  search: (q: string, limit = 15) =>
    req<{
      hits: Array<{
        type:     'user' | 'driver' | 'delivery';
        id:       string;
        label:    string;
        sublabel: string;
        href:     string;
      }>;
    }>(`/admin/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  // Spec V8 identity policy. customer identity verification queue.
  // Distinct from driver KYC (which lives under /admin/drivers).
  identityVerifications: {
    /**
     * Returns { items, total, page, limit } as of 2026-08-28. It used to
     * return a bare array capped at 100 with no total, so past a hundred
     * waiting submissions the rest were unreachable and the screen could
     * not say they existed.
     */
    list:    (status: 'submitted' | 'approved' | 'rejected' | 'withdrawn' | 'revoked' | 'expired' = 'submitted',
              page = 1, limit = 50) =>
      req<{ items: any[]; total: number; page: number; limit: number }>(
        `/admin/identity-verifications?status=${status}&page=${page}&limit=${limit}`),
    get:     (id: string) =>
      req<any>(`/admin/identity-verifications/${id}`),
    approve: (id: string, adminNote?: string) =>
      req<any>(`/admin/identity-verifications/${id}/approve`, {
        method: 'POST',
        body:   JSON.stringify({ adminNote }),
      }),
    reject:  (id: string, reason: string, adminNote?: string) =>
      req<any>(`/admin/identity-verifications/${id}/reject`, {
        method: 'POST',
        body:   JSON.stringify({ reason, adminNote }),
      }),
    revoke:  (id: string, reason: string, adminNote?: string) =>
      req<any>(`/admin/identity-verifications/${id}/revoke`, {
        method: 'POST',
        body:   JSON.stringify({ reason, adminNote }),
      }),
  },

  analytics: {
    revenue:              (days = 30) => req<any>(`/admin/analytics/revenue?days=${days}`),
    /* days is optional on all four. Omitted means all time, which is
       what every caller got before 2026-08-28, when the 7/14/30/90
       buttons governed only two of the seven panels. */
    deliveriesByStatus:   (days?: number) => req<any>(`/admin/analytics/deliveries-by-status${days ? `?days=${days}` : ''}`),
    topDrivers:           (limit = 10, days?: number) => req<any>(`/admin/analytics/top-drivers?limit=${limit}${days ? `&days=${days}` : ''}`),
    heatmap:              ()          => req<any>('/admin/analytics/heatmap'),
    deliveriesByVehicle:  (days?: number) => req<any>(`/admin/analytics/deliveries-by-vehicle${days ? `?days=${days}` : ''}`),
    deliveriesByCategory: (days?: number) => req<any>(`/admin/analytics/deliveries-by-category${days ? `?days=${days}` : ''}`),
    driverHours:          (days = 30, limit = 10) =>
      req<any>(`/admin/analytics/driver-hours?days=${days}&limit=${limit}`),
    referralFunnel:       ()          => req<any>('/admin/analytics/referral-funnel'),
  },

  /** Rides vs packages revenue tiles on the dashboard home. */
  revenueSplit: () => req<any>('/admin/analytics/revenue-split'),

  fraud: {
    list:    (page = 1, status?: string) =>
      req<any>(`/admin/fraud?page=${page}${status ? `&status=${status}` : ''}`),
    resolve: (id: string, status: string) =>
      req<any>(`/admin/fraud/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  },

  tickets: {
    list:    (page = 1, status?: string) =>
      req<any>(`/admin/tickets?page=${page}${status ? `&status=${status}` : ''}`),
    get:     (id: string) => req<any>(`/admin/tickets/${id}`),
    assign:  (id: string, agentId: string) =>
      req<any>(`/admin/tickets/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ agentId }) }),
    update:  (id: string, data: { status?: string; resolution?: string }) =>
      req<any>(`/admin/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    reply:   (id: string, message: string) =>
      req<any>(`/admin/tickets/${id}/reply`, { method: 'POST', body: JSON.stringify({ message }) }),
  },

  auditLog: {
    list: (page = 1, adminId?: string, action?: string) =>
      req<any>(`/admin/audit-log?page=${page}${adminId ? `&adminId=${adminId}` : ''}${action ? `&action=${encodeURIComponent(action)}` : ''}`),
  },

  opsMap: {
    onlineDrivers:    () => req<Array<{ id: string; name: string; lat: number; lng: number; isOnline: boolean; lastSeen?: string }>>('/admin/ops-map/drivers'),
    activeDeliveries: () => req<Array<{ id: string; trackingCode: string; pickupLat: number; pickupLng: number; dropoffLat: number; dropoffLng: number; status: string }>>('/admin/ops-map/deliveries'),
    stores:           () => req<{ missingCoords: number; stores: Array<{ id: string; storeName: string; storeAddress: string; lat: number; lng: number; acceptingNew: boolean }> }>('/admin/ops-map/stores'),
    demand:           () => req<{ pending: Array<{ id: string; trackingCode: string; lat: number; lng: number; ageMinutes: number }>; heat: Array<{ lat: number; lng: number }> }>('/admin/ops-map/demand'),
  },

  // Pricing system. admin reads + writes the active RateCard and the
  // ServiceCategory catalog. /config/* endpoints are public so apps can
  // fetch on boot; /admin/* endpoints are auth'd for publishing changes.
  rateCard: {
    /**
     * The ADMIN card, not the public one.
     *
     * This called /config/rate-card, which is public and redacted: it
     * strips baseFareDriver, labourPerKmDriver and every other
     * driver-side number. So the editor showed blank driver columns, and
     * publishing would have written that redacted shape back over the
     * real card and turned driver pay into NaN.
     */
    getActive: () => req<any>('/admin/rate-card/active'),
    history:   () => req<any[]>('/admin/rate-cards'),
    publish:   (body: any) => req<any>('/admin/rate-card', {
      method: 'PUT', body: JSON.stringify(body),
    }),
  },

  serviceCatalog: {
    list:   () => req<any[]>('/config/service-catalog'),
    upsert: (code: string, body: any) => req<any>(`/admin/service-catalog/${code}`, {
      method: 'PUT', body: JSON.stringify(body),
    }),
  },

  wallet: {
    summary:           () => req<{ pendingTotal: number; pendingCount: number; heldTotal: number; heldCount: number; paidMtdTotal: number; paidMtdCount: number }>('/admin/wallet/summary'),
    pendingPayouts:    () => req<any[]>('/admin/wallet/pending-payouts'),
    heldEarnings:      () => req<any[]>('/admin/wallet/held-earnings'),
    recentWithdrawals: () => req<any[]>('/admin/wallet/recent-withdrawals'),
    releaseHeld:       (id: string) => req<any>(`/admin/wallet/earnings/${id}/release`, { method: 'PATCH' }),

    /**
     * Money SEIRS is holding that belongs to a CUSTOMER, not a rider: a
     * payment still held in escrow against a delivery that was cancelled
     * or failed. The endpoint has existed since the refund-honesty fix
     * and nothing in this dashboard ever called it, so a refund that was
     * owed and never issued was invisible on every screen.
     */
    /**
     * Record what actually reached the bank for a payout made before the
     * ledger existed. The figure is read off Flutterwave by a person and
     * entered, never derived: a guess that reconciles is worse than a gap
     * that does not, because it stops anybody looking.
     */
    reconcilePayout: (body: {
      earningId: string; sentNgn: number; holdbackNgn?: number; flutterwaveTransferId?: string;
    }) => req<{ ok: boolean; earned: number; sent: number; holdback: number }>(
      '/admin/wallet/payouts/reconcile', { method: 'POST', body: JSON.stringify(body) }),

    stuckRefunds: () => req<Array<{
      paymentId: string; amountNgn: number;
      deliveryId: string; trackingCode: string; deliveryStatus: string;
      customerId: string; customerName: string; customerEmail: string | null;
      providerReference: string | null; createdAt: string;
    }>>('/admin/wallet/stuck-refunds'),
  },

  driverCompliance: () => req<{ drivers: Array<{
    id: string; name: string; vehicleType: string | null; rating: number | null;
    isOnline: boolean; offersToday: number; acceptedToday: number;
    todayAcceptanceRate: number | null; lastDeliveryAt: string | null;
  }> }>('/admin/driver-compliance'),

  referrals: {
    list:    () => req<any[]>('/admin/referrals'),
    summary: () => req<{ totalReferrals: number; monthToDate: number }>('/admin/referrals/summary'),
  },

  settings: {
    list:   () => req<any[]>('/admin/settings'),
    update: (key: string, value: string) =>
      req<any>(`/admin/settings/${encodeURIComponent(key)}`, {
        method: 'PATCH', body: JSON.stringify({ value }),
      }),
  },

  // Chat re-open for support investigations. Chats close for writes
  // 1hr after delivery (PII freeze); these endpoints let PII_VIEW_ROLES
  // re-open a window (1-72h, audit-logged) and close it early.
  chatReopen: {
    reopen: (deliveryId: string, body: { hours?: number; reason: string; ticketId?: string }) =>
      req<{ deliveryId: string; chatReopenedUntil: string; hours: number }>(
        `/admin/deliveries/${deliveryId}/reopen-chat`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
    close: (deliveryId: string) =>
      req<{ deliveryId: string; closed: boolean }>(
        `/admin/deliveries/${deliveryId}/close-chat`,
        { method: 'POST' },
      ),
  },

  // Documents hub: deliver an official document (contract, letter,
  // statement, policy) straight into a user's in-app Documents screen.
  documents: {
    send: (userId: string, body: { title: string; category?: string; body?: string; fileUrl?: string }) =>
      req<{ id: string }>(`/documents/admin-send/${userId}`, { method: 'POST', body: JSON.stringify(body) }),
  },

  // Driver payout-bank change review (critical change, 3-business-day
  // SLA). PII-role gated + audit-logged server-side.
  bankChange: {
    resolve: (userId: string, approve: boolean) =>
      req<{ approved: boolean }>(
        `/admin/users/${userId}/bank-change`,
        { method: 'POST', body: JSON.stringify({ approve }) },
      ),
  },

  // Driver vehicle change review (2026-08-10 policy: vehicle swaps need
  // compliance approval). Same pattern as bankChange.
  vehicleChange: {
    /**
     * Every change waiting on a decision.
     *
     * Added 2026-09-01. Only resolve() existed, so an admin could approve a
     * vehicle change but had no way to FIND one: the sole path in was a
     * support ticket whose creation is best-effort and swallows its own
     * failure, leaving the request real and invisible.
     */
    pending: () =>
      req<{ count: number; items: any[] }>('/admin/vehicle-changes'),

    /**
     * `rejectedItems` names WHICH documents failed, by the same slot keys
     * the driver app uses for its upload tiles. The rider is told exactly
     * those and keeps the rest, instead of the old fixed sentence that
     * sent someone with one blurred photo back to redo all five.
     *
     * Both extras are ignored on an approval.
     */
    resolve: (
      userId: string,
      approve: boolean,
      detail?: { note?: string; rejectedItems?: string[] },
    ) =>
      req<{ approved: boolean }>(
        `/admin/users/${userId}/vehicle-change`,
        {
          method: 'POST',
          body: JSON.stringify({
            approve,
            ...(approve ? {} : {
              note:          detail?.note ?? undefined,
              rejectedItems: detail?.rejectedItems ?? undefined,
            }),
          }),
        },
      ),
  },

  // Support toolkit (Chat 5). Rejected server-side if the admin is
  // not super_admin or support_agent.
  support: {
    queue: (params: {
      status?:      'open' | 'awaiting_agent' | 'awaiting_user' | 'resolved' | 'closed';
      topic?:       'billing' | 'driver' | 'account' | 'delivery' | 'other';
      accountType?: string;
      limit?:       number;
    } = {}) => {
      const qs = new URLSearchParams();
      if (params.status)      qs.set('status',      params.status);
      if (params.topic)       qs.set('topic',       params.topic);
      if (params.accountType) qs.set('accountType', params.accountType);
      qs.set('limit', String(params.limit ?? 30));
      return req<any[]>(`/support/queue?${qs.toString()}`);
    },
    thread: (ticketId: string) => req<any>(`/support/tickets/${ticketId}`),
    reply:  (ticketId: string, body: string) =>
      req<any>(`/support/tickets/${ticketId}/agent-reply`, {
        method: 'POST', body: JSON.stringify({ body }),
      }),
    setStatus: (ticketId: string, status: string) =>
      req<any>(`/support/tickets/${ticketId}/status`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      }),
  },

  // Marketing/demo accounts (founder 2026-08-11): one button seeds 3
  // permanent fake accounts (customer/driver/partner store) so
  // screenshots and demos never show real user data.
  demoData: {
    seed: () => req<{
      password: string;
      accounts: Record<'customer' | 'driver' | 'business', { email: string; name: string; accountId: string }>;
      demoDeliveriesCreated: number;
    }>('/admin/demo-data/seed', { method: 'POST' }),
  },

  /**
   * Launch reset (super admin only). Lives on its own /launch-reset
   * controller rather than under /admin, because the one operation that
   * deletes accounts in bulk should not be reachable by fat-fingering a
   * neighbouring admin route.
   *
   * preview() is a read. execute() refuses without the typed phrase AND
   * without the deletable count the preview showed, so a replayed
   * request cannot run against a set nobody reviewed.
   */
  launchReset: {
    preview: () => req<LaunchResetReport>('/launch-reset/preview'),
    execute: (confirm: string, expectedDeletableAccounts: number) =>
      req<LaunchResetReport>('/launch-reset/execute', {
        method: 'POST',
        body: JSON.stringify({ confirm, expectedDeletableAccounts }),
      }),
  },
};

// -- CSV exports ---------------------------------------------------------

export type ExportKey =
  | 'driver-payouts'
  | 'driver-earnings'
  | 'payments'
  | 'deliveries'
  | 'drivers'
  | 'customers'
  | 'support-tickets';

/**
 * Pull one CSV export and hand it to the browser as a download.
 *
 * Not routed through req() above: that helper sets a JSON content type
 * and ends in res.json(), and these responses are a stream of text/csv
 * that can run to megabytes. The body is read as a blob instead.
 *
 * The filename is rebuilt here rather than read from the response's
 * Content-Disposition header. The API sets that header correctly, but
 * CORS hides every non-simple response header from JavaScript unless the
 * server lists it in exposedHeaders, and main.ts does not. Rebuilding it
 * from the same key and range the request carried gives the identical
 * name with no server change.
 */
export async function downloadExportCsv(key: ExportKey, from: string, to: string): Promise<void> {
  const token = getToken();
  touchActivity();

  const qs  = new URLSearchParams({ from, to }).toString();
  const res = await fetch(`${BASE}/admin/exports/${key}?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    // Same session handling as req(): a 30-minute token behind an
    // 8-hour cookie means an idle tab 401s, and silently doing nothing
    // would look like an export with no rows.
    if (res.status === 401 && typeof window !== 'undefined') {
      const { clearSession } = await import('./auth');
      clearSession();
      if (!window.location.pathname.startsWith('/login')) {
        const back = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`/login?reason=expired&from=${back}`);
      }
    }
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message ?? `Export failed (${res.status}).`);
  }

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `seirs-${key}_${from}_to_${to}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
