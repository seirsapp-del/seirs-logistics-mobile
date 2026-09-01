import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { clearPushRegistration } from '@seirs/shared/hooks/usePushRegistration';
import { setSessionExpiredHandler, usersApi } from '@/services/api';

export type BusinessRole = 'sender' | 'partner' | null;

export interface AuthUser {
  id:           string;
  name:         string;
  email:        string;
  phone:        string;
  role:         string;
  businessRole: BusinessRole;
  // Hybrid-account capabilities (Spec V8 2026-05-11). The backend writes
  // these on every /auth/me + login response. canSend = instant on signup;
  // canPartner only flips true after admin approves the partner-store KYC.
  capabilities?: { canSend: boolean; canPartner: boolean };
  accountId:    string;
  companyName?: string;
  storeName?:   string;
  profilePhoto?: string;
  // The PartnerStore row's id, populated server-side when canPartner=true.
  // Used by partner-mode screens (storage, capacity, settings) that hit
  // /partner-store/store/:id endpoints. Undefined for pure Sender accounts.
  partnerStoreId?: string;
  token:        string;
}

interface AuthContextType {
  user:            AuthUser | null;
  businessRole:    BusinessRole;
  isLoading:       boolean;
  isAuthenticated: boolean;
  login:           (user: AuthUser, remember?: boolean) => Promise<void>;
  logout:          () => Promise<void>;
  // Re-pull /users/me and merge into the stored session. Without this the
  // login-time snapshot never updates: partner approval, company edits and
  // photo changes stayed invisible until a full re-login (found 2026-08-16
  // when an approved partner still saw "Apply to be a Partner Store").
  refresh:         () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user:            null,
  businessRole:    null,
  isLoading:       true,
  isAuthenticated: false,
  login:           async () => {},
  logout:          async () => {},
  refresh:         async () => {},
});

const STORAGE_KEY = 'seirs_business_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => { if (stored) setUser(JSON.parse(stored)); })
      .finally(() => setIsLoading(false));
  }, []);

  // Register the 401 handler. Both sibling apps did this and business never
  // did (B-10.1): the shared client cleared the token, called a null handler
  // and threw, while isAuthenticated stayed true off the in-memory user. The
  // sender was left inside a fully rendered but EMPTY app (zeroed dashboard,
  // "No deliveries found", 0 points) with every screen's catch swallowing the
  // error, and only a force-quit got them out. Clear the session and send
  // them to login, exactly as logout() does.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      setUser(null);
      router.replace('/(auth)/login' as any);
    });
  }, []);

  const refresh = async () => {
    try {
      const me: any = await usersApi.me();
      if (!me?.id) return;
      setUser((prev) => {
        if (!prev) return prev;
        const merged = { ...prev, ...me, token: prev.token };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged)).catch(() => {});
        return merged;
      });
    } catch { /* offline: the stored snapshot stands */ }
  };

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
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    } else {
      // Clear any session a previous "remember" left behind, or unticking
      // the box would silently keep the old one alive.
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
    setUser(authUser);
  };

  const logout = async () => {
    clearPushRegistration();
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUser(null);
    router.replace('/(auth)/login' as any);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        businessRole: user?.businessRole ?? null,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
