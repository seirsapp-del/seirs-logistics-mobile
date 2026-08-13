import { useColorScheme as useSystemColorScheme } from 'react-native';

/**
 * Theme resolution for SHARED components.
 *
 * This used to be `export { useColorScheme } from 'react-native'`, which
 * reads the operating system setting and knows nothing about the app's
 * own theme toggle. Screens resolve their theme through each app's
 * ThemeContext, so the two disagreed whenever the user's choice differed
 * from the OS: a phone in dark mode with the app set to light rendered
 * light screens with dark Cards, Avatars and Buttons sitting on them.
 *
 * That is what the founder hit on trip details (2026-08-13): "the light
 * mode shows a dark colour... the route and what you paid have the dark
 * in it during light mode". It was never a trip-details bug. It affected
 * every shared component in all three apps, and only showed up where a
 * screen put shared components on an app-themed background.
 *
 * shared/ cannot import from apps/, so each app registers its resolver
 * at startup and shared components then agree with their screens by
 * construction. Registration happens once at module load, before the
 * first render, so the hook call order stays stable.
 */
export type ColorSchemeResolver = () => 'light' | 'dark';

const systemResolver: ColorSchemeResolver = () => {
  const scheme = useSystemColorScheme();
  return scheme === 'dark' ? 'dark' : 'light';
};

let activeResolver: ColorSchemeResolver = systemResolver;

/**
 * Point shared components at the app's own theme source. Call once from
 * the app's ThemeProvider module, at import time.
 */
export function registerColorSchemeResolver(resolver: ColorSchemeResolver): void {
  activeResolver = resolver;
}

export function useColorScheme(): 'light' | 'dark' {
  return activeResolver();
}
