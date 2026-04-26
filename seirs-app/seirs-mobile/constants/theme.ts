import { Platform } from 'react-native';

// ─── Seirs Brand Palette ──────────────────────────────────────────────────────
export const Palette = {
  // Primary — Orange (action, energy, warmth)
  orange50:  '#FFF3E0',
  orange100: '#FFE0B2',
  orange200: '#FFCC80',
  orange300: '#FFB74D',
  orange400: '#FFA726',
  orange500: '#F4600C', // ← Primary brand color
  orange600: '#E55A0B',
  orange700: '#C94E09',
  orange800: '#AC4207',
  orange900: '#7A2E05',

  // Dark — Navy (trust, professionalism)
  navy50:  '#E8EDF2',
  navy100: '#C5D0DC',
  navy200: '#9FB0C3',
  navy300: '#7890AB',
  navy400: '#577898',
  navy500: '#2C5282',
  navy600: '#1E3A5F',
  navy700: '#162D4A',
  navy800: '#0D1B2A', // ← Primary dark color
  navy900: '#060D14',

  // Neutrals
  white:   '#FFFFFF',
  gray50:  '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
  black:   '#000000',

  // Semantic
  success:  '#22C55E',
  warning:  '#FACC15',
  error:    '#EF4444',
  info:     '#3B82F6',

  // Status colors (delivery states)
  assigned:  '#3B82F6', // blue
  pickedUp:  '#F4600C', // orange
  inTransit: '#8B5CF6', // purple
  delivered: '#22C55E', // green
  failed:    '#EF4444', // red
  cancelled: '#9CA3AF', // gray
};

// ─── App Theme ────────────────────────────────────────────────────────────────
export const Colors = {
  light: {
    // Core
    primary:    Palette.orange500,
    primaryDark: Palette.orange700,
    primaryLight: Palette.orange100,

    background:    Palette.gray50,
    surface:       Palette.white,
    surfaceSecond: Palette.gray100,

    text:         Palette.gray900,
    textSecond:   Palette.gray500,
    textInverted: Palette.white,
    textOnPrimary: Palette.white,

    border:    Palette.gray200,
    divider:   Palette.gray100,

    // Navigation
    tint:            Palette.orange500,
    tabIconDefault:  Palette.gray400,
    tabIconSelected: Palette.orange500,
    navBackground:   Palette.white,

    // Shadows & overlays
    shadow:  Palette.black,
    overlay: 'rgba(0, 0, 0, 0.5)',

    // Semantic
    success:  Palette.success,
    warning:  Palette.warning,
    error:    Palette.error,
    info:     Palette.info,

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
    // Core
    primary:    Palette.orange400,
    primaryDark: Palette.orange600,
    primaryLight: Palette.orange900,

    background:    Palette.navy800,
    surface:       Palette.navy700,
    surfaceSecond: Palette.navy600,

    text:         Palette.gray50,
    textSecond:   Palette.gray400,
    textInverted: Palette.gray900,
    textOnPrimary: Palette.white,

    border:    Palette.navy600,
    divider:   Palette.navy700,

    // Navigation
    tint:            Palette.orange400,
    tabIconDefault:  Palette.gray500,
    tabIconSelected: Palette.orange400,
    navBackground:   Palette.navy800,

    // Shadows & overlays
    shadow:  Palette.black,
    overlay: 'rgba(0, 0, 0, 0.7)',

    // Semantic
    success:  Palette.success,
    warning:  Palette.warning,
    error:    Palette.error,
    info:     Palette.info,

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
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
  '3xl': 64,
};

// ─── Border Radius ────────────────────────────────────────────────────────────
export const Radius = {
  sm:   6,
  md:   10,
  lg:   16,
  xl:   24,
  full: 9999,
};

// ─── Typography ───────────────────────────────────────────────────────────────
export const FontSize = {
  xs:   11,
  sm:   13,
  base: 15,
  md:   17,
  lg:   20,
  xl:   24,
  '2xl': 28,
  '3xl': 32,
  '4xl': 40,
};

export const FontWeight = {
  regular: '400' as const,
  medium:  '500' as const,
  semibold:'600' as const,
  bold:    '700' as const,
  black:   '900' as const,
};

export const Fonts = Platform.select({
  ios: {
    sans:    'system-ui',
    serif:   'ui-serif',
    rounded: 'ui-rounded',
    mono:    'ui-monospace',
  },
  default: {
    sans:    'normal',
    serif:   'serif',
    rounded: 'normal',
    mono:    'monospace',
  },
  web: {
    sans:    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif:   "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, sans-serif",
    mono:    "SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
  },
});

// ─── Shadows ─────────────────────────────────────────────────────────────────
export const Shadows = {
  sm: {
    shadowColor: Palette.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: Palette.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: Palette.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8,
  },
};
