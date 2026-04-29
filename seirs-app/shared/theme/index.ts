import { Platform } from 'react-native';

// ─── Legacy export kept so old imports don't break ───────────────────────────
export const CLOUD_DANCER = '#F8FAFC';

// ─── Seirs Brand Palette ──────────────────────────────────────────────────────
export const Palette = {
  // Light-mode primary — Seirs Blue (trust, fintech, clarity)
  blue50:   '#EFF6FF',
  blue100:  '#DBEAFE',
  blue200:  '#BFDBFE',
  blue300:  '#93C5FD',
  blue400:  '#60A5FA',
  blue500:  '#3A86FF', // ← Light mode primary
  blue600:  '#1D6AE5',
  blue700:  '#1A56CC',
  blue800:  '#1E40AF',
  blue900:  '#1E3A8A',

  // Dark-mode primary — Seirs Orange (action, energy, speed)
  orange50:  '#FFF7ED',
  orange100: '#FFEDD5',
  orange200: '#FED7AA',
  orange300: '#FDBA74',
  orange400: '#FB923C',
  orange500: '#FF6B00', // ← Dark mode primary / action
  orange600: '#EA580C',
  orange700: '#C2410C',
  orange800: '#9A3412',
  orange900: '#7C2D12',

  // Secondary — Teal
  teal:    '#2EC4B6',
  teal600: '#0D9488',

  // Electric Blue — dark mode secondary / info
  electricBlue: '#00C2FF',

  // Accent
  yellow: '#FFBE0B',

  // True Black scale (premium dark surfaces)
  black:   '#000000',
  ink900:  '#0A0A0A',
  ink800:  '#111111',
  ink700:  '#141414',
  ink600:  '#1A1A1A',
  ink500:  '#1E1E1E',
  ink400:  '#242424',
  ink300:  '#222222',
  ink200:  '#333333',
  ink100:  '#444444',

  // Light surfaces (clean, airy)
  white:   '#FFFFFF',
  gray50:  '#F8FAFC',
  gray100: '#F1F5F9',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#0B0F19',

  // Semantic
  success:  '#22C55E',
  warning:  '#FFBE0B',
  error:    '#EF4444',
  info:     '#00C2FF',

  // Delivery status (mode-independent)
  assigned:  '#3A86FF',
  pickedUp:  '#FF6B00',
  inTransit: '#A855F7',
  delivered: '#22C55E',
  failed:    '#EF4444',
  cancelled: '#6B7280',
};

// ─── App Theme ────────────────────────────────────────────────────────────────
export const Colors = {
  light: {
    // Identity
    primary:       Palette.blue500,    // #3A86FF
    primaryDark:   Palette.blue600,    // #1D6AE5
    primaryLight:  Palette.blue50,     // #EFF6FF
    secondary:     Palette.teal,       // #2EC4B6

    // Surfaces — clean white / soft gray
    background:    Palette.gray50,     // #F8FAFC
    surface:       Palette.white,      // #FFFFFF
    surfaceSecond: Palette.gray100,    // #F1F5F9
    surfaceThird:  Palette.gray200,    // #E5E7EB

    // Typography — deep on white
    text:          Palette.gray900,    // #0B0F19
    textSecond:    Palette.gray500,    // #6B7280
    textThird:     Palette.gray400,    // #9CA3AF
    textInverted:  Palette.white,
    textOnPrimary: Palette.white,

    // Structure
    border:        Palette.gray200,    // #E5E7EB
    divider:       Palette.gray100,

    // Navigation
    tint:            Palette.blue500,
    tabIconDefault:  Palette.gray400,
    tabIconSelected: Palette.blue500,
    navBackground:   Palette.white,

    // Wallet card (blue gradient — fintech feel)
    walletCard:    Palette.blue500,
    walletCardEnd: Palette.blue600,

    // Overlays
    shadow:  Palette.black,
    overlay: 'rgba(11, 15, 25, 0.5)',

    // Semantic
    success:  Palette.success,
    warning:  Palette.warning,
    error:    Palette.error,
    info:     Palette.info,
    teal:     Palette.teal,

    // Delivery status
    statusAssigned:  Palette.assigned,
    statusPickedUp:  Palette.pickedUp,
    statusInTransit: Palette.inTransit,
    statusDelivered: Palette.delivered,
    statusFailed:    Palette.failed,
    statusCancelled: Palette.cancelled,

    icon: Palette.gray500,
  },

  dark: {
    // Identity
    primary:       Palette.orange500,  // #FF6B00 — action, orange
    primaryDark:   Palette.orange700,  // #C2410C
    primaryLight:  Palette.orange900,  // #7C2D12
    secondary:     Palette.electricBlue, // #00C2FF — info, blue

    // Surfaces — true black, premium
    background:    Palette.black,      // #000000
    surface:       Palette.ink900,     // #0A0A0A
    surfaceSecond: Palette.ink800,     // #111111
    surfaceThird:  Palette.ink600,     // #1A1A1A

    // Typography — white on black
    text:          Palette.white,      // #FFFFFF
    textSecond:    Palette.gray400,    // #A1A1AA
    textThird:     Palette.gray500,    // #6B7280
    textInverted:  Palette.black,
    textOnPrimary: Palette.white,

    // Structure
    border:        Palette.ink300,     // #222222
    divider:       Palette.ink600,

    // Navigation
    tint:            Palette.orange500,
    tabIconDefault:  Palette.gray500,
    tabIconSelected: Palette.orange500,
    navBackground:   Palette.black,

    // Wallet card (orange-to-black — Tesla meets Uber Night)
    walletCard:    Palette.orange500,
    walletCardEnd: Palette.black,

    // Overlays
    shadow:  Palette.black,
    overlay: 'rgba(0, 0, 0, 0.8)',

    // Semantic
    success:  Palette.success,
    warning:  Palette.warning,
    error:    Palette.error,
    info:     Palette.info,
    teal:     Palette.teal,

    // Delivery status
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
  // Colored glows
  blue: {
    shadowColor: '#3A86FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 14,
    elevation: 6,
  },
  orange: {
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
};

// ─── Quick Action Colors ──────────────────────────────────────────────────────
export const ActionColors = {
  request:  { bg: '#EFF6FF', icon: '#3A86FF',  dark: { bg: '#1A0C00', icon: '#FF6B00'  } },
  send:     { bg: '#F0FDFA', icon: '#2EC4B6',  dark: { bg: '#001820', icon: '#00C2FF'  } },
  track:    { bg: '#FFFBEB', icon: '#FFBE0B',  dark: { bg: '#1C1500', icon: '#FFBE0B'  } },
  history:  { bg: '#F5F3FF', icon: '#8B5CF6',  dark: { bg: '#110020', icon: '#A855F7'  } },
};
