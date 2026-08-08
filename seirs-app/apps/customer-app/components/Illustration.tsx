import { View, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';
import { Package, MapPin, Truck, Receipt, CheckCircle, Inbox, CreditCard, Clock } from 'lucide-react-native';
import { Colors, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  SendPackageSvg, SendAddressSvg, SendVehicleSvg, SendFareSvg, SendConfirmSvg,
  EmptyNoActiveSvg, EmptyNoDeliveriesSvg, EmptyNoCardsSvg,
} from './illustrations';

/**
 * One slot, three render paths in priority order:
 *
 *   1. LOTTIE_REGISTRY[name]   — animated (use only when you want motion)
 *   2. CUSTOM_REGISTRY[name]   — hand-drawn SEIRS SVG (the default — see
 *                                components/illustrations/index.tsx)
 *   3. branded placeholder     — soft navy square with a lucide icon
 *                                (last-resort fallback)
 *
 * Phase 1 ships ALL 8 slots with custom SEIRS SVGs (CUSTOM_REGISTRY).
 * To swap a slot for an animated Lottie, paste a lottiefiles URL into
 * LOTTIE_REGISTRY[<slot>] — it takes precedence.
 *
 * USER INSTRUCTION FOR LOTTIE:
 *   On lottiefiles.com, find an animation you like, copy the "Lottie URL"
 *   from the right-hand panel, paste into LOTTIE_REGISTRY below.
 */

// ─── Lottie registry (optional, overrides the static SVG) ──────────────
type LottieSource = string | number | null;

const LOTTIE_REGISTRY: Record<string, LottieSource> = {
  'send-package':        null,
  'send-address':        null,
  'send-vehicle':        null,
  'send-fare':           null,
  'send-confirm':        null,
  'empty-no-active':     null,
  'empty-no-deliveries': null,
  'empty-no-cards':      null,
};

// ─── Custom SEIRS SVG registry (default render path) ───────────────────
const CUSTOM_REGISTRY: Record<string, React.FC<{ size?: number }>> = {
  'send-package':        SendPackageSvg,
  'send-address':        SendAddressSvg,
  'send-vehicle':        SendVehicleSvg,
  'send-fare':           SendFareSvg,
  'send-confirm':        SendConfirmSvg,
  'empty-no-active':     EmptyNoActiveSvg,
  'empty-no-deliveries': EmptyNoDeliveriesSvg,
  'empty-no-cards':      EmptyNoCardsSvg,
};

// Fallback lucide icon per slot — last-resort placeholder.
const FALLBACK_ICONS: Record<string, React.ComponentType<any>> = {
  'send-package':        Package,
  'send-address':        MapPin,
  'send-vehicle':        Truck,
  'send-fare':           Receipt,
  'send-confirm':        CheckCircle,
  'empty-no-active':     Clock,
  'empty-no-deliveries': Inbox,
  'empty-no-cards':      CreditCard,
};

export interface IllustrationProps {
  name:  string;
  size?: number;
  /** Lottie ignores tint (colours baked in JSON); SVGs may use it. */
  tint?: string;
}

export function Illustration({ name, size = 140 }: IllustrationProps) {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  // 1) Lottie wins when set — animated.
  const lottie = LOTTIE_REGISTRY[name];
  if (lottie) {
    const source: any = typeof lottie === 'string' ? { uri: lottie } : lottie;
    return (
      <View style={{ width: size, height: size }}>
        <LottieView
          source={source}
          autoPlay
          loop
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      </View>
    );
  }

  // 2) Hand-drawn SEIRS SVG — the default for Phase 1.
  const CustomSvg = CUSTOM_REGISTRY[name];
  if (CustomSvg) {
    return <CustomSvg size={size} />;
  }

  // 3) Branded placeholder fallback.
  const Fallback = FALLBACK_ICONS[name] ?? Inbox;
  const bg     = isDark ? 'rgba(58,134,255,0.10)' : 'rgba(15,43,76,0.06)';
  const stroke = theme.primary;
  return (
    <View
      style={[
        styles.placeholder,
        { width: size, height: size, backgroundColor: bg, borderRadius: Radius.lg },
      ]}
    >
      <Fallback size={Math.round(size * 0.40)} color={stroke} strokeWidth={1.5} />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
