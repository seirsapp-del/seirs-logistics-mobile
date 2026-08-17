/**
 * Business-app theme provider.
 *
 * Wraps the shared SEIRS Colors palette (defined in @seirs/shared/theme)
 * with a small React context that:
 *   1. Tracks user preference (light / dark) persisted to AsyncStorage
 *   2. Falls back to system color scheme when no preference is saved
 *   3. Exposes `colors` so screens can swap palettes per-render
 *
 * Usage:
 *   const { colors, isDark, toggleTheme } = useTheme();
 *   <View style={[styles.card, { backgroundColor: colors.surface }]} />
 *
 * Or just colors:
 *   const colors = useColors();
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme as useSystemScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@seirs/shared/theme';
import { registerColorSchemeResolver } from '@seirs/shared/hooks/use-color-scheme';

type ThemeName = 'light' | 'dark';

interface ThemeContextValue {
  theme:       ThemeName;
  isDark:      boolean;
  colors:      typeof Colors.light;
  toggleTheme: () => void;
  /** Clear a pinned choice and follow the phone again. */
  useSystemTheme: () => Promise<void>;
  setTheme:    (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme:       'light',
  isDark:      false,
  colors:      Colors.light,
  toggleTheme: () => {},
  useSystemTheme: async () => {},
  setTheme:    () => {},
});

const STORAGE_KEY = 'seirs_business_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemScheme();
  const [theme, setThemeState] = useState<ThemeName>(systemScheme ?? 'light');
  const [loaded, setLoaded] = useState(false);

  /**
   * A stored choice wins, otherwise follow the phone.
   *
   * The stored value used to be permanent with nothing in the UI to
   * change it: an older build had a toggle, so an account could be
   * pinned to light for good and the app ignored a phone in dark mode
   * (found on device 2026-08-17, system night mode on and every screen
   * rendering light). 'system' is now a real stored value, and it is the
   * default, so the app tracks the phone unless the user says otherwise.
   */
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') {
        setThemeState(stored);
      } else {
        setThemeState(systemScheme ?? 'light');
      }
      setLoaded(true);
    });
  }, []);

  // Keep following the phone while no explicit choice is stored.
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored !== 'light' && stored !== 'dark') {
        setThemeState(systemScheme ?? 'light');
      }
    });
  }, [systemScheme, loaded]);

  const setTheme = async (next: ThemeName) => {
    setThemeState(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

  /** Drop any pinned choice and go back to following the phone. */
  const useSystemTheme = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setThemeState(systemScheme ?? 'light');
  };

  // Memoise so screens don't re-render when unrelated state changes.
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark: theme === 'dark',
      useSystemTheme,
      colors: theme === 'dark' ? Colors.dark : Colors.light,
      toggleTheme,
      setTheme,
    }),
    [theme],
  );

  // Block render until AsyncStorage check completes so the very first
  // paint doesn't flash light → dark.
  if (!loaded) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme  = () => useContext(ThemeContext);

/**
 * Point shared components at this context. Without it they read the OS
 * theme and ignore the in-app toggle, rendering dark Cards on light
 * screens (2026-08-13).
 */
registerColorSchemeResolver(() => useContext(ThemeContext).theme);
export const useColors = () => useContext(ThemeContext).colors;
