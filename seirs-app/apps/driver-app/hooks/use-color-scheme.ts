import { useTheme } from '@/context/ThemeContext';

/**
 * Custom hook that returns the active color scheme.
 * Respects the user's manual toggle via ThemeContext, falling back to system.
 * Drop-in replacement for react-native's useColorScheme.
 */
export function useColorScheme(): 'light' | 'dark' {
  return useTheme().theme;
}
