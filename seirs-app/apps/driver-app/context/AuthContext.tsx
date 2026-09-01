import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { setSessionExpiredHandler, usersApi } from '@/services/api';
import { clearPushRegistration } from '@seirs/shared/hooks/usePushRegistration';

export type UserRole = 'customer' | 'driver' | null;

interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  accountId?: string;
  profilePhoto?: string;
  token: string;
}

interface AuthContextType {
  user: AuthUser | null;
  role: UserRole;
  isLoading: boolean;
  isAuthenticated: boolean;
  login:   (user: AuthUser, remember?: boolean) => Promise<void>;
  logout:  () => Promise<void>;
  // Re-fetch the current user profile from the API. Call after edit-
  // profile / change-password / any flow that mutates user fields.
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  isLoading: true,
  isAuthenticated: false,
  login:   async () => {},
  logout:  async () => {},
  refresh: async () => {},
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
    setSessionExpiredHandler(() => {
      setUser(null);
      router.replace('/(auth)/login' as any);
    });
  }, []);

  /**
   * Sign in.
   *
   * `remember` defaults to TRUE so every existing caller keeps the old
   * behaviour. Only an explicit `false` opts out, and then the session lives
   * in memory alone: nothing is written, so the next launch starts signed
   * out. Until 2026-09-01 the checkbox on the customer login was inert, and
   * this is what makes it mean something.
   */
  const login = async (authUser: AuthUser, remember = true) => {
    if (remember) {
      await AsyncStorage.setItem('seirs_user', JSON.stringify(authUser));
    } else {
      // Clear any session a previous "remember" left behind, or unticking
      // the box would silently keep the old one alive.
      await AsyncStorage.removeItem('seirs_user');
    }
    setUser(authUser);
  };

  const logout = async () => {
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
      /* non-fatal */
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role ?? null,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
