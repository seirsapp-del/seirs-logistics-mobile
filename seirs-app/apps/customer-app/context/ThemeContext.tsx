import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as useSystemScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerColorSchemeResolver } from '@seirs/shared/hooks/use-color-scheme';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme:       Theme;
  isDark:      boolean;
  toggleTheme: () => void;
  /** Set a specific mode. Business had this; these two only had a flip. */
  setTheme: (mode: Theme) => void;
  followSystem: boolean;
  setFollowSystem: (v: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme:        'light',
  isDark:       false,
  toggleTheme:  () => {},
  setTheme:     () => {},
  followSystem: true,
  setFollowSystem: () => {},
});

const STORAGE_KEY = 'seirs_customer_theme';

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

  // Track system changes when followSystem is on
  useEffect(() => {
    if (followSystem && systemScheme) setThemeState(systemScheme);
  }, [systemScheme, followSystem]);

  const toggleTheme = async () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setThemeState(next);
    setFollowSystem(false);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  };

  /**
   * Pick a mode outright. Writing the key is what pins it: an absent key
   * means "follow the phone", which is exactly what updateFollowSystem
   * relies on below.
   */
  const setTheme = async (mode: Theme) => {
    setThemeState(mode);
    setFollowSystem(false);
    await AsyncStorage.setItem(STORAGE_KEY, mode);
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
      setTheme,
      followSystem,
      setFollowSystem: updateFollowSystem,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

/**
 * Point shared components (Card, Avatar, Button...) at this context.
 *
 * Without it they read the OS theme directly and ignore the in-app
 * toggle, so a phone in dark mode with the app set to light rendered
 * dark Cards on light screens. Registered at module load, before the
 * first render, so hook order stays stable.
 */
registerColorSchemeResolver(() => useContext(ThemeContext).theme);
