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
  },

  drivers:       (page = 1, status?: string, search?: string) =>
    req<any>(`/admin/drivers?page=${page}${status ? `&status=${status}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  driver:        (id: string) => req<any>(`/admin/drivers/${id}`),
  approveDriver: (id: string) => req<any>(`/admin/drivers/${id}/approve`, { method: 'PATCH' }),
  rejectDriver:  (id: string, reason?: string) =>
    req<any>(`/admin/drivers/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ reason }) }),
  suspendDriver: (id: string) => req<any>(`/admin/drivers/${id}/suspend`, { method: 'PATCH' }),

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

  // Spec V8 Tier 3 — Developer Platform admin oversight
  devPlatform: {
    listAccounts: () => req<any[]>('/dev-platform/keys'), // simplistic: each key = an account in this view
    listAllUsage: () => req<any>('/dev-platform/usage'),
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
};
