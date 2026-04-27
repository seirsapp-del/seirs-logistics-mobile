import { Platform } from 'react-native';

// ─── Pantone 2026 Color of the Year ──────────────────────────────────────────
// "Cloud Dancer" — soft airy white, tranquility + clarity
// Used as: light mode background AND dark mode text (creates mode coherence)
export const CLOUD_DANCER = '#F5F0EB';

// ─── Seirs Brand Palette ──────────────────────────────────────────────────────
export const Palette = {
  // Primary — Seirs Orange (action, energy, speed)
  orange50:  '#FFF3EE',
  orange100: '#FFE0D0',
  orange200: '#FFBFA0',
  orange300: '#FF9A6C',
  orange400: '#FF7A40',
  orange500: '#F4600C', // ← Primary brand color
  orange600: '#D95209',
  orange700: '#B84208',
  orange800: '#8F3206',
  orange900: '#5C1F03',

  // Navy — Seirs Dark (trust, professionalism, depth)
  navy50:  '#EEF2F7',
  navy100: '#D0DAE8',
  navy200: '#A3B8D4',
  navy300: '#7596BF',
  navy400: '#4A74AB',
  navy500: '#2C5282',
  navy600: '#1E3A5F',
  navy700: '#162D4A',
  navy800: '#0D1B2A', // ← Primary dark color
  navy900: '#060D14',

  // True Black scale (Stealth Premium dark mode)
  black:   '#000000',
  ink900:  '#0A0A0A', // dark mode background
  ink800:  '#111111',
  ink700:  '#141414', // dark mode surface
  ink600:  '#1A1A1A',
  ink500:  '#1E1E1E', // dark mode surface2
  ink400:  '#242424',
  ink300:  '#2A2A2A', // dark mode border
  ink200:  '#333333',
  ink100:  '#444444',

  // Pantone Cloud Dancer scale
  cloud50:  '#FDFCFB',
  cloud100: '#FAF7F4',
  cloud200: '#F5F0EB', // ← Cloud Dancer (Pantone 2026)
  cloud300: '#EDE4D9',
  cloud400: '#E0D4C4',
  cloud500: '#C8BAA6',

  // Neutrals
  white:   '#FFFFFF',
  gray50:  '#FAFAFA',
  gray100: '#F4F4F5',
  gray200: '#E4E4E7',
  gray300: '#D1D1D6',
  gray400: '#A1A1AA',
  gray500: '#71717A',
  gray600: '#52525B',
  gray700: '#3F3F46',
  gray800: '#27272A',
  gray900: '#18181B',

  // Semantic — vibrant for both modes
  success:  '#22C55E',
  warning:  '#FFBE0B',
  error:    '#EF4444',
  info:     '#00C2FF',

  // Teal accent (from Mockup 1 palette)
  teal:    '#2EC4B6',

  // Delivery status
  assigned:  '#00C2FF',
  pickedUp:  '#F4600C',
  inTransit: '#A855F7',
  delivered: '#22C55E',
  failed:    '#EF4444',
  cancelled: '#71717A',
};

// ─── App Theme ────────────────────────────────────────────────────────────────
export const Colors = {
  light: {
    // Core identity
    primary:       Palette.orange500,
    primaryDark:   Palette.orange700,
    primaryLight:  Palette.orange100,
    secondary:     Palette.navy800,

    // Surfaces — Cloud Dancer as the base
    background:    CLOUD_DANCER,       // #F5F0EB — Pantone 2026
    surface:       Palette.white,
    surfaceSecond: Palette.cloud100,   // #FAF7F4
    surfaceThird:  Palette.cloud300,   // #EDE4D9

    // Typography
    text:          Palette.navy800,    // deep navy on Cloud Dancer
    textSecond:    Palette.gray500,
    textThird:     Palette.gray400,
    textInverted:  Palette.white,
    textOnPrimary: Palette.white,

    // Structure
    border:        Palette.cloud400,   // #E0D4C4 — warm border
    divider:       Palette.cloud300,

    // Navigation
    tint:            Palette.orange500,
    tabIconDefault:  Palette.gray400,
    tabIconSelected: Palette.orange500,
    navBackground:   Palette.white,

    // Cards — wallet uses navy on Cloud Dancer
    walletCard:    Palette.navy800,
    walletCardEnd: Palette.navy600,

    // Overlays
    shadow:  Palette.black,
    overlay: 'rgba(13, 27, 42, 0.5)',

    // Semantic
    success:  Palette.success,
    warning:  Palette.warning,
    error:    Palette.error,
    info:     Palette.info,
    teal:     Palette.teal,

    // Status
    statusAssigned:  Palette.assigned,
    statusPickedUp:  Palette.pickedUp,
    statusInTransit: Palette.inTransit,
    statusDelivered: Palette.delivered,
    statusFailed:    Palette.failed,
    statusCancelled: Palette.cancelled,

    icon: Palette.gray500,
  },

  dark: {
    // Core identity
    primary:       Palette.orange500,
    primaryDark:   Palette.orange700,
    primaryLight:  Palette.orange900,
    secondary:     CLOUD_DANCER,       // Cloud Dancer becomes accent on black

    // Surfaces — Stealth Premium true blacks
    background:    Palette.ink900,     // #0A0A0A
    surface:       Palette.ink700,     // #141414
    surfaceSecond: Palette.ink500,     // #1E1E1E
    surfaceThird:  Palette.ink400,     // #242424

    // Typography — Cloud Dancer on black
    text:          CLOUD_DANCER,       // #F5F0EB — warm white on black
    textSecond:    Palette.gray400,    // #A1A1AA
    textThird:     Palette.gray500,
    textInverted:  Palette.navy800,
    textOnPrimary: Palette.white,

    // Structure
    border:        Palette.ink300,     // #2A2A2A
    divider:       Palette.ink400,

    // Navigation
    tint:            Palette.orange500,
    tabIconDefault:  Palette.gray500,
    tabIconSelected: Palette.orange500,
    navBackground:   Palette.ink900,

    // Cards — wallet uses orange gradient on black
    walletCard:    Palette.orange500,
    walletCardEnd: Palette.orange800,

    // Overlays
    shadow:  Palette.black,
    overlay: 'rgba(0, 0, 0, 0.75)',

    // Semantic
    success:  Palette.success,
    warning:  Palette.warning,
    error:    Palette.error,
    info:     Palette.info,
    teal:     Palette.teal,

    // Status
    statusAssigned:  Palette.assigned,
    statusPickedUp:  Palette.pickedUp,
    statusInTransit: Palette.inTransit,
    statusDelivered: Palette.delivered,
    statusFailed:    Palette.failed,
    statusCancelled: Palette.cancelled,

    icon: Palette.gray400,
  },
};

// ─── Spacing Scale ────────────────────────────────────────────────────────────
export const Spacing = {
  xs:    4,
  sm:    8,
  md:    16,
  lg:    24,
  xl:    32,
  xxl:   48,
  '3xl': 64,
};

// ─── Border Radius ────────────────────────────────────────────────────────────
export const Radius = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   20,
  xl:   28,
  xxl:  36,
  full: 9999,
};

// ─── Typography ───────────────────────────────────────────────────────────────
export const FontSize = {
  xs:    11,
  sm:    13,
  base:  15,
  md:    17,
  lg:    20,
  xl:    24,
  '2xl': 28,
  '3xl': 34,
  '4xl': 42,
};

export const FontWeight = {
  regular:  '400' as const,
  medium:   '500' as const,
  semibold: '600' as const,
  bold:     '700' as const,
  black:    '900' as const,
};

export const Fonts = Platform.select({
  ios: {
    sans:    'SF Pro Display',
    rounded: 'SF Pro Rounded',
    mono:    'SF Mono',
  },
  default: {
    sans:    'normal',
    rounded: 'normal',
    mono:    'monospace',
  },
  web: {
    sans:    "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    rounded: "'SF Pro Rounded', sans-serif",
    mono:    "SFMono-Regular, Menlo, Consolas, monospace",
  },
});

// ─── Shadows ─────────────────────────────────────────────────────────────────
export const Shadows = {
  xs: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 5,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 8,
  },
  orange: {
    shadowColor: '#F4600C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 12,
    elevation: 6,
  },
};

// ─── Quick Action Colors ───────────────────────────────────────────────────────
export const ActionColors = {
  request:  { bg: '#FFF0E8', icon: Palette.orange500, dark: { bg: '#2A1608', icon: Palette.orange400 } },
  send:     { bg: '#E8F0FF', icon: '#3A86FF',         dark: { bg: '#0A1628', icon: '#5A9FFF' } },
  track:    { bg: '#E8FAF8', icon: Palette.teal,      dark: { bg: '#082420', icon: '#3DDDD0' } },
  history:  { bg: '#FFFAE8', icon: Palette.warning,   dark: { bg: '#281E04', icon: '#FFD040' } },
};
