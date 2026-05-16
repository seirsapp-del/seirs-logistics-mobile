import { getToken, touchActivity } from './auth';

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
    throw new Error((err as any).message ?? 'Request failed');
  }
  return res.json();
}

// Spec V8 §3.6 — sliding 30-min admin session. Backend issues admin
// JWTs with 30m TTL. This helper extends the token while the admin is
// active by calling /auth/refresh. Called from the dashboard layout
// every ~5 minutes; no-op when no admin token is in storage.
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
  login: (email: string, password: string) =>
    req<{ token: string; user: any; requiresTOTP?: boolean; tempToken?: string }>(
      '/auth/admin-login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
    ),

  verifyTOTP: (tempToken: string, code: string) =>
    req<{ token: string; user: any }>(
      '/auth/admin-totp-verify',
      { method: 'POST', body: JSON.stringify({ tempToken, code }) },
    ),

  // Spec V8 — admin password recovery (uses the same shared /auth endpoints
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

  users:      (page = 1, role?: string, search?: string) =>
    req<any>(`/admin/users?page=${page}${role ? `&role=${role}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  user:       (id: string) => req<any>(`/admin/users/${id}`),
  updateUser: (id: string, data: any) =>
    req<any>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  changeRole: (id: string, role: string) =>
    req<any>(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  suspendUser: (id: string) =>
    req<any>(`/admin/users/${id}/suspend`, { method: 'PATCH' }),

  admins: {
    list:          ()                          => req<any[]>('/admin/admins'),
    create:        (data: any)                 => req<any>('/admin/admins', { method: 'POST', body: JSON.stringify(data) }),
    updateRole:    (id: string, adminRole: string) =>
      req<any>(`/admin/admins/${id}/role`, { method: 'PATCH', body: JSON.stringify({ adminRole }) }),
    resetPassword: (id: string)                => req<any>(`/admin/admins/${id}/reset-password`, { method: 'POST' }),
    deactivate:    (id: string)                => req<any>(`/admin/admins/${id}/deactivate`, { method: 'PATCH' }),
    reactivate:    (id: string)                => req<any>(`/admin/admins/${id}/reactivate`, { method: 'PATCH' }),
    setupTOTP:     (id: string)                => req<any>(`/admin/admins/${id}/totp/setup`, { method: 'POST' }),
    confirmTOTP:   (id: string, code: string)  =>
      req<any>(`/admin/admins/${id}/totp/confirm`, { method: 'POST', body: JSON.stringify({ code }) }),
    // Spec V8 — offboarding wizard
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

  // Hybrid-account (Spec V8 2026-05-11) — partner store applications
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
  rejectPartnerStore: (id: string, note: string) =>
    req<any>(`/admin/partner-stores/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ note }),
    }),

  deliveries:     (page = 1, status?: string, search?: string) =>
    req<any>(`/admin/deliveries?page=${page}${status ? `&status=${status}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  delivery:       (id: string) => req<any>(`/admin/deliveries/${id}`),
  cancelDelivery: (id: string) => req<any>(`/admin/deliveries/${id}/cancel`, { method: 'PATCH' }),
  reassignDelivery: (id: string, driverId: string) =>
    req<any>(`/admin/deliveries/${id}/reassign`, { method: 'PATCH', body: JSON.stringify({ driverId }) }),

  pricing: {
    get:    ()           => req<any>('/admin/pricing'),
    update: (data: any)  => req<any>('/admin/pricing', { method: 'PATCH', body: JSON.stringify(data) }),
  },

  // Spec V8 §3.9 — Fee Catalogue (single source of truth for all fees)
  fees: {
    list:    ()                                  => req<any[]>('/admin/fees'),
    grouped: ()                                  => req<Record<string, any[]>>('/admin/fees?grouped=true'),
    get:     (key: string)                       => req<any>(`/admin/fees/${key}`),
    history: (key: string, limit = 50)           => req<any[]>(`/admin/fees/${key}/history?limit=${limit}`),
    update:  (key: string, body: { value?: number; active?: boolean; currentNote?: string }) =>
      req<any>(`/admin/fees/${key}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },

  // Spec V8 §3.10 — chain of custody for disputes view (reuses public
  // identity endpoint; admin can read any delivery's handoff chain).
  identity: {
    handoffChain: (deliveryId: string) => req<any[]>(`/identity/handoff/${deliveryId}/chain`),
  },

  // Spec V8 §3.12 — Interstate trip board.
  interstateTrips: {
    list: (status?: 'active' | 'completed' | 'cancelled') =>
      req<any[]>(`/admin/interstate-trips${status ? `?status=${status}` : ''}`),
  },

  // Spec V8 §3.13 — ops broadcast composer.
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
  },

  // Spec V8 §3.13 — email template catalogue + override layer.
  emailTemplates: {
    list: () => req<Array<{
      key:      string;
      name:     string;
      vars:     string[];
      defaults: { subject: string; bodyHtml: string };
      override: { subject: string; bodyHtml: string; active: boolean; updatedAt: string } | null;
    }>>('/admin/email-templates'),
    update: (key: string, body: { subject?: string; bodyHtml?: string; active?: boolean }) =>
      req<any>(`/admin/email-templates/${key}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },

  // Spec V8 §3.13 — promotions CRUD.
  promotions: {
    list:   (status?: string) => req<any[]>(`/admin/promotions${status ? `?status=${status}` : ''}`),
    create: (body: any)       => req<any>('/admin/promotions', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: any) => req<any>(`/admin/promotions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string)      => req<any>(`/admin/promotions/${id}`, { method: 'DELETE' }),
  },

  // Spec V8 §3.13 — suggestions inbox.
  suggestions: {
    list:   (status?: string) => req<{ items: any[]; total: number; page: number }>(`/admin/suggestions${status ? `?status=${status}` : ''}`),
    update: (id: string, body: { status?: string; adminReply?: string }) =>
      req<any>(`/admin/suggestions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },

  // Spec V8 §3.13 — manual refund (closes A23).
  payments: {
    refund: (deliveryId: string, reason: string) =>
      req<{ ok: true; refundedAtIso: string }>(`/admin/payments/${deliveryId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
  },

  // Spec V8 §3.13 — NDPR admin tools (A32 + A33)
  ndpr: {
    exportUser:      (id: string)                 => req<any>(`/admin/users/${id}/export`),
    hardDeleteUser:  (id: string, reason: string) =>
      req<{ ok: true; archivedAt: string }>(`/admin/users/${id}/hard-delete`, {
        method: 'POST', body: JSON.stringify({ reason }),
      }),
  },

  // Spec V8 §3.13 — duplicate accounts (A21)
  duplicates: {
    list:    (status?: string) => req<any[]>(`/admin/duplicates${status ? `?status=${status}` : ''}`),
    scan:    ()                => req<{ scanned: number; newCandidates: number }>('/admin/duplicates/scan', { method: 'POST' }),
    merge:   (id: string)      => req<any>(`/admin/duplicates/${id}/merge`,   { method: 'POST' }),
    dismiss: (id: string)      => req<any>(`/admin/duplicates/${id}/dismiss`, { method: 'POST' }),
  },

  // Spec V8 §3.13 — external partners directory (A40 + A41)
  externalPartners: {
    list:   (type?: 'insurance' | 'specialist') =>
      req<any[]>(`/admin/external-partners${type ? `?type=${type}` : ''}`),
    create: (body: any)             => req<any>('/admin/external-partners', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: any) => req<any>(`/admin/external-partners/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string)            => req<any>(`/admin/external-partners/${id}`, { method: 'DELETE' }),
  },

  // Spec V8 — public website CMS (articles + FAQ + changelog + page blocks)
  websiteContent: {
    list:   (type?: string, status?: string) => {
      const params = new URLSearchParams();
      if (type)   params.set('type', type);
      if (status) params.set('status', status);
      const qs = params.toString();
      return req<any[]>(`/admin/website/content${qs ? `?${qs}` : ''}`);
    },
    get:    (id: string)             => req<any>(`/admin/website/content/${id}`),
    create: (body: any)              => req<any>('/admin/website/content', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: any)  => req<any>(`/admin/website/content/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string)             => req<any>(`/admin/website/content/${id}`, { method: 'DELETE' }),
  },

  // Direct R2 upload helper for the CMS image picker (re-uses the
  // existing /upload endpoint with folder=cms).
  upload: {
    image: async (file: File): Promise<{ url: string }> => {
      const form = new FormData();
      form.append('file', file);
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
      const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null;
      const r = await fetch(`${base}/upload?folder=cms`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!r.ok) throw new Error(`Upload failed (${r.status})`);
      return r.json();
    },
  },

  // Spec V8 Tier 3 — Developer Platform admin oversight
  devPlatform: {
    listAccounts:    () => req<any[]>('/dev-platform/admin/keys'),  // all keys, all owners
    listAllUsage:    () => req<any>('/dev-platform/usage'),

    // A48 — suspend / resume an entire developer account
    suspendOwner: (ownerUserId: string, reason: string) =>
      req<{ suspended: number }>(`/dev-platform/admin/owners/${ownerUserId}/suspend`, {
        method: 'POST', body: JSON.stringify({ reason }),
      }),
    resumeOwner: (ownerUserId: string) =>
      req<{ resumed: number }>(`/dev-platform/admin/owners/${ownerUserId}/resume`, { method: 'POST' }),

    // A49 — set per-key rate-limit override (null = revert to default)
    setKeyRateLimit: (keyId: string, limitPerMin: number | null) =>
      req<{ keyId: string; rateLimitOverridePerMin: number | null }>(
        `/dev-platform/admin/keys/${keyId}/rate-limit`,
        { method: 'PATCH', body: JSON.stringify({ limitPerMin }) },
      ),
  },

  // Spec V8 — dynamic role management
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

  analytics: {
    revenue:              (days = 30) => req<any>(`/admin/analytics/revenue?days=${days}`),
    deliveriesByStatus:   ()          => req<any>('/admin/analytics/deliveries-by-status'),
    topDrivers:           (limit = 10) => req<any>(`/admin/analytics/top-drivers?limit=${limit}`),
    heatmap:              ()          => req<any>('/admin/analytics/heatmap'),
    deliveriesByVehicle:  ()          => req<any>('/admin/analytics/deliveries-by-vehicle'),
    deliveriesByCategory: ()          => req<any>('/admin/analytics/deliveries-by-category'),
    driverHours:          (days = 30, limit = 10) =>
      req<any>(`/admin/analytics/driver-hours?days=${days}&limit=${limit}`),
    referralFunnel:       ()          => req<any>('/admin/analytics/referral-funnel'),
  },

  fraud: {
    list:    (page = 1, status?: string) =>
      req<any>(`/admin/fraud?page=${page}${status ? `&status=${status}` : ''}`),
    resolve: (id: string, status: string) =>
      req<any>(`/admin/fraud/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  },

  cms: {
    list:    (type?: string, status?: string) =>
      req<any>(`/admin/cms?${type ? `type=${type}&` : ''}${status ? `status=${status}` : ''}`),
    create:  (data: any) => req<any>('/admin/cms', { method: 'POST', body: JSON.stringify(data) }),
    update:  (id: string, data: any) =>
      req<any>(`/admin/cms/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    approve: (id: string) => req<any>(`/admin/cms/${id}/approve`, { method: 'PATCH' }),
    publish: (id: string) => req<any>(`/admin/cms/${id}/publish`, { method: 'PATCH' }),
    delete:  (id: string) => req<any>(`/admin/cms/${id}`, { method: 'DELETE' }),
  },

  tickets: {
    list:    (page = 1, status?: string, priority?: string) =>
      req<any>(`/admin/tickets?page=${page}${status ? `&status=${status}` : ''}${priority ? `&priority=${priority}` : ''}`),
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
  },

  // Pricing system — admin reads + writes the active RateCard and the
  // ServiceCategory catalog. /config/* endpoints are public so apps can
  // fetch on boot; /admin/* endpoints are auth'd for publishing changes.
  rateCard: {
    getActive: () => req<any>('/config/rate-card'),
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
  },

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
};
