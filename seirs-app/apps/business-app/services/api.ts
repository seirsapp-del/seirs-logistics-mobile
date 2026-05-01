import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '@/constants/config';

let BASE = API_BASE;

export function configureApi(base: string) { BASE = base; }

async function getToken(): Promise<string | null> {
  const stored = await AsyncStorage.getItem('seirs_business_user');
  if (!stored) return null;
  return JSON.parse(stored)?.token ?? null;
}

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = await getToken();
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

// ── Auth ────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    req<{ token: string; user: any }>('/auth/business-login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),
  register: (data: {
    accountType: 'sender' | 'partner';
    email: string; password: string; name: string; phone: string;
    companyName?: string; rcNumber?: string; businessAddress?: string;
    storeName?: string; storeAddress?: string; capacity?: number;
  }) =>
    req<{ requiresOtp: boolean; email: string }>('/auth/business-register', {
      method: 'POST', body: JSON.stringify(data),
    }),
  verifyOtp: (email: string, otp: string) =>
    req<{ token: string; user: any }>('/auth/business-verify-otp', {
      method: 'POST', body: JSON.stringify({ email, otp }),
    }),
  resendOtp: (email: string) =>
    req<{ message: string }>('/auth/resend-otp', {
      method: 'POST', body: JSON.stringify({ email }),
    }),
};

// ── Business Sender ─────────────────────────────────────────────────────────

export const businessApi = {
  dashboard: () => req<any>('/business/dashboard'),

  deliveries: (page = 1, status?: string, search?: string) =>
    req<any>(`/business/deliveries?page=${page}${status ? `&status=${status}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`),

  delivery: (id: string) => req<any>(`/business/deliveries/${id}`),

  createDelivery: (data: any) =>
    req<any>('/business/deliveries', { method: 'POST', body: JSON.stringify(data) }),

  uploadCsv: async (uri: string, fileName: string) => {
    const token = await getToken();
    const formData = new FormData();
    formData.append('file', { uri, name: fileName, type: 'text/csv' } as any);
    const res = await fetch(`${BASE}/business/deliveries/csv`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).message ?? 'Upload failed');
    }
    return res.json();
  },

  wallet: () => req<any>('/business/wallet'),

  fundWallet: (amount: number) =>
    req<any>('/business/wallet/fund', { method: 'POST', body: JSON.stringify({ amount }) }),

  transactions: (page = 1) => req<any>(`/business/wallet/transactions?page=${page}`),

  team: () => req<any>('/business/team'),

  inviteTeamMember: (data: { email: string; name: string; teamRole: string }) =>
    req<any>('/business/team/invite', { method: 'POST', body: JSON.stringify(data) }),

  removeTeamMember: (memberId: string) =>
    req<any>(`/business/team/${memberId}`, { method: 'DELETE' }),

  loyalty: () => req<any>('/business/loyalty'),

  specialists: () => req<any>('/business/specialists'),
};

// ── Partner Store ───────────────────────────────────────────────────────────

export const partnerApi = {
  dashboard: () => req<any>('/partner/dashboard'),

  inventory: (status?: string, page = 1) =>
    req<any>(`/partner/inventory?page=${page}${status ? `&status=${status}` : ''}`),

  scanPackage: (qrCode: string) =>
    req<any>('/partner/scan', { method: 'POST', body: JSON.stringify({ qrCode }) }),

  markCollected: (packageId: string) =>
    req<any>(`/partner/packages/${packageId}/collect`, { method: 'PATCH' }),

  earnings: (period: 'week' | 'month') =>
    req<any>(`/partner/earnings?period=${period}`),

  payouts: (page = 1) => req<any>(`/partner/payouts?page=${page}`),

  getSettings: () => req<any>('/partner/settings'),

  updateSettings: (data: any) =>
    req<any>('/partner/settings', { method: 'PATCH', body: JSON.stringify(data) }),
};
