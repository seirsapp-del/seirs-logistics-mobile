import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { clearPushRegistration } from '@seirs/shared/hooks/usePushRegistration';

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
  token:        string;
}

interface AuthContextType {
  user:            AuthUser | null;
  businessRole:    BusinessRole;
  isLoading:       boolean;
  isAuthenticated: boolean;
  login:           (user: AuthUser) => Promise<void>;
  logout:          () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user:            null,
  businessRole:    null,
  isLoading:       true,
  isAuthenticated: false,
  login:           async () => {},
  logout:          async () => {},
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

  const login = async (authUser: AuthUser) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
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
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
