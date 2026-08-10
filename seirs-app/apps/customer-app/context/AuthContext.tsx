import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { setSessionExpiredHandler, usersApi } from '@/services/api';
import { clearPushRegistration } from '@seirs/shared/hooks/usePushRegistration';

export type UserRole = 'customer' | 'driver' | null;

export interface PendingDeletion {
  requestedAt: string | null;
  scheduledAt: string;
  requestedBy: string;
}

interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  accountId?: string;
  profilePhoto?: string;
  token: string;
  pendingDeletion?: PendingDeletion | null;
}

interface AuthContextType {
  user: AuthUser | null;
  role: UserRole;
  isLoading: boolean;
  isAuthenticated: boolean;
  pendingDeletion: PendingDeletion | null;
  login: (user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  // Re-fetch the current user profile from the API. Call this after edit-
  // profile / change-password / any flow that mutates user fields so the
  // in-memory copy stays in sync without forcing a logout.
  refresh: () => Promise<void>;
  // Cancel a pending self-scheduled deletion. Clears the pendingDeletion
  // banner state and hits POST /users/me/cancel-deletion.
  cancelPendingDeletion: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  isLoading: true,
  isAuthenticated: false,
  pendingDeletion: null,
  login:   async () => {},
  logout:  async () => {},
  refresh: async () => {},
  cancelPendingDeletion: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    AsyncStorage.getItem('seirs_user')
      .then((stored) => { if (stored) setUser(JSON.parse(stored)); })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    // Register 401 handler - auto-logout when JWT expires
    setSessionExpiredHandler(() => {
      setUser(null);
      router.replace('/(auth)/login' as any);
    });
  }, []);

  const login = async (authUser: AuthUser) => {
    await AsyncStorage.setItem('seirs_user', JSON.stringify(authUser));
    setUser(authUser);
  };

  const logout = async () => {
    // Best-effort: tell the backend to forget this device's push token
    // so old sessions on this phone stop receiving the user's pushes.
    clearPushRegistration();
    await AsyncStorage.removeItem('seirs_user');
    setUser(null);
  };

  const refresh = async () => {
    if (!user?.token) return;
    try {
      const fresh = await usersApi.me();
      const merged: AuthUser = {
        ...user,
        name:         fresh.name         ?? user.name,
        phone:        fresh.phone        ?? user.phone,
        email:        fresh.email        ?? user.email,
        accountId:    fresh.accountId    ?? user.accountId,
        profilePhoto: fresh.profilePhoto ?? user.profilePhoto,
      };
      await AsyncStorage.setItem('seirs_user', JSON.stringify(merged));
      setUser(merged);
    } catch {
      /* non-fatal - caller already showed success toast */
    }
  };

  const cancelPendingDeletion = async () => {
    if (!user?.token) return;
    await usersApi.cancelDeletion();
    // Clear the banner state locally so the UI reflects the cancellation
    // immediately without requiring a re-login.
    const cleared: AuthUser = { ...user, pendingDeletion: null };
    await AsyncStorage.setItem('seirs_user', JSON.stringify(cleared));
    setUser(cleared);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role ?? null,
        isLoading,
        isAuthenticated: !!user,
        pendingDeletion: user?.pendingDeletion ?? null,
        login,
        logout,
        refresh,
        cancelPendingDeletion,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
