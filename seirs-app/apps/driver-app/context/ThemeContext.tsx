import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as useSystemScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme:       Theme;
  isDark:      boolean;
  toggleTheme: () => void;
  followSystem: boolean;
  setFollowSystem: (v: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme:        'light',
  isDark:       false,
  toggleTheme:  () => {},
  followSystem: true,
  setFollowSystem: () => {},
});

const STORAGE_KEY = 'seirs_driver_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemScheme();
  const [theme,        setThemeState]  = useState<Theme>(systemScheme ?? 'light');
  const [followSystem, setFollowSystem] = useState(true);
  const [loaded,       setLoaded]      = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') {
        setThemeState(stored);
        setFollowSystem(false);
      } else {
        setThemeState(systemScheme ?? 'light');
        setFollowSystem(true);
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (followSystem && systemScheme) setThemeState(systemScheme);
  }, [systemScheme, followSystem]);

  const toggleTheme = async () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setThemeState(next);
    setFollowSystem(false);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const updateFollowSystem = async (v: boolean) => {
    setFollowSystem(v);
    if (v) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setThemeState(systemScheme ?? 'light');
    } else {
      await AsyncStorage.setItem(STORAGE_KEY, theme);
    }
  };

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{
      theme,
      isDark:       theme === 'dark',
      toggleTheme,
      followSystem,
      setFollowSystem: updateFollowSystem,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
