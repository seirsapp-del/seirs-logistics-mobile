import { Platform } from 'react-native';

// ─── Seirs Brand Palette — V7 (Navy + Sky Blue) ──────────────────────────────
export const Palette = {
  // Deep Navy — light mode primary brand
  navy900: '#0A1E36',
  navy800: '#0F2B4C', // ← Light mode primary brand
  navy700: '#1A3A63',
  navy600: '#1E4A80',
  navy500: '#235A9C',

  // Sky Blue — accent / CTA
  sky900:  '#1A3D6B',
  sky800:  '#1E4F8C',
  sky700:  '#2563B0',
  sky600:  '#2D72CC',
  sky500:  '#3A7BD5', // ← Light mode accent / CTA
  sky400:  '#58A6FF', // ← Dark mode primary accent
  sky300:  '#79B8FF', // ← Dark mode CTA
  sky200:  '#A8D4FF',
  sky100:  '#D1E9FF',
  sky50:   '#EBF5FF',

  // True Black scale
  black:   '#000000',
  ink900:  '#0D1117', // ← Dark mode background
  ink800:  '#161B22', // ← Dark mode surface/cards
  ink700:  '#1C2128',
  ink600:  '#21262D',
  ink500:  '#30363D', // ← Dark mode border
  ink400:  '#3D444D',
  ink300:  '#444C56',
  ink200:  '#545D68',

  // Light surfaces
  white:   '#FFFFFF',
  cloud:   '#F5F5F0', // ← Light mode background (Pantone Cloud Dancer 2026)
  gray50:  '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB', // ← Light mode border
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280', // ← Text secondary
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827', // ← Light mode text primary

  // Semantic
  success:      '#16A34A', // ← Light mode success
  successDark:  '#3FB950', // ← Dark mode success
  warning:      '#D97706', // ← Light mode warning
  warningDark:  '#F0883E', // ← Dark mode warning
  error:        '#EF4444',

  // Delivery status (mode-independent)
  assigned:  '#3A7BD5',
  pickedUp:  '#D97706',
  inTransit: '#A855F7',
  delivered: '#16A34A',
  failed:    '#EF4444',
  cancelled: '#6B7280',
};

// ─── App Theme ────────────────────────────────────────────────────────────────
export const Colors = {
  light: {
    // Identity
    primary:       Palette.navy800,   // #0F2B4C — Deep Navy
    primaryDark:   Palette.navy900,   // #0A1E36
    primaryLight:  Palette.sky50,     // #EBF5FF
    accent:        Palette.sky500,    // #3A7BD5 — Sky Blue CTA
    accentDark:    Palette.sky700,    // #2563B0

    // Surfaces
    background:    Palette.cloud,     // #F5F5F0 — Cloud Dancer 2026
    surface:       Palette.white,     // #FFFFFF
    surfaceSecond: Palette.gray100,   // #F3F4F6
    surfaceThird:  Palette.gray200,   // #E5E7EB

    // Typography
    text:          Palette.gray900,   // #111827
    textSecond:    Palette.gray500,   // #6B7280
    textThird:     Palette.gray400,   // #9CA3AF
    textInverted:  Palette.white,
    textOnPrimary: Palette.white,

    // Structure
    border:        Palette.gray200,   // #E5E7EB
    divider:       Palette.gray100,

    // Navigation
    tint:            Palette.sky500,
    tabIconDefault:  Palette.gray400,
    tabIconSelected: Palette.sky500,
    navBackground:   Palette.white,

    // Wallet card
    walletCard:    Palette.navy800,
    walletCardEnd: Palette.sky700,

    // Overlays
    shadow:  Palette.black,
    overlay: 'rgba(15, 43, 76, 0.5)',

    // Semantic
    success:  Palette.success,
    warning:  Palette.warning,
    error:    Palette.error,
    info:     Palette.sky500,

    // Delivery status
    statusAssigned:  Palette.assigned,
    statusPickedUp:  Palette.pickedUp,
    statusInTransit: Palette.inTransit,
    statusDelivered: Palette.delivered,
    statusFailed:    Palette.failed,
    statusCancelled: Palette.cancelled,

    icon: Palette.gray500,

    // Kept for backward compat — maps to accent
    primary2: Palette.sky500,
  },

  dark: {
    // Identity — keep brand sky blue, only one notch lighter than light-mode for AA contrast
    primary:       Palette.sky500,    // #3A7BD5 — same brand CTA as light mode (4.55:1 on ink900, AA)
    primaryDark:   Palette.sky600,    // #2D72CC
    primaryLight:  Palette.ink700,    // #1C2128
    accent:        Palette.sky400,    // #58A6FF — interactive accent (brighter for taps)
    accentDark:    Palette.sky500,    // #3A7BD5

    // Surfaces
    background:    Palette.ink900,    // #0D1117
    surface:       Palette.ink800,    // #161B22
    surfaceSecond: Palette.ink700,    // #1C2128
    surfaceThird:  Palette.ink600,    // #21262D

    // Typography
    text:          '#E6EDF3',
    textSecond:    '#8B949E',
    textThird:     Palette.ink400,    // #3D444D
    textInverted:  Palette.ink900,
    textOnPrimary: Palette.white,

    // Structure
    border:        Palette.ink500,    // #30363D
    divider:       Palette.ink600,

    // Navigation
    tint:            Palette.sky500,
    tabIconDefault:  '#8B949E',
    tabIconSelected: Palette.sky500,
    navBackground:   Palette.ink900,

    // Wallet card
    walletCard:    Palette.sky900,
    walletCardEnd: Palette.ink800,

    // Overlays
    shadow:  Palette.black,
    overlay: 'rgba(0, 0, 0, 0.8)',

    // Semantic
    success:  Palette.successDark,   // #3FB950
    warning:  Palette.warningDark,   // #F0883E
    error:    Palette.error,
    info:     Palette.sky500,

    // Delivery status
    statusAssigned:  Palette.assigned,
    statusPickedUp:  Palette.warningDark,
    statusInTransit: Palette.inTransit,
    statusDelivered: Palette.successDark,
    statusFailed:    Palette.failed,
    statusCancelled: Palette.cancelled,

    icon: '#8B949E',

    // Kept for backward compat — maps to accent
    primary2: Palette.sky400,
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
  lg:   16,
  xl:   20,
  xxl:  28,
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

// ─── Shadows ──────────────────────────────────────────────────────────────────
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
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  navy: {
    shadowColor: '#0F2B4C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  sky: {
    shadowColor: '#3A7BD5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 14,
    elevation: 6,
  },
};

// ─── Quick Action Colors ──────────────────────────────────────────────────────
export const ActionColors = {
  request:  { bg: '#EBF5FF', icon: '#3A7BD5', dark: { bg: '#1C2128', icon: '#3A7BD5' } },
  send:     { bg: '#EBF5FF', icon: '#0F2B4C', dark: { bg: '#1C2128', icon: '#58A6FF' } },
  track:    { bg: '#FEF9EE', icon: '#D97706', dark: { bg: '#1C2128', icon: '#F0883E' } },
  history:  { bg: '#F5F3FF', icon: '#7C3AED', dark: { bg: '#1C2128', icon: '#A78BFA' } },
};

// ─── Legacy alias ─────────────────────────────────────────────────────────────
export const CLOUD_DANCER = Palette.cloud;
