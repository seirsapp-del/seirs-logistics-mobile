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

type ThemeName = 'light' | 'dark';

interface ThemeContextValue {
  theme:       ThemeName;
  isDark:      boolean;
  colors:      typeof Colors.light;
  toggleTheme: () => void;
  setTheme:    (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme:       'light',
  isDark:      false,
  colors:      Colors.light,
  toggleTheme: () => {},
  setTheme:    () => {},
});

const STORAGE_KEY = 'seirs_business_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemScheme();
  const [theme, setThemeState] = useState<ThemeName>(systemScheme ?? 'light');
  const [loaded, setLoaded] = useState(false);

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

  const setTheme = async (next: ThemeName) => {
    setThemeState(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

  // Memoise so screens don't re-render when unrelated state changes.
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark: theme === 'dark',
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
export const useColors = () => useContext(ThemeContext).colors;
