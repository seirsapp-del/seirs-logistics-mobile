import { getToken } from './auth';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
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
  login:    (email: string, password: string) =>
    req<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  stats:    () => req<any>('/admin/stats'),

  users:      (page = 1, role?: string) =>
    req<any>(`/admin/users?page=${page}${role ? `&role=${role}` : ''}`),

  user:       (id: string) => req<any>(`/admin/users/${id}`),

  updateUser: (id: string, data: any) =>
    req<any>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  changeRole: (id: string, role: string) =>
    req<any>(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),

  admins: {
    list:   ()     => req<any[]>('/admin/admins'),
    create: (data: { name: string; email: string; phone: string; password: string }) =>
      req<any>('/admin/admins', { method: 'POST', body: JSON.stringify(data) }),
  },

  drivers:    (page = 1, status?: string) =>
    req<any>(`/admin/drivers?page=${page}${status ? `&status=${status}` : ''}`),

  driver:     (id: string) => req<any>(`/admin/drivers/${id}`),

  approveDriver: (id: string) =>
    req<any>(`/admin/drivers/${id}/approve`, { method: 'PATCH' }),

  suspendDriver: (id: string) =>
    req<any>(`/admin/drivers/${id}/suspend`, { method: 'PATCH' }),

  deliveries: (page = 1, status?: string) =>
    req<any>(`/admin/deliveries?page=${page}${status ? `&status=${status}` : ''}`),

  delivery:   (id: string) => req<any>(`/admin/deliveries/${id}`),

  cancelDelivery: (id: string) =>
    req<any>(`/admin/deliveries/${id}/cancel`, { method: 'PATCH' }),

  pricing: {
    get:    ()           => req<any>('/admin/pricing'),
    update: (data: any)  => req<any>('/admin/pricing', { method: 'PATCH', body: JSON.stringify(data) }),
  },

  analytics: {
    revenue:           (days = 30) => req<any>(`/admin/analytics/revenue?days=${days}`),
    deliveriesByStatus: ()         => req<any>('/admin/analytics/deliveries-by-status'),
    topDrivers:        (limit = 10) => req<any>(`/admin/analytics/top-drivers?limit=${limit}`),
    heatmap:           ()          => req<any>('/admin/analytics/heatmap'),
  },

  fraud: {
    list:    (page = 1, status?: string) =>
      req<any>(`/admin/fraud?page=${page}${status ? `&status=${status}` : ''}`),
    resolve: (id: string, status: string) =>
      req<any>(`/admin/fraud/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  },
};
