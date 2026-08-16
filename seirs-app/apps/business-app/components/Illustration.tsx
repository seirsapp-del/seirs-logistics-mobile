import { View, StyleSheet } from 'react-native';
import { Package, MapPin, Truck, Receipt, CheckCircle, Inbox, CreditCard, Clock } from 'lucide-react-native';
import { Colors, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  SendPackageSvg, SendAddressSvg, SendVehicleSvg, SendFareSvg, SendConfirmSvg,
  EmptyNoActiveSvg, EmptyNoDeliveriesSvg, EmptyNoCardsSvg,
} from './illustrations';

/**
 * Business port of the customer Illustration slot (2026-08-16, for the
 * customer-parity Send rebuild). Two render paths:
 *
 *   1. CUSTOM_REGISTRY[name] : hand-drawn SEIRS SVG (the default)
 *   2. branded placeholder   : soft navy square with a lucide icon
 *
 * The customer app's optional Lottie path is deliberately absent here:
 * this app does not carry the lottie-react-native dependency, and every
 * registry entry over there is null anyway. If motion is ever wanted,
 * add the dependency and re-port rather than half-wiring it.
 */
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
  tint?: string;
}

export function Illustration({ name, size = 140 }: IllustrationProps) {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const CustomSvg = CUSTOM_REGISTRY[name];
  if (CustomSvg) {
    return <CustomSvg size={size} />;
  }

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
